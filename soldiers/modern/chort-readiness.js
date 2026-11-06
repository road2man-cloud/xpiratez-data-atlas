// Standalone source-first comparison: Chort rule eligibility is NOT proof of execution.
const $=q=>document.querySelector(q);
const escape=s=>String(s??'').replace(/[&<>"']/g,ch=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));
const num=x=>x==null?'—':Number(x).toLocaleString('ko-KR');
const status=s=>s==='meets'?'출생 시 충족':s==='depends'?'개체별 확인':'초기 조건 미달';
const sourceLabel=s=>s.sourceType==='direct'?'직접 고용':
  s.sourceType==='manufacture'?'제조':'이벤트·기타 지급';
const researchName=x=>escape(x.name||x.id);
const acquire=s=>{
  const sources=[...(s.acquisitionResearch||[]).map(x=>researchName(x)),
    ...(s.acquisitionRequiredItems||[]).map(x=>researchName(x)+' ×'+num(x.quantity))];
  return sources.length?sources.join(' · '):'원본에 지정된 별도 전제 없음';
};
function integrity(d){
  if(d?.kind!=='xpz-chort-starting-source-audit-v1'||d.sourceVersion!=='v.o2'||
    d.transformationId!=='STR_CHORT_SUMMONING'||d.finalSoldierType!=='STR_SOLDIER_CHORT'||
    d.summary?.sourceOrigins!==42||d.sources?.length!==42||
    d.summary?.permittedStartBodyTypes!==16||
    d.summary?.initiallyMeetsPsi!==17||d.summary?.individuallyCheckPsi!==25||
    d.summary?.originsWithChronologyWitness!==3||d.summary?.chronologyWitnesses!==61)
    throw Error('코르트 출생처 원본 검증 정보가 예상 버전과 일치하지 않습니다.');
  if(new Set(d.sources.map(s=>s.id)).size!==42||
    d.sources.some(s=>s.psiMin>s.psiMax||!['meets','depends'].includes(s.initialPsiStatus)))
    throw Error('코르트 출생처 Psi 규칙이나 고유 ID가 일치하지 않습니다.');
}
function renderMetrics(d){
  const items=[
    ['허용 출발 병종',d.summary.permittedStartBodyTypes+'종','코르트 구속 원본 규칙'],
    ['등록 출생처',d.summary.sourceOrigins+'개','병종 유형으로 분류한 후보'],
    ['초기 Psi 40 충족',d.summary.initiallyMeetsPsi+'개','출생 시 범위 최솟값 충족'],
    ['개체별 Psi 확인',d.summary.individuallyCheckPsi+'개','출생 시 40 미만 개체 가능']
  ];
  $('#summary').innerHTML=items.map(([label,v,description])=>
    '<article class="metric"><small>'+escape(label)+'</small><strong>'+escape(v)+'</strong><small>'+
    escape(description)+'</small></article>').join('');
}
function renderCompare(d){
  const ids=['direct:STR_SOLDIER_PEASANT','manufacture:STR_THEBAN_ASSAULT_CLONE'];
  const items=ids.map(id=>d.sources.find(s=>s.id===id));
  if(items.some(x=>!x))throw Error('농부/돌격 클론 원본 경로 없음');
  $('#comparison').innerHTML=items.map(s=>'<article class="compare-item" data-profile="'+escape(s.id)+'">'+
    '<div class="kicker">'+escape(sourceLabel(s))+'</div><h3>'+escape(s.source)+'</h3>'+
    '<p><strong>획득 cost '+num(s.acquisitionCost)+'</strong> · 초기 Psi '+num(s.psiMin)+
    (s.psiMin!==s.psiMax?'~'+num(s.psiMax):'')+'</p>'+
    '<p>시작 계급 '+num(s.startingRank)+' · '+escape(status(s.initialPsiStatus))+'</p>'+
    '<p>추가 획득 조건: '+acquire(s)+'</p>'+
    '<p>코르트 조건부 시간순 재생 후보 <strong>'+num(s.replayedChortCandidates)+'건</strong>'+
    (s.bestConditionalGrowth!=null?' · 최고 발견 상한 '+num(s.bestConditionalGrowth):' · 완결 경로 미발견')+'</p>'+
    '<a href="./?q='+encodeURIComponent(s.id)+'">원래 출생처의 육성 경로 확인</a></article>').join('');
}
function renderGate(d){
  const t=d.transformation;
  const lines=[
    '변신 시 Psi 강도 '+num(t.psiThreshold)+' 이상',
    '대원 계급 '+num(t.minRank)+' 이상',
    '선행 연구 '+t.requiredResearch.map(x=>x.name||x.id).join(', '),
    '기지 기능 '+t.baseFunctions.join(', '),
    ...t.requiredItems.map(x=>(x.name||x.id)+' ×'+num(x.quantity)),
    ...(t.forbiddenTraining.length?['이전 이력 금지: '+t.forbiddenTraining.map(x=>x.name||x.id).join(', ')]:[]),
    t.resetPreviousTraining?'변신 시 이전 훈련 이력·보너스 초기화':'이전 훈련 이력 유지'
  ];
  $('#transformGate').innerHTML=lines.map(x=>'<span>'+escape(x)+'</span>').join('');
}
function renderTable(d){
  const query=$('#filter').value.trim().toLocaleLowerCase('ko');
  const psi=$('#psiFilter').value,proof=$('#proofFilter').value;
  const rows=d.sources.filter(s=>
    (!query||[s.id,s.source,s.startBody,s.startBodyName].join(' ').toLocaleLowerCase('ko').includes(query))&&
    (psi==='all'||s.initialPsiStatus===psi)&&
    (proof==='all'||(proof==='found'?s.replayedChortCandidates>0:s.replayedChortCandidates===0)));
  $('#rowCount').textContent=rows.length+' / '+d.sources.length+'개 출생처';
  $('#sources').innerHTML=rows.map(s=>
    '<tr data-profile="'+escape(s.id)+'">'+
    '<td><a href="./?q='+encodeURIComponent(s.id)+'">'+escape(s.source)+'</a><small>'+escape(s.id)+'</small></td>'+
    '<td>'+escape(s.startBodyName)+'</td>'+
    '<td>'+num(s.psiMin)+(s.psiMin!==s.psiMax?'–'+num(s.psiMax):'')+'</td>'+
    '<td class="status '+escape(s.initialPsiStatus)+'">'+escape(status(s.initialPsiStatus))+'</td>'+
    '<td>'+num(s.startingRank)+'</td>'+
    '<td>'+num(s.acquisitionCost)+'</td>'+
    '<td><small>'+acquire(s)+'</small></td>'+
    '<td class="proof">'+(s.replayedChortCandidates?
      '<strong>'+num(s.replayedChortCandidates)+'건</strong><small>최고 발견 상한 '+num(s.bestConditionalGrowth)+'</small>':
      '완결 경로 미발견')+'</td>'+
    '</tr>').join('')||
    '<tr><td colspan="8">조건에 해당하는 출생처가 없습니다.</td></tr>';
}
async function init(){
  try{
    const url=new URL('../../data/soldier-chort-readiness.json',import.meta.url);
    const response=await fetch(url,{cache:'no-store'});
    if(!response.ok)throw Error('공개 원본 데이터 HTTP '+response.status);
    const data=await response.json();
    integrity(data);
    renderMetrics(data);renderCompare(data);renderGate(data);
    for(const id of ['#filter','#psiFilter','#proofFilter'])
      $(id).addEventListener(id==='#filter'?'input':'change',()=>renderTable(data));
    renderTable(data);
    document.documentElement.dataset.chortAudit='validated';
  }catch(error){
    document.documentElement.dataset.chortAudit='failed';
    $('#summary').innerHTML='<p class="error">원본 검증 실패: '+escape(error.message)+'</p>';
  }
}
init();
