import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, existsSync } from 'node:fs';

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
  // Never published by a pipeline — committed by hand. Distinct from "old".
  assert.equal(ageBucket(null), 'unpublished');
});

// Freshness must reflect the last time a *publisher* wrote the spec, not the last
// time anyone touched the file. Counting any commit lets our own maintenance reset
// the clock, which made a spec no team had published since 2023 look fresh.
//
// Asserted as a property rather than against one named spec: the original example
// was republished (still broken) by its own pipeline, which legitimately moved its
// date and would make a hard-coded assertion wrong for the right reason.
test('freshness ignores maintenance commits', () => {
  const specs = Object.values(model.services).flatMap((s) => s.specs);

  // Some spec must have been touched more recently than it was published,
  // otherwise this rule is not being exercised at all.
  const maintained = specs.filter((s) => s.lastPublished && s.lastTouched > s.lastPublished);
  assert.ok(maintained.length > 0, 'expected at least one spec edited after its last publish');

  for (const spec of specs) {
    if (!spec.lastPublished) continue;
    assert.ok(
      spec.lastTouched >= spec.lastPublished,
      `${spec.file}: lastTouched must not precede lastPublished`,
    );
    // Freshness is derived from the publish date, never the touch date.
    assert.equal(spec.freshness, ageBucket(spec.ageDays));
  }
});

test('specs never written by a pipeline are marked unpublished', () => {
  const unpublished = [];
  for (const s of Object.values(model.services)) {
    for (const spec of s.specs) {
      if (spec.freshness === 'unpublished') unpublished.push(spec);
    }
  }
  assert.ok(unpublished.length > 0, 'expected some hand-committed specs');
  for (const spec of unpublished) {
    assert.equal(spec.lastPublished, null);
    // They exist in git, so something touched them.
    assert.ok(spec.lastTouched, `${spec.file} should still have a touched date`);
  }
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
});

// Deliberately not asserting brokenSpecs is 0. A spec belongs to the team that
// publishes it, and this repo no longer repairs one — see the registry health
// section of the README. What must hold is that a broken spec is surfaced rather
// than silently dropped, and that it cannot break the build.
test('broken specs are represented, not dropped', () => {
  const broken = Object.values(model.services).flatMap((s) => s.specs.filter((x) => !x.valid));
  assert.equal(model.counts.brokenSpecs, broken.length);

  for (const spec of broken) {
    assert.ok(spec.problem, `${spec.file} should record why it is invalid`);
    assert.equal(spec.pathCount, 0);
    // Still reachable, so the health page can name it and link to the raw file.
    assert.ok(spec.url.endsWith(spec.file));
  }
});

test('federation is inert until a team declares edges', () => {
  // No repo sets dependsOn/consumesApis yet, so all edges come from registry.yaml.
  // When that changes this assertion should be updated, not deleted.
  const fromCatalog = Object.values(model.services).filter((s) => s.edgeSource === 'catalog-info');
  assert.equal(fromCatalog.length, model.counts.federatedEdges);
});

// Asserts the shape of the build output. Deliberately checks the in-memory model
// rather than model/model.json, which is gitignored and so absent on a fresh
// checkout — reading the file passed locally and failed in CI.
test('the model has the expected top-level shape', () => {
  assert.ok(model.generated);
  assert.deepEqual(Object.keys(model).sort(), [
    'actors',
    'callbacks',
    'counts',
    'generated',
    'products',
    'services',
    'warnings',
  ]);
  assert.ok(JSON.parse(JSON.stringify(model)), 'model must be JSON-serialisable');
});

// Actors and CCD callbacks were the only content in the Structurizr files that
// could not be derived from the registry, so they were ported into registry.yaml.
// Losing them would silently empty the citizen and caseworker journey diagrams.
test('actors and callbacks survived the port from Structurizr', () => {
  assert.deepEqual(Object.keys(model.actors).sort(), ['caseworker', 'citizen']);
  assert.ok(model.actors.citizen.uses.includes('pcs-frontend'));
  assert.ok(model.actors.caseworker.uses.includes('xui-webapp'));

  // CCD calls back into a service team's API during an event — the opposite
  // direction to the dependency edge, so it cannot be inferred.
  const targets = model.callbacks.filter((c) => c.from === 'ccd-data-store-api').map((c) => c.to);
  assert.deepEqual(targets.sort(), ['nfdiv-case-api', 'pcs-api', 'probate-back-office']);
});

test('every actor and callback resolves to a real service', () => {
  const unresolved = model.warnings.filter(
    (w) => w.kind === 'actor-uses-unknown-service' || w.kind === 'callback-unknown-service',
  );
  assert.deepEqual(unresolved, [], 'these would be dangling references in the diagrams');
});

// The old LLD pages listed services by a curated name ("CCD Data Store", "Fees
// App"), not by repo id. That field was dropped in the first pass at
// registry.yaml and had to be restored; 75 of 117 differ from the id.
test('curated service names survive into the model', () => {
  const named = Object.values(model.services).filter((s) => s.name);
  assert.ok(named.length >= 117, `expected at least 117 named services, got ${named.length}`);

  assert.equal(model.services['ccd-data-store-api'].name, 'CCD Data Store');
  assert.equal(model.services['idam-web-admin'].name, 'IDAM Admin UI');
  assert.equal(model.services['fees-register-api'].name, 'Fees App');

  const differ = named.filter(
    (s) => s.name.toLowerCase().replace(/[^a-z0-9]/g, '') !== s.id.toLowerCase().replace(/[^a-z0-9]/g, ''),
  );
  assert.ok(differ.length > 50, 'names should carry information the id does not');
});
