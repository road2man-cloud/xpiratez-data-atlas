// Read-only, source-first Soldier DB. No local-save input or custom planner.
import {loadRuntime} from '../../db-runtime.js';
import {loadBranchSoldierResults,buildOriginGrowthIndex,buildBodyGrowthIndex,registryCoverage} from '../../branch-soldier-catalog.js?v=20261125-pop-extended-1';
import {evidenceLabel} from '../../branch-soldier-maxima.js';
import {mergeAllOriginRows,mergeOriginExtensionRows,allOriginCoverageText,originCapButton,renderAllOriginCap,renderOriginExtension} from '../../branch-soldier-origin-cap.js?v=20261124-origin-extension-1';
import {populationCoverageText,populationOriginMarkup,populationUnlockOriginMarkup,populationEventOriginMarkup,populationPreboundOriginMarkup} from '../../branch-soldier-population.js?v=20261125-pop-extended-2';
import {inflateArchivedGzip} from './origin-gzip-compat.js?v=20261105-legacy-gzip-1';
import {renderResearchRelations,researchRelations} from '../../research-relations.js';
import {replayOriginWitness,WITNESS_STATS} from './origin-witness.js?v=20261105-campaign-context-1';
import {auditOriginCampaignContext,candidateMatchesCampaign} from './origin-campaign-context.js?v=20261105-campaign-context-1';
import {researchBranchEvidence} from './origin-branch-evidence.js';
import {DISPLAY_STATS,displayTotal,projectBirthStats,projectCandidateStats} from './score-12.js';
import {projectCandidateGrowthLimit} from './score-growth-12.js';
import {educationBranchReport,auditCandidateFutureChoices} from './education-endgame.js?v=20261107-endgame-choice-1';
import {preferredOriginCandidate,routeTieEvidence,sameRouteStatVector,transformationCount,excludedTrainingCount} from './origin-route-tiebreak.js?v=20261106-vector-audit-4';
import {SHARED_TERMINALS,originRankingCandidates,sharedTerminalCandidates,sharedTerminalSourceAudit} from './shared-terminal-targets.js?v=20261106-chort-separated-1';
import {renderAcquisitionPaths} from './acquisition-paths.js?v=20261105-compact-supply-1';
import {buildAcquisitionTree,buildAcquisitionSubtree,renderAcquisitionTree} from './acquisition-condition-tree.js?v=20261105-compact-supply-1';
import {mountAcquisitionTechViewer} from './acquisition-tech-view.js?v=20261125-origin-joint-suffix-1520';
import {routeCandidate,routeNumbers,routeDifference,routeEvidence,routeOnly} from './route-table-compare.js';
import {newbornDistribution,newbornPairChance,newbornTailChance,newbornRawPairs} from './birth-rng-math.js';
import {conditionBirthPairs} from './birth-selection.js';
import {trainingOrderEvidence} from './training-order-evidence.js';
import {conditionalGrowthProjection} from './conditional-growth-math.js';
import {registeredRouteDistribution} from './route-roll-math.js';
import {rankGrowthPlacements} from './route-growth-placement.js';
import {enumerateRouteBirthFloors} from './route-birth-screen-frontier.js';
import {renderBirthFloorForm,renderBirthFloorResult} from './route-birth-screen-view.js';
import {candidateRollSummary,rankCandidateRollSummaries} from './route-candidate-expectation.js';
import {auditInitialChoiceEvidence,renderInitialChoiceEvidence} from './origin-start-choice-evidence.js?v=20261104-flat-research-1';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>n==null?'—':Number(n).toLocaleString('ko-KR');
const fmtMean=n=>n==null?'—':Number(n).toLocaleString('ko-KR',{maximumFractionDigits:2});
const fmtPct=p=>Number(p*100).toLocaleString('ko-KR',{maximumFractionDigits:2})+'%';
const fmtSmallChance=p=>p===0?'0%':p>0&&p<0.0001?(p*100).toExponential(2)+'%':fmtPct(p);
const sha=async x=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(x))))].map(n=>n.toString(16).padStart(2,'0')).join('');
async function expandOriginArchive(envelope){
  if(envelope?.format!=='xpz-origin-report-gzip-v2')return envelope;
  if(envelope.compression!=='gzip'||envelope.encoding!=='base64'||
    typeof envelope.payload!=='string')
    throw Error('병종 경로 압축 원본을 읽을 수 없음');
  const zipped=Uint8Array.from(atob(envelope.payload),s=>s.charCodeAt(0));
  const bytes=await inflateArchivedGzip(zipped);
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
    .map(n=>n.toString(16).padStart(2,'0')).join('');
  if(bytes.byteLength!==envelope.byteLength||hash!==envelope.sha256)
    throw Error('병종 경로 압축 원본 무결성 검증 실패');
  const report=JSON.parse(new TextDecoder().decode(bytes));
  if(report?.kind!=='origin-provisional-witnesses')
    throw Error('병종 경로 압축 원본 종류 불일치');
  return report;
}
let DATA,REPORT,CATALOG,DIAGNOSTICS,PRUNING,DEPENDENCIES,ITERATIVE,selected=null,replayGeneration=0,blocked=false;
let comparison=null;
let sharedRegistry=null,integratedOrigins=new Map(),integratedLoadError=null,integratedCoverage=null,bodyRows=[],bodySort='total';
const activeBranch=new URLSearchParams(location.search).get('branch');
let branchScope=null;

function integratedRouteLink(row,label,route=row.route){
  const w=sharedRegistry?.witnesses?.[route];
  if(w?.source==='POPEXT12'){
    const u=new URL(location.href);u.searchParams.set('profile',w.originProfile);u.searchParams.set('populationRoute',route);if(activeBranch)u.searchParams.set('branch',activeBranch);u.hash='originDetails';
    return '<a href="'+esc(u.href)+'">'+esc(label)+'</a>';
  }
  if(['ORIGINCAP12','ORIGINEXT12'].includes(w?.source))return originCapButton(route,label);
  return '<a href="#integratedCaps" data-integrated-cap-body="'+esc(row.combo)+'" data-integrated-cap-route="'+esc(route)+'">'+esc(label)+'</a>';
}
let activeCandidateId=null,candidateScanGeneration=0,candidateScanCache=null;
const verified=new Map(),routeRollCache=new Map(),traceHistory=[];
const candidateBirthSelections=new Map(),birthFloorPrefs=new Map();
let activeTraceViewer=null,activeBirthViewer=null;
function renderTraceStep(){
  const active=traceHistory.at(-1);
  if(!active||!DATA)return;
  const label=name(active.id);
  $('#acquisitionTraceTitle').textContent=label&&label!==active.id?label:
    (active.kind==='research'?'선택한 연구의 획득 조건':'선택한 획득 경로');
  activeTraceViewer?.dispose();
  activeTraceViewer=mountAcquisitionTechViewer($('#acquisitionTraceContent'),{
    data:DATA,kind:active.kind,id:active.id,offset:active.offset,name,
    onNavigate:steps=>{
      $('#acquisitionTraceBack').disabled=steps.length<2&&traceHistory.length<2;
    }
  });
  $('#acquisitionTraceBack').disabled=traceHistory.length<2;
  $('#acquisitionTraceDialog').scrollTop=0;
}
function openTraceStep(kind,id,offset=0){
  if(!DATA||!id)return;
  const dialog=$('#acquisitionTraceDialog');
  // Open one trace dialog instead of stacking it above the research details.
  if($('#researchDialog').open)$('#researchDialog').close();
  if(!dialog.open){traceHistory.length=0;dialog.showModal();}
  traceHistory.push({kind,id,offset:Number(offset)||0});
  renderTraceStep();
}
function previousTraceStep(){
  if(activeTraceViewer?.back())return;
  if(traceHistory.length<2)return;
  traceHistory.pop();renderTraceStep();
}
const name=id=>CATALOG?.names[id]||DATA?.transformations.find(t=>t.id===id)?.koName||id;
const node=id=>'<button type="button" class="research-node" data-research-node="'+esc(id)+'">'+esc(name(id))+'</button>';
const score=(c,metric='growth')=>!c?-1:(metric==='growth'?(c.growth?.kind==='conditional-upper-envelope'?c.growth.total:-1):c.display.total);
const statVector=(c,metric='growth')=>metric==='growth'?(c?.growth?.kind==='conditional-upper-envelope'?c.growth.stats:null):c?.display?.stats;
const prefer=(win,c,metric='growth')=>preferredOriginCandidate(win,c,x=>score(x,metric),metric);
const allCompatible=r=>r.candidates.filter(c=>candidateMatchesCampaign(c));
const comparable=r=>originRankingCandidates(r,candidateMatchesCampaign);
const chortCandidates=r=>sharedTerminalCandidates(r,candidateMatchesCampaign);
const best=(r,metric='growth')=>comparable(r).reduce((winner,c)=>
  preferredOriginCandidate(winner,c,x=>score(x,metric),metric),null);
