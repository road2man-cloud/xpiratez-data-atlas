// V4 hypothetical birth catalogue. Never merges these proofs into game completion.
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=v=>Number.isFinite(v)?v.toLocaleString("ko-KR",{maximumFractionDigits:2}):"—";
const name=(db,k)=>db.labels[k]||db.labels[k.slice(k.indexOf(":")+1)]||k;
const pct=v=>fmt(v*100)+"%";
const dataLink=f=>esc(new URL("./data/"+f,import.meta.url).href);
function link(pid,bid,route){
 const u=new URL("./soldiers/modern/",import.meta.url);u.searchParams.set("profile",pid);
 if(bid)u.searchParams.set("branch",bid);if(route)u.searchParams.set("populationRoute",route);
 u.hash="originDetails";return esc(u.href);
}
function branchLink(bid){
 const u=new URL("./captains/",import.meta.url);u.searchParams.set("branch",bid);u.hash="integratedBranches";return esc(u.href);
}
function pair(a,i,j){
 const c=a.classes[a.classIndex[i][j]];if(!c)return null;
 return {c,admitted:a.admittedStatus[i][j]==="1",best:c.bodies.reduce((x,y)=>!x||y.bestSum>x.bestSum?y:x,null)};
}
const gate=x=>x.admitted?"최종 연구 모집요건 충족 이력 있음":"출생 가정 · 최종 연구 모집요건 미확인";
const table=(head,rows,cls="bs-table")=>'<div class="bs-scroll"><table class="'+cls+'"><thead><tr>'+head.map(k=>'<th>'+esc(k)+'</th>').join("")+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+x+'</td>').join("")+'</tr>').join("")+'</tbody></table></div>';
export function assumedBirthCoverage(db){
 const s=db.populationAssumedBirthClosure?.summary;if(!s)return "";
 return " V4 출생 가정 고정 연구 수치모형 "+fmt(s.conditionalClosed)+"/"+fmt(s.pairCount)+"쌍 · 최종 연구 모집요건 충족 이력 "+fmt(s.admittedPairCount)+"쌍 · 출생 가정만 "+fmt(s.assumedOnlyClosed)+"쌍 (실제 모집·전역 판정과 별개).";
}
export function assumedBirthMarkup(db){
 const a=db.populationAssumedBirthClosure;if(!a)return "";
 const s=a.summary,t=s.totals,g=a.boundGap.summary,b=g.branchGap;
 const rows=[["원본 조합 / 수치모형 종결",fmt(s.pairCount)+" / "+fmt(s.conditionalClosed)],["최종 연구 모집요건 충족 이력 / 출생 가정만",fmt(s.admittedPairCount)+" / "+fmt(s.assumedOnlyClosed)],["대표 조합 / 동등성 재사용",fmt(s.conditionalDirect)+" / "+fmt(s.conditionalEquivalent)],["종결 그룹 / 전체 그룹",fmt(s.certifiedGroups)+" / "+fmt(s.groups)],["신규 계산 / 기존 증명 재사용",fmt(s.newCertifiedGroups)+" / "+fmt(s.sourceGroups)],["파레토 대표 벡터",fmt(s.frontierRepresentatives)],["독립 전이 / 전체 요청",fmt(t.computed)+" / "+fmt(t.requests)],["전이 캐시 적중률",pct((t.localHits+t.sourceHits)/Math.max(1,t.requests))],["후보 우위 합류 / 대표 대체",fmt(t.coveredCandidates)+" / "+fmt(t.retiredRepresentatives)],["우위 대표 / 도달 기록",fmt(s.liveRepresentatives)+" / "+fmt(s.admittedRecords)],["신규 탐색 누적 시간",fmt(s.cumulativeSeconds)+"초"],["시간순 재생 / 출생처·분기·종착 조합",fmt(g.replayRows)+" / "+fmt(g.pairBodies)],["분기 상계 정밀화 조합",fmt(b?.tighterPairBodies)+" / "+fmt(b?.comparedPairBodies)],["분기 상계 일치 원시 / 실효 항목",fmt(b?.rawEqual)+" / "+fmt(b?.effectiveEqual)],["전체 게임 완전 판정",fmt(s.fullCompleted)+" / "+fmt(s.pairCount)]];
 const priority=(b?.priority||[]).slice(0,10).map(x=>['<a href="'+link(x.origin,x.branch,x.witness)+'">'+esc(name(db,x.origin))+'</a>','<a href="'+branchLink(x.branch)+'">'+esc(x.branch)+'</a>',esc(name(db,x.body)),fmt(x.bestSum),fmt(x.sumGap)]);
 return '<details open class="bs-note" data-population-assumed-birth="true"><summary>V4 전체 72개 출생처 × 1,064개 분기 · 출생 가정 수치모형</summary><p><b>실제 전역 완료와 별개:</b> 모든 출생처가 이미 존재한다고 가정하고 관측된 최종 활성 연구에서 허용되는 시술, 독립 능력치 성장·난수를 포함해 수치모형을 폐쇄합니다. 모집 요구 연구가 없는 경우도 계산하며 실제 모집 허용 또는 불가능의 증명이 아닙니다. 연구 시간순 변화·출생 시점·승급·훈장·자원·난수 상관은 별도입니다.</p>'+table(["측정 지표","값"],rows.map(r=>r.map(esc)))+'<p><a href="'+dataLink(a.catalog.file)+'">전체 원본 대응 및 종착 병종별 파레토 카탈로그 (gzip)</a> · <a href="'+dataLink(a.file)+'">상태·전이·폐쇄 증거 (gzip)</a> · <a href="'+dataLink(a.boundGap.file)+'">조건부 재생과 상계 차이 원장 (gzip)</a></p>'+(priority.length?'<details><summary>조건부 재생 후속 탐색 우선순위</summary><p>느슨한 독립 실효 상계와의 차이 순입니다. 차이 0도 실제 캠페인 달성 증명은 아닙니다.</p>'+table(["출생처","분기","종착","재생 합계","상계 차이"],priority)+'</details>':"")+'</details>';
}
export function assumedBirthBranchMarkup(db,bid){
 const a=db.populationAssumedBirthClosure;if(!a)return "";
 const j=a.branches.indexOf(bid);if(j<0)return "";
 const rows=a.origins.map((pid,i)=>({pid,x:pair(a,i,j)})).filter(r=>r.x);
 return '<details class="bs-note" data-assumed-birth-branch="true"><summary>V4 출생 가정 수치모형 · '+fmt(rows.length)+'/72 출생처</summary><p>수치모형 안의 동일 경로 합계이며 실제 모집·전역 달성 미인증입니다.</p>'+table(["출생처","모집 조건","종착 병종","수치모형 최고 합계","대표 조합"],rows.map(({pid,x})=>['<a href="'+link(pid,bid)+'">'+esc(name(db,pid))+'</a>',esc(gate(x)),esc(name(db,x.best?.body||"")),fmt(x.best?.bestSum),"#"+fmt(x.c.id+1)]))+'</details>';
}
export function assumedBirthOriginMarkup(db,pid,bid,labels={}){
 const a=db.populationAssumedBirthClosure;if(!a)return "";
 const i=a.origins.indexOf(pid);if(i<0)return "";
 const cols=db.stats.map(k=>labels[k]||db.statLabels?.[k]||k);
 const prefix='<section class="scope-note" data-assumed-birth-origin="true"><h3>V4 출생 가정 수치모형 · 깊이 무제한 12능력치 파레토</h3><p><b>실제 게임 전역 완료 미인증.</b> 출생 자체를 가정한 뒤 관측된 최종 활성 연구에서 계산합니다. 모집·이벤트 시점, 연구 시간순 변화, 승급·훈장·자원, 공동 난수는 별도입니다.</p>';
 if(!bid){
  const rs=a.branches.map((id,j)=>({id,x:pair(a,i,j)})).filter(r=>r.x),best=new Map();
  for(const r of rs)for(const body of r.x.c.bodies){const old=best.get(body.body);if(!old||body.bestSum>old.body.bestSum)best.set(body.body,{id:r.id,body,x:r.x});}
  const top=[...best.values()].sort((x,y)=>y.body.bestSum-x.body.bestSum);
  return prefix+'<p>종결 '+fmt(rs.length)+'/'+fmt(a.branches.length)+'분기 · 최종 연구 모집요건 충족 이력 '+fmt(rs.filter(r=>r.x.admitted).length)+'분기.</p>'+table(["종착 병종","동일 경로 합계","대표 분기","모집 조건"],top.map(r=>[esc(name(db,r.body.body)),fmt(r.body.bestSum),'<a href="'+link(pid,r.id)+'">'+esc(r.id)+'</a>',esc(gate(r.x))]))+'<details><summary>전체 분기별 V4 수치모형 '+fmt(rs.length)+'개</summary>'+table(["분기","모집 조건","수치모형 최고 합계"],rs.map(r=>['<a href="'+link(pid,r.id)+'">'+esc(r.id)+'</a>',esc(gate(r.x)),fmt(r.x.best?.bestSum)]))+'</details></section>';
 }
 const j=a.branches.indexOf(bid);if(j<0)return "";
 const x=pair(a,i,j);if(!x)return prefix+'<p>미종결입니다.</p></section>';
 const actions=f=>(f.actions||[]).map(k=>k==="CAP_TARGET"?"[전투캡 성장]":name(db,k)+(db.populationRandomBox?.changed.some(r=>r.id===k)?" [독립 최대 증가량]":"")).join(" → ")||"출생 상태";
 const row=(title,vec)=>[esc(title),...vec.map(fmt)];
 const bodies=x.c.bodies.slice().sort((a,b)=>b.bestSum-a.bestSum).map(b=>{
  const g=a.groups[b.best.group],f=g.frontier[b.best.index];
  return '<details'+(b===x.best?' open':'')+'><summary>'+esc(name(db,b.body))+' · 동일 경로 합계 '+fmt(b.bestSum)+'</summary><p>'+esc(actions(f))+' · 계산 그룹 #'+fmt(g.id+1)+'</p>'+table(["구분",...cols],[row("합계 최고 경로 원시",f.raw),row("합계 최고 경로 보너스",f.bonus),row("합계 최고 경로 실효",f.vector),row("독립 좌표별 실효 최고 (동시 달성 아님)",b.coordinateMax)],"birth-stat-table")+'<p>증거 SHA256 <code>'+esc(g.proofHash)+'</code></p></details>';
 }).join("");
 const front=x.c.groups.map(gi=>a.groups[gi]).map(g=>'<details><summary>계산 그룹 #'+fmt(g.id+1)+' · '+fmt(g.frontier.length)+'개 파레토 대표</summary>'+table(["종착 병종 / 시술",...cols],g.frontier.map(f=>[esc(name(db,f.body))+'<small class="bs-sub">'+esc(actions(f))+'</small>',...f.vector.map(fmt)]),"birth-stat-table")+'<p>증거 SHA256 <code>'+esc(g.proofHash)+'</code></p></details>').join("");
 return prefix+'<p>'+esc(gate(x))+' · 대표 조합 #'+fmt(x.c.id+1)+' · '+fmt(x.c.groups.length)+'그룹 · 병종별 비지배 합집합 '+fmt(x.c.frontierCount)+'개</p>'+bodies+'<details><summary>그룹별 전체 파레토 대표 경로</summary>'+front+'</details></section>';
}
