// All values are projections of canonical replay ledgers, never independent maxima.
export const ledgers=[
 {key:'alternating',file:'soldier-final-career-alternating-candidates',label:'연구·시술 교대 조건부 대표',index:'soldier-final-career-alternating-candidate-index'},
 {key:'frontier',file:'soldier-population-frontier-chronology',label:'시간순 육성',index:'soldier-final-career-research-index'},
 {key:'newpair',file:'soldier-population-new-pair-career',label:'모집 후 육성',index:'soldier-new-pair-research-index'},
 {key:'research',file:'soldier-population-research-career',label:'추가 연구 육성'},
 {key:'chronological',file:'soldier-population-chronological-career',label:'승급·시술 육성'},
 {key:'growth',file:'soldier-population-growth-replay',label:'성장 순서 재생'}
];
export const statKeys=['tu','stamina','health','bravery','reactions','firing','throwing','strength','psiStrength','psiSkill','melee','mana'];
const validVector=v=>Array.isArray(v)&&v.length===statKeys.length&&v.every(Number.isFinite);
const strings=x=>Array.isArray(x)?x.filter(v=>typeof v==='string'):[];
export const sum=v=>v.reduce((a,b)=>a+b,0);
export function project(ledger,data,metadata){
 if(data.sourceMetadataSha256!==metadata||!data.routes||typeof data.routes!=='object')throw Error('원장 버전 또는 자료 불일치');
 const rows=[],rejected=[];
 for(const [id,r] of Object.entries(data.routes)){
  // These ledgers explicitly exclude decoration from permanent vectors; growth-only has no medal actions.
  const current=r.permanentVector??r.vector,cap=r.permanentCapVector??r.capVector;
  if(!validVector(current)||!validVector(cap)||!r.origin||!r.body||!r.branch||!r.fullActionHash||!Array.isArray(r.order)){rejected.push(id);continue;}
  rows.push({key:ledger.key+':'+id,id,source:ledger.key,origin:r.origin,body:r.body,branch:r.branch,
   order:strings(r.order),current,cap,hash:r.fullActionHash,difficulties:Array.isArray(r.allowedDifficulties)?r.allowedDifficulties.filter(Number.isInteger):[],
   traits:r.traitEvidence?strings(r.traitEvidence.retained):null,
   traitCounts:r.traitEvidence?.counts??null,requiredResearch:Array.isArray(r.traitEvidence?.requiredResearch)?strings(r.traitEvidence.requiredResearch):null,rank:r.rank??null,medals:r.medals??null,
   rootRoute:r.rootRoute??null,sourceGraph:r.sourceGraph??null,sourceNode:r.sourceNode??null,researchSet:r.researchSet??null,graphSha:data.sourceGraphSha256??null,conditionalScopeComplete:r.conditionalScopeComplete===true,
   fixedModelOptimum:r.fixedModelOptimum?.scope==='FIXED_RESEARCH_DETERMINISTIC_PERMANENT_VECTOR_ONLY'&&validVector(r.fixedModelOptimum.vector)&&r.fixedModelOptimum.vector.every((v,i)=>v===current[i])?r.fixedModelOptimum:null,
   certified:r.actualGameCertified===true});
 }
 return {rows,rejected};
}
export function filterRows(rows,f){
 return rows.filter(r=>(!f.origin||r.origin===f.origin)&&(!f.body||r.body===f.body)&&(!f.branch||r.branch===f.branch)&&
  (!f.captain||f.branchCaptains?.get(r.branch)?.includes(f.captain))&&
  (!f.training||r.order.includes(f.training))&&(!f.trait||r.traits?.includes(f.trait))&&
  (f.difficulty===''||f.difficulty==null||r.difficulties.includes(Number(f.difficulty)))&&(!f.certified||r.certified));
}
export function rankRows(rows,metric='cap',stat='total'){
 const i=statKeys.indexOf(stat),value=r=>i<0?sum(r[metric]):r[metric][i];
 return rows.slice().sort((a,b)=>value(b)-value(a)||sum(b[metric])-sum(a[metric])||a.key.localeCompare(b.key));
}
export function routeUrl(r){return 'soldiers/modern/?'+new URLSearchParams({profile:r.origin,branch:r.branch,populationRoute:r.rootRoute||r.id})+'#originDetails';}
export function branchUrl(id){return 'captains/?'+new URLSearchParams({branch:id})+'#integratedBranches';}
export function readResearchWitness(index,r,metadata){
 if(index.sourceMetadataSha256!==metadata)throw Error('연구 인덱스 버전 불일치');
 const w=index.routes?.[r.id];
 if(!w||w.fullActionHash!==r.hash||w.origin!==r.origin||w.branch!==r.branch)throw Error('해당 원장과 일치하는 연구 이력 미등록');
 const nodes=index.nodes;
 if(!Array.isArray(nodes))throw Error('연구 이력 노드 누락');
 const seen=new Set(),actions=[];let i=w.prefix;
 while(i!==null){
  if(!Number.isInteger(i)||i<0||i>=nodes.length||seen.has(i))throw Error('연구 이력 연결 오류');
  seen.add(i);const node=nodes[i];if(node.action)actions.push(node.action);i=node.parent;
 }
 let fullActions=null;
 if(r.sourceGraph){
  if(!r.graphSha||index.sourceGraphSha256!==r.graphSha||w.sourceGraph!==r.sourceGraph||w.sourceNode!==r.sourceNode)throw Error('교대 탐색 원장 지문 불일치');
  const all=index.actionNodes;if(!Array.isArray(all))throw Error('전체 행동 이력 누락');
  const visited=new Set();fullActions=[];let p=w.fullPrefix;
  while(p!==null){if(!Number.isInteger(p)||p<0||p>=all.length||visited.has(p))throw Error('전체 행동 이력 연결 오류');visited.add(p);const node=all[p];if(node.action)fullActions.push(node.action);p=node.parent;}
  fullActions.reverse();if(fullActions.length!==w.actionCount)throw Error('전체 행동 수 불일치');
 }
 return {actions:actions.reverse(),gates:w.transformGates??[],history:w.history,fullActions};
}
