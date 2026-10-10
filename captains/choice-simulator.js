import {
  buildChoiceIndex, choiceLabel, computeChoiceScenario, choiceStatus,
  choiceImpact, choiceGrantCandidates, parseCompletedResearch
} from "./choice-simulator-core.js";
import {parseXpiratezSave} from "./save-import-core.js";

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
const saveFile=document.querySelector("#choiceSaveFile");
const saveSummary=document.querySelector("#choiceSaveSummary");
const evidenceSection=document.querySelector("#choiceSaveEvidence");
const evidenceContent=document.querySelector("#choiceSaveEvidenceContent");
let index=null,previouslyCompleted=[],proposed=[],state=null;
let importedDisabled=[],sourceMode="manual",saveInfo=null,saveEvidence=null;
let importGeneration=0;
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
    if(status.inconsistent)return "입력 불일치: 현재 완료와 영구 배제에 동시에 포함된 연구";
    const bonus=status.grant?.outcomes?.length||0;
    return (status.origin==="past"?"현재 완료 (세이브/입력)":"완료로 가정 (선택 순서 반영)")+
      (bonus?" · 추가 무료 연구 지급 후보 "+bonus+"종 / 가중치 "+status.grant.tickets+"칸 (실제 지급 미확정)":"");
  }
  if(status.kind==="blocked"){
    if(status.removedBy)return "완료 연구 플래그 제거 · "+pretty(status.removedBy)+"이 영구 배제";
    if(status.fromSave)return "세이브 researchRuleStatus=2 · 현재 영구 배제";
    return "직접 영구 배제 · "+(status.blockers.length?status.blockers.map(terse).join(", "):"출처 미상");
  }
  if(status.kind==="path-risk")
    return "선행 경로 위험 · "+pretty(status.nominal.missing)+"이 "+
      (status.nominal.fromSave?"세이브에서 영구 배제":status.blockers.length?status.blockers.map(terse).join(", ")+"에 의해 배제":"배제됨")+
      (status.alternateUnlocks?.length?" · 별도 unlocks 우회 후보 "+status.alternateUnlocks.map(terse).slice(0,3).join(", "):"")+
      " (무료 지급·이벤트 우회 미검증)";
  const extra=[];
  if(status.unresolved?.length)extra.push("원본 선행 연구 참조 미해결: "+status.unresolved.join(", "));
  if(status.unlockedBy?.length)extra.push("unlocks로 dependencies 우회: "+status.unlockedBy.map(terse).slice(0,3).join(", "));
  if(status.missingDependencies?.length)extra.push("dependencies 미완료 "+status.missingDependencies.length+"개");
  if(status.missingRequires?.length)extra.push("requires 필수 미완료 "+status.missingRequires.length+"개");
  if(status.zeroCost)extra.push("연구량 0: 자동 처리 조건 확인 필요");
  if(status.grant?.tickets)extra.push("무료 지급 "+status.grant.outcomes.length+"종 / 추첨 가중치 "+status.grant.tickets+"칸 (실제 결과 미확정)");
  if(status.grant?.unresolved?.length)extra.push("DB에 없는 무료 지급 후보 "+status.grant.unresolved.length+"건 제외");
  if(status.needItem)extra.push("실물 표본 조건 별도"+(status.neededItem?" ("+status.neededItem+")":""));
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
  const blockedResearch=[...state.disabled].filter(id=>!state.completed.has(id));
  const blockedSurface=surface.filter(id=>choiceStatus(index,state,id).kind==="blocked");
  const riskySurface=surface.filter(id=>choiceStatus(index,state,id).kind==="path-risk");
  const bypassedSurface=surface.filter(id=>choiceStatus(index,state,id).unlockedBy?.length>0);
  stats.innerHTML='<span><b>'+state.completed.size+'</b>개 현재 완료</span>'+
    '<span><b>'+state.steps.length+'</b>개 이후 가정</span>'+
    '<span><b>'+state.erased.length+'</b>개 완료 플래그 제거</span>'+
    '<span><b>'+blockedSurface.length+'</b>개 분기 직접 봉쇄</span>'+
    '<span><b>'+riskySurface.length+'</b>개 분기 선행 경로 위험</span>'+
    '<span><b>'+bypassedSurface.length+'</b>개 분기 선행 우회 활성</span>'+
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
        completed:st.inconsistent?"완료/배제 상태 충돌":"완료",
        blocked:st.wasCompleted?"완료 취소 · 영구 배제":st.fromSave?"세이브상 영구 배제":"직접 영구 배제", "path-risk":"선행 경로 위험",
        pending:"선행/조건 확인 필요",candidate:"선택 후보",uncertain:"원본 선행 참조 미해결",unknown:"불명"
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
    html+='<div class="choice-sim-history-label">불러온 현재 완료 목록 (가정 선택 후 상태 반영)</div>';
    html+='<div class="choice-sim-past-list">'+state.past.map(id=>
      '<span class="choice-sim-tag '+(state.completed.has(id)?"":"choice-sim-erased")+'" title="'+esc(pretty(id))+'">'+
      esc(terse(id))+(state.completed.has(id)?"":" · 완료 취소/배제")+
      (sourceMode==="save"?"":' <button type="button" data-sim-remove-past="'+esc(id)+'" aria-label="'+esc(pretty(id))+' 목록에서 제외">×</button>')+'</span>'
    ).join("")+'</div>';
  }
  if(state.steps.length){
    html+='<div class="choice-sim-history-label">이후 가정 (위에서 아래로 완료 순서)</div>';
    html+='<ol class="choice-sim-steps">'+state.steps.map((id,i)=>{
      const st=choiceStatus(index,state,id);
      return '<li><span title="'+esc(pretty(id))+'"><b>'+esc(terse(id))+'</b><small>'+esc(id)+'</small></span>'+
        (st.kind==="blocked"?'<span class="choice-sim-step-note">이후 선택으로 완료 플래그 제거됨</span>':"")+
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
      const cause=st.fromSave?saveEvidence?.disableCauses?.find(x=>x.id===row.id):null;
      const reason=st.kind==="blocked"?
        (st.fromSave?"세이브 영구 배제(researchRuleStatus=2)"+
          (cause?" · 연구 일지 기반 배제 원인 후보: "+pretty(cause.source.id):" · 원인 불확인"):
          st.blockers.length?"배제 원인: "+blockerText(st.blockers):"영구 배제됨")+
          (st.removedBy?" · 완료 플래그 제거 연구: "+pretty(st.removedBy):""):
        "차단된 명목 선행: "+pretty(st.nominal.missing)+" · 원인: "+
          (st.nominal.fromSave?"세이브 연구 상태=2":st.blockers.length?blockerText(st.blockers):"경로 배제");
      return '<div class="choice-sim-block-row"><strong>'+esc(terse(row.id))+'</strong>'+
        '<span class="'+(st.kind==="blocked"?"sim-text-blocked":"sim-text-risk")+'">'+
        (st.kind==="blocked"?"직접 봉쇄":"선행 경로 위험")+'</span>'+
        '<small>'+esc(reason)+'</small></div>';
    }).join("");
}

