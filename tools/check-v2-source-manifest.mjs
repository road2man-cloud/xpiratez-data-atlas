// Validate the metadata-only X-Piratez v.o2 source manifest and optionally
// check the installed source files. Never read legacy generated DB content.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const defaultManifest = fileURLToPath(new URL('../public/ruleset/manifest.json', import.meta.url));
const required = ['Ruleset/Piratez.rul', 'Language/ko.yml', 'metadata.yml'];
const hashPattern = /^[0-9a-f]{64}$/;

export function validateManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return ['Manifest must be an object'];
  if (manifest.schema !== 'xpiratez-local-source-reference/v2') errors.push('Unsupported manifest schema');
  if (manifest.sourceVersion !== 'v.o2') errors.push('Expected X-Piratez v.o2');
  if (manifest.hostedRuleset !== false) errors.push('Ruleset must not be represented as publicly hosted');
  if (!String(manifest.mode || '').includes('metadata-only')) errors.push('Manifest must be metadata-only');
  if (!Array.isArray(manifest.files)) return [...errors, 'files must be an array'];
  const seen = new Set();
  let rules = 0;
  for (const [index, file] of manifest.files.entries()) {
    if (!file || typeof file !== 'object') { errors.push(`files[${index}] is invalid`); continue; }
    const rel = file.path;
    if (typeof rel !== 'string' || !/^(?:Ruleset\/[A-Za-z0-9_.-]+\.rul|Language\/ko\.yml|metadata\.yml)$/.test(rel)
      || rel.includes('..')) { errors.push(`files[${index}] unsafe or unexpected path`); continue; }
    if (seen.has(rel)) errors.push(`Duplicate path: ${rel}`);
    seen.add(rel);
    if (rel.startsWith('Ruleset/')) rules++;
    if (!Number.isSafeInteger(file.bytes) || file.bytes <= 0) errors.push(`Invalid byte length: ${rel}`);
    if (typeof file.sha256 !== 'string' || !hashPattern.test(file.sha256)) errors.push(`Invalid SHA-256: ${rel}`);
  }
  for (const rel of required) if (!seen.has(rel)) errors.push(`Missing required entry: ${rel}`);
  if (rules !== 16) errors.push(`Expected 16 ruleset entries, found ${rules}`);
  if (seen.size !== 18) errors.push(`Expected 18 source entries, found ${seen.size}`);
  return errors;
}

export function checkInstalledFiles(manifest, sourceRoot) {
  const root = path.resolve(sourceRoot);
  const errors = [];
  for (const entry of manifest.files) {
    const full = path.join(root, ...entry.path.split('/'));
    if (!fs.existsSync(full)) { errors.push(`Missing local file: ${entry.path}`); continue; }
    const info = fs.lstatSync(full);
    if (!info.isFile() || info.isSymbolicLink()) { errors.push(`Not a regular file: ${entry.path}`); continue; }
    if (info.size !== entry.bytes) { errors.push(`Byte size mismatch: ${entry.path}`); continue; }
    const digest = createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    if (digest !== entry.sha256) errors.push(`SHA-256 mismatch: ${entry.path}`);
  }
  // A newly added .rul file could override the verified rules. Fail closed.
  const expectedRules = new Set(manifest.files.filter(f => f.path.startsWith('Ruleset/')).map(f => path.basename(f.path)));
  const rulesDir = path.join(root, 'Ruleset');
  if (fs.existsSync(rulesDir)) for (const name of fs.readdirSync(rulesDir)) {
    if (/\.rul$/i.test(name) && !expectedRules.has(name)) errors.push(`Untracked local ruleset: Ruleset/${name}`);
  }
  return errors;
}

function main(args) {
  let manifestPath = defaultManifest;
  let sourceRoot = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--manifest' && args[i + 1]) manifestPath = path.resolve(args[++i]);
    else if (args[i] === '--source-root' && args[i + 1]) sourceRoot = path.resolve(args[++i]);
    else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const errors = validateManifest(manifest);
  if (!errors.length && sourceRoot) errors.push(...checkInstalledFiles(manifest, sourceRoot));
  if (errors.length) {
    for (const error of errors) console.error('Source guard:', error);
    process.exitCode = 1;
  } else {
    console.log(sourceRoot
      ? `X-Piratez v.o2 source verified: ${manifest.files.length} local files`
      : `X-Piratez v.o2 manifest verified: ${manifest.files.length} metadata entries (local files NOT checked)`);
  }
}

if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])).toLowerCase() === fs.realpathSync(fileURLToPath(import.meta.url)).toLowerCase()) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error('Source guard:', error.message); process.exitCode = 1; }
}
