let DATA=null,SUPPORT=null,SUPPORT_PROMISE=null;
let sort={key:"buildCost",dir:1};
const EFFICIENCY_KEYS={storage:"storagePerTile",labs:"labsPerTile",workshops:"workshopsPerTile",trainingRooms:"trainingPerTile"};
const capacityKey=key=>$("#efficiencyView").checked?EFFICIENCY_KEYS[key]:key;
const DETAIL_BUCKETS=new Map();
const $=q=>document.querySelector(q);
const esc=s=>String(s??"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m]));
const fmt=n=>n==null||!Number.isFinite(Number(n))?"—":Number(n).toLocaleString("ko-KR",{maximumFractionDigits:1});
const ROLE_LABELS={income:"월수익",housing:"숙소",storage:"저장",research:"연구",workshop:"작업장",training:"훈련",hangar:"격납",containment:"포로/생물",detection:"탐지",defense:"방어",medical:"의료",psi:"Psi",special:"특수"};
const FUNC_LABELS={LAB:"연구실",CPU:"컴퓨터",CPU2:"고급 컴퓨터",LIB:"도서관",STUDY:"개인 연구",ANAL:"분석",MED:"의료",BIO:"생물",SUR:"수술",PSION:"사이오닉",SUMM:"소환",WORKS:"작업장",SHOP:"공방/상점",PRINT:"산업 인쇄",DOJO:"훈련",CULT:"문화/사교",GAMB:"도박",CAS:"카지노",ALKO:"주류/연금",MINT:"주조",REFI:"정제",WELL:"우물/자원",PWR:"전력",FUS:"융합",FARM:"농장",CLON:"복제",BDSWAP:"신체교환",BEES:"양봉",DUNG:"던전",DEN:"비스트",REDM:"적마법",ARMS:"병기",SPA:"스파"};
const SECTION_LABELS={research:"연구",manufacture:"제조",facilities:"시설",items:"아이템",crafts:"기체",soldiers:"병종",soldierTransformation:"병종 변환",events:"이벤트",startingBase:"시작기지"};

function moneyText(v){
  if(v==null||!Number.isFinite(Number(v)))return"—";
  const n=Number(v);
  if(n<0)return '<span class="money-in">수입 +'+fmt(-n)+'</span>';
  if(n>0)return '<span class="money-out">비용 '+fmt(n)+'</span>';
  return "0";
}
function rolesHtml(xs){return (xs||[]).map(x=>'<span class="role role-'+esc(x)+'">'+esc(ROLE_LABELS[x]||x)+'</span>').join(" ")||"—"}
function funcHtml(xs){return (xs||[]).map(x=>'<span class="func" title="'+esc(FUNC_LABELS[x]||"")+'">'+esc(x)+(FUNC_LABELS[x]?" · "+esc(FUNC_LABELS[x]):"")+'</span>').join(" ")||"—"}
function entityName(x){return esc(x?.koName||x?.enName||x?.id||x||"—")}
async function loadSupport(){
  if(SUPPORT)return SUPPORT;
  if(!SUPPORT_PROMISE)SUPPORT_PROMISE=Promise.all([
    fetch("../data/facility-base-functions.json?v=facility-db-20261007"),
    fetch("../data/facility-research.json?v=facility-db-20261007")
  ]).then(async ([a,b])=>{
    if(!a.ok)throw new Error("기지 기능 역참조 HTTP "+a.status);
    if(!b.ok)throw new Error("시설 연구 카탈로그 HTTP "+b.status);
    const [fa,fr]=await Promise.all([a.json(),b.json()]);
    SUPPORT={baseFunctionMeta:fa.baseFunctionMeta||{},researchCatalog:fr.researchCatalog||{}};
    return SUPPORT;
  });
  return SUPPORT_PROMISE;
}

async function load(){
  const r=await fetch("../data/facilities-index.json?v=facility-db-20261007");
  if(!r.ok)throw new Error("시설 데이터 HTTP "+r.status);
  DATA=await r.json();
  const sel=$("#func");
  for(const id of DATA.baseFunctions||[]){
    const o=document.createElement("option");o.value=id;o.textContent=id+(FUNC_LABELS[id]?" · "+FUNC_LABELS[id]:"");sel.appendChild(o);
  }
  renderSummary();render();
}
function renderSummary(){
  const c=DATA.counts||{};
  $("#summary").innerHTML=[
    ["전체",fmt(c.facilities)+"종","effective facilities 룰"],
    ["룰상 가용",fmt(c.available)+"종","STR_UNAVAILABLE 제외"],
    ["월수익 시설",fmt(c.income)+"종","monthlyCost < 0"],
    ["시작기지",fmt(c.startingTypes)+"종","기본 startingBase 배치"],
    ["기지 기능",fmt(c.baseFunctions)+"개","provide/require baseFunc"]
  ].map(x=>'<article class="metric card"><strong>'+x[0]+' '+x[1]+'</strong><span>'+x[2]+'</span></article>').join("");
}
function searchBlob(x){
  return x.searchText||[x.id,x.koName,x.enName,...(x.roles||[]),...(x.provideBaseFunc||[]),...(x.requiresBaseFunc||[])].filter(Boolean).join(" ").toLowerCase();
}
function filtered(){
  const q=$("#search").value.trim().toLowerCase(),role=$("#role").value,status=$("#status").value,func=$("#func").value;
  const out=(DATA.index||[]).filter(x=>{
    if(q&&!searchBlob(x).includes(q))return false;
    if(role&&!(x.roles||[]).includes(role))return false;
    if(status==="available"&&!x.available)return false;
    if(status==="state"&&!x.stateOnly)return false;
    if(status==="starting"&&!(x.startingCount>0))return false;
    if(func&&!(x.provideBaseFunc||[]).includes(func)&&!(x.requiresBaseFunc||[]).includes(func))return false;
    return true;
  });
  out.sort((a,b)=>{
    let av=a[sort.key],bv=b[sort.key];
    if(sort.key==="name")return a.koName.localeCompare(b.koName,"ko")*sort.dir;
    if(av==null&&bv==null)return a.koName.localeCompare(b.koName,"ko");
    if(av==null)return 1;if(bv==null)return-1;
    if(typeof av==="string")return av.localeCompare(bv,"ko")*sort.dir;
    return (Number(av)-Number(bv))*sort.dir;
  });
  return out;
}
function th(label,key){const on=sort.key===key?" sort-on":"";const arrow=sort.key===key?(sort.dir>0?" ▲":" ▼"):"";return '<th data-sort="'+key+'" class="'+on+'">'+label+arrow+'</th>'}
function render(){
  const perTile=$("#efficiencyView").checked;
  const rows=filtered();$("#rowCount").textContent=rows.length+"개";
  $("#facilityTable thead").innerHTML="<tr>"+[
    th("시설","name"),"<th>역할</th>",th("면적","area"),th("건설비","buildCost"),th("건설일","buildTime"),th("월비용/수익","monthlyCost"),
    th("숙소","personnel"),...[ ["저장","storage"],["연구","labs"],["작업장","workshops"],["훈련","trainingRooms"] ].map(([label,key])=>th(label+(perTile?"/칸":""),capacityKey(key))),th("포로","aliens"),th("기체","crafts"),
    th("레이더","radarRange"),th("방어","defense"),th("명목 연구량","researchCost"),"<th>제공 baseFunc</th>"
  ].join("")+"</tr>";
  $("#facilityTable tbody").innerHTML=rows.map(x=>{
    const state=x.stateOnly?'<span class="warn-tag">상태 전용</span>':x.startingCount?'<span class="ok-tag">시작 ×'+fmt(x.startingCount)+'</span>':"";
    return '<tr data-id="'+esc(x.id)+'"><td><span class="name">'+esc(x.koName)+'</span><span class="id">'+esc(x.enName)+' · '+esc(x.id)+'</span>'+state+'</td><td class="roles-cell">'+rolesHtml(x.roles)+'</td><td>'+fmt(x.area)+'</td><td>'+fmt(x.buildCost)+'</td><td>'+fmt(x.buildTime)+'</td><td>'+moneyText(x.monthlyCost)+'</td><td>'+fmt(x.personnel)+'</td><td>'+fmt(x[capacityKey("storage")])+'</td><td>'+fmt(x[capacityKey("labs")])+'</td><td>'+fmt(x[capacityKey("workshops")])+'</td><td>'+fmt(x[capacityKey("trainingRooms")])+'</td><td>'+fmt(x.aliens)+'</td><td>'+fmt(x.crafts)+'</td><td>'+fmt(x.radarRange)+'</td><td>'+fmt(x.defense)+'</td><td>'+fmt(x.researchCost)+'</td><td class="func-cell">'+funcHtml(x.provideBaseFunc)+'</td></tr>';
  }).join("");
  document.querySelectorAll("th[data-sort]").forEach(el=>el.addEventListener("click",()=>{const k=el.dataset.sort;if(sort.key===k)sort.dir*=-1;else sort={key:k,dir:k==="name"?1:-1};render()}));
  document.querySelectorAll("#facilityTable tbody tr").forEach(el=>el.addEventListener("click",()=>openDetail(el.dataset.id)));
}
function researchHtml(d){
  const p=d.researchPlan||{},nodes=(p.nodeIds||[]).map(id=>SUPPORT?.researchCatalog?.[id]).filter(Boolean);
  const roots=(p.roots||[]).map(id=>SUPPORT?.researchCatalog?.[id]||{id,koName:id});
  if(!nodes.length)return '<div class="section-card"><strong>연구 선행</strong><span class="muted">추적 가능한 research 선행 없음</span></div>';
  const rows=nodes.map(n=>'<tr><td><b>'+esc(n.koName)+'</b><span class="id">'+esc(n.id)+'</span></td><td>'+fmt(n.cost)+'</td><td>'+((n.dependencies||[]).map(esc).join("<br>")||"—")+'</td><td>'+((n.requires||[]).map(esc).join("<br>")||"—")+'</td><td>'+funcHtml(n.requiresBaseFunc)+'</td><td>'+(n.needItem?(n.destroyItem?"필요·소모":"필요"):"—")+'</td><td>'+((n.disables||[]).map(entityName).join("<br>")||"—")+'</td></tr>').join("");
  return '<div class="section-card"><strong>전체 선행 연구망 · 명목 '+fmt(p.totalCost)+'</strong><div class="flow"><span class="muted">시설 requires</span>'+roots.map(x=>'<span class="badge">'+entityName(x)+'</span>').join("")+'</div><div class="mini-grid"><div class="mini"><b>연구 노드</b>'+fmt(nodes.length)+'</div><div class="mini"><b>표본 연구</b>'+fmt((p.sampleGates||[]).length)+'</div><div class="mini"><b>분기 효과 연구</b>'+fmt((p.branchGates||[]).length)+'</div><div class="mini"><b>연구 중 요구 baseFunc</b>'+fmt((p.baseFuncs||[]).length)+'</div></div><div class="research-table"><table><thead><tr><th>연구</th><th>량</th><th>dependencies</th><th>requires</th><th>기지 기능</th><th>표본</th><th>닫히는 분기</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
}
function requiredFuncHtml(d){
  if(!(d.requiresBaseFunc||[]).length)return '<div class="section-card"><strong>건설 전 요구 기지 기능</strong><span class="muted">없음</span></div>';
  return '<div class="section-card"><strong>건설 전 요구 기지 기능</strong>'+d.requiresBaseFunc.map(id=>{
    const meta=SUPPORT?.baseFunctionMeta?.[id]||{};
    return '<div class="flow"><span class="func">'+esc(id)+(FUNC_LABELS[id]?" · "+esc(FUNC_LABELS[id]):"")+'</span><span class="arrow">← 제공 시설</span>'+((meta.providers||[]).map(p=>'<span class="badge">'+entityName(p)+'</span>').join("")||'<span class="warn-tag">현재 시설 룰에서 제공자 미확인</span>')+'</div>';
  }).join("")+'</div>';
}
function consumerTarget(c){const body='<b>'+esc(c.koName||c.owner)+'</b><span class="id">'+esc(c.owner)+'</span>';return c.section==="manufacture"?'<a class="consumer-link" href="../manufacture/#recipe='+encodeURIComponent(c.owner)+'">'+body+'</a>':body}
function consumersHtml(d){
  if(!(d.provideBaseFunc||[]).length)return '<div class="section-card"><strong>이 시설이 여는 기능</strong><span class="muted">provideBaseFunc 없음</span></div>';
  return d.provideBaseFunc.map(id=>{
    const group=SUPPORT?.baseFunctionMeta?.[id]||{id,consumers:[]};
    const rows=(group.consumers||[]).map(c=>'<tr><td>'+esc(SECTION_LABELS[c.section]||c.section)+'</td><td>'+consumerTarget(c)+'</td><td class="path">'+esc(c.path)+'</td></tr>').join("");
    return '<div class="consumer-card"><strong>'+funcHtml([id])+'을 요구하는 룰 '+fmt((group.consumers||[]).length)+'개</strong>'+(rows?'<div class="consumer-table"><table><thead><tr><th>종류</th><th>대상</th><th>조건 필드</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<span class="muted">현재 룰셋에서 직접 소비자 없음</span>')+'</div>';
  }).join("");
}
function materialHtml(d){
  if(!(d.buildItems||[]).length)return '<span class="muted">추가 아이템 재료 없음</span>';
  return d.buildItems.map(x=>'<div class="material-card"><b>'+entityName(x)+'</b><span class="id">'+esc(x.id)+'</span><div>건설 '+fmt(x.build)+' · 매각/환급 '+fmt(x.refund)+'</div></div>').join("");
}
function refsHtml(d){
  const xs=d.references||[];if(!xs.length)return'<span class="muted">추가 역참조 없음</span>';
  const rows=xs.map(r=>'<tr><td>'+esc(SECTION_LABELS[r.section]||r.section)+'</td><td><b>'+esc(r.koName||r.owner)+'</b><span class="id">'+esc(r.owner)+'</span></td><td class="path">'+(r.paths||[]).map(esc).join("<br>")+'</td></tr>').join("");
  return '<div class="refs-table"><table><thead><tr><th>섹션</th><th>참조 주체</th><th>경로</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function transitionHtml(d){
  const bits=[];
  if(d.destroyedFacility)bits.push('<span class="badge">'+entityName({koName:d.koName})+'</span><span class="arrow">파괴 →</span><span class="badge">'+entityName(d.destroyedFacility)+'</span>');
  if((d.buildOverFacilities||[]).length)bits.push('<span class="muted">덮어짓기 대상</span> '+d.buildOverFacilities.map(x=>'<span class="badge">'+entityName(x)+'</span>').join(""));
  if((d.leavesBehindOnSell||[]).length)bits.push('<span class="muted">매각/제거 후 남음</span> '+d.leavesBehindOnSell.map(x=>'<span class="badge">'+entityName(x)+'</span>').join(""));
  return bits.length?bits.map(x=>'<div class="flow">'+x+'</div>').join(""):'<span class="muted">특수 상태 전이 없음</span>';
}
async function detailFor(row){
  if(!row?.bucket)return null;
  if(!DETAIL_BUCKETS.has(row.bucket)){
    const r=await fetch("../data/facility-chunks/"+row.bucket+".json?v=facility-db-20261007");
    if(!r.ok)throw new Error("시설 상세 데이터 HTTP "+r.status);
    DETAIL_BUCKETS.set(row.bucket,(await r.json()).details||{});
  }
  return DETAIL_BUCKETS.get(row.bucket)[row.id]||null;
}
async function openDetail(id){
  const row=(DATA.index||[]).find(x=>x.id===id);if(!row)return;
  const [d]=await Promise.all([detailFor(row),loadSupport()]);if(!d)return;
  const c=d.capacities||{},e=d.efficiency||{};
  const status=d.stateOnly?'<span class="warn-tag">손상/잔해/상태 전용 가능성</span>':d.startingCount?'<span class="ok-tag">시작기지 ×'+fmt(d.startingCount)+'</span>':'<span class="ok-tag">룰상 가용</span>';
  $("#detailBody").innerHTML='<p class="eyebrow">Base Facility</p><h2>'+esc(d.koName)+'</h2><p class="muted">'+esc(d.enName)+' · '+esc(d.id)+' '+status+'</p>'+
  '<div class="detail-grid"><div class="box"><strong>크기 / 면적</strong>'+fmt(d.size)+'×'+fmt(d.size)+' / '+fmt(d.area)+'칸</div><div class="box"><strong>건설비 / 기간</strong>'+fmt(d.buildCost)+' / '+fmt(d.buildTime)+'일</div><div class="box"><strong>월 비용·수익</strong>'+moneyText(d.monthlyCost)+'</div><div class="box"><strong>단순 회수기간</strong>'+(d.paybackMonths==null?"—":fmt(d.paybackMonths)+"개월")+'</div><div class="box"><strong>명목 선행 연구량</strong>'+fmt(d.researchPlan?.totalCost)+'</div></div>'+
  '<h3 class="section-title">시설 효과 <span>원본 수치 + 면적 효율</span></h3><div class="metrics"><div class="box"><strong>숙소</strong>'+fmt(c.personnel)+' <span class="muted">('+fmt(e.personnelPerTile)+'/칸)</span></div><div class="box"><strong>저장</strong>'+fmt(c.storage)+' <span class="muted">('+fmt(e.storagePerTile)+'/칸)</span></div><div class="box"><strong>연구 좌석</strong>'+fmt(c.labs)+' <span class="muted">('+fmt(e.labsPerTile)+'/칸)</span></div><div class="box"><strong>작업장</strong>'+fmt(c.workshops)+' <span class="muted">('+fmt(e.workshopsPerTile)+'/칸)</span></div><div class="box"><strong>훈련</strong>'+fmt(c.trainingRooms)+' <span class="muted">('+fmt(e.trainingPerTile)+'/칸)</span></div><div class="box"><strong>Psi / 포로 / 기체</strong>'+fmt(c.psiLabs)+' / '+fmt(c.aliens)+' / '+fmt(c.crafts)+'</div><div class="box"><strong>레이더</strong>'+fmt(d.radarRange)+' @ '+fmt(d.radarChance)+'%</div><div class="box"><strong>방어</strong>'+fmt(d.defense)+' · 명중 '+fmt(d.hitRatio)+'%</div><div class="box"><strong>Mana 회복/일</strong>'+fmt(d.manaRecoveryPerDay)+'</div><div class="box"><strong>Sickbay 보정</strong>절대 '+fmt(d.sickBayAbsoluteBonus)+' · 상대 '+fmt(d.sickBayRelativeBonus)+'</div></div>'+
  '<div class="two-col"><div><h3 class="section-title">건설 조건</h3>'+researchHtml(d)+requiredFuncHtml(d)+'</div><div><h3 class="section-title">건설 재료·제약</h3><div class="section-card"><strong>아이템 재료</strong>'+materialHtml(d)+'</div><div class="section-card"><strong>기타</strong><div>최대/기지 '+fmt(d.maxAllowedPerBase)+' · 제거 '+fmt(d.removalTime)+'일 · 환급 '+fmt(d.refundValue)+'</div><div>피격 유인 '+fmt(d.missileAttraction)+' · prisonType '+fmt(d.prisonType)+'</div></div></div></div>'+
  '<h3 class="section-title">이 시설이 실제로 여는 것 <span>provideBaseFunc → requiresBaseFunc 역참조</span></h3><div class="note">제공 기능 '+funcHtml(d.provideBaseFunc)+' · 시설명 설명이 아니라 룰셋의 실제 요구 필드를 따라 연결합니다.</div>'+consumersHtml(d)+
  '<h3 class="section-title">파괴·개조·상태 전이</h3><div class="section-card">'+transitionHtml(d)+'</div>'+
  '<h3 class="section-title">시설 ID 역참조</h3><div class="section-card">'+refsHtml(d)+'</div>'+
  '<details><summary>원본 effective facility 룰 보기</summary><p class="muted">맵 배치 전용 필드 '+esc((d.omittedLayoutFields||[]).join(", ")||"없음")+' 및 스프라이트/사운드 리소스는 공개 데이터에서 분리했습니다.</p><pre class="raw">'+esc(JSON.stringify(d.raw,null,2))+'</pre></details>';
  $("#detailDialog").showModal();
}
$("#efficiencyView").addEventListener("change",()=>{
  const perTile=$("#efficiencyView").checked;
  const pair=Object.entries(EFFICIENCY_KEYS).find(([raw,efficiency])=>sort.key===(perTile?raw:efficiency));
  if(pair)sort.key=pair[perTile?1:0];
  render();
});
["search"].forEach(id=>$("#"+id).addEventListener("input",render));
["role","status","func"].forEach(id=>$("#"+id).addEventListener("change",render));
$("#closeDialog").addEventListener("click",()=>$("#detailDialog").close());
$("#detailDialog").addEventListener("click",e=>{if(e.target.id==="detailDialog")e.currentTarget.close()});
load().catch(err=>{$("#summary").innerHTML='<article class="metric card"><strong>데이터 로드 실패</strong><span>'+esc(err.message)+'</span></article>';console.error(err)});
