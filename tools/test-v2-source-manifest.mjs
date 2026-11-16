import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateManifest, checkInstalledFiles } from './check-v2-source-manifest.mjs';

const manifestPath = fileURLToPath(new URL('../public/ruleset/manifest.json', import.meta.url));
const current = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const hash = x => createHash('sha256').update(x).digest('hex');

test('published manifest contains 16 rules and the matching translation metadata', () => {
  assert.deepEqual(validateManifest(current), []);
  assert.equal(current.files.filter(x => x.path.startsWith('Ruleset/')).length, 16);
});
test('rejects invalid source version and public hosting claim', () => {
  const changed = { ...current, sourceVersion: 'v.o1.1.1', hostedRuleset: true };
  assert.match(validateManifest(changed).join(';'), /Expected X-Piratez v.o2/);
  assert.match(validateManifest(changed).join(';'), /must not be represented/);
});
test('rejects unsafe path, duplicate and invalid digest', () => {
  const changed = structuredClone(current);
  changed.files[0].path = 'Ruleset/../bad.rul';
  changed.files[1].sha256 = 'invalid';
  assert.match(validateManifest(changed).join(';'), /unsafe or unexpected/);
  assert.match(validateManifest(changed).join(';'), /Invalid SHA-256/);
  const duplicate = structuredClone(current);
  duplicate.files[0].path = duplicate.files[1].path;
  assert.match(validateManifest(duplicate).join(';'), /Duplicate path/);
});
test('detects missing, mismatch and untracked override without touching real game files', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xpz-source-guard-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const tiny = {
    files: [
      { path: 'Ruleset/Piratez.rul', bytes: 3, sha256: hash('abc') },
      { path: 'Language/ko.yml', bytes: 3, sha256: hash('한') }
    ]
  };
  assert.match(checkInstalledFiles(tiny, root).join(';'), /Missing local file/);
  fs.mkdirSync(path.join(root, 'Ruleset'));
  fs.mkdirSync(path.join(root, 'Language'));
  fs.writeFileSync(path.join(root, 'Ruleset', 'Piratez.rul'), 'abc');
  fs.writeFileSync(path.join(root, 'Language', 'ko.yml'), '한');
  assert.deepEqual(checkInstalledFiles(tiny, root), []);
  fs.writeFileSync(path.join(root, 'Ruleset', 'Piratez.rul'), 'abd');
  assert.match(checkInstalledFiles(tiny, root).join(';'), /SHA-256 mismatch/);
  fs.writeFileSync(path.join(root, 'Ruleset', 'Extra.rul'), 'x');
  assert.match(checkInstalledFiles(tiny, root).join(';'), /Untracked local ruleset/);
});
