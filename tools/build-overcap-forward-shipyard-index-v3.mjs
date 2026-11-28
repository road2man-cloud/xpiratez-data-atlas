// Keep geography scenarios isolated, and export an actionable mission-source
// queue. Research gates matching a cursor are NOT recovery/mission admission.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
const sha=b=>createHash("sha256").update(b).digest("hex"),load=p=>JSON.parse(fs.readFileSync(p)),arr=x=>Array.isArray(x)?x:[];
const dir="tools/data/",basePath=dir+"overcap-forward-research-v3-active.json",base=load(basePath);
const mapPath=dir+"overcap-forward-map-source-index-v3.json.gz",mapBytes=fs.readFileSync(mapPath),map=JSON.parse(gunzipSync(mapBytes)),data=load("public/data/soldiers-modern-index.json");
assert.equal(map.sourceMetadataSha256,base.sourceMetadataSha256);
const rows=[];
for(const name of fs.readdirSync(dir).filter(n=>/^overcap-forward-shipyard-v3-(baseline|uk)-str_.*-summary\.json$/.test(n)).sort()){
 const p=dir+name,s=load(p),b=fs.readFileSync(s.artifact);
 assert.equal(sha(b),s.artifactSha256);
 const g=JSON.parse(gunzipSync(b));assert.equal(g.final.stateHash,s.final.stateHash);assert.equal(g.scenario,s.scenario);
 assert.deepEqual(g.inputs,base.inputs);
 assert.equal(g.baselineGraphSha256,base.graph.sha256);
 assert.equal(g.steps.length,s.totalSteps);assert.equal(g.steps.at(-1).afterHash,s.final.stateHash);
 for(let i=1;i<g.steps.length;i++)assert.equal(g.steps[i-1].afterHash,g.steps[i].beforeHash);
 if(s.scenario==="uk"){assert.equal(s.baselineCursor,null);assert.equal(s.initialAction.scenarioContext.country,"STR_UK");}
 else assert.equal(s.baselineCursor,base.rootCursors.find(r=>r.root===s.root).finalNode);
 rows.push({scenario:s.scenario,root:s.root,path:s.artifact,summary:p,sha256:s.artifactSha256,stateHash:s.final.stateHash,steps:s.totalSteps,labDepth:s.labDepth,researchCount:s.researchCount,month:s.final.month,targets:s.targets,necroParts:s.final.items.STR_NECROPLANE_PARTS||0,deferredOptions:s.deferredOptions,status:s.status,world:s.final});
}
assert.equal(rows.filter(r=>r.scenario==="uk").length,4);assert.equal(rows.filter(r=>r.scenario==="baseline").length,1);
const targets=["STR_GDX_005","STR_PADD","STR_ACADEMY_CORPSE","STR_GOVT_CORPSE","STR_STUN_BATON","STR_NECROPLANE_PARTS"];
function tasks(r){
 const w=r.world,active=id=>w.researched.includes(id)&&!w.disabled.includes(id);
 const q=[];
 for(const item of targets){
  if(active(item)||Number(w.items[item]||0)>0)continue;
  for(const t of arr(map.byItem[item])){
   const m=t.missionConditions,missingResearch=arr(m.researchPositive).filter(k=>!active(k)),forbidden=arr(m.researchNegative).filter(active);
   // The final snapshot includes local stores but not a complete live
   // roster, geography, global inventory or actual generated mission.
   const itemContextNeeded=!!(arr(m.itemPositive).length||arr(m.itemNegative).length);
   const outsideWindow=w.month<(m.firstMonth||0)||m.lastMonth!=null&&m.lastMonth>=0&&w.month>m.lastMonth;
   const sourceReady=t.status==="FIXED_SOURCE_CANDIDATE"&&!missingResearch.length&&!forbidden.length&&!outsideWindow&&!itemContextNeeded&&!t.extraTriggerFields.length;
   q.push({item,deployment:t.deployment,missionScript:t.missionScript,actualScript:t.actualScript,terrain:t.terrain,block:t.block,placement:t.placement,count:t.count,missingResearch,forbidden,outsideWindow,itemContextNeeded,startingCondition:t.startingCondition,successResearch:t.successResearch,sourceStatus:t.status,sourceReasons:t.reasons,stage:sourceReady?"OPEN_RECOVERY_WITNESS_NEEDED":"OPEN_SOURCE_OR_GATE",admitted:false});
  }
 }
 q.sort((a,b)=>Number(b.stage==="OPEN_RECOVERY_WITNESS_NEEDED")-Number(a.stage==="OPEN_RECOVERY_WITNESS_NEEDED")||a.missingResearch.length-b.missingResearch.length||Number(a.outsideWindow)-Number(b.outsideWindow)||a.item.localeCompare(b.item));
 return {scenario:r.scenario,root:r.root,stateHash:r.stateHash,taskCount:q.length,readyForRecoveryWitness:q.filter(x=>x.stage==="OPEN_RECOVERY_WITNESS_NEEDED").length,tasks:q};
}
const queue={schema:"ATLAS_FORWARD_MISSION_ACQUISITION_QUEUE_V3",sourceMetadataSha256:base.sourceMetadataSha256,mapSourceSha256:sha(mapBytes),targets,queues:rows.map(tasks),scope:"Prioritized acquisition tasks from exact scenario cursors. No missing item or mission win is granted. Map candidate, generation, actual recovery and subsequent research are distinct."};
const queuePath=dir+"overcap-forward-mission-acquisition-queue-v3.json";
fs.writeFileSync(queuePath,JSON.stringify(queue,null,2)+"\n");
const out={schema:"ATLAS_FORWARD_SCENARIO_REGISTRY_V3",baselineGraph:base.graph,sourceMetadataSha256:base.sourceMetadataSha256,scenarios:rows.map(({world,...r})=>r),missionSourceIndex:{path:mapPath,sha256:sha(mapBytes),...map.summary},missionQueue:{path:queuePath,sha256:sha(fs.readFileSync(queuePath)),queues:queue.queues.map(({tasks,...r})=>r)},normalizationComplete:false,actualGameCertified:false,scope:"Separate conditional starting-country scenarios. No state merge across geography or baseline; no production admission to final careers."};
const outPath=dir+"overcap-forward-scenario-registry-v3.json";fs.writeFileSync(outPath,JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({scenarios:out.scenarios.map(r=>[r.scenario,r.root,r.steps,r.researchCount,r.status]),missionSource:out.missionSourceIndex,queues:out.missionQueue.queues},null,2));
