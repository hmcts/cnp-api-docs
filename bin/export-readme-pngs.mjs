#!/usr/bin/env node
// Renders the C4 views that other repos embed in their READMEs.
//
// nfdiv-case-api, probate-back-office and six other repos hotlink these exact
// paths on master:
//
//   raw.githubusercontent.com/hmcts/reform-api-docs/master/docs/c4/<p>/images/structurizr-<p>-<view>.png
//
// so the filenames are a contract even though "structurizr" no longer renders
// them. LikeC4 exports as <product>_<view>.png; this renames to match.
//
// Usage: export-readme-pngs.mjs [--check]
//   --check  report what would change without writing

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Only the views actually referenced externally. Rendering all 36 would take
// minutes and commit images nobody reads.
const REFERENCED = {
  nfdiv: ['overview', 'citizen', 'caseworker'],
  probate: ['overview', 'citizen', 'caseworker'],
};

const TMP = 'build/readme-pngs';
const check = process.argv.includes('--check');

const wanted = Object.entries(REFERENCED).flatMap(([product, views]) =>
  views.map((view) => ({
    product,
    view,
    from: `${product}_${view}.png`,
    to: join('docs/c4', product, 'images', `structurizr-${product}-${view}.png`),
  })),
);

const filters = Object.keys(REFERENCED).flatMap((p) => ['-f', `${p}_*`]);

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

execFileSync(
  'yarn',
  ['likec4', 'export', 'png', '--no-use-dot', '--flat', '-o', TMP, ...filters, 'c4'],
  { stdio: 'inherit' },
);

const produced = new Set(readdirSync(TMP));
const missing = wanted.filter((w) => !produced.has(w.from));
if (missing.length > 0) {
  console.error('these views did not render:');
  for (const m of missing) console.error(`  ${m.from} (needed for ${m.to})`);
  process.exit(1);
}

let changed = 0;
for (const w of wanted) {
  const src = join(TMP, w.from);
  const sizeBefore = existsSync(w.to) ? statSync(w.to).size : 0;
  if (!check) {
    mkdirSync(join('docs/c4', w.product, 'images'), { recursive: true });
    copyFileSync(src, w.to);
  }
  const sizeAfter = statSync(src).size;
  if (sizeBefore !== sizeAfter) changed++;
  console.log(`  ${w.to}  ${sizeBefore} -> ${sizeAfter} bytes`);
}

console.log(`${wanted.length} images ${check ? 'checked' : 'written'}, ${changed} changed`);
