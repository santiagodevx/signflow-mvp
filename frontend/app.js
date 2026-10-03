/**
 * PDF Signer MVP — Frontend App
 * Vanilla JS SPA with no build step needed
 */

'use strict';

const API = 'http://localhost:3001/api';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let currentTemplateId = null;
let currentTransactionId = null;

// ---------------------------------------------------------------------------
// Utility: Radio visual state sync
// ---------------------------------------------------------------------------

/**
 * Recalculates the .radio-selected class on all .radio-option divs inside
 * a .radio-group container after a change event or programmatic click.
 * Called from inline onclick/onchange handlers in rendered HTML.
 */
function syncRadioSelected(radioGroupEl) {
  if (!radioGroupEl) return;
  radioGroupEl.querySelectorAll('.radio-option').forEach(optionDiv => {
    const input = optionDiv.querySelector('input[type="radio"]');
    if (input) {
      optionDiv.classList.toggle('radio-selected', input.checked);
    }
  });
}

// ---------------------------------------------------------------------------
// Utility: HTTP helpers
// ---------------------------------------------------------------------------

async function apiFetch(path, options = {}) {
  const res = await fetch(API + path, options);
  const json = await res.json().catch(() => ({ success: false, error: 'Respuesta inválida del servidor' }));
  if (!json.success) throw new Error(json.error || 'Error desconocido');
  return json.data;
}

// ---------------------------------------------------------------------------
// Utility: Toast notifications
// ---------------------------------------------------------------------------

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(40px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ---------------------------------------------------------------------------
// Utility: Formatting
// ---------------------------------------------------------------------------

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function statusLabel(status) {
  const labels = {
    CREATED: 'Creada', IN_PROGRESS: 'En progreso',
    FINALIZED: 'Finalizada', CANCELLED: 'Cancelada', SIGNED: 'Firmada',
  };
  return labels[status] || status;
}

function fieldTypeLabel(type) {
  const labels = {
    TEXT: 'Texto', CHECKBOX: 'Casilla', RADIO: 'Radio', DROPDOWN: 'Lista', SIGNATURE: 'Firma',
  };
  return labels[type] || type;
}

// ---------------------------------------------------------------------------
// Navigation / View management
// ---------------------------------------------------------------------------

function showView(viewId) {
  document.querySelectorAll('.view').forEach(el => {
    el.style.display = 'none';
    el.classList.remove('active');
  });
  const el = document.getElementById(viewId);
  if (el) {
    el.style.display = 'block';
    el.classList.add('active');
  }
}

function setActiveNav(viewId) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navMap = { templates: 'nav-templates', transactions: 'nav-transactions' };
  const navId = navMap[viewId];
  if (navId) document.getElementById(navId)?.classList.add('active');
}

// ---------------------------------------------------------------------------
// TEMPLATES VIEW
// ---------------------------------------------------------------------------

async function loadTemplates() {
  const grid = document.getElementById('templates-grid');
  const loading = document.getElementById('templates-loading');
  const empty = document.getElementById('templates-empty');

  grid.innerHTML = '';
  loading.style.display = 'flex';
  empty.style.display = 'none';

  try {
    const templates = await apiFetch('/templates');
    loading.style.display = 'none';

    if (!templates || templates.length === 0) {
      empty.style.display = 'flex';
      return;
    }

    templates.forEach(t => {
      const card = document.createElement('div');
      card.className = 'template-card';
      card.dataset.id = t.id;
      card.innerHTML = `
        <div class="card-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <div class="card-name">${t.name}</div>
        <div class="card-desc">${t.description || 'Sin descripción'}</div>
        <div class="card-meta">
          <span>${formatDate(t.created_at)}</span>
        </div>
      `;
      card.addEventListener('click', () => openTemplateDetail(t.id));
      grid.appendChild(card);
    });
  } catch (err) {
    loading.style.display = 'none';
    showToast(err.message, 'error');
  }
}

