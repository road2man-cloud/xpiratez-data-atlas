// Broad origin continuation: replay archived chronological seeds, extend using
// only active research, deterministic healthy/live actions and actual birth rank.
// Conditional cap-target growth and external resource inputs, not campaign proof.
import fs from "node:fs";
import zlib from "node:zlib";
import {createHash} from "node:crypto";
import {decodeOriginReport} from "./origin-report-codec.mjs";
import {replayOriginWitness} from "../public/soldiers/modern/origin-witness.js";
import {applyTransformation,bonusStats,STAT_KEYS} from "../public/soldiers/modern/eligibility.js";
import {summarizeRouteResources} from "../public/branch-soldier-resources.js";
const read=f=>JSON.parse(fs.readFileSync("public/data/"+f));
const file="public/data/branch-soldier-results.json.gz";
const db=JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
const data=read("soldiers-modern-index.json"),ledger=read("soldier-acquisition-progression-20261102.json"),catalog=read("soldier-source-catalog.json");
data.originRows=ledger.rows;data.sourceItemIds=new Set(catalog.itemIds);
const archive=fs.readFileSync("public/data/soldier-origin-candidates.json"),report=decodeOriginReport(archive);
const sha=x=>createHash("sha256").update(x).digest("hex");
if(data.meta.mod.version!=="v.o2"||data.meta.source.metadataSha256!==db.sourceMetadataSha256||
 JSON.stringify(catalog.sourceHashes)!==JSON.stringify(data.meta.source.rules)||report.records.length!==72||
 data.profiles.length!==72||STAT_KEYS.join()!==db.stats.join())throw Error("Source mismatch");
const bodies=new Map(data.soldiers.map(s=>[s.id,s])),rules=new Map(data.transformations.map(r=>[r.id,r]));
const byBody=new Map();
for(const r of data.transformations)if(r.allowsLiveSoldiers&&!r.createsClone&&!r.producedItem&&!r.requires.includes("STR_UNAVAILABLE"))
 for(const b of r.allowedSoldierTypes){const a=byBody.get(b)||[];a.push(r);byBody.set(b,a);}
