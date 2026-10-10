/**
 * PDF Engine (inline MVP version)
 * Analyzes PDF fields and fills/flattens PDF forms using pdf-lib.
 */

const { PDFDocument, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFButton, rgb } = require('pdf-lib');

// ---------------------------------------------------------------------------
// SVG Signature Helpers
// ---------------------------------------------------------------------------

/**
 * Parses an SVG signature string into structured data for PDF rendering.
 * Extracts the viewBox dimensions and all path commands with stroke info.
 */
function parseSvgSignature(svgString) {
  if (!svgString || typeof svgString !== 'string') return null;

  // Extract viewBox
  const vbMatch = svgString.match(/viewBox="([^"]+)"/);
  let viewBox = { x: 0, y: 0, width: 200, height: 100 };
  if (vbMatch) {
    const parts = vbMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length >= 4) {
      viewBox = { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    }
  } else {
    // Try width/height attributes
    const wMatch = svgString.match(/width="([\d.]+)"/);
    const hMatch = svgString.match(/height="([\d.]+)"/);
    if (wMatch) viewBox.width = parseFloat(wMatch[1]);
    if (hMatch) viewBox.height = parseFloat(hMatch[1]);
  }

  // Extract all <path> elements
  const pathRegex = /<path\s+([^>]*?)\/?\s*>/g;
  const paths = [];
  let pathMatch;
  while ((pathMatch = pathRegex.exec(svgString)) !== null) {
    const attrs = pathMatch[1];
    const dMatch = attrs.match(/d="([^"]+)"/);
    const strokeMatch = attrs.match(/stroke="([^"]+)"/);
    const swMatch = attrs.match(/stroke-width="([^"]+)"/);

    if (dMatch) {
      const points = parseSvgPathD(dMatch[1]);
      paths.push({
        points,
        stroke: strokeMatch ? strokeMatch[1] : '#000000',
        strokeWidth: swMatch ? parseFloat(swMatch[1]) : 2,
      });
    }
  }

  return { viewBox, paths };
}

/**
 * Parses an SVG path "d" attribute into an array of {x, y} points.
 * Only supports M (moveTo) and L (lineTo) commands used by our canvas.
 */
function parseSvgPathD(d) {
  if (!d) return [];
  const points = [];
  const commands = d.match(/[ML][\s,]?[\d.]+[\s,]+[\d.]+/g);
  if (!commands) return [];
  for (const cmd of commands) {
    const nums = cmd.match(/[\d.]+/g);
    if (nums && nums.length >= 2) {
      points.push({ x: parseFloat(nums[0]), y: parseFloat(nums[1]) });
    }
  }
  return points;
}

/**
 * Converts a hex color string to an {r, g, b} object (0-255 range).
 */
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  let r, g, b;
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16);
    g = parseInt(clean[1] + clean[1], 16);
    b = parseInt(clean[2] + clean[2], 16);
  } else {
    r = parseInt(clean.substring(0, 2), 16);
    g = parseInt(clean.substring(2, 4), 16);
    b = parseInt(clean.substring(4, 6), 16);
  }
  return { r: r || 0, g: g || 0, b: b || 0 };
}

// ---------------------------------------------------------------------------
// Field Name Parser
// ---------------------------------------------------------------------------

function parsePdfFieldName(rawName) {
  const required = rawName.endsWith(':req');
  const base = required ? rawName.slice(0, -':req'.length) : rawName;
  const sep = base.indexOf(':');
  if (sep === -1) return { prefix: null, cleanName: base, required };
  return { prefix: base.slice(0, sep), cleanName: base.slice(sep + 1), required };
}

// ---------------------------------------------------------------------------
// Text Data Type resolver
// ---------------------------------------------------------------------------

const SUPPORTED_TEXT_DATA_TYPES = new Set(['TXT', 'EMAIL', 'DATE', 'NUM', 'PHONE']);

