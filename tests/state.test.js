import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOC_VERSION, DEFAULT_LABELS, LABEL_KEYS, DEFAULT_KEYS, MAX_IMAGE_BYTES,
  labelFor, setLabel, newItem, isBlankItem, defaultPaper, createDefaultDocument, pickDefaults, migrate,
  checkImageDataUrl, cloneDoc,
} from '../public/js/state.js';

const TODAY = '2026-10-29';
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PNG = `data:image/png;base64,${PNG_B64}`;

const fresh = (extra = {}) => createDefaultDocument({ today: TODAY, language: 'en-GB', ...extra });

test('defaults', () => {
  const doc = fresh();
  assert.equal(doc.version, DOC_VERSION);
  assert.equal(doc.mode, 'ph-nonvat');
  assert.equal(doc.currency, 'PHP');
  assert.equal(doc.number, 'BS-0001');
  assert.equal(doc.date, TODAY);
  assert.equal(doc.vat_treatment, 'vatable');
  assert.equal(doc.withholding_preset, '');
  assert.equal(doc.items.length, 1);
  assert.ok(isBlankItem(doc.items[0]));
});

test('every label key has a default, and header is per mode', () => {
  assert.ok(LABEL_KEYS.includes('ship_to_title'));
  assert.equal(DEFAULT_LABELS.withholding_title, 'Less: Withholding Tax');
  assert.equal(labelFor(fresh(), 'header'), 'BILLING STATEMENT');
});

test('defaultPaper', () => {
  assert.equal(defaultPaper('en-PH'), 'LETTER');
  assert.equal(defaultPaper('EN-us'), 'LETTER');
  assert.equal(defaultPaper('es-MX'), 'LETTER');
  assert.equal(defaultPaper('en-GB'), 'A4');
  assert.equal(defaultPaper(undefined), 'A4');
  assert.equal(createDefaultDocument({ today: TODAY, language: 'en-PH' }).settings.paper, 'LETTER');
});

test('labels store only overrides', () => {
  const doc = fresh({ defaults: { mode: 'generic' } });
  assert.equal(labelFor(doc, 'header'), 'INVOICE');
  setLabel(doc, 'to_title', 'Bill To');
  assert.deepEqual(doc.labels, {});
  setLabel(doc, 'to_title', 'Client');
  assert.equal(labelFor(doc, 'to_title'), 'Client');
  assert.equal(labelFor(migrate(doc), 'to_title'), 'Client');
  setLabel(doc, 'to_title', 'Bill To');
  assert.deepEqual(doc.labels, {});
});

test('header label follows the mode unless customised', () => {
  const doc = fresh();
  setLabel(doc, 'header', 'BILLING STATEMENT');
  assert.deepEqual(doc.labels, {});
  doc.mode = 'generic';
  assert.equal(labelFor(doc, 'header'), 'INVOICE');
  doc.mode = 'ph-nonvat';
  setLabel(doc, 'header', 'STATEMENT OF ACCOUNT');
  assert.equal(doc.labels.header, 'STATEMENT OF ACCOUNT');
  doc.mode = 'generic';
  assert.equal(labelFor(doc, 'header'), 'STATEMENT OF ACCOUNT');
});

test('labelFor ignores inherited and non-string overrides', () => {
  const doc = fresh();
  doc.labels = { to_title: 5 };
  assert.equal(labelFor(doc, 'to_title'), 'Bill To');
  assert.equal(labelFor(doc, 'toString'), undefined);
});

test('next number from lastNumber', () => {
  assert.equal(fresh({ lastNumber: 'BS-0001' }).number, 'BS-0002');
  assert.equal(fresh({ lastNumber: 'DRAFT' }).number, 'BS-0001');
});

test('defaults overlay only DEFAULT_KEYS', () => {
  const doc = fresh({
    defaults: { mode: 'generic', seller_tin: '123-456-789-00000', to: 'Client', number: 'X-9', date: '2000-01-01', fields: { withholding: true, discounts: '%' } },
    lastNumber: '41',
  });
  assert.equal(doc.mode, 'generic');
  assert.equal(doc.seller_tin, '123-456-789-00000');
  assert.equal(doc.to, '');
  assert.equal(doc.date, TODAY);
  assert.equal(doc.number, '42');
  assert.equal(doc.fields.withholding, true);
  assert.equal(doc.fields.discounts, false);
  assert.equal(fresh({ defaults: { mode: 'generic' } }).number, '1');
});

