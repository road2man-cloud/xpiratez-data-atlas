const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=v=>v==null||Number.isNaN(Number(v))?"—":Number(v).toLocaleString("ko-KR",{maximumFractionDigits:2});
const pct=v=>v==null?"—":(Number(v)*100).toFixed(Number(v)*100<10?2:1)+"%";
const dataBase="../data";
let db={index:[],counts:{}},rows=[],support=null,detailCache=new Map(),editorialCache=new Map();
const state={q:"",ground:"",hunter:"",eventLinked:"",sort:"koName",dir:1,page:1,pageSize:100};

async function jsonGz(url){const r=await fetch(url);if(!r.ok)throw new Error(url+" "+r.status);if(typeof DecompressionStream==="undefined")throw new Error("이 브라우저는 gzip 데이터 스트림 해제를 지원하지 않습니다.");const stream=r.body.pipeThrough(new DecompressionStream("gzip"));return new Response(stream).json()}
function stat(label,value,note=""){return '<div class="stat"><span>'+esc(label)+'</span><b>'+esc(fmt(value))+'</b>'+(note?'<span>'+esc(note)+'</span>':'')+'</div>'}
function kpis(xs){return '<div class="kpis">'+xs.map(x=>'<div class="kpi"><span>'+esc(x[0])+'</span><b class="'+esc(x[2]||'')+'">'+esc(x[1])+'</b></div>').join('')+'</div>'}
function namedChip(x,href=""){const body='<b>'+esc(x?.koName||x?.id||"—")+'</b><span class="sub">'+esc(x?.enName||"")+' · '+esc(x?.id||"")+'</span>';return href?'<a class="chip" href="'+href+'">'+body+'</a>':'<span class="chip">'+body+'</span>'}
function eventLink(x){return namedChip({id:x.eventId,koName:x.eventKoName,enName:x.eventEnName},'../events/#event='+encodeURIComponent(x.eventId))}
function itemLink(x){return namedChip(x,'../items/#item='+encodeURIComponent(x.id))}

