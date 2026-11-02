// Single public 2.1 training screen. No legacy soldier/training indexes,
// 1.1.1 search aliases, old play guide, or independent rules database.
import {loadRuntime} from "../db-runtime.js";
import {initialState,findTransformationPath,STAT_KEYS} from "../soldiers/modern/eligibility.js";
import {importModernSave,modernSoldierProof} from "../soldiers/modern/save-adapter.js";
import {
  validateTrainingSource,futureOptions,classifyTraining,
  replayTrainingPlan,appendTrainingStep
} from "./training-2.1-core.js";

const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,ch=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
})[ch]);
const fmt=x=>Number(x||0).toLocaleString("ko-KR",{maximumFractionDigits:1});
const arr=x=>Array.isArray(x)?x:[];
let DATA=null, selectedId="", steps=[], save=null, proof=null, cache=null;
const DEFAULT_ORIGIN="direct:STR_SOLDIER_PEASANT";
const stateNames={healthy:"건강",wounded:"부상",dead:"사망",unknown:"불명"};
const kindNames={ready:"현재 조건 충족",conditional:"미래 조건부",
  "not-now":"현재 선행 필요",excluded:"확정 제외"};

function originName(profile){
  return profile.soldierKoName+" · "+(profile.sourceKoName||profile.sourceId);
}
function getProfile(){
  return DATA?.profiles.find(x=>x.id===$("#origin").value);
}
function startingState(){
  if(save)return proof?.kind==="proof"?proof.state:null;
  const profile=getProfile();
  return profile?initialState(DATA,profile,{band:"avg",status:$("#condition").value}):null;
}
function startingOptions(){
  if(save&&proof?.kind==="proof")return proof.options;
  return futureOptions();
}
function readContext(){
  const key=($("#origin").value||"")+"|"+$("#condition").value+"|"+
    steps.join("/")+"|"+(save?.research?.completed?.length??"x")+"|"+
    (proof?.soldier?.name||"")+"|"+(proof?.state?.soldierType||"")+
    "|"+(proof?.base?.name||"");
  if(cache?.key===key)return cache;
  const base=startingState(),options=startingOptions();
  const plan=base?replayTrainingPlan(DATA,base,steps,options):{
    kind:"invalid",state:null,receipts:[],reason:"확인된 대원이 없습니다."
  };
  const state=plan.state;
  const nowOptions=steps.length?futureOptions(options):options;
  const rows=DATA.transformations.map(rule=>({
    rule,verdict:classifyTraining(rule,state,DATA,nowOptions)
  }));
  cache={key,base,options,plan,rows,nowOptions};
  return cache;
}
function invalidate(){cache=null;}
function nonzero(stats){
  return Object.entries(stats||{}).filter(([,v])=>typeof v==="number"&&v!==0)
    .map(([key,v])=>(DATA.statLabels?.[key]||key)+" "+(v>0?"+":"")+fmt(v));
}
function textEffect(rule){
  const flat=nonzero(rule.flatOverallStatChange);
  const trait=nonzero(rule.traitStats);
  const percent=nonzero(rule.percentOverallStatChange);
  return (flat.slice(0,2).join(" · ")|| (rule.producedSoldierType?"병종 변경":
    rule.createsClone?"별도 대원 복제":"고정 변화 없음"))+
    (trait.length?" · 특성 "+trait.slice(0,2).join(" / "):"")+
    (percent.length?" · 비율 변화":"");
}
function criterionRows(obj,amount=""){
  const vals=Object.entries(obj||{}).filter(([,n])=>Number(n)!==0||amount==="always");
  return vals.length?vals.map(([id,n])=>
    "<code>"+esc(id)+"</code>"+(amount==="always"?"":": "+fmt(n))).join("<span class='sep'> · </span>"):"없음";
}
function ids(list){return arr(list).length?arr(list).map(id=>"<code>"+esc(id)+"</code>").join(" · "):"없음";}
function spanText(s){return esc(s).replace(/\n/g," ")}
function profileHtml(){
  if(save&&proof?.kind==="proof")
    return "<strong>"+esc(proof.soldier.name)+"</strong> · "+
      esc(proof.state.soldierType)+" · "+esc(stateNames[proof.state.status]||"미확인");
  if(save)return "<strong>세이브 대원 판독 불완전</strong>";
  const p=getProfile();
  if(!p)return "출생처 미확인";
  return "<strong>"+esc(originName(p))+"</strong> · 최초 계급 "+fmt(p.rank)+
    " · 출생 변신 이력 "+Object.keys(p.previousTransformations||{}).length+"종";
}
function resultRows(){
  const term=$("#search").value.trim().toLocaleLowerCase("ko");
  const filter=$("#statusFilter").value;
  const rows=readContext().rows.filter(({rule,verdict})=>{
    const haystack=[rule.id,rule.koName,rule.enName,rule.soldierBonusType,
      ...arr(rule.requires),...arr(rule.requiredPreviousTransformations),
      ...arr(rule.forbiddenPreviousTransformations),
      ...Object.keys(rule.requiredItems||{})].join(" ").toLocaleLowerCase("ko");
    return (!term||haystack.includes(term))&&
      (filter==="all"||filter==="conditional"?
        filter==="all"||["conditional","ready"].includes(verdict.kind):
        verdict.kind===filter);
  });
  rows.sort((a,b)=>{
    const rank={ready:0,conditional:1,"not-now":2,excluded:3};
    return rank[a.verdict.kind]-rank[b.verdict.kind]||
      a.rule.koName.localeCompare(b.rule.koName,"ko");
  });
  return rows;
}
function renderTable(){
  const ctx=readContext();
  const rows=resultRows(),selected=selectedId;
  const counts=Object.fromEntries(["ready","conditional","not-now","excluded"].map(k=>
    [k,ctx.rows.filter(x=>x.verdict.kind===k).length]));
  $("#summary").innerHTML="<span>"+profileHtml()+"</span>"+
    "<span><strong>83</strong>개 2.1 훈련 규칙 · 현재 필터 <strong>"+
    rows.length+"</strong>개</span>"+
    "<span>계보상 제외 <strong>"+counts.excluded+"</strong>개 · 선행 필요 <strong>"+
    counts["not-now"]+"</strong>개</span>"+
    "<span>"+(save&&proof?.kind==="proof"?
      "세이브 현재 시점 판정 (가상 단계 이후 조건부)":"미래 경로 검토 · 실행 인증 없음")+"</span>";
  $("#rowCount").textContent=rows.length+" / 83";
  $("#trainingTable tbody").innerHTML=rows.map(({rule,verdict})=>
    '<tr tabindex="0" data-id="'+esc(rule.id)+'"'+
    (rule.id===selected?' class="selected" aria-selected="true"':"")+ '>'+
    '<td><span class="name">'+esc(rule.koName)+'</span><small class="id">'+
    esc(rule.id)+'</small></td>'+
    '<td><span class="result result-'+esc(verdict.kind)+'">'+
    esc(verdict.label)+'</span></td>'+
    '<td class="effect">'+esc(textEffect(rule))+'</td>'+
    '<td class="amount">'+fmt(rule.cost)+' / '+fmt(rule.recoveryTime)+'일'+
    (rule.transferTime?' <small class="id">전환 '+fmt(rule.transferTime)+'시간</small>':"")+'</td></tr>'
  ).join("")||'<tr><td colspan="4">검색 조건에 맞는 훈련이 없습니다.</td></tr>';
}
function renderPlan(){
  const ctx=readContext(),receipts=ctx.plan.receipts||[];
  $("#planSummary").innerHTML=ctx.plan.kind==="invalid"?
    "<strong>계획 검사 실패</strong> · "+esc(ctx.plan.reason):
    "출발 병종 "+esc(ctx.base?.soldierType||"미확인")+
    " → 가상 현재 병종 <strong>"+esc(ctx.plan.state?.soldierType||"미확인")+
    "</strong> · <strong>"+steps.length+"</strong>단계"+(steps.length?
      " · 실제 완료 인증 없음":"");
  $("#timeline").innerHTML=receipts.map((receipt,i)=>{
    const t=DATA.transformations.find(x=>x.id===receipt.id);
    return '<li><strong>'+esc(t?.koName||receipt.id)+'</strong>'+
      '<small>'+esc(receipt.beforeType)+" → "+esc(receipt.afterType)+
      (receipt.reset?" · 이전 이력 초기화":"")+
      (receipt.retired?" · 원 대원 퇴역":"")+
      " · "+(receipt.kind==="ready"?"시작 시점 현재 조건 확인":"조건부")+
      '</small></li>';
  }).join("")||'<li class="muted">아직 추가한 훈련이 없습니다.</li>';
  $("#undo").disabled=!steps.length;
  $("#reset").disabled=!steps.length;
  $("#copyPlan").disabled=!steps.length;
}
function renderDetail(){
  const ctx=readContext();
  const row=ctx.rows.find(x=>x.rule.id===selectedId);
  if(!row){
    $("#detailPanel").innerHTML='<h2>훈련 상세</h2><p class="muted">훈련을 하나 선택하면 연구·재료·훈장·변신 이력과 원본 효과를 확인할 수 있습니다.</p>';
    return;
  }
  const {rule:t,verdict:v}=row;
  const blocked=v.kind==="excluded"||v.kind==="not-now";
  const restrictions=[
    ["적용 병종",ids(t.allowedSoldierTypes)],
    ["필요 연구",ids(t.requires)],
    ["기지 기능",ids(t.requiresBaseFunc)],
    ["재료",criterionRows(t.requiredItems)],
    ["필수 선행 훈련",ids(t.requiredPreviousTransformations)],
    ["금지된 이전 훈련",ids(t.forbiddenPreviousTransformations)],
    ["필수 계급",fmt(t.minRank)],
    ["필수 훈장",criterionRows(t.requiredCommendations,"always")],
    ["최소 능력치",criterionRows(t.requiredMinStats)],
    ["최대 능력치",criterionRows(t.requiredMaxStats)],
    ["직접 능력치 변화",criterionRows(t.flatOverallStatChange)],
    ["영구 특성 증가",criterionRows(t.traitStats)],
    ["병종 변환",t.producedSoldierType?"<code>"+esc(t.producedSoldierType)+"</code>":"없음"],
    ["소요 비용·회복",fmt(t.cost)+" · 회복 "+fmt(t.recoveryTime)+"일"+
      (t.transferTime?" · 전환 "+fmt(t.transferTime)+"시간":"")],
    ["개체 이력 규칙",(t.reset?"<strong>reset: true · 과거 이력 초기화</strong>":"초기화 없음")+
      (t.createsClone?" · <strong>새 클론 생성</strong>":"")+
      (t.producedItem?" · <strong>원 대원 퇴역</strong>":"")]
  ];
  const supported=["건강","부상","사망"].filter((_,i)=>
    [t.allowsLiveSoldiers,t.allowsWoundedSoldiers,t.allowsDeadSoldiers][i]);
  const reasons=(v.reasons||[]).slice(0,11);
  const struct=v.structural;
  $("#detailPanel").innerHTML=
    '<h2>'+esc(t.koName)+'</h2><small class="id">'+esc(t.id)+'</small>'+
    '<p class="detail-intro">적용 상태: '+esc(supported.join(" · ")||"특별 조건")+
    ' · 훈련 원본 파일 '+esc((t.sourceFiles||[]).join(", "))+'</p>'+
    '<div class="detail-status" data-status="'+esc(v.kind)+'">'+
    '<strong class="result result-'+esc(v.kind)+'">'+esc(v.label)+'</strong>'+
    '<p>'+(reasons.length?reasons.map(esc).join(" · "):
      "현재 직접 조건 외에 연구·RNG·가용 자원 확인이 남아 있습니다.")+'</p></div>'+
    '<div class="actions"><button id="addTraining" class="primary" type="button"'+
    (blocked||t.createsClone||steps.length>=16?' disabled':'')+
    '>조합에 추가 (가정)</button>'+
    '<button id="previewPath" type="button"'+
    (v.kind==="excluded"?' disabled':'')+
    '>선행 경로 보기</button></div>'+
    '<div id="detailActionStatus" class="inline-note" role="status"></div>'+
    '<dl>'+restrictions.map(([label,value])=>
      '<dt>'+esc(label)+'</dt><dd>'+value+'</dd>').join("")+'</dl>'+
    '<details><summary>실행 판정·연구 순서와 원본 예외</summary>'+
    '<p>'+esc((struct?.reason||"현재 출생처를 기준으로 검사")+
      " · "+(v.direct?.research?.conditions||[]).slice(0,6).join(" · "))+'</p>'+
    '<p>원본 정적 변화량에 비례 변화·무작위 재굴림·상한 효과가 함께 있을 수 있습니다. '+
    '미래 연구나 장기 성장, 해당 이벤트의 발생을 보장하지 않습니다.</p>'+
    '<p><code>'+esc(JSON.stringify({
      percentOverallStatChange:t.percentOverallStatChange,
      percentGainedStatChange:t.percentGainedStatChange,
      rerollStats:t.rerollStats,upperBoundAtStatCaps:t.upperBoundAtStatCaps,
      upperBoundAtMaxStats:t.upperBoundAtMaxStats,
      includeBonusesForMinStats:t.includeBonusesForMinStats,
      removeTransformations:t.removeTransformations
    }))+'</code></p></details>';
}
function renderAll(){
  if(!DATA)return;
  try{
    renderTable();
    renderPlan();
    renderDetail();
    $("#loadStatus").dataset.state="validated";
    $("#loadStatus").textContent="2.1 원본 검증 완료 · 83개 훈련 · 72개 실제 출생처 · 다른 규칙 버전과 혼합하지 않음";
  }catch(error){
    $("#loadStatus").dataset.state="rejected";
    $("#loadStatus").textContent="훈련 검증 실패: "+error.message+" · 구버전 자료 대체 금지";
    $("#trainingTable tbody").innerHTML="";
    $("#detailPanel").textContent="원본 검증에 실패해 수치를 표시하지 않습니다.";
    $("#summary").textContent="";
    console.error("Training validation",error);
  }
}
function openTraining(id){
  if(!DATA.transformations.some(t=>t.id===id))return;
  selectedId=id;
  if(!resultRows().some(r=>r.rule.id===id)){
    $("#search").value="";
    $("#statusFilter").value="all";
  }
  const uri=new URL(location.href);
  uri.searchParams.set("training",id);
  history.replaceState(null,"",uri.pathname+uri.search+uri.hash);
  renderAll();
}
function chosenProof(){
  if(!save)return null;
  const base=Number($("#trainingSaveBase").value),soldier=Number($("#trainingSaveSoldier").value);
  return Number.isInteger(base)&&Number.isInteger(soldier)?
    modernSoldierProof(DATA,save,base,soldier):null;
}
function updateSaveSelection(){
  proof=chosenProof();
  steps=[];
  invalidate();
  if(proof?.kind==="proof"){
    $("#trainingSaveSummary").textContent="2.1 저장본 · "+proof.soldier.name+
      " · 완료 연구 "+save.research.completed.length+"개"+
      " · 폐쇄 연구 "+save.research.disabled.length+"개"+
      " · 변신 이력 "+proof.state.history.size+"종"+
      (proof.issues.length?" · 미확인 "+proof.issues.length+"건":"");
  }else $("#trainingSaveSummary").textContent=
    "현재 대원 증거 미확인: "+(proof?.issues?.join(" · ")||"주둔 대원이 없습니다.");
  renderAll();
}
function chooseSaveBase(){
  const base=save?.personnel?.bases?.[Number($("#trainingSaveBase").value)];
  $("#trainingSaveSoldier").innerHTML=(base?.soldiers||[]).map((s,i)=>
    '<option value="'+i+'">'+esc(s.name+" / "+(s.type||"병종 미확인"))+'</option>').join("");
  if(!$("#trainingSaveSoldier").options.length)
    $("#trainingSaveSoldier").innerHTML='<option value="">주둔 대원 없음</option>';
  updateSaveSelection();
}
function clearSave(){
  save=null;proof=null;steps=[];
  $("#trainingSaveFile").value="";
  $("#trainingSaveRoster").hidden=true;
  $("#clearTrainingSave").disabled=true;
  $("#origin").disabled=false;$("#condition").disabled=false;
  $("#trainingSaveSummary").textContent="세이브 미적용 · 미래 조건만 검토합니다.";
  invalidate();renderAll();
}
function bindUI(){
  $("#search").addEventListener("input",renderAll);
  $("#statusFilter").addEventListener("change",renderAll);
  $("#origin").addEventListener("change",()=>{steps=[];invalidate();renderAll()});
  $("#condition").addEventListener("change",()=>{steps=[];invalidate();renderAll()});
  $("#trainingTable tbody").addEventListener("click",e=>{
    const row=e.target.closest("tr[data-id]");
    if(row)openTraining(row.dataset.id);
  });
  $("#trainingTable tbody").addEventListener("keydown",e=>{
    if(e.key==="Enter"||e.key===" "){
      const row=e.target.closest("tr[data-id]");
      if(row){e.preventDefault();openTraining(row.dataset.id)}
    }
  });
  $("#detailPanel").addEventListener("click",e=>{
    if(e.target.id==="addTraining"){
      const ctx=readContext();
      const outcome=appendTrainingStep(DATA,ctx.base,steps,selectedId,ctx.options);
      if(outcome.kind!=="added"){
        $("#detailActionStatus").textContent="추가 불가: "+outcome.reason;return;
      }
      steps=outcome.steps;
      invalidate();renderAll();
      $("#planNotice").textContent="가상 경로에 추가했습니다. 실제 연구·재료·성장·훈장은 보장되지 않습니다.";
    }
    if(e.target.id==="previewPath"){
      const ctx=readContext();
      const witness=findTransformationPath(selectedId,ctx.plan.state,DATA,
        {...futureOptions(ctx.options),maxNodes:900,maxDepth:8});
      const names=arr(witness.path).map(id=>DATA.transformations.find(t=>t.id===id)?.koName||id);
      $("#detailActionStatus").textContent=witness.kind==="blocked"?
        "계보상 제외: "+witness.reason:names.length?
        "구조적 선행 후보: "+names.join(" → ")+" · 연구·재료·계급·RNG 미증명":
        "확인된 완결 선행 경로 없음 · 탐색 한계가 영구 불가능을 증명하지 않습니다.";
    }
  });
  $("#undo").onclick=()=>{steps.pop();invalidate();renderAll()};
  $("#reset").onclick=()=>{steps=[];invalidate();renderAll()};
  $("#copyPlan").onclick=async()=>{
    const text="X-Piratez 2.1 · 조건부 훈련 계획\n"+
      (save?("세이브 대원: "+(proof?.soldier?.name||"미확인")):
        ("출생처: "+originName(getProfile())))+"\n"+
      steps.map((id,i)=>(i+1)+". "+(DATA.transformations.find(t=>t.id===id)?.koName||id)+" ("+id+")").join("\n")+
      "\n실제 연구·훈장·재료·성장 및 실행 완료 증명 아님";
    try{await navigator.clipboard.writeText(text);
      $("#planNotice").textContent="조건부 계획을 복사했습니다."}
    catch{ $("#planNotice").textContent="복사가 허용되지 않았습니다. 브라우저 권한을 확인하세요."}
  };
  $("#trainingSaveFile").addEventListener("change",async()=>{
    const file=$("#trainingSaveFile").files?.[0];
    if(!file)return;
    try{
      if(file.size>60*1024*1024)throw Error("60MB 초과 파일은 분석하지 않습니다.");
      const candidate=importModernSave(await file.text(),DATA);
      save=candidate;
      $("#clearTrainingSave").disabled=false;
      $("#origin").disabled=true;$("#condition").disabled=true;
      $("#trainingSaveRoster").hidden=false;
      $("#trainingSaveBase").innerHTML=save.personnel.bases.map((b,i)=>
        '<option value="'+i+'">'+esc(b.name+" / "+b.soldiers.length+"명")+'</option>').join("");
      chooseSaveBase();
    }catch(error){
      clearSave();
      $("#trainingSaveSummary").textContent="세이브 판독 실패: "+error.message+
        " · 다른 버전의 연구나 이력을 사용하지 않습니다.";
    }
  });
  $("#trainingSaveBase").addEventListener("change",chooseSaveBase);
  $("#trainingSaveSoldier").addEventListener("change",updateSaveSelection);
  $("#clearTrainingSave").onclick=clearSave;
  window.addEventListener("popstate",()=>{
    const id=new URL(location.href).searchParams.get("training");
    if(id&&DATA?.transformations.some(t=>t.id===id))openTraining(id);
  });
}
async function init(){
  try{
    const data=await loadRuntime("../data/soldiers-modern-index.json?v=trainings-2.1-20261102");
    const proofSource=validateTrainingSource(data);
    DATA=data;
    const profiles=[...DATA.profiles].sort((a,b)=>
      a.soldierKoName.localeCompare(b.soldierKoName,"ko")||
      a.sourceKoName.localeCompare(b.sourceKoName,"ko"));
    $("#origin").innerHTML=profiles.map(p=>
      '<option value="'+esc(p.id)+'">'+esc(originName(p))+'</option>').join("");
    const q=new URLSearchParams(location.search);
    const requestedOrigin=q.get("origin");
    $("#origin").value=profiles.some(p=>p.id===requestedOrigin)?requestedOrigin:
      profiles.some(p=>p.id===DEFAULT_ORIGIN)?DEFAULT_ORIGIN:profiles[0]?.id;
    if(!$("#origin").value)throw Error("2.1 출생처 목록에 표시할 대원이 없습니다.");
    const requested=q.get("training")||decodeURIComponent(
      location.hash.startsWith("#training=")?location.hash.slice(10):"");
    selectedId=DATA.transformations.some(t=>t.id===requested)?requested:
      "STR_BASIC_FIREARMS_TRAINING";
    if(!DATA.transformations.some(t=>t.id===selectedId))selectedId=DATA.transformations[0]?.id||"";
    bindUI();renderAll();
    $("#loadStatus").textContent="2.1 "+proofSource.hash.slice(0,9)+
      "… · 출생 72개 / 변신·훈련 83개 · 출처별 엄격 검증";
  }catch(error){
    $("#loadStatus").dataset.state="rejected";
    $("#loadStatus").textContent="훈련 DB 표시 중단: "+error.message;
    $("#trainingTable tbody").innerHTML="";
    $("#detailPanel").textContent="2.1 원본이 검증되지 않아 다른 버전의 데이터로 대체하지 않습니다.";
    console.error(error);
  }
}
init();
