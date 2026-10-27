import {initialState,eligibleTransformation,applyTransformation,findTransformationPath,structuralTransformationVerdict,reachableSoldierTypes,availableSoldierArmors} from "./eligibility.js";
import {modernSoldierProof} from "./save-adapter.js";
import {loadRuntime} from "../../db-runtime.js";
import {initModernSaveControls,renderModernSaveResults} from "./save-controls.js";
import {initFutureComparison} from "./compare-ui.js";
import {createStatEnvelope,advanceStatEnvelope} from "./stat-envelope.js";
import {eventScriptVerdict} from "./event-chronology.js";
import {renderStatEnvelope} from "./stat-envelope-ui.js";
import {GROWTH_PHASES,growStatEnvelope} from "./growth-envelope.js";
import {initBaselineGrowthComparison} from "./growth-compare-ui.js";
import {searchChronologicalRoute} from "./route-finder.js";
import {renderRareMapLootProof} from "./map-loot-ui.js";
let DATA=null;
let sort={key:"firing",dir:-1};
let previousTransformations=[];
let PLANNER_STATE=null,PLANNER_BOUNDS=null,PLANNER_ISSUES=[],CURRENT_PROOF=null,SAVE=null;
function selectedSaveProof(){
  if(!SAVE)return null;
  const b=Number($("#saveBase").value),s=Number($("#saveSoldier").value);
  if(!Number.isInteger(b)||!Number.isInteger(s))return null;
  return modernSoldierProof(DATA,SAVE,b,s);
}
function analysisOptions(){
  const base=CURRENT_PROOF?.kind==="proof"?CURRENT_PROOF.options:{};
  const current=!!CURRENT_PROOF&&$("#analysisMode").value==="current"&&!previousTransformations.length;
  return {...base,mode:current?"current":"future",statEnvelope:PLANNER_BOUNDS};
}
function transformationName(id){return GROWTH_PHASES[id]||DATA?.transformations?.find(x=>x.id===id)?.koName||id}
function initPlannerState(){
  PLANNER_BOUNDS=null;
  const profile=$("#plannerProfile").value||"base:"+($("#family").value||"STR_SOLDIER");
  CURRENT_PROOF=selectedSaveProof();
  let state=CURRENT_PROOF?.kind==="proof"?CURRENT_PROOF.state:initialState(DATA,profile);
  let bounds=createStatEnvelope(DATA,profile,{state:CURRENT_PROOF?state:null});
  PLANNER_ISSUES=CURRENT_PROOF?.kind==="proof"?[...CURRENT_PROOF.issues]:[];
  for(let i=0;i<previousTransformations.length;i++){
    const phase=previousTransformations[i];
    if(Object.prototype.hasOwnProperty.call(GROWTH_PHASES,phase)){
      if(state.retired||state.status!=="healthy"){
        PLANNER_ISSUES.push((i+1)+"단계 "+GROWTH_PHASES[phase]+" · 건강·현역 여부 미충족");
        continue;
      }
      bounds=growStatEnvelope(bounds,state,DATA,phase);
      state={...state,exactStats:false,remarks:[...state.remarks,
        "미래 전투/체력훈련 성장 가정: 달성 여부·소요 시간 미확정"]};
      continue;
    }
    const row=DATA.transformations.find(x=>x.id===previousTransformations[i]);
    if(!row){PLANNER_ISSUES.push("규칙에 없는 이력: "+previousTransformations[i]);continue;}
    const step=applyTransformation(row,state,DATA,{...analysisOptions(),mode:"future",statEnvelope:bounds});
    if(step.verdict.kind==="blocked")PLANNER_ISSUES.push((i+1)+"단계 "+transformationName(row.id)+": "+step.verdict.blockers.join(" · "));
    else{
      bounds=advanceStatEnvelope(row,bounds,DATA,state);
      state=step.state;
    }
  }
  PLANNER_STATE=state;
  PLANNER_BOUNDS=bounds;
}
function transformationVerdict(row){
  if(!PLANNER_STATE)initPlannerState();
  const structural=structuralTransformationVerdict(row,PLANNER_STATE,DATA);
  if(structural.kind==="blocked")return {kind:"blocked",
    label:"확정 제외 · "+structural.reason};
  const direct=eligibleTransformation(row,PLANNER_STATE,DATA,analysisOptions());
  if(direct.kind==="blocked"){
    if(analysisOptions().mode==="current")return {kind:"not-now",label:"현재 즉시 미충족 · "+direct.blockers.slice(0,2).join(" · ")};
    const witness=findTransformationPath(row.id,PLANNER_STATE,DATA,analysisOptions());
    if(witness.path.length)return {kind:"conditional",label:"선행 변신 경로 · "+witness.path.map(transformationName).join(" → ")+" (가상 가능성)"};
    return {kind:"unknown",label:"변신 경로 탐색 미완료 · "+direct.blockers.slice(0,2).join(" · ")};
  }
  const items=direct.conditions;
  return {...direct,label:(direct.kind==="eligible"?"현재 조건 확인":"미충족 조건")+
    (items.length?": "+items.slice(0,2).join(" · ")+(items.length>2?" 외 "+(items.length-2)+"건":""):"")};
}
function renderTransformationPlanner(){
  const active=$("#dataset").value==="transformations";
  $("#transformationPlanner").hidden=!active;
  if(!active)return;
  const profileSel=$("#plannerProfile"),current=profileSel.value;
  profileSel.disabled=!!SAVE;
  const family=$("#family").value;
  const profiles=DATA.profiles.filter(x=>!family||x.soldierType===family);
  const baseTypes=DATA.soldiers.filter(x=>!family||x.id===family);
  profileSel.innerHTML=baseTypes.map(x=>'<option value="base:'+esc(x.id)+'">'+esc(x.koName+" / 기본 바디 (초기 특성 없음)")+'</option>').join("")+
    profiles.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.soldierKoName+" / "+variantName(x))+'</option>').join("");
  const defaultId=family?"base:"+family:"base:STR_SOLDIER";
  const next=[...profileSel.options].some(x=>x.value===current)?current:([...profileSel.options].some(x=>x.value===defaultId)?defaultId:profileSel.options[0]?.value);
  if(next)profileSel.value=next;
  if(current&&current!==next)previousTransformations=[];
  initPlannerState();
  const sel=$("#previousTransformation"),old=sel.value;
  const candidates=DATA.transformations.map(x=>({x,v:transformationVerdict(x),step:eligibleTransformation(x,PLANNER_STATE,DATA,analysisOptions())}))
    .sort((a,b)=>(a.v.kind==="blocked")-(b.v.kind==="blocked")||a.x.koName.localeCompare(b.x.koName,"ko"));
  const selectAllowed=c=>c.step.kind!=="blocked"&&
    (analysisOptions().mode!=="current"||c.step.kind==="eligible");
  sel.innerHTML=candidates.map(({x,v,step})=>'<option value="'+esc(x.id)+'"'+(!selectAllowed({step})?' disabled':'')+
    '>'+esc(x.koName+" ["+(v.kind==="blocked"?"계보상 제외":step.kind==="blocked"?"선행 필요":step.kind==="conditional"?"근거 미확정":"현재 충족")+"]")+'</option>').join("");
  const preferred=candidates.find(x=>x.x.id===old&&selectAllowed(x));
  if(preferred)sel.value=old;else if(candidates.some(selectAllowed))sel.value=candidates.find(selectAllowed).x.id;
  const canGrow=PLANNER_BOUNDS?.kind==="ready"&&
    !PLANNER_STATE.retired&&PLANNER_STATE.status==="healthy";
  $("#addBattleGrowth").disabled=!canGrow;
  $("#addPhysicalGrowth").disabled=!canGrow;
  const selection=DATA.transformations.find(x=>x.id===sel.value);
  const selectionVerdict=selection?eligibleTransformation(selection,PLANNER_STATE,DATA,analysisOptions()):{kind:"blocked"};
  $("#addTransformation").disabled=!selection||selectionVerdict.kind==="blocked"||
    (analysisOptions().mode==="current"&&selectionVerdict.kind!=="eligible");
  $("#transformationHistory").innerHTML=previousTransformations.map((id,i)=>
    '<button type="button" data-remove-index="'+i+'">'+(i+1)+'. '+esc(transformationName(id))+' ×</button>').join("")||
    '<span class="muted">변신을 추가하면 실제 실행 순서대로 재판정합니다.</span>';
  if(PLANNER_ISSUES.length)$("#transformationHistory").innerHTML+='<p class="delta-neg">'+PLANNER_ISSUES.map(esc).join(" · ")+'</p>';
  const excluded=candidates.filter(x=>x.v.kind==="blocked").length;
  const reachable=reachableSoldierTypes(DATA,PLANNER_STATE.soldierType);
  const unreachable=candidates.filter(x=>x.v.kind==="blocked"&&
    !(x.x.allowedSoldierTypes||[]).some(id=>reachable.has(id))).length;
  const unavailable=candidates.filter(x=>x.v.kind==="blocked"&&(x.x.requires||[]).includes("STR_UNAVAILABLE")&&
    (x.x.allowedSoldierTypes||[]).some(id=>reachable.has(id))).length;
  const historical=excluded-unreachable-unavailable;
  const unresolved=candidates.filter(x=>x.v.kind==="unknown").length;
  const notNow=candidates.filter(x=>x.v.kind==="not-now").length;
  const ready=candidates.filter(x=>x.v.kind==="eligible").length;
  $("#transformationVerdict").textContent="현재 계보 "+PLANNER_STATE.soldierType+" · 순서 "+previousTransformations.length+
    "단계 · 확정 제외 "+excluded+"개 (병종 계보 "+unreachable+" · 내부 전용 "+unavailable+" · 이력·선행 불가 "+historical+") · 현재 미충족 "+notNow+"개 · 조건 미확정 "+unresolved+"개 · 현재 판정 충족 "+ready+"개. 이후 단계는 자원 소모·미래 연구를 확정하지 않습니다.";
  renderModernSaveResults(candidates,CURRENT_PROOF,analysisOptions().mode,previousTransformations.length);
  renderStatEnvelope($("#statEnvelopeContent"),PLANNER_BOUNDS,PLANNER_STATE,DATA,previousTransformations,analysisOptions());
}
function routeFinderWorld(proof){
  if(proof?.kind!=="proof"||!SAVE)return null;
  return {
    month:SAVE.monthsPassed,
    researched:new Set(SAVE.research.completed||[]),
    disabled:new Set(SAVE.research.disabled||[]),
    // Missing generatedEvents is UNKNOWN, never an empty completed list.
    generatedEvents:SAVE.generatedEvents,
    // Inventory is that of the SELECTED BASE only. Never pool two bases.
    items:Object.fromEntries(proof.base.items||[]),
    baseFunctions:new Set(proof.options.baseFunctions||[]),
    funds:SAVE.funds,
    evidenceComplete:proof.base.itemsComplete&&proof.state.exactStats&&
      proof.options.medalsKnown&&proof.soldier.historyComplete&&
      proof.options.fundsKnown,
    soldiers:[{id:"selected",state:proof.state,
      commendations:proof.options.commendations||{}}]
  };
}
export function showRouteSearchResult(result){
  const root=$("#routeSearchResult");
  if(!result)return;
  const heading={
    witness:"범위 내 시간순 정합성 확인 (실행 성공 보장은 아님)",
    conditional:"조건부 경로 · 가정 또는 미확인 자료 존재",
    excluded:"동일 대원 계보에서 확정 제외",
    inconclusive:"제한 탐색으로는 경로 미발견 · 영구 불가능 증거 아님",
    unverified:"검증 입력이 부족합니다"
  }[result.kind]||"검증 상태 미확인";
  const label=step=>{
    if(step.type==="research")return "연구 완료: "+step.id;
    if(step.type==="transform")return "동일 대원 변신: "+
      transformationName(step.transform)+" ("+step.transform+")";
    if(step.type==="manufacture")return (step.assumeOutcome?"확률 제조 보상 가정: ":"현재 기지에서 제조: ")+
      step.item+" ×"+step.count+" / "+step.recipe+
      (step.assumeOutcome?" · 보상 가중치 "+step.weight+"/"+step.weightTotal+
        " (개별 제조 성공 보장 아님)":"");
    if(step.type==="freeResearch")return "원천 연구 완료 시 무료 보상: "+
      step.source+" → "+step.research+(step.assumeOutcome?" (RNG 가정)":"");
    if(step.type==="eventResearch")return "이벤트 연구 보상 가정: "+
      step.event+" → "+step.research+(step.assumeOutcome?" (발생·추첨 보장 아님)":"");
    if(step.type==="advanceMonth")return "월 진행 가정: "+step.month+
      "개월 (유지비·새 이벤트·재료 소모 미검증)";
    return step.type;
  };
  root.innerHTML='<p><strong>'+esc(heading)+'</strong></p>'+
    (result.steps?.length?'<ol>'+result.steps.map(step=>
      '<li>'+esc(label(step))+'</li>').join("")+'</ol>':"")+
    (result.reason?.length?'<p class="muted">'+result.reason.map(esc).join(" · ")+'</p>':"")+
    (result.assumptions?.length?'<p class="muted"><strong>미증명 전제:</strong> '+
      [...new Set(result.assumptions)].slice(0,8).map(esc).join(" · ")+'</p>':"")+
    (result.topBlocks?.length?'<p class="muted">탐색 중 차단 근거: '+
      result.topBlocks.slice(0,4).map(x=>esc(x.reason)).join(" · ")+'</p>':"")+
    (result.pools?'<p class="muted">경로 후보: 변신 '+result.pools.transforms+
      ' / 연구 '+result.pools.research+' / 제조 '+result.pools.recipes+
      ' (확률 보상 '+(result.pools.randomRecipes||0)+
      ' · 변형이 겹쳐 보류 '+(result.pools.ambiguousRandomRecipes||0)+')'+
      ' / 가정한 이벤트 후보 '+result.pools.eventScenarios+
      ' · 실제 검사 상태 '+(result.deterministic?.examined||0)+
      '개 · 탐색 예산 제한 '+(result.searchLimits?.maxDepth||0)+'단계'+
      (!result.sourceComplete?" · 일부 후보가 예산 밖에 있음":"")+'</p>':"")+
    '<p class="muted">보장하지 않는 영역: 전투 경험치 성장, 임무 전리품, 구매·건설, 월 유지비·진행 중인 별도 이벤트, 향후 RNG, 연구실 프로젝트 실제 노출. 확률 제조와 월 진행은 항상 조건부이며, 경로 미발견을 확정 상호배제로 해석하지 마세요.</p>';
}
function initRouteFinder(){
  const picker=$("#routeSearchTarget");
  picker.innerHTML=[...(DATA.transformations||[])].sort((a,b)=>a.koName.localeCompare(b.koName,"ko"))
    .map(x=>'<option value="'+esc(x.id)+'">'+esc(x.koName+" / "+x.id)+'</option>').join("");
  $("#routeSearchButton").onclick=async()=>{
    const proof=selectedSaveProof(),out=$("#routeSearchResult");
    if(!SAVE||proof?.kind!=="proof"){
      out.textContent="현재 대원의 연구·재료·변신 경로를 검증하려면 2.1 세이브를 먼저 선택해야 합니다.";
      return;
    }
    const goal=picker.value;
    if(!DATA.transformations.some(x=>x.id===goal)){
      out.textContent="목표 변신의 원본 규칙을 찾을 수 없습니다.";return;
    }
    out.textContent="실제 저장본의 연구·이벤트·기지 재료와 변신 순서를 대조하는 중입니다.";
    // Yield a paint before bounded CPU search. No external request or upload.
    await new Promise(resolve=>setTimeout(resolve,0));
    try{
      const world=routeFinderWorld(proof);
      const result=searchChronologicalRoute(DATA,world,{soldierId:"selected",
        goals:[goal],maxStates:170,maxDepth:10,maxAttempts:3400});
      showRouteSearchResult(result);
    }catch(e){
      out.textContent="자동 경로 판정 불완전: "+e.message;
    }
  };
  picker.onchange=()=>{
    $("#routeSearchResult").textContent="목표 변신이 변경되었습니다. 현재 세이브로 다시 경로를 계산할 수 있습니다.";
  };
}
function initTransformationPlanner(){
  $("#plannerProfile").onchange=()=>{previousTransformations=[];render()};
  $("#addTransformation").onclick=()=>{
    const id=$("#previousTransformation").value,row=DATA.transformations.find(x=>x.id===id);
    if(!row)return;
    const verdict=eligibleTransformation(row,PLANNER_STATE,DATA,analysisOptions());
    if(verdict.kind!=="blocked"&&(analysisOptions().mode!=="current"||verdict.kind==="eligible")){
      previousTransformations.push(id);render();
    }
  };
  $("#clearTransformations").onclick=()=>{previousTransformations=[];render()};
  $("#addBattleGrowth").onclick=()=>{
    previousTransformations.push("@BATTLE_GROWTH");render();
  };
  $("#addPhysicalGrowth").onclick=()=>{
    previousTransformations.push("@PHYS_TRAINING");render();
  };
  $("#compatibleOnly").onchange=render;
  $("#plannerMonth").onchange=render;
  $("#transformationHistory").onclick=e=>{
    const b=e.target.closest("[data-remove-index]");
    if(b){previousTransformations.splice(Number(b.dataset.removeIndex),1);render()}
  };
}
const $=q=>document.querySelector(q);
const fmt=n=>n==null||Number.isNaN(Number(n))?"—":Number(n).toLocaleString("ko-KR",{maximumFractionDigits:1});
const pct=n=>n==null?"—":(Number(n)*100).toFixed(2)+"%";
const statOrder=["tu","stamina","health","bravery","reactions","firing","throwing","strength","psiStrength","psiSkill","melee","mana"];
const sourceLabel={direct:"직접 고용",manufacture:"고용·제조",event:"이벤트"};
function variantName(r){const n=(r.sourceKoName||"").replace(/^(고용|Recruitment|직접 고용)\s*[:：·-]?\s*/i,"").trim();return r.sourceType==="direct"?r.soldierKoName:(n||r.sourceKoName||r.soldierKoName)}
function familyCount(id){return DATA.profiles.filter(x=>x.soldierType===id).length}
function dbLink(area,id,label){const hash=area==='manufacture'?'#recipe=':area==='research'?'#research=':'#item=';return '<a class="db-link" href="../../'+area+'/'+hash+encodeURIComponent(id)+'" onclick="event.stopPropagation()">'+esc(label)+'</a>'}

