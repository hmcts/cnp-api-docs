import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, readFileSync, existsSync } from 'node:fs';

import { build, specIdentity, ageBucket } from '../model/build.mjs';

const model = build({ now: Date.parse('2026-07-30T00:00:00Z') });

test('splits grouped spec filenames on the first dot only', () => {
  // The group name itself contains dots, so a naive split loses the version.
  assert.deepEqual(specIdentity('ccpay-payment-app.recon-payments-v0.3.json'), {
    service: 'ccpay-payment-app',
    variant: 'recon-payments-v0.3',
  });
  assert.deepEqual(specIdentity('ccd-data-store-api.v2_internal.json'), {
    service: 'ccd-data-store-api',
    variant: 'v2_internal',
  });
  assert.deepEqual(specIdentity('pcs-api.json'), { service: 'pcs-api', variant: null });
  // A dot in a name that is not a known grouped publisher is part of the name.
  assert.deepEqual(specIdentity('et-acas-api-nonprod.json'), {
    service: 'et-acas-api-nonprod',
    variant: null,
  });
});

test('buckets freshness by age', () => {
  assert.equal(ageBucket(0), 'fresh');
  assert.equal(ageBucket(89), 'fresh');
  assert.equal(ageBucket(90), 'ageing');
  assert.equal(ageBucket(400), 'stale');
  assert.equal(ageBucket(1000), 'abandoned');
  assert.equal(ageBucket(null), 'unknown');
});

// The regression this model exists to prevent: under microservices.json a spec
// was only visible if someone hand-edited a registry entry, so 126 of 187
// published specs were invisible.
test('every spec file on disk is represented in the model', () => {
  const files = readdirSync('docs/specs')
    .filter((f) => f.endsWith('.json') && f !== '.json')
    .sort();

  const represented = new Set();
  for (const s of Object.values(model.services)) {
    for (const spec of s.specs) represented.add(spec.file);
  }

  const missing = files.filter((f) => !represented.has(f));
  assert.deepEqual(missing, [], 'these specs would be invisible in the portal');
  assert.equal(represented.size, files.length);
});

test('no spec is attached to more than one service', () => {
  const owners = {};
  for (const [id, s] of Object.entries(model.services)) {
    for (const spec of s.specs) {
      (owners[spec.file] ??= []).push(id);
    }
  }
  const duplicated = Object.entries(owners).filter(([, ids]) => ids.length > 1);
  assert.deepEqual(duplicated, [], 'a spec claimed by two services would render twice');
});

test('grouped publishers collapse into one service with several variants', () => {
  const ccd = model.services['ccd-data-store-api'];
  assert.ok(ccd, 'ccd-data-store-api should exist');
  assert.equal(ccd.specs.length, 4);
  assert.deepEqual(
    ccd.specs.map((s) => s.variant).sort(),
    ['v1_external', 'v1_internal', 'v2_external', 'v2_internal'],
  );
});

test('reports every registry entry whose claimed spec is absent', () => {
  const missing = model.warnings.filter((w) => w.kind === 'claimed-spec-missing');
  // These were silent holes before; they must be reported, and must be real.
  assert.ok(missing.length > 0);
  for (const w of missing) {
    for (const file of w.expected) {
      if (!file.endsWith('.json')) continue;
      assert.ok(
        !existsSync(`docs/specs/${file}`),
        `${w.id} warned about ${file}, but that file exists — the join is wrong`,
      );
    }
  }
});

test('does not warn about spec-less services that never had a spec', () => {
  // Frontends and schedulers have no OpenAPI spec by design.
  const warned = new Set(
    model.warnings.filter((w) => w.kind === 'claimed-spec-missing').map((w) => w.id),
  );
  const frontend = model.services['cath-web'] ?? model.services['lau-frontend'];
  assert.ok(frontend, 'expected at least one spec-less frontend in the model');
  assert.ok(!warned.has(frontend.id), 'a frontend with no spec is not a broken link');
});

test('ambient services are limited to auth and identity', () => {
  const ambient = Object.values(model.services)
    .filter((s) => s.ambient)
    .map((s) => s.id)
    .sort();
  assert.deepEqual(ambient, ['idam-api', 'idam-web-admin', 'idam-web-public', 'rpe-service-auth-provider']);
  // Popular domain services must keep their edges; hiding them would erase the
  // most informative structure in the graph.
  assert.equal(model.services['ccd-data-store-api'].ambient, false);
  assert.equal(model.services['dm-store'].ambient, false);
});

test('reverse edges agree with forward edges', () => {
  for (const [id, s] of Object.entries(model.services)) {
    for (const dep of s.dependsOn) {
      const target = model.services[dep.id];
      if (!target) continue;
      assert.ok(
        target.consumedBy.includes(id),
        `${id} depends on ${dep.id} but is not listed in its consumers`,
      );
    }
  }
});

test('every service carries a valid spec or is explicitly spec-less', () => {
  for (const [id, s] of Object.entries(model.services)) {
    assert.ok(Array.isArray(s.specs), `${id} has no specs array`);
    if (s.specs.length === 0) assert.equal(s.specless, true, `${id} should be marked specless`);
  }
});

test('counts match the underlying data', () => {
  const onDisk = readdirSync('docs/specs').filter((f) => f.endsWith('.json') && f !== '.json').length;
  assert.equal(model.counts.specFiles, onDisk);
  assert.equal(model.counts.services, Object.keys(model.services).length);
  // Phase 0 repaired every spec; regressions must fail this.
  assert.equal(model.counts.brokenSpecs, 0);
});

test('federation is inert until a team declares edges', () => {
  // No repo sets dependsOn/consumesApis yet, so all edges come from registry.yaml.
  // When that changes this assertion should be updated, not deleted.
  const fromCatalog = Object.values(model.services).filter((s) => s.edgeSource === 'catalog-info');
  assert.equal(fromCatalog.length, model.counts.federatedEdges);
});

test('the model has no unresolved schema surprises', () => {
  const raw = JSON.parse(readFileSync('model/model.json', 'utf8'));
  assert.ok(raw.generated);
  assert.deepEqual(Object.keys(raw).sort(), ['counts', 'generated', 'groups', 'services', 'warnings']);
});
