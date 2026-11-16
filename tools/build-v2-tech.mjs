// Independent 2.1 research/manufacture index from the verified local mod.
// No legacy atlas input is ever read.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { validateManifest, checkInstalledFiles } from './check-v2-source-manifest.mjs';
import { mergeValues, flattenRefNode } from './build-v2-items.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifestFile = path.join(root, 'public/ruleset/manifest.json');
const researchOut = path.join(root, 'public/data/research-v2-index.json');
const manufactureOut = path.join(root, 'public/data/manufacture-v2-index.json');
const itemIndexFile = path.join(root, 'public/data/items-v2-index.json');
const hash = x => createHash('sha256').update(x).digest('hex');
const shaFile = p => hash(fs.readFileSync(p));
const object = x => x && typeof x === 'object' && !Array.isArray(x);
const docsOf = file => {
  const docs = [];
  yaml.loadAll(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''), value => { if (value) docs.push(value); }, { json: true });
  return docs;
};

const FIELDS = {
  research: ['cost', 'points', 'needItem', 'destroyItem', 'dependencies', 'requires', 'requiresBaseFunc',
    'unlocks', 'getOneFree', 'getOneFreeProtected', 'disables', 'reenables', 'lookup',
    'neededItem', 'freeFrom', 'spawnedItem', 'item', 'listOrder', 'category'],
  manufacture: ['category', 'requires', 'requiresBaseFunc', 'requiredItems', 'producedItems', 'producedItem',
    'time', 'cost', 'space', 'points', 'listOrder', 'refund', 'multipleRandomProducts', 'spawnedItem',
    'item', 'craft', 'craftProduced', 'specialType', 'randomProducedItems']
};

export function mergeNamedSections(records, section) {
  if (!(section in FIELDS)) throw new Error('Unknown section: ' + section);
  const values = new Map(), provenance = new Map();
  let declarations = 0, deletionEntries = 0;
  for (const { file, docs } of records) {
    for (const doc of docs) {
      if (!object(doc) || !(section in doc)) continue;
      if (!Array.isArray(doc[section])) throw new Error(section + ' must be array: ' + file);
      for (const entry of doc[section]) {
        if (!object(entry)) throw new Error('Invalid ' + section + ' declaration in ' + file);
        if (typeof entry.delete === 'string') {
          deletionEntries++;
          values.delete(entry.delete);
          provenance.delete(entry.delete);
          continue;
        }
        if (typeof entry.name !== 'string' || !entry.name) throw new Error('Missing ' + section + ' name: ' + file);
        declarations++;
        values.set(entry.name, values.has(entry.name) ? mergeValues(values.get(entry.name), entry) : entry);
        const sources = provenance.get(entry.name) || [];
        if (sources.at(-1) !== file) sources.push(file);
        provenance.set(entry.name, sources);
      }
    }
  }
  return { values, provenance, declarations, deletionEntries };
}

const locale = (source, code) => {
  const p = path.join(source, 'Language', code + '.yml');
  if (!fs.existsSync(p)) return {};
  const doc = yaml.load(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''), { json: true }) || {};
  const map = doc[code] || doc;
  if (!object(map)) throw new Error('Invalid language: ' + code);
  return map;
};
const label = (dict, id) => typeof dict[id] === 'string' && dict[id].trim()
  ? dict[id].replaceAll('{NEWLINE}', '\n').trim() : null;
const strings = x => Array.isArray(x) ? x.filter(v => typeof v === 'string') : typeof x === 'string' ? [x] : [];

export function makeRows(part, section, ko, en) {
  const allowed = FIELDS[section];
  const rows = [];
  for (const [id, original] of part.values) {
    const effective = flattenRefNode(original);
    const fields = {};
    for (const key of allowed) if (Object.hasOwn(effective, key) && effective[key] !== null)
      fields[key] = effective[key];
    rows.push({
      id, koName: label(ko, id), enName: label(en, id),
      sourceFiles: part.provenance.get(id), fields
    });
  }
  return rows.sort((a,b) => a.id.localeCompare(b.id, 'en'));
}
const refs = (x) => {
  if (!object(x)) return [];
  return Object.keys(x).filter(k => typeof k === 'string');
};

export function attachLinks(research, manufacture, items) {
  const itemIds = new Set(items.map(x => x.id));
  const researchIds = new Set(research.map(x => x.id));
  const manufactureIds = new Set(manufacture.map(x => x.id));
  const fromResearch = new Map();
  for (const row of research) {
    for (const unlocked of strings(row.fields.unlocks)) {
      if (manufactureIds.has(unlocked)) {
        const a = fromResearch.get(unlocked) || [];
        a.push(row.id);
        fromResearch.set(unlocked,a);
      }
    }
  }
  for (const row of manufacture) {
    const fields = row.fields;
    const requires = strings(fields.requires);
    const inputs = refs(fields.requiredItems);
    const outputs = refs(fields.producedItems);
    // The manufacture name may denote a resulting item only when it matches a known item ID.
    if (!outputs.length && itemIds.has(row.id)) outputs.push(row.id);
    const missing = [...inputs,...outputs].filter(x=>!itemIds.has(x));
    row.links = {
      prerequisiteResearch: requires.filter(x=>researchIds.has(x)),
      unlockedByResearch: fromResearch.get(row.id) || [],
      requiredItems: inputs.filter(x=>itemIds.has(x)),
      producedItems: outputs.filter(x=>itemIds.has(x)),
      unresolvedItemRefs: [...new Set(missing)]
    };
  }
  const manufactureByResearch = new Map();
  for (const row of manufacture) {
    for (const id of row.links.prerequisiteResearch) {
      const a=manufactureByResearch.get(id)||[];a.push(row.id);manufactureByResearch.set(id,a);
    }
  }
  for (const row of research) {
    row.links = {
      prerequisiteResearch: strings(row.fields.dependencies).filter(x=>researchIds.has(x)),
      manufactureUnlocked: [...new Set([...(manufactureByResearch.get(row.id)||[]),
        ...strings(row.fields.unlocks).filter(x=>manufactureIds.has(x))])],
      directlyNamedItems: strings(row.fields.unlocks).filter(x=>itemIds.has(x))
    };
  }
}

