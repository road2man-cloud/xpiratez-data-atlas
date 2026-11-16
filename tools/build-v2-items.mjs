// Independent X-Piratez 2.1 mod-defined item extraction.
// Do not load or overwrite the historical v.o1.1.1 atlas.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { validateManifest, checkInstalledFiles } from './check-v2-source-manifest.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = path.join(projectRoot, 'public', 'ruleset', 'manifest.json');
const defaultOut = path.join(projectRoot, 'public', 'data', 'items-v2-index.json');
const sourceVersion = 'v.o2';

// Only explicitly declared rule fields are emitted. Do not invent engine defaults.
export const ITEM_FIELDS = [
  'battleType', 'categories', 'size', 'weight', 'costBuy', 'costSell',
  'power', 'meleePower', 'damageType', 'damageBonus', 'damageAlter',
  'armor', 'clipSize', 'maxRange', 'minRange', 'aimRange', 'dropoff',
  'accuracyAimed', 'accuracySnap', 'accuracyAuto', 'accuracyMelee', 'accuracyThrow',
  'tuAimed', 'tuSnap', 'tuAuto', 'tuMelee', 'tuThrow',
  'costAimed', 'costSnap', 'costAuto', 'costMelee', 'costThrow', 'costPrime',
  'costUse', 'costReload', 'costUnprime', 'costDefuse',
  'compatibleAmmo', 'ammo', 'ammoTypes', 'ammoItem',
  'twoHanded', 'fixedWeapon', 'waypoints', 'shotgunPellets',
  'blastRadius', 'explosionRadius', 'fuseTimer', 'fuseType', 'arcingShot',
  'requiresBuy', 'requires', 'supportedInventorySections', 'invWidth', 'invHeight',
  'experienceTrainingMode', 'ignoreInBaseDefense'
];

const shaBuffer = buffer => createHash('sha256').update(buffer).digest('hex');
const shaFile = file => shaBuffer(fs.readFileSync(file));
const loadDocs = file => {
  const docs = [];
  yaml.loadAll(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''), doc => {
    if (doc) docs.push(doc);
  }, { json: true });
  return docs;
};
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function mergeValues(before, after) {
  if (!isRecord(before) || !isRecord(after)) return after;
  const result = { ...before };
  for (const [key, value] of Object.entries(after))
    result[key] = Object.hasOwn(result, key) ? mergeValues(result[key], value) : value;
  return result;
}
export function flattenRefNode(entry, depth = 0) {
  if (!isRecord(entry)) return entry;
  if (depth > 32) throw new Error('refNode depth exceeds 32');
  const { refNode, ...child } = entry;
  if (refNode === undefined || refNode === null) return child;
  if (!isRecord(refNode)) throw new Error('Unexpected non-object refNode');
  return mergeValues(flattenRefNode(refNode, depth + 1), child);
}

export function mergeItemDocuments(records) {
  const items = new Map();
  const provenance = new Map();
  let deleted = 0, declarations = 0;
  for (const { file, docs } of records) {
    for (const doc of docs) {
      if (!isRecord(doc) || !Object.hasOwn(doc, 'items')) continue;
      if (!Array.isArray(doc.items)) throw new Error(`items section is not an array: ${file}`);
      for (const entry of doc.items) {
        if (!isRecord(entry)) throw new Error(`Non-object items entry: ${file}`);
        if (typeof entry.delete === 'string') {
          deleted++;
          items.delete(entry.delete);
          provenance.delete(entry.delete);
          continue;
        }
        if (typeof entry.type !== 'string' || !entry.type)
          throw new Error(`Items declaration missing type in ${file}`);
        declarations++;
        const old = items.get(entry.type);
        items.set(entry.type, old ? mergeValues(old, entry) : entry);
        const history = provenance.get(entry.type) || [];
        if (history.at(-1) !== file) history.push(file);
        provenance.set(entry.type, history);
      }
    }
  }
  return { items, provenance, deleted, declarations };
}
const nameOf = (locale, id) => {
  const v = locale[id];
  return typeof v === 'string' && v.trim() ? v.replaceAll('{NEWLINE}', '\n').trim() : null;
};
const readLocale = (source, code) => {
  const filename = path.join(source, 'Language', code + '.yml');
  if (!fs.existsSync(filename)) return { names: {}, sha256: null };
  const doc = yaml.load(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''), { json: true }) || {};
  const names = doc[code] || doc;
  if (!isRecord(names)) throw new Error(`Malformed locale file: ${code}`);
  return { names, sha256: shaFile(filename) };
};

