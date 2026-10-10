import {initialState,evaluate,apply,replay,addWithPrerequisites,findResearchConflicts,compileRelations,excludedByPrior,exclusionChanges,traitStatsOf,traitSortValue} from "./planner.js";
import {buildChoiceIndex,parseCompletedResearch} from "../captains/choice-simulator-core.js";
import {trainingRouteGate,routeEventReport} from "./route-gates.js";
import {buildStagedCaptainContext,validateCaptainStages} from "./staged-captain.js";
import {routeContext as buildResearchRouteContext,trainingRouteAccess} from "./route-access.js";

const $=selector=>document.querySelector(selector);
const esc=x=>String(x??"").replace(/[&<>"']/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[s]));
const n=x=>Number(x||0).toLocaleString("ko-KR");
const list=x=>Array.isArray(x)?x:[];
const sum=(a,b)=>{const out={...a};for(const [k,v] of Object.entries(b||{}))out[k]=(out[k]||0)+Number(v||0);return out};
const entries=o=>Object.entries(o||{}).filter(([,v])=>typeof v==="number"&&v!==0);
const textStats=(stats,labels)=>entries(stats).map(([k,v])=>(labels[k]||k)+(v>0?"+":"")+v).join(" · ")||"변화 없음";
let DATA,ACCESS,choiceIndex,routeContext,researchRouteContext,byId,relations,origins,selected=[],latestAdded=[],state,origin,rows,statLabels;
let selectedCompanions=new Set(),codexChoice="",saintGoal=false;
const rankStat=t=>textStats(t.flatOverallStatChange,statLabels);
const bonusStats=t=>traitStatsOf(t,DATA.bonuses);
const typeName=id=>DATA.soldiers.find(s=>s.id===id)?.koName||id;
const name=id=>byId.get(id)?.koName||DATA.researchGraph[id]?.koName||DATA.bonuses[id]?.koName||typeName(id);
const researchLabel=id=>DATA.researchGraph[id]?.koName||name(id);
const evidenceEventLink=(id,label)=>'<a class="name-link" href="../events/#event='+encodeURIComponent(id)+'" target="_blank" rel="noopener">'+esc(label||id)+'</a> <span class="tiny">'+esc(id)+'</span>';
function researchRouteOptions(){
  const options={captain:routeContext?.route?.second||routeContext?.route?.first||""};
  for(const group of DATA.routeChoices||[]){
    if(group.id==="captain"||group.id==="codex")continue;
    options[group.id]=$("#research-route-"+group.id)?.value||"";
  }
  options.codex=codexChoice?"STR_CODEX_"+codexChoice+"_AWAKENED":"";
  const inherited=routeContext?.state?[...routeContext.state.completed]:[];
  options.extra=[...inherited,$("#researchRouteExtra")?.value||""].join(" ");
  return options;
}
const researchRouteReason=access=>{
  const blocker=access.blockers?.[0];if(!blocker)return"";
  const by=list(blocker.disabledBy).map(researchLabel).join(", ");
  if(blocker.viaEvent?.length)return"이벤트 "+blocker.viaEvent.join(", ")+"의 보상 경로 차단: "+(by||researchLabel(blocker.researchId));
  return"연구 "+researchLabel(blocker.researchId)+" 배제 · 원인 "+by;
};
const idTag=id=>'<span class="chip">'+esc(name(id))+' <span class="tiny">('+esc(id)+')</span></span>';
const idTags=ids=>ids?.length?'<div class="chips">'+ids.map(idTag).join("")+'</div>':'<span class="muted">없음</span>';
const valueLine=(label,value)=>'<div class="detail-box"><b>'+esc(label)+'</b>'+value+'</div>';
const statChips=stats=>'<div class="stat-grid">'+(entries(stats).map(([key,v])=>'<span>'+esc(statLabels[key]||key)+' <b>'+(v>0?"+":"")+esc(v)+'</b></span>').join("")||'<span class="muted">수치 변화 없음</span>')+'</div>';
const researchLink=id=>'<a class="name-link" href="../research/#research='+encodeURIComponent(id)+'" target="_blank" rel="noopener">'+esc(DATA.researchGraph[id]?.koName||name(id))+'</a> <span class="tiny">'+esc(id)+'</span>';
const itemLink=x=>'<a class="name-link" href="../items/#item='+encodeURIComponent(x.id)+'" target="_blank" rel="noopener">'+esc(x.koName)+'</a> <span class="tiny">'+esc(x.id)+'</span> ×'+n(x.amount);
const labelIssue=(issue)=>{
  if(issue.code==="forbidden")return"선택한 이전 훈련과 배타: "+issue.ids.map(name).join(", ");
  if(issue.code==="unavailable")return"게임에서 사용할 수 없는 내부 전용 변신 (STR_UNAVAILABLE)";
  if(issue.code==="route-blocked")return"선장 분기로 영구 불가: "+(issue.details||issue.ids.map(name).join(", "));
  if(issue.code==="research-route-blocked")return researchRouteReason(issue.access);
  if(issue.code==="prerequisite")return"먼저 이 훈련 필요: "+issue.ids.map(name).join(", ");
  if(issue.code==="type"||issue.code==="forbidden-type")return"현재 병종("+typeName(state.soldierType)+")에 적용할 수 없음";
  if(issue.code==="condition")return"현재 병사 상태에서 실행 불가";
  return"불명확한 조건";
};
const isHard=issues=>issues.some(x=>x.code!=="prerequisite");
const statusOf=issues=>!issues.length?"ready":isHard(issues)?"blocked":"prereq";
function currentOrigin(){return origins.get($("#origin").value);}
function currentState(){return replay(currentOrigin(),selected,byId,{condition:$("#condition").value});}
function routeIssues(t){
  const gate=trainingRouteGate(t,routeContext,ACCESS);
  const existing=gate.kind==="blocked"?
    [{code:"route-blocked",ids:gate.reasons.map(x=>x.id),details:gate.reasons.map(x=>x.id+" — "+x.reason).join(" / ")}]:[];
  // Preserve the dedicated captain/Saint event model; supplement it with
  // the broader choice/event/item provenance for other route decisions.
  const research=trainingRouteAccess(t,researchRouteContext,DATA);
  if(research.blocked&&!existing.length)
    existing.push({code:"research-route-blocked",ids:research.blockers.map(x=>x.researchId),access:research});
  return existing;
}
function issuesFor(t,s){return[...evaluate(t,s),...routeIssues(t)];}
function planWithRoute(t,s){
  if(!t||routeIssues(t).length)return{steps:[],state:null};
  const plan=addWithPrerequisites(t,s,byId);
  if(plan.state&&plan.steps.some(id=>routeIssues(byId.get(id)).length))return{steps:[],state:null};
  return plan;
}
function canAdd(t,includePrerequisites=false){
  state=currentState();
  const issues=issuesFor(t,state);
  const plan=planWithRoute(t,state);
  if(issues.length&&!includePrerequisites)return;
  if(!plan.state)return;
  selected.push(...plan.steps);
  latestAdded=[...plan.steps]; // One checkbox can append a whole prerequisite chain.
  redraw();
}
function currentCaptainStages(){
  return [0,1,2,3].map(i=>$("#captainStage"+i).value);
}
function refreshCaptainStages(){
  $("#captainStage1Wrap").hidden=$("#captainStage0").value!=="STR_CAPTAIN_PUSSY";
  $("#captainStage2Wrap").hidden=$("#captainStage1").value!=="STR_CAPTAIN_UNCLASSED_UP";
  $("#captainStage3Wrap").hidden=$("#captainStage2").value!=="STR_CAPTAIN_PURE_UP";
}
function renderCaptainModifiers(){
  const host=$("#captainCompanions");
  const available=routeContext?.availableCompanions||[];
  host.innerHTML=available.length?available.map(id=>
    '<label><input type="checkbox" data-companion="'+esc(id)+'"'+
    (selectedCompanions.has(id)?' checked':'')+'> '+esc(researchLabel(id))+'</label>'
  ).join(""):'<span class="fine">이 경로에서 해금된 후속 성격 없음</span>';
  $("#captainCodex").disabled=!routeContext?.state;
  $("#captainCodex").value=codexChoice;
  const owned=routeContext.ownedColors||[],colors=routeContext.colors||[],
    missing=routeContext.missingColors||[];
  $("#codexEligibility").textContent=!routeContext?.state?"선장 성격을 먼저 선택하세요":
    routeContext.codexBlocked?"힘 거부와 드릴 조사 분기가 배타적이므로 Codex 각성 불가":
    codexChoice&&owned.includes(codexChoice)?"기존 보유 색상의 중복 선택 — 결손색은 그대로":
    "보유 "+(colors.join(", ")||"없음")+" · 결손색 "+(missing.join(", ")||"없음")+
    (codexChoice?" · Codex 각성까지 달성했다고 가정":"");
  $("#saintMilestone").disabled=!routeContext.saintPossible;
  $("#saintMilestone").checked=routeContext.saintGoal;
  $("#saintEligibility").textContent=!routeContext?.state?"선장 성격 미선택":
    routeContext.route.first==="STR_CAPTAIN_PUSSY"?"Pussy 계열은 Saint 이벤트의 금지 조건":
    !routeContext.route.isTerminal?"선장 분기 결정 미완료":
    !routeContext.saintPossible?"네 색상·드릴 조사 조건 미달, 다른 분기와 배타 또는 결손색 존재":
    routeContext.saintGoal?"네 색상+선장일지+Saint 지급 완료 가정":"조건 충족 가정 가능 — 지급 자체는 별도 이벤트";
}
function renderRouteAccess(){
  const host=$("#routeAccessSummary");
  if(!routeContext?.state){
    host.innerHTML='<p class="fine">선장을 지정하면 Thief 전용 Captains 11과 Saint·DumbLazy 이벤트 및 배제되는 훈련이 함께 판정됩니다. 선장 미지정 상태에서는 이력·병종 제약만 적용합니다.</p>';
    return;
  }
  const report=routeEventReport(routeContext,ACCESS);
  const eventLink=(id,label)=>'<a class="name-link" href="../events/#event='+encodeURIComponent(id)+'" target="_blank" rel="noopener">'+esc(label)+'</a>';
  const brief=(title,reportRow,eventId,detail)=>{
    const kind=reportRow.kind;
    const label=kind==="completed"?"달성 가정":kind==="blocked"?"선택 분기에서는 불가":
      kind==="unselected"?"선장 미선택":"경로 가능 · 보상/조건 미확정";
    const eligible=reportRow.eligible||[];
    const pending=[...new Set(eligible.flatMap(s=>s.missing||[]))];
    const blocked=[...new Set((reportRow.scripts||[]).flatMap(s=>(s.blocked||[]).map(x=>x.id)))];
    const notes=kind==="blocked"&&blocked.length?"충돌: "+blocked.join(", "):
      pending.length?"남은 플래그: "+pending.slice(0,4).join(", ")+(pending.length>4?" 외 "+(pending.length-4)+"개":""):"";
    return'<div class="route-gate '+(kind==="blocked"?"route-gate-blocked":"")+'"><strong>'+esc(title)+'</strong>'+
      '<span class="route-status">'+esc(label)+'</span><p>'+eventLink(eventId,detail)+'</p>'+
      (notes?'<div class="tiny">'+esc(notes)+'</div>':"")+'</div>';
  };
  host.innerHTML='<div class="route-title"><b>선장 분기 → 연구·이벤트·특수병 획득</b><span class="tiny">실제 원본 이벤트 지급 조건 대조 · 반복 랜덤은 획득 보장 아님</span></div>'+
    '<div class="route-gates">'+
    brief("Captains 11",report.eleven,"STR_CAPTAINS_11","Thief 전용 이벤트")+
    brief("Saint",report.saint,"STR_CAPTAIN_SAINT","네 색상 + 선장일지 1권 이벤트")+
    brief("Rogue 클론 — Saint 증원",report.rogueSaint,"STR_SAINTS_REINFORCEMENTS","랜덤 반복 증원")+
    brief("Rogue 클론 — DumbLazy 방문",report.rogueDumbLazy,"STR_KNOCK_KNOCK_ROGUE_CLONE","랜덤 반복 방문")+
    brief("Rogue 클론 — TroubleSeeking",report.rogueTrouble,"STR_TROUBLESEEKING_ALLY","JackDumb 또는 Dumbass+Saint 랜덤 이벤트")+
    brief("붉은 새벽단 기적술사",report.orthodoxSaint,"STR_KNOCK_KNOCK_ORTHODOX_MAGE_DAMSEL","Dumbass+Saint 또는 Pussy+JackLazy(Thief 포함) 이벤트")+'</div>'+
    (routeContext.saintGoal?'<p class="fine">Saint 달성 가정: 선택 Codex 각성, 선장일지 #1 및 Saint 지급 이벤트 완료가 필요합니다. 도마뱀인간 석상에 따라 증원 이벤트가 제한됩니다.</p>':"")+
    '<p class="fine">훈련의 연구·아이템·시설을 지금 보유한다는 뜻은 아닙니다. <b>분기상 가능</b>과 <b>현재 게임에서 실행 가능</b>은 다릅니다.</p>';
}
function renderResearchRoute(){
  const chosen=Object.entries(researchRouteOptions()).filter(([key,value])=>key!=="extra"&&value);
  const labels=chosen.map(([,id])=>researchLabel(id));
  const conflicts=[
    ...researchRouteContext.unknownIds.map(id=>"알 수 없는 연구 ID: "+id),
    ...researchRouteContext.contradictions.map(id=>"완료·배제 가정 충돌: "+researchLabel(id))
  ];
  const blocked=rows.filter(x=>x.issues.some(issue=>issue.code==="research-route-blocked")).length;
  $("#researchRouteHint").innerHTML='<b>현재 후속 분기:</b> '+esc(labels.join(" · ")||"미설정")+
    ' · 추가 연구/이벤트 경로 배제 '+n(blocked)+'개'+
    (conflicts.length?'<p class="blocked">'+esc(conflicts.slice(0,6).join(" / "))+'</p>':"")+
    '<div class="fine">연구·아이템 보유 여부가 확인되지 않은 경우에는 배제 확정으로 취급하지 않습니다.</div>';
}
function renderSummary(){
  const blocked=rows.filter(x=>x.status==="blocked");
  const priorBlocked=blocked.filter(x=>x.issues.some(p=>p.code==="forbidden"));
  const ready=rows.filter(x=>x.status==="ready").length;
  const values=[
    ["원본 변신·훈련",DATA.counts.transformations+"개","모든 soldierTransformation 포함"],
    ["방향성 배제",DATA.counts.directionalExclusions+"건","A → B 실행순서가 중요"],
    ["선택한 단계",selected.length+"단계","중복/반복 가능 훈련 포함"],
    ["분기·변신상 가능",ready+"개","연구·재료 충족은 별도"],
    ["분기·변신 차단",blocked.length+"개","변신 이력 "+priorBlocked.length+"개 포함"]
  ];
  $("#summary").innerHTML=values.map(([count,value,sub])=>'<div class="card metric"><strong>'+esc(value)+'</strong><span>'+esc(count)+' · '+esc(sub)+'</span></div>').join("");
}
function renderTimeline(){
  if(!selected.length){
    $("#timeline").innerHTML='<div class="empty-plan">아직 선택한 훈련이 없습니다. 아래에서 훈련을 하나 추가하거나, 선행 훈련이 필요한 경우 「선행 포함」을 눌러 보세요.</div>';
  }else{
    let before=initialState(currentOrigin(),{condition:$("#condition").value});
    $("#timeline").innerHTML=selected.map((id,index)=>{
      const t=byId.get(id),then=apply(t,before);
      const change=then.soldierType!==before.soldierType?" → "+typeName(then.soldierType):"";
      before=then;
      return'<div class="timeline-row"><span class="step">'+(index+1)+'</span><div class="info"><strong>'+esc(t.koName)+' <span class="tag">'+esc(t.kind)+'</span></strong><span class="tiny">'+esc(id)+esc(change)+'</span></div><button class="btn-small" data-info="'+esc(id)+'">상세</button><button class="btn-small" data-cut="'+index+'" title="이 단계부터 이후 선택 제거">여기부터 취소</button></div>';
    }).join("");
  }
  $("#undo").disabled=!selected.length;
  $("#reset").disabled=!selected.length;
  $("#copyPlan").disabled=!selected.length;
}
function renderEffects(){
  if(!selected.length){$("#planEffects").innerHTML="";return;}
  let direct={},traits={},armor={},seen=new Set(),percent=false,clones=0;
  for(const id of selected){
    const t=byId.get(id);
    if(t.createsClone){clones++;continue;}
    direct=sum(direct,t.flatOverallStatChange);
    if(t.soldierBonusType&&!seen.has(t.soldierBonusType)){
      seen.add(t.soldierBonusType);
      const b=DATA.bonuses[t.soldierBonusType];
      traits=sum(traits,b?.stats||{});
      for(const key of ["frontArmor","sideArmor","rearArmor","underArmor"])armor[key]=(armor[key]||0)+Number(b?.[key]||0);
    }
    for(const field of ["percentOverallStatChange","percentGainedStatChange","rerollStats","flatMin","flatMax"])
      if(entries(t[field]).length)percent=true;
  }
  const group=(title,values,map=statLabels)=>'<div class="effect-group"><b>'+esc(title)+'</b><div class="effects-grid">'+(entries(values).map(([key,v])=>'<span class="effect-item"><b>'+esc(map[key]||key)+'</b> '+(v>0?"+":"")+esc(v)+'</span>').join("")||'<span class="muted">없음</span>')+'</div></div>';
  $("#planEffects").innerHTML='<div class="note"><b>선택 순서별 명목 보정</b> (기본 병사 능력치와 합쳐진 최종 실효값 아님). 훈련의 직접 수치 변화와 SoldierBonus 특성은 구분하며, 특성은 중복 ID를 한 번만 합산합니다.</div>'+
    group("직접 능력치 변화 합계",direct)+group("부여 특성 보너스 합계",traits)+group("특성 방어력 합계",armor,{frontArmor:"전면",sideArmor:"측면",rearArmor:"후면",underArmor:"하부"})+
    (percent?'<p class="warning fine">일부 훈련은 퍼센트·성장치·재추첨·캡 제한을 사용합니다. 단순 수치합으로 최종 병사 스탯을 확정할 수 없습니다.</p>':"")+
    (clones?'<p class="warning fine">복제·소환 '+n(clones)+'건은 기존 병사의 능력치 합산에서 제외했습니다.</p>':"");
}
function distinctResearchWarnings(rs){
  const selectedRows=selected.map(id=>byId.get(id));
  const base=new Set(findResearchConflicts(selectedRows,DATA.researchGraph).map(x=>x.disabling+"|"+x.disabled));
  return findResearchConflicts([...selectedRows,rs],DATA.researchGraph).filter(x=>!base.has(x.disabling+"|"+x.disabled));
}
function renderDecisions(){
  const ready=rows.filter(x=>x.status==="ready"),future=rows.filter(x=>x.status==="prereq");
  const routeBlocked=rows.filter(x=>x.issues.some(issue=>issue.code==="route-blocked"||issue.code==="research-route-blocked"));
  $("#decisionHint").textContent=typeName(state.soldierType)+" 기준 · 변신 조건상 가능 "+ready.length+"개 / 선행 필요 "+future.length+"개 / 전체 차단 "+rows.filter(x=>x.status==="blocked").length+"개 (선장 분기 "+routeBlocked.length+"개)";
  const allForbidden=excludedByPrior(DATA.transformations,state);
  const previous=latestAdded.length?replay(currentOrigin(),selected.slice(0,-latestAdded.length),byId,{condition:$("#condition").value}):null;
  const changes=previous?exclusionChanges(DATA.transformations,previous,state):{newlyBlocked:[],additionalCauses:[],unblocked:[]};
  const fresh=changes.newlyBlocked,additional=changes.additionalCauses;
  const newIds=new Set(fresh.map(x=>x.id)),older=allForbidden.filter(x=>!newIds.has(x.id));
  const choice=(x,addedOnly=false)=>{
    const t=byId.get(x.id);
    const repeated=selected.includes(x.id)?" · 이미 선택한 훈련의 재실행도 제한됨":"";
    const causes=addedOnly?x.addedBy:x.blockedBy;
    return'<div class="choice exclusion-item"><div class="choice-main"><strong>'+esc(t.koName)+'</strong><span class="exclusion-reason">'+(addedOnly?"이번 선택이 추가한 배제 원인: ":"배제 원인: ")+esc(causes.map(name).join(", "))+esc(repeated)+'</span></div><button data-info="'+esc(t.id)+'" class="btn-small">상세</button></div>';
  };
  $("#newBlockedCount").textContent=fresh.length+"개";
  $("#latestSelectionHint").textContent=latestAdded.length?
    "방금 추가: "+latestAdded.map(name).join(" → ")+(latestAdded.length>1?" (자동 선행 포함)":"")+" · 이전 상태와 비교":
    "훈련을 체크하면 그 선택으로 새로 봉쇄된 훈련을 이곳에서 확인할 수 있습니다.";
  $("#newBlockedList").innerHTML=fresh.map(x=>choice(x)).join("")||
    '<p class="muted fine">'+(latestAdded.length?"이번 추가로 새로 배제된 훈련은 없습니다.":"아직 새로 선택한 훈련이 없습니다.")+'</p>';
  $("#extraBlockedCount").textContent=additional.length+"개";
  $("#extraBlockedList").innerHTML=additional.map(x=>choice(x,true)).join("")||
    '<p class="muted fine">'+(latestAdded.length?"이미 배제된 훈련에 새로운 차단 원인은 더해지지 않았습니다.":"추가 원인 없음")+'</p>';
  $("#blockedCount").textContent=older.length+"개 · 총 "+allForbidden.length+"개";
  $("#blockedList").innerHTML=older.map(x=>choice(x)).join("")||
    '<p class="muted fine">이전 선택 또는 시작 획득 경로로 이미 배제된 훈련이 없습니다.</p>';
  $("#branchBlockedCount").textContent=routeBlocked.length+"개";
  $("#branchBlockedList").innerHTML=routeBlocked.map(x=>'<div class="choice"><div class="choice-main"><strong>'+esc(x.t.koName)+'</strong><span>'+esc(x.issues.filter(y=>(y.code==="route-blocked"||y.code==="research-route-blocked")).map(labelIssue).join(" / "))+'</span></div><button data-info="'+esc(x.t.id)+'" class="btn-small">상세</button></div>').join("")||
    '<p class="muted fine">현재 선택한 선장 분기로 영구 봉쇄된 훈련이 없습니다.</p>';
  // Keep the effect visible next to the checkboxes on mobile, without scrolling
  // back up to the full rule panel. The expandable view lists every blocker.
  $("#mobileExclusionTitle").textContent="이번 선택: 새 배제 "+fresh.length+"개 · 기존 배제 원인 추가 "+additional.length+"개";
  $("#mobileExclusionTotal").textContent="이력 배제 "+allForbidden.length+"개 · 선장·연구 분기 배제 "+routeBlocked.length+"개";
  const previews=[...fresh.map(x=>({id:x.id,shared:false})),...additional.map(x=>({id:x.id,shared:true}))];
  $("#mobileExclusionNames").innerHTML=previews.length?
    previews.slice(0,5).map(x=>'<span'+(x.shared?' class="also-blocked"':"")+'>'+esc(byId.get(x.id).koName)+(x.shared?" · 원인 추가":"")+'</span>').join("")+
    (previews.length>5?'<span>외 '+n(previews.length-5)+'개</span>':""):
    '<span class="muted">'+(latestAdded.length?"이번 선택에서 배제 변화 없음":"훈련 체크 시 여기 표시")+'</span>';
  $("#mobileExclusionFull").innerHTML=allForbidden.map(x=>choice(x)).join("")||
    '<p class="muted fine">현재 순서에서 배제된 훈련이 없습니다.</p>';
  $("#futureList").innerHTML=future.slice(0,50).map(x=>{
    const p=planWithRoute(x.t,state);
    return'<div class="choice"><div class="choice-main"><strong>'+esc(x.t.koName)+'</strong><span>'+esc(x.issues.flatMap(y=>y.ids).map(name).join(" → "))+' 필요</span></div>'+
      (p.state?'<button class="btn-small btn-prepare" data-chain="'+esc(x.t.id)+'">선행 포함</button>':'<button class="btn-small" data-info="'+esc(x.t.id)+'">조건</button>')+'</div>';
  }).join("")||'<p class="muted">현재 순서에서 필수 선행만 남아 있는 후보가 없습니다.</p>';
  const conflicts=findResearchConflicts(selected.map(id=>byId.get(id)),DATA.researchGraph);
  $("#researchWarnings").innerHTML=conflicts.length?
    '<div class="note" style="border-left-color:#facc15"><b>연구 분기 충돌 주의 ('+n(conflicts.length)+'건)</b><p>명목 선행 연구망의 <code>disables</code> 관계가 동시에 등장합니다. 훈련 룰의 하드 배제와 달리, 무료 해금·이벤트·획득 순서를 확인해야 하므로 자동으로 훈련을 제거하지 않습니다.</p><ul>'+
    conflicts.slice(0,10).map(c=>'<li>'+researchLink(c.disabling)+' → '+researchLink(c.disabled)+' 비활성화</li>').join("")+'</ul></div>'
    :'<p class="fine">연구상 주의: 선택한 훈련들의 명목 선행망에서 알려진 disables 충돌이 없습니다. 이는 현재 세이브에서 연구·시설·재료를 보유했다는 뜻은 아닙니다.</p>';
}
function renderQuickPicker(){
  const picker=$("#quickTraining"),previous=picker.value;
  const possible=rows.filter(row=>row.status==="ready"||row.status==="prereq"&&!!planWithRoute(row.t,state).state)
    .sort((a,b)=>(a.status==="ready"?0:1)-(b.status==="ready"?0:1)||a.t.koName.localeCompare(b.t.koName,"ko"));
  picker.innerHTML='<option value="">훈련을 선택하세요</option>'+possible.map(({t,status})=>
    '<option value="'+esc(t.id)+'">'+esc(t.koName)+' · '+(status==="ready"?"변신/분기상 가능":"필수 선행 포함")+'</option>'
  ).join("");
  if(possible.some(row=>row.t.id===previous))picker.value=previous;
  $("#quickAdd").disabled=!picker.value;
  $("#quickHint").textContent="변신·분기상 가능 "+possible.filter(x=>x.status==="ready").length+"개 · 선행 포함 가능 "+possible.filter(x=>x.status==="prereq").length+"개 · 연구/시설/재료 충족은 별도 확인";
}
function renderTable(){
  const search=$("#search").value.trim().toLowerCase().normalize("NFKC"),
    filter=$("#statusFilter").value,kind=$("#kindFilter").value,
    sortBy=$("#sortBy").value,sortKey=sortBy.startsWith("trait:")?sortBy.slice(6):null,
    ascending=$("#sortDirection").value==="asc";
  const sorted=[...rows].filter(x=>{
    if(filter!=="all"&&x.status!==filter)return false;
    if(kind!=="all"&&x.t.kind!==kind)return false;
    const t=x.t;
    const blob=[t.id,t.koName,t.enName,t.kind,t.soldierBonusType||"",
      name(t.soldierBonusType),...t.requires,...t.requires.map(name),
      ...t.requiredItems.map(v=>v.id+" "+v.koName),
      ...t.forbiddenPreviousTransformations.map(name),...t.requiredPreviousTransformations.map(name)].join(" ").normalize("NFKC").toLowerCase();
    return!search||blob.includes(search);
  }).sort((a,b)=>{
    if(sortKey){
      const delta=traitSortValue(a.t,DATA.bonuses,sortKey)-traitSortValue(b.t,DATA.bonuses,sortKey);
      if(delta)return ascending?delta:-delta;
    }
    return ({ready:0,prereq:1,blocked:2}[a.status]-{ready:0,prereq:1,blocked:2}[b.status])||
      a.t.koName.localeCompare(b.t.koName,"ko");
  });
  $("#sortHint").textContent=sortKey?
    "SoldierBonus 특성의 "+(sortKey==="total"?"양수 스탯 증가 단순합":(statLabels[sortKey]||sortKey)+" 보정값")+
      " 기준 "+(ascending?"오름차순":"내림차순")+"입니다. 직접 상승치는 제외하며, 상태가 불가인 훈련도 포함됩니다. 총합은 스탯별 가치가 다른 참고 수치입니다.":
    "직접 상승치와 SoldierBonus 특성의 추가 스탯은 별도입니다. 정렬 기준을 선택하면 특성 증가량으로 전체 훈련을 비교합니다.";
  $("#rowCount").textContent=sorted.length+" / "+DATA.transformations.length+"개";
  $("#trainingTable tbody").innerHTML=sorted.map(({t,status,issues})=>{
    const routeGate=trainingRouteGate(t,routeContext,ACCESS);
    const text=status==="ready"?(selected.includes(t.id)?"조합 가능 · 반복":"분기·변신상 가능"):status==="prereq"?"선행 훈련 필요":"선택 불가";
    const reasons=issues.map(labelIssue).join(" / ");
    const plan=status==="prereq"?planWithRoute(t,state):null;
    const button=status==="ready"?'<button class="btn-add btn-small" data-add="'+esc(t.id)+'">추가</button>':
      plan?.state?'<button class="btn-prepare btn-small" data-chain="'+esc(t.id)+'">선행 포함</button>':
      '<button class="btn-small" disabled>불가</button>';
    const checked=selected.includes(t.id);
    const toggleable=checked||status==="ready"||(status==="prereq"&&!!plan?.state);
    const checkbox='<label class="check-row"><input type="checkbox" data-toggle="'+esc(t.id)+'" '+(checked?'checked ':"")+(toggleable?"":'disabled ')+'aria-label="'+esc(t.koName)+' 선택 또는 해제"> 체크</label>';
    const researchWarn=status==="ready"&&distinctResearchWarnings(t).length;
    const traitStats=bonusStats(t),sortValue=sortKey?traitSortValue(t,DATA.bonuses,sortKey):null;
    const sortHighlight=sortKey?'<div class="sort-emphasis">'+esc(sortKey==="total"?"증가 합계":statLabels[sortKey]||sortKey)+' <b>'+(sortValue>0?"+":"")+n(sortValue)+'</b></div>':"";
    return'<tr data-id="'+esc(t.id)+'"'+(sortKey?' data-sort-value="'+sortValue+'"':"")+' title="행 클릭: 상세 규칙 보기">'+
      '<td>'+checkbox+'<strong>'+esc(t.koName)+'</strong><span class="ident">'+esc(t.enName)+' · '+esc(t.id)+'</span></td>'+
      '<td><span class="'+status+'">'+esc(text)+'</span>'+(routeGate.kind==="caution"?'<span class="tag warning">연구/이벤트 조건</span>':"")+(researchWarn?'<span class="tag warning">연구분기 주의</span>':"")+
      (reasons?'<div class="tiny">'+esc(reasons.slice(0,110))+'</div>':"")+'</td>'+
      '<td>'+esc(t.kind)+'</td><td>'+esc(t.allowedSoldierTypes.length?t.allowedSoldierTypes.length+"종":"전체 (제외 조건 별도)")+'</td>'+
      '<td>'+n(t.cost)+'$'+(t.transferTime!=null?'<div class="tiny">'+n(t.transferTime)+'h</div>':t.recoveryTime?'<div class="tiny">회복 '+n(t.recoveryTime)+'</div>':"")+'</td>'+
      '<td class="tiny">'+esc(rankStat(t).slice(0,170))+'</td>'+
      '<td class="tiny trait-values">'+sortHighlight+esc(entries(traitStats).length?textStats(traitStats,statLabels):"특성 스탯 없음")+'</td>'+
      '<td>'+esc(name(t.soldierBonusType))+'</td>'+
      '<td>'+n(t.forbiddenPreviousTransformations.length)+'개 배제 / '+n(t.requiredPreviousTransformations.length)+'개 선행</td><td>'+button+'</td></tr>';
  }).join("");
  if(!sorted.length)$("#trainingTable tbody").innerHTML='<tr><td colspan="10">조건에 맞는 훈련이 없습니다.</td></tr>';
}
function redraw(){
  origin=currentOrigin();state=currentState();
  const prior=parseCompletedResearch(choiceIndex,$("#researchRouteExtra")?.value||"").ids
    .filter(id=>!id.startsWith("STR_CAPTAIN_")&&id!=="STR_CAPTAINS_11");
  routeContext=buildStagedCaptainContext(choiceIndex,ACCESS.captainStages,{
    stages:currentCaptainStages(),companions:[...selectedCompanions],
    codex:codexChoice,saint:saintGoal,extraFlags:prior,
    queenSavage:$("#research-route-queen")?.value==="STR_QUEEN_SAVAGE"
  });
  if(saintGoal&&!routeContext.saintPossible)saintGoal=false;
  researchRouteContext=buildResearchRouteContext(DATA,researchRouteOptions());
  rows=DATA.transformations.map(t=>{const issues=issuesFor(t,state);return{t,issues,status:statusOf(issues)}});
  renderSummary();renderCaptainModifiers();renderRouteAccess();renderResearchRoute();
  renderQuickPicker();renderTimeline();renderEffects();renderDecisions();renderTable();
}
const section=(title,content)=>'<section class="detail-section"><h3>'+esc(title)+'</h3>'+content+'</section>';
function renderResearchEvidence(t){
  const access=trainingRouteAccess(t,researchRouteContext,DATA);
  const sources=access.sourceEvents.map(source=>
    '<li>'+evidenceEventLink(source.eventId,source.eventKoName)+' → '+esc(researchLabel(source.researchId))+
    ' · '+(source.impossible?'<span class="blocked">선택 분기에서 불가</span>':
      '<span class="warning">보상·조건 미확인</span>')+
    '<div class="fine">'+source.paths.map(p=>
      '요구 연구 '+esc(p.yes.map(id=>researchLabel(id)+' ('+id+')').join(", ")||"없음")+
      (p.no.length?' / 미완료 '+esc(p.no.map(id=>researchLabel(id)+' ('+id+')').join(", ")):"")+
      (p.otherTriggers.length?' / 추가 조건 '+esc(p.otherTriggers.join(", ")):"")
    ).join(" 또는 ")+'</div></li>').join("");
  const items=t.requiredItems.map(item=>{
    const supply=DATA.itemSources?.[item.id];
    const events=list(supply?.guaranteedEvents);
    return'<li>'+esc(item.koName)+' <span class="tiny">'+esc(item.id)+'</span>'+
      (events.length?' · 확인된 확정 지급: '+events.slice(0,6).map(e=>evidenceEventLink(e.eventId,e.eventKoName)).join(" · "):
        ' · 확정 이벤트 지급 조회 없음(드롭/구매/제조는 별도 가능)')+'</li>';
  }).join("");
  const joint=access.eventGates.map(g=>'<li>'+evidenceEventLink(g.eventId)+'에서 연구 '+
    esc(researchLabel(g.researchId))+'와 전용 재료 '+esc(g.itemId)+' 함께 지급</li>').join("");
  const blockers=access.blockers.map(b=>'<li>'+
    (b.viaEvent?.length?'이벤트 '+esc(b.viaEvent.join(", "))+' → ':"")+
    esc(researchLabel(b.researchId))+' · 선택 분기 충돌: '+esc(list(b.disabledBy).map(researchLabel).join(", ")||"원인 확인 필요")+
    (b.triggerIds?.length?' · 요구 연구 '+esc(b.triggerIds.join(", ")):"")+'</li>').join("");
  return section("연구·이벤트 지급·필수 재료의 획득 근거",
    '<div class="detail-grid">'+
    valueLine("선택한 후속 분기",access.blocked?'<span class="blocked">선택지로 차단</span>':
      '<span class="ready">선택 분기와 확정 충돌 없음</span> (보유 미확인)')+
    valueLine("실제 연구 지급 이벤트",sources?'<ul class="list-clean">'+sources+'</ul>':
      "확인된 직접 지급 이벤트 없음(통상 연구 또는 다른 우회 경로 확인)")+
    valueLine("전용 아이템과 공급 이벤트",items?'<ul class="list-clean">'+items+'</ul>':"필수 재료 없음")+
    valueLine("동일 이벤트 연구+전용 재료",joint?'<ul class="list-clean">'+joint+'</ul>':"해당 없음")+
    valueLine("분기 배제 근거",blockers?'<ul class="list-clean blocked">'+blockers+'</ul>':"증명 가능한 분기 배제 없음")+
    valueLine("그 밖의 미확인 조건",access.unresolved.length?
      '<ul class="list-clean">'+access.unresolved.slice(0,12).map(x=>
        '<li>'+esc(x.type)+' · '+esc(researchLabel(x.id))+'</li>').join("")+
        (access.unresolved.length>12?'<li>외 '+(access.unresolved.length-12)+'건</li>':"")+'</ul>':"별도 조건 없음")+
    '</div><p class="fine">공식 이벤트의 긍정·부정 연구 트리거, 연구 대체 해금과 아이템 공급을 대조합니다. 증명된 배제와 획득 여부 미확인을 구분합니다.</p>');
}
function showDetail(id){
  const t=byId.get(id);if(!t)return;
  state=currentState();
  const issues=issuesFor(t,state),p=planWithRoute(t,state);
  const routeGate=trainingRouteGate(t,routeContext,ACCESS);
  const relation=relations.get(id);
  const bonus=t.soldierBonusType?DATA.bonuses[t.soldierBonusType]:null;
  const button=!issues.length?'<button class="btn-add" data-add="'+esc(t.id)+'">현재 계획에 추가</button>':
    p.state?'<button class="btn-prepare" data-chain="'+esc(t.id)+'">필수 선행 포함 추가 ('+p.steps.length+'단계)</button>':
    '<span class="blocked">'+esc(issues.map(labelIssue).join(" / "))+'</span>';
  const researched=t.requires.map(id=>DATA.researchGraph[id]?researchLink(id):esc(name(id))+' <span class="tiny">'+esc(id)+'</span>').join("<p></p>")||"없음";
  const bonusArmor=bonus?Object.fromEntries(["frontArmor","sideArmor","rearArmor","underArmor"].map(k=>[k,bonus[k]||0])):{};
  const researchConflict=distinctResearchWarnings(t);
  const listRequired=t.requiredItems.length?'<ul class="list-clean">'+t.requiredItems.map(x=>'<li>'+itemLink(x)+'</li>').join("")+'</ul>':"없음";
  const medals=t.requiredCommendations.length?'<ul class="list-clean">'+t.requiredCommendations.map(x=>'<li>'+esc(x.koName)+' <span class="tiny">'+esc(x.id)+'</span> ×'+n(x.amount)+'</li>').join("")+'</ul>':"없음";
  const minimum=entries(t.requiredMinStats),maximum=entries(t.requiredMaxStats).filter(([,v])=>v!==9999);
  const extraStats=["flatMin","flatMax","percentOverallStatChange","percentGainedStatChange","percentMin","percentMax","percentGainedMin","percentGainedMax","rerollStats"];
  $("#detailBody").innerHTML='<div class="detail-header"><p class="eyebrow">'+esc(t.kind)+' · 공식 룰셋</p><h2>'+esc(t.koName)+'</h2><p>'+esc(t.enName)+' · '+esc(t.id)+'</p>'+button+'</div>'+
    section("훈련 성립 조건",'<div class="detail-grid">'+
      valueLine("연구 또는 플래그",researched)+valueLine("필요 시설 기능",idTags(t.requiresBaseFunc))+
      valueLine("대상 병종",idTags(t.allowedSoldierTypes))+
      valueLine("금지 병종",idTags(t.forbiddenSoldierTypes))+
      valueLine("필요 최소 스탯",minimum.length?statChips(Object.fromEntries(minimum)):"없음")+
      valueLine("필요 최대 스탯",maximum.length?statChips(Object.fromEntries(maximum)):"없음")+
      valueLine("최소 계급",t.minRank==null?"기재 없음":esc(t.minRank))+
      valueLine("비용 / 이동시간",n(t.cost)+"$ · "+(t.transferTime==null?"이동시간 미기재":n(t.transferTime)+"시간"))+
      valueLine("회복시간(룰값)",n(t.recoveryTime||0))+
      valueLine("생존 / 부상 / 사망 가능 여부",[["생존",t.allowsLiveSoldiers],["부상",t.allowsWoundedSoldiers],["사망",t.allowsDeadSoldiers]].map(([k,v])=>k+" "+(v==null?"미기재":v?"허용":"불가")).join(" · "))+
      valueLine("필요 아이템",listRequired)+valueLine("필요 훈장",medals)+'</div>')+
    renderResearchEvidence(t)+
    section("선택 순서 · 배타 관계",'<div class="detail-grid">'+
      valueLine("이 훈련 전에 끝내야 함",idTags(t.requiredPreviousTransformations))+
      valueLine("이 훈련보다 먼저 했으면 불가",idTags(relation.blockedBy))+
      valueLine("이 훈련 후 다른 훈련을 봉쇄할 수 있음",idTags(relation.blocksLater))+'</div>'+
      '<p class="note">코드의 <code>forbiddenPreviousTransformations</code>는 <b>선행 기록을 확인</b>합니다. 상대방의 역방향 조건까지 자동으로 대칭 처리하지 않습니다. 순서를 바꿔 조합이 가능해지는 경우가 있으며, 연구 분기는 별도 검증 대상입니다.</p>'+
      (t.removeTransformations.length?'<p><b>이 훈련 완료 시 제거되는 과거 변신 기록</b>: '+idTags(t.removeTransformations)+'</p>':"")+
      (issues.length?'<p class="blocked"><b>현재 선택 불가 사유:</b> '+esc(issues.map(labelIssue).join(" / "))+'</p>':'<p class="ready">현재 순서·병종·선장 분기 기준에서 조합 가능합니다. 실제 연구/아이템 충족은 별도입니다.</p>')+
      (routeGate.notes?.length?'<p class="warning"><b>선장·연구 경로 참고:</b> '+esc(routeGate.notes.map(x=>x.id+" — "+x.reason).join(" / "))+'</p>':"")+
      (researchConflict.length?'<p class="warning">명목 선행 연구망에서 disables 충돌이 '+researchConflict.length+'건 발견됩니다. 사건·무료 연구·해금 순서를 확인하십시오.</p>':""))+
    section("실제 능력 효과 · 서로 다른 계층",'<div class="detail-grid">'+
      valueLine("훈련의 직접 능력 변화 (flatOverallStatChange)",statChips(t.flatOverallStatChange))+
      valueLine("획득 SoldierBonus 특성",bonus?esc(bonus.koName)+' <span class="tiny">'+esc(bonus.id)+'</span>':"없음")+
      valueLine("특성의 별도 능력 보너스",statChips(bonus?.stats||{}))+
      valueLine("특성의 방어력 보너스",statChips(Object.fromEntries(Object.entries(bonusArmor).map(([k,v])=>[{frontArmor:"전면",sideArmor:"측면",rearArmor:"후면",underArmor:"하부"}[k],v]))))+
      valueLine("변신 결과 병종",t.producedSoldierType?esc(typeName(t.producedSoldierType))+" ("+esc(t.producedSoldierType)+")":"병종 유지")+
      valueLine("복제/소환",t.createsClone?"새 병사 생성 (원본과 구분)":"아니요")+'</div>'+
      extraStats.filter(k=>entries(t[k]).length).map(k=>'<p><b>'+esc(k)+'</b> '+statChips(t[k])+'</p>').join("")+
      '<p class="fine">직접 능력치에는 하드캡·최소/최대치 및 퍼센트 계산이 영향을 줄 수 있습니다. 특성 stats는 별도 SoldierBonus이며 합산 순서를 혼동하지 마십시오.</p>')+
    section("공식 데이터 / 근거",'<p><code>Ruleset/Piratez_Transformations.rul</code> · 효과값 <code>soldiers-index.json</code> · 연구 선행 <code>progression-research.json</code></p>'+
      '<details><summary>원본 룰 필드 펼치기</summary><pre>'+esc(JSON.stringify(t.rawRule,null,2))+'</pre></details>');
  $("#detailDialog").showModal();
}
function initOrigins(){
  origins=new Map();
  const bases=DATA.soldiers.map(s=>({id:"base:"+s.id,label:"기본 바디 · "+s.koName+" ("+s.id+")",soldierType:s.id,previousTransformations:{}}));
  const profiles=DATA.profiles.map(p=>({...p,id:"profile:"+p.id,label:p.soldierKoName+" · "+p.sourceKoName+" ("+p.sourceId+")"}));
  const group=(label,list)=>'<optgroup label="'+esc(label)+'">'+list.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.label)+'</option>').join("")+'</optgroup>';
  for(const o of [...bases,...profiles])origins.set(o.id,o);
  $("#origin").innerHTML=group("기본형 29개",bases)+group("실제 획득 경로 72개",profiles);
  $("#origin").value=origins.has("base:STR_SOLDIER")?"base:STR_SOLDIER":bases[0].id;
}
function bind(){
  $("#origin").addEventListener("change",()=>{selected=[];latestAdded=[];redraw();});
  $("#condition").addEventListener("change",()=>{selected=[];latestAdded=[];redraw();});
  for(let i=0;i<4;i++)$("#captainStage"+i).addEventListener("change",()=>{
    for(let j=i+1;j<4;j++)$("#captainStage"+j).value="";
    refreshCaptainStages();
    selectedCompanions.clear();codexChoice="";saintGoal=false;selected=[];latestAdded=[];redraw();
  });
  $("#captainCodex").addEventListener("change",e=>{
    codexChoice=e.target.value;saintGoal=false;selected=[];latestAdded=[];redraw();
  });
  $("#saintMilestone").addEventListener("change",e=>{
    saintGoal=e.target.checked;selected=[];latestAdded=[];redraw();
  });
  for(const group of DATA.routeChoices||[])if(group.id!=="captain"&&group.id!=="codex")
    $("#research-route-"+group.id).addEventListener("change",()=>{selected=[];latestAdded=[];redraw();});
  $("#researchRouteExtra").addEventListener("change",()=>{selected=[];latestAdded=[];redraw();});
  $("#quickTraining").addEventListener("change",()=>{$("#quickAdd").disabled=!$("#quickTraining").value;});
  $("#quickAdd").addEventListener("click",()=>{const t=byId.get($("#quickTraining").value);if(t)canAdd(t,true);});
  // Only 83 rules: synchronous filtering prevents checkboxes moving during a tap.
  $("#search").addEventListener("input",renderTable);
  $("#statusFilter").addEventListener("change",renderTable);
  $("#kindFilter").addEventListener("change",renderTable);
  $("#sortBy").addEventListener("change",renderTable);
  $("#sortDirection").addEventListener("change",renderTable);
  $("#undo").addEventListener("click",()=>{selected.pop();latestAdded=[];redraw();});
  $("#reset").addEventListener("click",()=>{selected=[];latestAdded=[];redraw();});
  $("#closeDialog").addEventListener("click",()=>$("#detailDialog").close());
  $("#detailDialog").addEventListener("click",e=>{if(e.target===$("#detailDialog"))$("#detailDialog").close();});
  document.addEventListener("change",e=>{
    const companion=e.target.dataset?.companion;
    if(companion){
      if(e.target.checked)selectedCompanions.add(companion);
      else selectedCompanions.delete(companion);
      selected=[];latestAdded=[];redraw();return;
    }
    const id=e.target.dataset?.toggle;
    if(!id)return;
    if(!e.target.checked){
      const index=selected.indexOf(id);
      if(index>=0)selected=selected.slice(0,index);
      latestAdded=[];
      redraw();
      return;
    }
    canAdd(byId.get(id),true);
  });
  document.addEventListener("click",e=>{
    const target=e.target.closest("[data-add],[data-chain],[data-info],[data-cut]");
    if(target){
      if(target.dataset.cut!==undefined){selected=selected.slice(0,Number(target.dataset.cut));latestAdded=[];redraw();return;}
      const id=target.dataset.info||target.dataset.chain||target.dataset.add;
      const t=byId.get(id);
      if(target.dataset.info){showDetail(id);return;}
      if(target.dataset.add!==undefined||target.dataset.chain!==undefined){
        if($("#detailDialog").open)$("#detailDialog").close();
        canAdd(t,target.dataset.chain!==undefined);return;
      }
    }
    if(e.target.closest(".check-row"))return;
    const row=e.target.closest("#trainingTable tbody tr[data-id]");
    if(row)showDetail(row.dataset.id);
  });
  $("#copyPlan").addEventListener("click",async()=>{
    const text="XPiratez 훈련 조합 | "+currentOrigin().label+" | 선장 "+currentCaptainStages().filter(Boolean).join(" → ")+" | 후속 성격 "+[...selectedCompanions].join(",")+" | 코덱스 "+(codexChoice||"미선택")+" | Saint "+(saintGoal?"가정":"아님")+" | "+$("#condition").selectedOptions[0].text+"\n"+
      selected.map((id,i)=>(i+1)+". "+byId.get(id).koName+" ("+id+")").join("\n");
    try{await navigator.clipboard.writeText(text);$("#copyStatus").textContent="복사됨";}
    catch{$("#copyStatus").textContent="복사 권한이 없어 선택된 조합을 복사하지 못했습니다.";}
  });
}
async function init(){
  try{
    const load=async file=>{const r=await fetch(file);if(!r.ok)throw new Error(file+" HTTP "+r.status);return r.json();};
    const [trainings,access,progression,choiceGates]=await Promise.all([
      load("../data/trainings-index.json"),load("../data/training-access.json"),
      load("../data/progression-research.json"),load("../data/choice-research-gates.json")
    ]);
    DATA=trainings;ACCESS=access;
    choiceIndex=buildChoiceIndex(progression.topics,choiceGates);
    validateCaptainStages(choiceIndex,ACCESS.captainStages);
    for(let i=0;i<4;i++)
      $("#captainStage"+i).innerHTML='<option value="">미선택 · 다음 단계 또는 보류</option>'+
        ACCESS.captainStages[i].ids.map(id=>'<option value="'+esc(id)+'">'+
          esc(choiceIndex.byId.get(id)?.koName||id)+'</option>').join("");
    $("#captainCodex").innerHTML='<option value="">Codex 미선택</option>'+
      ["GOLD","GREEN","RED","GRAY"].map(c=>
        '<option value="'+c+'">'+esc(choiceIndex.byId.get("STR_CODEX_"+c)?.koName||c)+'</option>').join("");
    $("#researchRouteSelectors").innerHTML=(DATA.routeChoices||[]).filter(g=>g.id!=="captain"&&g.id!=="codex").map(group=>
      '<label>'+esc(group.label)+'<select id="research-route-'+esc(group.id)+'">'+
      '<option value="">미선택 · 배제 확정 안 함</option>'+
      group.choices.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.koName)+' ('+esc(c.id)+')</option>').join("")+
      '</select></label>').join("");
    byId=new Map(DATA.transformations.map(t=>[t.id,t]));
    statLabels=DATA.statLabels;
    relations=compileRelations(DATA.transformations);
    initOrigins();
    $("#kindFilter").innerHTML='<option value="all">전체 유형</option>'+Object.entries(DATA.counts.categoryCounts).map(([kind,count])=>'<option value="'+esc(kind)+'">'+esc(kind)+' ('+count+')</option>').join("");
    const usedKeys=new Set(DATA.transformations.flatMap(t=>entries(bonusStats(t)).map(([key])=>key)));
    const sortableKeys=[...new Set([...DATA.statKeys.filter(k=>usedKeys.has(k)),...[...usedKeys].sort()])];
    $("#sortBy").innerHTML='<option value="status">선택 가능 순 (기본)</option><option value="trait:total">특성 증가 스탯 합계순 (양수)</option>'+
      sortableKeys.map(k=>'<option value="trait:'+esc(k)+'">특성 '+esc(statLabels[k]||k)+' 보정값</option>').join("");
    bind();
    const query=new URLSearchParams(location.search);
    if(query.has("training")){$("#search").value=query.get("training");}
    const legacy={
      DUMBASS:"STR_CAPTAIN_DUMBASS",JACKASS:"STR_CAPTAIN_JACKASS",
      LAZYASS:"STR_CAPTAIN_LAZYASS",SOREASS:"STR_CAPTAIN_SOREASS",
      THIEF:"STR_CAPTAIN_THIEF",PRIEST:"STR_CAPTAIN_PRIEST",
      RULER:"STR_CAPTAIN_RULER",MAGE:"STR_CAPTAIN_MAGE",
      DUMBASS_SAINT:"STR_CAPTAIN_DUMBASS",LAZYASS_SAINT:"STR_CAPTAIN_LAZYASS",
      JACKASS_SAINT:"STR_CAPTAIN_JACKASS",SOREASS_SAINT:"STR_CAPTAIN_SOREASS"
    };
    const from=legacy[query.get("route")]||query.get("route")||"";
    const stage=ACCESS.captainStages.findIndex(group=>group.ids.includes(from));
    if(stage>=0){
      if(stage>0)$("#captainStage0").value="STR_CAPTAIN_PUSSY";
      if(stage>1)$("#captainStage1").value="STR_CAPTAIN_UNCLASSED_UP";
      if(stage>2)$("#captainStage2").value="STR_CAPTAIN_PURE_UP";
      $("#captainStage"+stage).value=from;
      if(stage===1&&!$("#captainStage0").value)$("#captainStage0").value="STR_CAPTAIN_PUSSY";
    }
    if(query.get("route")?.endsWith("_SAINT")){
      const color={DUMBASS_SAINT:"GRAY",LAZYASS_SAINT:"RED",JACKASS_SAINT:"GREEN",SOREASS_SAINT:"GOLD"}[query.get("route")];
      codexChoice=color||"";saintGoal=Boolean(color);
      if(["DUMBASS_SAINT","LAZYASS_SAINT"].includes(query.get("route")))
        selectedCompanions.add("STR_CAPTAIN_DUMBLAZY");
    }
    if(["GOLD","GREEN","RED","GRAY"].includes(query.get("codex")))codexChoice=query.get("codex");
    refreshCaptainStages();
    redraw();
    if(byId.has(query.get("training")))showDetail(query.get("training"));
  }catch(error){
    console.error(error);
    $("#summary").innerHTML='<div class="card metric blocked">훈련 데이터 로딩 실패: '+esc(error.message)+'</div>';
    $("#trainingTable tbody").innerHTML='<tr><td colspan="10" class="blocked">데이터를 불러오지 못했습니다.</td></tr>';
  }
}
init();
