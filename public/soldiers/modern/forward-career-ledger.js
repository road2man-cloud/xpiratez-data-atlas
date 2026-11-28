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
 loadCareerLedger().then(d=>{if(host.isConnected)renderCareerLedger(host,d,opts);}).catch(e=>{if(host.isConnected)host.textContent='정방향 육성 원장 로딩 실패: '+e.message;});
}
