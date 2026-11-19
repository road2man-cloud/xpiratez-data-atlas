// Read-only, source-first Soldier DB. No local-save input or custom planner.
import {loadRuntime} from '../../db-runtime.js';
import {renderResearchRelations,researchRelations} from '../../research-relations.js';
import {replayOriginWitness,WITNESS_STATS} from './origin-witness.js';
import {researchBranchEvidence} from './origin-branch-evidence.js';
import {DISPLAY_STATS,displayTotal,projectBirthStats,projectCandidateStats} from './score-12.js';
import {projectCandidateGrowthLimit} from './score-growth-12.js';
import {routeCandidate,routeNumbers,routeDifference,routeEvidence,routeOnly} from './route-table-compare.js';
import {newbornDistribution,newbornPairChance,newbornTailChance} from './birth-rng-math.js';
import {trainingOrderEvidence} from './training-order-evidence.js';
import {conditionalGrowthProjection} from './conditional-growth-math.js';
import {registeredRouteDistribution} from './route-roll-math.js';
import {rankGrowthPlacements} from './route-growth-placement.js';
import {renderAcquisitionPaths} from './acquisition-paths.js?v=20261104-flat-research-1';
import {buildAcquisitionTree,buildAcquisitionSubtree,renderAcquisitionTree} from './acquisition-condition-tree.js?v=20261104-event-direct-1';
import {mountAcquisitionTechViewer} from './acquisition-tech-view.js?v=20261105-body-tech-1';
import {auditInitialChoiceEvidence,renderInitialChoiceEvidence} from './origin-start-choice-evidence.js?v=20261104-flat-research-1';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>n==null?'—':Number(n).toLocaleString('ko-KR');
const fmtMean=n=>n==null?'—':Number(n).toLocaleString('ko-KR',{maximumFractionDigits:2});
const fmtPct=p=>Number(p*100).toLocaleString('ko-KR',{maximumFractionDigits:2})+'%';
const sha=async x=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(x))))].map(n=>n.toString(16).padStart(2,'0')).join('');
async function expandOriginArchive(envelope){
  if(envelope?.format!=='xpz-origin-report-gzip-v2')return envelope;
  if(envelope.compression!=='gzip'||envelope.encoding!=='base64'||
    typeof envelope.payload!=='string'||typeof DecompressionStream!=='function')
    throw Error('병종 경로 압축 원본을 읽을 수 없음');
  const zipped=Uint8Array.from(atob(envelope.payload),s=>s.charCodeAt(0));
  const bytes=await new Response(new Blob([zipped]).stream()
    .pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
    .map(n=>n.toString(16).padStart(2,'0')).join('');
  if(bytes.byteLength!==envelope.byteLength||hash!==envelope.sha256)
    throw Error('병종 경로 압축 원본 무결성 검증 실패');
  const report=JSON.parse(new TextDecoder().decode(bytes));
  if(report?.kind!=='origin-provisional-witnesses')
    throw Error('병종 경로 압축 원본 종류 불일치');
  return report;
}
let DATA,REPORT,CATALOG,DIAGNOSTICS,selected=null,replayGeneration=0,blocked=false;
let comparison=null; // {profileId,candidateId}; every origin uses the same renderer.
let activeCandidateId=null;
const verified=new Map(),routeRollCache=new Map(),traceHistory=[];
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
const best=(r,metric='growth')=>r.candidates.reduce((winner,c)=>score(c,metric)>score(winner,metric)?c:winner,null);
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
    for(const c of record.candidates){
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
      c.display=projectCandidateStats(record,c,DATA);
      c.growth=projectCandidateGrowthLimit(record,c,DATA);
      if(c.growth.kind==='conditional-upper-envelope'&&c.growth.total<c.display.total)
        throw Error('성장 상한이 시술 후 수치보다 낮음: '+c.id);
    }
  }
  $('#originMaxima').dataset.validation='validated';
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
  if(metric==='birth-expected'){
    const roll=newbornDistribution(DATA,record.profileId);
    return {record,candidate:null,stats:roll.stats,total:roll.total,birthRoll:roll};
  }
  if(metric==='route-expected'){
    const candidate=routeCandidate(record,'growth',preferredId);
    const roll=routeRoll(record,candidate);
    return roll.kind==='conditional-route-distribution'?{
      record,candidate,stats:roll.stats,total:roll.expectedTotal,routeRoll:roll}:null;
  }
  return routeNumbers(record,metric,preferredId,DISPLAY_STATS);
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
function render(){
  if(blocked||!REPORT)return;
  const q=$('#search').value.toLocaleLowerCase('ko').trim(),family=$('#family').value,metric=$('#catalogMetric').value;
  const routeMode=metric==='route-expected';
  const growthTiming=$('#routeGrowthTiming')?.value||'none';
  $('#routeGrowthTimingWrap').hidden=!routeMode;
  $('#routeGrowthAttemptsWrap').hidden=!routeMode||growthTiming==='none';
  $('#routeGrowthSuccessWrap').hidden=!routeMode||growthTiming==='none';
  const rows=REPORT.records.filter(r=>(!family||r.soldierType===family)&&(!q||
    [r.profileId,r.name,r.soldierName,
      ...Object.keys(DATA.profiles.find(p=>p.id===r.profileId)?.acquisitionRequiredItems||{}),
      ...r.candidates.flatMap(c=>c.transforms.map(name))]
      .join(' ').toLocaleLowerCase('ko').includes(q)));
  const rowScore=r=>metric==='route-expected'?(viewFor(r,metric)?.total??-1):
    metric==='birth-expected'?newbornDistribution(DATA,r.profileId).total:
    metric==='birth'?displayTotal(r.displayBirth):metric==='certified'?-1:
    score(best(r,metric==='growth'?'growth':'provisional'),metric==='growth'?'growth':'provisional');
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
    const c=metric==='birth-expected'?null:view?.candidate||routeCandidate(r,metric==='route-expected'?'growth':metric,preferred);
    const diff=routeDifference(view,ref,DISPLAY_STATS);
    const odds=view?.birthRoll&&ref?.birthRoll?newbornPairChance(view.birthRoll,ref.birthRoll):
      view?.routeRoll&&ref?.routeRoll?newbornPairChance(view.routeRoll,ref.routeRoll):null;
    const scoreCell=view?'<strong>'+valueLabel(view.total)+'</strong>'+
      (diff?'<small class="route-delta '+(diff.total>0?'positive':diff.total<0?'negative':'')+'">기준 대비 '+deltaLabel(diff.total)+'</small>':'')+
      (odds?'<small class="birth-win-chance">'+(metric==='route-expected'?'조건부 독립 추첨 우세 ':'독립 추첨 우세 ')+fmtPct(odds.win)+' · 동률 '+fmtPct(odds.tie)+'</small>':'')+
      (view.routeRoll?'<small>능력치 요구 통과 '+fmtPct(Math.min(1,view.routeRoll.statGateProbability))+'</small>':''):'—';
    const cell=k=>'<td>'+valueLabel(view?.stats[k])+(diff?'<small class="route-delta '+(diff.stats[k]>0?'positive':diff.stats[k]<0?'negative':'')+'">'+deltaLabel(diff.stats[k])+'</small>':'')+'</td>';
    return '<tr data-origin-id="'+esc(r.profileId)+'" data-proof="'+r.status+'"'+(r.profileId===comparison?.profileId?' data-reference="true"':'')+'><td><button class="origin-open" data-open-origin="'+esc(r.profileId)+'">'+esc(r.name)+'</button><small>'+esc(r.soldierName)+'</small><small class="id">'+esc(r.profileId)+'</small><button type="button" class="route-reference-button" data-compare-origin="'+esc(r.profileId)+'">기준으로 비교</button></td><td>'+
      (metric==='birth-expected'?'출생 RNG 기대값 · 확률분포':metric==='route-expected'?(view?'등록 경로 후 조건부 RNG 평균':'경로 평균 미산출 · 근거 확인'):metric==='certified'?'최종 인증 없음':metric==='birth'?'원본 출생 기준값':c?metric==='growth'?'성장 완료 가정 · 상한 추정':'조건부 연구·시술 값':'완결 후보 없음 · 계산 보류')+
      '<small>'+(metric==='birth-expected'?('총합 10~90백분위 '+fmt(view.birthRoll.totalBand.p10)+' ~ '+fmt(view.birthRoll.totalBand.p90)):
      metric==='route-expected'?(view?'경로 '+c.transforms.length+'개 시술 · '+(growthTiming==='none'?'전투 성장 제외':'가상 성장 '+(growthTiming==='before'?'시술 전':'시술 후')):esc(routeRoll(r,c).reason||'완결 경로 없음')):
      c?c.researchCount+'개 연구 재생 · '+c.transforms.length+'개 시술':'미완료 연구: '+esc(r.unresolved?.id||'조사 중'))+'</small></td><td class="score">'+scoreCell+'</td>'+DISPLAY_STATS.map(cell).join('')+'</tr>';
  }).join('')||'<tr><td colspan="15">해당 출생처 없음</td></tr>';
  $('#catalogStatus').textContent=metric==='route-expected'?'등록된 후보 가운데 기존 조건부 성장 상한 기준으로 선택된 경로에 출생 RNG와 시술 규칙을 적용한 평균입니다. '+(growthTiming==='none'?'전투 성장 0회. ':'가상 전투 성장 '+(growthTiming==='before'?'첫 시술 이전. ':'마지막 시술 이후. ')+'사용자가 지정한 시행 횟수·성공률은 OXCE의 실제 경험치 공식이 아닙니다. ')+'원본 비능력치 조건 충족 가정, 시술 난수는 균등·독립 가정입니다. 능력치 문턱 통과율만 별도로 계산하며 실제 경로 실현 확률이나 전체 후보의 기대값 최적성은 증명하지 않습니다.':metric==='growth'?'기본 비교: 출생 가능 최댓값부터 연구 경로의 병종·훈련 변화를 순서대로 적용하고, 변신 전후 체력훈련·전투 성장의 조건부 상한을 투사합니다. 12종 상한 합계는 동시 달성·실전 검증이나 전역 최고 경로의 증명이 아닙니다.':metric==='provisional'?'기존 연구·시술 잠정값: 출생 최솟값에서 시작한 경로이며 전투·체력 성장은 더하지 않은 값입니다.':metric==='birth'?'출생 시점의 원본 최솟값입니다. 성장 이후 잠정값이나 최종 최대치가 아닙니다.':metric==='birth-expected'?'출생처별 병사 생성자 RNG·템플릿·영구 보너스를 적용해 가능한 12종 능력치를 정확히 합산한 이론 분포입니다. 비교 승률은 독립 생성된 신병 둘의 총합 우세 확률이며, 육성·변신·훈장 후 확률이나 같은 캠페인에서의 실제 입수 가능성이 아닙니다.':'확정 최종 최대치 0건. 잠정값을 확정값으로 바꿔 표시하지 않습니다.';
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
function routeRollHtml(record,candidate){
  const roll=routeRoll(record,candidate);
  if(roll.kind!=='conditional-route-distribution')
    return '<section class="birth-distribution"><h3>등록 경로 RNG 결과 미산출</h3>'+
      '<p class="failure">'+esc(roll.reason||'원본 확률 계산 근거 부족')+'</p>'+growthPlacementScannerHtml()+'</section>';
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
    '</tbody></table></div><details><summary>적용된 시술의 순서와 문턱 ('+roll.stages.length+'단계)</summary><ol>'+stages+'</ol></details>'+growthPlacementScannerHtml()+'</section>';
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
function assumptionHtml(c){return c.assumptions.map(s=>{
  if(s.type==='externalInputs')return '<li>'+esc(s.reason)+'<br>'+Object.entries(s.items||{}).map(([id,n])=>esc(name(id))+' ×'+fmt(n)).join(' · ')+(s.functions?.length?' · 기지 기능 '+s.functions.map(esc).join(', '):'')+(s.funds?' · 자금 '+fmt(s.funds):'')+'</li>';
  if(s.type==='freeResearch')return '<li>'+node(s.source)+' 완료 시 '+node(s.research)+' 무료 지급 추첨 결과를 가정</li>';
  if(s.type==='eventResearch')return '<li>이벤트 '+esc(s.event)+' / '+esc(s.script)+'에서 '+node(s.research)+' 지급을 가정</li>';
  if(s.type==='recruit')return '<li>출생 최솟값 벡터 · 실제 생성 난수 미실측'+(s.script?' · 출생 이벤트 '+esc(s.script):'')+'</li>';
  return '<li>게임 경과 '+fmt(s.month)+'개월 · 유지비·외부 사건 미검증</li>';
}).join('');}
async function openOrigin(id,candidateId=null){
  if(blocked)return;const generation=++replayGeneration;
  activeBirthViewer?.dispose();activeBirthViewer=null;
  const record=REPORT.records.find(r=>r.profileId===id);if(!record)return;
  const profile=DATA.profiles.find(p=>p.id===id);
  const birthPaths='<section class="origin-tree-action"><strong>이 병사는 어떻게 얻나요?</strong><p class="fine">준비물과 구하는 방법, 필요한 연구와 이벤트를 구분해 보여드립니다. 게임에서 반드시 획득된다는 뜻은 아닙니다.</p><button type="button" data-expand-origin-tree="'+esc(profile.id)+'" aria-expanded="true">테크뷰어 접기</button><div class="origin-tree-result" data-origin-tree-result="'+esc(profile.id)+'"></div></section>'+
    '<details class="origin-source-expansion"><summary>원본 출생·공급 기록 전체 보기 (기술 자료)</summary>'+
    '<p class="fine">이곳에는 연구 ID, 공급 스크립트, 다른 출생처와의 상세 연결을 원본 단위로 보존합니다.</p>'+
    renderAcquisitionPaths(profile,DATA,{esc,fmt,name,node})+'</details>';
  const metric=$('#catalogMetric').value;
  selected=id;const c=record.candidates.find(c=>c.id===(candidateId||best(record,metric==='growth'||metric==='route-expected'?'growth':'provisional')?.id));
  activeCandidateId=c?.id||null;
  const initialChoiceHtml=renderInitialChoiceEvidence(auditInitialChoiceEvidence(profile,DATA,c),{name,esc});
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
      '<p><strong>출생처 등록 완료 · 완결 연구 경로 미확보</strong></p><p>'+node(record.unresolved?.id||record.profileId)+'</p>'+
      '<p>'+esc(record.unresolved?.reason||'조사 중')+'</p>'+birthPaths+initialChoiceHtml+unresolvedChronologyHtml(id)+
      '<h3>추가 확인이 필요한 상위 연구·이벤트 근거</h3><ul>'+gaps+'</ul>'+
      '<p>이것은 현재 탐색기가 발견하지 못한 공급·시간순 경로입니다. 제한 탐색의 실패는 영구 불가능 판정이 아닙니다. 실제 획득을 증명하기 전에는 잠정 수치를 만들어 넣지 않습니다.</p>';
    showBirthTech(profile);
    return;
  }
  let replay=verified.get(c.id);
  if(!replay){replay=replayOriginWitness(c.steps,DATA);verified.set(c.id,replay);}
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
  const finalResearch=c.steps.filter(s=>s.type==='research'||s.type==='freeResearch').at(-1);
  const bonus=[...record.candidates].sort((a,b)=>b.display.bonusTotal-a.display.bonusTotal||b.display.total-a.display.total)[0];
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
    '<p><button type="button" data-compare-candidate="'+esc(c.id)+'" data-compare-profile="'+esc(record.profileId)+'">이 경로를 표의 비교 기준으로 선택</button></p>'+
    (baseline(metric)?'<p class="scope-note">현재 경로의 비교는 표에서 선택한 동일 능력치 방식만 사용하며, 연구·자원 조건이 다른 두 경로를 한 대원에게 합산하지 않습니다.</p>'+compareEvidenceHtml(viewFor(record,metric,c.id),baseline(metric)):'')+
    staminaBasis+birthPaths+initialChoiceHtml+transformationGateHtml(c,profile)+
    (metric==='route-expected'?routeRollHtml(record,c):statGrid(c,metric))+
    '<h3>경로 요약</h3><p>'+esc(c.description)+'</p><p>사전 완료 연구 0개 → '+c.researchCount+'개 연구 처리 → 마지막 연구 '+(finalResearch?node(finalResearch.id||finalResearch.research):'출생 이벤트')+'. 전체 연구 순서는 화면을 채우지 않고 재생 증거에 보존합니다.</p>'+
    '<h3>이 경로의 분기 선택과 배제</h3>'+choiceHtml(c)+
    '<details><summary>훈련으로 배제되는 다른 선택</summary>'+c.trainingExclusions.map(t=>'<h4>'+esc(name(t.id))+'</h4>'+t.excludes.map(e=>'<p>'+esc(name(t.id))+(e.direction==='bidirectional'?' ↔ ':' → ')+esc(name(e.id))+' · '+(e.direction==='bidirectional'?'양방향':'일방향')+' 이력 배제</p>').join('')).join('')+'</details>'+
    '<details class="assumptions"><summary>필수 확인 · 남은 자원·출생·확률 가정 '+c.assumptions.length+'건</summary><ul>'+assumptionHtml(c)+'</ul><h4>모델의 미검증 조건</h4><ul>'+(c.limitations||[]).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul><details><summary>자동 연구·lookup 조건부 처리 기록</summary><ul>'+(c.modelAssumptions||[]).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></details></details>'+
    '<details><summary>다른 완결 후보 · 목표 A/B 비교</summary><p>목표 A 영구 특성 12종 합 최고 '+fmt(bonus?.display.bonusTotal)+' / 연구·시술 12종 합 최고 '+fmt(best(record,'provisional')?.display.total)+' / 성장 완료 조건부 상한 합 최고 '+fmt(best(record,'growth')?.growth?.total)+'. 서로 다른 병사·연구 경로의 유리한 수치를 합치지 않습니다.</p>'+record.candidates.map(x=>'<p><button data-candidate="'+x.id+'">'+esc(x.description)+' · 성장상한 '+fmt(x.growth?.total)+' / 연구·시술 '+fmt(x.display.total)+'</button></p>').join('')+'</details>'+
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
  [DATA,REPORT,CATALOG,DIAGNOSTICS]=await Promise.all([loadRuntime('../../data/soldiers-modern-index.json'),json('../../data/soldier-origin-candidates.json').then(expandOriginArchive),json('../../data/soldier-source-catalog.json'),json('../../data/soldier-unresolved-diagnostics.json')]);
  await validate();
  if(DIAGNOSTICS.sourceVersion!=='v.o2'||
    JSON.stringify(DIAGNOSTICS.sourceHashes)!==JSON.stringify(DATA.meta.source.rules)||
    DIAGNOSTICS.registryHash!==REPORT.sourceHash||
    DIAGNOSTICS.unresolvedCount!==REPORT.summary.unresolved||
    DIAGNOSTICS.rows.some(x=>!REPORT.records.some(r=>r.profileId===x.profileId&&!r.candidates.length)))
    throw Error('미해결 출생 경로 진단 원본이 현재 병종 DB와 일치하지 않음');
  const complete=REPORT.records.filter(r=>r.candidates.length).length;
  $('#catalogSummary').innerHTML=[['등록 출생처','72','같은 병종이어도 출생처 분리'],['연구 경로 완결',complete+'/72','자원·이벤트 가정은 조건부'],['등록 후보',REPORT.summary.witnesses,'실제 재생을 통과한 경로'],['최종 최대치 인증','0','잠정값과 구분']].map(([label,v,note])=>'<article class="card"><small>'+label+'</small><strong>'+v+'</strong><p>'+note+'</p></article>').join('');
  $('#family').innerHTML='<option value="">전체 병종</option>'+DATA.soldiers.map(s=>'<option value="'+s.id+'">'+esc(s.koName)+'</option>').join('');
  const picker=$('#compareOrigin');
  picker.innerHTML='<option value="">기준 선택 안 함</option>'+REPORT.records.map(r=>'<option value="'+esc(r.profileId)+'">'+esc(r.name)+' · '+esc(r.soldierName)+'</option>').join('');
  picker.addEventListener('change',()=>setComparison(picker.value));
  $('#compareClear').addEventListener('click',()=>setComparison(null));
  const params=new URLSearchParams(location.search);$('#search').value=params.get('q')||'';if(params.has('family'))$('#family').value=params.get('family');
  if(params.has('compare')&&REPORT.records.some(r=>r.profileId===params.get('compare'))){comparison={profileId:params.get('compare'),candidateId:null};picker.value=comparison.profileId;}
  $('#search').addEventListener('input',render);$('#family').addEventListener('change',render);
  $('#catalogMetric').addEventListener('change',()=>{
    render();if(selected&&!$('#originDetails').hidden)void openOrigin(selected,activeCandidateId);
  });
  for(const id of ['#routeGrowthTiming','#routeGrowthAttempts','#routeGrowthSuccess'])
    $(id).addEventListener('change',()=>{
      render();if(selected&&!$('#originDetails').hidden)void openOrigin(selected,activeCandidateId);
    });
  for(const [id,direction] of [['#scrollStatsLeft',-1],['#scrollStatsRight',1]])
    $(id).addEventListener('click',()=>$('#originTableScroll').scrollBy({left:direction*260,behavior:'smooth'}));
  document.addEventListener('input',e=>{
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
    if(origin)void openOrigin(origin.dataset.openOrigin);
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
    if(research)showResearch(research.dataset.researchNode);if(candidate)void openOrigin(selected,candidate.dataset.candidate);
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
