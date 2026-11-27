// Publish a source-bound companion calendar on existing career route IDs.
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
import {produceResearchCalendar} from "./atlas-research-calendar-core.mjs";
import {key,sha} from "./population-research-career-core.mjs";
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)||d;
const root=arg("game-root","C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez");
const gz=f=>JSON.parse(gunzipSync(fs.readFileSync("public/data/"+f+".json.gz")));
const file="public/data/branch-soldier-results.json.gz",db=hydrateEconomyDetails(gz("branch-soldier-results")),a=gz("soldier-population-missing-origin-career"),idx=gz("soldier-population-missing-origin-career-index"),c=db.careerCompletion;
const d=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json"));
d.originRows=JSON.parse(fs.readFileSync("public/data/soldier-acquisition-progression-20261102.json")).rows;
d.sourceItemIds=new Set(JSON.parse(fs.readFileSync("public/data/soldier-source-catalog.json")).itemIds);
const index=loadSupplyRules(root,a.sourceMetadataSha256),economy=loadEconomyRules(root,index),early=loadEarlyEconomyRules(root,index,economy),eventIndex=loadInitialEventRules(root,a.sourceMetadataSha256),replay=createSharedCareerReplay(d,a.summary);
assert.equal(index.evidence.fingerprint,c.terminalSupply.sourceFingerprint);
const l=ledgers.find(x=>x.key==="missingbirth"),rows=new Map(project(l,a,a.sourceMetadataSha256).rows.map(r=>[r.id,r]));
const producerFingerprint=key(["tools/atlas-research-calendar-core.mjs","tools/build-atlas-research-calendar.mjs"].map(p=>[p,sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))]));
const scenarios=[
 {staff:10,scientistTarget:3,farmLimit:2,costPercent:50,cashMode:"GAP_LEDGER"},
 {staff:30,scientistTarget:3,farmLimit:2,costPercent:100,cashMode:"GAP_LEDGER"},
 {staff:30,scientistTarget:6,farmLimit:2,costPercent:50,cashMode:"GAP_LEDGER"},
 {staff:30,scientistTarget:6,farmLimit:2,costPercent:50,cashMode:"STRICT_CASH"},
 {staff:20,scientistTarget:3,farmLimit:1,costPercent:50,cashMode:"STRICT_CASH"}
];
const groups=new Map();
for(const [id,p] of Object.entries(c.terminalSupply.plans)){
 if(p.kind!=="terminal"||!p.plan)continue;
 const routeId="MISSCAR:"+p.graph+":"+p.node,list=groups.get(routeId)||[];list.push([id,p]);groups.set(routeId,list);
}
const ordered=[...groups].sort(([,a],[,b])=>Number(b.some(([,p])=>p.plan.obligations.length===0))-Number(a.some(([,p])=>p.plan.obligations.length===0))||a[0][1].origin.localeCompare(b[0][1].origin));
const previous=c.researchCalendar;
const records=previous?.producerFingerprint===producerFingerprint&&key(previous.sourceHashes)===key(c.sourceHashes)?{...previous.records}:{};
let processed=0,produced=0,traceReplays=0;
const max=Number(arg("routes","20"));
for(const [routeId,group] of ordered){
 const row=rows.get(routeId);assert(row);const linkedPlanIds=group.map(([id])=>id);
 if(scenarios.every(options=>Object.values(records).some(r=>r.routeId===routeId&&key(r.options)===key(options))))continue;
 if(processed>=max)break;processed++;
 const witness=readResearchWitness(idx,row,a.sourceMetadataSha256),actions=witness.fullActions;assert.equal(key(actions),row.hash);
 let world=foundationWorld();const trace=[];
 for(const action of actions){world=replay.apply(world,action);trace.push({researched:world.researched,disabled:world.disabled,items:world.items,funds:world.funds,month:world.month,facilities:world.facilities,generatedEvents:world.generatedEvents,difficulty:world.difficulty});}
 assert(!world.pendingFree);traceReplays++;
 const difficulty=world.difficulty??(row.difficulties.includes(1)?1:row.difficulties[0]);assert(row.difficulties.includes(difficulty));
 for(const options of scenarios){
  const id=key([row.hash,difficulty,options]);if(records[id])continue;
  const result=produceResearchCalendar({data:d,index,economy,early,eventIndex,actions,trace,actionHash:row.hash,difficulty,...options});
  const p=group[0][1];records[id]={routeId,linkedPlanIds,origin:p.origin,branch:p.branch,graph:p.graph,node:p.node,options,...result};produced++;
 }
}
const values=Object.values(records),full=values.filter(r=>!r.blocked),alloc=new Set(values.flatMap(r=>r.allocations.map(x=>key([r.actionHash,x.at,x.id,x.kind,x.qty])))),materialAlloc=new Set(values.flatMap(r=>r.allocations.filter(x=>x.kind!=="BASE_FUNCTION").map(x=>key([r.actionHash,x.at,x.id,x.kind,x.qty]))));
const methods=values.flatMap(r=>r.calendar.filter(x=>["PURCHASE","MANUFACTURE"].includes(x.type))),stats=values.reduce((s,r)=>(s[r.status]=(s[r.status]||0)+1,s),{});
const summary={routes:new Set(values.map(r=>r.routeId)).size,scenarios:values.length,fullLogicalCalendars:full.length,partial:values.length-full.length,eventConflict:values.filter(r=>r.incompatibleEvents).length,cashNonnegative:full.filter(r=>r.minimumCash>=0).length,sourceAllocations:alloc.size,materialAllocations:materialAlloc.size,purchaseOperations:methods.filter(r=>r.type==="PURCHASE").length,manufactureOperations:methods.filter(r=>r.type==="MANUFACTURE").length,calendarResearchActions:values.reduce((s,r)=>s+r.calendar.filter(x=>x.type==="LAB_RESEARCH").length,0),uniqueProcurementOperations:new Set(values.flatMap(r=>r.calendar.filter(x=>["PURCHASE","MANUFACTURE"].includes(x.type)).map(x=>key([r.actionHash,x.at,x.type,x.id,x.qty||x.batches])))).size,completeCampaigns:0,stats,pendingRoutes:groups.size-new Set(values.map(r=>r.routeId)).size};
c.researchCalendar={schema:"ATLAS_RESEARCH_CALENDAR_LEDGER_V1",sourceMetadataSha256:a.sourceMetadataSha256,sourceHashes:c.sourceHashes,sourceEvidence:early.evidence,eventSourceEvidence:eventIndex.evidence,terminalSupplyFingerprint:index.evidence.fingerprint,producerFingerprint,records,summary};
fs.writeFileSync(file+".tmp",gzipSync(JSON.stringify(packEconomyDetails(db)),{level:6}));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify({summary,produced,traceReplays,full:full.sort((a,b)=>a.elapsedHours-b.elapsedHours).slice(0,8).map(r=>({origin:r.origin,options:r.options,days:r.elapsedHours/24,month:r.months,researchDays:r.researchDays,work:r.actualWork,closing:r.closingCash,gap:r.additionalCapitalGap,allocations:r.allocations.length,unresolved:r.unresolved.length,events:r.incompatibleEvents,procurement:r.calendar.filter(x=>["PURCHASE","MANUFACTURE"].includes(x.type)).length})),blocks:values.filter(r=>r.blocked).reduce((s,r)=>(s[r.blocked.reason.split(":")[0]]=(s[r.blocked.reason.split(":")[0]]||0)+1,s),{})}));
