// Eight repos hotlink these PNGs from master. Renaming or dropping one breaks
// somebody else's README with no warning here, so the paths are pinned.
//
// Discovered late: deleting update-images.yml in the LikeC4 migration stopped
// them being regenerated, and nothing in this repo said they mattered.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync, statSync } from 'node:fs';

// Referenced by nfdiv-case-api, nfdiv-frontend, probate-back-office,
// probate-frontend, probate-business-service, probate-caveats-frontend,
// probate-orchestrator-service and probate-submit-service.
const HOTLINKED = [
  'docs/c4/nfdiv/images/structurizr-nfdiv-overview.png',
  'docs/c4/nfdiv/images/structurizr-nfdiv-citizen.png',
  'docs/c4/nfdiv/images/structurizr-nfdiv-caseworker.png',
  'docs/c4/probate/images/structurizr-probate-overview.png',
  'docs/c4/probate/images/structurizr-probate-citizen.png',
  'docs/c4/probate/images/structurizr-probate-caseworker.png',
];

for (const path of HOTLINKED) {
  test(`${path} exists and is a real image`, () => {
    assert.ok(existsSync(path), `${path} is hotlinked by another repo's README`);
    const { size } = statSync(path);
    assert.ok(size > 5000, `${path} is only ${size} bytes; a render probably failed`);
    // PNG magic number, so a truncated or HTML error page fails here.
    assert.deepEqual([...readFileSync(path).subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  });
}

test('the exporter targets exactly the hotlinked paths', () => {
  const src = readFileSync('bin/export-readme-pngs.mjs', 'utf8');
  for (const path of HOTLINKED) {
    const [, product] = /docs\/c4\/([^/]+)\//.exec(path);
    const view = /structurizr-[^-]+-([a-z]+)\.png/.exec(path)[1];
    assert.ok(src.includes(`'${view}'`), `exporter does not render the ${view} view`);
    assert.ok(src.includes(product), `exporter does not cover ${product}`);
  }
});

test('a workflow regenerates them', () => {
  const wf = '.github/workflows/update-readme-pngs.yml';
  assert.ok(existsSync(wf), 'nothing would keep the PNGs current');
  const src = readFileSync(wf, 'utf8');
  assert.match(src, /export-readme-pngs\.mjs/);
  // Model or view changes must trigger it, or the images silently go stale.
  assert.match(src, /registry\.yaml/);
  assert.match(src, /'c4\/\*\*'/);
});
