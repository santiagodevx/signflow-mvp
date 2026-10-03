/**
 * PDF Engine (inline MVP version)
 * Analyzes PDF fields and fills/flattens PDF forms using pdf-lib.
 */

const { PDFDocument, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFButton } = require('pdf-lib');

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
        // MVP: skip signature rendering (requires SVG→PNG conversion)
        break;
      }
    }
  }

  return Buffer.from(await pdfDoc.save());
}

module.exports = { analyzePdf, fillPdf };