export function makeItemRows(merged, ko, en) {
  const result = [];
  for (const [id, rule] of merged.items) {
    const effective = flattenRefNode(rule);
    const fields = {};
    for (const key of ITEM_FIELDS)
      if (Object.hasOwn(effective, key) && effective[key] !== null) fields[key] = effective[key];
    const koName = nameOf(ko, id);
    const enName = nameOf(en, id);
    const sourceFiles = merged.provenance.get(id) || [];
    if (!sourceFiles.length) throw new Error(`Missing rule provenance: ${id}`);
    result.push({ id, koName, enName, sourceFiles, fields });
  }
  return result.sort((a, b) => a.id.localeCompare(b.id, 'en'));
}

export function createIndex({ source, manifest, records, ko, en, enSha256 }) {
  const merged = mergeItemDocuments(records);
  const items = makeItemRows(merged, ko, en);
  if (items.length < 1000) throw new Error(`Too few v.o2 mod-defined items: ${items.length}`);
  const usedFields = new Set(items.flatMap(item => Object.keys(item.fields)));
  return {
    meta: {
      schema: 'xpiratez-v2-mod-items/v1',
      sourceVersion,
      versionLabel: 'X-Piratez 2.1 (v.o2)',
      sourceScope: 'mod-defined items only; excludes vanilla base and optional third-party overrides',
      values: 'explicit rule fields after deterministic rule-file merging and inline refNode expansion; no inferred OXCE defaults',
      translation: 'same installed mod Language/ko.yml; missing keys remain null',
      sourceManifestSha256: shaFile(manifestPath),
      manifestSourceDate: manifest.observedAtLocalDate,
      sourceFiles: manifest.files.map(({path: rel, sha256}) => ({ path: rel, sha256 })),
      englishLocaleSha256: enSha256,
      itemCount: items.length,
      declarations: merged.declarations,
      deletedDeclarations: merged.deleted,
      withKoreanNames: items.filter(item => item.koName).length,
      presentFields: [...usedFields].sort()
    },
    items
  };
}

export function buildIndexFromSource(source) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const errors = [...validateManifest(manifest), ...checkInstalledFiles(manifest, source)];
  if (errors.length) throw new Error('v.o2 source preflight failed: ' + errors.join(' | '));
  const metadata = yaml.load(fs.readFileSync(path.join(source, 'metadata.yml'), 'utf8'), { json: true });
  if (metadata?.version !== sourceVersion)
    throw new Error(`Expected v.o2 metadata, got ${metadata?.version}`);
  const ruleFiles = manifest.files.filter(x => x.path.startsWith('Ruleset/'))
    .map(x => path.basename(x.path)).sort((a, b) => a.localeCompare(b, 'en'));
  const records = ruleFiles.map(file => ({ file, docs: loadDocs(path.join(source, 'Ruleset', file)) }));
  const ko = readLocale(source, 'ko');
  const en = readLocale(source, 'en-US');
  if (ko.sha256 !== manifest.files.find(x => x.path === 'Language/ko.yml')?.sha256)
    throw new Error('Korean locale hash mismatch');
  return createIndex({ source, manifest, records, ko: ko.names, en: en.names, enSha256: en.sha256 });
}

export function run(args) {
  let source = process.env.XPIRATEZ_MOD_PATH || null, out = defaultOut, check = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source' && args[i + 1]) source = path.resolve(args[++i]);
    else if (args[i] === '--out' && args[i + 1]) out = path.resolve(args[++i]);
    else if (args[i] === '--check') check = true;
    else throw new Error('Unknown argument: ' + args[i]);
  }
  if (!source) throw new Error('Usage: node tools/build-v2-items.mjs --source <.../user/mods/Piratez> [--out PATH] [--check]');
  const index = buildIndexFromSource(source);
  const content = JSON.stringify(index) + '\n';
  if (check) {
    if (!fs.existsSync(out) || fs.readFileSync(out, 'utf8') !== content)
      throw new Error('The published v.o2 item index is absent or does not match the verified source');
  } else {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, content, 'utf8');
  }
  console.log(`X-Piratez v.o2 items: ${index.meta.itemCount}, translated: ${index.meta.withKoreanNames}, output: ${out}, mode: ${check ? 'check' : 'build'}`);
}

if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])).toLowerCase() === fs.realpathSync(fileURLToPath(import.meta.url)).toLowerCase()) {
  try { run(process.argv.slice(2)); }
  catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
}
