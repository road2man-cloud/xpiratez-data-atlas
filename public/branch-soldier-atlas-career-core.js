// All values are projections of canonical replay ledgers, never independent maxima.
export const ledgers=[
 {key:'missingbirth',registryKey:'populationMissingOriginCareer',file:'soldier-population-missing-origin-career',label:'미연결 출생처 모집·육성',index:'soldier-population-missing-origin-career-index'},
 {key:'alternating',file:'soldier-final-career-alternating-candidates',label:'연구·시술 교대 조건부 대표',index:'soldier-final-career-alternating-candidate-index'},
 {key:'frontier',registryKey:'populationFrontierChronology',file:'soldier-population-frontier-chronology',label:'시간순 육성',index:'soldier-final-career-research-index'},
 {key:'newpair',registryKey:'populationNewPairCareer',file:'soldier-population-new-pair-career',label:'모집 후 육성',index:'soldier-new-pair-research-index'},
 {key:'research',registryKey:'populationResearchCareer',file:'soldier-population-research-career',label:'추가 연구 육성'},
 {key:'chronological',registryKey:'populationChronologicalCareer',file:'soldier-population-chronological-career',label:'승급·시술 육성'},
 {key:'growth',registryKey:'populationGrowthReplay',file:'soldier-population-growth-replay',label:'성장 순서 재생'}
];
export const statKeys=['tu','stamina','health','bravery','reactions','firing','throwing','strength','psiStrength','psiSkill','melee','mana'];
const validVector=v=>Array.isArray(v)&&v.length===statKeys.length&&v.every(Number.isFinite);
const strings=x=>Array.isArray(x)?x.filter(v=>typeof v==='string'):[];
export const sum=v=>v.reduce((a,b)=>a+b,0);
const stringList=v=>Array.isArray(v)&&v.every(id=>typeof id==='string'&&id.length>0);
// Frontier's traitTransition records the complete post-replay bonus ID set
// as "after". Missing or malformed snapshots must never become an empty set.
export function retainedTraitIds(r){
 const e=r.traitEvidence;
 if(stringList(e?.retained))return [...new Set(e.retained)];
 const transition=(e)=>{
  if(!stringList(e?.before)||!stringList(e?.after)||!stringList(e?.gained)||!stringList(e?.lost))return null;
  const a=new Set(e.before),b=new Set(e.after),equal=(x,y)=>x.size===y.size&&[...x].every(id=>y.has(id));
  if(!equal(new Set(e.gained),new Set([...b].filter(id=>!a.has(id))))||!equal(new Set(e.lost),new Set([...a].filter(id=>!b.has(id)))))return null;
  return [...b];
 };
 return transition(e)??transition(r.rankTraitEvidence);
}
export function project(ledger,data,metadata){
 if(data.sourceMetadataSha256!==metadata||!data.routes||typeof data.routes!=='object')throw Error('원장 버전 또는 자료 불일치');
 const rows=[],rejected=[];
 for(const [id,r] of Object.entries(data.routes)){
  // These ledgers explicitly exclude decoration from permanent vectors; growth-only has no medal actions.
  const current=r.permanentVector??r.vector,cap=r.permanentCapVector??r.capVector;
  if(!validVector(current)||!validVector(cap)||!r.origin||!r.body||!r.branch||!r.fullActionHash||!stringList(r.order)){rejected.push(id);continue;}
  rows.push({key:ledger.key+':'+id,id,source:ledger.key,origin:r.origin,body:r.body,branch:r.branch,
   order:strings(r.order),current,cap,hash:r.fullActionHash,difficulties:Array.isArray(r.allowedDifficulties)?r.allowedDifficulties.filter(Number.isInteger):[],
   traits:retainedTraitIds(r),
   traitCounts:r.traitEvidence?.counts??null,requiredResearch:Array.isArray(r.traitEvidence?.requiredResearch)?strings(r.traitEvidence.requiredResearch):null,rank:r.rank??null,medals:r.medals??null,
   rootRoute:r.rootRoute??null,sourceGraph:r.sourceGraph??null,sourceNode:r.sourceNode??null,researchSet:r.researchSet??null,graphSha:data.sourceGraphSha256??null,conditionalScopeComplete:r.conditionalScopeComplete===true,
   fixedModelOptimum:r.fixedModelOptimum?.scope==='FIXED_RESEARCH_DETERMINISTIC_PERMANENT_VECTOR_ONLY'&&validVector(r.fixedModelOptimum.vector)&&r.fixedModelOptimum.vector.every((v,i)=>v===current[i])?r.fixedModelOptimum:null,
   researchTransition:r.researchTransition?.scope==='CONDITIONAL_RESEARCH_TRANSITION_ONLY'&&r.researchTransition.resultSet===r.researchSet&&Array.isArray(r.researchTransition.beforeAxes)&&r.researchTransition.beforeAxes.length===12&&Array.isArray(r.researchTransition.afterAxes)&&r.researchTransition.afterAxes.length===12&&Array.isArray(r.researchTransition.actualExceeded)&&r.researchTransition.actualExceeded.length===12&&r.researchTransition.actualExceeded.every((v,i)=>r.researchTransition.beforeAxes[i]===null?v===null:Number.isFinite(r.researchTransition.beforeAxes[i])&&v===Math.max(0,current[i]-r.researchTransition.beforeAxes[i]))&&r.researchTransition.exceededAxes===r.researchTransition.actualExceeded.filter(v=>v>0).length?r.researchTransition:null,
   jointResearch:r.jointResearch?.scope==='JOINT_ACTIVE_RESEARCH_CONDITIONAL_REPLAY'&&r.jointResearch.resultSet===r.researchSet&&Array.isArray(r.jointResearch.requested)&&Array.isArray(r.jointResearch.achieved)&&r.jointResearch.achieved.length>=2&&r.jointResearch.achieved.every(k=>r.jointResearch.requested.includes(k))&&Array.isArray(r.jointResearch.targets)&&Array.isArray(r.jointResearch.applied)&&r.jointResearch.applied.every(k=>r.jointResearch.targets.includes(k)&&r.order.includes(k))?r.jointResearch:null,
   retention:r.retention?.scope==='ACTUAL_REPLAYED_GRAPH_ROOT_TRAIT_DELTA'&&Array.isArray(r.retention.before)&&Array.isArray(r.retention.after)&&Array.isArray(r.retention.gained)&&Array.isArray(r.retention.lost)&&JSON.stringify([...r.retention.after].sort())===JSON.stringify(strings(r.traitEvidence?.retained).sort())&&JSON.stringify([...r.retention.gained].sort())===JSON.stringify(r.retention.after.filter(k=>!r.retention.before.includes(k)).sort())&&JSON.stringify([...r.retention.lost].sort())===JSON.stringify(r.retention.before.filter(k=>!r.retention.after.includes(k)).sort())&&r.retention.lossless===(r.retention.gained.length>0&&r.retention.lost.length===0)?r.retention:null,
   resetRecovery:r.resetRecovery?.scope==='CONCRETE_LAST_RESET_LINEAGE'&&r.order.includes(r.resetRecovery.action)&&Array.isArray(r.resetRecovery.beforeTraits)&&Array.isArray(r.resetRecovery.afterTraits)&&Array.isArray(r.resetRecovery.currentTraits)&&Array.isArray(r.resetRecovery.removed)&&Array.isArray(r.resetRecovery.regained)&&Array.isArray(r.resetRecovery.newAfterReset)&&Array.isArray(r.resetRecovery.newVsBefore)&&Array.isArray(r.resetRecovery.lostVsBefore)&&validVector(r.resetRecovery.beforeVector)&&validVector(r.resetRecovery.afterVector)&&JSON.stringify([...r.resetRecovery.currentTraits].sort())===JSON.stringify(strings(r.traitEvidence?.retained).sort())&&r.resetRecovery.netSinceReset===r.resetRecovery.currentTraits.length-r.resetRecovery.afterTraits.length?r.resetRecovery:null,
   researchDiscovery:r.researchDiscovery?.scope==='PREVIOUSLY_UNREPRESENTED_BRANCH_GOAL'&&r.researchDiscovery.resultSet===r.researchSet&&Array.isArray(r.researchDiscovery.goal)&&r.researchDiscovery.goal.length?r.researchDiscovery:null,
   birthEvidence:r.birthEvidence?.scope==='CONDITIONAL_MIN_RECRUITMENT'&&Number.isSafeInteger(r.birthEvidence.birthAt)&&r.birthEvidence.birthAt>=0&&Number.isInteger(r.birthEvidence.birthMonth)&&r.birthEvidence.birthMonth>=0&&Array.isArray(r.birthEvidence.requiredResearch)?r.birthEvidence:null,
   certified:r.actualGameCertified===true});
 }
 return {rows,rejected};
}
// The two display modes reuse one projection of the canonical ledgers.
const projectionCache=new WeakMap();
export async function loadCareerRows(modern,registry){
 if(modern?.meta?.mod?.version!=='v.o2')throw Error('2.1 병종 자료가 아닙니다');
 if(projectionCache.has(modern))return projectionCache.get(modern);
 const metadata=modern.meta.source.metadataSha256;
 const promise=(async()=>{
  const rows=[],errors=[];
  for(const source of ledgers){
   try{
    let data=source.registryKey&&registry?.sourceMetadataSha256===metadata?registry[source.registryKey]:null;
    if(!data){
     const url=new URL('./data/'+source.file+'.json.gz',import.meta.url),res=await fetch(url);
     if(!res.ok)throw Error('HTTP '+res.status);
     if(typeof DecompressionStream==='undefined')throw Error('gzip 지원 브라우저 필요');
     data=await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).json();
    }
    const projected=project(source,data,metadata);rows.push(...projected.rows);
    if(projected.rejected.length)errors.push(source.label+' '+projected.rejected.length+'행 제외');
   }catch(e){errors.push(source.label+' 미연결: '+e.message)}
  }
  return {rows,errors};
 })();
 projectionCache.set(modern,promise);
 return promise;
}
export function exactCareerUrl(r){
 return 'soldiers/modern/?'+new URLSearchParams({group:'routes',origin:r.origin,body:r.body,branch:r.branch,q:r.id})+'#originMaxima';
}
// Empty input is unrestricted. Unknown retained traits never satisfy a numeric threshold.
export function routeThreshold(value){
 if(value==null||String(value).trim()==='')return null;
 const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:null;
}
export function routeObjective(r,metric,stat){
 if(stat==='depth')return r.order.length;
 if(stat==='traitCount')return r.traits?.length??-Infinity;
 return stat==='total'?sum(r[metric]):r[metric][statKeys.indexOf(stat)];
}
// Existing single-ID links are also valid. Multiple IDs mean AND within one route.
// A sequence preserves repetitions; unordered inclusion/exclusion remains a set.
export function routeSequenceIds(value){
 return (Array.isArray(value)?value:[value]).flatMap(v=>typeof v==='string'?v.split(','):[]).map(v=>v.trim()).filter(Boolean);
}
export function routeFilterIds(value){return [...new Set(routeSequenceIds(value))];}
export function containsOrderedActions(actions,sequence){
 if(!sequence.length)return true;
 if(!Array.isArray(actions))return false;
 let i=0;
 for(const id of actions)if(id===sequence[i]&&++i===sequence.length)return true;
 return false;
}
export function filterRows(rows,f){
 const depth=routeThreshold(f.minDepth),traits=routeThreshold(f.minTraits);
 const trainingIds=routeFilterIds(f.training),traitIds=routeFilterIds(f.trait);
 const excludeTraining=routeFilterIds(f.excludeTraining),excludeTrait=routeFilterIds(f.excludeTrait),trainingSequence=routeSequenceIds(f.trainingSequence);

 return rows.filter(r=>(!f.origin||r.origin===f.origin)&&(!f.body||r.body===f.body)&&(!f.branch||r.branch===f.branch)&&
  (!f.captain||f.branchCaptains?.get(r.branch)?.includes(f.captain))&&
  trainingIds.every(id=>r.order.includes(id))&&traitIds.every(id=>r.traits?.includes(id))&&
  (!trainingSequence.length||!r.missing&&containsOrderedActions(r.order,trainingSequence))&&
  (!excludeTraining.length||!r.missing&&Array.isArray(r.order)&&excludeTraining.every(id=>!r.order.includes(id)))&&
  (!excludeTrait.length||Array.isArray(r.traits)&&excludeTrait.every(id=>!r.traits.includes(id)))&&
  (depth===null||!r.missing&&r.order.length>=depth)&&(traits===null||r.traits!==null&&r.traits.length>=traits)&&
  (f.difficulty===''||f.difficulty==null||r.difficulties.includes(Number(f.difficulty)))&&(!f.certified||r.certified));
}
// Search only explicitly recorded research actions. Assumed event outcomes remain
// conditional records; a rule requirement or a research-set ID is not a witness.
export function researchActionId(action){
 if(!action)return null;
 if(['research','repeatResearch'].includes(action.type))return typeof action.id==='string'?action.id:null;
 if(['eventResearch','freeResearch','missionResearch'].includes(action.type))return typeof action.research==='string'?action.research:null;
 return null;
}
export function compileResearchSearch(ledger,index,metadata){
 if(index.sourceMetadataSha256!==metadata||!Array.isArray(index.nodes)||!index.routes)throw Error('연구 색인 버전 불일치');
 const graphSha=index.sourceGraphSha256;
 const parents=new Int32Array(index.nodes.length),ids=new Int32Array(index.nodes.length),dictionary=new Map();
 ids.fill(-1);
 for(const [i,node] of index.nodes.entries()){
  const p=node.parent;if(p!==null&&(!Number.isInteger(p)||p<0||p>=i))throw Error('연구 이력 노드 연결 오류');
  parents[i]=p===null?-1:p;
  const id=researchActionId(node.action);if(!id)continue;
  if(!dictionary.has(id))dictionary.set(id,dictionary.size);
  ids[i]=dictionary.get(id);
 }
 const routes=new Map();
 for(const [id,w] of Object.entries(index.routes)){
  if(!Number.isInteger(w.prefix)||w.prefix<0||w.prefix>=parents.length)continue;
  routes.set(id,{prefix:w.prefix,origin:w.origin,branch:w.branch,hash:w.fullActionHash,graph:w.sourceGraph,node:w.sourceNode});
 }
 const cache=new Map(),sequenceCache=new Map();
 // Dynamic programming across shared chronological prefixes. Greedy matching
 // gives the longest matched subsequence per node, without replaying each route.
 function progress(requested){
  const key=JSON.stringify(requested);
  if(sequenceCache.has(key)){const hit=sequenceCache.get(key);sequenceCache.delete(key);sequenceCache.set(key,hit);return hit;}
  const target=requested.map(id=>dictionary.get(id));
  if(target.some(id=>id===undefined))return null;
  const result=new Uint32Array(parents.length);
  for(let i=0;i<parents.length;i++){
   const prior=parents[i]<0?0:result[parents[i]];
   result[i]=prior<target.length&&ids[i]===target[prior]?prior+1:prior;
  }
  sequenceCache.set(key,result);if(sequenceCache.size>8)sequenceCache.delete(sequenceCache.keys().next().value);
  return result;
 }
 function bits(id){
  const n=dictionary.get(id);if(n===undefined)return null;
  if(cache.has(id)){const found=cache.get(id);cache.delete(id);cache.set(id,found);return found;}
  const result=new Uint8Array(parents.length);
  for(let i=0;i<parents.length;i++)result[i]=ids[i]===n||parents[i]>=0&&result[parents[i]]?1:0;
  cache.set(id,result);if(cache.size>32)cache.delete(cache.keys().next().value);
  return result;
 }
 function entry(row){
  const w=routes.get(row.id);
  if(row.source!==ledger.key||!w||w.origin!==row.origin||w.branch!==row.branch||w.hash!==row.hash)return null;
  if(row.sourceGraph&&(!row.graphSha||graphSha!==row.graphSha||w.graph!==row.sourceGraph||w.node!==row.sourceNode))return null;
  return w;
 }
 return {ids:[...dictionary.keys()],hasWitness:row=>!!entry(row),matches(row,requested){
  const w=entry(row);return !!w&&requested.every(id=>bits(id)?.[w.prefix]===1);
 },matchesSequence(row,requested){
  const w=entry(row);return !!w&&(!requested.length||progress(requested)?.[w.prefix]===requested.length);
 }};
}
const researchSearchCache=new WeakMap();
export async function loadResearchSearch(modern){
 if(researchSearchCache.has(modern))return researchSearchCache.get(modern);
 const metadata=modern.meta.source.metadataSha256;
 const promise=(async()=>{
  const sources=new Map(),errors=[];
  for(const ledger of ledgers.filter(l=>l.index)){
   try{
    const response=await fetch(new URL('./data/'+ledger.index+'.json.gz',import.meta.url));
    if(!response.ok)throw Error('HTTP '+response.status);
    if(typeof DecompressionStream==='undefined')throw Error('gzip 지원 브라우저 필요');
    const raw=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
    sources.set(ledger.key,compileResearchSearch(ledger,raw,metadata));
   }catch(e){errors.push(ledger.label+' 연구 이력: '+e.message)}
  }
  const ids=[...new Set([...sources.values()].flatMap(s=>s.ids))];
  return {ids,errors,sources:sources.size,hasWitness:r=>sources.get(r.source)?.hasWitness(r)===true,matches:(r,requested)=>sources.get(r.source)?.matches(r,requested)===true,matchesSequence:(r,requested)=>sources.get(r.source)?.matchesSequence(r,requested)===true};
 })();
 researchSearchCache.set(modern,promise);return promise;
}
export function filterCareerRequirements(rows,filters,{profiles=new Map(),researchIndex=null}={}){
 const research=routeFilterIds(filters.researchAction),sequence=routeSequenceIds(filters.researchSequence),recruit=routeFilterIds(filters.recruitResearch),items=routeFilterIds(filters.recruitItem);
 if(!research.length&&!sequence.length&&!recruit.length&&!items.length)return rows;
 return rows.filter(r=>{
  if(research.length&&!researchIndex?.matches(r,research))return false;
  if(sequence.length&&!researchIndex?.matchesSequence?.(r,sequence))return false;
  const profile=profiles.get(r.origin);
  if(recruit.length&&!recruit.every(id=>profile?.requires?.includes(id)))return false;
  if(items.length&&!items.every(id=>Number(profile?.acquisitionRequiredItems?.[id])>0))return false;
  return true;
 });
}
export function rankRows(rows,metric='cap',stat='total'){
 const i=statKeys.indexOf(stat),value=r=>i<0?sum(r[metric]):r[metric][i];
 return rows.slice().sort((a,b)=>value(b)-value(a)||sum(b[metric])-sum(a[metric])||a.key.localeCompare(b.key));
}
export function routeUrl(r){if(r.birthEvidence)return 'soldiers/modern/?'+new URLSearchParams({group:'routes',origin:r.origin,branch:r.branch,populationRoute:r.id})+'#originMaxima';return 'soldiers/modern/?'+new URLSearchParams({profile:r.origin,branch:r.branch,populationRoute:r.rootRoute||r.id})+'#originDetails';}
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
  if(r.birthEvidence){const a=fullActions[r.birthEvidence.birthAt];if(a?.type!=='recruit'||a.profile!==r.origin||a.soldier!=='origin'||a.band!=='min')throw Error('출생 행동 연결 불일치');}
 }
 return {actions:actions.reverse(),gates:w.transformGates??[],history:w.history,fullActions};
}
