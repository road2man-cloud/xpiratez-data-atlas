// V112: source-backed mixed event bundle + early hero birth and growth.
 // No invented inventory, event repeat, economic state, or final admission.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import {campaignStartWorld,labVerdict,applyCampaignStartStep,START_RESEARCH} from "../public/soldiers/modern/campaign-start-gate-v1.js";
import {createCampaignStartResearchPlanner} from "../public/soldiers/modern/campaign-start-research-planner-v1.js";
import {careerStatVectors} from "../public/soldiers/modern/campaign-start-career-actions-v1.js";
import {eventScriptVerdict} from "../public/soldiers/modern/event-chronology.js";

const args=new Map();
for(const a of process.argv.slice(2)){const m=/^--([a-z-]+)=(.+)$/.exec(a);assert(m&&!args.has(m[1]),"Invalid option "+a);args.set(m[1],m[2]);}
const get=(k,d)=>args.get(k)??d;
const required=k=>{const v=get(k);assert(v,"Missing --"+k);return v;};
const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const hash=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const arr=x=>Array.isArray(x)?x:[];
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
const sorted=x=>[...x].sort();
const data=read("public/data/soldiers-modern-index.json"),prefix=read(required("prefix"));
const source=data.meta.source.metadataSha256;
assert.equal(data.meta.mod.version,"v.o2");
assert.equal(prefix.sourceMetadataSha256,source);
assert.equal(prefix.snapshot.sourceFingerprint,source);
assert.deepEqual(sorted(prefix.initialResearch),sorted(Object.keys(START_RESEARCH)));
assert(!prefix.snapshot.researched.length&&!prefix.snapshot.disabled.length);
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;
data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
const yaml=createRequire(path.resolve("package.json"))("js-yaml");
const files={},facilities={},items={},research={},events={},eventScripts={};
const game=required("game");
function load(p,expected){
 const bytes=fs.readFileSync(p),name=path.basename(p),digest=createHash("sha256").update(bytes).digest("hex");
 assert.equal(digest,expected||prefix.sourceFiles[name],"Source hash mismatch "+name);
 files[name]=digest;
 const doc=yaml.load(bytes.toString("utf8"),{json:true})||{};
 for(const [k,dst] of Object.entries({facilities,items,research,events,eventScripts}))for(const row of doc[k]||[]){
  if(row.delete){delete dst[row.delete];continue;}const id=row.type||row.name;if(id)dst[id]={...dst[id],...row};
 }
}
for(const n of ["vars","startingBase","facilities","items","research"])load(path.join(game,"standard/xcom1",n+".rul"));
for(const e of [...data.meta.source.rules].sort((a,b)=>a.file.localeCompare(b.file,"en")))load(path.join(game,"user/mods/Piratez/Ruleset",e.file),e.sha256);
for(const [n,h] of Object.entries(prefix.sourceFiles))assert.equal(files[n],h);
const researchGrants={};
for(const [id,r] of Object.entries(research)){
 const grants={};if(r.spawnedItem&&items[r.spawnedItem])grants[r.spawnedItem]=r.spawnedItemCount??1;
 for(const k of r.spawnedItemList||[])if(items[k])grants[k]=(grants[k]||0)+1;
 if(Object.keys(grants).length)researchGrants[id]=grants;
}
data.campaignAssets={sourceFingerprint:source,facilities,items,researchGrants};
const EVENT="STR_KNOCK_KNOCK_PENITENT",SCRIPT="STR_KNOCK_KNOCK_0",ITEM="STR_HERO",PROFILE="manufacture:STR_HERO_RECRUITMENT";
const ev=events[EVENT],rawScript=eventScripts[SCRIPT];
const er=arr(data.eventResearchSources[ITEM]).find(x=>x.event===EVENT);
const script=arr(er?.scripts).find(s=>s.script===SCRIPT);
assert(ev&&rawScript&&script&&items[ITEM]&&er.choiceCount===1);
assert.deepEqual(ev.everyItemList,[ITEM]);assert.deepEqual(ev.researchList,[ITEM]);
assert(Object.keys(ev).every(k=>["name","type","description","background","music","everyItemList","researchList","timer","timerRandom"].includes(k)),"Unmodeled event reward");
assert(Object.keys(rawScript).every(k=>["type","eventWeights","firstMonth","lastMonth","executionOdds","researchTriggers"].includes(k)),"Unmodeled script trigger");
assert.equal(rawScript.executionOdds,script.executionOdds);
assert.equal(rawScript.firstMonth??0,script.firstMonth??0);
assert.equal(rawScript.lastMonth??null,script.lastMonth??null);
assert.deepEqual(sorted(Object.keys(rawScript.researchTriggers||{}).filter(k=>rawScript.researchTriggers[k])),sorted(script.researchPositive||[]));
assert.deepEqual(sorted(Object.keys(rawScript.researchTriggers||{}).filter(k=>!rawScript.researchTriggers[k])),sorted(script.researchNegative||[]));
const weights=Object.entries(rawScript.eventWeights).map(([month,w])=>({month:Number(month),weight:w[EVENT]||0,totalWeight:Object.values(w).reduce((a,b)=>a+b,0)})).sort((a,b)=>a.month-b.month);
assert.deepEqual(weights,script.monthWeights);
const bundle={policy:"V112_FIXED_MIXED_EVENT_BUNDLE",sourceFileSha256:files["Piratez_Events.rul"],item:ITEM,count:1};
const birth=data.profiles.find(p=>p.id===PROFILE);assert(birth&&birth.soldierType==="STR_SOLDIER_HERO");
const eventAction={type:"eventResearch",event:EVENT,script:SCRIPT,research:ITEM,assumeOutcome:true,fixedEventBundle:bundle};
const db=JSON.parse(gunzipSync(fs.readFileSync(required("db"))));
assert.equal(db.sourceMetadataSha256,source);
const bid=get("branch","branch-f895d2081b9effabafd34560"),branch=db.branches.find(b=>b.id===bid);assert(branch&&!branch.sourceRootConflict);
const commitments=[...(branch.captain||[]),...Object.values(branch.choices||{})].filter(Boolean);
const forbidden=new Set([...(branch.blockedResearch||[]),...db.branches.flatMap(b=>[...(b.captain||[]),...Object.values(b.choices||{})]).filter(k=>k&&!commitments.includes(k))]);
function check(w,z){
 assert(![...z.researched].some(k=>forbidden.has(k)),"Branch conflict");
 assert(!commitments.some(k=>active(w,k)&&!active(z,k)),"Branch commitment lost");
}
function apply(w,a){
 assert(!["externalInputs","campaignContext"].includes(a.type),"State injection");
 if(["research","repeatResearch"].includes(a.type)){const v=labVerdict(w,a.id,data,{repeat:a.type==="repeatResearch"});assert(v.ok,v.reason);}
 if(a.fixedEventBundle){
  assert.deepEqual(a,eventAction);assert(!w.generatedEvents?.[EVENT],"Event replay forbidden");
  const v=eventScriptVerdict({...script,eventId:EVENT},w,{mode:"current"});
  assert(!v.blocked.length&&!v.unknown.length,[...v.blocked,...v.unknown].join("; "));
  // Existing gate owns research/lookup, event count and source-backed research grants.
  // This adapter accounts for the fixed physical item once; never assumes another draw.
  const q=applyCampaignStartStep(w,a,data);assert(q.ok,q.reason);
  assert.equal(q.world.generatedEvents[EVENT],1);
  q.world.items[ITEM]=(q.world.items[ITEM]||0)+1;
  check(w,q.world);return q.world;
 }
 const q=applyCampaignStartStep(w,a,data);assert(q.ok,q.reason);check(w,q.world);return q.world;
}
const out=required("out"),snapshot=prefix.snapshot,attempts=Number(get("attempts","150"));
assert(Number.isSafeInteger(attempts)&&attempts>0&&!fs.existsSync(out));
const modes=get("modes","early,gold").split(",");assert(modes.every(m=>["early","gold"].includes(m))&&new Set(modes).size===modes.length);
const report={schema:"V113_HERO_START_TRAINING_LANES",sourceMetadataSha256:source,sourceFilesHash:hash(files),snapshotHash:hash(snapshot),initialResearch:sorted(prefix.initialResearch),eventSource:{event:EVENT,script:SCRIPT,weights,executionOdds:script.executionOdds,bundle},legacyBranchHint:bid,scope:"CONDITIONAL_BIRTH_AND_CAREER_STAGES_NOT_FINAL_BRANCH",routes:[],blockers:[],registered:false,finalAdmission:false,gameCertified:false};
const persist=()=>fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
for(const mode of modes){
 const planner=createCampaignStartResearchPlanner(data,snapshot,{maxAttempts:attempts,maxDepth:55,maxSteps:1500,methodLimit:40,forbiddenResearch:[...forbidden],preserveResearch:commitments,collectFailures:true});
 let n=planner.newNode(),stage="start";
 function ensure(id){if(active(n.world,id))return;const q=planner.ensure([id],n);assert(q.ok,id+": "+q.reason);n=q.node;}
 function append(a){n.world=apply(n.world,a);n.steps.push(a);}
 function save(name){
  let w=campaignStartWorld(data,snapshot);for(const a of n.steps)w=apply(w,a);
  assert(!w.pendingFree);
  const m=w.soldiers.find(s=>s.id==="origin"),p=n.world.soldiers.find(s=>s.id==="origin");
  const stats=m?careerStatVectors(m,data):null;
  if(m)assert.deepEqual(stats,careerStatVectors(p,data));
  const confirmed=commitments.filter(k=>active(w,k)),row={mode,stage:name,actionHash:hash(n.steps),actions:structuredClone(n.steps),activeResearch:sorted([...w.researched].filter(k=>active(w,k))),confirmedCommitments:confirmed,missingCommitments:commitments.filter(k=>!active(w,k)),canonicalBranchCertified:false,origin:m?PROFILE:null,body:m?.state.soldierType??null,stats,history:m?[...m.state.history]:[],gameCertified:false,registered:false,finalAdmission:false};
  report.routes.push(row);persist();console.log(JSON.stringify({mode,stage:name,actions:row.actions.length,body:row.body,confirmed:confirmed.length}));
 }
 try{
  if(mode==="gold"){
   const record=prefix.records.find(r=>r.goal==="STR_CODEX_GOLD"&&r.status==="conditional-replay");assert(record);
   for(const a of record.actions)append(a);
  }
  for(const id of ["STR_JACKSTOWN_SCOUTING","STR_WAT_DO","STR_RECRUIT_PEASANTS","STR_INSPECT_MACHINERY"])ensure(id);
  stage="hero-event";append(eventAction);
  assert(n.world.items[ITEM]>=1);ensure("STR_HERO_RECRUITMENT");
  stage="recruit";append({type:"recruit",soldier:"origin",profile:PROFILE,band:"min"});
  assert(n.world.soldiers.some(s=>s.id==="origin"&&s.state.soldierType===birth.soldierType));
  save("HERO_RECRUITED");
  stage="growth";append({type:"conditionalCapGrowth",soldier:"origin",assumption:true});save("HERO_GROWN");
  const grown=planner.clone(n);
  const targets=get("targets","STR_NEPOTISM,STR_SCHOOL_OF_HARD_KNOCKS,STR_BASIC_FIREARMS_TRAINING").split(",").filter(Boolean);
  const tasks=[...new Set(targets)];
  for(const id of tasks){
   n=planner.clone(grown);stage=id;
   try{
    const rule=data.transformations.find(t=>t.id===id);
    assert(rule&&rule.allowedSoldierTypes.includes(birth.soldierType)&&rule.allowsLiveSoldiers&&!rule.createsClone&&!rule.producedItem&&!rule.reset,"Unsupported training");
    assert(!forbidden.has(id)&&!(rule.requires||[]).some(k=>forbidden.has(k)),"Branch excludes training");
    // The male-path school requires its own path decision. Never borrow the
    // peasant-path witness or mark its canonical branch complete.
    if(id==="STR_SCHOOL_OF_HARD_KNOCKS"){
     assert.equal(branch.choices.path,"STR_WE_NEED_MALE_TOUCH_PREQ","School requires a separate male-path branch");
     ensure(branch.choices.path);
    }
    for(const k of rule.requires||[])ensure(k);
    planner.supply(n,{items:rule.requiredItems||{},functions:rule.requiresBaseFunc||[]},"training "+id);
    while(n.world.soldiers.find(s=>s.id==="origin").state.rank<(rule.minRank||0)){
     const rank=n.world.soldiers.find(s=>s.id==="origin").state.rank+1;
     append({type:"conditionalPromotion",soldier:"origin",rank,assumption:true});
    }
    append({type:"transform",soldier:"origin",transform:rule.id});
    assert(n.world.soldiers.find(s=>s.id==="origin").state.history.has(id),"Training history missing");
    save("TRAINED:"+id);
   }catch(e){report.blockers.push({mode,stage,reason:String(e.message),partialActions:structuredClone(n.steps),partialActionHash:hash(n.steps)});persist();console.log(JSON.stringify({mode,stage,reason:String(e.message),partial:n.steps.length}));}
  }
  // Produce useful gun-category prerequisites even if a later category
  // cannot yet be obtained. Each receipt is independently replayed.
  n=planner.clone(grown);stage="STR_SMGS_SUMMARY";
  try{ensure("STR_CONTACT_GENERAL_SUPPLIES");ensure("STR_SMGS_SUMMARY");save("RESEARCH:STR_SMGS_SUMMARY");}
  catch(e){report.blockers.push({mode,stage,reason:String(e.message),partialActions:structuredClone(n.steps),partialActionHash:hash(n.steps)});persist();}

 }catch(e){report.blockers.push({mode,stage,reason:String(e.message),partialActions:structuredClone(n.steps),partialActionHash:hash(n.steps)});persist();console.log(JSON.stringify({mode,stage,reason:String(e.message),partial:n.steps.length}));}
}
report.summary={stageWitnesses:report.routes.length,recruited:report.routes.filter(r=>r.stage==="HERO_RECRUITED").length,grown:report.routes.filter(r=>r.stage==="HERO_GROWN").length,trained:report.routes.filter(r=>r.stage.startsWith("TRAINED:")).length,researchStages:report.routes.filter(r=>r.stage.startsWith("RESEARCH:")).length,blockers:report.blockers.length};
persist();console.log(JSON.stringify(report.summary));