test('pickDefaults keeps only DEFAULT_KEYS and deep-copies', () => {
  const doc = fresh();
  doc.from = 'Me';
  doc.to = 'Client';
  doc.fields.withholding = true;
  doc.custom_fields = [{ label: 'a', value: 'b' }];
  const picked = pickDefaults(doc);
  assert.equal(picked.from, 'Me');
  assert.equal('to' in picked, false);
  assert.deepEqual(picked.fields, { withholding: true });
  assert.equal(Object.keys(picked).length, DEFAULT_KEYS.length);
  picked.custom_fields[0].label = 'changed';
  assert.equal(doc.custom_fields[0].label, 'a');
  assert.equal(fresh({ defaults: picked }).from, 'Me');
});

test('isBlankItem', () => {
  assert.equal(isBlankItem(newItem()), true);
  assert.equal(isBlankItem({ name: ' ', description: '', quantity: '', unit_cost: '' }), true);
  assert.equal(isBlankItem({ ...newItem(), name: 'Work' }), false);
  assert.equal(isBlankItem({ ...newItem(), quantity: '2' }), false);
  assert.equal(isBlankItem({ ...newItem(), unit_cost: '5' }), false);
  assert.equal(newItem(() => 'abc').id, 'abc');
  assert.notEqual(newItem().id, newItem().id);
});

test('migrate', () => {
  assert.throws(() => migrate({ version: 2 }), /Unsupported document version\./);
  assert.throws(() => migrate(null), /Unsupported document version\./);
  const doc = fresh();
  delete doc.withholding_preset;
  delete doc.vat_treatment;
  delete doc.footer.not_valid_input_tax;
  const out = migrate(doc);
  assert.equal(out.withholding_preset, '');
  assert.equal(out.vat_treatment, 'vatable');
  assert.equal(out.footer.not_valid_input_tax, false);
  assert.equal(out.date, TODAY);
  const full = fresh({ makeId: () => 'x' });
  assert.deepEqual(migrate(full), full);
});

test('migrate keeps known values, drops unknown keys, and does not mutate input', () => {
  const doc = fresh();
  doc.from = 'Me';
  doc.extra = 'nope';
  doc.settings.paper = 'LETTER';
  doc.labels = { to_title: 'Client' };
  const before = JSON.stringify(doc);
  const out = migrate(doc);
  assert.equal(JSON.stringify(doc), before);
  assert.equal(out.from, 'Me');
  assert.equal('extra' in out, false);
  assert.equal(out.settings.paper, 'LETTER');
  assert.deepEqual(out.labels, { to_title: 'Client' });
  assert.equal(out.items.length, 1);
  delete doc.items;
  assert.equal(migrate(doc).items.length, 1);
});

test('cloneDoc is deep', () => {
  const doc = fresh();
  const copy = cloneDoc(doc);
  copy.items[0].name = 'x';
  assert.equal(doc.items[0].name, '');
});

test('checkImageDataUrl', () => {
  assert.equal(checkImageDataUrl(PNG), true);
  assert.equal(checkImageDataUrl(PNG.replace('image/png', 'image/jpeg')), false);
  assert.equal(checkImageDataUrl(`data:image/svg+xml;base64,${PNG_B64}`), false);
  assert.equal(checkImageDataUrl(`data:image/gif;base64,${PNG_B64}`), false);
  assert.equal(checkImageDataUrl(PNG, 10), false);
  assert.equal(checkImageDataUrl('data:image/png;base64,'), false);
  assert.equal(checkImageDataUrl('data:image/png;base64,@@@@'), false);
  assert.equal(checkImageDataUrl(null), false);
  const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]).toString('base64')}`;
  assert.equal(checkImageDataUrl(jpeg), true);
  const big = `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(MAX_IMAGE_BYTES)]).toString('base64')}`;
  assert.equal(checkImageDataUrl(big), false);
});