function renderSharedTerminalCatalog(){
  const host=$('#chortTarget'),audit=sharedTerminalSourceAudit(DATA);
  if(audit.transformId!==SHARED_TERMINALS[0].transformId||
    audit.bodyId!==SHARED_TERMINALS[0].bodyId)
    throw Error('코르트 공통 변신 원본 규칙 불일치');
  const t=audit.rule,examples=REPORT.records.map(record=>{
    const paths=chortCandidates(record);
    const bestPath=paths.reduce((win,c)=>prefer(win,c),null);
    return bestPath?{record,path:bestPath,count:paths.length}:null;
  }).filter(Boolean).sort((a,b)=>score(b.path)-score(a.path));
  const typeCount=id=>audit.origins.filter(p=>p.soldierType===id).length;
  const sourceStatus=p=>p.initialPsiStatus==='meets'?'출생 시 충족':
    p.initialPsiStatus==='depends'?'개체별 확인':'훈련 후 확인';
  host.innerHTML='<div class="terminal-head"><div><p class="eyebrow">독립 병종 · 공통 변신 목표</p>'+
    '<h2>코르트 <small>STR_SOLDIER_CHORT</small></h2>'+
    '<p>여러 출생 병종이 코르트로 변경될 수 있습니다. 코르트 성장 상한은 출생처 순위에 합산하지 않습니다.</p></div>'+
    '<span class="terminal-type-label">변신 전용</span></div>'+
    '<div class="terminal-facts">'+
      '<div><strong>'+audit.types.length+'</strong><small>허용 출발 병종</small></div>'+
      '<div><strong>'+audit.origins.length+'</strong><small>등록 출생처</small></div>'+
      '<div><strong>'+audit.fixedPsi+'</strong><small>출생 시 Psi 충족</small></div>'+
      '<div><strong>'+audit.variablePsi+'</strong><small>Psi 개체별 확인</small></div>'+
    '</div>'+
    (PRUNING?.findings?.some(x=>x.target==='chort')?'<p class="terminal-pruning-note" data-pruning-global="chort">등록 후보의 연구 순서를 보존한 채 사전 훈련을 생략해도 <strong>같은 조건부 12종 상한</strong>이 계산되는 경로를 원본 규칙으로 재생했습니다. 각 출생처 상세의 훈련 생략 검증에서 확인하세요.</p>':'')+
    '<p class="terminal-gate"><strong>코르트 구속</strong> · 계급 '+fmt(t.minRank)+' 이상 · Psi 강도 '+
      fmt(audit.threshold)+' 이상 · '+Object.entries(t.requiredItems||{}).map(([id,q])=>
        esc(name(id))+' '+fmt(q)+'개').join(' · ')+
      ' · 비용 '+fmt(t.cost)+' · 기지 기능 '+(t.requiresBaseFunc||[]).map(esc).join(', ')+'</p>'+
    '<div class="terminal-links">'+(t.requires||[]).map(id=>
      '<button data-trace-research-root="'+esc(id)+'">코르트 구속 선행 연구 보기</button>').join('')+'</div>'+
    '<details class="terminal-source-types"><summary>허용 출발 병종 '+audit.types.length+'종</summary>'+
      '<div class="terminal-type-list">'+audit.types.map(x=>
        '<span>'+esc(x.name)+' <small>'+typeCount(x.id)+'개 출생처</small></span>').join('')+'</div>'+
    '</details>'+
    '<details class="terminal-source-origins"><summary>등록 출생처 '+audit.origins.length+
      '개 · 초기 Psi 조건</summary><div class="terminal-source-list">'+audit.origins.map(p=>
      '<div><button type="button" data-open-origin="'+esc(p.id)+'">'+esc(p.name)+'</button>'+
      '<small> Psi '+fmt(p.psiMin)+(p.psiMin!==p.psiMax?'~'+fmt(p.psiMax):'')+
      ' · '+sourceStatus(p)+'</small></div>').join('')+'</div></details>'+
    '<details class="terminal-verified-paths"><summary>연구·변신 경로 재생 후보 · 출생처 '+
      examples.length+'개</summary><div class="terminal-paths">'+examples.map(({record,path,count})=>
      '<div><strong>'+esc(record.name)+'</strong> · 조건부 성장 상한 '+
        fmt(path.growth?.total)+' · 기록 '+count+'개'+
        '<button type="button" data-open-shared-candidate="'+esc(path.id)+
        '" data-shared-origin="'+esc(record.profileId)+'">코르트 변환 경로 자세히</button></div>').join('')+
    '</div></details>';
}
function sharedTerminalOriginNote(record,profile){
  const audit=sharedTerminalSourceAudit(DATA);
  const allowed=audit.types.some(x=>x.id===profile.soldierType);
  if(!allowed)return '';
  const alternatives=chortCandidates(record),bestPath=alternatives.reduce((winner,c)=>
    prefer(winner,c),null);
  const low=profile.effectiveStats?.min?.psiStrength;
  const high=profile.effectiveStats?.max?.psiStrength;
  return '<div class="shared-terminal-origin-note" data-excluded-terminal="STR_SOLDIER_CHORT">'+
    '<strong>코르트 변신은 별도 병종으로 비교합니다.</strong>'+
    '<p>현재 출생 병종 '+esc(record.soldierName)+
    '은 코르트 구속이 허용한 병종입니다. 초기 Psi 강도 '+fmt(low)+
    (high!==low?'~'+fmt(high):'')+' · 요구 '+fmt(audit.threshold)+'.'+
    (bestPath?' 이 출생처의 코르트 변환 재생 후보는 조건부 성장 상한 '+
      fmt(bestPath.growth?.total)+'이지만 위 순위에는 포함하지 않습니다.':
      ' 코르트 도달 경로의 개별 재생은 아직 별도로 인증되지 않았습니다.')+
    '</p><a href="#chortTarget">코르트 병종·출발형 보기</a></div>';
}
function sourceFail(message){
  blocked=true;$('#originMaxima').dataset.validation='rejected';
  $('#catalogStatus').textContent='자료 검증 실패 · 잠정/확정 수치 표시 중단: '+message;
  $('#originTable tbody').innerHTML='';$('#originDetails').hidden=true;
  $('#catalogSummary').innerHTML='<p class="failure">원본과 경로 자료가 일치하지 않습니다. 이전 버전이나 과거 점수로 대체하지 않습니다.</p>';
}
async function validate(){
  if(DATA.meta.mod.version!=='v.o2'||REPORT.sourceVersion!=='v.o2'||CATALOG.sourceVersion!=='v.o2')throw Error('원본 버전 불일치');
  if(JSON.stringify(DATA.meta.source.rules)!==JSON.stringify(REPORT.sourceHashes)||JSON.stringify(DATA.meta.source.rules)!==JSON.stringify(CATALOG.sourceHashes))throw Error('원본 파일 해시 불일치');
  if(REPORT.records.length!==72||new Set(REPORT.records.map(r=>r.profileId)).size!==72)throw Error('출생처 72개 정합성 실패');
  const originSources=REPORT.records.map(r=>r.sourceProof).sort((a,b)=>a.id.localeCompare(b.id,'en'));
  const digest=await sha({rules:DATA.meta.source.rules,profiles:DATA.profiles,soldiers:DATA.soldiers,bonuses:DATA.bonuses,transforms:DATA.transformations,research:DATA.researchRules,missionResearch:DATA.missionResearchSources||{},itemIds:CATALOG.itemIds,originSources});
  if(digest!==REPORT.sourceHash)throw Error('현재 능력치·연구·출생·표본 색인 해시 불일치');
  for(const record of REPORT.records){
    if(!DATA.profiles.some(p=>p.id===record.profileId)||record.certifiedMaximum!==false)throw Error('출생처 병합 또는 근거 없는 최종 인증');
    for(const c of [...record.candidates,...(record.rejectedCandidates||[])]){
      if(c.profileId!==record.profileId||c.certifiedMaximum||!c.researchSequenceComplete||!c.startsWithNoResearch)throw Error('불완전 경로를 완료로 표시함');
      if(c.total!==WITNESS_STATS.reduce((s,k)=>s+c.stats[k],0))throw Error('잠정 11종 합계 불일치');
      if(c.resultHash!==await sha({steps:c.steps,raw:c.raw,stats:c.stats,total:c.total,branches:c.branchChoices}))throw Error('등록 결과 지문 불일치');
      for(const choice of c.branchChoices)for(const e of choice.excludes){
        if(!DATA.researchRules[choice.id]?.disables.includes(e.id))throw Error('원본에 없는 연구 배제');
        const expected=choice.id===e.id?'self':DATA.researchRules[e.id]?.disables.includes(choice.id)?'bidirectional':'oneway';
        if(expected!==e.direction)throw Error('배제 방향 변조');
      }
    }
    if(record.bestCandidateId&&!record.candidates.some(c=>c.id===record.bestCandidateId))throw Error('최고 후보 참조 누락');
    if(!record.candidates.length&&(!Array.isArray(record.researchBottlenecks)||!record.researchBottlenecks.length))
      throw Error('미해결 출생처에 연구 병목 근거 없음');
    for(const gap of record.researchBottlenecks||[])
      if(!gap.id||!gap.kind||!gap.reason)throw Error('미해결 연구 병목 자료 훼손');
    if(record.researchBottlenecks?.length&&record.bottleneckHash!==
      await sha({profileId:record.profileId,unresolved:record.unresolved,gates:record.researchBottlenecks}))
      throw Error('미해결 연구 병목 근거 지문 불일치');
  }
  DATA.sourceItemIds=new Set(CATALOG.itemIds);DATA.originRows=REPORT.records.map(r=>r.sourceProof);
  for(const record of REPORT.records){
    // Entire entry distribution is recomputed from actual Soldier RNG rules;
    // no random-effect expectation is inferred from a growth upper envelope.
    newbornDistribution(DATA,record.profileId);
    record.displayBirth=projectBirthStats(record,DATA.profiles.find(p=>p.id===record.profileId));
    for(const c of record.candidates){
      const context=auditOriginCampaignContext(c.steps,DATA);
      if(!c.campaignContext||JSON.stringify(context)!==JSON.stringify(c.campaignContext))
        throw Error('캠페인 난이도 공동 조건의 감사 근거 불일치: '+c.id);
      if(context.kind!=='compatible')throw Error('비교 후보에 난이도 충돌 기록이 섞임: '+c.id);
      c.campaignContext=context;
      c.display=projectCandidateStats(record,c,DATA);
      c.growth=projectCandidateGrowthLimit(record,c,DATA);
      c.futureOptions=auditCandidateFutureChoices(DATA,c);
      if(c.futureOptions.kind!=='structural-only')
        throw Error('최종 병종 후속 선택지 감사 불가: '+c.id);
      if(c.growth.kind==='conditional-upper-envelope'&&c.growth.total<c.display.total)
        throw Error('성장 상한이 시술 후 수치보다 낮음: '+c.id);
    }
    for(const c of record.rejectedCandidates||[]){
      const context=auditOriginCampaignContext(c.steps,DATA);
      if(context.kind==='compatible'||JSON.stringify(context)!==JSON.stringify(c.campaignContext))
        throw Error('제외 후보의 난이도 반례 근거 불일치: '+c.id);
    }
  }
  if(PRUNING?.kind!=='soldier-route-pruning-proof-v1'||PRUNING.sourceHash!==REPORT.sourceHash||
    PRUNING.sourceVersion!==REPORT.sourceVersion||
    PRUNING.stats.valid!==PRUNING.findings.length)
    throw Error('훈련 생략 감사 파일이 현재 원본 연구 기록과 불일치');
  for(const claim of PRUNING.findings){
    const record=REPORT.records.find(r=>r.profileId===claim.id);
    const source=record?.candidates.find(c=>c.id===claim.sourceCandidate);
    const at=claim.removedStepIndex;
    if(!source||!Number.isInteger(at)||source.steps[at]?.type!=='transform'||
      source.steps[at].transform!==claim.removed||
      (claim.target==='chort')!==(source.finalSoldierType==='STR_SOLDIER_CHORT'))
      throw Error('훈련 생략 감사의 출발 후보가 원본과 다름');
    const steps=source.steps.filter((_,i)=>i!==at);
    const transforms=steps.filter(s=>s.type==='transform').map(s=>s.transform);
    const reduced={...source,steps,transforms};
    reduced.growth=projectCandidateGrowthLimit(record,reduced,DATA);
    if(JSON.stringify(transforms)!==JSON.stringify(claim.proposedTransforms)||
      JSON.stringify(source.transforms)!==JSON.stringify(claim.priorTransforms)||
      reduced.growth.finalSoldierType!==source.finalSoldierType||
      reduced.growth.total!==claim.originalGrowth||!sameRouteStatVector(reduced,source))
      throw Error('훈련 생략 후 12종 성장 상한 또는 최종 병종이 바뀜');
  }
  if(DEPENDENCIES?.kind!=='soldier-route-dependency-pruning-v1'||
    DEPENDENCIES.sourceHash!==REPORT.sourceHash||
    DEPENDENCIES.sourceVersion!==REPORT.sourceVersion||
    DEPENDENCIES.priorAuditHash!==await sha(PRUNING)||
    DEPENDENCIES.stats.claims!==PRUNING.findings.length||
    DEPENDENCIES.findings.length!==PRUNING.findings.length)
    throw Error('연구·재료 단축 검증이 최신 훈련 생략 자료와 불일치');
  const stepResearchId=s=>s?.type==='research'||s?.type==='repeatResearch'?s.id:
    ['eventResearch','missionResearch','freeResearch'].includes(s?.type)?s.research:null;
  for(const proof of DEPENDENCIES.findings){
    const original=PRUNING.findings.find(x=>x.id===proof.id&&x.target===proof.target&&
      x.sourceCandidate===proof.sourceCandidate&&x.removedStepIndex===proof.removedStepIndex);
    const record=REPORT.records.find(r=>r.profileId===proof.id);
    const source=record?.candidates.find(c=>c.id===proof.sourceCandidate);
    const indices=proof.removedIndices;
    if(!original||!source||original.removed!==proof.removed||
      !Array.isArray(indices)||!indices.includes(proof.removedStepIndex)||
      JSON.stringify(indices)!==JSON.stringify([...new Set(indices)].sort((a,b)=>a-b))||
      indices.some(i=>!Number.isInteger(i)||i<0||i>=source.steps.length))
      throw Error('연구·재료 단축 경로의 원본 단계 무결성 오류');
    const dropped=indices.filter(i=>i!==proof.removedStepIndex);
    const removedResearch=dropped.filter(i=>stepResearchId(source.steps[i]));
    const removedInputs=dropped.filter(i=>source.steps[i].type==='externalInputs');
    if(JSON.stringify(removedResearch)!==JSON.stringify(proof.removedResearch.map(x=>x.stepIndex))||
      JSON.stringify(removedInputs)!==JSON.stringify(proof.removedInputs.map(x=>x.stepIndex))||
      proof.removedResearch.some(x=>x.id!==stepResearchId(source.steps[x.stepIndex]))||
      proof.removedInputs.some(x=>JSON.stringify(x.items)!==
        JSON.stringify(source.steps[x.stepIndex].items||{})))
      throw Error('연구·재료 생략 항목과 원본의 종류·수량이 불일치');
    const steps=source.steps.filter((_,i)=>!indices.includes(i));
    const transforms=steps.filter(s=>s.type==='transform').map(s=>s.transform);
    const proposed={...source,steps,transforms};
    proposed.growth=projectCandidateGrowthLimit(record,proposed,DATA);
    if(await sha(source.steps)!==proof.originalStepsHash||
      await sha(steps)!==proof.reducedStepsHash||
      !sameRouteStatVector(proposed,source)||
      proposed.growth.finalSoldierType!==source.finalSoldierType||
      proposed.growth.total!==proof.conditionalCeiling||
      proof.remainingTransforms!==transforms.length)
      throw Error('연구·재료 생략 이후 출생처 최종 성장상한·해시 불일치');
  }
  if(DEPENDENCIES.stats.withResearchRemoved!==
    DEPENDENCIES.findings.filter(x=>x.removedResearch.length).length||
    DEPENDENCIES.stats.withInputAssumptionsRemoved!==
    DEPENDENCIES.findings.filter(x=>x.removedInputs.length).length)
    throw Error('연구·재료 단축 집계 오류');
  if(ITERATIVE?.kind!=='soldier-route-iterative-pruning-v1'||
    ITERATIVE.sourceHash!==REPORT.sourceHash||
    ITERATIVE.sourceVersion!==REPORT.sourceVersion||
    ITERATIVE.priorAuditHash!==await sha(DEPENDENCIES)||
    ITERATIVE.stats.priorClaims!==DEPENDENCIES.findings.length||
    ITERATIVE.stats.secondTransformValidated!==ITERATIVE.findings.length||
    ITERATIVE.stats.thirdTransformValidated!==ITERATIVE.third.length)
    throw Error('추가 2단계 훈련 생략 감사가 최신 원본과 불일치');
  for(const proof of ITERATIVE.findings){
    const record=REPORT.records.find(r=>r.profileId===proof.profileId);
    const source=record?.candidates.find(c=>c.id===proof.sourceCandidate);
    const first=DEPENDENCIES.findings.find(x=>x.id===proof.profileId&&
      x.sourceCandidate===proof.sourceCandidate&&x.target===proof.target&&
      x.removedStepIndex===proof.firstTransformIndex);
    const indices=proof.removedIndices;
    if(!source||!first||first.removed!==proof.firstTransform||
      !Array.isArray(indices)||!indices.includes(proof.secondTransformIndex)||
      source.steps[proof.secondTransformIndex]?.type!=='transform'||
      source.steps[proof.secondTransformIndex].transform!==proof.secondTransform||
      JSON.stringify(indices)!==JSON.stringify([...new Set(indices)].sort((a,b)=>a-b))||
      !first.removedIndices.every(i=>indices.includes(i))||
      indices.some(i=>!Number.isInteger(i)||i<0||i>=source.steps.length)||
      proof.certifiedMaximum!==false)
      throw Error('추가 훈련 생략의 출발 후보 또는 단계 인덱스 무결성 오류');
    const extra=indices.filter(i=>!first.removedIndices.includes(i));
    const research=extra.filter(i=>stepResearchId(source.steps[i]));
    const inputs=extra.filter(i=>source.steps[i].type==='externalInputs');
    if(JSON.stringify(extra)!==JSON.stringify(proof.newRemovedIndices)||
      JSON.stringify(research)!==JSON.stringify(proof.newResearch.map(x=>x.index))||
      JSON.stringify(inputs)!==JSON.stringify(proof.newInputs.map(x=>x.index))||
      proof.newResearch.some(x=>x.researchId!==stepResearchId(source.steps[x.index]))||
      proof.newInputs.some(x=>JSON.stringify(x.items)!==
        JSON.stringify(source.steps[x.index].items||{})))
      throw Error('연속 훈련 생략의 연구·자원 단계 기록이 원본과 불일치');
    const steps=source.steps.filter((_,i)=>!indices.includes(i));
    const transforms=steps.filter(s=>s.type==='transform').map(s=>s.transform);
    const proposed={...source,steps,transforms};
    proposed.growth=projectCandidateGrowthLimit(record,proposed,DATA);
    if(await sha(source.steps)!==proof.originalStepsHash||
      await sha(steps)!==proof.reducedStepsHash||
      JSON.stringify(transforms)!==JSON.stringify(proof.remainingTransforms)||
      !sameRouteStatVector(proposed,source)||
      proposed.growth.finalSoldierType!==source.finalSoldierType||
      proposed.growth.total!==proof.conditionalCeiling)
      throw Error('연속 훈련 생략의 12종 상한·최종 병종·해시 불일치');
  }
  if(ITERATIVE.stats.withNewResearchRemoved!==
    ITERATIVE.findings.filter(x=>x.newResearch.length).length||
    ITERATIVE.stats.withNewInputRemoved!==
    ITERATIVE.findings.filter(x=>x.newInputs.length).length)
    throw Error('연속 훈련 생략 감사 집계 오류');
  if(REPORT.campaignContextAuditVersion!==1||
    REPORT.summary.withCompatibleResearch!==REPORT.records.filter(r=>allCompatible(r).length).length||
    REPORT.summary.compatibleWitnesses!==REPORT.records.reduce((sum,r)=>sum+allCompatible(r).length,0))
    throw Error('난이도 공동조건 감사 요약 불일치');
  // The public readiness marker is set only after asynchronous registry loading and rendering.
}
function growthScheduleFor(candidate){
  const timing=$('#routeGrowthTiming')?.value||'none';
  if(timing==='none')return {key:'none',schedule:[]};
  if(timing!=='before'&&timing!=='after')return {key:'invalid',reason:'성장 시점 선택 오류'};
  const attempts=Number($('#routeGrowthAttempts')?.value);
  const success=Number($('#routeGrowthSuccess')?.value);
  if(!Number.isSafeInteger(attempts)||attempts<0||attempts>40||
    !Number.isFinite(success)||success<0||success>100)
    return {key:'invalid',reason:'시행 0~40회 정수, 성공률 0~100%를 입력하세요'};
  const stats=Object.fromEntries(DISPLAY_STATS.map(key=>[key,{
    attempts,kernel:[[0,1-success/100],[1,success/100]]
  }]));
  return {key:timing+'|'+attempts+'|'+success,
    schedule:[{beforeTransform:timing==='before'?0:candidate.transforms.length,stats}]};
}
function routeRoll(record,candidate){
  if(!record||!candidate)return {kind:'unverified',reason:'완결 경로 선택 필요'};
  const config=growthScheduleFor(candidate);
  if(config.reason)return {kind:'unverified',reason:config.reason};
  const id=record.profileId+'|'+candidate.id+'|'+config.key;
  if(!routeRollCache.has(id)){
    routeRollCache.set(id,registeredRouteDistribution(DATA,record.profileId,candidate,
      {growthSchedule:config.schedule}));
    // Switching hypothetical growth scenarios must not retain every full
    // 12-stat probability vector indefinitely in a long-lived browser tab.
    if(routeRollCache.size>160)routeRollCache.delete(routeRollCache.keys().next().value);
  }
  return routeRollCache.get(id);
}
function viewFor(record,metric,preferredId=null){
  if(!record)return null;
  const integrated=integratedOrigins.get(record.profileId);
  if(metric==='growth'&&integrated&&!preferredId)return {record,candidate:null,stats:integrated.stats,total:integrated.total,integrated};
  if(metric==='growth'&&activeBranch)return null;
  if(metric==='birth-expected'){
    const roll=newbornDistribution(DATA,record.profileId);
    return {record,candidate:null,stats:roll.stats,total:roll.total,birthRoll:roll};
  }
  // Chort terminal and campaign-incompatible witnesses stay OUT of the
  // source-origin ranking, even when computing probabilistic expectations.
  const comparableCandidates={...record,candidates:comparable(record)};
  if(metric==='route-expected'){
    const candidate=routeCandidate(comparableCandidates,'growth',
      preferredId||best(record,'growth')?.id);
    const roll=routeRoll(record,candidate);
    return roll.kind==='conditional-route-distribution'?{
      record,candidate,stats:roll.stats,total:roll.expectedTotal,routeRoll:roll}:null;
  }
  return routeNumbers(comparableCandidates,metric,
    preferredId||best(record,metric==='growth'?'growth':'provisional')?.id,DISPLAY_STATS);
}
function baseline(metric){
  if(!comparison)return null;
  return viewFor(REPORT?.records.find(r=>r.profileId===comparison.profileId),
    metric,comparison.candidateId);
}
function setComparison(profileId,candidateId=null){
  comparison=profileId?{profileId,candidateId}:null;
  const picker=$('#compareOrigin');
  if(picker)picker.value=profileId||'';
  render();
  if(selected&&!$('#originDetails').hidden)void openOrigin(selected,activeCandidateId);
}
function compareEvidenceHtml(view,ref){
  if(!view||!ref||!view.candidate||!ref.candidate)return '';
  const left=routeEvidence(view),right=routeEvidence(ref);
  const items=ids=>ids.length?ids.map(id=>'<button type="button" data-trace-research-root="'+esc(id)+'">'+esc(name(id))+'</button>').join(' '):'차이 없음';
  const trainingSteps=ids=>ids.length?ids.map(id=>'<button type="button" data-open-training="'+esc(id)+'">'+esc(name(id))+'</button>').join(' → '):'없음';
  return '<details class="route-compare-evidence"><summary>두 경로의 연구·변신 차이 상세 보기</summary>'+
    '<p class="fine">현재 후보에만 포함된 연구와 기준 후보에만 포함된 연구를 비교합니다. 같은 연구가 있어도 시점·이벤트·자원은 다를 수 있습니다.</p>'+
    '<h4>현재 후보에만 있는 연구</h4><div>'+items(routeOnly(left.research,right.research))+'</div>'+
    '<h4>기준 후보에만 있는 연구</h4><div>'+items(routeOnly(right.research,left.research))+'</div>'+
    '<h4>현재 후보의 변신 순서</h4><p>'+trainingSteps(left.transforms)+'</p>'+
    '<h4>기준 후보의 변신 순서</h4><p>'+trainingSteps(right.transforms)+'</p>'+
    '<p class="fine">현재 후보 외부 조건 '+left.assumptions.length+'건 / 기준 '+right.assumptions.length+
    '건 · 남은 제약 '+left.limitations.length+'건 / 기준 '+right.limitations.length+'건. 연구·재료의 실제 동시 충족은 증명하지 않습니다.</p></details>';
}
function renderBodyTable(q,family){
  const rows=bodyRows.filter(r=>(!family||r.id===family)&&(!q||[r.id,r.name,...r.candidates.flatMap(c=>[c.originProfile,REPORT.records.find(x=>x.profileId===c.originProfile)?.name])].join(' ').toLocaleLowerCase('ko').includes(q)));
  const rank=r=>bodySort==='total'?(r.best?.total??-Infinity):(r.maxima[bodySort]?.value??-Infinity);
  rows.sort((a,b)=>rank(b)-rank(a)||a.name.localeCompare(b.name,'ko'));
  const short=m=>m.source==='ORIGINEXT12'?'활성 연구 후속':m.source==='CAREER12'?'고급·미재생':m.source==='UNIFIED12'?'연결 상계':'등록 상계';
  const route=(m,label)=>{
    if(m.source!=='ORIGIN')return integratedRouteLink(m,label,m.route);
    const shared=m.body==='STR_SOLDIER_CHORT';
    return '<button type="button" class="origin-open" '+(shared?'data-open-shared-candidate="'+esc(m.route)+'" data-shared-origin="'+esc(m.originProfile)+'"':'data-open-longest="'+esc(m.originProfile)+'" data-longest-candidate="'+esc(m.route)+'"')+' title="'+esc(evidenceLabel(m.source))+'">'+esc(label)+'</button>';
  };
  $('#rowCount').textContent=rows.length+' / '+bodyRows.length+'종';
  $('#compareStatus').textContent='최종 병종별 표 · 열 제목을 누르면 해당 능력치 순으로 정렬합니다. 출생처별 비교 기능은 표 구분에서 선택할 수 있습니다.';
  $('#catalogStatus').textContent='각 열은 독립 최고 후보입니다. 합계는 동일 경로 한 개의 합계이며 독립 최대값을 합산하지 않습니다. 고급·미재생은 계급·훈장·후속 시술 미실행 조건부 상계입니다. '+(activeBranch?'선택 분기 '+(branchScope?'#'+branchScope.rank:'미확인')+'에 정확히 연결된 결과만 표시합니다. ':'')+(integratedLoadError?'통합 원장 연결 실패: '+integratedLoadError:'실제 게임 달성 및 전역 최고치 미인증.');
  const sortButton=(k,label)=>'<button type="button" class="origin-open" data-body-sort="'+esc(k)+'" aria-label="'+esc(label)+' 순 정렬">'+esc(label)+(bodySort===k?' ↓':'')+'</button>';
  $('#originTable thead').innerHTML='<tr><th>최종 병종</th><th>등록 근거</th><th>'+sortButton('total','단일 경로 최고 합계')+'</th>'+DISPLAY_STATS.map(k=>'<th>'+sortButton(k,DATA.statLabels[k])+'<small>독립 최고</small></th>').join('')+'</tr>';
  $('#originTable tbody').innerHTML=rows.map(r=>'<tr data-body-id="'+esc(r.id)+'"><td><strong>'+esc(r.name)+'</strong><small>'+esc(r.id)+'</small><button type="button" class="origin-open" data-body-origins="'+esc(r.id)+'">출생처별 비교</button></td><td>'+(r.candidates.length?fmt(r.originCount)+'개 출생처 · '+fmt(r.candidates.length)+'개 등록 후보':'미계산')+'</td><td class="score">'+(r.best?route(r.best,fmt(r.best.total))+'<small>'+short(r.best)+'</small>':'—')+'</td>'+DISPLAY_STATS.map(k=>{const m=r.maxima[k];return '<td>'+(m?route(m,fmt(m.value))+'<small title="'+esc(evidenceLabel(m.source))+'">'+short(m)+'</small>':'—')+'</td>';}).join('')+'</tr>').join('')||'<tr><td colspan="15">해당 병종 없음</td></tr>';
}
function render(){
  if(blocked||!REPORT)return;
  const q=$('#search').value.toLocaleLowerCase('ko').trim(),family=$('#family').value,metric=$('#catalogMetric').value;
  const bodyMode=metric==='growth'&&$('#catalogGrouping').value==='body'&&!family.startsWith('origin:');
  $('#compareOrigin').disabled=bodyMode;$('#compareClear').disabled=bodyMode;
  const routeMode=metric==='route-expected';
  const growthTiming=$('#routeGrowthTiming')?.value||'none';
  $('#routeGrowthTimingWrap').hidden=!routeMode;
  $('#routeGrowthAttemptsWrap').hidden=!routeMode||growthTiming==='none';
  $('#routeGrowthSuccessWrap').hidden=!routeMode||growthTiming==='none';
  if(bodyMode){renderBodyTable(q,family);return;}
  const rows=REPORT.records.filter(r=>(!family||(family.startsWith('origin:')?
    r.profileId===family.slice(7):r.soldierType===family))&&(!q||
    [r.profileId,r.name,r.soldierName,
      ...Object.keys(DATA.profiles.find(p=>p.id===r.profileId)?.acquisitionRequiredItems||{}),
      ...comparable(r).flatMap(c=>c.transforms.map(name)),...(integratedOrigins.get(r.profileId)?.trainingIds||[]).flatMap(id=>[id,name(id)])]
      .join(' ').toLocaleLowerCase('ko').includes(q)));
  const rowScore=r=>metric==='route-expected'?(viewFor(r,metric)?.total??-1):
    metric==='birth-expected'?newbornDistribution(DATA,r.profileId).total:
    metric==='birth'?displayTotal(r.displayBirth):metric==='certified'?-1:
    metric==='growth'?(viewFor(r,metric)?.total??-1):score(best(r,'provisional'),'provisional');
  rows.sort((a,b)=>rowScore(b)-rowScore(a)||a.name.localeCompare(b.name,'ko'));
  $('#rowCount').textContent=rows.length+' / '+REPORT.records.length+'개 출생처';
  const ref=baseline(metric),baselineRecord=REPORT.records.find(r=>r.profileId===comparison?.profileId);
  const valueLabel=n=>metric==='birth-expected'||metric==='route-expected'?fmtMean(n):fmt(n);
  const deltaLabel=n=>n>0?'+'+valueLabel(n):valueLabel(n);
  $('#compareStatus').textContent=comparison?
    '비교 기준: '+(baselineRecord?.name||comparison.profileId)+
      (ref?' · 같은 표시 방식의 12종 합계 '+valueLabel(ref.total)+'와 각 능력치 차이 표시':' · 해당 표시 방식에 기준 수치 없음 (추정값 사용 안 함)')+
      ' · 비교 대상은 같은 병사가 아닌 출생처별 조건부 경로입니다.':
    '기준 출생처를 선택하면 모든 행에 같은 계산 방식의 차이를 표시합니다. 미완료 경로는 수치를 생성하지 않습니다.';
  $('#originTable thead').innerHTML='<tr><th>출생처 / 최초 병종</th><th>상태</th><th>12종 합계'+(comparison?' / 기준 대비':'')+'</th>'+DISPLAY_STATS.map(k=>'<th>'+esc(DATA.statLabels[k])+'</th>').join('')+'</tr>';
  $('#originTable tbody').innerHTML=rows.map(r=>{
    const preferred=r.profileId===comparison?.profileId?comparison.candidateId:null;
    const view=viewFor(r,metric,preferred);
    const integrated=view?.integrated;
    const c=metric==='birth-expected'||integrated||(activeBranch&&metric==='growth')?null:view?.candidate||routeCandidate(
      {...r,candidates:comparable(r)},metric==='route-expected'?'growth':metric,preferred);
    const diff=Boolean(view?.integrated)===Boolean(ref?.integrated)?routeDifference(view,ref,DISPLAY_STATS):null;
    const odds=view?.birthRoll&&ref?.birthRoll?newbornPairChance(view.birthRoll,ref.birthRoll):
      view?.routeRoll&&ref?.routeRoll?newbornPairChance(view.routeRoll,ref.routeRoll):null;
    const scoreCell=view?'<strong>'+valueLabel(view.total)+'</strong>'+
      (diff?'<small class="route-delta '+(diff.total>0?'positive':diff.total<0?'negative':'')+'">기준 대비 '+deltaLabel(diff.total)+'</small>':'')+
      (odds?'<small class="birth-win-chance">'+(metric==='route-expected'?'조건부 독립 추첨 우세 ':'독립 추첨 우세 ')+fmtPct(odds.win)+' · 동률 '+fmtPct(odds.tie)+'</small>':'')+
      (view.routeRoll?'<small>능력치 요구 통과 '+fmtPct(Math.min(1,view.routeRoll.statGateProbability))+'</small>':''):'—';
    const longest=comparable(r).reduce((winner,x)=>
      !winner||x.transforms.length>winner.transforms.length?x:winner,null);
    // The highest scoring path is not necessarily the longest witnessed route.
    // Show both without claiming the longer path is optimal or campaign-certified.
    const depth=longest?.transforms.length||0;
    const depthNote=integrated?'<small data-integrated-max-depth="'+integrated.longestSteps+'">등록 후보 내 최장 '+integrated.longestSteps+'단계 · '+fmt(integrated.representativeCount)+'개 대표 경로</small>'+integratedRouteLink(integrated,'최장 '+integrated.longestSteps+'단계 상계 보기',integrated.longestRoute):depth>4?
      '<small data-replayed-max-depth="'+depth+'">조건부 경로 최장 '+depth+
      '개 시술 · 완주 미인증</small><button type="button" data-open-longest="'+
      esc(r.profileId)+'" data-longest-candidate="'+esc(longest.id)+'">최장 '+
      depth+'단계 경로 확인</button>':'';
    const terminal=chortCandidates(r).reduce((winner,x)=>preferredOriginCandidate(winner,x,score),null);
    const ties=(metric==='growth'||metric==='provisional')&&c?
      routeTieEvidence(comparable(r),c,x=>score(x,metric),metric):null;
    const tieNote=ties?.equalTotal.length>1?
      '<small class="origin-route-tie" data-route-tie="true">상한 합계 동점 '+ties.equalTotal.length+
      '경로 · 최종 병종·12종 동일 '+ties.sameVector.length+' / 능력치·병종 다름 '+ties.differentVector.length+'</small>':'';
    const sourceProfile=DATA.profiles.find(p=>p.id===r.profileId);
    const educationChoices=educationBranchReport(DATA,sourceProfile,comparable(r));
    const applicableEducation=educationChoices.filter(x=>x.available);
    const educationWitnesses=applicableEducation.filter(x=>x.candidateCount>0).length;
    const educationCoverage=applicableEducation.length?
      '<small class="origin-education-coverage" data-education-witnessed="'+educationWitnesses+"/"+
      applicableEducation.length+'">교육별 경로 검증 '+educationWitnesses+'/'+applicableEducation.length+
      ' · 누락 경로는 불가능 판정 아님</small>':'';
    const cell=k=>'<td>'+valueLabel(view?.stats[k])+(diff?'<small class="route-delta '+(diff.stats[k]>0?'positive':diff.stats[k]<0?'negative':'')+'">'+deltaLabel(diff.stats[k])+'</small>':'')+'</td>';
    return '<tr data-origin-id="'+esc(r.profileId)+'" data-proof="'+r.status+'"'+(r.profileId===comparison?.profileId?' data-reference="true"':'')+'><td>'+(integrated?integratedRouteLink(integrated,r.name)+'<small><button type="button" data-open-origin="'+esc(r.profileId)+'">기존 출생·연구 기록</button></small>':'<button class="origin-open" data-open-origin="'+esc(r.profileId)+'">'+esc(r.name)+'</button>')+'<small>'+esc(r.soldierName)+'</small>'+
      (terminal?'<small class="origin-terminal-tag">코르트 변환 상한 '+fmt(terminal.growth?.total)+' · 기본 비교 제외</small>':'')+
      tieNote+educationCoverage+'<small class="id">'+esc(r.profileId)+'</small>'+
      '<small class="mobile-proof">'+(metric==='growth'?'성장상한':metric==='provisional'?'연구·시술':metric==='birth'?'출생 기준':metric==='birth-expected'?'초기 추첨 평균':metric==='route-expected'?'시술 후 기대값':'미인증')+(c||integrated?' · 조건부':' · 미해결')+'</small>'+
      '<button type="button" class="route-reference-button" data-compare-origin="'+esc(r.profileId)+'">기준으로 비교</button></td><td>'+
      (metric==='birth-expected'?'출생 RNG 기대값 · 확률분포':metric==='route-expected'?(view?'등록 경로 후 조건부 RNG 평균':'경로 평균 미산출 · 근거 확인'):metric==='certified'?'최종 인증 없음':metric==='birth'?'원본 출생 기준값':integrated?'공통 원장 연결 · 조건부':activeBranch&&metric==='growth'?'선택 분기 미계산':c?metric==='growth'?'성장 완료 가정 · 상한 추정':'조건부 연구·시술 값':'완결 후보 없음 · 계산 보류')+
      '<small>'+(metric==='birth-expected'?('총합 10~90백분위 '+fmt(view.birthRoll.totalBand.p10)+' ~ '+fmt(view.birthRoll.totalBand.p90)):
      metric==='route-expected'?(view?'경로 '+c.transforms.length+'개 시술 · '+(growthTiming==='none'?'전투 성장 제외':'가상 성장 '+(growthTiming==='before'?'시술 전':'시술 후')):esc(routeRoll(r,c).reason||'완결 경로 없음')):
      integrated?integrated.steps+'개 시술 · '+(integrated.source==='ORIGINCAP12'?'출생처 공통 부모 미연결':fmt(integrated.branchCount)+'개 참조 분기'):c?c.researchCount+'개 연구 재생 · '+c.transforms.length+'개 시술':'미완료 연구: '+esc(r.unresolved?.id||'조사 중'))+'</small>'+depthNote+'</td><td class="score">'+scoreCell+'</td>'+DISPLAY_STATS.map(cell).join('')+'</tr>';
  }).join('')||'<tr><td colspan="15">해당 출생처 없음</td></tr>';
  $('#catalogStatus').textContent=metric==='route-expected'?'등록된 후보 가운데 기존 조건부 성장 상한 기준으로 선택된 경로에 출생 RNG와 시술 규칙을 적용한 평균입니다. '+(growthTiming==='none'?'전투 성장 0회. ':'가상 전투 성장 '+(growthTiming==='before'?'첫 시술 이전. ':'마지막 시술 이후. ')+'사용자가 지정한 시행 횟수·성공률은 OXCE의 실제 경험치 공식이 아닙니다. ')+'원본 비능력치 조건 충족 가정, 시술 난수는 균등·독립 가정입니다. 능력치 문턱 통과율만 별도로 계산하며 실제 경로 실현 확률이나 전체 후보의 기대값 최적성은 증명하지 않습니다.':metric==='growth'?'기본 비교: 코르트는 별도 병종으로 분리하며, 출생 가능 최댓값부터 연구 경로의 병종·훈련 변화를 순서대로 적용하고, 변신 전후 체력훈련·전투 성장의 조건부 상한을 투사합니다. 12종 상한 합계는 동시 달성·실전 검증이나 전역 최고 경로의 증명이 아닙니다.':metric==='provisional'?'기존 연구·시술 잠정값: 출생 최솟값에서 시작한 경로이며 전투·체력 성장은 더하지 않은 값입니다.':metric==='birth'?'출생 시점의 원본 최솟값입니다. 성장 이후 잠정값이나 최종 최대치가 아닙니다.':metric==='birth-expected'?'출생처별 병사 생성자 RNG·템플릿·영구 보너스를 적용해 가능한 12종 능력치를 정확히 합산한 이론 분포입니다. 비교 승률은 독립 생성된 신병 둘의 총합 우세 확률이며, 육성·변신·훈장 후 확률이나 같은 캠페인에서의 실제 입수 가능성이 아닙니다.':'확정 최종 최대치 0건. 잠정값을 확정값으로 바꿔 표시하지 않습니다.';
  if(metric==='growth')$('#catalogStatus').textContent+=integratedLoadError?' 최신 통합 상계 연결 실패: '+integratedLoadError+' · 이전 출생처 기록만 표시합니다.':integratedOrigins.size?' 연결된 출생처는 공통 원장의 최신 상계로 갱신했습니다. 다른 상계 모형 사이의 차이값은 표시하지 않습니다.':' 최신 통합 상계에 대응하는 출생처 없음.';
}
function birthDistributionHtml(record){
  const roll=newbornDistribution(DATA,record.profileId);
  const ref=baseline('birth-expected');
  const chance=ref?.birthRoll?newbornPairChance(roll,ref.birthRoll):null;
  const q=roll.totalBand;
  const threshold=Math.ceil(roll.total);
  const tail=newbornTailChance(roll,threshold);
  return '<section class="birth-distribution" data-birth-roll="'+esc(record.profileId)+'">'+
    '<h3>원본 추첨 확률 · 12종 합계</h3>'+
    '<div class="birth-metrics"><div><small>기대 능력치 합계</small><strong>'+fmtMean(roll.total)+'</strong></div>'+
    '<div><small>하위 10% 기준</small><strong>'+fmt(q.p10)+'</strong></div>'+
    '<div><small>중앙값</small><strong>'+fmt(q.p50)+'</strong></div>'+
    '<div><small>상위 10% 기준</small><strong>'+fmt(q.p90)+'</strong></div></div>'+
    '<p class="fine">이론적 총합 범위 '+fmt(q.min)+'~'+fmt(q.max)+
    ' · 백분위 값은 이산 분포의 누적 확률로 산정했습니다. 보너스·출생 템플릿은 포함, 이후 전투·시술·방어구 효과는 제외합니다.</p>'+
    (chance?'<p class="birth-chance">선택한 기준 출생처보다 무작위 신병의 총합이 높을 확률 '+fmtPct(chance.win)+
    ' · 동률 '+fmtPct(chance.tie)+' · 낮을 확률 '+fmtPct(chance.lose)+'</p>':'')+
    '<label class="birth-threshold">선발 총합 최저점<input id="birthThreshold" type="number" min="'+q.min+'" max="'+q.max+'" step="1" value="'+threshold+'"></label>'+
    '<p id="birthThresholdResult" class="fine" role="status">초기 추첨 총합 '+threshold+' 이상일 확률 '+fmtPct(tail)+'</p>'+
    '<div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>능력치</th><th>최저</th><th>10%</th><th>평균</th><th>중앙값</th><th>90%</th><th>최고</th></tr></thead><tbody>'+
    DISPLAY_STATS.map(key=>{const b=roll.bands[key];return '<tr><th scope="row">'+esc(DATA.statLabels[key]||key)+'</th><td>'+fmt(b.min)+'</td><td>'+fmt(b.p10)+'</td><td>'+fmtMean(roll.stats[key])+'</td><td>'+fmt(b.p50)+'</td><td>'+fmt(b.p90)+'</td><td>'+fmt(b.max)+'</td></tr>';}).join('')+
    '</tbody></table></div>'+ 
    '<details class="conditional-growth-scenario"><summary>전투 성장 가정 계산 · 12종 확률 비교 (실제 최종값 아님)</summary>'+ 
    '<p class="fine">각 능력치에 동일한 시행 횟수와 성공률을 가정하며, 성공 시 원시 능력치 +1입니다. 이 입력은 게임의 실제 경험치 규칙을 의미하지 않습니다. 각 시행 직전 전투캡을 검사하여 마지막 증가의 상한 초과는 보존합니다. 연구·시술·체력훈련·훈장은 제외합니다.</p>'+ 
    '<label>능력치별 성장 시행 횟수 <input id="growthAttempts" type="number" min="0" max="10000" step="1" value="10"></label>'+ 
    '<label>각 시행 성공률 (%) <input id="growthSuccess" type="number" min="0" max="100" step="1" value="50"></label>'+ 
    '<div id="growthScenarioResult" role="status">입력한 가정으로만 계산합니다.</div></details></section>';
}
function growthPlacementScannerHtml(){
  return '<details class="route-placement-scan"><summary>가상 성장 기회 1묶음 · 시술 전후 모든 위치 비교</summary>'+
    '<p class="fine">등록된 이 경로의 시술 순서는 바꾸지 않고, 똑같은 전투 성장 시도 묶음을 첫 시술 전·각 시술 직후에 한 번씩 배치해 비교합니다. 전투 경험치 획득 횟수/성공률은 임의 가정이며 실제 게임 달성 가능성은 미검증입니다.</p>'+
    '<div class="placement-controls"><label>능력치별 시행<input id="placementAttempts" type="number" min="0" max="40" step="1" value="10"></label>'+
    '<label>성공률 (%)<input id="placementSuccess" type="number" min="0" max="100" step="1" value="50"></label>'+
    '<label>목표 능력치<select id="placementObjective"><option value="total">12종 총합</option>'+
    DISPLAY_STATS.map(key=>'<option value="'+esc(key)+'">'+esc(DATA.statLabels[key]||key)+'</option>').join('')+
    '</select></label><button id="scanGrowthPlacements" type="button">이 경로의 성장 위치 계산</button></div>'+
    '<div id="growthPlacementResults" role="status" aria-live="polite"><p class="fine">시행 횟수·성공률과 목표를 지정한 다음 계산할 수 있습니다.</p></div></details>';
}
function candidateBirthSelectionHtml(record){
  const stored=candidateBirthSelections.get(record.profileId)||{mode:'exact',stats:{}};
  const count=Object.keys(stored.stats).length;
  return '<details class="candidate-birth-select"'+(count?' open':'')+'>'+
    '<summary>실제 신병 초기 능력치·채용 최솟값 입력 <small>('+count+'/12개 지정)</small></summary>'+
    '<p class="fine">반드시 <strong>영입 직후, 전투 성장·추가 훈련 전에 표시된 실효 능력치</strong>를 사용하세요. 영구 특성은 계산기가 원본 출생 이력에서 이미 반영하므로 더하지 않습니다. 빈칸은 추첨 분포로 남깁니다. 현재 성장한 대원의 값을 입력하면 출생 RNG와 일치하지 않을 수 있습니다.</p>'+
    '<label>입력값의 의미<select id="candidateBirthMode">'+
      '<option value="exact"'+(stored.mode==='exact'?' selected':'')+'>실제 신병의 관측값과 일치</option>'+
      '<option value="atLeast"'+(stored.mode==='atLeast'?' selected':'')+'>채용 기준: 입력값 이상</option></select></label>'+
    '<div class="candidate-birth-grid">'+DISPLAY_STATS.map(key=>
      '<label>'+esc(DATA.statLabels[key]||key)+'<input type="number" step="1" data-birth-stat="'+esc(key)+
      '" placeholder="미지정" value="'+esc(stored.stats[key]??'')+'"></label>').join('')+'</div>'+
    '<div class="candidate-birth-actions"><button type="button" id="candidateBirthMin">출생 최솟값 불러오기</button>'+
      '<button type="button" id="candidateBirthClear">입력값 초기화</button></div>'+
    '<p id="candidateBirthStatus" class="fine" role="status">지정 '+count+'종 · 계산 실행 시 해당 출생 RNG로 실제 가능한 값인지 확인합니다.</p>'+
    '</details>';
}
function candidateExpectationPanelHtml(record,sharedTerminal=false){
  const candidates=sharedTerminal?chortCandidates(record):comparable(record);
  const choices=new Map(candidates.map(c=>[c.finalSoldierType,name(c.finalSoldierType)]));
  const bodyOptions=[...choices].sort((a,b)=>a[1].localeCompare(b[1],'ko'));
  const previous=candidateScanCache?.profileId===record.profileId&&
    candidateScanCache?.terminal===sharedTerminal?candidateScanCache.filters:null;
  const selectedValue=(key,value)=>(String(previous?.[key]??(key==='minGate'?'0':key==='body'?'all':'total'))===String(value)?' selected':'');
  return '<details class="candidate-expectation-scan" data-candidate-scan="'+esc(record.profileId)+'">'+
    '<summary>이 출생처의 등록 성장 경로 '+candidates.length+'개 · 기대값/문턱 확률 직접 비교</summary>'+
    '<p class="fine">현재 선택한 출생처에 대해 연구·난이도 조건이 호환되는 등록 경로만 각각 재계산합니다. 코르트 분리와 기존 시술 순서를 유지합니다. 훈련 기회나 난이도 충돌을 합쳐 가상의 만능 경로를 만들지 않습니다. 위에 보이는 출생처 전체 평균과 이 아래의 신병 선발 조건부 평균은 구분됩니다.</p>'+candidateBirthSelectionHtml(record)+
    '<div class="candidate-scan-controls">'+
    '<label>비교 목표<select id="candidateExpectationObjective"><option value="total"'+selectedValue('objective','total')+'>12종 기대값 합계</option>'+
      DISPLAY_STATS.map(key=>'<option value="'+esc(key)+'"'+selectedValue('objective',key)+'>'+esc(DATA.statLabels[key]||key)+'</option>').join('')+'</select></label>'+
    '<label>능력치 요건 통과율<select id="candidateExpectationMinGate">'+
      '<option value="0"'+selectedValue('minGate',0)+'>제한 없음</option><option value="0.5"'+selectedValue('minGate',0.5)+'>50% 이상</option><option value="0.9"'+selectedValue('minGate',0.9)+'>90% 이상</option><option value="0.999999999"'+selectedValue('minGate',0.999999999)+'>거의 100%</option></select></label>'+
    '<label>최종 병종<select id="candidateExpectationBody"><option value="all"'+selectedValue('body','all')+'>모든 최종 병종</option>'+
      bodyOptions.map(([id,label])=>'<option value="'+esc(id)+'"'+selectedValue('body',id)+'>'+esc(label)+'</option>').join('')+'</select></label>'+
    '<button type="button" id="scanCandidateExpectations">등록 경로 전부 계산</button></div>'+
    '<p class="fine">위의 가정형 성장 배치를 선택했다면 모든 후보에 같은 시행 횟수·성공률을 적용합니다. 「마지막 시술 이후」는 후보별 마지막 시술을 기준으로 합니다. 통과율은 출생·시술 난수에서의 <strong>능력치 요건</strong>만 포함합니다.</p>'+
    '<div id="candidateExpectationResults" aria-live="polite" role="status"><p class="fine">조건부 평균이 가장 높은 경로와 통과율이 높은 경로를 함께 확인하려면 계산을 실행하세요.</p></div></details>';
}
function candidateSelectionImpactHtml(record,entry,selectionInfo){
  if(!selectionInfo?.constrained||!entry||entry.kind!=='source-conditional-candidate')return '';
  const candidate=record.candidates.find(c=>c.id===entry.id);
  const baseline=candidate?routeRoll(record,candidate):null;
  if(baseline?.kind!=='conditional-route-distribution')return '';
  const delta=entry.expectedTotal-baseline.expectedTotal;
  return '<details class="candidate-selection-impact"><summary>현재 선택 경로의 선발 조건 전·후 12종 변화 자세히</summary>'+
    '<p class="fine">같은 등록 경로·같은 성장 가정이며, 변화를 일으킨 것은 초기값 조건화뿐입니다. 이 차이는 훈련의 추가 효과나 실제 캠페인 확률이 아닙니다.</p>'+
    '<p>출생처 전체 조건부 기대 합계 '+fmtMean(baseline.expectedTotal)+
    ' → 입력값을 만족한 신병 조건부 합계 <strong>'+fmtMean(entry.expectedTotal)+'</strong>'+
    ' · 차이 '+(delta>0?'+':'')+fmtMean(delta)+'</p>'+
    '<div class="birth-stat-scroll"><table class="birth-stat-table"><thead>'+
    '<tr><th>능력치</th><th>선발 전</th><th>선발 후</th><th>차이</th></tr></thead><tbody>'+
    DISPLAY_STATS.map(k=>{
      const diff=entry.stats[k]-baseline.stats[k];
      return '<tr><th>'+esc(DATA.statLabels[k]||k)+'</th><td>'+fmtMean(baseline.stats[k])+'</td><td>'+
        fmtMean(entry.stats[k])+'</td><td>'+(diff>0?'+':'')+fmtMean(diff)+'</td></tr>';
    }).join('')+'</tbody></table></div></details>';
}
function candidateExpectationResultHtml(result,record,selectionInfo,selectedEntry){
  if(result.kind!=='conditional-candidate-ranking')
    return '<p class="failure">'+esc(result.reason||'경로 비교 미산출')+'</p>';
  const itemById=new Map(record.candidates.map(x=>[x.id,x]));
  const objective=result.objective==='total'?'12종 합계':DATA.statLabels[result.objective]||result.objective;
  const candidateRow=(row,index)=>{
    const candidate=itemById.get(row.id);
    const names=(candidate?.transforms||[]).map(name);
    const label=names.length?names.slice(0,3).join(' → ')+(names.length>3?' 외 '+(names.length-3)+'개':''):'시술 없음';
    return '<tr data-candidate-ranking="'+esc(row.id)+'" data-frontier="'+row.onFrontier+'">'+
      '<td><button type="button" data-candidate="'+esc(row.id)+'">'+(index+1)+'. '+esc(label)+'</button>'+
        '<small>'+esc(row.id)+'</small></td>'+
      '<td>'+esc(name(row.finalSoldierType))+'</td>'+
      '<td>'+fmtMean(row.score)+'</td><td>'+fmtMean(row.expectedTotal)+'</td>'+
      '<td>'+fmtSmallChance(row.statGateProbability)+'</td>'+
      (selectionInfo?.constrained?'<td>'+fmtSmallChance(row.jointStatEligibilityProbability)+'</td>':'')+
      '<td>'+fmt(row.researchCount)+'</td><td>'+fmt(row.transformCount)+'</td>'+
      '<td>'+(row.onFrontier?'두 축 비지배':'')+'</td></tr>';
  };
  const ranked=result.ranked,first=ranked.slice(0,15);
  const tableBody=(part,offset=0)=>'<div class="birth-stat-scroll"><table class="candidate-rank-table">'+
    '<thead><tr><th>실제 등록 시술 경로</th><th>최종 병종</th><th>'+esc(objective)+'</th>'+
    '<th>12종 평균 합</th><th>능력치 요건 통과</th>'+
    (selectionInfo?.constrained?'<th>신규 추첨에서 선발·능력치 요건 모두 통과</th>':'')+
    '<th>연구</th><th>시술</th><th>2축 비교</th></tr></thead>'+
    '<tbody>'+part.map((x,i)=>candidateRow(x,i+offset)).join('')+'</tbody></table></div>';
  const birthNote=selectionInfo?.constrained?
    '<p class="candidate-selection-context">'+(selectionInfo.mode==='exact'?'신병 실측값':'채용 최소 기준')+
    ' '+selectionInfo.constrained+'개 적용 · 이 출생처에서 신규 추첨 시 기준 충족 '+
    fmtSmallChance(selectionInfo.selectionProbability)+
    '. 표의 능력치 요건 통과율은 <strong>이미 선발 기준을 만족한 집단 안</strong>에서 계산했습니다. 신규 추첨에서 두 조건을 모두 만족할 확률은 별도 열이며, 실제 연구·훈련 실행 확률이 아닙니다.</p>':'';
  return birthNote+candidateSelectionImpactHtml(record,selectedEntry,selectionInfo)+
    '<p><strong>등록 경로 '+result.registered+'개 계산 · 평균 산출 '+result.computed+
    '개 · 능력치 요건 0% '+result.statBlocked.length+'개 · 계산 근거 부족 '+result.unverified.length+
    '개</strong></p>'+
    '<p class="fine">선택한 병종·통과율 조건 후 '+ranked.length+'개 · 조건 미충족 '+result.excludedByFilter+
    '개 · 같은 최종 병종 내 '+esc(objective)+' 기대값과 통과율을 동시에 개선하는 다른 후보가 없는 경로 '+result.frontierCount+'개. <strong>이 표시는 12종 전체 우열이나 연구비용 최적화를 증명하지 않습니다.</strong></p>'+
    (ranked.length?'<p class="fine">현재 조건에서 가장 높은 '+esc(objective)+' 기대값: <strong>'+fmtMean(ranked[0].score)+
      '</strong>, 능력치 요건 통과 '+fmtPct(ranked[0].statGateProbability)+
      ' · 최종 병종 '+esc(name(ranked[0].finalSoldierType))+'</p>'+tableBody(first)+
      (ranked.length>15?'<details class="candidate-rank-rest"><summary>나머지 '+(ranked.length-15)+'개 경로 모두 보기</summary>'+
        tableBody(ranked.slice(15),15)+'</details>':''):'<p class="fine">필터에 맞는 산출 가능 경로가 없습니다.</p>')+
    (result.unverified.length?'<details><summary>계산 보류 '+result.unverified.length+'건 근거</summary><ul>'+
      result.unverified.map(x=>'<li>'+esc(x.id||'?')+' · '+esc(x.reason||'원본 미확정')+'</li>').join('')+
      '</ul></details>':'')+
    '<p class="fine">'+esc(result.caveat)+'</p>';
}
function rerankCandidateExpectations(){
  const output=$('#candidateExpectationResults'),cache=candidateScanCache;
  if(!cache||!output||cache.profileId!==selected)return;
  const objective=$('#candidateExpectationObjective')?.value||'total';
  const minGate=Number($('#candidateExpectationMinGate')?.value||0);
  const body=$('#candidateExpectationBody')?.value||'all';
  cache.filters={objective,minGate:String($('#candidateExpectationMinGate')?.value??0),body};
  output.innerHTML=candidateExpectationResultHtml(
    rankCandidateRollSummaries(cache.entries,{objective,minGate,body}),cache.record,
    cache.selectionInfo,cache.entries.find(x=>x.id===activeCandidateId));
}
function saveCandidateBirthInputs(){
  if(!selected)return;
  const mode=$('#candidateBirthMode')?.value||'exact';
  const stats={};
  for(const input of document.querySelectorAll('[data-birth-stat]'))
    if(input.value.trim()!=='')stats[input.dataset.birthStat]=input.value.trim();
  candidateBirthSelections.set(selected,{mode,stats});
  candidateScanGeneration++;candidateScanCache=null;
  const count=Object.keys(stats).length;
  const status=$('#candidateBirthStatus'),output=$('#candidateExpectationResults');
  if(status)status.textContent='지정 '+count+'/12종 · 출생 RNG 검사와 조건부 경로 계산을 다시 실행해야 합니다.';
  if(output)output.textContent='초기 능력치 선발 기준이 바뀌었습니다. 등록 경로 전부 계산을 눌러 다시 산출하세요.';
}
function parseCandidateBirthSelection(){
  const mode=$('#candidateBirthMode')?.value||'exact',stats={};
  if(!['exact','atLeast'].includes(mode))return {reason:'선발 조건 모드 오류'};
  for(const input of document.querySelectorAll('[data-birth-stat]')){
    const raw=input.value.trim();
    if(!raw)continue;
    const n=Number(raw);
    if(!Number.isSafeInteger(n))return {
      reason:(DATA.statLabels[input.dataset.birthStat]||input.dataset.birthStat)+'는 정수만 입력할 수 있습니다.'};
    stats[input.dataset.birthStat]=n;
  }
  return {selection:Object.keys(stats).length?{mode,stats}:null};
}
async function scanCandidateExpectations(){
  if(blocked||!selected||!activeCandidateId)return;
  const record=REPORT.records.find(x=>x.profileId===selected);
  if(!record)return;
  const chosen=record.candidates.find(x=>x.id===activeCandidateId);
  const isTerminal=chosen?.finalSoldierType==='STR_SOLDIER_CHORT';
  const candidates=isTerminal?chortCandidates(record):comparable(record);
  const output=$('#candidateExpectationResults');
  if(!output)return;
  const timing=$('#routeGrowthTiming')?.value||'none';
  const attempts=timing==='none'?0:Number($('#routeGrowthAttempts')?.value);
  const success=timing==='none'?0:Number($('#routeGrowthSuccess')?.value);
  const token=++candidateScanGeneration,openGeneration=replayGeneration;
  const parsed=parseCandidateBirthSelection();
  if(parsed.reason){output.textContent=parsed.reason;return;}
  const birthSelection=parsed.selection;
  let selectionInfo=null;
  if(birthSelection){
    try{
      const profile=DATA.profiles.find(x=>x.id===record.profileId);
      selectionInfo=conditionBirthPairs(newbornRawPairs(DATA,record.profileId),
        profile?.traitStats,birthSelection);
    }catch(error){output.textContent='원본 출생 RNG 계산 보류: '+error.message;return;}
    if(selectionInfo.kind!=='conditioned-birth'){
      output.textContent='원본 출생에서 선발 조건 불일치: '+selectionInfo.reason+
        (selectionInfo.possible?' · 가능한 범위 '+selectionInfo.possible.min+'~'+selectionInfo.possible.max:'');
      return;
    }
    const status=$('#candidateBirthStatus');
    if(status)status.textContent='입력 '+selectionInfo.constrained+'종 · 신규 신병 추첨에서 기준 충족 '+
      fmtSmallChance(selectionInfo.selectionProbability)+' · 시술 후 기대값과 구분해 계산합니다.';
  }
  const entries=[];
  output.textContent='등록 경로 '+candidates.length+'개 중 확률을 계산하는 중…';
  for(let i=0;i<candidates.length;i++){
    if(token!==candidateScanGeneration||openGeneration!==replayGeneration||
      !output.isConnected)return;
    entries.push(candidateRollSummary(DATA,record.profileId,candidates[i],
      {timing,attempts,success,birthSelection}));
    if(i%8===7&&i+1<candidates.length){
      output.textContent='출생처 '+record.name+' · '+(i+1)+' / '+candidates.length+'개 경로 계산';
      await new Promise(resolve=>setTimeout(resolve,0));
    }
  }
  if(token!==candidateScanGeneration||openGeneration!==replayGeneration||
    !output.isConnected)return;
  candidateScanCache={profileId:record.profileId,terminal:isTerminal,record,entries,selectionInfo,filters:null};
  rerankCandidateExpectations();
}
function rememberBirthFloorPrefs(){
  if(!selected||!$('#birthFloorStat'))return;
  birthFloorPrefs.set(selected,{
    screenStat:$('#birthFloorStat').value,
    objective:$('#birthFloorObjective')?.value||'total',
    draws:Number($('#birthFloorDraws')?.value),
    trainingSlots:Number($('#birthFloorTrainingSlots')?.value),
    requiredChance:Number($('#birthFloorRequiredChance')?.value)
  });
}
async function scanBirthFloors(){
  if(!selected||!activeCandidateId)return;
  const output=$('#birthFloorResults');
  const record=REPORT.records.find(r=>r.profileId===selected);
  const candidate=record?.candidates.find(c=>c.id===activeCandidateId);
  if(!output||!candidate)return;
  const config=growthScheduleFor(candidate);
  if(config.reason){output.textContent='가상 성장 가정 오류: '+config.reason;return;}
  const screenStat=$('#birthFloorStat')?.value||'tu';
  const objective=$('#birthFloorObjective')?.value||'total';
  const draws=Number($('#birthFloorDraws')?.value);
  const trainingSlots=Number($('#birthFloorTrainingSlots')?.value);
  const requiredChance=Number($('#birthFloorRequiredChance')?.value);
  if(!Number.isSafeInteger(draws)||draws<1||draws>10000){
    output.textContent='독립 신규 추첨 횟수는 1~10000 정수로 입력하세요.';return;
  }
  if(!Number.isSafeInteger(trainingSlots)||trainingSlots<1||trainingSlots>200){
    output.textContent='선발 대원의 능력치 요건 검토 상한은 1~200명 정수로 입력하세요.';return;
  }
  rememberBirthFloorPrefs();
  const generation=replayGeneration,sourceId=selected,candidateId=activeCandidateId;
  output.textContent='출생 RNG 및 이 경로의 시술 후 확률분포를 계산하는 중…';
  await new Promise(resolve=>setTimeout(resolve,0));
  if(generation!==replayGeneration||selected!==sourceId||
    activeCandidateId!==candidateId||!output.isConnected)return;
  const result=enumerateRouteBirthFloors(DATA,sourceId,candidate,{
    screenStat,objective,draws,trainingSlots,requiredChance,growthSchedule:config.schedule
  });
  if(generation===replayGeneration&&selected===sourceId&&
    activeCandidateId===candidateId&&output.isConnected)
    output.innerHTML=renderBirthFloorResult(result,DATA.statLabels);
}
function routeRollHtml(record,candidate,sharedTerminal=false){
  const roll=routeRoll(record,candidate);
  if(roll.kind!=='conditional-route-distribution')
    return '<section class="birth-distribution"><h3>등록 경로 RNG 결과 미산출</h3>'+
      '<p class="failure">'+esc(roll.reason||'원본 확률 계산 근거 부족')+'</p>'+growthPlacementScannerHtml()+renderBirthFloorForm(DATA.statLabels,birthFloorPrefs.get(record.profileId))+candidateExpectationPanelHtml(record,sharedTerminal)+'</section>';
  const threshold=Math.ceil(roll.expectedTotal);
  const stages=roll.stages.length?roll.stages.map((step,i)=>
    '<li><button type="button" data-open-training="'+esc(step.id)+'">'+esc(name(step.id))+'</button>'+
    ' · 이 단계 능력치 문턱 통과 '+fmtPct(Math.min(1,step.statGateProbability))+
    (step.reset?' · 이전 훈련·영구 보너스 초기화':'')+
    (step.removed.length?' · 이력 제거 '+step.removed.map(x=>esc(name(x))).join(', '):'')+
    '</li>').join(''):'<li>추가 훈련 없음 · 출생 능력치 분포 그대로</li>';
  return '<section class="birth-distribution route-distribution" data-route-roll="'+esc(candidate.id)+'">'+
    '<h3>이 경로의 출생 RNG·시술 후 조건부 분포</h3>'+
    '<p class="fine">등록된 한 경로에서 신병 능력치의 분포를 시술 순서대로 전파했습니다. '+
    (roll.growthStages.length?'사용자 가정형 성장 '+roll.growthStages.map(s=>s.beforeTransform===0?'첫 시술 이전':'시술 '+s.beforeTransform+'회 이후').join(' · ')+'. ':'전투 성장 시행 0회. ')+
    '비능력치 선행조건 충족 가정이며, 다른 후보의 유리한 수치를 혼합하지 않습니다.</p>'+
    '<div class="birth-metrics"><div><small>12종 기대 합계</small><strong>'+fmtMean(roll.expectedTotal)+'</strong></div>'+
    '<div><small>12종 합계 10~90%</small><strong>'+fmt(roll.totalBand.p10)+'~'+fmt(roll.totalBand.p90)+'</strong></div>'+
    '<div><small>능력치 문턱 전체 통과</small><strong>'+fmtPct(Math.min(1,roll.statGateProbability))+'</strong></div>'+
    '<div><small>적용 시술 단계</small><strong>'+fmt(roll.stages.length)+'</strong></div></div>'+
    '<p class="fine">문턱 통과 확률은 출생 난수·시술 난수'+(roll.growthStages.length?'·가상 성장 성공 난수':'')+'에 따른 <strong>능력치 요건만</strong> 계산한 것입니다. 연구·재료·계급·부상·훈장·시간·시술 이용 가능 확률은 계산하지 않았습니다.</p>'+
    '<label class="birth-threshold">이 경로 최종 합계 기준점<input id="routeRollThreshold" type="number" min="'+roll.totalBand.min+'" max="'+roll.totalBand.max+'" step="1" value="'+threshold+'"></label>'+
    '<p id="routeRollThresholdResult" class="fine" role="status">가정이 성립하고 능력치 문턱을 통과한 병사 중 총합 '+fmt(threshold)+' 이상일 확률 '+fmtPct(newbornTailChance(roll,threshold))+'</p>'+
    '<div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>능력치</th><th>원시 평균</th><th>영구 특성</th><th>실효 평균</th><th>10%</th><th>90%</th></tr></thead><tbody>'+
    DISPLAY_STATS.map(key=>'<tr><th scope="row">'+esc(DATA.statLabels[key]||key)+'</th><td>'+fmtMean(roll.rawStats[key])+'</td><td>'+fmt(roll.bonus[key]||0)+'</td><td>'+fmtMean(roll.stats[key])+'</td><td>'+fmt(roll.bands[key].p10)+'</td><td>'+fmt(roll.bands[key].p90)+'</td></tr>').join('')+
    '</tbody></table></div><details><summary>적용된 시술의 순서와 문턱 ('+roll.stages.length+'단계)</summary><ol>'+stages+'</ol></details>'+growthPlacementScannerHtml()+renderBirthFloorForm(DATA.statLabels,birthFloorPrefs.get(record.profileId))+candidateExpectationPanelHtml(record,sharedTerminal)+'</section>';
}
function statGrid(c,metric='growth'){
  const view=metric==='growth'&&c.growth?.kind==='conditional-upper-envelope'?c.growth:c.display;
  const body=DATA.soldiers.find(x=>x.id===c.finalSoldierType);
  return '<div class="stat-grid">'+DISPLAY_STATS.map(k=>{
    const cap=body?.statCaps?.[k],max=body?.maxStats?.[k],raw=view.raw[k];
    const exceed=Number.isFinite(cap)&&raw>cap?' · 원시값 전투캡 +'+fmt(raw-cap)+' 초과':'';
    return '<div><small>'+esc(DATA.statLabels[k])+'</small><strong>'+fmt(view.stats[k])+'</strong>'+
      '<small>원시 '+fmt(raw)+' + 영구 특성 '+fmt(view.bonus[k])+'</small>'+
      '<small>생성 최대치 '+fmt(max)+' / 전투캡 '+fmt(cap)+exceed+'</small></div>';
  }).join('')+'</div>';
}
const signed=n=>(n>0?'+':'')+fmt(n);
function educationChoicesHtml(record,profile,selectedCandidate){
  const choices=educationBranchReport(DATA,profile,comparable(record));
  const details=choices.map(choice=>{
    if(!choice.available)return '<article class="education-option is-inapplicable" data-education-option="'+
      esc(choice.id)+'"><h4>'+esc(choice.name)+'</h4>'+
      '<p class="fine">이 출생 병종에서는 교육 대상이 아닙니다.</p></article>';
    const cap=choice.capReference;
    const effects=DISPLAY_STATS.filter(key=>cap.combined[key]!==0).map(key=>
      '<span class="education-effect"><b>'+esc(DATA.statLabels[key]||key)+' '+signed(cap.combined[key])+'</b>'+
      '<small>직접 '+signed(cap.cappedDirect[key])+' / 영구 '+signed(cap.permanent[key])+'</small></span>').join('');
    const required=choice.requiredStats.map(([key,value])=>
      esc(DATA.statLabels[key]||key)+' '+fmt(value)+' 이상').join(' · ');
    const locks=arr=>arr.map(row=>'<li>'+esc(name(row.id))+
      ' <small>('+row.causes.map(x=>esc(name(x))).join(' / ')+')</small></li>').join('');
    const selected=selectedCandidate?.futureOptions?.completed.includes(choice.id);
    const inheritedWarning=choice.alreadyCompleted?
      '영입 시 이미 교육 이력이 있어 재교육할 수 없습니다.':
      choice.historyConflicts.length?
        '영입 시 훈련 이력 충돌: '+choice.historyConflicts.map(x=>
          esc(name(x.id))+' ← '+x.causes.map(c=>esc(name(c))).join(' / ')).join('; ')+
          ' · 해당 이력을 초기화하지 않으면 이 교육을 추가할 수 없습니다.':'';
    const best=choice.bestCandidate;
    const witness=best?'<button type="button" data-candidate="'+esc(best.id)+'">등록 후보 최고 상한 '+
      fmt(best.growth.total)+' · 해당 경로 보기</button>':
      '<strong class="education-gap">실제 연구·변신 재생 후보 0건 — 불가능 판정 아님</strong>';
    return '<article class="education-option'+(selected?' is-selected':'')+
      '" data-education-option="'+esc(choice.id)+'" data-witness-count="'+choice.candidateCount+'">'+
      '<h4>'+esc(choice.name)+(selected?' <small>선택 경로 보유</small>':'')+'</h4>'+
      (inheritedWarning?'<p class="education-warning" data-inherited-education-block="true">'+inheritedWarning+'</p>':'')+
      '<p class="fine">원시 성장캡 시점의 가상 추가 효과 · <strong>직접 / 영구 분리</strong></p>'+
      '<div class="education-effects">'+effects+'</div>'+
      (cap.psiSkillActivationUnverified?'<p class="fine">Psi 기술 보너스는 해당 능력 활성화가 별도로 필요합니다.</p>':'')+
      '<p class="fine">선행 훈련 '+(choice.prerequisites.map(x=>esc(x.name)).join(' → ')||'없음')+
      ' · 조건 '+(required||'별도 최소 능력치 없음')+
      (choice.baseFunctions.length?' · 기지 기능 '+choice.baseFunctions.map(esc).join(', '):'')+'</p>'+
      '<p class="fine">선행 연구 '+choice.researchIds.map(id=>esc(name(id))).join(' · ')+
        ' · 비용 '+fmt(choice.cost)+
        (choice.requiredItems.length?' · 재료 '+choice.requiredItems.map(([id,n])=>
          esc(name(id))+' ×'+fmt(n)).join(' / '):'')+
        (choice.minRank>0?' · 계급 '+fmt(choice.minRank)+' 이상':'')+'</p>'+
      (cap.requirementMayFail.length?'<p class="education-warning">성장캡 원시값만으로는 교육의 '+
        cap.requirementMayFail.map(key=>esc(DATA.statLabels[key]||key)).join(', ')+
        ' 최소조건을 충족하지 못할 수 있습니다. 출생값·기존 보너스를 확인하세요.</p>':'')+
      '<p class="education-witness">'+witness+' <small>등록 후보 '+choice.candidateCount+'건</small></p>'+
      '<details><summary>이 교육으로 제한되는 후속 선택 · 직접 '+choice.directBlocks.length+
        ' / 필수 선행의 별도 차단 '+choice.prerequisiteBlocks.length+
        ' / 연쇄 '+choice.chainBlocks.length+'</summary>'+
        (choice.directBlocks.length?'<p><b>교육 자체의 직접 차단</b></p><ul>'+locks(choice.directBlocks)+'</ul>':'')+
        (choice.prerequisiteBlocks.length?'<p><b>필수 선행 훈련에서 추가 차단</b></p><ul>'+
          locks(choice.prerequisiteBlocks)+'</ul>':'')+
        (choice.chainBlocks.length?'<p><b>차단된 훈련을 선행조건으로 요구하는 후속</b></p><ul>'+
          locks(choice.chainBlocks)+'</ul>':'')+
        '<p class="fine">최초 병종에 허용된 규칙만 집계합니다. 연구·아이템·시설·계급·최소 능력치 통과 여부는 별개입니다.</p>'+
      '</details></article>';
  }).join('');
  return '<section class="education-endgame" data-education-endgame="true">'+
    '<h3>최종 육성 선택지 · 교육 3개 경로</h3>'+
    '<p class="scope-note">최초 병종 '+esc(name(profile.soldierType))+'의 원시 statCaps에 정확히 도달한 시점에 '+
      '교육을 시행한다고 가정한 <strong>직접 증가(상한 제한 후) + 영구 특성</strong> 비교입니다. '+
      '실제 출생 개체, 교육 순서, 능력치 초과 성장, 연구·재료 조건까지 검증한 완성 경로가 아니며 '+
      '원본 후보가 없는 교육을 불가능하다고 간주하지 않습니다.</p>'+
    '<div class="education-options">'+details+'</div>'+
    '<p class="fine">세 교육을 필수 선행으로 지정해 새로 열리는 변신은 없습니다. '+
      '다만 능력치 조건 충족에 따른 간접 해금과 기존 변신 이력을 초기화하는 예외는 별도입니다. '+
      '기본 순위는 검증된 후보의 12종 조건부 상한으로만 계산합니다.</p></section>';
}
function routeFutureOptionsHtml(candidate){
  const audit=candidate.futureOptions;
  if(audit?.kind!=='structural-only')return '';
  const render=rows=>rows.map(row=>'<li>'+esc(name(row.id))+
    '<small> · '+row.causes.map(id=>esc(name(id))).join(' / ')+
    '</small></li>').join('');
  return '<details class="candidate-future-options" data-future-options="'+audit.total+'">'+
    '<summary>선택된 육성 경로의 후속 훈련 손실 · 직접 '+audit.direct.length+
    '건 / 선행조건 연쇄 '+audit.indirect.length+'건 (최종 병종 기준)</summary>'+
    (audit.direct.length?'<p><b>이력에 직접 막힌 훈련·변신</b></p><ul>'+render(audit.direct)+'</ul>':'')+
    (audit.indirect.length?'<p><b>필수 선행 훈련이 막혀 함께 막힌 후속</b></p><ul>'+
      render(audit.indirect)+'</ul>':'')+
    (!audit.total?'<p>현재 최종 병종에서 이력으로 새로 막히는 후속 규칙이 없습니다.</p>':'')+
    '<p class="fine">'+esc(audit.caveat)+'. 초기화 변신은 초기화 뒤 다시 평가합니다.</p></details>';
}
function choiceHtml(c){
  if(!c.branchChoices.length)return '<p>이 경로에는 직접 disables를 실행하는 연구 분기가 없습니다.</p>';
  return c.branchChoices.map(x=>{
    const action=c.steps[x.at],direct=action.id===x.id||action.research===x.id;
    const label=direct?(action.assumeOutcome?'무료 지급/이벤트 결과 가정':'선택한 연구'):'자동·연결 연구의 효과';
    return '<details class="branch-choice"><summary>'+esc(name(x.id))+' <small>'+label+' · 배제 '+x.excludes.length+'개</small></summary><p>'+node(x.id)+'</p>'+x.excludes.map(e=>
      '<p data-exclusion="'+e.direction+'" data-closure="'+esc(e.closureTiming)+'">'+node(x.id)+(e.direction==='bidirectional'?' ↔ ':' → ')+node(e.id)+' <b>'+({oneway:'일방향 배제',bidirectional:'양방향 배제',self:'자기 비활성화'}[e.direction])+'</b>'+
      ' · '+({ 'new-in-step':'이 연구 단계에서 새로 폐쇄 확인', 'already-closed':'이 단계 이전에 이미 폐쇄', 'closed-after':'다른 후속 단계에서 폐쇄', 'not-closed':'이 단계에서 폐쇄 확인 안 됨'}[e.closureTiming]||'폐쇄 시점 증거 없음')+
      (e.reopenedAt!=null?' · 중간 재활성화 기록 있음':'')+(e.actuallyClosed?' · 마지막 상태: 폐쇄':' · 마지막 상태: 활성/미폐쇄')+
      (e.attribution==='shared-transition'?' · 자동 연구 등 같은 단계의 복수 완료가 원인일 수 있음':'')+'</p>').join('')+
      '<p class="muted">배제 전 이미 시행한 훈련의 보존 여부는 이 경로의 동일 병사 이력으로 재생했습니다.</p></details>';
  }).join('');
}
function trainingCapStageHtml(stage){
  const capName=stage.upper==='maxStats'?'생성 최대치(maxStats)':
    stage.upper==='statCaps'?'전투 성장 상한(statCaps)':'시술 자체의 추가 상한 없음';
  const columns=stage.affected.map(key=>{
    const x=stage.changes[key];
    const range=(label,values,suffix='')=>values.some(v=>v!==0)?label+' '+values.join('~')+suffix:null;
    const extras=[range('추가 난수',x.flatRange),
      x.percentOverall?'현재 능력치 ×'+x.percentOverall+'%':null,
      range('현재 능력치 난수 비율',x.percentRange,'%'),
      x.percentGained?'획득 성장치 ×'+x.percentGained+'%':null,
      range('획득 성장치 난수 비율',x.percentGainedRange,'%'),
      x.reroll?'변신 후 새 병종 능력치 재추첨':null].filter(Boolean);
    return '<tr><th scope="row">'+esc(DATA.statLabels[key]||key)+'</th><td>'+fmt(x.flat)+'</td><td>'+
      (extras.length?esc(extras.join(' · ')):'없음')+'</td><td>'+fmt(x.bonus)+'</td><td>'+fmt(x.previousCap)+'</td><td>'+fmt(x.nextCap)+'</td><td>'+fmt(x.max)+'</td></tr>';
  }).join('');
  return '<div class="training-cap-evidence" data-training-cap-step="'+esc(stage.id)+'">'+
    '<p><strong>병종 변화: '+esc(name(stage.from))+' → '+esc(name(stage.to))+'</strong></p>'+
    '<p>이 시술의 증가량 상한: <strong>'+capName+'</strong>'+
    (stage.upper?' · '+(stage.soft?'상한 초과 기존값 보존(소프트)':'하드 상한'):'')+
    (stage.lower?' · 최소 생성값 하한 적용':'')+'</p>'+
    (stage.reset?'<p class="cap-reset-warning"><strong>초기화:</strong> 기존 훈련 이력과 훈련 영구 보너스를 지우고, 이미 획득한 원시 능력치는 유지합니다.</p>':'')+
    (stage.removed.length?'<p>이 단계에서 제거하는 이력: '+stage.removed.map(id=>esc(name(id))).join(', ')+'</p>':'')+
    (stage.random?'<p class="fine">이 단계에는 난수·재추첨이 포함되어 있어 표의 직접 증가량만으로 최종 능력치를 확정할 수 없습니다.</p>':'')+
    '<details class="training-cap-data"><summary>능력치별 직접 변화·영구 보너스·상한 ('+stage.affected.length+'종)</summary>'+
    '<p class="fine">증감에 쓰는 원시값과 전투 상한은 별개입니다. 고정 변화 외 난수·비율·재추첨을 합산한 뒤 하한·상한을 적용하며, 전투 성장의 마지막 증가분은 일반 전투 상한을 초과할 수도 있습니다.</p>'+
    '<div class="training-cap-scroll"><table><thead><tr><th>능력치</th><th>직접 고정 변화</th><th>추가 비율·난수·재추첨</th><th>새 영구 보너스</th><th>변신 전 전투캡</th><th>변신 후 전투캡</th><th>시술 적용 최대치</th></tr></thead><tbody>'+
    (columns||'<tr><td colspan="7">변화하는 능력치 없음</td></tr>')+'</tbody></table></div></details></div>';
}
function transformationGateHtml(c,profile){
  const audit=trainingOrderEvidence(profile,c,DATA);
  if(audit.kind!=='ready')return '<p class="failure">원본 경로의 단계별 상한 근거 불충분: '+esc(audit.reason)+'</p>';
  const rules=new Map(DATA.transformations.map(x=>[x.id,x]));
  const selected=c.steps.filter(s=>s.type==='transform');
  if(!selected.length)return '';
  const chips=ids=>ids.length?ids.map(node).join(' '):'없음';
  const objectGate=obj=>Object.entries(obj||{}).length?
    Object.entries(obj).map(([id,n])=>'<span>'+esc(name(id))+' <small>('+esc(id)+') ×'+fmt(n)+'</small></span>').join(' · '):'없음';
  const details=selected.map((step,i)=>{
    const t=rules.get(step.transform);if(!t)return '<li>원본 변신 규칙 누락 '+esc(step.transform)+'</li>';
    const required=Array.isArray(t.requires)?t.requires:[];
    const minRank=Math.max(0,Number(t.minRank)||0);
    return '<li class="origin-transform-gate"><strong>'+(i+1)+'단계: '+esc(t.koName||t.id)+'</strong>'+
      '<p>필요 연구: '+chips(required)+'</p>'+
      (required.length?'<div>'+required.map(id=>'<button type="button" data-trace-research-root="'+esc(id)+'">게임 시작 → '+esc(name(id))+' 연구 경로 보기</button>').join('')+'</div>':'')+
      '<p><strong>요구 대원 계급: '+fmt(minRank)+'</strong> · 이 값은 캡틴의 계급 연구 플래그와 다릅니다. 출생 계급 '+fmt(profile.rank??0)+
      '부터 실제 승진 가능한지 별도 확인해야 합니다.</p>'+
      '<p>필요 재료: '+objectGate(t.requiredItems)+
      ' · 훈장: '+objectGate(t.requiredCommendations)+'</p>'+
      '<p>기지 기능: '+chips(t.requiresBaseFunc||[])+
      ' · 반드시 이전에 수행한 시술: '+chips(t.requiredPreviousTransformations||[])+
      ' · 이전에 수행하면 차단되는 시술: '+chips(t.forbiddenPreviousTransformations||[])+'</p>'+
      trainingCapStageHtml(audit.stages[i])+
      '<p class="fine">훈장 실제 획득, 전투 경험·승진, 사망/부상/생존 상태, 아이템 시점, 연구 배제, 성장값 충족 여부는 미증명입니다.</p></li>';
  }).join('');
  return '<details class="origin-transform-gates"><summary>연구·훈련 순서와 maxStats/전투 상한·보너스 초기화 ('+selected.length+'단계)</summary>'+
    '<p class="fine">출생 방법과 별개인 후속 육성 경로입니다. 실제 게임에서 아직 통과한 단계로 단정하지 않습니다.</p>'+
    '<ol>'+details+'</ol></details>';
}