export function build(source, { itemsFile = itemIndexFile } = {}) {
  const manifestBytes=fs.readFileSync(manifestFile);
  const manifest=JSON.parse(manifestBytes.toString('utf8'));
  const errors=[...validateManifest(manifest),...checkInstalledFiles(manifest,source)];
  if(errors.length) throw new Error('2.1 source preflight: '+errors.join(' | '));
  const metadata=yaml.load(fs.readFileSync(path.join(source,'metadata.yml'),'utf8'),{json:true})||{};
  if(metadata.version!=='v.o2') throw new Error('Wrong mod metadata version: '+metadata.version);
  const itemBytes=fs.readFileSync(itemsFile);
  const itemIndex=JSON.parse(itemBytes.toString('utf8'));
  if(itemIndex.meta?.sourceVersion!=='v.o2'||itemIndex.meta.sourceManifestSha256!==hash(manifestBytes))
    throw new Error('Item 2.1 index has incompatible source version/hash');
  const itemSources=itemIndex.meta?.sourceFiles||[];
  if(itemSources.length!==manifest.files.length || itemSources.some(f=>manifest.files.find(x=>x.path===f.path)?.sha256!==f.sha256))
    throw new Error('Item 2.1 index source files do not match manifest');
  const ko=locale(source,'ko'),en=locale(source,'en-US');
  const ruleFiles=manifest.files.filter(f=>f.path.startsWith('Ruleset/'))
    .map(f=>path.basename(f.path)).sort((a,b)=>a.localeCompare(b,'en'));
  const records=ruleFiles.map(file=>({file,docs:docsOf(path.join(source,'Ruleset',file))}));
  const topics=mergeNamedSections(records,'research'), recipes=mergeNamedSections(records,'manufacture');
  const research=makeRows(topics,'research',ko,en),manufacture=makeRows(recipes,'manufacture',ko,en);
  if(research.length<1000||manufacture.length<1000) throw new Error('Implausibly small 2.1 dataset');
  attachLinks(research,manufacture,itemIndex.items);
  const metaCommon={
    sourceVersion:'v.o2', versionLabel:'X-Piratez 2.1', sourceScope:'mod-defined rules only; excludes vanilla and additional optional mod overrides',
    values:'fields explicitly declared in the merged v.o2 mod rules; no inferred OXCE defaults',
    sourceManifestSha256:hash(manifestBytes), itemIndexSha256:hash(itemBytes),
    sourceFiles:manifest.files.map(({path:relative,sha256})=>({path:relative,sha256})),
    translation:'same source Language/ko.yml; absent translations are null',
    relationScope:'direct literal IDs only; unresolved IDs retained; no proof of actual availability in a save'
  };
  return {
    research:{meta:{...metaCommon,schema:'xpiratez-v2-mod-research/v1',count:research.length,
      declarations:topics.declarations,deletionEntries:topics.deletionEntries,
      koreanLabels:research.filter(x=>x.koName).length},entries:research},
    manufacture:{meta:{...metaCommon,schema:'xpiratez-v2-mod-manufacture/v1',count:manufacture.length,
      declarations:recipes.declarations,deletionEntries:recipes.deletionEntries,
      koreanLabels:manufacture.filter(x=>x.koName).length},entries:manufacture}
  };
}
export function run(args) {
  let source=process.env.XPIRATEZ_MOD_PATH||null,check=false;
  let researchPath=researchOut,manufacturePath=manufactureOut;
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--source'&&args[i+1]) source=path.resolve(args[++i]);
    else if(args[i]==='--research-out'&&args[i+1]) researchPath=path.resolve(args[++i]);
    else if(args[i]==='--manufacture-out'&&args[i+1]) manufacturePath=path.resolve(args[++i]);
    else if(args[i]==='--check') check=true;
    else throw new Error('Unexpected argument: '+args[i]);
  }
  if(!source) throw new Error('Usage: node tools/build-v2-tech.mjs --source <v.o2 mod root> [--check]');
  const built=build(source);
  for(const [kind,output] of [['research',researchPath],['manufacture',manufacturePath]]) {
    const serialized=JSON.stringify(built[kind])+'\n';
    if(check) {
      if(!fs.existsSync(output)||fs.readFileSync(output,'utf8').replace(/\r\n/g,'\n')!==serialized)
        throw new Error(kind+' v.o2 data changed; regenerate explicitly');
    } else {
      fs.mkdirSync(path.dirname(output),{recursive:true});
      fs.writeFileSync(output,serialized);
    }
    console.log('v.o2 '+kind+': '+built[kind].meta.count+' rows, '+built[kind].meta.koreanLabels+' Korean labels; '+(check?'checked ':'wrote ')+output);
  }
}
if(process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])).toLowerCase() === fs.realpathSync(fileURLToPath(import.meta.url)).toLowerCase()) {
  try {run(process.argv.slice(2));} catch(e) {console.error(e.stack||e.message);process.exitCode=1;}
}
