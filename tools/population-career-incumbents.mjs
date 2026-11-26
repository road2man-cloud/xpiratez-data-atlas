// Observed maxima and scheduling hints only. The coordinate maxima are
// separate witness records, NOT a single attainable stat vector.
import {STAT_KEYS} from "../public/soldiers/modern/eligibility.js";
export const SPECIAL_BODY="STR_SOLDIER_CHORT";
const sum=v=>v.reduce((a,b)=>a+b,0);
const scope=(o,b)=>JSON.stringify([o,b]);
const valid=v=>Array.isArray(v)&&v.length===STAT_KEYS.length&&v.every(Number.isFinite);
function entry(){return {witnesses:0,currentTotal:null,capTotal:null,currentRoute:null,capRoute:null,currentMax:Array(STAT_KEYS.length).fill(null),capMax:Array(STAT_KEYS.length).fill(null),currentMaxRoutes:Array(STAT_KEYS.length).fill(null),capMaxRoutes:Array(STAT_KEYS.length).fill(null)};}
function update(e,r){
 e.witnesses++;
 for(const k of ["current","cap"]){
  const v=r[k],n=sum(v),t=k+"Total",route=k+"Route",mx=k+"Max",refs=k+"MaxRoutes";
  if(e[t]===null||n>e[t]||n===e[t]&&r.id<e[route]){e[t]=n;e[route]=r.id;}
  for(const [i,x] of v.entries())if(e[mx][i]===null||x>e[mx][i]||x===e[mx][i]&&r.id<e[refs][i]){e[mx][i]=x;e[refs][i]=r.id;}
 }
}
export function summarizeCareerIncumbents(rows){
 const scopes={},bodies={},ordinaryOrigins={};let witnesses=0,specialWitnesses=0;
 for(const r of rows){
  if(!r.id||!r.origin||!r.body||!valid(r.current)||!valid(r.cap))throw Error("Invalid complete career vector "+r.id);
  witnesses++;const k=scope(r.origin,r.body);
  update(scopes[k]??={origin:r.origin,body:r.body,...entry()},r);
  update(bodies[r.body]??={body:r.body,...entry()},r);
  if(r.body===SPECIAL_BODY){specialWitnesses++;continue;}
  update(ordinaryOrigins[r.origin]??={origin:r.origin,...entry()},r);
 }
 return {schema:"CAREER_OBSERVED_INCUMBENTS_V1",scope:"Observed complete conditional research lines only. Each maximum has its own real witness; no global optimum claimed.",statKeys:STAT_KEYS,scopes,bodies,ordinaryOrigins,
  summary:{witnesses,specialWitnesses,nonSpecialWitnesses:witnesses-specialWitnesses,scopes:Object.keys(scopes).length,bodyCount:Object.keys(bodies).length,nonSpecialBodyCount:Object.keys(bodies).filter(b=>b!==SPECIAL_BODY).length,nonSpecialOrigins:Object.keys(ordinaryOrigins).length}};
}
export function incumbentsFromRegistry(db){
 const c=db.careerCompletion,s=c?.researchTraitSets,rows=[],seen=new Set();
 for(const a of c?.rows||[]){
  if(a.proofKind!=="REPLAYED_RESEARCH_LINE_V1")continue;
  const p=s?.pairs?.[a.id];if(!p)continue;
  for(const ref of [a,...(a.alternatives||[])]){
   const r=s.records[ref.routeId];if(!r||r.pairId!==a.id||seen.has(ref.routeId))continue;
   seen.add(ref.routeId);rows.push({id:ref.routeId,origin:p.origin,body:p.body,current:r.current,cap:r.cap});
  }
 }
 return summarizeCareerIncumbents(rows);
}
export function createIncumbentScorer({data,incumbents}){
 const base=new Map(data.soldiers.map(b=>[b.id,STAT_KEYS.map(k=>Math.max(0,Number(b.statCaps?.[k]||0)))]));
 const fixed=new Map(),memo=new WeakMap();
 function deltas(r){
  if(!r)return STAT_KEYS.map(()=>0);
  if(!fixed.has(r.id))fixed.set(r.id,STAT_KEYS.map(k=>Number(r.fixedEffectiveDelta?.[k]||0)));
  return fixed.get(r.id);
 }
 function score(n,r,g){
  if(!n||!valid(n.permanentVector)||!valid(n.permanentCapVector))return 0;
  let cached=memo.get(n);if(!cached){cached=new Map();memo.set(n,cached);}
  const k=scope(g?.origin||"",r?.id||"");if(cached.has(k))return cached.get(k);
  const origin=g?.origin||"",ref=incumbents.scopes[scope(origin,n.body)]||incumbents.bodies[n.body],b=base.get(n.body)||STAT_KEYS.map(()=>80);
  const d=deltas(r),cap=n.permanentCapVector,current=n.permanentVector;
  // Fixed effective delta is a heuristic only; caps, percentage changes,
  // body changes, history, and psi restrictions must be evaluated by replay.
  const projectedCap=cap.map((v,i)=>Math.max(0,v+d[i])),projectedCurrent=current.map((v,i)=>Math.max(0,v+d[i]));
  const capRef=Math.max(1,ref?.capTotal??sum(b)),currentRef=Math.max(1,ref?.currentTotal??sum(b));
  const ratios=projectedCap.map((v,i)=>v/Math.max(20,ref?.capMax[i]??b[i])).sort((a,b)=>b-a);
  const gain=d.reduce((s,v,i)=>s+Math.max(0,v)/Math.max(20,b[i]),0);
  const value=85*sum(projectedCap)/capRef+15*sum(projectedCurrent)/currentRef+12*sum(ratios.slice(0,3))/3+8*gain+2*(n.traits?.length||0);
  cached.set(k,value);return value;
 }
 return {score};
}