// ---------------------------------------------------------------------------
// TEMPLATE DETAIL VIEW
// ---------------------------------------------------------------------------

async function openTemplateDetail(templateId) {
  currentTemplateId = templateId;
  showView('view-template-detail');
  setActiveNav('templates');

  const content = document.getElementById('template-detail-content');
  content.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Cargando…</p></div>`;

  try {
    const t = await apiFetch(`/templates/${templateId}`);
    const fields = t.structure?.fields || [];
    const pages = t.structure?.pages || [];

    // Store template id on buttons
    document.getElementById('btn-preview-template-pdf').dataset.templateId = templateId;
    document.getElementById('btn-create-transaction').dataset.templateId = templateId;

    content.innerHTML = `
      <div class="detail-panel">
        <!-- Left: Fields table -->
        <div class="panel-card">
          <div class="panel-card-header">
            <span class="panel-card-title">Campos detectados (${fields.length})</span>
            <span style="font-size:0.75rem;color:var(--color-text-muted)">${pages.length} página${pages.length !== 1 ? 's' : ''}</span>
          </div>
          <div style="overflow-x:auto">
            ${fields.length === 0
              ? `<div class="empty-state"><p>Sin campos detectados</p></div>`
              : `<table class="fields-table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Tipo</th>
                      <th>Obligatorio</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${fields.map(f => `
                      <tr>
                        <td>
                          <code style="font-family:monospace;font-size:0.78rem;color:var(--color-text)">${f.name}</code>
                          ${f.dataType && f.dataType !== 'TXT' ? `<span style="font-size:0.68rem;margin-left:4px;color:var(--color-text-muted)">(${f.dataType})</span>` : ''}
                        </td>
                        <td><span class="field-type-badge field-type-${f.type}">${fieldTypeLabel(f.type)}</span></td>
                        <td style="text-align:center">
                          ${f.required ? '<span class="req-dot" title="Obligatorio"></span>' : '<span style="color:var(--color-text-muted)">—</span>'}
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>`
            }
          </div>
        </div>

        <!-- Right: Info + actions -->
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="panel-card">
            <div class="panel-card-header">
              <span class="panel-card-title">Información</span>
            </div>
            <div class="panel-card-body">
              <div class="info-row">
                <span class="info-label">Nombre</span>
                <span class="info-value">${t.name}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Descripción</span>
                <span class="info-value">${t.description || '—'}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Páginas</span>
                <span class="info-value">${pages.length}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Campos</span>
                <span class="info-value">${fields.length}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Creado</span>
                <span class="info-value">${formatDate(t.created_at)}</span>
              </div>
            </div>
          </div>

          <div class="panel-card">
            <div class="panel-card-header">
              <span class="panel-card-title">Acciones</span>
            </div>
            <div class="panel-card-body" style="display:flex;flex-direction:column;gap:8px">
              <button class="btn btn-primary" onclick="createTransaction('${templateId}')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Crear transacción
              </button>
              <button class="btn btn-secondary" onclick="previewPdf('/templates/${templateId}/pdf', '${t.name}')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                Ver PDF original
              </button>
              <div class="sep"></div>
              <button class="btn btn-danger btn-sm" onclick="deleteTemplate('${templateId}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                </svg>
                Eliminar plantilla
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><p>Error: ${err.message}</p></div>`;
    showToast(err.message, 'error');
  }
}

