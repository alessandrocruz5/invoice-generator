import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTotals } from '../public/js/calc.js';
import { validate } from '../public/js/validate.js';

function item(overrides = {}) {
  return { id: 'x', name: 'Design', description: '', quantity: '1', unit_cost: '25000', ...overrides };
}

function doc(overrides = {}) {
  return {
    mode: 'ph-nonvat',
    from: 'Juan dela Cruz',
    seller_tin: '123-456-789-000',
    to: 'Acme Corp',
    client_tin: '',
    number: 'BS-0001',
    date: '2026-10-28',
    due_date: '',
    payment_terms: '',
    purchase_order: '',
    bir_invoice_no: '',
    ship_to: '',
    custom_fields: [],
    items: [item(), item({ id: 'y', name: 'Dev', unit_cost: '5000' })],
    fields: { discounts: false, tax: false, shipping: false, withholding: false },
    discounts: '',
    tax: '',
    shipping: '',
    withholding_rate: '',
    amount_paid: '',
    payment_details: '',
    notes: '',
    terms: '',
    labels: {},
    ...overrides,
  };
}

function run(d, ctx = {}) {
  return validate(d, { totals: computeTotals(d, 2), invalid: new Map(), historyNumbers: [], ...ctx });
}

const msgs = (list) => list.map((i) => i.message);
const find = (list, message) => list.find((i) => i.message === message);

