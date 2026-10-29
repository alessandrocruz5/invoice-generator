// Boot, state ownership and event wiring. The sheet is rendered by editor.js; all math lives in calc.js.
import {
  createDefaultDocument,
  pickDefaults,
  migrate,
  labelFor,
  setLabel,
  newItem,
  checkImageDataUrl,
  MAX_CUSTOM_FIELDS,
  MAX_IMAGE_BYTES,
} from './state.js';
import { modeConfig } from './modes.js';
import { computeTotals, LIMITS } from './calc.js';
import { presetById, CUSTOM_PRESET } from './withholding.js';
import {
  resolveLocale,
  decimalMark,
  groupMark,
  minorUnits,
  makeMoneyFormatter,
  parseUserNumber,
} from './currency.js';
import { formatTin } from './tin.js';
import { todayIso, addDays, parseNetTerms, formatDate } from './dates.js';
import { pdfMoneyFormatter, pdfFilename, buildDocDefinition, downloadPdf } from './pdf.js';
import { validate } from './validate.js';
import {
  getLocalStorage,
  createStore,
  toHistoryEntry,
  upsertHistory,
  historyToCsv,
  exportFilename,
  csvFilename,
  sanitizeImport,
  IMPORT_MAX_BYTES,
} from './storage.js';
import { nextNumber } from './numbering.js';
import { STORAGE_BANNER, DATA_LOCATION_NOTE } from './copy.js';
import { renderSheet, updateComputed, renderSidebar, setPath, autoGrow, idFor } from './editor.js';

const app = {
  doc: null,
  invalid: new Map() /* path -> { raw, error } */,
  view: null,
  // Validation state. historyNumbers mirrors the saved History and is reset after every history write;
  // validate runs on every keystroke, so storage is never read there.
  historyNumbers: [],
  issues: { errors: [], warnings: [] },
  touched: new Set(),
  showAll: false,
  store: null,
};

const SAVE_DELAY_MS = 500;

const MAX_DECIMALS = { qty: 4, rate: 4, percent: 3, money: 4 };
const IMAGE_TARGETS = new Set(['logo', 'payment_qr']);
const UPLOAD_ERROR = 'Use a PNG or JPEG under 500 KB.';

let form;
let sidebar;
// The due date that Net N terms last filled in. While due_date still equals it, later term or date edits update it.
let autoDue = '';
// True while the sheet is rebuilt. Removing a focused input fires its pending `change` with a path that may
// now point at a different row (after a splice); the `input` events already applied that value.
let rendering = false;

let saveTimer = null;
let bannerShown = false;

function showStorageBanner() {
  if (bannerShown) return;
  bannerShown = true;
  const banner = document.getElementById('storage-banner');
  banner.textContent = STORAGE_BANNER;
  banner.hidden = false;
}

function newDocument({ useDefaults = true, currency = null } = {}) {
  const doc = createDefaultDocument({
    today: todayIso(),
    language: navigator.language,
    defaults: useDefaults ? app.store.readDefaults().value ?? null : null,
    lastNumber: useDefaults ? app.store.readLastNumber().value ?? '' : '',
  });
  // Spec §4: the default currency is the last one used, unless saved defaults say otherwise.
  if (currency !== null && !hasSavedCurrency()) doc.currency = currency;
  return doc;
}

function hasSavedCurrency() {
  const saved = app.store.readDefaults().value;
  return saved !== null && typeof saved === 'object' && Object.hasOwn(saved, 'currency');
}

// Restores the saved draft, else starts from the saved defaults.
function loadInitialDoc() {
  app.store = createStore(getLocalStorage());
  if (!app.store.available) showStorageBanner();
  const draft = app.store.readDraft();
  if (draft.ok && draft.value !== null) {
    try {
      return migrate(draft.value);
    } catch {
      // an unreadable draft falls back to a fresh document
    }
  }
  return newDocument();
}

function saveDraft() {
  saveTimer = null;
  if (!app.store.writeDraft(app.doc).ok) showStorageBanner();
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraft, SAVE_DELAY_MS);
}

function flushSave() {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveDraft();
  }
}

function resetDocState() {
  app.invalid.clear();
  app.touched.clear();
  app.showAll = false;
  autoDue = '';
}

