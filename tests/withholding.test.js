import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WITHHOLDING_PRESETS, CUSTOM_PRESET, presetById, helperText } from '../public/js/withholding.js';

test('seven presets with unique ids', () => {
  assert.equal(WITHHOLDING_PRESETS.length, 7);
  assert.equal(new Set(WITHHOLDING_PRESETS.map((p) => p.id)).size, 7);
  assert.equal(CUSTOM_PRESET, 'custom');
});

test('presetById', () => {
  assert.equal(presetById('rent-5').rate, '5');
  assert.equal(presetById('nope'), null);
  assert.equal(presetById(CUSTOM_PRESET), null);
});

test('helperText only for prof-ind-5', () => {
  assert.equal(
    helperText('prof-ind-5'),
    "5% applies only if you've given this client a sworn declaration. Without one, they'll withhold 10%.",
  );
  for (const p of WITHHOLDING_PRESETS.filter((x) => x.id !== 'prof-ind-5')) assert.equal(helperText(p.id), null);
  assert.equal(helperText(''), null);
});
