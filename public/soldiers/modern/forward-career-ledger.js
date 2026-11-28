// Existing soldier DB adapter for the produced, bounded forward career ledger.
let request;
const sameIds=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&JSON.stringify([...new Set(a)].sort())===JSON.stringify([...new Set(b)].sort());
export function loadCareerLedger(){
 return request??=fetch(new URL('../../data/campaign-forward-career-targets-v1.json',import.meta.url),{cache:'no-cache'}).then(async r=>{
  if(!r.ok)throw Error('HTTP '+r.status);
  const d=await r.json();
  if(d.schema!=='ATLAS_FORWARD_CAREER_TARGETS_V1'||!Array.isArray(d.profiles)||!Array.isArray(d.trainings)||!Array.isArray(d.graphs)||d.summary?.gameCertified!==0)throw Error('원장 형식 불일치');
  return d;
 }).catch(e=>{request=null;throw e;});
}
const append=(host,tag,s)=>{const e=document.createElement(tag);e.textContent=s;host.append(e);return e;};
const actionLabels={research:'연구 완료',repeatResearch:'반복 연구',freeResearch:'무료 연구 지급',eventResearch:'이벤트 연구',acquirePurchase:'구매 가정',acquireFundedPurchase:'자금 차감 구매',acquireEventItems:'이벤트 물품',manufactureBundle:'제조',missionResearch:'임무 결과',buildFacility:'건설 착수',finishFacility:'건설 완료'};
function renderWitness(host,w,label,name){
 if(!w||w.gameCertified!==false||!Array.isArray(w.steps))return;
 const details=append(host,'details','');
 append(details,'summary',label+' · '+w.steps.length+'단계 · '+(w.conditional?'조건부 모델':'제한 모델')+' · 게임 미인증');
 append(details,'p',[w.file,'상태 '+w.state,'난이도 '+w.scenario?.difficulty,...(w.scenario?.regions||[]),...(w.scenario?.countries||[])].join(' / '));
 const list=append(details,'ol','');
 for(const s of w.steps){
  const id=s.id||s.research||s.recipe||s.item||s.event||s.deployment||'';
  append(list,'li',(actionLabels[s.type]||s.type)+(id?' · '+(name(id)||id)+' ['+id+']':'')+(s.assumeOutcome||s.assumeAvailability?' · 조건부':''));
 }
}
export function renderCareerLedger(host,d,{kind,id,rule,source,name=x=>x}){
 host.replaceChildren();
 append(host,'h3','캠페인 시작 기준 정방향 육성 근거');
 if(d.sourceMetadataSha256!==source){append(host,'p','현재 규칙과 원장 출처가 일치하지 않아 표시 보류.');return;}
 const row=(kind==='profile'?d.profiles:d.trainings).find(x=>x.id===id);
 if(!row||!sameIds(row.requires,rule.requires)){append(host,'p','현재 요구 연구와 원장이 일치하지 않아 표시 보류.');return;}
 const labels={'joint-model-reached':'동일 캠페인에서 요구 연구 공동 도달','no-explicit-research':'명시적 요구 연구 없음','not-observed-jointly':'현재 제한 탐색에서 공동 도달 미확인'};
 append(host,'p',labels[row.researchStatus]||'판정 미확인');
 append(host,'p','실제 게임 인증 및 전체 육성 경로 재생은 아직 완료되지 않았습니다. 기존 능력치·훈련 조합은 신규 정방향 인증 결과가 아닙니다.');
 renderWitness(host,row.researchWitness,'요구 연구 도달 경로',name);
 renderWitness(host,row.manufactureWitness,'모집 제조 실행 경로 (입대 완료와 구분)',name);
 if(kind==='profile'&&!row.manufactureWitness)append(host,'p','모집·입대 실행은 이 원장에서 확인되지 않았습니다.');
 const missing=(row.topicStatus||[]).filter(t=>!t.observed);
 if(missing.length)append(host,'p','미도달 연구: '+missing.map(t=>(name(t.id)||t.id)+' ['+t.id+']').join(' · '));
 if((row.functions||[]).length)append(host,'p','필수 기지 기능: '+row.functions.join(', '));
 const materials=Object.entries(row.items||{});
 if(materials.length)append(host,'p','필수 재료 (실제 확보 미인증): '+materials.map(([k,n])=>(name(k)||k)+' × '+n).join(', '));
 if(kind==='training'&&(row.previous||[]).length)append(host,'p','필수 이전 훈련: '+row.previous.map(name).join(', '));
 append(host,'p','참조 그래프 '+d.graphs.length+'개 · 각 증거는 별도 캠페인 상태이며 다른 경로의 연구를 합산하지 않습니다.');
}
export function mountCareerLedger(host,opts){
 if(!host)return;
 host.textContent='정방향 육성 목표 원장 불러오는 중…';
 loadCareerLedger().then(d=>{if(!host.isConnected)return;renderCareerLedger(host,d,opts);if(d.sourceMetadataSha256!==opts.source)return;const panel=append(host,'section','육성 비교 자료 불러오는 중…');loadCareerComparison().then(c=>{if(panel.isConnected)renderCareerComparison(panel,c,opts);}).catch(e=>{if(panel.isConnected)panel.textContent='육성 비교 자료 로딩 실패: '+e.message;});}).catch(e=>{if(host.isConnected)host.textContent='정방향 육성 원장 로딩 실패: '+e.message;});
}

