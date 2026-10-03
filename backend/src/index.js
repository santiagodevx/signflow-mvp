/**
 * MVP Backend – Express REST API
 *
 * Endpoints:
 *   POST   /api/templates            Upload & analyze a PDF template
 *   GET    /api/templates            List all templates
 *   GET    /api/templates/:id        Get template detail (with structure)
 *   GET    /api/templates/:id/pdf    Download/stream template PDF
 *   DELETE /api/templates/:id        Delete template
 *
 *   POST   /api/transactions/:templateId   Create transaction from template
 *   GET    /api/transactions               List all transactions
 *   GET    /api/transactions/:id           Get transaction detail
 *   PATCH  /api/transactions/:id           Update filled data
 *   POST   /api/transactions/:id/flatten   Generate filled PDF
 *   GET    /api/transactions/:id/pdf       Download current PDF
 *   POST   /api/transactions/:id/cancel    Cancel transaction
 */

'use strict';

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { nanoid } = require('nanoid');

const db = require('./db');
const { analyzePdf, fillPdf } = require('./pdf-engine');

// ---------------------------------------------------------------------------
// Storage paths
// ---------------------------------------------------------------------------

const STORAGE_BASE = path.join(__dirname, '..', 'storage');
const TEMPLATES_DIR = path.join(STORAGE_BASE, 'templates');
const TRANSACTIONS_DIR = path.join(STORAGE_BASE, 'transactions');

fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
fs.mkdirSync(TRANSACTIONS_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Express setup
// ---------------------------------------------------------------------------

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ---------------------------------------------------------------------------
// Multer (memory storage — parse PDF in memory)
// ---------------------------------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se aceptan archivos PDF'));
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

function fail(res, message, status = 400) {
  return res.status(status).json({ success: false, error: message });
}

// ---------------------------------------------------------------------------
// TEMPLATES
// ---------------------------------------------------------------------------

// POST /api/templates — Upload & analyze PDF
app.post('/api/templates', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return fail(res, 'Se requiere un archivo PDF');

    const { description } = req.body;
    const id = nanoid();
    const originalName = path.parse(req.file.originalname).name;
    const fileName = `${id}-${originalName}.pdf`;
    const filePath = path.join(TEMPLATES_DIR, fileName);

    // Analyze PDF fields
    const structure = await analyzePdf(req.file.buffer);

    // Save PDF to disk
    fs.writeFileSync(filePath, req.file.buffer);

    // Insert into DB
    const record = {
      id,
      name: originalName,
      description: description ?? null,
      pdf_path: filePath,
      structure,
      created_at: new Date().toISOString(),
    };
    db.templates.insert(record);

    return ok(res, record, 201);
  } catch (err) {
    console.error(err);
    return fail(res, err.message);
  }
});

// GET /api/templates — List
app.get('/api/templates', (_req, res) => {
  try {
    const all = db.templates.findAll().map(({ structure: _s, pdf_path: _p, ...rest }) => rest);
    return ok(res, all);
  } catch (err) {
    return fail(res, err.message, 500);
  }
});

// GET /api/templates/:id — Detail
app.get('/api/templates/:id', (req, res) => {
  try {
    const t = db.templates.findById(req.params.id);
    if (!t) return fail(res, 'Template no encontrado', 404);
    return ok(res, t);
  } catch (err) {
    return fail(res, err.message, 500);
  }
});

// GET /api/templates/:id/pdf — Stream PDF
app.get('/api/templates/:id/pdf', (req, res) => {
  try {
    const t = db.templates.findById(req.params.id);
    if (!t) return fail(res, 'Template no encontrado', 404);
    if (!fs.existsSync(t.pdf_path)) return fail(res, 'Archivo PDF no encontrado', 404);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${t.name}.pdf"`);
    fs.createReadStream(t.pdf_path).pipe(res);
  } catch (err) {
    return fail(res, err.message, 500);
  }
});

// DELETE /api/templates/:id
app.delete('/api/templates/:id', (req, res) => {
  try {
    const t = db.templates.findById(req.params.id);
    if (!t) return fail(res, 'Template no encontrado', 404);

    db.templates.delete(req.params.id);
    if (fs.existsSync(t.pdf_path)) fs.unlinkSync(t.pdf_path);

    return ok(res, { deleted: true });
  } catch (err) {
    return fail(res, err.message, 500);
  }
});

// ---------------------------------------------------------------------------
// TRANSACTIONS
// ---------------------------------------------------------------------------

const TERMINAL_STATUSES = ['FINALIZED', 'CANCELLED'];

