import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LIMITS,
  parseDecimal,
  roundHalfUp,
  formatScaled,
  compareDecimal,
  isZero,
  computeTotals,
} from '../public/js/calc.js';

function doc(overrides = {}) {
  return {
    mode: 'generic',
    items: [],
    fields: { discounts: false, tax: false, shipping: false, withholding: false },
    discounts: '',
    tax: '',
    shipping: '',
    vat_treatment: '',
    withholding_rate: '',
    amount_paid: '',
    ...overrides,
  };
}

function items(...pairs) {
  return pairs.map(([quantity, unit_cost], i) => ({ id: `i${i}`, name: '', description: '', quantity, unit_cost }));
}

function fields(overrides) {
  return { discounts: false, tax: false, shipping: false, withholding: false, ...overrides };
}

function assertSubset(actual, expected) {
  for (const [k, v] of Object.entries(expected)) assert.deepEqual(actual[k], v, k);
}

test('P1: ph-nonvat with 5% withholding', () => {
  const t = computeTotals(
    doc({ mode: 'ph-nonvat', items: items(['1', '25000'], ['1', '5000']), fields: fields({ withholding: true }), withholding_rate: '5' }),
    2,
  );
  assertSubset(t, { total: '30000.00', withholding: '1500.00', netPayable: '28500.00' });
});

test('P2: ph-vat vatable with discount, withholding and payment', () => {
  const t = computeTotals(
    doc({
      mode: 'ph-vat',
      items: items(['3', '3333.33']),
      fields: fields({ discounts: '%', withholding: true }),
      discounts: '10',
      vat_treatment: 'vatable',
      withholding_rate: '2',
      amount_paid: '5000',
    }),
    2,
  );
  assertSubset(t, {
    subtotal: '9999.99',
    discount: '1000.00',
    net: '8999.99',
    vat: '1080.00',
    total: '10079.99',
    withholding: '180.00',
    netPayable: '9899.99',
    balance: '4899.99',
  });
});

test('P3: ph-vat zero-rated', () => {
  const t = computeTotals(doc({ mode: 'ph-vat', items: items(['1', '1200']), vat_treatment: 'zero-rated' }), 2);
  assertSubset(t, { vat: '0.00', total: '1200.00' });
});

test('P4: ph-nonvat with flat discount and 10% withholding', () => {
  const t = computeTotals(
    doc({
      mode: 'ph-nonvat',
      items: items(['12.5', '800']),
      fields: fields({ discounts: true, withholding: true }),
      discounts: '500',
      withholding_rate: '10',
    }),
    2,
  );
  assertSubset(t, { subtotal: '10000.00', net: '9500.00', withholding: '950.00', netPayable: '8550.00' });
});

test('V1: generic with % discount, % tax, shipping and payment', () => {
  const t = computeTotals(
    doc({
      items: items(['2', '1500'], ['1', '999.99'], ['3', '0.3333']),
      fields: fields({ discounts: '%', tax: '%', shipping: true }),
      discounts: '10',
      tax: '12',
      shipping: '150',
      amount_paid: '1000',
    }),
    2,
  );
  assertSubset(t, { subtotal: '4000.99', discount: '400.10', tax: '432.11', total: '4183.00', balance: '3183.00' });
});

test('V2: generic JPY (0 places)', () => {
  const t = computeTotals(doc({ items: items(['3', '333.5']), fields: fields({ tax: '%' }), tax: '10' }), 0);
  assertSubset(t, { amounts: ['1001'], tax: '100', total: '1101' });
});

test('V3: generic BHD (3 places)', () => {
  const t = computeTotals(doc({ items: items(['1', '10.0005']), fields: fields({ tax: '%' }), tax: '10' }), 3);
  assertSubset(t, { amounts: ['10.001'], tax: '1.000', total: '11.001' });
});

test('V4: generic USD half-up on amounts', () => {
  const t = computeTotals(doc({ items: items(['1', '1.005'], ['3', '0.1']) }), 2);
  assertSubset(t, { amounts: ['1.01', '0.30'], total: '1.31' });
});

test('V5: generic EUR flat discount, flat tax, shipping', () => {
  const t = computeTotals(
    doc({
      items: items(['10', '45']),
      fields: fields({ discounts: true, tax: true, shipping: true }),
      discounts: '50',
      tax: '76',
      shipping: '12.50',
    }),
    2,
  );
  assertSubset(t, { subtotal: '450.00', total: '488.50' });
});

test('V6: generic USD flat discount, 8.875% tax', () => {
  const t = computeTotals(
    doc({ items: items(['4', '19.99']), fields: fields({ discounts: true, tax: '%' }), discounts: '5', tax: '8.875' }),
    2,
  );
  assertSubset(t, { subtotal: '79.96', tax: '6.65', total: '81.61' });
});

test('ph-nonvat ignores vat_treatment, tax and shipping', () => {
  const t = computeTotals(
    doc({
      mode: 'ph-nonvat',
      items: items(['1', '1000']),
      fields: fields({ tax: '%', shipping: true }),
      tax: '12',
      shipping: '100',
      vat_treatment: 'vatable',
    }),
    2,
  );
  assertSubset(t, { vat: '0.00', tax: '0.00', shipping: '0.00', total: '1000.00' });
});

