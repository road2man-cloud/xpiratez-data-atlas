#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Enumerate first-shot NATIVE OXCE action plans from the original .sav.
// NO simulated ballistics, hit chance, movement, AI, or invented legality checks.
// Actual OXCE validates every action during search-native.mjs runs.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256} from './prepare-native.mjs';

const SHOT_MODES=['snap','aimed','auto'];
const BAD_STATUS=new Set([5,6,7,10]); // SOURCE enum: collapsing/dead/unconscious/ignored
function scalar(v){
  const s=v.trim();
  if(/^-?\d+$/.test(s))return Number(s);
  if(s==='true')return true;
  if(s==='false')return false;
  const pos=/^\[\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\]$/.exec(s);
  if(pos)return pos.slice(1).map(Number);
  return s;
}
export function parseTacticalSave(source){
  const sections={units:[],items:[]};
  const seen={units:new Set(),items:new Set()};
  const count={units:0,items:0};
  let active='',item=null;
  for(const line of source.split(/\r?\n/)){
    const group=/^  (units|items):\s*$/.exec(line);
    if(group){active=group[1];count[active]++;item=null;continue;}
    if(/^  [A-Za-z_][\w-]*:/.test(line)){active='';item=null;continue;}
    if(!active)continue;
    const start=/^    - id:\s*(\d+)\s*$/.exec(line);
    if(start){
      const id=Number(start[1]);
      if(!Number.isSafeInteger(id)||seen[active].has(id))throw new Error('DUPLICATE_OR_INVALID_ID: '+active);
      seen[active].add(id);item={id};sections[active].push(item);continue;
    }
    if(!item)continue;
    const prop=/^      (type|genUnitType|faction|originalFaction|status|position|visible|health|stunlevel|inventoryslot|owner|ammoItem|ammoqty):\s*(.*)\s*$/.exec(line);
    if(prop)item[prop[1]]=scalar(prop[2]);
  }
  if(count.units!==1||count.items!==1||sections.units.length===0||sections.items.length===0)
    throw new Error('TACTICAL_SAVE_UNITS_OR_ITEMS_MISSING');
  for(const u of sections.units){
    if(!Number.isInteger(u.faction)||!Number.isInteger(u.status)||!Array.isArray(u.position)||u.position.length!==3||u.position.some(v=>!Number.isInteger(v)))
      throw new Error('INCOMPLETE_UNIT_STATE: '+u.id);
    if(u.originalFaction===undefined)u.originalFaction=u.faction;
  }
  for(const it of sections.items)if(typeof it.type!=='string')throw new Error('MISSING_ITEM_TYPE: '+it.id);
  return sections;
}
export function enumerateNativePlans(save,{modes=SHOT_MODES,endTurn=true,maxPlans=600}={}){
  if(!Array.isArray(modes)||!modes.length||modes.some(m=>!SHOT_MODES.includes(m))||new Set(modes).size!==modes.length)
    throw new Error('INVALID_SHOT_MODES');
  if(!Number.isSafeInteger(maxPlans)||maxPlans<1||maxPlans>10000)throw new Error('MAX_PLANS_OUT_OF_RANGE');
  const units=save.units,items=save.items;
  const allies=units.filter(u=>u.originalFaction===0&&u.faction===0&&!BAD_STATUS.has(u.status)).sort((a,b)=>a.id-b.id);
  const enemy=units.filter(u=>u.originalFaction===1&&u.faction===1&&u.visible===true&&!BAD_STATUS.has(u.status)).sort((a,b)=>a.id-b.id);
  const equipment=items.filter(i=>allies.some(u=>u.id===i.owner)&&['STR_LEFT_HAND','STR_RIGHT_HAND'].includes(i.inventoryslot))
    .sort((a,b)=>a.id-b.id);
  if(!allies.length)throw new Error('NO_CONTROLLABLE_ORIGINAL_ALLIES');
  if(!enemy.length)throw new Error('NO_VISIBLE_ORIGINAL_HOSTILES');
  if(!equipment.length)throw new Error('NO_HAND_ITEMS_FOR_ORIGINAL_ALLIES');
  const plans=[];
  for(const unit of allies){
    for(const item of equipment.filter(i=>i.owner===unit.id)){
      for(const hostile of enemy){
        for(const mode of modes){
          const [x,y,z]=hostile.position;
          // The engine may reject this mode, LOS, TU or ammo. This is a proposal only.
          const file='fire-u'+unit.id+'-item'+item.id+'-enemy'+hostile.id+'-'+mode+'.actions';
          const script=[
            '# Candidate only; OXCE determines whether this is a legal shot.',
            'observe',
            'fire '+unit.id+' '+item.id+' '+mode+' '+x+' '+y+' '+z,
            'observe',
            ...(endTurn?['end_turn','observe']:[]),
            'stop',
            ''
          ].join('\n');
          plans.push({name:file,actor:unit.id,item:item.id,itemType:item.type,
            target:hostile.id,targetPosition:[x,y,z],mode,script,sha256:sha256(Buffer.from(script))});
          if(plans.length>maxPlans)throw new Error('PLAN_COUNT_EXCEEDS_MAX: '+plans.length+
            ' (increase --max-plans explicitly, never silently omit candidates)');
        }
      }
    }
  }
  return {source:'SAVE_STATE_PROPOSALS_ONLY',engineEvaluated:false,
    originalAllies:allies.length,visibleOriginalHostiles:enemy.length,
    handItems:equipment.length,plans};
}
export function parseGenerationArgs(argv){
  if(argv.length<2)throw new Error('Usage: node generate-native-plans.mjs 17.sav NEW_PLAN_DIRECTORY [--modes snap,aimed,auto] [--no-end-turn] [--max-plans 600]');
  const [save,out,...rest]=argv;
  const options={modes:[...SHOT_MODES],endTurn:true,maxPlans:600};
  const seen=new Set();
  for(let i=0;i<rest.length;i++){
    const a=rest[i];
    if(seen.has(a))throw new Error('DUPLICATE_ARGUMENT: '+a);
    seen.add(a);
    if(a==='--no-end-turn')options.endTurn=false;
    else if(a==='--modes'){
      if(!rest[i+1]||rest[i+1].startsWith('--'))throw new Error('MISSING_MODES');
      options.modes=rest[++i].split(',');
    }else if(a==='--max-plans'){
      const n=rest[++i];
      if(!/^[1-9]\d*$/.test(n||''))throw new Error('INVALID_MAX_PLANS');
      options.maxPlans=Number(n);
    }else throw new Error('UNSUPPORTED_ARGUMENT: '+a);
  }
  return {save,out,options};
}
export function writeNativePlans(src,out,options={}){
  const save=fs.realpathSync(src);
  const st=fs.statSync(save);
  if(!st.isFile()||st.size>50*1024*1024)throw new Error('INVALID_OR_OVERSIZED_TACTICAL_SAVE');
  out=path.resolve(out);
  if(fs.existsSync(out))throw new Error('OUTPUT_ALREADY_EXISTS');
  if(out===save||out.startsWith(path.dirname(save)+path.sep))
    throw new Error('PLAN_OUTPUT_MUST_BE_OUTSIDE_SAVE_DIRECTORY');
  const bytes=fs.readFileSync(save);
  const data=parseTacticalSave(bytes.toString('utf8'));
  const result=enumerateNativePlans(data,options);
  fs.mkdirSync(out,{recursive:true});
  for(const candidate of result.plans)fs.writeFileSync(path.join(out,candidate.name),candidate.script,{flag:'wx'});
  const manifest={schema:1,backend:'OXCE_NATIVE_PLAN_ENUMERATOR',engineEvaluated:false,
    sourceSaveSha256:sha256(bytes),source:result.source,
    originalAllies:result.originalAllies,visibleOriginalHostiles:result.visibleOriginalHostiles,
    handItems:result.handItems,planCount:result.plans.length,
    candidates:result.plans.map(({script,...p})=>p)};
  fs.writeFileSync(path.join(out,'plan-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const {save,out,options}=parseGenerationArgs(process.argv.slice(2));
    const result=writeNativePlans(save,out,options);
    console.log(JSON.stringify({backend:result.backend,engineEvaluated:false,planCount:result.planCount,
      originalAllies:result.originalAllies,visibleOriginalHostiles:result.visibleOriginalHostiles},null,2));
  }catch(e){console.error('NATIVE_PLAN_GENERATION_FAILED: '+e.message);process.exitCode=1;}
}
