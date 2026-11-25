// V5 chronological conditional growth candidates. Keep separate from
// hypothetical-birth and actual-game proof counts.
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=v=>Number.isFinite(v)?v.toLocaleString("ko-KR",{maximumFractionDigits:2}):"—";
const name=(db,k)=>db.labels?.[k]||db.labels?.[String(k).slice(String(k).indexOf(":")+1)]||k;
const sum=v=>v.reduce((s,x)=>s+x,0);
function link(pid,bid,id){const u=new URL("./soldiers/modern/",import.meta.url);u.searchParams.set("profile",pid);u.searchParams.set("branch",bid);if(id)u.searchParams.set("populationRoute",id);u.hash="originDetails";return esc(u.href);}
const table=(cols,rows,cls="bs-table")=>'<div class="bs-scroll"><table class="'+cls+'"><thead><tr>'+cols.map(k=>'<th>'+esc(k)+'</th>').join("")+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+x+'</td>').join("")+'</tr>').join("")+'</tbody></table></div>';
const delta=n=>n==null?"새 종착":(n>0?"+":"")+fmt(n);
const middle=r=>r.actions.some((a,i)=>a.type==="conditionalCapGrowth"&&r.actions.slice(i+1).some(x=>x.type==="transform"));
const routeName=(db,r)=>r.actions.filter(a=>["transform","conditionalCapGrowth"].includes(a.type)).map(a=>a.type==="conditionalCapGrowth"?"[전투캡 성장 가정]":name(db,a.transform)).join(" → ");
const byScore=(a,b)=>(b[1].sumDelta??0)-(a[1].sumDelta??0)||sum(b[1].vector)-sum(a[1].vector);
export function growthReplayCoverage(db){
 const s=db.populationGrowthReplay?.summary;
 return s?" · 모집·연구 시간순 중간 성장 확장 "+fmt(s.registeredRoutes)+"경로 / "+fmt(s.improvedPairs)+"쌍 (실제 전역 미인증).":"";
}
export function growthReplayMarkup(db){
 const a=db.populationGrowthReplay;if(!a)return "";
 const s=a.summary,t=s.totals,mid=Object.values(a.routes).filter(middle).length;
 const rows=[["탐색 완료 시드 / 대상",fmt(s.completedSeeds)+" / "+fmt(s.seedCandidates)],["신규 후보 / 개선 조합",fmt(s.registeredRoutes)+" / "+fmt(s.improvedPairs)],["시술 사이 성장 삽입 후보",fmt(mid)],["동일 경로 합계 개선 조합",fmt(s.positiveSumPairBodies)],["최대 동일 경로 합계 증가","+"+fmt(s.maxSumDelta)],["정확 출생 체크포인트 재사용",fmt(t.birthCacheHits)+" / "+fmt(t.seedReplayed)],["후속 시술 시도 / 성공",fmt(t.transformAttempts)+" / "+fmt(t.transformAccepted)],["누적 탐색 시간",fmt(s.cumulativeSeconds)+"초"],["전체 게임 완전 판정",fmt(s.fullCompleted)]];
 const top=s.top.map(x=>['<a href="'+link(x.origin,x.branch,x.id)+'">'+esc(name(db,x.origin))+'</a>',esc(name(db,x.body)),fmt(x.baselineBestSum),fmt(x.total),delta(x.sumDelta)]);
 return '<details open class="bs-note" data-population-growth-replay="true"><summary>V5 모집·연구 시간순 재생 + 조건부 성장 및 후속 시술</summary><p>기존 모집·연구 상태 해시를 보존한 채 전투캡 성장 가정을 시술 전후에 삽입합니다. 기존 세 모집 후속 원장의 후보 대비 신규 비지배 결과입니다. 자원 획득, 실제 성장, 진급·훈장 획득과 전체 최적성은 미인증이며 제한 빔 탐색입니다.</p>'+table(["측정 지표","값"],rows.map(r=>r.map(esc)))+table(["출생처","종착 병종","기존 합계","신규 합계","증가"],top)+'<p><a href="'+esc(new URL("./data/"+a.file,import.meta.url).href)+'">시간순 성장 경로·상태 해시·탐색 체크포인트 (gzip)</a></p></details>';
}
export function growthReplayBranchMarkup(db,bid){
 const a=db.populationGrowthReplay;if(!a)return "";
 const best=new Map();
 for(const [id,r] of Object.entries(a.routes))if(r.branch===bid){const k=r.origin+"|"+r.body,p=best.get(k);if(!p||sum(r.vector)>sum(p[1].vector))best.set(k,[id,r]);}
 const rs=[...best.values()].sort(byScore);
 if(!rs.length)return "";
 return '<details class="bs-note" data-growth-replay-branch="true"><summary>V5 시간순 성장 확장 · 개선 종착 조합 '+fmt(rs.length)+'개</summary><p>같은 모집·연구 분기에서 기존 세 원장보다 개선된 제한 후보입니다. 실제 게임 전역 미인증.</p>'+table(["출생처","종착 병종","합계","기존 대비"],rs.map(([id,r])=>['<a href="'+link(r.origin,bid,id)+'">'+esc(name(db,r.origin))+'</a>',esc(name(db,r.body)),fmt(sum(r.vector)),delta(r.sumDelta)]))+'</details>';
}
export function growthReplayOriginMarkup(db,pid,bid,focus,labels={}){
 const a=db.populationGrowthReplay;if(!a)return "";
 const rs=Object.entries(a.routes).filter(([,r])=>r.origin===pid&&(!bid||r.branch===bid)).sort((a,b)=>Number(b[0]===focus)-Number(a[0]===focus)||byScore(a,b));
 if(!rs.length)return "";
 const cols=db.stats.map(k=>labels[k]||db.statLabels?.[k]||k);
 const render=([id,r],i)=>{
  const row=(k,v)=>[esc(k),...v.map(fmt)];
  return '<details'+(id===focus||i===0?' open':'')+'><summary>'+esc(name(db,r.body))+' · 합계 '+fmt(sum(r.vector))+' · 기존 대비 '+delta(r.sumDelta)+'</summary><p><a href="'+link(pid,r.branch,id)+'">'+esc(r.branch)+'</a> · '+(middle(r)?"시술 사이 성장 가정":"종착 성장 가정")+'</p><p>'+esc(routeName(db,r))+'</p>'+table(["구분",...cols],[row("원시 능력치",r.raw),row("영구 보너스",r.bonus),row("실효 능력치",r.vector)],"birth-stat-table")+'<p>선행 모집·연구 이력 <code>'+esc(r.seed)+'</code> · 전체 행동 SHA256 <code>'+esc(r.fullActionHash)+'</code> · 상태 SHA256 <code>'+esc(r.canonicalStateHash)+'</code></p></details>';
 };
 return '<section class="scope-note" data-growth-replay-origin="true"><h3>V5 시간순 모집·연구·성장 시술 후보</h3><p>조건부 전투 성장 삽입 위치와 기존 원장 대비 차이를 보존합니다. 모집·연구 시퀀스는 재생되었지만 성장·자원 실제 획득 및 전역 완전성은 미인증입니다. '+fmt(rs.length)+'경로.</p>'+rs.map(render).join("")+'</section>';
}
