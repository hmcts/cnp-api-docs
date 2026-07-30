#!/usr/bin/env node
// Assembles the deployable site: the built Astro output plus the spec files.
//
// The spec copy is the single riskiest step in the whole replatform. These exact
// URLs are fetched at runtime by rpx-xui-webapp, asserted on by CCD and HMC
// acceptance tests, and read by terraform at apply time. They must come out the
// other side byte-for-byte identical, so every file is hashed before and after
// and any mismatch fails the build rather than deploying.
//
// Usage: assemble-site.mjs [--out DIR]

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, copyFileSync, mkdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SPEC_DIR = 'docs/specs';
const NORMALISED_DIR = 'build/specs';
const SITE_DIR = 'build/site';

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = join(from, entry.name);
    const dst = join(to, entry.name);
    if (entry.isDirectory()) copyTree(src, dst);
    else copyFileSync(src, dst);
  }
}

function main(argv) {
  const outIdx = argv.indexOf('--out');
  const out = outIdx !== -1 && argv[outIdx + 1] ? argv[outIdx + 1] : 'build/dist';

  for (const dir of [SITE_DIR, NORMALISED_DIR]) {
    if (!existsSync(dir)) {
      console.error(`missing ${dir} — run \`yarn build-site\` first`);
      return 2;
    }
  }

  copyTree(SITE_DIR, out);

  // Original publisher bytes, at the URL every consumer already uses.
  const specTarget = join(out, 'specs');
  mkdirSync(specTarget, { recursive: true });

  // The bare ".json" is written by publishers that cannot resolve a repo slug.
  const files = readdirSync(SPEC_DIR).filter((f) => f.endsWith('.json') && f !== '.json');
  const mismatches = [];

  for (const file of files) {
    const src = join(SPEC_DIR, file);
    if (!statSync(src).isFile()) continue;
    const dst = join(specTarget, file);
    const before = sha256(src);
    copyFileSync(src, dst);
    const after = sha256(dst);
    if (before !== after) mismatches.push({ file, before, after });
  }

  // Normalised copies for the renderer only. Never referenced by consumers.
  copyTree(NORMALISED_DIR, join(specTarget, '_normalised'));

  if (mismatches.length > 0) {
    console.error('SPEC BYTES CHANGED DURING COPY — refusing to deploy:');
    for (const m of mismatches) console.error(`  ${m.file}: ${m.before} -> ${m.after}`);
    return 1;
  }

  // Pages is served by Actions rather than Jekyll, but be explicit: a leading
  // underscore in _astro/ and _normalised/ would otherwise be dropped.
  const nojekyll = join(out, '.nojekyll');
  if (!existsSync(nojekyll)) writeFileSync(nojekyll, '');

  console.log(`assembled ${out}`);
  console.log(`  pages:            ${countFiles(out, '.html')}`);
  console.log(`  specs (verbatim): ${files.length} — all sha256-identical`);
  console.log(`  specs (rendered): ${readdirSync(join(specTarget, '_normalised')).length}`);
  return 0;
}

function countFiles(dir, ext) {
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) n += countFiles(join(dir, entry.name), ext);
    else if (entry.name.endsWith(ext)) n++;
  }
  return n;
}

process.exit(main(process.argv.slice(2)));
