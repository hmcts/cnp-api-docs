// Specs that something outside this repo fetches by exact filename.
//
// These are load-bearing. Renaming or removing one breaks a consumer at runtime
// or at terraform apply, not at build time, so nothing here would catch it
// except this test. Two of them are read by live services.
//
// Run against the local working tree by default. With CHECK_HOSTED=1 it also
// fetches each URL, which is what the deploy workflow uses to prove a Pages
// cutover did not change what consumers see.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';

const SPEC_DIR = 'docs/specs';

// apps/xui/rpx-xui-webapp/api/docs/routes.ts — fetched at runtime with axios and
// re-served through swagger-ui-express. A 404 here is a broken page in XUI.
const XUI_RUNTIME = [
  'am-role-assignment-service.json',
  'am-judicial-booking-service.json',
  'future-hearings-hmi-api.json',
  'rd-location-ref-api.json',
  'rd-judicial-api.json',
  'rd-caseworker-ref-api.json',
];

// F-125 "Swagger Pages and API Specs" acceptance tests in ccd-data-store-api,
// ccd-user-profile-api and hmc-hmi-inbound-adapter assert on these URLs.
const AAT_FIXTURES = [
  'ccd-data-store-api.v1_internal.json',
  'ccd-data-store-api.v1_external.json',
  'ccd-data-store-api.v2_internal.json',
  'ccd-data-store-api.v2_external.json',
  'ccd-user-profile-api.json',
  'hmc-hmi-inbound-adapter.json',
];

// Read by terraform at apply time to register the API into Azure API
// Management, via raw.githubusercontent.com rather than the Pages site.
const TERRAFORM_CONSUMED = [
  'ccpay-payment-app.recon-payments-v0.3.json',
  'ccpay-payment-app.refunds-status-v1.json',
  'et-acas-api.json',
  'et-acas-api-nonprod.json',
];

const ALL = [
  ...XUI_RUNTIME.map((f) => ['XUI runtime', f]),
  ...AAT_FIXTURES.map((f) => ['AAT fixture', f]),
  ...TERRAFORM_CONSUMED.map((f) => ['terraform', f]),
];

for (const [consumer, file] of ALL) {
  test(`${consumer}: ${file} exists and parses`, () => {
    const path = `${SPEC_DIR}/${file}`;
    assert.ok(existsSync(path), `${path} is missing — this breaks a ${consumer} consumer`);
    const doc = JSON.parse(readFileSync(path, 'utf8'));
    assert.ok(doc.openapi ?? doc.swagger, `${path} declares no openapi/swagger version`);
  });
}

// Only meaningful after a deploy; skipped locally.
const hosted = process.env.CHECK_HOSTED === '1';

test('hosted URLs still serve every externally-consumed spec', { skip: !hosted }, async () => {
  const base = process.env.HOSTED_BASE ?? 'https://hmcts.github.io/cnp-api-docs';
  const failures = [];

  for (const [consumer, file] of ALL) {
    const url = `${base}/specs/${file}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        failures.push(`${consumer}: ${url} returned ${res.status}`);
        continue;
      }
      const doc = await res.json();
      if (!(doc.openapi ?? doc.swagger)) failures.push(`${consumer}: ${url} is not a spec`);
    } catch (err) {
      failures.push(`${consumer}: ${url} failed — ${err.message}`);
    }
  }

  assert.deepEqual(failures, []);
});

// The repo was renamed from reform-api-docs; six live Jenkinsfile_CNP builds and
// several terraform files still use the old name, which only works while
// GitHub's rename redirect holds.
test('raw paths resolve under both repo names', { skip: !hosted }, async () => {
  const failures = [];
  for (const repo of ['cnp-api-docs', 'reform-api-docs']) {
    for (const file of TERRAFORM_CONSUMED) {
      const url = `https://raw.githubusercontent.com/hmcts/${repo}/master/docs/specs/${file}`;
      const res = await fetch(url);
      if (!res.ok) failures.push(`${url} returned ${res.status}`);
    }
    // The publish scripts are curl-piped from this path by live Jenkins builds.
    const script = `https://raw.githubusercontent.com/hmcts/${repo}/master/bin/publish-swagger-docs.sh`;
    const res = await fetch(script);
    if (!res.ok) failures.push(`${script} returned ${res.status}`);
  }
  assert.deepEqual(failures, []);
});
