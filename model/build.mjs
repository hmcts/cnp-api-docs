#!/usr/bin/env node
// Builds model/model.json, the single input to the site.
//
// The important property: docs/specs/ is the primary key. Every spec file
// becomes a service entry unconditionally, so publishing a spec is sufficient to
// appear in the portal. Under the old microservices.json, a service was only
// visible if someone hand-edited a registry entry, which is why 126 of 187
// published specs were invisible.
//
// registry.yaml decorates entries (group, dependency edges, prose). A spec with
// no registry entry still gets a page; a registry entry with no spec is reported
// as a dangling reference rather than silently dropped.

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, join } from 'node:path';
import { parse } from 'yaml';

import { validateSpec } from '../bin/validate-specs.mjs';

const SPEC_DIR = 'docs/specs';
const OUT = 'model/model.json';

// Only two repos publish grouped variants, and their group names themselves
// contain dots (recon-payments-v0.3), so split on the first dot only.
const KNOWN_GROUPED = ['ccd-data-store-api', 'ccpay-payment-app'];

function specIdentity(file) {
  const stem = basename(file, '.json');
  const grouped = KNOWN_GROUPED.find((r) => stem.startsWith(`${r}.`));
  if (grouped) {
    return { service: grouped, variant: stem.slice(grouped.length + 1) };
  }
  return { service: stem, variant: null };
}

// A publisher's commit, as opposed to maintenance by a human. Publishing
// pipelines write "Update spec for <repo>#<sha>" or "Update spec from <slug>",
// which covers 11,786 of ~11,900 commits touching docs/specs.
const PUBLISH_SUBJECT = /^Updat(e|ing) spec (for|from) /;

// One git pass for every file's last-published date. Per-file `git log` over a
// repo with thousands of "Update spec" commits takes minutes; this takes ~0.3s.
//
// Only publisher commits count. Otherwise our own maintenance — the Phase 0
// commit that repaired 10 broken specs, say — resets the clock and reports a
// spec no team has touched since 2021 as freshly published.
function lastModified() {
  const out = execFileSync(
    'git',
    ['log', '--format=C%ct%x00%s', '--name-only', '--', SPEC_DIR],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );

  const published = {};
  const touched = {};
  let ts = null;
  let isPublish = false;

  for (const line of out.split('\n')) {
    if (line.startsWith('C') && line.includes('\0')) {
      const [stamp, subject] = line.slice(1).split('\0');
      ts = Number(stamp);
      isPublish = PUBLISH_SUBJECT.test(subject);
      continue;
    }
    const path = line.trim();
    if (!path) continue;
    if (!(path in touched)) touched[path] = ts;
    if (isPublish && !(path in published)) published[path] = ts;
  }

  return { published, touched };
}

function ageBucket(days) {
  if (days == null) return 'unpublished';
  if (days < 90) return 'fresh';
  if (days < 365) return 'ageing';
  if (days < 730) return 'stale';
  return 'abandoned';
}