function safeLocale(locale) {
  try {
    new Intl.NumberFormat(locale);
    return locale;
  } catch {
    return 'en-US';
  }
}

function computeView({ doc }) {
  const locale = safeLocale(resolveLocale(doc.settings.locale, navigator.language));
  const m = minorUnits(doc.currency);
  return {
    locale,
    decimalMark: decimalMark(locale),
    groupMark: groupMark(locale),
    minorUnits: m,
    fmt: makeMoneyFormatter({ locale, currency: doc.currency, currencyDisplay: doc.settings.currencyDisplay }),
    totals: computeTotals(doc, m),
    config: modeConfig(doc.mode),
    label: (k) => labelFor(doc, k),
  };
}

// ---- refresh and focus -------------------------------------------------------------------------------

function captureFocus() {
  const el = document.activeElement;
  if (!el || !el.id || !form.contains(el)) return null;
  let start = null;
  let end = null;
  try {
    start = el.selectionStart;
    end = el.selectionEnd;
  } catch {
    // inputs like type="date" have no selection
  }
  return { id: el.id, start, end };
}

function restoreFocus(saved, preventScroll) {
  const el = saved && document.getElementById(saved.id);
  if (!el) return;
  el.focus({ preventScroll });
  if (saved.start == null) return;
  try {
    el.setSelectionRange(saved.start, saved.end);
  } catch {
    // not a text control
  }
}

// structural: rebuild the sheet (mode, currency, format, display, rows or toggles added or removed, import,
// new document). focusId: the element to focus afterwards, instead of the one that had focus.
function refresh({ structural = false, focusId = null } = {}) {
  app.view = computeView(app);
  if (structural) {
    const saved = focusId ? { id: focusId, start: null, end: null } : captureFocus();
    rendering = true;
    try {
      renderSheet(form, app.doc, app.view, app.invalid);
      restoreFocus(saved, !focusId);
    } finally {
      rendering = false;
    }
  } else {
    updateComputed(form, app.doc, app.view);
  }
  renderSidebar(sidebar, app.doc, app.view);
  app.issues = validate(app.doc, { totals: app.view.totals, invalid: app.invalid, historyNumbers: app.historyNumbers });
  renderMessages();
  scheduleSave();
}

// ---- validation messages -----------------------------------------------------------------------------

let renderedKey = '';

// Errors show once their field was left, or for every field after a Download attempt.
function visibleErrors() {
  return app.issues.errors.filter((e) => app.showAll || (e.field !== null && app.touched.has(e.field)));
}

function messageList(issues, firstId) {
  const items = issues.map((issue, i) => {
    const li = document.createElement('li');
    li.id = `msg-${firstId + i}`;
    const control = issue.field !== null ? document.getElementById(idFor(issue.field)) : null;
    if (control) {
      const link = document.createElement('a');
      link.href = `#${control.id}`;
      link.textContent = issue.message;
      li.append(link);
    } else {
      li.textContent = issue.message;
    }
    return li;
  });
  const ul = document.createElement('ul');
  ul.append(...items);
  return ul;
}

function messageBlock(heading, issues, firstId, attrs) {
  const box = document.createElement('div');
  for (const [name, value] of Object.entries(attrs)) box.setAttribute(name, value);
  const title = document.createElement('p');
  title.className = 'messages-heading';
  title.textContent = heading;
  box.append(title, messageList(issues, firstId));
  return box;
}

// Marks each errored control, keeping the describedby ids the sheet itself set (such as the withholding help).
function markInvalidControls(errors) {
  const byField = new Map();
  errors.forEach((e, i) => {
    if (e.field === null) return;
    byField.set(e.field, [...(byField.get(e.field) ?? []), `msg-${i}`]);
  });
  const own = (el) => (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id && !id.startsWith('msg-'));
  for (const el of form.querySelectorAll('[aria-invalid]')) {
    if (byField.has(el.dataset.path)) continue;
    el.removeAttribute('aria-invalid');
    const rest = own(el);
    if (rest.length) el.setAttribute('aria-describedby', rest.join(' '));
    else el.removeAttribute('aria-describedby');
  }
  for (const [field, ids] of byField) {
    const el = document.getElementById(idFor(field));
    if (!el) continue;
    el.setAttribute('aria-invalid', 'true');
    el.setAttribute('aria-describedby', [...own(el), ...ids].join(' '));
  }
}