async function load(){
  DATA=await loadRuntime("../../data/soldiers-modern-index.json");
  const family=$("#family");family.innerHTML='<option value="">모든 기본 병종</option>'+DATA.soldiers.filter(x=>DATA.profiles.some(p=>p.soldierType===x.id)).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.koName)+' ('+familyCount(x.id)+')</option>').join("");
  const params=new URLSearchParams(location.search);if(params.has("family"))family.value=params.get("family");if(params.has("q"))$("#search").value=params.get("q");
  if(["profiles","soldiers","transformations"].includes(params.get("dataset")))$("#dataset").value=params.get("dataset");
  renderSummary();
  renderRareMapLootProof($("#rareMapLootProof"),DATA);
  const futureComparison=initFutureComparison(DATA);
  initBaselineGrowthComparison(DATA);
  initModernSaveControls(DATA,(save,proof)=>{
    SAVE=save;
    if(save?.monthsPassed!=null)$("#plannerMonth").value=String(save.monthsPassed);
    else if(!save)$("#plannerMonth").value="";
    futureComparison?.setSave(save);
    CURRENT_PROOF=proof;
    $("#routeSearchResult").textContent=save?"대원이 변경되었습니다. 목표 변신을 선택해 경로를 자동 탐색할 수 있습니다.":"세이브를 불러오면 연구·기지 재료와 변신 순서를 검증합니다.";
    previousTransformations=[];
    if(proof?.kind==="proof"){
      $("#family").value=proof.state.soldierType;
      $("#dataset").value="transformations";
    }
    render();
  });
  initTransformationPlanner();
  initRouteFinder();
  render();
  const deepProfile=params.get("profile");
  if(deepProfile&&DATA.profiles.some(p=>p.id===deepProfile)){
    $("#dataset").value="profiles";render();openDetail(encodeURIComponent(deepProfile));
  }
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
  return DATA.profiles.map(x=>({...x,_mode:"profile",_name:variantName(x),_id:x.sourceId,_route:x.sourceKoName}));
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
    row._name,row._id,row._route,row.soldierKoName,row.soldierType,row.sourceId,row.sourceEnName,row.soldierBonusType,row.producedSoldierType,
    ...(row.traitNames||[]),...(row.traits||[]).flatMap(t=>[t.koName,t.enName,t.id]),
    ...(row.requires||[]),...(row.allowedSoldierTypes||[]),...(row.requiredPreviousTransformations||[]),
    ...(row.forbiddenPreviousTransformations||[])
  ].filter(Boolean).join(" ").toLowerCase();
}
function filtered(){
  const q=$("#search").value.trim().toLowerCase();
  const traitsOnly=$("#traitsOnly").checked;
  const family=$("#family").value;
  let a=dataset().filter(r=>!family||(r._mode==="profile"?r.soldierType:r._mode==="soldier"?r.id:family)===family).filter(r=>(!q||searchBlob(r).includes(q))&&(!traitsOnly||r._mode==="profile"&&r.traitNames.length)&&!(r._mode==="transformation"&&$("#compatibleOnly").checked&&transformationVerdict(r).kind==="blocked"));
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
  renderTransformationPlanner();
  $("#tableTitle").textContent=
    mode==="profiles"?"실제 획득형 — 초기 특성 포함 실전 스펙":
    mode==="soldiers"?"기본 바디 규칙 — 내부 RuleSoldier 29종":
    "변신·훈련 루트 — 고정 변화량";
  const visibleStats=$("#statView").value==="all"?statOrder:["tu","health","reactions","firing","strength"];
  let head;
  if(mode==="profiles"){
    head=[
      th("생성형 / 기본 병종","name"),'<th>얻는 방법 · 자동 특성</th>',th("비용","cost"),th("시간","time"),
      ...visibleStats.map(k=>th(DATA.statLabels[k],k,"능력 / 성장캡"))
    ].join("");
  }else if(mode==="soldiers"){
    head=[
      th("기본 바디","name"),'<th>해금 조건</th>',th("구매가","costBuy"),th("월급","costSalary"),
      ...visibleStats.map(k=>th(DATA.statLabels[k],k,"능력 / 성장캡"))
    ].join("");
  }else{
    head=[
      th("변신/훈련","name"),'<th>적용 대상·특성</th>',th("비용","cost"),th("회복","recoveryTime"),
      ...visibleStats.map(k=>th("Δ "+DATA.statLabels[k],k))
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
  // Table rows are replaced on every filter/render; handle clicks on the stable
  // tbody instead of attaching to every transient row (or another table).
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
    const verdict=transformationVerdict(r);
    second='<span class="route">적용 '+(r.allowedSoldierTypes?.length||0)+'종</span><br>'+trait+' '+produced+'<br><span class="'+(verdict.kind==="blocked"?'delta-neg':'muted')+'">'+esc(verdict.label)+'</span>';
    c1=fmt(r.cost);c2=fmt(r.recoveryTime);
  }
  return '<tr data-row="'+id+'"><td><span class="name">'+esc(r._name)+'</span>'+(r._mode==="profile"?'<span class="family">기본 병종: '+esc(r.soldierKoName)+' · 같은 병종 '+familyCount(r.soldierType)+'종</span>':"")+'<span class="id">'+esc(r._id)+'</span></td><td>'+second+'</td><td>'+c1+'</td><td>'+c2+'</td>'+
    ($("#statView").value==="all"?statOrder:["tu","health","reactions","firing","strength"]).map(k=>{
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
function armorRouteSummary(armor){
  if(!armor.storeItem||armor.storeItem==="STR_NONE")return "기본/특수 방어구 · 일반 아이템 입수 경로 없음";
  const supply=DATA.itemSupply?.[armor.storeItem];
  if(!supply?.exists)return "아이템 경로가 확인되지 않음";
  const sources=[];
  if(supply.buyCost>0)sources.push("구매 규칙 "+fmt(supply.buyCost));
  if(supply.manufacture?.length)sources.push("제조법 "+supply.manufacture.length+"개 (재료·연구 미검증)");
  if(supply.randomManufacture?.length)sources.push("확률 제조 "+supply.randomManufacture.length+"경로");
  if(supply.researchGrants?.length)sources.push("연구 지급 "+supply.researchGrants.length+"경로");
  if(supply.eventGrants?.length)sources.push("이벤트 보상 "+supply.eventGrants.length+"경로");
  return (sources.length?sources.join(" / "):"획득 경로 미증명 · 전리품 별도 조사")+
    ((armor.requires||[]).length?" · 필수 연구 "+armor.requires.join(", "):"");
}
function armorProfilePreview(profileId){
  const state=initialState(DATA,profileId);
  const armorList=availableSoldierArmors(state,DATA)
    .filter(a=>a.storeItem&&a.storeItem!=="STR_NONE");
  const keys=["tu","health","reactions","firing","strength","stamina","melee","psiStrength","mana"];
  const cards=keys.map(key=>{
    const best=[...armorList].sort((a,b)=>(b.stats[key]||0)-(a.stats[key]||0))[0];
    if(!best||!(best.stats[key]>0))return "";
    return '<div class="box"><strong>'+esc(DATA.statLabels[key])+
      ' · 최고 장비 보정 +'+fmt(best.stats[key])+'</strong><div>'+esc(best.koName)+'</div>'+
      '<small>'+esc(best.id)+' · '+esc(best.storeItem)+'</small>'+
      '<p class="muted">'+esc(armorRouteSummary(best))+'</p></div>';
  }).filter(Boolean);
  return '<section class="armor-preview"><h3>미래 방어구 단일 슬롯별 최대 보정 후보</h3>'+
    '<p class="muted">동일 대원은 방어구를 한 벌만 착용합니다. 아래 각 능력치의 1위 방어구는 서로 다를 수 있어 동시 합산할 수 없습니다. 연구·제조·전리품 획득을 보장하지 않으므로 최종 능력치에는 확정 반영하지 않습니다.</p>'+
    '<div class="detail-grid">'+cards.join("")+'</div></section>';
}
function eventGateDetails(ids){
  const sources=[...new Set(ids||[])].flatMap(id=>(DATA.eventResearchSources?.[id]||[]).map(route=>({id,route})));
  if(!sources.length)return "";
  const opts=analysisOptions();
  const researched=new Set(opts.researched||[]),disabled=new Set(opts.disabled||[]);
  const monthRaw=$("#plannerMonth").value;
  const month=monthRaw===""?null:Number(monthRaw);
  const lines=sources.slice(0,24).map(({id,route})=>{
    const scripts=route.scripts||[];
    const html=scripts.slice(0,7).map(script=>{
      const verdict=eventScriptVerdict({...script,eventId:route.event},{
        month,researched,disabled,
        // Imported saves have partial item/one-time history, so DO NOT assert
        // their absence. Unknown inputs remain conditional.
        items:null,facilities:null,generatedEvents:null
      },{mode:"future"});
      const label=verdict.kind==="blocked"?"경로 차단":
        verdict.kind==="eligible"?"입력 조건 일치":"미확정 · 조건부";
      const conditions=[...verdict.blocked,...verdict.pending,...verdict.unknown];
      const weight=verdict.weight===null?"월별 가중치 미확인":
        "월별 가중치 "+verdict.weight+"/"+verdict.totalWeight;
      return '<div class="box"><strong>'+esc(script.script)+' · '+esc(label)+'</strong>'+
        '<p class="muted">'+esc(weight)+' · 실행 시도 확률 '+esc(script.executionOdds)+'%'+
        ' · '+esc(script.mode)+'</p>'+
        '<p>필수 연구 '+esc((script.researchPositive||[]).join(", ")||"없음")+
        ' · 금지 연구 '+esc((script.researchNegative||[]).join(", ")||"없음")+'</p>'+
        conditions.slice(0,8).map(x=>'<p class="muted">'+esc(x)+'</p>').join("")+
        (conditions.length>8?'<p class="muted">추가 조건 '+(conditions.length-8)+'개</p>':"")+
        '</div>';
    }).join("")||'<p class="muted">관련 월간 이벤트 발생 스크립트를 찾지 못했습니다. 미증명 상태입니다.</p>';
    return '<section><h3>'+esc(id)+' ← '+esc(route.event)+'</h3>'+
      '<p class="muted">이 이벤트의 연구 보상 '+route.choiceCount+'개 중 1개를 추첨. 보상 목록은 확정 획득 증거가 아닙니다.</p>'+html+'</section>';
  }).join("");
  return '<details class="technical"><summary>연구 직접 지급 이벤트 · 시간순 상호배제 '+sources.length+'경로</summary>'+
    '<p>현재 비교 월: '+(month===null?"미지정":month+"개월")+
    ' · 세이브는 이 화면의 판정에만 사용합니다. 무작위 이벤트·임무·아이템 공급은 미증명으로 유지합니다.</p>'+
    lines+(sources.length>24?'<p class="muted">나머지 '+(sources.length-24)+'개 경로는 데이터에 보존되어 있습니다.</p>':"")+'</details>';
}
function openDetail(encoded){
  const r=findRow(encoded);if(!r)return;
  let html='<p class="eyebrow">'+(r._mode==="profile"?"실제 획득형":r._mode==="soldier"?"기본 바디 규칙":"변신·훈련 루트")+'</p><h2>'+r._name+'</h2><p class="muted">'+r._id+'</p>';
  if(r._mode==="profile"){
    html+='<div class="detail-grid"><div class="box"><strong>획득 루트</strong>'+sourceBadges(r)+'<br>'+r.sourceKoName+'<br><small>'+r.sourceId+'</small></div><div class="box"><strong>비용 / 시간</strong>'+fmt(r.cost)+' / '+fmt(r.time)+'</div><div class="box"><strong>내부 바디</strong>'+r.soldierType+'<br><small>장갑 '+String(r.armor||"—")+'</small></div></div>';
    html+='<p class="identity-line">기본 병종 <b>'+esc(r.soldierKoName)+'</b> → 파생 획득형 <b>'+esc(variantName(r))+'</b></p>';
    const origin=initialState(DATA,r.id);
    const previous=[...origin.history.keys()];
    const reachable=reachableSoldierTypes(DATA,origin.soldierType);
    const inheritedConflicts=DATA.transformations.filter(t=>
      !(t.requires||[]).includes("STR_UNAVAILABLE")&&
      (t.allowedSoldierTypes||[]).some(id=>reachable.has(id))&&
      (t.forbiddenPreviousTransformations||[]).some(id=>origin.history.has(id)));
    const inheritedPermanent=inheritedConflicts.filter(t=>
      structuralTransformationVerdict(t,origin,DATA).kind==="blocked");
    const inheritedResettable=inheritedConflicts.filter(t=>
      structuralTransformationVerdict(t,origin,DATA).kind!=="blocked");
    const showTags=xs=>xs.length?xs.map(t=>'<span class="tag">'+esc(t.koName)+'</span>').join(" "):
      '<span class="muted">없음</span>';
    html+='<div class="box"><strong>획득 즉시 이미 수행한 변신 '+previous.length+'개</strong><p>'+
      (previous.length?previous.map(id=>'<span class="tag">'+esc(transformationName(id))+'</span>').join(" "):'<span class="muted">이전 변신 이력 없음</span>')+
      '</p><strong>초기 이력으로 인해 영구 제외 '+inheritedPermanent.length+'개</strong><p>'+showTags(inheritedPermanent)+
      '</p><strong>이력 초기화 뒤 재검토 가능한 충돌 '+inheritedResettable.length+'개</strong><p>'+showTags(inheritedResettable)+
      '</p><small>초기 변신 이력과 병종 전환·초기화 경로를 함께 검사했습니다. 단순 이력 충돌을 자동으로 영구 제외 처리하지 않습니다.</small></div>';
    html+='<button type="button" id="inspectAcquisitionRoute" data-profile-id="'+esc(r.id)+'">이 획득형의 미래 변신 경로 분석</button>';
    html+='<div class="cross-links">'+(r.sourceType==="manufacture"?dbLink("manufacture",r.sourceId,"제조 DB: 영입 방법"):"")+dbLink("items",r.sourceId,"아이템 DB")+(r.requires||[]).map(x=>dbLink("research",x,"연구: "+x)).join("")+'</div>';
    html+='<h3>같은 기본 병종의 획득형 비교</h3><div class="related-list">'+DATA.profiles.filter(x=>x.soldierType===r.soldierType).map(x=>'<button class="related-item" type="button" data-profile="'+esc(x.id)+'">'+esc(variantName(x))+' <small>'+esc(x.traits.map(t=>t.koName).join(" · ")||"자동 특성 없음")+'</small></button>').join("")+'</div>';
    html+=statsGrid("특성 적용 전 생성 스펙",r.currentStatsBeforeTraits);
    html+=statsCapGrid("자동 특성 포함 능력치 / 성장캡",r);
    html+=armorProfilePreview(r.id);
    html+='<h3>생성 시 자동 특성</h3><div class="traits">'+(r.traits.length?r.traits.map(t=>'<div class="trait-card"><strong>'+t.koName+'</strong><small>'+t.id+'</small><div>'+statOrder.filter(k=>t.stats[k]).map(k=>DATA.statLabels[k]+" "+(t.stats[k]>0?"+":"")+t.stats[k]).join(" · ")+'</div></div>').join(""):'<span class="muted">없음</span>')+'</div>';
    html+='<details class="technical"><summary>원본 생성 규칙 확인</summary><pre>'+esc(JSON.stringify({currentStats:r.currentStatsOverride,previousTransformations:r.previousTransformations,requires:r.requires},null,2))+'</pre></details>';
  }else if(r._mode==="soldier"){
    html+='<div class="detail-grid"><div class="box"><strong>구매 / 월급</strong>'+fmt(r.costBuy)+' / '+fmt(r.costSalary)+'</div><div class="box"><strong>월 고용 제한</strong>'+fmt(r.monthlyBuyLimit)+'</div><div class="box"><strong>기본 장갑</strong>'+String(r.armor||"—")+'</div></div>';
    html+=statsGrid("기본 생성 최소", {min:r.minStats,avg:r.minStats,max:r.minStats});
    html+=statsGrid("기본 생성 평균", {min:r.avgStats,avg:r.avgStats,max:r.avgStats});
    html+=statsGrid("기본 생성 최대", {min:r.maxStats,avg:r.maxStats,max:r.maxStats});
    html+='<h3>성장 상한</h3><div class="stats-grid">'+statOrder.map(k=>'<div class="statbox"><small>'+DATA.statLabels[k]+'</small><b>'+fmt(r.statCaps[k])+'</b><small>훈련 '+fmt(r.trainingStatCaps[k])+'</small></div>').join("")+'</div>';
  }else{
    const verdict=transformationVerdict(r);
    html+='<div class="box"><strong>현재 검증 판정</strong><p class="'+(verdict.kind==="blocked"?'delta-neg':'muted')+'">'+esc(verdict.label)+"</p><small>검증되지 않은 경로는 최종 능력치 합산에서 사용하면 안 됩니다.</small></div>";
    const path=findTransformationPath(r.id,PLANNER_STATE||initialState(DATA,"base:STR_SOLDIER"),DATA);
    html+='<div class="box"><strong>필수 선행·병종 변환 자동 경로</strong><p>'+(path.path.length?path.path.map(transformationName).map(esc).join(" → "):esc(path.reason||""))+'</p><small>'+(path.path.length?"구성 가능한 변신 순서 후보입니다. 연구·재료·훈장 등 획득 전제는 확정 검증이 아닙니다.":"찾지 못한 경로가 불가능하다는 뜻은 아닙니다.")+'</small></div>';
    html+='<div class="detail-grid"><div class="box"><strong>비용 / 회복</strong>'+fmt(r.cost)+' / '+fmt(r.recoveryTime)+'일</div><div class="box"><strong>적용 병종</strong>'+(r.allowedSoldierTypes||[]).length+'종</div><div class="box"><strong>생산 Soldier Type</strong>'+String(r.producedSoldierType||"유지")+'</div></div>';
    deltaGrid("직접 Flat 스탯 변화",r.flatOverallStatChange);
    deltaGrid("부여 특성의 스탯",r.traitStats);
    deltaGrid("고정 변화 + 신규 특성 (중복 특성은 재합산 금지)",r.fixedEffectiveDelta);
    html+='<h3>성장분 비례 변화</h3><p class="muted">변화량은 참고용입니다. 비례 변화·재굴림·상한·중복 특성·병종 변경을 무시한 단순 합산을 최종 수치로 사용하지 않습니다.</p>';
    deltaGrid("성장분 비율 (%)",r.percentGainedStatChange);
    deltaGrid("현재 능력치 비율 (%)",r.percentOverallStatChange);
    html+='<p class="muted">변신 이후 병종 '+esc(r.producedSoldierType||"유지")+' · 이력 초기화 '+(r.reset?"예":"아니요")+' · 복제 '+(r.createsClone?"예":"아니요")+'</p>';
    html+='<div class="detail-grid"><div class="box"><strong>필요 연구</strong>'+(r.requires||[]).map(x=>'<span class="tag">'+x+'</span>').join(" ")+'</div><div class="box"><strong>필수 이전 변환</strong>'+(r.requiredPreviousTransformations||[]).map(x=>'<span class="tag">'+x+'</span>').join(" ")+'</div><div class="box"><strong>금지 이전 변환</strong>'+(r.forbiddenPreviousTransformations||[]).map(x=>'<span class="tag">'+x+'</span>').join(" ")+'</div></div>';
    html+=eventGateDetails(r.requires);
  }
  $("#detailBody").innerHTML=html;
  $("#detailBody").querySelectorAll("[data-profile]").forEach(b=>b.onclick=()=>openDetail(encodeURIComponent(b.dataset.profile)));
  const inspect=$("#inspectAcquisitionRoute");
  if(inspect)inspect.onclick=()=>{$("#detailDialog").close();$("#dataset").value="transformations";$("#family").value=r.soldierType;previousTransformations=[];render();$("#plannerProfile").value=r.id;render()};
  if(!$("#detailDialog").open)$("#detailDialog").showModal();
}
function esc(s){return String(s).replace(/[&<>]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[m]))}

["search","dataset","family","statView","band","sortMetric","traitsOnly"].forEach(id=>$("#"+id).addEventListener(id==="search"?"input":"change",render));
$("#soldierTable tbody").addEventListener("click",e=>{
  const row=e.target.closest("tr[data-row]");
  if(row&&e.currentTarget.contains(row))openDetail(row.dataset.row);
});
$("#closeDialog").addEventListener("click",()=>$("#detailDialog").close());
$("#detailDialog").addEventListener("click",e=>{if(e.target.id==="detailDialog")e.currentTarget.close()});
load().catch(err=>{$("#summary").innerHTML='<article class="card metric"><strong>데이터 로드 실패</strong><span>'+err.message+'</span></article>';console.error(err)});