function renderSaveEvidence(){
  if(!saveEvidence || sourceMode!=="save"){
    evidenceSection.hidden=true;
    evidenceContent.textContent="";
    return;
  }
  evidenceSection.hidden=false;
  const data=saveEvidence,sourceNames=["기지 연구","무료 지급(원인)","후속 무료 지급","임무 보상","이벤트 보상"];
  const day=e=>String(e.year)+"-"+String(e.month).padStart(2,"0")+"-"+String(e.day).padStart(2,"0");
  const timeline=data.diary.filter(entry=>surface.includes(entry.id) || index.byId.get(entry.id)?.disables.length);
  const causes=data.disableCauses.filter(x=>surface.includes(x.id));
  let html='<p class="muted">일지 인식 '+data.diary.length+'건 · 주요 선택 이력 '+timeline.length+
    '건 · <b>현재 영구 배제와 연결되는 원인 후보 '+data.disableCauses.length+'건</b></p>';
  if(data.lostChoices.length){
    const uniq=new Map(data.lostChoices.map(e=>[e.id,e]));
    html+='<div class="choice-sim-evidence-note"><b>과거 기록은 있으나 지금은 영구 배제된 선택 '+uniq.size+'개</b> — '+
      [...uniq.values()].slice(0,8).map(e=>esc(terse(e.id))+" ("+esc(day(e))+")").join(" · ")+
      '</div>';
  }
  if(causes.length){
    html+='<h5>영구 배제 원인 후보 (게임 연구 일지 × 원본 disables)</h5>'+
      causes.slice(0,15).map(({id,source})=>
        '<div class="choice-sim-evidence-row"><b>'+esc(terse(id))+'</b><small>← '+
        esc(terse(source.id))+' · '+esc(day(source))+
        ' · '+esc(sourceNames[source.sourceType]||"출처 미상")+'</small></div>').join("");
  }
  if(timeline.length){
    html+='<h5>주요 선택 기록 (일지 순서의 최신 12건)</h5>'+
      timeline.slice(-12).reverse().map(e=>{
        const disabled=data.disabled.includes(e.id),discovered=data.completed.includes(e.id);
        return '<div class="choice-sim-evidence-row"><b>'+esc(terse(e.id))+'</b>'+
          '<small>'+esc(day(e))+' · '+esc(sourceNames[e.sourceType]||"출처 미상")+
          (e.sourceName?" · "+esc(e.sourceName):"")+' · '+
          (disabled?"현재 영구 배제":discovered?"현재 완료":"현재 미완료(과거 기록)")+
          '</small></div>';
      }).join("");
  }else{
    html+='<p class="muted">이 세이브에서 분석 가능한 주요 분기 연구 일지가 없습니다. '+
      '일지가 없다고 연구를 완료하지 않았다는 뜻은 아닙니다. 현재 상태는 discovered와 researchRuleStatus를 기준으로 유지합니다.</p>';
  }
  html+='<p class="choice-sim-help">일지의 획득 경로와 날짜는 세이브 기록입니다. 배제 원인 후보는 '+
    '룰셋의 직접 disables와 대조한 추정으로, 엔진 내부의 정확한 발생 원인을 입증하거나 같은 날짜 안의 실행 순서를 확정하지 않습니다.</p>';
  evidenceContent.innerHTML=html;
}