const primary=new Set(["reactions","firing","melee","throwing","psiSkill","psiStrength","bravery"]),secondary=new Set(["tu","health","strength","stamina"]);
if(data.growthRules.manaPrimary)primary.add("mana");if(data.growthRules.manaSecondary)secondary.add("mana");
function fill(s){
 const body=bodies.get(s.soldierType),raw={...s.currentStats};
 for(const k of STAT_KEYS){if(!primary.has(k)&&!secondary.has(k))continue;const c=body?.statCaps?.[k],v=raw[k];
  if(Number.isSafeInteger(c)&&c>v)raw[k]=k==="bravery"?v+10*Math.floor((c-v)/10):c;
 }
 return {...s,currentStats:raw};
}
const vec=s=>STAT_KEYS.map(k=>s[k]),sum=v=>v.reduce((a,b)=>a+b,0);
function finish(s){
 const grown=fill(s),raw=vec(grown.currentStats),b=bonusStats(grown,data),bonus=STAT_KEYS.map(k=>b[k]||0);
 const vector=raw.map((v,i)=>STAT_KEYS[i]==="psiSkill"&&v<=0&&bonus[i]>0?v:Math.max(STAT_KEYS[i]==="health"?1:0,v+bonus[i]));
 if(![...raw,...bonus,...vector].every(Number.isSafeInteger))throw Error("Invalid vector");
 return {raw,bonus,vector,bonusIds:[...s.bonusIds].sort(),body:s.soldierType};
}
const canonical=db.branches.filter(b=>!b.sourceRootConflict&&b.historyCount>0);
const capIds=new Set(db.branches.flatMap(b=>b.captain)),choiceKeys=["path","cause","queen","codex"];
const groups=Object.fromEntries(choiceKeys.map(k=>[k,new Set(db.branches.map(b=>b.choices[k]).filter(Boolean))]));
function branchMatches(replay){
 const observed=[...new Set(replay.trace.flatMap(t=>t.added))],caps=observed.filter(id=>capIds.has(id));
 const roots=Object.fromEntries(choiceKeys.map(k=>[k,observed.filter(id=>groups[k].has(id))]));
 return canonical.filter(b=>JSON.stringify(b.captain)===JSON.stringify(caps)&&choiceKeys.every(k=>b.choices[k]?roots[k].length===1&&roots[k][0]===b.choices[k]:roots[k].length===0)).map(b=>b.id);
}
const seedsPerOrigin=Number(process.argv.find(x=>x.startsWith("--seeds="))?.slice(8)||2);
if(!Number.isInteger(seedsPerOrigin)||seedsPerOrigin<1||seedsPerOrigin>12)throw Error("Bad seed limit");
const depth=2;
const ready=(r,world)=>r.requires.every(id=>world.researched.has(id)&&!world.disabled.has(id));
function add(s,r,world){
 const result=applyTransformation(r,s,data,{mode:"current",researched:[...world.researched],disabled:[...world.disabled],baseFunctions:r.requiresBaseFunc||[],items:r.requiredItems||{},funds:Math.max(0,r.cost||0),commendations:{},statsKnown:true,medalsKnown:true});
 return result.verdict.kind==="eligible"&&result.state.exactStats===true&&!result.state.retired?result.state:null;
}
const rows=[],witnesses={},counts={origins:72,seedAttempts:0,seedReplayed:0,seedFailed:0,extendedOrigins:0,appendedSchedules:0,uniqueCandidates:0,registered:0,bodyCount:0,branchLinked:0,actualGameCertified:0};
const dom=(a,b)=>a.vector.every((n,i)=>n>=b.vector[i])&&a.fees<=b.fees&&(a.fees<b.fees||a.vector.some((n,i)=>n>b.vector[i]));
for(const record of report.records){
 const all=record.candidates.filter(c=>c.campaignContext?.kind==="compatible"&&c.researchSequenceComplete);
 const sorted=[...all].sort((a,b)=>b.total-a.total||b.transforms.length-a.transforms.length||a.id.localeCompare(b.id));
 const chosen=[];const pick=c=>{if(c&&!chosen.some(x=>x.id===c.id)&&chosen.length<seedsPerOrigin)chosen.push(c);};
 pick(sorted[0]);pick([...sorted].sort((a,b)=>b.transforms.length-a.transforms.length||b.total-a.total)[0]);
 pick([...sorted].sort((a,b)=>b.researchCount-a.researchCount||b.total-a.total)[0]);
 pick([...sorted].sort((a,b)=>a.transforms.length-b.transforms.length||b.researchCount-a.researchCount)[0]);
 for(const c of sorted)if(!chosen.some(x=>x.finalSoldierType===c.finalSoldierType))pick(c);
 const roots=c=>c.branchChoices.map(x=>x.id).filter(id=>capIds.has(id)||choiceKeys.some(k=>groups[k].has(id))).join("|");
 for(const c of sorted)if(!chosen.some(x=>roots(x)===roots(c)))pick(c);
 for(const c of sorted)pick(c);
 const cache=new Map(),models=new Map(),failures={},baselines=[];
 for(const seed of chosen){
  counts.seedAttempts++;
  const replay=replayOriginWitness(seed.steps,data,{birthCache:cache,requireCompatibleContext:true});
  const member=replay.world?.soldiers.find(x=>x.id==="origin");
  if(!replay.ok||!replay.exact||!member||member.state.soldierType!==seed.finalSoldierType){counts.seedFailed++;const reason=replay.reason||"NONEXACT_SEED";failures[reason]=(failures[reason]||0)+1;continue;}
  counts.seedReplayed++;
  const state=member.state,branchIds=branchMatches(replay),base=finish(state);
  baselines.push({seed:seed.id,body:base.body,vector:base.vector,branchIds});
  const research=Object.fromEntries(seed.transforms.map(id=>[id,rules.get(id)?.requires||[]]));
  function visit(s,append,growth,trace){
   if(append.length){
    counts.appendedSchedules++;
    const m=finish(s),ids=[...seed.transforms,...append],steps=ids.map(id=>({id,count:1}));
    if(ids.some(id=>!db.ruleDetails[id]))throw Error("Unregistered rule");
    const r=summarizeRouteResources({steps},db.ruleDetails);
    if(!r.complete.cash)return;
    const key=JSON.stringify([seed.id,ids,growth,m.raw,m.bonus,m.vector]);
    if(!models.has(key)){
     const id="ORIGINEXT12:"+sha(record.profileId+"|"+key).slice(0,24);
     models.set(key,{id,source:"ORIGINEXT12",sourceKind:"ARCHIVED_ACTIVE_RESEARCH_EXTENSION",originProfile:record.profileId,classKey:"origin",mode:"CAP_TARGET",...m,steps,
      placement:"CONDITIONAL_SUFFIX_CAP_TARGET",growthBefore:[...seed.transforms.map(()=>false),...growth],growthAfterLastAction:true,
      research:[...new Set(ids.flatMap(id=>rules.get(id)?.requires||[]))].sort(),branchIds,reference:seed.id,
      actualGameCertified:false,originExtension:{seed:seed.id,seedDepth:seed.transforms.length,appended:append,seedBody:state.soldierType,
       activeRequiredResearch:[...new Set(append.flatMap(id=>rules.get(id).requires))].sort(),seedCapVector:base.vector,seedCapBody:base.body,
       conditionalGrowth:true,externalResourcesAssumed:true,rank:member.state.rank,sourceReportHash:report.sourceHash},
      modeledStepStats:[...seed.transforms.map(()=>null),...trace],fees:r.grossFees});
    }
   }
   if(append.length>=depth)return;
   for(const rule of byBody.get(s.soldierType)||[]){
    if(!ready(rule,replay.world))continue;
    for(const grow of [false,true]){
     const before=grow?fill(s):s;
     if(grow&&vec(before.currentStats).every((v,i)=>v===vec(s.currentStats)[i]))continue;
     const next=add(before,rule,replay.world);
     if(!next)continue;
     visit(next,[...append,rule.id],[...growth,grow],[...trace,{rawAfter:vec(next.currentStats)}]);
    }
   }
  }
  visit(state,[],[],[]);
 }
 counts.uniqueCandidates+=models.size;
 // Preserve branch-specific frontiers, even when a different branch has better stats.
 // Root-unmatched routes only enter the global view, never a guessed branch.
 const frontierGroups=new Map();
 for(const m of models.values()){
  const k=JSON.stringify([m.body,m.branchIds]);const g=frontierGroups.get(k)||[];g.push(m);frontierGroups.set(k,g);
 }
 const retained=[];
 for(const ms of frontierGroups.values())for(const m of ms)if(!ms.some(n=>m!==n&&dom(n,m)))retained.push(m);
 for(const m of retained){witnesses[m.id]=m;if(m.branchIds.length)counts.branchLinked++;}
 if(retained.length)counts.extendedOrigins++;
 rows.push({profileId:record.profileId,seedCount:chosen.length,baselines,failures,candidates:models.size,routeIds:retained.map(m=>m.id)});
 console.log(record.profileId,chosen.length,baselines.length,models.size,retained.length);
}
counts.registered=Object.keys(witnesses).length;counts.bodyCount=new Set(Object.values(witnesses).map(x=>x.body)).size;
const payload={schemaVersion:1,kind:"ALL_ORIGINS_ACTIVE_RESEARCH_SUFFIX",sourceMetadataSha256:db.sourceMetadataSha256,archiveSha256:sha(archive),archiveSourceHash:report.sourceHash,seedsPerOrigin,maxAppendDepth:depth,summary:counts,rows,witnesses};
fs.writeFileSync(process.argv.find(x=>x.startsWith("--out="))?.slice(6)||"origin-extension-results.json.gz",zlib.gzipSync(Buffer.from(JSON.stringify(payload)),{level:6}));
console.log(JSON.stringify(counts));