function resolveTextDataType(prefix, rawName) {
  if (prefix === null) return 'TXT';
  const upper = prefix.toUpperCase();
  if (SUPPORTED_TEXT_DATA_TYPES.has(upper)) return upper;
  throw new Error(
    `Campo "${rawName}" tiene un prefijo de tipo no válido: "${prefix}". ` +
      `Prefijos admitidos para PDFTextField: ${[...SUPPORTED_TEXT_DATA_TYPES].join(', ')}.`
  );
}

// ---------------------------------------------------------------------------
// Widget builder
// ---------------------------------------------------------------------------

function buildWidget(widget, pages) {
  const pageRef = widget.P();
  const pageIndex = pages.findIndex((p) => p.ref === pageRef);
  const { x, y, width, height } = widget.getRectangle();
  return { page: pageIndex !== -1 ? pageIndex : 0, x, y, width, height };
}

function cleanPdfName(name) {
  if (!name) return '';
  return name.startsWith('/') ? name.slice(1) : name;
}

// ---------------------------------------------------------------------------
// Analyze
// ---------------------------------------------------------------------------

async function analyzePdf(pdfBuffer) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const form = pdfDoc.getForm();
  const pages = pdfDoc.getPages();

  const SUPPORTED = ['PDFTextField', 'PDFButton', 'PDFCheckBox', 'PDFRadioGroup', 'PDFDropdown'];

  const fields = form.getFields().map((field) => {
    const typeName = field.constructor.name;
    if (!SUPPORTED.includes(typeName)) {
      throw new Error(
        `Campo "${field.getName()}" tiene un tipo no soportado: "${typeName}". ` +
          `Tipos soportados: ${SUPPORTED.join(', ')}.`
      );
    }

    const rawName = field.getName();
    const parsed = parsePdfFieldName(rawName);

    if (parsed.prefix !== null && typeName !== 'PDFTextField') {
      throw new Error(
        `Campo "${rawName}": el prefijo "${parsed.prefix}" no es válido para campos de tipo ${typeName}. ` +
          `Los prefijos solo aplican a PDFTextField.`
      );
    }

    const widgets = field.acroField.getWidgets();

    if (field instanceof PDFTextField) {
      return {
        name: parsed.cleanName,
        type: 'TEXT',
        dataType: resolveTextDataType(parsed.prefix, rawName),
        required: parsed.required,
        rawName,
        widgets: widgets.map((w) => buildWidget(w, pages)),
      };
    }
    if (field instanceof PDFCheckBox) {
      return {
        name: parsed.cleanName,
        type: 'CHECKBOX',
        required: parsed.required,
        rawName,
        widgets: widgets.map((w) => buildWidget(w, pages)),
      };
    }
    if (field instanceof PDFRadioGroup) {
      return {
        name: parsed.cleanName,
        type: 'RADIO',
        required: parsed.required,
        rawName,
        widgets: widgets.map((w) => ({
          ...buildWidget(w, pages),
          value: cleanPdfName(w.getOnValue()?.asString()),
        })),
      };
    }
    if (field instanceof PDFDropdown) {
      return {
        name: parsed.cleanName,
        type: 'DROPDOWN',
        required: parsed.required,
        rawName,
        options: field.getOptions(),
        widgets: widgets.map((w) => buildWidget(w, pages)),
      };
    }
    if (field instanceof PDFButton) {
      return {
        name: parsed.cleanName,
        type: 'SIGNATURE',
        required: parsed.required,
        rawName,
        widgets: widgets.map((w) => buildWidget(w, pages)),
      };
    }

    throw new Error(`Tipo de campo no soportado: ${typeName}`);
  });

  // Validate no duplicate names (except RADIO)
  const counts = {};
  for (const f of fields.filter((f) => f.type !== 'RADIO')) {
    counts[f.name] = (counts[f.name] ?? 0) + 1;
  }
  const duplicates = Object.entries(counts)
    .filter(([, c]) => c > 1)
    .map(([n]) => `"${n}"`);
  if (duplicates.length > 0) {
    throw new Error(
      `El PDF contiene campos con nombres duplicados: ${duplicates.join(', ')}. ` +
        `Solo los campos PDFRadioGroup pueden compartir nombre.`
    );
  }

  const pageData = pages.map((page, index) => ({
    index,
    width: page.getWidth(),
    height: page.getHeight(),
  }));

  return { pages: pageData, fields };
}

