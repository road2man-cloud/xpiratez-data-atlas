let DATA=null;
let sort={key:"soldiers",dir:-1};
const PLAN_BUCKETS=new Map(),PLAN_CACHE=new Map();
let RESEARCH_TOPICS=null;
const $=q=>document.querySelector(q);
const fmt=n=>n==null||Number.isNaN(Number(n))?"—":Number(n).toLocaleString("ko-KR",{maximumFractionDigits:1});
const esc=s=>String(s??"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m]));
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
    ["10명 이상",crafts.filter(x=>(x.soldiers||0)>=10).length+"종","대형 수송"],
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
  return [x.koName,x.enName,x.id,...(x.aliases||[]),...(x.summary?.commonBranchGates||[]).flatMap(g=>[g.koName,g.enName,g.id]),...routeBits]
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
    th("탈것/기체","name"),th("병력","soldiers"),th("조종사","pilots"),th("속도","speedMax"),th("연료","fuelMax"),th("내구","damageMax"),th("무장","weapons"),th("레이더","radarRange"),th("구매","costBuy"),th("임대/유지","costRent"),th("명목 연구량*","research"),"<th>루트</th>"
  ].join("")+"</tr>";
  $("#craftTable tbody").innerHTML=rows.map(x=>'<tr data-id="'+esc(x.id)+'"><td><span class="name">'+esc(x.koName)+'</span><span class="id">'+esc(x.enName)+' · '+esc(x.id)+'</span></td><td>'+fmt(x.soldiers)+'</td><td>'+fmt(x.pilots)+'</td><td>'+fmt(x.speedMax)+'</td><td>'+fmt(x.fuelMax)+'</td><td>'+fmt(x.damageMax)+'</td><td>'+fmt(x.weapons)+'</td><td>'+fmt(x.radarRange)+'</td><td>'+fmt(x.costBuy)+'</td><td>'+fmt(x.costRent)+'</td><td>'+fmt(x.summary?.nominalMinResearch)+'</td><td>'+((x.summary?.commonBranchGates||[]).map(g=>'<span class="trait">'+esc(g.koName)+'</span>').join("")||"—")+'</td></tr>').join("");
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
  const rows=(p.topics||[]).map(t=>'<tr><td>'+esc(t.koName)+'</td><td>'+fmt(t.cost)+'</td><td>'+((t.prerequisites||[]).map(esc).join("<br>")||"—")+'</td><td>'+(t.needItem?(t.destroyItem?"필요·소모":"필요"):"—")+'</td><td>'+((t.requiresBaseFunc||[]).join(", ")||"—")+'</td><td>'+((t.disables||[]).map(entityLabel).join("<br>")||"—")+'</td></tr>').join("");
  const items=(p.topics||[]).filter(t=>t.needItem).map(x=>'<span class="tag">'+esc(x.koName)+' '+(x.destroyItem?"(소모)":"(필요)")+'</span>').join(" ");
  return (items?'<div class="route-line"><small>실물 표본 연구</small> '+items+'</div>':'')+'<div class="plan-table"><table><thead><tr><th>연구</th><th>량</th><th>직접 선행</th><th>표본</th><th>기지 기능</th><th>이 선택으로 닫히는 연구/루트</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function recipeHtml(r){
  const items=(r.requiredItems||[]).map(i=>'<div class="req-item"><b>'+esc(i.koName)+'</b> × '+fmt(i.qty)+(i.eventSources||[]).map(src=>{const ev=eventById(src.eventId);return ev?'<div class="event-box"><span class="tag">이벤트</span> '+esc(ev.koName)+(ev.scripts||[]).map(s=>eventConditions(s)).join("")+'</div>':""}).join("")+'</div>').join("");
  const variants=(r.eventVariants||[]).map(v=>{const ev=eventById(v.eventId),plan=planById(v.researchPlanId);return '<details><summary>'+esc(ev?.koName||v.eventId)+' 경유 전체 루트 · 명목 '+fmt(plan?.totalCost)+'</summary>'+eventConditions(eventScript(v.eventId,v.scriptId))+planSummary(plan,"이벤트 포함 연구 트리")+'</details>'}).join("");
  return '<div class="acq-card"><strong>'+esc(r.koName)+'</strong><span class="id">'+esc(r.id)+'</span><div class="metrics"><div class="box"><strong>제조비</strong>'+fmt(r.cost)+'</div><div class="box"><strong>시간</strong>'+fmt(r.time)+'</div><div class="box"><strong>작업장</strong>'+fmt(r.space)+'</div><div class="box"><strong>기지 기능</strong>'+esc((r.requiresBaseFunc||[]).join(", ")||"없음")+'</div></div>'+planSummary(planById(r.baseResearchPlanId),"기본 제조 해금 연구")+(items?'<h4>필요 아이템과 이벤트 획득원</h4>'+items:'')+variants+'</div>';
}
function openDetail(id){
  const x=DATA.crafts.find(c=>c.id===id);if(!x)return;
  const gates=(x.summary?.commonBranchGates||[]).map(g=>'<span class="trait">'+esc(g.koName)+'</span>').join(" ")||"없음";
  const paths=(x.acquisitionPaths||[]).map(p=>p.kind==="buy"?'<div class="acq-card"><strong>직접 구매</strong><span>비용 '+fmt(p.cost)+'</span>'+planSummary(planById(p.researchPlanId),"구매 해금 연구")+'</div>':recipeHtml(DATA?.recipes?.[p.recipeId]||{})).join("")||'<span class="muted">직접 추적 가능한 구매/제조 경로 없음</span>';
  $("#detailBody").innerHTML='<p class="eyebrow">탈것 / 기체</p><h2>'+esc(x.koName)+'</h2><p class="muted">'+esc(x.enName)+' · '+esc(x.id)+'</p>'+
  '<div class="detail-grid"><div class="box"><strong>탑승 병력 / 조종사</strong>'+fmt(x.soldiers)+' / '+fmt(x.pilots)+'</div><div class="box"><strong>속도 / 연료</strong>'+fmt(x.speedMax)+' / '+fmt(x.fuelMax)+'</div><div class="box"><strong>내구 / 무장</strong>'+fmt(x.damageMax)+' / '+fmt(x.weapons)+'</div><div class="box"><strong>레이더</strong>'+fmt(x.radarRange)+' @ '+fmt(x.radarChance)+'%</div><div class="box"><strong>구매 / 판매</strong>'+fmt(x.costBuy)+' / '+fmt(x.costSell)+'</div><div class="box"><strong>임대·유지비</strong>'+fmt(x.costRent)+'</div><div class="box"><strong>명목 누적 연구량*</strong>'+fmt(x.summary?.nominalMinResearch)+'</div><div class="box"><strong>공통 분기</strong>'+gates+'</div></div>'+
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
