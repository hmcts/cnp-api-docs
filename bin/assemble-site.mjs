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
const C4_DIR = 'build/c4';

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

// The old site served one page per group at lld/<group>.html, linked from the
// vis.js graph legend. Those are real URLs that may be bookmarked or linked from
// Confluence, and the group pages now carry the same content, so redirect rather
// than 404. Written here rather than as an Astro route because Astro emits
// `lld/ccd.html/index.html` for a page named `ccd.html`.
//
// The old slug came from `formatName`, which differs from the site's slug for
// "HMI Gateway", "BAR, Fee & Pay" and "Video Hearing", so derive both.
function writeLldRedirects(out) {
  const model = JSON.parse(readFileSync('model/model.json', 'utf8'));
  const formatName = (s) =>
    s.toLowerCase().replaceAll(' ', '_').replaceAll('-', '_').replaceAll('&', '').replaceAll(',', '');
  const slugOf = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const dir = join(out, 'lld');
  mkdirSync(dir, { recursive: true });

  let written = 0;
  for (const name of Object.keys(model.groups)) {
    const target = `/cnp-api-docs/groups/${slugOf(name)}/`;
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=${target}">
<link rel="canonical" href="${target}">
<meta name="robots" content="noindex">
<title>${name} — moved</title>
</head>
<body>
<p>The ${name} low level design has moved to <a href="${target}">${target}</a>.</p>
<script>window.location.replace(${JSON.stringify(target)});</script>
</body>
</html>
`;
    writeFileSync(join(dir, `${formatName(name)}.html`), html);
    written++;
  }
  return written;
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

  // The LikeC4 diagram app, if it has been built. Optional so the site still
  // assembles without it.
  if (existsSync(C4_DIR)) copyTree(C4_DIR, join(out, 'architecture'));

  writeLldRedirects(out);

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
