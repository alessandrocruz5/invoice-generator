// The saved document shape, default labels, migration and small helpers. Pure: no DOM, no storage.
import { DEFAULT_MODE, modeConfig } from './modes.js';
import { DEFAULT_CURRENCY } from './currency.js';
import { todayIso } from './dates.js';
import { nextNumber } from './numbering.js';

export const DOC_VERSION = 1;
export const MAX_CUSTOM_FIELDS = 6;
export const MAX_IMAGE_BYTES = 500 * 1024;

export const DEFAULT_LABELS = {
  header: null,
  to_title: 'Bill To',
  ship_to_title: 'Ship To',
  client_tin_title: 'TIN',
  date_title: 'Date',
  payment_terms_title: 'Payment Terms',
  due_date_title: 'Due Date',
  purchase_order_title: 'PO Number',
  bir_invoice_title: 'BIR Invoice No.',
  item_header: 'Item',
  quantity_header: 'Qty / Hrs',
  unit_header: 'Unit',
  unit_cost_header: 'Rate',
  amount_header: 'Amount',
  subtotal_title: 'Subtotal',
  discounts_title: 'Discount',
  tax_title: 'Tax',
  vat_title: 'VAT 12%',
  shipping_title: 'Shipping',
  total_title: 'Total',
  withholding_title: 'Less: Withholding Tax',
  net_payable_title: 'Net Amount Payable',
  amount_paid_title: 'Amount Paid',
  balance_title: 'Balance Due',
  notes_title: 'Notes',
  terms_title: 'Terms',
  payment_title: 'Payment Details',
};
export const LABEL_KEYS = Object.keys(DEFAULT_LABELS);
export const ITEM_UNITS = [{ id: 'qty', label: 'Qty' }, { id: 'hours', label: 'Hours' }];

// What "Save as default" keeps (SPEC §6). `fields.withholding` is the one nested key.
export const DEFAULT_KEYS = [
  'mode', 'from', 'seller_tin', 'logo', 'payment_details', 'payment_qr', 'custom_fields', 'currency', 'settings',
  'labels', 'notes', 'terms', 'withholding_preset', 'withholding_rate', 'fields.withholding', 'form_2307_note', 'footer',
];

const LETTER_LOCALES = ['en-us', 'en-ca', 'en-ph', 'es-mx'];

const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function cloneDoc(doc) {
  return structuredClone(doc);
}

function defaultLabelText(doc, key) {
  if (key === 'header') return modeConfig(doc.mode).defaultTitle;
  return own(DEFAULT_LABELS, key) ? DEFAULT_LABELS[key] : undefined;
}

export function labelFor(doc, key) {
  const labels = doc.labels;
  if (plain(labels) && own(labels, key) && typeof labels[key] === 'string') return labels[key];
  return defaultLabelText(doc, key);
}

export function setLabel(doc, key, text) {
  if (!plain(doc.labels)) doc.labels = {};
  if (text === defaultLabelText(doc, key)) delete doc.labels[key];
  else doc.labels[key] = text;
}

export function newItem(makeId = () => globalThis.crypto.randomUUID()) {
  return { id: makeId(), name: '', description: '', quantity: '1', unit_cost: '0', unit: 'qty' };
}

export function isBlankItem(item) {
  const empty = (v) => String(v ?? '').trim() === '';
  const qty = String(item.quantity ?? '').trim();
  const cost = String(item.unit_cost ?? '').trim();
  return empty(item.name) && empty(item.description) && (qty === '' || qty === '1') && (cost === '' || cost === '0');
}

export function defaultPaper(language) {
  return LETTER_LOCALES.includes(String(language || '').toLowerCase()) ? 'LETTER' : 'A4';
}

function baseDocument({ today, paper, mode = DEFAULT_MODE }) {
  return {
    version: DOC_VERSION,
    mode,
    logo: null,
    from: '',
    seller_tin: '',
    to: '',
    client_tin: '',
    ship_to: '',
    number: modeConfig(mode).firstNumber,
    date: today,
    payment_terms: '',
    due_date: '',
    purchase_order: '',
    bir_invoice_no: '',
    custom_fields: [],
    items: [],
    fields: { discounts: false, tax: '%', shipping: false, withholding: false },
    discounts: '',
    tax: '',
    shipping: '',
    vat_treatment: 'vatable',
    vat_exempt_note: false,
    withholding_rate: '',
    withholding_preset: '',
    form_2307_note: true,
    amount_paid: '',
    payment_details: '',
    payment_qr: null,
    notes: '',
    terms: '',
    footer: { not_bir_invoice: true, not_valid_input_tax: false },
    currency: DEFAULT_CURRENCY,
    settings: { currencyDisplay: 'symbol', locale: 'auto', paper },
    labels: {},
  };
}

export function createDefaultDocument({ today = todayIso(), language, defaults = null, lastNumber = '', makeId } = {}) {
  const doc = baseDocument({ today, paper: defaultPaper(language) });
  if (plain(defaults)) {
    const saved = cloneDoc(defaults);
    for (const key of DEFAULT_KEYS) {
      if (key === 'fields.withholding') {
        if (plain(saved.fields) && own(saved.fields, 'withholding')) doc.fields.withholding = saved.fields.withholding;
      } else if (own(saved, key)) {
        doc[key] = saved[key];
      }
    }
  }
  doc.number = nextNumber(lastNumber) || modeConfig(doc.mode).firstNumber;
  doc.items = [makeId ? newItem(makeId) : newItem()];
  return doc;
}

export function pickDefaults(doc) {
  const out = {};
  for (const key of DEFAULT_KEYS) {
    if (key === 'fields.withholding') out.fields = { withholding: doc.fields.withholding };
    else out[key] = doc[key];
  }
  return cloneDoc(out);
}

// Upgrades or fills a trusted saved draft. Not a sanitiser: untrusted input goes through storage.sanitizeImport.
export function migrate(obj) {
  if (!plain(obj) || obj.version !== DOC_VERSION) throw new Error('Unsupported document version.');
  const saved = cloneDoc(obj);
  const today = typeof saved.date === 'string' && saved.date ? saved.date : todayIso();
  const base = baseDocument({ today, paper: 'A4', mode: saved.mode });
  const doc = {};
  for (const key of Object.keys(base)) {
    const fallback = base[key];
    if (!own(saved, key) || saved[key] === undefined) doc[key] = fallback;
    else if (plain(fallback)) doc[key] = { ...fallback, ...(plain(saved[key]) ? saved[key] : {}) };
    else doc[key] = saved[key];
  }
  if (!Array.isArray(doc.items) || doc.items.length === 0) doc.items = [newItem()];
  for (const item of doc.items) {
    if (plain(item) && !ITEM_UNITS.some((u) => u.id === item.unit)) item.unit = 'qty';
  }
  return doc;
}

const DATA_URL = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+=*)$/;
const MAGIC = {
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpeg: [0xff, 0xd8, 0xff],
};

export function checkImageDataUrl(dataUrl, maxBytes = MAX_IMAGE_BYTES) {
  if (typeof dataUrl !== 'string') return false;
  const match = DATA_URL.exec(dataUrl);
  if (!match) return false;
  const [, type, b64] = match;
  if (b64.length > Math.ceil(maxBytes / 3) * 4 + 4) return false;
  let bytes;
  try {
    bytes = atob(b64);
  } catch {
    return false;
  }
  if (bytes.length > maxBytes) return false;
  const magic = MAGIC[type];
  return magic.every((b, i) => bytes.charCodeAt(i) === b);
}