function unresolvedChronologyHtml(profileId){
  const entry=DIAGNOSTICS?.rows?.find(x=>x.profileId===profileId);
  if(!entry)return '';
  const unique=new Map();
  for(const failed of entry.deadlineFailures||[]){
    const key=[failed.event,failed.blockedResearch,failed.deadlineMonth,failed.attemptMonth].join('|');
    if(!unique.has(key))unique.set(key,failed);
  }
  const blocked=[...unique.values()];
  const failures=blocked.map(f=>'<li data-expired-research="'+esc(f.blockedResearch)+'">'+
    '<strong>'+esc(name(f.event||f.script))+'</strong> · '+node(f.blockedResearch)+
    '<p><strong>이벤트 종료 '+fmt(f.deadlineMonth)+'개월 / 이 탐색에서 시도한 시점 '+fmt(f.attemptMonth)+'개월</strong></p>'+
    '<p class="fine">독립 탐색 목표: '+node(f.probe)+' · 이벤트 '+esc(f.event||'미상')+
    ' / 스크립트 '+esc(f.script||'미상')+'. 이 시도의 시간순 충돌이며 모든 대체 출생 방법의 영구 불가능 증명은 아닙니다.</p>'+
    '<button type="button" data-trace-research-root="'+esc(f.blockedResearch)+
    '">해당 연구의 게임 시작 선행 조건 보기</button></li>').join('');
  const tests=(entry.probes||[]).map(p=>'<li data-origin-probe="'+esc(p.goal)+'">'+node(p.goal)+
    ' · '+(p.success?'개별 연구 경로 재생 성공 ('+fmt(p.steps)+'단계, '+fmt(p.endedMonth)+'개월)':
      '제한 탐색 미완료 ('+esc(p.reason)+')')+'</li>').join('');
  return '<section class="origin-unresolved-chronology" data-unresolved-evidence="'+esc(profileId)+
    '"><h3>미해결 출생처 · 게임 시작 기준 병목 재현</h3><p class="fine">2.1 연구 0개 상태에서 실패한 경로를 별도로 재실행했습니다. 발생하지 않은 이벤트를 지급하거나 지난 월로 되돌리지 않습니다. 성공한 개별 연구들도 하나의 캠페인에서 모두 양립한다는 뜻은 아닙니다.</p>'+
    '<details open><summary>한정 이벤트를 놓친 실제 탐색 사례 '+blocked.length+'건</summary>'+
    (blocked.length?'<ul class="origin-expiration-list">'+failures+'</ul>':
      '<p class="fine">이번 제한 탐색에서는 구체적인 한정 이벤트 실패가 포착되지 않았습니다. 이것이 획득 불가능을 증명하지는 않습니다.</p>')+'</details>'+
    '<details><summary>개별 선행 연구 실현성 시험 '+(entry.probes||[]).length+'건</summary><ul>'+
    tests+'</ul></details><p class="fine">표본·자금·시설은 기존 계산기의 명시적 외부 확보 가정입니다. 이벤트 확률·실물·모든 연구의 공동 충족·최종 최대치 인증은 별도로 검증해야 합니다.</p></section>';
}

