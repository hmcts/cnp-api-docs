#!/usr/bin/env node
// One-shot conversion of docs/microservices.json into registry.yaml.
//
// microservices.json mixed two kinds of data: facts derivable from the specs
// themselves (title, spec URL, version) and facts that exist nowhere else
// (which group a service belongs to, what it depends on, prose descriptions).
// registry.yaml keeps only the second kind. Everything else is derived by
// model/build.mjs, so a spec can never again be published and stay invisible
// because nobody hand-edited a registry entry.
//
// Run once; registry.yaml is hand-maintained from then on.

import { readFileSync, writeFileSync } from 'node:fs';
import { stringify } from 'yaml';

// Ambient means "authenticating or identifying, so everything talks to it and
// saying so carries no information" — not merely "popular". A fan-in threshold
// alone also catches ccd-data-store-api (29) and dm-store (22), which are core
// domain services whose edges are the most useful structure in the graph, so the
// list is explicit. Fan-in is still recorded to make review easy.
const AMBIENT = new Set([
  'rpe-service-auth-provider', // service-to-service auth, fan-in 76
  'idam-api',
  'idam-web-public',
  'idam-web-admin',
  'idam-s2s',
]);

const micro = JSON.parse(readFileSync('docs/microservices.json', 'utf8'));

const fanIn = {};
for (const api of micro.apis) {
  for (const dep of api.dependencies ?? []) {
    fanIn[dep.id] = (fanIn[dep.id] ?? 0) + 1;
  }
}

const groups = {};
for (const g of micro.groups) {
  groups[g.name] = {
    colour: g.colour,
    ...(g.info ? { info: g.info } : {}),
  };
}

const knownIds = new Set(micro.apis.map((a) => a.id));

const services = {};
for (const api of micro.apis) {
  const entry = { group: api.group };

  if (api.type) entry.type = api.type;
  if (api.description) entry.description = api.description;
  if (api.repository) entry.repository = api.repository;

  // Whether the old registry claimed a published spec. Frontends and schedulers
  // legitimately have none, so this distinguishes "no spec expected" from
  // "expected a spec and it is missing", which is a broken link.
  if (api.spec || api.urls?.length) {
    entry.expectsSpec = true;
    const claimed = [
      ...(api.spec ? [api.spec] : []),
      ...(api.urls ?? []).map((u) => u.url),
    ].map((u) => u.split('/').pop());
    entry.claimedSpecFiles = [...new Set(claimed)];
  }

  if (AMBIENT.has(api.id)) {
    // Rendered as a chip on each consumer rather than as edges into a hub.
    entry.ambient = true;
    entry.ambientFanIn = fanIn[api.id] ?? 0;
  }

  const deps = (api.dependencies ?? []).filter((d) => knownIds.has(d.id));
  if (deps.length > 0) {
    entry.dependsOn = deps.map((d) => (d.hard ? d.id : { id: d.id, hard: false }));
  }

  const dangling = (api.dependencies ?? []).filter((d) => !knownIds.has(d.id));
  if (dangling.length > 0) {
    entry.unresolvedDependencies = dangling.map((d) => d.id);
  }

  services[api.id] = entry;
}

const out = {
  // Written by bin/migrate-registry.mjs from docs/microservices.json.
  appTypes: micro.appTypes,
  groups,
  services,
};

writeFileSync(
  'registry.yaml',
  `# Facts about CFT services that cannot be derived from their OpenAPI specs:\n` +
    `# group membership, dependency edges, and prose descriptions.\n` +
    `#\n` +
    `# Everything else (title, version, path count, freshness, ownership) is\n` +
    `# derived by model/build.mjs. Adding a service here is NOT required for its\n` +
    `# spec to appear in the portal — every file in docs/specs/ is published.\n` +
    `#\n` +
    `# 'ambient: true' marks ubiquitous infrastructure (auth, S2S). Its inbound\n` +
    `# edges are drawn as chips on each consumer instead of as lines into a hub,\n` +
    `# which is what made the old network graph unreadable.\n\n` +
    stringify(out, { lineWidth: 100 }),
);

const ambient = Object.entries(services).filter(([, s]) => s.ambient);
const withDangling = Object.entries(services).filter(([, s]) => s.unresolvedDependencies);

console.log(`registry.yaml written`);
console.log(`  groups:   ${Object.keys(groups).length}`);
console.log(`  services: ${Object.keys(services).length}`);
console.log(`  ambient:  ${ambient.map(([id, s]) => `${id} (${s.ambientFanIn})`).join(', ')}`);
console.log(`  services with unresolved dependencies: ${withDangling.length}`);