async function createTransaction(templateId) {
  try {
    showToast('Creando transacción…', 'info');
    const tx = await apiFetch(`/transactions/${templateId}`, { method: 'POST' });
    showToast('Transacción creada exitosamente', 'success');
    openTransactionDetail(tx.id);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteTemplate(templateId) {
  if (!confirm('¿Eliminar esta plantilla? Esta acción no se puede deshacer.')) return;
  try {
    await apiFetch(`/templates/${templateId}`, { method: 'DELETE' });
    showToast('Plantilla eliminada', 'success');
    goToTemplates();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ---------------------------------------------------------------------------
// TRANSACTIONS VIEW
// ---------------------------------------------------------------------------

async function loadTransactions() {
  const list = document.getElementById('transactions-list');
  const loading = document.getElementById('transactions-loading');
  const empty = document.getElementById('transactions-empty');

  list.innerHTML = '';
  loading.style.display = 'flex';
  empty.style.display = 'none';

  try {
    const txs = await apiFetch('/transactions');
    loading.style.display = 'none';

    if (!txs || txs.length === 0) {
      empty.style.display = 'flex';
      return;
    }

    txs.forEach(tx => {
      const card = document.createElement('div');
      card.className = 'transaction-card';
      card.innerHTML = `
        <div class="tx-status-dot ${tx.status}"></div>
        <div class="tx-info">
          <div class="tx-name">${tx.template_name}</div>
          <div class="tx-meta">ID: ${tx.id.slice(0, 8)}… · ${formatDate(tx.created_at)}</div>
        </div>
        <span class="status-badge ${tx.status}">${statusLabel(tx.status)}</span>
      `;
      card.addEventListener('click', () => openTransactionDetail(tx.id));
      list.appendChild(card);
    });
  } catch (err) {
    loading.style.display = 'none';
    showToast(err.message, 'error');
  }
}

// ---------------------------------------------------------------------------
// TRANSACTION DETAIL VIEW
// ---------------------------------------------------------------------------

async function openTransactionDetail(txId) {
  currentTransactionId = txId;
  showView('view-transaction-detail');
  setActiveNav('transactions');

  const content = document.getElementById('transaction-detail-content');
  const headerActions = document.getElementById('transaction-header-actions');
  content.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Cargando…</p></div>`;
  headerActions.innerHTML = '';

  try {
    const tx = await apiFetch(`/transactions/${txId}`);
    const fields = tx.structure?.fields || [];
    const filledData = tx.filled_data || {};
    const isTerminal = ['FINALIZED', 'CANCELLED'].includes(tx.status);

    // Header actions
    headerActions.innerHTML = `
      ${tx.status === 'FINALIZED'
        ? `<button class="btn btn-secondary" onclick="previewPdf('/transactions/${txId}/pdf', '${tx.template_name}-filled')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Descargar PDF
           </button>`
        : ''
      }
      ${!isTerminal
        ? `<button class="btn btn-danger btn-sm" onclick="cancelTransaction('${txId}')">Cancelar</button>`
        : ''
      }
    `;

    content.innerHTML = `
      <div class="detail-panel">
        <!-- Left: Form / Fields -->
        <div class="panel-card">
          <div class="panel-card-header">
            <span class="panel-card-title">
              ${isTerminal ? 'Datos ingresados' : 'Llenar campos'}
            </span>
            <span class="status-badge ${tx.status}">${statusLabel(tx.status)}</span>
          </div>
          <div class="panel-card-body">
            ${fields.length === 0
              ? `<div class="empty-state" style="padding:40px 0"><p>Esta plantilla no tiene campos</p></div>`
              : renderFillForm(fields, filledData, isTerminal, txId)
            }
          </div>
        </div>

        <!-- Right: Info -->
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="panel-card">
            <div class="panel-card-header">
              <span class="panel-card-title">Información</span>
            </div>
            <div class="panel-card-body">
              <div class="info-row">
                <span class="info-label">ID</span>
                <span class="info-value" style="font-family:monospace;font-size:0.75rem">${tx.id}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Plantilla</span>
                <span class="info-value">${tx.template_name}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Estado</span>
                <span class="info-value"><span class="status-badge ${tx.status}">${statusLabel(tx.status)}</span></span>
              </div>
              <div class="info-row">
                <span class="info-label">Creada</span>
                <span class="info-value">${formatDate(tx.created_at)}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Actualizada</span>
                <span class="info-value">${formatDate(tx.updated_at)}</span>
              </div>
            </div>
          </div>

          ${!isTerminal ? `
            <div class="panel-card">
              <div class="panel-card-header">
                <span class="panel-card-title">Acciones</span>
              </div>
              <div class="panel-card-body fill-actions">
                <button class="btn btn-primary" id="btn-save-fields" onclick="saveTransactionFields('${txId}')">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                    <polyline points="17 21 17 13 7 13 7 21"/>
                    <polyline points="7 3 7 8 15 8"/>
                  </svg>
                  Guardar campos
                </button>
                <button class="btn btn-success" id="btn-flatten" onclick="flattenTransaction('${txId}')">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Generar PDF final
                </button>
                <button class="btn btn-secondary btn-sm" onclick="previewPdf('/transactions/${txId}/pdf', '${tx.template_name}')">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                  Ver PDF actual
                </button>
              </div>
            </div>
          ` : `
            <div class="panel-card">
              <div class="panel-card-header">
                <span class="panel-card-title">Acciones</span>
              </div>
              <div class="panel-card-body fill-actions">
                ${tx.status === 'FINALIZED' ? `
                  <button class="btn btn-success" onclick="previewPdf('/transactions/${txId}/pdf', '${tx.template_name}-filled')">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Descargar PDF generado
                  </button>
                ` : ''}
              </div>
            </div>
          `}
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><p>Error: ${err.message}</p></div>`;
    showToast(err.message, 'error');
  }
}

function renderFillForm(fields, filledData, readOnly, txId) {
  const inputs = fields.map(f => {
    const val = filledData[f.name];
    const req = f.required ? '<span class="req-dot" title="Obligatorio"></span>' : '';

    if (f.type === 'CHECKBOX') {
      return `
        <div class="form-field form-field-checkbox">
          <input type="checkbox" id="field-${f.name}" name="${f.name}"
            ${val === true || val === 'true' ? 'checked' : ''}
            ${readOnly ? 'disabled' : ''} />
          <label for="field-${f.name}">${f.name} ${req}</label>
        </div>
      `;
    }

    if (f.type === 'RADIO') {
      // Mirror PdfField.tsx pattern:
      // Each widget in the group = one <input type="radio"> with the same `name`
      // but with its own `value` (the widget's on-value from the PDF).
      // HTML radio grouping by shared `name` handles mutual exclusion natively.
      return `
        <div class="form-field" data-radio-group="${f.name}">
          <label>${f.name} ${req}</label>
          <div class="radio-group">
            ${f.widgets.map((w, idx) => {
              const optVal = (w.value ?? '').trim();
              const displayLabel = optVal || `Opción ${idx + 1}`;
              const inputId = `radio__${f.name}__${idx}`;
              const isChecked = val !== undefined && val !== null && val !== '' && String(val) === String(optVal);
              // onclick en el div selecciona el radio aunque el click caiga fuera del input/label
              const clickHandler = readOnly ? '' : `onclick="document.getElementById('${inputId}').click();syncRadioSelected(this.closest('.radio-group'))"`;
              return `
                <div class="radio-option ${isChecked ? 'radio-selected' : ''}" ${clickHandler}>
                  <input
                    type="radio"
                    id="${inputId}"
                    name="radio__${f.name}"
                    value="${optVal}"
                    data-radio-group="${f.name}"
                    ${isChecked ? 'checked' : ''}
                    ${readOnly ? 'disabled' : `onchange="syncRadioSelected(this.closest('.radio-group'))"`}
                  />
                  <label for="${inputId}">${displayLabel}</label>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }


    if (f.type === 'DROPDOWN') {
      return `
        <div class="form-field">
          <label for="field-${f.name}">${f.name} ${req}</label>
          <select id="field-${f.name}" name="${f.name}" ${readOnly ? 'disabled' : ''}>
            <option value="">— Seleccionar —</option>
            ${(f.options || []).map(o => `
              <option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>
            `).join('')}
          </select>
        </div>
      `;
    }

    if (f.type === 'SIGNATURE') {
      return `
        <div class="form-field">
          <label for="field-${f.name}">${f.name} ${req}</label>
          <input type="text" id="field-${f.name}" name="${f.name}"
            placeholder="Firma (SVG o texto representativo)"
            value="${val || ''}"
            ${readOnly ? 'readonly' : ''} />
          <span style="font-size:0.72rem;color:var(--color-text-muted)">Campo de firma — ingresa un valor representativo</span>
        </div>
      `;
    }

    // TEXT field
    const inputTypeMap = { TXT: 'text', EMAIL: 'email', DATE: 'date', NUM: 'number', PHONE: 'tel' };
    const inputType = inputTypeMap[f.dataType] || 'text';

    return `
      <div class="form-field">
        <label for="field-${f.name}">${f.name} ${req}</label>
        <input
          type="${inputType}"
          id="field-${f.name}"
          name="${f.name}"
          value="${val || ''}"
          placeholder="${f.dataType === 'DATE' ? '' : `Ingresa ${f.name}`}"
          ${readOnly ? 'readonly' : ''}
        />
      </div>
    `;
  }).join('');

  return `<form id="fill-form" class="fill-form">${inputs}</form>`;
}

function collectFormData(fields) {
  // Scope search to the fill-form element to avoid collisions with other DOM sections
  const form = document.getElementById('fill-form');
  const root = form || document;
  const data = {};

  for (const f of fields) {
    if (f.type === 'RADIO') {
      // Mirror PdfField.tsx: find the checked input by the shared `name` attribute
      // which is `radio__${f.name}` — all widgets of the same group share it.
      const checked = root.querySelector(`input[name="radio__${f.name}"]:checked`);
      if (checked) data[f.name] = checked.value;

    } else if (f.type === 'CHECKBOX') {
      const el = root.querySelector(`#field-${CSS.escape(f.name)}`);
      if (el) data[f.name] = el.checked;

    } else if (f.type === 'DROPDOWN') {
      const el = root.querySelector(`#field-${CSS.escape(f.name)}`);
      if (el) data[f.name] = el.value;

    } else {
      // TEXT, SIGNATURE
      const el = root.querySelector(`#field-${CSS.escape(f.name)}`);
      if (el) data[f.name] = el.value;
    }
  }
  return data;
}

async function saveTransactionFields(txId) {
  try {
    const tx = await apiFetch(`/transactions/${txId}`);
    const fields = tx.structure?.fields || [];
    const data = collectFormData(fields);

    await apiFetch(`/transactions/${txId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    showToast('Campos guardados correctamente', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function flattenTransaction(txId) {
  const btn = document.getElementById('btn-flatten');
  if (btn) { btn.disabled = true; btn.textContent = 'Generando…'; }

  try {
    const tx = await apiFetch(`/transactions/${txId}`);
    const fields = tx.structure?.fields || [];
    const data = collectFormData(fields);

    // Save first
    await apiFetch(`/transactions/${txId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });

    // Flatten
    await apiFetch(`/transactions/${txId}/flatten`, { method: 'POST' });
    showToast('PDF generado exitosamente', 'success');
    openTransactionDetail(txId); // Reload
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Generar PDF final'; }
  }
}

async function cancelTransaction(txId) {
  if (!confirm('¿Cancelar esta transacción?')) return;
  try {
    await apiFetch(`/transactions/${txId}/cancel`, { method: 'POST' });
    showToast('Transacción cancelada', 'success');
    openTransactionDetail(txId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ---------------------------------------------------------------------------
// PDF Viewer Modal
// ---------------------------------------------------------------------------

function previewPdf(path, name) {
  const modal = document.getElementById('modal-pdf');
  const iframe = document.getElementById('pdf-iframe');
  const title = document.getElementById('pdf-modal-title');
  const downloadLink = document.getElementById('pdf-download-link');

  const url = API + path;
  iframe.src = url;
  title.textContent = name || 'Vista previa';
  downloadLink.href = url;
  downloadLink.download = `${name || 'document'}.pdf`;
  modal.style.display = 'flex';
}

// ---------------------------------------------------------------------------
// Upload Template Modal
// ---------------------------------------------------------------------------

let selectedFile = null;

function openUploadModal() {
  selectedFile = null;
  document.getElementById('file-input').value = '';
  document.getElementById('input-description').value = '';
  document.getElementById('file-selected').style.display = 'none';
  document.getElementById('modal-upload').style.display = 'flex';
}

function closeUploadModal() {
  document.getElementById('modal-upload').style.display = 'none';
  selectedFile = null;
}

function handleFileSelected(file) {
  if (!file) return;
  if (!file.name.endsWith('.pdf') && file.type !== 'application/pdf') {
    showToast('Solo se aceptan archivos PDF', 'error');
    return;
  }
  selectedFile = file;
  const info = document.getElementById('file-selected');
  info.style.display = 'flex';
  info.textContent = `✓ ${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

function goToTemplates() {
  showView('view-templates');
  setActiveNav('templates');
  loadTemplates();
}

function goToTransactions() {
  showView('view-transactions');
  setActiveNav('transactions');
  loadTransactions();
}

// ---------------------------------------------------------------------------
// Event Listeners — Init
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  // Nav
  document.getElementById('nav-templates').addEventListener('click', goToTemplates);
  document.getElementById('nav-transactions').addEventListener('click', goToTransactions);

  // Back buttons
  document.getElementById('btn-back-from-template').addEventListener('click', goToTemplates);
  document.getElementById('btn-back-from-transaction').addEventListener('click', goToTransactions);

  // Upload modal
  document.getElementById('btn-open-upload').addEventListener('click', openUploadModal);
  document.getElementById('btn-close-upload').addEventListener('click', closeUploadModal);
  document.getElementById('btn-cancel-upload').addEventListener('click', closeUploadModal);

  // File input
  const fileInput = document.getElementById('file-input');
  fileInput.addEventListener('change', (e) => handleFileSelected(e.target.files[0]));

  // Drop zone
  const dropZone = document.getElementById('drop-zone');
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFileSelected(e.dataTransfer.files[0]);
  });

  // Upload form submit
  document.getElementById('form-upload').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedFile) { showToast('Selecciona un archivo PDF primero', 'error'); return; }

    const btn = document.getElementById('btn-submit-upload');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Analizando…';

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const description = document.getElementById('input-description').value.trim();
      if (description) formData.append('description', description);

      const template = await apiFetch('/templates', { method: 'POST', body: formData });
      showToast(`Plantilla "${template.name}" subida exitosamente`, 'success');
      closeUploadModal();
      loadTemplates();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Analizar y subir';
    }
  });

  // Preview template PDF button (header)
  document.getElementById('btn-preview-template-pdf').addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.templateId || currentTemplateId;
    if (id) previewPdf(`/templates/${id}/pdf`, 'Plantilla PDF');
  });

  // Create transaction button (header)
  document.getElementById('btn-create-transaction').addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.templateId || currentTemplateId;
    if (id) createTransaction(id);
  });

  // PDF modal close
  document.getElementById('btn-close-pdf').addEventListener('click', () => {
    document.getElementById('modal-pdf').style.display = 'none';
    document.getElementById('pdf-iframe').src = '';
  });

  // Close modals on overlay click
  document.getElementById('modal-upload').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeUploadModal();
  });
  document.getElementById('modal-pdf').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      document.getElementById('modal-pdf').style.display = 'none';
      document.getElementById('pdf-iframe').src = '';
    }
  });

  // Initial load
  goToTemplates();
});
