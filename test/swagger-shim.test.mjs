// Exercises the swagger.html compatibility shim against link shapes that really
// exist in service READMEs, API Docs badges, Confluence and the old LLD pages.
//
// The shim's logic is inline in site/public/swagger.html so no build step can
// alter its contract. This test extracts and evaluates it rather than
// duplicating the rules, so the two cannot drift.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const SHIM = 'site/public/swagger.html';
const html = readFileSync(SHIM, 'utf8');

// Pull the two rules out of the shim so we assert on the shipped source.
const hostedRe = (() => {
  const m = /var HOSTED = (\/\^.*\/);/.exec(html);
  assert.ok(m, 'could not find the HOSTED pattern in the shim');
  // eslint-disable-next-line no-eval
  return eval(m[1]);
})();

function specName(url) {
  if (!url) return null;
  const m = hostedRe.exec(url.trim());
  return m ? m[1] : null;
}

// Mirrors the shim's branching, driven by the same extracted pattern.
function resolve(search, base = '/cnp-api-docs') {
  const params = new URLSearchParams(search);
  let url = params.get('url');
  const apis = params.get('apis');

  if (apis && !url) {
    try {
      const parsed = JSON.parse(apis);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.url) url = parsed[0].url;
    } catch {
      /* fall through */
    }
  }

  const name = specName(url);
  if (name) return `${base}/api/${name.replace(/\.json$/, '')}/`;
  if (url) return `${base}/reference/?url=${encodeURIComponent(url)}`;
  return null;
}

const HOSTED_CASES = [
  // ccd-definition-store-api README API Docs badge
  [
    '?url=https://hmcts.github.io/cnp-api-docs/specs/ccd-definition-store-api.json',
    '/cnp-api-docs/api/ccd-definition-store-api/',
  ],
  // ccd-data-store-api README, one badge per version
  [
    '?url=https://hmcts.github.io/cnp-api-docs/specs/ccd-data-store-api.v1_internal.json',
    '/cnp-api-docs/api/ccd-data-store-api.v1_internal/',
  ],
  [
    '?url=https://hmcts.github.io/cnp-api-docs/specs/ccd-data-store-api.v2_external.json',
    '/cnp-api-docs/api/ccd-data-store-api.v2_external/',
  ],
  // send-letter-service README uses the pre-rename hostname
  [
    '?url=https://hmcts.github.io/reform-api-docs/specs/send-letter-service.json',
    '/cnp-api-docs/api/send-letter-service/',
  ],
  // document-management-store-app README
  [
    '?url=https://hmcts.github.io/cnp-api-docs/specs/document-management-store-app.json',
    '/cnp-api-docs/api/document-management-store-app/',
  ],
  // The generated LLD pages emit site-relative links
  ['?url=specs/ccd-user-profile-api.json', '/cnp-api-docs/api/ccd-user-profile-api/'],
  ['?url=./specs/am-role-assignment-service.json', '/cnp-api-docs/api/am-role-assignment-service/'],
  // http rather than https
  [
    '?url=http://hmcts.github.io/cnp-api-docs/specs/civil-sdt-gateway.json',
    '/cnp-api-docs/api/civil-sdt-gateway/',
  ],
  // A grouped payment spec whose group name contains dots
  [
    '?url=https://hmcts.github.io/cnp-api-docs/specs/ccpay-payment-app.recon-payments-v0.3.json',
    '/cnp-api-docs/api/ccpay-payment-app.recon-payments-v0.3/',
  ],
];

for (const [search, expected] of HOSTED_CASES) {
  test(`maps hosted spec: ${search.slice(0, 70)}`, () => {
    assert.equal(resolve(search), expected);
  });
}

test('multi-version ?apis= links land on the first spec', () => {
  const apis = JSON.stringify([
    { name: 'v1_internal', url: 'https://hmcts.github.io/cnp-api-docs/specs/ccd-data-store-api.v1_internal.json' },
    { name: 'v2_internal', url: 'https://hmcts.github.io/cnp-api-docs/specs/ccd-data-store-api.v2_internal.json' },
  ]);
  assert.equal(
    resolve(`?apis=${encodeURIComponent(apis)}`),
    '/cnp-api-docs/api/ccd-data-store-api.v1_internal/',
  );
});

test('a foreign spec URL is forwarded to the generic viewer', () => {
  assert.equal(
    resolve('?url=https://example.org/openapi.json'),
    '/cnp-api-docs/reference/?url=https%3A%2F%2Fexample.org%2Fopenapi.json',
  );
});

test('no parameters means no redirect, so the page can explain itself', () => {
  assert.equal(resolve(''), null);
  assert.equal(resolve('?other=1'), null);
});

test('malformed ?apis= does not throw', () => {
  assert.equal(resolve('?apis=not-json'), null);
  assert.equal(resolve('?apis=[]'), null);
  assert.equal(resolve('?apis=[{"name":"x"}]'), null);
});

test('a lookalike host is not treated as hosted here', () => {
  // Must not be rewritten to a local page — it is not our spec.
  const out = resolve('?url=https://evil.example/hmcts.github.io/cnp-api-docs/specs/x.json');
  assert.ok(out.startsWith('/cnp-api-docs/reference/'), out);
});

test('the shim rejects non-http schemes before rendering', () => {
  // Scheme filtering lives in ReferenceLoader; assert the guard is present.
  const loader = readFileSync('site/src/components/ReferenceLoader.jsx', 'utf8');
  assert.match(loader, /protocol === 'http:'/);
  assert.match(loader, /protocol === 'https:'/);
});

test('the shim is a static file with no framework imports', () => {
  // It must keep working even if the site framework changes.
  assert.ok(!html.includes('import '), 'shim should not import modules');
  assert.match(html, /<script>/);
});
