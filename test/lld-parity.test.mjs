// The product pages replace the old docs/lld/*.html pages. This asserts nothing
// the old pages showed has been dropped, so docs/lld/ can be deleted at cutover
// without losing information.
//
// Compares against the committed LLD HTML rather than a snapshot, so it keeps
// working until those files are removed. Skips itself once they are gone.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

import { build } from '../model/build.mjs';

const LLD_DIR = 'docs/lld';
const OUT = 'build/dist/products';

const haveLld = existsSync(LLD_DIR);
const haveBuild = existsSync(OUT);
const skip = !haveLld
  ? 'docs/lld has been removed; parity is no longer meaningful'
  : !haveBuild
    ? 'run `yarn build` first'
    : false;

const slugOf = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const matches = (html, re) => [...html.matchAll(re)].map((m) => m[1]);

function lldPages() {
  return readdirSync(LLD_DIR)
    .filter((f) => f.endsWith('.html'))
    .map((f) => ({ file: f, html: readFileSync(`${LLD_DIR}/${f}`, 'utf8') }))
    .map((p) => ({ ...p, title: /<title>(.*?) Low Level Design/.exec(p.html)?.[1] }))
    .filter((p) => p.title);
}

test('every LLD page has a product page', { skip }, () => {
  const model = build();
  for (const { title } of lldPages()) {
    assert.ok(model.products[title], `no product named "${title}"`);
    assert.ok(
      existsSync(`${OUT}/${slugOf(title)}/index.html`),
      `no page at products/${slugOf(title)}/`,
    );
  }
});

// Services the old LLD listed under a pre-rename id. The live equivalent is on the
// product page under its current name; the old spec file is still served and still
// appears in the specs list, so nothing is unreachable.
const SUPERSEDED = {
  'rpa-em-stitching-api': 'em-stitching-api',
  'rpa-em-ccd-orchestrator': 'em-ccd-orchestrator',
};

test('no service, repo link, spec link or diagram was dropped', { skip }, () => {
  const lost = [];
  const superseded = (s) => Object.keys(SUPERSEDED).some((old) => s.includes(old));

  for (const { html: old, title } of lldPages()) {
    const page = `${OUT}/${slugOf(title)}/index.html`;
    if (!existsSync(page)) continue;
    const now = readFileSync(page, 'utf8');

    // The replacement must be present, or this exemption is hiding a real loss.
    for (const [was, is] of Object.entries(SUPERSEDED)) {
      if (old.includes(was) && !now.includes(is)) lost.push(`${title}: ${was} superseded by ${is}, which is absent`);
    }

    // The old page linked each service name to its GitHub repo. That link was
    // briefly missing from the product table — only the service page had it.
    const repos = new Set(matches(old, /href="(https:\/\/github\.com\/hmcts\/[^"]+)"/g));
    repos.delete('https://github.com/hmcts/cnp-api-docs/');
    for (const repo of repos) {
      if (superseded(repo)) continue;
      if (!now.includes(repo.replace(/\/$/, ''))) lost.push(`${title}: repo ${repo}`);
    }

    // Curated service names, which are not derivable from the spec.
    for (const name of matches(old, /<li><a href="[^"]*">([^<]+)<\/a>/g)) {
      const escaped = name.replaceAll('&', '&amp;');
      if (!now.includes(name) && !now.includes(escaped)) lost.push(`${title}: name "${name}"`);
    }

    // Anything the old page linked through to Swagger.
    for (const spec of new Set(matches(old, /swagger\.html\?url=[^"]*\/specs\/([^"]+)\.json/g))) {
      if (superseded(spec)) continue;
      if (!now.includes(spec)) lost.push(`${title}: spec ${spec}.json`);
    }

    // The old page embedded a C4 PNG; the new one embeds the LikeC4 view.
    if (old.includes('<img') && !now.includes('likec4-view')) {
      lost.push(`${title}: diagram`);
    }
  }

  assert.deepEqual(lost, [], 'these were on the old LLD pages and are not on the new ones');
});