function showBirthTech(profile){
  const box=$('#originDetails .origin-tree-result');
  if(!box||!profile)return;
  activeBirthViewer?.dispose();
  const origin=REPORT?.records?.find(r=>r.profileId===profile.id);
  activeBirthViewer=mountAcquisitionTechViewer(box,{
    data:DATA,profile,name,rootLabel:origin?.name||name(profile.sourceId)
  });
  const button=$('#originDetails [data-expand-origin-tree]');
  if(button){button.textContent='테크뷰어 접기';button.setAttribute('aria-expanded','true');}
}
function campaignContextHtml(record,c){
  const context=c.campaignContext,excluded=record.rejectedCandidates||[];
  const fixed=c.steps.find(x=>x.type==='campaignContext');
  const groups=new Map();
  for(const old of excluded)for(const conflict of old.campaignContext.conflicts||[]){
    const key=[conflict.lowerSource?.source,conflict.upperSource?.source,conflict.minimum,conflict.maximum].join('|');
    const row=groups.get(key)||{conflict,count:0,ids:[]};row.count++;row.ids.push(old.id);groups.set(key,row);
  }
  const proof=[...groups.values()].map(({conflict:x,count,ids})=>
    '<li><strong>'+esc(name(x.upperSource?.source||'미확인 이벤트'))+'</strong>는 난이도 '+fmt(x.maximum)+
    ' 이하, <strong>'+esc(name(x.lowerSource?.source||'미확인 이벤트'))+'</strong>는 '+fmt(x.minimum)+
    ' 이상을 요구합니다. 같은 캠페인에서 함께 충족 불가 · '+count+'개 후보 제외.'+
    '<details><summary>원본 출처·보존 후보 ID</summary><p>'+esc(x.upperSource?.source)+' / '+esc(x.lowerSource?.source)+
    '</p><p class="id">'+ids.map(esc).join(' · ')+'</p></details></li>').join('');
  return '<section class="origin-campaign-audit" data-campaign-compatible="true">'+
    '<h3>같은 캠페인에서 성립하는 연구 순서인가요?</h3>'+
    '<p><strong>난이도 조건 일치</strong> · '+(fixed?'이 후보는 게임 시작 난이도 '+fmt(fixed.difficulty)+'로 고정':
      '원본 난이도 조건상 허용되는 값: '+context.allowedDifficulties.map(fmt).join(', '))+'</p>'+
    '<p class="fine">검증 범위: 연구 순서·난이도 · 기타 자원·이벤트·성장 최대치는 조건부</p>'+
    (excluded.length?'<details class="origin-rejected-candidates"><summary>비교에서 제외한 과거 후보 '+excluded.length+'개 · 원본 기록 보존</summary>'+
      '<p>수치 계산이 맞아도 서로 다른 난이도의 이벤트를 섞은 후보는 달성 경로가 아닙니다. 순위와 최고값 비교에 사용하지 않습니다.</p><ul>'+proof+'</ul></details>':'')+
    '</section>';
}
function assumptionHtml(c){return c.assumptions.map(s=>{
  if(s.type==='externalInputs')return '<li>'+esc(s.reason)+'<br>'+Object.entries(s.items||{}).map(([id,n])=>esc(name(id))+' ×'+fmt(n)).join(' · ')+(s.functions?.length?' · 기지 기능 '+s.functions.map(esc).join(', '):'')+(s.funds?' · 자금 '+fmt(s.funds):'')+'</li>';
  if(s.type==='campaignContext')return '<li>게임 시작 난이도 '+fmt(s.difficulty)+' 고정 · 도중 변경 없음</li>';
  if(s.type==='repeatResearch')return '<li>'+node(s.id)+'을 별도 연구실 프로젝트로 다시 수행 · 남은 보상·보호 조건·표본 재검사 · 연구 기간과 실제 실행은 미검증</li>';
  if(s.type==='freeResearch')return '<li>'+node(s.source)+' 완료 시 '+node(s.research)+' 무료 지급 추첨 결과를 가정</li>';
  if(s.type==='eventResearch')return '<li>이벤트 '+esc(s.event)+' / '+esc(s.script)+'에서 '+node(s.research)+' 지급을 가정</li>';
  if(s.type==='recruit')return '<li>출생 최솟값 벡터 · 실제 생성 난수 미실측'+(s.script?' · 출생 이벤트 '+esc(s.script):'')+'</li>';
  return '<li>게임 경과 '+fmt(s.month)+'개월 · 유지비·외부 사건 미검증</li>';
}).join('');}
function routeEfficiencyHtml(candidates,selected,metric='growth'){
  if(metric!=='growth'&&metric!=='provisional')return '';
  const ties=routeTieEvidence(candidates,selected,x=>score(x,metric),metric);
  const equals=ties.sameVector.filter(x=>x.id!==selected.id)
    .sort((a,b)=>excludedTrainingCount(a)-excludedTrainingCount(b)||
      transformationCount(a)-transformationCount(b));
  const alternatives=equals.length?
    '<ol>'+equals.slice(0,8).map(x=>'<li><button type="button" data-candidate="'+esc(x.id)+'">'+
      esc(x.description)+' · 시술 '+transformationCount(x)+'단계 · 기록된 훈련 배제 '+
      excludedTrainingCount(x)+'종'+(metric==='growth'?' · 연구·시술 잠정 합계 '+fmt(x.display?.total):'')+
      '</button></li>').join('')+'</ol>'+
      (equals.length>8?'<p class="fine">나머지는 아래 전체 후보 비교에서 확인할 수 있습니다.</p>':''):
    '<p>현재 등록된 후보에서는 최종 병종과 12종 상한이 모두 같은 다른 경로가 없습니다.</p>';
  const vector=statVector(selected,metric);
  const deltaLabel=x=>{
    const stats=statVector(x,metric);
    const delta=DISPLAY_STATS.filter(k=>stats[k]!==vector[k]).map(k=>{
      const diff=stats[k]-vector[k];
      return esc(DATA.statLabels[k]||k)+' '+(diff>0?'+':'')+fmt(diff);
    });
    if(x.finalSoldierType!==selected.finalSoldierType)
      delta.unshift('최종 병종 '+esc(name(x.finalSoldierType)));
    return delta.join(' · ');
  };
  const different=ties.differentVector.length?
    '<details class="route-score-tradeoffs" data-same-total-different-vector="'+
      ties.differentVector.length+'"><summary>합계는 같지만 능력치 배분·병종이 다른 대안 '+
      ties.differentVector.length+'건</summary>'+
      ties.differentVector.slice(0,6).map(x=>
        '<p><button type="button" data-candidate="'+esc(x.id)+'">'+
        esc(x.description)+' · '+deltaLabel(x)+'</button></p>').join('')+
      (ties.differentVector.length>6?'<p class="fine">나머지는 아래 전체 후보에서 확인할 수 있습니다.</p>':'')+
      '<p class="fine">12종 합계가 같아도 배분·최종 병종이 다르면 동등한 육성 결과로 합치지 않았습니다. 우열은 자동으로 확정하지 않습니다.</p></details>':'';
  return '<details class="origin-route-efficiency route-efficiency" data-route-efficiency="true" '+
    'data-exact-peers="'+ties.sameVector.length+'" data-different-vector="'+
    ties.differentVector.length+'" data-equal-vector-count="'+ties.sameVector.length+
    '" data-equal-total-different-vector="'+ties.differentVector.length+'"><summary>경로 효율 · 시술 '+
    transformationCount(selected)+'단계 · 같은 최종 병종·12종 상한 대안 '+equals.length+'개</summary>'+
    '<p>선택 경로: 시술·변신 '+transformationCount(selected)+'단계 · 원본 규칙에 기록된 '+
    '훈련 배제 대상 '+excludedTrainingCount(selected)+'종'+
    (metric==='growth'?' · 연구·시술 잠정 합계 '+fmt(selected.display?.total):'')+
    '. 등록된 동일 최종 병종·12종 상한의 연구 재생 후보에 한정하여 배제 선택지 손실, 다음으로 시술 단계 수를 비교합니다.</p>'+
    alternatives+different+
    '<p class="fine">같은 조건부 상한이어도 연구·시술 직후의 능력치와 성장에 필요한 시간은 다를 수 있습니다. '+
    '연구·재료·시간·출생 난수의 비용 우열 및 전역 최적성은 미인증입니다. '+
    '원본 연구·시술 증거는 삭제하거나 생략하지 않습니다.</p></details>';
}
function routeIterativeEvidenceHtml(claim){
  const found=(ITERATIVE?.findings||[]).filter(x=>x.profileId===claim.id&&
    x.target===claim.target&&x.sourceCandidate===claim.sourceCandidate&&
    x.firstTransformIndex===claim.removedStepIndex);
  if(!found.length)return '';
  const records=found.map(proof=>{
    const names=[claim.removed,proof.secondTransform].map(id=>esc(name(id))).join(' + ');
    const extra=proof.newInputs.flatMap(x=>[
      ...Object.entries(x.items||{}).map(([id,n])=>esc(name(id))+' ×'+fmt(n)),
      ...(x.funds?['자금 '+fmt(x.funds)]:[])
    ]);
    return '<li data-second-training="'+esc(proof.secondTransform)+'"><strong>'+
      names+'</strong> · 원래 시술 '+(proof.remainingTransforms.length+2)+
      ' → '+proof.remainingTransforms.length+'단계'+
      '<p>남긴 훈련: '+(proof.remainingTransforms.length?proof.remainingTransforms.map(id=>esc(name(id))).join(' → '):'없음')+'</p>'+
      '<p>두 번째 훈련과 함께 생략을 검증한 연구·지급 단계 '+proof.newResearch.length+
      '개, 외부 투입 가정 '+proof.newInputs.length+'개'+
      (extra.length?' · '+extra.join(' · '):'')+'</p></li>';
  }).join('');
  return '<details class="route-iterative-proof" data-iterative-proof="'+found.length+'">'+
    '<summary>추가 검증 · 2개 훈련을 함께 생략한 경로 '+found.length+'건</summary>'+
    '<p class="fine">첫 훈련과 연구·자원을 생략한 상태에서 다른 훈련까지 제거하고, 동일한 최종 병종·12종 성장 상한과 연구·사건 시간순 재생을 재검사했습니다. 전체 경로 중 최단임을 증명하지는 않습니다.</p>'+
    '<ul>'+records+'</ul></details>';
}
function routeDependencyEvidenceHtml(claim){
  const proof=DEPENDENCIES?.findings?.find(x=>x.id===claim.id&&x.target===claim.target&&
    x.sourceCandidate===claim.sourceCandidate&&x.removedStepIndex===claim.removedStepIndex);
  if(!proof)return '';
  const research=proof.removedResearch.map(s=>esc(name(s.id))+
    (s.type==='freeResearch'?' (무료 지급 가정)':''));
  const itemNotes=proof.removedInputs.flatMap(s=>[
    ...Object.entries(s.items||{}).map(([id,n])=>esc(name(id))+' ×'+fmt(n)),
    ...(s.funds?['자금 '+fmt(s.funds)]:[]),
    ...(s.functions||[]).map(id=>'기지 기능 '+esc(name(id)))
  ]);
  return '<div class="route-dependency-proof" data-dependency-proof="true" '+
    'data-research-removed="'+proof.removedResearch.length+
    '" data-input-removed="'+proof.removedInputs.length+'">'+
    '<p><strong>연구·자원 연동 재생 검증</strong> · 연구/지급 단계 '+proof.removedResearch.length+
    '건, 외부 투입 가정 '+proof.removedInputs.length+'건 추가 생략.</p>'+
    (research.length?'<p>삭제 후에도 경로가 통과한 연구·지급: '+research.join(' · ')+'</p>':
      '<p>연구 단계의 추가 생략은 전체 재생을 통과하지 못해 원본 연구 순서를 유지했습니다. 다른 경로에서의 제거 가능성은 미검증입니다.</p>')+
    (itemNotes.length?'<p>이 경로에서 생략 가능한 <strong>외부 확보 가정</strong>: '+
      itemNotes.join(' · ')+'</p>':'')+
    '<p class="fine">훈련과 위 단계들을 함께 삭제하고 남은 연구·사건·재료·기지 조건을 원본 규칙으로 처음부터 재생했습니다. 나열한 수량은 기존 입력 가정이며 실제 순절감 비용이 아닙니다. 12종 조건부 상한 동일 · 전역 최적성 미증명.</p>'+routeIterativeEvidenceHtml(claim)+'</div>';
}
function routePruningEvidenceHtml(record,selected,sharedTerminal=false){
  const target=sharedTerminal?'chort':'origin';
  const claims=(PRUNING?.findings||[]).filter(x=>x.id===record.profileId&&x.target===target);
  if(!claims.length)return '';
  const withSource=claims.map(x=>({claim:x,source:record.candidates.find(c=>c.id===x.sourceCandidate)}))
    .filter(x=>x.source);
  const sameVector=withSource.filter(x=>sameRouteStatVector(x.source,selected));
  const shorter=sameVector.filter(x=>x.claim.proposedTransforms.length<transformationCount(selected));
  const rows=withSource.sort((a,b)=>
    a.claim.proposedTransforms.length-b.claim.proposedTransforms.length||
    a.claim.sourceCandidate.localeCompare(b.claim.sourceCandidate));
  const entries=rows.map(({claim:x,source})=>
    '<li><strong>생략: '+esc(name(x.removed))+'</strong> · 시술 '+
      x.priorTransforms.length+' → '+x.proposedTransforms.length+'단계 · 조건부 상한 합계 '+
      fmt(x.originalGrowth)+' · '+(sameRouteStatVector(source,selected)?
        '현재 선택 경로와 12종 성장상한 동일':'다른 원본 경로 기준의 12종 상한 동일')+
      '<p>재생된 훈련 순서: '+x.proposedTransforms.map(id=>esc(name(id))).join(' → ')+'</p>'+routeDependencyEvidenceHtml(x)+
      '<button type="button" data-candidate="'+esc(x.sourceCandidate)+
      '">생략 전 원본 후보·전체 연구 증거 확인</button></li>').join('');
  return '<details class="origin-route-pruning" data-pruning-proofs="'+claims.length+
    '" data-pruning-shorter="'+shorter.length+'"><summary>원본 규칙 재생 · 실효 상한을 바꾸지 않는 훈련 생략 '+
    claims.length+'건</summary>'+
    (shorter.length?'<p class="scope-note"><strong>현재 선택한 경로보다 짧고 12종 성장상한이 같은 시술 경로 '+
      shorter.length+'건</strong>을 발견했습니다. 아래 순서를 참고하세요.</p>':'')+
    '<p class="fine">기존 원본 경로에서 시술 단계 하나만 생략하고 <strong>연구·자원 입력과 사건 순서는 그대로 유지</strong>한 뒤, '+
    '캠페인 재생 및 성장 상한 12종 일치를 검사했습니다. 비용·시간 최적화와 실제 게임 실행, 전역 최고값은 증명하지 않습니다.</p>'+
    '<ol>'+entries+'</ol></details>';
}
async function openOrigin(id,candidateId=null,{sharedTerminal=false,originCapRoute=null,populationRoute=null}={}){
  if(blocked)return;const generation=++replayGeneration;
  const floorOpen=selected===id&&Boolean($('.route-birth-floor-explorer')?.open);
  candidateScanGeneration++;
  if(candidateScanCache&&
    (candidateScanCache.profileId!==id||candidateScanCache.terminal!==sharedTerminal))
    candidateScanCache=null;
  activeBirthViewer?.dispose();activeBirthViewer=null;
  const record=REPORT.records.find(r=>r.profileId===id);if(!record)return;
  const profile=DATA.profiles.find(p=>p.id===id);
  const birthPaths='<section class="origin-tree-action"><strong>이 병사는 어떻게 얻나요?</strong><button type="button" data-expand-origin-tree="'+esc(profile.id)+'" aria-expanded="true">테크뷰어 접기</button><div class="origin-tree-result" data-origin-tree-result="'+esc(profile.id)+'"></div></section>'+
    '<details class="origin-source-expansion"><summary>원본 출생·공급 기록 전체 보기 (기술 자료)</summary>'+
    '<p class="fine">이곳에는 연구 ID, 공급 스크립트, 다른 출생처와의 상세 연결을 원본 단위로 보존합니다.</p>'+
    renderAcquisitionPaths(profile,DATA,{esc,fmt,name,node})+'</details>';
  const metric=$('#catalogMetric').value;
  selected=id;const eligible=sharedTerminal?chortCandidates(record):comparable(record);
  const c=eligible.find(c=>c.id===(candidateId||best(record,metric==='growth'||metric==='route-expected'?'growth':'provisional')?.id));
  activeCandidateId=c?.id||null;
  const initialChoiceHtml=renderInitialChoiceEvidence(auditInitialChoiceEvidence(profile,DATA,c),{name,esc});
  const reachedDepth=Math.max(0,...record.candidates.map(x=>x.transforms.length));
  const currentIntegrated=integratedOrigins.get(id);
  const currentNotice=currentIntegrated&&!sharedTerminal?'<p class="scope-note"><strong>최신 통합 성장 상계: '+currentIntegrated.steps+'개 시술 · '+fmt(currentIntegrated.total)+'점 · 등록 후보 최장 '+currentIntegrated.longestSteps+'단계.</strong> '+integratedRouteLink(currentIntegrated,'최신 경로와 분기별 상한 열기')+' · 아래는 기존 출생처 연구 재생 기록입니다.</p>':'';
  const coverageNote=currentNotice+(!activeBranch?renderAllOriginCap(sharedRegistry,id,originCapRoute,DATA.statLabels):'')+renderOriginExtension(sharedRegistry,id,originCapRoute,DATA.statLabels,activeBranch)+populationUnlockOriginMarkup(sharedRegistry,id,activeBranch,populationRoute,DATA.statLabels)+populationEventOriginMarkup(sharedRegistry,id,activeBranch,populationRoute,DATA.statLabels)+populationPreboundOriginMarkup(sharedRegistry,id,activeBranch,populationRoute,DATA.statLabels)+populationOriginMarkup(sharedRegistry,id,activeBranch,populationRoute,DATA.statLabels)+'<p class="scope-note" data-origin-search-coverage="true">등록된 조건부 연구·시술 경로 '+
    record.candidates.length+'개 · 실제 기록 최장 '+reachedDepth+'단계'+
    (record.searchScope?.maxLayers?' · 탐색 설정 상한 '+record.searchScope.maxLayers+'단계':'')+
    '. <strong>전체 경로 완전탐색 및 실제 게임 완주 인증은 아직 없습니다.</strong> 연구·자원·진급·이벤트 가정이 남아 있으며, 등록 건수가 가능한 특성 조합의 총수는 아닙니다.'+
    (id==='manufacture:STR_THEBAN_ASSAULT_CLONE'?' <a href="../../data/soldier-assault-clone-coverage.json">돌격클론 검증 범위 원본 JSON</a>':'')+'</p>';
  const host=$('#originDetails');host.hidden=false;
  host.innerHTML='<div class="detail-head"><h2>'+esc(record.name)+'</h2><button id="originDetailClose">닫기</button></div><p class="muted">등록 경로의 원본·현재 수치를 재대조하는 중…</p>';
  await new Promise(ok=>setTimeout(ok,0));
  if(generation!==replayGeneration)return;
  if(metric==='birth-expected'){
    host.innerHTML='<div class="detail-head"><div><p class="eyebrow">원본 신병 생성 RNG</p><h2>'+esc(record.name)+'</h2></div><button id="originDetailClose">닫기</button></div>'+
      '<p class="scope-note">이 화면의 평균·확률은 최초 생성 시점에만 적용됩니다. 이후 성장은 위의 능력치 보기에서 「성장 완료 가정」으로 선택하세요. 성장 완료 확률은 아직 이 모델에 포함되지 않습니다.</p>'+
      '<p><button type="button" data-compare-origin="'+esc(record.profileId)+'">이 출생처를 비교 기준으로 선택</button> <button type="button" data-switch-metric="growth">동일 병종의 등록 성장 경로 확인</button></p>'+
      birthDistributionHtml(record)+birthPaths+initialChoiceHtml+
      (c?'<p class="fine">이 출생처의 등록 연구·육성 후보 '+record.candidates.length+'건은 「성장 완료 가정」에서 확인할 수 있습니다.</p>':unresolvedChronologyHtml(id));
    showBirthTech(profile);
    return;
  }
  if(!c){
    const gaps=(record.researchBottlenecks||[]).map(g=>
      '<li>'+node(g.id)+(g.neededItem?' <small>표본 ID '+esc(g.neededItem)+'</small>':'')+' <strong>'+({RULE_NOT_INDEXED:'연구 ID·이벤트 출처 미색인',UNBACKED_SAMPLE_TOKEN:'실물 표본 없는 조건 플래그 · 지급 증거 필요',AUTO_QUEUE_SOURCE_UNVERIFIED:'비용 0 자동 연구 출처 미확인',EVENT_CHRONOLOGY_UNRESOLVED:'이벤트 지급 시간순 미검증',SOURCE_ROUTE_UNRESOLVED:'연구 공급 대체 경로 미해결',NOT_INDEXED:'이벤트·지급 출처 미색인',NO_SUPPLY_METHOD:'현재 공급 방법 미확보',UPSTREAM_UNRESOLVED:'상위 선행 경로 미해결',CHRONOLOGY_UNRESOLVED:'시간순 연구 재생 미완결',SEARCH_LIMIT:'제한 탐색 미완결'}[g.kind]||'추가 검증 필요')+'</strong> · '+esc(g.reason)+'</li>').join('');
    host.innerHTML='<div class="detail-head"><h2>'+esc(record.name)+'</h2><button id="originDetailClose">닫기</button></div>'+
      coverageNote+'<p><strong>기존 출생처 원장의 완결 경로 미확보</strong></p><p>'+node(record.unresolved?.id||record.profileId)+'</p>'+
      '<p>'+esc(record.unresolved?.reason||'조사 중')+'</p>'+birthPaths+initialChoiceHtml+unresolvedChronologyHtml(id)+
      '<h3>추가 확인이 필요한 상위 연구·이벤트 근거</h3><ul>'+gaps+'</ul>'+
      '<p>이것은 현재 탐색기가 발견하지 못한 공급·시간순 경로입니다. 제한 탐색의 실패는 영구 불가능 판정이 아닙니다. 실제 획득을 증명하기 전에는 잠정 수치를 만들어 넣지 않습니다.</p>';
    showBirthTech(profile);
    return;
  }
  let replay=verified.get(c.id);
  if(!replay){replay=replayOriginWitness(c.steps,DATA,{requireCompatibleContext:true});verified.set(c.id,replay);}
  if(generation!==replayGeneration)return;
  if(!replay.ok||!replay.exact||replay.total!==c.total||JSON.stringify(replay.stats)!==JSON.stringify(c.stats)){
    sourceFail('선택 경로 재생 불일치: '+(replay.reason||c.id));return;
  }
  const replayMember=replay.world.soldiers.find(x=>x.id==='origin');
  if(!replayMember||Math.max(0,Number(replayMember.state.currentStats.mana)+Number(replay.bonus?.mana||0))!==c.display.stats.mana){
    sourceFail('12번째 능력치 실제 재생 불일치: '+c.id);return;
  }
  if(JSON.stringify(researchBranchEvidence(replay,DATA.researchRules))!==JSON.stringify(c.branchChoices)){
    sourceFail('연구 분기 폐쇄 시점 재생 불일치: '+c.id);return;
  }
  const finalResearch=c.steps.filter(s=>s.type==='research'||s.type==='repeatResearch'||s.type==='freeResearch').at(-1);
  const alternateSet=sharedTerminal?chortCandidates(record):comparable(record);
  const bestAlternate=metric=>alternateSet.reduce((winner,x)=>
    preferredOriginCandidate(winner,x,c=>score(c,metric),metric),null);
  const bonus=[...alternateSet].sort((a,b)=>b.display.bonusTotal-a.display.bonusTotal||b.display.total-a.display.total)[0];
  const useGrowth=metric==='growth'&&c.growth?.kind==='conditional-upper-envelope';
  const routePreview=metric==='route-expected'?routeRoll(record,c):null;
  const useRoute=routePreview?.kind==='conditional-route-distribution';
  const shown=useRoute?{total:routePreview.expectedTotal,raw:routePreview.rawStats,
    bonus:routePreview.bonus,stats:routePreview.stats}:useGrowth?c.growth:c.display;
  const finalBody=DATA.soldiers.find(x=>x.id===c.finalSoldierType);
  const staminaBasis=useGrowth?
    '<p class="scope-note" data-growth-stamina-basis="true">기력 상한 근거: '+
    esc(name(c.finalSoldierType))+'의 원시 성장캡 '+fmt(finalBody?.statCaps?.stamina)+
    ' · 성장·변신 후 원시 상계 '+fmt(shown.raw.stamina)+
    ' + 동일 병사의 영구 특성 '+fmt(shown.bonus.stamina)+
    ' = 조건부 실효 상계 '+fmt(shown.stats.stamina)+
    '. 전투 종료 보조 성장의 마지막 증가분은 원시 성장캡을 최대 +1 초과할 수 있습니다. 실제 달성·동시 달성은 미검증입니다.</p>':'';
  host.innerHTML='<div class="detail-head"><div><p class="eyebrow">조건부 잠정 최고 · 연구 경로 재생 완료</p><h2>'+esc(record.name)+'</h2></div><button id="originDetailClose">닫기</button></div>'+
    '<p>'+esc(record.soldierName)+'에서 출생 → '+esc(name(c.finalSoldierType))+' · <strong>'+(useRoute?'출생 RNG·시술 후 12종 조건부 평균 ':metric==='route-expected'?'경로 RNG 평균 미산출 ':useGrowth?'성장 완료 가정 · 12종 상한 합계 ':'12종 연구·시술 합계 ')+(useRoute?fmtMean(shown.total):metric==='route-expected'?'—':fmt(shown.total))+'</strong> · 영구 특성 12종 합 '+fmt(c.display.bonusTotal)+'</p>'+
    '<p class="scope-note">'+(useRoute?esc(routePreview.caveat):metric==='route-expected'?esc(routePreview?.reason||'계산 근거 부족'):useGrowth?esc(c.growth.caveat):esc(c.scope))+' · 최종 능력치 달성 확률이나 전역 최대치가 아닙니다.'+'</p>'+
    (sharedTerminal?'<p class="fine">코르트 전용 경로는 출생처 순위의 비교 기준으로 선택하지 않습니다.</p>':
      '<p><button type="button" data-compare-candidate="'+esc(c.id)+'" data-compare-profile="'+esc(record.profileId)+'">이 경로를 표의 비교 기준으로 선택</button></p>')+
    (!sharedTerminal&&baseline(metric)?'<p class="scope-note">현재 경로의 비교는 표에서 선택한 동일 능력치 방식만 사용하며, 연구·자원 조건이 다른 두 경로를 한 대원에게 합산하지 않습니다.</p>'+compareEvidenceHtml(viewFor(record,metric,c.id),baseline(metric)):'')+
    coverageNote+
    (sharedTerminal?'<p class="shared-terminal-origin-note"><strong>코르트 별도 병종 경로</strong> · 출생처 기본 비교에서 제외된 변신 증거입니다. <a href="#chortTarget">코르트 목록 보기</a></p>':sharedTerminalOriginNote(record,profile))+
    campaignContextHtml(record,c)+staminaBasis+birthPaths+initialChoiceHtml+transformationGateHtml(c,profile)+(metric==='route-expected'?routeRollHtml(record,c,sharedTerminal):statGrid(c,metric))+
    (sharedTerminal?'':educationChoicesHtml(record,profile,c))+routeFutureOptionsHtml(c)+
    routeEfficiencyHtml(alternateSet,c,metric)+
    (metric==='growth'?routePruningEvidenceHtml(record,c,sharedTerminal):'')+
    '<h3>경로 요약</h3><p>'+esc(c.description)+'</p><p>사전 완료 연구 0개 → '+c.researchCount+'개 연구 처리 → 마지막 연구 '+(finalResearch?node(finalResearch.id||finalResearch.research):'출생 이벤트')+'. 전체 연구 순서는 화면을 채우지 않고 재생 증거에 보존합니다.</p>'+
    '<h3>이 경로의 분기 선택과 배제</h3>'+choiceHtml(c)+
    '<details><summary>훈련으로 배제되는 다른 선택</summary>'+c.trainingExclusions.map(t=>'<h4>'+esc(name(t.id))+'</h4>'+t.excludes.map(e=>'<p>'+esc(name(t.id))+(e.direction==='bidirectional'?' ↔ ':' → ')+esc(name(e.id))+' · '+(e.direction==='bidirectional'?'양방향':'일방향')+' 이력 배제</p>').join('')).join('')+'</details>'+
    '<details class="assumptions"><summary>필수 확인 · 남은 자원·출생·확률 가정 '+c.assumptions.length+'건</summary><ul>'+assumptionHtml(c)+'</ul><h4>모델의 미검증 조건</h4><ul>'+(c.limitations||[]).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul><details><summary>자동 연구·lookup 조건부 처리 기록</summary><ul>'+(c.modelAssumptions||[]).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></details></details>'+
    '<details><summary>'+(sharedTerminal?'코르트 변신 후보끼리 비교':'다른 완결 후보 · 목표 A/B 비교')+'</summary><p>목표 A 영구 특성 12종 합 최고 '+fmt(bonus?.display.bonusTotal)+' / 연구·시술 12종 합 최고 '+fmt(bestAlternate('provisional')?.display.total)+' / 성장 완료 조건부 상한 합 최고 '+fmt(bestAlternate('growth')?.growth?.total)+'. 서로 다른 병사·연구 경로의 유리한 수치를 합치지 않습니다. 난이도 충돌 후보는 비교에서 제외합니다.</p>'+alternateSet.map(x=>'<p><button data-candidate="'+x.id+'">'+esc(x.description)+' · 성장상한 '+fmt(x.growth?.total)+' / 연구·시술 '+fmt(x.display.total)+'</button></p>').join('')+'</details>'+
    '<p class="fine">재생: 통과 · 실제 게임 실측: 없음 · 전역 최적성: 미증명 · 원본 v.o2. 더 높은 경로는 같은 출생처의 비교 후보로 등록한 뒤 갱신합니다.</p>';
  if(metric==='route-expected'&&floorOpen){
    const floor=$('.route-birth-floor-explorer');if(floor)floor.open=true;
  }
  if(metric==='route-expected'&&candidateScanCache?.profileId===id){
    const scan=$('.candidate-expectation-scan');
    if(scan){scan.open=true;rerankCandidateExpectations();}
  }
  showBirthTech(profile);
}
function showResearch(id){
  const dialog=$('#researchDialog');$('#researchDetail').innerHTML='<p class="eyebrow">X-PIRATEZ 2.1 연구 원본</p><h2>'+esc(name(id))+'</h2><p class="id">'+esc(id)+'</p>'+
    '<button type="button" class="research-trace-launch" data-trace-research-root="'+esc(id)+'">게임 시작부터 이 연구의 획득 경로 보기</button>'+
    renderResearchRelations(id,DATA.researchRules,CATALOG.names);
  if(!dialog.open)dialog.showModal();
}
function showTraining(id){
  const t=DATA.transformations.find(t=>t.id===id);if(!t)return;
  $('#researchDetail').innerHTML='<p class="eyebrow">병종 DB · 훈련 원본 근거</p><h2>'+esc(t.koName)+'</h2><p>'+esc(id)+'</p><h3>무조건 필요</h3><p>'+t.requires.map(node).join(' ')+'</p><h3>필수 이전 훈련</h3><p>'+t.requiredPreviousTransformations.map(esc).join(' · ')+'</p><h3>금지 이전 훈련</h3><p>'+t.forbiddenPreviousTransformations.map(esc).join(' · ')+'</p><p>이 정보는 병종 경로의 근거입니다. 별도 훈련 조합기나 저장 파일 입력 화면은 없습니다.</p><h3>직접 변화 / 영구 특성</h3><div class="stat-grid">'+DISPLAY_STATS.map(k=>'<div><small>'+esc(DATA.statLabels[k])+'</small><strong>'+fmt(t.flatOverallStatChange?.[k])+' / '+fmt(t.traitStats?.[k])+'</strong></div>').join('')+'</div>';
  $('#researchDialog').showModal();
}
async function init(){try{
  const json=async path=>{const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw Error(path+' HTTP '+r.status);return r.json()};
  [DATA,REPORT,CATALOG,DIAGNOSTICS,PRUNING,DEPENDENCIES,ITERATIVE]=await Promise.all([loadRuntime('../../data/soldiers-modern-index.json'),json('../../data/soldier-origin-candidates.json').then(expandOriginArchive),json('../../data/soldier-source-catalog.json'),json('../../data/soldier-unresolved-diagnostics.json'),json('../../data/soldier-route-pruning-audit.json'),json('../../data/soldier-route-dependency-audit.json'),json('../../data/soldier-route-iterative-audit.json')]);
  await validate();
  try{const registry=await loadBranchSoldierResults();sharedRegistry=registry;branchScope=registry.branches.find(b=>b.id===activeBranch)||null;integratedOrigins=buildOriginGrowthIndex(registry,DATA,DISPLAY_STATS,{branchId:activeBranch});integratedCoverage=registryCoverage(registry,integratedOrigins,REPORT.records.length);if(!activeBranch)integratedOrigins=mergeAllOriginRows(registry,integratedOrigins,DISPLAY_STATS);integratedOrigins=mergeOriginExtensionRows(registry,integratedOrigins,DISPLAY_STATS,activeBranch);bodyRows=buildBodyGrowthIndex(registry,DATA,DISPLAY_STATS,REPORT.records,candidateMatchesCampaign,{branchId:activeBranch});}
  catch(error){integratedLoadError=error.message;console.warn('통합 육성 상계 미연결:',error.message);bodyRows=buildBodyGrowthIndex(null,DATA,DISPLAY_STATS,REPORT.records,candidateMatchesCampaign,{branchId:activeBranch});}
  if(DIAGNOSTICS.sourceVersion!=='v.o2'||
    JSON.stringify(DIAGNOSTICS.sourceHashes)!==JSON.stringify(DATA.meta.source.rules)||
    DIAGNOSTICS.registryHash!==REPORT.sourceHash||
    DIAGNOSTICS.unresolvedCount!==REPORT.summary.unresolved||
    DIAGNOSTICS.rows.some(x=>!REPORT.records.some(r=>r.profileId===x.profileId&&!r.candidates.length)))
    throw Error('미해결 출생 경로 진단 원본이 현재 병종 DB와 일치하지 않음');
  const complete=REPORT.records.filter(r=>allCompatible(r).length).length;
  const ranked=REPORT.records.reduce((n,r)=>n+comparable(r).length,0);
  const separated=REPORT.records.reduce((n,r)=>n+chortCandidates(r).length,0);
  if(ranked+separated!==REPORT.summary.compatibleWitnesses)
    throw Error('분리한 코르트 후보와 원본 연구 경로 합계 불일치');
  const rankedCount=$('#originRankedCount');
  if(rankedCount)rankedCount.textContent=fmt(ranked);
  $('#catalogSummary').innerHTML=[['등록 출생처','72','같은 병종이어도 출생처 분리'],['연구 순서·난이도 일치',complete+'/72','실물·시간·이벤트는 조건부'],['출생처 비교 후보',ranked,'코르트 변신 '+separated+'건은 별도 병종'],['최종 최대치 인증','0','실측·전역 최고값은 미증명']].map(([label,v,note])=>'<article class="card"><small>'+label+'</small><strong>'+v+'</strong><p>'+note+'</p></article>').join('');
  const coverageNode=$('#registryCoverage');
  if(coverageNode){
    const u=integratedCoverage;
    coverageNode.textContent=u?(activeBranch?'선택 분기 '+(branchScope?'#'+branchScope.rank:'미확인')+' · ':'')+'공통 원장 '+fmt(u.branches)+'개 분기 · 육성 연결 '+fmt(u.conditionalPaths)+'경로 (최장 '+fmt(u.unifiedDepth)+'회)'+(u.careerPaths?' · 고급 미재생 '+fmt(u.careerPaths)+'경로 (최장 '+fmt(u.careerDepth)+'회)':'')+' · 최신 원장 연결 출생처 '+u.updatedOrigins+'/'+u.originCount+'개 · 실제 최고 인증 0건.':'통합 원장 연결 실패: '+(integratedLoadError||'자료 없음');
    if(u&&sharedRegistry?.originCap12)coverageNode.textContent+=' '+allOriginCoverageText(sharedRegistry);
    if(u&&sharedRegistry?.populationSearch)coverageNode.textContent+=' '+populationCoverageText(sharedRegistry);
    if(u&&sharedRegistry?.originExtension12){const s=sharedRegistry.originExtension12.summary;coverageNode.textContent+=' · 활성 연구 후속: '+fmt(s.seedReplayed)+'개 접두부, '+fmt(s.extendedOrigins)+'/72 출생처, '+fmt(s.registered)+'개 대표, '+fmt(s.canonicalRootMatchedBranches)+'개 관측 정식 분기 뿌리 일치 (공동 연구 이력 미인증).';}
    coverageNode.dataset.registryStatus=u?'loaded':'unavailable';
  }
  $('#routePruningScope').textContent='훈련 1단계 생략 28건을 시간순 재생한 뒤, 동일한 12종 조건부 상한 아래 연구·지급 단계 추가 생략 '+
    DEPENDENCIES.stats.withResearchRemoved+'건, 외부 자원 가정 생략 '+
    DEPENDENCIES.stats.withInputAssumptionsRemoved+
    '건과 2개 훈련 동시 생략 '+ITERATIVE.stats.secondTransformValidated+'건을 확인했습니다. 비용·전역 최적성은 인증하지 않았습니다. 각 출생처 상세에서 경로별 근거를 확인하세요.';
  renderSharedTerminalCatalog();
  const assaultId='manufacture:STR_THEBAN_ASSAULT_CLONE';
  if(!REPORT.records.some(r=>r.profileId===assaultId))throw Error('돌격 클론 독립 출생처 누락');
  $('#family').innerHTML='<option value="">전체 병종</option>'+DATA.soldiers.map(s=>'<option value="'+s.id+'">'+esc(s.koName)+'</option>').join('')+
    '<option value="origin:'+assaultId+'">돌격 클론 (농부 기반 · 별도 출생처)</option>';
  const picker=$('#compareOrigin');
  picker.innerHTML='<option value="">기준 선택 안 함</option>'+REPORT.records.map(r=>'<option value="'+esc(r.profileId)+'">'+esc(r.name)+' · '+esc(r.soldierName)+'</option>').join('');
  picker.addEventListener('change',()=>setComparison(picker.value));
  $('#compareClear').addEventListener('click',()=>setComparison(null));
  const params=new URLSearchParams(location.search);$('#search').value=params.get('q')||'';if(params.has('family'))$('#family').value=params.get('family');
  if(params.has('compare')&&REPORT.records.some(r=>r.profileId===params.get('compare'))){comparison={profileId:params.get('compare'),candidateId:null};picker.value=comparison.profileId;}
  if(params.get('group')==='origin'||params.has('profile')||params.has('compare')||REPORT.records.some(r=>r.profileId===params.get('q')))$('#catalogGrouping').value='origin';
  $('#search').addEventListener('input',render);$('#family').addEventListener('change',render);
  $('#catalogGrouping').addEventListener('change',()=>{if($('#catalogGrouping').value==='body')$('#catalogMetric').value='growth';render();});
  $('#originTable').addEventListener('click',e=>{const s=e.target.closest('[data-body-sort]'),o=e.target.closest('[data-body-origins]');if(s){bodySort=s.dataset.bodySort;render();}if(o){$('#catalogGrouping').value='origin';$('#family').value=o.dataset.bodyOrigins;$('#search').value='';render();}});
  $('#catalogMetric').addEventListener('change',()=>{
    render();if(selected&&!$('#originDetails').hidden)void openOrigin(selected,activeCandidateId);
  });
  for(const id of ['#routeGrowthTiming','#routeGrowthAttempts','#routeGrowthSuccess'])
    $(id).addEventListener('change',()=>{
      candidateScanCache=null;
      render();if(selected&&!$('#originDetails').hidden)void openOrigin(selected,activeCandidateId);
    });
  for(const [id,direction] of [['#scrollStatsLeft',-1],['#scrollStatsRight',1]])
    $(id).addEventListener('click',()=>$('#originTableScroll').scrollBy({left:direction*260,behavior:'smooth'}));
  document.addEventListener('change',e=>{
    if(['birthFloorStat','birthFloorObjective','birthFloorDraws',
      'birthFloorTrainingSlots','birthFloorRequiredChance'].includes(e.target.id)){
      rememberBirthFloorPrefs();
      const output=$('#birthFloorResults');
      if(output)output.textContent='선발선 계산 조건이 바뀌었습니다. 가능한 선발선 전부 계산을 다시 실행하세요.';
      return;
    }
    if(e.target.id==='candidateBirthMode'){saveCandidateBirthInputs();return;}
    if(['candidateExpectationObjective','candidateExpectationMinGate',
      'candidateExpectationBody'].includes(e.target.id))rerankCandidateExpectations();
  });
  document.addEventListener('input',e=>{
    if(e.target.matches('[data-birth-stat]')){saveCandidateBirthInputs();return;}
    if(e.target.id==='routeRollThreshold'&&selected&&activeCandidateId){
      const record=REPORT.records.find(r=>r.profileId===selected);
      const candidate=record?.candidates.find(c=>c.id===activeCandidateId);
      const roll=routeRoll(record,candidate),threshold=Number(e.target.value);
      const output=$('#routeRollThresholdResult');
      if(output)output.textContent=roll.kind!=='conditional-route-distribution'? '경로 확률 미산출':
        Number.isSafeInteger(threshold)?'가정이 성립하고 능력치 문턱을 통과한 병사 중 총합 '+fmt(threshold)+' 이상 '+fmtPct(newbornTailChance(roll,threshold)):
        '총합 기준을 정수로 입력해 주세요.';
      return;
    }
    if((e.target.id==='growthAttempts'||e.target.id==='growthSuccess')&&selected){
      const output=$('#growthScenarioResult');if(!output)return;
      const attempts=Number($('#growthAttempts')?.value),success=Number($('#growthSuccess')?.value);
      if(!Number.isSafeInteger(attempts)||attempts<0||attempts>10000||!Number.isFinite(success)||success<0||success>100){
        output.textContent='시행 횟수는 0~10000 정수, 성공률은 0~100%로 입력하세요.';return;
      }
      try{
        const profile=DATA.profiles.find(p=>p.id===selected);
        const body=DATA.soldiers.find(s=>s.id===profile.soldierType);
        const spec=Object.fromEntries(DISPLAY_STATS.map(key=>[key,{
          attempts,cap:body.statCaps[key],bonus:profile.traitStats?.[key]||0,
          kernel:[[0,1-success/100],[1,success/100]]
        }]));
        const result=conditionalGrowthProjection(newbornDistribution(DATA,selected),spec);
        output.innerHTML='<p><strong>명시한 가정하의 12종 기대 합계 '+fmtMean(result.expectedTotal)+'</strong> · 출생 평균 '+fmtMean(newbornDistribution(DATA,selected).total)+' · 차이 '+fmtMean(result.expectedTotal-newbornDistribution(DATA,selected).total)+'</p>'+ 
          '<div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>능력치</th><th>기대값</th><th>최저~최고</th></tr></thead><tbody>'+ 
          DISPLAY_STATS.map(key=>'<tr><th>'+esc(DATA.statLabels[key]||key)+'</th><td>'+fmtMean(result.means[key])+'</td><td>'+result.perStat[key].range.map(fmt).join('~')+'</td></tr>').join('')+'</tbody></table></div>'+ 
          '<p class="fine">독립 성공 시행 모델의 정확 이산분포입니다. 실제 OXCE 성장 성공률·시행 가능성은 미확인입니다.</p>';
      }catch(error){output.textContent='계산 보류: '+error.message;}
      return;
    }
    if(e.target.id!=='birthThreshold'||!selected)return;
    const roll=newbornDistribution(DATA,selected);
    const threshold=Number(e.target.value);
    const result=$('#birthThresholdResult');
    if(!result)return;
    result.textContent=Number.isSafeInteger(threshold)?
      '초기 추첨 총합 '+fmt(threshold)+' 이상일 확률 '+fmtPct(newbornTailChance(roll,threshold)):
      '총합 기준을 정수로 입력해 주세요.';
  });
  document.addEventListener('click',e=>{const origin=e.target.closest('[data-open-origin]'),research=e.target.closest('[data-research-node]'),candidate=e.target.closest('[data-candidate]');
    const capRoute=e.target.closest('[data-origin-cap-route]');
    if(capRoute){const route=capRoute.dataset.originCapRoute,w=sharedRegistry?.witnesses?.[route];if(w?.source==='ORIGINCAP12')void openOrigin(w.originProfile,w.archiveScope==='full-route'?w.archiveCandidateId:null,{sharedTerminal:w.body==='STR_SOLDIER_CHORT',originCapRoute:route}).then(()=>$('#originDetails').scrollIntoView({block:'start'}));else if(w?.source==='ORIGINEXT12'&&(!activeBranch||w.branchIds.includes(activeBranch)))void openOrigin(w.originProfile,w.originExtension.seed,{sharedTerminal:w.originExtension.seedBody==='STR_SOLDIER_CHORT',originCapRoute:route}).then(()=>$('#originDetails').scrollIntoView({block:'start'}));return;}
    const shared=e.target.closest('[data-open-shared-candidate]');
    const longest=e.target.closest('[data-open-longest]');
    if(longest)void openOrigin(longest.dataset.openLongest,longest.dataset.longestCandidate)
      .then(()=>$('#originDetails').scrollIntoView({block:'start'}));
    if(origin)void openOrigin(origin.dataset.openOrigin).then(()=>{
      if(origin.closest('#chortTarget'))$('#originDetails').scrollIntoView({block:'start'});
    });
    if(shared){void openOrigin(shared.dataset.sharedOrigin,shared.dataset.openSharedCandidate,
      {sharedTerminal:true}).then(()=>$('#originDetails').scrollIntoView({block:'start'}));}
    if(e.target.closest('#candidateBirthMin')&&selected){
      const profile=DATA.profiles.find(x=>x.id===selected);
      for(const input of document.querySelectorAll('[data-birth-stat]'))
        input.value=String(profile?.effectiveStats?.min?.[input.dataset.birthStat]??'');
      saveCandidateBirthInputs();return;
    }
    if(e.target.closest('#candidateBirthClear')){
      for(const input of document.querySelectorAll('[data-birth-stat]'))input.value='';
      saveCandidateBirthInputs();return;
    }
    if(e.target.closest('#scanBirthFloors')){void scanBirthFloors();return;}
    const applyFloor=e.target.closest('[data-apply-birth-floor]');
    if(applyFloor&&selected){
      const stat=applyFloor.dataset.applyBirthStat;
      const minimum=Number(applyFloor.dataset.applyBirthFloor);
      if(DISPLAY_STATS.includes(stat)&&Number.isSafeInteger(minimum)){
        const mode=$('#candidateBirthMode');if(mode)mode.value='atLeast';
        for(const input of document.querySelectorAll('[data-birth-stat]'))
          input.value=input.dataset.birthStat===stat?String(minimum):'';
        saveCandidateBirthInputs();
        const panel=$('.candidate-expectation-scan');if(panel)panel.open=true;
        const birth=$('.candidate-birth-select');if(birth)birth.open=true;
      }
      return;
    }
    if(e.target.closest('#scanCandidateExpectations')){
      void scanCandidateExpectations();return;
    }
    const metricButton=e.target.closest('[data-switch-metric]');
    if(e.target.closest('#scanGrowthPlacements')&&selected&&activeCandidateId){
      const output=$('#growthPlacementResults');
      const record=REPORT.records.find(r=>r.profileId===selected);
      const candidate=record?.candidates.find(c=>c.id===activeCandidateId);
      const attempts=Number($('#placementAttempts')?.value);
      const success=Number($('#placementSuccess')?.value);
      const objective=$('#placementObjective')?.value||'total';
      if(!output||!candidate)return;
      if(!Number.isSafeInteger(attempts)||attempts<0||attempts>40||
        !Number.isFinite(success)||success<0||success>100){
        output.textContent='성장 시행은 0~40 정수, 성공률은 0~100%로 입력해 주세요.';return;
      }
      const stats=Object.fromEntries(DISPLAY_STATS.map(key=>[key,{
        attempts,kernel:[[0,1-success/100],[1,success/100]]
      }]));
      const result=rankGrowthPlacements(DATA,selected,candidate,stats,objective);
      if(result.kind!=='conditional-placement-ranking'){
        output.textContent='시술 경계별 성장 비교 미산출: '+result.reason;return;
      }
      const placement=boundary=>boundary===0?'첫 시술 전':
        boundary===candidate.transforms.length?'마지막 시술 후':
        (name(candidate.transforms[boundary-1])+' 직후');
      output.innerHTML='<p><strong>선택 지표 '+esc(objective==='total'?'12종 합계':DATA.statLabels[objective]||objective)+
        ' 기준 최유리 배치: '+esc(placement(result.best.boundary))+'</strong> · 목표 기대값 '+fmtMean(result.best.score)+
        ' · 등록 경로 안의 '+result.examined+'개 삽입 위치만 비교했습니다.</p>'+
        '<div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>가상 성장 위치</th><th>목표 기대값</th><th>12종 기대 합계</th><th>능력치 요건 통과</th></tr></thead><tbody>'+
        result.positions.map(p=>'<tr><th scope="row">'+esc(placement(p.boundary))+'</th><td>'+fmtMean(p.score)+'</td><td>'+fmtMean(p.expectedTotal)+'</td><td>'+fmtPct(Math.min(1,p.statGateProbability))+'</td></tr>').join('')+
        '</tbody></table></div>'+
        (result.unresolved.length?'<p class="fine">미산출 위치: '+result.unresolved.map(p=>esc(placement(p.boundary)+' · '+p.reason)).join(' / ')+'</p>':'')+
        '<p class="fine">'+esc(result.caveat)+'</p>';
      return;
    }
    if(metricButton){$('#catalogMetric').value=metricButton.dataset.switchMetric;
      render();void openOrigin(selected);}
    const training=e.target.closest('[data-open-training]');
    if(training)showTraining(training.dataset.openTraining);
    const setRef=e.target.closest('[data-compare-origin]');
    if(setRef)setComparison(setRef.dataset.compareOrigin);
    const setCandidate=e.target.closest('[data-compare-candidate]');
    if(setCandidate)setComparison(setCandidate.dataset.compareProfile,setCandidate.dataset.compareCandidate);
    const continueButton=e.target.closest('[data-trace-id]');
    if(continueButton){
      const guideMore=continueButton.closest('.guide-more-sources');
      if(guideMore){
        const panel=guideMore.querySelector(':scope > .guide-more-target');
        if(panel){
          if(panel.innerHTML){
            panel.innerHTML='';
            continueButton.textContent=continueButton.dataset.originalText;
            continueButton.setAttribute('aria-expanded','false');
          }else{
            continueButton.dataset.originalText=continueButton.textContent;
            panel.innerHTML=renderAcquisitionTree(buildAcquisitionSubtree(
              continueButton.dataset.traceKind,continueButton.dataset.traceId,DATA,
              Number(continueButton.dataset.traceOffset||0)),{
                esc,name,requiredQuantity:Number(continueButton.dataset.requiredQuantity||0)
              });
            continueButton.textContent='추가 공급 경로 접기';
            continueButton.setAttribute('aria-expanded','true');
          }
        }
      }else{
        // A technical continuation is the next step in the same full-width
        // explorer, not another scrollable tree nested into the current card.
        openTraceStep(continueButton.dataset.traceKind,continueButton.dataset.traceId,
          continueButton.dataset.traceOffset||0);
      }
    }
    const transformResearch=e.target.closest('[data-trace-research-root]');
    if(transformResearch)
      openTraceStep('research',transformResearch.dataset.traceResearchRoot);
    const target=e.target.closest('[data-trace-target-kind][data-trace-target-id]');
    if(target)openTraceStep(target.dataset.traceTargetKind,target.dataset.traceTargetId);
    const treeButton=e.target.closest('[data-expand-origin-tree]');
    if(treeButton){
      const id=treeButton.dataset.expandOriginTree;
      const box=$('#originDetails').querySelector('.origin-tree-result');
      if(box){
        if(box.querySelector('.tech-viewer')){
          activeBirthViewer?.dispose();activeBirthViewer=null;box.replaceChildren();
          treeButton.textContent='좌우 획득 테크뷰어 열기';treeButton.setAttribute('aria-expanded','false');
        }else{
          const profile=DATA.profiles.find(p=>p.id===id);
          if(profile)showBirthTech(profile);
        }
      }
    }
    if(research)showResearch(research.dataset.researchNode);
    if(candidate)void openOrigin(selected,candidate.dataset.candidate,{
      sharedTerminal:!!candidate.closest('#originDetails')?.querySelector('.shared-terminal-origin-note:not([data-excluded-terminal])')
    });
    if(e.target.id==='originDetailClose'){
      activeBirthViewer?.dispose();activeBirthViewer=null;
      $('#originDetails').hidden=true;replayGeneration++;candidateScanGeneration++;candidateScanCache=null;
    }
  });
  $('#acquisitionTraceBack').onclick=previousTraceStep;
  $('#acquisitionTraceClose').onclick=()=>$('#acquisitionTraceDialog').close();
  $('#acquisitionTraceDialog').addEventListener('close',()=>{
    traceHistory.length=0;activeTraceViewer?.dispose();activeTraceViewer=null;
    $('#acquisitionTraceContent').replaceChildren();
  });
  $('#closeResearchDialog').onclick=()=>$('#researchDialog').close();$('#researchDialog').addEventListener('click',e=>{if(e.target===$('#researchDialog'))$('#researchDialog').close()});
  $('#researchSearch').addEventListener('input',()=>{const q=$('#researchSearch').value.toLocaleLowerCase('ko');$('#researchMatches').innerHTML=q?Object.keys(DATA.researchRules).filter(id=>(id+' '+name(id)).toLocaleLowerCase('ko').includes(q)).slice(0,35).map(node).join(' '):''});
  render();
  $('#originMaxima').dataset.validation='validated';
  const ext=sharedRegistry?.witnesses?.[params.get('originExt')];
  if(ext?.source==='ORIGINEXT12'&&(!activeBranch||ext.branchIds.includes(activeBranch)))void openOrigin(ext.originProfile,ext.originExtension.seed,{sharedTerminal:ext.originExtension.seedBody==='STR_SOLDIER_CHORT',originCapRoute:params.get('originExt')}).then(()=>$('#originDetails').scrollIntoView({block:'start'}));
  else if(params.has('profile'))void openOrigin(params.get('profile'),params.get('candidate'),{sharedTerminal:params.get('terminal')==='chort',populationRoute:params.get('populationRoute')});
  if(params.has('training'))showTraining(params.get('training'));
  if(params.has('research'))showResearch(params.get('research'));
}catch(error){sourceFail(error.message);console.error(error)}}
void init();