function renderMessages() {
  const errors = visibleErrors();
  const warnings = app.issues.warnings;
  const key = JSON.stringify([errors, warnings]);
  if (key !== renderedKey) {
    renderedKey = key;
    const box = document.getElementById('validation');
    box.textContent = '';
    if (errors.length) {
      box.append(messageBlock('Fix these before downloading:', errors, 0, { id: 'error-summary', class: 'messages-errors', role: 'alert', tabindex: '-1' }));
    }
    if (warnings.length) {
      box.append(messageBlock('Check these:', warnings, errors.length, { class: 'messages-warnings' }));
    }
  }
  markInvalidControls(errors);
}

function onFocusOut(e) {
  const path = e.target instanceof HTMLElement ? e.target.dataset.path : undefined;
  if (!path || rendering || app.touched.has(path)) return;
  app.touched.add(path);
  renderMessages();
}

function onMessageLink(e) {
  const link = e.target.closest('a[href^="#f-"]');
  if (!link) return;
  e.preventDefault();
  const el = document.getElementById(link.getAttribute('href').slice(1));
  if (!el) return;
  el.focus();
  el.scrollIntoView({ block: 'center' });
}

// ---- edits -------------------------------------------------------------------------------------------

// Reformats as the user types, keeping the caret after the same number of digits.
function formatTinInPlace(el) {
  const next = formatTin(el.value);
  if (next === el.value) return;
  const caret = el.selectionStart ?? el.value.length;
  const digitsBefore = el.value.slice(0, caret).replace(/\D/g, '').length;
  el.value = next;
  let pos = 0;
  for (let seen = 0; pos < next.length && seen < digitsBefore; pos += 1) {
    if (next[pos] >= '0' && next[pos] <= '9') seen += 1;
  }
  el.setSelectionRange(pos, pos);
}

// SPEC §6: "Net N" terms fill an empty Due Date with Date + N. The user can still change it.
function applyNetTerms(path) {
  const doc = app.doc;
  if (path === 'due_date') {
    autoDue = '';
    return;
  }
  if (doc.due_date !== '' && doc.due_date !== autoDue) return;
  const n = parseNetTerms(doc.payment_terms);
  const next = n === null ? '' : addDays(doc.date, n);
  if (next === doc.due_date) return;
  doc.due_date = next;
  autoDue = next;
  const input = document.getElementById(idFor('due_date'));
  if (input) input.value = next;
}

function handleEdit(el) {
  const { path, kind } = el.dataset;
  const doc = app.doc;
  switch (kind) {
    case 'label':
      setLabel(doc, path.slice('labels.'.length), el.value);
      break;
    case 'tin':
      formatTinInPlace(el);
      setPath(doc, path, el.value);
      break;
    case 'qty':
    case 'rate':
    case 'percent':
    case 'money': {
      const parsed = parseUserNumber(el.value, {
        decimalMark: app.view.decimalMark,
        groupMark: app.view.groupMark,
        maxDecimals: MAX_DECIMALS[kind],
      });
      if (parsed.ok) {
        setPath(doc, path, parsed.value);
        app.invalid.delete(path);
      } else {
        setPath(doc, path, '');
        app.invalid.set(path, { raw: el.value, error: parsed.error });
      }
      break;
    }
    case 'check':
      setPath(doc, path, el.checked);
      break;
    case 'text':
    case 'date':
    case 'select':
      setPath(doc, path, el.value);
      break;
    default:
      return;
  }
  if (el.tagName === 'TEXTAREA') autoGrow(el);
  // A preset fills the rate; typing a rate makes the preset "custom" (the sheet syncs the select in place).
  if (path === 'withholding_preset') {
    const preset = presetById(el.value);
    if (preset) {
      doc.withholding_rate = preset.rate;
      app.invalid.delete('withholding_rate');
    }
  } else if (path === 'withholding_rate') {
    doc.withholding_preset = CUSTOM_PRESET;
  }
  if (path === 'payment_terms' || path === 'date' || path === 'due_date') applyNetTerms(path);
  // Selects and checkboxes can show or hide rows, so they rebuild the sheet.
  refresh({ structural: kind === 'select' || kind === 'check' });
}

