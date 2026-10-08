let DATA=null,RESEARCH=null,RESEARCH_PROMISE=null;
let sort={key:"weaponType",dir:1};
const CACHE=new Map();
const $=q=>document.querySelector(q);
const esc=s=>String(s??"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m]));
const fmt=n=>n==null||!Number.isFinite(Number(n))?"—":Number(n).toLocaleString("ko-KR",{maximumFractionDigits:1});
const ROLE_LABELS={attack:"공격",tractor:"견인",defense:"방어",sensor:"센서",mobility:"기동",support:"기타 지원"};
function roleHtml(xs){return (xs||[]).map(r=>'<span class="role role-'+esc(r)+'">'+esc(ROLE_LABELS[r]||r)+'</span>').join(" ")||"—"}
function nameOf(x){return esc(x?.koName||x?.enName||x?.id||x||"—")}
function itemTypeLabel(x){const m={weapon:"총기",ammo:"탄약",melee:"근접무기",grenade:"투척/폭발물",medical:"의료",scanner:"스캐너",psi:"사이오닉",item:"아이템"};return m[x?.kind]||x?.kind||"아이템"}
function relationBadge(x){if(!x?.exists)return'<span class="badge">아이템 정의 없음</span>';if(x.tacticalUsable)return'<span class="shared">개인 전술아이템 공용</span>';return'<span class="badge">기체 장착용 아이템</span>'}

async function loadResearchCatalog(){
  if(RESEARCH)return RESEARCH;
  if(!RESEARCH_PROMISE)RESEARCH_PROMISE=fetch("../data/craft-weapon-research.json?v=craft-weapons-20261008").then(async r=>{if(!r.ok)throw new Error("기체무장 연구 사전 HTTP "+r.status);RESEARCH=(await r.json()).researchCatalog||{};return RESEARCH});
  return RESEARCH_PROMISE;
}
async function load(){
  const r=await fetch("../data/craft-weapons-index.json?v=craft-weapons-20261008");
  if(!r.ok)throw new Error("기체무장 데이터 HTTP "+r.status);
  DATA=await r.json();
  const sel=$("#typeFilter");
  for(const [id,m] of Object.entries(DATA.typeMeta||{}).sort((a,b)=>Number(a[0])-Number(b[0]))){
    if(!m.count)continue;const o=document.createElement("option");o.value=id;o.textContent="Type "+id+" · "+m.label+" ("+m.count+")";sel.appendChild(o);
  }
  renderSummary();render();
}
function renderSummary(){
 const c=DATA.counts||{};
 $("#summary").innerHTML=[
  ["전체",fmt(c.craftWeapons)+"종","craftWeapons 프로필"],
  ["공격",fmt(c.attack)+"종","실제 공격 필드 존재"],
  ["지원",fmt(c.support)+"종","공격 외 장비"],
  ["전술무기 공용",fmt(c.sharedTactical)+"종","launcher가 개인 전술아이템"],
  ["launcher 아이템",fmt(c.launcherItems)+"종","실제 items 정의 연결"]
 ].map(x=>'<article class="metric card"><strong>'+x[0]+' '+x[1]+'</strong><span>'+x[2]+'</span></article>').join("");
}
function filtered(){
 const q=$("#search").value.trim().toLowerCase(),type=$("#typeFilter").value,role=$("#roleFilter").value,share=$("#shareFilter").value;
 const xs=(DATA.index||[]).filter(x=>{
  if(q&&!x.searchText.includes(q))return false;
  if(type!==""&&String(x.weaponType)!==type)return false;
  if(role&&!(x.roles||[]).includes(role))return false;
  if(share==="shared"&&!x.sharedTactical)return false;
  if(share==="craftonly"&&x.sharedTactical)return false;
  return true;
 });
 xs.sort((a,b)=>{
  let av=a[sort.key],bv=b[sort.key];
  if(sort.key==="name")return a.koName.localeCompare(b.koName,"ko")*sort.dir;
  if(av==null&&bv==null)return a.koName.localeCompare(b.koName,"ko");
  if(av==null)return 1;if(bv==null)return-1;
  if(typeof av==="string")return av.localeCompare(bv,"ko")*sort.dir;
  return (Number(av)-Number(bv))*sort.dir;
 });
 return xs;
}
function th(label,key){const on=sort.key===key?" sort-on":"";const arrow=sort.key===key?(sort.dir>0?" ▲":" ▼"):"";return'<th data-sort="'+key+'" class="'+on+'">'+label+arrow+'</th>'}
function render(){
 const rows=filtered();$("#rowCount").textContent=rows.length+"개";
 $("#weaponTable thead").innerHTML="<tr>"+[
  th("기체무장","name"),th("Type","weaponType"),"<th>역할</th>",th("위력","damage"),th("사거리","range"),th("명중","accuracy"),th("탄약","ammoMax"),th("표준 재장전","reloadStandard"),th("재보급률","rearmRate"),"<th>launcher</th>","<th>clip</th>",th("개인무기 공용","sharedTactical"),th("호환 기체","compatibleCraftCount"),th("프로필 연구량","profileResearchCost")
 ].join("")+"</tr>";
 $("#weaponTable tbody").innerHTML=rows.map(x=>'<tr data-id="'+esc(x.id)+'" data-bucket="'+esc(x.bucket)+'"><td><span class="name">'+esc(x.koName)+'</span><span class="id">'+esc(x.enName)+' · '+esc(x.id)+'</span></td><td><span class="type-tag">'+fmt(x.weaponType)+' · '+esc(x.typeLabel)+'</span></td><td>'+roleHtml(x.roles)+'</td><td>'+fmt(x.damage)+'</td><td>'+fmt(x.range)+'</td><td>'+fmt(x.accuracy)+'</td><td>'+fmt(x.ammoMax)+'</td><td>'+fmt(x.reloadStandard)+'</td><td>'+fmt(x.rearmRate)+'</td><td>'+esc(x.launcherName||x.launcherId||"—")+'</td><td>'+esc(x.clipName||x.clipId||"—")+'</td><td>'+(x.sharedTactical?'<span class="shared">공용</span>':'—')+'</td><td>'+fmt(x.compatibleCraftCount)+'</td><td>'+fmt(x.profileResearchCost)+'</td></tr>').join("");
 document.querySelectorAll("th[data-sort]").forEach(el=>el.addEventListener("click",()=>{const k=el.dataset.sort;if(sort.key===k)sort.dir*=-1;else sort={key:k,dir:k==="name"?1:-1};render()}));
 document.querySelectorAll("#weaponTable tbody tr").forEach(el=>el.addEventListener("click",()=>openDetail(el.dataset.id,el.dataset.bucket)));
}
async function detail(id,bucket){
 if(CACHE.has(id))return CACHE.get(id);
 const r=await fetch("../data/craft-weapon-chunks/"+bucket+".json?v=craft-weapons-20261008");
 if(!r.ok)throw new Error("상세 데이터 HTTP "+r.status);
 const d=(await r.json()).details?.[id];if(!d)throw new Error("상세 데이터 없음 "+id);CACHE.set(id,d);return d;
}
function itemCard(title,x,recipes,research){
 if(!x)return'<div class="item-card"><b>'+title+'</b><p class="muted">연결 없음</p></div>';
 const shared=x.tacticalUsable?" shared-card":"";
 const ammo=(x.compatibleAmmo||[]).map(nameOf).join(", ")||"—";
 return'<div class="item-card'+shared+'"><b>'+title+' · '+nameOf(x)+'</b><span class="id">'+esc(x.id)+'</span><div>'+relationBadge(x)+'</div><div class="item-meta"><span class="badge">'+esc(itemTypeLabel(x))+'</span><span class="badge">battleType '+fmt(x.battleType)+'</span><span class="badge">무게 '+fmt(x.weight)+'</span><span class="badge">구매 '+fmt(x.costBuy)+'</span><span class="badge">판매 '+fmt(x.costSell)+'</span><span class="badge">전술 위력 '+fmt(x.power??x.meleePower)+'</span></div><p class="muted">호환 탄약: '+ammo+'</p>'+researchBlock("아이템 해금 연구",research)+recipeBlock(recipes)+'</div>';
}
function researchBlock(title,p){
 if(!p?.nodeIds?.length)return'<div class="muted">'+title+': 별도 연구망 없음</div>';
 return'<div class="section-card"><strong>'+title+' · 명목 '+fmt(p.totalCost)+'</strong><div>'+(p.nodeIds||[]).map(id=>'<span class="badge">'+nameOf(RESEARCH?.[id]||id)+'</span>').join(" ")+'</div><p class="muted">표본 연구 '+fmt(p.needItemCount)+' · baseFunc '+esc((p.baseFuncs||[]).join(", ")||"없음")+'</p></div>';
}
function recipeBlock(rs){
 if(!(rs||[]).length)return"";
 return'<div class="section-card"><strong>제조 경로</strong>'+rs.map(r=>'<div><b>'+esc(r.koName)+'</b> · 시간 '+fmt(r.time)+' · 비용 '+fmt(r.cost)+' · baseFunc '+esc((r.requiresBaseFunc||[]).join(", ")||"없음")+'</div>').join("")+'</div>';
}
function craftsBlock(xs){
 if(!(xs||[]).length)return'<p class="muted">현재 기체 슬롯에서 이 weaponType을 허용하는 기체가 없습니다.</p>';
 return'<div class="craft-list">'+xs.map(c=>'<div class="craft"><b>'+esc(c.koName)+'</b><span class="id">'+esc(c.id)+'</span><div>장착 슬롯 '+esc(c.slots.join(", "))+'</div><div class="muted">총 슬롯 '+fmt(c.weapons)+' · 병력 '+fmt(c.soldiers)+' · 속도 '+fmt(c.speedMax)+'</div></div>').join("")+'</div>';
}
async function openDetail(id,bucket){
 const [d]=await Promise.all([detail(id,bucket),loadResearchCatalog()]);
 const sharedNote=d.sharedTactical?'<div class="note"><b>같은 개인무기를 실제로 재사용합니다.</b> 이 기체무장 프로필의 launcher가 전술 아이템 DB에도 존재하고 전투에서 직접 사용할 수 있는 아이템입니다. 기체에 장착할 때도 그 launcher/clip 자원을 사용합니다.</div>':'<div class="note">이 프로필의 launcher는 개인 전술무기로 분류되지 않았습니다. 기체 장비 전용/지원 아이템일 수 있습니다.</div>';
 $("#detailBody").innerHTML='<p class="eyebrow">Craft Weapon</p><h2>'+esc(d.koName)+'</h2><p class="muted">'+esc(d.enName)+' · '+esc(d.id)+'</p>'+
 '<div class="detail-grid"><div class="box"><strong>weaponType</strong>'+fmt(d.weaponType)+' · '+esc(d.typeLabel)+'</div><div class="box"><strong>역할</strong>'+roleHtml(d.roles)+'</div><div class="box"><strong>위력 / 사거리</strong>'+fmt(d.damage)+' / '+fmt(d.range)+'</div><div class="box"><strong>명중 / 탄약</strong>'+fmt(d.accuracy)+' / '+fmt(d.ammoMax)+'</div><div class="box"><strong>재장전 C/S/A</strong>'+fmt(d.reloadCautious)+' / '+fmt(d.reloadStandard)+' / '+fmt(d.reloadAggressive)+'</div><div class="box"><strong>재보급률</strong>'+fmt(d.rearmRate)+'</div><div class="box"><strong>실드 피해 보정</strong>'+fmt(d.shieldDamageModifier)+'</div><div class="box"><strong>탄 절약</strong>'+(d.bulletSaving?"예":"아니오")+'</div><div class="box"><strong>투사체</strong>Type '+fmt(d.projectileType)+' · 속도 '+fmt(d.projectileSpeed)+'</div><div class="box"><strong>견인력</strong>'+fmt(d.tractorBeamPower)+'</div></div>'+
 sharedNote+
 '<h3 class="section-title">launcher / clip 아이템 관계</h3><div class="two-col">'+itemCard("Launcher",d.launcher,d.launcherRecipes,d.launcherResearch)+itemCard("Clip",d.clip,d.clipRecipes,d.clipResearch)+'</div>'+
 '<h3 class="section-title">기체무장 프로필 해금</h3>'+researchBlock("프로필 연구",d.profileResearch)+
 '<h3 class="section-title">장착 가능한 기체 · 슬롯</h3>'+craftsBlock(d.compatibleCrafts)+
 (d.stats?'<h3 class="section-title">지원 스탯</h3><pre class="raw">'+esc(JSON.stringify(d.stats,null,2))+'</pre>':'')+
 '<details><summary>원본 effective craftWeapon 룰 보기</summary><pre class="raw">'+esc(JSON.stringify(d.raw,null,2))+'</pre></details>';
 $("#detailDialog").showModal();
}
["search"].forEach(id=>$("#"+id).addEventListener("input",render));
["typeFilter","roleFilter","shareFilter"].forEach(id=>$("#"+id).addEventListener("change",render));
$("#closeDialog").addEventListener("click",()=>$("#detailDialog").close());
$("#detailDialog").addEventListener("click",e=>{if(e.target.id==="detailDialog")e.currentTarget.close()});
load().catch(err=>{$("#summary").innerHTML='<article class="metric card"><strong>데이터 로드 실패</strong><span>'+esc(err.message)+'</span></article>';console.error(err)});