function renderMessage(){
  const conflicts=state.priorConflicts.slice(0,6).map(x=>
    esc(pretty(x.id))+" ← "+(x.fromSave?"세이브 완료/배제 동시 기록":esc(blockerText(x.blockedBy))));
  const bits=[];
  if(notice)bits.push('<p>'+esc(notice)+'</p>');
  if(conflicts.length)bits.push('<p><b>과거 완료 목록의 배제 관계 주의:</b> '+conflicts.join(" / ")+
    (state.priorConflicts.length>6?" 외 "+(state.priorConflicts.length-6)+"건":"")+
    '. 수동 입력 순서는 완료 시점이 아니며, 세이브에서 완료와 배제가 동시에 있다면 파일 상태를 확인해야 합니다.</p>');
  if(state.erased.length)bits.push('<p><b>OXCE 엔진 기준 완료 플래그 제거 '+state.erased.length+'건:</b> '+
    state.erased.slice(0,6).map(x=>esc(terse(x.id))+" ← "+esc(terse(x.by))).join(" · ")+
    '. 이미 지급된 아이템/이벤트 보상을 되돌리는지는 별도 룰로 판단해야 합니다.</p>');
  if(state.skipped.length)bits.push('<p>적용되지 않은 가정 '+state.skipped.length+'건: '+
    state.skipped.slice(0,5).map(x=>esc(x.id)+" ("+esc(x.kind)+")").join(" · ")+'</p>');
  message.innerHTML=bits.join("")||'<p class="muted">분기 버튼으로 추가한 연구는 순서대로 계산합니다. 실제 연구 완료를 자동으로 보장하지 않습니다.</p>';
}
function refresh(){
  if(!index)return;
  state=computeChoiceScenario(index,previouslyCompleted,proposed,{snapshot:sourceMode==="save",disabledIds:importedDisabled});
  selectedStat();cardStatuses();renderTimeline();renderBlocked();renderMessage();renderSearch();renderSaveEvidence();
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
    const canPast=sourceMode!=="save"&&!state.steps.length&&!state.past.includes(t.id);
    return '<div class="choice-sim-result"><span><b>'+esc(name(t.id))+'</b><small>'+esc(t.id)+'</small>'+
      '<small>'+esc(describe(st))+'</small>'+
      (st.grant?.eligible?.length?'<small class="choice-sim-bonus-preview">무료 지급 후보: '+
        esc(st.grant.outcomes.slice(0,4).map(x=>name(x.id)+
          (x.weight>1?" ×"+x.weight:"")).join(" · "))+
        (st.grant.outcomes.length>4?" 외 "+(st.grant.outcomes.length-4)+"종":"")+
        ' / 추첨칸 '+st.grant.tickets+'개 · 결과 미확정</small>':"")+'</span>'+
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
  const bonus=choiceGrantCandidates(index,state,id);
  proposed.push(id);
  const warnings=[];
  if(st.kind==="path-risk")warnings.push("차단된 선행 경로의 우회 여부 미검증");
  else if(st.missing?.length)warnings.push("명목 선행 "+st.missing.length+"개 미완료");
  if(st.zeroCost)warnings.push("0비용 자동 처리/지급 경로 미검증");
  if(bonus.tickets)warnings.push("추가 무료 연구 후보 "+bonus.outcomes.length+"종, 추첨칸 "+bonus.tickets+"개"+
    " ("+bonus.outcomes.slice(0,3).map(x=>name(x.id)+(x.weight>1?" ×"+x.weight:"")).join(", ")+") — 실제 획득 미확정");
  if(bonus.pending.length)warnings.push("조건부 무료 지급 후보 "+bonus.pending.length+"개는 아직 미충족");
  if(bonus.unresolved?.length)warnings.push("현재 연구 DB에 없는 무료 지급 참조 "+bonus.unresolved.length+"건은 확률 추정에서 제외");
  if(st.unresolved?.length)warnings.push("현재 연구 DB에 없는 선행 "+st.unresolved.join(", ")+"은 연구 가능 여부를 미확정으로 둡니다");
  if(st.needItem)warnings.push("실물 표본 조건 미검증");
  if(st.requiresBaseFunc?.length)warnings.push("시설 조건 미검증");
  notice=pretty(id)+" 완료를 가정했습니다. 새로 직접 봉쇄된 주요 분기 "+
    impact.newSurface.length+"개 · 전체 연구 "+impact.newDirect.length+"개."+
    (impact.alreadyCompleted.length?" 이미 완료한 연구 "+impact.alreadyCompleted.length+
      "개의 완료 플래그가 취소되고 영구 배제됩니다.":"")+
    (warnings.length?" [주의: "+warnings.join(" · ")+"]":"");
  refresh();
}
function updateCompletedField(){completedInput.value=previouslyCompleted.join("\n");}
function applyPast(){
  const parsed=parseCompletedResearch(index,completedInput.value);
  if(parsed.malformed){notice="입력 형식이 올바르지 않습니다. 연구 ID 목록이나 completed 배열 JSON을 입력하세요.";renderMessage();return;}
  importGeneration++;
  previouslyCompleted=parsed.ids;
  proposed=[];importedDisabled=[];sourceMode="manual";saveInfo=null;saveEvidence=null;
  saveSummary.textContent="수동 목록 적용: 이전 세이브의 연구 배제 상태는 초기화되었습니다.";
  if(saveFile)saveFile.value="";
  updateCompletedField();
  notice="수동 완료 연구 "+parsed.ids.length+"개 적용. 이후 가정과 기존 .sav 배제 상태를 초기화했습니다."+
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
  importGeneration++;
  previouslyCompleted=[];proposed=[];importedDisabled=[];sourceMode="manual";saveInfo=null;saveEvidence=null;
  completedInput.value="";search.value="";
  if(saveFile)saveFile.value="";
  saveSummary.textContent="";
  notice="완료·영구 배제 상태 및 이후 가정을 모두 초기화했습니다.";refresh();
});
search.addEventListener("input",()=>{if(index)renderSearch();});