function initFilters(){
  $("#search").addEventListener("input",e=>{state.q=e.target.value.trim().toLowerCase();state.page=1;render()});
  for(const id of ["ground","hunter","eventLinked"])$("#"+id).addEventListener("change",e=>{state[id]=e.target.value;state.page=1;render()});
  $("#pageSize").addEventListener("change",e=>{state.pageSize=Number(e.target.value);state.page=1;render()});
  $("#prev").onclick=()=>{if(state.page>1){state.page--;render()}};
  $("#next").onclick=()=>{state.page++;render()};
  $("#closeDrawer").onclick=closeDrawer;$("#backdrop").onclick=closeDrawer;
  addEventListener("hashchange",route);
}
function renderSummary(){
  const c=db.counts||{};
  $("#summary").innerHTML=[stat("적 작전",c.missions),stat("총 wave",c.waves),stat("UFO",c.ufos),stat("종족",c.races),stat("적 유닛",c.units),stat("전술 배치",c.deployments),stat("지상 waypoint 작전",c.groundMissions),stat("Hunter-killer",c.hunterMissions),stat("이벤트 직접연결",c.eventLinkedMissions)].join("");
}
function filtered(){return db.index.filter(x=>{
  if(state.q&&!x.searchText.includes(state.q))return false;
  if(state.ground==="yes"&&!x.hasGround)return false;if(state.ground==="no"&&x.hasGround)return false;
  if(state.hunter==="yes"&&!x.hasHunter)return false;if(state.hunter==="no"&&x.hasHunter)return false;
  if(state.eventLinked==="yes"&&!x.eventLinkCount)return false;if(state.eventLinked==="no"&&x.eventLinkCount)return false;
  return true;
})}
function cmp(a,b,key){const av=a[key],bv=b[key];if(av==null&&bv==null)return 0;if(av==null)return 1;if(bv==null)return-1;if(typeof av==="number"&&typeof bv==="number")return av-bv;return String(av).localeCompare(String(bv),"ko",{numeric:true})}
const cols=[["koName","작전 / 부대"],["scriptCount","missionScript"],["waveTypeCount","wave종"],["waveCount","wave수"],["raceCount","종족후보"],["deploymentCount","배치후보"],["maxSpeed","최대속도"],["hasGround","지상"],["hasHunter","Hunter"],["eventLinkCount","이벤트"]];
function render(){
  rows=filtered().sort((a,b)=>state.dir*cmp(a,b,state.sort));
  const pages=Math.max(1,Math.ceil(rows.length/state.pageSize));state.page=Math.min(state.page,pages);
  const start=(state.page-1)*state.pageSize,pageRows=rows.slice(start,start+state.pageSize);
  $("#rowCount").textContent=rows.length.toLocaleString("ko-KR")+"개";$("#pageInfo").textContent=state.page+" / "+pages;
  $("#prev").disabled=state.page<=1;$("#next").disabled=state.page>=pages;
  $("#forceTable thead").innerHTML="<tr>"+cols.map(x=>'<th data-sort="'+x[0]+'">'+esc(x[1])+(state.sort===x[0]?(state.dir>0?" ▲":" ▼"):"")+"</th>").join("")+"</tr>";
  $("#forceTable tbody").innerHTML=pageRows.map(x=>'<tr data-id="'+esc(x.id)+'"><td><span class="name">'+esc(x.koName)+'</span><span class="sub">'+esc(x.enName)+' · '+esc(x.id)+'</span></td><td>'+fmt(x.scriptCount)+'</td><td>'+fmt(x.waveTypeCount)+'</td><td>'+fmt(x.waveCount)+'</td><td>'+fmt(x.raceCount)+'</td><td>'+fmt(x.deploymentCount)+'</td><td>'+fmt(x.maxSpeed)+'</td><td>'+(x.hasGround?'<span class="positive">있음</span>':'—')+'</td><td>'+(x.hasHunter?'<span class="warning">있음</span>':'—')+'</td><td>'+(x.eventLinkCount?'<span class="positive">'+fmt(x.eventLinkCount)+'</span>':'—')+'</td></tr>').join("");
  document.querySelectorAll("th[data-sort]").forEach(th=>th.onclick=()=>{const k=th.dataset.sort;if(state.sort===k)state.dir*=-1;else{state.sort=k;state.dir=1}render()});
  document.querySelectorAll("#forceTable tbody tr").forEach(tr=>tr.onclick=()=>{location.hash="force="+encodeURIComponent(tr.dataset.id)});
}
function editorialMarkup(e){
  if(!e)return"";
  const row=(l,t)=>'<div class="editorial-row"><span>'+esc(l)+'</span><p>'+esc(t)+'</p></div>';
  return '<section class="section editorial"><div class="insight-head"><h3>GPT 적부대 인사이트</h3><span class="evidence">GPT 편집 · 룰셋 기반 자동 합성</span></div>'+row("정체",e.overview)+row("생성 원인",e.spawn)+row("이동",e.movement)+row("교전 편성",e.encounter)+row("위협",e.threat)+row("대응",e.action)+row("주의",e.caution)+'</section>';
}
function conditionMarkup(c){
  const labels={firstMonth:"첫 월",lastMonth:"마지막 월",executionOdds:"executionOdds",startDelay:"startDelay",randomDelay:"randomDelay",minDifficulty:"최소 난이도",maxDifficulty:"최대 난이도",minScore:"최소 점수",maxScore:"최대 점수",targetBaseOdds:"기지 표적 Odds",maxRuns:"최대 실행"};
  const es=Object.entries(c||{});return es.length?'<div class="condition-cloud">'+es.map(x=>'<span class="condition"><b>'+esc(labels[x[0]]||x[0])+'</b> '+esc(fmt(x[1]))+((x[0]==="executionOdds"||x[0]==="targetBaseOdds")?"%":"")+'</span>').join("")+'</div>':'<div class="empty">스칼라 조건 없음</div>';
}
function triggersMarkup(t){
  const labels={researchTriggers:"연구",itemTriggers:"아이템",facilityTriggers:"시설",xcomBaseInRegionTriggers:"기지 지역",xcomBaseInCountryTriggers:"기지 국가"};
  const es=Object.entries(t||{});if(!es.length)return'<div class="empty">직접 trigger map 없음</div>';
  return es.map(kv=>'<div class="trigger-group"><b>'+esc(labels[kv[0]]||kv[0])+'</b><div>'+kv[1].map(x=>'<span class="trigger-chip '+(x.value===true?"required":x.value===false?"forbidden":"")+'"><b>'+esc(x.koName||x.id)+'</b><span>'+esc(String(x.value))+'</span><small>'+esc(x.id)+'</small></span>').join("")+'</div></div>').join("");
}
function upstreamMarkup(s){
  const pos=s.upstreamEvents?.positive||[],neg=s.upstreamEvents?.negative||[];
  if(!pos.length&&!neg.length)return"";
  const one=(x,cls,label)=>'<div class="causal '+cls+'"><b>'+esc(label)+'</b> '+eventLink(x)+'<div class="sub">이 이벤트가 지급하는 '+esc(x.triggerKoName||x.triggerId)+' ('+esc(x.triggerId)+')가 '+esc(s.id)+'의 '+esc(x.triggerKind)+' '+(cls==="block"?"false":"true")+' gate와 연결됩니다.</div></div>';
  return pos.map(x=>one(x,"","이벤트 → 부대 활성화 경로")).join("")+neg.map(x=>one(x,"block","이벤트 → 부대 차단 경로")).join("");
}
function scriptsMarkup(d){
  if(!d.scripts?.length)return'<section class="section"><h3>생성 원인 / missionScripts</h3><div class="unknown-note">이 alienMission을 직접 선택하는 missionScript가 정적 룰에서 확인되지 않습니다. 다른 미션/기지 방어/동적 호출 경로일 수 있습니다.</div></section>';
  return '<section class="section"><div class="insight-head"><h3>생성 원인 / missionScripts</h3><span class="evidence direct">원본 직접값 + 상대 가중치 파생</span></div>'+d.scripts.map(s=>'<article class="script-force"><div class="script-head"><div><b>'+esc(s.id)+'</b><span class="sub">missionWeights bucket '+esc(s.bucket)+'</span></div><span class="mission-weight">weight '+fmt(s.weight)+'/'+fmt(s.totalWeight)+' · 상대 '+pct(s.relativeShare)+'</span></div>'+conditionMarkup(s.conditions)+triggersMarkup(s.triggers)+upstreamMarkup(s)+(s.raceWeightsOverride?.length?'<details><summary>missionScript raceWeights override</summary>'+raceWeightTables(s.raceWeightsOverride)+'</details>':'')+'</article>').join("")+'<p class="muted">missionWeights share는 같은 bucket 안 후보들 사이의 상대 비율입니다. executionOdds·지역/표적 선택·다른 실행 조건까지 합친 최종 절대 발생확률은 아닙니다.</p></section>';
}
function raceWeightTables(groups){
  if(!groups?.length)return'<div class="empty">raceWeights 없음</div>';
  return groups.map(g=>'<div class="race-card"><b>버킷 '+esc(g.bucket)+' · 총 weight '+fmt(g.totalWeight)+'</b><table class="race-weight-table"><thead><tr><th>종족</th><th class="num">weight</th><th class="num">조건부 share</th></tr></thead><tbody>'+g.options.map(x=>'<tr><td>'+namedChip({id:x.id,koName:support?.races?.[x.id]?.koName||x.id,enName:support?.races?.[x.id]?.enName||""})+'</td><td class="num">'+fmt(x.weight)+'</td><td class="num relative">'+pct(x.relativeShare)+'</td></tr>').join("")+'</tbody></table></div>').join("");
}
function trajectoryMarkup(t,effectiveSpeedMax){
  if(!t)return'<div class="unknown-note">trajectory 규칙 미확인</div>';
  return '<div><p class="sub">trajectory '+esc(t.id)+' · groundTimer '+fmt(t.groundTimer)+(t.hasGround?' · 지상/착륙 구간 포함':'')+'</p><table class="trajectory"><thead><tr><th>#</th><th>상태/고도</th><th>zone</th><th>speed%</th><th>기본 속도</th><th>race 적용 속도</th></tr></thead><tbody>'+t.waypoints.map(p=>'<tr class="'+(p.isGround?"ground-row":"")+'"><td>'+p.index+'</td><td>'+esc(p.altitudeKo)+'</td><td>'+fmt(p.zone)+'</td><td>'+fmt(p.speedPct)+'%</td><td>'+(p.isGround?"착륙":fmt(p.baseEffectiveSpeed))+'</td><td>'+(p.isGround?"착륙":fmt(effectiveSpeedMax*p.speedPct/100))+'</td></tr>').join("")+'</tbody></table>'+(t.hasGround?'<div class="direct-note">altitude 0은 “지상 이동 속도”가 아니라 착륙 상태입니다. groundTimer는 착륙 체류 시간 필드입니다.</div>':'')+'</div>';
}
function statsMarkup(stats){
  const order=["tu","stamina","health","bravery","reactions","firing","throwing","strength","psiStrength","psiSkill","melee","mana"];
  const es=order.filter(k=>stats?.[k]!=null).map(k=>[k,stats[k]]);
  return '<div class="unit-stats">'+es.map(x=>'<span>'+esc(x[0])+'<b>'+fmt(x[1])+'</b></span>').join("")+'</div>';
}
function armorMarkup(a){
  if(!a)return"";
  return '<div class="armor-line"><b>'+esc(a.koName||a.id)+'</b> · 전/좌/우/후/하 '+fmt(a.front)+'/'+fmt(a.left)+'/'+fmt(a.right)+'/'+fmt(a.rear)+'/'+fmt(a.under)+' · AP '+fmt(a.ap)+' · HE '+fmt(a.he)+' · Laser '+fmt(a.laser)+' · Plasma '+fmt(a.plasma)+' · Melee '+fmt(a.meleeResist)+'</div>';
}
function unitCard(c){
  const u=support?.units?.[c.id]||{id:c.id,koName:c.koName,enName:c.enName,missing:true};
  return '<div class="unit-card"><div class="unit-head"><div><h5>'+esc(u.koName||u.id)+'</h5><span class="sub">'+esc(u.enName||"")+' · '+esc(u.id)+'</span></div><span class="pill">후보 '+pct(c.probability)+'</span></div>'+(u.missing?'<div class="unknown-note">unit 룰 미확인</div>':statsMarkup(u.stats)+armorMarkup(u.armor)+(u.builtInWeapons?.length?'<div><b class="sub">내장무장</b>'+u.builtInWeapons.map(itemLink).join("")+'</div>':'')+'<div class="sub">AI intelligence '+fmt(u.intelligence)+' · aggression '+fmt(u.aggression)+' · capturable '+esc(String(u.capturable??"—"))+'</div>')+'</div>';
}
function loadoutMarkup(row){
  if(!row.itemSets?.length)return'<div class="empty">itemSets 없음</div>';
  return '<details><summary>장비 레벨별 itemSets '+fmt(row.itemSets.length)+'개</summary><p class="muted">이 레벨은 장비 테크 레벨입니다. 세트 0~4 사이를 같은 확률로 랜덤 선택한다는 뜻이 아닙니다.</p>'+row.itemSets.map(s=>'<div class="loadout-set"><b>장비 레벨 '+fmt(s.level)+'</b>'+(s.items?.length?s.items.map(itemLink).join(""):'<span class="empty">빈 세트</span>')+'</div>').join("")+'</details>';
}
function deploymentMarkup(depId,raceId){
  const dep=support?.deployments?.[depId],race=support?.races?.[raceId];
  if(!dep)return'<div class="unknown-note">deployment '+esc(depId||"미확인")+' 규칙을 직접 해석할 수 없습니다.</div>';
  return '<div class="deployment-card"><div class="race-head"><div><b>'+esc(dep.koName||dep.id)+'</b><span class="sub">'+esc(dep.id)+' · race '+esc(race?.koName||raceId)+'</span></div><span class="evidence direct">alienDeployment</span></div>'+dep.data.map(row=>{
    const candidates=row.customUnitType?[{id:row.customUnitType,koName:support?.units?.[row.customUnitType]?.koName||row.customUnitType,enName:support?.units?.[row.customUnitType]?.enName||"",probability:1,weight:1}]:(race?.ranks?.find(x=>x.rank===row.alienRank)?.candidates||[]);
    return '<div class="rank-card"><b>alienRank '+fmt(row.alienRank)+'</b><div class="sub">수량 직접값: low '+fmt(row.lowQty)+' · med '+fmt(row.medQty)+' · high '+fmt(row.highQty)+' · dQty '+fmt(row.dQty)+' · extra '+fmt(row.extraQty)+' · outside '+fmt(row.percentageOutsideUfo)+'%</div><div class="candidate-grid">'+(candidates.length?candidates.map(unitCard).join(""):'<div class="unknown-note">이 race/rank의 유닛 후보를 정적 룰에서 찾지 못했습니다.</div>')+'</div>'+loadoutMarkup(row)+'</div>';
  }).join("")+'</div>';
}
function wavesMarkup(d){
  if(!d.waves?.length)return'<section class="section"><h3>Wave / 이동</h3><div class="empty">wave 없음</div></section>';
  return '<section class="section"><div class="insight-head"><h3>Wave / Geoscape 이동 / 교전배치</h3><span class="evidence direct">UFO + trajectory + raceBonus</span></div>'+d.waves.map(w=>'<article class="wave-card"><div class="wave-head"><div><b>Wave '+w.index+': '+esc(w.koName)+'</b><span class="sub">'+esc(w.ufoId)+' · count '+fmt(w.count)+' · trajectory '+esc(w.trajectoryId)+'</span></div><div><span class="pill">max '+fmt(w.ufo.speedMax)+'</span>'+(w.hunterKillerPercentage?'<span class="pill warning">hunter '+fmt(w.hunterKillerPercentage)+'%</span>':'')+'</div></div>'+kpis([["HP/내구",fmt(w.ufo.damageMax)],["최대속도",fmt(w.ufo.speedMax)],["가속",fmt(w.ufo.accel)],["화력",fmt(w.ufo.power)],["사거리",fmt(w.ufo.range)],["reload",fmt(w.ufo.reload)],["score",fmt(w.ufo.score)],["groundTimer",fmt(w.trajectory?.groundTimer)]])+(Object.keys(w.raceEffects||{}).length?Object.values(w.raceEffects).map(re=>'<details class="race-card"><summary>'+esc(re.koName)+' · 조건부 max '+fmt(re.effectiveSpeedMax)+' · deployment '+esc(re.deploymentId||"미확인")+'</summary><div class="sub">기본 '+fmt(re.speedMaxBase)+' + raceBonus.speedMax '+fmt(re.speedMaxRaceBonus)+' = '+fmt(re.effectiveSpeedMax)+' · 배치 근거 '+esc(re.deploymentSource)+'</div>'+trajectoryMarkup(w.trajectory,re.effectiveSpeedMax)+deploymentMarkup(re.deploymentId,re.raceId)+'</details>').join(""):trajectoryMarkup(w.trajectory,w.ufo.speedMax)+'<div class="unknown-note">이 작전에서 종족이 정적으로 확정되지 않아 race별 deployment/유닛 편성은 표시하지 않습니다.</div>')+'</article>').join("")+'</section>';
}
function siteMarkup(d){
  if(!d.siteDeploymentId)return"";
  const ids=[...new Set((d.raceWeights||[]).flatMap(g=>(g.options||[]).map(x=>x.id)).filter(Boolean))];
  const fallback=support?.deployments?.[d.siteDeploymentId]?.race;if(!ids.length&&fallback)ids.push(fallback);
  const body=ids.length?ids.map(raceId=>'<details class="race-card"><summary>'+esc(support?.races?.[raceId]?.koName||raceId)+' · '+esc(raceId)+'</summary>'+deploymentMarkup(d.siteDeploymentId,raceId)+'</details>').join(""):deploymentMarkup(d.siteDeploymentId,"");
  return '<section class="section"><h3>고정 mission site 배치</h3><p class="muted">siteType deployment는 선택된 race의 alienRank 슬롯에 매핑됩니다. 종족 후보가 여러 개면 각각의 실제 unit 후보를 따로 표시합니다.</p>'+body+'</section>';
}
function rawMarkup(d){return '<details><summary>원본 alienMission 룰</summary><pre>'+esc(JSON.stringify(d.raw,null,2))+'</pre></details>'}

