// Verify a published v.o2 item index without any local game installation.
// Refuse silently re-labeled 1.1 indexes or mismatched v.o2 source hashes.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ITEM_FIELDS } from './build-v2-items.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = path.join(repo, 'public/ruleset/manifest.json');
const indexPath = path.join(repo, 'public/data/items-v2-index.json');
const sha256 = content => createHash('sha256').update(content).digest('hex');

export function validateV2ItemIndex(index, manifest, manifestHash) {
  const errors = [];
  if (!index || typeof index !== 'object' || !index.meta) return ['Missing v.o2 item metadata'];
  const m = index.meta;
  if (m.schema !== 'xpiratez-v2-mod-items/v1' || m.sourceVersion !== 'v.o2')
    errors.push('Wrong item source schema/version');
  if (m.sourceManifestSha256 !== manifestHash) errors.push('Manifest SHA-256 mismatch');
  if (!Array.isArray(index.items)) return [...errors, 'Missing items array'];
  if (m.itemCount !== index.items.length || index.items.length < 1000)
    errors.push('Item count mismatch or implausible v.o2 index size');
  const manifestEntries = new Map((manifest.files || []).map(f => [f.path, f.sha256]));
  const sources = m.sourceFiles || [];
  if (!Array.isArray(sources) || sources.length !== manifestEntries.size)
    errors.push('Source inventory mismatch');
  else {
    for (const entry of sources)
      if (manifestEntries.get(entry.path) !== entry.sha256)
        errors.push('Source inventory SHA mismatch: ' + entry.path);
  }
  const allowedFiles = new Set([...manifestEntries.keys()]
    .filter(x => x.startsWith('Ruleset/')).map(x => path.basename(x)));
  const allowedFields = new Set(ITEM_FIELDS);
  const ids = new Set();
  let korean = 0, previous = '';
  for (const item of index.items) {
    if (!item || !/^[A-Za-z0-9_-]+$/.test(item.id || '') || ids.has(item.id))
      errors.push('Invalid or duplicated item ID: ' + String(item?.id));
    if (previous && previous.localeCompare(item.id, 'en') > 0) errors.push('Index must be sorted by ID');
    previous = item.id;
    ids.add(item.id);
    if (item.koName !== null && typeof item.koName !== 'string')
      errors.push('Invalid Korean label for: ' + item.id);
    if (item.koName) korean++;
    if (item.enName !== null && typeof item.enName !== 'string')
      errors.push('Invalid English label for: ' + item.id);
    if (!Array.isArray(item.sourceFiles) || !item.sourceFiles.length
      || item.sourceFiles.some(f => !allowedFiles.has(f)))
      errors.push('Unverifiable item provenance: ' + item.id);
    if (!item.fields || typeof item.fields !== 'object' || Array.isArray(item.fields))
      errors.push('Missing explicit item fields: ' + item.id);
    else for (const key of Object.keys(item.fields))
      if (!allowedFields.has(key)) errors.push('Unexpected field: ' + item.id + '.' + key);
    if (errors.length > 100) break;
  }
  if (korean !== m.withKoreanNames) errors.push('Korean label count mismatch');
  if (m.values?.includes('no inferred OXCE defaults') !== true)
    errors.push('Missing declaration-only value policy');
  return errors;
}

if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])).toLowerCase() === fs.realpathSync(fileURLToPath(import.meta.url)).toLowerCase()) {
  try {
    const manifestBytes = fs.readFileSync(manifestPath);
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const errors = validateV2ItemIndex(index, manifest, sha256(manifestBytes));
    if (errors.length) {
      for (const error of errors) console.error('v.o2 items:', error);
      process.exitCode = 1;
    } else console.log('v.o2 item index verified: ' + index.items.length + ' mod-defined items');
  } catch (error) {
    console.error('v.o2 item index verification failed:', error.message);
    process.exitCode = 1;
  }
}