async function importSave(file){
  if(!index){saveSummary.textContent="연구 데이터 준비 전에는 파일을 분석할 수 없습니다.";return;}
  if(!file)return;
  const limit=60*1024*1024;
  if(file.size>limit){saveSummary.textContent="60MB를 넘는 세이브는 브라우저 메모리 보호를 위해 지원하지 않습니다.";return;}
  const generation=++importGeneration;
  saveSummary.textContent="선택한 파일을 브라우저 내부에서 분석하는 중입니다. 외부로 전송하지 않습니다.";
  try{
    const fileText=await file.text();
    if(generation!==importGeneration)return;
    const parsed=parseXpiratezSave(fileText,index);
    const known=parsed.completed.length+parsed.disabled.length;
    if(!known&&(parsed.unknownCompleted.length||parsed.unknownDisabled.length))
      throw new Error("현재 XPiratez DB와 일치하는 연구가 0개입니다. 모드 버전을 확인하세요.");
    previouslyCompleted=parsed.completed;
    importedDisabled=parsed.disabled;
    sourceMode="save";saveInfo=parsed.meta;saveEvidence=parsed;proposed=[];
    updateCompletedField();
    const title=file.name+" · 현재 완료 "+parsed.completed.length+"개 · 영구 배제 "+
      parsed.disabled.length+"개 · 연구 일지 "+parsed.diary.length+"건 · 배제 원인 후보 "+
      parsed.disableCauses.length+"건";
    saveSummary.textContent=title+(parsed.warnings.length?"\n주의: "+parsed.warnings.join(" / "):"")+
      "\n출처: 두 번째 YAML 문서의 discovered / researchRuleStatus (2=영구 배제) / researchDiary. 진행 중 연구·일반 지급 목록은 제외.";
    notice=title+". 이후 선택은 OXCE의 실제 disables 처리(완료 플래그 제거 및 영구 배제)를 따릅니다.";
    refresh();
  }catch(error){
    if(generation!==importGeneration)return;
    saveSummary.textContent="세이브 분석 실패: "+error.message+
      "\n기존 선택 상태는 변경하지 않았습니다. 텍스트형 OXCE .sav인지 확인하세요.";
    saveFile.value="";
  }
}
saveFile?.addEventListener("change",event=>{
  const file=event.target.files?.[0];
  if(file)importSave(file);
});

