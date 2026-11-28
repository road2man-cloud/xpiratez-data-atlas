// Forward-only development AFTER a replayed recruitment. No legacy research
// planner, no arbitrary external inputs, no assumed medals or promotions.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createForwardResearch,replayForwardNode} from './atlas-overcap-forward-research.mjs';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
import {applyOriginWitnessStep} from '../public/soldiers/modern/origin-witness.js';
import {createGrowthReplay,member} from './population-growth-replay-core.mjs';
import {deterministicRule} from './population-scalar-upper-bound.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),key=x=>sha(JSON.stringify(x));
const read=p=>JSON.parse(p.endsWith('.gz')?gunzipSync(fs.readFileSync(p)):fs.readFileSync(p));
const arg=(k,d)=>process.argv.find(a=>a.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const num=(k,d,lo,hi)=>{const n=Number(arg(k,d));assert(Number.isSafeInteger(n)&&n>=lo&&n<=hi,k);return n;};
const stem='tools/data/overcap-forward-research-b7ec03d-v1';
const graphPath=arg('graph',stem+'.json.gz'),summaryPath=arg('summary',stem+'-summary.json');
const intakePath=arg('intake','tools/data/overcap-forward-career-intake-8ea2e3ed986fbc74-54289ba21fd1.json.gz');
const graph=read(graphPath),manifest=read(summaryPath),intake=read(intakePath),graphSha=sha(fs.readFileSync(graphPath)),intakeSha=sha(fs.readFileSync(intakePath));
assert.equal(graph.schema,'ATLAS_FORWARD_CAMPAIGN_RESEARCH_V1');assert.equal(graphSha,manifest.artifactSha256);assert.deepEqual(graph.inputs,manifest.inputs);
assert.equal(intake.schema,'ATLAS_OVERCAP_FORWARD_CAREER_INTAKE_V1');assert.equal(intake.graphSha256,graphSha);
assert.equal(graph.actualGameCertified,false);assert.equal(intake.actualGameCertified,false);
const dataPath='public/data/soldiers-modern-index.json',birthPath='public/data/soldier-acquisition-progression-20261102.json';
assert.equal(sha(fs.readFileSync(dataPath)),graph.inputs.rulesSha256);assert.equal(sha(fs.readFileSync(birthPath)),intake.acquisitionSha256);
for(const [p,h] of Object.entries(graph.inputs.engineFiles))assert.equal(sha(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n')),h,p);
const data=read(dataPath);data.originRows=read(birthPath).rows;
assert.equal(graph.sourceMetadataSha256,data.meta.source.metadataSha256);assert.equal(intake.sourceMetadataSha256,graph.sourceMetadataSha256);
const engine=createForwardResearch(data,{maxMonth:graph.budget.maxMonth}),growth=createGrowthReplay(data);
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k),qty=(w,k)=>Number(w.items[k]||0);
const rules=data.researchRules,profiles=new Map(data.profiles.map(p=>[p.id,p]));
const seedWorlds=new Map();
function restoreRecruit(s){
 const n=graph.nodes[s.nodeId],edge=graph.edges[n.parent],event=edge.action;
 const after=replayForwardNode(data,graph,n.id),before=replayForwardNode(data,graph,edge.from);
 assert.equal(after.stateHash,s.sourceStateHash);assert.equal(after.firstRoot,s.root);assert.equal(event.type,'eventResearch');
 assert.deepEqual(s.actions.slice(0,after.actions.length),after.actions);
 assert.equal((after.world.generatedEvents[event.event]||0),(before.world.generatedEvents[event.event]||0)+1);
 let world=structuredClone(after.world);
 const seen=new Set(),claims=s.actions.slice(after.actions.length,-1);
 assert.deepEqual(claims,s.claims);
 for(const c of claims){
  assert(c.type==='sourceEventItemClaim'&&c.assumption===true&&c.event===event.event&&c.script===event.script&&c.research===event.research&&c.sourceNodeId===n.id&&c.occurrence===world.generatedEvents[c.event]&&!seen.has(c.item));
  const sources=(data.itemSupply[c.item]?.eventGrants||[]).filter(e=>e.event===c.event&&e.scriptIds.includes(c.script)&&e.directResearchAwards.includes(c.research));
  assert.equal(sources.length,1);const grants=sources[0].grants;
  assert(grants.length===1&&['every','everyMulti'].includes(grants[0].mode)&&Number.isSafeInteger(grants[0].count)&&grants[0].count>0);
  assert.equal(c.count,grants[0].count);assert.equal(qty(world,c.item),qty(before.world,c.item));seen.add(c.item);world.items[c.item]=qty(world,c.item)+c.count;
 }
 const a=s.actions.at(-1),p=profiles.get(s.profile);assert(p&&a.type==='recruit'&&a.profile===p.id&&a.soldier==='origin'&&a.band==='min');
 assert.equal(s.id,'FORWARD-RECRUIT:'+key([graphSha,n.id,s.actions]));
 const r=applyOriginWitnessStep(world,a,data);assert(r.ok,r.reason);
 assert.equal(exactStateHash(r.world),s.finalWorldHash);assert.equal(member(r.world).state.soldierType,s.body);
 assert.deepEqual(member(r.world).state.currentStats,s.raw);
 return r.world;
}
for(const s of intake.recruits)seedWorlds.set(s.id,restoreRecruit(s));
const targets=arg('targets','STR_BASIC_FIREARMS_TRAINING,STR_SUN_WARRIORS_TRAINING,STR_HERO_RED_TRAINING,STR_HERO_GOLD_TRAINING,STR_HERO_GREEN_TRAINING').split(',');
assert(targets.length&&targets.every(t=>growth.rules.has(t)));
const goals=[...new Set(targets.flatMap(t=>growth.rules.get(t).requires))];
const rev=new Map();
for(const [id,r] of Object.entries(rules)){
 for(const t of [...(r.unlocks||[]),...(r.getOneFree||[]),...Object.values(r.getOneFreeProtected||{}).flat(),...(r.lookup?[r.lookup]:[])]){
  const v=rev.get(t)||[];v.push(id);rev.set(t,v);
 }
}
// These are priority weights ONLY. Selection always re-derives current options.
const weights=new Map(),todo=goals.map(k=>[k,0,1]);
for(let i=0;i<todo.length;i++){
 const [k,d,scale]=todo[i],v=1000*scale/(d+1);if((weights.get(k)||0)>=v)continue;weights.set(k,v);
 if(d>=6)continue;
 const r=rules[k];if(!r)continue;
 for(const dep of [...(r.dependencies||[]),...(r.requires||[])])todo.push([dep,d+1,scale]);
 for(const source of rev.get(k)||[])todo.push([source,d+1,scale*.45]);
}
const sampleWeights=new Map(),fnWeights=new Map();
for(const [k,v] of weights){const r=rules[k];if(!r)continue;if(r.needItem){const id=r.neededItem||k;sampleWeights.set(id,Math.max(sampleWeights.get(id)||0,v));}for(const f of r.requiresBaseFunc||[])fnWeights.set(f,Math.max(fnWeights.get(f)||0,v));}
for(const t of targets){const r=growth.rules.get(t);for(const k of Object.keys(r.requiredItems||{}))sampleWeights.set(k,Math.max(sampleWeights.get(k)||0,500));for(const f of r.requiresBaseFunc||[])fnWeights.set(f,500);}
const eventItems=new Map();
for(const [item,s] of Object.entries(data.itemSupply||{}))for(const e of s.eventGrants||[]){
 if(!s.exists||e.grants.length!==1||!['every','everyMulti'].includes(e.grants[0].mode)||!Number.isSafeInteger(e.grants[0].count)||e.grants[0].count<=0)continue;
 for(const script of e.scriptIds||[])for(const research of e.directResearchAwards||[]){const k=JSON.stringify([e.event,script,research]),list=eventItems.get(k)||[];list.push({item,count:e.grants[0].count});eventItems.set(k,list);}
}
function grantList(a){return a.type==='eventResearch'?eventItems.get(JSON.stringify([a.event,a.script,a.research]))||[]:[];}
function advance(w,o,root){
 const a=o.action;assert(a.type!=='externalInputs');
 const applied=engine.apply(w,a,root),next=applied.world,claims=[];
 // New event co-grants, never a second grant for the same prior occurrence.
 // Repeated events with ambiguous multi-award histories remain unsupported.
 if(a.type==='eventResearch'&&grantList(a).length&&(w.generatedEvents[a.event]||0)===0){
  assert.equal(next.generatedEvents[a.event],1);
  const seen=new Set();
  for(const g of grantList(a)){
   assert(!seen.has(g.item),'duplicate item source');seen.add(g.item);
   const delta=qty(next,g.item)-qty(w,g.item);
   assert(delta===0||delta===g.count,'unmodeled event inventory');
   if(delta===0){next.items[g.item]=qty(next,g.item)+g.count;claims.push({type:'sourceEventItemClaim',event:a.event,script:a.script,research:a.research,item:g.item,count:g.count,occurrence:1,assumption:true});}
  }
 }
 return {world:next,claims,conditional:applied.conditional||claims.length>0};
}
function transformOptions(w){
 if(w.pendingFree)return [];
 const s=member(w).state;
 return [...growth.rules.values()].filter(r=>r.allowedSoldierTypes?.includes(s.soldierType)&&r.allowsLiveSoldiers&&!r.createsClone&&!r.producedItem&&!r.reset&&!r.resetRank&&!r.removeTransformations?.length&&r.requires.every(k=>active(w,k))&&r.requiresBaseFunc.every(k=>w.baseFunctions.has(k))&&Object.entries(r.requiredItems||{}).every(([k,n])=>qty(w,k)>=n)&&w.funds>=(r.cost||0)&&s.rank>=(r.minRank||0)&&!Object.keys(r.requiredCommendations||{}).length&&deterministicRule(r,[growth.bodies.get(r.producedSoldierType||s.soldierType)]));
}
function missing(w){return targets.map(t=>{const r=growth.rules.get(t);return {id:t,research:r.requires.filter(k=>!active(w,k)),items:Object.fromEntries(Object.entries(r.requiredItems||{}).map(([k,n])=>[k,Math.max(0,n-qty(w,k))]).filter(([,n])=>n)),functions:r.requiresBaseFunc.filter(k=>!w.baseFunctions.has(k)),funds:Math.max(0,(r.cost||0)-w.funds)};});}
function score(w){let n=0;for(const k of w.researched)if(active(w,k))n+=weights.get(k)||0;for(const [k,v] of sampleWeights)if(qty(w,k)>0)n+=v*.5;for(const [f,v] of fnWeights)if(w.baseFunctions.has(f))n+=v*.25;return n+goals.filter(k=>active(w,k)).length*10000;}
function priority(o,w){
 const a=o.action,e=o.evidence;
 let v=weights.get(a.id||a.research)||0;
 if(a.type==='research'||a.type==='repeatResearch')v+=10;
 if(a.type==='freeResearch')v+=100;
 if(a.type==='sourceResearchDelivery'||a.type==='sourceBuySample')v+=(sampleWeights.get(a.item||a.id)||0)+10;
 if(a.type==='sourceBuildFacility')v+=(e.provides||[]).reduce((s,k)=>s+(fnWeights.get(k)||0),0)+5;
 for(const g of grantList(a))if(!qty(w,g.item))v+=sampleWeights.get(g.item)||0;
 if(a.type==='advanceMonth')v+=1;
 return v;
}
const rounds=num('rounds',6,1,30),width=num('width',2,1,5),branch=num('branch',4,1,10);
const nodes=[],worlds=new Map(),seen=new Map(),failures=[],recruitRoots=[],bySeed=[],attempted=new Map();
const revisit=arg('revisit','0')==='1';
const optionKey=o=>key([o.action,o.evidence]);
function insert(seed,w,parent,action,evidence,claims=[]){
 const stateHash=exactStateHash(w),sig=seed+'|'+stateHash;
 if(seen.has(sig))return null;
 const id=nodes.length,m=member(w);assert(m?.state.exactStats&&!m.state.retired);
 const row={id,seedId:seed,parent,action,evidence,claims,stateHash,depth:parent===null?0:nodes[parent].depth+1,labDepth:parent===null?0:nodes[parent].labDepth+Number(action.type==='research'||action.type==='repeatResearch'),transforms:parent===null?0:nodes[parent].transforms+Number(action.type==='transform'),research:[...w.researched].sort(),disabled:[...w.disabled].sort(),items:w.items,functions:[...w.baseFunctions].sort(),month:w.month,body:m.state.soldierType,pendingFree:w.pendingFree||null,score:score(w),missing:missing(w),status:'OPEN',finalAdmission:false};
 if(action?.type==='transform')row.stats=growth.finish(w);
 nodes.push(row);worlds.set(id,w);seen.set(sig,id);return row;
}
const resumed=arg('resume','');
if(resumed){
 const old=read(resumed);assert.equal(old.schema,'ATLAS_FORWARD_HERO_CONTINUATION_V1');assert.equal(old.graphSha256,graphSha);assert.equal(old.intakeSha256,intakeSha);assert.deepEqual(old.targets,targets);
 for(const n of old.nodes){
  const seed=intake.recruits.find(s=>s.id===n.seedId);assert(seed);let world;
  if(n.parent===null)world=seedWorlds.get(n.seedId);
  else {const w=worlds.get(n.parent);assert(w&&nodes[n.parent].seedId===n.seedId);
   if(n.action.type==='transform'){assert(transformOptions(w).some(r=>r.id===n.action.transform));world=growth.apply(w,n.action);}
   else {const o=engine.options(w,seed.root).choices.find(o=>key(o.action)===key(n.action)&&key(o.evidence)===key(n.evidence));assert(o);const a=advance(w,o,seed.root);assert.deepEqual(a.claims,n.claims);world=a.world;}
  }
  const restored=insert(n.seedId,world,n.parent,n.action,n.evidence,n.claims);
  assert(restored&&restored.id===n.id&&restored.stateHash===n.stateHash);restored.status=n.status;
  assert.deepEqual(restored,n);
 }
 failures.push(...old.failures);
 for(const [id,keys] of Object.entries(old.attemptedOptions||{})){assert(nodes[Number(id)]&&Array.isArray(keys)&&new Set(keys).size===keys.length);attempted.set(Number(id),new Set(keys));}
 // V1 snapshots without an exact attempt ledger are conservatively reopened
 // only in explicit revisit mode. Successful/deduplicated paths are safe to replay.
 if(!old.attemptedOptions)for(const n of nodes)if(n.status==='BOUNDED_EXPANDED'){
  const seed=intake.recruits.find(s=>s.id===n.seedId),w=worlds.get(n.id);
  const options=engine.options(w,seed.root).choices;
  const priorChildren=nodes.filter(c=>c.parent===n.id&&c.action?.type!=='transform');
  const keys=new Set(priorChildren.map(c=>optionKey({action:c.action,evidence:c.evidence})));
  assert([...keys].every(k=>options.some(o=>optionKey(o)===k)));
  attempted.set(n.id,keys);
 }
}
for(const s of intake.recruits){
 let root=nodes.find(n=>n.seedId===s.id&&n.parent===null);if(!root)root=insert(s.id,seedWorlds.get(s.id),null,null,null);
 recruitRoots.push(root.id);
 let expanded=0;
 for(let i=0;i<rounds;i++){
  const eligible=n=>n.seedId===s.id&&(revisit?n.status==='BOUNDED_EXPANDED'&&engine.options(worlds.get(n.id),s.root).choices.some(o=>!attempted.get(n.id)?.has(optionKey(o))):n.status==='OPEN');
  const open=nodes.filter(eligible).sort((a,b)=>b.score-a.score||b.transforms-a.transforms||b.labDepth-a.labDepth||b.depth-a.depth||a.id-b.id).slice(0,width);
  if(!open.length)break;
  for(const n of open){
   const w=worlds.get(n.id),choices=engine.options(w,s.root).choices;
   for(const r of transformOptions(w)){
    const action={type:'transform',soldier:'origin',transform:r.id};
    try{const next=growth.apply(w,action);insert(s.id,next,n.id,action,{kind:'DIRECT_RULE_AND_STOCK_REPLAY',rule:r.id});}
    catch(e){failures.push({node:n.id,action,reason:e.message});}
   }
   const tried=attempted.get(n.id)||new Set();attempted.set(n.id,tried);
   const selected=choices.filter(o=>!tried.has(optionKey(o))).map(o=>({o,v:priority(o,w)})).sort((a,b)=>b.v-a.v||key(a.o.action).localeCompare(key(b.o.action))).slice(0,branch);
   for(const {o} of selected){tried.add(optionKey(o));try{const r=advance(w,o,s.root);insert(s.id,r.world,n.id,o.action,o.evidence,r.claims);}catch(e){failures.push({node:n.id,action:o.action,reason:e.message});}}
   n.status='BOUNDED_EXPANDED';expanded++;
  }
 }
 const own=nodes.filter(n=>n.seedId===s.id),best=[...own].sort((a,b)=>b.transforms-a.transforms||b.score-a.score||b.labDepth-a.labDepth||a.id-b.id)[0];
 bySeed.push({root:s.root,seedId:s.id,nodes:own.length,expandedThisRun:expanded,open:own.filter(n=>n.status==='OPEN').length,bestNode:best.id,maxLabDepth:Math.max(...own.map(n=>n.labDepth)),maxDepth:Math.max(...own.map(n=>n.depth)),transformed:own.filter(n=>n.action?.type==='transform').length,readyGoals:goals.filter(k=>own.some(n=>n.research.includes(k)&&!n.disabled.includes(k)))});
}
const byAction={};for(const n of nodes)if(n.action)byAction[n.action.type]=(byAction[n.action.type]||0)+1;
const summary={recruits:intake.recruits.length,nodes:nodes.length,newNodes:nodes.length-recruitRoots.length,open:nodes.filter(n=>n.status==='OPEN').length,expanded:nodes.filter(n=>n.status==='BOUNDED_EXPANDED').length,byAction,trainingApplied:byAction.transform||0,distinctResearch:new Set(nodes.flatMap(n=>n.research)).size,failures:failures.length,finalAdmission:0,bySeed};
const attemptedOptions=Object.fromEntries([...attempted].sort(([a],[b])=>a-b).map(([id,keys])=>[id,[...keys].sort()]));
const deferred=[];
for(const n of nodes.filter(n=>n.status==='BOUNDED_EXPANDED')){const seed=intake.recruits.find(s=>s.id===n.seedId),options=engine.options(worlds.get(n.id),seed.root).choices,remaining=options.filter(o=>!attempted.get(n.id)?.has(optionKey(o)));if(remaining.length)deferred.push({node:n.id,seedId:n.seedId,offered:options.length,remaining:remaining.length});}
summary.deferredParents=deferred.length;summary.deferredOptions=deferred.reduce((s,x)=>s+x.remaining,0);
const out={schema:'ATLAS_FORWARD_HERO_CONTINUATION_V1',graphSha256:graphSha,intakeSha256:intakeSha,sourceMetadataSha256:graph.sourceMetadataSha256,targets,attemptedOptions,deferred,scope:'Bounded forward conditional model from exact recruited worlds. Only generated options, no external grants. Not exhaustive; actual economy, time, RNG and endgame uncertified.',summary,nodes,failures,normalizationComplete:false,actualGameCertified:false};
const file='tools/data/overcap-forward-hero-continuation-'+key(out).slice(0,20)+'.json.gz';
if(fs.existsSync(file))assert.deepEqual(read(file),out);else fs.writeFileSync(file,gzipSync(JSON.stringify(out)+'\n'),{flag:'wx'});
console.log(JSON.stringify({file,summary,firstFailures:failures.slice(0,3)}));
