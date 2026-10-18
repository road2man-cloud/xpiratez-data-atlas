(() => {
"use strict";
const el=id=>document.getElementById(id);
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=(value,d=1)=>value==null||!Number.isFinite(Number(value))?"미확인":Number(value).toLocaleString("ko-KR",{maximumFractionDigits:d});
const option=(v,label)=>'<option value="'+escapeHtml(v)+'">'+escapeHtml(label)+'</option>';
const controls=[
  ["evalType","분류",[["all","전체"],["원거리","원거리"],["근접","근접"]]],
  ["evalSupply","획득 방식",[["all","전체"],["제식화 가능","제식화 가능"],["전리품 한정","전리품 한정"],["특수조건","특수조건"]]],
  ["evalPhase","획득 시기",[["all","전체"],["초반","초반"],["중반","중반"],["중후반","중후반"],["후반","후반"],["최후반","최후반"],["before","한나 이전(추정 포함)"],["after","한나 이후(확인)"],["unknown","시기 미확인"]]],
  ["evalSave","16.sav 상태",[["all","전체"],["standardNow","현재 제식 가능(반복 보급 확인)"],["now","현재 사용 가능"],["research","연구 필요"],["buy","구매 해금/구매 가능"],["manufacture","제조 가능"],["loot","전리품 필요"],["later","후반 목표"],["special","특수조건 확인"]]],
  ["evalDistance","거리",[["all","4/14/28칸 평균"],["4","근거리 4칸"],["14","중거리 14칸"],["28","원거리 28칸"]]],
  ["evalArmor","대상 방어",[["all","전체 평균"],["경장갑","경장갑"],["중간 장갑","중간 장갑"],["중장갑","중장갑"],["특수내성","특수내성"]]],
  ["evalForm","무기 유형",[["all","모든 평가 후보"],["small","휴대 총기/경량 근접"],["heavy","광역/중화기만"]]],
  ["evalCost","비용",[["all","전체"],["cheap","구매가 10,000 이하"],["ammoCheap","발당 탄약 50 이하"],["manufacture","제조법 있음"],["manufactureBudget","제조 실질비 10,000 이하"],["opportunityKnown","제조 기회비용 확인"],["unknown","비용 미확인"]]],
  ["evalHand","장착 손",[["all","전체"],["one","한손"],["two","양손"]]],
  ["evalWeight","중량",[["all","전체"],["10","10 이하"],["20","20 이하"],["30","30 이하"]]],
  ["evalSize","장비칸",[["all","전체"],["2","1×2 이하"],["4","4칸 이하"],["6","6칸 이하"]]],
  ["evalConfidence","모형 검증",[["all","전체"],["normal","단일탄/일반 모형"],["special","산탄·광역·특수피해"]]],
  ["evalGroup","탄종 행",[["best","무기별 추천 탄약 1종"],["all","모든 탄약 조합"]]],
  ["evalSort","정렬",[["score","제식 종합점수"],["combat","전투점수"],["damage","선택 거리/장갑 TU100 피해"],["value","구매가격 대비 효율"],["cost","구매가 낮은 순"]]]
];
let data=null,rows=[],view=[],selected=null;
const compareKeys=new Set();
function toggle(isRanking){
  document.body.classList.toggle("ranking-active",isRanking);
  el("standardTab").classList.toggle("active",isRanking);
  el("legacyTab").classList.toggle("active",!isRanking);
}
function makeControl([id,label,values]){
  return '<label class="rank-field"><span>'+escapeHtml(label)+'</span><select id="'+id+'">'+values.map(x=>option(x[0],x[1])).join("")+'</select></label>';
}
function initPanel(){
  el("standardPanel").innerHTML=
    '<section class="card rank-intro"><div><p class="eyebrow">STANDARD LOADOUT · 동일 무기DB 내 평가</p><h2>제식 평가 순위</h2>'+
    '<p id="evalProvenance"></p></div><div class="rank-totals"><div id="evalTotals"></div><button id="evalCompare" type="button" disabled>선택 비교 (0/4)</button></div></section>'+
    '<section class="card rank-filter"><label class="rank-field rank-search"><span>무기·탄약·ID 검색</span><input type="search" id="evalSearch" placeholder="토미건, 돌연변이 기관총, STR_TOMMYGUN…"></label>'+
    controls.slice(0,7).map(makeControl).join("")+
    '<details class="rank-advanced"><summary>경제·장비 규격·탄종·정렬 필터</summary><div class="rank-filter-inner">'+controls.slice(7).map(makeControl).join("")+'</div></details></section>'+
    '<div class="rank-info"><p id="evalSummary" aria-live="polite"></p><p>수치 = 명중도 대리지표를 사용한 <strong>추정 TU100 체력피해</strong>. 실제 처치확률 아님. <strong>전투점수</strong>와 공급·가격을 포함한 <strong>제식점수</strong>를 구분합니다.</p></div>'+
    '<section class="card table-card rank-table-card"><div class="table-shell"><table class="rank-table"><thead><tr>'+
    '<th>비교</th><th>제식점수</th><th>무기명</th><th>추천탄약</th><th>전투점수</th><th>근거리 4</th><th>중거리 14</th><th>원거리 28</th><th>획득단계</th><th>현재상태</th><th>분류/확도</th>'+
    '</tr></thead><tbody id="evalRows"></tbody></table></div><nav class="rank-pager" id="evalPager"></nav></section>'+
    '<p class="rank-footer">모든 값은 o1.1.1 룰과 저장된 세이브 스냅샷을 기준으로 한 분석입니다. 탄약 구매가·제조 재료의 기회비용·엔지니어 X그로그 순이익이 확인되지 않은 경우 0원으로 환산하지 않습니다. 근접은 1칸 전용이며 4·14·28칸 원거리 피해 순위에서 제외합니다.</p>';
  el("evalSave").parentElement.querySelector("span").textContent=data.meta.saveFile+" 상태";
  el("evalProvenance").textContent="기준 세이브 "+data.meta.saveFile+" · "+new Date(data.meta.saveModifiedAt).toLocaleString("ko-KR")+" · 연구 "+data.meta.researchCompleted+"건 · 실제 일반 GAL "+data.meta.observedGalCount+"명 · "+data.meta.galStatsSource+" · 활성 X그로그 대체수익 "+fmt(data.meta.engineerOpportunityHourly,2)+"$/엔지니어시간";
  el("evalTotals").textContent=data.counts.uniqueRangedWeapons+"종 원거리 · "+data.counts.ranged+"개 탄종조합 · "+data.counts.melee+"개 근접 · "+data.counts.combined+"개 평가행";
  for(const [id] of controls){el(id).addEventListener("change",()=>{currentPage=1;render()})}
  el("evalSearch").addEventListener("input",()=>{currentPage=1;render()});
  el("evalRows").addEventListener("click",e=>{
    if(e.target.closest("input[data-compare-key]"))return;
    const tr=e.target.closest("tr[data-key]");if(tr)void openRank(tr.dataset.key);
  });
  el("evalRows").addEventListener("keydown",e=>{
    if(e.key!=="Enter"&&e.key!==" ")return;
    const tr=e.target.closest("tr[data-key]");if(tr){e.preventDefault();void openRank(tr.dataset.key)}
  });
  el("evalRows").addEventListener("change",e=>{
    const input=e.target.closest("input[data-compare-key]");
    if(!input)return;
    if(input.checked&&compareKeys.size>=4){input.checked=false;return}
    if(input.checked)compareKeys.add(input.dataset.compareKey);else compareKeys.delete(input.dataset.compareKey);
    el("evalCompare").disabled=compareKeys.size<2;
    el("evalCompare").textContent="선택 비교 ("+compareKeys.size+"/4)";
  });
  el("evalCompare").onclick=compareSelected;
  el("evalPager").addEventListener("click",e=>{
    const b=e.target.closest("button[data-page]");if(b){currentPage=Number(b.dataset.page);render()}
  });
}
function get(id){return el(id).value}
const scenarioValue=(r,distance,armor)=>{
  if(r.type==="근접")return distance==="all"&&armor==="all"?r.dptu:null;
  const ss=distance==="all"?r.scenarios:r.scenarios.filter(x=>String(x.distance)===distance);
  const vals=ss.map(s=>armor==="all"?s.tu100Hp:s.armor[armor]).filter(v=>v!=null);
  return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
};
function heavy(r){
  return r.type==="원거리"&&(r.weight>30||r.width*r.height>6||r.confidence==="특수피해 모형 제한"&&r.scenarios?.some(x=>x.tu100Hp>200));
}
function filtered(){
  const q=get("evalSearch").trim().toLocaleLowerCase("ko");
  const phase=get("evalPhase"),save=get("evalSave"),type=get("evalType"),supply=get("evalSupply");
  const armor=get("evalArmor"),dist=get("evalDistance"),form=get("evalForm"),cost=get("evalCost"),hand=get("evalHand");
  let set=rows.filter(r=>{
    if(q&&![r.koName,r.weaponId,r.ammoId,r.ammoKoName,r.stage,r.supply.state].join(" ").toLocaleLowerCase("ko").includes(q))return false;
    if(type!=="all"&&r.type!==type)return false;
    if(supply!=="all"&&r.supply.kind!==supply)return false;
    if(phase==="before"&&!r.hanna.includes("이전"))return false;
    if(phase==="after"&&r.hanna!=="이후")return false;
    if(phase==="unknown"&&!r.stage.includes("미확인"))return false;
    if(!["all","before","after","unknown"].includes(phase)&&r.stage!==phase)return false;
    if(save==="standardNow"&&!(r.supply.kind==="제식화 가능"&&r.supply.state==="현재 제식 가능"))return false;
    if(save!=="all"&&save!=="standardNow"&&r.supply.stateKey!==save)return false;
    if(form==="small"&&heavy(r))return false;
    if(form==="heavy"&&!heavy(r))return false;
    if(cost==="cheap"&&!(r.weaponPrice!=null&&r.weaponPrice<=10000))return false;
    if(cost==="ammoCheap"&&!(r.costPerShot!=null&&r.costPerShot<=50))return false;
    if(cost==="manufacture"&&!r.supply.manufactureIds.length)return false;
    if(cost==="manufactureBudget"&&!(r.manufactureEconomics?.economicTotal!=null&&r.manufactureEconomics.economicTotal<=10000||r.ammoManufactureEconomics?.economicTotal!=null&&r.ammoManufactureEconomics.economicTotal<=10000))return false;
    if(cost==="opportunityKnown"&&!(r.manufactureEconomics?.opportunityProfitLost!=null||r.ammoManufactureEconomics?.opportunityProfitLost!=null))return false;
    if(cost==="unknown"&&r.weaponPrice!=null&&r.costPerShot!=null&&r.manufactureEconomics==null)return false;
    if(hand==="one"&&r.twoHanded)return false;
    if(hand==="two"&&!r.twoHanded)return false;
    const weight=get("evalWeight"),size=get("evalSize");
    if(weight!=="all"&&r.weight>Number(weight))return false;
    if(size!=="all"&&r.width*r.height>Number(size))return false;
    const conf=get("evalConfidence");
    if(conf==="normal"&&r.confidence==="특수피해 모형 제한")return false;
    if(conf==="special"&&r.confidence!=="특수피해 모형 제한")return false;
    if((dist!=="all"||armor!=="all")&&scenarioValue(r,dist,armor)==null)return false;
    return true;
  });
  const sort=get("evalSort"),sv=r=>scenarioValue(r,dist,armor);
  const score=r=>sort==="score"?r.score??-1:sort==="combat"?r.combatScore??-1:
    sort==="damage"?sv(r)??-1:sort==="value"?(r.weaponPrice!=null&&r.weaponPrice>=0&&sv(r)!=null?sv(r)/(1+r.weaponPrice/1000):-1):
    -(r.weaponPrice??Infinity);
  set.sort((a,b)=>score(b)-score(a)||a.koName.localeCompare(b.koName,"ko"));
  if(get("evalGroup")==="best"){
    const seen=new Set();
    set=set.filter(x=>{if(seen.has(x.weaponId))return false;seen.add(x.weaponId);return true});
  }
  return set;
}
const pageSize=75;let currentPage=1;
const grade=(value)=>value==null?"—":String(value);
function tableRow(r){
  const v=r.scenarios||[];
  const cell=n=>r.type==="근접"? "—":fmt(v.find(s=>s.distance===n)?.tu100Hp,1);
  const warn=r.scoreConfidence.startsWith("낮음");
  return '<tr data-key="'+escapeHtml(r.key)+'" tabindex="0" aria-label="'+escapeHtml(r.koName)+' 무기 평가 상세">'+
    '<td><input type="checkbox" data-compare-key="'+escapeHtml(r.key)+'" aria-label="비교 '+escapeHtml(r.koName)+'" '+(compareKeys.has(r.key)?"checked":"")+'></td>'+
    '<td class="grade">'+grade(r.score)+'</td><td><strong>'+escapeHtml(r.koName)+'</strong><span class="id">'+escapeHtml(r.weaponId)+'</span></td>'+
    '<td>'+escapeHtml(r.ammoKoName)+'</td><td>'+grade(r.combatScore)+'</td>'+
    '<td>'+cell(4)+'</td><td>'+cell(14)+'</td><td>'+cell(28)+'</td>'+
    '<td>'+escapeHtml(r.stage)+'</td><td><span class="rank-status">'+escapeHtml(r.supply.state)+'</span></td>'+
    '<td>'+escapeHtml(r.supply.kind)+(warn?' <span title="산탄·광역·특수피해 계산 제한" class="warn">⚠ 제한</span>':'')+'</td></tr>';
}
function render(){
  const a=filtered(),pages=Math.max(1,Math.ceil(a.length/pageSize));currentPage=Math.min(currentPage,pages);
  view=a;
  el("evalSummary").textContent=fmt(a.length,0)+"개 결과 · "+currentPage+"/"+pages+" 페이지 · 정렬: "+el("evalSort").selectedOptions[0].textContent;
  el("evalRows").innerHTML=a.slice((currentPage-1)*pageSize,currentPage*pageSize).map(tableRow).join("")||
    '<tr><td colspan="11">현재 필터 조합에 해당하는 후보가 없습니다.</td></tr>';
  el("evalPager").innerHTML=[1,currentPage-1,currentPage,currentPage+1,pages].filter((v,i,a)=>v>=1&&v<=pages&&a.indexOf(v)===i).sort((x,y)=>x-y)
    .map(n=>'<button data-page="'+n+'" '+(currentPage===n?'aria-current="page"':'')+'>'+n+'</button>').join("");
}
const link=(section,id,name)=>'<a class="rank-crosslink" href="../'+section+'/#'+
  (section==="items"?"item":section==="manufacture"?"recipe":"research")+'='+encodeURIComponent(id)+'">'+escapeHtml(name||id)+'</a>';
const field=(title,value)=>'<div class="box"><strong>'+title+'</strong>'+value+'</div>';
function production(row){
  if(!row)return "확인된 제조법 없음";
  const ingred=row.ingredients.length?row.ingredients.map(x=>escapeHtml(x.id)+" × "+fmt(x.qty,0)+" (기회비용 "+fmt(x.subtotal,0)+")").join("<br>"):"명시된 재료 목록 없음";
  return '<p>'+link("manufacture",row.id,row.id)+" · 1회 생산 "+fmt(row.producedQty,0)+"개 · 현금 "+fmt(row.cash,0)+"$ · 시간 "+fmt(row.engineerHours,0)+" 엔지니어시</p>"+
    '<p>재료: '+ingred+'</p><p>배치 재료 기회비용: '+fmt(row.materialCost,0)+"$ · X그로그 대체수익 상실: "+fmt(row.opportunityProfitLost,0)+
    '$ · 배치 실질 비용: <b>'+fmt(row.economicBatchTotal,0)+'$</b> · 완성품 개당: <b>'+fmt(row.economicTotal,2)+'$</b></p>'+
    '<p class="subtle">'+escapeHtml(row.completeness||"")+"</p>";
}
function detailExtras(r){
  const x=r.supply;
  const scenarios=r.type==="원거리"?'<table class="rank-detail-table"><tr><th>거리</th><th>경장갑</th><th>중간</th><th>중장갑</th><th>특수내성</th></tr>'+
    r.scenarios.map(s=>'<tr><td>'+s.distance+'칸</td>'+
      ["경장갑","중간 장갑","중장갑","특수내성"].map(a=>'<td>'+fmt(s.armor[a],1)+'</td>').join("")+'</tr>').join("")+'</table>':
    '<table class="rank-detail-table"><tr><th>공격</th><th>TU%</th><th>횟수</th><th>명중도대리</th><th>TU100 HP</th></tr>'+
      (r.actions||[]).map(a=>'<tr><td>'+escapeHtml(a.mode)+'</td><td>'+fmt(a.tu,0)+'</td><td>'+fmt(a.shots||1,0)+'</td><td>'+fmt(a.accuracy,2)+'</td><td>'+fmt(a.hp100Tu,1)+'</td></tr>').join("")+'</table>';
  const firemodes=r.modeScores.map(a=>escapeHtml(a.label||a.mode)+" TU "+fmt(a.tu,0)+" / TU100 "+fmt(a.tu100Hp??a.hp100Tu,1)).join(" · ");
  const research=x.researchIds.length?x.researchIds.map(id=>link("research",id,id)).join(" "):"확인된 직접 구매·연구 연결 없음";
  const manufactures=x.manufactureIds.length?x.manufactureIds.map(id=>link("manufacture",id,id)).join(" "):"명시된 제조 연결 없음";
  return '<section class="rank-dossier"><h2>제식 평가 · '+escapeHtml(r.koName)+'</h2><p class="rank-evidence">'+
    '규칙 확인과 추정 구분: '+escapeHtml(r.scoreConfidence)+' · '+escapeHtml(r.stageEvidence)+'</p>'+
    '<div class="detail-grid">'+field("제식점수 / 전투점수",grade(r.score)+" / "+grade(r.combatScore))+
    field("권장 행동",escapeHtml(r.bestMode))+
    field("현재 세이브 상태",escapeHtml(x.state))+
    field("제식 보급 분류",escapeHtml(x.kind))+'</div>'+
    '<h3>거리·대상별 TU100 체력 피해(모형값)</h3>'+scenarios+
    '<p class="subtle">실제 대표 표적 (전면 장갑 및 피해유형별 내성): '+escapeHtml((data.meta.simulation.armorValues||[]).map(([k,v])=>k+" · "+v.name+"("+v.id+", 장갑 "+v.frontArmor+")").join(" / "))+'</p>'+
    '<p class="subtle">발사 방식별 비교: '+firemodes+'</p>'+
    '<div class="detail-grid">'+field("무기 재고",x.gunStock==null?"내장 공격":fmt(x.gunStock,0))+
    field("탄약 재고",x.ammoStock==null?"자체/내장":fmt(x.ammoStock,0))+
    field("무기 구매가",fmt(r.weaponPrice,0))+
    field("발당 탄약비",fmt(r.costPerShot,2))+
    field("무게 / 장착칸",fmt(r.weight,0)+" / "+r.width+"×"+r.height)+
    field("손 사용",r.twoHanded?"양손":"한손/내장")+
    field("완전 제조원가",r.manufactureEconomics?fmt(r.manufactureEconomics.economicTotal,2)+"$/개":"해당 제조법 미확인")+
    field("점수의 근거",escapeHtml(r.scoreConfidence))+'</div>'+
    '<h3>기존 DB로 이동</h3><div class="rank-links">'+link("items",r.weaponId,"무기 상세 · "+r.weaponId)+
    (r.ammoId&&r.ammoId!==r.weaponId?link("items",r.ammoId,"탄약 상세 · "+r.ammoId):"")+'</div>'+
    '<h3>선행 연구</h3><div class="rank-links">'+research+'</div>'+
    (x.missingResearch.length?'<p>미완료 연구: '+x.missingResearch.map(escapeHtml).join(", ")+'</p>':'')+
    (x.unknownRequirements.length?'<p class="warn">구매 조건 검증 필요: '+x.unknownRequirements.map(escapeHtml).join(", ")+'</p>':'')+
    '<h3>제조DB / 원가</h3><div class="rank-links">'+manufactures+'</div>'+
    '<div class="rank-costs"><h4>무기 제조</h4>'+production(r.manufactureEconomics)+
    '<h4>탄약 제조</h4>'+production(r.ammoManufactureEconomics)+'</div>'+
    '<p class="subtle">실제 처치율, 과잉피해, 행동 차단, 반응사격, 광역 적 밀도, 도탄, 발화/기절 누적, 재장전 TU 등은 완전 시뮬레이션 결과가 아닙니다. 산탄·광역/특수탄의 순위는 검증 보류입니다.</p></section>';
}
function compareSelected(){
  const picks=[...compareKeys].map(key=>rows.find(r=>r.key===key)).filter(Boolean);
  if(picks.length<2)return;
  const fields=[
    ["제식 종합점수",r=>r.score],
    ["전투 점수",r=>r.combatScore],
    ["4칸 TU100 HP",r=>r.scenarios?.find(s=>s.distance===4)?.tu100Hp??r.dptu],
    ["14칸 TU100 HP",r=>r.scenarios?.find(s=>s.distance===14)?.tu100Hp??r.dptu],
    ["28칸 TU100 HP",r=>r.scenarios?.find(s=>s.distance===28)?.tu100Hp??null],
    ["중장갑·14칸",r=>r.scenarios?.find(s=>s.distance===14)?.armor?.["중장갑"]??null],
    ["특수내성·14칸",r=>r.scenarios?.find(s=>s.distance===14)?.armor?.["특수내성"]??null],
    ["무기 구매가",r=>r.weaponPrice],
    ["발당 탄약비",r=>r.costPerShot],
    ["제조 개당 실질비",r=>r.manufactureEconomics?.economicTotal??null],
    ["단계",r=>r.stage],
    ["SAV 상태",r=>r.supply.state]
  ];
  el("detailBody").innerHTML='<section class="rank-dossier"><h2>제식 무기·탄약 직접 비교</h2><p class="subtle">선택한 탄종은 각각 독립된 후보입니다. 미확인 비용은 0이 아닙니다.</p>'+
    '<div class="table-shell"><table class="rank-detail-table"><thead><tr><th>지표</th>'+
    picks.map(r=>'<th>'+escapeHtml(r.koName)+'<small>'+escapeHtml(r.ammoKoName||"")+'</small></th>').join("")+'</tr></thead><tbody>'+
    fields.map(([label,fn])=>'<tr><td>'+escapeHtml(label)+'</td>'+picks.map(r=>'<td>'+
      (typeof fn(r)==="string"?escapeHtml(fn(r)):fmt(fn(r),2))+'</td>').join("")+'</tr>').join("")+
    '</tbody></table></div></section>';
  el("detailDialog").showModal();
}
async function openRank(key){
  const r=rows.find(x=>x.key===key);
  if(!r)return;
  selected=r;
  try{
    const section=r.type==="근접"?"melee":"shooting";
    el("section").value=section;
    // Open the existing formula-rich inspector through its supported bridge.
    const bridge=window.XPWeaponDB;
    if(!bridge)throw Error("기본 무기DB가 아직 준비되지 않았습니다");
    await bridge.loadSection(section);
    await bridge.render();
    const original=bridge.findRows(section,r.weaponId,r.ammoId||r.weaponId);
    const best=original.find(x=>x.modeKo===r.bestMode)||original[0];
    if(best)await bridge.openDetail(best.id);
    else {
      el("detailBody").innerHTML="<h2>"+escapeHtml(r.koName)+"</h2>";
      el("detailDialog").showModal();
    }
    el("detailBody").insertAdjacentHTML("afterbegin",detailExtras(r));
  }catch(err){
    console.error(err);
    el("detailBody").innerHTML=detailExtras(r);
    el("detailDialog").showModal();
  }
}
async function start(){
  el("standardTab").onclick=()=>toggle(true);
  el("legacyTab").onclick=()=>toggle(false);
  try{
    if(typeof DecompressionStream!=="undefined"){
      try {
        const compressed=await fetch("../data/standard-evaluation.json.gz?v=20261018");
        if(compressed.ok)data=await new Response(compressed.body.pipeThrough(new DecompressionStream("gzip"))).json();
      }catch(e){console.warn("제식 평가 압축파일 대신 원본 데이터를 사용합니다",e)}
    }
    if(!data){
      const r=await fetch("../data/standard-evaluation.json?v=20261018");
      if(!r.ok)throw Error("제식 평가 데이터 파일 "+r.status);
      data=await r.json();
    }
    if(!data?.ranged?.length||!data?.melee?.length)throw Error("제식 평가 데이터가 비어 있습니다.");
    rows=[...data.ranged,...data.melee];
    initPanel();render();toggle(true);
  }catch(err){
    el("standardPanel").innerHTML='<p class="warn">제식 평가 로드 실패: '+escapeHtml(err.message)+"</p>";
    toggle(false);console.error(err);
  }
}
void start();
})();