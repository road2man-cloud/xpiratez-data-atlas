import {careerFrontierMarkup,careerFrontierOriginMarkup} from "./branch-soldier-career-frontier.js?v=20261125-career-frontier-3";
import {growthReplayCoverage,growthReplayMarkup,growthReplayBranchMarkup,growthReplayOriginMarkup} from "./branch-soldier-growth-replay.js?v=20261125-pop-growth-career-v2";
import {chronologicalCareerCoverage,chronologicalCareerMarkup,chronologicalCareerBranchMarkup,chronologicalCareerOriginMarkup} from "./branch-soldier-chronological-career.js?v=20261125-pop-career-scheduler-3";
import {assumedBirthCoverage,assumedBirthMarkup,assumedBirthBranchMarkup,assumedBirthOriginMarkup} from "./branch-soldier-assumed-birth.js?v=20261125-pop-assumed-birth-4";
// Shared coverage and route-level evidence for the population search.
// These are a finite numerical model, not certified campaign routes.
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=v=>Number.isFinite(v)?v.toLocaleString("ko-KR",{maximumFractionDigits:2}):"—";
const total=w=>w.vector.reduce((n,x)=>n+x,0);
const names=["미탐색·추가 연구 필요","기존 조건부 경로 확보","제한 모델 계산 재사용","제한 모델 직접 계산","공동 모집 연구 재생","추가 모집 연구·출생 재생","이벤트 출생 시간순 재생"];
const vOf=db=>db?.populationSearch?.versions?.[db.populationSearch.latest];
function routeLink(pid,branch=null,route=null){
 const u=new URL("./soldiers/modern/",import.meta.url);
 u.searchParams.set("profile",pid);
 if(branch)u.searchParams.set("branch",branch);
 if(route)u.searchParams.set("populationRoute",route);
 u.hash="originDetails";return esc(u.href);
}
function branchLink(id){
 const u=new URL("./captains/",import.meta.url);u.searchParams.set("branch",id);u.hash="integratedBranches";return esc(u.href);
}
export function populationCoverageText(db){
 const v=vOf(db);if(!v)return "";
 const s=v.summary,c=s.statusCounts,b=s.benchmark,j=db.populationJointCoverage,cs=j?.counts,cl=db.populationClosure?.summary;
 const ac=db.populationAntichain?.summary,rb=db.populationRandomBox?.summary;
 const proof=cl?" 전역 완전 판정 "+fmt(cl.fullCompleted)+"/"+fmt(cl.pairCount)+" ("+pct(cl.fullCompleted/cl.pairCount)+") · "+(rb?"출생 범위·무작위 증가량·부분 성장 포함 파레토 증명 "+fmt(rb.limitedClosed)+"쌍 · "+fmt(rb.certifiedGroups)+"/"+fmt(rb.groups)+"그룹 · 새 우위 후보 "+fmt(rb.improvedPairs)+"쌍.":ac?"부분 성장 포함 무깊이 파레토 증명 "+fmt(ac.limitedClosed)+"쌍 · "+fmt(ac.certifiedGroups)+"/"+fmt(ac.groups)+"그룹.":"제한모형 무깊이 폐쇄 "+fmt(cl.limitedClosed)+"쌍 · 미종결 "+fmt(cl.openGroups)+"그룹."):"";
 if(j&&cs){
  const u=db.originUnlockSearch?.summary,t=db.originUnlockContinuation?.summary,x=db.summary.originExtendedContinuation,y=db.summary.originResearchContinuation,z=db.summary.originResearchChain;
  return assumedBirthCoverage(db)+growthReplayCoverage(db)+chronologicalCareerCoverage(db)+proof+" 전체 "+fmt(s.pairCount)+"쌍 · 중복 제외 근거 확보 "+fmt(j.uniqueCovered)+"쌍 ("+fmt(j.uniqueCovered/s.pairCount*100)+"%) · 미탐색 "+fmt(cs.unexplored)+"쌍 · 기존 조건부 "+fmt(cs.conditionalPath)+"쌍 · 공동 모집 "+fmt(cs.jointBirth)+"쌍 · 추가 연구·모집 "+fmt(cs.chronologicalUnlock)+"쌍 · 이벤트 출생 "+fmt(cs.eventBirth??0)+"쌍 · 제한 재사용 "+fmt(cs.limitedReused)+"쌍 / 직접 "+fmt(cs.limitedDirect)+"쌍. 추가 모집 "+fmt(u?.registeredOrigins)+"출생처·"+fmt(u?.registeredBranches)+"분기, 종전 수치모형 밖 "+fmt(u?.unlockOutsideModel)+"쌍. 이벤트 "+fmt(db.originEventBirth?.summary?.registeredOrigins??0)+"출생처 · "+fmt(db.originEventBirth?.summary?.registeredVariants??0)+"개 시간순 대안. 후속 시술 "+fmt(t?.registeredRoutes)+"경로 · 중간 성장 없는 제한 D"+(t?.depth??0)+" 계산 완료 "+fmt(t?.completedPairs)+"쌍."+(x?" 통합 모집·이벤트 후속 "+fmt(x.published)+"경로 · D"+fmt(x.requestedDepth??4)+" 제한 완료 "+fmt(x.completedInputs)+"/"+fmt(Object.keys(db.originUnlockSearch?.pairs||{}).length+Object.keys(db.originEventBirth?.variants||{}).length)+"입력 · 독립 재생 복구 "+fmt(x.birthReceipts??0)+"경로 · 격리 "+fmt(x.quarantined??0)+"경로.":"")+(y?" 모집 후 추가 연구·시술 "+fmt(y.registeredRoutes)+"경로 / "+fmt(y.registeredBranches)+"분기 / "+fmt(y.registeredOrigins)+"출생처.":"")+(z?" 연구 후 연속 시술 "+fmt(z.registeredRoutes)+"경로 · 2차 연구 "+fmt(z.secondaryResearchRoutes)+"경로 · 고정 연구 D"+fmt(z.requestedDepth)+" 완료 "+fmt(z.completedInputs)+"/"+fmt(Object.keys(db.originResearchContinuation?.routes||{}).length)+"시드.":"")+" D"+v.depth+" 수치모형 "+fmt(s.coveredPairs)+"쌍에는 이벤트 출생 미확인 "+fmt(s.eventTimingUnverifiedPairs)+"쌍 포함. 불가능·전역 최적 인증 0쌍 · 전역 잔여 시간 미산정.";
 }
 return assumedBirthCoverage(db)+growthReplayCoverage(db)+chronologicalCareerCoverage(db)+proof+" 전체 출생처×연구 분기 "+fmt(s.pairCount)+"쌍 · 제한 D"+v.depth+" 수치모형 "+fmt(s.coveredPairs)+"쌍 (이벤트·출생 시점 미확인 "+fmt(s.eventTimingUnverifiedPairs)+"쌍 포함) · 기존 조건부 경로 "+fmt(s.knownConditionalPairs)+"쌍 · 미탐색 "+fmt(c.UNEXPLORED)+"쌍 · 제한 직접 "+fmt(c.LIMITED_SEARCH_COMPLETE)+"쌍 / 재사용 "+fmt(c.REUSED_LIMITED_MODEL)+"쌍 (중복 상태 제외) · 불가능/전역 최적 인증 0쌍. 연구 이력-출생 조합 "+fmt(s.historyOriginRequests-s.historyOriginBirthGateMissing)+"건 → "+fmt(s.groupCalculations)+"개 대표 그룹 · 전이 캐시 적중률 "+fmt(100*s.transitionCacheHits/Math.max(1,s.transitionRequests))+"%"+(b?.identical?" · 동일 그래프 대조 "+fmt(b.uncachedMs/b.cachedMs)+"배 (그룹 압축 공통)":"")+(v.boundQueries?.queries?.length?" · 완료 DAG 상계 질의 "+fmt(v.boundQueries.queries.length)+"종 전수 대조 일치":"")+" · 전역 잔여 시간 미산정.";
}
const objectiveName=k=>({total:"12능력치 동일 경로 합계",mana:"마나",firing:"사격",strength:"근력"})[k]||k;
const preboundVersions=db=>Object.values(db?.populationPreboundSearch?.versions||{}).sort((a,b)=>b.depth-a.depth||a.query.objective.localeCompare(b.query.objective));
const preboundTarget=(db,q)=>Object.entries(q.targets||{}).map(([k,n])=>(db.statLabels?.[k]||({psiStrength:"부두 강도",tu:"행동력",health:"체력"})[k]||k)+" ≥ "+fmt(n)).concat(q.maxFees!=null?["직접 시술비 "+fmt(q.maxFees)+" 이하"]:[]).join(" · ");
// Full-game proof status and closed submodel evidence are deliberately
// separated. Never promote a bounded/relaxed numeric proof to full completion.
const closureLabel=c=>["제한모형 미진입","제한모형 상태 탐색 중","제한모형 직접 폐쇄","제한모형 동등성 폐쇄"][Number(c)]||"미확인";
const pct=n=>Number.isFinite(n)?fmt(n*100)+"%":"—";
function randomBoxMarkup(db){
 const a=db.populationRandomBox,b=db.populationBirthBox;if(!a||!b)return "";
 const s=a.summary,t=s.totals,bs=b.summary;
 const name=k=>db.labels[k]||db.labels[k.split(":").slice(1).join(":")]||k;
 const rows=[["출생 범위·부분 성장·독립 무작위 수치 모형",fmt(s.limitedClosed)+" / "+fmt(s.pairCount)+"쌍"],["종결 그룹",fmt(s.certifiedGroups)+" / "+fmt(s.groups)],["출생 범위 증명 출생처",fmt(bs.coveredOrigins)+" / "+fmt(bs.sourceProfiles)],["신규 열거 출생 벡터",fmt(bs.newExplicitBirthVectors)],["무작위 영향 그룹 / 그대로 재사용 그룹",fmt(s.affectedGroups)+" / "+fmt(s.unaffectedReusedGroups)],["최고 후보 개선 조합 / 대표 클래스",fmt(s.improvedPairs)+" / "+fmt(s.improvedClasses)],["개선 출생처 / 연구 분기",fmt(s.improvedOrigins)+" / "+fmt(s.improvedBranches)],["최대 동일 경로 12능력치 합계 증가","+"+fmt(s.maxSumDelta)],["파레토 대표 / 신규 비지배 벡터",fmt(s.frontierRepresentatives)+" / "+fmt(s.novelGroupFrontierVectors)],["독립 전이 / 전체 요청",fmt(t.computed)+" / "+fmt(t.requests)],["전이 재사용률",pct((t.localHits+t.unchangedSourceHits)/Math.max(1,t.requests))],["후보 지배 합류 / 대표 대체",fmt(t.coveredCandidates)+" / "+fmt(t.retiredRepresentatives)],["우위 대표 / 도달 기록",fmt(s.liveRepresentatives)+" / "+fmt(s.admittedRecords)],["출생 범위 증명 / 무작위 확장 실행",fmt(s.birthProofSeconds)+"초 / "+fmt(s.cumulativeSeconds)+"초"],["전역 완전 완료",fmt(s.fullCompleted)+" / "+fmt(s.pairCount)]];
 const rules=a.changed.map(r=>'<p><b>'+esc(name(r.id))+'</b> <code>'+esc(r.id)+'</code> · 독립 정수 증가량 조합 '+esc(r.independentRollCount)+'개를 최댓값 대표로 압축 (실제 난수 분포·공동 달성 확률 미인증).</p>').join("");
 const top=a.topImproved.slice(0,10).map(x=>'<tr><td><a href="'+routeLink(x.origin,x.branch)+'">'+esc(name(x.origin))+'</a></td><td><a href="'+branchLink(x.branch)+'">'+esc(x.branch)+'</a></td><td>+'+fmt(x.sumDelta)+'</td><td>'+fmt(x.novel)+'</td></tr>').join("");
 return '<details open class="bs-note" data-population-random-box="true"><summary>V3 출생 전체 수치 구간·무작위 시술·부분 성장 '+fmt(s.certifiedGroups)+'/'+fmt(s.groups)+'그룹</summary><p>출생 초기·현재 능력치 좌표별 정수 범위 전체를 포함하며, 현재 모델의 성장량 비례 계수가 모두 0 이하임을 이용해 출생 벡터를 압축합니다. 무작위 증가량은 독립 정수 범위를 전제로 최대 결과가 나머지를 지배하는 경우만 사용합니다. 실제 공동 난수 분포와 출생 시점·승급·훈장·추가 연구·자원/시간 조건은 별도입니다. 전역 완전 판정으로 합산하지 않습니다.</p><div class="bs-scroll"><table class="bs-table"><thead><tr><th>측정 지표</th><th>값</th></tr></thead><tbody>'+rows.map(([k,v])=>'<tr><td>'+esc(k)+'</td><td>'+esc(v)+'</td></tr>').join("")+'</tbody></table></div>'+rules+(top?'<h4>신규 개선 대표 조합</h4><div class="bs-scroll"><table class="bs-table"><thead><tr><th>출생처</th><th>대표 분기</th><th>합계 최고 증가</th><th>새 비지배 후보</th></tr></thead><tbody>'+top+'</tbody></table></div>':"")+'<p><a href="'+esc(new URL("./data/"+b.file,import.meta.url).href)+'">출생 범위 전방 시뮬레이션 증거</a> · <a href="'+esc(new URL("./data/"+a.file,import.meta.url).href)+'">무작위 증가량·우위 상태 폐쇄 증거</a> · SHA256 <code>'+esc(a.sha256)+'</code></p></details>';
}
function antichainMarkup(db){
 const a=db.populationAntichain;if(!a)return "";
 const s=a.summary,t=s.totals||{},base=a.partialProof.summary,hit=(t.localHits+t.sourceHits)/Math.max(1,t.edgeRequests);
 const rows=[["부분 성장 포함 파레토 종결 조합",fmt(s.limitedClosed)+" / "+fmt(s.pairCount)],["대표 조합 / 동등성 재사용",fmt(s.limitedDirect)+" / "+fmt(s.limitedEquivalent)],["전체 제한 그룹 / 종결",fmt(s.groups)+" / "+fmt(s.certifiedGroups)],["기존 폐쇄에서 증명 확장",fmt(s.sourceCertifiedGroups)],["신규 우위 상태 폐쇄",fmt(s.newAntichainGroups)],["미종결 / 미증명 그룹",fmt(s.openGroups)+" / "+fmt(s.unprovedGroups)],["동일 이력 우위 후보 합류",fmt(t.coveredCandidates)],["대체된 우위 대표",fmt(t.retiredRepresentatives)],["우위 탐색 독립 계산 / 요청",fmt(t.computed)+" / "+fmt(t.edgeRequests)],["기존·신규 전이 캐시 적중",pct(hit)],["우위 대표 / 누적 도달 기록",fmt(s.liveRepresentatives)+" / "+fmt(s.admittedRecords)],["새 그룹의 대표 상태 압축률",pct(1-s.liveRepresentatives/Math.max(1,s.admittedRecords))],["전체 파레토 대표",fmt(s.combinedFrontierRepresentatives)],["부분 성장 증명 / 우위 탐색 시간",fmt(s.partialGrowthSeconds)+"초 / "+fmt(s.cumulativeSeconds)+"초"],["부분 성장 독립 스칼라 검증",fmt(s.proofAuditSimulation.scalarChecks)],["독립 전이 재생",fmt(s.proofAuditIndependentTransitions)],["새 그룹의 전체 파레토 증명",fmt(s.newAntichainGroups)+"그룹 (원본 상태 전수 계산 아님)"],["전체 게임 완료",fmt(s.fullCompleted)+" / "+fmt(s.pairCount)]];
 return '<details'+(db.populationRandomBox?'':' open')+' class="bs-note" data-population-antichain="true"><summary>V2 부분 성장·우위 상태 폐쇄 '+fmt(s.certifiedGroups)+'/'+fmt(s.groups)+'그룹</summary><p>고정 활성 연구와 출생 두 벡터, 결정론적 시술, 전투캡 이하의 독립적인 부분 성장을 포함합니다. 같은 병종·초기 능력치·계급·장비·이력·보너스 상태에서만 능력치 우위를 적용하며, 실제 변신식의 낮은 입력 전 범위 지배 조건과 도달 증거를 검사합니다. 전역 완료로 합산하지 않습니다.</p><div class="bs-scroll"><table class="bs-table"><thead><tr><th>측정 지표</th><th>값</th></tr></thead><tbody>'+rows.map(([k,v])=>'<tr><td>'+esc(k)+'</td><td>'+esc(v)+'</td></tr>').join("")+'</tbody></table></div><p>출생 중간 난수, 전투캡 초과 성장, 실제 훈련·승급·훈장, 추가 연구와 자원·시간 조건은 별도 확장이 필요합니다.</p><p><a href="'+esc(new URL("./data/"+a.partialProof.file,import.meta.url).href)+'">부분 성장 시뮬레이션 증명</a> · <a href="'+esc(new URL("./data/"+a.file,import.meta.url).href)+'">우위 상태 폐쇄 및 원본 조합 증거 (gzip)</a> · SHA256 <code>'+esc(a.sha256)+'</code></p></details>';
}
function closureMarkup(db){
 const a=db.populationClosure;if(!a)return "";
 const s=a.summary,t=s.totals||{},full=s.fullCompleted||0;
 const items=[["전체 조합",s.pairCount],["직접 완전 완료",s.fullDirect],["동등성 완전 완료",s.fullEquivalent],["불가능 증명 완료",s.fullImpossible],["부분 탐색 (전역 미완료)",s.fullPartial],["미탐색",s.fullUnexplored],["전역 시간당 신규 완료",s.fullCompletedPerHour],["독립 전이 계산",t.independentTransitions],["전체 전이 요청",t.transitionRequests],["전이 캐시 적중률",pct(s.cacheHitRate)],["중복 전이 계산 절감률",pct(s.transitionSavingRate)],["공유 상태 압축률",pct(s.stateCompressionRate)],["중복 상태 합류",t.repeatEdges],["자기 루프 처리",t.selfLoops],["종착 파레토 표시 제거",t.terminalDominanceRemoved],["V1 전수 폐쇄의 중간 상태 우위 가지치기","0 (V2 별도 집계)"],["관측 연구 마스크 / BDD 노드",fmt(s.observedResearchMasks)+" / "+fmt(s.bddNodes)],["고유 상태 / 그룹 참조",fmt(s.globalStates)+" / "+fmt(s.groupStateReferences)],["계산 대기 상태 (제한모형)",s.pendingStates],["누적 계산 시간",fmt(s.cumulativeSeconds)+"초"],["전역 예상 잔여 계산량",s.fullRemainingWork??"산정 불가"],["전역 예상 잔여 시간",s.fullEtaHours??"산정 불가"]];
 const show=v=>typeof v==="number"?fmt(v):esc(v??"미산정");
 return '<details'+(db.populationAntichain?'':' open')+' class="bs-note" data-population-closure="true"><summary>전체 병종 완전 판정 원장 · '+fmt(full)+' / '+fmt(s.pairCount)+' ('+pct(full/s.pairCount)+')</summary><p><b>전역 최적성 / 불가능 증명:</b> '+fmt(full)+'건. 아래 폐쇄 상태는 제한 모델의 별도 증명이며 완전 판정으로 합산하지 않습니다.</p><div class="bs-scroll"><table class="bs-table"><thead><tr><th>측정 지표</th><th>값</th></tr></thead><tbody>'+items.map(([k,v])=>'<tr><td>'+esc(k)+'</td><td>'+show(v)+'</td></tr>').join("")+'</tbody></table></div><h4>깊이 제한 없는 제한 상태 폐쇄</h4><p>그룹 '+fmt(s.closedGroups)+' / '+fmt(s.groups)+' · 원본 조합 '+fmt(s.limitedClosed)+'개 (대표 조합 '+fmt(s.limitedDirect)+' / 동일 그룹집합 재사용 '+fmt(s.limitedEquivalent)+') · 미종결 그룹 '+fmt(s.openGroups)+'개 · 파레토 대표 '+fmt(s.frontierRepresentatives)+'개. 제한모형 신규 종결 처리량 '+fmt(s.limitedClosedPerHour)+'쌍/시간 (누적 엔진 실행시간 기준, 전역 ETA 아님). 독립 전이 재생 '+fmt(s.proofAuditEdges)+'개.</p><p>미포함: 출생 중간 난수 벡터, 부분·특수 성장, 무작위 시술, 승급·훈장, 추가/중간 연구 이력, 실제 모집 및 시간·재료·부상·사망·복제. 관측 연구 마스크 BDD는 새 연구 분기의 불가능 증명이 아닙니다.</p><p><a href="'+esc(new URL("./data/"+a.file,import.meta.url).href)+'">전체 원본 조합·상태·전이·폐쇄 증거 원장 (gzip)</a> · SHA256 <code>'+esc(a.sha256)+'</code></p></details>';
}
function closurePair(db,pid,bid){
 const a=db.populationClosure;if(!a)return null;
 const i=a.origins.indexOf(pid),j=a.branches.indexOf(bid);if(i<0||j<0)return null;
 const ac=db.populationRandomBox||db.populationAntichain;
 return {status:Number((ac||a).status[i][j]),groups:a.pairGroups[i][j]};
}
function closureOriginMarkup(db,pid,bid,labels){
 const a=db.populationClosure;if(!a)return "";
 const i=a.origins.indexOf(pid),j=bid?a.branches.indexOf(bid):-1;if(i<0||bid&&j<0)return "";
 const rb=db.populationRandomBox,ac=db.populationAntichain,view=rb||ac||a,row=a.pairGroups[i],ids=j<0?[...new Set(row.flat())]:row[j],groups=ids.map(id=>view.groups[id]);
 const statuses=j<0?Array.from(view.status[i],Number):[Number(view.status[i][j])];
 const name=k=>db.labels[k]||k;
 const cols=db.stats.map(k=>'<th>'+esc(labels[k]||k)+'</th>').join("");
 const groupRows=groups.map(g=>'<details><summary>그룹 #'+fmt(g.id+1)+' · '+(g.closed?"제한 폐쇄":"미종결")+' · '+fmt(g.states)+'상태 · '+fmt(g.pending)+'대기 · '+fmt(g.frontier.length)+'개 파레토 대표</summary>'+(g.closed?'<div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>최종 병종 / 성장·시술 순서</th>'+cols+'</tr></thead><tbody>'+g.frontier.map(f=>'<tr><td>'+esc(name(f.body))+'<small class="bs-sub">'+esc(f.actions.map(k=>k==="CAP_TARGET"?"[전투캡 성장]":name(k)+(rb&&rb.changed.some(r=>r.id===k)?" [독립 최대 증가량]":"")).join(" → ")||"출생 상태")+'</small></td>'+f.vector.map(n=>'<td>'+fmt(n)+'</td>').join("")+'</tr>').join("")+'</tbody></table></div><p>폐쇄 증거 SHA256 <code>'+esc(g.proofHash||g.closureHash)+'</code> · '+(rb?esc(g.proofKind==='FLAT_ROLL_BOX_FORWARD_SIMULATION'?'무작위 증가량 포함 우위 상태 도달·전이 증명':'출생 범위 증명 재사용'):ac?esc(g.proofKind==='ANTICHAIN_FORWARD_SIMULATION'?'우위 상태 도달·전이 증명':'전투캡 폐쇄에서 부분 성장 증명 확장'):'모델 외 결과 전이 '+fmt(g.outsideModelEdges)+'개')+'</p>':"<p>대기 상태가 남아 있어 제한모형도 종결되지 않았습니다.</p>")+'</details>').join("");
 return '<section class="scope-note" data-population-closure-origin="true"><h3>깊이 제한 없는 상태 폐쇄 · 12능력치 파레토</h3><p>전역 완료 미인증 · '+(bid?esc(closureLabel(statuses[0])):"현재 "+fmt(statuses.filter(c=>c>=2).length)+"/"+fmt(statuses.length)+"개 분기의 제한모형 폐쇄")+' · 참조 그룹 '+fmt(groups.length)+'개. 각 그룹은 관측된 최종 활성 연구와 '+(rb?'출생 초기·현재 능력치 좌표별 전체 정수 범위, 결정론적 일반 시술 및 독립 정수 무작위 증가량, 전투캡 이하 부분 성장을 포함합니다. 공동 난수·실제 캠페인 최적성은 미인증입니다.':ac?'두 출생 벡터, 결정론적 일반 시술 및 전투캡 이하의 독립적인 부분 성장까지 포함합니다. 지배 증명에 실패한 상태는 완결 처리하지 않습니다.':'두 출생 벡터, 결정론적 일반 시술과 전투캡 성장만 포함합니다. 중간 상태 우위 가지치기는 사용하지 않습니다.')+'</p>'+groupRows+'</section>';
}
function preboundMarkup(db){
 const vs=preboundVersions(db);if(!vs.length)return "";
 return '<details open class="bs-note" data-population-prebound="true"><summary>미생성 상태 상계 · 목적별 제한 탐색 D'+fmt(vs[0].depth)+'</summary><p>최종 활성 연구, 출생 최소·최대 벡터, 건강한 대원, 결정론적 일반 시술, 전투캡 전후 성장만 허용한 모델입니다. '+fmt(vs[0].summary.modeledOrigins)+'/72 출생처 · '+fmt(vs[0].summary.groups)+'그룹 · '+fmt(vs[0].summary.pairs)+'쌍. 승급·훈장·추가 연구·실제 성장 시점·무작위 시술은 포함하지 않습니다. 엄격하게 열등한 상계만 생략하고 동점 순서를 모두 보존했습니다. 실제 게임 전체 최적성 인증은 0건입니다.</p><div class="bs-scroll"><table class="bs-table"><thead><tr><th>목표 / 깊이</th><th>기존 → 최고</th><th>직접 방문 / 전수 순서</th><th>신규 상태</th><th>계산 시간 / 속도</th><th>동점 경로 및 근거</th></tr></thead><tbody>'+vs.map(v=>{
 const s=v.summary,b=v.benchmark,w=v.witnessIds[0]&&db.witnesses[v.witnessIds[0]];
 return '<tr><td>'+esc(objectiveName(v.query.objective))+' · D'+fmt(v.depth)+'<small class="bs-sub">'+esc(preboundTarget(db,v.query)||"추가 목표 없음")+'</small></td><td>'+fmt(s.initialBest)+' → '+(w?'<a href="'+routeLink(w.originProfile,null,v.witnessIds[0])+'">'+fmt(s.bestScore)+'</a>':fmt(s.bestScore))+'</td><td>'+fmt(s.visitedLabels)+' / '+fmt(b?.fullLabels)+'<small class="bs-sub">가지치기 접두부 '+fmt(s.prunedPrefixes)+'</small></td><td>'+fmt(s.exactStatesGenerated)+'</td><td>'+fmt(s.elapsedMs/1000)+'초'+(b?'<small class="bs-sub">'+fmt(b.fullMs/1000)+'초 대비 '+fmt(b.speedup)+'배 · 전체 동점 해시 일치</small>':'<small class="bs-sub">동일 깊이 전수 대조 미실행</small>')+'</td><td>'+fmt(s.ties)+'개 · <a href="'+esc(new URL("./data/"+v.file,import.meta.url).href)+'">전체 경로·상계 증거</a>'+(b?' · <a href="'+esc(new URL("./data/"+b.file,import.meta.url).href)+'">전수 비교</a>':"")+'</td></tr>';
 }).join("")+'</tbody></table></div><p class="bs-sub">수치 상태 방문 감소와 실제 실행 시간 개선은 서로 다른 지표입니다. 이미 완료된 유한 깊이 안의 결과만 인증합니다.</p></details>';
}
export function populationPreboundOriginMarkup(db,pid,branchId=null,focus=null,labels={}){
 const vs=preboundVersions(db),rows=vs.flatMap(v=>v.witnessIds.filter(id=>{const w=db.witnesses[id];return w?.originProfile===pid&&(!branchId||w.branchIds.includes(branchId));}).map(id=>({v,id,w:db.witnesses[id]})));
 if(!rows.length)return "";
 const selected=rows.find(r=>r.id===focus)||rows[0],{v,w,id}=selected,name=k=>db.labels[k]||k;
 const seq=x=>(x.steps||[]).map((s,i)=>(x.growthBefore?.[i]?"[전투캡 성장] ":"")+name(s.id)).join(" → ")||"추가 시술 없음";
 const col=db.stats.map(k=>'<th>'+esc(labels[k]||k)+'</th>').join(""),row=(title,vec)=>'<tr><th>'+esc(title)+'</th>'+vec.map(n=>'<td>'+fmt(n)+'</td>').join("")+'</tr>';
 return '<section class="scope-note" data-population-prebound-origin="true"><h3>미생성 상태 상계로 확보한 목적별 최고 경로</h3><p>선택 경로는 '+fmt(v.summary.modeledOrigins)+'개 출생처 제한 모형의 '+esc(objectiveName(v.query.objective))+' 최고 동점 대표입니다. 이 분기의 모든 경로 또는 전체 게임 최고치라는 뜻은 아닙니다. D'+fmt(v.depth)+' · '+esc(preboundTarget(db,v.query)||"추가 목표 없음")+' · 전체 동점 '+fmt(v.summary.ties)+'개.</p><p>최종 병종 '+esc(name(w.body))+' · 출생 '+(w.birthBand==="max"?"최댓값":"최솟값")+' · '+esc(seq(w))+' · 마지막 전투캡 성장 가정 · 직접 시술비 '+fmt(w.fees)+' · 동일 경로 합계 '+fmt(total(w))+'</p><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>능력치</th>'+col+'</tr></thead><tbody>'+row("원시",w.raw)+row("영구 보너스",w.bonus)+row("실효 (조건부)",w.vector)+'</tbody></table></div><p>필요 연구 '+w.research.map(k=>esc(name(k))).join(" / ")+' · 연구 이력 '+fmt(w.populationPrebound.historyIds.length)+'개 · <a href="'+esc(new URL("./data/"+v.file,import.meta.url).href)+'">모든 동점·가지치기 증거 원장</a> · SHA256 <code>'+esc(v.sha256)+'</code></p><details><summary>이 출생처의 목적별 대표 '+fmt(rows.length)+'개</summary><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>목표</th><th>시술 순서</th><th>직접 시술비</th><th>최고값</th></tr></thead><tbody>'+rows.map(({v,id,w})=>'<tr><td>'+esc(objectiveName(v.query.objective))+' D'+fmt(v.depth)+'</td><td>'+esc(seq(w))+'</td><td>'+fmt(w.fees)+'</td><td><a href="'+routeLink(pid,branchId,id)+'">'+fmt(v.summary.bestScore)+'</a></td></tr>').join("")+'</tbody></table></div></details></section>';
}
export function populationFiniteClosureMarkup(db){
 const a=db.populationFiniteClosure;if(!a)return "";
 const s=a.summary,j=db.populationJointCoverage,total=s.targetPairs;
 const partial=j?.uniqueCovered??0,unknown=j?total-partial:null;
 const rows=[
 ["전체 적용 후보",fmt(total),"출생처 × 연구 이력 보유 분기"],
 ["직접 완전 판정",fmt(s.globalDirectComplete),"게임 전체 범위"],
 ["동등성 증명 완전 판정",fmt(s.globalEquivalentComplete),"게임 전체 범위"],
 ["불가능성 증명 판정",fmt(s.globalImpossibleComplete),"게임 전체 범위"],
 ["부분 탐색 / 미탐색",j?fmt(partial)+" / "+fmt(unknown):"미집계","중복 제거한 기존 근거"],
 ["전체 판정 완료율","0%","유한 모델 완결은 미포함"],
 ["시간당 신규 완전 판정","0","이번 유한 그래프 계산에서 전역 완료 0건"],
 ["전역 예상 잔여 계산량","미산정","반복 유한성 및 전체 전이 모델 미완성"],
 ["D3 한정 완결 쌍",fmt(s.limitedClosedPairs),"게임 전체 완료 아님"],
 ["D3 독립 쌍 클래스 / 동등 쌍",fmt(s.limitedDirectClasses)+" / "+fmt(s.limitedEquivalentPairs),"원본 조합 대응표 보존"],
 ["D3 쌍 계산 절감률",fmt(s.pairCalculationReduction*100)+"%","동일 유한 행동 전이 클래스 기준"],
 ["깊이 포함 상태 → 몫 그래프 상태",fmt(s.depthStateOccurrences)+" → "+fmt(s.quotientStates),"행동 라벨 동등성 귀납 증명"],
 ["상태 캐시 적중 / 압축률",fmt(s.quotientHitRate*100)+"%","동일 상태 서명 재사용"],
 ["종단 파레토 지배 제거",fmt(s.terminalDominanceRemoved),"중간 상태 및 원본 순서 제거 없음"],
 ["전체 행동 순서 보존",fmt(s.sourceOrderedLabels),"원본 D3 그래프 참조"],
 ["몫 그래프 계산 시간",fmt(s.elapsedMs/1000)+"초","이미 기록된 D3 그래프에서 계산"]
 ];
 return '<details'+(db.populationClosure?'':' open')+' class="bs-note" data-population-finite-closure="true"><summary>D3 유한 행동 전이 동등성 압축 · 별도 증거 (중복 합산 금지)</summary><p><b>게임 전체 완전 판정은 0건입니다.</b> 다음 표의 D3 완결은 이미 기록된 고정 연구·결정론·3회 시술 모델에만 해당합니다. 출생 시점과 무작위 결과, 승급, 훈장, 중간 성장, 자원·시간, 추가 연구, 무제한 반복은 아직 전역 증명에 포함되지 않습니다. 깊이 제한 없는 폐쇄 결과와 합산하지 않습니다.</p><div class="bs-scroll"><table class="bs-table"><thead><tr><th>지표</th><th>결과</th><th>범위</th></tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+esc(x)+'</td>').join("")+'</tr>').join("")+'</tbody></table></div><p><a href="'+esc(new URL("./data/"+a.file,import.meta.url).href)+'">12능력치 파레토·상태 동등성·원본 조합 대응 증거 (gzip)</a> · SHA256 <code>'+esc(a.sha256)+'</code></p></details>';
}
function invariantBoundMarkup(db){
 const a=db.populationInvariantBound;if(!a)return "";
 const s=a.summary,r=s.repeat;
 const items=[["상계 적용 조합",fmt(s.coveredUpperBoundPairs)+" / "+fmt(s.pairCount)],["독립 상계 그룹",fmt(s.independentOriginGroups)],["상계 공유 조합",fmt(s.groupReusePairs)],["그룹 계산 절감률",pct(s.independentCalculationReduction)],["병종별 상계 상자 / 반복 횟수 층",fmt(s.bodyBoxes)+" / "+fmt(s.repeatCountLayers)],["유한 반복 횟수 상계",fmt(r.finiteOriginRulePairs)+" / "+fmt(r.originRulePairs)],["모든 출생처 유한 시술 규칙",fmt(r.allOriginFiniteRules)+" / "+fmt(r.rules)],["최대 1회 / 유한 다회 규칙",fmt(r.allOriginAtMostOnce)+" / "+fmt(r.allOriginFiniteMultiple)],["반복 상계 미확정",fmt(r.unboundedAbstractPairs)],["반복 증명 그래프 상태 / 전이",fmt(r.nodes)+" / "+fmt(r.edges)],["귀납적 상계 전이 조건",fmt(s.metrics.proofEdges)],["상계 계산 시간",fmt(s.elapsedMs/1000)+"초"],["전역 완전 완료",fmt(s.fullCompleted)]];
 return '<details open class="bs-note" data-population-invariant-bound="true"><summary>모든 연구 허용 상계 · 반복 횟수 유한성 증명</summary><p>'+fmt(s.origins)+'개 출생처 전체의 수치 상계를 '+fmt(s.independentOriginGroups)+'개 독립 그룹으로 계산합니다. 연구·계급·훈장·자원 조건을 완화한 낙관적 모델이며, 출생 난수 범위와 색인된 비복제·비은퇴 변신의 반복 횟수 제한을 반영합니다. 실제 달성 가능한 벡터 또는 완전 판정으로 사용하지 않습니다.</p><div class="bs-scroll"><table class="bs-table"><thead><tr><th>측정 지표</th><th>값</th></tr></thead><tbody>'+items.map(([k,v])=>'<tr><td>'+esc(k)+'</td><td>'+esc(v)+'</td></tr>').join("")+'</tbody></table></div><p>반복 미확정은 무한 반복 가능성 증명이 아닙니다. 각 능력치의 독립 상계는 단일 최강 경로가 아닙니다. <a href="'+esc(new URL("./data/"+a.file,import.meta.url).href)+'">수치 상계 증명 원장 (gzip)</a> · <a href="'+esc(new URL("./data/"+a.repeatProof.file,import.meta.url).href)+'">시술 반복 횟수 증명 원장 (gzip)</a></p></details>';
}
function invariantBoundOriginMarkup(db,pid,labels){
 const a=db.populationInvariantBound,g=a?.groups[a.originIndex[pid]];if(!g)return "";
 const name=id=>db.labels[id]||id;
 const cols=db.stats.map(k=>'<th>'+esc(labels[k]||k)+'</th>').join("");
 const row=(title,vec)=>'<tr><th>'+esc(title)+'</th>'+vec.map(n=>'<td>'+fmt(n)+'</td>').join("")+'</tr>';
 const caps=Object.entries(g.repeatCaps),finite=caps.filter(([,n])=>Number.isSafeInteger(n)),unresolved=caps.length-finite.length;
 return '<section class="scope-note" data-population-invariant-origin="true"><h3>반복 횟수 제한을 반영한 독립 능력치 상계</h3><p>연구 조건을 완화한 모든 분기 공통의 낙관적 상계입니다. 달성 가능성·동시 달성·전역 최적성 미인증. 최대 능력치가 아니라 가능한 수치의 상한을 나타냅니다.</p><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>구분</th>'+cols+'</tr></thead><tbody>'+row("원시 독립 상계",g.rawMax)+row("보너스 독립 상계",g.bonusUpper)+row("실효 독립 상계",g.effectiveMax)+'</tbody></table></div><details><summary>최종 병종별 독립 실효 상계 '+fmt(g.bounds.length)+'개</summary><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>종착 병종</th>'+cols+'</tr></thead><tbody>'+g.bounds.map(b=>row(name(b.body),b.effective)).join("")+'</tbody></table></div></details><details><summary>시술 최대 반복 횟수 · 유한 '+fmt(finite.length)+'개 / 미확정 '+fmt(unresolved)+'개</summary><div class="bs-scroll"><table class="bs-table"><thead><tr><th>시술</th><th>반복 횟수 상계</th></tr></thead><tbody>'+caps.map(([id,n])=>'<tr><td>'+esc(name(id))+'<small class="bs-sub">'+esc(id)+'</small></td><td>'+esc(Number.isSafeInteger(n)?fmt(n)+"회 이하":"미확정")+'</td></tr>').join("")+'</tbody></table></div></details></section>';
}
function branchInvariantMarkup(db){
 const a=db.populationBranchInvariant,c=db.populationResearchConstraints;if(!a||!c)return "";
 const s=a.summary,r=c.summary;
 const rows=[["연구 분기 / 행동 허용 마스크",fmt(r.branches)+" / "+fmt(r.independentMasks)],["연구 항목 / 획득 대안",fmt(r.researchTopics)+" / "+fmt(r.acquisitionAlternatives)],["BDD 결정 노드",fmt(r.bddNodes)],["제한 모형에서 제외한 분기·시술 조합",fmt(r.excludedBranchRulePairs)],["원본 조합 / 독립 상계 그룹",fmt(s.pairCount)+" / "+fmt(s.independentGroups)],["신규 수치 계산 / 기존 상계 재사용 그룹",fmt(s.independentNumericalComputations)+" / "+fmt(s.reusedUniversalGroups)],["상계 조합 압축률",pct(s.reduction)],["실효 상계 정밀화 조합",fmt(s.effectiveTighterPairs)],["원시 상계 정밀화 조합",fmt(s.rawTighterPairs)],["종착 병종 또는 원시 상계 정밀화 조합",fmt(s.bodyTighterPairs)],["새 유한 반복 상계 (마스크·출생처·시술)",fmt(s.repeatNewFiniteMaskOriginRules)],["추가 반복 제한 강화",fmt(s.repeatReducedMaskOriginRules)],["기존 근거와 충돌하여 허용으로 되돌린 분기",fmt(r.failOpenBranches)],["수치 상계 계산 시간",fmt(s.elapsedMs/1000)+"초"],["전역 완전 완료",fmt(s.globalCompleted)]];
 return '<details open class="bs-note" data-population-branch-invariant="true"><summary>연구 제약과 반복 횟수를 반영한 분기별 독립 상계</summary><p>색인된 연구 획득 모형의 필요조건과 영구 상호배제에 따라 행동 허용 범위를 좁히고 SCC 반복 횟수 상계를 다시 계산했습니다. 실제 연구 시점·획득·자원·승급·훈장 달성이나 모든 능력치의 동시 달성을 인증하지 않습니다. BDD의 추가 행동 쌍 제약은 수치 계산에 아직 적용하지 않았습니다.</p><div class="bs-scroll"><table class="bs-table"><thead><tr><th>측정 지표</th><th>값</th></tr></thead><tbody>'+rows.map(([k,v])=>'<tr><td>'+esc(k)+'</td><td>'+esc(v)+'</td></tr>').join("")+'</tbody></table></div><p><a href="'+esc(new URL("./data/"+c.file,import.meta.url).href)+'">연구 제약·BDD 증거 원장 (gzip)</a> · <a href="'+esc(new URL("./data/"+a.file,import.meta.url).href)+'">분기별 상계·반복 증명 대응 원장 (gzip)</a></p></details>';
}
function branchInvariantOriginMarkup(db,pid,bid,labels){
 const a=db.populationBranchInvariant,c=db.populationResearchConstraints;if(!a||!c||!bid)return "";
 const i=a.origins.indexOf(pid),j=a.branches.indexOf(bid);if(i<0||j<0)return "";
 const gi=a.pairClasses[i]?.[j],g=a.groups[gi],universal=db.populationInvariantBound?.groups[g?.baseGroup];if(!g||!universal)return "";
 const cols=db.stats.map(k=>'<th>'+esc(labels[k]||k)+'</th>').join(""),row=(name,values)=>'<tr><th>'+esc(name)+'</th>'+values.map(n=>'<td>'+fmt(n)+'</td>').join("")+'</tr>';
 const caps=a.rules.map((id,k)=>[id,g.repeatCaps[k]]),nfinite=caps.filter(([,n])=>Number.isSafeInteger(n)).length;
 const label=id=>db.labels[id]||id;
 return '<section class="scope-note" data-population-branch-invariant-origin="true"><h3>선택 분기 · 연구 제약 반영 독립 상계</h3><p>계산 그룹 '+fmt(gi+1)+' · 연구 마스크 '+fmt(c.maskByBranch[j]+1)+' · 전역 미인증. 독립 상계이며 단일 달성 경로가 아닙니다.</p><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>구분</th>'+cols+'</tr></thead><tbody>'+row("모든 연구 허용 실효 상계",universal.effectiveMax)+row("선택 분기 원시 상계",g.rawMax)+row("선택 분기 보너스 상계",g.bonusUpper)+row("선택 분기 실효 상계",g.effectiveMax)+'</tbody></table></div><details><summary>종착 병종별 실효 상계 '+fmt(g.bounds.length)+'개</summary><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>병종</th>'+cols+'</tr></thead><tbody>'+g.bounds.map(b=>row(label(b.body),b.effective)).join("")+'</tbody></table></div></details><details><summary>분기별 반복 횟수 제한 · 유한 '+fmt(nfinite)+' / 미확정 '+fmt(caps.length-nfinite)+'</summary><div class="bs-scroll"><table class="bs-table"><thead><tr><th>시술</th><th>허용 횟수 상계</th></tr></thead><tbody>'+caps.map(([id,n])=>'<tr><td>'+esc(label(id))+'<small class="bs-sub">'+esc(id)+'</small></td><td>'+esc(n===null?"미확정":fmt(n)+"회 이하")+'</td></tr>').join("")+'</tbody></table></div></details></section>';
}
function careerEnvelopeMarkup(db){
 const a=db.populationCareerEnvelope;if(!a)return "";
 const s=a.summary,m=s.metrics;
 const label=k=>({tu:"행동력",stamina:"지구력",health:"체력",bravery:"용기",reactions:"반응",firing:"사격",throwing:"투척",strength:"근력",psiStrength:"부두 강도",psiSkill:"부두 기술",melee:"근접",mana:"마나"})[k]||k;
 const rows=[["조합 / 독립 계산 그룹",fmt(s.pairCount)+" / "+fmt(s.independentGroups)],["조합 압축률",pct(s.reduction)],["실효 상계 개선 조합",fmt(s.effectiveTighterPairs)],["계급·보너스 추상 상태",fmt(m.states)],["계급 미충족 전이",fmt(m.rankRejected)],["변신 초기화 전이",fmt(m.resetEdges)],["계산 시간",fmt(s.elapsedMs/1000)+"초"],["전역 완료",fmt(s.globalCompleted)]];
 return '<details open class="bs-note" data-population-career-envelope="true"><summary>계급·훈장·보너스 초기화 상계와 목표별 탐색 대기열</summary><p>일반 훈장은 한 등급만, 모듈형 훈장은 보수적 합집합으로 계산합니다. 승급 및 훈장 획득은 낙관적으로 허용하고 변신 초기화·계급 변경·영구 배제 행동 마스크를 반영합니다. 실제 달성 증명 또는 전역 불가능 판정은 아닙니다.</p><div class="bs-scroll"><table class="bs-table"><thead><tr><th>측정 지표</th><th>값</th></tr></thead><tbody>'+rows.map(([k,v])=>'<tr><td>'+esc(k)+'</td><td>'+esc(v)+'</td></tr>').join("")+'</tbody></table></div><div class="bs-scroll"><table class="bs-table"><thead><tr><th>능력치</th><th>조건부 기록</th><th>엄격 개선 목표</th><th>상계로 제외</th><th>잔여 조합 / 그룹</th></tr></thead><tbody>'+a.targets.map(t=>'<tr><td>'+esc(label(t.stat))+'</td><td>'+fmt(t.conditionalRecord)+'</td><td>'+fmt(t.target)+'</td><td>'+fmt(t.newRejectedPairs)+'</td><td>'+fmt(t.remainingPairs)+' / '+fmt(t.remainingGroups)+'</td></tr>').join("")+'</tbody></table></div><p>목표별 제외 집합은 중복될 수 있으므로 합산하지 않습니다. <a href="'+esc(new URL("./data/"+a.file,import.meta.url).href)+'">계급 상태·보너스·목표별 대기열 원장 (gzip)</a></p></details>';
}
function careerEnvelopeOriginMarkup(db,pid,bid,labels){
 const a=db.populationCareerEnvelope;if(!a||!bid)return "";
 const i=a.origins.indexOf(pid),j=a.branches.indexOf(bid);if(i<0||j<0)return "";
 const g=a.groups[a.pairClasses[i]?.[j]],old=db.populationBranchInvariant?.groups[g?.baseGroup];if(!g||!old)return "";
 const cols=db.stats.map(k=>'<th>'+esc(labels[k]||k)+'</th>').join(""),row=(name,v)=>'<tr><th>'+esc(name)+'</th>'+v.map(n=>'<td>'+fmt(n)+'</td>').join("")+'</tr>';
 return '<section class="scope-note" data-population-career-envelope-origin="true"><h3>선택 분기 · 계급·훈장 보정 상계</h3><p>독립 능력치 상계이며 동시에 달성 가능한 벡터가 아닙니다. 승급·훈장 획득은 가정, 실제 게임 전역 최적성 미인증.'+(g.failedOpen?' 기존 근거 충돌로 이전 상계를 사용합니다.':'')+'</p><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>구분</th>'+cols+'</tr></thead><tbody>'+row("이전 분기 실효 상계",old.effectiveMax)+row("새 실효 상계",g.effectiveMax)+row("훈장 등급 보정 상계",a.medalUpper)+'</tbody></table></div><details><summary>종착 병종별 상계와 계급 상태 '+fmt(g.bounds.length)+'개</summary><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>병종 / 추상 계급 상태</th>'+cols+'</tr></thead><tbody>'+g.bounds.map(b=>row((db.labels[b.body]||b.body)+" · "+(b.ranks?b.ranks.join(", "):"미확인"),b.effective)).join("")+'</tbody></table></div></details></section>';
}
export function populationBoundMarkup(db){
 const v=vOf(db),q=v?.boundQueries?.queries;if(!q?.length)return chronologicalCareerMarkup(db)+growthReplayMarkup(db)+careerFrontierMarkup(db)+assumedBirthMarkup(db)+careerEnvelopeMarkup(db)+branchInvariantMarkup(db)+randomBoxMarkup(db)+invariantBoundMarkup(db)+antichainMarkup(db)+closureMarkup(db)+populationFiniteClosureMarkup(db)+preboundMarkup(db);
 return chronologicalCareerMarkup(db)+growthReplayMarkup(db)+careerFrontierMarkup(db)+assumedBirthMarkup(db)+careerEnvelopeMarkup(db)+branchInvariantMarkup(db)+randomBoxMarkup(db)+invariantBoundMarkup(db)+antichainMarkup(db)+closureMarkup(db)+populationFiniteClosureMarkup(db)+'<details class="bs-note" data-population-bounds="true"><summary>완료 D'+v.depth+' 그래프의 상계 기반 질의 결과</summary><p>남은 깊이별 능력치와 동일 경로 목적값 상계를 메모화합니다. 목표에 미달하거나 기존 최고보다 낮은 하위 행동 순서는 방문하지 않습니다. 상계 자체는 이미 완료된 유한 그래프에서 계산한 것이므로 게임 전체 미탐색 경로의 최적성 인증은 아닙니다.</p><div class="bs-scroll"><table class="bs-table"><thead><tr><th>목표</th><th>조건부 최고</th><th>전체 순서</th><th>직접 방문</th><th>상계·비용으로 생략</th><th>전수 비교</th></tr></thead><tbody>'+q.map(r=>'<tr><td>'+esc(r.query.objective==="total"?"12능력치 동일 경로 합계":({firing:"사격",mana:"마나"})[r.query.objective]||r.query.objective)+'<small class="bs-sub">'+esc(Object.entries(r.query.targets).map(([k,n])=>k+" ≥ "+n).join(" / ")+(r.query.maxFees!=null?" · 직접비용 "+fmt(r.query.maxFees)+" 이하":""))+'</small></td><td>'+fmt(r.bestScore)+'</td><td>'+fmt(r.orderedLabels)+'</td><td>'+fmt(r.visitedLabels)+'</td><td>'+fmt(r.prunedLabels)+'</td><td>'+(r.identicalToFullLabelScan?"일치":"미확인")+'</td></tr>').join("")+'</tbody></table></div></details>'+preboundMarkup(db);
}
function flags(v,i,j){
 const e=Number(v.evidence[i][j]);
 return [e&1?"연구·시술 조건부":null,e&2?"계급·훈장 조건부":null,e&4?"관측 뿌리 일치 (공동 이력 미재생)":null].filter(Boolean).join(" / ");
}
function pair(db,v,i,j){
 const ids=v.matrix[i][j],code=Number(db.populationJointCoverage?.status?.[i]?.[j]??v.status[i][j]);
 return {ids,code,label:names[code],flags:flags(v,i,j)};
}
const continuationRouteIndexes=new WeakMap();
const extendedRoutes=(db,pid,bid,kind)=>{
 let index=continuationRouteIndexes.get(db);
 if(!index){
  index=new Map();
  for(const [ledger,source] of [[db.originExtendedContinuation,"POPEXT12"],[db.originResearchContinuation,"POPRESEARCH12"],[db.originResearchChain,"POPRESEARCHCHAIN12"]]){
   for(const id of ledger?.published||[]){
    const r=ledger.routes[id];if(!r||db.witnesses[id]?.source!==source)continue;
    const k=JSON.stringify([r.kind,r.origin,r.branch]),ids=index.get(k)||[];ids.push(id);index.set(k,ids);
   }
  }
  continuationRouteIndexes.set(db,index);
 }
 return index.get(JSON.stringify([kind,pid,bid]))||[];
};
const researchContinuationNote=(db,w)=>{
 const r=db.originResearchChain?.routes?.[w?.populationResearchChain?.route]||db.originResearchContinuation?.routes?.[w?.populationResearch?.route];
 if(!r)return "";
 const name=k=>db.labels[k]||k;
 return '<p class="scope-note"><b>모집 후 추가 연구·시술 재생:</b> 부족했던 시술 연구 '+esc(r.missing.map(name).join(" / "))+' · 새 활성 연구 '+fmt(r.addedResearch.length)+'개 · 추가 행동 '+fmt(r.actions.length)+'개. '+esc(r.addedResearch.map(name).join(" / "))+(r.seed?' · 시드 <code>'+esc(r.seed)+'</code> · 후속 추가 연구 '+fmt(r.secondaryResearch.length)+'개':'')+' · 원래 모집 상태 해시 <code>'+esc(r.birthStateHash)+'</code> · 전체 행동 SHA256 <code>'+esc(r.fullActionHash)+'</code>. 실제 게임 달성·최고치 미인증.</p>';
};
const unlockRoutes=(db,pid,bid)=>{
 const pair=pid+"|"+bid,r=db.originUnlockSearch?.pairs?.[pair];
 if(!r)return [];
 return [...r.witnessIds,...Object.entries(db.originUnlockContinuation?.routes||{}).filter(([,x])=>x.pair===pair).map(([id])=>id),...extendedRoutes(db,pid,bid,"unlock")].filter(id=>db.witnesses[id]);
};
const eventRoutes=(db,pid,bid)=>{
 const e=db.originEventBirth,r=e?.pairs?.[pid+"|"+bid];return [...(r?.variants||[]).flatMap(id=>e.variants[id].witnessIds),...extendedRoutes(db,pid,bid,"event")].filter(id=>db.witnesses[id]);
};
const bestUnlock=(db,pid,bid)=>[...unlockRoutes(db,pid,bid),...eventRoutes(db,pid,bid)].reduce((a,b)=>!a||total(db.witnesses[b])>total(db.witnesses[a])?b:a,null);
function bestRoute(db,v,groups){
 const ids=[...new Set(groups.flatMap(k=>v.groups[k].representativeIds))];
 return ids.reduce((a,b)=>!a||total(db.witnesses[b])>total(db.witnesses[a])?b:a,null);
}
export function populationBranchMarkup(db,b){
 const p=db?.populationSearch,v=vOf(db);if(!v||!b)return "";
 const j=p.branches.indexOf(b.id);if(j<0)return '<p class="bs-sub">전체 출생처 탐색 대상 1,064개 연구 이력 보유 분기 밖의 후보입니다. 불가능 판정은 아닙니다.</p>';
 const rows=p.origins.map((pid,i)=>{
  const q=pair(db,v,i,j),r=v.records[i],best=bestRoute(db,v,q.ids),unlock=bestUnlock(db,pid,b.id),closure=closurePair(db,pid,b.id);
  return {pid,q,r,best,unlock,closure};
 });
 const covered=rows.filter(r=>r.q.ids.length).length;
 return chronologicalCareerBranchMarkup(db,b.id)+growthReplayBranchMarkup(db,b.id)+assumedBirthBranchMarkup(db,b.id)+'<details class="bs-note" data-population-branch="true"><summary>전체 72개 출생처 탐색 · D'+v.depth+' 제한 모형 '+fmt(covered)+'/72</summary><p class="bs-sub">현재 분기의 최종 활성 연구가 출생과 시술의 필요 연구를 충족하는지 계산했습니다. 출생·이벤트 시점, 시설·재료, 전투 성장 공동 달성 및 진급·훈장·미래 연구는 미증명입니다. 기존 조건부 경로와 별개이며 미충족을 불가능으로 처리하지 않습니다.</p><div class="bs-scroll"><table class="bs-table"><thead><tr><th>출생처</th><th>쌍 상태</th><th>대표 계산 그룹</th><th>제한 모형 최고 단일 합계</th><th>추가 연구·이벤트 모집 후 시술</th><th>깊이 무제한 제한 폐쇄</th></tr></thead><tbody>'+rows.map(({pid,q,r,best,unlock,closure})=>'<tr><td><a href="'+routeLink(pid,b.id,best)+'">'+esc(db.labels[pid.slice(pid.indexOf(":")+1)]||pid)+'</a><small class="bs-sub">'+esc(db.labels[r.body]||r.body)+'</small></td><td>'+esc(q.label)+(q.flags?'<small class="bs-sub">'+esc(q.flags)+'</small>':"")+(r.sourceType==="event"&&q.ids.length?'<small class="bs-sub">제한 수치모형의 이벤트 출생 시점 미확인</small>':"")+'</td><td>'+fmt(q.ids.length)+'</td><td>'+(best?'<a href="'+routeLink(pid,b.id,best)+'">'+fmt(total(db.witnesses[best]))+'</a>':"—")+'</td><td>'+(unlock?'<a href="'+routeLink(pid,b.id,unlock)+'">'+fmt(total(db.witnesses[unlock]))+'점 · 경로</a>':"—")+'</td><td>'+(closure?'<a href="'+routeLink(pid,b.id)+'">'+esc(closureLabel(closure.status))+'</a><small class="bs-sub">전역 미인증</small>':"—")+'</td></tr>').join("")+'</tbody></table></div></details>';
}
export function populationEventOriginMarkup(db,pid,branchId=null,focus=null,labels={}){
 const e=db?.originEventBirth;if(!e)return "";
 const pairs=Object.values(e.pairs).filter(p=>p.origin===pid&&(!branchId||p.branch===branchId));
 if(!pairs.length)return "";
 const ids=pairs.flatMap(p=>eventRoutes(db,p.origin,p.branch)),chosen=ids.includes(focus)?focus:ids.reduce((a,b)=>!a||total(db.witnesses[b])>total(db.witnesses[a])?b:a,null);
 const w=db.witnesses[chosen],r=e.variants[w.populationEvent.variant],root=e.roots[r.root],name=id=>db.labels[id]||id,ranks=new Map(db.branches.map(b=>[b.id,b.rank]));
 const seq=x=>(x.steps||[]).map(s=>name(s.id)).join(" → ")||"시술 없음";
 const row=(title,v)=>'<tr><th>'+esc(title)+'</th>'+v.map(n=>'<td>'+fmt(n)+'</td>').join("")+'</tr>';
 const cols=db.stats.map(k=>'<th>'+esc(labels[k]||k)+'</th>').join("");
 const full=[...root.actions.slice(0,r.insertionAt),...r.extraBeforeBirth,...r.inserted,...root.actions.slice(r.insertionAt)];
 const actions=(xs,offset=0)=>xs.map((s,i)=>'<li'+(s.type==="recruit"?' class="scope-note"':'')+'>'+esc((i+offset+1)+". "+s.type+" · "+name(s.id||s.research||s.transform||s.profile||s.event||s.source||""))+(s.script?' · '+esc(s.script):"")+(s.month!=null?' · '+fmt(s.month)+'개월':"")+(s.items?'<small class="bs-sub">'+esc(Object.entries(s.items).map(([id,n])=>name(id)+" × "+n).join(" / "))+'</small>':"")+'</li>').join("");
 return '<section class="scope-note" data-population-event="true"><h3>이벤트 출생 시간순 조건부 경로</h3>'+researchContinuationNote(db,w)+'<p>선택 범위 '+fmt(pairs.length)+'개 분기 · '+fmt(ids.length)+'개 출생·시술 수치 경로. 기존 연구 이력 중간의 이벤트 발생 조건을 재생했으며, 시작 국가·지역 실제 선택, 추첨, 이벤트 공동 보상과 전투 성장 달성은 미인증입니다.</p><p><b>이벤트:</b> '+esc(name(r.event))+' · 스크립트 <code>'+esc(r.script)+'</code> · 모집 '+fmt(r.birthMonth)+'개월 · 기존 연구 '+fmt(r.insertionAt)+' / '+fmt(root.actions.length)+'단계 뒤 삽입 · 허용 난이도 '+esc(r.allowedDifficulties.join(", "))+' · 분기 #'+fmt(ranks.get(r.branch))+'</p><p>추가 연구·월 이동 '+fmt(r.extraBeforeBirth.length)+'단계 · 확률 및 조건부 '+esc(r.pending.join(" / ")||"없음")+' · 미확인 '+esc(r.unknown.join(" / ")||"없음")+'</p><p>최종 병종 '+esc(name(w.body))+' · '+esc(seq(w))+' · 마지막 전투캡 가정 합계 '+fmt(total(w))+'</p><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>구분</th>'+cols+'</tr></thead><tbody>'+row("시술 직후 원시 (재생)",w.populationEvent.rawBeforeFinalGrowth)+row("마지막 전투캡 원시 (가정)",w.raw)+row("영구 보너스",w.bonus)+row("실효 (가정)",w.vector)+'</tbody></table></div><details><summary>연구와 이벤트 삽입을 포함한 '+fmt(full.length)+'개 행동 및 시술</summary><p>연구 접두부 <code>'+esc(r.historyId)+'</code> · 전체 행동 SHA256 <code>'+esc(r.fullActionHash)+'</code></p><ol>'+actions(full)+actions(w.populationEvent.actions,full.length)+'</ol></details><details><summary>이벤트 대안별 출생·시술 경로 '+fmt(ids.length)+'개</summary><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>분기</th><th>이벤트 스크립트</th><th>월</th><th>시술</th><th>조건부 합계</th></tr></thead><tbody>'+ids.sort((a,b)=>total(db.witnesses[b])-total(db.witnesses[a])).map(id=>{const x=db.witnesses[id],v=e.variants[x.populationEvent.variant];return '<tr><td><a href="'+branchLink(v.branch)+'">#'+fmt(ranks.get(v.branch))+'</a></td><td>'+esc(v.script)+'</td><td>'+fmt(v.birthMonth)+'</td><td>'+esc(seq(x))+'</td><td><a href="'+routeLink(pid,v.branch,id)+'">'+fmt(total(x))+'</a></td></tr>';}).join("")+'</tbody></table></div></details></section>';
}
export function populationUnlockOriginMarkup(db,pid,branchId=null,focus=null,labels={}){
 const u=db?.originUnlockSearch,c=db?.originUnlockContinuation;if(!u)return "";
 const rows=Object.values(u.pairs).filter(p=>p.origin===pid&&(!branchId||p.branch===branchId));
 if(!rows.length)return "";
 const ranks=new Map(db.branches.map(b=>[b.id,b.rank])),name=id=>db.labels[id]||id;
 const candidates=rows.flatMap(p=>unlockRoutes(db,p.origin,p.branch));
 const chosen=candidates.includes(focus)?focus:candidates.reduce((a,b)=>!a||total(db.witnesses[b])>total(db.witnesses[a])?b:a,null);
 const w=db.witnesses[chosen],r=c?.routes?.[chosen],id=w.populationUnlock?.pair||w.populationUnlockContinuation?.pair,p=u.pairs[id];
 const ext=db.originExtendedContinuation?.routes?.[chosen];
 const model=ext?.model?db.originExtendedContinuation.models[ext.model]:r?.model&&c.models[r.model],upper=model?.frontier.reduce((a,b)=>!a||total(b)>total(a)?b:a,null);
 const seq=w=>(w.steps||[]).map(x=>name(x.id)).join(" → ")||"시술 없음";
 const cols=db.stats.map(k=>'<th>'+esc(labels[k]||k)+'</th>').join("");
 const row=(title,v)=>'<tr><th>'+esc(title)+'</th>'+v.map(n=>'<td>'+fmt(n)+'</td>').join("")+'</tr>';
 const acts=s=>esc(s.type+" · "+name(s.id||s.research||s.transform||s.profile||s.source||s.event||""))+(s.items?'<small class="bs-sub">'+esc(Object.entries(s.items).map(([id,n])=>name(id)+" × "+n).join(" / "))+'</small>':"");
 return '<section class="scope-note" data-population-unlock="true"><h3>추가 모집 연구를 시간순으로 재생한 육성 경로</h3>'+researchContinuationNote(db,w)+'<p>선택 범위 '+fmt(rows.length)+'개 분기 · '+fmt(candidates.length)+'개 모집·시술 경로. 선택 분기 #'+fmt(ranks.get(p.branch))+' · 출생 최솟값 · 시술 중간 성장 없음 · 마지막 전투캡 조건부. 연구 표본·자원·이벤트 결과는 조건부이고 실제 최종 달성 인증은 아닙니다.</p><p><b>부족했던 연구:</b> '+p.missing.map(x=>esc(name(x))).join(" / ")+' · 추가 활성 연구 '+fmt(p.addedResearch.length)+'개 · 난이도 허용 '+esc(p.allowedDifficulties.join(", "))+' · 후속 계산 완료 D'+fmt(c?.completed?.[id]||1)+'</p><p>종착 '+esc(name(w.body))+' · '+esc(seq(w))+' · 전투캡 투영 합계 '+fmt(total(w))+'</p><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>구분</th>'+cols+'</tr></thead><tbody>'+row("시술 직후 원시 (재생)",r?.rawBeforeFinalGrowth||w.populationUnlock.rawBeforeFinalGrowth)+row("마지막 전투캡 원시 (가정)",w.raw)+row("영구 보너스",w.bonus)+row("실효 (가정)",w.vector)+(upper?row("별도 성장배치 상계 (미재생)",upper.vector):"")+'</tbody></table></div><details><summary>기존 연구 접두부 '+fmt(u.roots[p.root].actions.length)+'단계 및 추가 연구·모집 '+fmt(p.suffix.length)+'단계</summary><p>접두부 <code>'+esc(p.historyId)+'</code> · 전체 행동 SHA256 <code>'+esc(p.fullActionHash)+'</code></p><ol>'+u.roots[p.root].actions.map(x=>'<li>'+acts(x)+'</li>').join("")+'</ol><h4>추가 행동</h4><ol>'+p.suffix.map(x=>'<li>'+acts(x)+'</li>').join("")+'</ol><h4>시술 행동</h4><ol>'+((r?.actions||w.populationUnlock?.actions||[]).map(x=>'<li>'+acts(x)+'</li>').join(""))+'</ol></details><details><summary>같은 출생처의 모집·후속 시술 경로 '+fmt(candidates.length)+'개</summary><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>분기</th><th>최종 병종</th><th>시술 순서</th><th>마지막 전투캡 합계</th></tr></thead><tbody>'+candidates.sort((a,b)=>total(db.witnesses[b])-total(db.witnesses[a])).map(id=>{const x=db.witnesses[id],b=x.branchIds[0];return '<tr><td><a href="'+branchLink(b)+'">#'+fmt(ranks.get(b))+'</a></td><td>'+esc(name(x.body))+'</td><td>'+esc(seq(x))+'</td><td><a href="'+routeLink(pid,b,id)+'">'+fmt(total(x))+'</a></td></tr>';}).join("")+'</tbody></table></div></details></section>';
}
export function populationOriginMarkup(db,pid,branchId=null,focus=null,labels={}){
 const p=db?.populationSearch,v=vOf(db);if(!v)return "";
 const i=p.origins.indexOf(pid),j=branchId?p.branches.indexOf(branchId):-1;
 if(i<0||branchId&&j<0)return "";
 const r=v.records[i],pairs=v.matrix[i],groups=j<0?[...new Set(pairs.flat())]:pairs[j];
 const scope=j<0?"전체 "+fmt(p.branches.length)+"개 분기":"선택 분기";
 const conditional=v.status[i].split("").filter(c=>c==="1").length;
 const ids=[...new Set(groups.flatMap(k=>v.groups[k].representativeIds))];
 const best=ids.includes(focus)?focus:bestRoute(db,v,groups);
 const w=db.witnesses[best],name=id=>db.labels[id]||id;
 const head=chronologicalCareerOriginMarkup(db,pid,branchId,focus,labels)+growthReplayOriginMarkup(db,pid,branchId,focus,labels)+careerFrontierOriginMarkup(db,pid,branchId,labels)+assumedBirthOriginMarkup(db,pid,branchId,labels)+careerEnvelopeOriginMarkup(db,pid,branchId,labels)+branchInvariantOriginMarkup(db,pid,branchId,labels)+invariantBoundOriginMarkup(db,pid,labels)+closureOriginMarkup(db,pid,branchId,labels)+'<section class="scope-note" data-population-origin="true"><h3>출생처 × 연구 분기 · D'+v.depth+' 제한 수치모형</h3><p>'+esc(scope)+' · 전체 출생처의 기존 조건부 경로 '+fmt(conditional)+'쌍 · 최종 모집 연구 충족 '+fmt(j<0?r.coveredPairs:Number(groups.length>0))+'쌍 · 대표 계산 그룹 '+fmt(groups.length)+'개. 출생 최솟값/최댓값, 전투캡 성장 배치, 활성 연구만 사용한 일반 시술 최대 '+fmt(v.depth)+'회입니다. '+(r.sourceType==="event"?"이벤트 발생·국가 선택과 출생 시점은 아직 확인되지 않았습니다. ":"")+'실물·자금·시설 확보는 가정이며, 승급·훈장·무작위 시술·새 연구 및 전체 최적성은 별도입니다.</p>';
 const branchRows=j<0?'<details><summary>연구 분기별 탐색 상태 '+fmt(p.branches.length)+'쌍</summary><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>분기</th><th>상태</th><th>그룹</th></tr></thead><tbody>'+p.branches.map((bid,k)=>{const q=pair(db,v,i,k),b=db.branches.find(b=>b.id===bid);return '<tr><td><a href="'+branchLink(bid)+'">#'+fmt(b?.rank)+'</a></td><td><a href="'+routeLink(pid,bid)+'">'+esc(q.label)+'</a>'+(q.flags?' · '+esc(q.flags):"")+'</td><td>'+fmt(q.ids.length)+'</td></tr>';}).join("")+'</tbody></table></div></details>':"<p>쌍 상태: "+esc(pair(db,v,i,j).label)+(pair(db,v,i,j).flags?" · "+esc(pair(db,v,i,j).flags):"")+"</p>";
 if(!w)return head+'<p>이 범위의 제한 계산은 미진입입니다. 모집 연구가 다른 시점에 열리거나 추가 연구로 해금될 수 있으므로 불가능 증명으로 사용하지 않습니다.</p>'+branchRows+'</section>';
 const col=db.stats.map(k=>'<th>'+esc(labels[k]||k)+'</th>').join("");
 const row=(title,v)=>'<tr><th>'+esc(title)+'</th>'+v.map(n=>'<td>'+fmt(n)+'</td>').join("")+'</tr>';
 const ws=groups.filter(k=>v.groups[k].representativeIds.includes(best));
 const historyIds=[...new Set(ws.flatMap(k=>v.groups[k].historyIndices))].map(h=>v.histories[h]).filter(h=>!branchId||h.branchId===branchId);
 const seq=x=>(x.steps||[]).map((s,k)=>(x.growthBefore?.[k]?"[전투캡 성장] ":"")+name(s.id)).join(" → ")||"추가 시술 없음";
 return head+'<p>선택 종착 '+esc(name(w.body))+' · 출생 '+(w.birthBand==="max"?"최댓값":"최솟값")+' · '+esc(seq(w))+' · 마지막 전투캡 성장 가정 · 직접 시술비 '+fmt(w.fees)+' · 합계 '+fmt(total(w))+'</p><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>능력치</th>'+col+'</tr></thead><tbody>'+row("원시",w.raw)+row("영구 보너스",w.bonus)+row("실효",w.vector)+'</tbody></table></div><p>필요 연구: '+w.research.map(x=>esc(name(x))).join(" / ")+' · 연구 이력 참조 '+fmt(historyIds.length)+'개</p><details><summary>해당 모형의 연구 이력 별칭</summary>'+historyIds.map(h=>'<p><code>'+esc(h.id)+'</code> · '+fmt(h.steps)+'단계 · <a href="'+branchLink(h.branchId)+'">분기</a></p>').join("")+'</details><details><summary>제한 모형 대표 경로 '+fmt(ids.length)+'개</summary><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>최종 병종</th><th>시술</th><th>직접 시술비</th><th>합계</th></tr></thead><tbody>'+ids.sort((a,b)=>total(db.witnesses[b])-total(db.witnesses[a])).map(id=>{const x=db.witnesses[id];return '<tr><td>'+esc(name(x.body))+'</td><td>'+esc(seq(x))+'</td><td>'+fmt(x.fees)+'</td><td><a href="'+routeLink(pid,branchId,id)+'">'+fmt(total(x))+'</a></td></tr>';}).join("")+'</tbody></table></div></details>'+branchRows+'<p><a href="'+esc(new URL("./data/"+v.file,import.meta.url).href)+'">전체 보존 상태·행동 순서·전이 그래프 원장 (gzip)</a> · '+fmt(v.bytes/1048576)+' MiB · SHA256 <code>'+esc(v.sha256)+'</code></p></section>';
}