async function initialize(){
  try{
    const [response,gateResponse]=await Promise.all([
      fetch("../data/progression-research.json"),
      fetch("../data/choice-research-gates.json")
    ]);
    if(!response.ok||!gateResponse.ok)throw new Error("연구 규칙 또는 해금 조건 파일 HTTP "+(response.ok?gateResponse.status:response.status));
    const [body,gates]=await Promise.all([response.json(),gateResponse.json()]);
    if(gates.schemaVersion!==1||gates.count!==body.topics.length)
      throw new Error("기본 연구 DB와 분기 조건 DB의 버전/항목 수가 일치하지 않습니다.");
    index=buildChoiceIndex(body.topics,gates);
    state=computeChoiceScenario(index,[],[]);
    decorate();
    content.hidden=false;
    loading.hidden=true;
    notice="원본 "+index.topics.length+"개 연구 로드 완료. unlocks가 dependencies만 우회하는 엔진 규칙을 사용합니다. "+
      "현재 DB에 없는 외부 참조: dependencies "+(gates.unresolvedByField?.dependencies||0)+"건, "+
      "무료 지급 "+(gates.unresolvedByField?.getOneFree||0)+"건은 판정 보류하며 임의로 완료 처리하지 않습니다.";
    refresh();
  }catch(error){
    loading.textContent="시뮬레이터 연구 데이터 로드 실패: "+error.message+
      ". 정적 분기 설명은 계속 볼 수 있습니다.";
    loading.classList.add("choice-sim-error");
  }
}
if(panel)initialize();
