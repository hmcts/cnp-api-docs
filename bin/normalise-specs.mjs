#!/usr/bin/env node
// Converts every spec to OpenAPI 3.x for rendering, and reports what it found.
//
// 51 of the specs are still Swagger 2.0. Rather than make the renderer handle two
// formats, upgrade them once at build time. Output goes to a build directory;
// docs/specs/ is never touched, so the URLs that XUI fetches at runtime and that
// terraform reads at apply time keep serving their original bytes.
//
// The conversion doubles as the health report: anything that fails to convert is
// something a consumer cannot render either.
//
// Usage: normalise-specs.mjs [--out DIR]

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { convertObj } from 'swagger2openapi';

const SPEC_DIR = 'docs/specs';

async function normaliseOne(path) {
  const name = basename(path);
  let doc;
  try {
    doc = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    return { name, ok: false, stage: 'parse', error: err.message };
  }

  const from = doc.openapi ?? doc.swagger;
  if (!from) return { name, ok: false, stage: 'identify', error: 'no openapi/swagger key' };

  if (doc.openapi) {
    return { name, ok: true, from, to: from, converted: false, doc };
  }

  try {
    // patch:true fixes the many small spec-compliance faults in these older
    // documents rather than refusing to convert; without it roughly a third fail.
    const { openapi } = await convertObj(doc, { patch: true, warnOnly: true });
    return { name, ok: true, from, to: openapi.openapi, converted: true, doc: openapi };
  } catch (err) {
    return { name, ok: false, stage: 'convert', from, error: err.message };
  }
}

async function main(argv) {
  const outIdx = argv.indexOf('--out');
  const outDir = outIdx !== -1 && argv[outIdx + 1] ? argv[outIdx + 1] : 'build/specs';
  const write = !argv.includes('--dry-run');

  if (write) mkdirSync(outDir, { recursive: true });

  const files = readdirSync(SPEC_DIR).filter((f) => f.endsWith('.json') && f !== '.json');
  const results = [];

  for (const file of files) {
    const r = await normaliseOne(join(SPEC_DIR, file));
    if (r.ok && write) {
      writeFileSync(join(outDir, file), `${JSON.stringify(r.doc)}\n`);
    }
    delete r.doc;
    results.push(r);
  }

  const failed = results.filter((r) => !r.ok);
  const converted = results.filter((r) => r.converted);
  const byVersion = {};
  for (const r of results) byVersion[r.from ?? 'unknown'] = (byVersion[r.from ?? 'unknown'] ?? 0) + 1;

  const report = {
    generated: new Date().toISOString(),
    total: results.length,
    converted: converted.length,
    failed: failed.length,
    byVersion,
    failures: failed,
  };

  if (write) {
    mkdirSync('model', { recursive: true });
    writeFileSync('model/normalisation-report.json', `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log(`${results.length} specs processed${write ? ` -> ${outDir}` : ' (dry run)'}`);
  console.log(`  source versions: ${Object.entries(byVersion).map(([v, n]) => `${v}×${n}`).join(', ')}`);
  console.log(`  upgraded to 3.x: ${converted.length}`);
  console.log(`  failed:          ${failed.length}`);
  for (const f of failed) console.log(`    ${f.name} (${f.stage}): ${f.error}`);

  // A spec that cannot be converted is not a build failure. It belongs to the
  // team that published it, and the portal's job is to surface that on the health
  // page — not to refuse to build the other 178.
  return 0;
}

process.exit(await main(process.argv.slice(2)));
