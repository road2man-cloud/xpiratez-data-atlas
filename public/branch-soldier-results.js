// One shared result reader for the existing Soldier and Branch DB pages.
// No standalone viewer or model tabs. Model distinctions are columns/evidence.
import {buildBranchRouteIndex,parseTargets,matchesTargets} from "./branch-soldier-query.js?v=20261124-origin-coverage-1";
import {loadBranchSoldierResults,routeActionCount} from "./branch-soldier-catalog.js?v=20261124-origin-coverage-1";
const ROOT=document.querySelector("[data-branch-soldier-results]");
if(ROOT){
 // One shared cached loader also serves the origin rows.
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const ko={tu:"행동력",stamina:"지구력",health:"체력",bravery:"용기",reactions:"반응",firing:"사격",throwing:"투척",strength:"근력",psiStrength:"부두 강도",psiSkill:"부두 기술",melee:"근접",mana:"마나"};
 const fmt=x=>x==null?"—":typeof x==="number"?x.toLocaleString("ko-KR"):esc(x);
 const E=id=>ROOT.querySelector("#"+id);
 const options=(list,sel)=>list.map(([v,label])=>'<option value="'+esc(v)+'"'+(v===sel?" selected":"")+'>'+esc(label)+'</option>').join("");
 let db,selected=null;
 const label=id=>id?(db.labels[id]||id):"미선택";
 const branchName=b=>"#"+b.rank+" · "+b.captain.map(label).join(" → ")+" / "+[b.choices.path,b.choices.cause,b.choices.codex,b.choices.queen].map(label).join(" / ");
 const searchText=b=>[b.id,b.rank,b.legacyKey,...b.captain,...Object.values(b.choices),branchName(b)].join(" ").toLowerCase();
 const status=b=>b.sourceRootConflict?"원천 조건 충돌":b.historyCount?"조건부 연구 이력 있음":"연구 이력 미확정";
 const list=ids=>(ids||[]).map(x=>'<span title="'+esc(x)+'">'+esc(label(x))+'</span>').join(" · ")||"없음";
 const link=(type,b,body=null,mode=null,route=null)=>{const u=new URL(type==="soldier"?"./soldiers/modern/":"./captains/",import.meta.url);if(b)u.searchParams.set("branch",b.id);if(type==="soldier"){if(body)u.searchParams.set("body",body);if(mode)u.searchParams.set("mode",mode);if(route)u.searchParams.set("route",route);}u.hash=type==="soldier"?"integratedCaps":"integratedBranches";return u.href;};
 const query=new URL(location.href).searchParams,selectedUrl=query.get("branch"),selectedBody=query.get("body");
 const sources=()=>'<details class="bs-note"><summary>계산 근거 및 작업자별 원장 출처</summary><p>병종·분기 DB가 동일한 원장을 읽습니다. '+fmt(db.catalog.filter(x=>x.integrated).length)+'개 결과의 구조화 데이터와 '+fmt(db.summary.inventoryReports)+'개 발견된 연구 파일 목록을 관리합니다. 미연결 파일은 현재 수치에 합산하지 않습니다. 원본 실험 파일은 보존합니다.</p><ul>'+Object.entries(db.sources).map(([id,x])=>'<li><code>'+esc(id)+'</code> · '+esc(x.file)+'</li>').join("")+'</ul><p>'+Object.values(db.policies).map(esc).join("<br>")+'</p></details>';
 const overview=()=>'<p class="bs-summary">현재 정적 분기 후보 <b>'+fmt(db.summary.staticCandidates)+'</b>개 · 선장 말단 후보 '+fmt(db.summary.knownCaptainLeaves)+'개 · 대의 미선택 '+fmt(db.summary.neutralCauseCandidates)+'개 · 조건부 연구 이력 보유 '+fmt(db.summary.historiesAcceptedParents)+'개 · 원천 충돌 '+fmt(db.summary.sourceConflictCandidates)+'개 · 통합 조건부 육성 경로 <b>'+fmt(db.summary.unifiedConditionalTrainingPaths)+'</b>개 · 연결 경로 대표 '+fmt(db.summary.frontierWitnesses)+'개 · 실제 게임 전체 최적 인증 0건.</p>';
 const branchPaths=(b,cls)=>db.profiles[b?.evidence?.[cls]?.unified]?.conditionalPaths??null;
 const bodyEvidence=(b,c,mode="CAP_TARGET")=>{
  const e=b?b.evidence[c.classKey]:db.globalEvidence[c.classKey];
  return {unified:db.profiles[e?.unifiedByBody?.[c.body]],continuation:db.profiles[e?.continuationByBody?.[c.body]?.[mode]]};
 };
 const bodyLinks=b=>db.combos.map(c=>{
  const {unified:u,continuation:v}=bodyEvidence(b,c);
  if(!u&&!v)return "";
  return '<p><a href="'+esc(link("soldier",b,c.id))+'">'+esc(c.title)+'</a> · '+(u?'조건부 재생 경로 '+fmt(u.conditionalPaths)+'개':"행동 재생 미연결")+(v?' · 구조적 파레토 '+fmt(v.count)+'개':"")+'</p>';
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
  return '<h3>'+esc(branchName(b))+'</h3><p><b>'+esc(status(b))+'</b> · 조건부 연구 이력 '+fmt(b.historyCount)+'개. '+(b.sourceRootConflict?"현재 원천 모델의 충돌이며 모든 우회 경로를 배제한 불가능 증명이 아닙니다.":"연구 이력은 실제 게임 진행·훈련 인증이 아닙니다.")+'</p><p>'+esc(saint)+'</p><p>원천 충돌 연구: '+list(b.blockedRoots)+' · 조건부 차단 훈련 연구: '+list(b.blockedResearch)+'</p>'+(b.chronology?'<p>연구 순서 조건부 재생: '+(b.chronology.root?"뿌리 연구 통과":"미완결")+' · 주요 병목 '+esc(label(b.chronology.blocker))+'</p>':'<p>1,520개 이전 연구 순서 모델의 직접 대응 없음.</p>')+rootConflictDetail(b)+branchExtensionDetails(b)+detail;
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
 const modelLabels={UNIFIED12:"연구·출생·훈련 연결 상계",GATE12:"시술 시점 조건 검사",REPLAY8:"동일 연구 이력",SOURCE8:"연구 원천 호환",CONTINUATION12:"최대 8단계 구조적 확장"};
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
 function targetsMarkup(){
  return '<details class="bs-note bs-targets" id="bsTargetPanel"><summary>동시 목표 능력치 · 같은 대원에서 만족하는 경로 찾기</summary><p class="bs-sub">실효 능력치 최소값을 입력하세요. 비어 있는 능력치는 제한하지 않습니다. 미계산 값은 목표 달성으로 인정하지 않습니다.</p><div class="bs-target-grid">'+db.stats.map((k,i)=>'<label>'+esc(ko[k]||k)+'<input id="bsTarget'+i+'" data-target-index="'+i+'" type="number" min="0" step="1" inputmode="numeric" placeholder="제한 없음"></label>').join("")+'</div><div class="bs-controls"><label>경로 근거 범위<select id="bsEvidence">'+options([["all","모든 모델 (서로 분리)"],...Object.entries(modelLabels).map(([id,title])=>[id,title])],"all")+'</select></label><label class="bs-inline-check"><input type="checkbox" id="bsExcludeConflict">원천 충돌 분기 제외</label><button type="button" id="bsApplyTargets">목표 적용</button><button type="button" id="bsClearTargets">목표 초기화</button></div><p id="bsTargetStatus" aria-live="polite" class="bs-sub"></p></details>';
 }
 function mountSoldier(){
  ROOT.innerHTML='<h2>영애·미치광이 최종 성장 상한</h2>'+overview()+'<p>하나의 육성 경로를 선택하면 12개 능력치가 같은 경로의 벡터로 표시됩니다. 우측 독립 최고값은 서로 다른 연구·성장 가정의 비교 근거이며 한 대원의 능력치로 합산하지 않습니다.</p><div class="bs-controls"><label>연구 분기 검색<input id="bsSearch" type="search" placeholder="선장 · 진로 · 코덱스 · 번호"></label><label>연구 분기<select id="bsBranch"></select></label><label>출발 → 최종 병종<select id="bsBody">'+options(db.combos.map(c=>[c.id,c.title]),"D_W")+'</select></label><label>전투 성장<select id="bsMode">'+options([["CAP_TARGET","전투캡까지"],["EXP_OVERSHOOT_UPPER","마지막 성장 초과 상단"]],"CAP_TARGET")+'</select></label></div>'+facetMarkup()+targetsMarkup()+'<div class="bs-controls"><label>훈련 순서 검색<input id="bsRouteSearch" type="search" placeholder="훈련명 · ID · 연구명"></label><label>최소 시술 횟수<select id="bsMinDepth">'+options([["0","제한 없음"],["5","5회 이상"],["6","6회 이상"],["7","7회 이상"],["8","8회 이상"]],"0")+'</select></label><label>경로 우선 정렬<select id="bsRouteOrder">'+options([["evidence","연구 근거 우선"],["margin","동시 목표 최소 여유율"],...db.stats.map(k=>[k,ko[k]||k]),["short","훈련 횟수 적은 순"],["long","훈련 횟수 많은 순"]],"evidence")+'</select></label><label class="bs-route-select">통합 육성 후보<select id="bsRoute"></select></label></div><div class="bs-controls bs-route-pages"><button id="bsRoutePrev" type="button">이전 경로</button><span id="bsRoutePage"></span><button id="bsRouteNext" type="button">다음 경로</button></div><p id="bsContext"></p><p id="bsRouteCount" class="bs-sub"></p><div id="bsMatchingBranches"></div><div id="bsTable" class="bs-scroll"></div><div id="bsWitness" class="bs-note" aria-live="polite"></div><div id="bsOrigin"></div>'+sources();
  selected=db.branches.find(b=>b.id===selectedUrl)||null;
  const bodyUrl=new URL(location.href).searchParams.get("body");
  if(db.combos.some(c=>c.id===bodyUrl))E("bsBody").value=bodyUrl;
  const pref={UNIFIED12:0,REPLAY8:1,GATE12:2,CONTINUATION12:3,SOURCE8:4};
  let view=null,targets=[],indexKey="",index=null,scopeKey="",scoped=null,routePage=0;
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
  function applyTargets(){
   try{targets=parseTargets(db.stats,db.stats.map((_,i)=>E("bsTarget"+i).value));}
   catch(err){E("bsTargetStatus").textContent=err.message;return;}
   draw(true);
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
   const evidenceIds=ids.filter(id=>evidence==="all"||db.witnesses[id].source===evidence);
   const rows=evidenceIds.filter(id=>{const w=db.witnesses[id];return routeActionCount(w)>=minDepth&&matchesTargets(w,targets)&&(!q||[routeName(w),...w.steps.map(x=>x.id),...(w.research||[]).map(label),...(w.research||[]),w.originProfile,modelLabels[w.source]].join(" ").toLowerCase().includes(q));});
   const count=routeActionCount;
   rows.sort((a,b)=>{const x=db.witnesses[a],y=db.witnesses[b];
    const defaultOrder=(pref[x.source]??9)-(pref[y.source]??9);
    if(statIndex>=0)return (y.vector[statIndex]??-Infinity)-(x.vector[statIndex]??-Infinity)||defaultOrder||count(x)-count(y)||a.localeCompare(b);
    if(order==="margin"&&targets.length)return margin(y)-margin(x)||defaultOrder||count(x)-count(y)||a.localeCompare(b);
    if(order==="short")return count(x)-count(y)||defaultOrder||a.localeCompare(b);
    if(order==="long")return count(y)-count(x)||defaultOrder||a.localeCompare(b);
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
    return [id,(routePage*PAGE_SIZE+i+1)+". "+(modelLabels[w.source]||w.source)+" · "+fmt(count(w))+"회 시술 · "+(statIndex>=0?(ko[order]||order)+" "+fmt(v)+" · ":"")+routeName(w)];});
   routeSelect.innerHTML=options([["maxima","독립 최고값만 비교 (동일 경로 아님)"],...routeOptions],chosen);
   routeSelect.disabled=!rows.length;
   E("bsRoutePage").textContent=(routePage+1)+" / "+pageCount+" 페이지";
   E("bsRoutePrev").disabled=routePage===0;E("bsRouteNext").disabled=routePage>=pageCount-1;
   const matching=scope.matchingBranches(rows);
   view={c,m,cols,ids,rows,chosen,scope};
   const w=db.witnesses[chosen],body=db.bodies?.[c.body]||{},targetMap=new Map(targets);
   E("bsContext").innerHTML=(selected?esc(branchName(selected))+" · "+esc(status(selected))+" · 연구 이력 "+fmt(selected.historyCount)+"개":"전체 또는 선택 조건의 분기별 전선 조회")+' · 조회 분기 '+fmt(scope.branchCount)+'개'+(selected?' · <a href="'+esc(link("branch",selected))+'">이 분기의 연구·보상·상호배제</a>':' · <a href="'+esc(link("branch",null))+'">분기 DB</a>')+(!p?" · 12능력치 모델 미연결":"")+(selected?.sourceRootConflict?' <strong class="bs-warning">원천 충돌 분기 — 수치 후보를 실제 가능으로 간주하지 않음</strong>':"");
   const targetText=targets.map(([i,min])=>(ko[db.stats[i]]||db.stats[i])+" ≥ "+fmt(min)).join(" · ");
   const breakdown=Object.keys(modelLabels).map(source=>{
    const own=rows.filter(id=>db.witnesses[id].source===source);
    return own.length?modelLabels[source]+" "+fmt(own.length)+"경로 / "+fmt(scope.matchingBranches(own).length)+"분기":null;
   }).filter(Boolean).join(" · ");
   E("bsTargetStatus").textContent=(targetText?"적용 목표: "+targetText:"능력치 목표 없음")+" · 조건에 맞는 경로 "+fmt(rows.length)+"개 / 정확한 분기 프로필 참조 "+fmt(matching.length)+"개. "+(!rows.length?"현재 연결된 후보에서 일치 없음. 실제 게임 불가능을 뜻하지 않습니다.":"실제 동시 달성 인증은 아닙니다.")+(breakdown?" 모델별: "+breakdown+" (분기 중복 가능).":"");
   const maxDepth=rows.reduce((n,id)=>Math.max(n,count(db.witnesses[id])),0);
   const depthCounts=[5,6,7,8].map(n=>n+"회 이상 "+fmt(rows.filter(id=>count(db.witnesses[id])>=n).length)+"개").join(" · ");
   E("bsRouteCount").textContent="조회 경로 대표 "+fmt(ids.length)+"개 / 검색·목표 만족 "+fmt(rows.length)+"개 · 분기 프로필 참조 "+fmt(matching.length)+"개"+(rows.length?" · 최장 "+maxDepth+"회 (반복 포함) · "+depthCounts:"")+(w?" · 선택 "+count(w)+"회 시술 · "+(modelLabels[w.source]||w.source):" · 독립 최대값만 표시");
   E("bsMatchingBranches").innerHTML=(targets.length||minDepth||q||evidence!=="all")?(breakdown?'<p class="bs-sub">'+esc(breakdown)+' (분기 중복 가능)</p>':"")+(matching.length&&!selected?branchPicker(matching,"목표일치"):""):"";
   E("bsTable").innerHTML='<table class="bs-table"><thead><tr><th rowspan="2">능력치</th><th colspan="3">최종 병종 룰셋 기준</th><th rowspan="2" class="bs-chosen">선택 경로<small class="bs-sub">실효 (원시 + 보너스)</small></th><th colspan="'+cols.length+'">조회 분기 내 모델별 독립 최고 후보 — 같은 대원이 아님</th></tr><tr><th>생성 상단</th><th>전투캡</th><th>훈련캡</th>'+cols.map(col=>'<th>'+esc(col.label)+'<small class="bs-sub">참조 경로 '+fmt(col.ids.length)+'개 · 분기 '+fmt(col.coveredBranches)+'개</small></th>').join("")+'</tr></thead><tbody>'+db.stats.map((k,i)=>{
    const target=targetMap.get(i),hasTarget=targetMap.has(i),v=w?.vector[i];
    const marker=hasTarget?'<small class="bs-sub">목표 ≥ '+fmt(target)+(w?" · "+(Number.isFinite(v)&&v>=target?"충족":"미충족/미계산"):"")+'</small>':"";
    const selectedCell=w&&Number.isFinite(v)?valueCell(null,i,chosen).replace("<td>","<td class=\"bs-chosen\">"):'<td class="bs-chosen">—</td>';
    return '<tr><th>'+esc(ko[k]||k)+marker+'</th><td>'+fmt(body.maxStats?.[k])+'</td><td>'+fmt(body.statCaps?.[k])+'</td><td>'+fmt(body.trainingStatCaps?.[k])+'</td>'+selectedCell+cols.map(col=>col.best[i]?valueCell(null,i,col.best[i]):"<td>—</td>").join("")+'</tr>';
   }).join("")+'</tbody></table><p class="bs-sub">— 는 미계산·미연결이며 0이 아닙니다. 생성 상단·전투캡·훈련캡은 서로 다릅니다. 8능력치 모델의 용기·부두·마나는 미계산입니다. 우측 독립 최고값은 목표/경로 검색을 적용하지 않은 조회 분기 내 참고값입니다. 통합 육성·8능력치 연구 모델은 자체 성장 가정을 유지합니다.</p>';
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
  E("bsClearTargets").addEventListener("click",()=>{for(let i=0;i<db.stats.length;i++)E("bsTarget"+i).value="";targets=[];E("bsEvidence").value="all";E("bsExcludeConflict").checked=false;E("bsMinDepth").value="0";draw(true);});
  E("bsEvidence").addEventListener("change",()=>draw(true));
  E("bsExcludeConflict").addEventListener("change",()=>draw(true));
  E("bsRoutePrev").addEventListener("click",()=>{routePage--;draw(false,null,true);});
  E("bsRouteNext").addEventListener("click",()=>{routePage++;draw(false,null,true);});
  E("bsTargetPanel").addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.matches("[data-target-index]")){e.preventDefault();applyTargets();}});

  function showWitness(id){
   const w=db.witnesses[id];if(!w)return;
   const route=routeName(w),ranked=w.history?db.historyEvidence?.[w.history]:null;
   const gate=w.historyResearch;
   const related=index.supportFor(id);
   const inside=view.scope.supportFor(id);
   const supportDetails='<div class="bs-note"><h4>이 경로를 참조하는 연구 분기</h4><p>현재 조회 범위 '+fmt(inside.length)+'개 / 전체 정확한 프로필 참조 '+fmt(related.length)+'개. '+(related.length?"동일 경로 ID가 해당 분기 프로필에 연결된 수입니다. 실제 플레이 가능성 입증은 아닙니다.":"전체 대표 경로의 정확한 분기 참조는 미연결입니다. 다른 분기 불가능을 뜻하지 않습니다.")+'</p>'+branchPicker(related.filter(b=>!E("bsExcludeConflict").checked||!index.branchMap.get(b).sourceRootConflict),"선택경로",id)+(related.length?'<details><summary>대표 분기와 직접 연결</summary>'+related.slice(0,20).map(branchId=>{const b=index.branchMap.get(branchId);return '<p><a href="'+esc(link("branch",b))+'">'+esc(branchName(b))+'</a> · <a href="'+esc(link("soldier",b,view.c.id,view.m,id))+'">같은 육성 경로</a> · '+esc(status(b))+'</p>';}).join("")+(related.length>20?'<p>나머지 분기는 위 선택기에서 조회합니다.</p>':"")+'</details>':"")+'</div>';

   const body=db.bodies?.[w.body];
   const cap=k=>db.stats.map(s=>body?.[k]?.[s]??null);
   const conditionRows=w.steps.map((x,i)=>{
    const trace=w.modeledStepStats?.[i];
    return '<tr><td>'+(i+1)+'</td><td>'+esc(label(x.id))+(x.count>1?" ×"+fmt(x.count):"")+'<small class="bs-sub">'+esc(x.id)+'</small></td><td>'+(w.growthBefore?.[i]===true?"전투 성장":w.growthBefore?.[i]===false?"성장 생략":"별도 배치")+'</td><td>'+esc(ruleConstraints(db.ruleDetails?.[x.id]))+'</td><td>'+(trace?.rawAfter?trace.rawAfter.map(fmt).join(" / "):"미연결")+'</td></tr>';
   }).join("");
   const history=ranked?'<p>연구 이력 <code>'+esc(ranked.id)+'</code> · 조건부 연구 '+fmt(ranked.steps)+'단계 · '+esc(ranked.kind)+'</p>':"";
   E("bsWitness").innerHTML='<h3>선택 수치의 동일 경로</h3><p><strong>'+esc(modelLabels[w.source]||w.source)+'</strong> · '+esc(db.policies[w.source])+'</p><p>최종 병종 '+esc(label(w.body))+(w.originProfile?' · 출생 프로필 <code>'+esc(w.originProfile)+'</code>':"")+' · '+esc(route)+' · 성장 '+esc(w.placement)+'</p><p>요구 연구: '+list(w.research)+'</p>'+history+(w.history?researchExtensionDetail(w.history):"")+(gate?'<p>이력 종료 시 활성 연구: '+list(gate.active)+' · 미활성: '+list(gate.missing)+'</p>':"")+(w.requiredItems?.length?'<p>필요 아이템: '+list(w.requiredItems)+'</p>':"")+'<div class="bs-scroll"><table class="bs-table"><thead><tr><th>능력치</th>'+db.stats.map(k=>'<th>'+esc(ko[k]||k)+'</th>').join("")+'</tr></thead><tbody>'+[["생성 상단",cap("maxStats")],["전투 성장캡",w.rawCombatCaps||cap("statCaps")],["별도 훈련캡",w.trainingCaps||cap("trainingStatCaps")],["원시값",w.raw],["영구 보너스",w.bonus],["실효값",w.vector]].map(([t,v])=>'<tr><th>'+t+'</th>'+db.stats.map((_,i)=>'<td>'+fmt(v?.[i])+'</td>').join("")+'</tr>').join("")+'</tbody></table></div>'+(conditionRows?'<div class="bs-scroll"><table class="bs-table"><thead><tr><th>단계</th><th>훈련</th><th>직전 성장</th><th>요구 조건 및 증가 제한</th><th>시술 직후 원시 12능력치 (위 표 순서)</th></tr></thead><tbody>'+conditionRows+'</tbody></table></div>':"")+(w.bonusIds?.length?'<p>유지되는 별도 보너스: '+list(w.bonusIds)+'</p>':"")+'<p><small>원장 참조: '+esc(w.reference)+(w.graphRun?' · '+esc(w.graphRun)+' / '+fmt(w.graphNode):"")+' · 연구·시술·성장 실제 공동 달성 미인증.</small></p>'+supportDetails;
  }
  ROOT.addEventListener("click",ev=>{
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
    if(!targets.length&&!Number(E("bsMinDepth").value)&&E("bsEvidence").value==="all"){
     E("bsRouteSearch").value="";draw(false,id);
    }else{
     showWitness(id);E("bsWitness").insertAdjacentHTML("afterbegin",'<p class="bs-warning">비교용 독립 최고값 상세입니다. 현재 목표·검색·근거 조건을 만족하는 선택 경로 열은 바꾸지 않았습니다.</p>');
    }
   }
  });
  document.addEventListener("click",ev=>{const link=ev.target.closest("[data-integrated-cap-body]");if(!link)return;const body=link.dataset.integratedCapBody;if(db.combos.some(c=>c.id===body)){E("bsBody").value=body;selected=null;E("bsSearch").value="";E("bsResetFacets")?.click();E("bsClearTargets").click();E("bsRouteSearch").value="";E("bsMinDepth").value="0";E("bsRouteOrder").value="evidence";selectOptions();draw(true,link.dataset.integratedCapRoute||null);ROOT.scrollIntoView({block:"start"});}});
  if(["5","6","7","8"].includes(query.get("minDepth")))E("bsMinDepth").value=query.get("minDepth");
  selectOptions();draw(true,query.get("route"));
 }
 function mountBranch(){
  ROOT.innerHTML='<h2>전체 선장·진로·대의·코덱스·여왕 분기</h2>'+overview()+'<p>19개 말단은 현재 발견 범위이며 전체 분기 수의 확정이 아닙니다. 대의 미선택도 후보로 보존합니다. 기존 1,520개 경로 및 연구 원천 모델의 조건부 충돌 결과를 함께 연결했습니다.</p><div class="bs-controls"><label>분기 검색<input id="bsSearch" type="search" placeholder="선장 · 진로 · 대의 · 코덱스 · 번호"></label><label>연구 상태<select id="bsStatus">'+options([["all","전체"],["history","조건부 이력 있음"],["conflict","원천 충돌"],["unknown","이력 미확정"],["neutral","대의 미선택"]],"all")+'</select></label><button id="bsPrev" type="button">이전</button><button id="bsNext" type="button">다음</button></div>'+facetMarkup()+'<p id="bsCount"></p><div class="bs-scroll" id="bsTable"></div><div id="bsBranchDetail" class="bs-note" aria-live="polite"></div>'+sources();
  selected=db.branches.find(b=>b.id===selectedUrl)||null;let page=0;
  function filter(){
   const q=E("bsSearch").value.trim().toLowerCase(),s=E("bsStatus").value;
   return db.branches.filter(b=>matchesFacets(b)&&(!q||searchText(b).includes(q))&&(s==="all"||s==="history"&&b.historyCount||s==="conflict"&&b.sourceRootConflict||s==="unknown"&&!b.sourceRootConflict&&!b.historyCount||s==="neutral"&&b.neutralCause));
  }
  function detail(){
   E("bsBranchDetail").innerHTML=selected?branchDescription(selected)+'<p><a href="'+esc(link("soldier",selected))+'">이 분기의 병종 최종 상한과 훈련 순서 보기 →</a></p><h3>병종별 육성 후보</h3>'+bodyLinks(selected):"<p>분기를 선택하면 연구 순서, 보상, 차단 원인 및 병종 결과가 여기에 표시됩니다.</p>";
  }
  function draw(){
   const rows=filter(),pages=Math.max(1,Math.ceil(rows.length/40));page=Math.min(page,pages-1);
   E("bsCount").textContent=rows.length.toLocaleString("ko-KR")+"개 분기 · "+(page+1)+"/"+pages+" 페이지";
   E("bsPrev").disabled=page===0;E("bsNext").disabled=page+1>=pages;
   E("bsTable").innerHTML='<table class="bs-table"><thead><tr><th>분기</th><th>선장 이력</th><th>진로</th><th>대의</th><th>코덱스 / 여왕</th><th>연구 상태</th><th>혼돈의 성자</th><th>병종 상한</th></tr></thead><tbody>'+rows.slice(page*40,page*40+40).map(b=>'<tr><td><button type="button" class="bs-value" data-branch="'+esc(b.id)+'">#'+b.rank+'</button></td><td>'+list(b.captain)+'</td><td>'+esc(label(b.choices.path))+'</td><td>'+esc(label(b.choices.cause))+'</td><td>'+esc(label(b.choices.codex))+' / '+esc(label(b.choices.queen))+'</td><td>'+esc(status(b))+'<small class="bs-sub">이력 '+fmt(b.historyCount)+'</small></td><td>'+(b.saintBlockedByPussy?"PUSSY 이후 차단":"조건부")+'</td><td><a href="'+esc(link("soldier",b))+'">비교</a><small class="bs-sub">영애 '+fmt(branchPaths(b,"damsel"))+' / 미치광이 '+fmt(branchPaths(b,"madgal"))+' 경로</small></td></tr>').join("")+'</tbody></table>';
  }
  if(selected){const i=filter().findIndex(b=>b.id===selected.id);if(i>=0)page=Math.floor(i/40);}
  E("bsSearch").addEventListener("input",()=>{page=0;draw();});E("bsStatus").addEventListener("change",()=>{page=0;draw();});
  bindFacets(()=>{page=0;const rows=filter();if(selected&&!rows.includes(selected))selected=null;if(rows.length===1)selected=rows[0];draw();detail();});
  E("bsPrev").addEventListener("click",()=>{page=Math.max(0,page-1);draw();});E("bsNext").addEventListener("click",()=>{page++;draw();});
  ROOT.addEventListener("click",ev=>{const b=ev.target.closest("[data-branch]");if(!b)return;selected=db.branches.find(x=>x.id===b.dataset.branch);detail();});
  draw();detail();
 }
 async function load(){return loadBranchSoldierResults();}
 const init=async()=>{db=await load();if(db.schemaVersion!==1)throw Error("데이터 형식 불일치");if(ROOT.dataset.branchSoldierResults==="soldier")mountSoldier();else mountBranch();};
 init().catch(e=>{ROOT.textContent="통합 연구 결과를 불러오지 못했습니다: "+e.message;});
}
