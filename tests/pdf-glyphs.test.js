import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMoneyFormatter } from '../public/js/currency.js';
import { findUnsupportedChars, isPdfSafeChar, sanitizeForPdf, symbolOrCode } from '../public/js/pdf-glyphs.js';

function pdfMoney(locale, currency, amount) {
  const sym = makeMoneyFormatter({ locale, currency, currencyDisplay: 'symbol' });
  const code = makeMoneyFormatter({ locale, currency, currencyDisplay: 'code' });
  return symbolOrCode(sym(amount), () => code(amount));
}

test('sanitizeForPdf swaps U+202F and strips direction marks', () => {
  assert.equal(sanitizeForPdf('1 500'), '1 500');
  assert.equal(sanitizeForPdf('a‎b‏c'), 'abc');
});

test('THB falls back to the ISO code', () => {
  const out = pdfMoney('en-US', 'THB', '1500');
  assert.ok(out.includes('THB'));
  assert.ok(!out.includes('฿'));
});

test('PHP keeps the peso sign', () => {
  assert.ok(pdfMoney('en-US', 'PHP', '1500').includes('₱'));
});

test('fr-FR EUR has no U+202F after sanitising', () => {
  const out = pdfMoney('fr-FR', 'EUR', '1500');
  assert.ok(!out.includes(' '));
  assert.ok(out.includes('€'));
});

test('findUnsupportedChars', () => {
  assert.deepEqual(findUnsupportedChars('Café 日本'), ['日', '本']);
  assert.deepEqual(findUnsupportedChars('Tiếng Việt Ωμέγα Привет'), []);
  assert.deepEqual(findUnsupportedChars('日日本'), ['日', '本']);
  assert.deepEqual(findUnsupportedChars('a b‎'), []);
});

test('isPdfSafeChar', () => {
  assert.equal(isPdfSafeChar('₱'), true);
  assert.equal(isPdfSafeChar('฿'), false);
  assert.equal(isPdfSafeChar('￥'), false);
  assert.equal(isPdfSafeChar('\n'), true);
});