function onEdit(e) {
  const el = e.target;
  if (rendering || !(el instanceof HTMLElement) || !el.isConnected || !el.dataset.path) return;
  handleEdit(el);
}

// After row `index` of a list is removed, its invalid-number entries go and later rows shift down by one.
function shiftInvalid(prefix, index) {
  for (const [path, entry] of [...app.invalid]) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    const dot = rest.indexOf('.');
    const n = Number.parseInt(rest.slice(0, dot), 10);
    if (dot < 0 || n < index) continue;
    app.invalid.delete(path);
    if (n > index) app.invalid.set(`${prefix}${n - 1}${rest.slice(dot)}`, entry);
  }
}

// What each adjustable field accepts: data-value -> stored `fields` value. `amount` is the document key
// holding its number, cleared whenever the field changes state.
const ADJUSTABLE = {
  discounts: { states: { off: false, '%': '%', flat: true }, amount: 'discounts', input: idFor('discounts') },
  tax: { states: { off: false, '%': '%', flat: true }, amount: 'tax', input: idFor('tax') },
  shipping: { states: { off: false, on: true }, amount: 'shipping', input: idFor('shipping') },
  withholding: { states: { off: false, on: true }, amount: null, input: idFor('withholding_preset') },
};

// Typed toggles and add/remove buttons. Each action assigns explicit values and may return an id to focus,
// or false when nothing changed and the sheet needn't be rebuilt.
const ACTIONS = {
  'add-item'(doc) {
    if (doc.items.length >= LIMITS.items) return false;
    doc.items.push(newItem());
    return idFor(`items.${doc.items.length - 1}.name`);
  },
  'remove-item'(doc, data) {
    const i = Number.parseInt(data.index, 10);
    if (!(i >= 0 && i < doc.items.length)) return false;
    doc.items.splice(i, 1);
    shiftInvalid('items.', i);
    // The sheet always keeps one row to type into.
    if (doc.items.length === 0) doc.items.push(newItem());
    return i < doc.items.length ? `a-remove-item-${i}` : 'a-add-item';
  },
  adjust(doc, data) {
    const spec = Object.hasOwn(ADJUSTABLE, data.field) ? ADJUSTABLE[data.field] : null;
    if (!spec || !Object.hasOwn(spec.states, data.value)) return false;
    const was = doc.fields[data.field];
    const next = spec.states[data.value];
    if (was === next) return false;
    doc.fields[data.field] = next;
    if (spec.amount) {
      doc[spec.amount] = '';
      app.invalid.delete(spec.amount);
    }
    if (was === false) return spec.input;
    return next === false ? `a-add-${data.field}` : `a-mode-${data.field}-${data.value === '%' ? 'pct' : data.value}`;
  },
  'pick-image'(doc, data) {
    if (!IMAGE_TARGETS.has(data.target)) return false;
    document.getElementById(`up-${data.target}`)?.click();
    return false;
  },
  'remove-image'(doc, data) {
    if (!IMAGE_TARGETS.has(data.target)) return false;
    doc[data.target] = null;
    return `a-pick-${data.target}`;
  },
  'add-custom'(doc) {
    if (doc.custom_fields.length >= MAX_CUSTOM_FIELDS) return null;
    doc.custom_fields.push({ label: '', value: '' });
    return idFor(`custom_fields.${doc.custom_fields.length - 1}.label`);
  },
  'remove-custom'(doc, data) {
    const i = Number.parseInt(data.index, 10);
    if (!(i >= 0 && i < doc.custom_fields.length)) return null;
    doc.custom_fields.splice(i, 1);
    return i < doc.custom_fields.length ? `a-remove-custom-${i}` : 'a-add-custom';
  },
};

function onAction(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn || !form.contains(btn) || !Object.hasOwn(ACTIONS, btn.dataset.action)) return;
  const focusId = ACTIONS[btn.dataset.action](app.doc, btn.dataset);
  if (focusId === false) return;
  refresh({ structural: true, focusId });
}

