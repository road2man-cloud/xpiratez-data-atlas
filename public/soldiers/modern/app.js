// Read-only, source-first Soldier DB. No local-save input or custom planner.
import {loadRuntime} from '../../db-runtime.js';
import {renderResearchRelations,researchRelations} from '../../research-relations.js';
import {replayOriginWitness,WITNESS_STATS} from './origin-witness.js';
import {researchBranchEvidence} from './origin-branch-evidence.js';
import {DISPLAY_STATS,displayTotal,projectBirthStats,projectCandidateStats} from './score-12.js';
import {projectCandidateGrowthLimit} from './score-growth-12.js';
import {renderAcquisitionPaths} from './acquisition-paths.js?v=20261104-flat-research-1';
import {buildAcquisitionTree,buildAcquisitionSubtree,renderAcquisitionTree} from './acquisition-condition-tree.js?v=20261104-event-direct-1';
import {mountAcquisitionTechViewer} from './acquisition-tech-view.js?v=20261104-techmap-2';
import {auditInitialChoiceEvidence,renderInitialChoiceEvidence} from './origin-start-choice-evidence.js?v=20261104-flat-research-1';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>n==null?'—':Number(n).toLocaleString('ko-KR');
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
function render(){
  if(blocked||!REPORT)return;
  const q=$('#search').value.toLocaleLowerCase('ko').trim(),family=$('#family').value,metric=$('#catalogMetric').value;
  const rows=REPORT.records.filter(r=>(!family||r.soldierType===family)&&(!q||
    [r.profileId,r.name,r.soldierName,
      ...Object.keys(DATA.profiles.find(p=>p.id===r.profileId)?.acquisitionRequiredItems||{}),
      ...r.candidates.flatMap(c=>c.transforms.map(name))]
      .join(' ').toLocaleLowerCase('ko').includes(q)));
  const rowScore=r=>metric==='birth'?displayTotal(r.displayBirth):metric==='certified'?-1:score(best(r,metric==='growth'?'growth':'provisional'),metric==='growth'?'growth':'provisional');
  rows.sort((a,b)=>rowScore(b)-rowScore(a)||a.name.localeCompare(b.name,'ko'));
  $('#rowCount').textContent=rows.length+' / 72개 출생처';
  $('#originTable thead').innerHTML='<tr><th>출생처 / 최초 병종</th><th>상태</th><th>12종 합계</th>'+DISPLAY_STATS.map(k=>'<th>'+esc(DATA.statLabels[k])+'</th>').join('')+'</tr>';
  $('#originTable tbody').innerHTML=rows.map(r=>{
    const c=best(r,metric==='growth'?'growth':'provisional');
    const values=metric==='birth'?r.displayBirth:metric==='certified'?null:
      metric==='growth'?(c?.growth?.kind==='conditional-upper-envelope'?c.growth.stats:null):c?.display.stats;
    const total=values?displayTotal(values):null;
    return '<tr data-origin-id="'+esc(r.profileId)+'" data-proof="'+r.status+'"><td><button class="origin-open" data-open-origin="'+esc(r.profileId)+'">'+esc(r.name)+'</button><small>'+esc(r.soldierName)+'</small><small class="id">'+esc(r.profileId)+'</small><small class="mobile-proof">'+(metric==='growth'?'성장상한':metric==='provisional'?'연구·시술':metric==='birth'?'출생 기준':'미인증')+(c?' · 조건부':' · 미해결')+'</small></td><td>'+
      (metric==='certified'?'최종 인증 없음':metric==='birth'?'원본 출생 기준값':c?metric==='growth'?'성장 완료 가정 · 상한 추정':'조건부 연구·시술 값':'연구 경로 보완 중')+
      '<small>'+(c?c.researchCount+'개 연구 재생 · '+c.transforms.length+'개 시술':'미완료 연구: '+esc(r.unresolved?.id||'조사 중'))+'</small></td><td class="score">'+fmt(total)+'</td>'+DISPLAY_STATS.map(k=>'<td>'+fmt(values?.[k])+'</td>').join('')+'</tr>';
  }).join('')||'<tr><td colspan="15">해당 출생처 없음</td></tr>';
  $('#catalogStatus').textContent=metric==='growth'?'기본 비교: 출생 가능 최댓값부터 연구 경로의 병종·훈련 변화를 순서대로 적용하고, 변신 전후 체력훈련·전투 성장의 조건부 상한을 투사합니다. 12종 상한 합계는 동시 달성·실전 검증이나 전역 최고값의 증명이 아닙니다.':metric==='provisional'?'기존 연구·시술 잠정값: 출생 최솟값에서 시작한 경로이며 전투·체력 성장은 더하지 않은 값입니다.':metric==='birth'?'출생 시점의 원본 최솟값입니다. 성장 이후 잠정값이나 최종 최대치가 아닙니다.':'확정 최종 최대치 0건. 잠정값을 확정값으로 바꿔 표시하지 않습니다.';
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
  selected=id;const c=record.candidates.find(c=>c.id===(candidateId||best(record,metric==='growth'?'growth':'provisional')?.id));
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
    staminaBasis+birthPaths+initialChoiceHtml+transformationGateHtml(c,profile)+statGrid(c,metric)+
    '<h3>경로 요약</h3><p>'+esc(c.description)+'</p><p>사전 완료 연구 0개 → '+c.researchCount+'개 연구 처리 → 마지막 연구 '+(finalResearch?node(finalResearch.id||finalResearch.research):'출생 이벤트')+'. 전체 연구 순서는 화면을 채우지 않고 재생 증거에 보존합니다.</p>'+
    '<h3>이 경로의 분기 선택과 배제</h3>'+choiceHtml(c)+
    '<details><summary>훈련으로 배제되는 다른 선택</summary>'+c.trainingExclusions.map(t=>'<h4>'+esc(name(t.id))+'</h4>'+t.excludes.map(e=>'<p>'+esc(name(t.id))+(e.direction==='bidirectional'?' ↔ ':' → ')+esc(name(e.id))+' · '+(e.direction==='bidirectional'?'양방향':'일방향')+' 이력 배제</p>').join('')).join('')+'</details>'+
    '<details class="assumptions"><summary>필수 확인 · 남은 자원·출생·확률 가정 '+c.assumptions.length+'건</summary><ul>'+assumptionHtml(c)+'</ul><h4>모델의 미검증 조건</h4><ul>'+(c.limitations||[]).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul><details><summary>자동 연구·lookup 조건부 처리 기록</summary><ul>'+(c.modelAssumptions||[]).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></details></details>'+
    '<details><summary>다른 완결 후보 · 목표 A/B 비교</summary><p>목표 A 영구 특성 12종 합 최고 '+fmt(bonus?.display.bonusTotal)+' / 연구·시술 12종 합 최고 '+fmt(best(record,'provisional')?.display.total)+' / 성장 완료 조건부 상한 합 최고 '+fmt(best(record,'growth')?.growth?.total)+'. 서로 다른 병사·연구 경로의 유리한 수치를 합치지 않습니다.</p>'+record.candidates.map(x=>'<p><button data-candidate="'+x.id+'">'+esc(x.description)+' · 성장상한 '+fmt(x.growth?.total)+' / 연구·시술 '+fmt(x.display.total)+'</button></p>').join('')+'</details>'+
    '<p class="fine">재생: 통과 · 실제 게임 실측: 없음 · 전역 최적성: 미증명 · 원본 v.o2. 더 높은 경로는 같은 출생처의 비교 후보로 등록한 뒤 갱신합니다.</p>';
  showBirthTech(profile);
}
function showResearch(id){
  const dialog=$('#researchDialog');$('#researchDetail').innerHTML='<p class="eyebrow">X-PIRATEZ 2.1 연구 원본</p><h2>'+esc(name(id))+'</h2><p class="id">'+esc(id)+'</p>'+renderResearchRelations(id,DATA.researchRules,CATALOG.names);
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
  const params=new URLSearchParams(location.search);$('#search').value=params.get('q')||'';if(params.has('family'))$('#family').value=params.get('family');
  $('#search').addEventListener('input',render);$('#family').addEventListener('change',render);$('#catalogMetric').addEventListener('change',render);
  for(const [id,direction] of [['#scrollStatsLeft',-1],['#scrollStatsRight',1]])
    $(id).addEventListener('click',()=>$('#originTableScroll').scrollBy({left:direction*260,behavior:'smooth'}));
  document.addEventListener('click',e=>{const origin=e.target.closest('[data-open-origin]'),research=e.target.closest('[data-research-node]'),candidate=e.target.closest('[data-candidate]');
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
