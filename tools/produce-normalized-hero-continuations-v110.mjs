// V110: replay old full career witnesses from the source-backed campaign start.
// Does not mutate a ledger, admit finals, or certify native gameplay.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import {key} from "./population-research-career-core.mjs";
import {createSharedCareerReplay,verifyLifecycleEngineSource} from "./population-shared-lifecycle-replay.mjs";
import {member} from "./population-growth-replay-core.mjs";
import {STAT_KEYS} from "../public/soldiers/modern/eligibility.js";
import {campaignStartWorld,labVerdict,applyCampaignStartStep,START_RESEARCH} from "../public/soldiers/modern/campaign-start-gate-v1.js";
import {createCampaignStartResearchPlanner} from "../public/soldiers/modern/campaign-start-research-planner-v1.js";
const opts=new Map();
for(const a of process.argv.slice(2)){const m=/^--([a-z-]+)=(.+)$/.exec(a);assert(m&&!opts.has(m[1]),"Invalid/duplicate option "+a);opts.set(m[1],m[2]);}
const arg=(k,d)=>opts.get(k)??d;
const get=k=>{const x=arg(k);assert(x,"Missing --"+k);return x;};
const read=p=>JSON.parse(fs.readFileSync(p,"utf8")),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const sorted=x=>[...x].sort();
const receipt=read(get("receipt")),ledger=decode(get("ledger")),db=decode(get("db")),prefix=read(get("prefix")),out=get("out");
assert(!fs.existsSync(out),"Refuse to overwrite an existing result");
const data=read("public/data/soldiers-modern-index.json");
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;
data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
const source=data.meta.source.metadataSha256;
assert.equal(data.meta.mod.version,"v.o2");
for(const x of [ledger,db,prefix,receipt])assert.equal(x.sourceMetadataSha256,source,"Ruleset mismatch");
assert.equal(prefix.snapshot.sourceFingerprint,source);
assert.deepEqual(sorted(prefix.initialResearch),sorted(Object.keys(START_RESEARCH)));
assert.equal(receipt.schema,"TARGETED_CONDITIONAL_TRANSFORMATION_CONTINUATIONS_V1");
assert.equal(receipt.sourceGraphSha256,ledger.sourceGraphSha256);
assert.equal(receipt.sourceLedgerFingerprint,ledger.fingerprint);
assert.equal(key(ledger.graphs),ledger.sourceGraphSha256);
assert.equal(prefix.schema,"ATLAS_CAMPAIGN_RESEARCH_PREFIX_V1");
// Same source-loading convention as produce-atlas-campaign-start-research-v1.
// Verify every rule file against the normalization receipt before using it.
const yaml=createRequire(path.resolve("package.json"))("js-yaml"),game=get("game");
const assets={sourceFingerprint:source,facilities:{},items:{},researchGrants:{}},research={};
const files={};
function load(p,expected){
 const bytes=fs.readFileSync(p),h=createHash("sha256").update(bytes).digest("hex"),name=path.basename(p);
 assert.equal(h,expected||prefix.sourceFiles[name],"Source file mismatch: "+name);
 files[name]=h;
 const doc=yaml.load(bytes.toString("utf8"),{json:true})||{};
 for(const [k,target] of Object.entries({facilities:assets.facilities,items:assets.items,research}))
  for(const row of doc[k]||[]){if(row.delete){delete target[row.delete];continue;}const id=row.type||row.name;if(id)target[id]={...target[id],...row};}
}
for(const n of ["vars","startingBase","facilities","items","research"])load(path.join(game,"standard/xcom1",n+".rul"));
for(const e of [...data.meta.source.rules].sort((a,b)=>a.file.localeCompare(b.file,"en")))load(path.join(game,"user/mods/Piratez/Ruleset",e.file),e.sha256);
for(const [name,h] of Object.entries(prefix.sourceFiles))assert.equal(files[name],h,"Normalization source mismatch "+name);
for(const [id,r] of Object.entries(research)){
 const grants={};if(r.spawnedItem&&assets.items[r.spawnedItem])grants[r.spawnedItem]=r.spawnedItemCount??1;
 for(const k of r.spawnedItemList||[])if(assets.items[k])grants[k]=(grants[k]||0)+1;
 if(Object.keys(grants).length)assets.researchGrants[id]=grants;
}
data.campaignAssets=assets;
verifyLifecycleEngineSource();
const replay=createSharedCareerReplay(data,ledger.summary);
const commits=b=>[...(b.captain||[]),...Object.values(b.choices||{})].filter(Boolean);
const allChoices=new Set(db.branches.flatMap(commits)),branches=new Map(db.branches.map(b=>[b.id,b]));
const attempts=Number(arg("attempts","500")),maxSteps=Number(arg("max-steps","1500"));
assert(Number.isSafeInteger(attempts)&&attempts>0&&Number.isSafeInteger(maxSteps)&&maxSteps>0);
const same=(a,b)=>key(a)===key(b);
function pathFor(g,i){const tail=[],seen=new Set();while(i){assert(Number.isSafeInteger(i)&&i>0&&g.nodes[i]&&!seen.has(i),"Corrupt source graph");seen.add(i);tail.push(g.nodes[i].steps);i=g.nodes[i].parent;}return [...g.birthActions,...tail.reverse().flat()];}
function gain(s){return STAT_KEYS.reduce((n,k)=>{const a=s.currentStats[k],b=s.initialStats[k];assert(Number.isSafeInteger(a)&&Number.isSafeInteger(b));return n+(k==="bravery"?Math.trunc((a-b)/10):a-b);},0);}
const special=a=>["conditionalCapGrowth","conditionalPromotion","conditionalMedal","transform"].includes(a.type);
function produce(e){
 const row={sourceRoute:e.sourceRoute,target:e.target,branch:e.branch,origin:e.origin,legacyAfter:e.after,gameCertified:false,registered:false,finalAdmission:false};
 let node,at=0;
 try{
 const r=ledger.routes[e.sourceRoute],g=ledger.graphs[e.sourceGraph],b=branches.get(e.branch);
 assert(r&&g&&b&&!b.sourceRootConflict&&r.sourceGraph===e.sourceGraph&&r.sourceNode===e.sourceNode&&r.branch===e.branch&&r.origin===e.origin&&r.body===receipt.body);
 assert.equal(r.canonicalStateHash,e.beforeStateHash);assert.equal(r.fullActionHash,e.prefixActionHash);
 const full=pathFor(g,e.sourceNode);assert.equal(key(full),e.prefixActionHash);assert.equal(key([...full,...e.suffix]),e.fullActionHash);
 const snapshot=structuredClone(prefix.snapshot);
 assert(e.allowedDifficulties.includes(snapshot.difficulty)&&r.allowedDifficulties.includes(snapshot.difficulty),"Start snapshot difficulty not permitted");
 const required=commits(b),forbidden=new Set([...(b.blockedResearch||[]),...[...allChoices].filter(k=>!required.includes(k))]);
 const planner=createCampaignStartResearchPlanner(data,snapshot,{maxAttempts:attempts,maxDepth:70,maxSteps,methodLimit:60,collectFailures:true,forbiddenResearch:[...forbidden],preserveResearch:required});
 node=planner.newNode();
 function check(before,after){
  assert(![...after.researched].some(k=>forbidden.has(k)),"Forbidden branch research");
  assert(!required.some(k=>active(before,k)&&!active(after,k)),"Branch commitment lost");
 }
 function apply(w,a){
  assert(!["externalInputs","campaignContext"].includes(a.type),"Forbidden state injection");
  let next;
  if(special(a)){
   assert(!w.pendingFree,"Pending free research");
   if(a.type==="conditionalMedal"&&a.medal==="STR_MEDAL_STATGAIN_NAME"){
    const threshold=data.commendationIndex[a.medal]?.criteria?.totalStatGain?.[a.level];
    assert(Number.isSafeInteger(threshold)&&gain(member(w).state)>=threshold,"Stat-gain medal threshold not met");
   }
   // Only monetary cost is abstracted, matching the normalization gate.
   const src=a.type==="transform"?{...w,funds:Number.MAX_SAFE_INTEGER}:w;
   next=replay.apply(src,a);
   if(a.type==="transform")next.funds=w.funds;
   assert(same(sorted(w.researched),sorted(next.researched))&&same(sorted(w.disabled),sorted(next.disabled)),"Unmodeled career-induced research change");
  }else{
   if(["research","repeatResearch"].includes(a.type)){const v=labVerdict(w,a.id,data,{repeat:a.type==="repeatResearch"});assert(v.ok,v.reason);}
   const q=applyCampaignStartStep(w,a,data);assert(q.ok,q.reason);next=q.world;
  }
  check(w,next);return next;
 }
 function ensure(ids){
  const q=planner.ensure(ids,node);assert(q.ok,q.unresolved+": "+q.reason);node=q.node;
 }
 const actions=[...full,...e.suffix];row.legacyActions=actions.length;
 for(at=0;at<actions.length;at++){
  const a=actions[at];
  if(a.type==="campaignContext"){assert.equal(a.difficulty,snapshot.difficulty);continue;}
  if(a.type==="externalInputs"){
   planner.supply(node,{items:a.items||{},functions:a.functions||[]},"source-gated replacement at "+at);
   continue;
  }
  if(a.type==="research"){if(!active(node.world,a.id))ensure([a.id]);continue;}
  if(a.type==="freeResearch"&&!node.world.pendingFree){if(!active(node.world,a.research))ensure([a.research]);continue;}
  if(a.type==="advanceMonth"&&a.month<=node.world.month)continue;
  if(a.type==="transform"){
   const rule=replay.rules.get(a.transform);assert(rule,"Unknown transformation");
   ensure(rule.requires||[]);
   planner.supply(node,{items:rule.requiredItems||{},functions:rule.requiresBaseFunc||[]},"training "+a.transform);
  }
  if(a.type==="recruit"){
   const p=data.profiles.find(p=>p.id===a.profile);assert(p,"Unknown origin");
   ensure(p.requires||[]);
   planner.supply(node,{items:p.acquisitionRequiredItems||{},functions:p.requiresBaseFunc||[]},"recruit "+a.profile);
  }
  if(special(a)){assert(node.steps.length<maxSteps,"Step limit");node.world=apply(node.world,a);node.steps.push(a);}
  else planner.append(node,a);
 }
 assert(!node.world.pendingFree&&required.every(k=>active(node.world,k)),"Incomplete branch");
 // Independent second replay of the actual emitted actions, not the planner world.
 let w=campaignStartWorld(data,snapshot);
 for(const a of node.steps)w=apply(w,a);
 assert(!w.pendingFree&&required.every(k=>active(w,k)));
 const f=replay.finish(w),planned=replay.finish(node.world);
 assert.deepEqual(f,planned,"Planner/replay stat mismatch");
 assert(member(w).state.history.has(e.target)&&f.body===receipt.body,"Target not achieved");
 row.status=same(f.permanentVector,e.after)?"NORMALIZED_CONDITIONAL_CAREER_REPLAY":"NORMALIZED_CHANGED_STATS_REVIEW";
 row.after=f.permanentVector;row.afterCap=f.permanentCapVector;row.gateVector=f.vector;row.actions=node.steps;row.actionHash=key(node.steps);row.difficulty=snapshot.difficulty;
 row.assumptions=["source-backed start model, not native gameplay","ordinary monetary cost excluded","conditional growth, medals and events retained","final admission requires shared registry migration"];
 }catch(err){row.status="REPAIR_PENDING";row.failedAt=at;row.reason=String(err.message);row.partialActions=node?.steps||[];row.partialActionHash=key(row.partialActions);}
 return row;
}
const jobs=receipt.produced,header={schema:"V110_NORMALIZED_CAREER_REPLAY_JSONL",sourceMetadataSha256:source,legacyGraphSha256:ledger.sourceGraphSha256,legacyFingerprint:ledger.fingerprint,startSnapshotHash:key(prefix.snapshot),startSourceFilesHash:key(files),initialResearch:sorted(prefix.initialResearch),jobs:jobs.length,registered:false,finalAdmission:false,gameCertified:false};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(header)+"\n",{flag:"wx"});
for(const e of jobs){const row=produce(e);fs.appendFileSync(out,JSON.stringify(row)+"\n");console.log(JSON.stringify({sourceRoute:row.sourceRoute,status:row.status,reason:row.reason,failedAt:row.failedAt,actions:row.actions?.length??row.partialActions?.length,after:row.after}));}
