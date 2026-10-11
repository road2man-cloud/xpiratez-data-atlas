import {loadRuntime,debounce} from "../db-runtime.js";
const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const numberFormat=new Intl.NumberFormat("ko-KR",{maximumFractionDigits:2});
const fmt=v=>v==null||Number.isNaN(Number(v))?"—":numberFormat.format(Number(v));
const money=v=>v==null?"—":(Number(v)>0?"+":"")+fmt(Math.round(Number(v)));
const dataBase="../data";
let db={index:[],counts:{},roles:{}},rows=[],detailCache=new Map(),editorialCache=new Map();
const state={q:"",role:"",category:"",economics:"",baseFunc:"",sort:"koName",dir:1,page:1,pageSize:100};

const jsonCache=new Map();
function json(url){
  if(!jsonCache.has(url))jsonCache.set(url,fetch(url).then(r=>{if(!r.ok)throw new Error(url+" "+r.status);return r.json();}).catch(error=>{jsonCache.delete(url);throw error;}));
  return jsonCache.get(url);
}
function stat(label,value,note=""){return`<div class="stat"><span>${esc(label)}</span><b>${esc(fmt(value))}</b>${note?`<span>${esc(note)}</span>`:""}</div>`}
function initFilters(){
  $("#role").insertAdjacentHTML("beforeend",Object.entries(db.roles).map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join(""));
  const cats=[...new Map(db.index.map(x=>[x.category,x.categoryKo||x.category])).entries()].sort((a,b)=>String(a[1]).localeCompare(String(b[1]),"ko"));
  $("#category").insertAdjacentHTML("beforeend",cats.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join(""));
  const funcs=[...new Set(db.index.flatMap(x=>x.baseFuncs||[]))].sort();
  $("#baseFunc").insertAdjacentHTML("beforeend",funcs.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join(""));
  $("#search").addEventListener("input",debounce(e=>{state.q=e.target.value.trim().toLowerCase();state.page=1;render()}));
  for(const id of ["role","category","economics","baseFunc"])$("#"+id).addEventListener("change",e=>{state[id]=e.target.value;state.page=1;render()});
  $("#pageSize").addEventListener("change",e=>{state.pageSize=Number(e.target.value);state.page=1;render()});
  $("#prev").onclick=()=>{if(state.page>1){state.page--;render()}};
  $("#next").onclick=()=>{state.page++;render()};
  $("#closeDrawer").onclick=closeDrawer;$("#backdrop").onclick=closeDrawer;
  addEventListener("hashchange",route);
}
function renderSummary(){
  const c=db.counts||{};
  $("#summary").innerHTML=[
    stat("전체 제조식",c.recipes),
    stat("제조 분류",c.categories),
    stat("랜덤 산출",c.random),
    stat("병사·인원 생성",c.recruitment),
    stat("기체 제작",c.craft),
    stat("금전 비교 가능",c.economicComparable)
  ].join("");
}
function filtered(){
  return db.index.filter(x=>{
    if(state.q&&!x.searchText.includes(state.q))return false;
    if(state.role&&x.role!==state.role)return false;
    if(state.category&&x.category!==state.category)return false;
    if(state.baseFunc&&!(x.baseFuncs||[]).includes(state.baseFunc))return false;
    if(state.economics==="positive"&&!(x.economicComparable&&x.opportunityNet>0))return false;
    if(state.economics==="negative"&&!(x.economicComparable&&x.opportunityNet<0))return false;
    if(state.economics==="na"&&x.economicComparable)return false;
    return true;
  });
}
const nameCollator=new Intl.Collator("ko",{numeric:true});
function cmp(a,b,key){
  const av=a[key],bv=b[key];
  if(av==null&&bv==null)return 0;if(av==null)return 1;if(bv==null)return-1;
  if(typeof av==="number"&&typeof bv==="number")return av-bv;
  return nameCollator.compare(String(av),String(bv));
}
const cols=[
  ["koName","제조식"],["roleKo","역할"],["time","기술자-시간"],["cost","제조비"],["requiredItemCount","재료종"],["outputItemCount","확정산출"],["researchCost","명목 연구량"],["baseFuncCount","baseFunc"],["opportunityNet","순가치"],["opportunityNetPerEngineerHour","순가치/시간"],["randomOptionCount","랜덤"]
];
let searchReady=false,searchPromise=null;
function ensureSearch(){
  if(searchReady)return;
  if(db.index.every(x=>typeof x.searchText==="string")){searchReady=true;render();return;}
  if(!searchPromise)searchPromise=loadRuntime(dataBase+"/manufacture-search.json?v=large-db-perf-20261011")
    .then(body=>{for(const row of db.index)row.searchText=body.search[row.id]||"";searchReady=true;if(state.q)render();})
    .catch(error=>{searchPromise=null;if(state.q)$("#rowCount").textContent="검색 자료 로드 실패 · 입력을 바꾸면 재시도: "+error.message;});
}
function render(){
  if(state.q&&!searchReady){$("#rowCount").textContent="전체 검색 자료를 불러오는 중…";ensureSearch();return;}

  rows=filtered().sort((a,b)=>state.dir*cmp(a,b,state.sort));
  const pages=Math.max(1,Math.ceil(rows.length/state.pageSize));state.page=Math.min(state.page,pages);
  const start=(state.page-1)*state.pageSize,pageRows=rows.slice(start,start+state.pageSize);
  $("#rowCount").textContent=`${rows.length.toLocaleString("ko-KR")}개`;
  $("#pageInfo").textContent=`${state.page} / ${pages}`;
  $("#prev").disabled=state.page<=1;$("#next").disabled=state.page>=pages;
  $("#manufactureTable thead").innerHTML="<tr>"+cols.map(([k,l])=>`<th data-sort="${k}">${esc(l)}${state.sort===k?(state.dir>0?" ▲":" ▼"):""}</th>`).join("")+"</tr>";
  $("#manufactureTable tbody").innerHTML=pageRows.map(x=>{
    const cls=x.opportunityNet>0?"good":x.opportunityNet<0?"bad":"";
    const out=x.outputSummary+(x.randomOptionCount?` · 랜덤 ${x.randomOptionCount}`:"");
    return`<tr data-id="${esc(x.id)}">
      <td><span class="name">${esc(x.koName)}</span><span class="sub">${esc(x.enName)} · ${esc(x.id)}</span></td>
      <td><span class="role">${esc(x.roleKo)}</span><span class="sub">${esc(x.categoryKo)}</span></td>
      <td>${fmt(x.time)}</td><td>${fmt(x.cost)}</td>
      <td title="${esc(x.inputSummary)}">${fmt(x.requiredItemCount)}<span class="sub">${esc(x.inputSummary)}</span></td>
      <td title="${esc(out)}">${fmt(x.outputItemCount)}<span class="sub">${esc(out)}</span></td>
      <td>${fmt(x.researchCost)}<span class="sub">${fmt(x.researchCount)}개</span></td>
      <td>${fmt(x.baseFuncCount)}<span class="sub">${esc((x.baseFuncs||[]).join(" · "))}</span></td>
      <td class="money ${cls}">${x.economicComparable?money(x.opportunityNet):"비교 제외"}</td>
      <td class="money ${cls}">${x.economicComparable?money(x.opportunityNetPerEngineerHour):"—"}</td>
      <td>${fmt(x.randomOptionCount)}</td>
    </tr>`;
  }).join("");
  document.querySelectorAll("th[data-sort]").forEach(th=>th.onclick=()=>{const k=th.dataset.sort;if(state.sort===k)state.dir*=-1;else{state.sort=k;state.dir=1}render()});
  document.querySelectorAll("#manufactureTable tbody tr").forEach(tr=>tr.onclick=()=>{location.hash="recipe="+encodeURIComponent(tr.dataset.id)});
}
function itemLink(x){return`<a class="chip" href="../items/#item=${encodeURIComponent(x.id)}"><b>${esc(x.koName||x.id)}</b><span class="sub">${esc(x.enName||"")} · ${esc(x.id)}</span></a>`}
function researchLink(x){return`<a class="chip" href="../research/#research=${encodeURIComponent(x.id)}"><b>${esc(x.koName||x.id)}</b><span class="sub">${esc(x.enName||"")} · ${esc(x.id)}</span></a>`}
function facilityLink(x){return`<a class="chip" href="../facilities/"><b>${esc(x.koName||x.id)}</b><span class="sub">${esc(x.enName||"")} · ${esc(x.id)}</span></a>`}
function kpis(xs){return`<div class="kpis">${xs.map(([k,v,cls=""])=>`<div class="kpi"><span>${esc(k)}</span><b class="${cls}">${esc(v)}</b></div>`).join("")}</div>`}
function editorialMarkup(e){
  if(!e)return"";
  const row=(l,t)=>`<div class="editorial-row"><span>${esc(l)}</span><p>${esc(t)}</p></div>`;
  return`<section class="section editorial"><div class="insight-head"><h3>GPT 제조 인사이트</h3><span class="evidence">GPT 편집 · 룰셋 기반 자동 합성</span></div>
    ${row("정체",e.overview)}${row("해금·병목",e.unlock)}${row("투입→산출",e.inputsOutputs)}${row("경제성",e.economics)}${row("실행",e.execution)}${row("판단",e.decision)}${row("주의",e.caution)}
  </section>`;
}
function itemTable(xs,title){
  if(!xs?.length)return`<section class="section"><h3>${esc(title)}</h3><div class="empty">없음</div></section>`;
  return`<section class="section"><h3>${esc(title)}</h3><table class="mini-table"><thead><tr><th>항목</th><th class="num">수량</th><th class="num">판매가</th><th class="num">판매가 합계</th></tr></thead><tbody>${xs.map(x=>`<tr><td>${itemLink(x)}</td><td class="num">${fmt(x.qty)}</td><td class="num">${fmt(x.costSell)}</td><td class="num">${x.costSell==null?"—":fmt(x.costSell*x.qty)}</td></tr>`).join("")}</tbody></table></section>`;
}
function randomMarkup(d){
  if(!d.randomOutputs?.length)return"";
  return`<section class="section"><h3>랜덤 산출 ${fmt(d.randomOutputs.length)}개 후보</h3>
  <p class="muted">가중치 총합 ${fmt(d.randomWeightTotal)}. 확률은 가중치/총가중치로 계산한 파생값입니다.</p>
  <details><summary>후보 전체 보기</summary>${d.randomOutputs.map(x=>`<div class="random-option"><span class="prob">${x.probability==null?"—":(x.probability*100).toFixed(2)+"%"} · 가중치 ${fmt(x.weight)}</span><div>${x.outputs.length?x.outputs.map(itemLink).join(""):'<span class="empty">추가 산출 없음</span>'}</div></div>`).join("")}</details>
  ${d.expectedRandomOutputs?.length?`<h4>가중치 기준 평균 추가 산출</h4><div>${d.expectedRandomOutputs.map(x=>`<span class="chip"><b>${esc(x.koName)}</b><span class="sub">평균 ${fmt(x.expectedQty)} · ${esc(x.id)}</span></span>`).join("")}</div>`:""}
  </section>`;
}
function researchMarkup(d){
  const r=d.research||{};
  return`<section class="section"><h3>연구 해금</h3>
    ${kpis([["직접 요구",fmt(d.directResearch.length)+"개"],["재귀 선행",fmt(r.count)+"개"],["명목 연구량",fmt(r.totalCost)],["이벤트/무료형",fmt(r.eventOrFreeCount)],["분기 포함",fmt(r.branchCount)]])}
    <div>${d.directResearch?.length?d.directResearch.map(x=>researchLink(x)).join(""):'<span class="empty">직접 요구 연구 없음</span>'}</div>
    ${r.eventOrFree?.length?`<p class="muted">대표 이벤트/무료 경로: ${r.eventOrFree.map(researchLink).join("")}</p>`:""}
    ${r.branches?.length?`<p class="muted">대표 분기 연구: ${r.branches.map(researchLink).join("")}</p>`:""}
  </section>`;
}
function baseFuncMarkup(d){
  return`<section class="section"><h3>필요 baseFunc / 제공 시설</h3>${d.baseFuncDetails?.length?d.baseFuncDetails.map(x=>`<div class="basefunc"><b>${esc(x.koName)} · ${esc(x.id)}</b><div>${x.providers?.length?x.providers.slice(0,12).map(facilityLink).join(""):'<span class="empty">시설 DB에서 제공자 미확인</span>'}</div>${x.providers?.length>12?`<span class="muted">외 ${x.providers.length-12}개</span>`:""}</div>`).join(""):'<div class="empty">별도 baseFunc 요구 없음</div>'}</section>`;
}
function specialOutputMarkup(d){
  const parts=[];
  if(d.craftOutput)parts.push(`<div class="basefunc"><b>기체 생산</b><p>${esc(d.craftOutput.koName)} <span class="sub">${esc(d.craftOutput.enName)} · ${esc(d.craftOutput.id)}</span></p></div>`);
  if(d.spawnedPersonType)parts.push(`<div class="basefunc"><b>병사/인원 생성</b><p>${esc(d.spawnedPersonTypeName||d.spawnedPersonType)} <span class="sub">${esc(d.spawnedPersonType)}</span></p>${d.spawnedPersonName?`<p>고정 이름: ${esc(d.spawnedPersonName)}</p>`:""}${d.spawnedSoldier?`<details><summary>spawnedSoldier 직접값</summary><pre>${esc(JSON.stringify(d.spawnedSoldier,null,2))}</pre></details>`:""}</div>`);
  return parts.length?`<section class="section"><h3>특수 산출</h3>${parts.join("")}</section>`:"";
}
function rawMarkup(d){return`<details><summary>원본 manufacture 룰</summary><pre>${esc(JSON.stringify(d.raw,null,2))}</pre></details>`}
let detailGeneration=0;
async function openDetail(id){
  const generation=++detailGeneration;
  const row=db.index.find(x=>x.id===id);if(!row)return;
  try{
    const [detail,editorial]=await Promise.all([
      json(`${dataBase}/manufacture-chunks/${row.bucket}.json`),
      json(`${dataBase}/manufacture-editorial-chunks/${row.bucket}.json`)
    ]);
    detailCache.set(row.bucket,detail.details);editorialCache.set(row.bucket,editorial.details);
    if(generation!==detailGeneration)return;
    const d=detailCache.get(row.bucket)[id],e=editorialCache.get(row.bucket)[id],ec=d.economics||{},cls=ec.opportunityNet>0?"positive":ec.opportunityNet<0?"negative":"";
    $("#detail").innerHTML=`<h2>${esc(d.koName)}</h2><div class="id">${esc(d.enName)} · ${esc(d.id)}</div><p><span class="role">${esc(d.roleKo)}</span> <span class="role">${esc(d.categoryKo)}</span></p>
      ${kpis([["기술자-시간",fmt(d.time)],["제조비",fmt(d.cost)],["space",fmt(d.space)],["명목 연구량",fmt(d.research?.totalCost)],["재료 기회비용",fmt(ec.inputSellOpportunityValue)],["기대 산출 판매가",fmt(ec.expectedOutputSellValue)],["순가치",ec.economicComparable?money(ec.opportunityNet):"비교 제외",cls],["순가치/시간",ec.economicComparable?money(ec.opportunityNetPerEngineerHour):"—",cls]])}
      ${editorialMarkup(e)}
      ${itemTable(d.requiredItems,"투입 재료")}
      ${itemTable(d.deterministicOutputs,"확정 아이템 산출")}
      ${randomMarkup(d)}
      ${specialOutputMarkup(d)}
      ${researchMarkup(d)}
      ${baseFuncMarkup(d)}
      <section class="section"><h3>경제성 계산</h3><table class="mini-table"><tbody>
        <tr><td>투입 재료 판매 기회비용</td><td class="num">${fmt(ec.inputSellOpportunityValue)}</td></tr>
        <tr><td>확정 산출 판매가</td><td class="num">${fmt(ec.deterministicOutputSellValue)}</td></tr>
        <tr><td>랜덤 산출 기대 판매가</td><td class="num">${fmt(ec.randomExpectedSellValue)}</td></tr>
        <tr><td>제조 현금비</td><td class="num">${fmt(ec.manufactureCashCost)}</td></tr>
        <tr><td><b>판매가 기준 순가치</b></td><td class="num ${cls}"><b>${ec.economicComparable?money(ec.opportunityNet):"비교 제외"}</b></td></tr>
      </tbody></table><p class="muted">병사·기체 가치와 전투 성능은 금액으로 환산하지 않습니다. refund 플래그도 추가 현금으로 임의 합산하지 않습니다.</p></section>
      <section class="section"><h3>출처</h3><p class="muted">${(d.sourceFiles||[]).map(esc).join(" → ")||"—"}</p></section>
      ${rawMarkup(d)}`;
    $("#drawer").classList.add("open");$("#drawer").setAttribute("aria-hidden","false");$("#backdrop").hidden=false;
  }catch(err){if(generation!==detailGeneration)return;$("#detail").innerHTML=`<p class="negative">${esc(err.message)}</p>`;$("#drawer").classList.add("open");$("#backdrop").hidden=false}
}
function closeDrawer(){detailGeneration++;history.replaceState(null,"",location.pathname+location.search);$("#drawer").classList.remove("open");$("#drawer").setAttribute("aria-hidden","true");$("#backdrop").hidden=true}
function route(){const m=location.hash.match(/^#recipe=(.+)$/);if(m)openDetail(decodeURIComponent(m[1]));else closeDrawer()}
async function init(){
  performance.mark("manufacture:load-start");
  db=await loadRuntime(dataBase+"/manufacture-runtime.json?v=large-db-perf-20261011");renderSummary();initFilters();render();
  performance.mark("manufacture:ready");performance.measure("manufacture:initial","manufacture:load-start","manufacture:ready");route();
}
init().catch(e=>{document.body.innerHTML=`<main class="wrap"><h1>제조 DB 로드 실패</h1><pre>${esc(e.stack||e.message)}</pre></main>`});