// ---------------------------------------------------------------------------
// Fill / Flatten
// ---------------------------------------------------------------------------

async function fillPdf(pdfBuffer, templateStructure, data) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const form = pdfDoc.getForm();
  const fieldsByName = new Map(templateStructure.fields.map((f) => [f.name, f]));

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined || value === '') continue;
    const field = fieldsByName.get(key);
    if (!field) continue;

    switch (field.type) {
      case 'RADIO': {
        const f = form.getRadioGroup(field.rawName);
        f.select(String(value));
        f.enableReadOnly();
        break;
      }
      case 'TEXT': {
        const f = form.getTextField(field.rawName);
        f.setText(String(value));
        f.enableReadOnly();
        break;
      }
      case 'DROPDOWN': {
        const f = form.getDropdown(field.rawName);
        f.select(String(value));
        f.enableReadOnly();
        break;
      }
      case 'CHECKBOX': {
        const f = form.getCheckBox(field.rawName);
        if (value === true || value === 'true') {
          f.check();
        } else {
          f.uncheck();
        }
        f.enableReadOnly();
        break;
      }
      case 'SIGNATURE': {
        // Render SVG signature paths into the PDF
        if (typeof value !== 'string' || !value.startsWith('<svg')) break;

        const svgParsed = parseSvgSignature(value);
        if (!svgParsed || svgParsed.paths.length === 0) break;

        // Get the widget rectangle to know where to draw
        const sigWidgets = field.widgets || [];
        if (sigWidgets.length === 0) break;

        const pdfPages = pdfDoc.getPages();

        for (const widget of sigWidgets) {
          const page = pdfPages[widget.page] || pdfPages[0];
          const { x: wx, y: wy, width: ww, height: wh } = widget;

          // Calculate scale to fit signature within the widget box
          const svgW = svgParsed.viewBox.width || 1;
          const svgH = svgParsed.viewBox.height || 1;

          // Fit within widget with some padding
          const padding = 2;
          const availW = ww - padding * 2;
          const availH = wh - padding * 2;
          const scale = Math.min(availW / svgW, availH / svgH);

          // Center the signature in the widget
          const scaledW = svgW * scale;
          const scaledH = svgH * scale;
          const offsetX = wx + padding + (availW - scaledW) / 2;
          const offsetY = wy + padding + (availH - scaledH) / 2;

          // Draw each SVG path as PDF lines
          for (const pathData of svgParsed.paths) {
            const points = pathData.points;
            if (points.length < 2) continue;

            const strokeWidth = (pathData.strokeWidth || 2) * scale * 0.6;

            // Determine ink color — map common colors to dark for print
            let rgbColor = { r: 0, g: 0, b: 0 };
            if (pathData.stroke && pathData.stroke !== '#ffffff' && pathData.stroke !== '#fff') {
              rgbColor = hexToRgb(pathData.stroke);
            }
            const color = rgb(rgbColor.r / 255, rgbColor.g / 255, rgbColor.b / 255);

            // Draw line segments
            for (let i = 1; i < points.length; i++) {
              const x1 = offsetX + points[i - 1].x * scale;
              // PDF Y is bottom-up, SVG Y is top-down → flip
              const y1 = offsetY + (svgH - points[i - 1].y) * scale;
              const x2 = offsetX + points[i].x * scale;
              const y2 = offsetY + (svgH - points[i].y) * scale;

              page.drawLine({
                start: { x: x1, y: y1 },
                end: { x: x2, y: y2 },
                thickness: strokeWidth,
                color,
              });
            }
          }
        }

        // Remove the button field from the form so it doesn't overlay the drawn signature
        try {
          const btnField = form.getButton(field.rawName);
          form.removeField(btnField);
        } catch (_e) {
          // Field may not exist or may not be removable — ignore
        }

        break;
      }
    }
  }

  return Buffer.from(await pdfDoc.save());
}

module.exports = { analyzePdf, fillPdf };
