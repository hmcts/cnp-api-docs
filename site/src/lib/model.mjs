// Loads model/model.json, the single input to this site.
//
// The model is derived and gitignored, so it must be built first — `yarn dev`
// and `yarn build` both do that. A dynamic import of the builder would be
// rewritten by the bundler, so fail with a clear instruction instead.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Resolved from the working directory, not from import.meta.url: the bundler
// relocates this module into .astro/.prerender/chunks/ during a build, which
// breaks any path relative to the source file. Astro always runs from site/.
const repoRoot = resolve(process.cwd(), '..');
const modelPath = join(repoRoot, 'model', 'model.json');

if (!existsSync(modelPath)) {
  throw new Error(
    `model/model.json not found. Run \`yarn build-model\` in the repo root first ` +
      `(\`yarn dev\` and \`yarn build\` in site/ do this for you).`,
  );
}

export const model = JSON.parse(readFileSync(modelPath, 'utf8'));

export const services = Object.values(model.services);

// Ranking matters more than completeness here. Surfacing 102 previously hidden
// specs makes a flat alphabetical list noisier, not more useful, so order by
// how alive a service looks: recently-published and documented first.
const FRESHNESS_RANK = { fresh: 0, ageing: 1, stale: 2, abandoned: 3, unpublished: 4 };

export function rankedServices(list = services) {
  return [...list].sort((a, b) => {
    const af = FRESHNESS_RANK[freshnessOf(a)] ?? 4;
    const bf = FRESHNESS_RANK[freshnessOf(b)] ?? 4;
    if (af !== bf) return af - bf;
    // Within a band, richer APIs first, then alphabetically for stability.
    const ap = pathCountOf(b) - pathCountOf(a);
    if (ap !== 0) return ap;
    return a.id.localeCompare(b.id);
  });
}

export function freshnessOf(service) {
  if (service.specs.length === 0) return 'unpublished';
  const best = Math.min(...service.specs.map((s) => s.ageDays ?? Infinity));
  if (!Number.isFinite(best)) return 'unpublished';
  if (best < 90) return 'fresh';
  if (best < 365) return 'ageing';
  if (best < 730) return 'stale';
  return 'abandoned';
}

export function pathCountOf(service) {
  return service.specs.reduce((n, s) => n + (s.pathCount ?? 0), 0);
}

export function hasSpec(service) {
  return service.specs.some((s) => s.valid);
}

// Slug for a service page. Spec filenames are already URL-safe, but registry ids
// can contain characters that are not.
export function slugFor(id) {
  return id.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

export const groups = Object.values(model.groups).sort((a, b) => a.name.localeCompare(b.name));

export function specsOf(service) {
  return [...service.specs].sort((a, b) => (a.variant ?? '').localeCompare(b.variant ?? ''));
}

export const counts = model.counts;
export const warnings = model.warnings;
