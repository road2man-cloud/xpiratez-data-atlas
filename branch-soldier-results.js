// One shared result reader for the existing Soldier and Branch DB pages.
// Same final-body maxima projection for both pages; evidence belongs to the cell.
import {buildBranchRouteIndex,parseTargets,matchesTargets,modelProfiles,profileWitnessIds} from "./branch-soldier-query.js?v=20261124-exact-resources-1";
import {independentMaxima,registryCandidate,evidenceLabel} from "./branch-soldier-maxima.js";
import {loadBranchSoldierResults,routeActionCount,registeredRouteDepths,buildBodyGrowthIndex} from "./branch-soldier-catalog.js?v=20261125-pop-chain-1";
import {loadRuntime} from "./db-runtime.js";
import {branchOriginBaselineMarkup} from "./branch-soldier-origin-baseline.js?v=20261124-population-1";
import {populationCoverageText,populationBranchMarkup,populationBoundMarkup} from "./branch-soldier-population.js?v=20261125-pop-chain-1";
import {allOriginCoverageText} from "./branch-soldier-origin-cap.js?v=20261124-all-origin-4324-fix1";
import {buildCareerMedalPlan} from "./branch-soldier-career.js?v=20261124-career-medal-plan-1";
import {evaluateCareerMilestones} from "./branch-soldier-career-progress.js?v=20261124-career-progress-1";
import {summarizeRouteResources,parseResourceLimit,hasResourceFilters,matchesResources,resourceSortValue} from "./branch-soldier-resources.js?v=20261124-resource-1";
import {registeredResourcePareto} from "./branch-soldier-pareto.js?v=20261124-resource-goals-1";
import {projectResourceGoal} from "./branch-soldier-resource-goals.js?v=20261124-resource-goals-1";
import {exactResourceSpec,loadExactResourceIndex,queryExactResources,exactResourceWitness} from "./branch-soldier-exact-resources.js?v=20261124-packed-1";
import {pairSearchMarkup} from "./branch-soldier-pair-search.js?v=20261125-origin-pair-search-317";
import {pairContinuationMarkup} from "./branch-soldier-pair-continuation.js?v=20261125-origin-joint-suffix-1520";
const ROOT=document.querySelector("[data-branch-soldier-results]");
if(ROOT){
 // One shared cached loader also serves the origin rows.
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const ko={tu:"행동력",stamina:"지구력",health:"체력",bravery:"용기",reactions:"반응",firing:"사격",throwing:"투척",strength:"근력",psiStrength:"부두 강도",psiSkill:"부두 기술",melee:"근접",mana:"마나"};
 const fmt=x=>x==null?"—":typeof x==="number"?x.toLocaleString("ko-KR"):esc(x);
 const E=id=>ROOT.querySelector("#"+id);
 const options=(list,sel)=>list.map(([v,label])=>'<option value="'+esc(v)+'"'+(v===sel?" selected":"")+'>'+esc(label)+'</option>').join("");
 let db,modern,selected=null;
 const label=id=>id?(db.labels[id]||id):"미선택";
 const branchName=b=>"#"+b.rank+" · "+b.captain.map(label).join(" → ")+" / "+[b.choices.path,b.choices.cause,b.choices.codex,b.choices.queen].map(label).join(" / ");
 const searchText=b=>[b.id,b.rank,b.legacyKey,...b.captain,...Object.values(b.choices),branchName(b)].join(" ").toLowerCase();
 const status=b=>b.sourceRootConflict?"원천 조건 충돌":b.historyCount?"조건부 연구 이력 있음":"연구 이력 미확정";
 const list=ids=>(ids||[]).map(x=>'<span title="'+esc(x)+'">'+esc(label(x))+'</span>').join(" · ")||"없음";
 const link=(type,b,body=null,mode=null,route=null)=>{const u=new URL(type==="soldier"?"./soldiers/modern/":"./captains/",import.meta.url);if(b)u.searchParams.set("branch",b.id);if(type==="soldier"){if(body)u.searchParams.set("body",body);if(mode)u.searchParams.set("mode",mode);if(route)u.searchParams.set("route",route);}u.hash=type==="soldier"?(body||route?"integratedCaps":"originMaxima"):"integratedBranches";return u.href;};
 const query=new URL(location.href).searchParams,selectedUrl=query.get("branch"),selectedBody=query.get("body");
 const sources=()=>'<details class="bs-note"><summary>계산 근거 및 작업자별 원장 출처</summary><p>병종·분기 DB가 동일한 원장을 읽습니다. '+fmt(db.catalog.filter(x=>x.integrated).length)+'개 결과의 구조화 데이터와 '+fmt(db.summary.inventoryReports)+'개 발견된 연구 파일 목록을 관리합니다. 미연결 파일은 현재 수치에 합산하지 않습니다. 원본 실험 파일은 보존합니다.</p><ul>'+Object.entries(db.sources).map(([id,x])=>'<li><code>'+esc(id)+'</code> · '+esc(x.file)+'</li>').join("")+'</ul><p>'+Object.values(db.policies).map(esc).join("<br>")+'</p></details>';
 const overview=()=>'<p class="bs-summary">현재 정적 분기 후보 <b>'+fmt(db.summary.staticCandidates)+'</b>개 · 선장 말단 후보 '+fmt(db.summary.knownCaptainLeaves)+'개 · 대의 미선택 '+fmt(db.summary.neutralCauseCandidates)+'개 · 조건부 연구 이력 보유 '+fmt(db.summary.historiesAcceptedParents)+'개 · 원천 충돌 '+fmt(db.summary.sourceConflictCandidates)+'개 · 통합 조건부 육성 경로 <b>'+fmt(db.summary.unifiedConditionalTrainingPaths)+'</b>개 · 별도 계급·훈장 조건부 경로 <b>'+fmt(db.summary.careerConditional?.conditionalPaths??0)+'</b>개 · 계급·훈장 전제 후속 재생 '+fmt(db.summary.careerConditional?.suffixReplayed??db.summary.careerConditional?.suffixReplayedUnderAssumedRank??0)+'개'+(db.summary.careerConditional?.pairedReplayParents!=null?' · 양쪽 출생 병종 재생 부모 '+fmt(db.summary.careerConditional.pairedReplayParents)+'개 · 후속 재생 미해결 '+fmt(db.summary.careerConditional.suffixReplayUnresolved??0)+'개':'')+' · 등록 경로 대표 '+fmt(Object.keys(db.witnesses).length)+'개 · 실제 게임 전체 최적 인증 0건.</p>'+(db.originCap12?'<p class="bs-summary" data-all-origin-cap-coverage="true">'+esc(allOriginCoverageText(db))+'</p>':"")+(db.populationSearch?'<p class="bs-summary" data-population-coverage="true">'+esc(populationCoverageText(db))+'</p>'+populationBoundMarkup(db):"");
 const branchPaths=(b,cls)=>db.profiles[b?.evidence?.[cls]?.unified]?.conditionalPaths??null;
 const bodyEvidence=(b,c,mode="CAP_TARGET")=>{
  const e=b?b.evidence[c.classKey]:db.globalEvidence[c.classKey];
  return {unified:db.profiles[e?.unifiedByBody?.[c.body]],continuation:db.profiles[e?.continuationByBody?.[c.body]?.[mode]],career:db.profiles[e?.careerConditionalByBody?.[c.body]]};
 };
 const bodyLinks=b=>db.combos.map(c=>{
  const {unified:u,continuation:v,career:k}=bodyEvidence(b,c);
  if(!u&&!v&&!k)return "";
  return '<p><a href="'+esc(link("soldier",b,c.id))+'">'+esc(c.title)+'</a> · '+(u?'조건부 재생 경로 '+fmt(u.conditionalPaths)+'개':"행동 재생 미연결")+(v?' · 구조적 파레토 '+fmt(v.count)+'개':"")+(k?' · 계급·훈장 조건부 '+fmt(k.conditionalPaths)+'개 (후속 미재생)':"")+'</p>';
 }).filter(Boolean).join("")||"<p>연결된 병종 상계 없음 (미계산)</p>";
 function rootConflictDetail(b){
  const r=b.rootConflict,ev=db.rootConflictEvidence;
  if(!r||!ev||!b.sourceRootConflict||!r.opposingChoice)return "";
  const chain=ev.chains.find(a=>a[0]===b.choices.cause)||[];
  const pair=ev.exclusions.find(p=>p.selectedNonPeasantPathId===r.opposingChoice);
  if(!chain.length||!pair)return "";
  const g=ev.greatCause;
  const edges=ev.dependencyEdges.filter(x=>chain.some((id,i)=>id===x.from&&chain[i+1]===x.to));
  const triggerList=o=>Object.entries(o||{}).map(([id,v])=>label(id)+" "+(v?"완료/보유 필요":"미완료/미보유 필요")).join(" · ");
  return '<div class="bs-conflict"><h4>간접 상호배제 원인</h4><p><strong>'+esc(label(b.choices.path))+' ↔ '+esc(label(r.forcedPrerequisite))+'</strong> : 원본 연구의 양방향 disables가 확인되었습니다. 선택한 대의의 확인된 획득 경로에 농부 혁명이 필요합니다.</p><p><b>필수 선행 사슬:</b> '+chain.slice().reverse().map(id=>'<span title="'+esc(id)+'">'+esc(label(id))+'</span>').join(" → ")+'</p><details class="bs-note"><summary>원본 규칙과 위대한 대의 이벤트 조건</summary><p>원본 일치 룰셋 파일 '+fmt(ev.hashMatches)+'개. 대의 획득 이벤트 <code>'+esc(g.name)+'</code> · '+esc(triggerList(g.originalScriptResearchTriggers))+' · 시설 '+esc(triggerList(g.originalScriptFacilityTriggers))+' · 자금 최소 '+fmt(g.originalRequiredMinimumFunds)+' · 점수 최소 '+fmt(g.originalRequiredMinimumScore)+' · 자금 변화 '+fmt(g.originalOneTimeEventFundsDelta)+'</p><ul>'+edges.map(x=>'<li>'+esc(label(x.from))+'에 '+esc(label(x.to))+' 필요 · <code>'+esc(x.file)+':'+fmt(x.line)+'</code></li>').join("")+'<li>위대한 대의 이벤트/스크립트: <code>Piratez_Events.rul:'+fmt(g.eventSourceLine)+' / '+fmt(g.eventScriptSourceLine)+'</code></li></ul><p>현재 확인된 직접 재개방 규칙: 선택 진로 '+fmt(pair.originalDirectReenableResearchRulesForChosen.length)+'건 · 농부 진로 '+fmt(pair.originalDirectReenableResearchRulesForForced.length)+'건. 미발견 간접 지급·재개방이나 엔진 동작이 남아 있으므로 게임 전체 불가능 판정은 아닙니다.</p></details></div>';
 }
 function researchExtensionDetail(id){
  const r=db.researchHistoryDetails?.[id];if(!r)return "";
  const action=a=>{
   if(a.type==="research")return "연구: "+label(a.id);
   if(a.type==="freeResearch")return "무료 연구: "+label(a.research)+" ← "+label(a.source)+(a.assumeOutcome?" (결과 가정)":"");
   if(a.type==="missionResearch")return "임무 연구: "+label(a.research)+" · "+label(a.deployment||a.script)+(a.assumeOutcome?" (결과 가정)":"");
   if(a.type==="eventResearch")return "이벤트 연구: "+label(a.research||a.id)+" · "+label(a.event||a.eventScript||a.script)+(a.assumeOutcome?" (결과 가정)":"");
   if(a.type==="externalInputs")return "외부 공급 가정: "+[...Object.entries(a.items||{}).map(([k,v])=>label(k)+" ×"+v),...(a.functions||[]).map(label),...(a.funds?["자금 "+a.funds]:[])].join(" · ");
   return a.type+" · "+label(a.research||a.id||a.source||a.deployment||a.script);
  };
  return '<details class="bs-note"><summary>'+esc(label(r.goal))+' · '+(r.allRequestedActive?"요청 연구 공존":"일부 연구 미해결")+' · 추가 행동 '+fmt(r.newSteps)+'개</summary><p>필요 연구: '+list(r.requested)+'<br>활성: '+list(r.completed)+'<br>미활성: '+list(r.missing)+'</p>'+(r.targetSequence?.length?'<p>목표 육성 순서: '+esc(r.targetSequence.map(label).join(" → "))+'</p>':"")+'<p>출발 연구 이력: <code>'+esc(r.baseHistoryId)+'</code> · '+(r.baseIndexed?"기존 이력 색인 연결":"재구성 출발점 (독립 색인 없음)")+' · 외부 공급 가정 '+fmt(r.externalSupplyAssumptions)+'회</p><ol start="'+(r.baseStepCount+1)+'">'+r.actions.map(a=>'<li>'+esc(action(a))+'</li>').join("")+'</ol><p class="bs-sub">조건부 연구 행동 재생 자료이며 훈련·실제 게임 달성을 인증하지 않습니다.</p></details>';
 }
 function branchExtensionDetails(b){
  const ids=(b.researchExtensions||[]).filter(id=>db.researchHistoryDetails?.[id]);
  if(!ids.length)return "";
  return '<details class="bs-note"><summary>추가 연구 이력 '+fmt(ids.length)+'개 · 연구·공급 행동 순서</summary>'+ids.map(researchExtensionDetail).join("")+'</details>';
 }
 function branchDescription(b){
  if(!b)return "";
  const ep=db.eventProfiles[b.eventProfile];
  const saint=b.saintBlockedByPussy?"PUSSY 완료 뒤 성자 이벤트 음성 조건과 충돌. 성자 선취득 경유는 별도 확인 필요.":"성자는 발상 4종·선장 일지 01 등 추가 조건 필요. 자동 지급 아님.";
  const detail=ep?'<details class="bs-note"><summary>조건부 선장 이벤트 보상 '+fmt(ep.count)+'개 · 연구 보상 '+fmt(ep.research)+'개 · 아이템 보상 '+fmt(ep.items)+'개</summary><div class="bs-event-list">'+ep.ids.map(id=>{const x=db.eventCatalogue[id];if(!x)return "";const r=x.reward||{};return '<details><summary>'+esc(x.name)+' <small>'+esc(x.id)+'</small> · '+(x.compatible?"조건부 후보":"현재 뿌리 조건 충돌")+'</summary><p>연구 보상: '+(r.research||[]).map(v=>esc(v.name||v.id)).join(" · ")+'</p><p>확정 지급품(이벤트 발생 가정): '+(r.guaranteedItems||[]).map(v=>esc(v.name||v.id)+" ×"+fmt(v.qty)).join(" · ")+'</p><p>현금 '+fmt(r.funds)+' · 점수 '+fmt(r.points)+'</p>'+x.scripts.map(s=>'<p><code>'+esc(s.scriptId)+'</code> · '+esc(s.status)+'<br>필요: '+list(s.requiredResearch)+'<br>미완료 필요: '+list(s.forbiddenResearch)+'</p>').join("")+'</details>';}).join("")+'</div></details>':"<p>이 분기의 이벤트 보상 상세는 아직 연결되지 않았습니다.</p>";
  return '<h3>'+esc(branchName(b))+'</h3><p><b>'+esc(status(b))+'</b> · 조건부 연구 이력 '+fmt(b.historyCount)+'개. '+(b.sourceRootConflict?"현재 원천 모델의 충돌이며 모든 우회 경로를 배제한 불가능 증명이 아닙니다.":"연구 이력은 실제 게임 진행·훈련 인증이 아닙니다.")+'</p><p>'+esc(saint)+'</p><p>원천 충돌 연구: '+list(b.blockedRoots)+' · 조건부 차단 훈련 연구: '+list(b.blockedResearch)+'</p>'+(b.chronology?'<p>연구 순서 조건부 재생: '+(b.chronology.root?"뿌리 연구 통과":"미완결")+' · 주요 병목 '+esc(label(b.chronology.blocker))+'</p>':'<p>1,520개 이전 연구 순서 모델의 직접 대응 없음.</p>')+rootConflictDetail(b)+branchExtensionDetails(b)+branchOriginBaselineMarkup(db,b)+populationBranchMarkup(db,b)+detail;
 }
 function valueCell(pid,i,chosen=null){
  const p=db.profiles[pid],id=chosen||p?.best[i],w=db.witnesses[id],v=w?.vector[i];
  if(v==null)return "<td>—</td>";
  return '<td><button type="button" class="bs-value" data-witness="'+esc(id)+'">'+fmt(v)+'</button>'+(w.raw?.[i]!=null&&w.bonus?.[i]!=null?'<small class="bs-sub">'+fmt(w.raw[i])+' + '+fmt(w.bonus[i])+'</small>':'')+'</td>';
 }
 const branchFacets=[
  ["bsCaptain","선장 말단",b=>b.captain.at(-1)],["bsPath","진로",b=>b.choices.path],
  ["bsCause","대의",b=>b.choices.cause??"__none__"],["bsCodex","코덱스",b=>b.choices.codex],["bsQueen","여왕",b=>b.choices.queen]
 ];
 const facetLabel=id=>id==="__none__"?"미선택":label(id);
 const facetMarkup=()=>'<div class="bs-controls bs-facets">'+branchFacets.map(([id,title,get])=>'<label>'+title+'<select id="'+id+'">'+options([["","전체"],...[...new Set(db.branches.map(get))].filter(x=>x!=null).sort((a,b)=>facetLabel(a).localeCompare(facetLabel(b),"ko")).map(v=>[v,facetLabel(v)])],"")+'</select></label>').join("")+'<button type="button" id="bsResetFacets">조건 초기화</button></div>';
 const matchesFacets=b=>branchFacets.every(([id,,get])=>!E(id)?.value||E(id).value===get(b));
 function bindFacets(change){
  for(const [id] of branchFacets)E(id).addEventListener("change",change);
  E("bsResetFacets").addEventListener("click",()=>{for(const [id] of branchFacets)E(id).value="";E("bsSearch").value="";change();});
 }
 const modelLabels={UNIFIED12:"연구·출생·훈련 연결 상계",GATE12:"시술 시점 조건 검사",REPLAY8:"동일 연구 이력",SOURCE8:"연구 원천 호환",CONTINUATION12:"구조적 후속 확장",CAREER12:"계급·훈장 조건부 고급 시술"};
 const routeName=w=>w.steps.map((x,i)=>(w.growthBefore?.[i]?"[성장] ":"")+label(x.id)+(x.count>1?" ×"+x.count:"")).join(" → ")||"추가 시술 없음";
 function ruleConstraints(t){
  if(!t)return "세부 룰 미연결";
  const a=[];
  if(t.minRank)a.push("계급 "+t.minRank+" 이상");
  if(t.upperMax)a.push("maxStats 증가 제한");
  if(t.upperCap)a.push("statCaps 증가 제한");
  if(t.bonusType)a.push("별도 보너스 "+label(t.bonusType));
  for(const [k,v] of Object.entries(t.min||{}))if(v>0)a.push((ko[k]||k)+" ≥ "+v+(t.bonusMin?" (보너스 포함)":""));
  for(const [k,v] of Object.entries(t.max||{}))if(v!=null)a.push((ko[k]||k)+" ≤ "+v+(t.bonusMax?" (보너스 포함)":""));
  if(t.requires?.length)a.push("연구: "+t.requires.map(label).join(" · "));
  for(const [k,v] of Object.entries(t.requiredItems||{}))a.push(label(k)+" ×"+v);
  for(const [k,v] of Object.entries(t.requiredCommendations||{}))a.push("훈장 "+label(k)+" "+v);
  if(t.requiresBaseFunc?.length)a.push("시설 기능: "+t.requiresBaseFunc.map(label).join(" · "));
  if(t.cost)a.push("비용 "+t.cost.toLocaleString("ko-KR"));
  return a.join(" · ")||"별도 요구값 없음";
 }
 const resourceFields=[["bsMaxFees","maxFees","최대 직접 지출 ($)"],["bsMaxActions","maxActions","최대 훈련 횟수"],["bsMaxRecovery","maxRecovery","최대 회복 합계 (일)"],["bsMaxTransfer","maxTransfer","최대 이동 합계 (시간)"]];
 const materialSlots=[1,2,3];
 const resourceChecks=[["bsNoMedals","noMedals","훈장 요구 없는 경로"],["bsNoItems","noItems","재료 요구 없는 경로"],["bsNoFacilities","noFacilities","별도 시설 기능 요구 없는 경로"]];
 function resourceMarkup(){
  const itemIds=[...new Set(Object.values(db.ruleDetails||{}).flatMap(r=>Object.keys(r.requiredItems||{})))].sort((a,b)=>label(a).localeCompare(label(b),"ko"));
  return '<h4>훈련 자원 제한</h4><div class="bs-target-grid">'+resourceFields.map(([id,,title])=>'<label>'+esc(title)+'<input id="'+id+'" data-resource-limit type="number" min="0" step="1" inputmode="numeric" placeholder="제한 없음"></label>').join("")+'</div><div class="bs-controls">'+materialSlots.map(i=>'<label>제한 재료 '+i+'<select id="bsItem'+i+'">'+options([["","선택 안 함"],...itemIds.map(id=>[id,label(id)+" ("+id+")"])],"")+'</select></label><label>재료 '+i+' 최대 요구량<input id="bsItemLimit'+i+'" data-resource-limit type="number" min="0" step="1" placeholder="제한 없음"></label>').join("")+resourceChecks.map(([id,,title])=>'<label class="bs-inline-check"><input type="checkbox" id="'+id+'">'+esc(title)+'</label>').join("")+'</div><p class="bs-sub" id="bsStatFeeCoverage"></p><label class="bs-inline-check"><input type="checkbox" id="bsStatFeeOnly">완료된 5단계 본체 상태 그래프의 12능력치·비용 전선만 비교</label><p class="bs-sub">직접 시술비만 합산하며 음수 비용은 지급액으로 분리합니다. 재료는 각 단계 요구량 합계로, 회복·이동은 별도 합계로 비교합니다. 출생·연구·전투 성장·재료 조달·계급 획득 비용과 시간은 포함하지 않습니다.</p>';
 }
 function paretoMarkup(){
  return '<h4>능력치·자원 비지배 비교 (선택)</h4><div class="bs-controls"><label>비교할 능력치<select id="bsParetoAxes">'+options([["all","모든 계산된 능력치"],["targets","입력한 목표 능력치만"],...db.stats.map(k=>[k,ko[k]||k])],"all")+'</select></label><label>비지배 필터<select id="bsParetoMode">'+options([["off","전체 등록 후보 유지"],["fees","능력치 + 직접 지출"],["requirements","능력치 + 지출·횟수·기간·재료·훈장·시설·연구 요구"]],"off")+'</select></label></div><p class="bs-sub">같은 계산 모델·출생처·최종 병종에서 비교합니다. 비교하는 능력치와 선택한 자원이 모두 같거나 우수하고 최소 하나가 더 좋으며, 상대의 모든 참조 분기를 보존할 때만 열등 후보로 판정합니다. 동점과 미판정은 남깁니다. 전체 요구 비교에서는 계급·병종 변경 이력이 다른 경로도 별도로 유지합니다. 연구·계급·성장 실현 가능성이나 전체 게임 최적성은 인증하지 않습니다.</p><p id="bsParetoStatus" class="bs-sub" aria-live="polite"></p><div id="bsParetoExamples"></div>';
 }
 function resourceGoalMarkup(){
  const spec=db.summary.resourceGoalCheckpoints;if(!spec)return "";
  const goalLabel=g=>Object.entries(g.stats).map(([k,v])=>(ko[k]||k)+" "+v+" 이상").join(" · ");
  return '<details class="bs-note"><summary>5단계 전체 상태 재계산: 자원 조건과 동시 능력치 목표</summary><p class="bs-sub">각 조건을 전체 완료 상태 그래프에 먼저 적용한 결과입니다. 반복 시술별 요구량을 구분하여 '+fmt(spec.witnessesAdded)+'개 대표 경로를 새로 연결했습니다. 본체·전투캡 성장 모델에만 적용됩니다.</p><div class="bs-controls"><label>자원 조건<select id="bsGoalPreset">'+options(spec.presets.map(p=>[p.id,p.title]),"ALL")+'</select></label><label>동시 목표<select id="bsGoalTarget">'+options(spec.goals.map(g=>[g.id,goalLabel(g)]),spec.goals[0].id)+'</select></label><button id="bsGoalApply" type="button">이 조건을 검색기에 적용</button></div><div id="bsGoalResult" aria-live="polite"></div></details>';
 }
 function exactResourceMarkup(){
  if(!db.summary.exactResourceIndex)return "";
  return '<div class="bs-note"><h4>입력 조건으로 완료 상태 전체 검색</h4><p class="bs-sub">위 능력치·비용·기간·재료 입력값, 최소 시술 횟수, 현재 연구 분기를 사용합니다. 영애·미치광이 본체의 병종별 선택한 완료 깊이 전투캡 모델에서 전체 상태·훈련 구성을 검색합니다. 아래 필수·제외 훈련 조건을 적용합니다. 일반 경로 검색어, 다른 근거 모델 및 기존 대표 전선 필터는 적용하지 않습니다. 지정한 재료는 각각 독립적인 최소화 축입니다.</p><label>전체 상태 검색 깊이<select id="bsExactDepth"></select></label><div class="bs-controls">'+[ ["bsExactRequired","반드시 포함할 훈련"],["bsExactExcluded","제외할 훈련"] ].map(([id,title])=>'<label>'+title+'<select id="'+id+'">'+options([["","제한 없음"],...Object.keys(db.ruleDetails).sort((a,b)=>label(a).localeCompare(label(b),"ko")).map(id=>[id,label(id)+" ("+id+")"])],"")+'</select></label>').join("")+'</div><button type="button" id="bsExactSearch">전체 완료 상태 재탐색</button><p id="bsExactStatus" class="bs-sub" aria-live="polite"></p><div id="bsExactResult"></div></div>';
 }
 function targetsMarkup(){
  return '<details class="bs-note bs-targets" id="bsTargetPanel"><summary>동시 목표 능력치 · 같은 대원에서 만족하는 경로 찾기</summary><p class="bs-sub">실효 능력치 최소값을 입력하세요. 비어 있는 능력치는 제한하지 않습니다. 미계산 값은 목표 달성으로 인정하지 않습니다.</p><div class="bs-target-grid">'+db.stats.map((k,i)=>'<label>'+esc(ko[k]||k)+'<input id="bsTarget'+i+'" data-target-index="'+i+'" type="number" min="0" step="1" inputmode="numeric" placeholder="제한 없음"></label>').join("")+'</div>'+resourceMarkup()+paretoMarkup()+'<div class="bs-controls"><label>경로 근거 범위<select id="bsEvidence">'+options([["all","모든 모델 (서로 분리)"],...Object.entries(modelLabels).map(([id,title])=>[id,title])],"all")+'</select></label><label class="bs-inline-check"><input type="checkbox" id="bsExcludeConflict">원천 충돌 분기 제외</label><button type="button" id="bsApplyTargets">목표 적용</button><button type="button" id="bsClearTargets">목표 초기화</button></div><p id="bsTargetStatus" aria-live="polite" class="bs-sub"></p>'+exactResourceMarkup()+'<details class="bs-note"><summary>예산별 5단계 본체 상한 재탐색</summary><label>비교 능력치<select id="bsBudgetStat">'+options(db.stats.map(k=>[k,ko[k]||k]),"health")+'</select></label><div id="bsBudgetCheckpoints"></div></details>'+resourceGoalMarkup()+'</details>';
 }
 function mountSoldier(){
  const depths=registeredRouteDepths(db),depthValues=new Set(depths.map(String));
  ROOT.innerHTML='<h2>선택 병종의 육성 경로·조건 상세</h2>'+overview()+pairSearchMarkup(db)+pairContinuationMarkup(db)+'<p>하나의 육성 경로를 선택하면 12개 능력치가 같은 경로의 벡터로 표시됩니다. 독립 최고값은 공통 원장에 등록된 각각의 경로에서 가져오며 한 대원으로 합성하지 않습니다.</p><div class="bs-controls"><label>연구 분기 검색<input id="bsSearch" type="search" placeholder="선장 · 진로 · 코덱스 · 번호"></label><label>연구 분기<select id="bsBranch"></select></label><label>출발 → 최종 병종<select id="bsBody">'+options(db.combos.map(c=>[c.id,c.title]),"D_W")+'</select></label><label>전투 성장<select id="bsMode">'+options([["CAP_TARGET","전투캡까지"],["EXP_OVERSHOOT_UPPER","마지막 성장 초과 상단"]],"CAP_TARGET")+'</select></label></div>'+facetMarkup()+targetsMarkup()+'<div class="bs-controls"><label>훈련 순서 검색<input id="bsRouteSearch" type="search" placeholder="훈련명 · ID · 연구명"></label><label>최소 시술 횟수<select id="bsMinDepth">'+options(depths.map(n=>[String(n),n?n+"회 이상":"제한 없음"]),"0")+'</select></label><label>경로 우선 정렬<select id="bsRouteOrder">'+options([["evidence","연구 근거 우선"],["margin","동시 목표 최소 여유율"],...db.stats.map(k=>[k,ko[k]||k]),["short","훈련 횟수 적은 순"],["long","훈련 횟수 많은 순"],["fees","직접 지출 적은 순"],["recovery","회복 합계 적은 순"],["transfer","이동 합계 적은 순"]],"evidence")+'</select></label><label class="bs-route-select">통합 육성 후보<select id="bsRoute"></select></label></div><div class="bs-controls bs-route-pages"><button id="bsRoutePrev" type="button">이전 경로</button><span id="bsRoutePage"></span><button id="bsRouteNext" type="button">다음 경로</button></div><p id="bsContext"></p><p id="bsRouteCount" class="bs-sub"></p><div id="bsMatchingBranches"></div><div id="bsMatchedResources"></div><div id="bsTable" class="bs-scroll"></div><div id="bsWitness" class="bs-note" aria-live="polite"></div><div id="bsOrigin"></div>'+sources();
  selected=db.branches.find(b=>b.id===selectedUrl)||null;
  const bodyUrl=new URL(location.href).searchParams.get("body");
  if(db.combos.some(c=>c.id===bodyUrl))E("bsBody").value=bodyUrl;
  const pref={UNIFIED12:0,REPLAY8:1,GATE12:2,CONTINUATION12:3,SOURCE8:4,CAREER12:5};
  let view=null,targets=[],resources={},indexKey="",index=null,scopeKey="",scoped=null,routePage=0;
  const resourceCache=new Map();
  let paretoCacheKey="",paretoCache=null;
  let exactKey="",exactRun=0,exactView=null,exactLoading=false,exactError=null,exactBody="";
  function selectedExactSpec(c,m){return exactResourceSpec(db,c.id,m,E("bsExactDepth")?.value||null);}
  function updateExactPanel(scope,c,m){
   const el=E("bsExactResult");if(!el)return;
   const latest=exactResourceSpec(db,c.id,m),picker=E("bsExactDepth"),bodyKey=c.id+"|"+m;
   if(exactBody!==bodyKey){
    exactBody=bodyKey;
    const versions=latest?Object.values(db.summary.exactResourceIndex.versions||{[latest.sha256]:latest}).filter(x=>x.combo===c.id).sort((a,b)=>(b.depth??5)-(a.depth??5)):[];
    picker.innerHTML=options(versions.map(x=>[x.sha256,"D"+(x.depth??5)+" · "+fmt(x.labels)+"개 · "+((x.packedTransport?.bytes??x.bytes)/1048576).toFixed(1)+" MiB"]),latest?.sha256||"");
    picker.disabled=!latest;
   }
   const spec=selectedExactSpec(c,m);
   const key=JSON.stringify([scopeKey,targets,resources,Number(E("bsMinDepth").value),spec?.sha256,E("bsExactRequired").value,E("bsExactExcluded").value]);
   if(key!==exactKey){exactKey=key;exactRun++;exactView=null;exactLoading=false;exactError=null;}
   const button=E("bsExactSearch");
   button.disabled=!spec||!scope.columns[1].profiles.length||exactLoading;
   if(!spec||!scope.columns[1].profiles.length){
    E("bsExactStatus").textContent="현재 병종·성장 방식·분기에 연결된 완료 상태 원장이 없습니다.";el.innerHTML="";return;
   }
   if(exactLoading){E("bsExactStatus").textContent="전체 완료 상태 원장을 읽고 검색 중…";el.innerHTML="";return;}
   if(exactError){E("bsExactStatus").textContent=exactError;el.innerHTML="";return;}
   if(!exactView){
    E("bsExactStatus").textContent="D"+(spec.depth??5)+" 완료 모델 · 검색 가능 "+fmt(spec.labels)+"개 상태·훈련 구성 (압축 "+((spec.packedTransport?.bytes??spec.bytes)/1048576).toFixed(1)+" MiB, 요청 시 로딩).";
    el.innerHTML="";return;
   }
   const {result:r,data:a}=exactView;
   const matchedProfiles=new Set(r.matchedProfiles);
   const branches=allowedBranches().filter(b=>matchedProfiles.has(b.results?.[c.id]?.[m])).length;
   E("bsExactStatus").textContent="D"+a.depth+" 완료 모델 · 전체 "+fmt(r.labelsScanned)+"개 중 조건 일치 "+fmt(r.matched)+"개 · 수치 상태 "+fmt(r.matchedStates)+"개 · 호환 정적 프로필 "+fmt(r.matchedProfiles.length)+"/"+fmt(r.profileCount)+"개 · 해당 분기 "+fmt(branches)+"개. "+(r.matched?"직접 자원 비지배 조합 "+fmt(r.skyline.length)+"개.":"이 완료 모델 안에서 일치 없음.");
   const units=["$","일","시간","회"],axisTitle=(id,i)=>i<4?r.axes[i][1]:label(id);
   const pathFor=n=>exactResourceWitness(db,a,n).witness;
   const action=(n,title)=>n==null?"—":'<button type="button" class="bs-value" data-exact-witness="'+n+'">'+esc(title)+'</button>';
   const header='<tr><th>구분</th>'+r.axes.map(([id],i)=>'<th>'+esc(axisTitle(id,i))+'</th>').join("")+'<th>훈련 경로</th></tr>';
   const cells=point=>point.vector?point.vector.map((v,i)=>'<td>'+fmt(v)+(units[i]||"")+'</td>').join(""):'<td colspan="'+r.axes.length+'">일치 없음</td>';
   const objRows=r.objectives.map((o,i)=>'<tr><th>최소 '+esc(axisTitle(o.id,i))+'</th>'+cells(o)+'<td>'+(o.label==null?"—":action(o.label,routeName(pathFor(o.label))))+'</td></tr>').join("");
   const pageSize=40,pageCount=Math.max(1,Math.ceil(r.skyline.length/pageSize));
   exactView.page=Math.max(0,Math.min(pageCount-1,exactView.page||0));
   const rows=r.skyline.slice(exactView.page*pageSize,(exactView.page+1)*pageSize).map((p,i)=>'<tr><td>'+fmt(exactView.page*pageSize+i+1)+'</td>'+cells(p)+'<td>'+action(p.label,routeName(pathFor(p.label)))+'</td></tr>').join("");
   el.innerHTML='<p class="bs-sub">목표 능력치를 모두 만족한 경로만 비교합니다. 조회 분기 합집합의 비용·회복·이동·횟수 및 입력 재료 수량 비지배 조합입니다. 동일 조합은 대표 하나를 남깁니다. 미지정 재료·연구·훈장 획득 가능성이나 분기별 전선 전체 보존을 보장하지 않습니다. 특정 분기에서 다시 검색할 수 있습니다.</p><div class="bs-scroll"><table class="bs-table"><thead>'+header+'</thead><tbody>'+objRows+'</tbody></table></div>'+
    (r.skyline.length?'<details class="bs-note" open><summary>전체 직접 자원 비지배 조합 ('+fmt(r.skyline.length)+'개)</summary><div class="bs-controls"><button type="button" data-exact-page="-1" '+(exactView.page===0?"disabled":"")+'>이전</button><span>'+(exactView.page+1)+' / '+pageCount+'</span><button type="button" data-exact-page="1" '+(exactView.page+1>=pageCount?"disabled":"")+'>다음</button></div><div class="bs-scroll"><table class="bs-table"><thead>'+header+'</thead><tbody>'+rows+'</tbody></table></div></details>':"")+
    '<details><summary>현재 입력 조건에서 독립 능력치 최고값 (동일 대원으로 합산 금지)</summary><div class="bs-scroll"><table class="bs-table"><thead><tr>'+db.stats.map(k=>'<th>'+esc(ko[k]||k)+'</th>').join("")+'</tr></thead><tbody><tr>'+r.best.map(x=>'<td>'+action(x.label,fmt(x.value))+'</td>').join("")+'</tr></tbody></table></div></details>';
  }
  async function runExactSearch(){
   if(!applyTargets())return;
   const {c,m,scope}=view,spec=selectedExactSpec(c,m);
   if(!spec||!scope.columns[1].profiles.length)return;
   const key=exactKey,run=++exactRun;
   exactLoading=true;exactError=null;exactView=null;updateExactPanel(scope,c,m);
   try{
    const a=await loadExactResourceIndex(db,c.id,m,spec.sha256);
    if(run!==exactRun||key!==exactKey)return;
    const r=queryExactResources(db,a,{profileIds:scope.columns[1].profiles,targets,resources,minDepth:Number(E("bsMinDepth").value),requiredRuleIds:[E("bsExactRequired").value].filter(Boolean),excludedRuleIds:[E("bsExactExcluded").value].filter(Boolean)});
    if(run!==exactRun||key!==exactKey)return;
    exactView={key,data:a,result:r,page:0,sha:spec.sha256};
   }catch(error){if(run===exactRun&&key===exactKey)exactError="전체 상태 검색 실패: "+error.message;}
   finally{if(run===exactRun&&key===exactKey){exactLoading=false;updateExactPanel(view.scope,view.c,view.m);}}
  }
  function selectExactWitness(labelIndex, restoredData=null, restoredHash=null){
   if(!restoredData&&(!exactView||exactView.key!==exactKey))return;
   const a=restoredData||exactView.data,{witness,profiles}=exactResourceWitness(db,a,labelIndex);
   const spec=exactResourceSpec(db,view.c.id,view.m,restoredHash||exactView?.sha);
   if(!spec||!profiles.some(id=>view.scope.columns[1].profiles.includes(id)))return;
   const sign=w=>JSON.stringify([w.body,w.vector,w.raw,w.bonus,w.steps,w.growthBefore]);
   const signature=sign(witness);
   let id=view.scope.columns[1].ids.find(id=>{
    const w=db.witnesses[id];return w.source==="GATE12"&&
     ["ORIGINAL_DAG_D5","D5_DIRECT_FEE_BUDGET_CHECKPOINT","D5_STAT_FEE_FRONTIER","D5_RESOURCE_GOAL_CHECKPOINT","D5_EXACT_RESOURCE_QUERY","D6_EXACT_RESOURCE_QUERY","D7_EXACT_RESOURCE_QUERY"].includes(w.sourceKind)&&sign(w)===signature;
   });
   if(!id){
    id="EXACTD"+a.depth+":"+a.classKey+":"+spec.sha256.slice(0,12)+":"+labelIndex;
    if(!db.witnesses[id])db.witnesses[id]=witness;
    for(const pid of profiles){
     const p=db.profiles[pid];if(!p)continue;
     const refs=p.runtimeExactCandidates??=[];
     if(!refs.includes(id))refs.push(id);
    }
    indexKey="";scopeKey="";paretoCacheKey="";
   }
   E("bsEvidence").value="GATE12";E("bsStatFeeOnly").checked=false;
   E("bsParetoMode").value="off";E("bsRouteSearch").value="";
   draw(false,id);
   const share=new URL(location.href);
   for(const [k,v] of Object.entries({body:view.c.id,mode:view.m,exactLabel:String(labelIndex),exactHash:spec.sha256,exactRules:db.sourceMetadataSha256}))share.searchParams.set(k,v);
   share.searchParams.delete("route");
   if(selected)share.searchParams.set("branch",selected.id);else share.searchParams.delete("branch");
   share.hash="integratedCaps";
   history.replaceState(history.state,"",share);
   const anchor=document.createElement("a");anchor.href=share.href;anchor.textContent="이 정확 경로의 공유·재현 링크";
   E("bsWitness").prepend(anchor);
   E("bsWitness").scrollIntoView({block:"start"});
  }
  function resourceFor(id){
   if(!resourceCache.has(id))resourceCache.set(id,summarizeRouteResources(db.witnesses[id],db.ruleDetails));
   return resourceCache.get(id);
  }
  function resourceSummary(r,key,field,suffix=""){
   return r.complete[key]?fmt(r[field])+suffix:"미계산 (확인 합계 "+fmt(r[field])+suffix+")";
  }
  function resourceDetails(id){
   const r=resourceFor(id);
   const entries=Object.entries(r.items).sort(([a],[b])=>label(a).localeCompare(label(b),"ko"));
   const medals=Object.entries(r.medals).sort(([a],[b])=>label(a).localeCompare(label(b),"ko"));
   const itemRows=entries.map(([item,n])=>'<tr><td>'+esc(label(item))+'<small class="bs-sub">'+esc(item)+'</small></td><td>'+fmt(n)+'</td><td>'+fmt(r.peakItems[item])+'</td></tr>').join("");
   const show=(title,body)=>'<div><strong>'+esc(title)+'</strong><p>'+body+'</p></div>';
   return '<section class="bs-resource-summary"><h4>선택 경로의 직접 훈련 자원</h4><div class="bs-resource-grid">'+show("훈련 횟수",resourceSummary(r,"actions","actions","회"))+show("직접 지출",resourceSummary(r,"cash","grossFees","$"))+show("룰셋 지급액",resourceSummary(r,"cash","credits","$"))+show("순 비용 (참고)",resourceSummary(r,"cash","netFees","$"))+show("이동 합계",resourceSummary(r,"transfer","transferHours","시간"))+show("회복 합계",resourceSummary(r,"recovery","recoveryDays","일"))+'</div><p>훈장: '+(r.complete.medals?"":"미계산 포함 · ")+(medals.map(([k,v])=>esc(label(k))+" · 레벨 "+fmt(v)+" (룰셋)").join(" / ")||"요구 없음")+'</p><p>시설 기능: '+(r.complete.facilities?"":"미계산 포함 · ")+list(r.facilities)+'</p><p>시술 연구 요구: '+(r.complete.research?"":"미계산 포함 · ")+list(r.research)+'</p>'+(r.rankRequirements.length?'<p>계급·전환 조건: '+r.rankRequirements.map(x=>x.step+"단계 "+esc(label(x.ruleId))+" · 최소 "+fmt(x.minRank)+(x.resetRank?" · 계급 초기화":"")+(x.producedBody?" · "+esc(label(x.producedBody))+" 전환":"")).join(" / ")+'</p>':"")+'<p>재료 요구 '+fmt(entries.length)+'종'+(r.complete.items?"":" · 미계산 포함")+'</p>'+(entries.length?'<div class="bs-scroll"><table class="bs-table"><thead><tr><th>재료</th><th>전 과정 요구량 합계</th><th>1회 최대 요구량</th></tr></thead><tbody>'+itemRows+'</tbody></table></div>':"<p>연결된 시술 룰의 재료 요구 없음.</p>")+(r.unknownRules.length?'<p class="bs-warning">미연결 규칙: '+list(r.unknownRules)+'</p>':"")+'<p class="bs-sub">직접 시술 룰의 합계입니다. 훈장은 누적 소비량이 아니라 요구되는 최고 레벨이며, 레벨 0도 훈장 요구입니다. 재료 획득·재사용·반환 및 실제 시술 시간은 별도로 입증해야 합니다.</p></section>';
  }
  function budgetTable(scope){
   const el=E("bsBudgetCheckpoints"),i=db.stats.indexOf(E("bsBudgetStat").value);
   const pids=scope.columns[1].profiles;
   const budgets=db.summary.budgetCheckpoints?.budgets||[];
   const rows=budgets.map(budget=>{
    let win=null;
    for(const pid of pids){
     const x=db.profiles[pid]?.budgetCheckpoints?.find(t=>t.budget===budget)?.best[i];
     const w=db.witnesses[x];
     if(!w||!Number.isFinite(w.vector[i]))continue;
     if(!win||w.vector[i]>db.witnesses[win].vector[i]||w.vector[i]===db.witnesses[win].vector[i]&&resourceFor(x).grossFees<resourceFor(win).grossFees)win=x;
    }
    return {budget,win};
   });
   if(!rows.some(x=>x.win)){el.innerHTML='<p class="bs-sub">현재 병종·성장 모드·분기에는 예산별 재탐색 결과가 연결되지 않았습니다. 본체 전투캡 5단계 모델만 지원합니다.</p>';return;}
   el.innerHTML='<p class="bs-sub">조회 분기의 기존 D5 상태 그래프 전체에서 예산별 '+esc(ko[db.stats[i]])+' 최고 대표를 추출했습니다. 아래는 다른 목표·재료 제한을 적용하기 전의 독립 최고값입니다.</p><div class="bs-scroll"><table class="bs-table"><thead><tr><th>직접 지출 상한</th><th>최고 후보</th><th>대표 직접 지출</th><th>대표 훈련</th></tr></thead><tbody>'+rows.map(({budget,win})=>'<tr><td>'+fmt(budget)+'$</td>'+(win?valueCell(null,i,win):'<td>—</td>')+'<td>'+(win?fmt(resourceFor(win).grossFees)+"$":"—")+'</td><td>'+(win?esc(routeName(db.witnesses[win])):"—")+'</td></tr>').join("")+'</tbody></table></div>';
  }
  function resourceGoalTable(scope){
   const el=E("bsGoalResult");if(!el)return;
   const p=projectResourceGoal(db,scope.columns[1].profiles,E("bsGoalPreset").value,E("bsGoalTarget").value,resourceFor);
   if(!p?.profiles){el.innerHTML='<p class="bs-sub">현재 분기·병종·성장 모드에는 이 5단계 재계산 결과가 연결되지 않았습니다.</p>';E("bsGoalApply").disabled=true;return;}
   E("bsGoalApply").disabled=false;
   const objectives={fees:"최소 직접 지출",recovery:"최소 회복",transfer:"최소 이동",actions:"최소 시술 횟수"};
   const rows=Object.entries(p.goals).map(([key,id])=>{
    const r=id?resourceFor(id):null;
    return '<tr><th>'+objectives[key]+'</th><td>'+(r?fmt(r.grossFees)+"$":"—")+'</td><td>'+(r?fmt(r.recoveryDays):"—")+'</td><td>'+(r?fmt(r.transferHours):"—")+'</td><td>'+(r?fmt(r.actions):"—")+'</td><td>'+(id?'<button type="button" class="bs-value" data-goal-witness="'+esc(id)+'">'+esc(routeName(db.witnesses[id]))+'</button>':"조건 일치 없음")+'</td></tr>';
   }).join("");
   el.innerHTML='<p class="bs-sub">'+fmt(p.profiles)+'개 정적 연구 프로필에서 이 자원 조건을 먼저 적용했습니다. 현재 조회 분기 기준이며 아래 네 경로는 서로 다를 수 있습니다. 별도의 자유 입력 목표·자원·훈련명 검색 조건은 이 표에 적용하지 않습니다.</p><div class="bs-scroll"><table class="bs-table"><thead><tr><th>우선 목표</th><th>직접 지출</th><th>회복 (일)</th><th>이동 (시간)</th><th>시술 횟수</th><th>동시 목표를 충족하는 대표 경로</th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="bs-sub">조건 일치 없음은 이 완료 그래프 내 결과이며 실제 게임의 불가능 판정이 아닙니다.</p><details><summary>같은 자원 조건의 능력치별 독립 최고 후보 (동시 목표 미적용)</summary><div class="bs-scroll"><table class="bs-table"><thead><tr>'+db.stats.map(k=>'<th>'+esc(ko[k]||k)+'</th>').join("")+'</tr></thead><tbody><tr>'+p.best.map((id,i)=>'<td>'+(id?fmt(db.witnesses[id].vector[i]):"—")+'</td>').join("")+'</tr></tbody></table></div></details>';
  }
  function applyGoalPreset(preferred=null){
   const spec=db.summary.resourceGoalCheckpoints;
   const preset=spec?.presets.find(p=>p.id===E("bsGoalPreset")?.value),goal=spec?.goals.find(g=>g.id===E("bsGoalTarget")?.value);
   if(!preset||!goal)return;
   for(let i=0;i<db.stats.length;i++)E("bsTarget"+i).value=goal.stats[db.stats[i]]??"";
   for(const [id,key] of resourceFields)E(id).value=key==="maxActions"?spec.depth:(preset[key]??"");
   for(const [id,key] of resourceChecks)E(id).checked=!!preset[key];
   const mats=Object.entries(preset.materialLimits||{});
   for(const i of materialSlots){E("bsItem"+i).value=mats[i-1]?.[0]||"";E("bsItemLimit"+i).value=mats[i-1]?.[1]??"";}
   E("bsMode").value=spec.mode;E("bsEvidence").value="GATE12";E("bsStatFeeOnly").checked=false;
   E("bsMinDepth").value="0";E("bsParetoMode").value="off";E("bsRouteSearch").value="";
   E("bsRouteOrder").value="fees";
   applyTargets(preferred);
  }
  function matchedResourcesTable(rows,scope){
   const el=E("bsMatchedResources");
   if(!targets.length&&!hasResourceFilters(resources)&&!E("bsStatFeeOnly").checked&&!Number(E("bsMinDepth").value)&&E("bsParetoMode").value==="off"){
    el.innerHTML="";return;
   }
   const modelRows=Object.entries(modelLabels).map(([source,title])=>{
    const own=rows.filter(id=>db.witnesses[id].source===source);
    const known=own.filter(id=>resourceFor(id).complete.cash);
    const cheapest=known.reduce((best,id)=>!best||resourceFor(id).grossFees<resourceFor(best).grossFees||
     resourceFor(id).grossFees===resourceFor(best).grossFees&&routeActionCount(db.witnesses[id])<routeActionCount(db.witnesses[best])?id:best,null);
    return {title,own,known,cheapest};
   }).filter(x=>x.own.length);
   el.innerHTML=modelRows.length?'<details class="bs-note" open><summary>조건 충족 후보의 모델별 최소 직접 지출</summary><p class="bs-sub">입력한 모든 능력치·자원·시술 횟수 조건을 만족하는 등록 후보만 비교합니다. 미연결 비용은 최저 비용으로 간주하지 않습니다. 전체 경로의 최소 비용 인증이 아닙니다.</p><div class="bs-scroll"><table class="bs-table"><thead><tr><th>계산 모델</th><th>조건 일치 / 비용 확인</th><th>분기 참조</th><th>최소 직접 지출</th><th>훈련 횟수</th><th>대표 경로</th></tr></thead><tbody>'+modelRows.map(x=>{const id=x.cheapest,r=id?resourceFor(id):null;return '<tr><th>'+esc(x.title)+'</th><td>'+fmt(x.own.length)+' / '+fmt(x.known.length)+'</td><td>'+fmt(scope.matchingBranches(x.own).length)+'</td><td>'+(r?fmt(r.grossFees)+"$":"—")+'</td><td>'+(r?fmt(r.actions):"—")+'</td><td>'+(r?'<button class="bs-value" type="button" data-witness="'+esc(id)+'">'+esc(routeName(db.witnesses[id]))+'</button>':"비용 미계산")+'</td></tr>';}).join("")+'</tbody></table></div></details>':"";
  }
  const PAGE_SIZE=180;
  const requestedMode=query.get("mode");
  if(db.modes.includes(requestedMode))E("bsMode").value=requestedMode;
  function allowedBranches(){
   const exclude=E("bsExcludeConflict").checked,q=E("bsSearch").value.trim().toLowerCase();
   const candidates=selected?[selected]:db.branches.filter(b=>matchesFacets(b)&&(!q||searchText(b).includes(q)));
   return candidates.filter(b=>!exclude||!b.sourceRootConflict);
  }
  function scopeFor(c,m){
   const k=c.id+"|"+m;
   if(indexKey!==k){index=buildBranchRouteIndex(db,c,m);indexKey=k;scopeKey="";}
   const bs=allowedBranches(),includeGlobal=!selected&&bs.length===db.branches.length&&!E("bsExcludeConflict").checked;
   const key=k+"|"+Number(includeGlobal)+"|"+bs.map(b=>b.id).join(",");
   if(key!==scopeKey){scoped=index.scope(bs.map(b=>b.id),{includeGlobal});scopeKey=key;}
   return scoped;
  }
  function margin(w){
   if(!targets.length)return 0;
   return Math.min(...targets.map(([i,min])=>(w.vector[i]-min)/Math.max(1,min)));
  }
  function applyTargets(preferred=null){
   try{
    const nextTargets=parseTargets(db.stats,db.stats.map((_,i)=>E("bsTarget"+i).value));
    const nextResources=Object.fromEntries(resourceFields.map(([id,key])=>[key,parseResourceLimit(E(id).value)]));
    for(const [id,key] of resourceChecks)nextResources[key]=E(id).checked;
    nextResources.materialLimits={};
    for(const i of materialSlots){
     const itemId=E("bsItem"+i).value,limit=parseResourceLimit(E("bsItemLimit"+i).value);
     if(limit==null)continue;
     if(!itemId)throw Error("재료 "+i+"의 종류를 선택하세요.");
     nextResources.materialLimits[itemId]=Math.min(nextResources.materialLimits[itemId]??Infinity,limit);
    }
    targets=nextTargets;resources=nextResources;
   }
   catch(err){E("bsTargetStatus").textContent=err.message;return false;}
   draw(true,typeof preferred==="string"?preferred:null);return true;
  }
  function branchPicker(ids,kind,route=null){
   if(!ids.length)return "";
   return '<div class="bs-controls bs-support-controls"><label>'+esc(kind)+' ('+fmt(ids.length)+'개)<select id="bsSupport'+kind+'">'+options(ids.map(id=>[id,branchName(index.branchMap.get(id))+" · "+status(index.branchMap.get(id))]),selected&&ids.includes(selected.id)?selected.id:ids[0])+'</select></label><button type="button" data-support-pick="bsSupport'+esc(kind)+'" data-support-route="'+esc(route||"")+'">이 분기로 좁히기</button></div>';
  }

  function selectOptions(){
   const q=E("bsSearch").value.trim().toLowerCase();
   const matches=db.branches.filter(b=>matchesFacets(b)&&(!q||searchText(b).includes(q)));
   if(selected&&!matches.some(x=>x.id===selected.id))matches.unshift(selected);
   E("bsBranch").innerHTML=options([["","전체 분기 (모델별 범위)"],...matches.map(b=>[b.id,branchName(b)])],selected?.id||"");
  }
  function draw(reset=false,preferred=null,paging=false){
   if(reset)routePage=0;
   const c=db.combos.find(x=>x.id===E("bsBody").value)||db.combos[0],m=E("bsMode").value;
   const scope=scopeFor(c,m),cols=scope.columns,ids=scope.ids;
   const extra=selected?selected.evidence[c.classKey]:db.globalEvidence[c.classKey];
   const p=cols[1].ids.length;
   const q=E("bsRouteSearch").value.trim().toLowerCase(),order=E("bsRouteOrder").value,evidence=E("bsEvidence").value;
   const statIndex=db.stats.indexOf(order),minDepth=Number(E("bsMinDepth").value);
   const feeOnly=E("bsStatFeeOnly").checked,feeIds=scope.statFeeIds;
   const feeSummary=db.summary.statFeeFrontier;
   E("bsStatFeeCoverage").textContent=feeSummary?"5단계 전체 완료 상태 재탐색 · 신규 "+fmt(feeSummary.witnessesAdded)+"개 · 현재 분기·병종 전선 "+fmt(feeIds.size)+"개. 동일 상태의 최소 양수 시술비와 12능력치 기준으로 계산했습니다. 동점 대표만 남긴 수치 전선이며 재료·연구 시간순·실제 성장의 전역 최적성은 아닙니다.":"5단계 전체 비용 전선 미연결.";
   const evidenceIds=ids.filter(id=>(!feeOnly||feeIds.has(id))&&(evidence==="all"||db.witnesses[id].source===evidence));
   const matched=evidenceIds.filter(id=>{const w=db.witnesses[id];return routeActionCount(w)>=minDepth&&matchesTargets(w,targets)&&(!hasResourceFilters(resources)||matchesResources(resourceFor(id),resources))&&(!q||[routeName(w),...w.steps.map(x=>x.id),...(w.research||[]).map(label),...(w.research||[]),w.originProfile,modelLabels[w.source]].join(" ").toLowerCase().includes(q));});
   const paretoMode=E("bsParetoMode").value,axes=E("bsParetoAxes").value;
   const dimensions=axes==="all"||axes==="targets"&&!targets.length?null:axes==="targets"?targets.map(([i])=>i):[db.stats.indexOf(axes)];
   let pareto=null;
   if(paretoMode!=="off"){
    const key=JSON.stringify([scopeKey,paretoMode,dimensions,matched]);
    if(key!==paretoCacheKey){
     paretoCache=registeredResourcePareto({ids:matched,witnesses:db.witnesses,resourceFor,supportFor:scope.supportFor,statIndices:dimensions,resourceMode:paretoMode});
     paretoCacheKey=key;
    }
    pareto=paretoCache;
   }
   const rows=pareto?[...pareto.ids]:matched;
   const unranked=new Set(pareto?.unranked||[]);
   const beforeBranches=pareto?scope.matchingBranches(matched):[];
   const axisText=dimensions?dimensions.map(i=>ko[db.stats[i]]||db.stats[i]).join(" · "):"모든 계산된 능력치";
   E("bsParetoStatus").textContent=pareto?axisText+" · 조건 일치 "+fmt(pareto.input)+"개 → 비지배 "+fmt(pareto.frontier.length)+"개 / 비교 불가 보존 "+fmt(pareto.unranked.length)+"개 / 열등 "+fmt(pareto.removed.length)+"개. 제외는 보기 필터만 적용합니다."+(pareto.unranked.length?" 미판정: 능력치 "+fmt(pareto.reasons.missingStats)+" · 자원 "+fmt(pareto.reasons.missingResources)+" · 분기 참조 "+fmt(pareto.reasons.missingBranchSupport):""):"비지배 필터 꺼짐 — 모든 조건 일치 경로를 표시합니다.";
   E("bsParetoExamples").innerHTML=pareto?.removed.length?'<details class="bs-note"><summary>열등 판정 근거 예시 '+Math.min(3,pareto.removed.length)+'쌍</summary><p class="bs-sub">같은 비교 기준 내에서만 판정합니다. 제외된 경로의 원래 상세도 열 수 있습니다.</p><div class="bs-scroll"><table class="bs-table"><thead><tr><th>판정</th><th>육성 경로</th><th>비교 능력치</th><th>직접 지출</th><th>참조 분기</th></tr></thead><tbody>'+pareto.removed.slice(0,3).map(pair=>[["비지배 유지",pair.dominator],["보기에서 제외",pair.id]].map(([title,id])=>{const w=db.witnesses[id],r=resourceFor(id);return '<tr><td>'+title+'</td><td><button type="button" class="bs-value" data-witness="'+esc(id)+'">'+esc(routeName(w))+'</button></td><td>'+(dimensions??w.vector.map((v,i)=>Number.isFinite(v)?i:-1).filter(i=>i>=0)).map(i=>esc(ko[db.stats[i]]||db.stats[i])+" "+fmt(w.vector[i])).join(" · ")+'</td><td>'+fmt(r.grossFees)+'$</td><td>'+fmt(scope.supportFor(id).length)+'</td></tr>';}).join("")).join("")+'</tbody></table></div></details>':"";
   const count=routeActionCount;
   rows.sort((a,b)=>{const x=db.witnesses[a],y=db.witnesses[b];
    const defaultOrder=(pref[x.source]??9)-(pref[y.source]??9);
    if(statIndex>=0)return (y.vector[statIndex]??-Infinity)-(x.vector[statIndex]??-Infinity)||defaultOrder||count(x)-count(y)||a.localeCompare(b);
    if(order==="margin"&&targets.length)return margin(y)-margin(x)||defaultOrder||count(x)-count(y)||a.localeCompare(b);
    if(order==="short")return count(x)-count(y)||defaultOrder||a.localeCompare(b);
    if(order==="long")return count(y)-count(x)||defaultOrder||a.localeCompare(b);
    if(["fees","recovery","transfer"].includes(order)){const rx=resourceSortValue(resourceFor(a),order),ry=resourceSortValue(resourceFor(b),order);return (rx===ry?0:rx-ry)||defaultOrder||count(x)-count(y)||a.localeCompare(b);}
    return defaultOrder||a.localeCompare(b);
   });
   const routeSelect=E("bsRoute"),prev=preferred??(reset?null:routeSelect.value);
   const recProfile=selected?selected.evidence[c.classKey]?.unifiedByBody?.[c.body]:db.globalEvidence[c.classKey]?.unifiedByBody?.[c.body];
   const recommended=db.profiles[recProfile]?.representative;
   const pageCount=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
   routePage=Math.max(0,Math.min(routePage,pageCount-1));
   let chosen=rows.includes(prev)?prev:!reset&&prev==="maxima"?"maxima":
    order==="evidence"&&rows.includes(recommended)?recommended:rows[0]||"maxima";
   if(paging)chosen=rows[routePage*PAGE_SIZE]||"maxima";
   else if(chosen!=="maxima")routePage=Math.floor(rows.indexOf(chosen)/PAGE_SIZE);
   const routeOptions=rows.slice(routePage*PAGE_SIZE,(routePage+1)*PAGE_SIZE).map((id,i)=>{const w=db.witnesses[id],v=statIndex>=0?w.vector[statIndex]:null;
    const r=resourceFor(id);return [id,(routePage*PAGE_SIZE+i+1)+". "+(modelLabels[w.source]||w.source)+(w.runtimeExact?" / 전체 상태 즉시 검색":feeIds.has(id)?" / 5단계 비용 전선":w.resourceCheckpoint?" / 예산 후보":"")+(unranked.has(id)?" / 비교 미판정":"")+" · "+fmt(count(w))+"회 시술 · "+resourceSummary(r,"cash","grossFees","$")+" · "+(statIndex>=0?(ko[order]||order)+" "+fmt(v)+" · ":"")+routeName(w)];});
   routeSelect.innerHTML=options([["maxima","독립 최고값만 비교 (동일 경로 아님)"],...routeOptions],chosen);
   routeSelect.disabled=!rows.length;
   E("bsRoutePage").textContent=(routePage+1)+" / "+pageCount+" 페이지";
   E("bsRoutePrev").disabled=routePage===0;E("bsRouteNext").disabled=routePage>=pageCount-1;
   const matching=scope.matchingBranches(rows);
   view={c,m,cols,ids,rows,matched,chosen,scope,pareto};
   const w=db.witnesses[chosen],body=db.bodies?.[c.body]||{},targetMap=new Map(targets);
   E("bsContext").innerHTML=(selected?esc(branchName(selected))+" · "+esc(status(selected))+" · 연구 이력 "+fmt(selected.historyCount)+"개":"전체 또는 선택 조건의 분기별 전선 조회")+' · 조회 분기 '+fmt(scope.branchCount)+'개'+(selected?' · <a href="'+esc(link("branch",selected))+'">이 분기의 연구·보상·상호배제</a>':' · <a href="'+esc(link("branch",null))+'">분기 DB</a>')+(!p?" · 12능력치 모델 미연결":"")+(selected?.sourceRootConflict?' <strong class="bs-warning">원천 충돌 분기 — 수치 후보를 실제 가능으로 간주하지 않음</strong>':"");
   const targetText=targets.map(([i,min])=>(ko[db.stats[i]]||db.stats[i])+" ≥ "+fmt(min)).join(" · ");
   const resourceText=[...resourceFields.filter(([,k])=>resources[k]!=null).map(([,k,t])=>t+" "+fmt(resources[k])),...resourceChecks.filter(([,k])=>resources[k]).map(([,k,t])=>t),...Object.entries(resources.materialLimits||{}).map(([id,n])=>label(id)+" ≤ "+fmt(n))].join(" · ");
   budgetTable(scope);
   resourceGoalTable(scope);
   updateExactPanel(scope,c,m);

   const breakdown=Object.keys(modelLabels).map(source=>{
    const own=rows.filter(id=>db.witnesses[id].source===source);
    return own.length?modelLabels[source]+" "+fmt(own.length)+"경로 / "+fmt(scope.matchingBranches(own).length)+"분기":null;
   }).filter(Boolean).join(" · ");
   E("bsTargetStatus").textContent=(targetText?"적용 목표: "+targetText:"능력치 목표 없음")+(resourceText?" · 자원 제한: "+resourceText:"")+" · 조건에 맞는 경로 "+fmt(matched.length)+"개 / 표시 "+fmt(rows.length)+"개 / 정확한 분기 프로필 참조 "+fmt(matching.length)+"개. "+(!rows.length?"현재 연결된 후보에서 일치 없음. 실제 게임 불가능을 뜻하지 않습니다.":"실제 동시 달성 인증은 아닙니다.")+(breakdown?" 모델별: "+breakdown+" (분기 중복 가능).":"");
   const maxDepth=rows.reduce((n,id)=>Math.max(n,count(db.witnesses[id])),0);
   const thresholdDepths=depths.filter(n=>n>=5),summaryDepths=thresholdDepths.length<=12?thresholdDepths:[...thresholdDepths.slice(0,11),thresholdDepths.at(-1)];
   const depthCounts=summaryDepths.map(n=>n+"회 이상 "+fmt(rows.filter(id=>count(db.witnesses[id])>=n).length)+"개").join(" · ");
   E("bsRouteCount").textContent="조회 경로 대표 "+fmt(ids.length)+"개 / 검색·목표·자원 만족 "+fmt(matched.length)+"개"+(pareto?" · 비지배 필터 표시 "+fmt(rows.length)+"개 (분기 "+fmt(beforeBranches.length)+" → "+fmt(matching.length)+"개)":"")+" · 분기 프로필 참조 "+fmt(matching.length)+"개"+(rows.length?" · 최장 "+maxDepth+"회 (반복 포함) · "+depthCounts:"")+(w?" · 선택 "+count(w)+"회 시술 · "+(modelLabels[w.source]||w.source):" · 독립 최대값만 표시");
   E("bsMatchingBranches").innerHTML=(targets.length||hasResourceFilters(resources)||feeOnly||minDepth||q||evidence!=="all"||pareto)?(breakdown?'<p class="bs-sub">'+esc(breakdown)+' (분기 중복 가능)</p>':"")+(matching.length&&!selected?branchPicker(matching,"목표일치"):""):"";
   matchedResourcesTable(rows,scope);
   const maxima=independentMaxima(db.stats,rows.map(id=>registryCandidate(db,id,c.id)));
   E("bsTable").innerHTML='<table class="bs-table"><thead><tr><th rowspan="2">능력치</th><th colspan="3">최종 병종 룰셋 기준</th><th rowspan="2" class="bs-chosen">선택 경로<small class="bs-sub">실효 (원시 + 보너스)</small></th><th rowspan="2">독립 최고 후보<small class="bs-sub">현재 검색 조건</small></th></tr><tr><th>생성 상단</th><th>전투캡</th><th>훈련캡</th></tr></thead><tbody>'+db.stats.map((k,i)=>{
    const target=targetMap.get(i),hasTarget=targetMap.has(i),v=w?.vector[i];
    const marker=hasTarget?'<small class="bs-sub">목표 ≥ '+fmt(target)+(w?" · "+(Number.isFinite(v)&&v>=target?"충족":"미충족/미계산"):"")+'</small>':"";
    const selectedCell=w&&Number.isFinite(v)?valueCell(null,i,chosen).replace("<td>","<td class=\"bs-chosen\">"):'<td class="bs-chosen">—</td>';
    return '<tr><th>'+esc(ko[k]||k)+marker+'</th><td>'+fmt(body.maxStats?.[k])+'</td><td>'+fmt(body.statCaps?.[k])+'</td><td>'+fmt(body.trainingStatCaps?.[k])+'</td>'+selectedCell+(maxima[k]?valueCell(null,i,maxima[k].route).replace("</td>",'<small class="bs-sub">'+esc(evidenceLabel(maxima[k].source))+'</small></td>'):"<td>—</td>")+'</tr>';
   }).join("")+'</tbody></table><p class="bs-sub">— 는 미계산·미연결이며 0이 아닙니다. 생성 상단·전투캡·훈련캡은 서로 다릅니다. 독립 최고값은 현재 검색에 맞는 등록 후보에서 산출하며 합산하지 않습니다. 근거 종류는 각 셀에 표시합니다.</p>';
   E("bsWitness").innerHTML=rows.length?'<p>경로를 선택하면 성장 시점, 동일 벡터와 훈련 조건을 확인할 수 있습니다.</p>':'<p>현재 조건을 만족하는 연결 경로가 없습니다. 독립 최고값을 합쳐 하나의 대원을 만들지 않습니다.</p>';
   if(w)showWitness(chosen);
   const o=extra?.origin;
   E("bsOrigin").innerHTML=o?'<details class="bs-note"><summary>선택 분기의 출생 아이템·이벤트 조건</summary><p>출생 토큰 '+esc(label(o.sourceTokenId))+' · 연구 일치 이벤트 '+list(o.matchingEventIds)+' · 충돌 '+list(o.researchConflictingEventIds)+' · 실제 아이템 지급 미입증.</p></details>':"";
  }
  E("bsSearch").addEventListener("input",()=>{selectOptions();if(!selected)draw(true);});
  bindFacets(()=>{const available=db.branches.filter(matchesFacets);if(selected&&!matchesFacets(selected))selected=null;if(available.length===1)selected=available[0];selectOptions();draw(true);});
  E("bsBranch").addEventListener("change",()=>{selected=db.branches.find(b=>b.id===E("bsBranch").value)||null;draw(true);});
  E("bsBody").addEventListener("change",()=>draw(true));E("bsMode").addEventListener("change",()=>draw(true));
  E("bsMinDepth").addEventListener("change",()=>draw(true));
  E("bsRouteOrder").addEventListener("change",()=>draw(true));E("bsRouteSearch").addEventListener("input",()=>draw(true));
  E("bsRoute").addEventListener("change",()=>draw(false));
  E("bsApplyTargets").addEventListener("click",applyTargets);
  E("bsClearTargets").addEventListener("click",()=>{for(const id of ["bsExactRequired","bsExactExcluded"])if(E(id))E(id).value="";for(let i=0;i<db.stats.length;i++)E("bsTarget"+i).value="";targets=[];resources={};for(const [id] of resourceFields)E(id).value="";for(const [id] of resourceChecks)E(id).checked=false;for(const i of materialSlots){E("bsItem"+i).value="";E("bsItemLimit"+i).value="";}E("bsEvidence").value="all";E("bsExcludeConflict").checked=false;E("bsStatFeeOnly").checked=false;E("bsMinDepth").value="0";E("bsParetoMode").value="off";E("bsParetoAxes").value="all";draw(true);});
  E("bsParetoMode").addEventListener("change",()=>draw(true));E("bsParetoAxes").addEventListener("change",()=>{if(E("bsParetoMode").value!=="off")draw(true);});
  E("bsBudgetStat").addEventListener("change",()=>{if(view)budgetTable(view.scope);});
  for(const id of ["bsGoalPreset","bsGoalTarget"])E(id)?.addEventListener("change",()=>{if(view)resourceGoalTable(view.scope);});
  E("bsGoalApply")?.addEventListener("click",()=>applyGoalPreset());
  E("bsExactSearch")?.addEventListener("click",runExactSearch);
  for(const id of ["bsExactDepth","bsExactRequired","bsExactExcluded"])E(id)?.addEventListener("change",()=>{if(view)updateExactPanel(view.scope,view.c,view.m);});

  E("bsStatFeeOnly").addEventListener("change",()=>draw(true));
  E("bsEvidence").addEventListener("change",()=>draw(true));
  E("bsExcludeConflict").addEventListener("change",()=>draw(true));
  E("bsRoutePrev").addEventListener("click",()=>{routePage--;draw(false,null,true);});
  E("bsRouteNext").addEventListener("click",()=>{routePage++;draw(false,null,true);});
  E("bsTargetPanel").addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.matches("[data-target-index],[data-resource-limit]")){e.preventDefault();applyTargets();}});

  function careerMedalMarkup(w,source){
   if(source.meta?.source?.metadataSha256!==db.sourceMetadataSha256)throw Error("훈장 규칙과 육성 원장의 출처 불일치");
   const p=buildCareerMedalPlan(w,source,db.stats);
   if(!p)return "";
   const names={totalStatGain:"누적 능력치 증가 (일지)",killsWithCriteriaCareer:"조건 일치 누적 처치",totalValientCrux:"기사 일지 카운터",totalMissions:"조건 일치 임무"};
   const signed=n=>n==null?"—":(n>0?"+":"")+fmt(n);
   const delta=v=>v?v.map((n,i)=>n?esc(ko[db.stats[i]]||db.stats[i])+" "+signed(n):"").filter(Boolean).join(" · ")||"변화 없음":"미계산";
   const rank=p.rankSteps.map(x=>'<li>'+fmt(x.step)+'단계 '+esc(label(x.id))+' 이전 최소 계급 '+fmt(x.required)+'</li>').join("");
   const rows=p.rows.map(r=>{
    const kills=r.killCriteria.length?'<details><summary>룰셋 처치 조건 그룹 '+fmt(r.killCriteria.length)+'개</summary><ul>'+r.killCriteria.map(g=>'<li>'+esc(Array.isArray(g)?g.map(x=>Array.isArray(x)&&Array.isArray(x[1])?x[0]+" × "+x[1].map(label).join(" + "):JSON.stringify(x)).join(" / "):JSON.stringify(g))+'</li>').join("")+'</ul></details>':"";
    const missions=r.missionTypeFilter.length?'<details><summary>임무 유형 제한 '+fmt(r.missionTypeFilter.length)+'개</summary><p>'+list(r.missionTypeFilter)+'</p></details>':"";
    return '<tr><td>'+esc(r.name)+'<small class="bs-sub">'+esc(r.id)+'</small></td><td>레벨 '+fmt(r.level)+' · 보유 필수</td><td>'+r.milestones.map(m=>fmt(m.step)+"단계 이전 레벨 "+fmt(m.level)+" ("+esc(label(m.ruleId))+")").join("<br>")+'</td><td>'+r.thresholds.map(t=>esc(names[t.field]||t.field)+" "+fmt(t.value)).join("<br>")+kills+missions+'</td><td>'+delta(r.bonus)+(r.overlap?' · 기존 보너스 중복 가능':r.duplicate?' · 동일 보너스 중복 합산 제외':"")+'</td></tr>';
   }).join("");
   const vectors=p.rows.length?'<div class="bs-scroll"><table class="bs-table"><thead><tr><th>능력치</th>'+db.stats.map(k=>'<th>'+esc(ko[k]||k)+'</th>').join("")+'</tr></thead><tbody>'+[["기존 조건부 실효값",w.vector],["필수 훈장 보너스 (별도)",p.complete?p.delta:null],["최소 요구 훈장 보유 가정",p.combined]].map(([t,v],i)=>'<tr><th>'+t+'</th>'+db.stats.map((_,j)=>'<td>'+(i===1?signed(v?.[j]):fmt(v?.[j]))+'</td>').join("")+'</tr>').join("")+'</tbody></table></div>':"";
   return '<section class="bs-note"><h4>계급·훈장 획득 조건과 최소 요구 훈장 보너스</h4><p class="bs-sub">실제 전투·승급·일지 수여는 재생하지 않았습니다. 슈퍼사이즈의 totalStatGain은 원본 일지 카운터이며 시술 전후 단순 차이로 대체하지 않습니다.</p>'+(rank?'<ul>'+rank+'</ul>':"")+(rows?'<div class="bs-scroll"><table class="bs-table"><thead><tr><th>훈장</th><th>최고 필수 레벨</th><th>시술 전 획득 시점</th><th>룰셋 요구 카운터</th><th>해당 레벨 보너스</th></tr></thead><tbody>'+rows+'</tbody></table></div>':"<p>이 경로에는 필수 훈장이 없습니다.</p>")+vectors+(p.retentionRisks.length?'<p class="bs-warning">병종 전환·초기화 이후 훈장 유지 및 중간 계급은 별도 확인 필요: '+p.retentionRisks.map(x=>fmt(x.step)+'단계 '+esc(label(x.id))).join(" / ")+'. 합산값 보류.</p>':"")+(p.unresolved.length?'<p class="bs-warning">미확인 규칙: '+esc(p.unresolved.join(" / "))+'</p>':"")+'<p class="bs-sub">동일 훈장은 최고 요구 레벨의 보너스만 한 번 적용합니다. 합산값은 같은 경로의 수치에 최소 필수 훈장이 모두 유지된다는 가정을 적용한 별도 참고값입니다. 기존 파레토·최고값·목표 검색 결과에는 반영하지 않습니다.</p></section>';
  }
  function mountCareerProgress(panel,w,source){
   const p=buildCareerMedalPlan(w,source,db.stats);
   if(!p||(!p.rankSteps.length&&!p.rows.length))return;
   const labels={totalStatGain:"능력치 증가 일지",killsWithCriteriaCareer:"조건 일치 처치",totalValientCrux:"기사 일지 카운터",totalMissions:"조건 일치 임무"};
   const statuses={HELD:"현재 보유 충족",NEEDS_PROMOTION:"계급 부족",COUNTER_SHORT:"카운터 부족",AWARD_NOT_CONFIRMED:"카운터 충족 · 훈장 수여 미확인",UNKNOWN:"입력·보유 미확인",UNKNOWN_RULE:"규칙 미확인",RECHECK_AFTER_CHANGE:"전환·초기화 이후 재확인",CAREER_GATES_HELD_IN_SNAPSHOT:"현재 입력상 계급·훈장 충족",CAREER_GAP:"부족 조건 있음",CAREER_UNCONFIRMED:"미확인 조건 있음"};
   const section=document.createElement("section");
   section.className="bs-note";
   section.innerHTML='<h4>현재 대원 기준 고급 시술 부족 조건 계산</h4><p class="bs-sub">현재 완료한 시술 단계와 실제 계급, 훈장 보유 레벨 및 게임 일지 카운터를 입력하세요. 빈 값은 미확인, 훈장 -1은 미보유입니다. 훈장 레벨 0은 보유입니다. 입력은 브라우저에서만 사용하며 세이브나 원장을 변경하지 않습니다.</p><div class="bs-controls"><label>완료한 시술 단계<select data-career-after>'+options([[0,"0 · 시술 전"],...(w.steps||[]).flatMap(x=>Array.from({length:x.count??1},()=>x.id)).map((id,i)=>[i+1,(i+1)+" · "+label(id)+" 완료"])],0)+'</select></label><label>현재 계급 번호<input data-career-rank type="number" min="0" step="1" placeholder="미확인"></label></div>'+p.rows.map((r,i)=>'<fieldset class="bs-note"><legend>'+esc(r.name)+'</legend><div class="bs-controls"><label>실제 훈장 레벨<input type="number" min="-1" step="1" data-career-medal="'+i+'" placeholder="-1 미보유"></label>'+r.thresholds.map((t,j)=>'<label>'+esc(labels[t.field]||t.field)+'<input type="number" min="0" step="1" data-career-counter="'+i+':'+j+'" placeholder="미확인"></label>').join("")+'</div></fieldset>').join("")+'<button type="button" data-career-clear>입력 초기화</button><div data-career-result aria-live="polite"></div><p class="bs-sub">이 결과는 입력 시점의 조건 비교입니다. 실제 훈장 지급, 계급 승급, 연구·재료·능력치 요구, 시술 실행이나 이후 전환 가능성을 인증하지 않습니다.</p>';
   panel.append(section);
   const get=q=>section.querySelector(q);
   const integer=(el,min)=>{if(!el||el.value==="")return undefined;const n=Number(el.value);return Number.isSafeInteger(n)&&n>=min?n:undefined;};
   function draw(){
    const afterStep=Number(get("[data-career-after]").value),rank=integer(get("[data-career-rank]"),0),medals={},counters={};
    p.rows.forEach((r,i)=>{
     const level=integer(get('[data-career-medal="'+i+'"]'),-1);
     if(level!==undefined)medals[r.id]=level;
     counters[r.id]={};
     r.thresholds.forEach((t,j)=>{const v=integer(get('[data-career-counter="'+i+':'+j+'"]'),0);if(v!==undefined)counters[r.id][t.field]=v;});
    });
    const results=evaluateCareerMilestones(p,source,{afterStep,rank,medals,counters});
    get("[data-career-result]").innerHTML=results.stages.length?results.stages.map(s=>{
     const rankRow=s.rankGate?'<p>계급 '+fmt(s.rankGate.required)+' 필요 · '+esc(statuses[s.rankGate.status])+(s.rankGate.gap!=null&&s.rankGate.gap>0?' · '+fmt(s.rankGate.gap)+'단계 부족':"")+'</p>':"";
     const medalRows=s.medalGates.map(m=>'<tr><td>'+esc(m.name)+'</td><td>'+fmt(m.level)+'</td><td>'+(m.owned===-1?"미보유":fmt(m.owned))+'</td><td>'+m.thresholds.map(t=>esc(labels[t.field]||t.field)+': '+fmt(t.current)+' / '+fmt(t.required)+(t.gap!=null&&t.gap>0?' · '+fmt(t.gap)+' 부족':"")).join("<br>")+'</td><td>'+esc(statuses[m.status])+'</td></tr>').join("");
     return '<div class="bs-note"><h5>'+fmt(s.step)+'단계 · '+esc(label(s.id))+' — '+esc(statuses[s.status])+'</h5>'+rankRow+(medalRows?'<div class="bs-scroll"><table class="bs-table"><thead><tr><th>훈장</th><th>요구 레벨</th><th>보유 레벨</th><th>일지 현재 / 요구</th><th>판정</th></tr></thead><tbody>'+medalRows+'</tbody></table></div>':"")+'</div>';
    }).join(""):"<p>입력한 완료 단계 이후 등록된 계급·훈장 요구가 없습니다.</p>";
   }
   section.addEventListener("input",draw);section.addEventListener("change",draw);
   get("[data-career-clear]").addEventListener("click",()=>{get("[data-career-after]").value="0";section.querySelectorAll("input").forEach(el=>el.value="");draw();});
   draw();
  }
  function showWitness(id){
   const w=db.witnesses[id];if(!w)return;
   const route=routeName(w),ranked=w.history?db.historyEvidence?.[w.history]:null;
   const gate=w.historyResearch;
   const related=index.supportFor(id);
   const inside=view.scope.supportFor(id);
   const supportDetails='<div class="bs-note"><h4>이 경로를 참조하는 연구 분기</h4><p>현재 조회 범위 '+fmt(inside.length)+'개 / 전체 정확한 프로필 참조 '+fmt(related.length)+'개. '+(related.length?"동일 경로 ID가 해당 분기 프로필에 연결된 수입니다. 실제 플레이 가능성 입증은 아닙니다.":"전체 대표 경로의 정확한 분기 참조는 미연결입니다. 다른 분기 불가능을 뜻하지 않습니다.")+'</p>'+branchPicker(related.filter(b=>!E("bsExcludeConflict").checked||!index.branchMap.get(b).sourceRootConflict),"선택경로",id)+(related.length?'<details><summary>대표 분기와 직접 연결</summary>'+related.slice(0,20).map(branchId=>{const b=index.branchMap.get(branchId);return '<p><a href="'+esc(link("branch",b))+'">'+esc(branchName(b))+'</a> · <a href="'+esc(link("soldier",b,view.c.id,view.m,w.runtimeExact?null:id))+'">'+(w.runtimeExact?"이 분기의 병종 DB":"같은 육성 경로")+'</a> · '+esc(status(b))+'</p>';}).join("")+(related.length>20?'<p>나머지 분기는 위 선택기에서 조회합니다.</p>':"")+'</details>':"")+'</div>';

   const body=db.bodies?.[w.body];
   const cap=k=>db.stats.map(s=>body?.[k]?.[s]??null);
   const conditionRows=w.steps.map((x,i)=>{
    const trace=w.modeledStepStats?.[i];
    return '<tr><td>'+(i+1)+'</td><td>'+esc(label(x.id))+(x.count>1?" ×"+fmt(x.count):"")+'<small class="bs-sub">'+esc(x.id)+'</small></td><td>'+(w.growthBefore?.[i]===true?"전투 성장":w.growthBefore?.[i]===false?"성장 생략":"별도 배치")+'</td><td>'+esc(ruleConstraints(db.ruleDetails?.[x.id]))+'</td><td>'+(trace?.rawAfter?trace.rawAfter.map(fmt).join(" / "):"미연결")+'</td></tr>';
   }).join("");
   const history=ranked?'<p>연구 이력 <code>'+esc(ranked.id)+'</code> · 조건부 연구 '+fmt(ranked.steps)+'단계 · '+esc(ranked.kind)+'</p>':"";
   const replayedSuffix=w.careerSuffixReplay;
   const suffixDetail=["SUFFIX_REPLAYED_UNDER_ASSUMED_RANK","SUFFIX_REPLAYED_UNDER_ASSUMED_RANK_AND_MEDALS"].includes(replayedSuffix?.status)?'<div class="bs-note" data-career-suffix-replayed="true"><h4>계급·훈장 전제 하의 후속 시술 재생 결과</h4><p>실제 승급·누적 전투 기록·훈장 취득 미증명. 아래는 장기 상계가 아니라 기록된 조건부 수치입니다.</p>'+replayedSuffix.rankAssumptions.map(a=>'<p>'+esc(label(a.beforeTransform))+' · 계급 '+fmt(a.rank)+' ('+esc(label(a.rankId))+') 도달 가정'+(a.rankSource==="OXCE_8_7_1_DEFAULT_RANKS"?' · OXCE 8.7.1 기본 계급표 (보존 엔진 소스)':'')+'</p>').join("")+(replayedSuffix.medalAssumptions||[]).map(a=>'<p>'+esc(label(a.beforeTransform))+' · '+esc(label(a.medal))+' 장식 인덱스 '+fmt(a.decorationIndex)+' 보유 가정 · '+Object.entries(a.assumedCounters||{}).map(([k,n])=>esc(({totalStatGain:"누적 능력치 증가",killsWithCriteriaCareer:"조건 일치 처치",totalValientCrux:"기사 공적",totalMissions:"조건 일치 임무"})[k]||k)+' '+fmt(n)).join(" / ")+' · '+esc(label(a.bonusId))+' · 수여 미입증</p>').join("")+(replayedSuffix.combatGrowthAssumptions||[]).map(a=>{const k=a.stat||"melee",gain=a.missions.reduce((n,m)=>n+(m.gain??m.meleeGain),0);return '<p class="bs-warning">'+esc(label(a.beforeTransform))+' · '+esc(label(a.bodyAtStart))+' · 조건부 임무 후 '+esc(ko[k]||k)+' +'+fmt(gain)+(a.rawStart==null?'':' ('+fmt(a.rawStart)+' → '+fmt(a.rawEnd)+' / 요구 원시값 '+fmt(a.rawTarget)+' / 전투캡 '+fmt(a.combatCap)+')')+' · 경험 및 성장 추첨 가정 '+fmt(a.missions.length)+'회. 실제 임무·귀환 스크립트·성장 획득 미증명.</p>';}).join("")+'<div class="bs-scroll"><table class="bs-table"><thead><tr><th>구체적 재생 수치</th>'+db.stats.map(k=>'<th>'+esc(ko[k]||k)+'</th>').join("")+'</tr></thead><tbody>'+[["원시",replayedSuffix.raw],["시술·병종 보너스",replayedSuffix.bonus.map((v,i)=>v-(replayedSuffix.medalBonus?.[i]||0))],["훈장 보너스 (가정)",replayedSuffix.medalBonus||db.stats.map(()=>0)],["실효",replayedSuffix.effective]].map(([title,v])=>'<tr><th>'+title+'</th>'+v.map(n=>'<td>'+fmt(n)+'</td>').join("")+'</tr>').join("")+'</tbody></table></div><details><summary>후속 시술 전후 원시 능력치 및 계급</summary>'+replayedSuffix.steps.map(s=>'<p>'+esc(label(s.id))+' · '+esc(label(s.bodyBefore))+' → '+esc(label(s.bodyAfter))+' · 계급 '+fmt(s.rankBefore)+' → '+fmt(s.rankAfter)+'<br>원시 '+s.rawBefore.map(fmt).join(" / ")+' → '+s.rawAfter.map(fmt).join(" / ")+'</p>').join("")+'<p><code>'+esc(replayedSuffix.allRawActionsSHA256)+'</code></p></details></div>':"";
   const continuation=w.careerContinuation?'<p class="bs-note">기존 '+fmt(w.careerContinuation.seedDepth)+'단계 고급 육성 경로를 확장 · 추가 시술 '+esc(label(w.careerContinuation.appendedTransformation))+' · 전체 후속 순서 재생</p>':"";
   const suffixFailure=w.careerSuffixFailure?.status==="UNRESOLVED"?'<div class="bs-warning" data-career-suffix-unresolved="true"><b>후속 행동 재생 미해결 — 상계 후보로만 표시</b><p>'+[...new Set((w.careerSuffixFailure.failures||[]).map(f=>f.reason==="TARGET_ABOVE_PHYSICAL_TRAINING_HARD_CAP"?"목표 능력치가 현 재생기의 신체 훈련 상한을 초과함":f.reason))].map(esc).join(" / ")+'</p><p>이 경로의 달성 여부는 미확정이며, 해당 연구 분기의 다른 시술까지 불가능하다는 뜻은 아닙니다.</p></div>':"";
   const career=w.source==="CAREER12"?continuation+suffixFailure+'<p class="bs-warning">앞 '+fmt(w.replayedPrefixLength)+'회 시술과 추가 연구는 조건부 재생됨. '+(suffixDetail?"후속 시술은 명시적 계급·훈장 전제 하에 재생됨. 실제 승급·훈장 취득은 미증명.":"이후 계급·훈장 및 시술 미재생.")+' 훈장 자체 보너스는 상계에서 제외됩니다.</p>'+suffixDetail+'<ul>'+ (w.careerConditions||[]).map(c=>'<li>'+esc(label(c.transformation))+' · 계급 '+fmt(c.rank?.required)+(c.rank?.rankSource==="OXCE_8_7_1_DEFAULT_RANKS"?' · 기본 계급 '+esc(label(c.rank.rankId)):'')+' · 훈장 '+((c.medals||[]).map(m=>esc(label(m.id||m.medal||m.commendation||m.type))+' 레벨 '+fmt(m.decorationIndex??m.level??m.requiredLevel??m.required)+' (보유 필요)').join(" / ")||"요구 없음")+'</li>').join("")+'</ul>':"";
   E("bsWitness").innerHTML='<h3>선택 수치의 동일 경로</h3>'+(w.runtimeExact?'<p class="bs-warning">전체 완료 상태 검색으로 복원한 브라우저 임시 경로입니다. 호환 분기는 기존 정적 연구 위험 마스크를 통과한 범위입니다. 실제 연구 순서·계급·훈장 획득 및 성장의 공동 달성은 인증되지 않았습니다.</p>':"")+career+(w.source==="CAREER12"?'<div id="bsCareerMedalPlan"><p>훈장 규칙 연결 중…</p></div>':"")+'<p><strong>'+esc(modelLabels[w.source]||w.source)+'</strong> · '+esc(db.policies[w.source])+'</p><p>최종 병종 '+esc(label(w.body))+(w.originProfile?' · 출생 프로필 <code>'+esc(w.originProfile)+'</code>':"")+' · '+esc(route)+' · 성장 '+esc(w.placement)+'</p><p>요구 연구: '+list(w.research)+'</p>'+resourceDetails(id)+history+(w.history?researchExtensionDetail(w.history):"")+(gate?'<p>이력 종료 시 활성 연구: '+list(gate.active)+' · 미활성: '+list(gate.missing)+'</p>':"")+(w.requiredItems?.length?'<p>필요 아이템: '+list(w.requiredItems)+'</p>':"")+'<div class="bs-scroll"><table class="bs-table"><thead><tr><th>능력치</th>'+db.stats.map(k=>'<th>'+esc(ko[k]||k)+'</th>').join("")+'</tr></thead><tbody>'+[["생성 상단",cap("maxStats")],["전투 성장캡",w.rawCombatCaps||cap("statCaps")],["별도 훈련캡",w.trainingCaps||cap("trainingStatCaps")],["원시값",w.raw],["영구 보너스",w.bonus],["실효값",w.vector]].map(([t,v])=>'<tr><th>'+t+'</th>'+db.stats.map((_,i)=>'<td>'+fmt(v?.[i])+'</td>').join("")+'</tr>').join("")+'</tbody></table></div>'+(conditionRows?'<div class="bs-scroll"><table class="bs-table"><thead><tr><th>단계</th><th>훈련</th><th>직전 성장</th><th>요구 조건 및 증가 제한</th><th>시술 직후 원시 12능력치 (위 표 순서)</th></tr></thead><tbody>'+conditionRows+'</tbody></table></div>':"")+(w.bonusIds?.length?'<p>유지되는 별도 보너스: '+list(w.bonusIds)+'</p>':"")+'<p><small>원장 참조: '+esc(w.reference)+(w.graphRun?' · '+esc(w.graphRun)+' / '+fmt(w.graphNode):"")+' · 연구·시술·성장 실제 공동 달성 미인증.</small></p>'+supportDetails;
   const panel=E("bsCareerMedalPlan");
   if(panel)(modern?Promise.resolve(modern):loadRuntime(new URL("./data/soldiers-modern-index.json",import.meta.url).href)).then(source=>{if(panel.isConnected){panel.innerHTML=careerMedalMarkup(w,source);mountCareerProgress(panel,w,source);}}).catch(error=>{if(panel.isConnected)panel.textContent="훈장 규칙 연결 실패: "+error.message;});
  }
  ROOT.addEventListener("click",ev=>{
   const exact=ev.target.closest("[data-exact-witness]");if(exact){selectExactWitness(Number(exact.dataset.exactWitness));return;}
   const page=ev.target.closest("[data-exact-page]");if(page&&exactView){exactView.page+=Number(page.dataset.exactPage);updateExactPanel(view.scope,view.c,view.m);return;}
   const goal=ev.target.closest("[data-goal-witness]");if(goal){applyGoalPreset(goal.dataset.goalWitness);return;}
   const pick=ev.target.closest("[data-support-pick]");
   if(pick){const b=index.branchMap.get(E(pick.dataset.supportPick)?.value);if(!b)return;
    const id=pick.dataset.supportRoute||view.chosen;
    for(const [key] of branchFacets)E(key).value="";
    E("bsSearch").value="";selected=b;
    selectOptions();draw(false,id);return;
   }
   const button=ev.target.closest("[data-witness]");if(!button)return;const id=button.dataset.witness;
   if(view?.rows.includes(id)&&view.chosen!==id)draw(false,id);
   else if(view?.chosen===id)showWitness(id);
   else if(view?.ids.includes(id)){
    if(!targets.length&&!hasResourceFilters(resources)&&!E("bsStatFeeOnly").checked&&E("bsParetoMode").value==="off"&&!Number(E("bsMinDepth").value)&&E("bsEvidence").value==="all"){
     E("bsRouteSearch").value="";draw(false,id);
    }else{
     showWitness(id);E("bsWitness").insertAdjacentHTML("afterbegin",'<p class="bs-warning">비교용 독립 최고값 상세입니다. 현재 목표·검색·근거·비지배 필터로 선택된 경로 열은 바꾸지 않았습니다.</p>');
    }
   }
  });
  document.addEventListener("click",ev=>{const link=ev.target.closest("[data-integrated-cap-body]");if(!link)return;const body=link.dataset.integratedCapBody;if(db.combos.some(c=>c.id===body)){E("bsBody").value=body;selected=db.branches.find(b=>b.id===selectedUrl)||null;E("bsSearch").value="";const panel=document.getElementById("integratedCaps");if(panel?.tagName==="DETAILS")panel.open=true;E("bsResetFacets")?.click();E("bsClearTargets").click();E("bsRouteSearch").value="";E("bsMinDepth").value="0";E("bsRouteOrder").value="evidence";selectOptions();draw(true,link.dataset.integratedCapRoute||null);ROOT.scrollIntoView({block:"start"});}});
  if(location.hash==="#integratedCaps"||query.has("route")||query.has("minDepth")){const panel=document.getElementById("integratedCaps");if(panel?.tagName==="DETAILS")panel.open=true;}
  if(depthValues.has(query.get("minDepth")))E("bsMinDepth").value=query.get("minDepth");
  selectOptions();draw(true,query.get("route"));
  if(query.has("exactLabel")){
   const spec=exactResourceSpec(db,view.c.id,view.m,query.get("exactHash")),label=Number(query.get("exactLabel"));
   const fail=message=>{E("bsExactStatus").textContent=message;E("bsTargetPanel").open=true;};
   if(!spec||spec.sha256!==query.get("exactHash")||db.sourceMetadataSha256!==query.get("exactRules")||!/^\d+$/.test(query.get("exactLabel"))||!Number.isSafeInteger(label)||label>=spec.labels)fail("공유 경로의 원장 버전 또는 번호가 일치하지 않습니다.");
   else {const initialKey=exactKey;loadExactResourceIndex(db,view.c.id,view.m,spec.sha256).then(a=>{if(initialKey!==exactKey)return;selectExactWitness(label,a,spec.sha256);}).catch(e=>fail("공유 경로 복원 실패: "+e.message));}
  }
 }
 function mountBranch(){
  ROOT.innerHTML='<h2>분기별 병종 최대값</h2>'+overview()+pairSearchMarkup(db)+pairContinuationMarkup(db)+'<p>19개 말단은 현재 발견 범위이며 전체 분기 수의 확정이 아닙니다. 대의 미선택도 후보로 보존합니다. 기존 1,520개 경로 및 연구 원천 모델의 조건부 충돌 결과를 함께 연결했습니다.</p><div class="bs-controls"><label>분기 검색<input id="bsSearch" type="search" placeholder="선장 · 진로 · 대의 · 코덱스 · 번호"></label><label>병종<select id="bsBranchBody">'+options([["","전체 등록 병종"],...modern.soldiers.map(c=>[c.id,c.koName||c.id])],"")+'</select></label><label>연구 상태<select id="bsStatus">'+options([["all","전체"],["history","조건부 이력 있음"],["conflict","원천 충돌"],["unknown","이력 미확정"],["neutral","대의 미선택"]],"all")+'</select></label><button id="bsPrev" type="button">이전</button><button id="bsNext" type="button">다음</button></div>'+facetMarkup()+'<p id="bsCount"></p><div class="bs-scroll" id="bsTable"></div><div id="bsBranchDetail" class="bs-note" aria-live="polite"></div>'+sources();
  selected=db.branches.find(b=>b.id===selectedUrl)||null;let page=0;
  function filter(){
   const q=E("bsSearch").value.trim().toLowerCase(),s=E("bsStatus").value;
   return db.branches.filter(b=>matchesFacets(b)&&(!q||searchText(b).includes(q))&&(s==="all"||s==="history"&&b.historyCount||s==="conflict"&&b.sourceRootConflict||s==="unknown"&&!b.sourceRootConflict&&!b.historyCount||s==="neutral"&&b.neutralCause));
  }
  function detail(){
   E("bsBranchDetail").innerHTML=selected?branchDescription(selected)+'<p><a href="'+esc(link("soldier",selected))+'">이 분기의 병종 최종 상한과 훈련 순서 보기 →</a></p><h3>병종별 육성 후보</h3>'+bodyLinks(selected):"<p>분기를 선택하면 연구 순서, 보상, 차단 원인 및 병종 결과가 여기에 표시됩니다.</p>";
  }
  function draw(){
   const rows=filter(),perPage=E("bsBranchBody").value?40:10,pages=Math.max(1,Math.ceil(rows.length/perPage));page=Math.min(page,pages-1);
   E("bsCount").textContent=rows.length.toLocaleString("ko-KR")+"개 분기 · "+(page+1)+"/"+pages+" 페이지";
   E("bsPrev").disabled=page===0;E("bsNext").disabled=page+1>=pages;
   const bodies=modern.soldiers.filter(c=>!E("bsBranchBody").value||c.id===E("bsBranchBody").value);
   E("bsTable").innerHTML='<table class="bs-table"><thead><tr><th>분기</th><th>선장 이력</th><th>진로</th><th>대의</th><th>코덱스 / 여왕</th><th>연구 상태 / 성자</th><th>최종 병종</th><th>단일 경로 최고 합계</th>'+db.stats.map(k=>'<th>'+esc(ko[k]||k)+'</th>').join("")+'</tr></thead><tbody>'+rows.slice(page*perPage,page*perPage+perPage).flatMap(b=>buildBodyGrowthIndex(db,modern,db.stats,[],()=>false,{branchId:b.id}).filter(c=>bodies.some(x=>x.id===c.id)).map((c,j)=>{
    const maxima=c.maxima;
    const meta=j===0?'<td rowspan="'+bodies.length+'"><button type="button" class="bs-value" data-branch="'+esc(b.id)+'">#'+b.rank+'</button><small class="bs-sub"><a href="'+esc(link("soldier",b))+'">전체 병종표</a></small></td><td rowspan="'+bodies.length+'">'+list(b.captain)+'</td><td rowspan="'+bodies.length+'">'+esc(label(b.choices.path))+'</td><td rowspan="'+bodies.length+'">'+esc(label(b.choices.cause))+'</td><td rowspan="'+bodies.length+'">'+esc(label(b.choices.codex))+' / '+esc(label(b.choices.queen))+'</td><td rowspan="'+bodies.length+'">'+esc(status(b))+'<small class="bs-sub">이력 '+fmt(b.historyCount)+' · 성자 '+(b.saintBlockedByPussy?"PUSSY 이후 차단":"조건부")+'</small></td>':"";
    const cell=(m,v)=>{if(!m)return '<td>—</td>';const u=new URL(link("soldier",b,m.combo,"CAP_TARGET",m.route));if(m.source==="ORIGINEXT12"){u.searchParams.delete("route");u.searchParams.set("originExt",m.route);u.hash="originDetails";}else if(["POPEXT12","POPRESEARCH12","POPRESEARCHCHAIN12"].includes(m.source)){u.searchParams.delete("route");u.searchParams.set("profile",m.originProfile);u.searchParams.set("populationRoute",m.route);u.hash="originDetails";}return '<td><a href="'+esc(u.href)+'">'+fmt(v)+'</a><small class="bs-sub">'+(m.source==="POPRESEARCHCHAIN12"?"모집 후 연구·연속 시술":m.source==="POPRESEARCH12"?"모집 후 연구·시술 재생":m.source==="POPEXT12"?"모집 재생·후속":m.source==="ORIGINEXT12"?"관측 분기 일치·후속":m.source==="CAREER12"?"고급·미재생":"연결 상계")+'</small></td>';};
    return '<tr data-body-id="'+esc(c.id)+'" data-branch-id="'+esc(b.id)+'">'+meta+'<td>'+esc(c.name)+'</td>'+cell(c.best,c.best?.total)+db.stats.map(k=>cell(maxima[k],maxima[k]?.value)).join("")+'</tr>';
   })).join("")+'</tbody></table><p class="bs-sub">— 는 해당 분기에서 연결된 육성 경로 미계산입니다. 독립 최고값은 동일 대원으로 합산하지 않습니다.</p>';
  }
  if(selected){const i=filter().findIndex(b=>b.id===selected.id);if(i>=0)page=Math.floor(i/(E("bsBranchBody").value?40:10));}
  E("bsSearch").addEventListener("input",()=>{page=0;draw();});E("bsStatus").addEventListener("change",()=>{page=0;draw();});
  bindFacets(()=>{page=0;const rows=filter();if(selected&&!rows.includes(selected))selected=null;if(rows.length===1)selected=rows[0];draw();detail();});
  E("bsBranchBody").addEventListener("change",()=>{page=0;draw();});
  E("bsPrev").addEventListener("click",()=>{page=Math.max(0,page-1);draw();});E("bsNext").addEventListener("click",()=>{page++;draw();});
  ROOT.addEventListener("click",ev=>{const b=ev.target.closest("[data-branch]");if(!b)return;selected=db.branches.find(x=>x.id===b.dataset.branch);detail();});
  draw();detail();
 }
 async function load(){return loadBranchSoldierResults();}
 const init=async()=>{db=await load();if(db.schemaVersion!==1)throw Error("데이터 형식 불일치");if(ROOT.dataset.branchSoldierResults==="soldier")mountSoldier();else{modern=await loadRuntime(new URL("./data/soldiers-modern-index.json",import.meta.url).href);mountBranch();}};
 init().catch(e=>{ROOT.textContent="통합 연구 결과를 불러오지 못했습니다: "+e.message;});
}
