const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=v=>v==null?"—":typeof v==="number"?v.toLocaleString("ko-KR"):String(v);
const arr=v=>Array.isArray(v)?v:[];
const kinds={weapon:"총기",ammo:"탄약",melee:"근접",grenade:"투척/폭발",medical:"의료",scanner:"스캐너",psi:"사이오닉",flare:"조명탄",corpse:"시체/잔해","damage-item":"공격 아이템",item:"기타"};
const sections={research:"연구",manufacture:"제조",items:"아이템",events:"이벤트",eventScripts:"이벤트 스크립트",units:"유닛",soldiers:"병종",soldierTransformation:"훈련/변신",soldierBonuses:"병사 특성",crafts:"기체",facilities:"시설",armors:"방어구",factions:"세력",missionScripts:"미션 스크립트",alienMissions:"미션",alienDeployments:"전투 배치",terrains:"지형",ufopaedia:"UFOPEDIA"};
const pathNames={dependencies:"선행 연구",requires:"필요 조건",unlocks:"해금",requiresBuy:"구매 해금",requiredItems:"필요 아이템",producedItems:"제조 결과",getOneFree:"무료 획득",researchList:"이벤트 연구 지급",researchTriggers:"이벤트 연구 조건",facilityTriggers:"이벤트 시설 조건",itemTriggers:"이벤트 아이템 조건",requiredPreviousTransformations:"필수 선행 훈련",forbiddenPreviousTransformations:"금지 선행 훈련",compatibleAmmo:"호환 탄약",spawnUnit:"생성 유닛"};
const sourceLabel=v=>v==="engineDefault"?"OXCE 기본값":v==="modGlobal"?"XPZ 전역값":v==="ruleset"?"아이템 룰":"";
const insightRoleLabels={"soldier-training":"병사 훈련/변신",manufacture:"제조 해금","event-unlock":"이벤트 조건","event-grant":"이벤트 획득/지급","event-research-link":"이벤트 연구 연결",facility:"시설 해금",recruitment:"고용/병종 해금",craft:"기체 해금",purchase:"구매 해금","item-gate":"아이템 사용 조건",mission:"미션 진행","branch-choice":"분기/배타","research-unlock":"후속 연구 해금","research-grant":"추가 연구 지급","research-granted-by":"다른 연구 보상으로 획득","item-reward":"아이템 지급",ufopaedia:"정보/도감 해금",progression:"진행 플래그",other:"기타/특수"};
const statLabels={tu:"TU",stamina:"기력",health:"체력",bravery:"용기",reactions:"반응",firing:"사격",throwing:"투척",strength:"근력",psiStrength:"Psi 강도",psiSkill:"Psi 기술",melee:"근접",mana:"Mana"};
const armorLabels={frontArmor:"전면 장갑",sideArmor:"측면 장갑",rearArmor:"후면 장갑",underArmor:"하부 장갑"};
const pageMode=document.body.dataset.mode||"items";
const configuredDataBase=document.body.dataset.dataBase||"";
const canonicalDataBase=pageMode==="research"?"../items/data":"./data";
const dataBase=!configuredDataBase||configuredDataBase==="../data"?canonicalDataBase:configuredDataBase;
const state={mode:pageMode,query:"",page:1,pageSize:100,dir:1,sort:{items:"koName",research:"koName"},filter:{items:{kind:"",research:"",manufacture:""},research:{sample:"",items:"",outputs:"",effect:""}},selected:{items:[],research:[]},cache:{items:new Map(),research:new Map()},insightCache:new Map(),editorialCache:new Map(),itemEditorialCache:new Map(),detail:null};
let itemIndex=[],researchIndex=[],schema={},manifest={},entityNames={},itemMap=new Map(),researchMap=new Map();