test('ph-vat ignores tax and shipping', () => {
  const t = computeTotals(
    doc({
      mode: 'ph-vat',
      items: items(['1', '1000']),
      fields: fields({ tax: true, shipping: true }),
      tax: '50',
      shipping: '100',
      vat_treatment: 'exempt',
    }),
    2,
  );
  assertSubset(t, { vat: '0.00', tax: '0.00', shipping: '0.00', total: '1000.00' });
});

test('generic ignores vat_treatment', () => {
  const t = computeTotals(doc({ items: items(['1', '1000']), vat_treatment: 'vatable' }), 2);
  assertSubset(t, { vat: '0.00', total: '1000.00' });
});

test('empty items list gives zero everywhere', () => {
  const t = computeTotals(doc(), 2);
  assert.deepEqual(t, {
    amounts: [],
    subtotal: '0.00',
    discount: '0.00',
    net: '0.00',
    vat: '0.00',
    tax: '0.00',
    shipping: '0.00',
    total: '0.00',
    withholding: '0.00',
    netPayable: '0.00',
    amountPaid: '0.00',
    balance: '0.00',
  });
});

test('invalid strings count as 0 without throwing', () => {
  for (const bad of ['1,500', 'abc', '1.2.3']) {
    const t = computeTotals(
      doc({
        items: items([bad, '10'], ['1', bad]),
        fields: fields({ discounts: '%', tax: true, shipping: true, withholding: true }),
        discounts: bad,
        tax: bad,
        shipping: bad,
        withholding_rate: bad,
        amount_paid: bad,
      }),
      2,
    );
    assertSubset(t, { amounts: ['0.00', '0.00'], subtotal: '0.00', total: '0.00', balance: '0.00' });
  }
});

test('discount above subtotal gives a negative net', () => {
  const t = computeTotals(doc({ items: items(['1', '10']), fields: fields({ discounts: true }), discounts: '15' }), 2);
  assertSubset(t, { discount: '15.00', net: '-5.00', total: '-5.00' });
});

test('flat amounts accept 4 decimals and round half up', () => {
  const t = computeTotals(
    doc({ items: items(['1', '100']), fields: fields({ shipping: true }), shipping: '1.005', amount_paid: '0.0049' }),
    2,
  );
  assertSubset(t, { shipping: '1.01', amountPaid: '0.00', total: '101.01' });
});

test('max magnitude stays exact', () => {
  const many = Array.from({ length: LIMITS.items }, () => [LIMITS.quantity, LIMITS.rate]);
  const t = computeTotals(doc({ items: items(...many) }), 2);
  assert.equal(t.subtotal, '100000000000000000.00');
});

test('roundHalfUp', () => {
  assert.equal(roundHalfUp(1005n, 3, 2), 101n);
  assert.equal(roundHalfUp(1004n, 3, 2), 100n);
  assert.equal(roundHalfUp(-1005n, 3, 2), -101n);
  assert.equal(roundHalfUp(-1004n, 3, 2), -100n);
  assert.equal(roundHalfUp(15n, 1, 3), 1500n);
});

test('parseDecimal', () => {
  assert.equal(parseDecimal('1.23456', 4), null);
  assert.deepEqual(parseDecimal('.5', 4), { value: 5000n, places: 4 });
  assert.deepEqual(parseDecimal('12.5', 4), { value: 125000n, places: 4 });
  assert.deepEqual(parseDecimal('7', 0), { value: 7n, places: 0 });
  for (const bad of ['', '1.', '-1', '1,500', '1e3', ' 1', undefined, null, 5]) assert.equal(parseDecimal(bad, 4), null);
});

test('formatScaled', () => {
  assert.equal(formatScaled(123450n, 2), '1234.50');
  assert.equal(formatScaled(5n, 2), '0.05');
  assert.equal(formatScaled(-500n, 2), '-5.00');
  assert.equal(formatScaled(1001n, 0), '1001');
  assert.equal(formatScaled(0n, 3), '0.000');
});

test('compareDecimal and isZero', () => {
  assert.equal(compareDecimal('1.5', '1.50'), 0);
  assert.equal(compareDecimal('10', '9.99'), 1);
  assert.equal(compareDecimal('-5.00', '0'), -1);
  assert.equal(compareDecimal('', '0.00'), 0);
  assert.equal(compareDecimal('0.001', ''), 1);
  assert.equal(isZero(''), true);
  assert.equal(isZero('0.000'), true);
  assert.equal(isZero('0.01'), false);
  assert.equal(isZero('-0.01'), false);
});

test('calc.js uses no float APIs', () => {
  const src = readFileSync(new URL('../public/js/calc.js', import.meta.url), 'utf8');
  for (const banned of ['parseFloat', 'Number(', 'toFixed', 'Math.']) assert.equal(src.includes(banned), false, banned);
});