async function openDetail(id){
  const row=db.index.find(x=>x.id===id);if(!row)return;
  try{
    if(!support)support=await jsonGz(dataBase+"/enemy-force-support.json.gz");
    if(!detailCache.has(row.bucket))detailCache.set(row.bucket,(await jsonGz(dataBase+"/enemy-force-chunks/"+row.bucket+".json.gz")).details);
    if(!editorialCache.has(row.bucket))editorialCache.set(row.bucket,(await jsonGz(dataBase+"/enemy-force-editorial-chunks/"+row.bucket+".json.gz")).details);
    const d=detailCache.get(row.bucket)[id],e=editorialCache.get(row.bucket)[id],eventCount=new Set((d.scripts||[]).flatMap(s=>(s.upstreamEvents?.positive||[]).map(x=>x.eventId))).size;
    $("#detail").innerHTML='<h2>'+esc(d.koName)+'</h2><div class="id">'+esc(d.enName)+' · '+esc(d.id)+'</div>'+kpis([["missionScripts",fmt(d.scripts.length)],["wave 종류",fmt(d.waves.length)],["wave 수",fmt(d.waves.reduce((s,w)=>s+w.count,0))],["race 버킷",fmt(d.raceWeights.length)],["이벤트 연결",fmt(eventCount)],["siteType",d.siteType||"—"],["objective",fmt(d.objective)],["points",fmt(d.points)]])+editorialMarkup(e)+scriptsMarkup(d)+'<section class="section"><div class="insight-head"><h3>종족 후보 / raceWeights</h3><span class="evidence direct">조건부 상대비율</span></div>'+raceWeightTables(d.raceWeights)+'<p class="muted">버킷 숫자는 진행 시점/표 선택 기준으로 쓰이는 원본 key입니다. 각 표 내부 weight를 정규화한 상대 share만 표시합니다.</p></section>'+wavesMarkup(d)+siteMarkup(d)+'<section class="section"><h3>출처</h3><p class="muted">'+((d.sourceFiles||[]).map(esc).join(" → ")||"—")+'</p></section>'+rawMarkup(d);
    $("#drawer").classList.add("open");$("#drawer").setAttribute("aria-hidden","false");$("#backdrop").hidden=false;
  }catch(err){$("#detail").innerHTML='<p class="negative">'+esc(err.stack||err.message)+'</p>';$("#drawer").classList.add("open");$("#backdrop").hidden=false}
}
function closeDrawer(){history.replaceState(null,"",location.pathname+location.search);$("#drawer").classList.remove("open");$("#drawer").setAttribute("aria-hidden","true");$("#backdrop").hidden=true}
function route(){const m=location.hash.match(/^#force=(.+)$/);if(m)openDetail(decodeURIComponent(m[1]));else closeDrawer()}
async function init(){db=await jsonGz(dataBase+"/enemy-forces-index.json.gz");renderSummary();initFilters();render();route()}
init().catch(e=>{document.body.innerHTML='<main class="wrap"><h1>적부대 DB 로드 실패</h1><pre>'+esc(e.stack||e.message)+'</pre></main>'});
