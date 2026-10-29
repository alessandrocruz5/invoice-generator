import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextNumber } from '../public/js/numbering.js';

test('nextNumber increments the last digit run', () => {
  const cases = [
    ['BS-0009', 'BS-0010'],
    ['2026-099', '2026-100'],
    ['INV-9', 'INV-10'],
    ['BS-0001', 'BS-0002'],
    ['A12B', 'A13B'],
    ['999', '1000'],
    ['DRAFT', ''],
    ['', ''],
    ['BS-99999999999999999999', 'BS-100000000000000000000'],
  ];
  for (const [input, expected] of cases) assert.equal(nextNumber(input), expected, input);
});
