const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=v=>v==null?"—":typeof v==="number"?v.toLocaleString("ko-KR"):String(v);
const arr=v=>Array.isArray(v)?v:[];
const kinds={weapon:"총기",ammo:"탄약",melee:"근접",grenade:"투척/폭발",medical:"의료",scanner:"스캐너",psi:"사이오닉",flare:"조명탄",corpse:"시체/잔해","damage-item":"공격 아이템",item:"기타"};
const sections={research:"연구",manufacture:"제조",items:"아이템",events:"이벤트",eventScripts:"이벤트 스크립트",units:"유닛",soldiers:"병종",crafts:"기체",facilities:"시설",armors:"방어구",factions:"세력",missionScripts:"미션 스크립트",alienMissions:"미션",alienDeployments:"전투 배치",terrains:"지형",ufopaedia:"UFOPEDIA"};
const pathNames={dependencies:"선행 연구",requires:"필요 조건",unlocks:"해금",requiresBuy:"구매 해금",requiredItems:"제조 재료",producedItems:"제조 결과",getOneFree:"무료 획득",compatibleAmmo:"호환 탄약",spawnUnit:"생성 유닛"};
const sourceLabel=v=>v==="engineDefault"?"OXCE 기본값":v==="modGlobal"?"XPZ 전역값":v==="ruleset"?"아이템 룰":"";
const pageMode=document.body.dataset.mode||"items";
const dataBase=document.body.dataset.dataBase||"./data";
const state={mode:pageMode,query:"",page:1,pageSize:100,dir:1,sort:{items:"koName",research:"koName"},filter:{items:{kind:"",research:"",manufacture:""},research:{sample:"",items:""}},selected:{items:[],research:[]},cache:{items:new Map(),research:new Map()},detail:null};
let itemIndex=[],researchIndex=[],schema={},manifest={},entityNames={},itemMap=new Map(),researchMap=new Map();

