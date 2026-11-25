// Conditional career frontier: separate from chronological campaign witnesses.
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=v=>Number.isFinite(v)?v.toLocaleString("ko-KR",{maximumFractionDigits:2}):"—";
const name=(db,k)=>db.labels?.[k]||db.labels?.[String(k).slice(String(k).indexOf(":")+1)]||k;
const sum=v=>v.reduce((s,x)=>s+x,0);
const link=(pid,bid)=>{const u=new URL("./soldiers/modern/",import.meta.url);u.searchParams.set("profile",pid);u.searchParams.set("branch",bid);u.hash="originDetails";return esc(u.href);};
const dataLink=f=>esc(new URL("./data/"+f,import.meta.url).href);
const table=(head,rows,cls="bs-table")=>'<div class="bs-scroll"><table class="'+cls+'"><thead><tr>'+head.map(k=>'<th>'+esc(k)+'</th>').join("")+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+x+'</td>').join("")+'</tr>').join("")+'</tbody></table></div>';
const status=g=>g?.status==="FIXED_PRESET_NUMERIC_CLOSED"?"고정 프리셋 수치모형 종결":g?.status==="OPEN"?"부분 탐색":"폐쇄 미증명";
const action=(db,a)=>a.kind==="CAP_TARGET"?"[전투캡 성장]":a.kind==="ASSUMED_PROMOTION"?"[승급 가정 → 계급 "+a.rank+"]":name(db,a.id)+(Object.keys(a.requiredMedals||{}).length?" [훈장 조건]":"");
function refs(a,c,i,j){
 const cid=c.classIndex[i]?.[j],pi=i*c.branches.length+j;
 return (a.classImprovements[cid]||[]).map(r=>{
  const g=a.groups[r.group],f=g?.frontier[r.route];
  return f?{...r,g,f,admitted:g.admittedPairIndices.includes(pi)}:null;
 }).filter(Boolean);
}
export function careerFrontierMarkup(db){
 const a=db.populationCareerFrontier;if(!a)return "";
 const s=a.summary,m=s.metrics;
 const rows=[["시술 조건 추가 대상 / 신규 종결 그룹",fmt(s.affectedGroups)+" / "+fmt(s.closedGroups)],["고정 프리셋 한정 종결 조합 (기존 무영향 포함)",fmt(s.modelClosedPairs)+" / "+fmt(s.pairCount)],["부분 / 미탐색 조합",fmt(s.modelPartialPairs)+" / "+fmt(s.modelUnprocessedPairs)],["신규 그룹별 후보 / 재생 경로",fmt(s.novelRoutes)+" / "+fmt(s.independentRouteReplays)],["훈장 자체 보너스 제외 개선 후보",fmt(s.permanentNovel)],["승급 행동 / 훈장 요구 시술 포함 경로",fmt(s.promotionRoutes)+" / "+fmt(s.medalGateRoutes)],["기존 전체 그룹 대비 영구 비지배 개선 조합",fmt(s.pairLevelPermanentImproved)],["그중 모집 요구 연구 충족 이력",fmt(s.admittedPairLevelPermanentImproved)],["독립 상태 / 전이 계산",fmt(s.storedStates)+" / "+fmt(m.computed)],["누적 전이 캐시 적중률",fmt(100*m.cacheHits/Math.max(1,m.requests))+"%"],["최근 생산 배치 캐시 적중률",s.roundMetrics?fmt(100*s.roundMetrics.cacheHits/Math.max(1,s.roundMetrics.requests))+"%":"—"],["기존 중복 전이 통합",fmt(s.migration?.mergedEdges)],["부분 탐색 그룹",fmt(s.openGroups)],["종결 우선 스케줄러 적용 전 / 현재 한정 종결",s.schedulerMigration?fmt(s.schedulerMigration.fromClosedPairs)+" / "+fmt(s.modelClosedPairs):"—"],["최근 배치 실제 신규 종결 조합",fmt(s.roundScheduler?.newClosedPairs)],["최근 배치 잔여 묶음",fmt(s.roundScheduler?.remainingBundles)],["전체 게임 완전 판정",fmt(s.globalCompleted)+" / "+fmt(s.pairCount)]];
 const statNames={tu:"행동력",stamina:"지구력",health:"체력",bravery:"용기",reactions:"반응",firing:"사격",throwing:"투척",strength:"근력",psiStrength:"부두 강도",psiSkill:"부두 기술",melee:"근접",mana:"마나"};
 const maxima=db.stats.map((k,i)=>[esc(statNames[k]||k),fmt(s.oldPermanentMax[i]),fmt(s.newPermanentMax[i]),fmt(Math.max(s.oldPermanentMax[i]??0,s.newPermanentMax[i]??0))]);
 return '<details open class="bs-note" data-population-career-frontier="true"><summary>계급·훈장 조건부 실제 행동 재생 · 신규 파레토 후보</summary><p>출생을 가정하고 관측 고정 활성 연구에서 필수 훈장 단일 프리셋을 보유한다고 가정합니다. 승급은 별도 행동으로 재생합니다. 훈장·승급 획득 및 실제 캠페인 공동 달성은 미증명입니다. 완전 판정 집계에 합산하지 않습니다.</p>'+table(["측정 지표","값"],rows.map(r=>r.map(esc)))+table(["능력치","기존 모형 최고","신규 경로 최고 (훈장 제외)","통합 조건부 최고"],maxima)+'<p><a href="'+dataLink(a.file)+'">신규 경로 원장 (gzip)</a> · <a href="'+dataLink(a.proof.file)+'">전이 상태·재개 증거 (gzip)</a></p></details>';
}
export function careerFrontierOriginMarkup(db,pid,bid,labels={}){
 const a=db.populationCareerFrontier,c=db.populationAssumedBirthClosure;if(!a||!c||a.source.pairMapHash!==c.pairMapHash)return "";
 const i=c.origins.indexOf(pid);if(i<0)return "";
 const head='<section class="scope-note" data-career-frontier-origin="true"><h3>계급·훈장 조건부 신규 육성 후보</h3><p>가정 승급·필수 훈장 프리셋 및 고정 연구에서 재생한 경로입니다. 실제 캠페인 전역 최강 경로로 인증되지 않았습니다.</p>';
 if(!bid){
  const classes=new Map();let n=0,admitted=0;
  for(let j=0;j<c.branches.length;j++){
   const rs=refs(a,c,i,j).filter(r=>r.permanent);if(!rs.length)continue;n++;
   if(rs.some(r=>r.admitted))admitted++;
   const cid=c.classIndex[i][j],best=rs.slice().sort((x,y)=>sum(y.f.permanentVector)-sum(x.f.permanentVector))[0],prev=classes.get(cid);
   if(prev){prev.count++;if(!prev.best.admitted&&best.admitted){prev.best=best;prev.j=j;}}
   else classes.set(cid,{j,count:1,best});
  }
  if(!n)return head+"<p>현재 출생처에 등록된 신규 영구 비지배 후보가 없습니다. 미탐색 또는 기존 후보 유지 상태입니다.</p></section>";
  const rs=[...classes.values()].sort((x,y)=>sum(y.best.f.permanentVector)-sum(x.best.f.permanentVector));
  return head+'<p>기존 전체 그룹 대비 개선 '+fmt(n)+'개 분기 · 그중 모집 요구 연구 충족 이력 '+fmt(admitted)+'개 분기.</p><details><summary>개선 조합 대표 분기 '+fmt(rs.length)+'개</summary>'+table(["대표 분기","동등 분기","종착 병종","영구 합계","모집 연구"],rs.map(r=>['<a href="'+link(pid,c.branches[r.j])+'">'+esc(c.branches[r.j])+'</a>',fmt(r.count),esc(name(db,r.best.f.body)),fmt(sum(r.best.f.permanentVector)),r.best.admitted?"충족 이력":"출생 가정"]))+'</details></section>';
 }
 const j=c.branches.indexOf(bid);if(j<0)return "";
 const rs=refs(a,c,i,j).sort((x,y)=>Number(y.permanent)-Number(x.permanent)||Number(y.admitted)-Number(x.admitted)||sum(y.f.permanentVector)-sum(x.f.permanentVector));
 const gs=c.classes[c.classIndex[i][j]]?.groups||[],processed=gs.filter(gi=>a.groups[gi]).length;
 if(!rs.length)return head+'<p>이 조합에서 기존 전체 그룹 대비 신규 후보 없음 · 신규 계산 그룹 '+fmt(processed)+'개 / 원본 그룹 '+fmt(gs.length)+'개. 미탐색을 불가능으로 판정하지 않습니다.</p></section>';
 const cols=db.stats.map(k=>labels[k]||db.statLabels?.[k]||k);
 const render=r=>{
  const f=r.f,g=r.g,med=Object.entries(g.medals).map(([id,n])=>name(db,id)+" (내부 등급 "+n+")").join(", ")||"없음";
  const route=f.actions.map(a=>action(db,a)).join(" → ")||"출생 상태";
  const rows=[["원시",f.raw],["훈장 제외 보너스",f.permanentBonus],["훈장 제외 실효",f.permanentVector],["프리셋 포함 보너스",f.bonus],["프리셋 포함 실효",f.vector]].map(([k,v])=>[esc(k),...v.map(fmt)]);
  return '<details><summary>'+esc(name(db,f.body))+' · 영구 합계 '+fmt(sum(f.permanentVector))+' · '+(r.permanent?"영구 비지배 개선":"훈장 포함 개선")+'</summary><p>'+esc(route)+'</p><p>계급 '+fmt(f.rank)+' · '+esc(status(g))+' · '+(r.admitted?"최종 연구 모집요건 충족 이력":"출생 자체 가정")+' · 그룹 #'+fmt(r.group+1)+'</p><p>가정 훈장 프리셋: '+esc(med)+'</p>'+table(["구분",...cols],rows,"birth-stat-table")+'<small>후보 ID '+esc(f.id)+'</small></details>';
 };
 return head+'<p>기존 전체 그룹 대비 신규 후보 '+fmt(rs.length)+'개 · 훈장 제외 개선 '+fmt(rs.filter(r=>r.permanent).length)+'개 · 모집 요구 연구 충족 이력 '+fmt(rs.filter(r=>r.admitted).length)+'개 후보. 새 후보끼리의 전역 최적성은 미증명입니다.</p>'+rs.map(render).join("")+'</section>';
}
