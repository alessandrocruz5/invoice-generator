// localStorage access, history, CSV, export filenames and the import sanitiser. Pure: the storage object is
// passed in, and `localStorage` is touched only inside getLocalStorage, never at import time.
import {
  createDefaultDocument, ITEM_UNITS, LABEL_KEYS, MAX_CUSTOM_FIELDS, checkImageDataUrl, cloneDoc, newItem,
} from './state.js';
import { MODES, VAT_TREATMENTS, modeConfig } from './modes.js';
import { isSupportedCurrency, NUMBER_FORMATS } from './currency.js';
import { WITHHOLDING_PRESETS, CUSTOM_PRESET } from './withholding.js';
import { isIsoDate } from './dates.js';
import { LIMITS } from './calc.js';

export const KEYS = {
  draft: 'invoicegen:v1:draft',
  defaults: 'invoicegen:v1:defaults',
  history: 'invoicegen:v1:history',
  lastNumber: 'invoicegen:v1:lastNumber',
};
export const HISTORY_MAX = 50;
export const IMPORT_MAX_BYTES = 1024 * 1024;

const PREFIX = 'invoicegen:';
const PROBE_KEY = 'invoicegen:probe';
const FAIL = Object.freeze({ ok: false });

const own = (obj, key) => Object.hasOwn(obj, key);
const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function probe(storage) {
  if (!storage) return false;
  try {
    storage.setItem(PROBE_KEY, '1');
    storage.removeItem(PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function getLocalStorage() {
  try {
    const s = globalThis.localStorage;
    return probe(s) ? s : null;
  } catch {
    return null;
  }
}

export function createStore(storage) {
  const available = probe(storage);

  function read(key) {
    if (!available) return FAIL;
    try {
      const raw = storage.getItem(key);
      return { ok: true, value: raw === null ? null : JSON.parse(raw) };
    } catch {
      return FAIL;
    }
  }

  function write(key, value) {
    if (!available) return FAIL;
    try {
      storage.setItem(key, JSON.stringify(value));
      return { ok: true };
    } catch {
      return FAIL;
    }
  }

  return {
    available,
    readDraft: () => read(KEYS.draft),
    writeDraft: (doc) => write(KEYS.draft, doc),
    readDefaults: () => read(KEYS.defaults),
    writeDefaults: (obj) => write(KEYS.defaults, obj),
    readHistory() {
      const r = read(KEYS.history);
      return { ok: r.ok, value: r.ok && Array.isArray(r.value) ? r.value : [] };
    },
    writeHistory: (list) => write(KEYS.history, list),
    readLastNumber() {
      const r = read(KEYS.lastNumber);
      return r.ok ? { ok: true, value: typeof r.value === 'string' ? r.value : '' } : FAIL;
    },
    writeLastNumber: (str) => write(KEYS.lastNumber, String(str)),
    clearAll() {
      if (!available) return FAIL;
      try {
        const keys = [];
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i);
          if (typeof k === 'string' && k.startsWith(PREFIX)) keys.push(k);
        }
        for (const k of keys) storage.removeItem(k);
        return { ok: true };
      } catch {
        return FAIL;
      }
    },
  };
}

// History entries drop images to stay under the storage quota (SPEC §6).
export function toHistoryEntry(doc, totals, savedAt) {
  const entry = cloneDoc(doc);
  entry.logo = null;
  entry.payment_qr = null;
  entry.totals = cloneDoc(totals);
  entry.saved_at = savedAt;
  return entry;
}

const numberKey = (entry) => String(entry?.number ?? '').trim();

export function upsertHistory(list, entry, max = HISTORY_MAX) {
  const key = numberKey(entry);
  const rest = (Array.isArray(list) ? list : []).filter((e) => numberKey(e) !== key);
  return [entry, ...rest].slice(0, max);
}

const CSV_HEADER = [
  'Number', 'BIR Invoice No.', 'Date', 'Client', 'Client TIN', 'Currency', 'Subtotal', 'Discount', 'VAT or tax',
  'Withholding', 'Net amount payable', 'Amount paid', 'Balance due',
];

const quote = (s) => `"${String(s).replaceAll('"', '""')}"`;
// Text cells only: a leading = + - @ tab or CR would run as a spreadsheet formula.
const textCell = (v) => {
  const s = typeof v === 'string' ? v : '';
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

function firstLine(text) {
  if (typeof text !== 'string') return '';
  return text.split(/\r\n|\r|\n/).map((l) => l.trim()).find((l) => l !== '') ?? '';
}

function csvRow(entry) {
  const t = plain(entry.totals) ? entry.totals : {};
  const amount = (k) => (typeof t[k] === 'string' ? t[k] : '');
  const vatOrTax = entry.mode === 'ph-vat' ? amount('vat') : entry.mode === 'generic' ? amount('tax') : '';
  return [
    textCell(entry.number),
    textCell(entry.bir_invoice_no),
    typeof entry.date === 'string' ? entry.date : '',
    textCell(firstLine(entry.to)),
    textCell(entry.client_tin),
    typeof entry.currency === 'string' ? entry.currency : '',
    amount('subtotal'),
    amount('discount'),
    vatOrTax,
    amount('withholding'),
    amount('netPayable'),
    amount('amountPaid'),
    amount('balance'),
  ];
}

export function historyToCsv(entries) {
  const rows = [CSV_HEADER, ...(Array.isArray(entries) ? entries : []).filter(plain).map(csvRow)];
  return `﻿${rows.map((r) => `${r.map(quote).join(',')}\r\n`).join('')}`;
}

export function exportFilename(doc) {
  const n = String(doc.number ?? '').replace(/[/\\:*?"<>|\s]/g, '-');
  return modeConfig(doc.mode).isPh ? `billing-statement-${n}.json` : `invoice-${n}.json`;
}

export function csvFilename(today) {
  return `billing-history-${today}.csv`;
}

// ---- Import: the app's only boundary for untrusted input. Reads known keys only, with type checks. ----

const STRING_LIMITS = {
  from: 5000, seller_tin: 5000, to: 5000, client_tin: 5000, ship_to: 5000, number: 100, payment_terms: 200,
  purchase_order: 200, bir_invoice_no: 100, payment_details: 5000, notes: 5000, terms: 5000,
};
const NUMBER_FIELDS = ['discounts', 'tax', 'shipping', 'withholding_rate', 'amount_paid'];
const CANONICAL = /^(\d{1,10})(\.\d{1,4})?$/;
const ITEM_ID = /^[A-Za-z0-9-]{1,64}$/;
const FIELD_MODES = [false, '%', true];

const get = (obj, key) => (plain(obj) && own(obj, key) ? obj[key] : undefined);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);
const canonical = (v) => (typeof v === 'string' && CANONICAL.test(v) ? v : '');
const oneOf = (v, allowed) => allowed.includes(v);

function importItems(value) {
  const items = [];
  if (Array.isArray(value)) {
    for (const raw of value.slice(0, LIMITS.items)) {
      if (!plain(raw)) continue;
      const id = get(raw, 'id');
      items.push({
        id: typeof id === 'string' && ITEM_ID.test(id) ? id : globalThis.crypto.randomUUID(),
        name: str(get(raw, 'name'), 200) ?? '',
        description: str(get(raw, 'description'), 1000) ?? '',
        quantity: canonical(get(raw, 'quantity')),
        unit_cost: canonical(get(raw, 'unit_cost')),
        unit: oneOf(get(raw, 'unit'), ITEM_UNITS.map((u) => u.id)) ? get(raw, 'unit') : 'qty',
      });
    }
  }
  return items.length ? items : [newItem()];
}

function importCustomFields(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(plain).slice(0, MAX_CUSTOM_FIELDS).map((raw) => ({
    label: str(get(raw, 'label'), 100) ?? '',
    value: str(get(raw, 'value'), 500) ?? '',
  }));
}

function importLabels(value) {
  const labels = {};
  if (!plain(value)) return labels;
  for (const key of LABEL_KEYS) {
    if (own(value, key) && typeof value[key] === 'string') labels[key] = value[key].slice(0, 100);
  }
  return labels;
}

export function sanitizeImport(text) {
  if (typeof text !== 'string') throw new Error("This file isn't a valid document.");
  if (text.length > IMPORT_MAX_BYTES) throw new Error('This file is too large (1 MB max).');
  let input;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error("This file isn't a valid document.");
  }
  if (!plain(input)) throw new Error("This file isn't a valid document.");
  if (get(input, 'version') !== 1) throw new Error('This document is from an unsupported version.');

  const date = get(input, 'date');
  const doc = createDefaultDocument({ today: isIsoDate(date) ? date : '', language: 'en-US' });

  for (const [key, max] of Object.entries(STRING_LIMITS)) {
    const v = str(get(input, key), max);
    if (v !== null) doc[key] = v;
  }
  for (const key of ['date', 'due_date']) {
    const v = get(input, key);
    doc[key] = isIsoDate(v) ? v : '';
  }

  const mode = get(input, 'mode');
  if (MODES.some((m) => m.id === mode)) doc.mode = mode;
  const vat = get(input, 'vat_treatment');
  if (VAT_TREATMENTS.some((t) => t.id === vat)) doc.vat_treatment = vat;
  const currency = get(input, 'currency');
  if (typeof currency === 'string' && /^[A-Z]{3}$/.test(currency) && isSupportedCurrency(currency)) {
    doc.currency = currency;
  }
  const preset = get(input, 'withholding_preset');
  if (preset === '' || preset === CUSTOM_PRESET || WITHHOLDING_PRESETS.some((p) => p.id === preset)) {
    doc.withholding_preset = preset;
  }

  const settings = get(input, 'settings');
  const display = get(settings, 'currencyDisplay');
  if (oneOf(display, ['symbol', 'code'])) doc.settings.currencyDisplay = display;
  const locale = get(settings, 'locale');
  if (oneOf(locale, NUMBER_FORMATS)) doc.settings.locale = locale;
  const paper = get(settings, 'paper');
  if (oneOf(paper, ['A4', 'LETTER'])) doc.settings.paper = paper;

  for (const key of ['vat_exempt_note', 'form_2307_note']) {
    const v = get(input, key);
    if (typeof v === 'boolean') doc[key] = v;
  }
  const footer = get(input, 'footer');
  for (const key of ['not_bir_invoice', 'not_valid_input_tax']) {
    const v = get(footer, key);
    if (typeof v === 'boolean') doc.footer[key] = v;
  }
  const fields = get(input, 'fields');
  for (const key of ['shipping', 'withholding']) {
    const v = get(fields, key);
    if (typeof v === 'boolean') doc.fields[key] = v;
  }
  for (const key of ['discounts', 'tax']) {
    const v = get(fields, key);
    if (oneOf(v, FIELD_MODES)) doc.fields[key] = v;
  }

  for (const key of NUMBER_FIELDS) doc[key] = canonical(get(input, key));
  doc.items = importItems(get(input, 'items'));
  doc.custom_fields = importCustomFields(get(input, 'custom_fields'));
  doc.labels = importLabels(get(input, 'labels'));
  for (const key of ['logo', 'payment_qr']) {
    const v = get(input, key);
    doc[key] = checkImageDataUrl(v) ? v : null;
  }
  return doc;
}
