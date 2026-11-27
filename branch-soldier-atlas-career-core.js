// All values are projections of canonical replay ledgers, never independent maxima.
import {CAREER_STAT_POLICY,comparisonStats} from "./branch-soldier-stat-comparison-policy.js?v=1";
import {loadOvercapRows} from "./branch-soldier-overcap-unified.js?v=109";
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
  const score=comparisonStats(ledger,data,r),current=score?.current,cap=score?.cap;
  if(!validVector(current)||!validVector(cap)||!r.origin||!r.body||!r.branch||!r.fullActionHash||!stringList(r.order)){rejected.push(id);continue;}
  rows.push({key:ledger.key+':'+id,id,source:ledger.key,origin:r.origin,body:r.body,branch:r.branch,
   order:strings(r.order),current,cap,statPolicy:score.statPolicy,hash:r.fullActionHash,difficulties:Array.isArray(r.allowedDifficulties)?r.allowedDifficulties.filter(Number.isInteger):[],
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
// Public tables use ONLY the admission index in the existing common registry.
// The seven chronological ledgers remain available to offline search builders.
// Never fall back to intermediate rows, even when the completion index is missing.
export const completionSchema='ATLAS_COMPLETE_CAREER_V1';
export function completionScope(modern,registry){
 const metadata=modern?.meta?.source?.metadataSha256,c=registry?.careerCompletion;
 if(modern?.meta?.mod?.version!=='v.o2'||registry?.sourceMetadataSha256!==metadata||
    c?.schema!==completionSchema||c.sourceMetadataSha256!==metadata||c.engineVersion!=='8.7.1'||
    !Array.isArray(c.rows)||c.summary?.completeCombinations!==c.rows.length)throw Error('완결 육성 판정 원장이 없거나 버전이 일치하지 않습니다');
 return c;
}
const projectionCache=new WeakMap();
export async function loadCareerRows(modern,registry,{includeWitnesses=false,scope='final'}={}){
 if(!['final','research-line'].includes(scope))throw Error('Invalid career view');
 const cacheKey=scope+'|'+(includeWitnesses?'witnesses':'pairs');
 if(modern?.meta?.mod?.version!=='v.o2')throw Error('2.1 병종 자료가 아닙니다');
 const cached=projectionCache.get(modern);if(cached?.registry===registry&&cached[cacheKey])return cached[cacheKey];
 const metadata=modern.meta.source.metadataSha256;
 const promise=(async()=>{
  const rows=[],errors=[],completion=completionScope(modern,registry);
  const strict=scope==='final',final=completion.finalCareerAdmission;
  // Fail closed against old registries or a stale final index. The explicit
  // research-line mode is for offline scheduling only, never the final UI.
  if(strict&&(!['ATLAS_CAREER_SUCCESSOR_CLOSURE_V2','ATLAS_CAREER_BODY_SCOPE_CLOSURE_V3'].includes(final?.schema)||final.sourceMetadataSha256!==metadata||final.sourceGraphSha256!==completion.researchTraitSets?.sourceGraphSha256||!Array.isArray(final.rows)||final.rows.length!==completion.rows.length||!completion.rows.every((a,i)=>a.id===final.rows[i].id&&a.closureProofHash===final.rows[i].closureProofHash)))throw Error('최종 육성 종결 판정 자료 미연결');
  const admissions=strict?completion.rows:(completion.researchLineRows||completion.rows);
  const lineStatus=c=>['RESEARCH_LINE_COMPLETE','RESEARCH_LINE_EXPLORATION','FINAL_CAREER_COMPLETE'].includes(c?.status);
  const closed=(a,routeId=a.routeId)=>{const r=final?.witnesses?.[routeId];return r?.status==='FINAL_CLOSED'&&r.pairId===a.id&&r.proofHash===a.closureProofHash&&r.actionHash===a.actionHash&&r.certificate?.graph===final.sourceGraphSha256;};
  const seen=new Set(),validBranches=new Set(registry.branches.map(b=>b.id));
  // Empty final admission index needs NO raw career ledger download/replay.
  const bySource=new Map();
  for(const a of admissions){
   const valid=typeof a.id==='string'&&/^[a-f0-9]{64}$/.test(a.id)&&
    typeof a.proofHash==='string'&&/^[a-f0-9]{64}$/.test(a.proofHash)&&
    typeof a.researchPathId==='string'&&a.researchPathId.length&&
    (['GAMEPLAY_REPLAY','RULESET_ENGINE_PROOF'].includes(a.proofKind)&&completion.classifications?.[a.source]?.[a.routeId]?.status==='COMPLETE'||a.proofKind==='REPLAYED_RESEARCH_LINE_V1'&&completion.researchLineAdmission?.schema===a.proofKind&&lineStatus(completion.classifications?.[a.source]?.[a.routeId])&&(!strict||closed(a)));
   if(!valid||seen.has(a.id)||!ledgers.some(l=>l.key===a.source)){errors.push('완결 승인 참조 오류');continue;}
   seen.add(a.id);const refs=bySource.get(a.source)||[];refs.push(a);
   if(includeWitnesses&&a.proofKind==='REPLAYED_RESEARCH_LINE_V1'){
    for(const v of a.alternatives||[]){
     if(v.source!==a.source||v.routeId===a.routeId||completion.classifications?.[v.source]?.[v.routeId]?.researchLineId!==a.id||strict&&!closed({...a,...v},v.routeId))continue;
     refs.push({...a,...v,id:a.id,alternatives:[]});
    }
   }
   bySource.set(a.source,refs);
  }
  for(const [key,refs] of bySource){
   const source=ledgers.find(s=>s.key===key);
   try{
    let data=source.registryKey?registry[source.registryKey]:null;
    if(!data){
     const url=new URL('./data/'+source.file+'.json.gz',import.meta.url),res=await fetch(url);
     if(!res.ok)throw Error('HTTP '+res.status);
     if(typeof DecompressionStream==='undefined')throw Error('gzip 지원 브라우저 필요');
     data=await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).json();
    }
    const projected=project(source,{...data,routes:Object.fromEntries(refs.filter(a=>data.routes?.[a.routeId]).map(a=>[a.routeId,data.routes[a.routeId]]))},metadata);
    const candidates=new Map(projected.rows.map(r=>[r.id,r]));
    for(const a of refs){
     const r=candidates.get(a.routeId),p=data.routes?.[a.routeId]?.completionProof;
     if(!r||r.hash!==a.actionHash||!validBranches.has(r.branch)){errors.push('완결 경로 근거 불일치: '+a.routeId);continue;}
     if(a.proofKind==='REPLAYED_RESEARCH_LINE_V1'){
      const sets=completion.researchTraitSets,ref=sets?.records?.[a.routeId],pair=sets?.pairs?.[a.id],traits=sets?.traits?.[a.traitSetId],path=sets?.paths?.[a.researchPathId];
      if(!ref||!pair||!traits||!path||sets.sourceMetadataSha256!==metadata||sets.sourceGraphSha256!==data.sourceGraphSha256||ref.pairId!==a.id||ref.pathId!==a.researchPathId||ref.traitId!==a.traitSetId||ref.actionHash!==r.hash||ref.stateHash!==data.routes[a.routeId].canonicalStateHash||!validVector(ref.current)||!validVector(ref.cap)||!ref.current.every((v,i)=>v===r.current[i])||!ref.cap.every((v,i)=>v===r.cap[i])||!ref.goals?.length||!pair.routes.includes(r.id)||pair.origin!==r.origin||pair.branch!==r.branch||pair.body!==r.body){errors.push('연구경로 완결 근거 불일치: '+a.routeId);continue;}
      rows.push({...r,complete:strict,modelComplete:strict,researchLineWitness:true,finalCareerStatus:strict?'FINAL_CLOSED':completion.finalCareerAdmission?.witnesses?.[r.id]?.status||'RESEARCH_LINE_EXPLORATION',actualGameCertified:false,completionId:a.id,completionProofKind:a.proofKind,researchPathId:a.researchPathId,traitCounts:traits,researchTraitPair:ref,globalOptimal:false,alternatives:a.alternatives||[],terminalGoals:ref.goals});
      continue;
     }
     if(!p||p.researchPathId!==a.researchPathId||p.actionHash!==r.hash||p.sourceMetadataSha256!==metadata){errors.push('완결 경로 근거 불일치: '+a.routeId);continue;}
     rows.push({...r,complete:true,completionId:a.id,completionProofKind:a.proofKind,
      researchPathId:a.researchPathId,traitCounts:p.traitCounts,globalOptimal:a.globalOptimal===true,
      alternatives:a.alternatives||[],traitHistory:p.traitHistory||null});
    }
   }catch(e){errors.push(source.label+' 완결 경로 미연결: '+e.message)}
  }
  return {rows,errors,completion};
 })();
 projectionCache.set(modern,{...(cached?.registry===registry?cached:{}),registry,[cacheKey]:promise});
 return promise;
}
// Explicit reference mode only: never used to populate the complete table.
const explorationCache=new WeakMap();
export async function loadExplorationRows(modern,registry){
 if(modern?.meta?.mod?.version!=='v.o2')throw Error('2.1 병종 자료가 아닙니다');
 if(explorationCache.get(modern)?.registry===registry)return explorationCache.get(modern).promise;
 const metadata=modern.meta.source.metadataSha256;
 const promise=(async()=>{const rows=[],errors=[];
  for(const source of ledgers){try{
   let data=source.registryKey&&registry?.sourceMetadataSha256===metadata?registry[source.registryKey]:null;
   if(!data){const res=await fetch(new URL('./data/'+source.file+'.json.gz',import.meta.url));if(!res.ok)throw Error('HTTP '+res.status);if(typeof DecompressionStream==='undefined')throw Error('gzip 지원 브라우저 필요');data=await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).json();}
   const p=project(source,data,metadata);
   const sets=registry?.careerCompletion?.researchTraitSets;
   if(source.key==='missingbirth'&&sets?.sourceMetadataSha256===metadata&&sets.sourceGraphSha256===data.sourceGraphSha256){
    for(const r of p.rows){const ref=sets.records[r.id],trait=sets.traits[ref?.traitId];if(ref?.actionHash===r.hash&&trait){r.traitCounts=trait;r.researchTraitPair=ref;}}
   }
   rows.push(...p.rows);if(p.rejected.length)errors.push(source.label+' '+p.rejected.length+'행 제외');
  }catch(e){errors.push(source.label+' 미연결: '+e.message);}}
  // Browser exploration includes the other worker's conditional paths in this same table.
  // Offline canonical admission builders do not consume unadmitted projections.
  if(typeof window!=='undefined'){try{rows.push(...await loadOvercapRows(modern));}catch(e){errors.push('성장캡 초과 육성 원장 미연결: '+e.message);}}
  return {rows,errors};
 })();
 explorationCache.set(modern,{registry,promise});return promise;
}
export function completionSummaryText(completion){
 const s=completion?.summary;if(!s)return '완결 판정 자료 미연결';
 const f=n=>Number.isSafeInteger(n)?n.toLocaleString('ko-KR'):'미확정';
 const final=completion.finalCareerAdmission;
 if(!['ATLAS_CAREER_SUCCESSOR_CLOSURE_V2','ATLAS_CAREER_BODY_SCOPE_CLOSURE_V3'].includes(final?.schema))return '최종 육성 종결 판정 자료 미연결 · 이전 연구 도달 수치는 완결 조합 아님';
 return (final.schema==='ATLAS_CAREER_BODY_SCOPE_CLOSURE_V3'?'병종 유지·성장캡 복원 조건부 최종 완결 조합 ':'최종 완결 조합 ')+f(s.completeCombinations)+'개 (일반 '+f(s.completeCombinations-(s.finalCareer?.byFinalBody?.STR_SOLDIER_CHORT||0))+' / 코르트 '+f(s.finalCareer?.byFinalBody?.STR_SOLDIER_CHORT||0)+') · 최종 연구 도달 탐색 조합 '+f(s.researchLineCombinations)+'개 (최종 행 제외) · 종결 증명된 출생처 '+f(s.completeOrigins)+'/'+f(s.origins)+' · 미완결 고유 탐색 근거 '+f(s.unresolvedEvidence)+'개 · 실제 게임 인증 '+f(s.actualGameCombinations??0)+'개 · '+CAREER_STAT_POLICY.label+' 기준 · 전체 탐색 공간 미확정';
}
export function exactCareerUrl(r){
 return 'soldiers/modern/?'+new URLSearchParams({group:'routes',routeStatus:r.complete?'complete':'all',maxView:'all',origin:r.origin,body:r.body,branch:r.branch,q:r.id})+'#originMaxima';
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
  (f.difficulty===''||f.difficulty==null||r.difficulties.includes(Number(f.difficulty)))&&(!f.certified||(r.complete?r.globalOptimal===true:r.certified)));
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
export function routeUrl(r){if(r.overcapEvidence)return 'soldiers/modern/?'+new URLSearchParams({group:'routes',routeStatus:'conditional',careerClass:'all',origin:r.origin,body:r.body,q:r.id})+'#originMaxima';if(r.birthEvidence)return 'soldiers/modern/?'+new URLSearchParams({group:'routes',routeStatus:'all',maxView:'all',origin:r.origin,branch:r.branch,populationRoute:r.id})+'#originMaxima';return 'soldiers/modern/?'+new URLSearchParams({profile:r.origin,branch:r.branch,populationRoute:r.rootRoute||r.id})+'#originDetails';}
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
