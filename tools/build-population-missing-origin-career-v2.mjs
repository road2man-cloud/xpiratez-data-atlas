// Coverage-first production for origins with no published chronological career.
// Reuse concrete pre-recruit prefixes; also try recruiting before branch
// commitments. A conditional birth is not a real campaign acquisition proof.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gunzipSync,gzipSync} from "node:zlib";
import {performance} from "node:perf_hooks";
import {key,sha,dominates,createResearchCareer} from "./population-research-career-core.mjs";
import {birthActions,exactWorld,member} from "./population-growth-replay-core.mjs";
import {birthCatalog} from "./population-frontier-chronology-core.mjs";
import {createFoundationResearchPlanner} from "../public/soldiers/modern/foundation-research-planner.js";
import {auditOriginCampaignContext} from "../public/soldiers/modern/origin-campaign-context.js";
import {ledgers,project} from "../public/branch-soldier-atlas-career-core.js";
import {traitSnapshot} from "./population-rank-trait-priority.mjs";
import {createConditionalResourceQuotient} from "./final-career-conditional-resource-quotient.mjs";
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const db=decode("public/data/branch-soldier-results.json.gz"),data=read("public/data/soldiers-modern-index.json");
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
const POLICY="COVERAGE_FIRST_RECRUITMENT_AND_CAREER_V2",file="public/data/soldier-population-missing-origin-career.json.gz";
const files=["tools/build-population-missing-origin-career-v2.mjs","tools/population-research-career-core.mjs","tools/population-chronological-career-core.mjs","tools/population-growth-replay-core.mjs","tools/final-career-conditional-resource-quotient.mjs","tools/final-career-repeat-quotient.mjs","public/soldiers/modern/foundation-research-planner.js","public/soldiers/modern/origin-witness.js","public/soldiers/modern/campaign-proof.js","public/soldiers/modern/origin-campaign-context.js","public/data/soldiers-modern-index.json"];
const fingerprint=key([POLICY,db.sourceMetadataSha256,files.map(p=>[p,sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))])]);
const prior=fs.existsSync(file)?decode(file):null;if(prior?.schema===POLICY)assert.equal(prior.fingerprint,fingerprint);else if(prior){assert.equal(prior.schema,"COVERAGE_FIRST_RECRUITMENT_AND_CAREER_V1");assert.equal(prior.sourceMetadataSha256,db.sourceMetadataSha256);}
const migration=prior?.schema===POLICY?prior.migration:{from:prior?.fingerprint||null,births:Object.keys(prior?.graphs||{}).length,attempts:Object.keys(prior?.attempts||{}).length};
const profiles=new Map(data.profiles.map(p=>[p.id,p])),branches=new Map(db.branches.filter(b=>!b.sourceRootConflict&&b.historyCount).map(b=>[b.id,b]));
const existing=new Set(ledgers.filter(l=>l.key!=="missingbirth").flatMap(l=>project(l,decode("public/data/"+l.file+".json.gz"),db.sourceMetadataSha256).rows).map(r=>r.origin));
const targets=prior?.targets||data.profiles.filter(p=>!existing.has(p.id)).map(p=>p.id);
const graphs=prior?.graphs||{},attempts=prior?.attempts||{},templates=prior?.templates||{};
const {replay,byBody,plan,policy,context,metrics:engineMetrics}=createResearchCareer(data,db,db.populationFrontierChronology.cacheHashes||db.populationFrontierChronology.hashes,{templates});
const config={maxAttempts:260,maxDepth:48,maxSteps:3800,methodLimit:64,collectFailures:true};
const defaultPlanner=createFoundationResearchPlanner(data,config),fixedPlanners=new Map();let planner=defaultPlanner;
function selectPlanner(d){if(d===null||d===undefined)return defaultPlanner;if(!fixedPlanners.has(d))fixedPlanners.set(d,createFoundationResearchPlanner(data,{...config,difficulty:d}));return fixedPlanners.get(d);}
const quotient=createConditionalResourceQuotient(data),active=(w,k)=>replay.active(w,k),commit=b=>[...b.captain,...Object.values(b.choices||{})].filter(Boolean);
const allChoice=new Set(db.branches.flatMap(commit));
const prefixes=new Map(),prefixPool=[];
function addPrefix(branch,actions,source){
 if(!branches.has(branch)||!Array.isArray(actions)||actions.some(a=>a.type==="recruit"&&a.soldier==="origin"))return;
 const id=key([branch,actions]);if(prefixes.has(id))return;
 const p={id,branch,actions,source,topics:new Set(actions.flatMap(a=>[a.id,a.research].filter(Boolean)))};prefixes.set(id,p);prefixPool.push(p);
}
for(const [id,r] of Object.entries(db.populationNewPairEntry.roots)){const b=db.branches.find(x=>x.rank===r.rank);if(b)addPrefix(b.id,r.actions,{kind:"retainedRoot",id});}
for(const b of birthCatalog(db)){
 const {steps}=birthActions(db,b);const i=steps.findIndex(a=>a.type==="recruit"&&a.soldier==="origin");
 if(i>=0)addPrefix(b.branch,steps.slice(0,i),{kind:"preBirth",id:b.input});
}
// Also use early prefixes before the original retained root advances months.
const rootBranches=new Map();
for(const p of prefixPool){const a=rootBranches.get(p.branch)||[];a.push(p);rootBranches.set(p.branch,a);}
for(const [bid,a] of rootBranches){
 a.sort((x,y)=>x.actions.length-y.actions.length);
 addPrefix(bid,[],{kind:"foundation",id:bid});
 const root=a[0],wait=root.actions.findIndex(x=>x.type==="advanceMonth"&&x.month>0);
 if(wait>0)addPrefix(bid,root.actions.slice(0,wait),{kind:"earlyPrefix",id:root.id});
}
// Reuse path-neutral action prefixes to create concrete proposals for the previously
// unrepresented CAT path; the changed choice itself must be researched.
const pathChoices=new Set([...branches.values()].map(b=>b.choices.path));
for(const b of branches.values())if(b.choices.path==="STR_CAT_PATH_PREQ"){
 const pool=prefixPool.filter(p=>{const x=branches.get(p.branch);return x.choices.path!==b.choices.path&&JSON.stringify(x.captain)===JSON.stringify(b.captain)&&x.choices.codex===b.choices.codex&&x.choices.queen===b.choices.queen&&x.choices.cause===b.choices.cause;});
 const p=pool.sort((a,z)=>a.actions.length-z.actions.length)[0];if(!p)continue;const i=p.actions.findIndex(a=>a.type==="research"&&pathChoices.has(a.id));if(i>0)addPrefix(b.id,p.actions.slice(0,i),{kind:"repath",id:p.id});
}
const round={attempts:0,births:0,earlyBirths:0,directBirths:0,unresolved:0,expanded:0,states:0,aliases:0,errors:[]};
const cache=new Map(),prefixCache=new Map(),seen=new Map();
function remember(k,v){if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(k,v);return v;}
function loadPrefix(p){
 if(prefixCache.has(p.id))return planner.clone(prefixCache.get(p.id));
 const n=planner.newNode();for(const [i,a] of p.actions.entries()){if(i===0&&a.type==="campaignContext"&&n.steps[0]?.type==="campaignContext"){assert.equal(a.difficulty,n.steps[0].difficulty);continue;}planner.append(n,a);}
 assert(!n.world.pendingFree&&!member(n.world));
 if(prefixCache.size>=40)prefixCache.delete(prefixCache.keys().next().value);prefixCache.set(p.id,n);return planner.clone(n);
}
function branchOkay(n,b,{requireCommit=true,oldTrace=0}={}){
 const c=commit(b),avoid=new Set(b.blockedResearch||[]);
 if(n.trace.some(t=>(t.added||[]).some(k=>avoid.has(k))))return false;
 if(n.trace.slice(oldTrace).some(t=>(t.added||[]).some(k=>allChoice.has(k)&&!c.includes(k))))return false;
 return !requireCommit||c.every(k=>active(n.world,k));
}
function ensure(n,goals,b){
 if(goals.every(k=>active(n.world,k)))return n;
 const r=planner.ensure(goals,n);
 if(!r.ok){const error=Error(r.reason||"RESEARCH_UNRESOLVED");error.deadEnds=r.deadEnds?.slice(0,8);throw error;}
 if(!branchOkay(r.node,b,{requireCommit:false,oldTrace:n.trace.length})||!goals.every(k=>active(r.node.world,k)))throw Error("BRANCH_CONFLICT");
 return r.node;
}
function register(p,b,prefix,n,birthAt,mode){
 const ctx=auditOriginCampaignContext(n.steps,data);assert.equal(ctx.kind,"compatible");assert(ctx.allowedDifficulties.length);
 const w=replay.replay(n.steps);assert.equal(exactWorld(w),exactWorld(n.world));assert(member(w)?.state.exactStats&&member(w).state.soldierType===p.soldierType);
 assert(commit(b).every(k=>active(w,k)));const id=key([p.id,b.id,n.steps]);
 if(graphs[id])return id;
 const g={origin:p.id,branch:b.id,birthAt,birthMonth:n.birthMonth??null,mode,prefixSource:prefix.source,prefixHash:prefix.id,birthActions:n.steps,rootStateHash:exactWorld(w),allowedDifficulties:ctx.allowedDifficulties,nodes:[],cursor:0};
 graphs[id]=g;insert(id,g,w,null,null,[]);round.births++;round.earlyBirths+=Number(mode==="EARLY_BIRTH");round.directBirths+=Number(mode==="DIRECT_ACTIVE");return id;
}
function tryBirth(p,prefix,mode){
 const b=branches.get(prefix.branch),id=key([p.id,prefix.id,mode]);round.attempts++;
 try{
  planner=selectPlanner(prefix.actions[0]?.type==="campaignContext"?prefix.actions[0].difficulty:null);
  let n=loadPrefix(prefix);assert(branchOkay(n,b,{requireCommit:false,oldTrace:n.trace.length}));
  const early=mode==="EARLY_BIRTH",goals=early?p.requires:[...new Set([...commit(b),...p.requires])];
  n=ensure(n,goals,b);assert(p.requires.every(k=>active(n.world,k)));
  if(!early)assert(commit(b).every(k=>active(n.world,k)));
  const direct=p.requires.every(k=>active(loadPrefix(prefix).world,k))&&commit(b).every(k=>active(loadPrefix(prefix).world,k));
  planner.supply(n,{items:p.acquisitionRequiredItems||{},functions:p.requiresBaseFunc||[],funds:Math.max(0,p.cost||0)},"Conditional recruitment inputs "+p.id);
  const birthAt=n.steps.length,birthMonth=n.world.month;
  planner.append(n,{type:"recruit",soldier:"origin",profile:p.id,band:"min"});
  assert(member(n.world)?.state.exactStats&&member(n.world).state.soldierType===p.soldierType);
  if(early)n=ensure(n,commit(b),b);
  assert(branchOkay(n,b,{oldTrace:n.trace.length}));
  n.birthMonth=birthMonth;
  const gid=register(p,b,prefix,n,birthAt,early?"EARLY_BIRTH":direct?"DIRECT_ACTIVE":"RESEARCH_THEN_BIRTH");
  attempts[id]={origin:p.id,branch:b.id,prefix:prefix.id,mode,status:"CONDITIONAL_REPLAY",graph:gid};
 }catch(e){round.unresolved++;attempts[id]={origin:p.id,branch:b.id,prefix:prefix.id,mode,status:"LIMITED_UNRESOLVED",reason:String(e.message),deadEnds:e.deadEnds||[]};}
}
function insert(id,g,w,parent,action,steps){
 const stateHash=exactWorld(w),projection=quotient.project(w);let m=seen.get(id);if(!m){m=new Map(g.nodes.map((n,i)=>[n.projection,i]));seen.set(id,m);}
 if(m.has(projection)){round.aliases++;return {status:"CONDITIONAL_ALIAS",to:m.get(projection),stateHash,steps,researchTimingUnresolved:true};}
 const i=g.nodes.length;m.set(projection,i);g.nodes.push({parent,action,steps,stateHash,projection,...replay.finish(w),traits:traitSnapshot(w),edges:null});remember(id+"|"+i,w);if(parent!==null)round.states++;
 return {status:"CONDITIONAL_REPLAY",to:i,stateHash,steps};
}
function loadNode(id,g,i){
 const k=id+"|"+i;if(cache.has(k))return cache.get(k);
 const path=[];let j=i;while(j!==null&&!cache.has(id+"|"+j)){path.push(j);j=g.nodes[j].parent;}
 let w=j===null?replay.replay(g.birthActions):cache.get(id+"|"+j);
 for(const a of path.reverse()){if(a)w=replay.replay(g.nodes[a].steps,w);assert.equal(exactWorld(w),g.nodes[a].stateHash);remember(id+"|"+a,w);}return w;
}
function stepsFor(g,i){const path=[];while(i){path.push(g.nodes[i].steps);i=g.nodes[i].parent;}return path.reverse().flat();}
function expand(id,g){
 const i=g.cursor,n=g.nodes[i],w=loadNode(id,g,i),edges=[],steps=stepsFor(g,i),p={allowedDifficulties:g.allowedDifficulties},b=branches.get(g.branch),base={world:w,steps};
 function offer(action,q){
  if(!q){edges.push({action,status:"UNRESOLVED_LOCAL_GATE"});return;}
  const allowed=context(g.branch,p,[...g.birthActions,...q.steps],q.world);
  if(!allowed.length){edges.push({action,status:"UNRESOLVED_CONTEXT"});return;}
  edges.push({action,...insert(id,g,q.world,i,action,q.steps.slice(steps.length))});
 }
 try{const q=replay.grow(base);if(q.steps.length>steps.length)offer("CAP_GROWTH",q);else edges.push({action:"CAP_GROWTH",status:"AT_CAP"});}catch(e){edges.push({action:"CAP_GROWTH",status:"UNRESOLVED_LOCAL_GATE",reason:String(e.message)});}
 // Continue through actually acquired research, preserving all numerical
 // and history gates. A missing research is an open obligation.
 for(const r of byBody.get(n.body)||[]){
  if(r.forbiddenSoldierTypes?.includes(n.body))continue;
  if(!r.requires.every(k=>active(w,k))){edges.push({action:r.id,status:"INACTIVE_RESEARCH"});continue;}
  const s=member(w).state;if(r.requiredPreviousTransformations?.some(k=>!s.history.has(k))||r.forbiddenPreviousTransformations?.some(k=>s.history.has(k))){edges.push({action:r.id,status:"HISTORY_GATE"});continue;}
  try{offer(r.id,replay.transform(base,r));}catch(e){edges.push({action:r.id,status:"UNRESOLVED_LOCAL_GATE",reason:String(e.message)});}
 }
 n.edges=edges;g.cursor++;round.expanded++;
}
const maxSeconds=Number(arg("seconds","25")),maxBirths=Number(arg("attempts","80")),maxNodes=Number(arg("nodes","200")),start=performance.now();
// Difficulty-specific proposals are new histories; do not reinterpret a failed
// mixed-difficulty plan as proof of impossible recruitment.
const originalPool=[...prefixPool];for(const p of originalPool.filter(p=>p.source.kind==="retainedRoot"&&p.actions.length<30).slice(0,36))if(p.actions[0]?.type!=="campaignContext")for(let d=0;d<5;d++)addPrefix(p.branch,[{type:"campaignContext",difficulty:d,assumption:true},...p.actions],{kind:"fixedDifficulty",id:p.id,difficulty:d});
const byOrigin=new Map(),birthCounts=new Map();for(const g of Object.values(graphs))birthCounts.set(g.origin,(birthCounts.get(g.origin)||0)+1);
const attemptCounts=new Map();for(const a of Object.values(attempts))attemptCounts.set(a.origin,(attemptCounts.get(a.origin)||0)+1);
for(const id of targets){
 const p=profiles.get(id);if(!p||p.sourceType==="event")continue;
 const deps=new Set(),qdeps=[...p.requires];for(let i=0;i<qdeps.length;i++){const k=qdeps[i];if(deps.has(k))continue;deps.add(k);const r=data.researchRules[k];if(r)qdeps.push(...(r.dependencies||[]),...(r.requires||[]));}
 const cat=deps.has("STR_CAT_PATH")||p.requires.includes("STR_THEBAN_ASSAULT_CATGIRLS"),doll=p.id==="direct:STR_SOLDIER_DOLL";
 const choices=prefixPool.filter(q=>!p.requires.some(k=>branches.get(q.branch).blockedResearch?.includes(k))).map(q=>({q,score:p.requires.filter(k=>q.topics.has(k)).length,overlap:[...q.topics].filter(k=>deps.has(k)).length,preferred:cat?Number(branches.get(q.branch).choices.path==="STR_CAT_PATH_PREQ"):doll?Number(q.source.kind==="fixedDifficulty"):0}));
 choices.sort((a,b)=>b.score-a.score||b.preferred-a.preferred||b.overlap-a.overlap||a.q.actions.length-b.q.actions.length||a.q.id.localeCompare(b.q.id));
 // Alternate known-prefix and early recruitment opportunities. Do not
 // discard other candidates; all remain selectable in future rounds.
 const list=[];for(const {q,score} of choices){
  if(score===p.requires.length)list.push([q,"BRANCH_FIRST"]);
  if(["foundation","earlyPrefix","repath","fixedDifficulty"].includes(q.source.kind))list.push([q,"EARLY_BIRTH"]);
  if(score!==p.requires.length)list.push([q,"BRANCH_FIRST"]);
 }
 byOrigin.set(id,list.filter(([q,mode])=>!attempts[key([id,q.id,mode])]));
}
const cursors=new Map();let work=true;
while(work&&performance.now()-start<maxSeconds*1000){
 work=false;
 if(round.attempts<maxBirths){
  const choices=[...byOrigin].filter(([id,a])=>(cursors.get(id)||0)<a.length).sort((a,b)=>(birthCounts.get(a[0])||0)-(birthCounts.get(b[0])||0)||(attemptCounts.get(a[0])||0)-(attemptCounts.get(b[0])||0)||a[0].localeCompare(b[0]));
  if(choices.length){const [id,a]=choices[0],i=cursors.get(id)||0;const before=round.births;cursors.set(id,i+1);tryBirth(profiles.get(id),...a[i]);attemptCounts.set(id,(attemptCounts.get(id)||0)+1);if(round.births>before)birthCounts.set(id,(birthCounts.get(id)||0)+1);work=true;}
 }
 if(round.expanded<maxNodes)for(const [id,g] of Object.entries(graphs).sort((a,b)=>a[1].cursor-b[1].cursor)){
  if(round.expanded>=maxNodes||performance.now()-start>=maxSeconds*1000)break;
  if(g.cursor<g.nodes.length&&!g.blocker){try{expand(id,g);}catch(e){g.blocker=String(e.message);round.errors.push({id,reason:g.blocker});}work=true;}
 }
}
const routes={},indexRoutes={},nodes=[{parent:null,action:null}],actionNodes=[{parent:null,action:null}],rm=new Map(),am=new Map();
const researchKinds=new Set(["research","repeatResearch","freeResearch","eventResearch","missionResearch"]);
function push(arr,map,parent,action){const k=key([parent,action]);if(map.has(k))return map.get(k);const i=arr.length;arr.push({parent,action});map.set(k,i);return i;}
const previous=new Map();for(const r of Object.values(prior?.routes||{})){const a=previous.get(r.sourceGraph)||[];a.push(r.sourceNode);previous.set(r.sourceGraph,a);}
for(const [id,g] of Object.entries(graphs)){
 const front=new Map();for(const [i,n] of g.nodes.entries()){
  const k=key([n.body,n.traits,n.rank,n.medals]),a=front.get(k)||[];
  const d=(a,b)=>dominates(a.permanentVector,b.permanentVector)&&dominates(a.permanentCapVector,b.permanentCapVector);
  if(!a.some(j=>d(g.nodes[j],n)))front.set(k,[...a.filter(j=>!d(n,g.nodes[j])),i]);
 }
 for(const i of new Set([0,...(previous.get(id)||[]),...[...front.values()].flat()])){
  const n=g.nodes[i],full=[...g.birthActions,...stepsFor(g,i)],ctx=auditOriginCampaignContext(full,data),allowed=ctx.allowedDifficulties.filter(x=>g.allowedDifficulties.includes(x));assert(ctx.kind==="compatible"&&allowed.length);
  let rp=0,ap=0;const order=[],transformGates=[];
  for(const [j,a] of full.entries()){ap=push(actionNodes,am,ap,a);if(researchKinds.has(a.type))rp=push(nodes,rm,rp,a);if(a.type==="transform"){const r=replay.rules.get(a.transform);assert(r);transformGates.push({index:j,prefix:rp,transform:a.transform,requires:r.requires});if(a.soldier==="origin")order.push(a.transform);}}
  const rid="MISSCAR:"+id+":"+i,hash=key(full);routes[rid]={origin:g.origin,branch:g.branch,body:n.body,order,permanentVector:n.permanentVector,permanentCapVector:n.permanentCapVector,fullActionHash:hash,canonicalStateHash:n.stateHash,allowedDifficulties:allowed,traitEvidence:{retained:n.traits},rank:n.rank,medals:n.medals,sourceGraph:id,sourceNode:i,birthEvidence:{scope:"CONDITIONAL_MIN_RECRUITMENT",mode:g.mode,birthAt:g.birthAt,birthMonth:g.birthMonth,prefixSource:g.prefixSource,requiredResearch:profiles.get(g.origin).requires},actualGameCertified:false};
  indexRoutes[rid]={origin:g.origin,branch:g.branch,fullActionHash:hash,prefix:rp,fullPrefix:ap,transformGates,history:key([g.branch,rp]),sourceGraph:id,sourceNode:i,actionCount:full.length};
 }
}
for(const [id,r] of Object.entries(prior?.routes||{}))assert.deepEqual(routes[id],r,"Lost published witness");
const covered=new Set(Object.values(graphs).map(g=>g.origin));
const summary={targetOrigins:targets.length,coveredOrigins:covered.size,missingOrigins:targets.filter(k=>!covered.has(k)),births:Object.keys(graphs).length,attempted:Object.keys(attempts).length,unresolved:Object.values(attempts).filter(a=>a.status==="LIMITED_UNRESOLVED").length,states:Object.values(graphs).reduce((s,g)=>s+g.nodes.length,0),processed:Object.values(graphs).reduce((s,g)=>s+g.cursor,0),published:Object.keys(routes).length,earlyBirths:Object.values(graphs).filter(g=>g.mode==="EARLY_BIRTH").length,directBirths:Object.values(graphs).filter(g=>g.mode==="DIRECT_ACTIVE").length,round,actualGameCertified:0};
const sourceGraphSha256=key(graphs),out={schema:POLICY,fingerprint,sourceMetadataSha256:db.sourceMetadataSha256,sourceGraphSha256,scope:"Conditional minimum birth and subsequent growth/active research transformation paths. Real campaign resources, time and full research alternatives remain unproved.",targets,summary,graphs,attempts,templates,routes,nodes,actionNodes,indexRoutes,migration};
 // Keep route and witness data together, expose a separate compact index only
 // for the existing comparison table's lazy action-history view.
fs.writeFileSync(file+".tmp",gzipSync(JSON.stringify(out)));fs.renameSync(file+".tmp",file);
fs.writeFileSync("public/data/soldier-population-missing-origin-career-index.json.gz",gzipSync(JSON.stringify({sourceMetadataSha256:db.sourceMetadataSha256,sourceGraphSha256,nodes,actionNodes,routes:indexRoutes})));
fs.writeFileSync("public/branch-soldier-missing-origin-summary.js","export const missingOriginSummary="+JSON.stringify({...summary,sourceMetadataSha256:db.sourceMetadataSha256,details:targets.map(id=>({id,name:profiles.get(id).sourceKoName,attempts:Object.values(attempts).filter(a=>a.origin===id).length,graphs:Object.values(graphs).filter(g=>g.origin===id).length,routes:Object.values(routes).filter(r=>r.origin===id).length}))})+";\n");
console.log(JSON.stringify(summary));