let comparisonRequest;
const STAT_KEYS=['tu','stamina','health','bravery','reactions','firing','throwing','strength','psiStrength','psiSkill','melee','mana'];
const STAT_NAMES=['행동력','기력','체력','용기','반응','사격','투척','근력','정신력','정신기술','근접','마나'];
const vectorOk=v=>v&&STAT_KEYS.every(k=>Number.isSafeInteger(v[k]));
const total=v=>STAT_KEYS.reduce((s,k)=>s+v[k],0);
export function loadCareerComparison(){
 return comparisonRequest??=fetch(new URL('../../data/campaign-forward-career-comparison-v1.json',import.meta.url),{cache:'no-cache'}).then(async r=>{
  if(!r.ok)throw Error('HTTP '+r.status);
  const d=await r.json();
  if(!['ATLAS_FUNDED_CAREER_COMPARISON_V1','ATLAS_FORWARD_CAREER_COMPARISON_V2'].includes(d.schema)||!Array.isArray(d.rows))throw Error('비교 원장 형식 불일치');
  return d;
 }).catch(e=>{comparisonRequest=null;throw e;});
}
export function renderCareerComparison(host,d,{kind,id,source,name=x=>x}){
 host.replaceChildren();
 append(host,'h3','실제 정방향 육성 모델 비교');
 const rows=d.rows.filter(r=>r.sourceMetadataSha256===source&&r.gameCertified===false&&Array.isArray(r.trainingIds)&&r.trainingIds.every(t=>typeof t==='string')&&vectorOk(r.before)&&vectorOk(r.stats)&&vectorOk(r.delta)&&STAT_KEYS.every(k=>r.stats[k]-r.before[k]===r.delta[k])&&(kind==='profile'?r.profileId===id:r.trainingIds.includes(id)));
 append(host,'p','출생 최소 능력치 기준의 조건부 모델 결과입니다. 전역 최대치 또는 실제 게임 인증으로 해석하지 않습니다.');
 if(!rows.length){append(host,'p','해당 병종·훈련의 실제 재생 결과는 아직 없습니다.');return;}
 const scroll=append(host,'div','');scroll.style.overflowX='auto';
 const table=append(scroll,'table','');
 const head=append(append(table,'thead',''),'tr','');
 const th=s=>{const e=append(head,'th',s);e.scope='col';};
 ['훈련 순서','금융 모드','행동 수',...STAT_NAMES,'합계','증가량','비용','잔액','재생 기록'].forEach(th);
 const body=append(table,'tbody','');
 for(const r of [...rows].sort((a,b)=>total(b.stats)-total(a.stats))){
  const tr=append(body,'tr',''),td=s=>append(tr,'td',String(s));
  const unlimited=r.financeMode==='unlimited';
  td(r.trainingIds.map(k=>name(k)||k).join(' → '));
  td(unlimited?'자금 제한 없음':r.financeMode==='funded'||d.schema==='ATLAS_FUNDED_CAREER_COMPARISON_V1'?'기존 자금 차감':'미확인');
  td(r.steps??'—');
  STAT_KEYS.forEach(k=>td(r.stats[k]));
  td(total(r.stats));td('+'+total(r.delta));
  td(Number.isSafeInteger(r.totalCost)?r.totalCost.toLocaleString('ko-KR'):'미기록');
  td(unlimited?'해당 없음':Number.isSafeInteger(r.finalFunds)?r.finalFunds.toLocaleString('ko-KR'):'미기록');
  const cell=td('');
  if(typeof r.file==='string'&&/^campaign-forward-career-replay-[a-zA-Z0-9_-]+\.json$/.test(r.file)){
   const link=append(cell,'a','원본 재생');link.href=new URL('../../data/'+r.file,import.meta.url).href;link.target='_blank';link.rel='noopener noreferrer';
  }
 }
 append(host,'p','비교 대상 '+rows.length+'개 · 현재 기록 중 최고 합계 '+Math.max(...rows.map(r=>total(r.stats)))+'점. 기존 최대치 표와 별개의 실제 모델 재생 결과입니다.');
}
