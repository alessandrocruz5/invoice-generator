import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTin, isValidTin, tinDigits } from '../public/js/tin.js';

test('isValidTin accepts 12- and 14-digit TINs and empty', () => {
  assert.equal(isValidTin('123-456-789-000'), true);
  assert.equal(isValidTin('123-456-789-00000'), true);
  assert.equal(isValidTin(''), true);
});

test('isValidTin rejects bad lengths and shapes', () => {
  assert.equal(isValidTin('12345678'), false);
  assert.equal(isValidTin('123-456-78'), false);
  assert.equal(isValidTin('1234567890123'), false);
  assert.equal(isValidTin('123-456-789-0000'), false);
  assert.equal(isValidTin('123456789000'), false);
});

test('formatTin groups as typed', () => {
  assert.equal(formatTin('123456789'), '123-456-789');
  assert.equal(formatTin('12345678900000'), '123-456-789-00000');
  assert.equal(formatTin('1234'), '123-4');
  assert.equal(formatTin('123 456 789 000'), '123-456-789-000');
  assert.equal(formatTin(''), '');
});

test('formatTin drops digits beyond 14', () => {
  assert.equal(formatTin('1234567890000099'), '123-456-789-00000');
});

test('tinDigits keeps digits only', () => {
  assert.equal(tinDigits('123-456 789'), '123456789');
});
