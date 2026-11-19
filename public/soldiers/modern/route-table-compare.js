// Generic, source-backed row comparison for all registered soldier origins.
// This does not synthesize an optimal route from unrelated candidates.
export const ROUTE_METRICS = Object.freeze(["growth", "provisional", "birth", "certified"]);
export function routeCandidate(record, metric, preferredId=null) {
  if (!record || metric === "birth" || metric === "certified") return null;
  const qualified=(record.candidates||[]).filter(candidate=>
    metric !== "growth" || candidate.growth?.kind==="conditional-upper-envelope");
  if (preferredId) {
    const selected=qualified.find(candidate=>candidate.id===preferredId);
    if (selected) return selected;
  }
  const getTotal=c=>metric==="growth"?c.growth.total:c.display?.total;
  return qualified.reduce((best,c)=>!best||getTotal(c)>getTotal(best)?c:best,null);
}
export function routeNumbers(record, metric, preferredId=null, keys=[]) {
  if (!ROUTE_METRICS.includes(metric) || !record || metric==="certified") return null;
  const candidate=routeCandidate(record,metric,preferredId);
  const stats=metric==="birth"?record.displayBirth:candidate?.[metric==="growth"?"growth":"display"]?.stats;
  if (!stats || !keys.length || !keys.every(key=>Number.isSafeInteger(stats[key]))) return null;
  const values=Object.fromEntries(keys.map(key=>[key,stats[key]]));
  const total=keys.reduce((sum,key)=>sum+values[key],0);
  if (candidate) {
    const signedProjection=candidate[metric==="growth"?"growth":"display"];
    if (!Number.isSafeInteger(signedProjection.total) || total!==signedProjection.total)
      throw Error("원본 후보의 능력치 총합 불일치: "+candidate.id);
  }
  return {record,candidate,stats:values,total};
}
export function routeDifference(view, reference, keys) {
  if (!view || !reference) return null;
  const delta=Object.fromEntries(keys.map(key=>[key,view.stats[key]-reference.stats[key]]));
  return {stats:delta,total:keys.reduce((sum,key)=>sum+delta[key],0)};
}
export function routeEvidence(view) {
  const candidate=view?.candidate;
  if (!candidate) return {research:[],transforms:[],assumptions:[],limitations:[]};
  const research=(candidate.steps||[]).filter(x=>x.type==="research"||x.type==="freeResearch")
    .map(x=>x.id||x.research).filter(Boolean);
  const transforms=(candidate.steps||[]).filter(x=>x.type==="transform")
    .map(x=>x.transform).filter(Boolean);
  return {research:[...new Set(research)],transforms,
    assumptions:candidate.assumptions||[],limitations:candidate.limitations||[]};
}
export function routeOnly(a,b) {
  const old=new Set(b);
  return a.filter(x=>!old.has(x));
}
