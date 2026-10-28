#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Generate ORIGINAL OXCE second-turn action plans from an actual saved battle.
// Candidate enumeration only. NO movement, LOS, damage, AI or RNG simulation.
// Invalid paths/targets are rejected by OXCE itself in search-native.mjs.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256} from './prepare-native.mjs';
import {parseTacticalSave} from './generate-native-plans.mjs';

const BAD_STATUS = new Set([5,6,7,10]);
const DIRECTIONS = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
function safeIds(v,name){
  if(v === undefined || v === null)return null;
  if(!Array.isArray(v)||!v.length||v.some(n=>!Number.isSafeInteger(n)||n<0)||
     new Set(v).size!==v.length)throw new Error('INVALID_'+name+'_IDS');
  return v;
}
export function enumerateNativeTurnPlans(battle,{focusId=1,supportIds=null,
    targetIds=null,moveRadius=2,maxPlans=160,includeShots=true}={}){
  if(!Number.isSafeInteger(focusId)||focusId<0)throw new Error('INVALID_FOCUS_ID');
  if(!Number.isSafeInteger(moveRadius)||moveRadius<0||moveRadius>5)
    throw new Error('INVALID_MOVE_RADIUS');
  if(!Number.isSafeInteger(maxPlans)||maxPlans<1||maxPlans>2000)
    throw new Error('INVALID_MAX_PLANS');
  safeIds(supportIds,'SUPPORT');safeIds(targetIds,'TARGET');
  const ally=battle.units.filter(u=>u.originalFaction===0&&u.faction===0&&!BAD_STATUS.has(u.status))
    .sort((a,b)=>a.id-b.id);
  const focus=ally.find(u=>u.id===focusId);
  if(!focus)throw new Error('FOCUS_IS_NOT_CONTROLLABLE_ORIGINAL_ALLY');
  const supports=supportIds==null?ally.filter(u=>u.id!==focusId).slice(0,4):
    supportIds.map(id=>{
      const found=ally.find(u=>u.id===id&&id!==focusId);
      if(!found)throw new Error('INVALID_SUPPORT_OR_NOT_CONTROLLABLE: '+id);
      return found;
    });
  // Kneel toggles stance in original OXCE: kneeling an already kneeled unit
  // would STAND it up, often exposing a soldier to reaction fire.
  const kneelEligible=supports.filter(u=>u.kneeled!==true);
  const visible=battle.units.filter(u=>u.originalFaction===1&&u.faction===1&&
    u.visible===true&&!BAD_STATUS.has(u.status)).sort((a,b)=>a.id-b.id);
  const targets=targetIds==null?visible:targetIds.map(id=>{
    const found=visible.find(u=>u.id===id);
    if(!found)throw new Error('TARGET_NOT_CURRENTLY_VISIBLE: '+id);
    return found;
  });
  // All coordinate and direction proposals are passed to ORIGINAL OXCE.
  // A geometrically in-bounds proposal is NOT claimed passable or shootable.
  const proposed=[],seen=new Set();
  const offer=(name,actions,kind,meta={})=>{
    const commands=['observe',...actions,'observe','end_turn','observe','stop',''];
    const script=commands.join('\n');
    if(seen.has(script))return;
    seen.add(script);
    proposed.push({name,kind,script,sha256:sha256(Buffer.from(script)),...meta});
  };
  offer('baseline-endturn.actions',[],'NO_ACTION_BASELINE');
  for(const s of kneelEligible)offer('kneel-u'+s.id+'.actions',['kneel '+s.id],'SUPPORT_KNEEL',{support:s.id});
  const [x,y,z]=focus.position;
  for(let radius=1;radius<=moveRadius;radius++)for(const [dx,dy] of DIRECTIONS){
    const tx=x+dx*radius,ty=y+dy*radius;
    if(tx<0||ty<0||tx>49||ty>49)continue;
    const move='move '+focus.id+' '+tx+' '+ty+' '+z;
    const name='move-u'+focus.id+'-'+tx+'-'+ty+'-'+z;
    offer(name+'.actions',[move],'FOCUS_MOVE',{focus:focus.id,destination:[tx,ty,z]});
    for(const s of kneelEligible)offer(name+'-kneel'+s.id+'.actions',[move,'kneel '+s.id],
      'FOCUS_MOVE_SUPPORT_KNEEL',{focus:focus.id,destination:[tx,ty,z],support:s.id});
  }
  for(const t of targets){
    const [tx,ty,tz]=t.position;
    offer('turn-u'+focus.id+'-toward'+t.id+'.actions',
      ['turn '+focus.id+' '+tx+' '+ty+' '+tz],'FOCUS_TURN',
      {focus:focus.id,target:t.id});
    for(const s of kneelEligible)offer('turn-u'+focus.id+'-toward'+t.id+'-kneel'+s.id+'.actions',
      ['turn '+focus.id+' '+tx+' '+ty+' '+tz,'kneel '+s.id],
      'FOCUS_TURN_SUPPORT_KNEEL',{focus:focus.id,target:t.id,support:s.id});
  }
  if(includeShots)for(const a of ally){
    const held=battle.items.filter(i=>i.owner===a.id&&
      (i.inventoryslot==='STR_RIGHT_HAND'||i.inventoryslot==='STR_LEFT_HAND'))
      .sort((i,j)=>i.id-j.id);
    for(const item of held)for(const t of targets)for(const mode of ['snap','aimed','auto']){
      const [tx,ty,tz]=t.position;
      offer('fire-u'+a.id+'-item'+item.id+'-target'+t.id+'-'+mode+'.actions',
        ['fire '+a.id+' '+item.id+' '+mode+' '+tx+' '+ty+' '+tz],
        'NATIVE_SHOT_PROPOSAL',{actor:a.id,item:item.id,target:t.id,mode});
    }
  }
  if(includeShots && targets.length) {
    // These are ORIGINAL input-adapter commands. The OXCE engine validates
    // whether inventory TU, available hands, ammunition, prime/throw arcs,
    // LOS, blast risk, and shot mode actually permit the attempt.
    for(const a of ally) {
      const equipment=battle.items.filter(i=>i.owner===a.id).sort((i,j)=>i.id-j.id);
      const left=equipment.find(i=>i.inventoryslot==='STR_LEFT_HAND');
      const right=equipment.find(i=>i.inventoryslot==='STR_RIGHT_HAND');
      const freeHand=!left?'left':!right?'right':null;
      for(const item of equipment) {
        const slot=item.inventoryslot||'';
        const held=slot==='STR_LEFT_HAND'||slot==='STR_RIGHT_HAND';
        const stored=slot==='STR_BACK_PACK'||slot==='STR_BELT';
        if(!held&&!stored)continue;
        if(/SSRL|ROCKET|LAUNCHER/.test(item.type)&&stored&&freeHand) {
          for(const t of targets)for(const mode of ['aimed','snap']) {
            const [tx,ty,tz]=t.position;
            offer('equip-fire-u'+a.id+'-item'+item.id+'-enemy'+t.id+'-'+mode+'.actions',
              ['inventory '+a.id+' '+item.id+' '+freeHand+' 0 0',
               'fire '+a.id+' '+item.id+' '+mode+' '+tx+' '+ty+' '+tz],
              'NATIVE_STORED_WEAPON_EQUIP_FIRE_PROPOSAL',
              {actor:a.id,item:item.id,target:t.id,mode,inventoryTarget:freeHand});
          }
        }
        if(/GRENADE|_BOMB/.test(item.type)) {
          for(const t of targets) {
            const [tx,ty,tz]=t.position;
            const equip=held?[]:freeHand?['inventory '+a.id+' '+item.id+' '+freeHand+' 0 0']:null;
            if(equip===null)continue;
            const primed=Number.isInteger(item.fuseTimer)&&item.fuseTimer>=0;
            for(const fuse of primed?[null]:[0,1]){
              const prime=fuse===null?[]:['prime '+a.id+' '+item.id+' '+fuse];
              const name='grenade-u'+a.id+'-item'+item.id+'-enemy'+t.id+
                '-fuse'+(fuse===null?'already':fuse)+'.actions';
              offer(name,[...equip,...prime,'throw '+a.id+' '+item.id+' '+tx+' '+ty+' '+tz],
                'NATIVE_GRENADE_THROW_PROPOSAL',{actor:a.id,item:item.id,target:t.id,
                  fuseState:primed?'ALREADY_PRIMED':'NATIVE_TO_VALIDATE',fuse});
            }
          }
        }
      }
    }
  }
  // Round robin across tactical categories prevents limited budgets from
  // silently starving rocket/grenade candidates behind mundane moves.
  // The manifest explicitly states how much of the proposed space was cut.
  const byKind=new Map();
  for(const p of proposed){
    if(!byKind.has(p.kind))byKind.set(p.kind,[]);
    byKind.get(p.kind).push(p);
  }
  const order=['NO_ACTION_BASELINE','FOCUS_MOVE','FOCUS_TURN',
    'NATIVE_SHOT_PROPOSAL','NATIVE_STORED_WEAPON_EQUIP_FIRE_PROPOSAL',
    'NATIVE_GRENADE_THROW_PROPOSAL','SUPPORT_KNEEL',
    'FOCUS_MOVE_SUPPORT_KNEEL','FOCUS_TURN_SUPPORT_KNEEL'];
  const kinds=[...order.filter(k=>byKind.has(k)),
    ...[...byKind.keys()].filter(k=>!order.includes(k))];
  const subset=[];
  let added=true;
  while(subset.length<maxPlans && added){
    added=false;
    for(const kind of kinds){
      const queue=byKind.get(kind);
      if(queue.length){
        subset.push(queue.shift());
        added=true;
        if(subset.length===maxPlans)break;
      }
    }
  }
  return {source:'ACTUAL_SAVE_CANDIDATES_ONLY',engineEvaluated:false,
    focusId:focus.id,focusPosition:[...focus.position],supportIds:supports.map(u=>u.id),
    kneelEligibleSupportIds:kneelEligible.map(u=>u.id),
    visibleTargetIds:targets.map(u=>u.id),allCandidates:proposed.length,
    selectedCount:subset.length,truncated:proposed.length>maxPlans,
    plans:subset};
}
export function parseNativeTurnArgs(argv){
  const [save,out,...flags]=argv;
  if(!save||!out)throw new Error('Usage: node generate-native-turn-plans.mjs TURN2.sav NEW_PLAN_DIRECTORY --focus 1 [--supports 12,19,33] [--targets 1000024,1000025] [--radius 2] [--max-plans 160] [--no-shots]');
  const opts={focusId:1,supportIds:null,targetIds:null,moveRadius:2,maxPlans:160,includeShots:true};
  const seen=new Set();
  for(let i=0;i<flags.length;i++){
    const f=flags[i];
    if(seen.has(f))throw new Error('DUPLICATE_ARGUMENT: '+f);
    seen.add(f);
    if(f==='--no-shots')opts.includeShots=false;
    else if(['--focus','--supports','--targets','--radius','--max-plans'].includes(f)){
      const val=flags[++i];if(!val||val.startsWith('--'))throw new Error('MISSING_ARGUMENT: '+f);
      if(f==='--supports'||f==='--targets'){
        if(!/^\d+(?:,\d+)*$/.test(val))throw new Error('INVALID_IDS: '+f);
        opts[f==='--supports'?'supportIds':'targetIds']=val.split(',').map(Number);
      }else {
        if(!/^\d+$/.test(val))throw new Error('INVALID_NUMBER: '+f);
        const n=Number(val);
        if((f==='--max-plans' && (n<1||n>2000))||
           (f==='--radius' && n>5)||!Number.isSafeInteger(n))
          throw new Error('NUMBER_OUT_OF_RANGE: '+f);
        opts[f==='--focus'?'focusId':f==='--radius'?'moveRadius':'maxPlans']=n;
      }
    }else throw new Error('UNSUPPORTED_ARGUMENT: '+f);
  }
  return {save,out,opts};
}
export function writeNativeTurnPlans(savePath,outputDir,opts={}){
  savePath=fs.realpathSync(savePath);
  const stat=fs.statSync(savePath);
  if(!stat.isFile()||stat.size>50*1024*1024)throw new Error('INVALID_INPUT_SAVE');
  outputDir=path.resolve(outputDir);
  if(fs.existsSync(outputDir))throw new Error('OUTPUT_ALREADY_EXISTS');
  // A new sibling plan directory is safe: only reject reusing an existing
  // path. Never modify or overwrite the input save itself.
  if(outputDir===savePath)throw new Error('OUTPUT_CONFLICTS_WITH_INPUT_SAVE');
  const contents=fs.readFileSync(savePath);
  const battle=parseTacticalSave(contents.toString('utf8'));
  const result=enumerateNativeTurnPlans(battle,opts);
  fs.mkdirSync(outputDir,{recursive:true});
  for(const p of result.plans)fs.writeFileSync(path.join(outputDir,p.name),p.script,{flag:'wx'});
  const manifest={schema:1,backend:'OXCE_NATIVE_SECOND_TURN_PLAN_ENUMERATOR',
    engineEvaluated:false,sourceSaveSha256:sha256(contents),
    source:result.source,focusId:result.focusId,focusPosition:result.focusPosition,
    supportIds:result.supportIds,kneelEligibleSupportIds:result.kneelEligibleSupportIds,
    visibleTargetIds:result.visibleTargetIds,
    allCandidates:result.allCandidates,selectedCount:result.selectedCount,
    truncated:result.truncated,plans:result.plans.map(({script,...other})=>other)};
  fs.writeFileSync(path.join(outputDir,'plan-manifest.json'),
    JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const {save,out,opts}=parseNativeTurnArgs(process.argv.slice(2));
    const m=writeNativeTurnPlans(save,out,opts);
    console.log(JSON.stringify({sourceSaveSha256:m.sourceSaveSha256,
      focusPosition:m.focusPosition,allCandidates:m.allCandidates,
      selectedCount:m.selectedCount,truncated:m.truncated,engineEvaluated:false},null,2));
  }catch(e){console.error('NATIVE_TURN_PLAN_GENERATION_FAILED: '+e.message);process.exitCode=1;}
}
