#!/usr/bin/env node
// Reports specs that a publisher has just broken. Does not repair them.
//
// An earlier version restored the previous blob automatically. That was dropped:
// master requires a pull request and neither GITHUB_TOKEN nor
// SWAGGER_PUBLISHER_API_TOKEN can bypass that from Actions, so the repair could
// only ever arrive as a pull request needing a human click. More importantly,
// restoring the old file hides the problem — the spec on master goes back to
// describing an older version of the API, the owning team's pipeline is still
// broken, and nobody has to notice. A broken spec that stays broken is a
// truthful signal.
//
// Usage: detect-broken-specs.mjs --base <sha>

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
    return null;
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
    console.error('usage: detect-broken-specs.mjs --base <sha>');
    return 2;
  }
  const base = argv[baseIdx + 1];

  // A spec that went from parsing to not parsing in this push. Distinguished from
  // one that was already broken, so the issue names only what just changed.
  const brokenInThisPush = [];
  const alreadyBroken = [];

  for (const path of changedSpecs(base, 'HEAD')) {
    const current = validateSpec(path);
    if (current.valid) continue;

    const previous = blobAt(base, path);
    const entry = { path, reason: current.reason };

    if (parses(previous)) {
      brokenInThisPush.push({ ...entry, previousBytes: Buffer.byteLength(previous) });
    } else {
      alreadyBroken.push(entry);
    }
  }

  const summary = { base, brokenInThisPush, alreadyBroken };

  if (process.env.GITHUB_OUTPUT) {
    writeFileSync(
      process.env.GITHUB_OUTPUT,
      `broken_count=${brokenInThisPush.length}\nalready_broken_count=${alreadyBroken.length}\n`,
      { flag: 'a' },
    );
  }

  console.log(JSON.stringify(summary, null, 2));
  for (const b of brokenInThisPush) {
    console.error(`::warning file=${b.path}::${b.path} was published broken (${b.reason})`);
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}

export { parses, changedSpecs };
