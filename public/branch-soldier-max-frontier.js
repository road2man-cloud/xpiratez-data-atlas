// Comparison-only Pareto frontier. Never used to prune future game states.
// Scope equality preserves origin, branch, body, difficulty and terminal goals.
export const comparisonScope=r=>JSON.stringify([r.origin,r.branch,r.body,[...(r.difficulties||[])].sort((a,b)=>a-b),[...(r.terminalGoals||r.researchTraitPair?.goals||[])].sort()]);
const vector=r=>[...r.current,...r.cap];
const usable=r=>Array.isArray(r.current)&&r.current.length===12&&Array.isArray(r.cap)&&r.cap.length===12&&vector(r).every(Number.isFinite);
const weaklyDominates=(a,b)=>a.every((v,i)=>v>=b[i]);
const stable=(a,b)=>String(a.key||a.id).localeCompare(String(b.key||b.id));
// Return a real witness for every nondominated numeric vector. Equal vectors
// share one representative, but all original paths remain in the archive.
export function maxComparisonRows(rows){
 const groups=new Map(),unknown=[];
 for(const r of rows){
  if(!usable(r)){unknown.push(r);continue;}
  const k=comparisonScope(r),v=vector(r),list=groups.get(k)||[];
  let suppressed=false;
  for(const q of list)if(weaklyDominates(q.v,v)&&(!weaklyDominates(v,q.v)||stable(q.r,r)<=0)){suppressed=true;break;}
  if(suppressed)continue;
  groups.set(k,[...list.filter(q=>!weaklyDominates(v,q.v)),{r,v}]);
 }
 return [...groups.values()].flatMap(g=>g.map(q=>q.r)).concat(unknown);
}
export function summarizeMaxComparison(rows){
 const front=maxComparisonRows(rows);
 return {schema:"RESEARCH_LINE_NUMERIC_PARETO_V1",scope:"Observed complete research-line witnesses only; both current and cap vectors; not a global optimum or successor pruning proof.",
  witnesses:rows.length,frontier:front.length,hidden:rows.length-front.length,
  groups:new Set(rows.map(comparisonScope)).size,
  frontierPairs:new Set(front.map(r=>r.completionId)).size,
  routeIds:front.map(r=>r.id).sort()};
}
