// Read-only, source-first Soldier DB. No local-save input or custom planner.
import {loadRuntime} from '../../db-runtime.js';
import {renderResearchRelations,researchRelations} from '../../research-relations.js';
import {replayOriginWitness,WITNESS_STATS} from './origin-witness.js';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>n==null?'—':Number(n).toLocaleString('ko-KR');
const sha=async x=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(x))))].map(n=>n.toString(16).padStart(2,'0')).join('');
let DATA,REPORT,CATALOG,selected=null,replayGeneration=0,blocked=false;
const verified=new Map();
const name=id=>CATALOG?.names[id]||DATA?.transformations.find(t=>t.id===id)?.koName||id;
const node=id=>'<button type="button" class="research-node" data-research-node="'+esc(id)+'">'+esc(name(id))+'</button>';
const best=r=>r.candidates.find(c=>c.id===r.bestCandidateId)||null;
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
  const digest=await sha({rules:DATA.meta.source.rules,profiles:DATA.profiles,soldiers:DATA.soldiers,bonuses:DATA.bonuses,transforms:DATA.transformations,research:DATA.researchRules,itemIds:CATALOG.itemIds,originSources});
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
  $('#originMaxima').dataset.validation='validated';
}
function render(){
  if(blocked||!REPORT)return;
  const q=$('#search').value.toLocaleLowerCase('ko').trim(),family=$('#family').value,metric=$('#catalogMetric').value;
  const rows=REPORT.records.filter(r=>(!family||r.soldierType===family)&&(!q||
    [r.profileId,r.name,r.soldierName,...r.candidates.flatMap(c=>c.transforms.map(name))].join(' ').toLocaleLowerCase('ko').includes(q)));
  rows.sort((a,b)=>(best(b)?.total??-1)-(best(a)?.total??-1)||a.name.localeCompare(b.name,'ko'));
  $('#rowCount').textContent=rows.length+' / 72개 출생처';
  $('#originTable thead').innerHTML='<tr><th>출생처 / 최초 병종</th><th>상태</th><th>11종 합계</th>'+WITNESS_STATS.map(k=>'<th>'+esc(DATA.statLabels[k])+'</th>').join('')+'</tr>';
  $('#originTable tbody').innerHTML=rows.map(r=>{
    const c=best(r),values=metric==='birth'?r.birthReference:metric==='certified'?null:c?.stats;
    const total=values?WITNESS_STATS.reduce((s,k)=>s+values[k],0):null;
    return '<tr data-origin-id="'+esc(r.profileId)+'" data-proof="'+r.status+'"><td><button class="origin-open" data-open-origin="'+esc(r.profileId)+'">'+esc(r.name)+'</button><small>'+esc(r.soldierName)+'</small><small class="id">'+esc(r.profileId)+'</small></td><td>'+
      (metric==='certified'?'최종 인증 없음':metric==='birth'?'원본 출생 기준값':c?'조건부 잠정 최고':'연구 경로 보완 중')+
      '<small>'+(c?c.researchCount+'개 연구 재생 · '+c.transforms.length+'개 시술':'미완료 연구: '+esc(r.unresolved?.id||'조사 중'))+'</small></td><td class="score">'+fmt(total)+'</td>'+WITNESS_STATS.map(k=>'<td>'+fmt(values?.[k])+'</td>').join('')+'</tr>';
  }).join('')||'<tr><td colspan="14">해당 출생처 없음</td></tr>';
  $('#catalogStatus').textContent=metric==='provisional'?'조건부 잠정값: 출생 최솟값에서 시작한 완결 연구·획득·훈련 경로. 자원·이벤트/RNG 가정과 분기 배제는 상세에 표시합니다.':metric==='birth'?'출생 시점의 원본 최솟값입니다. 성장 이후 잠정값이나 최종 최대치가 아닙니다.':'확정 최종 최대치 0건. 잠정값을 확정값으로 바꿔 표시하지 않습니다.';
}
function statGrid(c){return '<div class="stat-grid">'+WITNESS_STATS.map(k=>'<div><small>'+esc(DATA.statLabels[k])+'</small><strong>'+fmt(c.stats[k])+'</strong><small>원시 '+fmt(c.raw[k])+' + 영구 특성 '+fmt(c.bonus[k])+'</small></div>').join('')+'</div>';}
function choiceHtml(c){
  if(!c.branchChoices.length)return '<p>이 경로에는 직접 disables를 실행하는 연구 분기가 없습니다.</p>';
  return c.branchChoices.map(x=>{
    const action=c.steps[x.at],direct=action.id===x.id||action.research===x.id;
    const label=direct?(action.assumeOutcome?'무료 지급/이벤트 결과 가정':'선택한 연구'):'자동·연결 연구의 효과';
    return '<details class="branch-choice"><summary>'+esc(name(x.id))+' <small>'+label+' · 배제 '+x.excludes.length+'개</small></summary><p>'+node(x.id)+'</p>'+x.excludes.map(e=>
      '<p data-exclusion="'+e.direction+'">'+node(x.id)+(e.direction==='bidirectional'?' ↔ ':' → ')+node(e.id)+' <b>'+({oneway:'일방향 배제',bidirectional:'양방향 배제',self:'자기 비활성화'}[e.direction])+'</b>'+(e.actuallyClosed?' · 최종 시점 폐쇄':' · 최종 시점은 별도 상태')+'</p>').join('')+
      '<p class="muted">배제 전 이미 시행한 훈련의 보존 여부는 이 경로의 동일 병사 이력으로 재생했습니다.</p></details>';
  }).join('');
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
  const record=REPORT.records.find(r=>r.profileId===id);if(!record)return;
  selected=id;const c=record.candidates.find(c=>c.id===(candidateId||record.bestCandidateId));
  const host=$('#originDetails');host.hidden=false;
  host.innerHTML='<div class="detail-head"><h2>'+esc(record.name)+'</h2><button id="originDetailClose">닫기</button></div><p class="muted">등록 경로의 원본·현재 수치를 재대조하는 중…</p>';
  await new Promise(ok=>setTimeout(ok,0));
  if(!c){
    const gaps=(record.researchBottlenecks||[]).map(g=>
      '<li>'+node(g.id)+' <strong>'+({NOT_INDEXED:'이벤트·지급 출처 미색인',NO_SUPPLY_METHOD:'현재 공급 방법 미확보',UPSTREAM_UNRESOLVED:'상위 선행 경로 미해결',CHRONOLOGY_UNRESOLVED:'시간순 연구 재생 미완결',SEARCH_LIMIT:'제한 탐색 미완결'}[g.kind]||'추가 검증 필요')+'</strong> · '+esc(g.reason)+'</li>').join('');
    host.innerHTML='<div class="detail-head"><h2>'+esc(record.name)+'</h2><button id="originDetailClose">닫기</button></div>'+
      '<p><strong>출생처 등록 완료 · 완결 연구 경로 미확보</strong></p><p>'+node(record.unresolved?.id||record.profileId)+'</p>'+
      '<p>'+esc(record.unresolved?.reason||'조사 중')+'</p><h3>추가 확인이 필요한 상위 연구·이벤트 근거</h3><ul>'+gaps+'</ul>'+
      '<p>이것은 현재 탐색기가 발견하지 못한 공급·시간순 경로입니다. 제한 탐색의 실패는 영구 불가능 판정이 아닙니다. 실제 획득을 증명하기 전에는 잠정 수치를 만들어 넣지 않습니다.</p>';
    return;
  }
  let replay=verified.get(c.id);
  if(!replay){replay=replayOriginWitness(c.steps,DATA);verified.set(c.id,replay);}
  if(generation!==replayGeneration)return;
  if(!replay.ok||!replay.exact||replay.total!==c.total||JSON.stringify(replay.stats)!==JSON.stringify(c.stats)){
    sourceFail('선택 경로 재생 불일치: '+(replay.reason||c.id));return;
  }
  const finalResearch=c.steps.filter(s=>s.type==='research'||s.type==='freeResearch').at(-1);
  const bonus=record.candidates.find(x=>x.id===record.bestBonusCandidateId);
  host.innerHTML='<div class="detail-head"><div><p class="eyebrow">조건부 잠정 최고 · 연구 경로 재생 완료</p><h2>'+esc(record.name)+'</h2></div><button id="originDetailClose">닫기</button></div>'+
    '<p>'+esc(record.soldierName)+'에서 출생 → '+esc(name(c.finalSoldierType))+' · <strong>11종 합계 '+fmt(c.total)+'</strong> · 영구 특성 합 '+fmt(c.bonusTotal)+'</p>'+
    '<p class="scope-note">'+esc(c.scope)+'입니다. 성장이 완료된 병사의 전역 최대치가 아닙니다.</p>'+statGrid(c)+
    '<h3>경로 요약</h3><p>'+esc(c.description)+'</p><p>사전 완료 연구 0개 → '+c.researchCount+'개 연구 처리 → 마지막 연구 '+(finalResearch?node(finalResearch.id||finalResearch.research):'출생 이벤트')+'. 전체 연구 순서는 화면을 채우지 않고 재생 증거에 보존합니다.</p>'+
    '<h3>이 경로의 분기 선택과 배제</h3>'+choiceHtml(c)+
    '<details><summary>훈련으로 배제되는 다른 선택</summary>'+c.trainingExclusions.map(t=>'<h4>'+esc(name(t.id))+'</h4>'+t.excludes.map(e=>'<p>'+esc(name(t.id))+(e.direction==='bidirectional'?' ↔ ':' → ')+esc(name(e.id))+' · '+(e.direction==='bidirectional'?'양방향':'일방향')+' 이력 배제</p>').join('')).join('')+'</details>'+
    '<details class="assumptions"><summary>필수 확인 · 남은 자원·출생·확률 가정 '+c.assumptions.length+'건</summary><ul>'+assumptionHtml(c)+'</ul><h4>모델의 미검증 조건</h4><ul>'+(c.limitations||[]).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul><details><summary>자동 연구·lookup 조건부 처리 기록</summary><ul>'+(c.modelAssumptions||[]).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></details></details>'+
    '<details><summary>다른 완결 후보 · 목표 A/B 비교</summary><p>목표 A 영구 특성 합 최고 '+fmt(bonus?.bonusTotal)+' / 목표 B 최종 11종 합 최고 '+fmt(best(record)?.total)+'. 서로 다른 경로의 유리한 수치를 합치지 않습니다.</p>'+record.candidates.map(x=>'<p><button data-candidate="'+x.id+'">'+esc(x.description)+' · 합계 '+fmt(x.total)+'</button></p>').join('')+'</details>'+
    '<p class="fine">재생: 통과 · 실제 게임 실측: 없음 · 전역 최적성: 미증명 · 원본 v.o2. 더 높은 경로는 같은 출생처의 비교 후보로 등록한 뒤 갱신합니다.</p>';
}
function showResearch(id){
  const dialog=$('#researchDialog');$('#researchDetail').innerHTML='<p class="eyebrow">X-PIRATEZ 2.1 연구 원본</p><h2>'+esc(name(id))+'</h2><p class="id">'+esc(id)+'</p>'+renderResearchRelations(id,DATA.researchRules,CATALOG.names);
  if(!dialog.open)dialog.showModal();
}
function showTraining(id){
  const t=DATA.transformations.find(t=>t.id===id);if(!t)return;
  $('#researchDetail').innerHTML='<p class="eyebrow">병종 DB · 훈련 원본 근거</p><h2>'+esc(t.koName)+'</h2><p>'+esc(id)+'</p><h3>무조건 필요</h3><p>'+t.requires.map(node).join(' ')+'</p><h3>필수 이전 훈련</h3><p>'+t.requiredPreviousTransformations.map(esc).join(' · ')+'</p><h3>금지 이전 훈련</h3><p>'+t.forbiddenPreviousTransformations.map(esc).join(' · ')+'</p><p>이 정보는 병종 경로의 근거입니다. 별도 훈련 조합기나 저장 파일 입력 화면은 없습니다.</p><h3>직접 변화 / 영구 특성</h3><div class="stat-grid">'+WITNESS_STATS.map(k=>'<div><small>'+esc(DATA.statLabels[k])+'</small><strong>'+fmt(t.flatOverallStatChange?.[k])+' / '+fmt(t.traitStats?.[k])+'</strong></div>').join('')+'</div>';
  $('#researchDialog').showModal();
}
async function init(){try{
  const json=async path=>{const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw Error(path+' HTTP '+r.status);return r.json()};
  [DATA,REPORT,CATALOG]=await Promise.all([loadRuntime('../../data/soldiers-modern-index.json'),json('../../data/soldier-origin-candidates.json'),json('../../data/soldier-source-catalog.json')]);
  await validate();
  const complete=REPORT.records.filter(r=>r.candidates.length).length;
  $('#catalogSummary').innerHTML=[['등록 출생처','72','같은 병종이어도 출생처 분리'],['연구 경로 완결',complete+'/72','자원·이벤트 가정은 조건부'],['등록 후보',REPORT.summary.witnesses,'실제 재생을 통과한 경로'],['최종 최대치 인증','0','잠정값과 구분']].map(([label,v,note])=>'<article class="card"><small>'+label+'</small><strong>'+v+'</strong><p>'+note+'</p></article>').join('');
  $('#family').innerHTML='<option value="">전체 병종</option>'+DATA.soldiers.map(s=>'<option value="'+s.id+'">'+esc(s.koName)+'</option>').join('');
  const params=new URLSearchParams(location.search);$('#search').value=params.get('q')||'';if(params.has('family'))$('#family').value=params.get('family');
  $('#search').addEventListener('input',render);$('#family').addEventListener('change',render);$('#catalogMetric').addEventListener('change',render);
  document.addEventListener('click',e=>{const origin=e.target.closest('[data-open-origin]'),research=e.target.closest('[data-research-node]'),candidate=e.target.closest('[data-candidate]');
    if(origin)void openOrigin(origin.dataset.openOrigin);if(research)showResearch(research.dataset.researchNode);if(candidate)void openOrigin(selected,candidate.dataset.candidate);
    if(e.target.id==='originDetailClose'){$('#originDetails').hidden=true;replayGeneration++;}
  });
  $('#closeResearchDialog').onclick=()=>$('#researchDialog').close();$('#researchDialog').addEventListener('click',e=>{if(e.target===$('#researchDialog'))$('#researchDialog').close()});
  $('#researchSearch').addEventListener('input',()=>{const q=$('#researchSearch').value.toLocaleLowerCase('ko');$('#researchMatches').innerHTML=q?Object.keys(DATA.researchRules).filter(id=>(id+' '+name(id)).toLocaleLowerCase('ko').includes(q)).slice(0,35).map(node).join(' '):''});
  render();
  if(params.has('profile'))void openOrigin(params.get('profile'));
  if(params.has('training'))showTraining(params.get('training'));
  if(params.has('research'))showResearch(params.get('research'));
}catch(error){sourceFail(error.message);console.error(error)}}
void init();