async function json(url){const r=await fetch(url);if(!r.ok)throw new Error(url+" · HTTP "+r.status);return r.json()}
async function init(){
  try{
    const [ii,ri,rii,s,m,e]=await Promise.all([json(`${dataBase}/items-index.json`),json(`${dataBase}/research-index.json`),json(`${dataBase}/research-insight-index.json`),json(`${dataBase}/schema.json`),json(`${dataBase}/manifest.json`),json(`${dataBase}/entities.json`)]);
    itemIndex=ii.index;
    const insightIndex=new Map((rii.index||[]).map(x=>[x.id,x]));
    researchIndex=ri.index.map(x=>({...x,...(insightIndex.get(x.id)||{})}));
    schema=s;manifest=m;entityNames=e.names||{};
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
  research:[["koName","이름"],["cost","연구량"],["points","완료 점수"],["dependencyCount","직접 선행"],["requiredByCount","후속 연구"],["spawnedItemCount","생성 아이템"],["itemReferenceCount","아이템 연결"],["manufactureReferenceCount","제조 연결"],["otherReferenceCount","기타 연결"]]
};
function renderControls(){
  const mode=state.mode;
  const base=sortOptions[mode].map(([v,l])=>`<option value="${v}">${l}</option>`).join("");
  const extra=mode==="items"?(schema.sortableItemFields||[]).filter(x=>!sortOptions.items.some(([v])=>v===x.key)).map(x=>`<option value="raw:${esc(x.key)}">원본 · ${esc(x.label)} [${esc(x.key)}]</option>`).join(""):"";
  $("#sort").innerHTML=base+extra;$("#sort").value=state.sort[mode];
  $("#filters").innerHTML=mode==="items"
    ?`<label><span>종류</span><select data-filter="kind"><option value="">전체</option>${Object.entries(kinds).map(([v,l])=>`<option value="${v}">${l}</option>`).join("")}</select></label><label><span>연구</span><select data-filter="research"><option value="">전체</option><option value="yes">연결 있음</option><option value="no">없음</option></select></label><label><span>제조</span><select data-filter="manufacture"><option value="">전체</option><option value="yes">연결 있음</option><option value="no">없음</option></select></label>`
    :`<label><span>실물 표본</span><select data-filter="sample"><option value="">전체</option><option value="yes">필요</option><option value="destroy">소모</option><option value="no">불필요</option></select></label><label><span>생성 아이템</span><select data-filter="outputs"><option value="">전체</option><option value="yes">있음</option><option value="no">없음</option></select></label><label><span>효과 유형</span><select data-filter="effect"><option value="">전체</option>${Object.entries(insightRoleLabels).map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select></label><label><span>아이템 연결</span><select data-filter="items"><option value="">전체</option><option value="yes">있음</option><option value="no">없음</option></select></label>`;
  for(const [k,v] of Object.entries(state.filter[mode])){const e=$(`[data-filter="${k}"]`);if(e)e.value=v}
}
function filtered(){
  const mode=state.mode,src=mode==="items"?itemIndex:researchIndex,q=state.query.trim().toLocaleLowerCase("ko"),f=state.filter[mode];
  const out=src.filter(x=>{
    const hay=[x.koName,x.enName,x.id,...(x.categories||[]),...(x.categoryIds||[]),...(x.insightTerms||[]),...(x.insightNames||[]),...(x.insightKinds||[]).map(k=>insightRoleLabels[k]||k)].filter(Boolean).join(" ").toLocaleLowerCase("ko");
    if(q&&!hay.includes(q))return false;
    if(mode==="items"){
      if(f.kind&&x.kind!==f.kind)return false;
      if(f.research==="yes"&&!x.researchCount)return false;if(f.research==="no"&&x.researchCount)return false;
      if(f.manufacture==="yes"&&!x.manufactureCount)return false;if(f.manufacture==="no"&&x.manufactureCount)return false;
    }else{
      if(f.sample==="yes"&&!x.needItem)return false;if(f.sample==="destroy"&&!x.destroyItem)return false;if(f.sample==="no"&&x.needItem)return false;
      if(f.outputs==="yes"&&!x.spawnedItemCount)return false;if(f.outputs==="no"&&x.spawnedItemCount)return false;
      if(f.items==="yes"&&!x.itemReferenceCount)return false;if(f.items==="no"&&x.itemReferenceCount)return false;
      if(f.effect&&!arr(x.insightKinds).includes(f.effect))return false;
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
    $("#thead").innerHTML="<tr><th>비교</th><th>연구</th><th>해석</th><th>ID</th><th>연구량</th><th>점수</th><th>직접 선행</th><th>후속</th><th>생성</th><th>아이템</th><th>제조</th><th>표본</th></tr>";
    $("#tbody").innerHTML=page.map(x=>`<tr data-id="${esc(x.id)}"><td><input class="check" data-select="${esc(x.id)}" type="checkbox" ${sel.includes(x.id)?"checked":""}></td><td><span class="name">${esc(x.koName)}</span><span class="sub">${esc(x.enName)}</span></td><td><span class="badge insight-kind">${esc(insightRoleLabels[x.primaryInsightKind]||x.primaryInsightKind||"—")}</span></td><td class="id">${esc(x.id)}</td><td>${fmt(x.cost)}</td><td>${fmt(x.points)}</td><td>${fmt(x.dependencyCount)}</td><td>${fmt(x.requiredByCount)}</td><td>${fmt(x.spawnedItemCount)}</td><td>${fmt(x.itemReferenceCount)}</td><td>${fmt(x.manufactureReferenceCount)}</td><td>${x.needItem?`<span class="badge ${x.destroyItem?"warn":""}">${x.destroyItem?"소모":"필요"}</span>`:"—"}</td></tr>`).join("");
  }
  const nums=[1,state.page-2,state.page-1,state.page,state.page+1,state.page+2,pages].filter(x=>x>=1&&x<=pages),uniq=[...new Set(nums)].sort((a,b)=>a-b);
  $("#pager").innerHTML=uniq.map(n=>`<button data-page="${n}" class="${n===state.page?"current":""}">${n}</button>`).join("");
  updateCompare();
}
async function detail(mode,id){
  const map=mode==="items"?itemMap:researchMap,row=map.get(id);if(!row)throw new Error("대상을 찾지 못했습니다: "+id);
  const cache=state.cache[mode],dir=mode==="items"?"chunks":"research-chunks";
  if(!cache.has(row.bucket))cache.set(row.bucket,(await json(`${dataBase}/${dir}/${row.bucket}.json`)).details);
  const d=cache.get(row.bucket)[id];
  if(mode==="research"){
    if(!state.insightCache.has(row.bucket))state.insightCache.set(row.bucket,(await json(`${dataBase}/research-insight-chunks/${row.bucket}.json`)).details);
    if(!state.editorialCache.has(row.bucket))state.editorialCache.set(row.bucket,(await json(`${dataBase}/research-editorial-chunks/${row.bucket}.json`)).details);
    return {...d,insight:state.insightCache.get(row.bucket)[id]?.insight||null,editorial:state.editorialCache.get(row.bucket)[id]||null};
  }
  if(!state.itemEditorialCache.has(row.bucket))state.itemEditorialCache.set(row.bucket,(await json(`${dataBase}/item-editorial-chunks/${row.bucket}.json`)).details);
  return {...d,editorial:state.itemEditorialCache.get(row.bucket)[id]||null};
}
function entity(id,preferredKind=""){const preferred=preferredKind==="items"?itemMap.get(id):preferredKind==="research"?researchMap.get(id):null,x=preferred||itemMap.get(id)||researchMap.get(id),kind=preferred?preferredKind:itemMap.has(id)?"items":researchMap.has(id)?"research":"",n=entityNames[id];return kind?`<button class="chip" data-kind="${kind}" data-open="${esc(id)}">${esc(x.koName)}<span class="sub">${esc(x.enName)}</span></button>`:n?`<span class="badge">${esc(n[0])}<span class="sub">${esc(n[1])} · ${esc(id)}</span></span>`:`<span class="badge">${esc(id)}</span>`}
function humanPath(p){return String(p||"직접 참조").split(".").map(x=>pathNames[x]||(/^\d+$/.test(x)?"#"+(Number(x)+1):x)).join(" › ")}
function manufactureEntity(id){const n=entityNames[id];return`<a class="chip" href="../manufacture/#recipe=${encodeURIComponent(id)}">${esc(n?.[0]||id)}<span class="sub">${esc(n?.[1]||"")} · ${esc(id)}</span></a>`}
function relations(xs,defaultSection=""){if(!xs?.length)return'<div class="empty">없음</div>';return xs.map(x=>{const section=x.section||defaultSection,preferred=section==="items"||section==="research"?section:"",target=section==="manufacture"?manufactureEntity(x.id):entity(x.id,preferred);return`<div class="rel"><span class="badge">${esc(sections[section]||section||"연결")}</span> ${target}<div class="paths">${arr(x.paths).map(humanPath).map(esc).join(" · ")}</div></div>`}).join("")}
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
function itemEditorialMarkup(d){
  const e=d.editorial;if(!e)return"";
  const row=(label,text,kind="")=>text?`<div class="editorial-row ${kind}"><span>${esc(label)}</span><p>${esc(text)}</p></div>`:"";
  return`<section class="section editorial-panel item-editorial">
    <div class="insight-heading"><h3>GPT 아이템 인사이트</h3><span class="evidence-tag gpt">GPT 편집 · 룰셋 기반 자동 합성</span></div>
    ${row("정체",e.overview,"core")}
    ${row("실제 효과",e.effect,"effect")}
    ${row("획득/해금",e.acquisition,"action")}
    ${row("진행 연결",e.progression,"route")}
    ${row("판단",e.decision,"decision")}
    ${row("주의",e.watch,"watch")}
  </section>`;
}
function renderItem(d){
  const c=d.effectiveCore||{},codes=d.effectiveCoreSourceCodes||"",legend=schema.coreSourceLegend||{},s=d.effectiveCoreSources||Object.fromEntries((schema.effectiveCoreFields||[]).map((k,i)=>[k,legend[codes[i]]||""])),r=d.raw||{},refs=allItemReferences(d);
  const power=r.power!=null?c.power:r.meleePower!=null?c.meleePower:"—",powerSrc=r.power!=null?s.power:s.meleePower;
  return`<h2>${esc(d.koName)}</h2><div class="id">${esc(d.enName)} · ${esc(d.id)}</div><div class="summary">${esc(d.summaryKo)}</div>
  ${kpis([["종류",kinds[d.kind]||d.kind,s.battleType],["위력",power,powerSrc],["피해형",d.damageTypeKo],["무게",c.weight,s.weight],["창고 점유",c.size,s.size],["구매가",r.costBuy??"—",r.costBuy!=null?s.costBuy:""],["판매가",r.costSell??"—",r.costSell!=null?s.costSell:""],["월 급여/수익",c.monthlySalary,s.monthlySalary],["아이템 내구",c.armor,s.armor],["한손 보정",c.oneHandedPenalty==null?"—":c.oneHandedPenalty+"%",s.oneHandedPenalty],["무릎쏴",c.kneelBonus==null?"—":c.kneelBonus+"%",s.kneelBonus]])}
  ${itemEditorialMarkup(d)}
  <section class="section"><h3>공격 행동</h3>${d.fireModes?.length?`<table><tr><th>행동</th><th>명중</th><th>TU</th><th>발수</th></tr>${d.fireModes.map(x=>`<tr><td>${esc(x.name||x.label)}</td><td>${fmt(x.accuracy)}%</td><td>${fmt(x.tu)}</td><td>${fmt(x.shots)}</td></tr>`).join("")}</table>`:'<div class="empty">직접 공격 행동 없음</div>'}</section>
  <section class="section"><h3>호환 탄약</h3>${d.compatibleAmmo?.length?d.compatibleAmmo.map(x=>entity(x,"items")).join(""):'<div class="empty">없음/해당 없음</div>'}</section>
  <section class="section"><h3>이 탄약을 쓰는 무기</h3>${d.usedByWeapons?.length?d.usedByWeapons.map(x=>entity(x,"items")).join(""):'<div class="empty">없음/해당 없음</div>'}</section>
  <section class="section"><h3>연구 연결</h3>${relations(d.research,"research")}</section><section class="section"><h3>제조 연결</h3>${relations(d.manufacture,"manufacture")}</section>
  <details><summary>전체 역참조 ${refs.length}개</summary><div>${relations(refs)}</div></details>
  <details><summary>최종 핵심 룰 필드 ${Object.keys(r).length}개</summary><div>${rawTable(r,schema.fieldMeta)}</div></details>
  ${resourceDetailsMarkup("items",d)}
  ${d.inheritedViaRefNode?`<details><summary>refNode 상속 전 자식 선언</summary><div>${rawTable(d.rawDeclared,schema.fieldMeta)}</div></details>`:""}
  <section class="section"><h3>출처</h3><p class="muted">${arr(d.sourceFiles).map(esc).join(" → ")}</p></section>`;
}
function signed(v){return Number(v)>0?"+"+fmt(v):fmt(v)}
function valueBadges(o,labels=statLabels){const xs=Object.entries(o||{});return xs.length?xs.map(([k,v])=>`<span class="effect-pill">${esc(labels[k]||k)} <b>${esc(signed(v))}</b></span>`).join(""):'<span class="empty">없음</span>'}
function idList(ids,preferredKind=""){return arr(ids).length?arr(ids).map(id=>entity(typeof id==="string"?id:id.id,preferredKind)).join(""):'<span class="empty">없음</span>'}
function conditionsMarkup(o){const labels={firstMonth:"시작 월",lastMonth:"종료 월",minDifficulty:"최소 난이도",maxDifficulty:"최대 난이도",executionOdds:"발생 확률",minFunds:"최소 자금",maxFunds:"최대 자금",minScore:"최소 점수",maxScore:"최대 점수"};const xs=Object.entries(o||{});return xs.length?xs.map(([k,v])=>`<span class="condition-pill">${esc(labels[k]||k)} <b>${esc(k==="executionOdds"?fmt(v)+"%":fmt(v))}</b></span>`).join(""):""}
function triggerMapMarkup(label,o,preferredKind=""){const xs=Object.entries(o||{});return xs.length?`<div class="trigger-row"><span>${esc(label)}</span><div>${xs.map(([id,v])=>`<span class="trigger-item ${v?"required":"forbidden"}">${entity(id,preferredKind)} <b>${v?"필요":"미보유 필요"}</b></span>`).join("")}</div></div>`:""}
function scriptGateMarkup(s){return`<div class="script-gate"><div class="script-title"><span class="badge">${esc(s.id)}</span>${conditionsMarkup(s.conditions)}</div>${triggerMapMarkup("연구 조건",s.researchTriggers,"research")}${triggerMapMarkup("시설 조건",s.facilityTriggers)}${triggerMapMarkup("아이템 조건",s.itemTriggers,"items")}</div>`}
function transformationMarkup(t){
  const bonus=t.soldierBonus,requirements=[];
  if(t.cost)requirements.push(`비용 ${Number(t.cost).toLocaleString("ko-KR")}`);
  if(t.recoveryTime)requirements.push(`회복/훈련 ${fmt(t.recoveryTime)}일`);
  if(t.requiresBaseFunc?.length)requirements.push(`기지 기능 ${t.requiresBaseFunc.map(x=>entity(x)).join(" ")}`);
  if(t.requiredItems?.length)requirements.push(`필요 아이템 ${t.requiredItems.map(x=>`${entity(x.id,"items")} ×${fmt(x.qty)}`).join(" ")}`);
  return`<article class="insight-card transformation-card">
    <div class="insight-card-head"><div><b>${esc(entityNames[t.id]?.[0]||t.id)}</b><span class="sub">${esc(entityNames[t.id]?.[1]||"")} · ${esc(t.id)}</span></div><span class="evidence-tag">규칙 직접값</span></div>
    ${requirements.length?`<div class="requirement-line">${requirements.join(" · ")}</div>`:""}
    ${Object.keys(t.requiredMinStats||{}).length?`<div class="effect-row"><span>최소 능력치</span><div>${valueBadges(t.requiredMinStats)}</div></div>`:""}
    ${Object.keys(t.flatOverallStatChange||{}).length?`<div class="effect-row"><span>일반 능력치 변화</span><div>${valueBadges(t.flatOverallStatChange)}</div><small>훈련/변신의 직접 능력치 변화.${t.upperBoundAtStatCaps===true?" stat cap 상한을 적용합니다.":" 성장 한계와 별도 적용 규칙의 영향을 받을 수 있습니다."}</small></div>`:""}
    ${Object.keys(t.percentOverallStatChange||{}).length?`<div class="effect-row"><span>능력치 % 변화</span><div>${valueBadges(t.percentOverallStatChange)}</div></div>`:""}
    ${Object.keys(t.percentGainedStatChange||{}).length?`<div class="effect-row"><span>획득 능력치 % 변화</span><div>${valueBadges(t.percentGainedStatChange)}</div></div>`:""}
    ${bonus?`<div class="effect-row bonus-layer"><span>추가 특성 · ${esc(entityNames[bonus.id]?.[0]||bonus.id)}</span><div>${valueBadges(bonus.stats)} ${Object.keys(bonus.armor||{}).length?valueBadges(bonus.armor,armorLabels):""}</div><small>soldierBonus 레이어. 위 일반 능력치 변화와 분리해서 표시합니다.</small></div>`:""}
    ${bonus&&Object.keys(t.combinedFixedStatChange||{}).length?`<div class="effect-row derived-total"><span>고정 수치 합산 잠재값</span><div>${valueBadges(t.combinedFixedStatChange)}</div><small>직접 능력치 변화 + soldierBonus 능력치를 단순 합산한 파생값입니다. 직접 변화분은 stat cap 때문에 실제 증가량이 더 작을 수 있습니다.</small></div>`:""}
    ${t.producedSoldierType?`<div class="effect-row"><span>변환 결과 병종</span><div>${entity(t.producedSoldierType)}</div></div>`:""}
    ${t.allowedSoldierTypes?.length?`<details><summary>적용 가능 병종 ${fmt(t.allowedSoldierTypes.length)}개</summary><div class="chip-cloud">${idList(t.allowedSoldierTypes)}</div></details>`:""}
    ${t.forbiddenSoldierTypes?.length?`<details><summary>적용 불가 병종 ${fmt(t.forbiddenSoldierTypes.length)}개</summary><div class="chip-cloud">${idList(t.forbiddenSoldierTypes)}</div></details>`:""}
    ${t.requiredPreviousTransformations?.length?`<details><summary>필수 선행 훈련/변신</summary><div class="chip-cloud">${idList(t.requiredPreviousTransformations)}</div></details>`:""}
    ${t.forbiddenPreviousTransformations?.length?`<details><summary>동시 불가/금지 선행 훈련 ${fmt(t.forbiddenPreviousTransformations.length)}개</summary><div class="chip-cloud">${idList(t.forbiddenPreviousTransformations)}</div></details>`:""}
  </article>`;
}
function semanticRefMarkup(x){
  const role=insightRoleLabels[x.kind]||x.kind,preferred=x.section==="items"?"items":x.section==="research"?"research":"";
  return`<div class="semantic-ref"><div><span class="badge insight-kind">${esc(role)}</span> ${entity(x.id,preferred)}</div>${x.events?.length?`<div class="semantic-extra">연결 이벤트: ${idList(x.events)}</div>`:""}${x.eventRequires?.length?`<div class="semantic-extra">이벤트 자체 선행 연구: ${idList(x.eventRequires,"research")}</div>`:""}${x.requiresBaseFunc?.length?`<div class="semantic-extra">기지 기능: ${idList(x.requiresBaseFunc)}</div>`:""}${x.scriptGate?scriptGateMarkup(x.scriptGate):x.conditions&&Object.keys(x.conditions).length?`<div class="condition-cloud">${conditionsMarkup(x.conditions)}</div>`:""}${x.scripts?.length?`<div class="semantic-extra">${x.scripts.map(scriptGateMarkup).join("")}</div>`:""}<div class="paths">${arr(x.paths).map(humanPath).map(esc).join(" · ")}</div></div>`;
}
function prerequisiteDetail(id){
  const depth=new Map(),queue=arr(researchMap.get(id)?.dependencyIds).map(x=>[x,1]);
  for(let qi=0;qi<queue.length;qi++){
    const [cur,d]=queue[qi],old=depth.get(cur);
    if(old!=null&&old<=d)continue;
    depth.set(cur,d);
    for(const dep of arr(researchMap.get(cur)?.dependencyIds))queue.push([dep,d+1]);
  }
  const nearest=[...depth.entries()].sort((a,b)=>a[1]-b[1]||a[0].localeCompare(b[0])).map(([x])=>x);
  const sampleAll=nearest.filter(x=>researchMap.get(x)?.needItem);
  const branchAll=nearest.filter(x=>arr(researchMap.get(x)?.disableIds).length);
  const eventLinks=[];
  for(const researchId of nearest){
    for(const ref of arr(researchMap.get(researchId)?.eventLinks)){
      eventLinks.push({researchId,eventId:ref.id,kind:ref.kind,paths:ref.paths||[],scripts:ref.scripts||[],eventRequires:ref.eventRequires||[],requiresBaseFunc:ref.requiresBaseFunc||[]});
      if(eventLinks.length>=24)break;
    }
    if(eventLinks.length>=24)break;
  }
  return{
    topicIds:nearest.slice(0,80),topicCount:nearest.length,topicPreviewTruncated:nearest.length>80,
    sampleTopics:sampleAll.slice(0,30),sampleTopicCount:sampleAll.length,
    branchTopics:branchAll.slice(0,30),branchTopicCount:branchAll.length,
    eventLinks
  };
}
function researchEditorialMarkup(d){
  const e=d.editorial;if(!e)return"";
  const row=(label,text,kind="")=>text?`<div class="editorial-row ${kind}"><span>${esc(label)}</span><p>${esc(text)}</p></div>`:"";
  return`<section class="section editorial-panel">
    <div class="insight-heading"><h3>GPT 플레이 인사이트</h3><span class="evidence-tag gpt">GPT 편집 · 룰셋 기반 자동 합성</span></div>
    ${row("정체",e.core,"core")}
    ${row("실제 효과",e.effect,"effect")}
    ${row("다음 행동",e.action,"action")}
    ${row("도달/비용",e.route,"route")}
    ${row("우선순위",e.decision,"decision")}
    ${row("주의",e.watch,"watch")}
  </section>`;
}
function researchInsightMarkup(d){
  const i=d.insight;if(!i)return"";
  const p=i.prerequisite||{},pd=prerequisiteDetail(d.id),roles=arr(i.roles),rq=i.researchRequirements||{};
  return`<section class="section insight-panel">
    <div class="insight-heading"><h3>플레이 관점 해석</h3><span class="evidence-tag derived">규칙에서 자동 도출</span></div>
    <p class="insight-summary">${esc(i.summary||"")}</p>
    <div class="role-cloud">${roles.map(x=>`<span class="badge insight-kind">${esc(insightRoleLabels[x]||x)}</span>`).join("")}</div>
    ${i.automaticEffect===false?`<div class="callout important"><b>연구 완료만으로 자동 버프가 붙지 않습니다.</b> 아래 후속 훈련/변신을 병사별로 실행해야 실제 효과가 적용됩니다.</div>`:""}
    <div class="insight-kpis"><span>명목 선행 주제 <b>${fmt(p.topicCount||0)}</b></span><span>선행 연구량 <b>${fmt(p.prerequisiteCost||0)}</b></span><span>연구+선행 합계 <b>${fmt((p.prerequisiteCost||0)+(d.cost||0))}</b></span></div>
    <p class="muted derived-note">명목 선행망은 dependencies + requires 재귀 합집합입니다. 이벤트 직접 지급·unlock/getOneFree 우회·분기 때문에 실제 최소 경로와 다를 수 있습니다.</p>
    ${rq.sampleItem?`<div class="requirement-line"><b>실물 표본</b> ${entity(rq.sampleItem,"items")}</div>`:""}
    ${rq.requiresBaseFunc?.length?`<div class="requirement-line"><b>이 연구에 필요한 기지 기능</b> ${idList(rq.requiresBaseFunc)}</div>`:""}
    ${i.transformations?.length?`<div class="insight-subsection"><h4>연구 후 실제 적용 방법과 효과</h4>${i.transformations.map(transformationMarkup).join("")}</div>`:""}
    ${i.semanticReferences?.length?`<div class="insight-subsection"><h4>이 연구가 실제로 여는 것</h4>${i.semanticReferences.map(semanticRefMarkup).join("")}</div>`:""}
    ${i.disables?.length?`<div class="insight-subsection"><h4>상호배타/비활성화</h4><div class="chip-cloud">${idList(i.disables,"research")}</div></div>`:""}
    ${pd.topicIds?.length?`<details class="route-details"><summary>명목 선행망 ${pd.topicPreviewTruncated?`가까운 ${fmt(pd.topicIds.length)}개 / 전체 ${fmt(p.topicCount)}개`:`${fmt(p.topicCount)}개`} · 전체 연구량 ${fmt(p.prerequisiteCost)}</summary><div class="chip-cloud">${idList(pd.topicIds,"research")}</div>${pd.sampleTopics?.length?`<p class="muted">실물 표본 선행: ${pd.sampleTopicCount>pd.sampleTopics.length?`주요 ${fmt(pd.sampleTopics.length)}개 / 전체 ${fmt(pd.sampleTopicCount)}개 · `:""}${idList(pd.sampleTopics,"research")}</p>`:""}${pd.branchTopics?.length?`<p class="muted">분기/배타 선행: ${pd.branchTopicCount>pd.branchTopics.length?`주요 ${fmt(pd.branchTopics.length)}개 / 전체 ${fmt(pd.branchTopicCount)}개 · `:""}${idList(pd.branchTopics,"research")}</p>`:""}</details>`:""}
    ${pd.eventLinks?.length?`<details><summary>가까운 선행의 이벤트 획득/연결 ${fmt(pd.eventLinks.length)}개</summary><div>${pd.eventLinks.map(x=>`<div class="semantic-ref"><div><span class="badge insight-kind">${esc(insightRoleLabels[x.kind]||x.kind)}</span> ${entity(x.researchId,"research")} ← ${entity(x.eventId)}</div>${x.eventRequires?.length?`<div class="semantic-extra">이벤트 자체 선행 연구: ${idList(x.eventRequires,"research")}</div>`:""}${x.requiresBaseFunc?.length?`<div class="semantic-extra">이벤트 기지 기능: ${idList(x.requiresBaseFunc)}</div>`:""}${x.scripts?.length?x.scripts.map(scriptGateMarkup).join(""):""}<div class="paths">${arr(x.paths).map(humanPath).map(esc).join(" · ")}</div></div>`).join("")}</div></details>`:""}
  </section>`;
}
function renderResearch(d){
  const spawned=Array.isArray(d.raw?.spawnedItem)?d.raw.spawnedItem:(typeof d.raw?.spawnedItem==="string"?[d.raw.spawnedItem]:[]);
  return`<h2>${esc(d.koName)}</h2><div class="id">${esc(d.enName)} · ${esc(d.id)}</div><div class="summary">${esc(d.summaryKo)}</div>
  ${kpis([["연구량",d.cost],["완료 점수",d.points],["실물 표본",d.needItem?(d.destroyItem?"필요·소모":"필요"):"불필요"],["직접 선행",d.dependencies.length],["후속 연구",d.requiredBy.length],["생성 아이템",spawned.length],["아이템 연결",d.itemReferences.length],["제조 연결",d.manufactureReferences.length]])}
  ${researchEditorialMarkup(d)}
  ${researchInsightMarkup(d)}
  <section class="section"><h3>직접 선행</h3>${d.dependencies?.length?d.dependencies.map(x=>entity(typeof x==="string"?x:x.id,"research")).join(""):'<div class="empty">없음</div>'}</section>
  <section class="section"><h3>후속 연구</h3>${d.requiredBy?.length?d.requiredBy.map(x=>entity(typeof x==="string"?x:x.id,"research")).join(""):'<div class="empty">없음</div>'}</section>
  ${spawned.length?`<section class="section"><h3>완료 시 생성 아이템</h3>${spawned.map(x=>entity(x,"items")).join("")}</section>`:""}
  <section class="section"><h3>명시 해금</h3>${d.unlocks?.length?d.unlocks.map(x=>entity(typeof x==="string"?x:x.id,"research")).join(""):'<div class="empty">없음</div>'}</section>
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
    :[["해석",d=>insightRoleLabels[d.insight?.primaryRole]||d.insight?.primaryRole||"—"],["연구량",d=>d.cost],["점수",d=>d.points],["실물 표본",d=>d.needItem?(d.destroyItem?"소모":"필요"):"불필요"],["명목 선행 연구량",d=>d.insight?.prerequisite?.prerequisiteCost??0],["직접 선행",d=>d.dependencies.length],["후속",d=>d.requiredBy.length],["생성 아이템",d=>Array.isArray(d.raw?.spawnedItem)?d.raw.spawnedItem.length:(typeof d.raw?.spawnedItem==="string"?1:0)],["아이템 연결",d=>d.itemReferences.length],["제조 연결",d=>d.manufactureReferences.length]];
  $("#compareBody").innerHTML=`<table class="compare-table"><tr><th>항목</th>${ds.map(d=>`<th>${esc(d.koName)}<span class="sub">${esc(d.enName)}</span></th>`).join("")}</tr>${fields.map(([k,f])=>`<tr><td>${esc(k)}</td>${ds.map(d=>`<td>${esc(fmt(f(d)))}</td>`).join("")}</tr>`).join("")}</table>`;
  $("#compareDialog").showModal();
}
function route(){const m=location.hash.match(/^#(item|research)=(.+)$/);if(!m)return;state.mode=m[1]==="item"?"items":"research";$$(".tab").forEach(x=>x.classList.toggle("active",x.dataset.mode===state.mode));renderControls();render();openDetail(state.mode,decodeURIComponent(m[2]))}
init();
