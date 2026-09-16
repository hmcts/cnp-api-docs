import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { validateSpec } from '../bin/validate-specs.mjs';

function fixture(contents) {
  const dir = mkdtempSync(join(tmpdir(), 'spec-'));
  mkdirSync(join(dir, 'docs', 'specs'), { recursive: true });
  const path = join(dir, 'docs', 'specs', 'fixture.json');
  writeFileSync(path, contents);
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function check(contents) {
  const { path, cleanup } = fixture(contents);
  try {
    return validateSpec(path);
  } finally {
    cleanup();
  }
}

test('accepts an OpenAPI 3 spec with paths', () => {
  const r = check('{"openapi":"3.1.0","paths":{"/a":{}}}');
  assert.equal(r.valid, true);
  assert.equal(r.version, '3.1.0');
  assert.equal(r.paths, 1);
  assert.equal(r.warning, undefined);
});

test('accepts a legacy Swagger 2.0 spec', () => {
  const r = check('{"swagger":"2.0","paths":{"/a":{},"/b":{}}}');
  assert.equal(r.valid, true);
  assert.equal(r.version, '2.0');
  assert.equal(r.paths, 2);
});

test('warns but stays valid when a real spec declares no paths', () => {
  const r = check('{"openapi":"3.1.0","paths":{}}');
  assert.equal(r.valid, true);
  assert.equal(r.warning, 'no paths defined');
});

// The regression that went unnoticed for three years: publishers write an
// empty file when the spec fetch fails.
test('rejects an empty file', () => {
  const r = check('');
  assert.equal(r.valid, false);
  assert.equal(r.reason, 'empty');
});

test('rejects a one-byte newline file', () => {
  const r = check('\n');
  assert.equal(r.valid, false);
  assert.equal(r.reason, 'empty');
  assert.equal(r.bytes, 1);
});

test('rejects truncated JSON', () => {
  const r = check('{"openapi":"3.1.0",');
  assert.equal(r.valid, false);
  assert.equal(r.reason, 'unparseable');
});

test('rejects valid JSON that is not a spec', () => {
  const r = check('{"foo":1}');
  assert.equal(r.valid, false);
  assert.equal(r.reason, 'not-a-spec');
});

test('reports unreadable when the file is missing', () => {
  const r = validateSpec('docs/specs/definitely-not-here.json');
  assert.equal(r.valid, false);
  assert.equal(r.reason, 'unreadable');
});
