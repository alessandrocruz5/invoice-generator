import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KEYS, HISTORY_MAX, IMPORT_MAX_BYTES, getLocalStorage, createStore, toHistoryEntry, upsertHistory, historyToCsv,
  exportFilename, csvFilename, sanitizeImport,
} from '../public/js/storage.js';
import { createDefaultDocument, newItem } from '../public/js/state.js';
import { computeTotals } from '../public/js/calc.js';

const TODAY = '2026-10-29';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const CRLF = '\r\n';

class FakeStorage {
  #map = new Map();
  get length() { return this.#map.size; }
  key(i) { return [...this.#map.keys()][i] ?? null; }
  getItem(k) { return this.#map.has(k) ? this.#map.get(k) : null; }
  setItem(k, v) { this.#map.set(k, String(v)); }
  removeItem(k) { this.#map.delete(k); }
}

class ThrowingStorage {
  get length() { throw new Error('blocked'); }
  key() { throw new Error('blocked'); }
  getItem() { throw new Error('blocked'); }
  setItem() { throw new Error('blocked'); }
  removeItem() { throw new Error('blocked'); }
}

const fresh = (extra = {}) => createDefaultDocument({ today: TODAY, language: 'en-GB', ...extra });

// Every saved field set to a valid, non-default value (SPEC §3 shape plus §11 additions).
function fullDocument() {
  const doc = fresh();
  Object.assign(doc, {
    mode: 'ph-vat',
    logo: PNG,
    from: 'Ana Cruz\nQuezon City\nana@example.com',
    seller_tin: '123-456-789-00000',
    to: 'Acme Corp\nMakati',
    client_tin: '987-654-321-000',
    ship_to: 'Warehouse 3',
    number: 'BS-0042',
    date: '2026-10-28',
    payment_terms: 'Net 30',
    due_date: '2026-11-27',
    purchase_order: 'PO-77',
    bir_invoice_no: '0001234',
    custom_fields: [{ label: 'Service period', value: 'October 2026' }],
    items: [
      { id: 'a1b2c3', name: 'Design', description: 'Logo, 3 rounds', quantity: '3', unit_cost: '3333.33' },
      { id: newItem().id, name: 'Hosting', description: '', quantity: '1.5', unit_cost: '0.0001' },
    ],
    fields: { discounts: '%', tax: true, shipping: true, withholding: true },
    discounts: '10',
    tax: '25.5',
    shipping: '100',
    vat_treatment: 'zero-rated',
    vat_exempt_note: true,
    withholding_rate: '2',
    withholding_preset: 'contractor-2',
    form_2307_note: false,
    amount_paid: '5000',
    payment_details: 'GCash 0917 000 0000',
    payment_qr: PNG,
    notes: 'Thanks!',
    terms: 'Pay within 30 days.',
    footer: { not_bir_invoice: false, not_valid_input_tax: true },
    currency: 'USD',
    settings: { currencyDisplay: 'code', locale: 'fr-FR', paper: 'A4' },
    labels: { to_title: 'Client', header: 'STATEMENT OF ACCOUNT' },
  });
  return doc;
}

const imp = (obj) => sanitizeImport(JSON.stringify(obj));

// ---- store ----

test('createStore round-trips every key through a working storage', () => {
  const fake = new FakeStorage();
  const store = createStore(fake);
  assert.equal(store.available, true);
  assert.deepEqual(store.readDraft(), { ok: true, value: null });
  assert.deepEqual(store.readHistory(), { ok: true, value: [] });
  assert.deepEqual(store.readLastNumber(), { ok: true, value: '' });

  const doc = fresh();
  assert.equal(store.writeDraft(doc).ok, true);
  assert.deepEqual(store.readDraft(), { ok: true, value: doc });
  assert.equal(store.writeDefaults({ mode: 'generic' }).ok, true);
  assert.deepEqual(store.readDefaults().value, { mode: 'generic' });
  assert.equal(store.writeHistory([{ number: '1' }]).ok, true);
  assert.deepEqual(store.readHistory().value, [{ number: '1' }]);
  assert.equal(store.writeLastNumber('BS-0009').ok, true);
  assert.deepEqual(store.readLastNumber(), { ok: true, value: 'BS-0009' });
  assert.equal(fake.getItem(KEYS.lastNumber), '"BS-0009"');
  assert.equal(fake.getItem('invoicegen:probe'), null);
});

test('reads report corrupt JSON as failure, and history is always an array', () => {
  const fake = new FakeStorage();
  const store = createStore(fake);
  fake.setItem(KEYS.draft, '{not json');
  assert.equal(store.readDraft().ok, false);
  fake.setItem(KEYS.history, '{"not":"an array"}');
  assert.deepEqual(store.readHistory(), { ok: true, value: [] });
  fake.setItem(KEYS.history, 'garbage');
  assert.deepEqual(store.readHistory(), { ok: false, value: [] });
});

test('clearAll removes only invoicegen: keys', () => {
  const fake = new FakeStorage();
  const store = createStore(fake);
  store.writeDraft(fresh());
  store.writeLastNumber('BS-0001');
  fake.setItem('invoicegen:other', 'x');
  fake.setItem('someone-else', 'keep');
  assert.equal(store.clearAll().ok, true);
  assert.equal(fake.length, 1);
  assert.equal(fake.getItem('someone-else'), 'keep');
});

test('a throwing storage is unavailable and no method throws', () => {
  for (const storage of [new ThrowingStorage(), null]) {
    const store = createStore(storage);
    assert.equal(store.available, false);
    assert.equal(store.readDraft().ok, false);
    assert.equal(store.writeDraft(fresh()).ok, false);
    assert.equal(store.readDefaults().ok, false);
    assert.equal(store.writeDefaults({}).ok, false);
    assert.deepEqual(store.readHistory(), { ok: false, value: [] });
    assert.equal(store.writeHistory([]).ok, false);
    assert.equal(store.readLastNumber().ok, false);
    assert.equal(store.writeLastNumber('1').ok, false);
    assert.equal(store.clearAll().ok, false);
  }
});

test('a quota error on write reports failure', () => {
  const fake = new FakeStorage();
  const store = createStore(fake);
  fake.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.equal(store.writeDraft(fresh()).ok, false);
});

test('getLocalStorage returns a working storage, or null when access throws', () => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    const fake = new FakeStorage();
    Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true, writable: true });
    assert.equal(getLocalStorage(), fake);
    Object.defineProperty(globalThis, 'localStorage', { value: new ThrowingStorage(), configurable: true });
    assert.equal(getLocalStorage(), null);
    Object.defineProperty(globalThis, 'localStorage', { get() { throw new Error('SecurityError'); }, configurable: true });
    assert.equal(getLocalStorage(), null);
  } finally {
    if (desc) Object.defineProperty(globalThis, 'localStorage', desc);
    else delete globalThis.localStorage;
  }
});

// ---- history ----

test('toHistoryEntry drops images and adds totals and saved_at', () => {
  const doc = fullDocument();
  const totals = computeTotals(doc, 2);
  const entry = toHistoryEntry(doc, totals, '2026-10-29T10:00:00.000Z');
  assert.equal(entry.logo, null);
  assert.equal(entry.payment_qr, null);
  assert.deepEqual(entry.totals, totals);
  assert.equal(entry.saved_at, '2026-10-29T10:00:00.000Z');
  assert.equal(entry.to, doc.to);
  assert.equal(doc.logo, PNG, 'the source document is untouched');
});

test('upsertHistory replaces the same number, keeps newest first and caps at 50', () => {
  let list = [];
  for (let i = 1; i <= HISTORY_MAX; i++) list = upsertHistory(list, { number: `BS-${i}` });
  assert.equal(list.length, HISTORY_MAX);
  assert.equal(list[0].number, `BS-${HISTORY_MAX}`);
  assert.equal(list.at(-1).number, 'BS-1');

  list = upsertHistory(list, { number: ' BS-10 ', v: 2 });
  assert.equal(list.length, HISTORY_MAX);
  assert.deepEqual(list[0], { number: ' BS-10 ', v: 2 });
  assert.equal(list.filter((e) => e.number.trim() === 'BS-10').length, 1);

  list = upsertHistory(list, { number: 'BS-51' });
  assert.equal(list.length, HISTORY_MAX);
  assert.equal(list[0].number, 'BS-51');
  assert.ok(!list.some((e) => e.number === 'BS-1'), 'the oldest entry is dropped');
});

// ---- CSV ----

const HEADER = '"Number","BIR Invoice No.","Date","Client","Client TIN","Currency","Subtotal","Discount","VAT or tax",'
  + '"Withholding","Net amount payable","Amount paid","Balance due"';

function p2Entry() {
  const doc = fresh({ makeId: () => 'x' });
  Object.assign(doc, {
    mode: 'ph-vat',
    number: 'BS-0002',
    bir_invoice_no: '0099',
    to: '\n  Acme Corp  \nMakati',
    client_tin: '987-654-321-000',
    items: [{ id: 'x', name: 'Work', description: '', quantity: '3', unit_cost: '3333.33' }],
    fields: { discounts: '%', tax: '%', shipping: false, withholding: true },
    discounts: '10',
    vat_treatment: 'vatable',
    withholding_rate: '2',
    amount_paid: '5000',
  });
  return toHistoryEntry(doc, computeTotals(doc, 2), '2026-10-29T00:00:00.000Z');
}

test('CSV: BOM, exact header, CRLF and quoted fields', () => {
  const csv = historyToCsv([]);
  assert.ok(csv.startsWith('﻿'));
  assert.equal(csv, `﻿${HEADER}${CRLF}`);
});

test('CSV: P2 amounts are canonical strings and VAT shows for ph-vat', () => {
  const lines = historyToCsv([p2Entry()]).slice(1).split(CRLF);
  assert.equal(lines.length, 3);
  assert.equal(lines[2], '');
  assert.equal(lines[1], [
    'BS-0002', '0099', TODAY, 'Acme Corp', '987-654-321-000', 'PHP',
    '9999.99', '1000.00', '1080.00', '180.00', '9899.99', '5000.00', '4899.99',
  ].map((s) => `"${s}"`).join(','));
});

test('CSV: VAT or tax is tax in generic and empty in ph-nonvat', () => {
  const entry = p2Entry();
  const generic = { ...entry, mode: 'generic', totals: { ...entry.totals, tax: '12.34' } };
  const nonvat = { ...entry, mode: 'ph-nonvat' };
  const cells = (e) => historyToCsv([e]).split(CRLF)[1].split(',');
  assert.equal(cells(generic)[8], '"12.34"');
  assert.equal(cells(nonvat)[8], '""');
});

test('CSV: formula injection is neutralised in text cells only', () => {
  const entry = { ...p2Entry(), to: '=HYPERLINK("x")', number: '+1', bir_invoice_no: '-2', client_tin: '@3' };
  const row = historyToCsv([entry]).split(CRLF)[1];
  assert.ok(row.startsWith(`"'+1","'-2","${TODAY}","'=HYPERLINK(""x"")","'@3",`));
  assert.ok(historyToCsv([{ ...entry, number: '\tx' }]).split(CRLF)[1].startsWith(`"'\tx",`));
  assert.ok(historyToCsv([{ ...entry, number: '\rx' }]).split(CRLF)[1].startsWith(`"'\rx",`));
  const negative = { ...entry, totals: { ...entry.totals, balance: '-100.00' } };
  assert.ok(historyToCsv([negative]).split(CRLF)[1].endsWith('"-100.00"'));
});

// ---- filenames ----

test('exportFilename and csvFilename', () => {
  assert.equal(exportFilename(fresh()), 'billing-statement-BS-0001.json');
  assert.equal(exportFilename({ ...fresh(), mode: 'generic', number: '1' }), 'invoice-1.json');
  assert.equal(exportFilename({ ...fresh(), number: 'A/B\\C:D*E?F"G<H>I|J K' }), 'billing-statement-A-B-C-D-E-F-G-H-I-J-K.json');
  assert.equal(csvFilename(TODAY), 'billing-history-2026-10-29.csv');
});

// ---- sanitizeImport ----

test('import: a full valid document round-trips unchanged', () => {
  const doc = fullDocument();
  assert.deepEqual(sanitizeImport(JSON.stringify(doc)), doc);
  const generic = { ...fresh(), mode: 'generic', number: '7', fields: { discounts: false, tax: '%', shipping: false, withholding: false } };
  assert.deepEqual(imp(generic), generic);
});

test('import: markup in text is kept verbatim as a string', () => {
  const payload = '<img src=x onerror=alert(1)>';
  assert.equal(imp({ ...fresh(), to: payload }).to, payload);
});

test('import: __proto__ never pollutes', () => {
  const doc = sanitizeImport('{"version":1,"__proto__":{"polluted":true}}');
  assert.equal(({}).polluted, undefined);
  assert.equal(doc.polluted, undefined);
  assert.equal(Object.getPrototypeOf(doc), Object.prototype);

  const withLabels = sanitizeImport('{"version":1,"labels":{"__proto__":"x","to_title":"Client","bogus":"y"}}');
  assert.deepEqual(withLabels.labels, { to_title: 'Client' });
  assert.equal(Object.getPrototypeOf(withLabels.labels), Object.prototype);

  const nested = sanitizeImport('{"version":1,"settings":{"__proto__":{"paper":"A4"}},"items":[{"__proto__":{"name":"x"}}]}');
  assert.equal(nested.settings.paper, 'LETTER');
  assert.equal(nested.items[0].name, '');
  assert.equal(({}).paper, undefined);
});

test('import: unknown keys are dropped', () => {
  const doc = imp({ ...fresh(), evil: 1, constructor: { prototype: { x: 1 } } });
  assert.equal(Object.hasOwn(doc, 'evil'), false);
  assert.equal(Object.hasOwn(doc, 'constructor'), false);
  assert.deepEqual(Object.keys(doc).sort(), Object.keys(fresh()).sort());
});

test('import: rejections carry user messages', () => {
  assert.throws(() => imp({ ...fresh(), version: 2 }), { message: 'This document is from an unsupported version.' });
  assert.throws(() => imp({ ...fresh(), version: '1' }), { message: 'This document is from an unsupported version.' });
  assert.throws(() => imp([fresh()]), { message: "This file isn't a valid document." });
  assert.throws(() => sanitizeImport('null'), { message: "This file isn't a valid document." });
  assert.throws(() => sanitizeImport('{"version":1,'), { message: "This file isn't a valid document." });
  assert.throws(() => sanitizeImport(undefined), { message: "This file isn't a valid document." });
  assert.throws(() => sanitizeImport(' '.repeat(IMPORT_MAX_BYTES + 1)), { message: 'This file is too large (1 MB max).' });
  assert.doesNotThrow(() => sanitizeImport(JSON.stringify({ version: 1 }).padEnd(IMPORT_MAX_BYTES, ' ')));
});

test('import: images must be PNG or JPEG data URLs', () => {
  assert.equal(imp({ version: 1, logo: 'javascript:alert(1)' }).logo, null);
  assert.equal(imp({ version: 1, logo: 'data:image/svg+xml;base64,PHN2Zy8+' }).logo, null);
  assert.equal(imp({ version: 1, payment_qr: 'https://example.com/qr.png' }).payment_qr, null);
  assert.equal(imp({ version: 1, payment_qr: { src: PNG } }).payment_qr, null);
  assert.equal(imp({ version: 1, logo: PNG }).logo, PNG);
});

test('import: numbers must be canonical strings', () => {
  const doc = imp({
    version: 1,
    items: [{ quantity: '1e9', unit_cost: 5 }, { quantity: '0.5', unit_cost: '12345678901' }],
    discounts: '-5',
    tax: '1,5',
    shipping: '10.12345',
    withholding_rate: '2',
    amount_paid: 100,
  });
  assert.deepEqual(doc.items.map((i) => [i.quantity, i.unit_cost]), [['', ''], ['0.5', '']]);
  assert.equal(doc.discounts, '');
  assert.equal(doc.tax, '');
  assert.equal(doc.shipping, '');
  assert.equal(doc.withholding_rate, '2');
  assert.equal(doc.amount_paid, '');
});

test('import: enums fall back to defaults', () => {
  const doc = imp({
    version: 1,
    mode: 'evil',
    vat_treatment: 'none',
    currency: 'php',
    withholding_preset: 'made-up',
    settings: { currencyDisplay: 'name', locale: 'xx-XX', paper: 'A3' },
    fields: { discounts: 'yes', tax: 1, shipping: 'true', withholding: 1 },
    footer: { not_bir_invoice: 'no' },
    vat_exempt_note: 'true',
  });
  assert.equal(doc.mode, 'ph-nonvat');
  assert.equal(doc.vat_treatment, 'vatable');
  assert.equal(doc.currency, 'PHP');
  assert.equal(doc.withholding_preset, '');
  assert.deepEqual(doc.settings, { currencyDisplay: 'symbol', locale: 'auto', paper: 'LETTER' });
  assert.deepEqual(doc.fields, { discounts: false, tax: '%', shipping: false, withholding: false });
  assert.equal(doc.footer.not_bir_invoice, true);
  assert.equal(doc.vat_exempt_note, false);
  assert.equal(imp({ version: 1, currency: 'ZZZ' }).currency, 'PHP');
  assert.equal(imp({ version: 1, withholding_preset: 'custom' }).withholding_preset, 'custom');
});

test('import: dates must be real ISO dates', () => {
  const doc = imp({ version: 1, date: '2026-02-30', due_date: '28/10/2026' });
  assert.equal(doc.date, '');
  assert.equal(doc.due_date, '');
  assert.equal(imp({ version: 1, date: '2026-10-28' }).date, '2026-10-28');
});

test('import: items are capped, ids checked, and an empty list gets one blank item', () => {
  const many = Array.from({ length: 150 }, (_, i) => ({ id: `i${i}`, name: `n${i}`, quantity: '1', unit_cost: '1' }));
  const doc = imp({ version: 1, items: many });
  assert.equal(doc.items.length, 100);
  assert.equal(doc.items[99].id, 'i99');

  const odd = imp({ version: 1, items: [{ id: 'bad id!', name: 'x'.repeat(300), description: 'd'.repeat(1200) }, 'str', null] });
  assert.equal(odd.items.length, 1);
  assert.match(odd.items[0].id, /^[0-9a-f-]{36}$/);
  assert.equal(odd.items[0].name.length, 200);
  assert.equal(odd.items[0].description.length, 1000);

  for (const items of [[], 'nope', undefined]) {
    const blank = imp({ version: 1, items });
    assert.equal(blank.items.length, 1);
    assert.deepEqual({ ...blank.items[0], id: '' }, { id: '', name: '', description: '', quantity: '1', unit_cost: '0' });
  }
});

test('import: strings, custom fields and labels are truncated and type-checked', () => {
  const doc = imp({
    version: 1,
    from: 'f'.repeat(6000),
    number: 'n'.repeat(150),
    payment_terms: 't'.repeat(250),
    to: 42,
    custom_fields: [
      ...Array.from({ length: 8 }, (_, i) => ({ label: `L${i}`, value: `V${i}` })),
    ],
    labels: { to_title: 'x'.repeat(150), date_title: 7 },
  });
  assert.equal(doc.from.length, 5000);
  assert.equal(doc.number.length, 100);
  assert.equal(doc.payment_terms.length, 200);
  assert.equal(doc.to, '');
  assert.equal(doc.custom_fields.length, 6);
  assert.deepEqual(doc.custom_fields[0], { label: 'L0', value: 'V0' });
  assert.deepEqual(doc.labels, { to_title: 'x'.repeat(100) });

  const cf = imp({ version: 1, custom_fields: [null, { label: 'a'.repeat(200), value: 3, extra: 1 }] });
  assert.deepEqual(cf.custom_fields, [{ label: 'a'.repeat(100), value: '' }]);
});
