import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mergeItemDocuments, makeItemRows, flattenRefNode } from './build-v2-items.mjs';
import { validateV2ItemIndex } from './check-items-v2.mjs';

const data = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../public/data/items-v2-index.json', import.meta.url)), 'utf8'));
const manifestBytes = fs.readFileSync(fileURLToPath(new URL('../public/ruleset/manifest.json', import.meta.url)));
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const manifestHash = createHash('sha256').update(manifestBytes).digest('hex');

test('published v.o2 item index passes its version and provenance guards', () => {
  assert.deepEqual(validateV2ItemIndex(data, manifest, manifestHash), []);
  assert.equal(data.items.length, 4014);
  assert.equal(data.meta.withKoreanNames, 3073);
});
test('item overrides, array replacement, inline refNode and deletes are honored', () => {
  const records = [
    { file: 'Piratez.rul', docs: [{ items: [
      { type: 'STR_TEST_ONE', weight: 3, categories: ['A'], costAimed: { time: 8, energy: 3 } },
      { type: 'STR_DELETE_ME', costSell: 90 }
    ] }] },
    { file: 'Piratez_Factions.rul', docs: [{ items: [
      { type: 'STR_TEST_ONE', weight: 8, categories: ['B'], costAimed: { time: 5 } },
      { delete: 'STR_DELETE_ME' },
      { type: 'STR_NEW', refNode: { power: 10, costMelee: { time: 9 } }, power: 13 }
    ] }] }
  ];
  const merged = mergeItemDocuments(records);
  const rows = makeItemRows(merged, { STR_TEST_ONE: '시험 아이템' }, {});
  assert.equal(rows.length, 2);
  const one = rows.find(x => x.id === 'STR_TEST_ONE');
  assert.deepEqual(one.sourceFiles, ['Piratez.rul', 'Piratez_Factions.rul']);
  assert.deepEqual(one.fields.categories, ['B']);
  assert.deepEqual(one.fields.costAimed, { time: 5, energy: 3 });
  assert.equal(one.fields.weight, 8);
  assert.equal(one.koName, '시험 아이템');
  assert.equal(rows.find(x => x.id === 'STR_NEW').fields.power, 13);
  assert.equal(merged.deleted, 1);
  assert.ok(!rows.some(x => x.id === 'STR_DELETE_ME'));
});
test('missing translation remains null rather than guessing from obsolete indexes', () => {
  const merged = mergeItemDocuments([{ file: 'Piratez.rul', docs: [{ items: [{ type: 'STR_UNTRANSLATED', power: 10 }] }] }]);
  const rows = makeItemRows(merged, {}, {});
  assert.equal(rows[0].koName, null);
  assert.equal(rows[0].enName, null);
});
test('reject invalid refNode and missing item identity', () => {
  assert.throws(() => flattenRefNode({ refNode: 'STR_PARENT' }), /non-object/);
  assert.throws(() => mergeItemDocuments([{ file: 'x.rul', docs: [{ items: [{ power: 2 }] }] }]), /missing type/);
});
test('guard fails for untrusted metadata or tampered source inventory', () => {
  const altered = structuredClone(data);
  altered.meta.sourceVersion = 'v.o1.1.1';
  assert.match(validateV2ItemIndex(altered, manifest, manifestHash).join('; '), /Wrong item source/);
  const altered2 = structuredClone(data);
  altered2.meta.sourceFiles[0].sha256 = '0'.repeat(64);
  assert.match(validateV2ItemIndex(altered2, manifest, manifestHash).join('; '), /Source inventory SHA mismatch/);
  const altered3 = structuredClone(data);
  altered3.items[0].sourceFiles = ['legacy.rul'];
  assert.match(validateV2ItemIndex(altered3, manifest, manifestHash).join('; '), /Unverifiable item provenance/);
});
