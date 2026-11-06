// Read-only, source-first Soldier DB. No local-save input or custom planner.
import {loadRuntime} from '../../db-runtime.js';
import {inflateArchivedGzip} from './origin-gzip-compat.js?v=20261105-legacy-gzip-1';
import {renderResearchRelations,researchRelations} from '../../research-relations.js';
import {replayOriginWitness,WITNESS_STATS} from './origin-witness.js?v=20261105-campaign-context-1';
import {auditOriginCampaignContext,candidateMatchesCampaign} from './origin-campaign-context.js?v=20261105-campaign-context-1';
import {researchBranchEvidence} from './origin-branch-evidence.js';
import {DISPLAY_STATS,displayTotal,projectBirthStats,projectCandidateStats} from './score-12.js';
import {projectCandidateGrowthLimit} from './score-growth-12.js';
import {preferredOriginCandidate,routeTieEvidence,sameRouteStatVector,transformationCount,excludedTrainingCount} from './origin-route-tiebreak.js?v=20261106-vector-audit-4';
import {SHARED_TERMINALS,originRankingCandidates,sharedTerminalCandidates,sharedTerminalSourceAudit} from './shared-terminal-targets.js?v=20261106-chort-separated-1';
import {renderAcquisitionPaths} from './acquisition-paths.js?v=20261105-compact-supply-1';
import {buildAcquisitionTree,buildAcquisitionSubtree,renderAcquisitionTree} from './acquisition-condition-tree.js?v=20261105-compact-supply-1';
import {mountAcquisitionTechViewer} from './acquisition-tech-view.js?v=20261107-vector-route-dependency-2';
import {auditInitialChoiceEvidence,renderInitialChoiceEvidence} from './origin-start-choice-evidence.js?v=20261104-flat-research-1';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>n==null?'—':Number(n).toLocaleString('ko-KR');
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
let DATA,REPORT,CATALOG,DIAGNOSTICS,PRUNING,DEPENDENCIES,selected=null,replayGeneration=0,blocked=false;
const verified=new Map(),traceHistory=[];
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
    record.displayBirth=projectBirthStats(record,DATA.profiles.find(p=>p.id===record.profileId));
    for(const c of record.candidates){
      const context=auditOriginCampaignContext(c.steps,DATA);
      if(!c.campaignContext||JSON.stringify(context)!==JSON.stringify(c.campaignContext))
        throw Error('캠페인 난이도 공동 조건의 감사 근거 불일치: '+c.id);
      if(context.kind!=='compatible')throw Error('비교 후보에 난이도 충돌 기록이 섞임: '+c.id);
      c.campaignContext=context;
      c.display=projectCandidateStats(record,c,DATA);
      c.growth=projectCandidateGrowthLimit(record,c,DATA);
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
  if(REPORT.campaignContextAuditVersion!==1||
    REPORT.summary.withCompatibleResearch!==REPORT.records.filter(r=>allCompatible(r).length).length||
    REPORT.summary.compatibleWitnesses!==REPORT.records.reduce((sum,r)=>sum+allCompatible(r).length,0))
    throw Error('난이도 공동조건 감사 요약 불일치');
  $('#originMaxima').dataset.validation='validated';
}
function render(){
  if(blocked||!REPORT)return;
  const q=$('#search').value.toLocaleLowerCase('ko').trim(),family=$('#family').value,metric=$('#catalogMetric').value;
  const rows=REPORT.records.filter(r=>(!family||r.soldierType===family)&&(!q||
    [r.profileId,r.name,r.soldierName,
      ...Object.keys(DATA.profiles.find(p=>p.id===r.profileId)?.acquisitionRequiredItems||{}),
      ...comparable(r).flatMap(c=>c.transforms.map(name))]
      .join(' ').toLocaleLowerCase('ko').includes(q)));
  const rowScore=r=>metric==='birth'?displayTotal(r.displayBirth):metric==='certified'?-1:score(best(r,metric==='growth'?'growth':'provisional'),metric==='growth'?'growth':'provisional');
  rows.sort((a,b)=>rowScore(b)-rowScore(a)||a.name.localeCompare(b.name,'ko'));
  $('#rowCount').textContent=rows.length+' / 72개 출생처';
  $('#originTable thead').innerHTML='<tr><th>출생처 / 최초 병종</th><th>상태</th><th>12종 합계</th>'+DISPLAY_STATS.map(k=>'<th>'+esc(DATA.statLabels[k])+'</th>').join('')+'</tr>';
  $('#originTable tbody').innerHTML=rows.map(r=>{
    const c=best(r,metric==='growth'?'growth':'provisional');
    const terminal=chortCandidates(r).reduce((winner,x)=>preferredOriginCandidate(winner,x,score),null);
    const ties=(metric==='growth'||metric==='provisional')&&c?
      routeTieEvidence(comparable(r),c,x=>score(x,metric),metric):null;
    const tieNote=ties?.equalTotal.length>1?
      '<small class="origin-route-tie" data-route-tie="true">상한 합계 동점 '+ties.equalTotal.length+
      '경로 · 최종 병종·12종 동일 '+ties.sameVector.length+' / 능력치·병종 다름 '+ties.differentVector.length+'</small>':'';
    const values=metric==='birth'?r.displayBirth:metric==='certified'?null:
      metric==='growth'?(c?.growth?.kind==='conditional-upper-envelope'?c.growth.stats:null):c?.display.stats;
    const total=values?displayTotal(values):null;
    return '<tr data-origin-id="'+esc(r.profileId)+'" data-proof="'+r.status+'"><td><button class="origin-open" data-open-origin="'+esc(r.profileId)+'">'+esc(r.name)+'</button><small>'+esc(r.soldierName)+'</small>'+
      (terminal?'<small class="origin-terminal-tag">코르트 변환 상한 '+fmt(terminal.growth?.total)+' · 기본 비교 제외</small>':'')+
      tieNote+'<small class="id">'+esc(r.profileId)+'</small><small class="mobile-proof">'+(metric==='growth'?'성장상한':metric==='provisional'?'연구·시술':metric==='birth'?'출생 기준':'미인증')+(c?' · 조건부':' · 미해결')+'</small></td><td>'+
      (metric==='certified'?'최종 인증 없음':metric==='birth'?'원본 출생 기준값':c?metric==='growth'?'성장 완료 가정 · 상한 추정':'조건부 연구·시술 값':'연구 경로 보완 중')+
      '<small>'+(c?c.researchCount+'개 연구 재생 · '+c.transforms.length+'개 시술':'미완료 연구: '+esc(r.unresolved?.id||'조사 중'))+'</small></td><td class="score">'+fmt(total)+'</td>'+DISPLAY_STATS.map(k=>'<td>'+fmt(values?.[k])+'</td>').join('')+'</tr>';
  }).join('')||'<tr><td colspan="15">해당 출생처 없음</td></tr>';
  $('#catalogStatus').textContent=metric==='growth'?'기본 비교: 출생처별 조건부 성장 상한 · 코르트 최종 변신은 별도 병종으로 분리했습니다. 동시 달성·전역 최고값은 미증명입니다.':metric==='provisional'?'기존 연구·시술 잠정값: 출생 최솟값에서 시작한 경로이며 전투·체력 성장은 더하지 않은 값입니다.':metric==='birth'?'출생 시점의 원본 최솟값입니다. 성장 이후 잠정값이나 최종 최대치가 아닙니다.':'확정 최종 최대치 0건. 잠정값을 확정값으로 바꿔 표시하지 않습니다.';
}
function statGrid(c,metric='growth'){
  const view=metric==='growth'&&c.growth?.kind==='conditional-upper-envelope'?c.growth:c.display;
  return '<div class="stat-grid">'+DISPLAY_STATS.map(k=>'<div><small>'+esc(DATA.statLabels[k])+'</small><strong>'+fmt(view.stats[k])+'</strong><small>원시 '+fmt(view.raw[k])+' + 영구 특성 '+fmt(view.bonus[k])+'</small></div>').join('')+'</div>';
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
function transformationGateHtml(c,profile){
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
      '<p class="fine">훈장 실제 획득, 전투 경험·승진, 사망/부상/생존 상태, 아이템 시점, 연구 배제, 성장값 충족 여부는 미증명입니다.</p></li>';
  }).join('');
  return '<details class="origin-transform-gates"><summary>선택한 후보의 후속 훈련·변신 계급과 요구조건 ('+selected.length+'개)</summary>'+
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
    '<p class="fine">훈련과 위 단계들을 함께 삭제하고 남은 연구·사건·재료·기지 조건을 원본 규칙으로 처음부터 재생했습니다. 나열한 수량은 기존 입력 가정이며 실제 순절감 비용이 아닙니다. 12종 조건부 상한 동일 · 전역 최적성 미증명.</p></div>';
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
async function openOrigin(id,candidateId=null,{sharedTerminal=false}={}){
  if(blocked)return;const generation=++replayGeneration;
  activeBirthViewer?.dispose();activeBirthViewer=null;
  const record=REPORT.records.find(r=>r.profileId===id);if(!record)return;
  const profile=DATA.profiles.find(p=>p.id===id);
  const birthPaths='<section class="origin-tree-action"><strong>이 병사는 어떻게 얻나요?</strong><button type="button" data-expand-origin-tree="'+esc(profile.id)+'" aria-expanded="true">테크뷰어 접기</button><div class="origin-tree-result" data-origin-tree-result="'+esc(profile.id)+'"></div></section>'+
    '<details class="origin-source-expansion"><summary>원본 출생·공급 기록 전체 보기 (기술 자료)</summary>'+
    '<p class="fine">이곳에는 연구 ID, 공급 스크립트, 다른 출생처와의 상세 연결을 원본 단위로 보존합니다.</p>'+
    renderAcquisitionPaths(profile,DATA,{esc,fmt,name,node})+'</details>';
  const metric=$('#catalogMetric').value;
  selected=id;const eligible=sharedTerminal?chortCandidates(record):comparable(record);
  const c=eligible.find(c=>c.id===(candidateId||best(record,metric==='growth'?'growth':'provisional')?.id));
  const initialChoiceHtml=renderInitialChoiceEvidence(auditInitialChoiceEvidence(profile,DATA,c),{name,esc});
  const host=$('#originDetails');host.hidden=false;
  host.innerHTML='<div class="detail-head"><h2>'+esc(record.name)+'</h2><button id="originDetailClose">닫기</button></div><p class="muted">등록 경로의 원본·현재 수치를 재대조하는 중…</p>';
  await new Promise(ok=>setTimeout(ok,0));
  if(!c){
    const gaps=(record.researchBottlenecks||[]).map(g=>
      '<li>'+node(g.id)+(g.neededItem?' <small>표본 ID '+esc(g.neededItem)+'</small>':'')+' <strong>'+({RULE_NOT_INDEXED:'연구 ID·이벤트 출처 미색인',UNBACKED_SAMPLE_TOKEN:'실물 표본 없는 조건 플래그 · 지급 증거 필요',AUTO_QUEUE_SOURCE_UNVERIFIED:'비용 0 자동 연구 출처 미확인',EVENT_CHRONOLOGY_UNRESOLVED:'이벤트 지급 시간순 미검증',SOURCE_ROUTE_UNRESOLVED:'연구 공급 대체 경로 미해결',NOT_INDEXED:'이벤트·지급 출처 미색인',NO_SUPPLY_METHOD:'현재 공급 방법 미확보',UPSTREAM_UNRESOLVED:'상위 선행 경로 미해결',CHRONOLOGY_UNRESOLVED:'시간순 연구 재생 미완결',SEARCH_LIMIT:'제한 탐색 미완결'}[g.kind]||'추가 검증 필요')+'</strong> · '+esc(g.reason)+'</li>').join('');
    host.innerHTML='<div class="detail-head"><h2>'+esc(record.name)+'</h2><button id="originDetailClose">닫기</button></div>'+
      '<p><strong>출생처 등록 완료 · 완결 연구 경로 미확보</strong></p><p>'+node(record.unresolved?.id||record.profileId)+'</p>'+
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
  const shown=useGrowth?c.growth:c.display;
  const finalBody=DATA.soldiers.find(x=>x.id===c.finalSoldierType);
  const staminaBasis=useGrowth?
    '<p class="scope-note" data-growth-stamina-basis="true">기력 상한 근거: '+
    esc(name(c.finalSoldierType))+'의 원시 성장캡 '+fmt(finalBody?.statCaps?.stamina)+
    ' · 성장·변신 후 원시 상계 '+fmt(shown.raw.stamina)+
    ' + 동일 병사의 영구 특성 '+fmt(shown.bonus.stamina)+
    ' = 조건부 실효 상계 '+fmt(shown.stats.stamina)+
    '. 전투 종료 보조 성장의 마지막 증가분은 원시 성장캡을 최대 +1 초과할 수 있습니다. 실제 달성·동시 달성은 미검증입니다.</p>':'';
  host.innerHTML='<div class="detail-head"><div><p class="eyebrow">조건부 잠정 최고 · 연구 경로 재생 완료</p><h2>'+esc(record.name)+'</h2></div><button id="originDetailClose">닫기</button></div>'+
    '<p>'+esc(record.soldierName)+'에서 출생 → '+esc(name(c.finalSoldierType))+' · <strong>'+(useGrowth?'성장 완료 가정 · 12종 상한 합계 ':'12종 연구·시술 합계 ')+fmt(shown.total)+'</strong> · 영구 특성 12종 합 '+fmt(c.display.bonusTotal)+'</p>'+
    '<p class="scope-note">'+(useGrowth?esc(c.growth.caveat):esc(c.scope)+'입니다. 성장이 완료된 병사의 전역 최대치가 아닙니다.')+'</p>'+
    (sharedTerminal?'<p class="shared-terminal-origin-note"><strong>코르트 별도 병종 경로</strong> · 출생처 기본 비교에서 제외된 변신 증거입니다. <a href="#chortTarget">코르트 목록 보기</a></p>':sharedTerminalOriginNote(record,profile))+
    campaignContextHtml(record,c)+staminaBasis+birthPaths+initialChoiceHtml+transformationGateHtml(c,profile)+statGrid(c,metric)+
    routeEfficiencyHtml(alternateSet,c,metric)+
    (metric==='growth'?routePruningEvidenceHtml(record,c,sharedTerminal):'')+
    '<h3>경로 요약</h3><p>'+esc(c.description)+'</p><p>사전 완료 연구 0개 → '+c.researchCount+'개 연구 처리 → 마지막 연구 '+(finalResearch?node(finalResearch.id||finalResearch.research):'출생 이벤트')+'. 전체 연구 순서는 화면을 채우지 않고 재생 증거에 보존합니다.</p>'+
    '<h3>이 경로의 분기 선택과 배제</h3>'+choiceHtml(c)+
    '<details><summary>훈련으로 배제되는 다른 선택</summary>'+c.trainingExclusions.map(t=>'<h4>'+esc(name(t.id))+'</h4>'+t.excludes.map(e=>'<p>'+esc(name(t.id))+(e.direction==='bidirectional'?' ↔ ':' → ')+esc(name(e.id))+' · '+(e.direction==='bidirectional'?'양방향':'일방향')+' 이력 배제</p>').join('')).join('')+'</details>'+
    '<details class="assumptions"><summary>필수 확인 · 남은 자원·출생·확률 가정 '+c.assumptions.length+'건</summary><ul>'+assumptionHtml(c)+'</ul><h4>모델의 미검증 조건</h4><ul>'+(c.limitations||[]).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul><details><summary>자동 연구·lookup 조건부 처리 기록</summary><ul>'+(c.modelAssumptions||[]).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></details></details>'+
    '<details><summary>'+(sharedTerminal?'코르트 변신 후보끼리 비교':'다른 완결 후보 · 목표 A/B 비교')+'</summary><p>목표 A 영구 특성 12종 합 최고 '+fmt(bonus?.display.bonusTotal)+' / 연구·시술 12종 합 최고 '+fmt(bestAlternate('provisional')?.display.total)+' / 성장 완료 조건부 상한 합 최고 '+fmt(bestAlternate('growth')?.growth?.total)+'. 서로 다른 병사·연구 경로의 유리한 수치를 합치지 않습니다. 난이도 충돌 후보는 비교에서 제외합니다.</p>'+alternateSet.map(x=>'<p><button data-candidate="'+x.id+'">'+esc(x.description)+' · 성장상한 '+fmt(x.growth?.total)+' / 연구·시술 '+fmt(x.display.total)+'</button></p>').join('')+'</details>'+
    '<p class="fine">재생: 통과 · 실제 게임 실측: 없음 · 전역 최적성: 미증명 · 원본 v.o2. 더 높은 경로는 같은 출생처의 비교 후보로 등록한 뒤 갱신합니다.</p>';
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
  [DATA,REPORT,CATALOG,DIAGNOSTICS,PRUNING,DEPENDENCIES]=await Promise.all([loadRuntime('../../data/soldiers-modern-index.json'),json('../../data/soldier-origin-candidates.json').then(expandOriginArchive),json('../../data/soldier-source-catalog.json'),json('../../data/soldier-unresolved-diagnostics.json'),json('../../data/soldier-route-pruning-audit.json'),json('../../data/soldier-route-dependency-audit.json')]);
  await validate();
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
  $('#catalogSummary').innerHTML=[['등록 출생처','72','같은 병종이어도 출생처 분리'],['연구 순서·난이도 일치',complete+'/72','실물·시간·이벤트는 조건부'],['출생처 비교 후보',ranked,'코르트 변신 '+separated+'건은 별도 병종'],['최종 최대치 인증','0','실측·전역 최고값은 미증명']].map(([label,v,note])=>'<article class="card"><small>'+label+'</small><strong>'+v+'</strong><p>'+note+'</p></article>').join('');
  $('#routePruningScope').textContent='훈련 1단계 생략 28건을 시간순 재생한 뒤, 동일한 12종 조건부 상한 아래 연구·지급 단계 추가 생략 '+
    DEPENDENCIES.stats.withResearchRemoved+'건, 외부 자원 가정 생략 '+
    DEPENDENCIES.stats.withInputAssumptionsRemoved+
    '건을 확인했습니다. 비용·전역 최적성은 인증하지 않았습니다. 각 출생처 상세에서 경로별 근거를 확인하세요.';
  renderSharedTerminalCatalog();
  $('#family').innerHTML='<option value="">전체 병종</option>'+DATA.soldiers.map(s=>'<option value="'+s.id+'">'+esc(s.koName)+'</option>').join('');
  const params=new URLSearchParams(location.search);$('#search').value=params.get('q')||'';if(params.has('family'))$('#family').value=params.get('family');
  $('#search').addEventListener('input',render);$('#family').addEventListener('change',render);$('#catalogMetric').addEventListener('change',render);
  for(const [id,direction] of [['#scrollStatsLeft',-1],['#scrollStatsRight',1]])
    $(id).addEventListener('click',()=>$('#originTableScroll').scrollBy({left:direction*260,behavior:'smooth'}));
  document.addEventListener('click',e=>{const origin=e.target.closest('[data-open-origin]'),research=e.target.closest('[data-research-node]'),candidate=e.target.closest('[data-candidate]');
    const shared=e.target.closest('[data-open-shared-candidate]');
    if(origin)void openOrigin(origin.dataset.openOrigin).then(()=>{
      if(origin.closest('#chortTarget'))$('#originDetails').scrollIntoView({block:'start'});
    });
    if(shared){void openOrigin(shared.dataset.sharedOrigin,shared.dataset.openSharedCandidate,
      {sharedTerminal:true}).then(()=>$('#originDetails').scrollIntoView({block:'start'}));}
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
      $('#originDetails').hidden=true;replayGeneration++;
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
  if(params.has('profile'))void openOrigin(params.get('profile'));
  if(params.has('training'))showTraining(params.get('training'));
  if(params.has('research'))showResearch(params.get('research'));
}catch(error){sourceFail(error.message);console.error(error)}}
void init();
