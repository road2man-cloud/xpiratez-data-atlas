#!/usr/bin/env node
/**
 * Inspect an exact-version local X-Piratez v.o2 ruleset for soldier rest flags.
 * Never reads archived 1.1 rules, and never publishes source rules.
 *
 * node tools/inspect-v2-rest.mjs --source "C:/.../XPiratez" --query "위어드 갈"
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import yaml from 'js-yaml';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i < 0 ? null : process.argv[i + 1];
}
const source = arg('--source');
const query = arg('--query');
if (!source || !query) {
  console.error('Usage: node tools/inspect-v2-rest.mjs --source <v.o2 mod directory> --query <ID or Korean/English name>');
  process.exit(2);
}
const manifestPath = 'public/ruleset/manifest.json';
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.sourceVersion !== 'v.o2' || manifest.hostedRuleset !== false) {
  throw Error('Expected local-only v.o2 manifest; refusing unknown source');
}
const expected = manifest.files.filter(f => f.path.startsWith('Ruleset/') && f.path.endsWith('.rul'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sections = new Map();
const locations = new Map();
for (const entry of expected) {
  const filename = path.join(source, ...entry.path.split('/'));
  const bytes = fs.readFileSync(filename);
  if (bytes.length !== entry.bytes || hash(bytes) !== entry.sha256) {
    throw Error('Local v.o2 file does not match expected source: ' + entry.path);
  }
  const docs = [];
  yaml.loadAll(bytes.toString('utf8').replace(/^\uFEFF/, ''), doc => docs.push(doc), {json:true});
  for (const doc of docs) {
    if (!doc || typeof doc !== 'object') continue;
    for (const [section, values] of Object.entries(doc)) {
      if (!Array.isArray(values)) continue;
      if (!sections.has(section)) sections.set(section, new Map());
      const bucket = sections.get(section);
      for (const row of values) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
        const id = row.type ?? row.id ?? row.name;
        if (typeof id !== 'string') continue;
        if (row.delete) { bucket.delete(id); continue; }
        // Ruleset layering: later entries override only explicitly declared keys.
        const key = section + '/' + id;
        bucket.set(id, {...(bucket.get(id) ?? {}), ...row});
        locations.set(key, [...(locations.get(key) ?? []), entry.path]);
      }
    }
  }
}
const names = new Map();
for (const loc of ['Language/ko.yml','Language/en-US.yml']) {
  const file = manifest.files.find(f => f.path === loc);
  if (!file) continue;
  const bytes = fs.readFileSync(path.join(source, ...loc.split('/')));
  if (hash(bytes) !== file.sha256 || bytes.length !== file.bytes) {
    throw Error('Translation source mismatch: ' + loc);
  }
  try {
    const data = yaml.load(bytes.toString('utf8').replace(/^\uFEFF/, ''), {json:true});
    const dictionary = data?.ko ?? data?.['en-US'] ?? data;
    for (const [id, value] of Object.entries(dictionary ?? {})) {
      if (typeof value === 'string') names.set(id, [...(names.get(id) ?? []), value]);
    }
  } catch (e) {
    console.error('Translation could not be parsed: ' + loc + ' (' + e.message + ')');
  }
}
const normalize = s => String(s).normalize('NFKC').toLowerCase().replace(/[\s_\-]+/g, '');
const needle = normalize(query);
const matches = [];
for (const [section, entries] of sections) {
  for (const [id, row] of entries) {
    const labels = [id, ...(names.get(id) ?? [])];
    if (labels.some(n => normalize(n).includes(needle))) {
      matches.push({section,id,row,labels});
    }
  }
}
if (!matches.length) {
  console.log(JSON.stringify({sourceVersion:'v.o2',query,status:'NOT_FOUND',note:'No matching rule; do not infer rest:false.'},null,2));
  process.exitCode = 1;
} else {
  const output = matches.map(({section,id,row,labels}) => {
    const chain = [], visited = new Set();
    let currentId = id;
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const node = sections.get(section)?.get(currentId);
      if (!node) { chain.push({id:currentId,status:'MISSING_PARENT'}); break; }
      const explicit = Object.hasOwn(node,'rest');
      chain.push({
        id:currentId,
        rest:explicit ? node.rest : null,
        explicit,
        sourceFiles:locations.get(section+'/'+currentId) ?? []
      });
      if (explicit) break;
      currentId = typeof node.refNode === 'string' ? node.refNode : null;
    }
    const winner = chain.find(c => c.explicit);
    return {
      section,id,labels,restStatus:winner ? 'EXPLICIT_OR_INHERITED' : 'UNSPECIFIED',
      effectiveRest:winner ? winner.rest : null,
      sourceId:winner?.id ?? null,
      inheritanceChain:chain,
      caveat:'UNSPECIFIED is not equivalent to false; engine defaults and runtime transformations are not evaluated.'
    };
  });
  console.log(JSON.stringify({sourceVersion:'v.o2',query,matches:output},null,2));
}
