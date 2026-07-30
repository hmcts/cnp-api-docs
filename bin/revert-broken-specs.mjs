#!/usr/bin/env node
// Restores specs that a publisher has just broken.
//
// Publishers push straight to master and bypass branch protection, so we cannot
// stop a bad spec landing. Instead we detect one narrow, unambiguous case and
// undo it:
//
//   the previous blob at this path parsed as a spec, and the new one does not
//
// There is no legitimate reason for a spec to go from valid to unparseable, so
// reverting is safe. Anything else (a spec that was already broken, a brand-new
// broken spec, a deletion) is left alone and reported instead — we do not want
// to resurrect files a team meant to remove.
//
// Usage:
//   revert-broken-specs.mjs --base <sha> [--apply]
//
// Without --apply it only reports, so the workflow can run it on pull requests.
// Writes a JSON summary to stdout for the workflow to consume.

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';

import { validateSpec } from './validate-specs.mjs';

const SPEC_DIR = 'docs/specs';
const IGNORED = new Set(['.json']);

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function changedSpecs(base, head) {
  // Only additions and modifications; a deletion is a deliberate act.
  const out = git('diff', '--name-only', '--diff-filter=AM', `${base}..${head}`, '--', SPEC_DIR);
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.endsWith('.json') && !IGNORED.has(basename(l)));
}

function blobAt(ref, path) {
  try {
    return git('show', `${ref}:${path}`);
  } catch {
    return null; // did not exist at that ref
  }
}

function parses(text) {
  if (text == null || text.trim() === '') return false;
  try {
    const doc = JSON.parse(text);
    return Boolean(doc.openapi ?? doc.swagger);
  } catch {
    return false;
  }
}

function main(argv) {
  const baseIdx = argv.indexOf('--base');
  if (baseIdx === -1 || !argv[baseIdx + 1]) {
    console.error('usage: revert-broken-specs.mjs --base <sha> [--apply]');
    return 2;
  }
  const base = argv[baseIdx + 1];
  const head = 'HEAD';
  const apply = argv.includes('--apply');

  const reverted = [];
  const stillBroken = [];

  for (const path of changedSpecs(base, head)) {
    const current = validateSpec(path);
    if (current.valid) continue;

    const previous = blobAt(base, path);

    if (!parses(previous)) {
      // Either newly added and broken, or broken before this push. Not ours to
      // undo — there is no known-good state to go back to.
      stillBroken.push({ path, reason: current.reason, hadPrevious: previous != null });
      continue;
    }

    if (apply) writeFileSync(path, previous);
    reverted.push({ path, reason: current.reason, restoredBytes: Buffer.byteLength(previous) });
  }

  const summary = { base, applied: apply, reverted, stillBroken };
  if (process.env.GITHUB_OUTPUT) {
    writeFileSync(
      process.env.GITHUB_OUTPUT,
      `reverted_count=${reverted.length}\nbroken_count=${stillBroken.length}\n`,
      { flag: 'a' },
    );
  }
  console.log(JSON.stringify(summary, null, 2));
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}

export { parses, changedSpecs };
