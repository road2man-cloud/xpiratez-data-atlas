// V165: produce shared, target-driven research progress and actual reachable
// career prefixes from V163. No injected inventory or inferred completion.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {restoreLibrary,checkpoint,checkpointPath,data,rp,receipt,read,sha} from './atlas-overcap-forward-library-checkpoint-v1.mjs';
import {monthly,settle} from './atlas-overcap-forward-ranked-checkpoint-v1.mjs';
import {member} from './population-growth-replay-core.mjs';
import {STAT_KEYS} from '../public/soldiers/modern/eligibility.js';
const bulkPath='tools/data/overcap-forward-bulk-normalization-v3-f332fe05e2e4b74e9eff.json.gz';
const bulk=read(bulkPath);assert.equal(bulk.sourceMetadataSha256,checkpoint.sourceMetadataSha256);
const {s:seed}=restoreLibrary();
const active=(s,id)=>s.world.researched.has(id)&&!s.world.disabled.has(id);
const targetGroups=checkpoint.groupRefs.map(ref=>{const g=bulk.groups.find(g=>g.id===ref.group);assert(g);assert.deepEqual(g.goalIds,ref.goals);return {g,ref};});
const targets=[...new Set(targetGroups.flatMap(({g,ref})=>g.stages.slice(ref.applied).filter(x=>x.action.type==='transform').map(x=>x.action.transform)))];
const rules=data.researchRules;
const targetSupport=new Map();
function walk(id,target,seen=new Set()){
 if(seen.has(id))return;seen.add(id);
 if(!targetSupport.has(id))targetSupport.set(id,new Set());
 targetSupport.get(id).add(target);
 if(active(seed,id))return;
 for(const k of [...(rules[id]?.requires||[]),...(rules[id]?.dependencies||[])])walk(k,target,seen);
}
for(const id of targets)walk(id,id);
let s=seed;const milestones=[],errors=[];
function advance(label,fn){
 const old=s;
 try{
  const next=fn(old);assert.deepEqual(next.actions.slice(0,old.actions.length),old.actions);
  // Preserve the first mandatory transformation's materials until applied.
  for(const [id,n] of Object.entries(data.transformations.find(t=>t.id==='STR_ANG_102').requiredItems))assert((next.world.items[id]||0)>=n,'Reserved mandatory stock '+id);
  if(next.actions.length>old.actions.length){s=next;milestones.push({label,actions:next.actions.slice(old.actions.length),research:[...next.world.researched].filter(id=>!old.world.researched.has(id)&&active(next,id)),stateHash:receipt(next).stateHash});}
 }catch(e){errors.push({label,reason:String(e.message)});}
}
function lab(state,id){
 if(active(state,id))return state;
 const opt=rp.options(state).find(x=>x.action.type==='research'&&x.action.id===id);
 assert(opt,'Not currently available: '+id);
 return settle(rp.research(state,opt.action));
}
// Explicit fixed event source, followed by its actual research unlock.
advance('Rifle sample via monthly Zone Stalker event',state=>{
 if(active(state,'STR_RIFLES_SUMMARY'))return state;
 const e='STR_KNOCK_KNOCK_ZONE_STALKER';
 assert.equal(data.forwardSupply.events[e].fixed.STR_RIFLE_AK,1);
 assert.equal(data.forwardSupply.events[e].research.length,0);
 let n=monthly.advance(state);
 const o=rp.options(n).find(x=>x.action.type==='sourceEventItems'&&x.action.event===e);
 assert(o,'Monthly event not enabled');
 n=settle(monthly.applyLegacy(n,o.action,(w,a)=>rp.research(w,a)));
 assert.equal(n.world.items.STR_RIFLE_AK,(state.world.items.STR_RIFLE_AK||0)+1);
 return n;
});
advance('Rifle sample research',state=>lab(state,'STR_RIFLE_AK'));
advance('Rifle summary',state=>lab(state,'STR_RIFLES_SUMMARY'));
// Conservative target-relevant laboratory closure. Avoid mutually exclusive
// choices and arbitrary free-research selections; preserve the existing branch.
for(let i=0;i<40;i++){
 const choices=rp.options(s).filter(x=>{
  const id=x.action.id,r=rules[id];return x.action.type==='research'&&targetSupport.has(id)&&r&&!active(s,id)&&!(r.disables||[]).length&&!(r.getOneFree||[]).length&&!Object.keys(r.getOneFreeProtected||{}).length&&!r.needItem;
 }).sort((a,b)=>targetSupport.get(b.action.id).size-targetSupport.get(a.action.id).size||a.action.id.localeCompare(b.action.id));
 if(!choices.length)break;
 const old=s;advance('Target support '+choices[0].action.id,state=>lab(state,choices[0].action.id));
 if(old===s)break;
}
const snapshot=state=>{const m=member(state.world);const result=rp.finish(state);return {body:result.body,statKeys:STAT_KEYS,raw:result.raw,bonus:result.bonus,effective:result.vector,traits:[...m.state.bonusCounts],history:[...m.state.history],balance:state.world.funds,month:state.world.month,stateHash:receipt(state).stateHash};};
// Every existing group forks the same exact campaign independently. A
// successful training cannot be counted in another group or mutate its seed.
const routes=targetGroups.map(({g,ref})=>{
 let state=s,applied=ref.applied;const added=[],failure=[];
 for(const stage of g.stages.slice(ref.applied)){
  try{state=rp.career(state,stage.action);added.push(stage.action);applied++;}
  catch(e){failure.push({action:stage.action,reason:String(e.message),missing:rp.missing(state,stage.requirements)});break;}
 }
 const original={applied,added,failure,actual:snapshot(state)};
 // Explore only transformations already in this goal, preserving explicit
 // growth/medal barriers. Reordered partial routes are never final witnesses.
 const candidates=[];const unique=new Set();
 for(const stage of g.stages.slice(ref.applied)){
  const a=stage.action;if(a.type!=='transform'||unique.has(a.transform))continue;unique.add(a.transform);
  try{const n=rp.career(s,a);candidates.push({action:a,actual:snapshot(n),status:'CONDITIONAL_REORDERED_PREFIX'});}
  catch(e){candidates.push({action:a,missing:rp.missing(s,stage.requirements),reason:String(e.message),status:'BLOCKED_AT_CURRENT_STATE'});}
 }
 const goals=g.goalIds.map(id=>{const goal=bulk.goals.find(x=>x.id===id);assert(goal);return {id,legacyBranch:goal.legacyBranch,targetBody:goal.targetBody,expectedTraits:goal.legacyExpected.traits,expectedHistory:goal.legacyExpected.history,expectedEffective:goal.legacyExpected.effective};});
 return {group:g.id,originProfile:'manufacture:STR_RAIDER_SCOUT_RECRUITMENT',goals,original,candidates,finalAdmission:false,actualGameCertified:false};
});
const newActions=s.actions.slice(seed.actions.length);
let replay=restoreLibrary().s;
for(const a of newActions)replay=a.type==='sourceMonthlyBoundary'?monthly.advance(replay,a):monthly.scripted(a)?monthly.applyLegacy(replay,a,(w,x)=>rp.research(w,x)):rp.research(replay,a);
assert.deepEqual(receipt(replay),receipt(s));
const summary={preservedGoals:bulk.goals.length,coveredGroups:routes.length,coveredGoals:routes.reduce((n,r)=>n+r.goals.length,0),newActions:newActions.length,newActiveResearch:[...s.world.researched].filter(id=>!seed.world.researched.has(id)&&active(s,id)),orderedNewTraining:routes.reduce((n,r)=>n+r.original.added.filter(a=>a.type==='transform').length,0),reorderedPartialCandidates:routes.reduce((n,r)=>n+r.candidates.filter(c=>c.status==='CONDITIONAL_REORDERED_PREFIX').length,0),completeGroups:routes.filter(r=>!r.original.failure.length).length,finalAdmission:0};
const report={schema:'ATLAS_OVERCAP_TRAIT_FORWARD_WAVE_V1',scope:'Conditional campaign witness; full timing, economics, tactical combat and score ledger remain unmodeled. Target order and alternate one-step prefixes distinguished.',sourceMetadataSha256:checkpoint.sourceMetadataSha256,checkpointPath,checkpointSha256:sha(fs.readFileSync(checkpointPath)),bulkPath,bulkSha256:sha(fs.readFileSync(bulkPath)),summary,seed:snapshot(seed),continuation:snapshot(s),newActions,newTrace:s.trace.slice(seed.trace.length),milestones,errors,routes,actualGameCertified:false,finalAdmission:false,normalizationComplete:false};
const bytes=JSON.stringify(report)+'\n';
const out='tools/data/overcap-trait-forward-wave-v1-'+sha(bytes).slice(0,20)+'.json';
if(fs.existsSync(out))assert.equal(fs.readFileSync(out,'utf8'),bytes);else fs.writeFileSync(out,bytes,{flag:'wx'});
console.log(JSON.stringify({out,summary,errors,month:s.world.month,hash:receipt(s).stateHash,bytes:Buffer.byteLength(bytes)}));
