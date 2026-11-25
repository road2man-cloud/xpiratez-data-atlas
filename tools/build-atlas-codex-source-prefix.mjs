// Produce source-bound early Codex alternatives for existing terminal
// research witnesses, then replay their remaining original actions.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gzipSync,gunzipSync} from "node:zlib";
import {ledgers,project,readResearchWitness} from "../public/branch-soldier-atlas-career-core.js";
import {foundationWorld} from "../public/soldiers/modern/origin-witness.js";
import {createCareerReplay} from "./population-chronological-career-core.mjs";
import {loadSupplyRules} from "./atlas-terminal-supply-core-v2.mjs";
import {loadEconomyRules} from "./atlas-terminal-economy-core.mjs";
import {loadEarlyEconomyRules} from "./atlas-early-campaign-economy.mjs";
import {loadInitialEventRules} from "./atlas-initial-event-schedule.mjs";
import {createCodexPrefixProducer} from "./atlas-codex-source-prefix.mjs";
import {key,sha} from "./population-research-career-core.mjs";
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)||d;
const root=arg("game-root","C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez"),gz=f=>JSON.parse(gunzipSync(fs.readFileSync("public/data/"+f+".json.gz")));
const file="public/data/branch-soldier-results.json.gz",db=gz("branch-soldier-results"),a=gz("soldier-population-missing-origin-career"),idx=gz("soldier-population-missing-origin-career-index"),c=db.careerCompletion;
assert(c.researchCalendar&&c.terminalSupply);
const data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json"));
data.originRows=JSON.parse(fs.readFileSync("public/data/soldier-acquisition-progression-20261102.json")).rows;
data.sourceItemIds=new Set(JSON.parse(fs.readFileSync("public/data/soldier-source-catalog.json")).itemIds);
const index=loadSupplyRules(root,a.sourceMetadataSha256),economy=loadEconomyRules(root,index),early=loadEarlyEconomyRules(root,index,economy),eventIndex=loadInitialEventRules(root,a.sourceMetadataSha256),replay=createCareerReplay(data);
assert.equal(index.evidence.fingerprint,c.terminalSupply.sourceFingerprint);
const producer=createCodexPrefixProducer({data,index,early,economy,eventIndex,replay});
const ledger=ledgers.find(x=>x.key==="missingbirth"),rows=new Map(project(ledger,a,a.sourceMetadataSha256).rows.map(r=>[r.id,r]));
const producerFingerprint=key(["tools/atlas-codex-source-prefix.mjs","tools/build-atlas-codex-source-prefix.mjs"].map(p=>[p,sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))]));
const candidates=new Map();
for(const r of Object.values(c.researchCalendar.records))if(!candidates.has(r.routeId))candidates.set(r.routeId,r);
const prior=c.codexSourcePrefixes,valid=prior?.producerFingerprint===producerFingerprint&&key(prior.sourceHashes)===key(c.sourceHashes);
const prefixes=valid?{...prior.prefixes}:{},records=valid?{...prior.records}:{},skipped=valid?{...prior.skipped}:{};
const variants=[{costPercent:50,delay:"MIN"},{costPercent:100,delay:"MIN"},{costPercent:150,delay:"MAX"},{costPercent:50,delay:"MIN",finance:"FINITE_CASH",scientists:1},{costPercent:100,delay:"MIN",finance:"FINITE_CASH",scientists:1},{costPercent:100,delay:"MIN",finance:"FINITE_CASH",scientists:2}];
let newRoutes=0,attempts=0;
for(const [routeId,r] of candidates){
 if(variants.every(v=>records[key([routeId,v])]))continue;
 if(newRoutes>=Number(arg("routes","20")))break;
 const row=rows.get(routeId);assert(row);
 const witness=readResearchWitness(idx,row,a.sourceMetadataSha256),actions=witness.fullActions;assert.equal(key(actions),row.hash);
 const first=actions.findIndex(a=>a.type==="externalInputs"&&Object.keys(a.items||{}).some(k=>/^STR_CODEX_(RED|GREEN|GOLD|GRAY)$/.test(k)));
 if(first<0){skipped[routeId]="NO_ORIGINAL_CODEX_EXTERNAL_INPUT";continue;}
 const snapshots=new Map();let original=foundationWorld();for(const [i,action] of actions.entries()){if(action.type==="externalInputs")snapshots.set(i,{items:original.items,funds:original.funds});original=replay.apply(original,action);}
 const difficulty=original.difficulty??(row.difficulties.includes(1)?1:row.difficulties[0]);assert(row.difficulties.includes(difficulty));
 const followCache=new Map();
 newRoutes++;
 for(const variant of variants){
  const id=key([routeId,variant]);if(records[id])continue;attempts++;
  const p=producer.prefix(actions,first,difficulty,variant),prefixId=p.prefixHash||key(p);prefixes[prefixId]=p;
  let f=p.stepHash&&followCache.get(p.stepHash);if(!f){f=producer.follow(p,actions,original,snapshots);if(p.stepHash)followCache.set(p.stepHash,f);}
  records[id]={routeId,originalActionHash:row.hash,origin:r.origin,branch:r.branch,graph:r.graph,node:r.node,linkedPlanIds:r.linkedPlanIds,variant,prefixId,originalCodexInputAt:first+1,...f};
 }
}
const list=Object.values(records),used=new Set(list.map(r=>r.prefixId)),successful=Object.values(prefixes).filter(p=>p.status==="SOURCE_BOUND_CODEX_PREFIX"),full=list.filter(r=>r.status.startsWith("CONDITIONAL_FULL_SUFFIX_REPLAY")),same=full.filter(r=>r.status==="CONDITIONAL_FULL_SUFFIX_REPLAY_SAME_SOLDIER"),stats=list.reduce((s,r)=>(s[r.status]=(s[r.status]||0)+1,s),{});
const summary={routes:new Set(list.map(r=>r.routeId)).size,scenarios:list.length,prefixTemplates:used.size,sourceBoundPrefixes:successful.length,sourceBoundRouteScenarios:list.filter(r=>prefixes[r.prefixId].status==="SOURCE_BOUND_CODEX_PREFIX").length,fullSuffixReplays:full.length,sameSoldierFullReplays:same.length,finiteCashPrefixes:successful.filter(p=>p.finance?.status==="CONDITIONAL_NONNEGATIVE_PREFIX_CASH").length,finiteCashRouteScenarios:list.filter(r=>prefixes[r.prefixId].finance?.status==="CONDITIONAL_NONNEGATIVE_PREFIX_CASH").length,skippedRoutes:Object.keys(skipped).length,pendingRoutes:candidates.size-new Set(list.map(r=>r.routeId)).size-Object.keys(skipped).length,stats,completeCampaigns:0,dischargedAssumptions:0};
c.codexSourcePrefixes={schema:"ATLAS_CODEX_SOURCE_PREFIXES_V1",sourceMetadataSha256:a.sourceMetadataSha256,sourceHashes:c.sourceHashes,sourceEvidence:early.evidence,eventSourceEvidence:eventIndex.evidence,terminalSupplyFingerprint:index.evidence.fingerprint,producerFingerprint,prefixes,records,skipped,summary};
fs.writeFileSync(file+".tmp",gzipSync(JSON.stringify(db),{level:6}));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify({summary,newRoutes,attempts,templates:Object.entries(prefixes).map(([id,p])=>({id,status:p.status,target:p.target,variant:p.variant,month:p.month,days:p.elapsedHours/24,cost:p.cost,workshop:p.workshop,steps:p.steps.length,open:p.open.length,finance:p.finance?{status:p.finance.status,closingCash:p.finance.closingCash,minimumCash:p.finance.minimumCash,sales:p.finance.sales}:null,reason:p.reason,gates:p.gates.map(g=>({event:g.event,month:g.month,blocked:g.blocked,unknown:g.unknown}))})),failures:list.filter(r=>!r.status.startsWith("CONDITIONAL_FULL_SUFFIX_REPLAY")).slice(0,12).map(r=>({origin:r.origin,variant:r.variant,status:r.status,at:r.failedAt,reason:r.reason}))}));