async function json(url){const r=await fetch(url);if(!r.ok)throw new Error(url+" · HTTP "+r.status);return r.json()}
async function init(){
  try{
    const [ii,ri,s,m,e]=await Promise.all([json(`${dataBase}/items-index.json`),json(`${dataBase}/research-index.json`),json(`${dataBase}/schema.json`),json(`${dataBase}/manifest.json`),json(`${dataBase}/entities.json`)]);
    itemIndex=ii.index;researchIndex=ri.index;schema=s;manifest=m;entityNames=e.names||{};
    itemMap=new Map(itemIndex.map(x=>[x.id,x]));researchMap=new Map(researchIndex.map(x=>[x.id,x]));
    if($("#itemCount"))$("#itemCount").textContent="("+fmt(itemIndex.length)+")";if($("#researchCount"))$("#researchCount").textContent="("+fmt(researchIndex.length)+")";
    $("#metaLine").textContent=pageMode==="items"?`${m.mod?.name||"X-Piratez"} ${m.mod?.version||""} · 아이템 ${fmt(itemIndex.length)} · OXCE ${m.mod?.requiredExtendedVersion||"?"}`:`${m.mod?.name||"X-Piratez"} ${m.mod?.version||""} · 연구 ${fmt(researchIndex.length)} · OXCE ${m.mod?.requiredExtendedVersion||"?"}`;
    bind();renderControls();render();route();
  }catch(e){
    $("#statusText").innerHTML=`<span class="error">데이터가 아직 배포되지 않았습니다: ${esc(e.message)}</span>`;
  }
}
function bind(){
  $$(".tab").forEach(b=>b.onclick=()=>{state.mode=b.dataset.mode;state.page=1;$$(".tab").forEach(x=>x.classList.toggle("active",x===b));renderControls();render()});
  $("#search").oninput=e=>{state.query=e.target.value;state.page=1;render()};
  $("#sort").onchange=e=>{state.sort[state.mode]=e.target.value;state.page=1;render()};
  $("#direction").onclick=()=>{state.dir*=-1;$("#direction").textContent=state.dir===1?"↑":"↓";render()};
  $("#filters").onchange=e=>{const k=e.target.dataset.filter;if(k){state.filter[state.mode][k]=e.target.value;state.page=1;render()}};
  $("#tbody").onclick=e=>{
    const check=e.target.closest("input[data-select]");if(check){e.stopPropagation();toggleSelect(state.mode,check.dataset.select);return}
    const tr=e.target.closest("tr[data-id]");if(tr)openDetail(state.mode,tr.dataset.id);
  };
  $("#pager").onclick=e=>{const b=e.target.closest("button[data-page]");if(b){state.page=Number(b.dataset.page);render()}};
  $("#closeDrawer").onclick=closeDrawer;$("#backdrop").onclick=closeDrawer;$("#compare").onclick=openCompare;$("#closeCompare").onclick=()=>$("#compareDialog").close();
  document.onclick=e=>{const b=e.target.closest("[data-open]");if(b){e.preventDefault();openDetail(b.dataset.kind,b.dataset.open)}};
  addEventListener("hashchange",route);
}
const sortOptions={
  items:[["koName","이름"],["kind","종류"],["weight","무게"],["size","창고 점유"],["power","위력"],["costBuy","구매가"],["costSell","판매가"],["monthlySalary","월 급여/수익"],["accuracyAimed","조준 명중"],["researchCount","연구 연결"],["manufactureCount","제조 연결"],["referenceCount","전체 역참조"]],
  research:[["koName","이름"],["cost","연구량"],["points","완료 점수"],["dependencyCount","직접 선행"],["requiredByCount","후속 연구"],["itemReferenceCount","아이템 연결"],["manufactureReferenceCount","제조 연결"],["otherReferenceCount","기타 연결"]]
};
function renderControls(){
  const mode=state.mode;
  const base=sortOptions[mode].map(([v,l])=>`<option value="${v}">${l}</option>`).join("");
  const extra=mode==="items"?(schema.sortableItemFields||[]).filter(x=>!sortOptions.items.some(([v])=>v===x.key)).map(x=>`<option value="raw:${esc(x.key)}">원본 · ${esc(x.label)} [${esc(x.key)}]</option>`).join(""):"";
  $("#sort").innerHTML=base+extra;$("#sort").value=state.sort[mode];
  $("#filters").innerHTML=mode==="items"
    ?`<label><span>종류</span><select data-filter="kind"><option value="">전체</option>${Object.entries(kinds).map(([v,l])=>`<option value="${v}">${l}</option>`).join("")}</select></label><label><span>연구</span><select data-filter="research"><option value="">전체</option><option value="yes">연결 있음</option><option value="no">없음</option></select></label><label><span>제조</span><select data-filter="manufacture"><option value="">전체</option><option value="yes">연결 있음</option><option value="no">없음</option></select></label>`
    :`<label><span>실물 표본</span><select data-filter="sample"><option value="">전체</option><option value="yes">필요</option><option value="destroy">소모</option><option value="no">불필요</option></select></label><label><span>아이템 연결</span><select data-filter="items"><option value="">전체</option><option value="yes">있음</option><option value="no">없음</option></select></label>`;
  for(const [k,v] of Object.entries(state.filter[mode])){const e=$(`[data-filter="${k}"]`);if(e)e.value=v}
}
function filtered(){
  const mode=state.mode,src=mode==="items"?itemIndex:researchIndex,q=state.query.trim().toLocaleLowerCase("ko"),f=state.filter[mode];
  const out=src.filter(x=>{
    const hay=[x.koName,x.enName,x.id,...(x.categories||[]),...(x.categoryIds||[])].filter(Boolean).join(" ").toLocaleLowerCase("ko");
    if(q&&!hay.includes(q))return false;
    if(mode==="items"){
      if(f.kind&&x.kind!==f.kind)return false;
      if(f.research==="yes"&&!x.researchCount)return false;if(f.research==="no"&&x.researchCount)return false;
      if(f.manufacture==="yes"&&!x.manufactureCount)return false;if(f.manufacture==="no"&&x.manufactureCount)return false;
    }else{
      if(f.sample==="yes"&&!x.needItem)return false;if(f.sample==="destroy"&&!x.destroyItem)return false;if(f.sample==="no"&&x.needItem)return false;
      if(f.items==="yes"&&!x.itemReferenceCount)return false;if(f.items==="no"&&x.itemReferenceCount)return false;
    }
    return true;
  });
  const key=state.sort[mode],get=x=>{if(!key.startsWith("raw:"))return x[key];const k=key.slice(4),meta=(schema.sortableItemFields||[]).find(y=>y.key===k);return meta?.storage==="topLevel"?x[k]:x.sortable?.[k]},d=state.dir;
  out.sort((a,b)=>{const av=get(a),bv=get(b);if(av==null&&bv==null)return a.koName.localeCompare(b.koName,"ko");if(av==null)return 1;if(bv==null)return-1;if(typeof av==="number"&&typeof bv==="number")return(av-bv)*d;return String(av).localeCompare(String(bv),"ko",{numeric:true})*d});
  return out;
}
function render(){
  const rows=filtered(),pages=Math.max(1,Math.ceil(rows.length/state.pageSize));state.page=Math.min(state.page,pages);
  const page=rows.slice((state.page-1)*state.pageSize,state.page*state.pageSize),sel=state.selected[state.mode];
  $("#statusText").textContent=`${fmt(rows.length)}개 결과 · ${state.page}/${pages} 페이지`;
  if(state.mode==="items"){
    $("#thead").innerHTML="<tr><th>비교</th><th>아이템</th><th>ID</th><th>종류</th><th>위력</th><th>무게</th><th>창고</th><th>판매가</th><th>월 급여/수익</th><th>연구</th><th>제조</th></tr>";
    $("#tbody").innerHTML=page.map(x=>`<tr data-id="${esc(x.id)}"><td><input class="check" data-select="${esc(x.id)}" type="checkbox" ${sel.includes(x.id)?"checked":""}></td><td><span class="name">${esc(x.koName)}</span><span class="sub">${esc(x.enName)}</span></td><td class="id">${esc(x.id)}</td><td>${esc(kinds[x.kind]||x.kind)}</td><td>${fmt(x.power)}</td><td>${fmt(x.weight)}</td><td>${fmt(x.size)}</td><td>${fmt(x.costSell)}</td><td>${fmt(x.monthlySalary)}</td><td>${fmt(x.researchCount)}</td><td>${fmt(x.manufactureCount)}</td></tr>`).join("");
  }else{
    $("#thead").innerHTML="<tr><th>비교</th><th>연구</th><th>ID</th><th>연구량</th><th>점수</th><th>직접 선행</th><th>후속</th><th>아이템</th><th>제조</th><th>표본</th></tr>";
    $("#tbody").innerHTML=page.map(x=>`<tr data-id="${esc(x.id)}"><td><input class="check" data-select="${esc(x.id)}" type="checkbox" ${sel.includes(x.id)?"checked":""}></td><td><span class="name">${esc(x.koName)}</span><span class="sub">${esc(x.enName)}</span></td><td class="id">${esc(x.id)}</td><td>${fmt(x.cost)}</td><td>${fmt(x.points)}</td><td>${fmt(x.dependencyCount)}</td><td>${fmt(x.requiredByCount)}</td><td>${fmt(x.itemReferenceCount)}</td><td>${fmt(x.manufactureReferenceCount)}</td><td>${x.needItem?`<span class="badge ${x.destroyItem?"warn":""}">${x.destroyItem?"소모":"필요"}</span>`:"—"}</td></tr>`).join("");
  }
  const nums=[1,state.page-2,state.page-1,state.page,state.page+1,state.page+2,pages].filter(x=>x>=1&&x<=pages),uniq=[...new Set(nums)].sort((a,b)=>a-b);
  $("#pager").innerHTML=uniq.map(n=>`<button data-page="${n}" class="${n===state.page?"current":""}">${n}</button>`).join("");
  updateCompare();
}
async function detail(mode,id){
  const map=mode==="items"?itemMap:researchMap,row=map.get(id);if(!row)throw new Error("대상을 찾지 못했습니다: "+id);
  const cache=state.cache[mode],dir=mode==="items"?"chunks":"research-chunks";
  if(!cache.has(row.bucket))cache.set(row.bucket,(await json(`${dataBase}/${dir}/${row.bucket}.json`)).details);
  return cache.get(row.bucket)[id];
}
function entity(id){const x=itemMap.get(id)||researchMap.get(id),kind=itemMap.has(id)?"items":researchMap.has(id)?"research":"",n=entityNames[id];return kind?`<button class="chip" data-kind="${kind}" data-open="${esc(id)}">${esc(x.koName)}<span class="sub">${esc(x.enName)}</span></button>`:n?`<span class="badge">${esc(n[0])}<span class="sub">${esc(n[1])} · ${esc(id)}</span></span>`:`<span class="badge">${esc(id)}</span>`}
function humanPath(p){return String(p||"직접 참조").split(".").map(x=>pathNames[x]||(/^\d+$/.test(x)?"#"+(Number(x)+1):x)).join(" › ")}
function relations(xs,defaultSection=""){if(!xs?.length)return'<div class="empty">없음</div>';return xs.map(x=>`<div class="rel"><span class="badge">${esc(sections[x.section||defaultSection]||x.section||defaultSection||"연결")}</span> ${entity(x.id)}<div class="paths">${arr(x.paths).map(humanPath).map(esc).join(" · ")}</div></div>`).join("")}
function allItemReferences(d){return[...arr(d.research).map(x=>({...x,section:"research"})),...arr(d.manufacture).map(x=>({...x,section:"manufacture"})),...arr(d.otherReferences)]}
function rawTable(raw,meta){return`<table class="raw"><tbody>${Object.keys(raw||{}).sort().map(k=>{const v=raw[k],shown=v&&typeof v==="object"?JSON.stringify(v,null,2):String(v);return`<tr><td>${esc(meta?.[k]?.label||k)}<span class="sub">${esc(k)}</span><span class="help">${esc(meta?.[k]?.description||"원본 규칙 값")}</span></td><td>${esc(shown)}</td></tr>`}).join("")}</tbody></table>`}
function kpis(xs){return`<div class="kpis">${xs.map(([k,v,s])=>`<div class="kpi"><span>${esc(k)}${s?` · <i class="source">${esc(sourceLabel(s))}</i>`:""}</span><b>${esc(fmt(v))}</b></div>`).join("")}</div>`}
function resourceDetailsMarkup(kind,d){return d.resourceFieldCount?`<details class="resource-details" data-resource-kind="${esc(kind)}" data-id="${esc(d.id)}" data-bucket="${esc(d.bucket)}"><summary>표현 리소스 필드 ${fmt(d.resourceFieldCount)}개 · 별도 파일</summary><pre class="resource-body">열면 픽셀·스프라이트·애니메이션·사운드 등 분리 필드를 불러옵니다.</pre></details>`:""}
function bindResourceDetails(){
  $$(".resource-details").forEach(el=>el.ontoggle=async()=>{
    if(!el.open||el.dataset.loaded)return;el.dataset.loaded="1";const body=el.querySelector(".resource-body");
    try{const x=await json(`${dataBase}/resource-chunks/${el.dataset.resourceKind}/${el.dataset.bucket}.json`),d=x.details?.[el.dataset.id]||{};body.textContent=JSON.stringify(d,null,2)}catch(e){body.textContent="분리 리소스 로드 실패: "+e.message}
  });
}
async function openDetail(mode,id){
  try{
    const d=await detail(mode,id);state.detail={mode,id};
    $("#detail").innerHTML=mode==="items"?renderItem(d):renderResearch(d);bindResourceDetails();
    $("#drawer").classList.add("open");$("#drawer").setAttribute("aria-hidden","false");$("#backdrop").hidden=false;
    history.replaceState(null,"","#"+(mode==="items"?"item=":"research=")+encodeURIComponent(id));
  }catch(e){$("#detail").innerHTML=`<p class="error">${esc(e.message)}</p>`;$("#drawer").classList.add("open");$("#backdrop").hidden=false}
}
function renderItem(d){
  const c=d.effectiveCore||{},codes=d.effectiveCoreSourceCodes||"",legend=schema.coreSourceLegend||{},s=d.effectiveCoreSources||Object.fromEntries((schema.effectiveCoreFields||[]).map((k,i)=>[k,legend[codes[i]]||""])),r=d.raw||{},refs=allItemReferences(d);
  const power=r.power!=null?c.power:r.meleePower!=null?c.meleePower:"—",powerSrc=r.power!=null?s.power:s.meleePower;
  return`<h2>${esc(d.koName)}</h2><div class="id">${esc(d.enName)} · ${esc(d.id)}</div><div class="summary">${esc(d.summaryKo)}</div>
  ${kpis([["종류",kinds[d.kind]||d.kind,s.battleType],["위력",power,powerSrc],["피해형",d.damageTypeKo],["무게",c.weight,s.weight],["창고 점유",c.size,s.size],["구매가",r.costBuy??"—",r.costBuy!=null?s.costBuy:""],["판매가",r.costSell??"—",r.costSell!=null?s.costSell:""],["월 급여/수익",c.monthlySalary,s.monthlySalary],["아이템 내구",c.armor,s.armor],["한손 보정",c.oneHandedPenalty==null?"—":c.oneHandedPenalty+"%",s.oneHandedPenalty],["무릎쏴",c.kneelBonus==null?"—":c.kneelBonus+"%",s.kneelBonus]])}
  <section class="section"><h3>공격 행동</h3>${d.fireModes?.length?`<table><tr><th>행동</th><th>명중</th><th>TU</th><th>발수</th></tr>${d.fireModes.map(x=>`<tr><td>${esc(x.name||x.label)}</td><td>${fmt(x.accuracy)}%</td><td>${fmt(x.tu)}</td><td>${fmt(x.shots)}</td></tr>`).join("")}</table>`:'<div class="empty">직접 공격 행동 없음</div>'}</section>
  <section class="section"><h3>호환 탄약</h3>${d.compatibleAmmo?.length?d.compatibleAmmo.map(entity).join(""):'<div class="empty">없음/해당 없음</div>'}</section>
  <section class="section"><h3>이 탄약을 쓰는 무기</h3>${d.usedByWeapons?.length?d.usedByWeapons.map(entity).join(""):'<div class="empty">없음/해당 없음</div>'}</section>
  <section class="section"><h3>연구 연결</h3>${relations(d.research,"research")}</section><section class="section"><h3>제조 연결</h3>${relations(d.manufacture,"manufacture")}</section>
  <details><summary>전체 역참조 ${refs.length}개</summary><div>${relations(refs)}</div></details>
  <details><summary>최종 핵심 룰 필드 ${Object.keys(r).length}개</summary><div>${rawTable(r,schema.fieldMeta)}</div></details>
  ${resourceDetailsMarkup("items",d)}
  ${d.inheritedViaRefNode?`<details><summary>refNode 상속 전 자식 선언</summary><div>${rawTable(d.rawDeclared,schema.fieldMeta)}</div></details>`:""}
  <section class="section"><h3>출처</h3><p class="muted">${arr(d.sourceFiles).map(esc).join(" → ")}</p></section>`;
}
function renderResearch(d){
  return`<h2>${esc(d.koName)}</h2><div class="id">${esc(d.enName)} · ${esc(d.id)}</div><div class="summary">${esc(d.summaryKo)}</div>
  ${kpis([["연구량",d.cost],["완료 점수",d.points],["실물 표본",d.needItem?(d.destroyItem?"필요·소모":"필요"):"불필요"],["직접 선행",d.dependencies.length],["후속 연구",d.requiredBy.length],["아이템 연결",d.itemReferences.length],["제조 연결",d.manufactureReferences.length]])}
  <section class="section"><h3>직접 선행</h3>${d.dependencies?.length?d.dependencies.map(x=>entity(typeof x==="string"?x:x.id)).join(""):'<div class="empty">없음</div>'}</section>
  <section class="section"><h3>후속 연구</h3>${d.requiredBy?.length?d.requiredBy.map(x=>entity(typeof x==="string"?x:x.id)).join(""):'<div class="empty">없음</div>'}</section>
  <section class="section"><h3>명시 해금</h3>${d.unlocks?.length?d.unlocks.map(x=>entity(typeof x==="string"?x:x.id)).join(""):'<div class="empty">없음</div>'}</section>
  <section class="section"><h3>아이템 역참조</h3>${relations(d.itemReferences)}</section><section class="section"><h3>제조 역참조</h3>${relations(d.manufactureReferences)}</section>
  <details><summary>기타 역참조 ${d.otherReferences?.length||0}개</summary><div>${relations(d.otherReferences)}</div></details>
  <details><summary>원본 연구 핵심 룰</summary><div>${rawTable(d.raw,schema.researchFieldMeta)}</div></details>
  ${resourceDetailsMarkup("research",d)}
  <section class="section"><h3>출처</h3><p class="muted">${arr(d.sourceFiles).map(esc).join(" → ")}</p></section>`;
}
function closeDrawer(){state.detail=null;$("#drawer").classList.remove("open");$("#drawer").setAttribute("aria-hidden","true");$("#backdrop").hidden=true;history.replaceState(null,"",location.pathname+location.search)}
function toggleSelect(mode,id){const s=state.selected[mode],i=s.indexOf(id);if(i>=0)s.splice(i,1);else if(s.length<4)s.push(id);render();updateCompare()}
function updateCompare(){const n=state.selected[state.mode].length;$("#compareCount").textContent=n;$("#compare").disabled=n<2}
async function openCompare(){
  const ids=state.selected[state.mode];if(ids.length<2)return;
  const ds=await Promise.all(ids.map(id=>detail(state.mode,id)));
  const fields=state.mode==="items"
    ?[["종류",d=>kinds[d.kind]],["무게",d=>d.effectiveCore?.weight],["창고 점유",d=>d.effectiveCore?.size],["판매가",d=>d.raw?.costSell],["월 급여/수익",d=>d.effectiveCore?.monthlySalary],["위력",d=>d.raw?.power??d.raw?.meleePower],["피해형",d=>d.damageTypeKo],["내구",d=>d.effectiveCore?.armor],["한손 보정",d=>d.effectiveCore?.oneHandedPenalty],["연구 연결",d=>d.research.length],["제조 연결",d=>d.manufacture.length]]
    :[["연구량",d=>d.cost],["점수",d=>d.points],["실물 표본",d=>d.needItem?(d.destroyItem?"소모":"필요"):"불필요"],["직접 선행",d=>d.dependencies.length],["후속",d=>d.requiredBy.length],["아이템 연결",d=>d.itemReferences.length],["제조 연결",d=>d.manufactureReferences.length]];
  $("#compareBody").innerHTML=`<table class="compare-table"><tr><th>항목</th>${ds.map(d=>`<th>${esc(d.koName)}<span class="sub">${esc(d.enName)}</span></th>`).join("")}</tr>${fields.map(([k,f])=>`<tr><td>${esc(k)}</td>${ds.map(d=>`<td>${esc(fmt(f(d)))}</td>`).join("")}</tr>`).join("")}</table>`;
  $("#compareDialog").showModal();
}
function route(){const m=location.hash.match(/^#(item|research)=(.+)$/);if(!m)return;state.mode=m[1]==="item"?"items":"research";$$(".tab").forEach(x=>x.classList.toggle("active",x.dataset.mode===state.mode));renderControls();render();openDetail(state.mode,decodeURIComponent(m[2]))}
init();
