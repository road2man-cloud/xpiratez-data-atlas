const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=v=>v==null||Number.isNaN(Number(v))?"—":Number(v).toLocaleString("ko-KR",{maximumFractionDigits:2});
const pct=v=>v==null?"—":(Number(v)*100).toFixed(Number(v)*100<10?2:1)+"%";
const dataBase="../data";
let db={index:[],counts:{},roles:{},triggerKinds:{}},forceDb={index:[],counts:{}},rows=[],detailCache=new Map(),editorialCache=new Map(),forceLinks=null;
const state={q:"",role:"",triggerKind:"",missRisk:"",reward:"",sort:"koName",dir:1,page:1,pageSize:100};

async function jsonGz(url){const r=await fetch(url);if(!r.ok)throw new Error(url+" "+r.status);if(typeof DecompressionStream==="undefined")throw new Error("이 브라우저는 gzip 데이터 스트림 해제를 지원하지 않습니다.");const stream=r.body.pipeThrough(new DecompressionStream("gzip"));return new Response(stream).json()}
function stat(label,value,note=""){return`<div class="stat"><span>${esc(label)}</span><b>${esc(fmt(value))}</b>${note?`<span>${esc(note)}</span>`:""}</div>`}
function riskLabel(v){return v==="high"?"높음":v==="medium"?"중간":"낮음"}
function riskClass(v){return v==="high"?"risk-high":v==="medium"?"risk-medium":"risk-low"}
function roleLabel(v){return db.roles?.[v]||v||"—"}

