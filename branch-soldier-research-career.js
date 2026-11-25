// V9 context-ranked research templates and chronological candidates. Never count conditional routes as
// completed actual campaigns.
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=v=>Number.isFinite(v)?v.toLocaleString("ko-KR",{maximumFractionDigits:2}):"—";
const name=(db,k)=>db.labels?.[k]||db.labels?.[String(k).slice(String(k).indexOf(":")+1)]||k;
const sum=v=>v.reduce((s,x)=>s+x,0),delta=n=>n==null?"새 종착":(n>0?"+":"")+fmt(n);
function link(pid,bid,id){const u=new URL("./soldiers/modern/",import.meta.url);u.searchParams.set("profile",pid);u.searchParams.set("branch",bid);u.searchParams.set("populationRoute",id);u.hash="originDetails";return esc(u.href);}
const table=(cols,rows,cls="bs-table")=>'<div class="bs-scroll"><table class="'+cls+'"><thead><tr>'+cols.map(k=>'<th>'+esc(k)+'</th>').join("")+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+x+'</td>').join("")+'</tr>').join("")+'</tbody></table></div>';
function action(db,a){
 if(a.type==="transform")return name(db,a.transform);
 if(a.type==="conditionalPromotion")return "[승급 가정 "+a.rank+"]";
 if(a.type==="conditionalMedal")return "[훈장 가정 "+name(db,a.medal)+" "+a.level+"]";
 if(a.type==="conditionalCapGrowth")return "[전투캡 성장 가정]";
 if(a.type==="externalInputs")return "[자원·시설 가정]";
 if(a.type==="advanceMonth")return "[월 진행 가정 "+a.month+"]";
 if(a.type==="research"||a.type==="freeResearch"||a.type==="eventResearch"||a.type==="missionResearch")return "[연구 "+name(db,a.id||a.research)+"]";
 return "["+a.type+(a.id?" "+name(db,a.id):"")+"]";
}
export function researchCareerCoverage(db){const s=db.populationResearchCareer?.summary;return s?" · 추가 연구·성장·계급·훈장 "+fmt(s.registeredRoutes)+"경로 / "+fmt(s.improvedPairs)+"쌍 (조건부).":"";}
export function researchCareerMarkup(db){
 const a=db.populationResearchCareer;if(!a)return "";
 const s=a.summary,t=s.totals;
 const rows=[["선정 시드 방문",fmt(s.visitedSeeds)+" / "+fmt(s.seedCandidates)],["추가 연구 목표 시도 / 시술 성공",fmt(s.attemptedGoals)+" / "+fmt(s.successfulGoals)],["신규 비지배 후보 / 개선 조합",fmt(s.registeredRoutes)+" / "+fmt(s.improvedPairs)],["기존 시간순 원장에 없는 종착 조합",fmt(s.newTerminalPairBodies)],["추가 연구 주제 / 목표 시술 종류",fmt(s.newResearchTopics)+" / "+fmt(s.goalRules)],["기존 대비 합계 개선 종착 조합",fmt(s.positiveSumPairBodies)],["최대 영구 합계 증가","+"+fmt(s.maxSumDelta)],["출생 체크포인트 재사용 / 재생",fmt(t.birthHits)+" / "+fmt(t.birthReplays)],["추가 연구 계획 계산 / 정확 캐시 재사용",fmt(t.planComputations)+" / "+fmt(t.planHits)],["공유 연구 계획 재생 성공 / 시도 (누적)",fmt(t.templateHits)+" / "+fmt(t.templateTrials)],["전체 재생 전 사전조건 거절 (V9 누적)",fmt(t.templatePreflightRejects)],["마지막 배치 재생 성공 / 시도",fmt(s.metrics?.templateHits)+" / "+fmt(s.metrics?.templateTrials)],["다른 병종 간 연구 계획 재사용",fmt(t.templateCrossBodyHits)],["연구 계획 재생 거절 후 원래 계획기 사용 가능",fmt(t.templateRejects)],["공유 계획 수 / 목표 그룹",fmt(s.templateCount)+" / "+fmt(s.templateBuckets)],["연속 추가 연구 성공 / 시도",fmt(t.chainedResearchSuccess)+" / "+fmt(t.chainedResearchAttempts)],["두 단계 추가 연구 신규 후보",fmt(s.chainedRoutes)],["후속 시술 시도 / 성공",fmt(t.followupAttempts)+" / "+fmt(t.followupAccepted)],["누적 계산 시간",fmt(s.cumulativeSeconds)+"초"],["전체 게임 완전 판정",fmt(s.fullCompleted)]];
 const top=s.top.map(x=>['<a href="'+link(x.origin,x.branch,x.id)+'">'+esc(name(db,x.origin))+'</a>',esc(name(db,x.body)),esc(name(db,x.goal)),fmt(x.baselineBestSum),fmt(x.total),delta(x.sumDelta)]);
 const novel=s.newTerminals.map(x=>['<a href="'+link(x.origin,x.branch,x.id)+'">'+esc(name(db,x.origin))+'</a>',esc(name(db,x.body)),esc(name(db,x.goal)),fmt(x.total)]);
 return '<details open class="bs-note" data-population-research-career="true"><summary>V9 연구 상태 기반 계획 선별·연속 추가 연구·성장·승급·훈장</summary><p>기존 분기 선택을 보존하고, 실제 연구 규칙 재생 후 시술을 적용한 조건부 후보입니다. 성장·승급·훈장·자원 및 이벤트 획득은 가정이며 훈장 자체 보너스를 제외합니다. 월 역행 및 첫 연구의 필수 조건을 사전 확인하고, 이전 성공 연구 상태와 자원 유사도로 계획 순서를 정합니다. 선별된 연구 행동은 전체 상태에서 재생하며 실패하면 원래 계획기를 사용합니다. 공유 계획은 상태 동등성 증명이 아닙니다. 제한된 연구 계획 및 후속 탐색이므로 실패는 불가능 증명이 아닙니다.</p>'+table(["측정 지표","값"],rows.map(r=>r.map(esc)))+table(["출생처","종착 병종","추가 연구 목표 시술","기존","신규 영구","증가"],top)+(novel.length?'<h4>기존 시간순 원장에 없는 종착 조합</h4>'+table(["출생처","종착 병종","목표 시술","영구 합계"],novel):"")+'<p><a href="'+esc(new URL("./data/"+a.file,import.meta.url).href)+'">추가 연구 및 육성 경로 원장 (gzip)</a></p></details>';
}
export function researchCareerBranchMarkup(db,bid){
 const a=db.populationResearchCareer;if(!a)return "";
 const best=new Map();for(const [id,r] of Object.entries(a.routes))if(r.branch===bid){const k=r.origin+"|"+r.body,p=best.get(k);if(!p||sum(r.permanentVector)>sum(p[1].permanentVector))best.set(k,[id,r]);}
 const rs=[...best.values()].sort((a,b)=>sum(b[1].permanentVector)-sum(a[1].permanentVector));if(!rs.length)return "";
 return '<details class="bs-note" data-research-career-branch="true"><summary>V9 추가 연구 육성 '+fmt(rs.length)+'개 종착 조합</summary><p>훈장 제외 영구 능력치. 실제 캠페인 전역 미인증.</p>'+table(["출생처","종착 병종","목표 시술","영구 합계","기존 대비"],rs.map(([id,r])=>['<a href="'+link(r.origin,bid,id)+'">'+esc(name(db,r.origin))+'</a>',esc(name(db,r.body)),esc([r.goal,r.secondaryGoal].filter(Boolean).map(k=>name(db,k)).join(" → ")),fmt(sum(r.permanentVector)),delta(r.sumDelta)]))+'</details>';
}
export function researchCareerOriginMarkup(db,pid,bid,focus,labels={}){
 const a=db.populationResearchCareer;if(!a)return "";
 const rs=Object.entries(a.routes).filter(([,r])=>r.origin===pid&&(!bid||r.branch===bid)).sort((a,b)=>Number(b[0]===focus)-Number(a[0]===focus)||sum(b[1].permanentVector)-sum(a[1].permanentVector));if(!rs.length)return "";
 const cols=db.stats.map(k=>labels[k]||db.statLabels?.[k]||k);
 const render=([id,r],i)=>{
  const seed=db[r.seedLedger]?.routes?.[r.seed],suffix=r.actions.slice(seed?.actions.length||0),row=(k,v)=>[esc(k),...v.map(fmt)];
  return '<details'+(id===focus||i===0?' open':'')+'><summary>'+esc(name(db,r.body))+' · 영구 합계 '+fmt(sum(r.permanentVector))+' · '+delta(r.sumDelta)+'</summary><p><a href="'+link(pid,r.branch,id)+'">'+esc(r.branch)+'</a> · 목표 '+esc([r.goal,r.secondaryGoal].filter(Boolean).map(k=>name(db,k)).join(" → "))+(r.secondaryGoal?" · 연속 두 단계 연구":"")+'</p><p>신규 활성 연구 '+fmt(r.addedResearch.length)+'개: '+esc(r.addedResearch.map(k=>name(db,k)).join(" · "))+'</p><p>'+esc(suffix.map(a=>action(db,a)).join(" → "))+'</p>'+table(["구분",...cols],[row("원시",r.raw),row("훈장 제외 보너스",r.permanentBonus),row("훈장 제외 실효",r.permanentVector),row("훈장 포함 실효",r.vector)],"birth-stat-table")+'<p>선행 후보 <code>'+esc(r.seed)+'</code> · 행동 SHA256 <code>'+esc(r.fullActionHash)+'</code> · 상태 SHA256 <code>'+esc(r.canonicalStateHash)+'</code></p></details>';
 };
 return '<section class="scope-note" data-research-career-origin="true"><h3>V9 추가 연구·성장·승급·훈장 후보</h3><p>기존 분기 보존·연구 재생, 조건부 자원 및 성장. 전역 미인증. '+fmt(rs.length)+'경로.</p>'+rs.map(render).join("")+'</section>';
}
