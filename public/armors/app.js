let DATA=null,ROUTES=null,ROUTES_PROMISE=null,CURRENT_DETAIL=null;
let sort={key:"frontArmor",dir:-1};
const DETAIL_CACHE={},RAW_CACHE={},MANUFACTURE_BUCKET_CACHE={};

const $=q=>document.querySelector(q);
const fmt=n=>n==null||Number.isNaN(Number(n))?"—":Number(n).toLocaleString("ko-KR",{maximumFractionDigits:2});
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const statLabels={tu:"TU",stamina:"기력",health:"체력",bravery:"용기",reactions:"반응",firing:"사격",throwing:"투척",strength:"근력",psiStrength:"Psi 강도",psiSkill:"Psi 기술",melee:"근접",mana:"Mana"};
const staffCount=(id,fallback=10)=>Math.max(1,Math.min(999,Number($("#"+id)?.value)||fallback));
function formatHours(hours){
  if(hours==null||!Number.isFinite(Number(hours)))return "—";
  const h=Math.max(0,Math.ceil(Number(hours)));
  if(h<24)return h+"시간";
  const d=Math.floor(h/24),r=h%24;
  return r?d+"일 "+r+"시간":d+"일";
}
function researchCalendar(r){
  const scientists=staffCount("scientists",10);
  const nodes=(r?.nodeIds||[]).map(id=>ROUTES?.research?.[id]).filter(Boolean).filter(x=>Number(x.cost)>0);
  const daysFor=pct=>nodes.reduce((sum,x)=>{
    const nominal=Number(x.cost)||0;
    const randomized=nominal>0?Math.max(1,Math.floor(nominal*pct/100)):0;
    return sum+Math.ceil(randomized/scientists);
  },0);
  return{scientists,min:daysFor(50),nominal:daysFor(100),max:daysFor(150),topicCount:nodes.length};
}
function nameWithId(x){
  if(!x)return "—";
  const name=x.koName&&x.koName!==x.id?x.koName:x.enName&&x.enName!==x.id?x.enName:x.id;
  return esc(name)+(x.id&&name!==x.id?' <small class="inline-id">'+esc(x.id)+'</small>':'');
}

