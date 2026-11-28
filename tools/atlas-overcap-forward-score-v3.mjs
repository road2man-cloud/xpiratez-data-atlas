// Account for observable model contributions, not a fabricated native score.
// Raw points are separate from unobserved regional activity and award timing.
import assert from "node:assert/strict";
const arr=x=>Array.isArray(x)?x:[];
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const eventTypes=new Set(["sourceEventItems","eventResearch","sourceCaptainEventExpire","sourcePersuasionExpire","sourceGdxOrder"]);
const manufactureTypes=new Set(["sourceManufactureItem","sourceRandomManufacture","sourceExpeditionManufacture","sourceMissionSampleExtraction"]);
export function buildScoreLedger(steps,source){
 assert.equal(source.schema,"ATLAS_FORWARD_SCORE_SOURCES_V3");
 const months=[],entries=[],unresolved=[];let month=0;
 const bucket=m=>months[m]??=( {month:m,research:0,event:0,manufacture:0,unknown:[],awards:0,missionOutcomes:0});
 bucket(0);
 function add(s,category,id){
  const catalog=category==="research"?source.research:category==="event"?source.events:source.manufacture;
  const r=catalog[id],points=r?.points??null,b=bucket(month);
  const e={step:s.index,month,category,id,points,sourceStatus:r?.status||"MISSING",anchor:r?.anchor||null};
  entries.push(e);if(points===null){b.unknown.push({category,id,step:s.index});unresolved.push(e);}else b[category]+=points;
  if(category==="research")b.awards++;
 }
 for(const s of steps){
  const a=s.action;
  const next=s.monthAfter??month;
  assert(Number.isInteger(next)&&next>=month&&next<=120);
  for(let m=month+1;m<=next;m++)bucket(m);
  month=next;
  // Net newly discovered flags only. Same-transition discovery/removal,
  // repeatable topics and actual award time cannot be recovered from this.
  for(const id of new Set(arr(s.added)))add(s,"research",id);
  if(eventTypes.has(a.type)&&a.event&&!a.cancelled)add(s,"event",a.event);
  if(manufactureTypes.has(a.type)&&a.id)add(s,"manufacture",a.id);
  if(["sourceMissionRecovery","sourceGdxCapture","missionResearch","sourceGdxPrisonRecovery"].includes(a.type)){
   bucket(month).missionOutcomes++;
   const e={step:s.index,month,category:"mission",id:a.source||a.deployment,points:null,sourceStatus:"FULL_DEBRIEF_AND_REGION_ACTIVITY_UNOBSERVED"};
   entries.push(e);unresolved.push(e);
  }
 }
 const windows=months.map(b=>{
  const boundary=b.month+1,bonus=boundary>1?400:0,known=b.research+b.event+b.manufacture;
  return {...b,boundary,bonus,knownModelContributions:known,modeledSubtotal:known+bonus,nativeScore:null,
   unresolvedNetActivity:true,scope:"Projected subtotal of observed model actions; not an exact native score or lower bound."};
 });
 return {schema:"ATLAS_FORWARD_SCORE_LEDGER_V3",windows,entries,unresolved,lastMonth:month,actualGameCertified:false};
}
export function rankRequirements(w,ledger,source){
 const window=ledger.windows.find(x=>x.month===w.month);assert(window);
 return source.rankRules.map(r=>({
  id:r.id,minimumScore:r.minScore,earliestMonth:r.firstMonth,nextBoundary:window.boundary,
  alreadyCompleted:active(w,r.id),missingResearch:r.positive.filter(k=>!active(w,k)),
  forbiddenResearch:r.negative.filter(k=>active(w,k)),modeledSubtotal:window.modeledSubtotal,
  unmodeledNetRequired:r.minScore-window.modeledSubtotal,
  actualScore:null,scoreKnown:false,eligible:false,status:"OPEN_NATIVE_SCORE_REQUIRED",
  constraint:"native monthly score must meet threshold at month start; symbolic residual is not an activity award."
 }));
}
// Deliberately expose only a gate verdict, not an arbitrary score grant.
// A measured native observation is data from an actual campaign; a modeled
// subtotal or caller-declared numeric residual cannot certify it.
export function rankGateFromNativeObservation({world,rule,observation,expectedStateHash}){
 const reasons=[];
 if(!observation||observation.kind!=="NATIVE_MONTH_BOUNDARY_OBSERVATION")reasons.push("NATIVE_OBSERVATION_REQUIRED");
 if(!observation?.sourceSaveSha256||! /^[0-9a-f]{64}$/.test(observation.sourceSaveSha256))reasons.push("SAVE_HASH_REQUIRED");
 if(!observation?.matchedScenarioStateHash||observation.matchedScenarioStateHash!==expectedStateHash)reasons.push("SCENARIO_BINDING_REQUIRED");
 const m=world.month+1;
 if(observation?.boundaryMonth!==m||m<rule.firstMonth||rule.lastMonth>=0&&m>rule.lastMonth)reasons.push("WRONG_BOUNDARY");
 if(!rule.positive.every(k=>active(world,k))||rule.negative.some(k=>active(world,k)))reasons.push("RESEARCH_GATE");
 const valid=Number.isSafeInteger(observation?.researchScore)&&Array.isArray(observation?.regions)&&observation.regions.length>0&&observation.regions.every(x=>typeof x.id==="string"&&Number.isSafeInteger(x.xcom)&&Number.isSafeInteger(x.alien))&&new Set(observation.regions.map(x=>x.id)).size===observation.regions.length;
 if(!valid)reasons.push("COMPLETE_NATIVE_SCORE_COMPONENTS_REQUIRED");
 const score=valid?observation.researchScore+(m>1?400:0)+observation.regions.reduce((n,x)=>n+x.xcom-x.alien,0):null;
 if(score===null||score<rule.minScore)reasons.push("MIN_SCORE_NOT_ESTABLISHED");
 // This validates arithmetic and declared binding, not authenticity of
 // external save contents. Never claim native certification here.
 return {numericAndStructuralGate:!reasons.length,score,reasons,actualGameCertified:false,admitResearch:false};
}