// A chosen logo or QR file: type and size first, then the data URL's content, before anything is stored.
function onUpload(e) {
  const input = e.target;
  if (!(input instanceof HTMLInputElement) || input.type !== 'file' || !IMAGE_TARGETS.has(input.dataset.upload)) return;
  const target = input.dataset.upload;
  const file = input.files?.[0];
  input.value = '';
  const showError = (text) => {
    const slot = document.getElementById(`err-${target}`);
    if (slot) slot.textContent = text;
  };
  showError('');
  if (!file) return;
  if ((file.type !== 'image/png' && file.type !== 'image/jpeg') || file.size > MAX_IMAGE_BYTES) {
    showError(UPLOAD_ERROR);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result !== 'string' || !checkImageDataUrl(reader.result)) {
      showError(UPLOAD_ERROR);
      return;
    }
    app.doc[target] = reader.result;
    refresh({ structural: true, focusId: `a-remove-${target}` });
  };
  reader.onerror = () => showError(UPLOAD_ERROR);
  reader.readAsDataURL(file);
}

// Sidebar settings are all string-valued and all structural.
function onSetting(e) {
  const el = e.target.closest('[data-setting]');
  if (!el) return;
  const key = el.dataset.setting;
  if (key === 'mode' || key === 'currency') app.doc[key] = el.value;
  else if (key === 'currencyDisplay' || key === 'locale' || key === 'paper') app.doc.settings[key] = el.value;
  else return;
  refresh({ structural: true });
}

// Natural pixel size of a stored data URL, or null when absent or undecodable (pdf.js then uses `fit`).
async function imageSize(dataUrl) {
  if (!dataUrl) return null;
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight };
  } catch {
    return null;
  }
}

async function onDownload() {
  const button = document.getElementById('download');
  const messages = document.getElementById('download-error');
  // validation gate (prompt 14)
  app.showAll = true;
  app.issues = validate(app.doc, { totals: app.view.totals, invalid: app.invalid, historyNumbers: app.historyNumbers });
  renderMessages();
  if (app.issues.errors.length) {
    messages.textContent = '';
    document.getElementById('error-summary')?.focus();
    return;
  }
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  messages.textContent = '';
  try {
    const doc = app.doc;
    const view = app.view;
    const images = { logo: await imageSize(doc.logo), qr: await imageSize(doc.payment_qr) };
    const formatters = {
      money: pdfMoneyFormatter({ locale: view.locale, currency: doc.currency, currencyDisplay: doc.settings.currencyDisplay }),
      date: (iso) => formatDate(iso, view.locale),
      label: view.label,
      images,
    };
    const def = buildDocDefinition(doc, view.totals, formatters);
    // Snapshot now, so edits made while the PDF is built don't leak into the History entry.
    const entry = toHistoryEntry(doc, view.totals, new Date().toISOString());
    await downloadPdf(def, pdfFilename(view.label('header'), doc.number));
    recordDownload(entry);
    refresh();
  } catch (err) {
    messages.textContent = err instanceof Error && err.message ? err.message : 'Could not create the PDF. Try again.';
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}

// ---- history, export, import -------------------------------------------------------------------------

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// A navigation to a blob URL, not a fetch, so the CSP's connect-src 'none' allows it.
function saveFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readHistoryList() {
  return app.store.readHistory().value.filter(isObject);
}

const historyNumbersOf = (list) => list.map((e) => String(e.number ?? '').trim());

// The only way History is written, so the numbers validate reads can't drift from what is saved.
function writeHistoryList(list) {
  if (!app.store.writeHistory(list).ok) {
    showStorageBanner();
    return false;
  }
  app.historyNumbers = historyNumbersOf(list);
  return true;
}

function recordDownload(entry) {
  writeHistoryList(upsertHistory(readHistoryList(), entry));
  if (!app.store.writeLastNumber(String(entry.number ?? '').trim()).ok) showStorageBanner();
}

function loadDocument(doc) {
  app.doc = doc;
  resetDocState();
  setDefaultStatus('');
  document.getElementById('download-error').textContent = '';
  refresh({ structural: true });
}

function onExport() {
  saveFile(new Blob([JSON.stringify(app.doc, null, 2)], { type: 'application/json' }), exportFilename(app.doc));
}

async function onImportFile(e) {
  const input = e.target;
  const file = input.files?.[0];
  // Reset first so the same file can be picked again.
  input.value = '';
  const messages = document.getElementById('download-error');
  messages.textContent = '';
  if (!file) return;
  if (file.size > IMPORT_MAX_BYTES) {
    messages.textContent = 'This file is too large (1 MB max).';
    return;
  }
  let doc;
  try {
    doc = sanitizeImport(await file.text());
  } catch (err) {
    messages.textContent = err instanceof Error && err.message ? err.message : "This file isn't a valid document.";
    return;
  }
  if (!confirm('Replace the current document with the imported one?')) return;
  loadDocument(doc);
}

// History entries carry no images, so an opened one takes the current defaults' logo and QR.
function documentFromEntry(entry) {
  const doc = migrate(entry);
  const defaults = app.store.readDefaults().value;
  for (const key of ['logo', 'payment_qr']) {
    const image = isObject(defaults) ? defaults[key] : null;
    doc[key] = checkImageDataUrl(image) ? image : null;
  }
  return doc;
}

function historyBalance(entry) {
  const balance = isObject(entry.totals) && typeof entry.totals.balance === 'string' ? entry.totals.balance : '';
  if (balance === '') return '';
  try {
    const display = isObject(entry.settings) && entry.settings.currencyDisplay === 'code' ? 'code' : 'symbol';
    return makeMoneyFormatter({ locale: app.view.locale, currency: entry.currency, currencyDisplay: display })(balance);
  } catch {
    return balance;
  }
}

function historyCell(text) {
  const td = document.createElement('td');
  td.textContent = text;
  return td;
}

function historyButton(label, op, index, number) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.dataset.history = op;
  button.dataset.index = String(index);
  button.setAttribute('aria-label', `${label} ${number}`);
  return button;
}

