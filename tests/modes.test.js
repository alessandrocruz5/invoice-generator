import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTotals } from '../public/js/calc.js';
import { MODES, DEFAULT_MODE, modeConfig, totalsRows } from '../public/js/modes.js';

const DEFAULTS = {
  subtotal_title: 'Subtotal',
  discounts_title: 'Discount',
  tax_title: 'Tax',
  shipping_title: 'Shipping',
  total_title: 'Total',
  amount_paid_title: 'Amount Paid',
  balance_title: 'Balance Due',
  vat_title: 'VAT 12%',
  withholding_title: 'Less: Withholding Tax',
  net_payable_title: 'Net Amount Payable',
};
const label = (k) => DEFAULTS[k];
const keys = (rows) => rows.map((r) => r.key);

function doc(overrides = {}) {
  return {
    mode: 'ph-nonvat',
    items: [
      { id: 'a', name: 'A', description: '', quantity: '1', unit_cost: '25000' },
      { id: 'b', name: 'B', description: '', quantity: '1', unit_cost: '5000' },
    ],
    fields: { discounts: false, tax: false, shipping: false, withholding: false },
    discounts: '',
    tax: '',
    shipping: '',
    vat_treatment: 'vatable',
    vat_exempt_note: false,
    withholding_rate: '',
    amount_paid: '',
    ...overrides,
  };
}
const rowsFor = (d) => totalsRows(d, computeTotals(d, 2), label);

test('non-VAT never yields a vat row, even with stale vatable treatment and non-zero totals.vat', () => {
  const d = doc();
  const totals = { ...computeTotals(d, 2), vat: '3600.00' };
  assert.ok(!keys(totalsRows(d, totals, label)).includes('vat'));
  const withNote = doc({ vat_exempt_note: true });
  const rows = totalsRows(withNote, totals, label);
  assert.ok(!keys(rows).includes('vat'));
  const note = rows.find((r) => r.key === 'vatExemptNote');
  assert.equal(note.label, 'VAT-exempt sale');
  assert.equal(note.value, null);
});

test('ph-vat zero-rated yields Zero-rated sale with 0.00', () => {
  const rows = rowsFor(doc({ mode: 'ph-vat', vat_treatment: 'zero-rated' }));
  const vat = rows.find((r) => r.key === 'vat');
  assert.equal(vat.label, 'Zero-rated sale');
  assert.equal(vat.value, '0.00');
});

test('ph-vat labels', () => {
  assert.equal(rowsFor(doc({ mode: 'ph-vat' })).find((r) => r.key === 'vat').label, 'VAT 12%');
  assert.equal(rowsFor(doc({ mode: 'ph-vat', vat_treatment: 'exempt' })).find((r) => r.key === 'vat').label, 'VAT-exempt sale');
});

test('P1 shape order and withholding label', () => {
  const d = doc({ fields: { discounts: false, tax: false, shipping: false, withholding: true }, withholding_rate: '5' });
  const rows = rowsFor(d);
  assert.deepEqual(keys(rows), ['subtotal', 'total', 'withholding', 'netPayable', 'balance']);
  const w = rows.find((r) => r.key === 'withholding');
  assert.equal(w.label, 'Less: Withholding Tax (5%)');
  assert.equal(w.value, '1500.00');
  assert.equal(w.negative, true);
  assert.equal(rows.find((r) => r.key === 'netPayable').value, '28500.00');
  const bal = rows.at(-1);
  assert.deepEqual([bal.iso, bal.emphasis], [true, true]);
  assert.equal(rows.find((r) => r.key === 'total').iso, true);
});

test('generic full order', () => {
  const d = doc({
    mode: 'generic',
    fields: { discounts: '%', tax: '%', shipping: true, withholding: true },
    discounts: '10',
    tax: '12',
    shipping: '150',
    withholding_rate: '2',
    amount_paid: '1000',
  });
  const rows = rowsFor(d);
  assert.deepEqual(keys(rows), [
    'subtotal', 'discount', 'tax', 'shipping', 'total', 'withholding', 'netPayable', 'amountPaid', 'balance',
  ]);
  assert.equal(rows[1].label, 'Discount (10%)');
  assert.equal(rows[1].negative, true);
  assert.equal(rows[2].label, 'Tax (12%)');
  assert.equal(rows.find((r) => r.key === 'amountPaid').value, '1000.00');
});

test('generic flat discount/tax have no percent suffix; tax off hides row', () => {
  const rows = rowsFor(doc({ mode: 'generic', fields: { discounts: true, tax: true, shipping: false, withholding: false }, discounts: '5', tax: '7' }));
  assert.equal(rows.find((r) => r.key === 'discount').label, 'Discount');
  assert.equal(rows.find((r) => r.key === 'tax').label, 'Tax');
  assert.ok(!keys(rowsFor(doc({ mode: 'generic' }))).includes('tax'));
});

test('netPayable absent without withholding; amountPaid absent at 0', () => {
  const rows = rowsFor(doc({ amount_paid: '0' }));
  assert.deepEqual(keys(rows), ['subtotal', 'total', 'balance']);
});

test('PH modes never show tax or shipping rows', () => {
  const d = doc({ mode: 'ph-vat', fields: { discounts: false, tax: '%', shipping: true, withholding: false }, tax: '12', shipping: '10' });
  assert.deepEqual(keys(rowsFor(d)), ['subtotal', 'vat', 'total', 'balance']);
});

test('modeConfig', () => {
  assert.equal(DEFAULT_MODE, 'ph-nonvat');
  assert.equal(MODES.length, 3);
  const ph = modeConfig('ph-nonvat');
  assert.deepEqual([ph.defaultTitle, ph.numberPrefix, ph.firstNumber, ph.sellerTinPrefix], ['BILLING STATEMENT', 'BS-', 'BS-0001', 'Non-VAT Reg. TIN']);
  assert.equal(ph.show.vatExemptNote, true);
  assert.equal(ph.show.vat, false);
  assert.equal(modeConfig('ph-vat').sellerTinPrefix, 'VAT Reg. TIN');
  assert.equal(modeConfig('ph-vat').show.vat, true);
  const g = modeConfig('generic');
  assert.deepEqual([g.defaultTitle, g.numberPrefix, g.firstNumber, g.sellerTinPrefix, g.isPh], ['INVOICE', '', '1', null, false]);
  assert.equal(g.show.shipTo, true);
  assert.equal(g.customFieldPresets.length, 5);
  assert.deepEqual(modeConfig('bogus'), modeConfig(DEFAULT_MODE));
});
