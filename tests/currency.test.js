import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  currencyList,
  decimalMark,
  groupMark,
  isoSuffix,
  isSupportedCurrency,
  makeMoneyFormatter,
  minorUnits,
  parseUserNumber,
  resolveLocale,
  roundingNote,
  toDisplayNumber,
} from '../public/js/currency.js';

const en = { decimalMark: '.', groupMark: ',', maxDecimals: 4 };
const de = { decimalMark: ',', groupMark: '.', maxDecimals: 4 };
const fr = { decimalMark: ',', groupMark: ' ', maxDecimals: 4 };

test('currencyList puts PHP first, has no duplicates and sorts the rest', () => {
  const { common, all } = currencyList();
  assert.equal(common[0].code, 'PHP');
  assert.match(common[0].label, /^PHP — /);
  const commonCodes = new Set(common.map((c) => c.code));
  assert.equal(all.some((c) => commonCodes.has(c.code)), false);
  const codes = all.map((c) => c.code);
  assert.deepEqual(codes, [...codes].sort());
  assert.equal(isSupportedCurrency('PHP'), true);
  assert.equal(isSupportedCurrency('php'), false);
});

test('minorUnits', () => {
  assert.equal(minorUnits('JPY'), 0);
  assert.equal(minorUnits('BHD'), 3);
  assert.equal(minorUnits('USD'), 2);
});

test('resolveLocale and marks', () => {
  assert.equal(resolveLocale('auto', 'de-DE'), 'de-DE');
  assert.equal(resolveLocale('auto', ''), 'en-US');
  assert.equal(resolveLocale('fr-FR', 'de-DE'), 'fr-FR');
  assert.equal(decimalMark('en-US'), '.');
  assert.equal(decimalMark('de-DE'), ',');
  assert.equal(groupMark('de-DE'), '.');
});

test('parseUserNumber en-US', () => {
  assert.deepEqual(parseUserNumber('1,500', en), { ok: false, error: 'thousands' });
  assert.deepEqual(parseUserNumber('1500.5', en), { ok: true, value: '1500.5' });
  assert.deepEqual(parseUserNumber('1.23456', en), { ok: false, error: 'decimals' });
  assert.deepEqual(parseUserNumber('', en), { ok: true, value: '' });
  assert.deepEqual(parseUserNumber('  ', en), { ok: true, value: '' });
  assert.deepEqual(parseUserNumber('007.50', en), { ok: true, value: '7.50' });
  assert.deepEqual(parseUserNumber('.5', en), { ok: true, value: '0.5' });
  assert.deepEqual(parseUserNumber('1.2.3', en), { ok: false, error: 'format' });
});

test('parseUserNumber de-DE', () => {
  assert.deepEqual(parseUserNumber('1,5', de), { ok: true, value: '1.5' });
  assert.deepEqual(parseUserNumber('1.500', de), { ok: false, error: 'thousands' });
});

test('parseUserNumber fr-FR rejects every thousands separator', () => {
  assert.deepEqual(parseUserNumber('1 500,5', fr), { ok: false, error: 'thousands' });
  assert.deepEqual(parseUserNumber('1 500', fr), { ok: false, error: 'thousands' });
  assert.deepEqual(parseUserNumber('1 500', fr), { ok: false, error: 'thousands' });
  assert.deepEqual(parseUserNumber("1'500", fr), { ok: false, error: 'thousands' });
  assert.deepEqual(parseUserNumber('1500,5', fr), { ok: true, value: '1500.5' });
});

test('parseUserNumber rejects non-numbers and negatives', () => {
  assert.deepEqual(parseUserNumber('abc', en), { ok: false, error: 'format' });
  assert.deepEqual(parseUserNumber('-5', en), { ok: false, error: 'format' });
  assert.deepEqual(parseUserNumber('.', en), { ok: false, error: 'format' });
});

test('money formatter', () => {
  const sym = makeMoneyFormatter({ locale: 'en-US', currency: 'PHP', currencyDisplay: 'symbol' });
  const out = sym('1500');
  assert.ok(out.includes('₱'));
  assert.ok(out.includes('1,500.00'));
  const code = makeMoneyFormatter({ locale: 'en-US', currency: 'PHP', currencyDisplay: 'code' });
  assert.ok(code('1500').includes('PHP'));
  assert.ok(sym('0.3333', { maxFractionDigits: 4 }).includes('0.3333'));
  assert.ok(sym('0.3333').includes('0.33') && !sym('0.3333').includes('0.3333'));
  const jpy = makeMoneyFormatter({ locale: 'en-US', currency: 'JPY', currencyDisplay: 'code' });
  assert.ok(jpy('1500').includes('1,500') && !jpy('1500').includes('.'));
});

test('roundingNote', () => {
  assert.equal(roundingNote('JPY'), 'JPY has no decimal places. Totals are rounded to whole yen.');
  assert.equal(roundingNote('BHD'), 'BHD uses 3 decimal places.');
  assert.equal(roundingNote('USD'), null);
});

test('toDisplayNumber and isoSuffix', () => {
  assert.equal(toDisplayNumber('1.5', ','), '1,5');
  assert.equal(toDisplayNumber('1.5', '.'), '1.5');
  assert.equal(toDisplayNumber('', ','), '');
  assert.equal(isoSuffix('PHP'), ' (PHP)');
});
