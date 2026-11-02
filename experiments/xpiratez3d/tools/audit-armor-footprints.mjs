#!/usr/bin/env node
// Read-only audit of installed X-Piratez *.rul armor footprints.
// It never copies proprietary armor definitions to the repository or modifies the game.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {planSpatialConversion, footprintToNativeCells} from './spatial-contract.mjs';

const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function need(ok, msg) {if(!ok) throw new Error(msg);}

/**
 * Extract only direct scalar armor attributes. Do not invent inherited values.
 * An appearance-only armor overlay may omit size even when the core rule has it.
 * Scan EVERY top-level armors: section without parsing massive sprite lists.
 */
export function extractArmorRules(source, label = 'ruleset.rul') {
  const rows=source.split(/\r?\n/), found=[];
  let inArmors=false, current=null;
  const flush=()=>{
    if(current)found.push(current);
    current=null;
  };
  for(let i=0;i<rows.length;i++){
    const line=rows[i], section=line.match(/^([A-Za-z][\w-]*):\s*(?:#.*)?$/);
    if(section){flush(); inArmors=section[1]==='armors';continue;}
    if(!inArmors)continue;
    const item=line.match(/^  - type:\s*([^\s#]+)/);
    if(item){
      flush();
      current={type:item[1],source:label,line:i+1,
        directSize:null,refNode:null,loftempsSet:null,movementType:null};
      continue;
    }
    if(!current)continue;
    const field=line.match(/^    ([\w-]+):\s*(.*?)\s*(?:#.*)?$/);
    if(!field)continue;
    const [,key,value]=field;
    if(key==='size'){
      const n=Number(value);
      need(Number.isSafeInteger(n) && n>=1 && n<=32,
        'Invalid armor size at '+label+':'+(i+1)+' '+value);
      current.directSize=n;
    }else if(key==='refNode'&&value){
      current.refNode=value;
    }else if(key==='loftempsSet'&&value){
      current.loftempsSet=value;
    }else if(key==='movementType'&&value){
      current.movementType=value;
    }
  }
  flush();
  return found;
}

/** Conflicting explicit sizes fail closed; missing size remains unresolved. */
export function combineArmorRules(recordLists) {
  const all=new Map();
  for(const records of recordLists)for(const rule of records){
    if(!all.has(rule.type))all.set(rule.type,[]);
    all.get(rule.type).push(rule);
  }
  const resolved=new Map();
  for(const [name,versions] of all){
    const explicitlySized=versions.filter(r=>r.directSize!=null);
    const values=[...new Set(explicitlySized.map(x=>x.directSize))];
    resolved.set(name, {
      type:name,
      sourceOverrides:versions.length,
      size:values.length===1?values[0]:null,
      sizeConfidence:values.length===1?'EXPLICIT_RULE':
        values.length>1?'CONFLICTING_EXPLICIT_RULES':'UNRESOLVED_OR_ENGINE_DEFAULT',
      conflicts:values.length>1?values:[],
      explicitFrom:explicitlySized.map(v=>({file:v.source,line:v.line,size:v.directSize})),
      refNodes:versions.filter(v=>v.refNode).map(v=>v.refNode),
      hasLoftReferences:versions.some(v=>v.loftempsSet!=null),
      // Even an explicit source footprint is not proof of a native S2 unit collider.
      nativeCollisionVerified:false,
    });
  }
  return resolved;
}
export function scanArmorDirectory(directory) {
  need(fs.statSync(directory).isDirectory(), 'Invalid installed ruleset directory');
  const files=fs.readdirSync(directory).filter(f=>f.toLowerCase().endsWith('.rul')).sort();
  const lists=[], fingerprints=[];
  for(const name of files){
    const original=fs.readFileSync(path.join(directory,name));
    lists.push(extractArmorRules(original.toString('utf8'), name));
    fingerprints.push({file:name,sha256:sha(original)});
  }
  return {rules:combineArmorRules(lists), fingerprints, fileCount:files.length,
    allDefinitions:lists.reduce((n,x)=>n+x.length,0)};
}
export function auditArmorFootprints(battle, catalog, plan = null) {
  need(battle?.schema==='xpz3d.battle-start.v1','Expected Stage24 manifest');
  plan??=planSpatialConversion({mapSize:battle.mission.mapSize});
  const bySize=new Map(),unresolved=new Map(),mapped=[],footprints=[];
  for(const u of battle.units){
    const rule=catalog.rules.get(u.armorRule);
    const size=(rule?.sizeConfidence==='EXPLICIT_RULE')?rule.size:null;
    if(size){
      bySize.set(size, (bySize.get(size)||0)+1);
      const entry={unitId:u.unitId, armorRule:u.armorRule, sourceSize:size,
        evidence:rule.explicitFrom, nativeActorFootprintVerified:false};
      mapped.push(entry);
      if(u.tile!=null){
        const f=footprintToNativeCells(plan,u.tile,[size,size]);
        footprints.push({unitId:u.unitId, tile:u.tile, nativeRectCells:f.nativeRectCells});
      }
    } else {
      const why=rule?rule.sizeConfidence:'MISSING_ARMOR_RULE';
      const key=u.armorRule||'NO_ARMOR_ID';
      if(!unresolved.has(key))unresolved.set(key,{armorRule:key,reason:why,count:0});
      unresolved.get(key).count++;
    }
  }
  // A size-2 actor at source (x,y) occupies (x,y) through (x+1,y+1).
  // Do NOT presume the source tile is its graphical center.
  const overlaps=[];
  for(const f of footprints){
    const other=footprints.filter(x=>x.unitId!==f.unitId &&
      rectOverlap(f.nativeRectCells,x.nativeRectCells));
    if(other.length)overlaps.push({unitId:f.unitId,intersectsNativeFootprints:other.map(x=>x.unitId)});
  }
  return {
    schema:'xpz3d.armor-footprints-audit.v1',
    sourceBattleId:battle.battleId,
    filesRead:catalog.fileCount,
    definitionsExamined:catalog.allDefinitions,
    fileFingerprints:catalog.fingerprints,
    roster:battle.units.length,
    actorsWithDirectRulesetSize:mapped.length,
    sizes:Object.fromEntries([...bySize.entries()].sort((a,b)=>a[0]-b[0])),
    unresolvedArmorRules:[...unresolved.values()],
    explicitSizedUnits:mapped,
    knownFootprintOverlaps:overlaps,
    notes:[
      'No size is guessed when missing, contradictory or inherited via unprocessed refNode.',
      'Source armor size is a square footprint in OXCE tiles, not the final S2 model width.',
      'Native S2 collider, animation constraints, mount/passenger geometry remain unverified.',
    ],
  };
}
function rectOverlap(a,b){
  return a[0]<b[0]+b[2] && b[0]<a[0]+a[2] &&
         a[1]<b[1]+b[3] && b[1]<a[1]+a[3];
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try {
    const args=process.argv.slice(2),o={};
    while(args.length){
      const key=args.shift();
      need(['--battle','--ruleset-dir'].includes(key)&&args.length>0,'Use --battle path --ruleset-dir path');
      o[key.slice(2)]=args.shift();
    }
    need(o.battle&&o['ruleset-dir'],'Both --battle and --ruleset-dir are required');
    const b=JSON.parse(fs.readFileSync(path.resolve(o.battle),'utf8'));
    const scan=scanArmorDirectory(path.resolve(o['ruleset-dir']));
    console.log(JSON.stringify(auditArmorFootprints(b,scan),null,2));
  }catch(e){
    console.error('[XPZ3D armor footprint] '+e.message);
    process.exitCode=1;
  }
}
