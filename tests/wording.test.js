import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APPROVED_SENTENCES, BANNED_PHRASES, DISCLAIMER } from '../public/js/copy.js';

const ROOT = new URL('../public/', import.meta.url).pathname;
const EXTS = ['.html', '.js', '.css', '.svg', '.json', '.txt', '.webmanifest'];

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (p === join(ROOT, 'vendor')) continue;
      out.push(...walk(p));
    } else out.push(p);
  }
  return out;
}

function normalise(s) {
  return s
    .replace(/&#39;|&rsquo;|&apos;|’/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

function scanText(text) {
  let t = normalise(text);
  for (const s of APPROVED_SENTENCES) t = t.split(normalise(s)).join(' ');
  return BANNED_PHRASES.filter((p) => {
    const re = new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[ -]/g, '[ -]'), 'i');
    return re.test(t);
  });
}

test('no banned wording in public files', () => {
  const copyPath = join(ROOT, 'js', 'copy.js');
  const problems = [];
  for (const f of walk(ROOT)) {
    if (f === copyPath || !EXTS.some((x) => f.endsWith(x))) continue;
    for (const p of scanText(readFileSync(f, 'utf8'))) problems.push(`${f}: "${p}"`);
  }
  assert.deepEqual(problems, []);
});

test('self-test: approved sentence passes, extra banned phrase fails', () => {
  assert.deepEqual(scanText(`<p>${DISCLAIMER}</p>`), []);
  assert.deepEqual(scanText(`${DISCLAIMER} official receipt`), ['official receipt']);
});
