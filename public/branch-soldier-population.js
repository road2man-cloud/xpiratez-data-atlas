// Shared coverage and route-level evidence for the population search.
// These are a finite numerical model, not certified campaign routes.
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=v=>Number.isFinite(v)?v.toLocaleString("ko-KR",{maximumFractionDigits:2}):"—";
const total=w=>w.vector.reduce((n,x)=>n+x,0);
const names=["미탐색·최종 모집조건 미충족","기존 조건부 경로 확보","제한 모델 계산 재사용","제한 모델 직접 계산"];
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
 const s=v.summary,c=s.statusCounts,b=s.benchmark;
 return "전체 출생처×연구 분기 "+fmt(s.pairCount)+"쌍 · 제한 D"+v.depth+" 수치모형 "+fmt(s.coveredPairs)+"쌍 (이벤트·출생 시점 미확인 "+fmt(s.eventTimingUnverifiedPairs)+"쌍 포함) · 기존 조건부 경로 "+fmt(s.knownConditionalPairs)+"쌍 · 미탐색 "+fmt(c.UNEXPLORED)+"쌍 · 제한 직접 "+fmt(c.LIMITED_SEARCH_COMPLETE)+"쌍 / 재사용 "+fmt(c.REUSED_LIMITED_MODEL)+"쌍 (중복 상태 제외) · 불가능/전역 최적 인증 0쌍. 연구 이력-출생 조합 "+fmt(s.historyOriginRequests-s.historyOriginBirthGateMissing)+"건 → "+fmt(s.groupCalculations)+"개 대표 그룹 · 전이 캐시 적중률 "+fmt(100*s.transitionCacheHits/Math.max(1,s.transitionRequests))+"%"+(b?.identical?" · 동일 그래프 대조 "+fmt(b.uncachedMs/b.cachedMs)+"배 (그룹 압축 공통)":"")+" · 전역 잔여 시간 미산정.";
}
function flags(v,i,j){
 const e=Number(v.evidence[i][j]);
 return [e&1?"연구·시술 조건부":null,e&2?"계급·훈장 조건부":null,e&4?"관측 뿌리 일치 (공동 이력 미재생)":null].filter(Boolean).join(" / ");
}
function pair(v,i,j){
 const ids=v.matrix[i][j],code=Number(v.status[i][j]);
 return {ids,code,label:names[code],flags:flags(v,i,j)};
}
function bestRoute(db,v,groups){
 const ids=[...new Set(groups.flatMap(k=>v.groups[k].representativeIds))];
 return ids.reduce((a,b)=>!a||total(db.witnesses[b])>total(db.witnesses[a])?b:a,null);
}
export function populationBranchMarkup(db,b){
 const p=db?.populationSearch,v=vOf(db);if(!v||!b)return "";
 const j=p.branches.indexOf(b.id);if(j<0)return '<p class="bs-sub">전체 출생처 탐색 대상 1,064개 연구 이력 보유 분기 밖의 후보입니다. 불가능 판정은 아닙니다.</p>';
 const rows=p.origins.map((pid,i)=>{
  const q=pair(v,i,j),r=v.records[i],best=bestRoute(db,v,q.ids);
  return {pid,q,r,best};
 });
 const covered=rows.filter(r=>r.q.ids.length).length;
 return '<details class="bs-note" data-population-branch="true"><summary>전체 72개 출생처 탐색 · D'+v.depth+' 제한 모형 '+fmt(covered)+'/72</summary><p class="bs-sub">현재 분기의 최종 활성 연구가 출생과 시술의 필요 연구를 충족하는지 계산했습니다. 출생·이벤트 시점, 시설·재료, 전투 성장 공동 달성 및 진급·훈장·미래 연구는 미증명입니다. 기존 조건부 경로와 별개이며 미충족을 불가능으로 처리하지 않습니다.</p><div class="bs-scroll"><table class="bs-table"><thead><tr><th>출생처</th><th>쌍 상태</th><th>대표 계산 그룹</th><th>제한 모형 최고 단일 합계</th></tr></thead><tbody>'+rows.map(({pid,q,r,best})=>'<tr><td><a href="'+routeLink(pid,b.id,best)+'">'+esc(db.labels[pid.slice(pid.indexOf(":")+1)]||pid)+'</a><small class="bs-sub">'+esc(db.labels[r.body]||r.body)+'</small></td><td>'+esc(q.label)+(q.flags?'<small class="bs-sub">'+esc(q.flags)+'</small>':"")+(r.sourceType==="event"&&q.ids.length?'<small class="bs-sub">이벤트 출생 시점 미확인</small>':"")+'</td><td>'+fmt(q.ids.length)+'</td><td>'+(best?'<a href="'+routeLink(pid,b.id,best)+'">'+fmt(total(db.witnesses[best]))+'</a>':"—")+'</td></tr>').join("")+'</tbody></table></div></details>';
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
 const head='<section class="scope-note" data-population-origin="true"><h3>출생처 × 연구 분기 · D'+v.depth+' 제한 수치모형</h3><p>'+esc(scope)+' · 전체 출생처의 기존 조건부 경로 '+fmt(conditional)+'쌍 · 최종 모집 연구 충족 '+fmt(j<0?r.coveredPairs:Number(groups.length>0))+'쌍 · 대표 계산 그룹 '+fmt(groups.length)+'개. 출생 최솟값/최댓값, 전투캡 성장 배치, 활성 연구만 사용한 일반 시술 최대 '+fmt(v.depth)+'회입니다. '+(r.sourceType==="event"?"이벤트 발생·국가 선택과 출생 시점은 아직 확인되지 않았습니다. ":"")+'실물·자금·시설 확보는 가정이며, 승급·훈장·무작위 시술·새 연구 및 전체 최적성은 별도입니다.</p>';
 const branchRows=j<0?'<details><summary>연구 분기별 탐색 상태 '+fmt(p.branches.length)+'쌍</summary><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>분기</th><th>상태</th><th>그룹</th></tr></thead><tbody>'+p.branches.map((bid,k)=>{const q=pair(v,i,k),b=db.branches.find(b=>b.id===bid);return '<tr><td><a href="'+branchLink(bid)+'">#'+fmt(b?.rank)+'</a></td><td><a href="'+routeLink(pid,bid)+'">'+esc(q.label)+'</a>'+(q.flags?' · '+esc(q.flags):"")+'</td><td>'+fmt(q.ids.length)+'</td></tr>';}).join("")+'</tbody></table></div></details>':"<p>쌍 상태: "+esc(pair(v,i,j).label)+(pair(v,i,j).flags?" · "+esc(pair(v,i,j).flags):"")+"</p>";
 if(!w)return head+'<p>이 범위의 제한 계산은 미진입입니다. 모집 연구가 다른 시점에 열리거나 추가 연구로 해금될 수 있으므로 불가능 증명으로 사용하지 않습니다.</p>'+branchRows+'</section>';
 const col=db.stats.map(k=>'<th>'+esc(labels[k]||k)+'</th>').join("");
 const row=(title,v)=>'<tr><th>'+esc(title)+'</th>'+v.map(n=>'<td>'+fmt(n)+'</td>').join("")+'</tr>';
 const ws=groups.filter(k=>v.groups[k].representativeIds.includes(best));
 const historyIds=[...new Set(ws.flatMap(k=>v.groups[k].historyIndices))].map(h=>v.histories[h]).filter(h=>!branchId||h.branchId===branchId);
 const seq=x=>(x.steps||[]).map((s,k)=>(x.growthBefore?.[k]?"[전투캡 성장] ":"")+name(s.id)).join(" → ")||"추가 시술 없음";
 return head+'<p>선택 종착 '+esc(name(w.body))+' · 출생 '+(w.birthBand==="max"?"최댓값":"최솟값")+' · '+esc(seq(w))+' · 마지막 전투캡 성장 가정 · 직접 시술비 '+fmt(w.fees)+' · 합계 '+fmt(total(w))+'</p><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>능력치</th>'+col+'</tr></thead><tbody>'+row("원시",w.raw)+row("영구 보너스",w.bonus)+row("실효",w.vector)+'</tbody></table></div><p>필요 연구: '+w.research.map(x=>esc(name(x))).join(" / ")+' · 연구 이력 참조 '+fmt(historyIds.length)+'개</p><details><summary>해당 모형의 연구 이력 별칭</summary>'+historyIds.map(h=>'<p><code>'+esc(h.id)+'</code> · '+fmt(h.steps)+'단계 · <a href="'+branchLink(h.branchId)+'">분기</a></p>').join("")+'</details><details><summary>제한 모형 대표 경로 '+fmt(ids.length)+'개</summary><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>최종 병종</th><th>시술</th><th>직접 시술비</th><th>합계</th></tr></thead><tbody>'+ids.sort((a,b)=>total(db.witnesses[b])-total(db.witnesses[a])).map(id=>{const x=db.witnesses[id];return '<tr><td>'+esc(name(x.body))+'</td><td>'+esc(seq(x))+'</td><td>'+fmt(x.fees)+'</td><td><a href="'+routeLink(pid,branchId,id)+'">'+fmt(total(x))+'</a></td></tr>';}).join("")+'</tbody></table></div></details>'+branchRows+'<p><a href="'+esc(new URL("./data/"+v.file,import.meta.url).href)+'">전체 보존 상태·행동 순서·전이 그래프 원장 (gzip)</a> · '+fmt(v.bytes/1048576)+' MiB · SHA256 <code>'+esc(v.sha256)+'</code></p></section>';
}