function firstLine(text) {
  return typeof text === 'string' ? text.split(/\r\n|\r|\n/).map((l) => l.trim()).find((l) => l !== '') ?? '' : '';
}

function renderHistory() {
  const list = readHistoryList();
  const rows = document.getElementById('history-rows');
  rows.textContent = '';
  list.forEach((entry, i) => {
    const number = typeof entry.number === 'string' ? entry.number : '';
    const tr = document.createElement('tr');
    const ops = document.createElement('td');
    const group = document.createElement('div');
    group.className = 'history-ops';
    group.append(historyButton('Open', 'open', i, number), historyButton('Duplicate', 'duplicate', i, number), historyButton('Delete', 'delete', i, number));
    ops.append(group);
    tr.append(
      historyCell(number),
      historyCell(typeof entry.bir_invoice_no === 'string' ? entry.bir_invoice_no : ''),
      historyCell(firstLine(entry.to)),
      historyCell(typeof entry.date === 'string' ? formatDate(entry.date, app.view.locale) : ''),
      historyCell(historyBalance(entry)),
      ops,
    );
    rows.append(tr);
  });
  document.getElementById('history-empty').hidden = list.length > 0;
  document.getElementById('history-list').hidden = list.length === 0;
  document.getElementById('history-csv').disabled = list.length === 0;
  document.getElementById('history-clear').disabled = list.length === 0;
}

function openHistory() {
  document.getElementById('history-status').textContent = '';
  renderHistory();
  document.getElementById('history-dialog').showModal();
}

function openFromHistory(entry, duplicate) {
  if (!confirm('Replace the current document with this one?')) return;
  const status = document.getElementById('history-status');
  let doc;
  try {
    doc = documentFromEntry(entry);
  } catch {
    status.textContent = "This entry can't be opened.";
    return;
  }
  if (duplicate) {
    doc.number = nextNumber(app.store.readLastNumber().value) || doc.number;
    doc.date = todayIso();
  }
  loadDocument(doc);
  document.getElementById('history-dialog').close();
}

function onHistoryClick(e) {
  const button = e.target.closest('button[data-history]');
  if (!button) return;
  const list = readHistoryList();
  const index = Number.parseInt(button.dataset.index, 10);
  if (!(index >= 0 && index < list.length)) return;
  const op = button.dataset.history;
  if (op === 'delete') {
    list.splice(index, 1);
    writeHistoryList(list);
    renderHistory();
    // The pressed button is gone: move focus to the next row's Open button, or Close when the list is empty.
    const next = document.querySelector(`#history-rows button[data-history="open"][data-index="${Math.min(index, list.length - 1)}"]`);
    (next ?? document.getElementById('history-close')).focus();
  } else if (op === 'open' || op === 'duplicate') {
    openFromHistory(list[index], op === 'duplicate');
  }
}

