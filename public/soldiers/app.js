let DATA=null;
let sort={key:"firing",dir:-1};

const $=q=>document.querySelector(q);
const fmt=n=>n==null||Number.isNaN(Number(n))?"—":Number(n).toLocaleString("ko-KR",{maximumFractionDigits:1});
const pct=n=>n==null?"—":(Number(n)*100).toFixed(2)+"%";
const statOrder=["tu","stamina","health","bravery","reactions","firing","throwing","strength","psiStrength","psiSkill","melee","mana"];
const sourceLabel={direct:"직접 고용",manufacture:"제조/Recruitment",event:"이벤트"};

async function load(){
  const res=await fetch("../data/soldiers-index.json");
  DATA=await res.json();
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
  $("#detailBody").innerHTML=html;
  $("#detailDialog").showModal();
}
function esc(s){return String(s).replace(/[&<>]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[m]))}

["search","dataset","band","sortMetric","traitsOnly"].forEach(id=>$("#"+id).addEventListener(id==="search"?"input":"change",render));
$("#closeDialog").addEventListener("click",()=>$("#detailDialog").close());
$("#detailDialog").addEventListener("click",e=>{if(e.target.id==="detailDialog")e.currentTarget.close()});
load().catch(err=>{$("#summary").innerHTML='<article class="card metric"><strong>데이터 로드 실패</strong><span>'+err.message+'</span></article>';console.error(err)});
