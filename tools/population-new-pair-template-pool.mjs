// Cross-ledger positive research plan proposals. Never use a template as
// evidence until the caller independently replays its suffix on the target.
import {createHash} from "node:crypto";
import {preflightTemplate} from "./population-research-template-selector.mjs";
const key=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const allowed=new Set(["research","repeatResearch","freeResearch","eventResearch","missionResearch","advanceMonth","externalInputs"]);
export function createSharedResearchPool(db){
 const buckets=new Map(),metrics={sharedTemplateBuckets:0,sharedTemplateCount:0,sharedTemplateAttempts:0,sharedTemplateHits:0,sharedTemplateRejected:0,sharedTemplatePreflightRejected:0,sharedTemplateActions:0,sharedTemplateSourceHits:{},sharedAdaptedAttempts:0,sharedAdaptedHits:0,sharedAdaptedSkipped:0};
 for(const [source,table] of [["entry",db.populationNewPairEntry?.planTemplates],["research-career",db.populationResearchCareer?.planTemplates],["frontier",db.populationFrontierChronology?.templates]]){
  for(const [k,entries] of Object.entries(table||{})){
   if(!Array.isArray(entries))continue;
   const pool=buckets.get(k)||new Map();
   for(const item of entries){
    const suffix=Array.isArray(item)?item:item?.suffix;
    if(!Array.isArray(suffix)||!suffix.length||!suffix.every(a=>allowed.has(a?.type)))continue;
    const hash=key(suffix);if(pool.has(hash))continue;
    pool.set(hash,{hash,source,suffix,hits:0,misses:0});
   }
   if(pool.size)buckets.set(k,pool);
  }
 }
 metrics.sharedTemplateBuckets=buckets.size;metrics.sharedTemplateCount=[...buckets.values()].reduce((n,p)=>n+p.size,0);
 function candidates(k,w,data,local,limit=8,adaptive=false){
  const excluded=new Set(local.map(key)),out=[];
  for(const e of buckets.get(k)?.values()||[]){
   if(excluded.has(e.hash))continue;
   const reason=preflightTemplate(w,e.suffix,data);
   if(reason){metrics.sharedTemplatePreflightRejected++;if(!adaptive)continue;}
   out.push({entry:e,reason});
  }
  return out.sort((a,b)=>Number(Boolean(a.reason))-Number(Boolean(b.reason))||(b.entry.hits*3-b.entry.misses)-(a.entry.hits*3-a.entry.misses)||a.entry.suffix.length-b.entry.suffix.length||a.entry.hash.localeCompare(b.entry.hash)).slice(0,limit).map(x=>x.entry);
 }
 function attempt(e,ok){
  metrics.sharedTemplateAttempts++;
  if(ok){e.hits++;metrics.sharedTemplateHits++;metrics.sharedTemplateActions+=e.suffix.length;metrics.sharedTemplateSourceHits[e.source]=(metrics.sharedTemplateSourceHits[e.source]||0)+1;}
  else{e.misses++;metrics.sharedTemplateRejected++;}
 }
 return {metrics,candidates,attempt};
}
