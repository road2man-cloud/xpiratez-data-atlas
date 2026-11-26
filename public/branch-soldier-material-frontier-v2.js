// Independent resource dimensions: never trade one unique item for another
// by summing them in a dominance certificate. Missing evidence fails open.
import {comparisonScope,careerClass,stable} from "./branch-soldier-max-frontier.js?v=82-repeat-compact";
const ge=(a,b)=>a.every((v,i)=>v>=b[i]);
const le=(a,b)=>a.every((v,i)=>v<=b[i]);
const numeric=r=>Array.isArray(r.current)&&r.current.length===12&&Array.isArray(r.cap)&&r.cap.length===12&&[...r.current,...r.cap].every(Number.isFinite);
export function createMaterialIndex(budget,checkedIds=null){
 const ids=Object.keys(budget?.finite||{}).sort(),known=new Set(budget?.checkedRouteIds||checkedIds||[]);
 const usable=!!budget&&ids.length>0&&known.size===budget.checked;
 function cost(id){
  if(!usable||!known.has(id))return null;
  const e=budget.records?.[id];if(e?.hard?.length||e?.uncertain?.length)return null;
  const v=ids.map(k=>e?.use?.[k]?.consumed??0);
  return v.every(n=>Number.isSafeInteger(n)&&n>=0)?v:null;
 }
 return {ids,known,usable,cost,finite:budget?.finite||{}};
}
export function materialComparisonRows(rows,index){
 const groups=new Map(),unknown=[];
 for(const r of rows){
  const c=index.cost(r.id);if(!numeric(r)||!c){unknown.push(r);continue;}
  const k=comparisonScope(r),v=[...r.current,...r.cap],list=groups.get(k)||[];
  const dominates=q=>ge(q.v,v)&&le(q.c,c),dominated=q=>ge(v,q.v)&&le(c,q.c);
  if(list.some(q=>dominates(q)&&(!dominated(q)||stable(q.r,r)<=0)))continue;
  groups.set(k,[...list.filter(q=>!dominated(q)),{r,v,c}]);
 }
 return [...groups.values()].flatMap(g=>g.map(q=>q.r)).concat(unknown);
}
export function summarizeMaterialComparison(rows,index){
 const front=materialComparisonRows(rows,index);
 return {schema:"OBSERVED_NUMERIC_AND_FINITE_CONSUMPTION_PARETO_V1",scope:"Same origin/branch/body/difficulties/terminal goals; 24 numeric axes and independent tracked consumption axes; no global optimum.",materialIds:index.ids,known:rows.filter(r=>index.cost(r.id)!==null).length,unknown:rows.filter(r=>index.cost(r.id)===null).length,frontier:front.length,ordinaryFrontier:front.filter(r=>careerClass(r)==="ordinary").length,chortFrontier:front.filter(r=>careerClass(r)==="chort").length,routeIds:front.map(r=>r.id).sort()};
}
