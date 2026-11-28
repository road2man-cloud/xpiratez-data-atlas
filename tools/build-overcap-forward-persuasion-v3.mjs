// Continue the exact source-start GDX branches with new source actions.
// Never grant rank from unknown score; retain every unselected offered edge.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gzipSync} from "node:zlib";
import {resumeCaptainGdx} from "./replay-overcap-forward-captain-gdx-v3.mjs";
import {createPersuasionSupply} from "./atlas-overcap-forward-persuasion-v3.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
import {key} from "./population-research-career-core.mjs";
const dir="tools/data/",sha=b=>createHash("sha256").update(b).digest("hex"),arr=x=>Array.isArray(x)?x:[],sort=x=>[...x].sort(),load=p=>JSON.parse(fs.readFileSync(p));
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)||d;
const scenario=arg("scenario","baseline"),rootArg=arg("root","ALL"),awardArg=arg("award","ALL");
const ip=dir+"overcap-forward-captain-gdx-active-v3.json",ib=fs.readFileSync(ip),index=JSON.parse(ib),sp=dir+"overcap-forward-persuasion-sources-v3.json",sb=fs.readFileSync(sp),source=JSON.parse(sb);
assert.equal(source.nativeArchiveSha256,sha(fs.readFileSync("tools/headless-simulator/native/oxce-source.tar.gz")));
const producers=Object.fromEntries(["tools/build-overcap-forward-persuasion-v3.mjs","tools/build-overcap-forward-persuasion-sources-v3.mjs","tools/atlas-overcap-forward-persuasion-v3.mjs","tools/replay-overcap-forward-captain-gdx-v3.mjs"].map(p=>[p,sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))]));
const inputs={baseSha256:sha(ib),sourceSha256:sha(sb),producers},rows=[];
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const targets=["STR_EXPEDITIONS","STR_EXPEDITION_RESEARCH_INCOMPLETE","STR_VODKA","STR_LINGERIE","STR_MUTANT_BLESSINGS","STR_RIBBON","STR_OLD_EARTH_VOODOO","STR_MOST_COMMON_POWER","STR_WENCH_OUTFIT","STR_SOCIALIZING","STR_BOOK_OF_SERMONS","STR_PERSUASION","STR_SECTOID_LEADER","STR_CAPTAINS_RANK_01","STR_CAPTAINS_RANK_02","STR_PIRATEZ_HIERARCHY","STR_GDX_003","STR_GDX_004","STR_GDX_005","STR_CONTACT_MUTANT_ALLIANCE","STR_SCHOOL_BOOKS","STR_LIBRARY","STR_SCHOOLING_2"];
for(const row of index.scenarios.filter(r=>(scenario==="ALL"||r.scenario===scenario)&&(rootArg==="ALL"||r.root===rootArg)))for(const b of row.branches.filter(b=>awardArg==="ALL"||b.award===awardArg)){
 const c=resumeCaptainGdx({scenario:row.scenario,root:row.root,award:b.award}),data=c.data,sourceSupply=createPersuasionSupply(data,source),rules=data.researchRules;
 let world=c.world;const steps=[],frontiers=[],failures=[];
 const cache=new WeakMap();
 function opts(w){
  if(cache.has(w))return cache.get(w);
  let choices;
  if(w.pendingFree||arr(w.forwardDeliveries).length)choices=c.optionsAt(w);
  else if(arr(w.forwardPersuasionEvents).length)choices=sourceSupply.options(w);
  else choices=[...c.optionsAt(w).filter(x=>!x.action.type.startsWith("sourceCaptain")&&x.action.type!=="sourceGdxCapture"&&x.action.type!=="sourceMissionRecovery"),...sourceSupply.options(w)];
  cache.set(w,choices);return choices;
 }
 function record(opt,phase){
  assert(opt,"No current option: "+phase);
  const w=world,choices=opts(w);assert(choices.some(x=>key([x.action,x.evidence])===key([opt.action,opt.evidence])));
  const a=opt.action,r=a.type.startsWith("sourcePersuasion")||a.type.startsWith("sourceExpedition")?sourceSupply.apply(w,opt):c.apply(w,opt),n=r.world,items={};
  for(const k of new Set([...Object.keys(w.items),...Object.keys(n.items)])){const before=Number(w.items[k]||0),after=Number(n.items[k]||0);if(before!==after)items[k]={before,after,delta:after-before};}
  steps.push({index:c.through+steps.length+1,phase,action:a,evidence:opt.evidence,beforeHash:exactStateHash(w),afterHash:exactStateHash(n),monthBefore:w.month,monthAfter:n.month,added:sort([...n.researched].filter(k=>!w.researched.has(k))),closed:sort([...n.disabled].filter(k=>!w.disabled.has(k))),itemChanges:items,conditional:r.conditional,notes:r.notes});
  frontiers.push({beforeHash:exactStateHash(w),selected:a,deferred:choices.filter(x=>key([x.action,x.evidence])!==key([a,opt.evidence]))});
  world=n;
 }
 const choose=fn=>opts(world).find(fn);
 function settle(phase){
  for(let i=0;i<100&&(world.pendingFree||arr(world.forwardDeliveries).length);i++){
   const choices=opts(world);const opt=world.pendingFree?choices.find(x=>x.action.type==="freeResearch"&&targets.includes(x.action.research))||choices[0]:choices.find(x=>x.action.type==="sourceResearchDelivery");record(opt,phase);
  }
  assert(!world.pendingFree&&!arr(world.forwardDeliveries).length);
 }
 function lab(id,phase){
  if(active(world,id))return true;
  const opt=choose(x=>x.action.type==="research"&&x.action.id===id);
  if(!opt)return false;record(opt,phase);settle(phase);return active(world,id);
 }
 // For missing ordinary dependencies, expand only currently offered labs.
 // Zero-cost auto flags can have OR sources, so do not require every one.
 function tryGoal(id,phase,seen=new Set()){
  if(active(world,id))return true;if(seen.has(id)||world.disabled.has(id)||!rules[id])return false;seen.add(id);
  if(lab(id,phase))return true;
  const r=rules[id];if(r.cost===0){for(const k of arr(r.dependencies)){tryGoal(k,phase,seen);if(active(world,id))return true;}return false;}
  for(const k of arr(r.dependencies))if(!active(world,k))tryGoal(k,phase,seen);
  if(r.needItem&&!world.items[r.neededItem||id]){
   const item=r.neededItem||id,opt=choose(x=>x.action.type==="sourceRandomManufacture"&&(x.evidence.fixed?.[item]||x.evidence.random?.[item])>0);
   if(opt)record(opt,phase+"_JUNK_SAMPLE");
  }
  return lab(id,phase);
 }
 try{
  tryGoal("STR_EXPEDITIONS","EXPEDITION_ACCESS");
  const order=choose(x=>x.action.type==="sourceExpeditionOrder");if(order)record(order,"EXPEDITION_ORDER");
  const month=opts(world).filter(x=>x.action.type==="sourcePersuasionMonth").sort((a,b)=>b.action.scripts.length-a.action.scripts.length)[0];
  record(month,"MONTHLY_SOURCE_EVENTS");
  while(arr(world.forwardPersuasionEvents).length){
   const choices=opts(world),opt=choices.find(x=>x.action.type==="sourcePersuasionExpire"&&x.action.research==="STR_VODKA"&&x.action.item==="STR_VODKA")||choices.find(x=>x.action.type==="sourcePersuasionExpire"&&x.action.item==="STR_VODKA")||choices[0];
   record(opt,"EVENT_EXPIRY");settle("EVENT_DELIVERY");
  }
  for(const id of ["STR_VODKA","STR_LINGERIE","STR_MUTANT_BLESSINGS","STR_RIBBON","STR_OLD_EARTH_VOODOO","STR_MOST_COMMON_POWER","STR_WENCH_OUTFIT","STR_SOCIALIZING","STR_NEPOTISM","STR_SALVAGE","STR_CEREMONY_DEP"])tryGoal(id,"SOCIAL_PREREQUISITES");
  // Preserve the time boundary: delivery is not immediate after payment.
  if(world.forwardExpeditionOrder){
   while(world.month<world.forwardExpeditionOrder.month+2){
    record(choose(x=>x.action.type==="sourcePersuasionMonth"&&!x.action.scripts.length),"EXPEDITION_TRANSFER_WAIT");
   }
   record(choose(x=>x.action.type==="sourceExpeditionDelivery"),"EXPEDITION_DELIVERY");
   const extraSample=!active(world,"STR_PORN");
   record(choose(x=>x.action.type==="sourceExpeditionManufacture"&&x.action.id==="STR_EXPEDITION_DEBRIEF"&&(extraSample?x.evidence.random.STR_LOOTBOX_EXPEDITION===1:!Object.keys(x.evidence.random).length)),"EXPEDITION_DEBRIEF");
   record(choose(x=>x.action.type==="sourceExpeditionManufacture"&&x.action.id==="STR_LOOTBOX_EXPEDITION_EX"&&x.evidence.random.STR_BOOK_OF_SERMONS>0),"SERMON_BOOK_EXTRACTION");
   if(extraSample){record(choose(x=>x.action.type==="sourceExpeditionManufacture"&&x.action.id==="STR_LOOTBOX_EXPEDITION_EX"&&x.evidence.random.STR_PORN>0),"SECOND_EXPEDITION_BOX_EXTRACTION");tryGoal("STR_PORN","SECOND_BOX_SAMPLE_RESEARCH");
    for(const id of ["STR_OLD_EARTH_VOODOO","STR_MOST_COMMON_POWER","STR_WENCH_OUTFIT","STR_SOCIALIZING"])tryGoal(id,"SOCIAL_PREREQUISITES_AFTER_SECOND_BOX");
   }
  }
  for(const id of ["STR_BOOK_OF_SERMONS","STR_PERSUASION","STR_SECTOID_LEADER"])tryGoal(id,"PERSUASION_AND_LEADER");
 }catch(e){failures.push({phase:steps.at(-1)?.phase||"START",reason:e.message});}
 const final={stateHash:exactStateHash(world),month:world.month,researchCount:world.researched.size,researched:sort(world.researched),disabled:sort(world.disabled),items:world.items,baseFunctions:sort(world.baseFunctions),receipts:arr(world.forwardPersuasionReceipts),rankBlockers:sourceSupply.rankBlockers(world),targets:targets.map(id=>({id,reached:active(world,id),disabled:world.disabled.has(id),missingDependencies:arr(rules[id]?.dependencies).filter(k=>!active(world,k)),missingFunctions:arr(rules[id]?.requiresBaseFunc).filter(k=>!world.baseFunctions.has(k)),held:rules[id]?.needItem?Number(world.items[rules[id].neededItem||id]||0):null}))};
 const result={schema:"ATLAS_FORWARD_PERSUASION_SCENARIO_V3",scenario:c.scenario,root:c.root,award:c.award,inputs,prefix:{path:c.artifact,sha256:c.artifactSha256,stateHash:c.stateHash,steps:c.through},steps,frontiers,failures,final,nextOptions:opts(world),normalizationComplete:false,actualGameCertified:false,scope:"Conditional source choices, exact prior hash replay, no invented rank or absolute score. Funds/storage/calendar/labor and other campaign events remain assumed/untracked."};
 const stem=dir+"overcap-forward-persuasion-v3-"+c.scenario+"-"+c.root.toLowerCase()+"-"+c.award.toLowerCase(),bytes=gzipSync(JSON.stringify(result),{level:9});
 fs.writeFileSync(stem+".json.gz",bytes);const report={...result,frontiers:undefined,nextOptions:undefined,artifact:stem+".json.gz",artifactSha256:sha(bytes),deferredOptions:frontiers.reduce((n,f)=>n+f.deferred.length,0)+result.nextOptions.length};fs.writeFileSync(stem+"-summary.json",JSON.stringify(report,null,2)+"\n");
 const entry={scenario:c.scenario,root:c.root,award:c.award,path:report.artifact,summary:stem+"-summary.json",sha256:report.artifactSha256,prefix:report.prefix,newSteps:steps.length,month:final.month,researchCount:final.researchCount,stateHash:final.stateHash,reached:final.targets.filter(x=>x.reached).map(x=>x.id),rankBlockers:final.rankBlockers,deferredOptions:report.deferredOptions,failures};
 rows.push(entry);console.log(JSON.stringify(entry));
}
assert(rows.length);
fs.writeFileSync(dir+"overcap-forward-persuasion-active-v3-"+scenario.toLowerCase()+".json",JSON.stringify({schema:"ATLAS_FORWARD_PERSUASION_ACTIVE_V3",inputs,scenarioFilter:scenario,rootFilter:rootArg,awardFilter:awardArg,scenarios:rows,normalizationComplete:false,actualGameCertified:false},null,2)+"\n");