async function load(){
  const res=await fetch("../data/armors-index.json");
  DATA=await res.json();
  renderSummary();
  render();
}
function renderSummary(){
  const c=DATA.counts||{};
  $("#summary").innerHTML=[
    ["전체 Armor 룰",fmt(c.armors)+"종","유닛 전용 포함"],
    ["장비 아이템",fmt(c.equipable)+"종","storeItem이 실제 item으로 연결"],
    ["제조 가능",fmt(c.manufacturable)+"종","제조법 역추적"],
    ["구매 가능",fmt(c.buyable)+"종","가격·구매 선행 포함"]
  ].map(x=>'<article class="metric card"><strong>'+x[0]+' '+x[1]+'</strong><span>'+x[2]+'</span></article>').join("");
}
function searchBlob(r){
  return [r.koName,r.enName,r.id,r.storeItemId,...(r.acquisitionKinds||[])].filter(Boolean).join(" ").toLowerCase();
}
function filtered(){
  const q=$("#search").value.trim().toLowerCase(),acq=$("#acquire").value;
  let rows=DATA.index.filter(r=>
    (!q||searchBlob(r).includes(q))&&
    (!$("#equipableOnly").checked||r.hasStoreItem)&&
    (!$("#manufacturableOnly").checked||r.manufactureCount>0)&&
    (!acq||(r.acquisitionKinds||[]).includes(acq))
  );
  rows.sort((a,b)=>{
    if(sort.key==="name")return a.koName.localeCompare(b.koName,"ko")*sort.dir;
    const av=a[sort.key],bv=b[sort.key];
    if(typeof av==="string"||typeof bv==="string")return String(av??"").localeCompare(String(bv??""),"ko")*sort.dir;
    return ((Number(av)||0)-(Number(bv)||0))*sort.dir;
  });
  return rows;
}
function th(label,key,tip=""){
  const on=sort.key===key?" sort-on":"",arrow=sort.key===key?(sort.dir>0?" ▲":" ▼"):"";
  return '<th data-sort="'+key+'" class="'+on+'" title="'+esc(tip)+'">'+label+arrow+'</th>';
}
function resist(v){
  const n=Number(v);
  const cls=n<1?"good":n>1?"bad":"";
  return '<span class="resist '+cls+'">'+fmt(n)+'×</span>';
}
function render(){
  const head=[
    th("방어구","name"),'<th>획득</th>',th("연구량*","mainResearchCost","declared dependencies/requires closure 합계 · scientist-days. ⚠ 표시는 unlocks 우회 후보가 있어 최단 연구량이 아님"),th("제조시간","mainManufactureTime","engineer-hours"),
    th("전","frontArmor"),th("좌","leftArmor"),th("우","rightArmor"),th("후","rearArmor"),th("하","underArmor"),th("무게","weight"),
    th("TU","tu"),th("기력","stamina"),th("체력","health"),th("반응","reactions"),th("사격","firing"),th("근접","melee"),
    th("AP","ap","일반 탄환/Armor Piercing 저항 배율"),th("화염","incendiary"),th("HE","he"),th("레이저","laser"),th("플라즈마","plasma"),th("근접","meleeResist"),th("DT16","dt16")
  ].join("");
  $("#armorTable thead").innerHTML="<tr>"+head+"</tr>";
  const rows=filtered();$("#rowCount").textContent=rows.length+"종";
  $("#armorTable tbody").innerHTML=rows.map(r=>'<tr data-id="'+esc(r.id)+'" data-bucket="'+r.bucket+'">'+
    '<td><span class="name">'+esc(r.koName)+'</span><span class="id">'+esc(r.id)+'</span></td>'+
    '<td>'+(r.acquisitionKinds||[]).map(x=>'<span class="tag">'+esc(x)+'</span>').join(" ")+'</td>'+
    '<td>'+fmt(r.mainResearchCost)+(r.mainResearchHasUnlockBypassCandidates?' <span class="warn" title="unlocks로 dependency를 우회할 수 있는 후보가 있어 이 값은 보수적 합계입니다.">⚠</span>':'')+'</td><td>'+fmt(r.mainManufactureTime)+'</td>'+
    [r.frontArmor,r.leftArmor,r.rightArmor,r.rearArmor,r.underArmor,r.weight,r.tu,r.stamina,r.health,r.reactions,r.firing,r.melee].map(x=>'<td>'+fmt(x)+'</td>').join("")+
    [r.ap,r.incendiary,r.he,r.laser,r.plasma,r.meleeResist,r.dt16].map(x=>'<td>'+resist(x)+'</td>').join("")+
    '</tr>').join("");
  document.querySelectorAll("th[data-sort]").forEach(el=>el.onclick=()=>{
    const key=el.dataset.sort;if(sort.key===key)sort.dir*=-1;else sort={key,dir:key==="name"?1:-1};render();
  });
  document.querySelectorAll("#armorTable tbody tr").forEach(el=>el.onclick=()=>openDetail(el.dataset.id,el.dataset.bucket));
}
async function detail(id,bucket){
  if(DETAIL_CACHE[id])return DETAIL_CACHE[id];
  const res=await fetch("../data/armor-chunks/"+bucket+".json");
  const json=await res.json();
  return DETAIL_CACHE[id]=json.details[id];
}
async function routes(){
  if(ROUTES)return ROUTES;
  ROUTES_PROMISE??=fetch("../data/armor-routes/base.json").then(r=>r.json()).then(x=>ROUTES=x);
  return ROUTES_PROMISE;
}
async function manufactureRoute(ref){
  if(!ref?.id||!ref?.bucket)return null;
  if(!MANUFACTURE_BUCKET_CACHE[ref.bucket]){
    const res=await fetch("../data/armor-routes/manufacture/"+ref.bucket+".json");
    if(!res.ok)throw new Error("제조 경로 청크를 불러오지 못했습니다.");
    MANUFACTURE_BUCKET_CACHE[ref.bucket]=(await res.json()).details||{};
  }
  return MANUFACTURE_BUCKET_CACHE[ref.bucket][ref.id]||null;
}
async function rawDetail(id,bucket){
  if(RAW_CACHE[id])return RAW_CACHE[id];
  const res=await fetch("../data/armor-raw-chunks/"+bucket+".json");
  if(!res.ok)throw new Error("원본 룰 청크를 불러오지 못했습니다.");
  const json=await res.json();
  return RAW_CACHE[id]=json.details[id];
}
function kv(label,value){return '<div class="box"><strong>'+label+'</strong><span>'+value+'</span></div>'}
function chips(obj){
  const entries=Object.entries(obj||{});
  return entries.length?entries.map(([k,v])=>'<span class="tag">'+esc(k)+' × '+fmt(v)+'</span>').join(" "):'<span class="muted">없음</span>';
}
function namedChips(list,qtyKey="qty"){
  return (list||[]).length?(list||[]).map(x=>'<span class="tag">'+nameWithId(x)+(x[qtyKey]!=null?' × '+fmt(x[qtyKey]):'')+'</span>').join(" "):'<span class="muted">없음</span>';
}
function researchBlock(r){
  if(!r)return '<span class="muted">없음</span>';
  const nodes=(r.nodeIds||[]).map(id=>ROUTES?.research?.[id]).filter(Boolean);
  const model=ROUTES?.researchModel||{};
  const range=model.randomizedCostPercent||{min:50,max:150};
  const cal=researchCalendar(r);
  const samples=nodes.filter(x=>x.needItem);
  const facilities=[...new Map(nodes.flatMap(x=>x.baseFunctionDetails||[]).map(x=>[x.id,x])).values()];
  const bypass=(r.unlockBypassNodeIds||[]).map(id=>ROUTES?.research?.[id]).filter(Boolean);
  const protectedGates=(r.protectedGateNodeIds||[]).map(id=>ROUTES?.research?.[id]).filter(Boolean);
  const branchEffects=(r.branchEffectNodeIds||[]).map(id=>ROUTES?.research?.[id]).filter(Boolean);
  const bypassNote=bypass.length?
    '<div class="route-warning"><b>⚠ 최단 연구량이 아닙니다.</b> '+fmt(bypass.length)+'개 노드는 다른 연구의 <code>unlocks</code>로 <code>dependencies</code>를 건너뛸 수 있습니다. 위 누적값은 선언된 dependency/requires를 모두 따라간 보수적 closure입니다.'+
      '<div class="logic-list">'+bypass.slice(0,8).map(x=>'<div><b>'+esc(x.koName)+'</b> <small>'+esc(x.id)+'</small> ← unlock 후보 '+(x.incomingUnlocks||[]).map(esc).join(", ")+'</div>').join("")+(bypass.length>8?'<div>… 외 '+fmt(bypass.length-8)+'개</div>':'')+'</div></div>':
    '<div class="route-ok">이 경로에서는 dependencies 우회 후보가 발견되지 않았습니다. 단, 이미 완료한 연구·병렬 연구 여부에 따라 실제 달력시간은 달라집니다.</div>';
  return '<div class="route-metrics">'+
    kv("선언상 누적 연구량",fmt(r.totalCost)+" scientist-days")+
    kv(cal.scientists+"명 순차 연구",fmt(cal.min)+"~"+fmt(cal.max)+"일 <small>(명목 "+fmt(cal.nominal)+"일)</small>")+
    kv("실제 프로젝트 cost","각 연구 시작 시 "+fmt(range.min)+"~"+fmt(range.max)+"%")+
    kv("연구 프로젝트 수",fmt(cal.topicCount)+"개")+
    '</div>'+
    bypassNote+
    (samples.length?'<p><b>표본 필요:</b> '+samples.map(x=>'<span class="tag">'+nameWithId(x.neededItem||{id:x.neededItemId})+(x.destroyItem?' · 연구 시 소모':' · 보유 필요')+'</span>').join(" ")+'</p>':'')+
    (facilities.length?'<p><b>연구 시설 조건:</b> '+namedChips(facilities)+'</p>':'')+
    (protectedGates.length?'<div class="route-warning"><b>간접 해금 게이트:</b> '+protectedGates.map(x=>'<span class="tag">'+esc(x.koName)+' <small>'+esc(x.id)+'</small></span>').join(" ")+'<div class="muted-light"><code>requires</code>가 있는 0-cost 연구는 연구 목록에서 직접 선택할 수 없고, 조건 충족 뒤 다른 연구의 <code>unlocks</code>를 통해 처리됩니다. 연구 순서가 의미를 가질 수 있습니다.</div></div>':'')+
    (branchEffects.length?'<details class="route-logic"><summary>분기 효과가 있는 연구 '+fmt(branchEffects.length)+'개</summary>'+branchEffects.map(x=>'<div class="logic-row"><b>'+esc(x.koName)+'</b> <small>'+esc(x.id)+'</small>'+(x.disables?.length?'<div>비활성화: '+x.disables.map(esc).join(", ")+'</div>':'')+(x.reenables?.length?'<div>재활성화: '+x.reenables.map(esc).join(", ")+'</div>':'')+'</div>').join("")+'</details>':'')+
    '<p class="muted">위 날짜는 표시된 연구를 모두 미완료 상태에서, 각 프로젝트에 같은 과학자 수를 순차 재배정한다고 가정한 엔진상 작업일 범위입니다. 병렬 연구는 더 빠를 수 있고, 표본·이벤트·분기·시설 대기는 포함하지 않습니다.</p>'+
    '<div class="research-chain">'+nodes.map(x=>'<div class="research-node"><b>'+esc(x.koName)+'</b><small>'+esc(x.id)+'</small><span>'+fmt(x.cost)+' scientist-days (명목)'+(x.needItem?' · 표본 필요'+(x.destroyItem?'·소모':''):'')+'</span></div>').join("")+'</div>';
}
function manufactureBlock(m){
  const engineers=staffCount("engineers",10);
  const actualHours=m.time==null?null:Math.ceil(Number(m.time)/engineers);
  return '<article class="route-card"><h4>'+esc(m.koName)+'</h4>'+
    '<div class="route-metrics">'+kv("제조비",fmt(m.cost))+kv("제조 작업량",fmt(m.time)+" engineer-hours")+kv(engineers+" 엔지니어",formatHours(actualHours))+kv("생산 수량",fmt(m.producedQty||1))+'</div>'+
    '<p><b>필요 시설:</b> '+namedChips(m.baseFunctionDetails||[] )+'</p>'+
    '<p><b>재료:</b> '+((m.requiredItemDetails||[]).length?namedChips(m.requiredItemDetails):chips(m.requiredItems))+'</p>'+
    '<p class="muted">제조시간은 엔진이 매 1시간마다 배정 엔지니어 수만큼 작업량을 더한다고 가정한 순수 작업시간입니다. 재료 확보·시설 건설·대기시간은 포함하지 않습니다.</p>'+
    '<h5>제조 해금 연구</h5>'+researchBlock(m.research)+'</article>';
}
async function openDetail(id,bucket){
  CURRENT_DETAIL={id,bucket};
  $("#detailBody").innerHTML='<p class="muted">상세 데이터 불러오는 중…</p>';
  if(!$("#detailDialog").open)$("#detailDialog").showModal();
  const [d]=await Promise.all([detail(id,bucket),routes()]);
  if(!d){$("#detailBody").innerHTML="<p>상세 데이터 없음</p>";return}
  let html='<p class="eyebrow">Armor detail</p><h2>'+esc(d.koName)+'</h2><p class="muted">'+esc(d.id)+(d.storeItemId?' · item '+esc(d.storeItemId):'')+'</p>';
  html+='<div class="detail-grid">'+
    kv("방어력 전/좌/우/후/하",[d.frontArmor,d.leftArmor,d.rightArmor,d.rearArmor,d.underArmor].join(" / "))+kv("무게",fmt(d.weight))+kv("획득 방식",(d.acquisition.kinds||[]).map(esc).join(" · "))+kv("시간 계산 기준",staffCount("scientists",10)+" 과학자 · "+staffCount("engineers",10)+" 엔지니어")+
    '</div>';
  html+='<h3>능력치 보정</h3><div class="stats-grid">'+Object.entries(d.stats||{}).map(([k,v])=>'<div class="statbox"><small>'+esc(statLabels[k]||k)+'</small><b class="'+(v>0?"pos":v<0?"neg":"")+'">'+(v>0?"+":"")+fmt(v)+'</b></div>').join("")+'</div>';
  html+='<h3>피해유형별 저항 배율</h3><div class="resist-grid">'+(DATA.damageTypes||[]).map((x,i)=>'<div class="statbox"><small>'+esc(x.ko||x.key)+'</small><b>'+resist(d.damageModifier[i])+'</b></div>').join("")+'</div>';
  html+='<h3>회피·회복·시야</h3><div class="detail-grid">'+kv("근접 회피 공식",'<code>'+esc(JSON.stringify(d.meleeDodge||{}))+'</code>')+kv("회복 규칙",'<code>'+esc(JSON.stringify(d.recovery||{}))+'</code>')+kv("시야/위장",'야간 '+fmt(d.visibilityAtDark)+' · 주간 '+fmt(d.visibilityAtDay)+' · 위장 '+fmt(d.camouflageAtDark)+'/'+fmt(d.camouflageAtDay))+'</div>';

  html+='<h3>획득 방법과 작업량</h3>';
  const buy=d.acquisition.buyKey?ROUTES.buy?.[d.acquisition.buyKey]:null;
  if(buy){
    const b=buy;
    html+='<article class="route-card"><h4>구매</h4><div class="route-metrics">'+kv("가격",fmt(b.costBuy))+kv("배송/이전시간",formatHours(b.transferTime))+kv("필요 국가",esc(b.requiresCountry||"—"))+'</div>'+
      '<p><b>구매 연구 조건:</b> '+((b.requiresDetails||[]).length?namedChips(b.requiresDetails):(b.requires||[]).map(x=>'<span class="tag">'+esc(x)+'</span>').join(" "))+'</p>'+
      ((b.baseFunctionDetails||[]).length?'<p><b>구매 시설 조건:</b> '+namedChips(b.baseFunctionDetails)+'</p>':'')+
      researchBlock(b.research)+'</article>';
  }
  const manufacture=(await Promise.all((d.acquisition.manufactureRefs||[]).map(manufactureRoute))).filter(Boolean);
  html+=manufacture.map(manufactureBlock).join("");
  const rewards=d.acquisition.researchRewardKey?(ROUTES.researchRewards?.[d.acquisition.researchRewardKey]||[]):[];
  if(rewards.length){
    html+='<article class="route-card"><h4>연구 보상</h4>'+rewards.map(x=>'<p><b>'+esc(x.koName)+'</b> <small>'+esc(x.id)+'</small></p>'+researchBlock(x.path)).join("")+'</article>';
  }
  const events=(d.acquisition.eventIds||[]).map(id=>ROUTES.events?.[id]).filter(Boolean);
  if(events.length){
    html+='<article class="route-card"><h4>이벤트 참조</h4><p class="muted">이 항목들은 해당 아이템이 이벤트 규칙 안에 직접 참조된 경우입니다. 참조가 항상 확정 보상을 뜻하는 것은 아닙니다.</p>'+events.map(x=>'<span class="tag">'+esc(x.koName)+' ('+esc(x.id)+')</span>').join(" ")+'</article>';
  }
  if(!buy&&!manufacture.length&&!rewards.length&&!events.length){
    html+='<p class="muted">직접 구매/제조/연구보상 경로가 없습니다. 적 장비·전리품·변환·특수 스크립트 획득일 수 있습니다.</p>';
  }

  html+='<details><summary>원본 Armor 룰 · 별도 저장</summary><div class="raw-load"><button id="loadRawRule" type="button">원본 룰 불러오기</button><div id="rawRuleBody" class="muted">화면/음향 리소스와 분리된 핵심 룰을 필요할 때만 불러옵니다.</div></div></details>';
  $("#detailBody").innerHTML=html;
  $("#loadRawRule").onclick=async()=>{
    const body=$("#rawRuleBody");body.textContent="불러오는 중…";
    try{const raw=await rawDetail(id,bucket);body.innerHTML='<pre>'+esc(JSON.stringify(raw?.raw||{},null,2))+'</pre>';}
    catch(err){body.textContent=err.message;}
  };
}
["search"].forEach(id=>$("#"+id).addEventListener("input",render));
["acquire","equipableOnly","manufacturableOnly"].forEach(id=>$("#"+id).addEventListener("change",render));
["scientists","engineers"].forEach(id=>$("#"+id).addEventListener("input",()=>{
  if(CURRENT_DETAIL&&$("#detailDialog").open)openDetail(CURRENT_DETAIL.id,CURRENT_DETAIL.bucket);
}));
$("#closeDialog").onclick=()=>{$("#detailDialog").close();CURRENT_DETAIL=null};
$("#detailDialog").addEventListener("click",e=>{if(e.target.id==="detailDialog"){e.currentTarget.close();CURRENT_DETAIL=null}});
load().catch(err=>{$("#summary").innerHTML='<article class="card metric"><strong>데이터 로드 실패</strong><span>'+esc(err.message)+'</span></article>';console.error(err)});
