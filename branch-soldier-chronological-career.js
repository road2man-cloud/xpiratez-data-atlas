// Chronological career candidates: permanent stats exclude medal bonuses.
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=v=>Number.isFinite(v)?v.toLocaleString("ko-KR",{maximumFractionDigits:2}):"—";
const name=(db,k)=>db.labels?.[k]||db.labels?.[String(k).slice(String(k).indexOf(":")+1)]||k;
const sum=v=>v.reduce((s,x)=>s+x,0);
const delta=n=>n==null?"새 종착":(n>0?"+":"")+fmt(n);
const table=(cols,rows,cls="bs-table")=>'<div class="bs-scroll"><table class="'+cls+'"><thead><tr>'+cols.map(k=>'<th>'+esc(k)+'</th>').join("")+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+x+'</td>').join("")+'</tr>').join("")+'</tbody></table></div>';
function link(pid,bid,id){const u=new URL("./soldiers/modern/",import.meta.url);u.searchParams.set("profile",pid);u.searchParams.set("branch",bid);u.searchParams.set("populationRoute",id);u.hash="originDetails";return esc(u.href);}
const order=(a,b)=>(b[1].sumDelta??0)-(a[1].sumDelta??0)||sum(b[1].permanentVector)-sum(a[1].permanentVector);
function routeName(db,r){return r.actions.filter(a=>["transform","conditionalCapGrowth","conditionalPromotion","conditionalMedal"].includes(a.type)).map(a=>a.type==="conditionalPromotion"?"[승급 가정 → 계급 "+a.rank+"]":a.type==="conditionalMedal"?"[훈장 획득 가정 "+name(db,a.medal)+" · 등급 "+a.level+"]":a.type==="conditionalCapGrowth"?"[전투캡 성장 가정]":name(db,a.transform)).join(" → ");}
export function chronologicalCareerCoverage(db){const s=db.populationChronologicalCareer?.summary;return s?" · 시간순 계급·훈장 육성 "+fmt(s.registeredRoutes)+"경로 / "+fmt(s.improvedPairs)+"쌍 (가정 포함, 전역 미인증).":"";}
export function chronologicalCareerMarkup(db){
 const a=db.populationChronologicalCareer;if(!a)return "";
 const s=a.summary,t=s.totals;
 const rows=[["선정 시드 제한 탐색",fmt(s.completedSeeds)+" / "+fmt(s.seedCandidates)],["등록 후보 / 개선 출생처·분기",fmt(s.registeredRoutes)+" / "+fmt(s.improvedPairs)],["영구 수치 개선 종착 조합",fmt(s.improvedPairBodies)],["기존 대비 영구 합계 증가 종착 조합",fmt(s.positiveSumPairBodies)],["승급 / 훈장 조건부 경로",fmt(s.promotionRoutes)+" / "+fmt(s.medalRoutes)],["최대 영구 합계 개선","+"+fmt(s.maxSumDelta)],["출생 체크포인트 재사용",fmt(t.birthCacheHits)],["계급·훈장 시술 성공 / 시도",fmt(t.careerAccepted)+" / "+fmt(t.careerAttempts)],["후속 시술 성공 / 시도",fmt(t.followupAccepted)+" / "+fmt(t.followupAttempts)],["누적 탐색 시간",fmt(s.cumulativeSeconds)+"초"],["전체 게임 완전 판정",fmt(s.fullCompleted)]];
 const top=s.top.map(x=>['<a href="'+link(x.origin,x.branch,x.id)+'">'+esc(name(db,x.origin))+'</a>',esc(name(db,x.body)),fmt(x.baselineBestSum),fmt(x.total),fmt(x.medalTotal),delta(x.sumDelta)]);
 return '<details open class="bs-note" data-population-chronological-career="true"><summary>V6 시간순 모집·연구 + 성장·승급·필수 훈장</summary><p>기존 시간순 재생 세계에서 원본 필요 연구와 시술 조건을 만족시키며, 성장·승급·훈장 획득은 명시적인 가정입니다. 공통 최고치에는 훈장 자체 보너스를 제외한 영구 실효 벡터만 반영합니다. 선택 시드·깊이·빔 제한이 있어 게임 전역 최적성은 미인증입니다.</p>'+table(["측정 지표","값"],rows.map(r=>r.map(esc)))+table(["출생처","종착 병종","기존 합계","신규 영구 합계","훈장 포함","증가"],top)+'<p><a href="'+esc(new URL("./data/"+a.file,import.meta.url).href)+'">시간순 계급·훈장 육성 후보 원장 (gzip)</a></p></details>';
}
export function chronologicalCareerBranchMarkup(db,bid){
 const a=db.populationChronologicalCareer;if(!a)return "";
 const best=new Map();for(const [id,r] of Object.entries(a.routes))if(r.branch===bid){const k=r.origin+"|"+r.body,p=best.get(k);if(!p||sum(r.permanentVector)>sum(p[1].permanentVector))best.set(k,[id,r]);}
 const rows=[...best.values()].sort(order);if(!rows.length)return "";
 return '<details class="bs-note" data-chronological-career-branch="true"><summary>V6 시간순 계급·훈장 개선 종착 조합 '+fmt(rows.length)+'개</summary><p>훈장 제외 영구 실효 합계. 실제 승급·훈장·자원 획득 및 전역 최적성 미인증.</p>'+table(["출생처","종착","영구 합계","기존 대비"],rows.map(([id,r])=>['<a href="'+link(r.origin,bid,id)+'">'+esc(name(db,r.origin))+'</a>',esc(name(db,r.body)),fmt(sum(r.permanentVector)),delta(r.sumDelta)]))+'</details>';
}
export function chronologicalCareerOriginMarkup(db,pid,bid,focus,labels={}){
 const a=db.populationChronologicalCareer;if(!a)return "";
 const rs=Object.entries(a.routes).filter(([,r])=>r.origin===pid&&(!bid||r.branch===bid)).sort((a,b)=>Number(b[0]===focus)-Number(a[0]===focus)||order(a,b));if(!rs.length)return "";
 const cols=db.stats.map(k=>labels[k]||db.statLabels?.[k]||k);
 const render=([id,r],i)=>{
  const row=(k,v)=>[esc(k),...v.map(fmt)];
  const medals=Object.entries(r.medals).map(([k,v])=>name(db,k)+" (내부 등급 "+v+")").join(", ")||"없음";
  return '<details'+(id===focus||i===0?' open':'')+'><summary>'+esc(name(db,r.body))+' · 영구 합계 '+fmt(sum(r.permanentVector))+' · 기존 대비 '+delta(r.sumDelta)+'</summary><p><a href="'+link(pid,r.branch,id)+'">'+esc(r.branch)+'</a> · 계급 '+fmt(r.rank)+' · 훈장 가정 '+esc(medals)+'</p><p>'+esc(routeName(db,r))+'</p>'+table(["구분",...cols],[row("원시",r.raw),row("훈장 제외 보너스",r.permanentBonus),row("훈장 제외 실효",r.permanentVector),row("훈장 포함 보너스",r.bonus),row("훈장 포함 실효",r.vector)],"birth-stat-table")+'<p>선행 후보 <code>'+esc(r.seed)+'</code> · 행동 SHA256 <code>'+esc(r.fullActionHash)+'</code> · 상태 SHA256 <code>'+esc(r.canonicalStateHash)+'</code></p></details>';
 };
 return '<section class="scope-note" data-chronological-career-origin="true"><h3>V6 모집·연구 시간순 계급·훈장 육성</h3><p>훈장 자체 보너스를 분리한 조건부 시술 경로 '+fmt(rs.length)+'개. 실제 전역 미인증.</p>'+rs.map(render).join("")+'</section>';
}
