// V54: finite-cash continuation of V53, published in the shared career ledger.
import fs from "node:fs";
import {packEconomyDetails,hydrateEconomyDetails} from "../public/branch-soldier-economy-detail-codec.js";
import assert from "node:assert/strict";
import {gzipSync,gunzipSync} from "node:zlib";
import {ledgers,project,readResearchWitness} from "../public/branch-soldier-atlas-career-core.js";
import {foundationWorld} from "../public/soldiers/modern/origin-witness.js";
import {createSharedCareerReplay,flatRollEvidence} from "./population-shared-flat-roll.mjs";
import {sharedRankData} from "./population-shared-default-rank.mjs";
import {loadSupplyRules} from "./atlas-terminal-supply-core-v2.mjs";
import {loadEconomyRules} from "./atlas-terminal-economy-core.mjs";
import {loadEarlyEconomyRules} from "./atlas-early-campaign-economy.mjs";
import {loadInitialEventRules} from "./atlas-initial-event-schedule.mjs";
import {produceFinancedCareerCalendar,financedSoldierSignature} from "./atlas-financed-career-calendar.mjs";
import {key,sha} from "./population-research-career-core.mjs";
import {storeFinancedDetail} from "./atlas-financed-career-detail-store.mjs";
import {createExactPrefixReplay} from "./atlas-exact-prefix-replay.mjs";
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)||d;
const root=arg("game-root","C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez"),gz=f=>JSON.parse(gunzipSync(fs.readFileSync("public/data/"+f+".json.gz")));
const file="public/data/branch-soldier-results.json.gz",db=hydrateEconomyDetails(gz("branch-soldier-results")),a=gz("soldier-population-missing-origin-career"),idx=gz("soldier-population-missing-origin-career-index"),c=db.careerCompletion,codex=c.codexSourcePrefixes;
const data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json"));data.originRows=JSON.parse(fs.readFileSync("public/data/soldier-acquisition-progression-20261102.json")).rows;data.sourceItemIds=new Set(JSON.parse(fs.readFileSync("public/data/soldier-source-catalog.json")).itemIds);
const index=loadSupplyRules(root,a.sourceMetadataSha256),economy=loadEconomyRules(root,index),early=loadEarlyEconomyRules(root,index,economy),eventIndex=loadInitialEventRules(root,a.sourceMetadataSha256),replay=createSharedCareerReplay(data,a.summary);
assert.equal(index.evidence.fingerprint,c.terminalSupply.sourceFingerprint);assert.equal(early.evidence.fingerprint,codex.sourceEvidence.fingerprint);
const ledger=ledgers.find(x=>x.key==="missingbirth"),rows=new Map(project(ledger,a,a.sourceMetadataSha256).rows.map(r=>[r.id,r]));
const sourceHash=p=>sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"));
const coreFingerprint=sourceHash("tools/atlas-financed-career-calendar.mjs");
const producerFingerprint=key(["tools/atlas-financed-career-calendar.mjs","tools/build-atlas-financed-career-calendar.mjs","tools/atlas-financed-career-detail-store.mjs"].map(p=>[p,sourceHash(p)]));
const previous=c.financedCareerCalendar,legacyMigration=previous?.producerFingerprint==="91147d3438c027f8720c0a649ee92501743ff2ab0faed7e2937791cef4f54851"&&coreFingerprint==="1b156bae57cec5d3c18367fecd31fd098ddee5e5a5d914a0cd45823a9747f8d4";
const valid=(previous?.producerFingerprint===producerFingerprint||legacyMigration||previous?.coreFingerprint===coreFingerprint)&&key(previous.sourceHashes)===key(c.sourceHashes)&&previous.codexFingerprint===codex.producerFingerprint;
const records={};let migrated=0;
if(valid)for(const [id,r] of Object.entries(previous.records)){records[id]=storeFinancedDetail(r);if(!r.detailFile)migrated++;}
delete c.financedCareerCalendar;
const groups=new Map();
for(const [id,r] of Object.entries(codex.records)){
 const p=codex.prefixes[r.prefixId];if(p?.finance?.status!=="CONDITIONAL_NONNEGATIVE_PREFIX_CASH"||p.open.length)continue;
 const list=groups.get(r.routeId)||[];list.push([id,r,p]);groups.set(r.routeId,list);
}
// Round-robin origins and prioritize the exact same original witness.
const byOrigin=new Map();for(const [id,g] of groups){const k=g[0][1].origin,l=byOrigin.get(k)||[];l.push([id,g]);byOrigin.set(k,l);}
const ordered=[];while([...byOrigin.values()].some(x=>x.length))for(const l of byOrigin.values())if(l.length)ordered.push(l.shift());
const policies=[{staff:30,scientistTarget:1,farmLimit:2},{staff:40,scientistTarget:1,farmLimit:2},{staff:25,scientistTarget:2,farmLimit:2}];
const prefixReplay=createExactPrefixReplay(foundationWorld(),replay.apply,{maxNodes:512});
let processed=0,produced=0;
for(const [routeId,list] of ordered){
 const options=list.slice().sort((a,b)=>a[2].variant.costPercent-b[2].variant.costPercent||b[2].finance.closingCash-a[2].finance.closingCash)[0];
 const [codexId,r,p]=options;
 const jobs=policies.map(o=>({...o,costPercent:p.variant.costPercent,maxMonths:360,waitMonths:48})).filter(o=>!records[key([routeId,r.prefixId,o])]);
 if(!jobs.length)continue;
 if(processed>=Number(arg("routes","3")))break;
 processed++;
 const row=rows.get(routeId),actions=readResearchWitness(idx,row,a.sourceMetadataSha256).fullActions;assert.equal(key(actions),row.hash);
 const {world,trace}=prefixReplay.run(actions,w=>({researched:w.researched,disabled:w.disabled,items:w.items,funds:w.funds,month:w.month}));
 assert(!world.pendingFree);
 for(const o of jobs){
  const id=key([routeId,r.prefixId,o]);
  const result=produceFinancedCareerCalendar({data,index,economy,early,eventIndex,actions,trace,actionHash:row.hash,difficulty:p.difficulty,replay,prefix:p,...o});
  const originalSoldierSignature=financedSoldierSignature(world,replay),sameSoldierState=!!result.finalSoldierSignature&&result.finalSoldierSignature===originalSoldierSignature;
  const finalActive=new Set(result.finalResearch.filter(k=>!result.finalDisabled.includes(k))),missingOriginalActiveResearch=[...world.researched].filter(k=>!world.disabled.has(k)&&!finalActive.has(k));
  records[id]=storeFinancedDetail({routeId,origin:r.origin,branch:r.branch,graph:r.graph,node:r.node,linkedPlanIds:r.linkedPlanIds,codexId,options:o,originalSoldierSignature,sameSoldierState,missingOriginalActiveResearch,...result});produced++;
  console.log(JSON.stringify({routeId,origin:r.origin,staff:o.staff,scientists:o.scientistTarget,status:result.status,at:result.finishedActions,total:result.totalActions,months:result.months,cash:result.closingCash,min:result.wholePrefixMinimumCash,financeGates:result.financeGates,unresolved:result.unresolved.length,reason:result.blocked?.reason}));
 }
}
const list=Object.values(records),full=list.filter(r=>r.status.startsWith("FULL_")),gate=list.flatMap(r=>r.financeGates.filter(g=>g.event==="STR_THE_GREAT_CAUSE")),met=gate.filter(g=>g.met);
const summary={routes:new Set(list.map(r=>r.routeId)).size,scenarios:list.length,fullLogicalReplays:full.length,sameSoldierFullReplays:full.filter(r=>r.sameSoldierState&&!r.missingOriginalActiveResearchCount).length,partial:list.length-full.length,greatCauseAttempts:gate.length,greatCauseFundsMet:met.length,financeGatesMet:list.reduce((s,r)=>s+r.financeGates.filter(g=>g.met).length,0),prefixStockReuse:list.reduce((s,r)=>s+r.counts.prefixStockReuse,0),fixedRewardDeliveries:list.reduce((s,r)=>s+r.counts.fixedRewardDeliveries,0),deadlineEventsReordered:list.reduce((s,r)=>s+r.counts.deadlineResolved,0),detailShards:new Set(list.map(r=>r.detailHash)).size,detailUncompressedBytes:list.reduce((s,r)=>s+r.detailBytes,0),detailGzipBytes:list.reduce((s,r)=>s+r.detailGzipBytes,0),pendingRoutes:groups.size-new Set(list.map(r=>r.routeId)).size,completeCampaigns:0};
c.financedCareerCalendar={schema:"ATLAS_FINANCED_CAREER_LEDGER_V2_SHARDED",coreFingerprint,sourceMetadataSha256:a.sourceMetadataSha256,sourceHashes:c.sourceHashes,sourceEvidence:early.evidence,eventSourceEvidence:eventIndex.evidence,terminalSupplyFingerprint:index.evidence.fingerprint,codexFingerprint:codex.producerFingerprint,producerFingerprint,records,summary};
fs.writeFileSync(file+".tmp",gzipSync(JSON.stringify(packEconomyDetails(db)),{level:6}));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify({summary,processed,produced,migrated,prefixReplay:prefixReplay.metrics}));
