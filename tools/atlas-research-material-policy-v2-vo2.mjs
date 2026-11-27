// Source-bound material policy for X-Piratez v.o2. Never reads legacy acquisition-index.json.
// Conditional campaign paths remain independent; finite grant evidence is retained.
import assert from "node:assert/strict";
import {key} from "./population-research-career-core.mjs";
const arr=x=>Array.isArray(x)?x:[],TOKEN="STR_CAPTAINS_11_TOKEN",POD="STR_STASIS_POD_GREEN_GAL";
export const MATERIAL_POLICY="RESEARCH_MATERIAL_BUDGET_V2_VO2";
export function createResearchMaterialPolicy(data){
 const source=data.meta?.source,rules=data.researchRules||{},supply=data.itemSupply;
 assert.equal(data.meta?.mod?.version,"v.o2");assert(/^[a-f0-9]{64}$/.test(source?.metadataSha256));assert(source.rules?.length&&supply&&data.eventResearchSources);
 const reopened=new Set(Object.values(rules).flatMap(r=>arr(r.reenables)));
 const eventEvidence=new Map();
 for(const [id,rows] of Object.entries(data.eventResearchSources))for(const e of arr(rows)){
  const q=eventEvidence.get(e.event)||{awards:new Set(),scripts:new Map()};
  q.awards.add(id);for(const s of arr(e.scripts))q.scripts.set(s.script,s);eventEvidence.set(e.event,q);
 }
 function finiteGrant(g){
  const e=eventEvidence.get(g.event),awards=new Set([...arr(g.directResearchAwards),...(e?.awards||[])]);
  const ids=arr(g.scriptIds),routes=new Map(arr(g.scriptRoutes).map(s=>[s.script,s]));
  if(!ids.length)return null;
  const scripts=ids.map(id=>routes.get(id)||e?.scripts.get(id));if(scripts.some(s=>!s))return null;
  const viable=scripts.filter(s=>s.executionOdds!==0);if(!viable.length)return null;
  const evidence=[];
  for(const s of viable){
   const lock=arr(s.researchNegative).find(k=>awards.has(k)&&rules[k]&&rules[k].repeatable!==true&&!reopened.has(k));
   const once=["oneTimeRandom","oneTimeSequential"].includes(s.mode);
   if(!lock&&!once)return null;evidence.push({script:s.script,lock:lock||null,oneTime:once});
  }
  const gs=arr(g.grants);if(!gs.length||gs.some(x=>!["every","everyMulti"].includes(x.mode)||!Number.isSafeInteger(x.count)||x.count<=0))return null;
  const quantity=gs.reduce((n,g)=>n+g.count,0),common=evidence[0].lock;
  const occurrences=common&&evidence.every(x=>x.lock===common)?1:new Set(evidence.map(x=>x.script)).size;
  return {event:g.event,quantity,occurrences,evidence};
 }
 const finite=new Map(),catalog={},boundedInputs=new Set();
 const recipes=s=>[...arr(s?.manufacture),...arr(s?.randomManufacture)];
 const loot=s=>Number(s?.mapLoot?.sourceCount||0)>0||arr(s?.mapLoot?.sources).length>0||!!s?.mapLoot?.possiblyTruncated;
 const ids=new Set([...Object.keys(supply),...Object.entries(rules).filter(([,r])=>r.needItem).map(([id,r])=>r.neededItem||id),...(data.transformations||[]).flatMap(r=>Object.keys(r.requiredItems||{})),...(data.profiles||[]).flatMap(p=>Object.keys(p.acquisitionRequiredItems||{}))]);
 for(const id of ids){
  const s=supply[id],events=arr(s?.eventGrants),grants=events.map(finiteGrant);
  const only=events.length&&grants.every(Boolean)&&!(s.buyCost>0)&&!recipes(s).length&&!arr(s.researchGrants).length&&!loot(s);
  if(only){
   const cap=grants.reduce((n,g)=>n+g.quantity*g.occurrences,0);
   assert(Number.isSafeInteger(cap)&&cap>0);
   const f={id,name:id,cap,kind:"INDEXED_FINITE_GRANT_POOL",grants,hard:false};finite.set(id,f);boundedInputs.add(id);catalog[id]=f;
  }else catalog[id]={id,name:id,cap:null,kind:s?.buyCost>0||recipes(s).length?"ORDINARY_ACQUISITION_ASSUMED":events.length||arr(s?.researchGrants).length?"EVENT_ACQUISITION_ASSUMED":"SOURCE_UNRESOLVED_ACQUISITION_ASSUMED"};
 }
 assert.equal(finite.get(TOKEN)?.cap,11);assert.equal(finite.get(TOKEN)?.grants.length,1);assert.equal(finite.get(TOKEN)?.grants[0].event,"STR_CAPTAINS_11");
 finite.get(TOKEN).hard=true;finite.get(TOKEN).kind="CONFIRMED_FINITE";
 assert.equal(finite.get(POD)?.cap,3);assert.equal(finite.get(POD)?.grants[0].event,"STR_VENTURA_ANOMALY_EVENT");
 let changed=true;
 while(changed){changed=false;for(const id of ids){
  const s=supply[id],rs=recipes(s);
  if(!s||boundedInputs.has(id)||s.buyCost>0||arr(s.eventGrants).length||arr(s.researchGrants).length||loot(s)||!rs.length)continue;
  if(rs.every(r=>Object.keys(r.requiredItems||{}).some(k=>boundedInputs.has(k)))){boundedInputs.add(id);changed=true;catalog[id].kind="FINITE_INPUT_DEPENDENCY";}
 }}
 const transforms=new Map((data.transformations||[]).map(r=>[r.id,r])),profiles=new Map((data.profiles||[]).map(p=>[p.id,p]));
 const metrics={pathsChecked:0,rejected:0,unknownIndexedExceeded:0,ordinaryRepairs:0,ordinaryRepairUnits:0,facilityRepairs:0};
 const empty=()=>({granted:{},consumed:{},violations:[],events:[],unbacked:[]});
 function extend(base,steps){
  const v={granted:{...base.granted},consumed:{...base.consumed},violations:base.violations.slice(),events:base.events.slice(),unbacked:base.unbacked.slice()};
  const add=(o,id,n)=>{if(finite.has(id)&&Number.isSafeInteger(n)&&n>0)o[id]=(o[id]||0)+n;};
  for(const a of steps){
   if(a.type==="eventResearch"&&!v.events.includes(a.event))v.events.push(a.event);
   if(a.type==="externalInputs")for(const [id,n] of Object.entries(a.items||{})){
    add(v.granted,id,n);const f=finite.get(id);
    if(!f||!n)continue;
    const witnessed=f.grants.filter(g=>v.events.includes(g.event)).reduce((s,g)=>s+g.quantity*g.occurrences,0);
    if(v.granted[id]>witnessed){const reason=id+": FINITE_EVENT_SOURCE_NOT_REPLAYED";const bucket=f.hard?v.violations:v.unbacked;if(!bucket.includes(reason))bucket.push(reason);}
   }
   let c={};
   if(a.type==="transform")c=transforms.get(a.transform)?.requiredItems||{};
   else if(a.type==="recruit")c=profiles.get(a.profile)?.acquisitionRequiredItems||{};
   else if(a.type==="research"||a.type==="repeatResearch"){const r=rules[a.id];if(r?.needItem&&r.destroyItem)c={[r.neededItem||a.id]:1};}
   for(const [id,n] of Object.entries(c))add(v.consumed,id,n);
  }return v;
 }
 function issues(v){
  const hard=v.violations.slice(),uncertain=v.unbacked.slice();
  for(const [id,f] of finite){
   const n=Math.max(v.granted[id]||0,v.consumed[id]||0);
   if(n>f.cap)(f.hard?hard:uncertain).push(id+": "+n+"/"+f.cap);
   if(n&&!f.grants.some(g=>v.events.includes(g.event))){const k=id+": FINITE_EVENT_SOURCE_NOT_REPLAYED",b=f.hard?hard:uncertain;if(!b.includes(k))b.push(k);}
  }return {hard,uncertain};
 }
 const graphCache=new WeakMap();
 function state(g,i){
  let cache=graphCache.get(g);if(!cache){cache=new Map();graphCache.set(g,cache);}
  if(cache.has(i))return cache.get(i);const path=[];let j=i;
  while(j!==null&&!cache.has(j)){assert(g.nodes[j]);path.push(j);j=g.nodes[j].parent;}
  let v=j===null?empty():cache.get(j);
  for(const k of path.reverse()){v=extend(v,k===0?g.birthActions:g.nodes[k].steps);cache.set(k,v);}return v;
 }
 function check(g,parent,steps){
  metrics.pathsChecked++;const v=parent===null?extend(empty(),g.birthActions):extend(state(g,parent),steps),q=issues(v);
  if(q.hard.length){metrics.rejected++;throw Error("FINITE_MATERIAL_BUDGET: "+q.hard.join("; "));}
  if(q.uncertain.length){metrics.unknownIndexedExceeded++;throw Error("INDEXED_FINITE_GRANT_POOL_UNRESOLVED: "+q.uncertain.join("; "));}
  return v;
 }
 function repair(w,step){
  if(step.type!=="research"&&step.type!=="repeatResearch")return null;
  const r=rules[step.id];if(!r||w.pendingFree)return null;
  const id=r.neededItem||step.id,inputs={},missing=(r.requiresBaseFunc||[]).filter(k=>!w.baseFunctions.has(k));
  if(r.needItem&&(w.items[id]||0)<1&&!boundedInputs.has(id)&&catalog[id]?.kind==="ORDINARY_ACQUISITION_ASSUMED"){inputs[id]=1;metrics.ordinaryRepairs++;metrics.ordinaryRepairUnits++;}
  const supplied=new Set(w.baseFunctions),functions=[];
  if(missing.length){
   const facilities=Object.values(data.baseFacilityFunctions||{}).filter(f=>(f.research||[]).every(k=>w.researched.has(k)&&!w.disabled.has(k))),byFunc=new Map();
   let changed=true;while(changed){changed=false;for(const f of facilities)if((f.requires||[]).every(k=>supplied.has(k)))for(const k of f.provides||[])if(!supplied.has(k)){supplied.add(k);byFunc.set(k,f);changed=true;}}
   const needed=new Set();function collect(k){if(w.baseFunctions.has(k)||needed.has(k))return;const f=byFunc.get(k);if(!f)return;for(const q of f.requires||[])collect(q);needed.add(k);}
   if(missing.every(k=>supplied.has(k)))for(const k of missing)collect(k);functions.push(...needed);metrics.facilityRepairs+=functions.length;
  }
  return Object.keys(inputs).length||functions.length?{type:"externalInputs",items:inputs,functions,reason:"v.o2 indexed ordinary acquisition / unlocked facility construction: "+step.id,assumption:true}:null;
 }
 const fingerprint=key([MATERIAL_POLICY,source.metadataSha256,source.rules,supply,data.eventResearchSources,rules,Object.fromEntries(finite),catalog]);
 function describe(){const counts={};for(const r of Object.values(catalog))counts[r.kind]=(counts[r.kind]||0)+1;return {schema:MATERIAL_POLICY,source:"public/data/soldiers-modern-index.json#itemSupply+eventResearchSources",sourceMetadataSha256:source.metadataSha256,sourceVersion:"v.o2",sha256:fingerprint,scope:"Independent hypothetical campaigns; indexed finite grants and chronological source witnesses; no claim of exhaustive loot or actual campaign supply.",counts,finite:Object.fromEntries(finite),catalog,metrics:{...metrics}};}
 return {catalog,finite,empty,extend,state,issues,check,repair,describe,metrics};
}
