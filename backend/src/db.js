/**
 * JSON-file "database" for the MVP.
 * Uses a single flat JSON file — perfect for a prototype,
 * no native bindings, works with any Node.js version.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'data', 'db.json');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

// ---------------------------------------------------------------------------
// Load / Save
// ---------------------------------------------------------------------------

function loadDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch {
    return { templates: {}, transactions: {} };
  }
}

function saveDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const templates = {
  insert(record) {
    const db = loadDb();
    db.templates[record.id] = record;
    saveDb(db);
    return record;
  },

  findAll() {
    const db = loadDb();
    return Object.values(db.templates)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  findById(id) {
    return loadDb().templates[id] ?? null;
  },

  delete(id) {
    const db = loadDb();
    const record = db.templates[id];
    if (record) {
      delete db.templates[id];
      saveDb(db);
    }
    return record ?? null;
  },
};

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

const transactions = {
  insert(record) {
    const db = loadDb();
    db.transactions[record.id] = record;
    saveDb(db);
    return record;
  },

  findAll() {
    const db = loadDb();
    return Object.values(db.transactions)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  findById(id) {
    return loadDb().transactions[id] ?? null;
  },

  update(id, patch) {
    const db = loadDb();
    if (!db.transactions[id]) return null;
    db.transactions[id] = {
      ...db.transactions[id],
      ...patch,
      updated_at: new Date().toISOString(),
    };
    saveDb(db);
    return db.transactions[id];
  },
};

module.exports = { templates, transactions };