function initFilters(){
  $("#role").insertAdjacentHTML("beforeend",Object.entries(db.roles||{}).map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join(""));
  $("#triggerKind").insertAdjacentHTML("beforeend",Object.entries(db.triggerKinds||{}).map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join(""));
  $("#search").addEventListener("input",e=>{state.q=e.target.value.trim().toLowerCase();state.page=1;render()});
  for(const id of ["role","triggerKind","missRisk","reward"])$("#"+id).addEventListener("change",e=>{state[id]=e.target.value;state.page=1;render()});
  $("#pageSize").addEventListener("change",e=>{state.pageSize=Number(e.target.value);state.page=1;render()});
  $("#prev").onclick=()=>{if(state.page>1){state.page--;render()}};
  $("#next").onclick=()=>{state.page++;render()};
  $("#closeDrawer").onclick=closeDrawer;$("#backdrop").onclick=closeDrawer;
  addEventListener("hashchange",route);
}
function renderSummary(){
  const c=db.counts||{};
  $("#summary").innerHTML=[
    stat("전체 이벤트",c.events),
    stat("eventScripts",c.scripts),
    stat("연구/플래그 지급",c.researchRewards),
    stat("확정 아이템 지급",c.itemRewards),
    stat("기간 제한",c.boundedWindow),
    stat("false 게이트 포함",c.negativeGate),
    stat("이벤트형 미션",forceDb.counts?.missions||0,"통합검색 교차노출")
  ].join("");
}
function rewardMatch(x,v){
  if(!v)return true;
  if(v==="research")return x.researchRewardCount>0;
  if(v==="item")return x.guaranteedItemCount>0;
  if(v==="random")return x.randomRewardCount>0;
  if(v==="recruit")return x.hasRecruit;
  if(v==="funds")return x.funds!==0;
  if(v==="points")return x.points!==0;
  return true;
}
function filtered(){
  return db.index.filter(x=>{
    if(state.q&&!x.searchText.includes(state.q))return false;
    if(state.role&&x.primaryRole!==state.role)return false;
    if(state.triggerKind&&!(x.triggerKinds||[]).includes(state.triggerKind))return false;
    if(state.missRisk&&x.missRisk!==state.missRisk)return false;
    if(!rewardMatch(x,state.reward))return false;
    return true;
  });
}
function cmp(a,b,key){
  const av=a[key],bv=b[key];
  if(av==null&&bv==null)return 0;if(av==null)return 1;if(bv==null)return-1;
  if(typeof av==="number"&&typeof bv==="number")return av-bv;
  return String(av).localeCompare(String(bv),"ko",{numeric:true});
}
const cols=[
  ["koName","이벤트"],["primaryRoleKo","주 역할"],["scriptCount","스크립트"],["earliestMonth","최초 월"],["latestMonth","마지막 월"],
  ["minExecutionOdds","최소 Odds"],["positiveTriggerCount","필수"],["negativeTriggerCount","false"],
  ["researchRewardCount","연구"],["guaranteedItemCount","확정 아이템"],["randomRewardCount","랜덤"],
  ["funds","자금"],["points","점수"],["missRisk","놓침"]
];
function renderMissionSurface(){
  const box=$("#missionSurface"),q=state.q;
  if(!q){box.hidden=true;box.innerHTML="";return}
  const matches=(forceDb.index||[]).filter(x=>x.searchText?.includes(q)).slice(0,24);
  if(!matches.length){box.hidden=true;box.innerHTML="";return}
  box.hidden=false;
  box.innerHTML='<div class="table-head"><div><p class="eyebrow">통합 검색</p><h2>이벤트형 미션 / 적작전 '+fmt(matches.length)+'개</h2></div><span class="evidence direct">alienMission · 별도 분류</span></div>'+
    '<p class="classification-note">아래 항목은 내부 <code>events:</code> 객체가 아니라 <code>alienMission/missionScript</code> 계열입니다. 게임에서는 경고·미션으로 보여 이벤트처럼 느껴질 수 있어 이벤트 검색에서 함께 노출합니다.</p>'+
    '<div class="mission-hit-grid">'+matches.map(x=>'<a class="mission-hit" href="../forces/#force='+encodeURIComponent(x.id)+'"><span class="kind">이벤트형 미션 / 적작전</span><b>'+esc(x.koName)+'</b><span class="sub">'+esc(x.enName)+' · '+esc(x.id)+'</span><div class="metrics"><span>script '+fmt(x.scriptCount)+'</span><span>wave '+fmt(x.waveCount)+'</span><span>race '+fmt(x.raceCount)+'</span>'+(x.hasGround?'<span>착륙/지상</span>':'')+(x.hasHunter?'<span>Hunter</span>':'')+'</div></a>').join("")+'</div>';
}
function render(){
  renderMissionSurface();
  rows=filtered().sort((a,b)=>state.dir*cmp(a,b,state.sort));
  const pages=Math.max(1,Math.ceil(rows.length/state.pageSize));state.page=Math.min(state.page,pages);
  const start=(state.page-1)*state.pageSize,pageRows=rows.slice(start,start+state.pageSize);
  $("#rowCount").textContent=`${rows.length.toLocaleString("ko-KR")}개`;
  $("#pageInfo").textContent=`${state.page} / ${pages}`;
  $("#prev").disabled=state.page<=1;$("#next").disabled=state.page>=pages;
  $("#eventTable thead").innerHTML="<tr>"+cols.map(([k,l])=>`<th data-sort="${k}">${esc(l)}${state.sort===k?(state.dir>0?" ▲":" ▼"):""}</th>`).join("")+"</tr>";
  $("#eventTable tbody").innerHTML=pageRows.map(x=>`<tr data-id="${esc(x.id)}">
    <td><span class="name">${esc(x.koName)}</span><span class="sub">${esc(x.enName)} · ${esc(x.id)}</span></td>
    <td><span class="role">${esc(x.primaryRoleKo)}</span><span class="sub">${esc((x.roles||[]).filter(r=>r!==x.primaryRole).map(roleLabel).join(" · "))}</span></td>
    <td>${fmt(x.scriptCount)}</td><td>${fmt(x.earliestMonth)}</td><td>${fmt(x.latestMonth)}</td>
    <td>${x.minExecutionOdds==null?"—":fmt(x.minExecutionOdds)+"%"}${x.maxExecutionOdds!=null&&x.maxExecutionOdds!==x.minExecutionOdds?`<span class="sub">최대 ${fmt(x.maxExecutionOdds)}%</span>`:""}</td>
    <td>${fmt(x.positiveTriggerCount)}</td><td class="${x.negativeTriggerCount?"warning":""}">${fmt(x.negativeTriggerCount)}</td>
    <td>${fmt(x.researchRewardCount)}</td><td>${fmt(x.guaranteedItemCount)}</td><td>${fmt(x.randomRewardCount)}</td>
    <td class="${x.funds>0?"positive":x.funds<0?"negative":""}">${x.funds>0?"+":""}${fmt(x.funds)}</td>
    <td class="${x.points>0?"positive":x.points<0?"negative":""}">${x.points>0?"+":""}${fmt(x.points)}</td>
    <td><span class="risk ${riskClass(x.missRisk)}">${riskLabel(x.missRisk)}</span></td>
  </tr>`).join("");
  document.querySelectorAll("th[data-sort]").forEach(th=>th.onclick=()=>{const k=th.dataset.sort;if(state.sort===k)state.dir*=-1;else{state.sort=k;state.dir=1}render()});
  document.querySelectorAll("#eventTable tbody tr").forEach(tr=>tr.onclick=()=>{location.hash="event="+encodeURIComponent(tr.dataset.id)});
}
function kpis(xs){return`<div class="kpis">${xs.map(([k,v,cls=""])=>`<div class="kpi"><span>${esc(k)}</span><b class="${cls}">${esc(v)}</b></div>`).join("")}</div>`}
function namedChip(x,href=""){const body=`<b>${esc(x.koName||x.id)}</b><span class="sub">${esc(x.enName||"")} · ${esc(x.id)}</span>`;return href?`<a class="chip" href="${href}">${body}</a>`:`<span class="chip">${body}</span>`}
function itemLink(x){return namedChip(x,`../items/#item=${encodeURIComponent(x.id)}`)}
function researchLink(x){return namedChip(x,`../research/#research=${encodeURIComponent(x.id)}`)}
function forceLink(x){return namedChip({id:x.missionId,koName:x.missionKoName||x.missionId,enName:x.missionEnName||""},`../forces/#force=${encodeURIComponent(x.missionId)}`)}
function triggerChip(x){const cls=x.value===true?"required":x.value===false?"forbidden":"";return`<span class="trigger-chip ${cls}"><b>${esc(x.koName||x.id)}</b><span>${esc(x.label||"조건")} · ${esc(String(x.value))}</span><small>${esc(x.id)}</small></span>`}
function editorialMarkup(e){
  if(!e)return"";
  const row=(l,t)=>`<div class="editorial-row"><span>${esc(l)}</span><p>${esc(t)}</p></div>`;
  return`<section class="section editorial"><div class="insight-head"><h3>GPT 이벤트 인사이트</h3><span class="evidence">GPT 편집 · 룰셋 직접값과 분리</span></div>
    ${row("정체·역할",e.overview)}${row("발생 조건",e.trigger)}${row("실제 결과",e.result)}${row("플레이 가치",e.value)}${row("준비 행동",e.action)}${row("놓침 위험",e.missRisk)}${row("근거·검증",e.verification)}
  </section>`;
}
function triggerMapMarkup(maps){
  const entries=Object.entries(maps||{});if(!entries.length)return'<div class="empty">별도 trigger map 없음</div>';
  return entries.map(([kind,xs])=>`<div class="trigger-group"><b>${esc(db.triggerKinds?.[kind]||kind)}</b><div>${xs.map(x=>triggerChip({...x,label:db.triggerKinds?.[kind]||kind})).join("")}</div></div>`).join("");
}
function conditionsMarkup(c){
  const labels={firstMonth:"첫 월",lastMonth:"마지막 월",minDifficulty:"최소 난이도",maxDifficulty:"최대 난이도",executionOdds:"executionOdds",minFunds:"최소 자금",maxFunds:"최대 자금",minScore:"최소 점수",maxScore:"최대 점수"};
  const es=Object.entries(c||{});return es.length?es.map(([k,v])=>`<span class="condition"><b>${esc(labels[k]||k)}</b> ${esc(fmt(v))}${k==="executionOdds"?"%":""}</span>`).join(""):'<span class="empty">스칼라 조건 없음</span>';
}
function selectionMarkup(s,eventId){
  const rows=[];
  for(const g of s.eventWeights||[])for(const x of g.entries||[])if(x.eventId===eventId)rows.push(`eventWeights[${esc(g.bucket)}] · weight ${fmt(x.weight)}/${fmt(g.totalWeight)} · 상대 ${pct(x.relativeShare)}`);
  for(const x of s.oneTimeRandomEvents?.entries||[])if(x.eventId===eventId)rows.push(`oneTimeRandomEvents · weight ${fmt(x.weight)}/${fmt(s.oneTimeRandomEvents.totalWeight)} · 상대 ${pct(x.relativeShare)}`);
  (s.oneTimeSequentialEvents||[]).forEach((id,i)=>{if(id===eventId)rows.push(`oneTimeSequentialEvents · 순번 ${i+1}`)});
  return rows.length?`<div class="selection"><b>이 이벤트의 선택/순차 정보</b>${rows.map(x=>`<span>${x}</span>`).join("")}<small>가중치 비율은 상대값이며 최종 발생확률로 단정하지 않습니다. 순차 이벤트는 원본 배열 순서를 표시합니다.</small></div>`:"";
}
function scriptMarkup(s,eventId){
  return`<article class="script-card"><div class="script-head"><div><b>${esc(s.id)}</b><span class="sub">원본 eventScript</span></div><span class="evidence direct">규칙 직접값</span></div>
    <div class="condition-cloud">${conditionsMarkup(s.conditions)}</div>
    ${triggerMapMarkup(s.triggerMaps)}
    ${selectionMarkup(s,eventId)}
    <div class="paths">${(s.paths||[]).map(esc).join(" · ")}</div>
    ${s.sourceFiles?.length?`<div class="sub">출처: ${s.sourceFiles.map(esc).join(" → ")}</div>`:""}
  </article>`;
}
function effectsMarkup(d){
  const e=d.effects||{},parts=[];
  if(e.researchRewards?.length)parts.push(`<section class="section"><h3>지급 연구 / 진행 플래그 ${fmt(e.researchRewards.length)}개</h3><div>${e.researchRewards.map(researchLink).join("")}</div><p class="muted">이 목록은 이벤트가 완료될 때 <code>researchList</code>로 직접 지급하는 값입니다. 일반 연구실 연구와 구분합니다.</p></section>`);
  if(e.guaranteedItems?.length)parts.push(`<section class="section"><h3>확정 아이템 지급</h3><table class="mini-table"><thead><tr><th>아이템</th><th>수량</th><th>판매가</th></tr></thead><tbody>${e.guaranteedItems.map(x=>`<tr><td>${itemLink(x)}</td><td>${fmt(x.qty)}</td><td>${x.costSell==null?"—":fmt(x.costSell*x.qty)}</td></tr>`).join("")}</tbody></table>${e.guaranteedItemSellCoverage?`<p class="muted">확정 지급 아이템 판매가 합계 ${fmt(e.guaranteedItemSellValue)}. 전략 가치는 별도입니다.</p>`:""}</section>`);
  const r=e.randomItems||{};
  if(r.list?.length||r.multi?.length||r.weightedRaw){
    parts.push(`<section class="section"><h3>랜덤 보상</h3>
      ${r.list?.length?`<h4>randomItemList</h4><div>${r.list.map(x=>`<span class="chip"><b>${esc(x.koName)}</b><span class="sub">weight ${fmt(x.weight)} · 상대 ${pct(x.relativeShare)} · ${esc(x.id)}</span></span>`).join("")}</div>`:""}
      ${r.multi?.length?`<details><summary>randomMultiItemList ${fmt(r.multi.length)}개 묶음</summary>${r.multi.map(o=>`<div class="random-option"><b>후보 ${o.index}</b><div>${o.items.map(x=>`<span class="chip"><b>${esc(x.koName)}</b><span class="sub">×${fmt(x.qty)} · ${esc(x.id)}</span></span>`).join("")}</div></div>`).join("")}</details>`:""}
      ${r.weightedRaw?`<details><summary>weightedItemList 원본</summary><pre>${esc(JSON.stringify(r.weightedRaw,null,2))}</pre></details>`:""}
      <p class="muted">중복 항목은 상대 가중치로 해석한 파생값이며 단발 결과를 보장하지 않습니다.</p>
    </section>`);
  }
  if(e.spawnedPersonType||e.spawnedPersons)parts.push(`<section class="section"><h3>병사 / 인원 지급</h3><p><b>${esc(e.spawnedPersonTypeName||e.spawnedPersonType||"병사")}</b> ×${fmt(e.spawnedPersons||1)} <span class="sub">${esc(e.spawnedPersonType||"")}</span></p>${e.spawnedSoldier?`<details><summary>spawnedSoldier 직접값</summary><pre>${esc(JSON.stringify(e.spawnedSoldier,null,2))}</pre></details>`:""}</section>`);
  if(e.interruptResearch)parts.push(`<section class="section warning-box"><h3>연구 중단</h3><p>${researchLink({id:e.interruptResearch,koName:e.interruptResearch,enName:""})}</p></section>`);
  return parts.join("");
}
function forceLinksMarkup(eventId){
  const links=forceLinks?.[eventId];
  if(!links||(links.enables?.length||0)+(links.blocks?.length||0)===0)return"";
  const group=(title,xs,cls="")=>{
    if(!xs?.length)return"";
    return '<div class="force-chain '+cls+'"><h4>'+esc(title)+'</h4>'+xs.map(x=>'<div class="selection">'+forceLink(x)+'<span>missionScript '+esc(x.scriptId||"—")+' · '+esc(x.triggerKind)+': '+esc(x.triggerKoName||x.triggerId)+'</span><small>missionWeights bucket '+esc(x.bucket)+' · weight '+fmt(x.weight)+'/'+fmt(x.totalWeight)+' · 같은 bucket 상대 '+pct(x.relativeShare)+'</small></div>').join("")+'</div>';
  };
  return '<section class="section"><div class="insight-head"><h3>이 이벤트 이후 연결되는 적부대 / 작전</h3><span class="evidence direct">보상 → missionScript gate 역추적</span></div><p class="muted">이벤트가 직접 지급하는 연구/아이템이 적 missionScript의 true/false gate와 일치하는 경로입니다. 아래 상대 weight는 같은 missionWeights bucket 안 비율이며, 이 이벤트 완료 직후 적부대가 그 확률로 즉시 생성된다는 뜻은 아닙니다.</p>'+group("활성화 가능한 작전",links.enables)+group("차단될 수 있는 작전",links.blocks,"block")+'</section>';
}
function rawMarkup(d){return`<details><summary>원본 event 룰</summary><pre>${esc(JSON.stringify(d.raw,null,2))}</pre></details>`}
async function openDetail(id){
  const row=db.index.find(x=>x.id===id);if(!row)return;
  try{
    if(!detailCache.has(row.bucket))detailCache.set(row.bucket,(await jsonGz(`${dataBase}/event-chunks/${row.bucket}.json.gz`)).details);
    if(!editorialCache.has(row.bucket))editorialCache.set(row.bucket,(await jsonGz(`${dataBase}/event-editorial-chunks/${row.bucket}.json.gz`)).details);
    if(!forceLinks)forceLinks=await jsonGz(`${dataBase}/event-force-links.json.gz`);
    const d=detailCache.get(row.bucket)[id],e=editorialCache.get(row.bucket)[id],ef=d.effects||{},ts=d.triggerSummary||{};
    $("#detail").innerHTML=`<h2>${esc(d.koName)}</h2><div class="id">${esc(d.enName)} · ${esc(d.id)}</div>
      <p><span class="role">${esc(d.primaryRoleKo)}</span> ${(d.roles||[]).filter(x=>x!==d.primaryRole).map(x=>`<span class="role secondary">${esc(roleLabel(x))}</span>`).join(" ")}</p>
      ${kpis([["연결 스크립트",fmt(d.scripts.length)],["첫 월",fmt(ts.months?.earliest)],["마지막 월",fmt(ts.months?.latest)],["실행 Odds",ts.odds?.min==null?"—":(ts.odds.min===ts.odds.max?fmt(ts.odds.min)+"%":fmt(ts.odds.min)+"~"+fmt(ts.odds.max)+"%")],["필수 조건",fmt(ts.positive?.length||0)],["false 조건",fmt(ts.negative?.length||0)],["자금",(Number(ef.funds)>0?"+":"")+fmt(ef.funds),Number(ef.funds)>0?"positive":Number(ef.funds)<0?"negative":""],["점수",(Number(ef.points)>0?"+":"")+fmt(ef.points),Number(ef.points)>0?"positive":Number(ef.points)<0?"negative":""]])}
      <div class="riskline">파생 놓침 위험 <span class="risk ${riskClass(ts.missRisk)}">${riskLabel(ts.missRisk)}</span></div>
      ${editorialMarkup(e)}
      <section class="section"><div class="insight-head"><h3>발생 조건 / eventScripts</h3><span class="evidence direct">원본 직접값</span></div>${d.scripts?.length?d.scripts.map(s=>scriptMarkup(s,d.id)).join(""):'<div class="empty">연결 스크립트 없음</div>'}</section>
      ${effectsMarkup(d)}
      ${forceLinksMarkup(d.id)}
      <section class="section"><h3>직접 결과 요약</h3>${kpis([["연구/플래그",fmt(ef.researchRewards?.length||0)],["확정 아이템",fmt(ef.guaranteedItems?.length||0)],["랜덤 후보",fmt((ef.randomItems?.list?.length||0)+(ef.randomItems?.multi?.length||0))],["병사/인원",ef.spawnedPersonType?fmt(ef.spawnedPersons||1):"—"],["timer",fmt(d.timer)],["timerRandom",fmt(d.timerRandom)]])}</section>
      <section class="section"><h3>출처</h3><p class="muted">${(d.sourceFiles||[]).map(esc).join(" → ")||"—"}</p></section>
      ${rawMarkup(d)}`;
    $("#drawer").classList.add("open");$("#drawer").setAttribute("aria-hidden","false");$("#backdrop").hidden=false;
  }catch(err){$("#detail").innerHTML=`<p class="negative">${esc(err.message)}</p>`;$("#drawer").classList.add("open");$("#backdrop").hidden=false}
}
function closeDrawer(){history.replaceState(null,"",location.pathname+location.search);$("#drawer").classList.remove("open");$("#drawer").setAttribute("aria-hidden","true");$("#backdrop").hidden=true}
function route(){const m=location.hash.match(/^#event=(.+)$/);if(m)openDetail(decodeURIComponent(m[1]));else closeDrawer()}
async function init(){[db,forceDb]=await Promise.all([jsonGz(dataBase+"/events-index.json.gz"),jsonGz(dataBase+"/enemy-forces-index.json.gz")]);renderSummary();initFilters();render();route()}
init().catch(e=>{document.body.innerHTML=`<main class="wrap"><h1>이벤트 DB 로드 실패</h1><pre>${esc(e.stack||e.message)}</pre></main>`});
