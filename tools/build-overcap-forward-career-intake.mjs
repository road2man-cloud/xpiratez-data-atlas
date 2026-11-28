// Forward career intake: legacy rows supply GOALS ONLY. Never splice an old
// research prefix or grant missing inventory from a target's requirements.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gunzipSync,gzipSync} from 'node:zlib';
import {readTrainingLedger,hashLedger} from './overcap-training-ledger-store.mjs';
import {createForwardResearch,replayForwardNode} from './atlas-overcap-forward-research.mjs';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
import {applyOriginWitnessStep} from '../public/soldiers/modern/origin-witness.js';
const read=p=>JSON.parse(p.endsWith('.gz')?gunzipSync(fs.readFileSync(p)):fs.readFileSync(p));
const sha=b=>createHash('sha256').update(b).digest('hex');
const arg=(k,d)=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const pinnedCommit='b7ec03d5ec52bd30be4625f42e48925e7ab48906';
const stem='tools/data/overcap-forward-research-b7ec03d-v1';
const graphPath=arg('graph',stem+'.json.gz'),summaryPath=arg('summary',stem+'-summary.json');
const graph=read(graphPath),summary=read(summaryPath),graphSha=sha(fs.readFileSync(graphPath));
assert.equal(graph.schema,'ATLAS_FORWARD_CAMPAIGN_RESEARCH_V1');
assert.equal(graphSha,summary.artifactSha256);
assert.deepEqual(graph.inputs,summary.inputs);
assert.equal(graph.normalizationComplete,false);
assert.equal(graph.actualGameCertified,false);
const rulesPath='public/data/soldiers-modern-index.json';
assert.equal(sha(fs.readFileSync(rulesPath)),graph.inputs.rulesSha256);
for(const [p,h] of Object.entries(graph.inputs.engineFiles))assert.equal(sha(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n')),h,p);
const roots=Object.values(graph.roots);
assert.deepEqual(roots,['STR_JACKSTOWN_SCOUTING','STR_WAT_DO','STR_RECRUIT_PEASANTS','STR_INSPECT_MACHINERY']);
assert.deepEqual(graph.edges.filter(e=>e.from===0).map(e=>e.action),roots.map(id=>({type:'research',id})));
const data=read(rulesPath),ledger=readTrainingLedger(arg('training-hash',null)),trainingHash=hashLedger(ledger);
assert.equal(data.meta.source.metadataSha256,ledger.sourceMetadataSha256);
assert.equal(graph.sourceMetadataSha256,ledger.sourceMetadataSha256);
const acquisitionPath='public/data/soldier-acquisition-progression-20261102.json';
data.originRows=read(acquisitionPath).rows;
const engine=createForwardResearch(data,{maxMonth:graph.budget.maxMonth});
const profiles=new Map(data.profiles.map(p=>[p.id,p])),rules=data.researchRules;
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const amount=(w,k)=>Number(w.items[k]||0);
const life=new Map(read('public/data/soldier-overcap-expanded-lifecycle.json').results.map(r=>[r.id,r]));
const children=new Map(read('public/data/soldier-overcap-direct-successors.json').rows.map(r=>[r.id,r]));
const terminals=new Map(read('public/data/soldier-overcap-terminal-continuations.json').rows.map(r=>[r.id,r]));
const goals=ledger.rows.map(r=>{
 const t=terminals.get(r.sourceTerminalId),c=children.get(r.sourceRecordId),p=life.get(r.parentRecordId);
 assert(t&&c&&p&&t.sourceRecordId===c.id&&t.parentRecordId===p.id);
 const full=[...p.actions,...c.suffix,...t.suffix,...r.suffix];assert.equal(hashLedger(full),r.fullActionHash);
 const birth=full.findIndex(a=>a.type==='recruit'&&a.soldier==='origin');assert(birth>=0&&full[birth].profile===r.origin);
 const desiredTransformations=full.slice(birth+1).filter(a=>a.type==='transform'&&a.soldier==='origin').map(a=>a.transform);
 return {legacyId:r.id,legacyActionHash:r.fullActionHash,profile:r.origin,targetBody:r.body,desiredBranch:r.branch,desiredDifficulty:r.difficulty,desiredTerminal:r.target,desiredTransformations,legacyStatus:'QUARANTINED_CONDITIONAL_ONLY',finalAdmission:false};
});
const byProfile=new Map();
for(const g of goals){const list=byProfile.get(g.profile)||[];list.push(g.legacyId);byProfile.set(g.profile,list);}
const stateCache=new Map();
function prefix(id){
 if(stateCache.has(id))return stateCache.get(id);
 const w=replayForwardNode(data,graph,id);
 assert(w.firstRoot&&roots.includes(w.firstRoot));
 assert.deepEqual(w.actions[0],graph.initialAction);
 assert.equal(w.actions.slice(1).filter(a=>a.type==='externalInputs').length,0,'arbitrary external supply');
 assert.equal(w.actions[1].id,w.firstRoot);
 stateCache.set(id,w);return w;
}
function needs(p,w){
 return {research:p.requires.filter(k=>!active(w,k)),functions:p.requiresBaseFunc.filter(k=>!w.baseFunctions.has(k)),items:Object.fromEntries(Object.entries(p.acquisitionRequiredItems||{}).map(([k,n])=>[k,Math.max(0,n-amount(w,k))]).filter(([,n])=>n>0)),funds:p.cost==null?null:Math.max(0,p.cost-w.funds),pendingFree:!!w.pendingFree};
}
function relevance(p){
 // Scheduling heuristic only, never a claim that all recursively visited
 // dependencies are mandatory or that an alternate unlock is impossible.
 const weights=new Map(),queue=p.requires.map(k=>[k,0]);
 for(let i=0;i<queue.length;i++){
  const [k,d]=queue[i],v=100/(d+1);if((weights.get(k)||0)>=v)continue;weights.set(k,v);
  if(d<4)for(const dep of [...(rules[k]?.dependencies||[]),...(rules[k]?.requires||[])])queue.push([dep,d+1]);
 }
 return weights;
}
function snap(w){return {stateHash:exactStateHash(w),research:[...w.researched].sort(),disabled:[...w.disabled].sort(),items:w.items,functions:[...w.baseFunctions].sort(),month:w.month,pendingFree:w.pendingFree||null};}
const frontiers=[];
for(const [id,legacyIds] of byProfile){
 const p=profiles.get(id);assert(p);
 const weights=relevance(p);
 for(const root of roots){
  const candidates=graph.nodes.filter(n=>n.firstRoot===root&&!n.pendingFree);
  assert(candidates.length);
  const score=n=>n.researched.reduce((sum,k)=>sum+(n.disabled.includes(k)?0:weights.get(k)||0),0)+p.requiresBaseFunc.filter(k=>n.baseFunctions.includes(k)).length*20+p.requires.filter(k=>n.researched.includes(k)&&!n.disabled.includes(k)).length*1000+n.researchDepth/100;
  candidates.sort((a,b)=>score(b)-score(a)||a.depth-b.depth||a.id-b.id);
  const chosen=candidates[0],w=prefix(chosen.id),before=needs(p,w.world);
  const sampleIds=new Set(Object.keys(before.items));
  for(const k of weights.keys()){const r=rules[k];if(r?.needItem)sampleIds.add(r.neededItem||k);}
  const fns=new Set([...p.requiresBaseFunc,...[...weights.keys()].flatMap(k=>rules[k]?.requiresBaseFunc||[])]);
  function priority(o){const a=o.action,e=o.evidence;return (weights.get(a.id||a.research)||0)+(sampleIds.has(a.item||a.id)&&['sourceResearchDelivery','sourceBuySample'].includes(a.type)?60:0)+(a.type==='sourceBuildFacility'&&(e.provides||[]).some(k=>fns.has(k))?40:0);}
  const selected=w.next.choices.map(o=>({o,score:priority(o)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||JSON.stringify(a.o.action).localeCompare(JSON.stringify(b.o.action)))[0];
  let child=null,error=null;
  if(selected){
   try{const r=engine.apply(w.world,selected.o.action,w.firstRoot);child={action:selected.o.action,evidence:selected.o.evidence,state:snap(r.world),missing:needs(p,r.world),conditional:r.conditional};}
   catch(e){error=e.message;}
  }
  frontiers.push({profile:id,legacyIds,root,nodeId:chosen.id,sourceStateHash:w.stateHash,actions:w.actions,evidence:w.evidence,missing:before,nextLab:w.next.choices.filter(x=>x.action.type==='research'||x.action.type==='repeatResearch').map(x=>x.action.id),nextRelevant:child,error,status:'OPEN_ACQUISITION_FRONTIER',finalAdmission:false});
 }
}
// One narrow, source-backed recruitment adapter: the graph records an event
// research award but does not deliver its item. Claim a deterministic item
// grant only at that event's immediate successor, once, with exact predecessor
// and stock/counter comparison. No arbitrary items, funds or facilities.
function recruitFromEventNode(node,p){
 assert(!node.pendingFree&&p.sourceType==='manufacture'&&p.cost===0);
 const edge=graph.edges[node.parent],a=edge.action;
 assert(a.type==='eventResearch'&&edge.to===node.id);
 const after=prefix(node.id),before=prefix(edge.from);
 assert.equal((after.world.generatedEvents[a.event]||0),(before.world.generatedEvents[a.event]||0)+1);
 let world=structuredClone(after.world);
 const claims=[];
 for(const [item,required] of Object.entries(p.acquisitionRequiredItems||{})){
  const source=(data.itemSupply[item]?.eventGrants||[]).filter(e=>e.event===a.event&&e.scriptIds.includes(a.script)&&e.directResearchAwards.includes(a.research));
  assert.equal(source.length,1,'missing unique event item source');
  const grants=source[0].grants;assert(grants.length===1&&['every','everyMulti'].includes(grants[0].mode));
  const count=grants[0].count;assert(Number.isSafeInteger(count)&&count>0);
  const delta=amount(world,item)-amount(before.world,item);assert(delta===0||delta===count,'unmodeled stock delta');
  if(delta===0){const claim={type:'sourceEventItemClaim',event:a.event,script:a.script,research:a.research,item,count,occurrence:world.generatedEvents[a.event],sourceNodeId:node.id,assumption:true};claims.push(claim);world.items[item]=amount(world,item)+count;}
  assert(amount(world,item)>=required);
 }
 assert(!needs(p,world).research.length&&!needs(p,world).functions.length&&needs(p,world).funds===0);
 const action={type:'recruit',soldier:'origin',profile:p.id,band:'min'};
 const r=applyOriginWitnessStep(world,action,data);assert(r.ok,r.reason);
 const member=r.world.soldiers.find(s=>s.id==='origin');assert(member?.state.exactStats);
 for(const [item,count] of Object.entries(p.acquisitionRequiredItems||{}))assert.equal(amount(r.world,item),amount(world,item)-count);
 const actions=[...after.actions,...claims,action];
 return {id:'FORWARD-RECRUIT:'+hashLedger([graphSha,node.id,actions]),profile:p.id,body:member.state.soldierType,root:node.firstRoot,nodeId:node.id,sourceStateHash:after.stateHash,actions,researchEvidence:after.evidence,claims,finalWorldHash:exactStateHash(r.world),raw:member.state.currentStats,history:[...member.state.history],bonuses:[...member.state.bonusCounts],remainingItems:r.world.items,notes:['Event occurrence and minimum birth roll are conditional. Manufacture completion time and campaign-wide economy are not certified.'],status:'FORWARD_CONDITIONAL_RECRUITMENT',normalizationComplete:false,actualGameCertified:false,finalAdmission:false};
}
const recruits=[],errors=[];
const hero=profiles.get('manufacture:STR_HERO_RECRUITMENT');
assert(hero);
for(const root of roots){
 const candidates=graph.nodes.filter(n=>n.firstRoot===root&&!n.pendingFree&&n.parent!==null&&graph.edges[n.parent].action.type==='eventResearch'&&graph.edges[n.parent].action.event==='STR_KNOCK_KNOCK_PENITENT'&&graph.edges[n.parent].action.research==='STR_HERO').sort((a,b)=>a.depth-b.depth||a.id-b.id);
 for(const n of candidates.slice(0,8)){try{recruits.push(recruitFromEventNode(n,hero));break;}catch(e){errors.push({root,node:n.id,error:e.message});}}
}
const stats={legacyGoals:goals.length,legacyOrigins:byProfile.size,frontiers:frontiers.length,forwardSuccessors:frontiers.filter(x=>x.nextRelevant).length,recruitments:recruits.length,recruitmentErrors:errors.length,legacyCertified:0,finalAdmission:0};
const result={schema:'ATLAS_OVERCAP_FORWARD_CAREER_INTAKE_V1',upstreamCommit:pinnedCommit,graphSha256:graphSha,trainingHash,sourceMetadataSha256:ledger.sourceMetadataSha256,acquisitionSha256:sha(fs.readFileSync(acquisitionPath)),scope:'Legacy goals only; forward state prefixes and bounded source-backed recruitment. Not a completed campaign or legacy path repair.',summary:stats,goals,frontiers,recruits,errors,normalizationComplete:false,actualGameCertified:false};
const out=arg('out','tools/data/overcap-forward-career-intake-'+trainingHash.slice(0,16)+'-'+graphSha.slice(0,12)+'.json.gz');
if(fs.existsSync(out))assert.deepEqual(read(out),result,'immutable output differs');
else fs.writeFileSync(out,gzipSync(JSON.stringify(result)+'\n'),{flag:'wx'});
console.log(JSON.stringify({out,summary:stats,recruits:recruits.map(r=>({root:r.root,node:r.nodeId,body:r.body,claims:r.claims.length,steps:r.actions.length})),errors:errors.slice(0,4),frontierErrors:frontiers.filter(x=>x.error).map(x=>({profile:x.profile,root:x.root,error:x.error}))}));
