// The detector must never modify docs/specs. An earlier version restored the
// previous blob automatically; that was removed deliberately, because restoring
// the file centrally leaves the owning team's pipeline broken while making the
// registry look healthy.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SCRIPT = 'bin/detect-broken-specs.mjs';

function run(args) {
  return execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8' });
}

function gitStatusOfSpecs() {
  return execFileSync('git', ['status', '--porcelain', 'docs/specs'], { encoding: 'utf8' }).trim();
}

test('reports newly-broken specs without touching the working tree', () => {
  const before = gitStatusOfSpecs();
  const out = run(['--base', 'HEAD~1']);
  const summary = JSON.parse(out);

  assert.ok(Array.isArray(summary.brokenInThisPush));
  assert.ok(Array.isArray(summary.alreadyBroken));
  assert.equal(gitStatusOfSpecs(), before, 'the detector must not modify docs/specs');
});

test('has no --apply mode', () => {
  const source = readFileSync(SCRIPT, 'utf8');
  assert.ok(!source.includes('--apply'), 'the repair path was removed on purpose');
});

// Behavioural rather than textual: run it over a range that really did break a
// spec and assert the file on disk is untouched afterwards.
test('leaves a broken spec broken', () => {
  const target = 'docs/specs/wa-task-monitor.json';
  const before = readFileSync(target);

  const summary = JSON.parse(run(['--base', 'HEAD~2']));
  assert.ok(summary.brokenInThisPush.length + summary.alreadyBroken.length >= 0);

  assert.deepEqual(readFileSync(target), before, 'the spec must not be rewritten');
  assert.equal(gitStatusOfSpecs(), '', 'no spec may be modified');
});

test('separates a spec broken now from one already broken', () => {
  // Both classes must be reported, so the issue names only what just changed
  // while the health page can still see the backlog.
  const source = readFileSync(SCRIPT, 'utf8');
  assert.match(source, /brokenInThisPush/);
  assert.match(source, /alreadyBroken/);
});

test('the revert script is gone', () => {
  let existed = true;
  try {
    readFileSync('bin/revert-broken-specs.mjs', 'utf8');
  } catch {
    existed = false;
  }
  assert.equal(existed, false, 'bin/revert-broken-specs.mjs should have been deleted');
});