test('P1 document with a seller TIN has no errors and no warnings', () => {
  const d = doc({ fields: { discounts: false, tax: false, shipping: false, withholding: true }, withholding_rate: '5' });
  const { errors, warnings } = run(d);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test('required: From, Bill To, number and date', () => {
  const { errors } = run(doc({ from: ' ', to: '', number: '', date: '' }));
  assert.deepEqual(
    errors.map((e) => [e.field, e.message]),
    [
      ['from', 'From is required.'],
      ['to', 'Bill To is required.'],
      ['number', 'Number is required.'],
      ['date', 'Date is required.'],
    ],
  );
});

test('required: a malformed date is treated as missing', () => {
  assert.ok(find(run(doc({ date: '2026-02-30' })).errors, 'Date is required.'));
});

test('a fully blank item row is ignored', () => {
  const blankRow = { id: 'b', name: '', description: '', quantity: '1', unit_cost: '0' };
  const { errors } = run(doc({ items: [item(), blankRow] }));
  assert.deepEqual(errors, []);
});

test('no named item: "Add at least one line item."', () => {
  const blankRow = { id: 'b', name: '', description: '', quantity: '1', unit_cost: '0' };
  const { errors } = run(doc({ items: [blankRow] }));
  assert.deepEqual(errors, [{ field: 'items.0.name', message: 'Add at least one line item.' }]);
});

test('a non-blank row without a name', () => {
  const { errors } = run(doc({ items: [item(), item({ id: 'z', name: '  ', unit_cost: '10' })] }));
  assert.deepEqual(find(errors, 'Enter an item name.'), { field: 'items.1.name', message: 'Enter an item name.' });
});

test('quantity: empty, zero and above the limit', () => {
  assert.deepEqual(find(run(doc({ items: [item({ quantity: '' })] })).errors, 'Enter a quantity above 0.')?.field, 'items.0.quantity');
  assert.ok(find(run(doc({ items: [item({ quantity: '0' })] })).errors, 'Enter a quantity above 0.'));
  assert.ok(find(run(doc({ items: [item({ quantity: '1000001' })] })).errors, 'Quantity can be at most 1,000,000.'));
  assert.equal(find(run(doc({ items: [item({ quantity: '1000000' })] })).errors, 'Quantity can be at most 1,000,000.'), undefined);
});

test('rate: above the limit blocks, empty is allowed', () => {
  const over = run(doc({ items: [item({ unit_cost: '1000000001' })] })).errors;
  assert.equal(find(over, 'Rate can be at most 1,000,000,000.')?.field, 'items.0.unit_cost');
  assert.equal(find(run(doc({ items: [item({ unit_cost: '1000000000' })] })).errors, 'Rate can be at most 1,000,000,000.'), undefined);
  assert.deepEqual(run(doc({ items: [item({ unit_cost: '' })] })).errors, []);
});

test('more than 100 items', () => {
  const items = Array.from({ length: 101 }, (_, i) => item({ id: `i${i}`, unit_cost: '1' }));
  const { errors } = run(doc({ items }));
  assert.deepEqual(find(errors, 'You can add up to 100 items.'), { field: null, message: 'You can add up to 100 items.' });
  assert.equal(find(run(doc({ items: items.slice(0, 100) })).errors, 'You can add up to 100 items.'), undefined);
});

test('invalid entries: thousands separators (de-DE "1.500,5" style input)', () => {
  const invalid = new Map([['items.0.unit_cost', { raw: '1.500,5', error: 'thousands' }]]);
  const { errors } = run(doc(), { invalid });
  assert.deepEqual(find(errors, 'Remove thousands separators.'), { field: 'items.0.unit_cost', message: 'Remove thousands separators.' });
});

test('invalid entries: decimals, 4 for qty/rate/money and 3 for percents', () => {
  const invalid = new Map([
    ['items.0.quantity', { raw: '1.23456', error: 'decimals' }],
    ['shipping', { raw: '1.23456', error: 'decimals' }],
    ['discounts', { raw: '1.2345', error: 'decimals' }],
    ['withholding_rate', { raw: '1.2345', error: 'decimals' }],
  ]);
  const byField = (errors) => Object.fromEntries(errors.map((e) => [e.field, e.message]));

  const asPercent = byField(run(doc({ fields: { discounts: '%', tax: false, shipping: false, withholding: true } }), { invalid }).errors);
  assert.equal(asPercent['items.0.quantity'], 'Up to 4 decimals.');
  assert.equal(asPercent.shipping, 'Up to 4 decimals.');
  assert.equal(asPercent.discounts, 'Up to 3 decimals.');
  assert.equal(asPercent.withholding_rate, 'Up to 3 decimals.');

  const asFlat = byField(run(doc({ fields: { discounts: true, tax: false, shipping: false, withholding: false } }), { invalid }).errors);
  assert.equal(asFlat.discounts, 'Up to 4 decimals.');
});

test('invalid entries: format', () => {
  const invalid = new Map([['amount_paid', { raw: 'abc', error: 'format' }]]);
  assert.deepEqual(find(run(doc(), { invalid }).errors, 'Enter a number.'), { field: 'amount_paid', message: 'Enter a number.' });
});

test('an invalid quantity is reported once, not also as "above 0"', () => {
  const invalid = new Map([['items.0.quantity', { raw: '1,5', error: 'thousands' }]]);
  const { errors } = run(doc({ items: [item({ quantity: '' })] }), { invalid });
  assert.deepEqual(msgs(errors), ['Remove thousands separators.']);
});

test('discount % outside 0-100', () => {
  const fields = { discounts: '%', tax: false, shipping: false, withholding: false };
  assert.equal(find(run(doc({ fields, discounts: '100.001' })).errors, 'Enter a rate from 0 to 100.')?.field, 'discounts');
  assert.deepEqual(run(doc({ fields, discounts: '100' })).errors, []);
  assert.deepEqual(run(doc({ fields, discounts: '' })).errors, []);
});

test('generic tax % outside 0-100', () => {
  const d = doc({ mode: 'generic', fields: { discounts: false, tax: '%', shipping: false, withholding: false }, tax: '120' });
  assert.equal(find(run(d).errors, 'Enter a rate from 0 to 100.')?.field, 'tax');
});

test('withholding rate: over 100 and empty while on', () => {
  const on = { discounts: false, tax: false, shipping: false, withholding: true };
  assert.equal(find(run(doc({ fields: on, withholding_rate: '101' })).errors, 'Enter a rate from 0 to 100.')?.field, 'withholding_rate');
  assert.equal(find(run(doc({ fields: on, withholding_rate: '' })).errors, 'Enter a rate from 0 to 100.')?.field, 'withholding_rate');
  assert.deepEqual(run(doc({ withholding_rate: '' })).errors, []);
});

test('§10: a discount above the subtotal and an amount paid above the net payable both block', () => {
  const discount = run(doc({ fields: { discounts: true, tax: false, shipping: false, withholding: false }, discounts: '30000.01' })).errors;
  assert.equal(find(discount, 'Discount is more than the subtotal.')?.field, 'discounts');

  const paid = run(doc({ amount_paid: '30000.01' })).errors;
  assert.equal(find(paid, 'Amount paid is more than the amount payable.')?.field, 'amount_paid');

  assert.deepEqual(run(doc({ amount_paid: '30000' })).errors, []);
});

test('due date before the date', () => {
  const { errors } = run(doc({ due_date: '2026-10-27' }));
  assert.deepEqual(find(errors, "Due date can't be before the date."), { field: 'due_date', message: "Due date can't be before the date." });
  assert.deepEqual(run(doc({ due_date: '2026-10-28' })).errors, []);
  assert.deepEqual(run(doc({ due_date: '' })).errors, []);
});

test('TIN 12345678 gives the TIN error; 12 and 14 digit forms pass', () => {
  const message = 'Enter a TIN like 123-456-789-000 or 123-456-789-00000.';
  assert.equal(find(run(doc({ seller_tin: '12345678' })).errors, message)?.field, 'seller_tin');
  assert.equal(find(run(doc({ client_tin: '12345678' })).errors, message)?.field, 'client_tin');
  assert.deepEqual(run(doc({ seller_tin: '123-456-789-00000', client_tin: '123-456-789-000' })).errors, []);
  assert.deepEqual(run(doc({ client_tin: '' })).errors, []);
});

test('TIN is not checked in Generic mode', () => {
  const d = doc({ mode: 'generic', seller_tin: '12345678', fields: { discounts: false, tax: false, shipping: false, withholding: false } });
  assert.deepEqual(run(d).errors, []);
});

test('warning: PH mode with an empty seller TIN', () => {
  const { errors, warnings } = run(doc({ seller_tin: '' }));
  assert.deepEqual(errors, []);
  assert.equal(find(warnings, 'Add your TIN. Clients need it to withhold tax and issue Form 2307.')?.field, 'seller_tin');
});

test('warning: an "Invoice" title in PH gives the warning and no error', () => {
  const { errors, warnings } = run(doc({ labels: { header: 'Tax Invoice' } }));
  assert.deepEqual(errors, []);
  assert.ok(
    find(warnings, 'In the Philippines, only BIR-registered invoices should be called Invoice. Keep Billing Statement unless this goes to a client abroad.'),
  );
  assert.equal(run(doc()).warnings.length, 0);
});

test('Generic with an "Invoice" title gives no title warning', () => {
  const d = doc({ mode: 'generic', labels: { header: 'INVOICE' }, custom_fields: [{ label: 'Tax ID', value: '1' }] });
  assert.deepEqual(run(d).warnings, []);
});

test('warning: Generic with tax on and no tax-ID custom field', () => {
  const taxOn = { discounts: false, tax: '%', shipping: false, withholding: false };
  const message = 'Tax-registered? Add your tax ID as a custom field.';
  const bare = doc({ mode: 'generic', fields: taxOn, tax: '12' });
  assert.deepEqual(find(run(bare).warnings, message), { field: null, message });

  const withId = doc({ mode: 'generic', fields: taxOn, tax: '12', custom_fields: [{ label: 'ABN', value: '51 824' }] });
  assert.equal(find(run(withId).warnings, message), undefined);

  const taxOff = doc({ mode: 'generic', fields: { ...taxOn, tax: false } });
  assert.equal(find(run(taxOff).warnings, message), undefined);

  const lookalike = doc({ mode: 'generic', fields: taxOn, tax: '12', custom_fields: [{ label: 'Taxi fare', value: '1' }] });
  assert.ok(find(run(lookalike).warnings, message));
});

test('warning: number already in History', () => {
  const { errors, warnings } = run(doc({ number: ' BS-0001 ' }), { historyNumbers: ['BS-0001'] });
  assert.deepEqual(errors, []);
  assert.equal(find(warnings, 'You already used this number.')?.field, 'number');
  assert.equal(find(run(doc(), { historyNumbers: ['BS-0002'] }).warnings, 'You already used this number.'), undefined);
});

test('warning: 日 in Bill To names the character', () => {
  const { errors, warnings } = run(doc({ to: '日本 Corp' }));
  assert.deepEqual(errors, []);
  assert.deepEqual(find(warnings, "Some characters (like 日) won't appear in the PDF."), {
    field: null,
    message: "Some characters (like 日) won't appear in the PDF.",
  });
});

test('warning: unsupported characters are found in items, custom fields and labels', () => {
  const w = (d) => msgs(run(d).warnings).find((m) => m.startsWith('Some characters'));
  assert.equal(w(doc({ items: [item({ description: 'ok 日' })] })), "Some characters (like 日) won't appear in the PDF.");
  assert.equal(w(doc({ custom_fields: [{ label: 'x', value: '本' }] })), "Some characters (like 本) won't appear in the PDF.");
  assert.equal(w(doc({ labels: { notes_title: '語' } })), "Some characters (like 語) won't appear in the PDF.");
  assert.equal(w(doc({ to: 'Café Ωμέγα Привет Tiếng Việt' })), undefined);
});

test('a typed minus sign U+2212 is not flagged', () => {
  const w = msgs(run(doc({ notes: 'credit −500' })).warnings);
  assert.ok(!w.some((m) => m.startsWith('Some characters')));
});

test('warning: a zero document with a named item', () => {
  const { errors, warnings } = run(doc({ items: [item({ unit_cost: '0' })] }));
  assert.deepEqual(errors, []);
  assert.deepEqual(find(warnings, 'This document totals zero.'), { field: null, message: 'This document totals zero.' });
  assert.equal(find(run(doc()).warnings, 'This document totals zero.'), undefined);
});

test('no zero warning when no item has a name', () => {
  const blankRow = { id: 'b', name: '', description: '', quantity: '1', unit_cost: '0' };
  assert.equal(find(run(doc({ items: [blankRow] })).warnings, 'This document totals zero.'), undefined);
});
