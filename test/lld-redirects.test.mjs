// The old site served a Low Level Design page per group at lld/<group>.html,
// linked from the vis.js graph legend. Those URLs may be bookmarked or linked from
// Confluence, so the new site redirects them to the equivalent group page.
//
// The old slug came from `formatName` in docs/generate-llds.js, which is not the
// same as the site's slug for three groups, so the mapping is asserted rather than
// assumed.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';

import { build } from '../model/build.mjs';

const OUT = 'build/dist/lld';
const model = build();

const formatName = (s) =>
  s.toLowerCase().replaceAll(' ', '_').replaceAll('-', '_').replaceAll('&', '').replaceAll(',', '');
const slugOf = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const built = existsSync(OUT);

test('the legacy and current slugs differ for the groups we expect', () => {
  const differing = Object.keys(model.groups)
    .filter((g) => formatName(g) !== slugOf(g))
    .sort();
  // If this list changes, the redirect for that group changes too.
  assert.deepEqual(differing, ['BAR, Fee & Pay', 'HMI Gateway', 'Video Hearing']);
});

test('every group has a redirect stub', { skip: !built && 'run `yarn assemble` first' }, () => {
  const missing = Object.keys(model.groups).filter(
    (g) => !existsSync(`${OUT}/${formatName(g)}.html`),
  );
  assert.deepEqual(missing, [], 'these legacy LLD URLs would 404');
});

test('each stub points at the right group page', { skip: !built && 'run `yarn assemble` first' }, () => {
  for (const name of Object.keys(model.groups)) {
    const html = readFileSync(`${OUT}/${formatName(name)}.html`, 'utf8');
    const expected = `/cnp-api-docs/groups/${slugOf(name)}/`;
    assert.match(html, new RegExp(`url=${expected}`), `${formatName(name)}.html points elsewhere`);
    // Both a meta refresh and a script, so it works with JS disabled.
    assert.match(html, /http-equiv="refresh"/);
    assert.match(html, /location\.replace/);
    assert.match(html, /robots.*noindex/);
  }
});

test('the stubs are files, not directories', { skip: !built && 'run `yarn assemble` first' }, () => {
  // Astro emits `lld/ccd.html/index.html` for a page named `ccd.html`, which does
  // not answer the legacy URL, so these are written by bin/assemble-site.mjs.
  assert.ok(existsSync(`${OUT}/ccd.html`));
  assert.ok(!existsSync(`${OUT}/ccd.html/index.html`));
});
