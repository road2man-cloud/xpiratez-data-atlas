import {
  buildChoiceIndex, choiceLabel, computeChoiceScenario, choiceStatus,
  choiceImpact, parseCompletedResearch
} from "./choice-simulator-core.js";

const panel=document.querySelector("#choiceSimulator");
const loading=document.querySelector("#choiceSimulatorLoading");
const content=document.querySelector("#choiceSimulatorContent");
const stats=document.querySelector("#choiceScenarioStats");
const message=document.querySelector("#choiceScenarioMessage");
const timeline=document.querySelector("#choiceScenarioTimeline");
const exclusions=document.querySelector("#choiceScenarioBlocked");
const search=document.querySelector("#choiceTopicSearch");
const results=document.querySelector("#choiceTopicResults");
const completedInput=document.querySelector("#choiceCompletedInput");
let index=null,previouslyCompleted=[],proposed=[],state=null;
let notice="";
const cards=[...document.querySelectorAll("#exclusiveRules .choice-option[data-choice-id]")];
const surface=[...new Set(cards.map(card=>card.dataset.choiceId))];

function esc(value){
  return String(value??"").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function name(id){return choiceLabel(index,id);}
function pretty(id){return name(id)+" ("+id+")";}
function isDerived(id){return /^STR_CODEX_(?:GOLD|GREEN|RED|GRAY)_EXP$/.test(id);}
function terse(id){const label=name(id);return label.length>31?label.slice(0,30)+"…":label;}
function blockerText(ids){return ids.map(pretty).join(" · ");}
function describe(status){
  if(status.kind==="unknown")return "연구 DB에 없는 ID";
  if(status.kind==="completed"){
    return status.blockers.length?"완료 이력 유지 · 후속 선택 "+status.blockers.map(terse).join(", ")+"이 직접 배제 규칙을 가짐":
      status.origin==="past"?"이미 완료 (입력한 과거 연구)":"완료로 가정 (순서 적용)";
  }
  if(status.kind==="blocked")return "직접 봉쇄 · "+status.blockers.map(terse).join(", ");
  if(status.kind==="path-risk")
    return "선행 경로 위험 · 필요한 "+pretty(status.nominal.missing)+"이 "+status.blockers.map(terse).join(", ")+"에 의해 봉쇄됨 (특수 지급 우회 미검증)";
  const extra=[];
  if(status.missing.length)extra.push("선행 미완료 "+status.missing.length+"개");
  if(status.needItem)extra.push("실물 표본 조건 별도");
  if(status.requiresBaseFunc?.length)extra.push("시설 "+status.requiresBaseFunc.join(", "));
  if(!extra.length)extra.push("룰셋 직접 배제 없음");
  return "완료 가능성을 가정할 후보 · "+extra.join(" · ");
}
function decorate(){
  for(const card of cards){
    const id=card.dataset.choiceId;
    const controls=document.createElement("div");
    controls.className="choice-sim-card-actions";
    if(isDerived(id)){
      controls.innerHTML='<span class="choice-sim-card-state" title="이 항목은 직접 선택이 아닌 Codex 조합의 결과입니다">경로 결과 · 별도 선택 아님</span>';
    }else{
      controls.innerHTML='<span class="choice-sim-card-state" aria-live="off"></span>'+
        '<button type="button" data-sim-pick="'+esc(id)+'" aria-label="'+esc(name(id))+' 완료로 가정">완료로 가정</button>';
    }
    card.appendChild(controls);
  }
}
function selectedStat(){
  const blockedResearch=[...state.blockedBy.keys()].filter(id=>!state.completed.has(id));
  const blockedSurface=surface.filter(id=>choiceStatus(index,state,id).kind==="blocked");
  const riskySurface=surface.filter(id=>choiceStatus(index,state,id).kind==="path-risk");
  stats.innerHTML='<span><b>'+state.past.length+'</b>개 과거 완료</span>'+
    '<span><b>'+state.steps.length+'</b>개 이후 가정</span>'+
    '<span><b>'+blockedSurface.length+'</b>개 분기 직접 봉쇄</span>'+
    '<span><b>'+riskySurface.length+'</b>개 분기 선행 경로 위험</span>'+
    '<span><b>'+blockedResearch.length+'</b>개 연구 직접 봉쇄</span>';
}
function cardStatuses(){
  for(const card of cards){
    const id=card.dataset.choiceId,st=choiceStatus(index,state,id);
    card.dataset.simState=st.kind;
    const label=card.querySelector(".choice-sim-card-state");
    if(!label)continue;
    const explanation=describe(st);
    label.title=explanation;
    if(!isDerived(id)){
      const copy={
        completed:st.blockers.length?"완료 유지 · 이후 차단 규칙 있음":"완료",
        blocked:"직접 봉쇄", "path-risk":"선행 경로 위험",
        pending:"선행/조건 확인 필요",candidate:"선택 후보",unknown:"불명"
      };
      label.textContent=copy[st.kind]||explanation;
      const btn=card.querySelector("[data-sim-pick]");
      btn.disabled=st.kind==="blocked"||st.kind==="completed"||st.kind==="unknown";
      btn.title=explanation;
      btn.textContent=st.kind==="completed"?"완료 기록됨":st.kind==="blocked"?"차단됨":"완료로 가정";
    }
  }
}
function renderTimeline(){
  let html="";
  if(state.past.length){
    html+='<div class="choice-sim-history-label">과거 완료 (입력 순서는 연구 완료 순서를 뜻하지 않음)</div>';
    html+='<div class="choice-sim-past-list">'+state.past.map(id=>
      '<span class="choice-sim-tag" title="'+esc(pretty(id))+'">'+esc(terse(id))+
      ' <button type="button" data-sim-remove-past="'+esc(id)+'" aria-label="'+esc(pretty(id))+' 과거 완료 목록에서 제외">×</button></span>'
    ).join("")+'</div>';
  }
  if(state.steps.length){
    html+='<div class="choice-sim-history-label">이후 가정 (위에서 아래로 완료 순서)</div>';
    html+='<ol class="choice-sim-steps">'+state.steps.map((id,i)=>{
      const st=choiceStatus(index,state,id);
      return '<li><span title="'+esc(pretty(id))+'"><b>'+esc(terse(id))+'</b><small>'+esc(id)+'</small></span>'+
        (st.blockers.length?'<span class="choice-sim-step-note">완료 이후 다른 선택이 차단 규칙을 가짐</span>':"")+
        '<button type="button" data-sim-remove-step="'+i+'">취소</button></li>';
    }).join("")+'</ol>';
  }
  timeline.innerHTML=html||'<p class="muted">아직 선택 이력이 없습니다. 아래 분기의 선택 버튼을 누르거나 기존 완료 연구를 입력하세요.</p>';
}
function renderBlocked(){
  const blocked=surface.map(id=>({id,status:choiceStatus(index,state,id)}))
    .filter(row=>row.status.kind==="blocked"||row.status.kind==="path-risk")
    .sort((a,b)=>(a.status.kind==="blocked"?0:1)-(b.status.kind==="blocked"?0:1)||
      a.id.localeCompare(b.id));
  if(!blocked.length){exclusions.innerHTML='<p class="muted">현재 가정으로 직접 봉쇄된 분기가 없습니다.</p>';return;}
  exclusions.innerHTML='<p class="muted">직접 배제와 선행 경로 위험을 따로 표시합니다. '+blocked.length+'개 중 최대 30개 표시.</p>'+
    blocked.slice(0,30).map(row=>{
      const st=row.status;
      const reason=st.kind==="blocked"?"차단 연구: "+blockerText(st.blockers):
        "차단된 명목 선행: "+pretty(st.nominal.missing)+" · 원인: "+blockerText(st.blockers);
      return '<div class="choice-sim-block-row"><strong>'+esc(terse(row.id))+'</strong>'+
        '<span class="'+(st.kind==="blocked"?"sim-text-blocked":"sim-text-risk")+'">'+
        (st.kind==="blocked"?"직접 봉쇄":"선행 경로 위험")+'</span>'+
        '<small>'+esc(reason)+'</small></div>';
    }).join("");
}
function renderMessage(){
  const conflicts=state.priorConflicts.slice(0,6).map(x=>esc(pretty(x.id))+" ← "+esc(blockerText(x.blockedBy)));
  const bits=[];
  if(notice)bits.push('<p>'+esc(notice)+'</p>');
  if(conflicts.length)bits.push('<p><b>과거 완료 목록의 배제 관계 주의:</b> '+conflicts.join(" / ")+
    (state.priorConflicts.length>6?" 외 "+(state.priorConflicts.length-6)+"건":"")+
    '. 완료 순서를 알 수 없으므로 입력을 삭제하거나 불가능한 이력이라고 단정하지 않습니다.</p>');
  if(state.skipped.length)bits.push('<p>적용되지 않은 가정 '+state.skipped.length+'건: '+
    state.skipped.slice(0,5).map(x=>esc(x.id)+" ("+esc(x.kind)+")").join(" · ")+'</p>');
  message.innerHTML=bits.join("")||'<p class="muted">분기 버튼으로 추가한 연구는 순서대로 계산합니다. 실제 연구 완료를 자동으로 보장하지 않습니다.</p>';
}
function refresh(){
  if(!index)return;
  state=computeChoiceScenario(index,previouslyCompleted,proposed);
  selectedStat();cardStatuses();renderTimeline();renderBlocked();renderMessage();renderSearch();
}

function renderSearch(){
  if(!index)return;
  const query=search.value.trim().toLocaleLowerCase();
  if(query.length<2){results.innerHTML='<p class="muted">두 글자 이상 입력하면 4,612개 연구 중에서 찾습니다.</p>';return;}
  const matched=index.topics.filter(t=>[t.id,t.koName,t.enName]
    .some(value=>value.toLocaleLowerCase().includes(query)))
    .sort((a,b)=>(a.id.toLowerCase()===query?-2:a.id.toLowerCase().startsWith(query)?-1:0)-
       (b.id.toLowerCase()===query?-2:b.id.toLowerCase().startsWith(query)?-1:0))
    .slice(0,12);
  if(!matched.length){results.innerHTML='<p class="muted">일치하는 연구가 없습니다.</p>';return;}
  results.innerHTML=matched.map(t=>{
    const st=choiceStatus(index,state,t.id);
    const canPlan=st.kind!=="blocked"&&st.kind!=="completed";
    const canPast=!state.steps.length&&!state.past.includes(t.id);
    return '<div class="choice-sim-result"><span><b>'+esc(name(t.id))+'</b><small>'+esc(t.id)+'</small>'+
      '<small>'+esc(describe(st))+'</small></span>'+
      '<div><button type="button" data-sim-search-plan="'+esc(t.id)+'" '+(canPlan?"":"disabled")+'>이후 가정</button>'+
      '<button type="button" data-sim-search-past="'+esc(t.id)+'" '+(canPast?"":"disabled")+
      ' title="가정 선택 이전에만 과거 완료를 추가할 수 있습니다">이미 완료</button></div></div>';
  }).join("");
}
function addStep(id){
  const st=choiceStatus(index,state,id);
  if(st.kind==="completed"||st.kind==="blocked"||st.kind==="unknown"){
    notice=describe(st);renderMessage();return;
  }
  const impact=choiceImpact(index,state,id,surface);
  proposed.push(id);
  const warnings=[];
  if(st.kind==="path-risk")warnings.push("차단된 선행 경로의 우회 여부 미검증");
  else if(st.missing?.length)warnings.push("명목 선행 "+st.missing.length+"개 미완료");
  if(st.needItem)warnings.push("실물 표본 조건 미검증");
  if(st.requiresBaseFunc?.length)warnings.push("시설 조건 미검증");
  notice=pretty(id)+" 완료를 가정했습니다. 새로 직접 봉쇄된 주요 분기 "+
    impact.newSurface.length+"개 · 전체 연구 "+impact.newDirect.length+"개."+
    (impact.alreadyCompleted.length?" 이미 완료한 연구 "+impact.alreadyCompleted.length+
      "개는 소급 취소하지 않습니다.":"")+
    (warnings.length?" [주의: "+warnings.join(" · ")+"]":"");
  refresh();
}
function updateCompletedField(){completedInput.value=previouslyCompleted.join("\n");}
function applyPast(){
  const parsed=parseCompletedResearch(index,completedInput.value);
  if(parsed.malformed){notice="입력 형식이 올바르지 않습니다. 연구 ID 목록이나 completed 배열 JSON을 입력하세요.";renderMessage();return;}
  previouslyCompleted=parsed.ids;
  proposed=[];
  updateCompletedField();
  notice="과거 완료 연구 "+parsed.ids.length+"개 적용. 이후 가정은 초기화했습니다."+
    (parsed.unknown.length?" 확인되지 않은 ID "+parsed.unknown.length+"개 제외: "+
      parsed.unknown.slice(0,7).join(", "):"");
  refresh();
}
panel?.addEventListener("click",event=>{
  if(!index)return;
  const button=event.target.closest("button");
  if(!button)return;
  const {simPick,simSearchPlan,simSearchPast,simRemovePast,simRemoveStep}=button.dataset;
  if(simPick){addStep(simPick);return;}
  if(simSearchPlan){addStep(simSearchPlan);return;}
  if(simSearchPast){
    if(proposed.length){notice="먼저 이후 가정을 취소한 뒤 과거 완료 이력을 수정하세요.";renderMessage();return;}
    if(!previouslyCompleted.includes(simSearchPast))previouslyCompleted.push(simSearchPast);
    updateCompletedField();
    notice=pretty(simSearchPast)+"을 과거 완료 이력에 추가했습니다. 완료 순서는 알 수 없습니다.";
    refresh();return;
  }
  if(simRemovePast){
    previouslyCompleted=previouslyCompleted.filter(id=>id!==simRemovePast);
    updateCompletedField();notice=pretty(simRemovePast)+"을 과거 완료 이력에서 제외했습니다.";refresh();return;
  }
  if(simRemoveStep!==undefined){
    const i=Number(simRemoveStep);
    proposed.splice(i,1);
    notice=(i+1)+"번째 가정을 취소하고 나머지 연구 순서를 다시 계산했습니다.";
    refresh();return;
  }
});
document.querySelector("#exclusiveRules").addEventListener("click",event=>{
  const button=event.target.closest("[data-sim-pick]");
  if(button&&index)addStep(button.dataset.simPick);
});
document.querySelector("#choiceCompletedApply").addEventListener("click",()=>{if(index)applyPast();});
document.querySelector("#choiceScenarioReset").addEventListener("click",()=>{
  if(!index)return;
  previouslyCompleted=[];proposed=[];completedInput.value="";search.value="";
  notice="완료 이력과 이후 가정을 모두 초기화했습니다.";refresh();
});
search.addEventListener("input",()=>{if(index)renderSearch();});

async function initialize(){
  try{
    const response=await fetch("../data/progression-research.json");
    if(!response.ok)throw new Error("HTTP "+response.status);
    const body=await response.json();
    index=buildChoiceIndex(body.topics);
    state=computeChoiceScenario(index,[],[]);
    decorate();
    content.hidden=false;
    loading.hidden=true;
    notice="원본 "+index.topics.length+"개 연구를 불러왔습니다. 직접 disables만 강제 봉쇄합니다.";
    refresh();
  }catch(error){
    loading.textContent="시뮬레이터 연구 데이터 로드 실패: "+error.message+
      ". 정적 분기 설명은 계속 볼 수 있습니다.";
    loading.classList.add("choice-sim-error");
  }
}
if(panel)initialize();
