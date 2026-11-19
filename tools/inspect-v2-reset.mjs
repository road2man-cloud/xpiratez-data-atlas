#!/usr/bin/env node
/**
 * Exact-version X-Piratez v.o2 SOLDIER TRANSFORMATION reset inspector.
 *
 * Uses the source-hashed v.o2 soldier index for immediately usable results.
 * With --source, also verifies the complete local installation and reports
 * whether reset is explicitly declared or supplied by OXCE defaults.
 *
 * node tools/inspect-v2-reset.mjs --query 위어드갈
 * node tools/inspect-v2-reset.mjs --query STR_WEIRDGAL_TRANSFORMATION --source <mod-root>
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import yaml from 'js-yaml';
import {validateManifest,checkInstalledFiles} from './check-v2-source-manifest.mjs';
import {mergeValues,flattenRefNode} from './build-v2-items.mjs';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
const indexFile=path.join(projectRoot,'public/data/soldiers-modern-index.json');
const manifestFile=path.join(projectRoot,'public/ruleset/manifest.json');
const STATS=['tu','stamina','health','bravery','reactions','firing','throwing',
  'strength','psiStrength','psiSkill','melee','mana'];

export const normalized=text=>String(text??'').normalize('NFKC').toLowerCase()
  .replace(/[\s_\-]+/g,'');

export function comparison(from,to) {
  return STATS.map(stat=>({
    stat,
    initialMaxFrom:from.maxStats?.[stat]??null,
    initialMaxTo:to.maxStats?.[stat]??null,
    initialMaxDelta:from.maxStats?.[stat]!==undefined&&to.maxStats?.[stat]!==undefined
      ? to.maxStats[stat]-from.maxStats[stat]:null,
    battleCapFrom:from.statCaps?.[stat]??null,
    battleCapTo:to.statCaps?.[stat]??null,
    battleCapDelta:from.statCaps?.[stat]!==undefined&&to.statCaps?.[stat]!==undefined
      ? to.statCaps[stat]-from.statCaps[stat]:null,
    trainingCapFrom:from.trainingStatCaps?.[stat]??null,
    trainingCapTo:to.trainingStatCaps?.[stat]??null,
    trainingCapDelta:from.trainingStatCaps?.[stat]!==undefined&&to.trainingStatCaps?.[stat]!==undefined
      ? to.trainingStatCaps[stat]-from.trainingStatCaps[stat]:null
  }));
}

export function findTransformations(index,query) {
  const term=normalized(query);
  if (!term) throw Error('Non-empty --query required');
  const targets=new Map(index.soldiers.map(s=>[s.id,s]));
  return index.transformations.filter(t=>{
    const produced=targets.get(t.producedSoldierType);
    return [t.id,t.koName,t.enName,t.producedSoldierType,
      produced?.koName,produced?.enName].some(name=>normalized(name).includes(term));
  });
}

function verifiedMetadata() {
  const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  const errors=validateManifest(manifest);
  if (errors.length) throw Error('Invalid v.o2 source manifest: '+errors.join('; '));
  const index=JSON.parse(fs.readFileSync(indexFile,'utf8'));
  if (index.meta?.mod?.version!=='v.o2') throw Error('Current soldier index is not v.o2');
  const expected=manifest.files.filter(f=>f.path.startsWith('Ruleset/'))
    .map(f=>[path.basename(f.path),f.sha256]);
  const observed=index.meta?.source?.rules?.map(f=>[f.file,f.sha256])??[];
  if (observed.length!==expected.length ||
    expected.some(([name,digest])=>!observed.some(([n,h])=>n===name&&h===digest))) {
    throw Error('Soldier index does not match the exact v.o2 manifest hashes');
  }
  return {manifest,index};
}

function actualTransformations(sourceRoot,manifest) {
  const errors=checkInstalledFiles(manifest,sourceRoot);
  if (errors.length) throw Error('Local v.o2 source mismatch: '+errors.join('; '));
  const entries=new Map(),provenance=new Map();
  for (const file of manifest.files.filter(f=>f.path.startsWith('Ruleset/'))) {
    const filename=path.join(sourceRoot,...file.path.split('/'));
    const docs=[];
    yaml.loadAll(fs.readFileSync(filename,'utf8').replace(/^\uFEFF/,''),
      doc=>{if(doc)docs.push(doc);},{json:true});
    for (const doc of docs) {
      if (!Array.isArray(doc?.soldierTransformation)) continue;
      for (const entry of doc.soldierTransformation) {
        if (typeof entry?.delete==='string') {
          entries.delete(entry.delete);
          provenance.delete(entry.delete);
          continue;
        }
        if (typeof entry?.name!=='string') throw Error('Unnamed soldierTransformation: '+file.path);
        const prior=entries.get(entry.name);
        entries.set(entry.name,prior?mergeValues(prior,entry):entry);
        const files=provenance.get(entry.name)??[];
        if (files.at(-1)!==file.path) files.push(file.path);
        provenance.set(entry.name,files);
      }
    }
  }
  return {entries,provenance};
}

function main(argv) {
  let query=null,source=null;
  const compareIds=[];
  for (let i=0;i<argv.length;i++) {
    if (argv[i]==='--query'&&argv[i+1]) query=argv[++i];
    else if (argv[i]==='--source'&&argv[i+1]) source=path.resolve(argv[++i]);
    else if (argv[i]==='--compare'&&argv[i+1]) compareIds.push(argv[++i]);
    else throw Error('Unknown/incomplete argument: '+argv[i]);
  }
  if (!query) throw Error('Usage: node tools/inspect-v2-reset.mjs --query 위어드갈 [--compare 미치광이] [--compare 싸움꾼] [--source <v.o2 mod root>]');
  const {index,manifest}=verifiedMetadata();
  const matches=findTransformations(index,query);
  if (!matches.length) throw Error('No matching v.o2 soldier transformation (not equivalent to reset:false): '+query);
  const local=source?actualTransformations(source,manifest):null;
  const list=matches.map(t=>{
    const produced=index.soldiers.find(s=>s.id===t.producedSoldierType);
    if (!produced) throw Error('Missing produced soldier type: '+t.producedSoldierType);
    const explicit=local?local.entries.get(t.id):null;
    if (local&&!explicit) throw Error('Indexed transformation missing in verified source: '+t.id);
    const effective=explicit?flattenRefNode(explicit):null;
    const effectiveReset=effective?(effective.reset??false):t.reset;
    if (effective&&effectiveReset!==t.reset) throw Error('Reset does not agree with v.o2 indexed transformation: '+t.id);
    const inputs=(compareIds.length?compareIds:
      t.id==='STR_WEIRDGAL_TRANSFORMATION'?['STR_SOLDIER','STR_SOLDIER_S']:[]);
    const comparisons=inputs.map(input=>{
      const from=index.soldiers.find(s=>[s.id,s.koName,s.enName]
        .some(name=>normalized(name)===normalized(input)));
      if (!from) throw Error('Unknown --compare soldier: '+input);
      return {fromId:from.id,fromName:from.koName,
        toId:produced.id,toName:produced.koName,stats:comparison(from,produced)};
    });
    return {
      id:t.id,koName:t.koName,enName:t.enName,producedSoldierType:t.producedSoldierType,
      reset:effectiveReset,resetDeclaration:local
        ? Object.hasOwn(effective,'reset')?'declared (possibly via embedded refNode)':'default false'
        : 'v.o2 indexed effective value; explicitness unknown',
      resetRank:t.resetRank,rerollStats:t.rerollStats,
      upperBoundAtMaxStats:t.upperBoundAtMaxStats,
      upperBoundAtStatCaps:t.upperBoundAtStatCaps,
      upperBoundType:t.upperBoundType,
      lowerBoundAtMinStats:t.lowerBoundAtMinStats,
      directStatChange:t.flatOverallStatChange,appliedBonus:t.soldierBonusType,
      bonusStatChange:t.traitStats,fixedEffectiveDelta:t.fixedEffectiveDelta,
      sourceFiles:local?local.provenance.get(t.id):t.sourceFiles,
      comparisons
    };
  });
  console.log(JSON.stringify({
    sourceVersion:'v.o2',query,localSourceChecked:Boolean(local),
    notes:[
      'maxStats is the initial random generation bound, NOT the experience growth cap.',
      'Changing producedSoldierType does not by itself re-roll the existing soldier stats.',
      'reset controls accumulated transformation bonuses/history, NOT a random stat reroll.',
      'A missing rerollStats declaration is reported as null, not inferred as enabled.',
      'Transformation stat deltas and bonus deltas are separate; cap rules may affect application.'
    ],transformations:list
  },null,2));
}

if (process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {main(process.argv.slice(2));}
  catch(e){console.error('v.o2 reset inspector:',e.message);process.exitCode=1;}
}
