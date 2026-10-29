import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../public/', import.meta.url).pathname;

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

const files = walk(ROOT);
const js = files.filter((f) => f.endsWith('.js'));
const html = files.filter((f) => f.endsWith('.html'));

function scan(list, re) {
  const hits = [];
  for (const f of list) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (re.test(line)) hits.push(`${f}:${i + 1}`);
    });
  }
  return hits;
}

test('js has no HTML injection or dynamic code', () => {
  const hits = scan(js, /\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML|document\.write|\beval\s*\(|new\s+Function\b/);
  assert.deepEqual(hits, []);
});

test('html has no inline scripts', () => {
  const hits = scan(html, /<script(?![^>]*\bsrc=)/i);
  assert.deepEqual(hits, []);
});

test('html has no style elements', () => {
  assert.deepEqual(scan(html, /<style/i), []);
});

test('html has no style attributes', () => {
  assert.deepEqual(scan(html, /\sstyle\s*=/i), []);
});

test('html has no inline event handlers', () => {
  assert.deepEqual(scan(html, /\son[a-z]+\s*=/i), []);
});
