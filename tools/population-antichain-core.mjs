// Inductive forward-simulation certificates. A cover is not certified until
// all of its remaining representatives pass scalar dominance obligations and
// all enabled transitions are covered by reachable representatives.
import assert from "node:assert/strict";
import {STAT_KEYS,statChangeEngineEstimate} from "../public/soldiers/modern/eligibility.js";
import {deterministicRule} from "./population-scalar-upper-bound.mjs";
export const MODEL="PARTIAL_CAP_BOX_ANTICHAIN_V1";
const bravery=STAT_KEYS.indexOf("bravery"),health=STAT_KEYS.indexOf("health");
const floor=i=>i===health?1:0,step=i=>i===bravery?10:1;
const asStats=v=>Object.fromEntries(STAT_KEYS.map((k,i)=>[k,v[i]]));
export const signature=p=>JSON.stringify(p.map((v,i)=>i===6?null:v));
export const dominates=(a,b)=>a[6].every((v,i)=>v>=b[6][i]);
export function assertStructure(data,model){
 assert(model.rules.every(r=>r.requiredMaxStats==null&&!r.includeBonusesForMaxStats),"Explicit upper gates require separate proof");
 assert(data.transformations.every(r=>!(r.removeTransformations||[]).length));
 for(const b of data.soldiers){
  for(const k of ["minStats","maxStats","statCaps","trainingStatCaps"])assert(Number.isSafeInteger(b[k].bravery)&&b[k].bravery%10===0);
  for(const k of STAT_KEYS)assert(b.trainingStatCaps[k]<=b.statCaps[k]);
 }
 for(const p of data.profiles)for(const root of model.initial(p))assert(root[5][bravery]%10===0&&root[6][bravery]%10===0);
}
export function createSimulationChecker(data,model){
 assertStructure(data,model);
 const tables=new Map(),metrics={ruleChecks:0,scalarChecks:0,engineEvaluations:0,tableHits:0,randomRuleSkips:0};
 function scalarTable(p,ri){
  const r=model.rules[ri],to=model.bodies.get(r.producedSoldierType||p[0]);
  if(!to||!deterministicRule(r,[to]))return null;
  const key=JSON.stringify([p[0],p[5],ri]);let t=tables.get(key);
  if(t)metrics.tableHits++;
  else{t={j:0,maxima:STAT_KEYS.map(()=>-Infinity),gaps:STAT_KEYS.map(()=>[])};tables.set(key,t);}
  const needed=Math.max(...p[6].map((x,i)=>(x-floor(i))/step(i)));
  for(;t.j<=needed;t.j++){
   const xs=STAT_KEYS.map((k,i)=>floor(i)+t.j*step(i));
   const result=statChangeEngineEstimate(r,{soldierType:p[0],currentStats:asStats(xs),initialStats:asStats(p[5])},data);
   metrics.engineEvaluations++;
   for(let i=0;i<STAT_KEYS.length;i++){
    const y=result.stats[STAT_KEYS[i]];assert(Number.isSafeInteger(y));
    t.maxima[i]=Math.max(t.maxima[i],y);t.gaps[i].push(t.maxima[i]-y);
   }
  }
  return t;
 }
 function check(p,mask){
  for(let i=0;i<STAT_KEYS.length;i++){
   const x=p[6][i];if(!Number.isSafeInteger(x)||x<floor(i)||x>9999||(x-floor(i))%step(i)!==0)return {reason:"OUTSIDE_UPPER_GATE_OR_LATTICE",stat:STAT_KEYS[i],value:x};
  }
  if(p[5][bravery]%10!==0)return {reason:"INITIAL_BRAVERY_LATTICE"};
  for(const ri of model.byBody.get(p[0])||[]){
   if(!(mask&model.bits[ri]))continue;metrics.ruleChecks++;
   const t=scalarTable(p,ri);if(!t){metrics.randomRuleSkips++;continue;}
   for(let i=0;i<STAT_KEYS.length;i++){
    const gap=t.gaps[i][(p[6][i]-floor(i))/step(i)];metrics.scalarChecks++;
    if(gap>0)return {reason:"SCALAR_NOT_DOMINATING_LOWER_INPUTS",rule:model.rules[ri].id,stat:STAT_KEYS[i],upper:p[6][i],gap};
   }
  }
  return null;
 }
 return {check,metrics,tables};
}
export function liveIndex(g,nodes){
 const buckets=new Map();
 for(let i=0;i<g.records.length;i++){
  const r=g.records[i];if(!r.live)continue;
  const k=signature(nodes[r.id].state),a=buckets.get(k)||[];a.push(i);buckets.set(k,a);
 }
 return buckets;
}
export function findCover(p,g,nodes,buckets){
 for(const i of buckets.get(signature(p))||[])if(g.records[i].live&&dominates(nodes[g.records[i].id].state,p))return i;
 return null;
}
export function verifyCover(g,nodes,model,checker,{replay=false,transitionCache=new Map()}={}){
 const mask=BigInt("0x"+g.mask),buckets=liveIndex(g,nodes),counts={live:0,rootChecks:0,edgeChecks:0,pathChecks:0,replayed:0};
 const fail=(reason,extra={})=>({ok:false,reason,...extra,counts});
 function edge(id,a){
  const n=nodes[id],k=String(a);
  if(!Object.hasOwn(n.edges,k))throw Error("Missing proof edge "+id+"/"+a);
  const to=n.edges[k];
  if(replay){
   const ck=id+"|"+a;
   if(!transitionCache.has(ck)){
    const t=model.transition(n.state,a);
    if(t.kind==="OK")assert(to>=0&&JSON.stringify(nodes[to].state)===JSON.stringify(t.state),"Transition replay mismatch");
    else assert.equal(to,t.kind==="GATE"?-1:-2);
    transitionCache.set(ck,true);counts.replayed++;
   }
  }
  return to;
 }
 // Every record has a path from a root, even if a later cover supersedes it.
 for(let i=0;i<g.records.length;i++){
  const r=g.records[i];assert(nodes[r.id]);
  if(r.parent===null)assert(g.roots.includes(r.id));
  else{
   assert(r.parent>=0&&r.parent<i);
   const p=g.records[r.parent];assert(model.actions(nodes[p.id].state,mask).includes(r.action));
   assert.equal(edge(p.id,r.action),r.id);counts.pathChecks++;
  }
 }
 for(const id of g.roots){
  if(findCover(nodes[id].state,g,nodes,buckets)===null)return fail("ROOT_NOT_COVERED",{id});
  counts.rootChecks++;
 }
 for(const r of g.records){
  if(!r.live)continue;counts.live++;
  const p=nodes[r.id].state,blocker=checker.check(p,mask);if(blocker)return fail("SIMULATION_NOT_PROVED",{id:r.id,blocker});
  for(const a of model.actions(p,mask)){
   const to=edge(r.id,a);counts.edgeChecks++;
   if(to<0)continue;
   if(findCover(nodes[to].state,g,nodes,buckets)===null)return fail("SUCCESSOR_NOT_COVERED",{id:r.id,action:a,to});
  }
 }
 return {ok:true,counts};
}
