let DATA=null;
let sort={key:"soldiers",dir:-1};
const PLAN_BUCKETS=new Map(),PLAN_CACHE=new Map();
let RESEARCH_TOPICS=null;
const $=q=>document.querySelector(q);
const fmt=n=>n==null||Number.isNaN(Number(n))?"—":Number(n).toLocaleString("ko-KR",{maximumFractionDigits:1});
const esc=s=>String(s??"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m]));
const ROLE_LABELS={attack:"공격",tractor:"견인/포획",defense:"방어/회피",sensor:"탐지/사격지원",mobility:"기동/연료"};
const CRAFT_WEAPON_TYPE_META={"0":{"label":"소형 무장/지원","count":4,"roles":["attack","tractor","defense"],"damage":[0,4],"range":[10,30],"accuracy":[0,45],"ammo":[0,400],"samples":["14mm 탈것용 체인건(소형)","소형 견인 광선 방사기","소형 방어막 생성기","탈것용 용비늘 장갑"]},"1":{"label":"중·대형 무장","count":20,"roles":["attack","tractor","defense","sensor"],"damage":[0,200],"range":[10,55],"accuracy":[0,90],"ammo":[0,999],"samples":["4연장 기관포","개틀링 라스캐논","견인 광선 방사기","대형 방어막 생성기","램제트 포","리틀'일리야 로켓 포드"]},"2":{"label":"미사일","count":17,"roles":["attack","defense","mobility","sensor"],"damage":[15,600],"range":[10,65],"accuracy":[35,200],"ammo":[1,24],"samples":["급강하 폭탄 발사기(미사일)","다축방향 추진기","랜서 발사기","메두사 발사기","미티어 발사기","스팅레이 발사기"]},"3":{"label":"무장창/중폭장","count":6,"roles":["attack","defense"],"damage":[90,800],"range":[10,50],"accuracy":[15,75],"ammo":[2,48],"samples":["급강하 폭탄 발사기(무장창)","내파 폭탄 발사기","대형 방어막 생성기","아발란치 무장창","중형 폭탄 발사기(무장창)","헬 폭탄 발사기(무장창)"]},"4":{"label":"폭격","count":5,"roles":["attack"],"damage":[30,240],"range":[10,10],"accuracy":[25,45],"ammo":[4,20],"samples":["고블린 발사기","급강하 폭탄 발사기(폭격)","에어볼 발사기(폭격)","중형 폭탄 발사기(폭격)","헬 폭탄 발사기(폭격)"]},"5":{"label":"차량/경무장","count":11,"roles":["attack","defense"],"damage":[1,40],"range":[10,40],"accuracy":[20,70],"ammo":[4,300],"samples":["14mm 탈것용 체인건","25mm 기관포","게코 거치대","경기관총","래틀스네이크 발사기","로토건"]},"6":{"label":"대공/전자","count":7,"roles":["attack","defense","sensor"],"damage":[3,110],"range":[15,60],"accuracy":[35,100],"ammo":[10,800],"samples":["14mm 탈것용 대공포탑","50mm 2연장 대공포","고르곤 대공 미사일 발사기","차저 라스터렛","탈것용 전투 레이더","하이퍼웨이브 조준기"]},"7":{"label":"주력 무장/지원","count":9,"roles":["attack","mobility","sensor","tractor","defense"],"damage":[0,200],"range":[10,50],"accuracy":[0,70],"ammo":[0,1500],"samples":["4연장 기관포 주력","바실리스크 포 주력","빔 레이저 주력","오로라의 지휘 쉘","오블리터레이터 포 주력","주력 견인 광선 방사기"]},"8":{"label":"휴대 화기","count":5,"roles":["attack"],"damage":[4,30],"range":[10,20],"accuracy":[15,70],"ammo":[4,24],"samples":["게코 거치대","돌격대포","유탄발사기","RPG","로켓 발사기"]},"9":{"label":"어둠기술","count":21,"roles":["attack","defense","mobility","sensor"],"damage":[0,120],"range":[0,20],"accuracy":[0,100],"ammo":[0,72],"samples":["공간 변위장치","공간 변위장치 X","공간 변위장치+","무결성 필드","무결성 필드 X","무결성 필드+"]},"10":{"label":"은폐","count":1,"roles":["defense"],"damage":null,"range":[75,75],"accuracy":[100,100],"ammo":null,"samples":["은폐 장치"]},"11":{"label":"특수 화기","count":4,"roles":["attack"],"damage":[6,130],"range":[10,50],"accuracy":[45,85],"ammo":[3,150],"samples":["25mm 기관포","시걸 발사기","자사나 포"]},"21":{"label":"전기 보조","count":5,"roles":["mobility","defense","sensor"],"damage":null,"range":null,"accuracy":null,"ammo":null,"samples":["전기장치용 엔진 과충전기","전기장치용 회피 장치","탈것용 보조 전지","해적 라디오","헬레리움 초전지"]},"22":{"label":"기계 보조","count":3,"roles":["mobility","defense","sensor"],"damage":null,"range":null,"accuracy":null,"ammo":null,"samples":["초압축기","탈것용 용비늘 장갑","해적 라디오"]},"23":{"label":"소형 지원","count":9,"roles":["defense","sensor"],"damage":null,"range":null,"accuracy":null,"ammo":null,"samples":["방어막 축전기","소형 방어막 생성기","전투 스캐너","추가 선체 장갑판","탈것용 용비늘 장갑","탈것용 전투 레이더"]},"24":{"label":"엔진/장갑 보조","count":2,"roles":["defense","mobility"],"damage":null,"range":null,"accuracy":null,"ammo":null,"samples":["니트로 부스터","탈것용 추가 장갑"]},"25":{"label":"회피/전지 보조","count":2,"roles":["defense","mobility"],"damage":null,"range":null,"accuracy":null,"ammo":null,"samples":["전기장치용 회피 장치","헬레리움 초전지"]},"26":{"label":"연료/장갑 보조","count":3,"roles":["mobility","defense"],"damage":null,"range":null,"accuracy":null,"ammo":null,"samples":["고압 화학 연료 탱크","탈것용 추가 장갑","화학 연료 탱크"]},"27":{"label":"대형 연료 보조","count":2,"roles":["mobility","defense"],"damage":null,"range":null,"accuracy":null,"ammo":null,"samples":["고압 화학 연료 탱크","화학 연료 탱크"]},"28":{"label":"보강 엔진","count":1,"roles":["defense","mobility"],"damage":null,"range":null,"accuracy":null,"ammo":null,"samples":["보강된 엔진"]},"29":{"label":"소형 화학연료","count":2,"roles":["mobility","defense"],"damage":null,"range":null,"accuracy":null,"ammo":null,"samples":["고압 화학 연료 탱크","화학 연료 탱크"]},"30":{"label":"대형 화학연료","count":2,"roles":["mobility","defense"],"damage":null,"range":null,"accuracy":null,"ammo":null,"samples":["고압 화학 연료 탱크","화학 연료 탱크"]}};
function slotAllowedTypes(v){const raw=v?.id??v;return [...new Set((Array.isArray(raw)?raw:[raw]).flat(Infinity).filter(x=>x!=null).map(Number).filter(Number.isFinite))]}
function craftSlots(x){return (x.weaponTypes||[]).slice(0,Number(x.weapons)||0).map((v,i)=>({slot:i+1,allowedTypes:slotAllowedTypes(v)}))}
function typeMeta(t){return CRAFT_WEAPON_TYPE_META[String(t)]||null}
function craftRoles(x){return [...new Set(craftSlots(x).flatMap(s=>s.allowedTypes.flatMap(t=>typeMeta(t)?.roles||[])))]}
function roleBadges(roles){return (roles||[]).map(r=>'<span class="role role-'+esc(r)+'">'+esc(ROLE_LABELS[r]||r)+'</span>').join(" ")||'<span class="muted">비무장/미분류</span>'}
function rangeText(v){return Array.isArray(v)?(v[0]===v[1]?fmt(v[0]):fmt(v[0])+"–"+fmt(v[1])):"—"}
function usageText(m){if(!m)return"미분류";const attack=m.roles.includes("attack"),support=m.roles.some(r=>r!=="attack");return attack&&support?"공격+지원 혼합":attack?"공격용":"지원용"}
function slotTypeTable(x){
 const slots=craftSlots(x);
 if(!slots.length)return'<div class="slot-card"><strong>장비 슬롯 없음</strong><p class="muted">이 기체는 기체용 장비 슬롯이 없습니다.</p></div>';
 return slots.map(s=>{
  const rows=s.allowedTypes.map(t=>{
   const m=typeMeta(t);
   if(!m)return'<tr><td>Type '+esc(t)+'</td><td>미분류</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>원본 메타 없음</td></tr>';
   return'<tr><td><b>'+esc(m.label)+'</b><span class="id">weaponType '+esc(t)+'</span></td><td>'+esc(usageText(m))+'</td><td>'+roleBadges(m.roles)+'</td><td>'+fmt(m.count)+'종</td><td>'+rangeText(m.damage)+'</td><td>'+rangeText(m.range)+'</td><td>'+rangeText(m.accuracy)+'</td><td>'+rangeText(m.ammo)+'</td><td class="sample-cell">'+m.samples.map(esc).join(" · ")+'</td></tr>';
  }).join("");
  return'<section class="slot-card"><div class="slot-head"><strong>슬롯 '+fmt(s.slot)+'</strong><span class="muted">허용 타입 '+esc(s.allowedTypes.join(", ")||"미지정")+'</span></div><div class="weapon-table"><table><thead><tr><th>장비 계열</th><th>용도</th><th>역할</th><th>호환 장비</th><th>위력</th><th>사거리</th><th>명중</th><th>탄약</th><th>대표 장비</th></tr></thead><tbody>'+rows+'</tbody></table></div></section>';
 }).join("");
}

async function load(){
  const [r,research]=await Promise.all([
    fetch("../data/progression.json"),
    fetch("../data/progression-research.json")
  ]);
  if(!r.ok)throw new Error("진행 데이터 HTTP "+r.status);
  if(!research.ok)throw new Error("연구 카탈로그 HTTP "+research.status);
  DATA=await r.json();
  RESEARCH_TOPICS=(await research.json()).topics||[];
  renderSummary();render();
}
function renderSummary(){
  const crafts=DATA.crafts||[];
  $("#summary").innerHTML=[
    ["전체",crafts.length+"종","Ruleset crafts 전체"],
    ["병력 수송",crafts.filter(x=>(x.soldiers||0)>0).length+"종","soldiers > 0"],
    ["장비 슬롯",crafts.filter(x=>(x.weapons||0)>0).length+"종","공격 무장·방어·지원 슬롯 포함"],
    ["분기 전용",crafts.filter(x=>(x.summary?.commonBranchGates||[]).length).length+"종","모든 확인 경로가 같은 분기를 공유"]
  ].map(x=>'<article class="metric card"><strong>'+x[0]+' '+x[1]+'</strong><span>'+x[2]+'</span></article>').join("");
}
function eventById(id){return DATA?.events?.[id]||null}
function eventScript(eventId,scriptId){return (eventById(eventId)?.scripts||[]).find(s=>s.id===scriptId)||null}
function searchBlob(x){
  const routeBits=(x.acquisitionPaths||[]).flatMap(p=>{
    if(p.kind!=="manufacture")return[];
    const r=DATA?.recipes?.[p.recipeId];if(!r)return[];
    return[r.koName,r.enName,r.id,...(r.eventVariants||[]).flatMap(v=>{const e=eventById(v.eventId);return[e?.koName,e?.enName,e?.id]})];
  });
  const weaponBits=craftSlots(x).flatMap(s=>s.allowedTypes.flatMap(t=>{const m=typeMeta(t);return[m?.label,...(m?.samples||[]),...(m?.roles||[])].filter(Boolean)}));
  return [x.koName,x.enName,x.id,...(x.aliases||[]),...(x.summary?.commonBranchGates||[]).flatMap(g=>[g.koName,g.enName,g.id]),...routeBits,...weaponBits]
    .filter(Boolean).join(" ").toLowerCase();
}
function filtered(){
  const q=$("#search").value.trim().toLowerCase(),route=$("#route").value,cap=$("#capacity").value;
  const a=(DATA.crafts||[]).filter(x=>{
    if(q&&!searchBlob(x).includes(q))return false;
    const exclusive=(x.summary?.commonBranchGates||[]).length>0;
    if(route==="exclusive"&&!exclusive)return false;if(route==="open"&&exclusive)return false;
    if(cap==="troop"&&!(x.soldiers>0))return false;if(cap==="large"&&!(x.soldiers>=10))return false;
    return true;
  });
  a.sort((a,b)=>{
    let av=a[sort.key],bv=b[sort.key];
    if(sort.key==="research"){av=a.summary?.nominalMinResearch;bv=b.summary?.nominalMinResearch}
    if(sort.key==="name")return a.koName.localeCompare(b.koName,"ko")*sort.dir;
    if(av==null&&bv==null)return a.koName.localeCompare(b.koName,"ko");
    if(av==null)return 1;if(bv==null)return-1;
    return (Number(av)-Number(bv))*sort.dir;
  });return a;
}
function th(label,key){const on=sort.key===key?" sort-on":"";const arrow=sort.key===key?(sort.dir>0?" ▲":" ▼"):"";return '<th data-sort="'+key+'" class="'+on+'">'+label+arrow+'</th>'}
function render(){
  const rows=filtered();$("#rowCount").textContent=rows.length+"개";
  $("#craftTable thead").innerHTML="<tr>"+[
    th("탈것/기체","name"),th("병력","soldiers"),th("조종사","pilots"),th("속도","speedMax"),th("연료","fuelMax"),th("내구","damageMax"),th("장비 슬롯","weapons"),"<th>슬롯 성격</th>",th("레이더","radarRange"),th("구매","costBuy"),th("임대/유지","costRent"),th("명목 연구량*","research"),"<th>루트</th>"
  ].join("")+"</tr>";
  $("#craftTable tbody").innerHTML=rows.map(x=>'<tr data-id="'+esc(x.id)+'"><td><span class="name">'+esc(x.koName)+'</span><span class="id">'+esc(x.enName)+' · '+esc(x.id)+'</span></td><td>'+fmt(x.soldiers)+'</td><td>'+fmt(x.pilots)+'</td><td>'+fmt(x.speedMax)+'</td><td>'+fmt(x.fuelMax)+'</td><td>'+fmt(x.damageMax)+'</td><td>'+fmt(x.weapons)+'</td><td class="role-cell">'+roleBadges(craftRoles(x))+'</td><td>'+fmt(x.radarRange)+'</td><td>'+fmt(x.costBuy)+'</td><td>'+fmt(x.costRent)+'</td><td>'+fmt(x.summary?.nominalMinResearch)+'</td><td>'+((x.summary?.commonBranchGates||[]).map(g=>'<span class="trait">'+esc(g.koName)+'</span>').join("")||"—")+'</td></tr>').join("");
  document.querySelectorAll("th[data-sort]").forEach(el=>el.addEventListener("click",()=>{const k=el.dataset.sort;if(sort.key===k)sort.dir*=-1;else sort={key:k,dir:k==="name"?1:-1};render()}));
  document.querySelectorAll("tbody tr").forEach(el=>el.addEventListener("click",()=>openDetail(el.dataset.id)));
}
function planById(id){return DATA?.plans?.[id]||null}
function topicByIndex(i){return Number.isInteger(i)?RESEARCH_TOPICS?.[i]:i}
function planSummary(plan,title="해금 연구 트리"){
  if(!plan)return'<div class="route-card muted">연구 경로 없음</div>';
  const roots=(plan.roots||[]).map(topicByIndex).filter(Boolean).map(x=>'<span class="tag">'+esc(x.koName||x.id)+'</span>').join(" ");
  const gates=(plan.branchGates||[]).map(topicByIndex).filter(Boolean).map(x=>'<span class="trait">'+esc(x.koName||x.id)+'</span>').join(" ");
  return '<div class="route-card"><strong>'+title+'</strong><div class="route-metrics"><span>명목 누적 연구량 <b>'+fmt(plan.totalCost)+'</b></span><span>연구 노드 <b>'+fmt(plan.topicCount)+'</b></span><span>표본 조건 <b>'+fmt(plan.needItemCount)+'</b></span><span>기지 기능 <b>'+esc((plan.baseFuncs||[]).join(", ")||"없음")+'</b></span></div><div class="route-line"><small>루트 시작</small> '+roots+'</div>'+(gates?'<div class="route-line warn"><small>분기 연구</small> '+gates+'</div>':'')+'<button class="plan-load" data-plan="'+plan.id+'">전체 연구 노드 보기</button><div class="plan-body" data-plan-body="'+plan.id+'"></div></div>';
}
async function loadPlan(id){
  if(PLAN_CACHE.has(id))return PLAN_CACHE.get(id);
  const b=id[0];
  if(!PLAN_BUCKETS.has(b)){const r=await fetch("../data/progression-plans/"+b+".json");PLAN_BUCKETS.set(b,(await r.json()).plans)}
  if(!RESEARCH_TOPICS){const r=await fetch("../data/progression-research.json");RESEARCH_TOPICS=(await r.json()).topics||[]}
  const compact=PLAN_BUCKETS.get(b)[id]||{topics:[]};
  const p={...compact,topics:(compact.topics||[]).map(i=>RESEARCH_TOPICS[i]).filter(Boolean)};
  PLAN_CACHE.set(id,p);return p;
}
function entityLabel(x){return esc(typeof x==="string"?x:(x?.koName||x?.enName||x?.id||"—"))}
function compactValue(v){
  if(Array.isArray(v))return v.map(compactValue).join(", ");
  if(v&&typeof v==="object")return Object.entries(v).filter(([,x])=>x!==false&&x!=null).map(([k,x])=>x===true?k:(k+"="+compactValue(x))).join(", ");
  return String(v);
}
function eventConditions(s){
  const c=s?.conditions||{},bits=[],labels={firstMonth:"시작 월",lastMonth:"종료 월",minDifficulty:"최소 난이도",maxDifficulty:"최대 난이도",executionOdds:"발생 확률",minFunds:"최소 자금",maxFunds:"최대 자금",minScore:"최소 점수",maxScore:"최대 점수"};
  for(const [k,label] of Object.entries(labels))if(c[k]!=null)bits.push(label+" "+esc(compactValue(c[k])));
  for(const [k,v] of Object.entries(c))if(/Triggers$/.test(k)&&k!=="researchTriggers")bits.push(esc(k)+" "+esc(compactValue(v)));
  if((s?.researchTriggers||[]).length)bits.push("필요 연구 "+s.researchTriggers.map(entityLabel).join(", "));
  return bits.length?'<div class="route-line"><small>이벤트 조건</small> '+bits.join(" · ")+'</div>':'<div class="route-line"><small>이벤트 조건</small> 추가 조건 없음</div>';
}
function planTable(p){
  const outcome=t=>{
    const bits=[];
    if((t.spawnedItems||[]).length)bits.push('<span class="tag">생성 '+t.spawnedItems.map(entityLabel).join(", ")+'</span>');
    if((t.unlocks||[]).length)bits.push('<span class="tag">후속 해금 '+t.unlocks.map(entityLabel).join(", ")+'</span>');
    return bits.join("<br>")||"—";
  };
  const rows=(p.topics||[]).map(t=>'<tr><td>'+esc(t.koName)+'</td><td>'+fmt(t.cost)+'</td><td>'+((t.prerequisites||[]).map(esc).join("<br>")||"—")+'</td><td>'+outcome(t)+'</td><td>'+(t.needItem?(t.destroyItem?"필요·소모":"필요"):"—")+'</td><td>'+((t.requiresBaseFunc||[]).join(", ")||"—")+'</td><td>'+((t.disables||[]).map(entityLabel).join("<br>")||"—")+'</td></tr>').join("");
  const items=(p.topics||[]).filter(t=>t.needItem).map(x=>'<span class="tag">'+esc(x.koName)+' '+(x.destroyItem?"(소모)":"(필요)")+'</span>').join(" ");
  return (items?'<div class="route-line"><small>실물 표본 연구</small> '+items+'</div>':'')+'<div class="plan-table"><table><thead><tr><th>연구</th><th>량</th><th>직접 선행</th><th>연구 결과</th><th>표본</th><th>기지 기능</th><th>이 선택으로 닫히는 연구/루트</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function recipeHtml(r){
  const items=(r.requiredItems||[]).map(i=>'<div class="req-item"><b>'+esc(i.koName)+'</b> × '+fmt(i.qty)+(i.researchSources||[]).map(src=>'<div class="event-box"><span class="tag">연구 생산</span> '+entityLabel(src)+'</div>').join("")+(i.eventSources||[]).map(src=>{const ev=eventById(src.eventId);return ev?'<div class="event-box"><span class="tag">이벤트</span> '+esc(ev.koName)+(ev.scripts||[]).map(s=>eventConditions(s)).join("")+'</div>':""}).join("")+'</div>').join("");
  const variants=(r.eventVariants||[]).map(v=>{const ev=eventById(v.eventId),plan=planById(v.researchPlanId);return '<details><summary>'+esc(ev?.koName||v.eventId)+' 경유 전체 루트 · 명목 '+fmt(plan?.totalCost)+'</summary>'+eventConditions(eventScript(v.eventId,v.scriptId))+planSummary(plan,"이벤트 포함 연구 트리")+'</details>'}).join("");
  return '<div class="acq-card"><strong>'+esc(r.koName)+'</strong><span class="id">'+esc(r.id)+'</span><div class="metrics"><div class="box"><strong>제조비</strong>'+fmt(r.cost)+'</div><div class="box"><strong>시간</strong>'+fmt(r.time)+'</div><div class="box"><strong>작업장</strong>'+fmt(r.space)+'</div><div class="box"><strong>기지 기능</strong>'+esc((r.requiresBaseFunc||[]).join(", ")||"없음")+'</div></div>'+planSummary(planById(r.baseResearchPlanId),"기본 제조 해금 연구")+(items?'<h4>필요 아이템과 획득원</h4>'+items:'')+variants+'</div>';
}
function openDetail(id){
  const x=DATA.crafts.find(c=>c.id===id);if(!x)return;
  const gates=(x.summary?.commonBranchGates||[]).map(g=>'<span class="trait">'+esc(g.koName)+'</span>').join(" ")||"없음";
  const paths=(x.acquisitionPaths||[]).map(p=>p.kind==="buy"?'<div class="acq-card"><strong>직접 구매</strong><span>비용 '+fmt(p.cost)+'</span>'+planSummary(planById(p.researchPlanId),"구매 해금 연구")+'</div>':recipeHtml(DATA?.recipes?.[p.recipeId]||{})).join("")||'<span class="muted">직접 추적 가능한 구매/제조 경로 없음</span>';
  $("#detailBody").innerHTML='<p class="eyebrow">탈것 / 기체</p><h2>'+esc(x.koName)+'</h2><p class="muted">'+esc(x.enName)+' · '+esc(x.id)+'</p>'+
  '<div class="detail-grid"><div class="box"><strong>탑승 병력 / 조종사</strong>'+fmt(x.soldiers)+' / '+fmt(x.pilots)+'</div><div class="box"><strong>속도 / 연료</strong>'+fmt(x.speedMax)+' / '+fmt(x.fuelMax)+'</div><div class="box"><strong>내구 / 장비 슬롯</strong>'+fmt(x.damageMax)+' / '+fmt(x.weapons)+'</div><div class="box"><strong>슬롯 성격</strong>'+roleBadges(craftRoles(x))+'</div><div class="box"><strong>레이더</strong>'+fmt(x.radarRange)+' @ '+fmt(x.radarChance)+'%</div><div class="box"><strong>구매 / 판매</strong>'+fmt(x.costBuy)+' / '+fmt(x.costSell)+'</div><div class="box"><strong>임대·유지비</strong>'+fmt(x.costRent)+'</div><div class="box"><strong>명목 누적 연구량*</strong>'+fmt(x.summary?.nominalMinResearch)+'</div><div class="box"><strong>공통 분기</strong>'+gates+'</div></div>'+
  '<h3>장비 슬롯·무장 용도 상세</h3><div class="weapon-note"><b>읽는 법:</b> Ruleset의 <code>weapons</code>는 현재 장착 무기 수가 아니라 장비 슬롯 수입니다. 아래는 각 슬롯이 허용하는 <code>weaponType</code> 계열의 용도와 v.o1.1.1 기체장비 정의에서의 수치 범위입니다. 공격 수치가 없는 계열은 방어·기동·탐지 같은 지원용입니다.</div>'+slotTypeTable(x)+
  '<h3>획득·구매·제조 방식</h3><div class="routes">'+paths+'</div><p class="muted">* 명목 연구량은 dependencies+requires 중복 제거 합계입니다. 이벤트/무료해금으로 실제 최소는 더 작을 수 있습니다.</p>';
  $("#detailDialog").showModal();
}
["search"].forEach(id=>$("#"+id).addEventListener("input",render));["route","capacity"].forEach(id=>$("#"+id).addEventListener("change",render));
$("#closeDialog").addEventListener("click",()=>$("#detailDialog").close());
$("#detailDialog").addEventListener("click",async e=>{
  if(e.target.id==="detailDialog"){e.currentTarget.close();return}
  const b=e.target.closest(".plan-load");if(!b)return;b.disabled=true;b.textContent="불러오는 중…";
  try{const p=await loadPlan(b.dataset.plan);const t=b.closest(".route-card")?.querySelector('[data-plan-body="'+b.dataset.plan+'"]');if(t)t.innerHTML=planTable(p);b.remove()}catch(err){b.disabled=false;b.textContent="로드 실패";console.error(err)}
});
load().catch(err=>{$("#summary").innerHTML='<article class="metric card"><strong>데이터 로드 실패</strong><span>'+esc(err.message)+'</span></article>';console.error(err)});
