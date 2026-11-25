// Fixed frontier proposals replayed from original minimum-birth records.
// Display chronological evidence separately from numerical closure and
// never count promotion, medal, resource or RNG assumptions as gameplay.
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=v=>Number.isFinite(v)?v.toLocaleString("ko-KR",{maximumFractionDigits:2}):"—";
const name=(db,k)=>db.labels?.[k]||db.labels?.[String(k).slice(String(k).indexOf(":")+1)]||k;
const sum=v=>v.reduce((s,x)=>s+x,0);
const delta=n=>n==null?"비교 근거 없음":(n>0?"+":"")+fmt(n);
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
 return s?" · 고점 후보 시간순 재생 "+fmt(s.registeredRoutes)+"경로 / 기존 영구 능력치 개선 "+fmt(s.improvedPairs)+"쌍 (조건부).":"";
}
export function frontierChronologyMarkup(db){
 const a=db.populationFrontierChronology;if(!a)return "";
 const s=a.summary,t=s.totals;
 const rows=[["원본 모집 입력",fmt(s.birthInputs)],["시도 / 독립 재생 성공",fmt(s.attempted)+" / "+fmt(s.independentRouteReplays)],["미해결 후보",fmt(s.unresolvedProposals)],["현재 대기열의 미착수 제안",fmt(s.remainingProposals)],["기존 시간순 원장 대비 비지배 후보 / 조합",fmt(s.improvedRoutes)+" / "+fmt(s.improvedPairs)],["고정 수치 후보와 영구 벡터 일치",fmt(s.exactNumericMatches)],["추가 연구 포함 경로",fmt(s.additionalResearchRoutes)],["추가 활성 연구 종류",fmt(s.researchTopics)],["최대 영구 합계 개선",delta(s.maxSumDelta)],["공유 연구 템플릿 재생 / 시도",fmt(t.planner_templateHits)+" / "+fmt(t.planner_templateTrials)],["누적 탐색 시간",fmt(s.cumulativeSeconds)+"초"],["전역 완전 판정",fmt(s.fullCompleted)]];
 const top=s.top.map(x=>['<a href="'+link(x.origin,x.branch,x.id)+'">'+esc(name(db,x.origin))+'</a>',esc(name(db,x.body)),fmt(x.baselineBestSum),fmt(x.total),delta(x.sumDelta)]);
 const reasons=new Map();for(const x of Object.values(a.attempts))if(x.status==="LIMITED_UNRESOLVED")reasons.set(x.reason,(reasons.get(x.reason)||0)+1);
 const failed=[...reasons].map(([reason,n])=>[esc(reason==="Promotion rank list unindexed"?"계급표 미색인":reason),fmt(n)]);
 return '<details open class="bs-note" data-population-frontier-chronology="true"><summary>고점 후보 → 최솟값 출생·시간순 연구 연결</summary><p>원래 고정 수치 후보의 시술 순서를 원본 최솟값 출생에서 재생합니다. 필요한 연구를 순서대로 획득하고 수치를 다시 계산합니다. 최대 출생 수치를 부여하지 않습니다. 성장·승급·훈장·자원·이벤트는 가정이며 무작위 시술과 미확인 계급은 제외 또는 미해결로 남깁니다. 완전 판정에 합산하지 않습니다.</p>'+table(["측정 지표","값"],rows.map(r=>r.map(esc)))+table(["출생처","종착 병종","이전 영구 합계","재생 영구 합계","증가"],top)+(failed.length?table(["미해결 이유","후보"],failed):"")+'<p><a href="'+esc(new URL("./data/"+a.file,import.meta.url).href)+'">시간순 행동·모집·연구 연결 원장 (gzip)</a></p></details>';
}
export function frontierChronologyBranchMarkup(db,bid){
 const a=db.populationFrontierChronology;if(!a)return "";
 const best=new Map();for(const [id,r] of Object.entries(a.routes))if(r.branch===bid){const k=r.origin+"|"+r.body,p=best.get(k);if(!p||sum(r.permanentVector)>sum(p[1].permanentVector))best.set(k,[id,r]);}
 if(!best.size)return "";
 const rs=[...best.values()].sort((x,y)=>sum(y[1].permanentVector)-sum(x[1].permanentVector));
 return '<details class="bs-note" data-frontier-chronology-branch="true"><summary>고점 시간순 재생 '+fmt(rs.length)+'개 종착 조합</summary><p>최솟값 출생에서 재생한 조건부 영구 능력치. 전역 미인증.</p>'+table(["출생처","종착 병종","영구 합계","이전 대비"],rs.map(([id,r])=>['<a href="'+link(r.origin,bid,id)+'">'+esc(name(db,r.origin))+'</a>',esc(name(db,r.body)),fmt(sum(r.permanentVector)),delta(a.comparisons[id]?.sumDelta)]))+'</details>';
}
export function frontierChronologyOriginMarkup(db,pid,bid,focus,labels={}){
 const a=db.populationFrontierChronology;if(!a)return "";
 const rs=Object.entries(a.routes).filter(([,r])=>r.origin===pid&&(!bid||r.branch===bid)).sort((x,y)=>Number(y[0]===focus)-Number(x[0]===focus)||sum(y[1].permanentVector)-sum(x[1].permanentVector));if(!rs.length)return "";
 const cols=db.stats.map(k=>labels[k]||db.statLabels?.[k]||k);
 const render=([id,r],i)=>{
  const c=a.comparisons[id],row=(k,v)=>[esc(k),...v.map(fmt)];
  const raw=[row("원시",r.raw),row("훈장 제외 보너스",r.permanentBonus),row("훈장 제외 실효",r.permanentVector),row("훈장 포함 실효",r.vector),row("원래 수치 후보 (훈장 제외)",r.sourcePermanentVector)];
  const p=r.kind==="unlock"?db.originUnlockSearch.pairs[r.pair]:db.originEventBirth.variants[r.input.slice(6)];
  const root=(r.kind==="unlock"?db.originUnlockSearch:db.originEventBirth).roots[r.root].actions;
  const birth=r.kind==="unlock"?[...root,...p.suffix]:[...root.slice(0,p.insertionAt),...p.extraBeforeBirth,...p.inserted,...root.slice(p.insertionAt)];
  return '<details'+(id===focus||i===0?' open':'')+'><summary>'+esc(name(db,r.body))+' · 영구 합계 '+fmt(sum(r.permanentVector))+' · '+delta(c?.sumDelta)+'</summary><p><a href="'+link(pid,r.branch,id)+'">'+esc(r.branch)+'</a> · '+(r.numericExactMatch?"원래 영구 벡터 일치":"출생·시술 차이로 벡터 변경")+' · 원본 그룹 #'+fmt(r.sourceGroup+1)+'</p><p>추가 활성 연구 '+fmt(r.addedResearch.length)+'개: '+esc(r.addedResearch.map(k=>name(db,k)).join(" · ")||"없음")+'</p><p>'+esc(r.actions.map(x=>action(db,x)).join(" → "))+'</p>'+table(["구분",...cols],raw,"birth-stat-table")+'<details><summary>선행 모집·연구 행동 '+fmt(birth.length)+'개 (원본 출생 최솟값)</summary><p>'+esc(birth.map(x=>action(db,x)).join(" → "))+'</p></details><p>고점 후보 <code>'+esc(r.sourceRoute)+'</code> · 시간순 경로 <code>'+esc(id)+'</code> · 행동 SHA256 <code>'+esc(r.fullActionHash)+'</code></p></details>';
 };
 return '<section class="scope-note" data-frontier-chronology-origin="true"><h3>고점 후보의 시간순 연구·육성 연결</h3><p>원본 최솟값 출생과 실제 색인 연구 규칙에서 재생한 '+fmt(rs.length)+'개 조건부 경로입니다. 승급·훈장·성장·자원 및 이벤트 획득은 여전히 가정입니다.</p>'+rs.map(render).join("")+'</section>';
}
