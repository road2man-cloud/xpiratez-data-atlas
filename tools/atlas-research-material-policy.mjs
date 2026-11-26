// Ordinary effort is abstracted. Only source-indexed scarce grant pools
// are counted. The acquisition index is not exhaustive battlefield loot.
import assert from "node:assert/strict";
import fs from "node:fs";
import {createHash} from "node:crypto";
const TOKEN="STR_CAPTAINS_11_TOKEN",CAPTAIN="STR_CAPTAINS_11";
const filename="public/items/acquisition-index.json";
const arr=x=>Array.isArray(x)?x:[];
const hash=x=>createHash("sha256").update(x).digest("hex");
export function createResearchMaterialPolicy(data,{acquisition=null}={}){
 const bytes=acquisition?JSON.stringify(acquisition):fs.readFileSync(filename,"utf8");
 const a=acquisition||JSON.parse(bytes),items=a.items,rules=data.researchRules||{},awards=new Map();
 for(const [research,sources] of Object.entries(data.eventResearchSources||{}))for(const s of sources){const x=awards.get(s.event)||new Set();x.add(research);awards.set(s.event,x);}
 const reopened=new Set(Object.values(rules).flatMap(r=>r.reenables||[]));
 const eventLimits=new Map();
 function eventLimit(id){
  if(eventLimits.has(id))return eventLimits.get(id);
  const scripts=a.events[id]?.scripts||[];
  const sources=scripts.filter(s=>s.conditions?.executionOdds!==0);
  const evidence=[];let max=0;
  for(const s of sources){
   const lock=arr(s.triggerMaps?.researchTriggers).find(t=>t.value===false&&awards.get(id)?.has(t.id)&&rules[t.id]&&!rules[t.id].repeatable&&!reopened.has(t.id));
   const once=arr(s.oneTimeRandomEvents?.entries).some(t=>t.eventId===id)&&arr(s.paths).every(p=>p.startsWith("oneTimeRandomEvents"))||arr(s.paths).length>0&&arr(s.paths).every(p=>p.startsWith("oneTimeSequentialEvents"));
   if(!lock&&!once){eventLimits.set(id,null);return null;}
   evidence.push({script:s.id,lock:lock?.id||null,oneTime:!!once});max++;
  }
  // A self-locking common reward prevents any other occurrence. Otherwise
  // count each distinct indexed script, not an unjustified global one.
  const common=evidence[0]?.lock;
  const result=max?{occurrences:common&&evidence.every(e=>e.lock===common)?1:new Set(evidence.map(e=>e.script)).size,evidence}:null;
  eventLimits.set(id,result);return result;
 }
 const finite=new Map(),catalog={},inputIds=new Set([...Object.entries(rules).filter(([,r])=>r.needItem).map(([id,r])=>r.neededItem||id),...(data.transformations||[]).flatMap(r=>Object.keys(r.requiredItems||{})),...(data.profiles||[]).flatMap(p=>Object.keys(p.acquisitionRequiredItems||{}))]);
 for(const id of inputIds){
  const item=items[id];if(!item||item.costBuy>0||item.producers?.length||!item.grants?.length)continue;
  const grants=[];let cap=0,ok=true;
  for(const g of item.grants){const e=eventLimit(g.id);if(!e||g.kind!=="fixed"||!Number.isSafeInteger(g.qty)||g.qty<=0){ok=false;break;}cap+=g.qty*e.occurrences;grants.push({event:g.id,quantity:g.qty,...e});}
  if(ok&&cap>0&&Number.isSafeInteger(cap))finite.set(id,{id,name:item.name,cap,kind:"INDEXED_FINITE_GRANT_POOL",grants,hard:false});
 }
 // The specific campaign limit is grounded by the user's instruction and
 // the source's 11 fixed tokens, no purchase/recipe, self-locking reward.
 const captain=finite.get(TOKEN);
 assert(captain?.cap===11&&captain.grants.length===1&&captain.grants[0].event===CAPTAIN&&captain.grants[0].occurrences===1,"Captain's 11 source changed");
 captain.hard=true;captain.kind="CONFIRMED_FINITE";
 // Do not mark a manufacturer as unrestricted just because it has a recipe
 // when all indexed producers depend on a scarce grant input.
 const boundedInputs=new Set(finite.keys());
 for(let turn=0;turn<8;turn++){
  let changed=false;
  for(const id of inputIds){if(boundedInputs.has(id))continue;const p=items[id];if(!p||p.costBuy>0||p.grants?.length||!p.producers?.length)continue;
   if(p.producers.every(q=>arr(a.recipes[q.id]?.requiredItems).some(t=>boundedInputs.has(t.id)))){boundedInputs.add(id);changed=true;}
  }if(!changed)break;
 }
 for(const id of inputIds){
  const item=items[id],f=finite.get(id);
  if(f){catalog[id]=f;continue;}
  if(boundedInputs.has(id)){catalog[id]={id,name:item?.name||id,kind:"FINITE_INPUT_DEPENDENCY",cap:null};continue;}
  const known=item?.costBuy>0||item?.producers?.length>0;
  catalog[id]={id,name:item?.name||id,kind:known?"ORDINARY_ACQUISITION_ASSUMED":item?.grants?.length?"EVENT_ACQUISITION_ASSUMED":"SOURCE_UNRESOLVED_ACQUISITION_ASSUMED",cap:null};
 }
 const metrics={pathsChecked:0,rejected:0,unknownIndexedExceeded:0,ordinaryRepairs:0,ordinaryRepairUnits:0,facilityRepairs:0};
 const empty=()=>({granted:{},consumed:{},violations:[],events:[]});
 const transforms=new Map((data.transformations||[]).map(r=>[r.id,r])),profiles=new Map((data.profiles||[]).map(p=>[p.id,p]));
 function extend(base,steps){
  // Track finite material grant quantities, not how many alternate rows
  // are registered. Actual eventResearch grants only research in the
  // current replay model: externalInputs stands for the physical reward.
  const v={granted:{...base.granted},consumed:{...base.consumed},violations:base.violations.slice(),events:base.events.slice()};
  const add=(obj,id,n)=>{if(finite.has(id)&&Number.isSafeInteger(n)&&n>0)obj[id]=(obj[id]||0)+n;};
  for(const s of steps){
   if(s.type==="eventResearch"&&s.event===CAPTAIN&&!v.events.includes(CAPTAIN))v.events.push(CAPTAIN);
   if(s.type==="externalInputs")for(const [id,n] of Object.entries(s.items||{})){
    add(v.granted,id,n);if(id===TOKEN&&!v.events.includes(CAPTAIN)&&!v.violations.includes("CAPTAINS_11_SOURCE_NOT_REPLAYED"))v.violations.push("CAPTAINS_11_SOURCE_NOT_REPLAYED");
   }
   let consumed={};
   if(s.type==="transform")consumed=transforms.get(s.transform)?.requiredItems||{};
   else if(s.type==="recruit")consumed=profiles.get(s.profile)?.acquisitionRequiredItems||{};
   else if(s.type==="research"||s.type==="repeatResearch"){
    const r=rules[s.id];if(r?.needItem&&r.destroyItem)consumed={[r.neededItem||s.id]:1};
   }
   for(const [id,n] of Object.entries(consumed))add(v.consumed,id,n);
  }
  return v;
 }
 function issues(v){
  const hard=v.violations.slice(),uncertain=[];
  for(const [id,f] of finite){const supplied=v.granted[id]||0,used=v.consumed[id]||0;
   if(Math.max(supplied,used)>f.cap)(f.hard?hard:uncertain).push(id+": "+Math.max(supplied,used)+"/"+f.cap);
  }
  return {hard,uncertain};
 }
 const graphCache=new WeakMap();
 function state(g,i){
  let cache=graphCache.get(g);if(!cache){cache=new Map();graphCache.set(g,cache);}
  if(cache.has(i))return cache.get(i);
  const path=[];let j=i;
  while(j!==null&&!cache.has(j)){path.push(j);j=g.nodes[j].parent;}
  let v=j===null?empty():cache.get(j);
  for(const k of path.reverse()){v=extend(v,k===0?g.birthActions:g.nodes[k].steps);cache.set(k,v);}
  return v;
 }
 function check(g,parent,steps){
  metrics.pathsChecked++;
  const v=parent===null?extend(empty(),g.birthActions):extend(state(g,parent),steps),q=issues(v);
  if(q.hard.length){metrics.rejected++;throw Error("FINITE_MATERIAL_BUDGET: "+q.hard.join("; "));}
  if(q.uncertain.length){metrics.unknownIndexedExceeded++;throw Error("INDEXED_FINITE_GRANT_POOL_UNRESOLVED: "+q.uncertain.join("; "));}
  return v;
 }
 function repair(w,step){
  // Only the explicit lab sample is replenished. Never guess an event
  // trigger, a missing research grant, a finite input or a limited pool.
  if(step.type!=="research"&&step.type!=="repeatResearch")return null;
  const r=rules[step.id];if(!r||w.pendingFree)return null;
  const id=r.neededItem||step.id,inputs={},missing=(r.requiresBaseFunc||[]).filter(k=>!w.baseFunctions.has(k));
  if(r.needItem&&(w.items[id]||0)<1&&!finite.has(id)&&!boundedInputs.has(id)&&(items[id]||data.sourceItemIds?.has(id))){
   inputs[id]=1;metrics.ordinaryRepairs++;metrics.ordinaryRepairUnits++;
  }
  // Assume construction only after a real, active facility unlock.
  // Retain prerequisites for all required base functions in the closure.
  const supplied=new Set(w.baseFunctions),functions=[];
  if(missing.length){
   const facilities=Object.values(data.baseFacilityFunctions||{}).filter(f=>(f.research||[]).every(k=>w.researched.has(k)&&!w.disabled.has(k)));
   const recipes=new Map();
   let changed=true;
   while(changed){changed=false;for(const f of facilities)if((f.requires||[]).every(k=>supplied.has(k)))for(const k of f.provides||[])if(!supplied.has(k)){supplied.add(k);recipes.set(k,f);changed=true;}}
   const needed=new Set();
   function collect(k){if(w.baseFunctions.has(k)||needed.has(k))return;const f=recipes.get(k);if(!f)return;for(const q of f.requires||[])collect(q);needed.add(k);}
   if(missing.every(k=>supplied.has(k)))for(const k of missing)collect(k);
   functions.push(...needed);metrics.facilityRepairs+=functions.length;
  }
  if(!Object.keys(inputs).length&&!functions.length)return null;
  return {type:"externalInputs",items:inputs,functions,reason:"Ordinary acquisition / unlocked facility construction assumed: "+step.id,assumption:true};
 }
 function describe(){
  const counts={};for(const r of Object.values(catalog))counts[r.kind]=(counts[r.kind]||0)+1;
  return {schema:"RESEARCH_MATERIAL_BUDGET_V1",source:filename,sha256:hash(bytes),scope:"Each hypothetical campaign path independently. Known finite grant pools tracked; indexed nonexclusive acquisition is not an exhaustive loot proof.",counts,finite:Object.fromEntries(finite),catalog,metrics:{...metrics}};
 }
 return {catalog,finite,empty,extend,state,issues,check,repair,describe,metrics};
}