// POST /api/transactions/:templateId — Create transaction
app.post('/api/transactions/:templateId', (req, res) => {
  try {
    const template = db.templates.findById(req.params.templateId);
    if (!template) return fail(res, 'Template no encontrado', 404);

    const id = nanoid();
    const now = new Date().toISOString();
    const record = {
      id,
      template_id: template.id,
      template_name: template.name,
      pdf_path: template.pdf_path, // starts pointing at template PDF
      structure: template.structure,
      status: 'CREATED',
      filled_data: {},
      created_at: now,
      updated_at: now,
    };
    db.transactions.insert(record);
    return ok(res, record, 201);
  } catch (err) {
    return fail(res, err.message, 500);
  }
});

// GET /api/transactions — List
app.get('/api/transactions', (_req, res) => {
  try {
    const all = db.transactions.findAll().map(({ structure: _s, pdf_path: _p, filled_data: _f, ...rest }) => rest);
    return ok(res, all);
  } catch (err) {
    return fail(res, err.message, 500);
  }
});

// GET /api/transactions/:id — Detail
app.get('/api/transactions/:id', (req, res) => {
  try {
    const tx = db.transactions.findById(req.params.id);
    if (!tx) return fail(res, 'Transacción no encontrada', 404);
    return ok(res, tx);
  } catch (err) {
    return fail(res, err.message, 500);
  }
});

// PATCH /api/transactions/:id — Update filled data
app.patch('/api/transactions/:id', (req, res) => {
  try {
    const tx = db.transactions.findById(req.params.id);
    if (!tx) return fail(res, 'Transacción no encontrada', 404);
    if (TERMINAL_STATUSES.includes(tx.status)) {
      return fail(res, `No se puede editar una transacción en estado ${tx.status}`);
    }

    const validFields = new Set(tx.structure.fields.map((f) => f.name));
    const current = tx.filled_data || {};
    const incoming = req.body.data || {};

    const filtered = Object.fromEntries(
      Object.entries(incoming).filter(([key]) => validFields.has(key))
    );
    const updated = { ...current, ...filtered };

    const result = db.transactions.update(req.params.id, {
      filled_data: updated,
      status: 'IN_PROGRESS',
    });
    return ok(res, result);
  } catch (err) {
    return fail(res, err.message, 500);
  }
});

// POST /api/transactions/:id/flatten — Fill PDF and save
app.post('/api/transactions/:id/flatten', async (req, res) => {
  try {
    const tx = db.transactions.findById(req.params.id);
    if (!tx) return fail(res, 'Transacción no encontrada', 404);
    if (TERMINAL_STATUSES.includes(tx.status)) {
      return fail(res, `No se puede aplanar una transacción en estado ${tx.status}`);
    }

    const filledData = tx.filled_data || {};
    if (Object.keys(filledData).length === 0) {
      return fail(res, 'No hay datos para aplanar. Rellena primero los campos del formulario.');
    }

    const pdfBuffer = fs.readFileSync(tx.pdf_path);
    const filledPdfBuffer = await fillPdf(pdfBuffer, tx.structure, filledData);

    const txDir = path.join(TRANSACTIONS_DIR, req.params.id);
    fs.mkdirSync(txDir, { recursive: true });

    const outFileName = `${nanoid(8)}.pdf`;
    const outPath = path.join(txDir, outFileName);
    fs.writeFileSync(outPath, filledPdfBuffer);

    const result = db.transactions.update(req.params.id, {
      pdf_path: outPath,
      status: 'FINALIZED',
    });
    return ok(res, result);
  } catch (err) {
    console.error(err);
    return fail(res, err.message);
  }
});

// GET /api/transactions/:id/pdf — Stream current PDF
app.get('/api/transactions/:id/pdf', (req, res) => {
  try {
    const tx = db.transactions.findById(req.params.id);
    if (!tx) return fail(res, 'Transacción no encontrada', 404);
    if (!fs.existsSync(tx.pdf_path)) return fail(res, 'Archivo PDF no encontrado', 404);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${tx.template_name}-filled.pdf"`);
    fs.createReadStream(tx.pdf_path).pipe(res);
  } catch (err) {
    return fail(res, err.message, 500);
  }
});

// POST /api/transactions/:id/cancel
app.post('/api/transactions/:id/cancel', (req, res) => {
  try {
    const tx = db.transactions.findById(req.params.id);
    if (!tx) return fail(res, 'Transacción no encontrada', 404);
    if (TERMINAL_STATUSES.includes(tx.status)) {
      return fail(res, `La transacción ya está en estado ${tx.status}`);
    }

    const result = db.transactions.update(req.params.id, { status: 'CANCELLED' });
    return ok(res, result);
  } catch (err) {
    return fail(res, err.message, 500);
  }
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  ok(res, { status: 'ok', time: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ PDF Signer MVP backend running at http://localhost:${PORT}`);
  console.log(`   Health:  http://localhost:${PORT}/api/health`);
});
