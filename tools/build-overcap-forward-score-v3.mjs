// Build monthly ledgers for every existing persuasion branch. Produce new
// score-directed lab paths from exact replayed representative cursors.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gzipSync,gunzipSync} from "node:zlib";
import {resumeCaptainGdx} from "./replay-overcap-forward-captain-gdx-v3.mjs";
import {createPersuasionSupply} from "./atlas-overcap-forward-persuasion-v3.mjs";
import {buildScoreLedger,rankRequirements} from "./atlas-overcap-forward-score-v3.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
import {key} from "./population-research-career-core.mjs";
const dir="tools/data/",sha=b=>createHash("sha256").update(b).digest("hex"),load=p=>JSON.parse(fs.readFileSync(p)),arr=x=>Array.isArray(x)?x:[],sort=x=>[...x].sort();
const ip=dir+"overcap-forward-persuasion-active-v3.json",ib=fs.readFileSync(ip),index=JSON.parse(ib),sp=dir+"overcap-forward-score-sources-v3.json",sb=fs.readFileSync(sp),source=JSON.parse(sb);
const ps=load(dir+"overcap-forward-persuasion-sources-v3.json"),data=load("public/data/soldiers-modern-index.json");
assert.equal(source.sourceMetadataSha256,data.meta.source.metadataSha256);assert.equal(source.nativeArchiveSha256,sha(fs.readFileSync("tools/headless-simulator/native/oxce-source.tar.gz")));
assert.equal(index.inputs.sourceSha256,sha(fs.readFileSync(dir+"overcap-forward-persuasion-sources-v3.json")));
const norm=p=>sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"));
for(const [p,h] of Object.entries(index.inputs.producers))assert.equal(norm(p),h,p);
const producers=Object.fromEntries(["tools/build-overcap-forward-score-v3.mjs","tools/build-overcap-forward-score-sources-v3.mjs","tools/atlas-overcap-forward-score-v3.mjs"].map(p=>[p,norm(p)]));
const inputs={persuasionIndexSha256:sha(ib),scoreSourceSha256:sha(sb),producers};
const read=(path,hash)=>{const b=fs.readFileSync(path);assert.equal(sha(b),hash,path);return JSON.parse(gunzipSync(b));};
function history(row){
 const g=read(row.path,row.sha256),p=read(g.prefix.path,g.prefix.sha256),b=p.branches.find(x=>x.award===row.award);assert(b&&!b.failure);
 assert.equal(b.final.stateHash,g.prefix.stateHash);assert.equal(g.final.stateHash,row.stateHash);
 const steps=[...p.shared,...b.steps,...g.steps].map((s,i)=>({...s,sourceIndex:s.index,index:i+1}));let h=p.initialHash;
 for(const s of steps){assert.equal(s.beforeHash,h);h=s.afterHash;}assert.equal(h,g.final.stateHash);
 return {g,p,steps};
}
const ledgerRows=index.scenarios.map(row=>{
 const {g,steps}=history(row),l=buildScoreLedger(steps,source);
 const w={month:g.final.month,researched:new Set(g.final.researched),disabled:new Set(g.final.disabled)};
 return {scenario:row.scenario,root:row.root,award:row.award,prefix:row.path,prefixSha256:row.sha256,stateHash:g.final.stateHash,...l,rankRequirements:rankRequirements(w,l,source)};
});
const ledgerPath=dir+"overcap-forward-score-ledgers-v3.json.gz",lb=gzipSync(JSON.stringify({schema:"ATLAS_FORWARD_SCORE_LEDGER_REGISTRY_V3",inputs,rows:ledgerRows}),{level:9});fs.writeFileSync(ledgerPath,lb);
const targetArg=process.argv.find(x=>x.startsWith("--scenario="))?.slice(11)||"baseline",limit=Number(process.argv.find(x=>x.startsWith("--steps="))?.slice(8)||"42");
assert(Number.isInteger(limit)&&limit>0&&limit<=100);
const selected=index.scenarios.filter(r=>r.scenario===targetArg&&r.root==="STR_INSPECT_MACHINERY"&&r.award==="STR_BEASTMEN");assert.equal(selected.length,1);
const outRows=[];
for(const row of selected){
 const {g,steps:prefixSteps}=history(row),c=resumeCaptainGdx({scenario:row.scenario,root:row.root,award:row.award}),supply=createPersuasionSupply(c.data,ps),rules=c.data.researchRules;
 const optCache=new WeakMap();
 function options(w){
  const hit=optCache.get(w);if(hit)return hit;let a;
  if(w.pendingFree||arr(w.forwardDeliveries).length)a=c.optionsAt(w);
  else if(arr(w.forwardPersuasionEvents).length)a=supply.options(w);
  else a=[...c.optionsAt(w).filter(x=>!x.action.type.startsWith("sourceCaptain")&&x.action.type!=="sourceGdxCapture"&&x.action.type!=="sourceMissionRecovery"),...supply.options(w)];
  optCache.set(w,a);return a;
 }
 function apply(w,opt){
  assert(options(w).some(x=>key([x.action,x.evidence])===key([opt.action,opt.evidence])),"No current option");
  return opt.action.type.startsWith("sourcePersuasion")||opt.action.type.startsWith("sourceExpedition")?supply.apply(w,opt):c.apply(w,opt);
 }
 let world=c.world;assert.equal(exactStateHash(world),g.prefix.stateHash);
 for(const step of g.steps){assert.equal(exactStateHash(world),step.beforeHash);world=apply(world,step).world;assert.equal(exactStateHash(world),step.afterHash);}
 const startHash=exactStateHash(world);assert.equal(startHash,row.stateHash);
 const newSteps=[],frontiers=[],failures=[],protectedIds=new Set(g.final.researched.filter(id=>!g.final.disabled.includes(id))),seen=new Set([startHash]);
 const points=id=>source.research[id]?.points??0;
 const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
 // Avoid closing any prior active milestone in this particular score branch.
 // Other offered options remain recorded for independent branch exploration.
 function priority(w,opt){
  const a=opt.action;
  if(a.type==="freeResearch")return 100000+points(a.research);
  if(a.type==="sourceResearchDelivery")return 100000;
  if(a.type!=="research")return -Infinity;
  const r=rules[a.id];if(!r||r.disables.some(k=>protectedIds.has(k)))return -Infinity;
  const p=points(a.id);if(p<=0&&r.unlocks.length===0&&r.getOneFree.length===0)return -Infinity;
  const bonus=Math.max(0,...r.getOneFree.filter(k=>!w.researched.has(k)&&!w.disabled.has(k)).map(points));
  return (p+bonus*0.65)/Math.max(1,r.cost)*100+p;
 }
 let stop="STEP_LIMIT";
 for(let i=0;i<limit||world.pendingFree||arr(world.forwardDeliveries).length;i++){
  if(i>limit+50)throw Error("Unsettled mandatory queue");
  const choices=options(world),ranked=choices.map((opt,i)=>({opt,i,p:priority(world,opt)})).filter(x=>Number.isFinite(x.p)).sort((a,b)=>b.p-a.p||a.i-b.i);
  let chosen=null;
  for(const {opt} of ranked){
   try{
    const r=apply(world,opt),n=r.world,h=exactStateHash(n);
    if(seen.has(h)||[...protectedIds].some(k=>!active(n,k)))continue;
    const s={index:prefixSteps.length+newSteps.length+1,action:opt.action,evidence:opt.evidence,beforeHash:exactStateHash(world),afterHash:h,monthBefore:world.month,monthAfter:n.month,added:sort([...n.researched].filter(k=>!world.researched.has(k))),closed:sort([...n.disabled].filter(k=>!world.disabled.has(k))),conditional:r.conditional,notes:r.notes};
    chosen=opt;newSteps.push(s);seen.add(h);world=n;break;
   }catch(e){failures.push({action:opt.action,reason:e.message});}
  }
  frontiers.push({beforeHash:chosen?newSteps.at(-1).beforeHash:exactStateHash(world),selected:chosen?.action||null,deferred:choices.filter(x=>!chosen||key([x.action,x.evidence])!==key([chosen.action,chosen.evidence]))});
  if(!chosen){stop="NO_MORE_POSITIVE_SUPPORTED_RESEARCH";break;}
 }
 assert(!world.pendingFree&&!arr(world.forwardDeliveries).length);
 const prior=buildScoreLedger(prefixSteps,source),ledger=buildScoreLedger([...prefixSteps,...newSteps],source),ranks=rankRequirements(world,ledger,source);
 const final={stateHash:exactStateHash(world),month:world.month,researched:sort(world.researched),disabled:sort(world.disabled),items:world.items,baseFunctions:sort(world.baseFunctions),facilities:sort(world.facilities),rankRequirements:ranks,rank01:false,rank02:false};
 assert(!active(world,"STR_CAPTAINS_RANK_01")&&!active(world,"STR_CAPTAINS_RANK_02"));
 const gdx={state:"OPEN",mission:source.gdxPrison.deployment,required:source.gdxPrison.missionConditions.researchPositive,missing:source.gdxPrison.missionConditions.researchPositive.filter(k=>!active(world,k)),startingConstraints:source.gdxPrison.startingConstraints,sample:source.gdxPrison.item,sampleCount:source.gdxPrison.count,missionReward:source.gdxPrison.successResearch,admitted:false};
 const result={schema:"ATLAS_FORWARD_SCORE_PRODUCTION_V3",scenario:row.scenario,root:row.root,award:row.award,inputs,prefix:{path:row.path,sha256:row.sha256,stateHash:startHash,steps:prefixSteps.length},steps:newSteps,frontiers,failures,stop,priorWindow:prior.windows.at(-1),scoreWindow:ledger.windows.at(-1),newLedgerEntries:ledger.entries.filter(e=>e.step>prefixSteps.length),final,gdx,normalizationComplete:false,actualGameCertified:false,scope:"Additional research selected by source points/cost, not native elapsed research time. Native score and region activity remain unknown; no rank is granted. Prior active flags preserved."};
 const stem=dir+"overcap-forward-score-v3-"+row.scenario+"-"+row.root.toLowerCase()+"-"+row.award.toLowerCase(),b=gzipSync(JSON.stringify(result),{level:9});fs.writeFileSync(stem+".json.gz",b);
 const summary={...result,frontiers:undefined,artifact:stem+".json.gz",artifactSha256:sha(b),newSteps:newSteps.length,newResearch:world.researched.size-g.final.researched.length,researchCount:world.researched.size,deferredOptions:frontiers.reduce((n,f)=>n+f.deferred.length,0)};
 fs.writeFileSync(stem+"-summary.json",JSON.stringify(summary,null,2)+"\n");
 outRows.push({scenario:row.scenario,root:row.root,award:row.award,path:summary.artifact,summary:stem+"-summary.json",sha256:summary.artifactSha256,stateHash:final.stateHash,newSteps:summary.newSteps,newResearch:summary.newResearch,researchCount:summary.researchCount,priorWindow:summary.priorWindow,scoreWindow:summary.scoreWindow,rankRequirements:ranks,deferredOptions:summary.deferredOptions,stop});
 console.log(JSON.stringify(outRows.at(-1)));
}
const output={schema:"ATLAS_FORWARD_SCORE_ACTIVE_V3",inputs,ledger:{path:ledgerPath,sha256:sha(lb),scenarios:ledgerRows.length,unresolvedEntries:ledgerRows.reduce((n,x)=>n+x.unresolved.length,0)},scenarios:outRows,normalizationComplete:false,actualGameCertified:false};
fs.writeFileSync(dir+"overcap-forward-score-active-v3-"+targetArg+".json",JSON.stringify(output,null,2)+"\n");
