import {parseXpiratezSave} from "../captains/save-import-core.js";
import {choiceGrantCandidates} from "../captains/choice-simulator-core.js";
import {
  makeResearch21Index,research21State,evaluateResearch21,applyResearch21,findResearch21
} from "./exclusivity-21.js";

const $=id=>document.getElementById(id);
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=x=>Number(x).toLocaleString("ko-KR");
const panel=$("researchExclusivity21");
let index=null,model=null,history=[],chosen="STR_DARK_STAR",source="빈 상태",message="",searchResults=[];
const name=id=>index?.raw[id]?.name||id;
const link=id=>'<button class="r21-link" type="button" data-r21-pick="'+esc(id)+'">'+
  esc(name(id))+'<small>'+esc(id)+'</small></button>';
const names=ids=>(ids||[]).length?ids.map(link).join(" "):'<span class="r21-muted">없음</span>';
const tip=(v,s)=>'<span class="r21-note">'+esc(v)+(s?" · "+esc(s):"")+'</span>';
async function load(){
  const url="../data/research-exclusivity-21.json";
  if(typeof DecompressionStream!=="undefined"){
    try{
      const reply=await fetch(url+".gz");
      if(reply.ok)return await new Response(reply.body.pipeThrough(new DecompressionStream("gzip"))).json();
    }catch{ /* Canonical uncompressed JSON is authoritative. */ }
  }
  const response=await fetch(url);
  if(!response.ok)throw Error("연구 데이터 로드 실패: HTTP "+response.status);
  return response.json();
}
function clearHistory(){history=[];}
function preset(){
  const disabled=index.raw.STR_CAPTAIN_LAZYASS?.disables||[];
  model=research21State(index,{completed:["STR_CAPTAIN_LAZYASS"],disabled});
  source="예시: 게으른 선장 연구만 완료로 가정 · 실제 35_.sav 상태가 아님";
  message="이 예시는 선장 연구 하나의 disables만 반영합니다. 실제 캠페인 판정에는 세이브를 불러오세요.";
  clearHistory();
  render();
}
function allReset(){
  model=research21State(index);
  source="빈 연구 상태 (세이브 미적용)";
  message="완료 연구와 영구 배제를 알 수 없으므로, 현재 캠페인의 실제 도달성으로 해석하지 마세요.";
  clearHistory();
  render();
}
function statusLabel(k){
  return ({disabled:"직접 영구 배제",completed:"완료",ready:"연구 선행조건 충족",
    conditional:"실물/시설 확인 필요", "grant-candidate":"무료·이벤트 지급 후보",
    "missing-prerequisites":"선행 연구 미완료",unknown:"연구 원본 없음"})[k]||k;
}
function sourceRows(id,d){
  const bonus=choiceGrantCandidates(index.choice,model,id);
  let html='<div class="r21-sources"><h4>조건과 상호배제</h4>';
  const topic=index.raw[id];
  const done=topic.dependencies.filter(x=>model.completed.has(x));
  html+='<p><b>dependencies (기본 AND):</b> '+names(topic.dependencies)+
    (d.unlockedBy?.length?tip("unlocks 우회 적용",d.unlockedBy.join(", ")):"")+'</p>';
  html+='<p><b>requires (해금으로 우회 불가):</b> '+names(topic.requires)+'</p>';
  html+='<p><b>해당 연구가 비활성화하는 연구:</b> '+names(topic.disables)+'</p>';
  html+='<p><b>재활성화하는 연구:</b> '+names(topic.reenables)+'</p>';
  html+='<p><b>자체 직접 해금:</b> '+names(topic.unlocks)+'</p>';
  if(d.missingDependencies?.length)html+='<p class="r21-warn">아직 완료되지 않은 dependencies: '+names(d.missingDependencies)+'</p>';
  if(d.missingRequires?.length)html+='<p class="r21-warn">아직 완료되지 않은 requires: '+names(d.missingRequires)+'</p>';
  if(d.disabled)html+='<p class="r21-block">현재 researchRuleStatus=2이므로 이벤트 직접 지급·무료 추첨도 성공하지 않습니다.'+
    (d.reenablers.length?' 재활성화 연구 출처: '+d.reenablers.map(link).join(" "):" 현재 룰에서 재활성화 출처 미발견")+'</p>';
  if(d.needItem)html+='<p class="r21-warn">연구 실물 표본 필요: <code>'+esc(d.neededItem)+'</code> (수량/보유·소모 확인 전)</p>';
  if(d.baseFunctions.length)html+='<p class="r21-warn">필요 기지 기능: '+esc(d.baseFunctions.join(", "))+' (현재 시설 미검증)</p>';
  if(topic.spawnedItem)html+='<p>연구 완료 보상 아이템: <code>'+esc(topic.spawnedItem)+'</code> · '+fmt(topic.spawnedItemCount||1)+'개 (지급/실제 획득 시점 별도 확인)</p>';
  if(bonus.eligible.length||bonus.pending.length||topic.getOneFree.length||Object.keys(topic.getOneFreeProtected).length){
    html+='<h4>이 연구를 수행하면 발생하는 무료 추첨 (보장 아님)</h4>';
    html+='<p>현재 후보 '+bonus.eligible.length+'장 · 대기 '+bonus.pending.length+
      '장 · 중복 ID는 추첨 가중치 그대로 유지'+(bonus.sequential?" · 순차 선택":"")+'</p>';
    html+=bonus.outcomes.map(x=>'<p>• '+link(x.id)+' · '+x.weight+'/'+bonus.tickets+
      '장 ('+x.percent.toFixed(1)+'%)</p>').join("");
    html+=bonus.pending.map(x=>'<p class="r21-muted">잠금 '+link(x.id)+' · 보호 조건 '+link(x.requires)+'</p>').join("");
  }
  html+='</div>';
  return html;
}
function grantSection(id,d){
  const grant=d.free||[],events=d.events||[];
  let html='<div class="r21-sources"><h4>다른 연구에서 무료 획득하는 경로</h4>';
  if(!grant.length)html+='<p class="r21-muted">원본 연구에 기록된 직접 무료 지급 출처 없음</p>';
  else for(const f of grant){
    html+='<div class="r21-entry"><p>'+link(f.parent)+(f.guard?' · 보호 조건 '+link(f.guard):"")+
      ' · '+(f.candidate?'현재 추첨 후보':'가드/출처 미충족 또는 이미 완료')+
      (f.candidate?' · '+f.targetTickets+'/'+f.tickets+'장 ('+(100*f.chance).toFixed(1)+'%)':"")+'</p>';
    if(f.candidate)html+='<button type="button" data-r21-apply="grant" data-r21-target="'+esc(id)+
      '" data-r21-source="'+esc(f.parent)+'">추첨 결과가 이 연구였다고 가정</button>';
    html+='</div>';
  }
  html+='<h4>이벤트의 연구 직접 지급 (연구 목록에서 1개 선정)</h4>';
  if(!events.length)html+='<p class="r21-muted">이벤트 연구 직접 지급 출처 없음</p>';
  for(const e of events.slice(0,30)){
    const when=e.lastMonth!==null&&e.lastMonth>=0?'~'+e.lastMonth+'개월':"종료시한 지정 없음";
    const reason=[];
    if(e.missing.length)reason.push("필요 연구 미완료 "+e.missing.join(", "));
    if(e.forbidden.length)reason.push("부정 트리거 충돌 "+e.forbidden.join(", "));
    if(e.expired)reason.push("이벤트 기간 종료");
    if(e.early)reason.push("이벤트 시작 전");
    if(e.blocked)reason.push("현재 차단");
    if(e.missingItems.length)reason.push("실물 아이템 필요 "+e.missingItems.join(", "));
    if(e.facility.length)reason.push("기지 시설 필요 "+e.facility.join(", "));
    if(e.oneTimeUnverified)reason.push("1회성 발생 이력 미확인");
    if(e.otherConditions.length)reason.push("추가 스크립트 조건 "+e.otherConditions.join(", "));
    const stateText=e.ready?"연구 트리거 충족(아이템·시설·추첨은 별도)":"조건 미충족/검증 필요";
    html+='<div class="r21-entry"><p><strong>'+esc(e.eventId)+'</strong> <small>'+esc(e.script)+'</small></p>'+
      '<p>'+esc(stateText)+' · '+esc(e.mode)+' · 시작 '+fmt(e.firstMonth)+'개월, '+esc(when)+
      ' · executionOdds '+fmt(e.odds)+'% (이벤트 전체 확률이 아님)</p>'+
      '<p>researchList '+fmt(e.researchList.length)+'개 · 이 연구의 현재 선택 확률 '+
      (e.selectedChance===null?'없음':(e.selectedChance*100).toFixed(1)+'% (이벤트가 이 목록에서 1개 지급할 때)')+'</p>'+
      (reason.length?'<p class="r21-warn">'+esc(reason.join(" · "))+'</p>':"");
    if(e.ready&&!d.disabled&&!d.done)html+='<button type="button" data-r21-apply="grant" data-r21-target="'+esc(id)+
      '" data-r21-source="'+esc(e.eventId)+'">이벤트가 이 연구를 지급했다고 가정</button>';
    html+='</div>';
  }
  if(events.length>30)html+='<p>이벤트 출처 '+(events.length-30)+'건 추가 생략</p>';
  return html+'</div>';
}
function renderDetail(){
  const box=$("r21Detail"),d=evaluateResearch21(index,model,chosen);
  if(d.kind==="unknown"){box.innerHTML='<p>연구 ID를 선택하세요.</p>';return;}
  const b=tip(statusLabel(d.kind));
  let out='<h3>'+esc(d.name)+' <small>'+esc(chosen)+'</small></h3><div class="r21-status r21-'+esc(d.kind)+'">'+b+'</div>';
  out+='<p>2.1 현재 판정 · 완료 '+fmt(model.completed.size)+'개 · 차단 '+fmt(model.disabled.size)+'개'+
    (model.monthsPassed===null?" · 진행 월 미확인":" · 진행 "+fmt(model.monthsPassed)+"개월")+'</p>';
  if(d.disabled)out+='<p class="r21-block">연구 직접 지급 / getOneFree에서도 엔진 비활성화 검사를 통과하지 못합니다.</p>';
  if(d.canSimulateManual)out+='<button type="button" data-r21-apply="manual" data-r21-target="'+esc(chosen)+
    '">직접 연구 완료를 가정'+(d.sampleUnverified?" (실물·시설 미검증)":"")+'</button>';
  if(d.done){
    const bonus=choiceGrantCandidates(index.choice,model,chosen);
    if(bonus.tickets>0)out+='<button type="button" data-r21-apply="repeat" data-r21-target="'+esc(chosen)+
      '">재연구 시 무료 추첨 후보 확인 ('+bonus.tickets+'장)</button>';
  }
  out+=sourceRows(chosen,d)+grantSection(chosen,d);
  box.innerHTML=out;
}
function renderHistory(){
  const timeline=$("r21Timeline");
  timeline.innerHTML=history.length?history.map((h,i)=>
    '<div class="r21-step">'+(i+1)+'. '+esc(h.mode==="grant"?"확률 보상 가정":"직접 연구 가정")+
    ' · '+esc(h.id)+' · '+esc(h.note||"")+'</div>').join(""):
    '<p class="r21-muted">아직 이후 연구 완료를 가정하지 않았습니다.</p>';
  $("r21Undo").disabled=!history.length;
}
function renderSearch(){
  const results=findResearch21(index,$("r21Search").value,15);
  $("r21Results").innerHTML=results.map(x=>'<button type="button" data-r21-pick="'+esc(x.id)+'">'+
    esc(x.name)+' <small>'+esc(x.id)+'</small></button>').join("")||
    '<span class="r21-muted">ID나 한글 이름으로 검색</span>';
}
function render(){
  $("r21Source").textContent=source;
  $("r21Message").textContent=message;
  renderSearch();renderDetail();renderHistory();
}
function apply(mode,id,src){
  if(mode==="repeat"){
    const res=applyResearch21(index,model,id,{mode});
    message=res.ok?"재연구가 허용되는 상황의 무료 연구 추첨 후보를 표시했습니다. 추첨 결과는 자동 완료로 처리하지 않습니다.":res.why;
    render();return;
  }
  const result=applyResearch21(index,model,id,{mode,source:src||null});
  if(!result.ok){message=result.why;render();return;}
  history.push({id,mode,source:src,before:model,note:mode==="grant"?
    "이벤트 발생/무료 추첨 결과를 조건부로 가정 (실제 획득 미증명)":
    (result.conditional?"실물·시설 미검증 가정 포함":"")});
  model=result.state;
  chosen=id;
  message=(result.conditional?"조건부 시나리오로 ":"규칙상 완료 가정으로 ")+"반영. 신규 배제 "+
    result.addedDisabled.length+"건, 완료 플래그 제거 "+result.removed.length+"건, 재활성화 "+result.reenabled.length+"건.";
  render();
}
async function importSave(file){
  if(!file)return;
  if(file.size>25*1024*1024)throw Error("세이브 파일이 25MB를 초과합니다.");
  const text=await file.text();
  const parsed=parseXpiratezSave(text,index.choice);
  const match=text.match(/^monthsPassed:\s*(\d+)\s*(?:#.*)?$/m);
  model=research21State(index,{
    completed:parsed.completed,disabled:parsed.disabled,
    monthsPassed:match?Number(match[1]):null
  });
  clearHistory();
  source="로컬 세이브 · 완료 "+fmt(parsed.completed.length)+"개 / 직접 비활성화 "+
    fmt(parsed.disabled.length)+"개 · 모드 불일치 연구 "+fmt(parsed.unknownCompleted.length+parsed.unknownDisabled.length)+"개";
  message=(parsed.warnings.length?parsed.warnings.join(" / "):"완료·비활성 연구는 .sav 값을 기준으로 적용.")+
    " 파일은 브라우저 밖으로 전송하거나 사이트에 저장하지 않았습니다.";
  render();
}
async function initialize(){
  $("r21Loading").textContent="X-Piratez 2.1 연구 규칙 로딩 중…";
  const raw=await load();
  index=makeResearch21Index(raw);
  if(raw.stats.researchCount!==index.choice.topics.length)throw Error("연구 ID 개수가 일치하지 않음");
  $("r21Loading").textContent="2.1 연구 "+fmt(raw.stats.researchCount)+"개 · disables "+
    fmt(raw.stats.disableEdges)+"건 · 보호 무료 해금 출처 "+fmt(raw.stats.protectedSources)+
    "개 · 이벤트 경로 "+fmt(raw.stats.scriptedEventPaths)+"건";
  $("r21Content").hidden=false;
  $("r21Search").value=chosen;
  allReset();
  $("r21Search").addEventListener("input",renderSearch);
  panel.addEventListener("click",event=>{
    const choice=event.target.closest("[data-r21-pick]");
    if(choice){chosen=choice.dataset.r21Pick;renderDetail();return;}
    const applyButton=event.target.closest("[data-r21-apply]");
    if(applyButton)apply(applyButton.dataset.r21Apply,
      applyButton.dataset.r21Target,applyButton.dataset.r21Source);
  });
  $("r21Preset").addEventListener("click",preset);
  $("r21Clear").addEventListener("click",allReset);
  $("r21Undo").addEventListener("click",()=>{
    const step=history.pop();
    if(!step)return;
    model=step.before;message="마지막 가정을 취소했습니다.";render();
  });
  $("r21Save").addEventListener("change",async event=>{
    try{await importSave(event.target.files?.[0]);}
    catch(e){message="세이브 확인 실패: "+e.message;render();}
    finally{event.target.value="";}
  });
}
let requested=false;
if(panel&&location.hash==="#researchExclusivity21")panel.open=true;
if(panel)window.addEventListener("hashchange",()=>{
  if(location.hash==="#researchExclusivity21")panel.open=true;
});
if(panel)panel.addEventListener("toggle",()=>{
  if(!panel.open||requested)return;
  requested=true;
  initialize().catch(e=>{
    $("r21Loading").textContent="2.1 판정 로드 실패: "+e.message;
    requested=false;
  });
});
