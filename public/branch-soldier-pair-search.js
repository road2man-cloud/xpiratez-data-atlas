// Shared all-origin pair coverage panel for both existing DB screens.
export function pairSearchMarkup(db){
 const a=db.originPairSearch,s=a?.summary;if(!s)return "";
 const e=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const f=n=>Number.isFinite(n)?n.toLocaleString("ko-KR",{maximumFractionDigits:2}):"—";
 const c=s.counts;
 const bench=s.benchmark?.samples?s.benchmark:a.lastMeasuredBenchmark;
 const pct=s.applicableCandidates?100*s.conditionalPairs/s.applicableCandidates:0;
 const rows=a.origins.map(r=>"<tr><td>"+e(r.name||r.id)+"</td><td>"+e(r.id)+"</td><td>"+f(r.counts.conditionalRegistry)+"</td><td>"+f(r.counts.jointBirth)+"</td><td>"+f(r.counts.unexplored)+"</td><td>"+f(r.counts.limited)+"</td><td>"+f(r.counts.globalOptimalCertified)+"</td></tr>").join("");
 return '<section class="bs-note" data-origin-pair-search="true"><h3>전체 출생처 × 연구 분기 탐색 현황</h3>'+
 '<p><b>'+f(s.origins)+' × '+f(s.researchParents)+' = '+f(s.applicableCandidates)+'개</b> 적용 후보 · 조건부 근거 '+f(s.conditionalPairs)+'개 ('+f(pct)+'%) · 전역 최적성 인증 '+f(c.globalOptimalCertified)+'개</p>'+
 '<p>미탐색 '+f(c.unexplored)+' · 기존 조건부 경로 '+f(c.conditionalRegistry)+' · 공동 연구·모집 재생 '+f(c.jointBirth)+' · 완전 상태 재사용 '+f(c.reusedCompleteState)+' · 불가능 증명 '+f(c.impossibleProven)+' · 제한 탐색 '+f(c.limited)+'</p>'+
 '<p>최근 신규 공동 모집 '+f(s.newPairs)+'개 / '+f(s.seconds)+'초 · 실제 접두부 재생 '+f(s.rootReplays)+'회 · 중복 접두부 단계 생략 '+f(s.avoidedPrefixSteps)+'회 · 별도 수치 모델 재사용 '+f(s.numericBirthModelsUsed)+'종 / 참조 '+f(s.numericBirthModelReferences)+'건.</p>'+
 '<p>'+(!bench?'동일 입력 비교 미실행. ':(s.benchmark?.samples?'이번':'이전 실측')+' 동일 입력 비교 '+f(bench.samples)+'건: 개별 '+f(bench.individualMs/1000)+'초 / 공통 접두부 '+f(bench.sharedMs/1000)+'초 · '+f(bench.speedup)+'배 · 전체 상태 일치 '+f(bench.equalWorlds)+'건. ' )+'최근 배치 CPU '+f(s.cpuSeconds)+'초 · 관측 RSS '+f(s.peakRssBytes/1048576)+' MiB.</p>'+
 '<p class="bs-warning">조건부 모집·성장 모델은 실전 달성 인증이나 전역 최적성 인증이 아닙니다. 연구 목록만 같은 분기, 원천 뿌리만 일치하는 경로, 제한 탐색 실패는 완전한 상태 동등성 또는 불가능으로 판정하지 않습니다. 현재 영구 가지치기 '+f(s.safeBoundPruned)+'건.</p>'+
 '<details><summary>72개 출생처별 후보 상태</summary><div class="bs-scroll"><table class="bs-table"><thead><tr><th>출생처</th><th>내부 ID</th><th>기존 근거</th><th>공동 모집</th><th>미탐색</th><th>제한 탐색</th><th>최적 인증</th></tr></thead><tbody>'+rows+'</tbody></table></div></details></section>';
}