function build({ now = Date.now() } = {}) {
  const registry = parse(readFileSync('registry.yaml', 'utf8'));
  const catalog = existsSync('model/catalog-cache.json')
    ? JSON.parse(readFileSync('model/catalog-cache.json', 'utf8')).entities
    : {};

  const modified = lastModified();
  const files = readdirSync(SPEC_DIR)
    .filter((f) => f.endsWith('.json') && f !== '.json')
    .sort();

  const services = {};
  const warnings = [];

  // Registry service ids are their own namespace and often differ from the spec
  // filename (bsp-bulk-scan-processor claims bulk-scan-processor.json). Join on
  // the filenames the registry claims, or the same spec lands twice: once under
  // its filename and once under the registry id.
  const fileToRegistryId = {};
  for (const [id, reg] of Object.entries(registry.services ?? {})) {
    for (const file of reg.claimedSpecFiles ?? []) {
      if (file.endsWith('.json')) fileToRegistryId[file] = id;
    }
  }

  // Pass 1: every spec file becomes, or joins, a service.
  for (const file of files) {
    const path = join(SPEC_DIR, file);
    const { service: derivedId, variant } = specIdentity(file);
    const id = fileToRegistryId[file] ?? derivedId;
    const spec = validateSpec(path);

    let doc = null;
    if (spec.valid) {
      try {
        doc = JSON.parse(readFileSync(path, 'utf8'));
      } catch {
        /* validateSpec already classified it */
      }
    }

    // Freshness tracks the last real publish; lastTouched is shown separately so
    // a maintenance edit is visible without inflating apparent health.
    const ts = modified.published[path];
    const touchedTs = modified.touched[path];
    const ageDays = ts ? Math.floor((now - ts * 1000) / 86_400_000) : null;

    const entry = {
      file,
      variant,
      valid: spec.valid,
      ...(spec.valid ? {} : { problem: spec.reason }),
      bytes: spec.bytes ?? 0,
      specVersion: spec.version ?? null,
      pathCount: spec.paths ?? 0,
      title: doc?.info?.title ?? null,
      apiVersion: doc?.info?.version ?? null,
      description: doc?.info?.description ?? null,
      lastPublished: ts ? new Date(ts * 1000).toISOString().slice(0, 10) : null,
      lastTouched: touchedTs ? new Date(touchedTs * 1000).toISOString().slice(0, 10) : null,
      ageDays,
      freshness: ageBucket(ageDays),
      url: `https://hmcts.github.io/cnp-api-docs/specs/${file}`,
    };

    services[id] ??= { id, specs: [] };
    services[id].specs.push(entry);
  }

  // Pass 2: decorate with registry and catalog data.
  for (const [id, service] of Object.entries(services)) {
    const reg = registry.services?.[id];
    // Catalog entities are keyed by GitHub repo name, which matches the spec
    // filename rather than the registry id, so try the repo name too.
    const repoName = reg?.repository?.split('/').pop();
    const specStem = service.specs?.[0] ? basename(service.specs[0].file, '.json') : null;
    const cat =
      catalog[id] ??
      (repoName ? catalog[repoName] : undefined) ??
      (specStem ? catalog[specStem.split('.')[0]] : undefined);

    service.group = reg?.group ?? null;
    service.type = reg?.type ?? cat?.type ?? null;
    service.description = reg?.description ?? null;
    service.repository = reg?.repository ?? (cat ? `https://github.com/hmcts/${id}` : null);
    service.ambient = reg?.ambient === true;
    service.owner = cat?.owner ?? null;
    service.lifecycle = cat?.lifecycle ?? null;
    service.inCatalog = Boolean(cat);

    // Federation: a team's own catalog-info.yaml wins over central registry.yaml
    // when it declares edges. Zero repos do today, so this is inert until they
    // start — the portal works at 0% adoption and improves monotonically.
    const federated = cat?.dependsOn ?? cat?.consumesApis;
    service.dependsOn = (federated ?? reg?.dependsOn ?? []).map((d) =>
      typeof d === 'string' ? { id: d, hard: true } : { id: d.id, hard: d.hard !== false },
    );
    service.edgeSource = federated ? 'catalog-info' : reg?.dependsOn ? 'registry' : 'none';

    if (!reg) {
      // The bug this whole model exists to fix: published, previously invisible.
      warnings.push({ kind: 'spec-not-in-registry', id });
    }

    // Roll spec health up to the service.
    service.validSpecs = service.specs.filter((s) => s.valid).length;
    service.brokenSpecs = service.specs.filter((s) => !s.valid).length;
    service.freshest = service.specs
      .map((s) => s.ageDays)
      .filter((d) => d != null)
      .sort((a, b) => a - b)[0] ?? null;
  }

  // Pass 3: broken spec links, and edges to unknown services.
  for (const [id, reg] of Object.entries(registry.services ?? {})) {
    if (!services[id]) {
      // Only a problem if the entry claimed a spec that is now absent. Frontends
      // and schedulers have no spec by design and are not warned about; they
      // still appear in the portal via registry.yaml.
      if (reg.expectsSpec) {
        warnings.push({
          kind: 'claimed-spec-missing',
          id,
          group: reg.group,
          expected: reg.claimedSpecFiles,
        });
      }
      // Carry it into the model regardless, so the group pages stay complete.
      services[id] = {
        id,
        specs: [],
        group: reg.group ?? null,
        type: reg.type ?? null,
        description: reg.description ?? null,
        repository: reg.repository ?? null,
        ambient: reg.ambient === true,
        owner: catalog[id]?.owner ?? null,
        lifecycle: catalog[id]?.lifecycle ?? null,
        inCatalog: Boolean(catalog[id]),
        dependsOn: (reg.dependsOn ?? []).map((d) =>
          typeof d === 'string' ? { id: d, hard: true } : { id: d.id, hard: d.hard !== false },
        ),
        edgeSource: reg.dependsOn ? 'registry' : 'none',
        validSpecs: 0,
        brokenSpecs: 0,
        freshest: null,
        specless: true,
      };
    }
    for (const dep of reg.dependsOn ?? []) {
      const target = typeof dep === 'string' ? dep : dep.id;
      if (!registry.services[target]) {
        warnings.push({ kind: 'edge-to-unknown-service', id, target });
      }
    }
  }

  // Reverse edges, so a service page can show who calls it without scanning.
  const consumers = {};
  for (const [id, s] of Object.entries(services)) {
    for (const dep of s.dependsOn) {
      (consumers[dep.id] ??= []).push(id);
    }
  }
  for (const [id, s] of Object.entries(services)) {
    s.consumedBy = consumers[id] ?? [];
  }

  // Actors and callbacks come only from registry.yaml. Warn on unresolved targets
  // rather than emitting a dangling reference into the diagram model.
  const actors = {};
  for (const [id, a] of Object.entries(registry.actors ?? {})) {
    const uses = (a.uses ?? []).filter((target) => {
      if (services[target]) return true;
      warnings.push({ kind: 'actor-uses-unknown-service', id, target });
      return false;
    });
    actors[id] = { id, name: a.name ?? id, description: a.description ?? null, uses };
  }

  const callbacks = [];
  for (const [from, targets] of Object.entries(registry.callbacks ?? {})) {
    for (const to of targets) {
      if (!services[from] || !services[to]) {
        warnings.push({ kind: 'callback-unknown-service', from, to });
        continue;
      }
      callbacks.push({ from, to });
    }
  }

  const groups = {};
  for (const [name, g] of Object.entries(registry.groups ?? {})) {
    const members = Object.values(services).filter((s) => s.group === name);
    groups[name] = {
      name,
      colour: g.colour,
      info: g.info ?? null,
      serviceCount: members.length,
      services: members.map((s) => s.id).sort(),
    };
  }

  return {
    generated: new Date(now).toISOString(),
    counts: {
      specFiles: files.length,
      services: Object.keys(services).length,
      groups: Object.keys(groups).length,
      brokenSpecs: Object.values(services).reduce((n, s) => n + s.brokenSpecs, 0),
      ungrouped: Object.values(services).filter((s) => !s.group).length,
      withOwner: Object.values(services).filter((s) => s.owner).length,
      federatedEdges: Object.values(services).filter((s) => s.edgeSource === 'catalog-info').length,
    },
    groups,
    services,
    actors,
    callbacks,
    warnings,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const model = build();
  writeFileSync(OUT, `${JSON.stringify(model, null, 2)}\n`);

  const c = model.counts;
  console.log(`${OUT} written`);
  console.log(`  spec files:  ${c.specFiles}`);
  console.log(`  services:    ${c.services} (${c.ungrouped} not yet in registry.yaml)`);
  console.log(`  groups:      ${c.groups}`);
  console.log(`  with owner:  ${c.withOwner}`);
  console.log(`  broken:      ${c.brokenSpecs}`);

  const byKind = {};
  for (const w of model.warnings) byKind[w.kind] = (byKind[w.kind] ?? 0) + 1;
  console.log(`  warnings:`);
  for (const [kind, n] of Object.entries(byKind)) console.log(`    ${kind}: ${n}`);
}

export { build, specIdentity, ageBucket };
