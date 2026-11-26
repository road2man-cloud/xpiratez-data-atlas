// V55: consume V54's exact funded route IDs and produce a supplemental
// research + second-base construction continuation in the common ledger.
import fs from "node:fs";
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
import {loadAuxiliaryFacilityRules} from "./atlas-auxiliary-facility-bridge.mjs";
import {produceAuxiliaryCareerCalendar,financedSoldierSignature} from "./atlas-auxiliary-career-calendar.mjs";
import {key,sha} from "./population-research-career-core.mjs";
import {storeFinancedDetail} from "./atlas-financed-career-detail-store.mjs";
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)||d;
const root=arg("game-root","C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez"),gz=f=>JSON.parse(gunzipSync(fs.readFileSync("public/data/"+f+".json.gz")));
const file="public/data/branch-soldier-results.json.gz",db=gz("branch-soldier-results"),a=gz("soldier-population-missing-origin-career"),idx=gz("soldier-population-missing-origin-career-index"),c=db.careerCompletion,codex=c.codexSourcePrefixes,prior=c.financedCareerCalendar;
assert(prior&&codex);
const data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json"));data.originRows=JSON.parse(fs.readFileSync("public/data/soldier-acquisition-progression-20261102.json")).rows;data.sourceItemIds=new Set(JSON.parse(fs.readFileSync("public/data/soldier-source-catalog.json")).itemIds);
const index=loadSupplyRules(root,a.sourceMetadataSha256),economy=loadEconomyRules(root,index),early=loadEarlyEconomyRules(root,index,economy),eventIndex=loadInitialEventRules(root,a.sourceMetadataSha256),auxiliarySource=loadAuxiliaryFacilityRules(root,a.sourceMetadataSha256),replay=createSharedCareerReplay(data,a.summary);
assert.equal(index.evidence.fingerprint,c.terminalSupply.sourceFingerprint);assert.equal(early.evidence.fingerprint,codex.sourceEvidence.fingerprint);
const ledger=ledgers.find(x=>x.key==="missingbirth"),rows=new Map(project(ledger,a,a.sourceMetadataSha256).rows.map(r=>[r.id,r]));
const sourceHash=p=>sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"));
const producerFingerprint=key(["tools/atlas-auxiliary-facility-bridge.mjs","tools/atlas-auxiliary-career-calendar.mjs","tools/build-atlas-auxiliary-career-calendar.mjs","tools/atlas-financed-career-detail-store.mjs"].map(p=>[p,sourceHash(p)]));
const previous=c.auxiliaryCareerCalendar;
const valid=previous?.producerFingerprint===producerFingerprint&&previous.auxiliarySource?.fingerprint===auxiliarySource.evidence.fingerprint&&key(previous.sourceHashes)===key(c.sourceHashes)&&previous.financedFingerprint===prior.producerFingerprint;
const records=valid?{...previous.records}:{};
const groups=new Map();
for(const [id,r] of Object.entries(prior.records)){
 if(!r.financeGates.some(g=>g.event==="STR_THE_GREAT_CAUSE"&&g.met)||!r.eventGates.some(g=>g.event==="STR_THE_GREAT_CAUSE"&&g.facilityOpen?.some(f=>f.id==="STR_WAR_BARRACKS")))continue;
 const p=codex.prefixes[r.prefixHash];assert(p?.finance?.status==="CONDITIONAL_NONNEGATIVE_PREFIX_CASH");
 const l=groups.get(r.routeId)||[];l.push([id,r,p]);groups.set(r.routeId,l);
}
const byOrigin=new Map();for(const [id,g] of groups){const k=g[0][1].origin,l=byOrigin.get(k)||[];l.push([id,g]);byOrigin.set(k,l);}
const ordered=[];while([...byOrigin.values()].some(x=>x.length))for(const l of byOrigin.values())if(l.length)ordered.push(l.shift());
let processed=0,produced=0;
for(const [routeId,list] of ordered){
 const jobs=list.filter(([id,r])=>!records[key([id,r.prefixHash,r.options])]);
 if(!jobs.length)continue;if(processed>=Number(arg("routes","3")))break;processed++;
 const row=rows.get(routeId),actions=readResearchWitness(idx,row,a.sourceMetadataSha256).fullActions;assert.equal(key(actions),row.hash);
 let world=foundationWorld();const trace=[];
 for(const action of actions){world=replay.apply(world,action);trace.push({researched:world.researched,disabled:world.disabled,items:world.items,funds:world.funds,month:world.month});}
 assert(!world.pendingFree);
 const originalSoldierSignature=financedSoldierSignature(world,replay);
 for(const [financedId,r,p] of jobs){
  const o=r.options,id=key([financedId,r.prefixHash,o]);
  const result=produceAuxiliaryCareerCalendar({data,index,economy,early,eventIndex,actions,trace,actionHash:row.hash,difficulty:p.difficulty,replay,prefix:p,auxiliarySource,...o});
  const sameSoldierState=!!result.finalSoldierSignature&&result.finalSoldierSignature===originalSoldierSignature,finalActive=new Set(result.finalResearch.filter(k=>!result.finalDisabled.includes(k))),missingOriginalActiveResearch=[...world.researched].filter(k=>!world.disabled.has(k)&&!finalActive.has(k));
  records[id]=storeFinancedDetail({routeId,origin:r.origin,branch:r.branch,graph:r.graph,node:r.node,linkedPlanIds:r.linkedPlanIds,codexId:r.codexId,financedId,options:o,originalSoldierSignature,sameSoldierState,missingOriginalActiveResearch,...result});produced++;
  const gate=result.eventGates.find(g=>g.event==="STR_THE_GREAT_CAUSE"),bridge=result.auxiliaryBridges.find(b=>b.id==="STR_WAR_BARRACKS");
  console.log(JSON.stringify({routeId,origin:r.origin,staff:o.staff,scientists:o.scientistTarget,status:result.status,at:result.finishedActions,total:result.totalActions,months:result.months,cash:result.closingCash,min:result.wholePrefixMinimumCash,gate:gate?{month:gate.scheduledMonth,cash:gate.dispatchCash,fundsMet:gate.fundsMet,facilityMet:gate.auxiliaryFacilityMet,blocked:gate.blocked,unknown:gate.unknown}:null,bridge:bridge?{status:bridge.status,reason:bridge.reason,research:bridge.research.map(x=>x.id),days:bridge.completed?(bridge.completed-bridge.start)/24:null}:null,reason:result.blocked?.reason}));
 }
}
const list=Object.values(records),full=list.filter(r=>r.status.startsWith("FULL_")),gates=list.flatMap(r=>r.eventGates.filter(g=>g.event==="STR_THE_GREAT_CAUSE")),bridges=list.flatMap(r=>r.auxiliaryBridges),built=bridges.filter(b=>b.status==="CONDITIONAL_AUXILIARY_FACILITY_BUILT");
const summary={routes:new Set(list.map(r=>r.routeId)).size,scenarios:list.length,fullLogicalReplays:full.length,sameSoldierFullReplays:full.filter(r=>r.sameSoldierState).length,sameSoldierAndResearch:full.filter(r=>r.sameSoldierState&&!r.missingOriginalActiveResearchCount).length,partial:list.length-full.length,greatCauseAttempts:gates.length,greatCauseFundsMet:gates.filter(g=>g.fundsMet).length,greatCauseFacilityMet:gates.filter(g=>g.auxiliaryFacilityMet).length,greatCauseBothMet:gates.filter(g=>g.fundsMet&&g.auxiliaryFacilityMet).length,scoreUnknown:gates.filter(g=>g.unknown.includes("평가 점수 미확인")).length,builtFacilities:built.length,supplementalResearch:bridges.reduce((s,b)=>s+b.research.length,0),purchasedMaterials:built.reduce((s,b)=>s+b.plan.purchases.reduce((n,p)=>n+p.count,0),0),detailShards:new Set(list.map(r=>r.detailHash)).size,detailUncompressedBytes:list.reduce((s,r)=>s+r.detailBytes,0),detailGzipBytes:list.reduce((s,r)=>s+r.detailGzipBytes,0),pendingRoutes:groups.size-new Set(list.map(r=>r.routeId)).size,pendingScenarios:[...groups.values()].reduce((s,g)=>s+g.length,0)-list.length,completeCampaigns:0};
c.auxiliaryCareerCalendar={schema:"ATLAS_AUXILIARY_CAREER_LEDGER_V1",sourceMetadataSha256:a.sourceMetadataSha256,sourceHashes:c.sourceHashes,sourceEvidence:early.evidence,eventSourceEvidence:eventIndex.evidence,auxiliarySource:auxiliarySource.evidence,terminalSupplyFingerprint:index.evidence.fingerprint,codexFingerprint:codex.producerFingerprint,financedFingerprint:prior.producerFingerprint,producerFingerprint,records,summary};
fs.writeFileSync(file+".tmp",gzipSync(JSON.stringify(db),{level:6}));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify({summary,processed,produced}));
