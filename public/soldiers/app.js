let DATA=null,PROG=null;
const ASSET_VERSION="soldiers-20261006-2300";
const versioned=url=>url+(url.includes("?")?"&":"?")+"v="+encodeURIComponent(ASSET_VERSION);
const PLAN_BUCKETS=new Map(),PLAN_CACHE=new Map();
let RESEARCH_TOPICS=null;
let sort={key:"firing",dir:-1};

const $=q=>document.querySelector(q);
const fmt=n=>n==null||Number.isNaN(Number(n))?"—":Number(n).toLocaleString("ko-KR",{maximumFractionDigits:1});
const pct=n=>n==null?"—":(Number(n)*100).toFixed(2)+"%";
const statOrder=["tu","stamina","health","bravery","reactions","firing","throwing","strength","psiStrength","psiSkill","melee","mana"];
const sourceLabel={direct:"직접 고용",manufacture:"제조/Recruitment",event:"이벤트"};

async function load(){
  const res=await fetch(versioned("../data/soldiers-index.json"));
  if(!res.ok)throw new Error("병종 데이터 HTTP "+res.status);
  DATA=await res.json();
  try{
    const [prog,research]=await Promise.all([
      fetch(versioned("../data/progression.json")),
      fetch(versioned("../data/progression-research.json"))
    ]);
    if(prog.ok)PROG=await prog.json();
    if(research.ok)RESEARCH_TOPICS=(await research.json()).topics||[];
  }catch(err){console.warn("Progression data is not published yet.",err)}
  renderSummary();
  render();
}
function renderSummary(){
  const pc=DATA.profileCounts||{};
  $("#summary").innerHTML=[
    ["실제 획득형",DATA.profiles.length+"개","직접 "+(pc.direct||0)+" · 제조 "+(pc.manufacture||0)+" · 이벤트 "+(pc.event||0)],
    ["기본 바디 규칙",DATA.soldiers.length+"종","내부 RuleSoldier / 성장 규칙"],
    ["Saint 지원군",pc.saintUnique+"종","고유 결과 · 가중 슬롯 "+pc.saintSlots+"칸"],
    ["변신·훈련",DATA.transformations?.length+"개","초기 획득 후 파생 루트"]
  ].map(x=>'<article class="metric card"><strong>'+x[0]+' '+x[1]+'</strong><span>'+x[2]+'</span></article>').join("");
}
function dataset(){
  const mode=$("#dataset").value;
  if(mode==="soldiers"){
    return DATA.soldiers.map(x=>({...x,_mode:"soldier",_name:x.koName,_id:x.id,_route:(x.requires||[]).join(", ")}));
  }
  if(mode==="transformations"){
    return (DATA.transformations||[]).map(x=>({...x,_mode:"transformation",_name:x.koName,_id:x.id,_route:(x.allowedSoldierTypes||[]).join(", ")}));
  }
  return DATA.profiles.map(x=>({...x,_mode:"profile",_name:x.soldierKoName,_id:x.soldierType,_route:x.sourceKoName}));
}
function cap(s){return s.charAt(0).toUpperCase()+s.slice(1)}
function statValue(row,key,band){
  if(row._mode==="soldier")return row["base"+cap(band)+"_"+key];
  if(row._mode==="profile")return row["effective"+cap(band)+"_"+key];
  if(row._mode==="transformation")return row.fixedEffectiveDelta?.[key]??0;
  return 0;
}
function growthCapValue(row,key){
  if(row._mode==="soldier")return row.statCaps?.[key]??0;
  if(row._mode==="profile")return row.effectiveStatCaps?.[key]??row.rawStatCaps?.[key]??0;
  return 0;
}
function sortValue(row,key,band){
  if(!statOrder.includes(key))return row[key]??0;
  if(row._mode==="transformation")return statValue(row,key,band);
  return $("#sortMetric").value==="cap"?growthCapValue(row,key):statValue(row,key,band);
}
function searchBlob(row){
  return [
    row._name,row._id,row._route,row.sourceId,row.sourceEnName,row.soldierBonusType,row.producedSoldierType,
    ...(row.traitNames||[]),...(row.traits||[]).flatMap(t=>[t.koName,t.enName,t.id]),
    ...(row.requires||[]),...(row.allowedSoldierTypes||[]),...(row.requiredPreviousTransformations||[]),
    ...(row.forbiddenPreviousTransformations||[])
  ].filter(Boolean).join(" ").toLowerCase();
}
function filtered(){
  const q=$("#search").value.trim().toLowerCase();
  const traitsOnly=$("#traitsOnly").checked;
  let a=dataset().filter(r=>(!q||searchBlob(r).includes(q))&&(!traitsOnly||r._mode==="profile"&&r.traitNames.length));
  const band=$("#band").value;
  a.sort((x,y)=>{
    let av,bv;
    if(statOrder.includes(sort.key)){av=sortValue(x,sort.key,band);bv=sortValue(y,sort.key,band)}
    else if(sort.key==="name"){return x._name.localeCompare(y._name,"ko")*sort.dir}
    else{av=x[sort.key]??0;bv=y[sort.key]??0}
    return ((Number(av)||0)-(Number(bv)||0))*sort.dir;
  });
  return a;
}
function th(label,key,sub=""){
  const on=sort.key===key?" sort-on":"";
  const arrow=sort.key===key?(sort.dir>0?" ▲":" ▼"):"";
  return '<th data-sort="'+key+'" class="'+on+'">'+label+arrow+(sub?'<small class="th-sub">'+sub+'</small>':'')+'</th>';
}
function render(){
  if(!DATA)return;
  const mode=$("#dataset").value,band=$("#band").value;
  $("#traitsOnly").disabled=mode!=="profiles";
  $("#band").disabled=mode==="transformations";
  $("#sortMetric").disabled=mode==="transformations";
  $("#tableTitle").textContent=
    mode==="profiles"?"실제 획득형 — 초기 특성 포함 실전 스펙":
    mode==="soldiers"?"기본 바디 규칙 — 내부 RuleSoldier 29종":
    "변신·훈련 루트 — 고정 변화량";
  let head;
  if(mode==="profiles"){
    head=[
      th("획득형","name"),'<th>획득 루트·자동 특성</th>',th("비용","cost"),th("시간","time"),
      ...statOrder.map(k=>th(DATA.statLabels[k],k,"능력 / 성장캡"))
    ].join("");
  }else if(mode==="soldiers"){
    head=[
      th("기본 바디","name"),'<th>해금 조건</th>',th("구매가","costBuy"),th("월급","costSalary"),
      ...statOrder.map(k=>th(DATA.statLabels[k],k,"능력 / 성장캡"))
    ].join("");
  }else{
    head=[
      th("변신/훈련","name"),'<th>적용 대상·특성</th>',th("비용","cost"),th("회복","recoveryTime"),
      ...statOrder.map(k=>th("Δ "+DATA.statLabels[k],k))
    ].join("");
  }
  $("#soldierTable thead").innerHTML="<tr>"+head+"</tr>";
  const rows=filtered();
  $("#rowCount").textContent=rows.length+"개"+(mode==="transformations"?" · 고정 변화량(Flat + SoldierBonus)":" · "+({min:"최소",avg:"평균",max:"최대"}[band])+" 능력치 · "+($("#sortMetric").value==="cap"?"성장캡":"현재 능력치")+" 정렬");
  $("#soldierTable tbody").innerHTML=rows.map(r=>rowHtml(r,band)).join("");
  document.querySelectorAll("th[data-sort]").forEach(el=>el.addEventListener("click",()=>{
    const key=el.dataset.sort;
    if(sort.key===key)sort.dir*=-1;else sort={key,dir:key==="name"?1:-1};
    render();
  }));
  document.querySelectorAll("tbody tr").forEach(el=>el.addEventListener("click",()=>openDetail(el.dataset.row)));
}
function sourceBadges(r){
  let s='<span class="tag">'+(sourceLabel[r.sourceType]||r.sourceType)+'</span>';
  if(r.saintSlots>0)s+=' <span class="tag saint">Saint '+r.saintSlots+'/31 · '+pct(r.saintProbability)+'</span>';
  return s;
}
function rowHtml(r,band){
  const id=encodeURIComponent(r.id);
  let second,c1,c2;
  if(r._mode==="profile"){
    const traits=(r.traits||[]).map(t=>'<span class="trait">'+t.koName+'</span>').join("");
    second=sourceBadges(r)+'<br><span class="route">'+r.sourceKoName+'</span><br>'+traits;
    c1=fmt(r.cost);c2=fmt(r.time);
  }else if(r._mode==="soldier"){
    second=(r.requires||[]).length?'<span class="route">'+r.requires.join("<br>")+'</span>':'<span class="muted">직접 조건 없음/특수</span>';
    c1=fmt(r.costBuy);c2=fmt(r.costSalary);
  }else{
    const trait=r.soldierBonusType?'<span class="trait">'+r.soldierBonusType+'</span>':'';
    const produced=r.producedSoldierType?'<span class="tag">→ '+r.producedSoldierType+'</span>':'';
    second='<span class="route">적용 '+(r.allowedSoldierTypes?.length||0)+'종</span><br>'+trait+' '+produced;
    c1=fmt(r.cost);c2=fmt(r.recoveryTime);
  }
  return '<tr data-row="'+id+'"><td><span class="name">'+r._name+'</span><span class="id">'+r._id+'</span></td><td>'+second+'</td><td>'+c1+'</td><td>'+c2+'</td>'+
    statOrder.map(k=>{
      const v=statValue(r,k,band);
      if(r._mode==="transformation"){
        const cls=v>0?"delta-pos":v<0?"delta-neg":"";
        const shown=v>0?"+"+fmt(v):fmt(v);
        return '<td><span class="'+cls+'">'+shown+'</span></td>';
      }
      const capV=growthCapValue(r,k);
      const d=r._mode==="profile"?(r.traitStats?.[k]||0):0;
      const over=Number(v)>Number(capV)?" over-cap":"";
      const dc=d>0?'<small class="delta-pos">특성 +'+fmt(d)+'</small>':d<0?'<small class="delta-neg">특성 '+fmt(d)+'</small>':'';
      return '<td><div class="stat-pair'+over+'"><span class="stat-current">'+fmt(v)+'</span><span class="stat-slash">/</span><span class="stat-cap">'+fmt(capV)+'</span></div>'+dc+'</td>';
    }).join("")+'</tr>';
}
function findRow(encoded){
  const id=decodeURIComponent(encoded);
  return dataset().find(x=>x.id===id);
}
function statsGrid(title,range,bonus=null){
  const band=$("#band").value;
  const vals=range?.[band]||{};
  return '<h3>'+title+'</h3><div class="stats-grid">'+statOrder.map(k=>{
    const d=bonus?.[k]||0;
    const delta=d>0?'<small class="delta-pos">특성 +'+fmt(d)+'</small>':d<0?'<small class="delta-neg">특성 '+fmt(d)+'</small>':'';
    return '<div class="statbox"><small>'+DATA.statLabels[k]+'</small><b>'+fmt(vals[k])+'</b>'+delta+'</div>';
  }).join("")+'</div>';
}
function statsCapGrid(title,row){
  const band=$("#band").value;
  const current=row.effectiveStats?.[band]||{};
  return '<h3>'+title+'</h3><div class="stats-grid">'+statOrder.map(k=>{
    const cur=current[k]??0;
    const raw=row.rawStatCaps?.[k]??0;
    const training=row.trainingStatCaps?.[k]??0;
    const trait=row.traitStats?.[k]??0;
    const eff=row.effectiveStatCaps?.[k]??raw;
    const over=Number(cur)>Number(eff)?' over-cap':'';
    return '<div class="statbox'+over+'"><small>'+DATA.statLabels[k]+'</small><b>'+fmt(cur)+' / '+fmt(eff)+'</b><small>본체 성장캡 '+fmt(raw)+' · 훈련캡 '+fmt(training)+(trait?' · 특성 '+(trait>0?'+':'')+fmt(trait):'')+'</small></div>';
  }).join("")+'</div><p class="muted">앞 숫자는 선택한 생성값, 뒤 숫자는 자동 특성까지 포함한 실효 성장캡입니다. 시작값이 캡보다 높은 특수 생성형은 그대로 유지되지만 일반 성장으로 더 오르지는 않습니다.</p>';
}
function deltaGrid(title,stats){
  return '<h3>'+title+'</h3><div class="stats-grid">'+statOrder.map(k=>{
    const v=stats?.[k]||0;
    const cls=v>0?"delta-pos":v<0?"delta-neg":"muted";
    return '<div class="statbox"><small>'+DATA.statLabels[k]+'</small><b class="'+cls+'">'+(v>0?"+":"")+fmt(v)+'</b></div>';
  }).join("")+'</div>';
}
function openDetail(encoded){
  const r=findRow(encoded);if(!r)return;
  let html='<p class="eyebrow">'+(r._mode==="profile"?"실제 획득형":r._mode==="soldier"?"기본 바디 규칙":"변신·훈련 루트")+'</p><h2>'+r._name+'</h2><p class="muted">'+r._id+'</p>';
  if(r._mode==="profile"){
    html+='<div class="detail-grid"><div class="box"><strong>획득 루트</strong>'+sourceBadges(r)+'<br>'+r.sourceKoName+'<br><small>'+r.sourceId+'</small></div><div class="box"><strong>비용 / 시간</strong>'+fmt(r.cost)+' / '+fmt(r.time)+'</div><div class="box"><strong>내부 바디</strong>'+r.soldierType+'<br><small>장갑 '+String(r.armor||"—")+'</small></div></div>';
    html+=statsGrid("특성 적용 전 생성 스펙",r.currentStatsBeforeTraits);
    html+=statsCapGrid("자동 특성 포함 능력치 / 성장캡",r);
    html+='<h3>생성 시 자동 특성</h3><div class="traits">'+(r.traits.length?r.traits.map(t=>'<div class="trait-card"><strong>'+t.koName+'</strong><small>'+t.id+'</small><div>'+statOrder.filter(k=>t.stats[k]).map(k=>DATA.statLabels[k]+" "+(t.stats[k]>0?"+":"")+t.stats[k]).join(" · ")+'</div></div>').join(""):'<span class="muted">없음</span>')+'</div>';
    html+='<h3>획득 템플릿</h3><div class="detail-grid"><div class="box"><strong>currentStats 덮어쓰기</strong><pre>'+esc(JSON.stringify(r.currentStatsOverride,null,2))+'</pre></div><div class="box"><strong>이전 변환</strong><pre>'+esc(JSON.stringify(r.previousTransformations,null,2))+'</pre></div><div class="box"><strong>필요 연구/조건</strong>'+(r.requires||[]).map(x=>'<span class="tag">'+x+'</span>').join(" ")+'</div></div>';
  }else if(r._mode==="soldier"){
    html+='<div class="detail-grid"><div class="box"><strong>구매 / 월급</strong>'+fmt(r.costBuy)+' / '+fmt(r.costSalary)+'</div><div class="box"><strong>월 고용 제한</strong>'+fmt(r.monthlyBuyLimit)+'</div><div class="box"><strong>기본 장갑</strong>'+String(r.armor||"—")+'</div></div>';
    html+=statsGrid("기본 생성 최소", {min:r.minStats,avg:r.minStats,max:r.minStats});
    html+=statsGrid("기본 생성 평균", {min:r.avgStats,avg:r.avgStats,max:r.avgStats});
    html+=statsGrid("기본 생성 최대", {min:r.maxStats,avg:r.maxStats,max:r.maxStats});
    html+='<h3>성장 상한</h3><div class="stats-grid">'+statOrder.map(k=>'<div class="statbox"><small>'+DATA.statLabels[k]+'</small><b>'+fmt(r.statCaps[k])+'</b><small>훈련 '+fmt(r.trainingStatCaps[k])+'</small></div>').join("")+'</div>';
  }else{
    html+='<div class="detail-grid"><div class="box"><strong>비용 / 회복</strong>'+fmt(r.cost)+' / '+fmt(r.recoveryTime)+'일</div><div class="box"><strong>적용 병종</strong>'+(r.allowedSoldierTypes||[]).length+'종</div><div class="box"><strong>생산 Soldier Type</strong>'+String(r.producedSoldierType||"유지")+'</div></div>';
    deltaGrid("직접 Flat 스탯 변화",r.flatOverallStatChange);
    deltaGrid("부여 특성의 스탯",r.traitStats);
    deltaGrid("고정 실효 변화량 합계",r.fixedEffectiveDelta);
    html+='<h3>성장분 비례 변화</h3><p class="muted">아래 percentGainedStatChange는 현재 총 스탯이 아니라 “초기치 이후 성장한 양”에 적용되므로 실제 최종 변화량은 병사마다 다릅니다.</p>';
    deltaGrid("percentGainedStatChange",r.percentGainedStatChange);
    html+='<div class="detail-grid"><div class="box"><strong>필요 연구</strong>'+(r.requires||[]).map(x=>'<span class="tag">'+x+'</span>').join(" ")+'</div><div class="box"><strong>필수 이전 변환</strong>'+(r.requiredPreviousTransformations||[]).map(x=>'<span class="tag">'+x+'</span>').join(" ")+'</div><div class="box"><strong>금지 이전 변환</strong>'+(r.forbiddenPreviousTransformations||[]).map(x=>'<span class="tag">'+x+'</span>').join(" ")+'</div></div>';
  }
  html+=renderProgression(r._id);
  $("#detailBody").innerHTML=html;
  $("#detailDialog").showModal();
}
function esc(s){return String(s).replace(/[&<>]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[m]))}
function planById(id){return PROG?.plans?.[id]||null}
function topicByIndex(i){return Number.isInteger(i)?RESEARCH_TOPICS?.[i]:i}
function planSummary(plan,title="해금 연구 트리"){
  if(!plan)return'<div class="route-card muted">연구 경로 없음</div>';
  const roots=(plan.roots||[]).map(topicByIndex).filter(Boolean).map(x=>'<span class="tag">'+esc(x.koName||x.id)+'</span>').join(" ");
  const gates=(plan.branchGates||[]).map(topicByIndex).filter(Boolean).map(x=>'<span class="trait">'+esc(x.koName||x.id)+'</span>').join(" ");
  return '<div class="route-card"><strong>'+title+'</strong><div class="route-metrics"><span>명목 누적 연구량 <b>'+fmt(plan.totalCost)+'</b></span><span>연구 노드 <b>'+fmt(plan.topicCount)+'</b></span><span>표본 조건 <b>'+fmt(plan.needItemCount)+'</b></span></div><div class="route-line"><small>루트 시작</small> '+roots+'</div>'+(gates?'<div class="route-line warn"><small>분기 연구</small> '+gates+'</div>':'')+'<button class="plan-load" data-plan="'+plan.id+'">전체 연구 노드 보기</button><div class="plan-body" data-plan-body="'+plan.id+'"></div></div>';
}
async function loadPlan(id){
  if(PLAN_CACHE.has(id))return PLAN_CACHE.get(id);
  const b=id[0];
  if(!PLAN_BUCKETS.has(b)){
    const r=await fetch(versioned("../data/progression-plans/"+b+".json"));
    PLAN_BUCKETS.set(b,(await r.json()).plans);
  }
  if(!RESEARCH_TOPICS){
    const r=await fetch(versioned("../data/progression-research.json"));
    RESEARCH_TOPICS=(await r.json()).topics||[];
  }
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
  const rows=(p.topics||[]).map(t=>'<tr><td>'+esc(t.koName)+'</td><td>'+fmt(t.cost)+'</td><td>'+((t.prerequisites||[]).map(x=>esc(DATA?.researchNames?.[x]||x)).join("<br>")||"—")+'</td><td>'+(t.needItem?(t.destroyItem?"필요·소모":"필요"):"—")+'</td><td>'+((t.requiresBaseFunc||[]).join(", ")||"—")+'</td><td>'+((t.disables||[]).map(entityLabel).join("<br>")||"—")+'</td></tr>').join("");
  return '<div class="plan-table"><table><thead><tr><th>연구</th><th>량</th><th>직접 선행</th><th>표본</th><th>기지 기능</th><th>이 선택으로 닫히는 연구/루트</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function eventById(id){return PROG?.events?.[id]||null}
function eventScript(eventId,scriptId){return (eventById(eventId)?.scripts||[]).find(s=>s.id===scriptId)||null}
function acquisitionHtml(p){
  if(p.kind==="buy")return '<div class="acq-card"><strong>직접 고용</strong><span>비용 '+fmt(p.cost)+'</span>'+planSummary(planById(p.researchPlanId))+'</div>';
  if(p.kind==="event"){
    const e=eventById(p.eventId);if(!e)return"";
    const variants=(p.variants||[]).map(v=>'<details><summary>이벤트 발생 조건과 전체 연구 루트</summary>'+eventConditions(eventScript(p.eventId,v.scriptId))+planSummary(planById(v.researchPlanId),"이벤트 포함 연구 트리")+'</details>').join("");
    return '<div class="acq-card"><strong>이벤트 획득 · '+esc(e.koName)+'</strong><span class="id">'+esc(e.id)+' · 생성 '+fmt(p.spawnedPersons)+'명</span>'+planSummary(planById(p.baseResearchPlanId),"이벤트 기본 연구 조건")+variants+'</div>';
  }
  const r=PROG?.recipes?.[p.recipeId];if(!r)return"";
  const items=(r.requiredItems||[]).map(i=>'<div class="req-item"><b>'+esc(i.koName)+'</b> × '+fmt(i.qty)+(i.eventSources||[]).map(src=>{const ev=eventById(src.eventId);return ev?'<div class="event-box"><span class="tag">이벤트</span> '+esc(ev.koName)+' '+(ev.scripts||[]).map(s=>eventConditions(s)).join("")+'</div>':""}).join("")+'</div>').join("");
  const variants=(r.eventVariants||[]).map(v=>{const ev=eventById(v.eventId);return '<details><summary>'+esc(ev?.koName||v.eventId)+' 경유 실제 루트</summary>'+eventConditions(eventScript(v.eventId,v.scriptId))+planSummary(planById(v.researchPlanId),"이벤트 포함 연구 트리")+'</details>'}).join("");
  return '<div class="acq-card"><strong>'+esc(r.koName)+'</strong><span>비용 '+fmt(r.cost)+' · 시간 '+fmt(r.time)+' · 작업장 '+fmt(r.space)+'</span>'+planSummary(planById(r.baseResearchPlanId),"기본 제조/전환 연구")+(items?'<h4>필요 아이템</h4>'+items:'')+variants+'</div>';
}
function trainingHtml(t){
  const stats={...(t.bonus?.stats||{}),...(t.flatOverallStatChange||{})};
  const bonuses=Object.entries(stats).filter(([,v])=>v).map(([k,v])=>'<span class="trait">'+esc(DATA.statLabels[k]||k)+' '+(v>0?"+":"")+fmt(v)+'</span>').join(" ");
  return '<div class="acq-card"><strong>'+esc(t.koName)+'</strong><span class="id">'+esc(t.id)+'</span><div>'+bonuses+'</div>'+planSummary(planById(t.researchPlanId),"훈련 해금 연구")+'</div>';
}
function renderProgression(soldierId){
  const p=PROG?.soldiers?.[soldierId];if(!p)return"";
  const gates=(p.summary?.commonBranchGates||[]).map(x=>'<span class="trait">'+esc(x.koName)+'</span>').join(" ");
  return '<section class="progression"><h3>획득 방식 · 루트 · 연구량</h3><div class="detail-grid"><div class="box"><strong>확인된 획득 경로</strong>'+fmt(p.summary?.pathCount)+'</div><div class="box"><strong>명목 누적 연구량*</strong>'+fmt(p.summary?.nominalMinResearch)+'</div><div class="box"><strong>공통 분기</strong>'+(gates||"없음")+'</div></div><div class="routes">'+((p.acquisitionPaths||[]).map(acquisitionHtml).join("")||'<span class="muted">직접 추적 가능한 획득 경로 없음</span>')+'</div><h3>특수 훈련 / 후기 강화</h3><div class="routes">'+((p.trainingRoutes||[]).map(trainingHtml).join("")||'<span class="muted">별도 특수 훈련 없음</span>')+'</div><p class="muted">* 명목 연구량은 dependencies+requires 중복 제거 합계입니다. unlocks/getOneFree/이벤트 직접 지급으로 실제 최소량은 더 작아질 수 있습니다.</p></section>';
}

["search","dataset","band","sortMetric","traitsOnly"].forEach(id=>$("#"+id).addEventListener(id==="search"?"input":"change",render));
$("#closeDialog").addEventListener("click",()=>$("#detailDialog").close());
$("#detailDialog").addEventListener("click",async e=>{
  if(e.target.id==="detailDialog"){e.currentTarget.close();return}
  const b=e.target.closest(".plan-load");if(!b)return;
  b.disabled=true;b.textContent="불러오는 중…";
  try{
    const p=await loadPlan(b.dataset.plan);
    const target=b.closest(".route-card")?.querySelector('[data-plan-body="'+b.dataset.plan+'"]');
    if(target)target.innerHTML=planTable(p);
    b.remove();
  }catch(err){b.disabled=false;b.textContent="연구트리 로드 실패";console.error(err)}
});
load().catch(err=>{$("#summary").innerHTML='<article class="card metric"><strong>데이터 로드 실패</strong><span>'+err.message+'</span></article>';console.error(err)});
