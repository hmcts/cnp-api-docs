#!/usr/bin/env node
// Validates OpenAPI specs in docs/specs/ and classifies each one.
//
// Publishers push straight to master and the bot bypasses branch protection,
// so this cannot gate ingest. It runs after the fact and reports; the workflow
// decides what to revert.
//
// Usage:
//   validate-specs.mjs                 validate every spec, print a report
//   validate-specs.mjs <file>...        validate only these files
//   validate-specs.mjs --json          machine-readable output
//
// Exit codes: 0 all valid, 1 at least one invalid, 2 bad usage.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

const SPEC_DIR = 'docs/specs';

// Written by Jenkins publishers when TRAVIS_REPO_SLUG is unset and the target
// path collapses to bare ".json". Never a real spec.
const IGNORED = new Set(['.json']);

export function validateSpec(path) {
  const name = basename(path);
  const result = { file: path, name };

  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    return { ...result, valid: false, reason: 'unreadable', detail: err.message };
  }

  result.bytes = Buffer.byteLength(raw);

  if (raw.trim() === '') {
    return { ...result, valid: false, reason: 'empty' };
  }

  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (err) {
    return { ...result, valid: false, reason: 'unparseable', detail: err.message };
  }

  const version = doc.openapi ?? doc.swagger;
  if (!version) {
    return { ...result, valid: false, reason: 'not-a-spec', detail: 'no openapi or swagger key' };
  }

  if (!doc.paths || Object.keys(doc.paths).length === 0) {
    // Real but empty — a few service specs legitimately expose no paths, so
    // this is a warning, not a failure.
    return { ...result, valid: true, version, paths: 0, warning: 'no paths defined' };
  }

  return { ...result, valid: true, version, paths: Object.keys(doc.paths).length };
}

function listSpecs() {
  return readdirSync(SPEC_DIR)
    .filter((f) => f.endsWith('.json') && !IGNORED.has(f))
    .map((f) => join(SPEC_DIR, f));
}

function main(argv) {
  const asJson = argv.includes('--json');
  const explicit = argv.filter((a) => !a.startsWith('--'));

  let targets;
  if (explicit.length > 0) {
    // Skip paths that no longer exist (a deletion in the pushed range) and
    // anything outside the spec dir.
    targets = explicit.filter((p) => {
      if (!p.includes(SPEC_DIR) || IGNORED.has(basename(p))) return false;
      try {
        return statSync(p).isFile();
      } catch {
        return false;
      }
    });
  } else {
    targets = listSpecs();
  }

  const results = targets.map(validateSpec);
  const invalid = results.filter((r) => !r.valid);

  if (asJson) {
    console.log(JSON.stringify({ total: results.length, invalid, results }, null, 2));
  } else {
    for (const r of invalid) {
      console.error(`INVALID ${r.name}: ${r.reason}${r.detail ? ` — ${r.detail}` : ''} (${r.bytes ?? 0} bytes)`);
    }
    for (const r of results.filter((r) => r.warning)) {
      console.warn(`WARN    ${r.name}: ${r.warning}`);
    }
    console.log(`\n${results.length - invalid.length}/${results.length} specs valid`);
  }

  return invalid.length === 0 ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
