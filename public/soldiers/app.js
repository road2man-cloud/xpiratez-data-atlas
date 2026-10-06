let DATA=null;
let sort={key:"firing",dir:-1};

const $=q=>document.querySelector(q);
const fmt=n=>n==null||Number.isNaN(Number(n))?"—":Number(n).toLocaleString("ko-KR",{maximumFractionDigits:1});
const statOrder=["tu","stamina","health","bravery","reactions","firing","throwing","strength","psiStrength","psiSkill","melee","mana"];

async function load(){
  const res=await fetch("../data/soldiers-index.json");
  DATA=await res.json();
  renderSummary();
  render();
}
function renderSummary(){
  $("#summary").innerHTML=[
    ["기본 병종",DATA.soldiers.length+"종","Ruleset soldiers 전체"],
    ["실제 생성 프로필",DATA.profiles.length+"개","제조·이벤트 모집 루트"],
    ["특성 정의",DATA.bonuses.length+"개","soldierBonuses 전체"],
    ["특성 보유 생성",DATA.profiles.filter(x=>x.traitNames.length).length+"개","자동 특성 합산 대상"]
  ].map(x=>'<article class="metric card"><strong>'+x[0]+' '+x[1]+'</strong><span>'+x[2]+'</span></article>').join("");
}
function dataset(){
  const mode=$("#dataset").value;
  if(mode==="soldiers"){
    return DATA.soldiers.map(x=>({...x,_mode:"soldier",_name:x.koName,_id:x.id,_route:(x.requires||[]).join(", ")}));
  }
  return DATA.profiles.map(x=>({...x,_mode:"profile",_name:x.soldierKoName,_id:x.soldierType,_route:x.sourceKoName}));
}
function statValue(row,key,band){
  return row._mode==="soldier"?row["base"+cap(band)+"_"+key]:row["effective"+cap(band)+"_"+key];
}
function cap(s){return s.charAt(0).toUpperCase()+s.slice(1)}
function searchBlob(row){
  return [
    row._name,row._id,row._route,row.sourceId,row.sourceEnName,
    ...(row.traitNames||[]),...(row.traits||[]).flatMap(t=>[t.koName,t.enName,t.id]),
    ...(row.requires||[])
  ].filter(Boolean).join(" ").toLowerCase();
}
function filtered(){
  const q=$("#search").value.trim().toLowerCase();
  const traitsOnly=$("#traitsOnly").checked;
  let a=dataset().filter(r=>(!q||searchBlob(r).includes(q))&&(!traitsOnly||r._mode==="profile"&&r.traitNames.length));
  const band=$("#band").value;
  a.sort((x,y)=>{
    let av,bv;
    if(statOrder.includes(sort.key)){av=statValue(x,sort.key,band);bv=statValue(y,sort.key,band)}
    else if(sort.key==="name"){return x._name.localeCompare(y._name,"ko")*sort.dir}
    else{av=x[sort.key]??0;bv=y[sort.key]??0}
    return ((Number(av)||0)-(Number(bv)||0))*sort.dir;
  });
  return a;
}
function th(label,key){
  const on=sort.key===key?" sort-on":"";
  const arrow=sort.key===key?(sort.dir>0?" ▲":" ▼"):"";
  return '<th data-sort="'+key+'" class="'+on+'">'+label+arrow+'</th>';
}
function render(){
  if(!DATA)return;
  const mode=$("#dataset").value,band=$("#band").value;
  $("#traitsOnly").disabled=mode==="soldiers";
  $("#tableTitle").textContent=mode==="soldiers"?"기본 병종 29종":"실제 생성 프로필 — 특성 포함 실전 스펙";
  const head=[
    th("병종","name"),
    '<th>'+(mode==="soldiers"?"고용/해금":"생성 루트·자동 특성")+'</th>',
    mode==="soldiers"?th("구매가","costBuy"):th("비용","cost"),
    mode==="soldiers"?th("월급","costSalary"):th("시간","time"),
    ...statOrder.map(k=>th(DATA.statLabels[k],k))
  ].join("");
  $("#soldierTable thead").innerHTML="<tr>"+head+"</tr>";
  const rows=filtered();
  $("#rowCount").textContent=rows.length+"개 · "+({min:"최소",avg:"평균",max:"최대"}[band])+" 기준";
  $("#soldierTable tbody").innerHTML=rows.map(r=>rowHtml(r,band)).join("");
  document.querySelectorAll("th[data-sort]").forEach(el=>el.addEventListener("click",()=>{
    const key=el.dataset.sort;
    if(sort.key===key)sort.dir*=-1;else sort={key,dir:key==="name"?1:-1};
    render();
  }));
  document.querySelectorAll("tbody tr").forEach(el=>el.addEventListener("click",()=>openDetail(el.dataset.row)));
}
function rowHtml(r,band){
  const id=encodeURIComponent(r.id);
  let second,c1,c2;
  if(r._mode==="profile"){
    const traits=(r.traits||[]).map(t=>'<span class="trait">'+t.koName+'</span>').join("");
    second='<span class="route">'+r.sourceKoName+'</span><br>'+traits;
    c1=fmt(r.cost);c2=fmt(r.time);
  }else{
    second=(r.requires||[]).length?'<span class="route">'+r.requires.map(x=>x).join("<br>")+'</span>':'<span class="muted">직접 조건 없음/특수</span>';
    c1=fmt(r.costBuy);c2=fmt(r.costSalary);
  }
  return '<tr data-row="'+id+'"><td><span class="name">'+r._name+'</span><span class="id">'+r._id+'</span></td><td>'+second+'</td><td>'+c1+'</td><td>'+c2+'</td>'+
    statOrder.map(k=>{
      const v=statValue(r,k,band);
      const d=r._mode==="profile"?(r.traitStats?.[k]||0):0;
      const dc=d>0?' <span class="delta-pos">+'+fmt(d)+'</span>':d<0?' <span class="delta-neg">'+fmt(d)+'</span>':'';
      return '<td><span class="stat-main">'+fmt(v)+'</span>'+dc+'</td>';
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
function openDetail(encoded){
  const r=findRow(encoded);if(!r)return;
  let html='<p class="eyebrow">'+(r._mode==="profile"?"실제 생성 프로필":"기본 병종")+'</p><h2>'+r._name+'</h2><p class="muted">'+r._id+'</p>';
  if(r._mode==="profile"){
    html+='<div class="detail-grid"><div class="box"><strong>생성 루트</strong>'+r.sourceKoName+'<br><small>'+r.sourceId+'</small></div><div class="box"><strong>비용 / 시간</strong>'+fmt(r.cost)+' / '+fmt(r.time)+'</div><div class="box"><strong>장갑</strong>'+String(r.armor||"—")+'</div></div>';
    html+=statsGrid("특성 적용 전 currentStats",r.currentStatsBeforeTraits);
    html+=statsGrid("특성 포함 실제 생성 스펙",r.effectiveStats,r.traitStats);
    html+='<h3>자동 특성</h3><div class="traits">'+(r.traits.length?r.traits.map(t=>'<div class="trait-card"><strong>'+t.koName+'</strong><small>'+t.id+'</small><div>'+statOrder.filter(k=>t.stats[k]).map(k=>DATA.statLabels[k]+" "+(t.stats[k]>0?"+":"")+t.stats[k]).join(" · ")+'</div></div>').join(""):'<span class="muted">없음</span>')+'</div>';
    html+='<h3>생성 템플릿</h3><div class="detail-grid"><div class="box"><strong>현재치 덮어쓰기</strong><pre>'+esc(JSON.stringify(r.currentStatsOverride,null,2))+'</pre></div><div class="box"><strong>이전 변환</strong><pre>'+esc(JSON.stringify(r.previousTransformations,null,2))+'</pre></div><div class="box"><strong>필요 연구/조건</strong>'+(r.requires||[]).map(x=>'<span class="tag">'+x+'</span>').join(" ")+'</div></div>';
  }else{
    html+='<div class="detail-grid"><div class="box"><strong>구매 / 월급</strong>'+fmt(r.costBuy)+' / '+fmt(r.costSalary)+'</div><div class="box"><strong>월 고용 제한</strong>'+fmt(r.monthlyBuyLimit)+'</div><div class="box"><strong>기본 장갑</strong>'+String(r.armor||"—")+'</div></div>';
    html+=statsGrid("기본 생성 범위 — 최소", {min:r.minStats,avg:r.minStats,max:r.minStats});
    html+=statsGrid("기본 생성 범위 — 평균", {min:r.avgStats,avg:r.avgStats,max:r.avgStats});
    html+=statsGrid("기본 생성 범위 — 최대", {min:r.maxStats,avg:r.maxStats,max:r.maxStats});
    html+='<h3>성장 상한</h3><div class="stats-grid">'+statOrder.map(k=>'<div class="statbox"><small>'+DATA.statLabels[k]+'</small><b>'+fmt(r.statCaps[k])+'</b><small>훈련 '+fmt(r.trainingStatCaps[k])+'</small></div>').join("")+'</div>';
  }
  $("#detailBody").innerHTML=html;
  $("#detailDialog").showModal();
}
function esc(s){return String(s).replace(/[&<>]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[m]))}

["search","dataset","band","traitsOnly"].forEach(id=>$("#"+id).addEventListener(id==="search"?"input":"change",render));
$("#closeDialog").addEventListener("click",()=>$("#detailDialog").close());
$("#detailDialog").addEventListener("click",e=>{if(e.target.id==="detailDialog")e.currentTarget.close()});
load().catch(err=>{$("#summary").innerHTML='<article class="card metric"><strong>데이터 로드 실패</strong><span>'+err.message+'</span></article>';console.error(err)});
