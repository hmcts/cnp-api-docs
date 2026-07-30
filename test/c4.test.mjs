// Guards the LikeC4 sources against the failure mode that made the old diagrams
// untrustworthy: docs/lld/*.html and the Structurizr PNGs were committed
// artifacts that nothing regenerated, so they drifted from the registry.
//
// These files are generated, so the assertions are about the generator staying
// consistent with the model rather than about their exact content.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

import { build } from '../model/build.mjs';

const GENERATED = 'c4/generated.c4';
const VIEWS_GENERATED = 'c4/views.generated.c4';
const VIEWS_HAND = 'c4/views.c4';

function regenerate() {
  execFileSync('node', ['bin/generate-c4.mjs'], { encoding: 'utf8' });
  execFileSync('node', ['bin/generate-c4-views.mjs'], { encoding: 'utf8' });
}

test('the generated C4 sources are up to date with the model', () => {
  assert.ok(existsSync(GENERATED), 'run `yarn generate-c4`');
  const before = readFileSync(GENERATED, 'utf8');
  const viewsBefore = readFileSync(VIEWS_GENERATED, 'utf8');

  regenerate();

  assert.equal(readFileSync(GENERATED, 'utf8'), before, 'c4/generated.c4 is stale');
  assert.equal(readFileSync(VIEWS_GENERATED, 'utf8'), viewsBefore, 'c4/views.generated.c4 is stale');
});

test('every grouped service appears in the C4 model', () => {
  const model = build();
  const dsl = readFileSync(GENERATED, 'utf8');
  const grouped = Object.values(model.services).filter((s) => s.group);

  const missing = grouped.filter((s) => !dsl.includes(`'${s.id}'`));
  assert.deepEqual(missing.map((s) => s.id), [], 'these services would be invisible in diagrams');
});

test('ambient infrastructure is tagged so views can exclude it', () => {
  const model = build();
  const dsl = readFileSync(GENERATED, 'utf8');
  const ambient = Object.values(model.services).filter((s) => s.ambient && s.group);
  assert.ok(ambient.length > 0);

  // Each ambient element must carry #ambient, otherwise `exclude element.tag =
  // #ambient` silently stops removing the 43% of edges that are just auth.
  for (const s of ambient) {
    const block = dsl.slice(dsl.indexOf(`'${s.id}'`));
    assert.match(block.slice(0, 200), /#ambient/, `${s.id} is not tagged #ambient`);
  }
});

test('actor and callback edges are present in the C4 model', () => {
  const dsl = readFileSync(GENERATED, 'utf8');
  assert.match(dsl, /citizen = actor/);
  assert.match(dsl, /caseworker = actor/);
  assert.match(dsl, /-> pcs_api 'callbacks'/);
});

test('descriptions carry no HTML into the diagrams', () => {
  // Group blurbs were written for an HTML page; the renderer shows them verbatim.
  const dsl = readFileSync(GENERATED, 'utf8');
  const htmlish = dsl.split('\n').filter((l) => /description '.*<[a-z/]/.test(l));
  assert.deepEqual(htmlish, []);
});

test('hand-written views do not use unscoped actor wildcards', () => {
  // `citizen -> *` pulls every other group's frontend into a group view, which is
  // how the PCS citizen journey ended up showing DARTS, NFDIV and Probate.
  const views = readFileSync(VIEWS_HAND, 'utf8');
  const offending = views
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^(citizen|caseworker) -> \*/.test(l));
  assert.deepEqual(offending, []);
});
