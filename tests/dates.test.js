import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  todayIso,
  isIsoDate,
  addDays,
  parseNetTerms,
  compareIso,
  formatDate,
} from '../public/js/dates.js';

test('formatDate is calendar-stable in any TZ', () => {
  const s = formatDate('2026-10-28', 'en-US');
  assert.match(s, /28/);
  assert.match(s, /Oct/);
  assert.match(s, /2026/);
  assert.equal(s, 'Oct 28, 2026');
  assert.equal(formatDate('nope', 'en-US'), '');
});

test('TZ guard: day unchanged under the current TZ', () => {
  console.log(`TZ=${process.env.TZ ?? '(unset)'}`);
  assert.equal(addDays('2026-10-28', 0), '2026-10-28');
  assert.match(formatDate('2026-10-28', 'en-US'), /28/);
  assert.equal(addDays('2026-03-08', 1), '2026-03-09');
});

test('todayIso uses local calendar date', () => {
  assert.equal(todayIso(new Date(2026, 0, 1, 0, 30)), '2026-01-01');
  assert.equal(todayIso(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
});

test('addDays crosses months, years and leap days', () => {
  assert.equal(addDays('2026-10-28', 30), '2026-11-27');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('bad', 1), '');
});

test('isIsoDate is strict', () => {
  assert.equal(isIsoDate('2026-10-28'), true);
  assert.equal(isIsoDate('2028-02-29'), true);
  assert.equal(isIsoDate('2026-02-29'), false);
  assert.equal(isIsoDate('2026-13-01'), false);
  assert.equal(isIsoDate('2026-1-1'), false);
  assert.equal(isIsoDate(''), false);
});

test('parseNetTerms', () => {
  assert.equal(parseNetTerms('Net 30'), 30);
  assert.equal(parseNetTerms('NET15'), 15);
  assert.equal(parseNetTerms('due on receipt'), null);
  assert.equal(parseNetTerms(''), null);
});

test('compareIso', () => {
  assert.equal(compareIso('2026-01-01', '2026-01-02'), -1);
  assert.equal(compareIso('2026-01-02', '2026-01-01'), 1);
  assert.equal(compareIso('2026-01-01', '2026-01-01'), 0);
});

test('source guard: no new Date(string)', () => {
  const src = readFileSync(new URL('../public/js/dates.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /new Date\(\s*['"`]/);
});
