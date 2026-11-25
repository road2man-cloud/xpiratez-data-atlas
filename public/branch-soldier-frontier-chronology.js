// Fixed frontier proposals replayed from original minimum-birth records.
// Display chronological evidence separately from numerical closure and
// never count promotion, medal, resource or RNG assumptions as gameplay.
import {researchWitnessSummary as rw} from "./branch-soldier-research-witness-summary.js?v=20261126-active-sets-20-pair25";
import {researchSetSummary as rs} from "./branch-soldier-research-set-summary.js?v=20261126-active-sets-20-pair25";
import {activeClosureSummary as ac} from "./branch-soldier-active-closure-summary.js?v=20261126-active-closure-3";
import {researchExpansionSummary as re} from "./branch-soldier-research-expansion-summary.js?v=20261126-alternating-1";
import {expandedClosureSummary as ec} from "./branch-soldier-expanded-closure-summary.js?v=20261126-alternating-1";
import {alternatingSummary as alt} from "./branch-soldier-alternating-v6-summary.js?v=20261126-alternating-6";
import {fixedModelOptimaSummary as opt} from "./branch-soldier-fixed-model-optima-summary.js?v=20261126-alternating-6";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=v=>Number.isFinite(v)?v.toLocaleString("ko-KR",{maximumFractionDigits:2}):"—";
const name=(db,k)=>db.labels?.[k]||db.labels?.[String(k).slice(String(k).indexOf(":")+1)]||k;
const sum=v=>v.reduce((s,x)=>s+x,0);
const delta=n=>n==null?"비교 근거 없음":(n>0?"+":"")+fmt(n);
const recoveryLabels={INSERT_CAP_BEFORE_GATE:"조건 앞 전투캡 성장",SWAP_GATE_WITH_NEXT_TRANSFORM:"인접 시술 순서 교환",DROP_BLOCKED_TRANSFORM:"막힌 시술 제외",DROP_GATE_AND_LATER_PROMOTIONS:"막힌 시술·후속 승급 제외",DROP_UNINDEXED_PROMOTIONS:"미색인 승급 제외",DROP_PROMOTIONS_AND_RANK_GATED_TRANSFORMS:"승급·계급 요구 시술 제외",PREFIX_BEFORE_GATE_THEN_CAP:"조건 직전 부분 경로 + 성장"};
const link=(pid,bid,id)=>{const u=new URL("./soldiers/modern/",import.meta.url);u.searchParams.set("profile",pid);u.searchParams.set("branch",bid);u.searchParams.set("populationRoute",id);u.hash="originDetails";return esc(u.href);};
const table=(cols,rows,cls="bs-table")=>'<div class="bs-scroll"><table class="'+cls+'"><thead><tr>'+cols.map(k=>'<th>'+esc(k)+'</th>').join("")+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+x+'</td>').join("")+'</tr>').join("")+'</tbody></table></div>';
function action(db,a){
 if(a.type==="transform")return name(db,a.transform);
 if(a.type==="conditionalPromotion")return "[승급 가정 "+a.rank+"]";
 if(a.type==="conditionalMedal")return "[훈장 가정 "+name(db,a.medal)+" "+a.level+"]";
 if(a.type==="conditionalCapGrowth")return "[전투캡 성장 가정]";
 if(a.type==="externalInputs")return "[자원·시설 가정]";
 if(a.type==="advanceMonth")return "[월 진행 가정 "+a.month+"]";
 if(a.type==="research"||a.type==="freeResearch"||a.type==="eventResearch"||a.type==="missionResearch"||a.type==="repeatResearch")return "[연구 "+name(db,a.id||a.research)+"]";
 return "["+a.type+(a.id?" "+name(db,a.id):"")+"]";
}
function closureRoots(db){
 const a=db.populationFrontierChronology;
 if(!a||ac.sourceMetadataSha256!==db.sourceMetadataSha256)return [];
 return ac.details.filter(x=>a.routes[x.id]?.fullActionHash===x.rootActionHash&&a.routes[x.id]?.canonicalStateHash===x.rootStateHash&&a.activeResearchIndex?.refs?.[x.id]?.set===x.researchSet);
}
function alternatingMarkup(db,filter=null){
 if(alt.sourceMetadataSha256!==db.sourceMetadataSha256||alt.sourceExpansionFingerprint!==ec.sourceExpansionFingerprint)return "";
 const roots=new Map(closureRoots(db).map(x=>[x.id,x]));
 const rows=alt.details.filter(x=>{const r=roots.get(x.root);return r&&r.rootActionHash===x.rootActionHash&&r.rootStateHash===x.rootStateHash&&(!filter||filter(x));});
 if(!rows.length)return "";
 const closed=rows.filter(x=>x.scopeComplete).length,global=!filter&&rows.length===alt.details.length;
 const stages=global?'<p>동적 연구 목표 작업 '+fmt(alt.attempted)+' / '+fmt(alt.goalTasks)+' 시도 ('+fmt(100*alt.attempted/alt.goalTasks)+'%). 신규 연구 세트에서 발생한 목표 '+fmt(alt.taskSources.R)+'개 포함. 미시도 '+fmt(alt.pending)+'개 · 제한 탐색 미해결 '+fmt((alt.counts.LIMITED_PLANNER_UNRESOLVED||0)+(alt.counts.JOINT_REPLAY_UNRESOLVED||0))+'개 · 현재 분기 정책 제외 '+fmt(alt.counts.CURRENT_BRANCH_POLICY_EXCLUDED||0)+'개. 연구 획득 순서 대안 전체의 완료율이 아닙니다.</p>':'';
 const reuse=global?'<p>공유 연구 목표 그룹 '+fmt(alt.researchGoalGroups)+'개 · 시도 그룹 '+fmt(alt.attemptedGroups)+'개 · 연구 경로 확보 그룹 '+fmt(alt.successfulGroups)+'개. 그룹은 활성·비활성 연구 세트, 분기 및 목표 연구 집합을 기준으로 묶은 계산 재사용 단위이며 병종 상태의 동등성이나 전체 획득 순서의 완전성을 뜻하지 않습니다. 미해결 목표 대체 경로 재시도 '+fmt(alt.retryCount)+'건 · 재생 성공으로 전환 '+fmt(alt.recoveredCount)+'개.</p>':'';
 const batch=global?'<p><strong>공유 연구 이력 일괄 재생</strong> '+fmt(alt.batchSuccesses)+' / '+fmt(alt.batchAttempts)+'건 성공 · 다른 출생처 '+fmt(alt.batchCrossOriginSuccesses)+'건 · 동일 연구 세트 '+fmt(alt.batchExactSetSuccesses)+'건 (중복 집계 가능). 실패한 재생은 불가능 판정이 아닙니다. 기존 중간 원장에 지배되지 않는 영구 능력치 벡터 '+fmt(alt.novelLedgerVectors)+'개 · 동일 병종의 12능력치가 하나도 감소하지 않고 증가한 출발 상태 '+fmt(alt.strictImprovementRoots)+'개.</p>':'';
 const proofs=opt.sourceMetadataSha256===db.sourceMetadataSha256?opt.certificates.filter(c=>rows.some(x=>x.id===c.graph)):[];
 const pairs=new Set(proofs.map(x=>x.origin+"|"+x.branch)).size;
 const bound=global?'<p><strong>시술 횟수 제한 없는 고정 연구 모형 상계</strong> · 12능력치 유한 상계 '+fmt(alt.boundSummary.allStatsFinite)+' / '+fmt(rows.length)+'개 출발 상태 · 개별 능력치 상계 도달 '+fmt(alt.boundSummary.attainedAxes)+' / '+fmt(rows.length*12)+'항목 · 혈연중시 반복 동등 상태 '+fmt(alt.convergence.selfLoops)+'건.</p>':'';
 const proofMarkup=proofs.length?'<p><strong>12능력치 동시 상계 도달 '+fmt(proofs.length)+'개 기록 / '+fmt(pairs)+'개 출생처·분기 조합.</strong> 고정 연구와 지원 결정론적 생존 시술·성장 모형에 한정됩니다. 실제 게임 전역 최종 인증은 아닙니다. <a href="'+esc(new URL("./soldiers/modern/?group=routes&fixedOptimumOnly=1#originMaxima",import.meta.url).href)+'">해당 육성 경로 보기</a> · <a href="'+esc(new URL("./data/"+opt.file,import.meta.url).href)+'">상계 도달 근거 원장</a></p>':'';
 const compared=rows.filter(x=>x.transition),raised=compared.filter(x=>x.transition.raisedAxes>0);
 const transitionMarkup='<p><strong>연구 획득 전후 상계 비교</strong> · '+fmt(compared.length)+'개 전환 비교 · '+fmt(raised.length)+'개 상계 상승. 연구 전후의 별도 완화 상계를 비교한 값이며 능력치 증가를 보장하지 않습니다.'+(global?' · 실제 조건부 상계 초과 대표 경로 '+fmt(opt.breakthroughWitnesses)+'개 / '+fmt(opt.breakthroughPairs)+'개 출생처·분기 조합':'')+'. <a href="'+esc(new URL("./soldiers/modern/?group=routes&transitionBreakthroughOnly=1#originMaxima",import.meta.url).href)+'">병종 DB에서 연구 전 상계 초과 경로 보기</a></p>';
 const gain=x=>x.bestImprovement?'<details><summary>영구 합계 +'+fmt(x.bestImprovement.gain)+'</summary><p>'+esc(name(db,x.bestImprovement.body))+' · 동일 병종, 감소 능력치 없음. '+esc(x.bestImprovement.delta.map((v,i)=>v>0?(db.statLabels?.[db.stats[i]]||db.stats[i])+' +'+fmt(v):null).filter(Boolean).join(" · "))+'</p><p>조건부 재생 대표 개선 상태이며 최종 상한이 아닙니다.</p></details>':'—';
 return '<details class="bs-note"><summary>연구·시술 교대 탐색 V6 · 신규 연구 상태 '+fmt(rows.length)+'개 · 범위 종결 '+fmt(closed)+'개</summary><p><strong>조건부 탐색이며 최종 인증 아님.</strong> 추가 연구를 실제 행동 순서로 재생한 뒤 시술·성장을 확장하고, 새로 도달한 상태마다 추가 연구 목표를 자동 생성합니다. 고정 연구 세트 내 동등 상태 압축은 연구 획득 시점 간 동등성 증명이 아니므로 해당 시점은 미해결로 보존합니다.</p>'+stages+reuse+batch+bound+proofMarkup+transitionMarkup+'<p><a href="'+esc(new URL("./soldiers/modern/?group=routes#originMaxima",import.meta.url).href)+'">육성 비교에서 교대 탐색 대표 경로와 전체 시간순 행동 보기</a> · 전체 상태 '+fmt(alt.states)+'개 · 처리 '+fmt(alt.processed)+'개 · 대기 '+fmt(alt.pendingStates)+'개. 대표 경로는 비교용이며 나머지 상태를 삭제하지 않습니다.</p>'+table(["출생처","연구 확장 차수","추가 지원 시술","상태 / 처리","최대 동시 특성","능력치 개선","상계 도달 항목","연구 전후 상계 상승 항목","조건부 판정"],rows.map(x=>['<a href="'+link(x.origin,x.branch,x.root)+'">'+esc(name(db,x.origin))+'</a>',fmt(x.generation),esc(x.newlySupported.map(k=>name(db,k)).join(" · ")||"없음"),fmt(x.states)+' / '+fmt(x.processed),fmt(x.maxTraits),gain(x),x.upper?fmt(x.upper.attained)+" / 12":"—",x.transition?fmt(x.transition.raisedAxes)+" / 12":"—",x.scopeComplete?"범위 종결":"미종결 / 미해결"]))+'<p><a href="'+esc(new URL("./data/"+alt.file,import.meta.url).href)+'">교대 탐색 연구·시술 순서, 상태 그래프 및 대기 원장 (gzip)</a></p></details>';
}
function researchExpansionMarkup(db,filter=null){
 if(re.sourceMetadataSha256!==db.sourceMetadataSha256||ec.sourceMetadataSha256!==db.sourceMetadataSha256||re.sourceClosureFingerprint!==ac.fingerprint)return "";
 const valid=new Set(closureRoots(db).filter(x=>x.scopeComplete).map(x=>x.id));
 const rows=re.rows.filter(x=>valid.has(x.root)&&(!filter||filter(x)));
 if(!rows.length)return "";
 const closure=new Map(ec.details.map(x=>[x.id,x]));
 const matches=rows.map(x=>[x,closure.get(x.id)]).filter(([x,c])=>c&&c.root===x.root&&c.researchSet===x.resultSet&&c.sourceSet===x.sourceSet);
 const done=matches.filter(([,c])=>c.scopeComplete).length;
 const global=!filter&&rows.length===re.rows.length&&valid.size===re.roots;
 const goals=global?'<p>연구 목표 시도 '+fmt(re.attempted)+' / '+fmt(re.goalTasks)+' ('+fmt(100*re.attempted/re.goalTasks)+'%) · 연구 재생 성공 '+fmt(re.expandedStates)+' · 미해결 '+fmt(re.counts.LIMITED_UNRESOLVED||0)+' · 현재 분기 정책 제외 '+fmt(re.counts.EXCLUDED_BY_CURRENT_BRANCH_POLICY||0)+' · 미시도 '+fmt(re.pending)+'. 전체 게임 경우의 수가 아닌 초기 종결 대표 상태의 지원 연구 목표만 집계합니다.</p>':'';
 return '<details class="bs-note"><summary>확장 연구 세트 및 후속 시술 · 조건부 종결 '+fmt(done)+' / '+fmt(rows.length)+'</summary><p><strong>최종 인증 아님.</strong> 종결된 대표 상태에서 실제 색인 연구 행동을 순서대로 재생한 뒤, 확장 연구를 고정하고 시술을 재탐색했습니다. 연구 이전의 반복 상태 압축 때문에 누락될 수 있는 다른 연구 시점, 자원 획득, 무작위 행동, 대체 연구 순서는 미해결입니다.</p>'+goals+table(["출발 경로","연구 추가 / 비활성","새로 지원되는 시술","후속 도달 상태","조건부 판정"],rows.map(x=>{const c=matches.find(([r])=>r.id===x.id)?.[1];return ['<a href="'+link(x.origin,x.branch,x.root)+'">'+esc(name(db,x.origin))+'</a>',fmt(x.addedActive)+' / '+fmt(x.lostActive),esc(x.newlySupported.map(k=>name(db,k)).join(" · ")||"없음"),fmt(c?.states),c?.scopeComplete?"범위 종결":c?"미종결 / 미해결":"미탐색"];}))+'<p><a href="'+esc(new URL("./data/"+re.file,import.meta.url).href)+'">연구 획득 순서·지원 시술 근거</a> · <a href="'+esc(new URL("./data/"+ec.file,import.meta.url).href)+'">확장 상태 그래프·파레토 후보</a></p></details>';
}
function closureMarkup(db,filter=()=>true){
 const roots=closureRoots(db).filter(filter);
 if(!roots.length)return "";
 const closed=roots.filter(x=>x.scopeComplete).length,denom=roots.length,percent=100*closed/denom;
 return '<details class="bs-note"><summary>고정 연구 조건부 탐색 종결 '+fmt(closed)+' / '+fmt(denom)+' ('+fmt(percent)+'%)</summary><p><strong>최종 육성 인증 아님.</strong> 이미 확보한 출발 상태에서 활성 연구를 고정한 결정론적 시술·전투캡 성장 범위만 탐색했습니다. 미확인 연구, 부분 성장, 확률·사망·복제·계급·훈장·시간·자원 획득은 미해결입니다. 자금 보충 가정과 비제거 이력·보너스 횟수의 동등 상태 압축은 이 조건부 모델에만 적용합니다.</p>'+table(["출발 경로","도달 상태","동등 상태 참조","미해결 / 미지원","조건부 판정"],roots.map(x=>['<a href="'+link(x.origin,x.branch,x.id)+'">'+esc(name(db,x.origin))+'</a>',fmt(x.states),fmt(x.aliases),fmt(x.unresolved)+' / '+fmt(x.unsupported),x.scopeComplete?"범위 종결":x.pending?"대기열 남음":"미해결 조건 있음"]))+'<p><a href="'+esc(new URL("./data/"+ac.file,import.meta.url).href)+'">조건부 상태 그래프·후속 행동·압축 근거 다운로드 (gzip)</a></p></details>';
}
export function frontierChronologyCoverage(db){
 const s=db.populationFrontierChronology?.summary;
 return s?" · 중간 육성 탐색 "+fmt(s.registeredRoutes)+"경로 · 최종 비교 인증 "+fmt(s.globalOptimalCertified??0)+"건.":"";
}
export function frontierChronologyMarkup(db){
 const a=db.populationFrontierChronology;if(!a)return "";
 const s=a.summary,t=s.totals;
 const branchCount=db.branches.filter(b=>b.historyCount>0&&!b.sourceRootConflict).length;
 const baseTotal=72*branchCount; // V5.14 fixed origin scope; not exhaustive histories.
 const indexFresh=rw.routeCount===s.registeredRoutes&&rw.birthCount===s.coverage?.birthInputs&&rw.sourceLedgerFingerprint===a.fingerprint;
 const researchIndexMarkup='<p><strong>공유 연구 이력 색인 (조건부)</strong> · '+fmt(rw.historyCount)+'개 연구 이력 · '+fmt(rw.crossOriginHistories)+'개 복수 출생처 공유 이력 · '+fmt(rw.uniqueGateGroups)+'개 연구 접두 상태·시술 연결 그룹. 원래 연구 행동 '+fmt(rw.researchSteps)+'개 → 공유 접두 노드 '+fmt(rw.uniqueResearchPrefixes)+'개. '+(indexFresh?'현재 원장 건수·지문 일치.':'원장 변경 가능성: 색인 갱신 필요.')+' 연구 행동 색인은 실제 활성 연구 및 자원·이벤트·병종 조건의 독립 인증이 아닙니다. <a href="'+esc(new URL('./data/'+rw.file,import.meta.url).href)+'">연구·시술 연결 색인 다운로드</a></p>';
 const finalProgress='<p><strong>기준 대분류 최종 탐색 인증: 0 / '+fmt(baseTotal)+' (0%).</strong> '+fmt(branchCount)+'개 조건부 연구 부모 × 기준 출생처 72개. 세부 연구 이력·모집·시술 순서의 전체 경우의 수는 미확정입니다. 고정 연구 조건부 상태 그래프와 전체 게임 최종 인증은 별도입니다. 게임 규칙 전체의 후속 행동 열거가 미완료입니다. 최종 순위 없음.</p>';
 const rows=[["원본 모집 입력",fmt(s.birthInputs)],["원래 후보 시도 / 전체 순서 재생",fmt(s.attempted)+" / "+fmt(s.replayedProposals)],["등록 경로 (부분 경로 포함)",fmt(s.independentRouteReplays)],["승급 전 대체 경로 재생 / 신규 후보",fmt(s.adaptedAttempts??0)+" / "+fmt(s.adaptedRoutes??0)],["기존 모델 미해결 후보 (재시도 기록 보존)",fmt(s.unresolvedProposals)],["선별 대기열 미착수 제안 (전수 아님)",fmt(s.remainingProposals)],["계급표 색인 우선 대안 시도 / 재생",fmt(s.alternativeDirectionalAttempts??0)+" / "+fmt(s.alternativeDirectionalSuccesses??0)],["최근 등록 모집 행동 실행 / 공유",fmt(s.registration?.independentBirthSteps)+" / "+fmt(s.registration?.sharedBirthSteps)],["기존 시간순 원장 대비 비지배 후보 / 조합",fmt(s.improvedRoutes)+" / "+fmt(s.improvedPairs)],["고정 수치 후보와 영구 벡터 일치",fmt(s.exactNumericMatches)],["추가 연구 포함 경로",fmt(s.additionalResearchRoutes)],["추가 활성 연구 종류",fmt(s.researchTopics)],["최대 영구 합계 개선",delta(s.maxSumDelta)],["공유 연구 템플릿 재생 / 시도",fmt(t.planner_templateHits)+" / "+fmt(t.planner_templateTrials)],["누적 탐색 시간",fmt(s.cumulativeSeconds)+"초"],["전역 완전 판정",fmt(s.fullCompleted)]];
 if(s.researchSegmentRound){const q=s.researchSegmentRound;rows.push(["공유 연구 행동 블록 / 재생 요청",fmt(q.blocks)+" / "+fmt(q.queries)],["연구 블록 재사용 성공 / 시도",fmt(q.accepted)+" / "+fmt(q.tries)],["동일 분기 연구 블록 성공 / 다른 분기 제안 성공",fmt(q.sameBranch)+" / "+fmt(q.crossBranch)]);}
 if(s.activeResearchSetIndex){const q=s.activeResearchSetIndex,z=s.activeResearchSetRound||{},eligible=Object.values(a.routes).filter(r=>!r.rankDefault).length;rows.push(["조건부 재생 활성 연구 세트 / 공유 세트",fmt(q.sets)+" / "+fmt(q.crossOriginSets)],["활성 연구 세트 색인 경로 / 대상 경로",fmt(q.indexedRoutes)+" / "+fmt(eligible)],["색인 출생처 / 연구 분기",fmt(q.origins)+" / "+fmt(q.branches)],["활성 연구 조건 통과 시술 후보 (경로별 합계)",fmt(q.gatePairs)],["최근 활성 연구 세트 내 신규 시술 경로",fmt(z.newRoutes)],["시술 이력 사전 제외 후보 (최근 실행)",fmt(z.historyGateMetrics?.excludedEdges)],["시술 이력 색인 경로",fmt(Object.keys(a.activeResearchIndex?.historyRefs||{}).length)]);}
 if(rs.sourceLedgerHash===rw.sourceLedgerHash&&indexFresh)rows.push(["공통 연구 이력 연결 시술 집합 (조건부)",fmt(rs.matchedSets)+" / "+fmt(rs.sets)],["연결된 중간 경로 / 최대 서로 다른 시술",fmt(rs.routes)+" / "+fmt(rs.maxDistinctTransforms)]);
 if(s.coverage)rows.unshift(["시간순 원장 모집 입력 확보 / 전체 색인",fmt(s.coverage.coveredInputs)+" / "+fmt(s.coverage.birthInputs)],["중간 경로 확보 조합 / 색인 조합",fmt(s.coverage.coveredPairs)+" / "+fmt(s.coverage.indexedPairs)],["출생처 / 연구 분기 (중간 경로)",fmt(s.coverage.coveredOrigins)+" / "+fmt(s.coverage.coveredBranches)],["미등록 모집 입력",fmt(s.coverage.missingInputs)]);
 if(s.recoveryVariantAttempts!=null)rows.push(["조건 대체 재생 시도 / 성공",fmt(s.recoveryVariantAttempts)+" / "+fmt(s.recoveryVariantSuccesses)],["신규 대체 비지배 경로",fmt(s.recoveryVariantRoutes)],["대체 대기열 잔량 (제한 탐색)",fmt(s.recoveryRemaining)]);
 if(s.rankDefaultAttempts!=null)rows.push(["기본 계급 조건부 재생 시도 / 성공",fmt(s.rankDefaultAttempts)+" / "+fmt(s.rankDefaultSuccesses)],["기본 계급 신규 경로",fmt(s.rankDefaultRoutes)],["기본 계급 재시도 대기",fmt(s.rankDefaultRemaining)],["기본 계급 적용 병종",s.rankDefaultBodies.map(k=>name(db,k)).join(" · ")]);
 if(s.birthExpansionInputs!=null)rows.push(["신규 모집 입력 / 재생 시도",fmt(s.birthExpansionInputs)+" / "+fmt(s.birthExpansionAttempts)],["신규 출생 전투캡 / 추가 시술·연구 경로",fmt(s.birthExpansionCapRoutes)+" / "+fmt(s.birthExpansionResearchRoutes)],["신규 출생 재생 대기 (제한 탐색)",fmt(s.birthExpansionRemaining)]);
 if(s.chainAttempts!=null)rows.push(["복수 시술 연쇄 재생 시도 / 등록",fmt(s.chainAttempts)+" / "+fmt(s.chainRoutes)],["연쇄 후보 잔량 (최근 대기열 스냅샷)",fmt(s.chainRemaining)]);
 if(s.chainDepths)rows.push(["시술 연쇄 단계별 경로",Object.entries(s.chainDepths).map(([k,v])=>k+"단계 "+fmt(v)+"개").join(" · ")]);
 if(s.chainMaxDepth!=null)rows.push(["묶음 연쇄 탐색 제한 단계 (별도 전구간 탐색 제외)",fmt(s.chainMaxDepth)],["동일 상태의 성공 후속 경로 재사용 (신규 경로 제외)",fmt(s.chainAliasCount)],["분기 금지 연구 사전 판정",fmt(s.chainSchedulerTotals?.staticBlocked)]);
 if(a.horizonPolicy)rows.push(["별도 전구간 연쇄 탐색 단계 제한","없음 (지원되는 결정론적 시술, 제한된 실행 예산)"],[s.activeResearchSetRound?"전구간 누적 등록 경로 / 활성 연구 세트 최근 대기열":"전구간 탐색 등록 경로 / 최근 대기열",fmt(s.horizonRoutes)+" / "+fmt(s.horizonPending)],["전구간 단계별 등록",Object.entries(s.horizonDepths||{}).map(([k,v])=>k+"단계 "+fmt(v)+"개").join(" · ")]);
 if(s.rankHorizonRoutes!=null)rows.push(["기본 계급 경로 후속 전구간 탐색","시술 횟수 제한 없음 (조건부 기본 계급·지원 시술)"],["기본 계급 후속 등록 경로 / 대기 후보",fmt(s.rankHorizonRoutes)+" / "+fmt(s.rankHorizonPending)],["기본 계급 후속 시술 단계별 등록",Object.entries(s.rankHorizonDepths||{}).map(([k,v])=>k+"단계 "+fmt(v)+"개").join(" · ")]);
 if(s.rankTraitSummary){const t=s.rankTraitSummary;rows.push(["실제 재생 보너스 ID 확인 경로",fmt(t.measured)],["새 영구 특성 획득 / 보유 특성 순증 경로",fmt(t.gained)+" / "+fmt(t.netGain)],["기존 특성 소실 / 추가 연구 경로",fmt(t.lost)+" / "+fmt(t.research)],["확인한 최대 동시 보유 특성 종류 (부분 탐색)",fmt(t.maxTraits)],["새로 획득한 특성 종류 / 출생처",fmt(t.uniqueGainedTraits)+" / "+fmt(t.gainedOrigins)],["신규 특성 우선 / 반복 시술 대기",fmt(s.rankTraitRound?.regularPending)+" / "+fmt(s.rankTraitRound?.deferredPending)]);}
 if(s.retainedTraitSummary){const t=s.retainedTraitSummary;rows.push(["일반 출생처 실제 보유 특성 확인 경로",fmt(t.measured)],["일반 출생처 특성 순증 / 소실",fmt(t.netGain)+" / "+fmt(t.lost)],["추가 연구 경로 / 새 특성 종류",fmt(t.research)+" / "+fmt(t.gainedTypes.length)],["특성 증가 출생처 / 조합",fmt(t.gainedOrigins)+" / "+fmt(t.gainedPairs)],["동시 보유 특성 최대 (중간 상태)",fmt(t.maxTraits)]);}
 if(s.traitCoverage){const c=s.traitCoverage;rows.push(["영구 특성 실측 출생처 / 전체 출생처",fmt(c.measuredOrigins)+" / "+fmt(c.origins)],["시간순 원장은 있으나 특성 미측정 / 원장 없음",fmt(c.unmeasuredWithRoutes)+" / "+fmt(c.missingOrigins)],["특성 측정 경로 / 출생처·분기 조합",fmt(c.measuredRoutes)+" / "+fmt(c.measuredPairs)]);}
 if(s.priorityPolicy)rows.push(["명시적 금지 연구 판정 그룹 / 제외 후보 (최근 스냅샷)",fmt(s.staticGateGroups)+" / "+fmt(s.staticGateEdges)],["시술 이력 선행 판정 (최근 실행)",fmt(s.unifiedRound?.historyRejected)],["고점 우선순위","룰셋 변화량 참고 · 후보 순서 조정만 · 수치상 불리한 경로 삭제 없음"]);
 if(s.plateauSummary){const p=s.plateauSummary;rows.push(["연쇄 영구 능력치 변화 / 동일 수치·상이한 전체 상태",fmt(p.changedVector)+" / "+fmt(p.sameVector)],["전체 상태까지 동일한 순환",fmt(p.exactLoops)],["동일 수치 시술 종류",Object.entries(p.rules).map(([k,v])=>name(db,k)+" "+fmt(v)+"개").join(" · ")||"없음"],["일반 / 반복 시술 대기열",fmt(s.plateauRegularPending)+" / "+fmt(s.plateauDeferredPending)],["반복 시술 우선순위","저우선순위 별도 탐색 · 삭제 없음 · 전체 상태 동일성 미입증"]);}
 if(s.unifiedTotals){const c=s.unifiedTotals,n=c.seedHits+c.seedReplays;rows.push(["통합 탐색 성공 경로 재사용 참조 (신규 경로 미합산)",fmt(s.unifiedReuseCount)],["통합 탐색 선행 상태 재사용 / 재생",fmt(c.seedHits)+" / "+fmt(c.seedReplays)],["통합 탐색 상태 캐시 적중률",n?fmt(100*c.seedHits/n)+"%":"—"],["통합 탐색 활성 연구 시술 / 추가 연구 계획",fmt(c.activeTransforms)+" / "+fmt(c.researchPlans)]);}
 if(s.chainSchedulerTotals){const c=s.chainSchedulerTotals,n=c.seedHits+c.seedReplays;rows.push(["연쇄 선행 상태 재사용 / 재생",fmt(c.seedHits)+" / "+fmt(c.seedReplays)],["연쇄 상태 캐시 적중률",n?fmt(100*c.seedHits/n)+"%":"—"],["활성 연구 시술 / 추가 연구 계획",fmt(c.activeTransforms)+" / "+fmt(c.researchPlans)]);}
 const rankNote=a.rankPolicy?'<p>기본 계급 조건부 모델: <a href="https://github.com/MeridianOXC/OpenXcom/blob/oxce-plus/src/Savegame/Soldier.cpp">OXCE 공개 엔진 소스</a>의 기본 계급 동작을 반영했습니다. 설치된 8.7 빌드와의 정확한 일치 및 실제 승급 획득 조건은 미확인입니다. 기존 모델의 미해결 기록을 변경하지 않습니다.</p>':"";
 const recoveryRows=Object.entries(s.recoveryByKind||{}).map(([k,v])=>[recoveryLabels[k]||k,fmt(v.attempted),fmt(v.completed),fmt(v.registered),fmt(v.failed)].map(esc));
 const top=s.top.map(x=>['<a href="'+link(x.origin,x.branch,x.id)+'">'+esc(name(db,x.origin))+'</a>',esc(name(db,x.body))+(a.routes[x.id]?.rankDefault?' · 기본 계급 조건부':''),fmt(x.baselineBestSum),fmt(x.total),delta(x.sumDelta)]);
 const reasons=new Map();for(const x of Object.values(a.attempts))if(x.status==="LIMITED_UNRESOLVED")reasons.set(x.reason,(reasons.get(x.reason)||0)+1);
 const coverageRows=Object.entries(s.traitCoverage?.byOrigin||{}).sort((a,b)=>Number(b[1].maxTraits??-1)-Number(a[1].maxTraits??-1)||a[0].localeCompare(b[0])).map(([pid,o])=>{const r=a.routes[o.bestRoute];return [r?'<a href="'+link(pid,r.branch,o.bestRoute)+'">'+esc(name(db,pid))+'</a>':esc(name(db,pid)),fmt(o.routes),fmt(o.measured),fmt(o.measuredPairs),o.maxTraits===null?"미측정":fmt(o.maxTraits),o.routes?"중간 상태":"시간순 원장 미확보"];});
 const coverageMarkup=coverageRows.length?'<details><summary>전체 출생처별 실측 특성 보유량 (최종 상한 아님)</summary><p>미측정은 특성 0개가 아니라 증거 부족입니다. 수치는 재생한 영구 보너스 ID 종류 수이며 출생 특성을 포함합니다.</p>'+table(["출생처","시간순 경로","실측 경로","실측 분기","동시 보유 최대","상태"],coverageRows)+'</details>':"";
 const failed=[...reasons].map(([reason,n])=>[esc(reason==="Promotion rank list unindexed"?"계급표 미색인":reason),fmt(n)]);
 return '<details open class="bs-note" data-population-frontier-chronology="true"><summary>중간 육성 경로 원장 (최종 비교 제외)</summary>'+finalProgress+researchIndexMarkup+closureMarkup(db)+researchExpansionMarkup(db)+alternatingMarkup(db)+'<p><strong>최종 비교 인증 '+fmt(s.globalOptimalCertified??0)+'건.</strong> 연구 상호배제, 실제 획득 조건, 성장·시술의 모든 후속 가능성 및 최적성 증명이 충족되기 전에는 최종 조합으로 표시하지 않습니다. 시술 횟수는 완료 기준이 아닙니다.</p><p>원래 고정 수치 후보의 시술 순서를 원본 최솟값 출생에서 재생합니다. 필요한 연구를 순서대로 획득하고 수치를 다시 계산합니다. 최대 출생 수치를 부여하지 않습니다. 성장·승급·훈장·자원·이벤트는 가정이며 무작위 시술과 미확인 계급은 제외 또는 미해결로 남깁니다. 계급표가 없어 막힌 경우 승급 전 시술까지만 재생하고 전투캡 성장을 적용한 대체 후보를 별도로 표시합니다. 원래 경로 성공으로 계산하지 않습니다. 색인 모집과 지원 시술을 기준으로 대기열을 확장했습니다. 고정 연구 상태에서 추가 시술이 없는 그룹도 실제 모집 이후 전투캡 성장 및 신규 연구·시술 후보를 별도로 재생합니다. 조건 미충족 후보는 성장 삽입·시술 순서 교환·일부 행동 제외 등으로 대체 재생합니다. 대체 성공은 원래 경로 성공이 아니며, 잔여 제안 0은 전체 고점 후보의 전수 재생 완료를 뜻하지 않습니다. 완전 판정에 합산하지 않습니다.</p>'+rankNote+table(["측정 지표","값"],rows.map(r=>r.map(esc)))+coverageMarkup+'<details><summary>중간 상태 수치 참고 (최종 순위 아님)</summary>'+table(["출생처","현재 병종","이전 중간 합계","재생 중간 합계","차이"],top)+'</details>'+(failed.length?table(["미해결 이유","후보"],failed):"")+(recoveryRows.length?table(["대체 방식","시도","재생 성공","신규 등록","미해결"],recoveryRows):"")+'<p><a href="'+esc(new URL("./data/"+a.file,import.meta.url).href)+'">시간순 행동·모집·연구 연결 원장 (gzip)</a></p></details>';
}
export function frontierChronologyBranchMarkup(db,bid){
 const a=db.populationFrontierChronology;if(!a)return "";
 const best=new Map();for(const [id,r] of Object.entries(a.routes))if(r.branch===bid){const k=r.origin+"|"+r.body,p=best.get(k);if(!p||sum(r.permanentVector)>sum(p[1].permanentVector))best.set(k,[id,r]);}
 if(!best.size)return "";
 const rs=[...best.values()].sort((x,y)=>sum(y[1].permanentVector)-sum(x[1].permanentVector));
 const ts=Object.values(a.summary.traitCoverage?.byPair||{}).filter(x=>x.branch===bid).sort((x,y)=>y.maxTraits-x.maxTraits||x.origin.localeCompare(y.origin));
 const branchTraits=ts.length?'<details><summary>이 분기 특성 측정 '+fmt(ts.length)+'개 출생처</summary><p>실제 재생 상태의 고유 보너스 ID 수이며 최종 상한이 아닙니다.</p>'+table(["출생처","실측 경로","동시 보유 최대"],ts.map(x=>['<a href="'+link(x.origin,bid,x.bestRoute)+'">'+esc(name(db,x.origin))+'</a>',fmt(x.measured),fmt(x.maxTraits)]))+'</details>':'<p>이 분기의 특성 실측 기록은 아직 없습니다.</p>';
 return '<details class="bs-note" data-frontier-chronology-branch="true"><summary>중간 탐색 상태 '+fmt(rs.length)+'개 조합 (최종 비교 제외)</summary><p>조건부 중간 상태의 참고 수치입니다. 최종 연구·시술 가능성 및 전역 최적성 미인증.</p>'+table(["출생처","종착 병종","영구 합계","이전 대비"],rs.map(([id,r])=>['<a href="'+link(r.origin,bid,id)+'">'+esc(name(db,r.origin))+'</a>',esc(name(db,r.body))+(r.rankDefault?' · 기본 계급 조건부':''),fmt(sum(r.permanentVector)),delta(a.comparisons[id]?.sumDelta)]))+branchTraits+closureMarkup(db,x=>x.branch===bid)+researchExpansionMarkup(db,x=>x.branch===bid)+alternatingMarkup(db,x=>x.branch===bid)+'</details>';
}
const rankNoteForRoute=()=>'<p>기본 계급 규칙을 적용한 조건부 경로입니다. 설치된 OXCE 8.7 빌드 일치와 실제 승급 획득은 미인증.</p>';
export function frontierChronologyOriginMarkup(db,pid,bid,focus,labels={}){
 const a=db.populationFrontierChronology;if(!a)return "";
 const c=bid?a.summary.traitCoverage?.byPair?.[pid+"|"+bid]:a.summary.traitCoverage?.byOrigin?.[pid];
 const bestTrait=c?.bestRoute&&a.routes[c.bestRoute];
 const closureHeader=closureMarkup(db,x=>x.origin===pid&&(!bid||x.branch===bid))+researchExpansionMarkup(db,x=>x.origin===pid&&(!bid||x.branch===bid))+alternatingMarkup(db,x=>x.origin===pid&&(!bid||x.branch===bid));
 const traitHeader=c?'<p><strong>실측 동시 보유 특성: '+(c.maxTraits===null?"미측정":fmt(c.maxTraits)+"종")+'</strong> · 실측 경로 '+fmt(c.measured)+'개 (최종 상한 아님)'+(bestTrait?' · <a href="'+link(pid,bestTrait.branch,c.bestRoute)+'">해당 육성 경로</a>':"")+'</p>':"";
 const rs=Object.entries(a.routes).filter(([,r])=>r.origin===pid&&(!bid||r.branch===bid)).sort((x,y)=>Number(y[0]===focus)-Number(x[0]===focus)||sum(y[1].permanentVector)-sum(x[1].permanentVector)||x[1].actions.length-y[1].actions.length);if(!rs.length)return traitHeader+closureHeader;
 const cols=db.stats.map(k=>labels[k]||db.statLabels?.[k]||k);
 const render=([id,r],i)=>{
  const c=a.comparisons[id],row=(k,v)=>[esc(k),...v.map(fmt)],prev=a.routes[r.chainParent];
  const sameVector=prev&&r.permanentVector.every((v,i)=>v===prev.permanentVector[i]);
  const sameWorld=prev&&r.canonicalStateHash===prev.canonicalStateHash&&JSON.stringify(r.allowedDifficulties)===JSON.stringify(prev.allowedDifficulties);
  const plateauLabel=sameWorld?"전체 상태 동일 순환":sameVector?"동일 영구 능력치 · 전체 상태는 다름":prev?"영구 능력치 변경 (증가 보장 아님)":"";
  const t=r.traitEvidence||r.rankTraitEvidence,traitList=xs=>esc(xs.map(k=>name(db,k)).join(" · ")||"없음");
  const traitMarkup=t?'<p><strong>재생 상태 영구 특성 종류 '+fmt(t.before.length)+' → '+fmt(t.after.length)+'</strong> (시술 횟수와 구분)</p><p>획득: '+traitList(t.gained)+' / 소실: '+traitList(t.lost)+'</p><p>현재 보유: '+traitList(t.after)+'</p><p>직전 경로 이후 신규 활성 연구: '+traitList(t.newResearch)+'</p>':"";
  const ref=a.activeResearchIndex?.refs?.[id],set=ref&&a.activeResearchIndex.sets[ref.set],e=r.activeResearchEvidence;
  const activeMarkup=set?'<details><summary>조건부 재생 활성 연구 '+fmt(set.active.length)+'개 · 비활성 연구 '+fmt(set.disabled.length)+'개</summary><p>연구 세트 ID <code>'+esc(ref.set)+'</code></p>'+(e?'<p>직전 연구 상태에서 충족한 시술 연구: '+esc(e.requiredResearch.map(k=>name(db,k)).join(" · ")||"없음")+' · 추가 연구 계획 없이 재생</p>':'')+'<p>활성 연구: '+esc(set.active.map(k=>name(db,k)).join(" · "))+'</p><p>비활성 연구: '+esc(set.disabled.map(k=>name(db,k)).join(" · ")||"없음")+'</p></details>':"";
  const raw=[row("원시",r.raw),row("훈장 제외 보너스",r.permanentBonus),row("훈장 제외 실효",r.permanentVector),row("훈장 포함 실효",r.vector),row(r.sourceKind==="BIRTH_RESEARCH_CHAIN"?"직전 경로 영구 능력치":r.sourceKind==="BIRTH_RESEARCH_PROPOSAL"?"출생 기준 전투캡 (고정 목표 아님)":"원래 수치 후보 (훈장 제외)",r.sourcePermanentVector)];
  const p=r.kind==="unlock"?db.originUnlockSearch.pairs[r.pair]:db.originEventBirth.variants[r.input.slice(6)];
  const root=(r.kind==="unlock"?db.originUnlockSearch:db.originEventBirth).roots[r.root].actions;
  const birth=r.kind==="unlock"?[...root,...p.suffix]:[...root.slice(0,p.insertionAt),...p.extraBeforeBirth,...p.inserted,...root.slice(p.insertionAt)];
  return '<details'+(id===focus||i===0?' open':'')+'><summary>'+esc(name(db,r.body))+' · 영구 합계 '+fmt(sum(r.permanentVector))+' · '+delta(c?.sumDelta)+(r.rankDefault?' · 기본 계급 조건부':'')+(t?' · 보유 특성 '+fmt(t.after.length)+'종':'')+(plateauLabel?' · '+esc(plateauLabel):'')+'</summary><p><a href="'+link(pid,r.branch,id)+'">'+esc(r.branch)+'</a> · '+(r.sourceKind==="BIRTH_RESEARCH_CHAIN"?"기존 경로에서 이어진 복수 시술·연구 탐색":r.sourceKind==="BIRTH_RESEARCH_PROPOSAL"?"신규 출생 추가 시술·연구 탐색 (고정 수치 목표 아님)":r.sourceKind==="COVERAGE_CAP_REPLAY"?"미탐색 모집 입력의 전투캡 성장 (중간 시드)":r.sourceKind==="BASE_CAP_REPLAY"?"신규 출생 전투캡 성장 재생":r.adaptation?esc((recoveryLabels[r.adaptation.kind]||"승급 전 부분 경로 + 전투캡 성장")+" (원래 경로 미해결)"):r.numericExactMatch?"원래 영구 벡터 일치":"출생·시술 차이로 벡터 변경")+' · 원본 그룹 #'+fmt(r.sourceGroup+1)+'</p>'+(r.rankDefault?rankNoteForRoute():"")+traitMarkup+activeMarkup+(r.chainParent?'<p>직전 경로 <a href="'+link(pid,r.branch,r.chainParent)+'"><code>'+esc(r.chainParent)+'</code></a> · 후속 시술 '+esc(name(db,r.chainRule))+'</p>':"")+'<p>추가 활성 연구 '+fmt(r.addedResearch.length)+'개: '+esc(r.addedResearch.map(k=>name(db,k)).join(" · ")||"없음")+'</p><p>'+esc(r.actions.map(x=>action(db,x)).join(" → "))+'</p>'+table(["구분",...cols],raw,"birth-stat-table")+'<details><summary>선행 모집·연구 행동 '+fmt(birth.length)+'개 (원본 출생 최솟값)</summary><p>'+esc(birth.map(x=>action(db,x)).join(" → "))+'</p></details><p>고점 후보 <code>'+esc(r.sourceRoute)+'</code> · 시간순 경로 <code>'+esc(id)+'</code> · 행동 SHA256 <code>'+esc(r.fullActionHash)+'</code></p></details>';
 };
 return '<section class="scope-note" data-frontier-chronology-origin="true"><h3>중간 상태의 시간순 연구·육성 연결</h3><p><strong>최종 비교 대상 아님.</strong> 원본 최솟값 출생과 실제 색인 연구 규칙에서 재생한 '+fmt(rs.length)+'개 조건부 경로입니다. 승급·훈장·성장·자원 및 이벤트 획득은 여전히 가정입니다.</p>'+traitHeader+closureHeader+rs.map(render).join("")+'</section>';
}
