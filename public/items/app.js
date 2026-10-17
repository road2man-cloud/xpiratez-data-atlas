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
const state={mode:pageMode,query:"",page:1,pageSize:100,dir:1,sort:{items:"koName",research:"koName"},filter:{items:{kind:"",research:"",manufacture:""},research:{sample:"",items:"",outputs:"",effect:"",branch:""}},selected:{items:[],research:[]},cache:{items:new Map(),research:new Map()},listLayout:"game",insightCache:new Map(),editorialCache:new Map(),itemEditorialCache:new Map(),itemUsageCache:new Map(),detail:null};
let itemIndex=[],researchIndex=[],schema={},manifest={},entityNames={},itemMap=new Map(),researchMap=new Map(),researchBranchReport=null,branchConflictMap=new Map(),researchCycleMap=new Map();
let itemIds=new Set(),researchIds=new Set(),namesPromise=null,searchTimer=null,detailGeneration=0;
const modePromises={},searchHay=new WeakMap();

async function json(url){const r=await fetch(url);if(!r.ok)throw new Error(url+" · HTTP "+r.status);return r.json()}
async function compactJson(url){
  if(typeof DecompressionStream!=="undefined"){
    try{
      const response=await fetch(url+".gz");
      if(response.ok)return await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).json();
    }catch{ /* Restore canonical JSON when a compressed response is malformed. */ }
  }
  return json(url);
}
async function ensureMode(mode){
  if(modePromises[mode])return modePromises[mode];
  modePromises[mode]=(async()=>{
    if(mode==="items"){
      const [items,usage]=await Promise.all([compactJson(`${dataBase}/items-index.json`),compactJson(`${dataBase}/item-usage-index.json`)]);
      const counts=new Map((usage.index||[]).map(x=>[x.id,x]));
      itemIndex=items.index.map(x=>({...x,...(counts.get(x.id)||{}),originalManufactureReferences:x.manufactureCount}));
      itemMap=new Map(itemIndex.map(x=>[x.id,x]));
    }else{
      const [research,insight,branchReport]=await Promise.all([
        compactJson(`${dataBase}/research-index.json`),
        compactJson(`${dataBase}/research-insight-index.json`),
        json("../data/research-branch-conflicts.json")
      ]);
      if(branchReport?.schemaVersion!==3||branchReport?.meta?.total!==research.index.length||
        branchReport?.meta?.cycleTopics!==new Set((branchReport.cycles||[]).flatMap(g=>g.memberIds)).size)
        throw new Error("복수 선행/순환 연구 감사 데이터 버전 불일치");
      researchBranchReport=branchReport;
      branchConflictMap=new Map(branchReport.affected.map(row=>[row.id,row]));
      researchCycleMap=new Map(branchReport.cycles.flatMap(group=>group.memberIds.map(id=>[id,group])));
      const insightIndex=new Map((insight.index||[]).map(x=>[x.id,x]));
      researchIndex=research.index.map(x=>({...x,...(insightIndex.get(x.id)||{}),
        branchConflictCount:branchConflictMap.get(x.id)?.conflicts.length||0,
        branchNestedCount:branchConflictMap.get(x.id)?.unlockSourceConflicts.length||0,
        branchSelfDisableCount:branchConflictMap.get(x.id)?.selfDisablingUnlockSources.length||0,
        cycleGroupSize:researchCycleMap.get(x.id)?.memberIds.length||0
      }));
      researchMap=new Map(researchIndex.map(x=>[x.id,x]));
    }
  })().catch(err=>{delete modePromises[mode];throw err});
  return modePromises[mode];
}
function ensureNames(){
  return namesPromise??=(compactJson(`${dataBase}/entities.json`).then(data=>{entityNames=data.names||{}}).catch(err=>{namesPromise=null;throw err}));
}
async function init(){
  try{
    const [s,m,ids]=await Promise.all([json(`${dataBase}/schema.json`),json(`${dataBase}/manifest.json`),compactJson(`${dataBase}/catalog-ids.json`),ensureMode(pageMode)]);
    schema=s;manifest=m;itemIds=new Set(ids.items);researchIds=new Set(ids.research);
    if($("#itemCount"))$("#itemCount").textContent="("+fmt(itemIds.size)+")";
    if($("#researchCount"))$("#researchCount").textContent="("+fmt(researchIds.size)+")";
    $("#metaLine").textContent=pageMode==="items"?
      `${m.mod?.name||"X-Piratez"} ${m.mod?.version||""} · 아이템 ${fmt(itemIds.size)} · OXCE ${m.mod?.requiredExtendedVersion||"?"}`:
      `${m.mod?.name||"X-Piratez"} ${m.mod?.version||""} · 연구 ${fmt(researchIds.size)} · OXCE ${m.mod?.requiredExtendedVersion||"?"}`;
    bind();renderControls();render();void route();
  }catch(e){
    $("#statusText").innerHTML=`<span class="error">데이터가 아직 배포되지 않았습니다: ${esc(e.message)}</span>`;
  }
}
function bind(){
  $$(".tab").forEach(b=>b.onclick=()=>{state.mode=b.dataset.mode;state.page=1;$$(".tab").forEach(x=>x.classList.toggle("active",x===b));renderControls();render()});
  $("#search").oninput=e=>{state.query=e.target.value;state.page=1;if(searchTimer!==null)clearTimeout(searchTimer);if(!state.query.trim())render();else searchTimer=setTimeout(()=>{searchTimer=null;render()},100)};
  $("#sort").onchange=e=>{state.sort[state.mode]=e.target.value;state.page=1;render()};
  $("#direction").onclick=()=>{state.dir*=-1;$("#direction").textContent=state.dir===1?"↑":"↓";render()};
  const listLayoutToggle=$("#listLayoutToggle");
  if(listLayoutToggle)listLayoutToggle.onclick=()=>{
    state.listLayout=state.listLayout==="game"?"analysis":"game";
    listLayoutToggle.textContent=state.listLayout==="game"?"분석표 보기":"게임식 목록 보기";
    document.body.classList.toggle("research-game-list",state.listLayout==="game");
    render();
  };
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
  items:[["koName","이름"],["kind","종류"],["weight","무게"],["size","창고 점유"],["power","위력"],["costBuy","구매가"],["costSell","판매가"],["monthlySalary","월 급여/수익"],["monthlyMaintenance","월 유지비"],["materialUses","실제 제조 소모"],["manufactureSources","제조 산출"],["accuracyAimed","조준 명중"],["researchCount","연구 연결"],["manufactureTotalRecipes","전체 제조 연결"],["referenceCount","전체 역참조"]],
  research:[["koName","이름"],["cost","연구량"],["points","완료 점수"],["dependencyCount","직접 선행"],["branchConflictCount","충돌 선행 관계"],["branchNestedCount","대체 해금자 재검토"],["branchSelfDisableCount","자기 배제 해금자"],["cycleGroupSize","명목 순환 그룹 크기"],["requiredByCount","후속 연구"],["spawnedItemCount","생성 아이템"],["itemReferenceCount","아이템 연결"],["manufactureReferenceCount","제조 연결"],["otherReferenceCount","기타 연결"]]
};
function renderControls(){
  const mode=state.mode;
  const base=sortOptions[mode].map(([v,l])=>`<option value="${v}">${l}</option>`).join("");
  const extra=mode==="items"?(schema.sortableItemFields||[]).filter(x=>!sortOptions.items.some(([v])=>v===x.key)).map(x=>`<option value="raw:${esc(x.key)}">원본 · ${esc(x.label)} [${esc(x.key)}]</option>`).join(""):"";
  $("#sort").innerHTML=base+extra;$("#sort").value=state.sort[mode];
  $("#filters").innerHTML=mode==="items"
    ?`<label><span>종류</span><select data-filter="kind"><option value="">전체</option>${Object.entries(kinds).map(([v,l])=>`<option value="${v}">${l}</option>`).join("")}</select></label><label><span>연구</span><select data-filter="research"><option value="">전체</option><option value="yes">연결 있음</option><option value="no">없음</option></select></label><label><span>제조</span><select data-filter="manufacture"><option value="">전체</option><option value="yes">연결 있음</option><option value="no">없음</option></select></label>`
    :`<label><span>실물 표본</span><select data-filter="sample"><option value="">전체</option><option value="yes">필요</option><option value="destroy">소모</option><option value="no">불필요</option></select></label><label><span>생성 아이템</span><select data-filter="outputs"><option value="">전체</option><option value="yes">있음</option><option value="no">없음</option></select></label><label><span>효과 유형</span><select data-filter="effect"><option value="">전체</option>${Object.entries(insightRoleLabels).map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select></label><label><span>아이템 연결</span><select data-filter="items"><option value="">전체</option><option value="yes">있음</option><option value="no">없음</option></select></label><label><span>선행 분기</span><select data-filter="branch"><option value="">전체</option><option value="alternative">충돌 선행 · 대체 해금 (${researchBranchReport?.meta.affected||0})</option><option value="nested">해금 출처도 선행 충돌 (${researchBranchReport?.meta.nestedConflictTargets||0})</option><option value="self-source">해금 출처가 자신을 배제 (${researchBranchReport?.meta.selfDisablingSourceTargets||0})</option><option value="cycle">명목 선행 순환 (${researchBranchReport?.meta.cycleTopics||0})</option></select></label>`;
  for(const [k,v] of Object.entries(state.filter[mode])){const e=$(`[data-filter="${k}"]`);if(e)e.value=v}
}
function filtered(){
  const mode=state.mode,src=mode==="items"?itemIndex:researchIndex,q=state.query.trim().toLocaleLowerCase("ko"),f=state.filter[mode];
  const out=src.filter(x=>{
    if(q){
      let hay=searchHay.get(x);
      if(!hay){hay=[x.koName,x.enName,x.id,...(x.categories||[]),...(x.categoryIds||[]),...(x.insightTerms||[]),...(x.insightNames||[]),...(x.insightKinds||[]).map(k=>insightRoleLabels[k]||k)].filter(Boolean).join(" ").toLocaleLowerCase("ko");searchHay.set(x,hay)}
      if(!hay.includes(q))return false;
    }
    if(mode==="items"){
      if(f.kind&&x.kind!==f.kind)return false;
      if(f.research==="yes"&&!x.researchCount)return false;if(f.research==="no"&&x.researchCount)return false;
      if(f.manufacture==="yes"&&!x.manufactureTotalRecipes)return false;if(f.manufacture==="no"&&x.manufactureTotalRecipes)return false;
    }else{
      if(f.sample==="yes"&&!x.needItem)return false;if(f.sample==="destroy"&&!x.destroyItem)return false;if(f.sample==="no"&&x.needItem)return false;
      if(f.outputs==="yes"&&!x.spawnedItemCount)return false;if(f.outputs==="no"&&x.spawnedItemCount)return false;
      if(f.items==="yes"&&!x.itemReferenceCount)return false;if(f.items==="no"&&x.itemReferenceCount)return false;
      if(f.effect&&!arr(x.insightKinds).includes(f.effect))return false;
      if(f.branch==="alternative"&&!branchConflictMap.has(x.id))return false;
      if(f.branch==="nested"&&!branchConflictMap.get(x.id)?.unlockSourceConflicts.length)return false;
      if(f.branch==="self-source"&&!branchConflictMap.get(x.id)?.selfDisablingUnlockSources.length)return false;
      if(f.branch==="cycle"&&!researchCycleMap.has(x.id))return false;
    }
    return true;
  });
  const key=state.sort[mode],get=x=>{if(!key.startsWith("raw:"))return x[key];const k=key.slice(4),meta=(schema.sortableItemFields||[]).find(y=>y.key===k);return meta?.storage==="topLevel"?x[k]:x.sortable?.[k]},d=state.dir;
  out.sort((a,b)=>{const av=get(a),bv=get(b);if(av==null&&bv==null)return a.koName.localeCompare(b.koName,"ko");if(av==null)return 1;if(bv==null)return-1;if(typeof av==="number"&&typeof bv==="number")return(av-bv)*d;return String(av).localeCompare(String(bv),"ko",{numeric:true})*d});
  return out;
}
function researchMarkers(x){
  const roles=new Set(arr(x.insightKinds));
  const defs=[
    ["mission","임무",roles.has("mission"),"미션 룰에 직접 연결됨 · 실제 임무 발생은 추가 조건을 따름"],
    ["manufacture","제조",roles.has("manufacture"),"제조법의 연구 조건을 충족 · 재료/시설 별도 필요"],
    ["purchase","구매",roles.has("purchase"),"아이템 구매 선행조건 · 상점/기타 조건은 별도"],
    ["followup","후속연구",x.requiredByCount>0||roles.has("research-unlock")||roles.has("research-grant"),"후속 연구의 조건 또는 명시 해금 · 즉시 연구 가능 보장 아님"]
  ];
  return `<span class="research-markers" aria-label="${esc(defs.map(([,name,on])=>name+(on?" 관련 있음":" 연결 없음")).join(", "))}">${defs.map(([key,label,on,note])=>`<span class="research-marker ${on?"active marker-"+key:""}" title="${esc(label+" · "+note)}" aria-hidden="true"></span>`).join("")}</span>`;
}
function render(){
  const rows=filtered(),pages=Math.max(1,Math.ceil(rows.length/state.pageSize));state.page=Math.min(state.page,pages);
  const page=rows.slice((state.page-1)*state.pageSize,state.page*state.pageSize),sel=state.selected[state.mode];
  $("#statusText").textContent=`${fmt(rows.length)}개 결과 · ${state.page}/${pages} 페이지`;
  if(state.mode==="items"){
    $("#thead").innerHTML="<tr><th>비교</th><th>아이템</th><th>ID</th><th>종류</th><th>위력</th><th>무게</th><th>창고</th><th>판매가</th><th>월 유지비</th><th>연구</th><th>제조 소비</th><th>제조 생산</th></tr>";
    $("#tbody").innerHTML=page.map(x=>`<tr data-id="${esc(x.id)}"><td><input class="check" data-select="${esc(x.id)}" type="checkbox" ${sel.includes(x.id)?"checked":""}></td><td><span class="name">${esc(x.koName)}</span><span class="sub">${esc(x.enName)}</span></td><td class="id">${esc(x.id)}</td><td>${esc(kinds[x.kind]||x.kind)}</td><td>${fmt(x.power)}</td><td>${fmt(x.weight)}</td><td>${fmt(x.size)}</td><td>${fmt(x.costSell)}</td><td>${fmt(x.monthlyMaintenance)}</td><td>${fmt(x.researchCount)}</td><td>${fmt(x.materialUses)}</td><td>${fmt(x.manufactureSources)}</td></tr>`).join("");
  }else if(state.listLayout==="game"){
    $("#thead").innerHTML='<tr><th>비교</th><th>해금 표시</th><th>주제</th><th>연구량</th><th>필요 물품</th><th>다음의 요구함</th><th>아래의 항목</th></tr>';
    $("#tbody").innerHTML=page.map(x=>`<tr data-id="${esc(x.id)}"><td><input class="check" data-select="${esc(x.id)}" type="checkbox" ${sel.includes(x.id)?"checked":""} aria-label="${esc(x.koName)} 비교"></td>
      <td>${researchMarkers(x)}</td><td><span class="name">${esc(x.koName)}</span><span class="sub">${esc(x.enName)}</span>${x.requiredByCount>=5?'<span class="badge insight-kind">후속 허브</span>':""}${branchConflictMap.has(x.id)?'<span class="badge branch-alt">선행 충돌</span>':""}${x.cycleGroupSize?'<span class="badge branch-cycle">선행 순환</span>':""}</td>
      <td class="game-numeric">${fmt(x.cost)}</td><td>${x.needItem?'<span class="game-needed">'+(x.destroyItem?"소모":"비소모")+"</span>":"—"}</td>
      <td class="game-numeric">${fmt(x.requiredByCount)}개</td><td class="game-numeric">${fmt(x.itemReferenceCount)}개 <span class="sub">아이템 연결</span></td></tr>`).join("");
  }else{
    $("#thead").innerHTML="<tr><th>비교</th><th>연구</th><th>해석</th><th>ID</th><th>연구량</th><th>점수</th><th>직접 선행</th><th>후속</th><th>생성</th><th>아이템</th><th>제조</th><th>표본</th></tr>";
    $("#tbody").innerHTML=page.map(x=>`<tr data-id="${esc(x.id)}"><td><input class="check" data-select="${esc(x.id)}" type="checkbox" ${sel.includes(x.id)?"checked":""}></td><td><span class="name">${esc(x.koName)}</span><span class="sub">${esc(x.enName)}</span></td><td><span class="badge insight-kind">${esc((x.requiredByCount>=5?"후속 허브 · ":"")+(insightRoleLabels[x.primaryInsightKind]||x.primaryInsightKind||"—"))}</span>${branchConflictMap.has(x.id)?'<span class="badge branch-alt">선행 충돌 · 대체 해금</span>':""}${x.branchNestedCount?'<span class="badge branch-nested">해금 출처 재검토</span>':""}${x.branchSelfDisableCount?'<span class="badge branch-nested">자가 배제 해금 출처</span>':""}${x.cycleGroupSize?'<span class="badge branch-cycle">명목 선행 순환</span>':""}</td><td class="id">${esc(x.id)}</td><td>${fmt(x.cost)}</td><td>${fmt(x.points)}</td><td>${fmt(x.dependencyCount)}</td><td>${fmt(x.requiredByCount)}</td><td>${fmt(x.spawnedItemCount)}</td><td>${fmt(x.itemReferenceCount)}</td><td>${fmt(x.manufactureReferenceCount)}</td><td>${x.needItem?`<span class="badge ${x.destroyItem?"warn":""}">${x.destroyItem?"소모":"필요"}</span>`:"—"}</td></tr>`).join("");
  }
  const nums=[1,state.page-2,state.page-1,state.page,state.page+1,state.page+2,pages].filter(x=>x>=1&&x<=pages),uniq=[...new Set(nums)].sort((a,b)=>a-b);
  $("#pager").innerHTML=uniq.map(n=>`<button data-page="${n}" class="${n===state.page?"current":""}">${n}</button>`).join("");
  updateCompare();
}
async function detail(mode,id){
  await Promise.all([ensureMode(mode),ensureNames()]);
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
  if(!state.itemUsageCache.has(row.bucket))state.itemUsageCache.set(row.bucket,(await json(`${dataBase}/item-usage-chunks/${row.bucket}.json`)).details);
  return {...d,editorial:state.itemEditorialCache.get(row.bucket)[id]||null,usage:state.itemUsageCache.get(row.bucket)[id]||null};
}
function entity(id,preferredKind=""){const preferred=preferredKind==="items"&&itemIds.has(id)?"items":preferredKind==="research"&&researchIds.has(id)?"research":"";const kind=preferred||(itemIds.has(id)?"items":researchIds.has(id)?"research":"");const x=kind==="items"?itemMap.get(id):researchMap.get(id),n=entityNames[id];return kind?`<button class="chip" data-kind="${kind}" data-open="${esc(id)}">${esc(x?.koName||n?.[0]||id)}<span class="sub">${esc(x?.enName||n?.[1]||"")}</span></button>`:n?`<span class="badge">${esc(n[0])}<span class="sub">${esc(n[1])} · ${esc(id)}</span></span>`:`<span class="badge">${esc(id)}</span>`}
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
  const generation=++detailGeneration;
  try{
    const d=await detail(mode,id);
    if(generation!==detailGeneration)return;
    state.detail={mode,id};
    $("#detail").innerHTML=mode==="items"?renderItem(d):renderResearch(d);bindResourceDetails();
    $("#drawer").classList.add("open");$("#drawer").setAttribute("aria-hidden","false");$("#backdrop").hidden=false;
    history.replaceState(null,"","#"+(mode==="items"?"item=":"research=")+encodeURIComponent(id));
  }catch(e){if(generation!==detailGeneration)return;$("#detail").innerHTML=`<p class="error">${esc(e.message)}</p>`;$("#drawer").classList.add("open");$("#backdrop").hidden=false}
}
function itemEditorialMarkup(d){
  const e=d.editorial;if(!e)return"";
  const row=(label,text,kind="")=>text?`<div class="editorial-row ${kind}"><span>${esc(label)}</span><p>${esc(text)}</p></div>`:"";
  return`<section class="section editorial-panel item-editorial">
    <div class="insight-heading"><h3>GPT 아이템 인사이트</h3><span class="evidence-tag gpt">GPT 편집 · 룰셋 기반 자동 합성</span></div>
    ${row("정체",e.overview,"core")}
    ${row("실제 효과",e.effect,"effect")}
    ${row("실물 사용처",e.uses,"route")}
    ${row("경제 효과",e.economics,"decision")}
    ${row("획득/해금",e.acquisition,"action")}
    ${row("진행 연결",e.progression,"route")}
    ${row("판단",e.decision,"decision")}
    ${row("주의",e.watch,"watch")}
  </section>`;
}
function itemUsageMarkup(d){
  const u=d.usage;if(!u)return"";
  const link=(id,kind,label)=>`<a class="chip" href="../${kind}/#${kind==="manufacture"?"recipe":kind==="events"?"event":"research"}=${encodeURIComponent(id)}">${esc(label||entityNames[id]?.[0]||id)}<span class="sub">${esc(id)}</span></a>`;
  const counts=[["실물 소비 제조식",u.consumes.length],["제조 산출처",new Set(u.produces.map(x=>x.id)).size],["이벤트 지급처",new Set(u.eventGrants.map(x=>x.id)).size],["훈련/변신 재료",u.transformations.length]];
  const section=(label,xs,render,expanded=false)=>xs.length?`<details ${expanded?"open":""}><summary>${esc(label)} · ${fmt(xs.length)}건</summary><div class="usage-list">${xs.map(render).join("")}</div></details>`:"";
  const qty=n=>`<strong>×${esc(fmt(n))}</strong>`;
  const consumed=section("제조에서 실물 재료로 소모",u.consumes,x=>{
    const fixed=(x.output?.fixed||[]).map(o=>`${entityNames[o.id]?.[0]||o.id} ×${fmt(o.qty)}`);
    const other=(x.output?.other||[]).map(o=>`${entityNames[o.id]?.[0]||o.id} (${o.kind==="person"?"병사":"기체"})`);
    const result=[...fixed,...other].join(" · ")||"확정 아이템 없음";
    const random=(x.output?.randomSample||[]).map(y=>`${entityNames[y.id]?.[0]||y.id} ×${fmt(y.qty)}`).join(" · ");
    return`<div class="usage-entry">${link(x.id,"manufacture",x.koName)} ${qty(x.qty)} <span class="badge">${esc(x.role)}</span><div class="usage-note">확정 산출 요약(최대 5종): ${esc(result)}${x.output?.randomOptions?` · 랜덤 산출 ${fmt(x.output.randomOptions)}개 후보(예: ${esc(random)})`:""}</div>${x.baseFuncs?.length?`<div class="usage-note">필요 기지 기능: ${esc(x.baseFuncs.join(" · "))}</div>`:""}</div>`;
  },u.consumes.length>0);
  const produced=section("제조로 획득",u.produces,x=>`<div class="usage-entry">${link(x.id,"manufacture",x.koName)} ${qty(x.qty)} <span class="badge">${x.kind==="fixed"?"확정 산출":"랜덤 후보"}</span>${x.kind==="random"&&x.relativeShare!=null?`<div class="usage-note">해당 제조식 랜덤표 내부 비중: ${(x.relativeShare*100).toFixed(2)}% (조건부 비중)</div>`:""}</div>`);
  const grants=section("이벤트에서 지급",u.eventGrants,x=>`<div class="usage-entry">${link(x.id,"events",x.koName)} ${qty(x.qty)} <span class="badge">${x.kind==="fixed"?"확정 지급":x.kind==="random-list"?"랜덤 단일 후보":"랜덤 묶음 후보"}</span>${x.kind==="random-list"&&x.relativeShare!=null?`<div class="usage-note">해당 이벤트 내부 목록 상대 비중 ${(x.relativeShare*100).toFixed(2)}% · 이벤트 발생률과 별개</div>`:""}</div>`);
  const eventResearch=section("이벤트가 같은 ID의 연구 플래그 지급 (실물 아님)",u.eventResearchGrants||[],x=>`<div class="usage-entry">${link(x.id,"events")} <span class="usage-note">연구 플래그 지급 · 아이템 수량 증가 아님</span></div>`);
  const conditions=section("이벤트에서 아이템 보유 조건",u.eventConditions,x=>`<div class="usage-entry">${link(x.id,"events",x.koName)} <span class="badge">${x.required===true?"보유 요구":x.required===false?"미보유 요구":"조건 "+esc(String(x.required))}</span><div class="usage-note">eventScript: ${esc(x.scriptId)}</div></div>`);
  const transforms=section("병사 훈련·변신의 실물 재료",u.transformations,x=>`<div class="usage-entry"><b>${esc(entityNames[x.id]?.[0]||x.id)}</b> ${qty(x.qty)}${x.cost?`<div class="usage-note">실행비 ${fmt(x.cost)}</div>`:""}${x.baseFuncs?.length?`<div class="usage-note">기지 기능 ${esc(x.baseFuncs.join(" · "))}</div>`:""}</div>`);
  const unlocks=section("연구 선행 조건 (아이템 실물 소모 아님)",u.researchUnlocks,x=>`<div class="usage-entry">${link(x.id,"research",x.koName)} <span class="usage-note">완료 연구 플래그 필요 · 아이템 수량 차감 아님</span></div>`);
  const manufactureGates=section("제조 해금 조건 (실물 소모 아님)",u.manufactureResearchGates,x=>`<div class="usage-entry">${link(x.id,"manufacture",x.koName)} <span class="usage-note">requires 연구/해금 플래그 · 실물 소모는 위에서 별도 집계</span></div>`);
  const sample=u.specimenResearch?.needItem?`<p class="usage-note">동명 연구 ${link(u.specimenResearch.id,"research")}: 실물 표본 필요 · ${u.specimenResearch.destroyItem?"연구 시 소모":"연구 시 비소모"}.</p>`:"";
  const panels=[consumed,produced,transforms,grants,eventResearch,conditions,unlocks,manufactureGates].filter(Boolean).join("");
  return`<section class="section usage-panel"><div class="insight-heading"><h3>실제 사용처·획득처 전수 분석</h3><span class="evidence-tag derived">룰셋 집계 · 직접 재료/보상/조건 구분</span></div>
    ${kpis(counts)}${sample}${panels||'<p class="empty">정형 제조·이벤트·훈련/변신·연구 사용처는 없음. 맵·스크립트·기타 역참조는 아래에서 확인하세요.</p>'}
    <p class="muted">×수량은 1회 기준. 랜덤표 내부 비중은 전체 미션/이벤트 발생 확률이 아닙니다.</p>
  </section>`;
}
function renderItem(d){
  const c=d.effectiveCore||{},codes=d.effectiveCoreSourceCodes||"",legend=schema.coreSourceLegend||{},s=d.effectiveCoreSources||Object.fromEntries((schema.effectiveCoreFields||[]).map((k,i)=>[k,legend[codes[i]]||""])),r=d.raw||{},refs=allItemReferences(d);
  const power=r.power!=null?c.power:r.meleePower!=null?c.meleePower:"—",powerSrc=r.power!=null?s.power:s.meleePower;
  return`<h2>${esc(d.koName)}</h2><div class="id">${esc(d.enName)} · ${esc(d.id)}</div><div class="summary">${esc(d.summaryKo)}</div>
  ${kpis([["종류",kinds[d.kind]||d.kind,s.battleType],["위력",power,powerSrc],["피해형",d.damageTypeKo],["무게",c.weight,s.weight],["창고 점유",c.size,s.size],["구매가",r.costBuy??"—",r.costBuy!=null?s.costBuy:""],["판매가",r.costSell??"—",r.costSell!=null?s.costSell:""],["월 급여/수익",c.monthlySalary,s.monthlySalary],["월 유지비",c.monthlyMaintenance,s.monthlyMaintenance],["아이템 내구",c.armor,s.armor],["한손 보정",c.oneHandedPenalty==null?"—":c.oneHandedPenalty+"%",s.oneHandedPenalty],["무릎쏴",c.kneelBonus==null?"—":c.kneelBonus+"%",s.kneelBonus]])}
  ${itemEditorialMarkup(d)}
  ${itemUsageMarkup(d)}
  <section class="section"><h3>공격 행동</h3>${d.fireModes?.length?`<table><tr><th>행동</th><th>명중</th><th>TU</th><th>발수</th></tr>${d.fireModes.map(x=>`<tr><td>${esc(x.name||x.label)}</td><td>${fmt(x.accuracy)}%</td><td>${fmt(x.tu)}</td><td>${fmt(x.shots)}</td></tr>`).join("")}</table>`:'<div class="empty">직접 공격 행동 없음</div>'}</section>
  <section class="section"><h3>호환 탄약</h3>${d.compatibleAmmo?.length?d.compatibleAmmo.map(x=>entity(x,"items")).join(""):'<div class="empty">없음/해당 없음</div>'}</section>
  <section class="section"><h3>이 탄약을 쓰는 무기</h3>${d.usedByWeapons?.length?d.usedByWeapons.map(x=>entity(x,"items")).join(""):'<div class="empty">없음/해당 없음</div>'}</section>
  <section class="section"><h3>연구 연결</h3>${relations(d.research,"research")}</section><section class="section"><h3>기존 문자열형 제조 역참조 · 위 실물 사용처 전수집계를 우선</h3>${relations(d.manufacture,"manufacture")}</section>
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
  const names=(ids,max=5)=>{const all=arr(ids);return all.slice(0,max).map(id=>entityNames[id]?.[0]||id).join("·")+(all.length>max?" 외 "+(all.length-max)+"개":"");};
  const deps=arr(d.dependencies),after=arr(d.requiredBy),explicit=arr(d.unlocks);
  const ordinaryGate=deps.length?"일반 경로: "+names(deps,5)+" 모두 충족(AND). "+
    "명시 unlocks 출처가 있으면 dependencies는 우회 가능하나 requires는 우회하지 못합니다.":"";
  const ordinaryAfter=after.length?"후속 "+after.length+"개의 일반 선행 중 하나: "+names(after,3)+
    ". 충분조건이 아니며 나머지 선행·requires가 필요합니다. 후속에 별도 unlocks가 있다면 필수 경로도 아닐 수 있습니다.":"";
  const ordinaryUnlocks=explicit.length?"명시적 unlocks: "+names(explicit,3)+
    ". 대상의 dependencies를 우회하지만 requires·기지·실물 조건은 별도입니다.":"";
  // Decision first; the same generic causal disclaimer is generated from
  // canonical data at display time rather than copied to thousands of records.
  return`<section class="section editorial-panel">
    <div class="insight-heading"><h3>GPT 플레이 인사이트</h3><span class="evidence-tag gpt">필요·충분조건 / 실질 보상 / 순이익</span></div>
    ${row("한눈에 보는 결론",e.verdict||e.core,"core")}
    ${row("해금 조건 · AND / OR",e.unlockLogic||ordinaryGate,"route")}
    ${row("현금화 손익 · 표본 비용 포함",e.economics,"decision")}
    ${row("후속 연구 · 필요조건과 충분조건",e.downstreamLogic||ordinaryAfter||ordinaryUnlocks,"effect")}
    ${row("놓치면 손해",e.criticalCaution,"watch")}
    <details class="editorial-extra">
      <summary>실행 방법·추가 맥락·전체 분석 펼치기</summary>
      ${row("실행 방법",e.action,"action")}
      ${row("직접 효과",e.effect,"effect")}
      ${row("캠페인 내 위치",e.context,"context")}
      ${row("우선순위 판단",e.decision,"decision")}
      ${row("명목 선행량 / 별도 지급 경로",e.route,"route")}
      ${row("기타 주의",e.watch,"watch")}
    </details>
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
    ${i.semanticReferences?.length?`<div class="insight-subsection"><h4>연결 시스템·이벤트 (지급·필수·미보유 조건 구분)</h4>${i.semanticReferences.map(semanticRefMarkup).join("")}</div>`:""}
    ${i.disables?.length?`<div class="insight-subsection"><h4>상호배타/비활성화</h4><div class="chip-cloud">${idList(i.disables,"research")}</div></div>`:""}
    ${pd.topicIds?.length?`<details class="route-details"><summary>명목 선행망 ${pd.topicPreviewTruncated?`가까운 ${fmt(pd.topicIds.length)}개 / 전체 ${fmt(p.topicCount)}개`:`${fmt(p.topicCount)}개`} · 전체 연구량 ${fmt(p.prerequisiteCost)}</summary><div class="chip-cloud">${idList(pd.topicIds,"research")}</div>${pd.sampleTopics?.length?`<p class="muted">실물 표본 선행: ${pd.sampleTopicCount>pd.sampleTopics.length?`주요 ${fmt(pd.sampleTopics.length)}개 / 전체 ${fmt(pd.sampleTopicCount)}개 · `:""}${idList(pd.sampleTopics,"research")}</p>`:""}${pd.branchTopics?.length?`<p class="muted">분기/배타 선행: ${pd.branchTopicCount>pd.branchTopics.length?`주요 ${fmt(pd.branchTopics.length)}개 / 전체 ${fmt(pd.branchTopicCount)}개 · `:""}${idList(pd.branchTopics,"research")}</p>`:""}</details>`:""}
    ${pd.eventLinks?.length?`<details><summary>가까운 선행의 이벤트 획득/연결 ${fmt(pd.eventLinks.length)}개</summary><div>${pd.eventLinks.map(x=>`<div class="semantic-ref"><div><span class="badge insight-kind">${esc(insightRoleLabels[x.kind]||x.kind)}</span> ${entity(x.researchId,"research")} ← ${entity(x.eventId)}</div>${x.eventRequires?.length?`<div class="semantic-extra">이벤트 자체 선행 연구: ${idList(x.eventRequires,"research")}</div>`:""}${x.requiresBaseFunc?.length?`<div class="semantic-extra">이벤트 기지 기능: ${idList(x.requiresBaseFunc)}</div>`:""}${x.scripts?.length?x.scripts.map(scriptGateMarkup).join(""):""}<div class="paths">${arr(x.paths).map(humanPath).map(esc).join(" · ")}</div></div>`).join("")}</div></details>`:""}
  </section>`;
}
function researchCycleMarkup(d){
  const group=researchCycleMap.get(d.id);
  if(!group)return "";
  const counts=group.externalSourceCounts||{},examples=group.externalSourceExamples||{};
  const linkedSource=(kind,title,verb)=>{
    const rows=examples[kind]||[],total=counts[kind]||0;
    if(!total)return "";
    return '<div class="insight-subsection"><h4>'+esc(title)+' '+fmt(total)+'개 (외부 출처, 후보)</h4>'+
      '<div class="chip-cloud">'+rows.map(x=>
        '<span class="unlock-source-entry">'+entity(x.source,"research")+
        ' <b>'+esc(verb)+'</b> '+entity(x.target,"research")+'</span>').join("")+
      '</div>'+(total>rows.length?'<p class="muted">대표 '+fmt(rows.length)+'개만 표시 · 원본에는 총 '+fmt(total)+'개 연결</p>':"")+
      '</div>';
  };
  const eventRows=examples.events||[];
  const eventHtml=counts.events?
    '<div class="insight-subsection"><h4>순환 그룹의 직접 연구 플래그 지급 이벤트 '+fmt(counts.events)+'곳 (발생 보장 아님)</h4>'+
    '<div class="chip-cloud">'+eventRows.map(x=>
      '<span class="unlock-source-entry">'+entity(x.eventId)+
      ' <b>→ 지급 후보 →</b> '+entity(x.target,"research")+'</span>').join("")+
    '</div>'+(counts.events>eventRows.length?'<p class="muted">이벤트 예시 '+fmt(eventRows.length)+'곳만 표시</p>':"")+'</div>':"";
  return '<section class="section branch-gate-panel"><h3>명목 선행 순환 감사 '+
    '<span class="badge branch-cycle">순환 그룹 '+fmt(group.memberIds.length)+'개 연구</span></h3>'+
    '<p>이 연구의 원본 dependencies/requires에 <b>순환 고리</b>가 있습니다. 모든 명목 선행을 순서대로 완료하라고 해석하면 막힌 것처럼 보이지만, 실제 게임에서는 이벤트 지급·완료된 연구의 unlocks·무료 획득 등이 고리의 진입점이 될 수 있습니다. <b>순환은 연구 불가능 판정이 아닙니다.</b></p>'+
    '<div class="requirement-line"><b>실제 순환 근거 (왼쪽 연구가 오른쪽 연구를 직접 선행으로 요구):</b> '+
    (group.witness||[]).map(id=>entity(id,"research")).join(" → ")+'</div>'+
    linkedSource("unlocks","외부 연구의 명시적 unlocks","→ unlocks →")+
    linkedSource("free","getOneFree 무료 지급 추첨 출처","→ 추첨 후보 →")+
    linkedSource("protected","조건부 무료 연구 지급 출처","→ 조건부 지급 →")+
    eventHtml+
    '<details><summary>이 순환에 속하는 연구 전체 '+fmt(group.memberIds.length)+'개</summary>'+
      '<div class="chip-cloud">'+idList(group.memberIds,"research")+'</div></details>'+
    '<p class="muted">표시된 것은 정적 진입 경로입니다. 이벤트 스크립트·추첨 확률·표본·시설·선장 분기·현재 완료/영구 배제 상태를 대조하기 전에는 획득 가능을 확정하지 않습니다. 순환이 속한 그룹에 외부 진입점이 있어도 모든 구성원이 자동으로 열리는 것은 아닙니다.</p></section>';
}
function researchBranchConflictMarkup(d){
  const r=branchConflictMap.get(d.id);
  if(!r)return "";
  const pairKeys=new Set();
  const conflicts=r.conflicts.filter(pair=>{
    const key=[pair.from,pair.to].sort().join("|");
    if(pairKeys.has(key))return false;
    pairKeys.add(key);return true;
  });
  const action= r.requires.length
    ?"다음 requires "+r.requires.length+"개는 대체 해금 이후에도 전부 완료되어야 합니다."
    :"별도 requires는 없습니다.";
  return `<section class="section branch-gate-panel">
    <h3>복수 선행 · 상호배제 감사 <span class="badge branch-alt">대체 해금 경로 있음</span></h3>
    <p>원본 dependencies에 서로 disables하는 선행 연구가 들어 있습니다. 이는 단순히 모든 선행 연구를 동시에 완료하라는 뜻이 아닙니다. OXCE는 <b>완료된 연구의 unlocks가 이 연구를 가리키면 dependencies 전체를 우회</b>합니다. 하지만 requires와 이 연구 자체의 영구 배제는 우회하지 못합니다.</p>
    <div class="requirement-line"><b>엔진 판정:</b> 연구 자체가 영구 배제되지 않아야 하며,
      (dependencies 전체 완료 <b>또는</b> 아래 unlocks 출처 중 하나가 현재 완료 상태), 그리고 requires 전체 완료.
      실제 연구 실행에는 표본·시설·진행 시기 등도 필요할 수 있습니다.</div>
    <div class="insight-subsection"><h4>명시적 unlocks 출처 ${fmt(r.unlockSources.length)}개 · 경로 존재와 획득 가능 여부는 별개</h4>
      <div class="chip-cloud">${r.unlockSources.map(id=>{
        const nested=r.unlockSourceConflicts.find(x=>x.source===id);
        return `<span class="unlock-source-entry">${entity(id,"research")}${nested?`<span class="badge branch-nested">출처 자체도 명목 선행 충돌 ${fmt(nested.pairCount)}쌍 · 추가 우회 확인</span>`:""}</span>`;
      }).join("")}</div></div>
    ${r.unlockSourceConflicts.length?`<div class="callout important"><b>대체 해금 출처에도 분기 충돌이 있습니다 (${fmt(r.unlockSourceConflicts.length)}개).</b> 해당 출처의 선행 연구를 전부 만족한다고 가정하지 마세요. 각 출처를 열어 다시 unlocks·이벤트 경로를 확인해야 합니다. 목록에 있다는 이유만으로 최종 목표를 가능으로 확정하지 않습니다.</div>`:""}
    ${r.selfLocks.length?`<div class="callout important"><b>명목 선행 충돌:</b> 다음 선행 연구를 완료하면 이 연구 자체가 직접 disables됩니다. 그러나 별도 unlocks 출처가 있는 경우 그 경로는 구별해서 판정해야 합니다.
      ${idList(r.selfLocks.map(x=>x.from),"research")}</div>`:""}
    ${r.selfDisablingUnlockSources?.length?`<div class="callout important"><b>자기 배제하는 해금 출처 ${fmt(r.selfDisablingUnlockSources.length)}개는 지속 가능한 unlocks 우회로가 아닙니다.</b> OXCE는 연구 완료 뒤 해당 출처가 자신을 disables하면 완료 목록에서 제거합니다. 아래 연구를 끝냈다는 이력만으로 그 출처의 unlocks가 계속 적용된다고 판단해서는 안 됩니다.
      <div class="chip-cloud">${idList(r.selfDisablingUnlockSources,"research")}</div></div>`:""}
    ${r.unsafeUnlockSources.length?`<div class="callout important"><b>함정:</b> 다음 unlocks 출처는 이 연구 자체를 disables하므로 안전한 우회로로 계산하지 않습니다.
      ${idList(r.unsafeUnlockSources,"research")}</div>`:""}
    ${r.requires.length?`<div class="insight-subsection"><h4>unlocks로 우회할 수 없는 requires ${fmt(r.requires.length)}개</h4>
      <div class="chip-cloud">${idList(r.requires,"research")}</div></div>`:""}
    <details><summary>동시 유지할 수 없는 명목 선행 쌍 ${fmt(conflicts.length)}개 · 원본 근거</summary>
      <div><p class="muted">${esc(action)} 아래 A → B는 A 연구가 B를 직접 disables한다는 뜻이며, 양방향 차단은 별개의 규칙입니다.</p>
      ${conflicts.map(pair=>`<div class="semantic-ref">${entity(pair.from,"research")} <b>→ disables →</b> ${entity(pair.to,"research")}</div>`).join("")}
      </div></details>
    <p class="muted">실제 가능 여부는 분기 DB에서 세이브를 불러와 직접 배제 상태와 현재 완료된 해금 출처를 확인하세요. 단지 명목 선행 충돌만으로 영구 불가능 처리하지 않습니다.</p>
    <a class="chip" href="../captains/#choiceSimulator">분기 시뮬레이터에서 내 세이브 확인 →</a>
  </section>`;
}
function renderResearch(d){
  const trainingIds=[...new Set((d.otherReferences||[]).filter(x=>x.section==="soldierTransformation").map(x=>x.owner||x.id).filter(Boolean))];
  const spawned=Array.isArray(d.raw?.spawnedItem)?d.raw.spawnedItem:(typeof d.raw?.spawnedItem==="string"?[d.raw.spawnedItem]:[]);
  const gameEntities=(xs,kind="research")=>xs?.length?xs.map(x=>entity(typeof x==="string"?x:x.id,kind)).join(" "):'<span class="empty">없음</span>';
  const free=Array.isArray(d.getOneFree)?d.getOneFree:[];
  const grantedBy=arr(d.insight?.semanticReferences).filter(x=>x.kind==="research-granted-by").map(x=>x.id);
  const sampleId=d.insight?.researchRequirements?.sampleItem||null;
  const sampleLabel=d.needItem?(sampleId?entity(sampleId,"items"):'<span class="empty">실물 표본 필요 · 아이템 ID 별도 확인</span>'):'<span class="empty">없음</span>';
  const gamePanel=`<div class="game-dossier"><div class="game-dossier-title">기술개발도 열람</div><div class="game-dossier-top"><b>주제: ${esc(d.koName)}</b><span>연구량: ${fmt(d.cost)}</span></div><div class="game-dossier-columns"><div>
  <h3>필요 물품:</h3><div>${sampleLabel} ${d.needItem?(d.destroyItem?"· 소모":"· 비소모"):""}</div>
  <h3>다음에서 공짜로 얻음:</h3><div>${gameEntities(grantedBy)}</div>
  <h3>완료 시 무료 연구 지급:</h3><div>${gameEntities(free)}</div>
  <h3>선행 연구:</h3><div>${gameEntities(d.dependencies)}</div>
  </div><div><h3>다음의 요구함:</h3><div>${gameEntities(d.requiredBy)}</div>
  <h3>다음의 해금:</h3><div>${gameEntities(d.unlocks)}</div>
  <h3>아래의 항목:</h3><div>${relations(d.itemReferences)}</div>
  <h3>완료 시 생성된 물품:</h3><div>${gameEntities(spawned,"items")}</div>
  <h3>제조 연결:</h3><div>${relations(d.manufactureReferences)}</div>
  </div></div><div class="game-dossier-foot">${esc(d.enName)} · ${esc(d.id)} · 완료 점수 ${fmt(d.points)}</div></div>`;
  return`${gamePanel}<details class="game-more"><summary>상세 분석 · 연구 경로 · 경제성 · 원본 근거 보기</summary><h2>${esc(d.koName)}</h2><div class="id">${esc(d.enName)} · ${esc(d.id)}</div><div class="summary">${esc(d.summaryKo)}</div>
  ${kpis([["연구량",d.cost],["완료 점수",d.points],["연구 표본",d.needItem?(d.destroyItem?"필요·소모":"필요·비소모"):"불필요"]])}
  ${researchBranchConflictMarkup(d)}
  ${researchCycleMarkup(d)}
  ${researchEditorialMarkup(d)}
  <details class="research-raw-explainer"><summary>원본 룰에서 계산한 선행망·연결 시스템 더 보기</summary>${researchInsightMarkup(d)}</details>
  ${trainingIds.length?`<section class="section"><h3>연결되는 병사 훈련·변신</h3>${trainingIds.map(id=>`<a class="entity" href="../trainings/?training=${encodeURIComponent(id)}">훈련 조합기에서 ${esc(id)} 확인 →</a>`).join(" ")}</section>`:""}
  <details class="research-raw-explainer"><summary>선행·후속 전체 목록 / 연구·제조 역참조</summary><section class="section"><h3>명목 직접 선행 (dependencies + requires)</h3><p class="muted">이 목록은 요구조건의 정적 합집합입니다. dependencies는 별도 unlocks로 우회할 수 있지만 requires는 우회하지 못합니다. 선행 연구가 서로 배타적인 경우 위의 감사 판정을 우선하세요.</p>${d.dependencies?.length?d.dependencies.map(x=>entity(typeof x==="string"?x:x.id,"research")).join(""):'<div class="empty">없음</div>'}</section>
  <section class="section"><h3>후속 연구</h3>${d.requiredBy?.length?d.requiredBy.map(x=>entity(typeof x==="string"?x:x.id,"research")).join(""):'<div class="empty">없음</div>'}</section>
  ${spawned.length?`<section class="section"><h3>완료 시 생성 아이템</h3>${spawned.map(x=>entity(x,"items")).join("")}</section>`:""}
  <section class="section"><h3>명시 해금</h3>${d.unlocks?.length?d.unlocks.map(x=>entity(typeof x==="string"?x:x.id,"research")).join(""):'<div class="empty">없음</div>'}</section>
  <section class="section"><h3>아이템 역참조</h3>${relations(d.itemReferences)}</section><section class="section"><h3>제조 역참조</h3>${relations(d.manufactureReferences)}</section>
  <details><summary>기타 역참조 ${d.otherReferences?.length||0}개</summary><div>${relations(d.otherReferences)}</div></details>
  <details><summary>원본 연구 핵심 룰</summary><div>${rawTable(d.raw,schema.researchFieldMeta)}</div></details>
  ${resourceDetailsMarkup("research",d)}
  </details>
  <section class="section"><h3>출처</h3><p class="muted">${arr(d.sourceFiles).map(esc).join(" → ")}</p></section></details>`;
}
function closeDrawer(){detailGeneration++;state.detail=null;$("#drawer").classList.remove("open");$("#drawer").setAttribute("aria-hidden","true");$("#backdrop").hidden=true;history.replaceState(null,"",location.pathname+location.search)}
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
async function route(){const m=location.hash.match(/^#(item|research)=(.+)$/);if(!m)return;const mode=m[1]==="item"?"items":"research";try{await ensureMode(mode);state.mode=mode;$$(".tab").forEach(x=>x.classList.toggle("active",x.dataset.mode===mode));renderControls();render();await openDetail(mode,decodeURIComponent(m[2]))}catch(e){$("#statusText").textContent="상세 검색 실패: "+e.message}}
init();
