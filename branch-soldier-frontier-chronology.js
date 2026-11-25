// Fixed frontier proposals replayed from original minimum-birth records.
// Display chronological evidence separately from numerical closure and
// never count promotion, medal, resource or RNG assumptions as gameplay.
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
export function frontierChronologyCoverage(db){
 const s=db.populationFrontierChronology?.summary;
 return s?" · 중간 육성 탐색 "+fmt(s.registeredRoutes)+"경로 · 최종 비교 인증 "+fmt(s.globalOptimalCertified??0)+"건.":"";
}
export function frontierChronologyMarkup(db){
 const a=db.populationFrontierChronology;if(!a)return "";
 const s=a.summary,t=s.totals;
 const branchCount=db.branches.filter(b=>b.historyCount>0&&!b.sourceRootConflict).length;
 const baseTotal=72*branchCount; // V5.14 fixed origin scope; not exhaustive histories.
 const finalProgress='<p><strong>기준 대분류 최종 탐색 인증: 0 / '+fmt(baseTotal)+' (0%).</strong> '+fmt(branchCount)+'개 조건부 연구 부모 × 기준 출생처 72개. 세부 연구 이력·모집·시술 순서의 전체 경우의 수는 미확정입니다. 현재 종결 엔진은 기초 구현 단계이며 게임 규칙 전체의 후속 행동 열거가 미완료입니다. 최종 순위 없음.</p>';
 const rows=[["원본 모집 입력",fmt(s.birthInputs)],["원래 후보 시도 / 전체 순서 재생",fmt(s.attempted)+" / "+fmt(s.replayedProposals)],["등록 경로 (부분 경로 포함)",fmt(s.independentRouteReplays)],["승급 전 대체 경로 재생 / 신규 후보",fmt(s.adaptedAttempts??0)+" / "+fmt(s.adaptedRoutes??0)],["기존 모델 미해결 후보 (재시도 기록 보존)",fmt(s.unresolvedProposals)],["선별 대기열 미착수 제안 (전수 아님)",fmt(s.remainingProposals)],["계급표 색인 우선 대안 시도 / 재생",fmt(s.alternativeDirectionalAttempts??0)+" / "+fmt(s.alternativeDirectionalSuccesses??0)],["최근 등록 모집 행동 실행 / 공유",fmt(s.registration?.independentBirthSteps)+" / "+fmt(s.registration?.sharedBirthSteps)],["기존 시간순 원장 대비 비지배 후보 / 조합",fmt(s.improvedRoutes)+" / "+fmt(s.improvedPairs)],["고정 수치 후보와 영구 벡터 일치",fmt(s.exactNumericMatches)],["추가 연구 포함 경로",fmt(s.additionalResearchRoutes)],["추가 활성 연구 종류",fmt(s.researchTopics)],["최대 영구 합계 개선",delta(s.maxSumDelta)],["공유 연구 템플릿 재생 / 시도",fmt(t.planner_templateHits)+" / "+fmt(t.planner_templateTrials)],["누적 탐색 시간",fmt(s.cumulativeSeconds)+"초"],["전역 완전 판정",fmt(s.fullCompleted)]];
 if(s.coverage)rows.unshift(["시간순 원장 모집 입력 확보 / 전체 색인",fmt(s.coverage.coveredInputs)+" / "+fmt(s.coverage.birthInputs)],["중간 경로 확보 조합 / 색인 조합",fmt(s.coverage.coveredPairs)+" / "+fmt(s.coverage.indexedPairs)],["출생처 / 연구 분기 (중간 경로)",fmt(s.coverage.coveredOrigins)+" / "+fmt(s.coverage.coveredBranches)],["미등록 모집 입력",fmt(s.coverage.missingInputs)]);
 if(s.recoveryVariantAttempts!=null)rows.push(["조건 대체 재생 시도 / 성공",fmt(s.recoveryVariantAttempts)+" / "+fmt(s.recoveryVariantSuccesses)],["신규 대체 비지배 경로",fmt(s.recoveryVariantRoutes)],["대체 대기열 잔량 (제한 탐색)",fmt(s.recoveryRemaining)]);
 if(s.rankDefaultAttempts!=null)rows.push(["기본 계급 조건부 재생 시도 / 성공",fmt(s.rankDefaultAttempts)+" / "+fmt(s.rankDefaultSuccesses)],["기본 계급 신규 경로",fmt(s.rankDefaultRoutes)],["기본 계급 재시도 대기",fmt(s.rankDefaultRemaining)],["기본 계급 적용 병종",s.rankDefaultBodies.map(k=>name(db,k)).join(" · ")]);
 if(s.birthExpansionInputs!=null)rows.push(["신규 모집 입력 / 재생 시도",fmt(s.birthExpansionInputs)+" / "+fmt(s.birthExpansionAttempts)],["신규 출생 전투캡 / 추가 시술·연구 경로",fmt(s.birthExpansionCapRoutes)+" / "+fmt(s.birthExpansionResearchRoutes)],["신규 출생 재생 대기 (제한 탐색)",fmt(s.birthExpansionRemaining)]);
 if(s.chainAttempts!=null)rows.push(["복수 시술 연쇄 재생 시도 / 등록",fmt(s.chainAttempts)+" / "+fmt(s.chainRoutes)],["연쇄 후보 잔량 (최근 대기열 스냅샷)",fmt(s.chainRemaining)]);
 if(s.chainDepths)rows.push(["시술 연쇄 단계별 경로",Object.entries(s.chainDepths).map(([k,v])=>k+"단계 "+fmt(v)+"개").join(" · ")]);
 if(s.chainMaxDepth!=null)rows.push(["묶음 연쇄 탐색 제한 단계 (별도 전구간 탐색 제외)",fmt(s.chainMaxDepth)],["동일 상태의 성공 후속 경로 재사용 (신규 경로 제외)",fmt(s.chainAliasCount)],["분기 금지 연구 사전 판정",fmt(s.chainSchedulerTotals?.staticBlocked)]);
 if(a.horizonPolicy)rows.push(["별도 전구간 연쇄 탐색 단계 제한","없음 (지원되는 결정론적 시술, 제한된 실행 예산)"],["전구간 탐색 등록 경로 / 최근 대기열",fmt(s.horizonRoutes)+" / "+fmt(s.horizonPending)],["전구간 단계별 등록",Object.entries(s.horizonDepths||{}).map(([k,v])=>k+"단계 "+fmt(v)+"개").join(" · ")]);
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
 return '<details open class="bs-note" data-population-frontier-chronology="true"><summary>중간 육성 경로 원장 (최종 비교 제외)</summary>'+finalProgress+'<p><strong>최종 비교 인증 '+fmt(s.globalOptimalCertified??0)+'건.</strong> 연구 상호배제, 실제 획득 조건, 성장·시술의 모든 후속 가능성 및 최적성 증명이 충족되기 전에는 최종 조합으로 표시하지 않습니다. 시술 횟수는 완료 기준이 아닙니다.</p><p>원래 고정 수치 후보의 시술 순서를 원본 최솟값 출생에서 재생합니다. 필요한 연구를 순서대로 획득하고 수치를 다시 계산합니다. 최대 출생 수치를 부여하지 않습니다. 성장·승급·훈장·자원·이벤트는 가정이며 무작위 시술과 미확인 계급은 제외 또는 미해결로 남깁니다. 계급표가 없어 막힌 경우 승급 전 시술까지만 재생하고 전투캡 성장을 적용한 대체 후보를 별도로 표시합니다. 원래 경로 성공으로 계산하지 않습니다. 색인 모집과 지원 시술을 기준으로 대기열을 확장했습니다. 고정 연구 상태에서 추가 시술이 없는 그룹도 실제 모집 이후 전투캡 성장 및 신규 연구·시술 후보를 별도로 재생합니다. 조건 미충족 후보는 성장 삽입·시술 순서 교환·일부 행동 제외 등으로 대체 재생합니다. 대체 성공은 원래 경로 성공이 아니며, 잔여 제안 0은 전체 고점 후보의 전수 재생 완료를 뜻하지 않습니다. 완전 판정에 합산하지 않습니다.</p>'+rankNote+table(["측정 지표","값"],rows.map(r=>r.map(esc)))+coverageMarkup+'<details><summary>중간 상태 수치 참고 (최종 순위 아님)</summary>'+table(["출생처","현재 병종","이전 중간 합계","재생 중간 합계","차이"],top)+'</details>'+(failed.length?table(["미해결 이유","후보"],failed):"")+(recoveryRows.length?table(["대체 방식","시도","재생 성공","신규 등록","미해결"],recoveryRows):"")+'<p><a href="'+esc(new URL("./data/"+a.file,import.meta.url).href)+'">시간순 행동·모집·연구 연결 원장 (gzip)</a></p></details>';
}
export function frontierChronologyBranchMarkup(db,bid){
 const a=db.populationFrontierChronology;if(!a)return "";
 const best=new Map();for(const [id,r] of Object.entries(a.routes))if(r.branch===bid){const k=r.origin+"|"+r.body,p=best.get(k);if(!p||sum(r.permanentVector)>sum(p[1].permanentVector))best.set(k,[id,r]);}
 if(!best.size)return "";
 const rs=[...best.values()].sort((x,y)=>sum(y[1].permanentVector)-sum(x[1].permanentVector));
 const ts=Object.values(a.summary.traitCoverage?.byPair||{}).filter(x=>x.branch===bid).sort((x,y)=>y.maxTraits-x.maxTraits||x.origin.localeCompare(y.origin));
 const branchTraits=ts.length?'<details><summary>이 분기 특성 측정 '+fmt(ts.length)+'개 출생처</summary><p>실제 재생 상태의 고유 보너스 ID 수이며 최종 상한이 아닙니다.</p>'+table(["출생처","실측 경로","동시 보유 최대"],ts.map(x=>['<a href="'+link(x.origin,bid,x.bestRoute)+'">'+esc(name(db,x.origin))+'</a>',fmt(x.measured),fmt(x.maxTraits)]))+'</details>':'<p>이 분기의 특성 실측 기록은 아직 없습니다.</p>';
 return '<details class="bs-note" data-frontier-chronology-branch="true"><summary>중간 탐색 상태 '+fmt(rs.length)+'개 조합 (최종 비교 제외)</summary><p>조건부 중간 상태의 참고 수치입니다. 최종 연구·시술 가능성 및 전역 최적성 미인증.</p>'+table(["출생처","종착 병종","영구 합계","이전 대비"],rs.map(([id,r])=>['<a href="'+link(r.origin,bid,id)+'">'+esc(name(db,r.origin))+'</a>',esc(name(db,r.body))+(r.rankDefault?' · 기본 계급 조건부':''),fmt(sum(r.permanentVector)),delta(a.comparisons[id]?.sumDelta)]))+branchTraits+'</details>';
}
const rankNoteForRoute=()=>'<p>기본 계급 규칙을 적용한 조건부 경로입니다. 설치된 OXCE 8.7 빌드 일치와 실제 승급 획득은 미인증.</p>';
export function frontierChronologyOriginMarkup(db,pid,bid,focus,labels={}){
 const a=db.populationFrontierChronology;if(!a)return "";
 const c=bid?a.summary.traitCoverage?.byPair?.[pid+"|"+bid]:a.summary.traitCoverage?.byOrigin?.[pid];
 const bestTrait=c?.bestRoute&&a.routes[c.bestRoute];
 const traitHeader=c?'<p><strong>실측 동시 보유 특성: '+(c.maxTraits===null?"미측정":fmt(c.maxTraits)+"종")+'</strong> · 실측 경로 '+fmt(c.measured)+'개 (최종 상한 아님)'+(bestTrait?' · <a href="'+link(pid,bestTrait.branch,c.bestRoute)+'">해당 육성 경로</a>':"")+'</p>':"";
 const rs=Object.entries(a.routes).filter(([,r])=>r.origin===pid&&(!bid||r.branch===bid)).sort((x,y)=>Number(y[0]===focus)-Number(x[0]===focus)||sum(y[1].permanentVector)-sum(x[1].permanentVector)||x[1].actions.length-y[1].actions.length);if(!rs.length)return traitHeader;
 const cols=db.stats.map(k=>labels[k]||db.statLabels?.[k]||k);
 const render=([id,r],i)=>{
  const c=a.comparisons[id],row=(k,v)=>[esc(k),...v.map(fmt)],prev=a.routes[r.chainParent];
  const sameVector=prev&&r.permanentVector.every((v,i)=>v===prev.permanentVector[i]);
  const sameWorld=prev&&r.canonicalStateHash===prev.canonicalStateHash&&JSON.stringify(r.allowedDifficulties)===JSON.stringify(prev.allowedDifficulties);
  const plateauLabel=sameWorld?"전체 상태 동일 순환":sameVector?"동일 영구 능력치 · 전체 상태는 다름":prev?"영구 능력치 변경 (증가 보장 아님)":"";
  const t=r.traitEvidence||r.rankTraitEvidence,traitList=xs=>esc(xs.map(k=>name(db,k)).join(" · ")||"없음");
  const traitMarkup=t?'<p><strong>재생 상태 영구 특성 종류 '+fmt(t.before.length)+' → '+fmt(t.after.length)+'</strong> (시술 횟수와 구분)</p><p>획득: '+traitList(t.gained)+' / 소실: '+traitList(t.lost)+'</p><p>현재 보유: '+traitList(t.after)+'</p><p>직전 경로 이후 신규 활성 연구: '+traitList(t.newResearch)+'</p>':"";
  const raw=[row("원시",r.raw),row("훈장 제외 보너스",r.permanentBonus),row("훈장 제외 실효",r.permanentVector),row("훈장 포함 실효",r.vector),row(r.sourceKind==="BIRTH_RESEARCH_CHAIN"?"직전 경로 영구 능력치":r.sourceKind==="BIRTH_RESEARCH_PROPOSAL"?"출생 기준 전투캡 (고정 목표 아님)":"원래 수치 후보 (훈장 제외)",r.sourcePermanentVector)];
  const p=r.kind==="unlock"?db.originUnlockSearch.pairs[r.pair]:db.originEventBirth.variants[r.input.slice(6)];
  const root=(r.kind==="unlock"?db.originUnlockSearch:db.originEventBirth).roots[r.root].actions;
  const birth=r.kind==="unlock"?[...root,...p.suffix]:[...root.slice(0,p.insertionAt),...p.extraBeforeBirth,...p.inserted,...root.slice(p.insertionAt)];
  return '<details'+(id===focus||i===0?' open':'')+'><summary>'+esc(name(db,r.body))+' · 영구 합계 '+fmt(sum(r.permanentVector))+' · '+delta(c?.sumDelta)+(r.rankDefault?' · 기본 계급 조건부':'')+(t?' · 보유 특성 '+fmt(t.after.length)+'종':'')+(plateauLabel?' · '+esc(plateauLabel):'')+'</summary><p><a href="'+link(pid,r.branch,id)+'">'+esc(r.branch)+'</a> · '+(r.sourceKind==="BIRTH_RESEARCH_CHAIN"?"기존 경로에서 이어진 복수 시술·연구 탐색":r.sourceKind==="BIRTH_RESEARCH_PROPOSAL"?"신규 출생 추가 시술·연구 탐색 (고정 수치 목표 아님)":r.sourceKind==="COVERAGE_CAP_REPLAY"?"미탐색 모집 입력의 전투캡 성장 (중간 시드)":r.sourceKind==="BASE_CAP_REPLAY"?"신규 출생 전투캡 성장 재생":r.adaptation?esc((recoveryLabels[r.adaptation.kind]||"승급 전 부분 경로 + 전투캡 성장")+" (원래 경로 미해결)"):r.numericExactMatch?"원래 영구 벡터 일치":"출생·시술 차이로 벡터 변경")+' · 원본 그룹 #'+fmt(r.sourceGroup+1)+'</p>'+(r.rankDefault?rankNoteForRoute():"")+traitMarkup+(r.chainParent?'<p>직전 경로 <a href="'+link(pid,r.branch,r.chainParent)+'"><code>'+esc(r.chainParent)+'</code></a> · 후속 시술 '+esc(name(db,r.chainRule))+'</p>':"")+'<p>추가 활성 연구 '+fmt(r.addedResearch.length)+'개: '+esc(r.addedResearch.map(k=>name(db,k)).join(" · ")||"없음")+'</p><p>'+esc(r.actions.map(x=>action(db,x)).join(" → "))+'</p>'+table(["구분",...cols],raw,"birth-stat-table")+'<details><summary>선행 모집·연구 행동 '+fmt(birth.length)+'개 (원본 출생 최솟값)</summary><p>'+esc(birth.map(x=>action(db,x)).join(" → "))+'</p></details><p>고점 후보 <code>'+esc(r.sourceRoute)+'</code> · 시간순 경로 <code>'+esc(id)+'</code> · 행동 SHA256 <code>'+esc(r.fullActionHash)+'</code></p></details>';
 };
 return '<section class="scope-note" data-frontier-chronology-origin="true"><h3>중간 상태의 시간순 연구·육성 연결</h3><p><strong>최종 비교 대상 아님.</strong> 원본 최솟값 출생과 실제 색인 연구 규칙에서 재생한 '+fmt(rs.length)+'개 조건부 경로입니다. 승급·훈장·성장·자원 및 이벤트 획득은 여전히 가정입니다.</p>'+traitHeader+rs.map(render).join("")+'</section>';
}
