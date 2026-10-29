// Boot, state ownership and event wiring. The sheet is rendered by editor.js; all math lives in calc.js.
import {
  createDefaultDocument,
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
import { todayIso, addDays, parseNetTerms } from './dates.js';
import { renderSheet, updateComputed, renderSidebar, setPath, autoGrow, idFor } from './editor.js';

const app = { doc: null, invalid: new Map() /* path -> { raw, error } */, view: null };

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

// Prompt 16 restores the saved draft (and defaults) here.
function loadInitialDoc() {
  return createDefaultDocument({ today: todayIso(), language: navigator.language });
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

function boot() {
  form = document.getElementById('sheet');
  sidebar = document.getElementById('sidebar');
  app.doc = loadInitialDoc();

  // The CSP has form-action 'none': an implicit Enter-key submit would attempt a blocked navigation.
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', onEdit);
  form.addEventListener('change', onEdit);
  form.addEventListener('change', onUpload);
  form.addEventListener('click', onAction);
  sidebar.addEventListener('change', onSetting);
  window.addEventListener('resize', () => {
    for (const el of form.querySelectorAll('textarea')) autoGrow(el);
  });

  refresh({ structural: true });
}

document.addEventListener('DOMContentLoaded', boot);