function onClearHistory() {
  if (!confirm("Delete every History entry in this browser? This can't be undone.")) return;
  writeHistoryList([]);
  renderHistory();
  document.getElementById('history-close').focus();
}

function onHistoryCsv() {
  saveFile(new Blob([historyToCsv(readHistoryList())], { type: 'text/csv;charset=utf-8' }), csvFilename(todayIso()));
}

// ---- saving, new document, clear ---------------------------------------------------------------------

function setDefaultStatus(text) {
  document.getElementById('default-status').textContent = text;
}

function onSaveDefault() {
  const ok = app.store.writeDefaults(pickDefaults(app.doc)).ok;
  if (!ok) showStorageBanner();
  setDefaultStatus(ok ? 'Saved as default.' : 'Could not save the default.');
}

function onNewDocument() {
  if (!confirm('Start a new document? Unsaved changes to this one are kept only if you exported or downloaded it.')) return;
  app.doc = newDocument({ currency: app.doc.currency });
  resetDocState();
  setDefaultStatus('');
  refresh({ structural: true });
}

function onClearAll() {
  if (!confirm("Delete every saved draft, default and history entry in this browser? This can't be undone.")) return;
  if (!app.store.clearAll().ok) showStorageBanner();
  app.doc = newDocument({ useDefaults: false });
  app.historyNumbers = [];
  resetDocState();
  setDefaultStatus('');
  refresh({ structural: true });
  // The blank document stays unsaved until the next edit, so the cleared keys stay empty.
  clearTimeout(saveTimer);
  saveTimer = null;
}

function actionButton(text, id, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = id;
  button.textContent = text;
  button.addEventListener('click', onClick);
  return button;
}

function buildPersistenceControls() {
  const status = document.createElement('p');
  status.id = 'default-status';
  status.className = 'help';
  status.setAttribute('role', 'status');
  document.getElementById('sidebar-actions').append(
    actionButton('Save as default', 'save-default', onSaveDefault),
    actionButton('Export', 'export', onExport),
    actionButton('Import', 'import', () => document.getElementById('import-file').click()),
    status,
  );
  document.getElementById('topbar-actions').append(
    actionButton('History', 'history-open', openHistory),
    actionButton('New document', 'new-document', onNewDocument),
  );
  const clear = actionButton('Clear all data', 'clear-all', onClearAll);
  // app.css is outside this prompt's files, so the link look is set here.
  Object.assign(clear.style, { background: 'none', border: '0', padding: '0', color: 'inherit', textDecoration: 'underline', cursor: 'pointer' });
  document.getElementById('app-footer').append(clear);
  document.getElementById('data-note').textContent = DATA_LOCATION_NOTE;
}

function boot() {
  form = document.getElementById('sheet');
  sidebar = document.getElementById('sidebar');
  app.doc = loadInitialDoc();
  app.historyNumbers = historyNumbersOf(readHistoryList());
  buildPersistenceControls();
  document.getElementById('import-file').addEventListener('change', onImportFile);
  const historyDialog = document.getElementById('history-dialog');
  historyDialog.addEventListener('click', onHistoryClick);
  historyDialog.addEventListener('close', () => document.getElementById('history-open').focus());
  document.getElementById('history-csv').addEventListener('click', onHistoryCsv);
  document.getElementById('history-clear').addEventListener('click', onClearHistory);
  document.getElementById('history-close').addEventListener('click', () => historyDialog.close());

  // The CSP has form-action 'none': an implicit Enter-key submit would attempt a blocked navigation.
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', onEdit);
  form.addEventListener('change', onEdit);
  form.addEventListener('change', onUpload);
  form.addEventListener('click', onAction);
  form.addEventListener('focusout', onFocusOut);
  document.getElementById('messages').addEventListener('click', onMessageLink);
  sidebar.addEventListener('change', onSetting);
  document.getElementById('download').addEventListener('click', onDownload);
  window.addEventListener('pagehide', flushSave);
  window.addEventListener('resize', () => {
    for (const el of form.querySelectorAll('textarea')) autoGrow(el);
  });

  refresh({ structural: true });
}

document.addEventListener('DOMContentLoaded', boot);
