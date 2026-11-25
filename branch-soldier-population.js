// Shared coverage and route-level evidence for the population search.
// These are a finite numerical model, not certified campaign routes.
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=v=>Number.isFinite(v)?v.toLocaleString("ko-KR",{maximumFractionDigits:2}):"—";
const total=w=>w.vector.reduce((n,x)=>n+x,0);
const names=["미탐색·추가 연구 필요","기존 조건부 경로 확보","제한 모델 계산 재사용","제한 모델 직접 계산","공동 모집 연구 재생","추가 모집 연구·출생 재생","이벤트 출생 시간순 재생"];
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
 const s=v.summary,c=s.statusCounts,b=s.benchmark,j=db.populationJointCoverage,cs=j?.counts;
 if(j&&cs){
  const u=db.originUnlockSearch?.summary,t=db.originUnlockContinuation?.summary;
  return "전체 "+fmt(s.pairCount)+"쌍 · 중복 제외 근거 확보 "+fmt(j.uniqueCovered)+"쌍 ("+fmt(j.uniqueCovered/s.pairCount*100)+"%) · 미탐색 "+fmt(cs.unexplored)+"쌍 · 기존 조건부 "+fmt(cs.conditionalPath)+"쌍 · 공동 모집 "+fmt(cs.jointBirth)+"쌍 · 추가 연구·모집 "+fmt(cs.chronologicalUnlock)+"쌍 · 이벤트 출생 "+fmt(cs.eventBirth??0)+"쌍 · 제한 재사용 "+fmt(cs.limitedReused)+"쌍 / 직접 "+fmt(cs.limitedDirect)+"쌍. 추가 모집 "+fmt(u?.registeredOrigins)+"출생처·"+fmt(u?.registeredBranches)+"분기, 종전 수치모형 밖 "+fmt(u?.unlockOutsideModel)+"쌍. 이벤트 "+fmt(db.originEventBirth?.summary?.registeredOrigins??0)+"출생처 · "+fmt(db.originEventBirth?.summary?.registeredVariants??0)+"개 시간순 대안. 후속 시술 "+fmt(t?.registeredRoutes)+"경로 · 중간 성장 없는 제한 D"+(t?.depth??0)+" 계산 완료 "+fmt(t?.completedPairs)+"쌍. D"+v.depth+" 수치모형 "+fmt(s.coveredPairs)+"쌍에는 이벤트 출생 미확인 "+fmt(s.eventTimingUnverifiedPairs)+"쌍 포함. 불가능·전역 최적 인증 0쌍 · 전역 잔여 시간 미산정.";
 }
 return "전체 출생처×연구 분기 "+fmt(s.pairCount)+"쌍 · 제한 D"+v.depth+" 수치모형 "+fmt(s.coveredPairs)+"쌍 (이벤트·출생 시점 미확인 "+fmt(s.eventTimingUnverifiedPairs)+"쌍 포함) · 기존 조건부 경로 "+fmt(s.knownConditionalPairs)+"쌍 · 미탐색 "+fmt(c.UNEXPLORED)+"쌍 · 제한 직접 "+fmt(c.LIMITED_SEARCH_COMPLETE)+"쌍 / 재사용 "+fmt(c.REUSED_LIMITED_MODEL)+"쌍 (중복 상태 제외) · 불가능/전역 최적 인증 0쌍. 연구 이력-출생 조합 "+fmt(s.historyOriginRequests-s.historyOriginBirthGateMissing)+"건 → "+fmt(s.groupCalculations)+"개 대표 그룹 · 전이 캐시 적중률 "+fmt(100*s.transitionCacheHits/Math.max(1,s.transitionRequests))+"%"+(b?.identical?" · 동일 그래프 대조 "+fmt(b.uncachedMs/b.cachedMs)+"배 (그룹 압축 공통)":"")+(v.boundQueries?.queries?.length?" · 완료 DAG 상계 질의 "+fmt(v.boundQueries.queries.length)+"종 전수 대조 일치":"")+" · 전역 잔여 시간 미산정.";
}
const objectiveName=k=>({total:"12능력치 동일 경로 합계",mana:"마나",firing:"사격",strength:"근력"})[k]||k;
const preboundVersions=db=>Object.values(db?.populationPreboundSearch?.versions||{}).sort((a,b)=>b.depth-a.depth||a.query.objective.localeCompare(b.query.objective));
const preboundTarget=(db,q)=>Object.entries(q.targets||{}).map(([k,n])=>(db.statLabels?.[k]||({psiStrength:"부두 강도",tu:"행동력",health:"체력"})[k]||k)+" ≥ "+fmt(n)).concat(q.maxFees!=null?["직접 시술비 "+fmt(q.maxFees)+" 이하"]:[]).join(" · ");
function preboundMarkup(db){
 const vs=preboundVersions(db);if(!vs.length)return "";
 return '<details open class="bs-note" data-population-prebound="true"><summary>미생성 상태 상계 · 목적별 제한 탐색 D'+fmt(vs[0].depth)+'</summary><p>최종 활성 연구, 출생 최소·최대 벡터, 건강한 대원, 결정론적 일반 시술, 전투캡 전후 성장만 허용한 모델입니다. '+fmt(vs[0].summary.modeledOrigins)+'/72 출생처 · '+fmt(vs[0].summary.groups)+'그룹 · '+fmt(vs[0].summary.pairs)+'쌍. 승급·훈장·추가 연구·실제 성장 시점·무작위 시술은 포함하지 않습니다. 엄격하게 열등한 상계만 생략하고 동점 순서를 모두 보존했습니다. 실제 게임 전체 최적성 인증은 0건입니다.</p><div class="bs-scroll"><table class="bs-table"><thead><tr><th>목표 / 깊이</th><th>기존 → 최고</th><th>직접 방문 / 전수 순서</th><th>신규 상태</th><th>계산 시간 / 속도</th><th>동점 경로 및 근거</th></tr></thead><tbody>'+vs.map(v=>{
 const s=v.summary,b=v.benchmark,w=v.witnessIds[0]&&db.witnesses[v.witnessIds[0]];
 return '<tr><td>'+esc(objectiveName(v.query.objective))+' · D'+fmt(v.depth)+'<small class="bs-sub">'+esc(preboundTarget(db,v.query)||"추가 목표 없음")+'</small></td><td>'+fmt(s.initialBest)+' → '+(w?'<a href="'+routeLink(w.originProfile,null,v.witnessIds[0])+'">'+fmt(s.bestScore)+'</a>':fmt(s.bestScore))+'</td><td>'+fmt(s.visitedLabels)+' / '+fmt(b?.fullLabels)+'<small class="bs-sub">가지치기 접두부 '+fmt(s.prunedPrefixes)+'</small></td><td>'+fmt(s.exactStatesGenerated)+'</td><td>'+fmt(s.elapsedMs/1000)+'초'+(b?'<small class="bs-sub">'+fmt(b.fullMs/1000)+'초 대비 '+fmt(b.speedup)+'배 · 전체 동점 해시 일치</small>':'<small class="bs-sub">동일 깊이 전수 대조 미실행</small>')+'</td><td>'+fmt(s.ties)+'개 · <a href="'+esc(new URL("./data/"+v.file,import.meta.url).href)+'">전체 경로·상계 증거</a>'+(b?' · <a href="'+esc(new URL("./data/"+b.file,import.meta.url).href)+'">전수 비교</a>':"")+'</td></tr>';
 }).join("")+'</tbody></table></div><p class="bs-sub">수치 상태 방문 감소와 실제 실행 시간 개선은 서로 다른 지표입니다. 이미 완료된 유한 깊이 안의 결과만 인증합니다.</p></details>';
}
export function populationPreboundOriginMarkup(db,pid,branchId=null,focus=null,labels={}){
 const vs=preboundVersions(db),rows=vs.flatMap(v=>v.witnessIds.filter(id=>{const w=db.witnesses[id];return w?.originProfile===pid&&(!branchId||w.branchIds.includes(branchId));}).map(id=>({v,id,w:db.witnesses[id]})));
 if(!rows.length)return "";
 const selected=rows.find(r=>r.id===focus)||rows[0],{v,w,id}=selected,name=k=>db.labels[k]||k;
 const seq=x=>(x.steps||[]).map((s,i)=>(x.growthBefore?.[i]?"[전투캡 성장] ":"")+name(s.id)).join(" → ")||"추가 시술 없음";
 const col=db.stats.map(k=>'<th>'+esc(labels[k]||k)+'</th>').join(""),row=(title,vec)=>'<tr><th>'+esc(title)+'</th>'+vec.map(n=>'<td>'+fmt(n)+'</td>').join("")+'</tr>';
 return '<section class="scope-note" data-population-prebound-origin="true"><h3>미생성 상태 상계로 확보한 목적별 최고 경로</h3><p>선택 경로는 '+fmt(v.summary.modeledOrigins)+'개 출생처 제한 모형의 '+esc(objectiveName(v.query.objective))+' 최고 동점 대표입니다. 이 분기의 모든 경로 또는 전체 게임 최고치라는 뜻은 아닙니다. D'+fmt(v.depth)+' · '+esc(preboundTarget(db,v.query)||"추가 목표 없음")+' · 전체 동점 '+fmt(v.summary.ties)+'개.</p><p>최종 병종 '+esc(name(w.body))+' · 출생 '+(w.birthBand==="max"?"최댓값":"최솟값")+' · '+esc(seq(w))+' · 마지막 전투캡 성장 가정 · 직접 시술비 '+fmt(w.fees)+' · 동일 경로 합계 '+fmt(total(w))+'</p><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>능력치</th>'+col+'</tr></thead><tbody>'+row("원시",w.raw)+row("영구 보너스",w.bonus)+row("실효 (조건부)",w.vector)+'</tbody></table></div><p>필요 연구 '+w.research.map(k=>esc(name(k))).join(" / ")+' · 연구 이력 '+fmt(w.populationPrebound.historyIds.length)+'개 · <a href="'+esc(new URL("./data/"+v.file,import.meta.url).href)+'">모든 동점·가지치기 증거 원장</a> · SHA256 <code>'+esc(v.sha256)+'</code></p><details><summary>이 출생처의 목적별 대표 '+fmt(rows.length)+'개</summary><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>목표</th><th>시술 순서</th><th>직접 시술비</th><th>최고값</th></tr></thead><tbody>'+rows.map(({v,id,w})=>'<tr><td>'+esc(objectiveName(v.query.objective))+' D'+fmt(v.depth)+'</td><td>'+esc(seq(w))+'</td><td>'+fmt(w.fees)+'</td><td><a href="'+routeLink(pid,branchId,id)+'">'+fmt(v.summary.bestScore)+'</a></td></tr>').join("")+'</tbody></table></div></details></section>';
}
export function populationBoundMarkup(db){
 const v=vOf(db),q=v?.boundQueries?.queries;if(!q?.length)return preboundMarkup(db);
 return '<details class="bs-note" data-population-bounds="true"><summary>완료 D'+v.depth+' 그래프의 상계 기반 질의 결과</summary><p>남은 깊이별 능력치와 동일 경로 목적값 상계를 메모화합니다. 목표에 미달하거나 기존 최고보다 낮은 하위 행동 순서는 방문하지 않습니다. 상계 자체는 이미 완료된 유한 그래프에서 계산한 것이므로 게임 전체 미탐색 경로의 최적성 인증은 아닙니다.</p><div class="bs-scroll"><table class="bs-table"><thead><tr><th>목표</th><th>조건부 최고</th><th>전체 순서</th><th>직접 방문</th><th>상계·비용으로 생략</th><th>전수 비교</th></tr></thead><tbody>'+q.map(r=>'<tr><td>'+esc(r.query.objective==="total"?"12능력치 동일 경로 합계":({firing:"사격",mana:"마나"})[r.query.objective]||r.query.objective)+'<small class="bs-sub">'+esc(Object.entries(r.query.targets).map(([k,n])=>k+" ≥ "+n).join(" / ")+(r.query.maxFees!=null?" · 직접비용 "+fmt(r.query.maxFees)+" 이하":""))+'</small></td><td>'+fmt(r.bestScore)+'</td><td>'+fmt(r.orderedLabels)+'</td><td>'+fmt(r.visitedLabels)+'</td><td>'+fmt(r.prunedLabels)+'</td><td>'+(r.identicalToFullLabelScan?"일치":"미확인")+'</td></tr>').join("")+'</tbody></table></div></details>'+preboundMarkup(db);
}
function flags(v,i,j){
 const e=Number(v.evidence[i][j]);
 return [e&1?"연구·시술 조건부":null,e&2?"계급·훈장 조건부":null,e&4?"관측 뿌리 일치 (공동 이력 미재생)":null].filter(Boolean).join(" / ");
}
function pair(db,v,i,j){
 const ids=v.matrix[i][j],code=Number(db.populationJointCoverage?.status?.[i]?.[j]??v.status[i][j]);
 return {ids,code,label:names[code],flags:flags(v,i,j)};
}
const unlockRoutes=(db,pid,bid)=>{
 const pair=pid+"|"+bid,r=db.originUnlockSearch?.pairs?.[pair];
 if(!r)return [];
 return [...r.witnessIds,...Object.entries(db.originUnlockContinuation?.routes||{}).filter(([,x])=>x.pair===pair).map(([id])=>id)].filter(id=>db.witnesses[id]);
};
const eventRoutes=(db,pid,bid)=>{
 const e=db.originEventBirth,r=e?.pairs?.[pid+"|"+bid];return (r?.variants||[]).flatMap(id=>e.variants[id].witnessIds).filter(id=>db.witnesses[id]);
};
const bestUnlock=(db,pid,bid)=>[...unlockRoutes(db,pid,bid),...eventRoutes(db,pid,bid)].reduce((a,b)=>!a||total(db.witnesses[b])>total(db.witnesses[a])?b:a,null);
function bestRoute(db,v,groups){
 const ids=[...new Set(groups.flatMap(k=>v.groups[k].representativeIds))];
 return ids.reduce((a,b)=>!a||total(db.witnesses[b])>total(db.witnesses[a])?b:a,null);
}
export function populationBranchMarkup(db,b){
 const p=db?.populationSearch,v=vOf(db);if(!v||!b)return "";
 const j=p.branches.indexOf(b.id);if(j<0)return '<p class="bs-sub">전체 출생처 탐색 대상 1,064개 연구 이력 보유 분기 밖의 후보입니다. 불가능 판정은 아닙니다.</p>';
 const rows=p.origins.map((pid,i)=>{
  const q=pair(db,v,i,j),r=v.records[i],best=bestRoute(db,v,q.ids),unlock=bestUnlock(db,pid,b.id);
  return {pid,q,r,best,unlock};
 });
 const covered=rows.filter(r=>r.q.ids.length).length;
 return '<details class="bs-note" data-population-branch="true"><summary>전체 72개 출생처 탐색 · D'+v.depth+' 제한 모형 '+fmt(covered)+'/72</summary><p class="bs-sub">현재 분기의 최종 활성 연구가 출생과 시술의 필요 연구를 충족하는지 계산했습니다. 출생·이벤트 시점, 시설·재료, 전투 성장 공동 달성 및 진급·훈장·미래 연구는 미증명입니다. 기존 조건부 경로와 별개이며 미충족을 불가능으로 처리하지 않습니다.</p><div class="bs-scroll"><table class="bs-table"><thead><tr><th>출생처</th><th>쌍 상태</th><th>대표 계산 그룹</th><th>제한 모형 최고 단일 합계</th><th>추가 연구·이벤트 모집 후 시술</th></tr></thead><tbody>'+rows.map(({pid,q,r,best,unlock})=>'<tr><td><a href="'+routeLink(pid,b.id,best)+'">'+esc(db.labels[pid.slice(pid.indexOf(":")+1)]||pid)+'</a><small class="bs-sub">'+esc(db.labels[r.body]||r.body)+'</small></td><td>'+esc(q.label)+(q.flags?'<small class="bs-sub">'+esc(q.flags)+'</small>':"")+(r.sourceType==="event"&&q.ids.length?'<small class="bs-sub">제한 수치모형의 이벤트 출생 시점 미확인</small>':"")+'</td><td>'+fmt(q.ids.length)+'</td><td>'+(best?'<a href="'+routeLink(pid,b.id,best)+'">'+fmt(total(db.witnesses[best]))+'</a>':"—")+'</td><td>'+(unlock?'<a href="'+routeLink(pid,b.id,unlock)+'">'+fmt(total(db.witnesses[unlock]))+'점 · 경로</a>':"—")+'</td></tr>').join("")+'</tbody></table></div></details>';
}
export function populationEventOriginMarkup(db,pid,branchId=null,focus=null,labels={}){
 const e=db?.originEventBirth;if(!e)return "";
 const pairs=Object.values(e.pairs).filter(p=>p.origin===pid&&(!branchId||p.branch===branchId));
 if(!pairs.length)return "";
 const ids=pairs.flatMap(p=>eventRoutes(db,p.origin,p.branch)),chosen=ids.includes(focus)?focus:ids.reduce((a,b)=>!a||total(db.witnesses[b])>total(db.witnesses[a])?b:a,null);
 const w=db.witnesses[chosen],r=e.variants[w.populationEvent.variant],root=e.roots[r.root],name=id=>db.labels[id]||id,ranks=new Map(db.branches.map(b=>[b.id,b.rank]));
 const seq=x=>(x.steps||[]).map(s=>name(s.id)).join(" → ")||"시술 없음";
 const row=(title,v)=>'<tr><th>'+esc(title)+'</th>'+v.map(n=>'<td>'+fmt(n)+'</td>').join("")+'</tr>';
 const cols=db.stats.map(k=>'<th>'+esc(labels[k]||k)+'</th>').join("");
 const full=[...root.actions.slice(0,r.insertionAt),...r.extraBeforeBirth,...r.inserted,...root.actions.slice(r.insertionAt)];
 const actions=(xs,offset=0)=>xs.map((s,i)=>'<li'+(s.type==="recruit"?' class="scope-note"':'')+'>'+esc((i+offset+1)+". "+s.type+" · "+name(s.id||s.research||s.transform||s.profile||s.event||s.source||""))+(s.script?' · '+esc(s.script):"")+(s.month!=null?' · '+fmt(s.month)+'개월':"")+(s.items?'<small class="bs-sub">'+esc(Object.entries(s.items).map(([id,n])=>name(id)+" × "+n).join(" / "))+'</small>':"")+'</li>').join("");
 return '<section class="scope-note" data-population-event="true"><h3>이벤트 출생 시간순 조건부 경로</h3><p>선택 범위 '+fmt(pairs.length)+'개 분기 · '+fmt(ids.length)+'개 출생·시술 수치 경로. 기존 연구 이력 중간의 이벤트 발생 조건을 재생했으며, 시작 국가·지역 실제 선택, 추첨, 이벤트 공동 보상과 전투 성장 달성은 미인증입니다.</p><p><b>이벤트:</b> '+esc(name(r.event))+' · 스크립트 <code>'+esc(r.script)+'</code> · 모집 '+fmt(r.birthMonth)+'개월 · 기존 연구 '+fmt(r.insertionAt)+' / '+fmt(root.actions.length)+'단계 뒤 삽입 · 허용 난이도 '+esc(r.allowedDifficulties.join(", "))+' · 분기 #'+fmt(ranks.get(r.branch))+'</p><p>추가 연구·월 이동 '+fmt(r.extraBeforeBirth.length)+'단계 · 확률 및 조건부 '+esc(r.pending.join(" / ")||"없음")+' · 미확인 '+esc(r.unknown.join(" / ")||"없음")+'</p><p>최종 병종 '+esc(name(w.body))+' · '+esc(seq(w))+' · 마지막 전투캡 가정 합계 '+fmt(total(w))+'</p><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>구분</th>'+cols+'</tr></thead><tbody>'+row("시술 직후 원시 (재생)",w.populationEvent.rawBeforeFinalGrowth)+row("마지막 전투캡 원시 (가정)",w.raw)+row("영구 보너스",w.bonus)+row("실효 (가정)",w.vector)+'</tbody></table></div><details><summary>연구와 이벤트 삽입을 포함한 '+fmt(full.length)+'개 행동 및 시술</summary><p>연구 접두부 <code>'+esc(r.historyId)+'</code> · 전체 행동 SHA256 <code>'+esc(r.fullActionHash)+'</code></p><ol>'+actions(full)+actions(w.populationEvent.actions,full.length)+'</ol></details><details><summary>이벤트 대안별 출생·시술 경로 '+fmt(ids.length)+'개</summary><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>분기</th><th>이벤트 스크립트</th><th>월</th><th>시술</th><th>조건부 합계</th></tr></thead><tbody>'+ids.sort((a,b)=>total(db.witnesses[b])-total(db.witnesses[a])).map(id=>{const x=db.witnesses[id],v=e.variants[x.populationEvent.variant];return '<tr><td><a href="'+branchLink(v.branch)+'">#'+fmt(ranks.get(v.branch))+'</a></td><td>'+esc(v.script)+'</td><td>'+fmt(v.birthMonth)+'</td><td>'+esc(seq(x))+'</td><td><a href="'+routeLink(pid,v.branch,id)+'">'+fmt(total(x))+'</a></td></tr>';}).join("")+'</tbody></table></div></details></section>';
}
export function populationUnlockOriginMarkup(db,pid,branchId=null,focus=null,labels={}){
 const u=db?.originUnlockSearch,c=db?.originUnlockContinuation;if(!u)return "";
 const rows=Object.values(u.pairs).filter(p=>p.origin===pid&&(!branchId||p.branch===branchId));
 if(!rows.length)return "";
 const ranks=new Map(db.branches.map(b=>[b.id,b.rank])),name=id=>db.labels[id]||id;
 const candidates=rows.flatMap(p=>unlockRoutes(db,p.origin,p.branch));
 const chosen=candidates.includes(focus)?focus:candidates.reduce((a,b)=>!a||total(db.witnesses[b])>total(db.witnesses[a])?b:a,null);
 const w=db.witnesses[chosen],r=c?.routes?.[chosen],id=w.populationUnlock?.pair||w.populationUnlockContinuation?.pair,p=u.pairs[id];
 const model=r?.model&&c.models[r.model],upper=model?.frontier.reduce((a,b)=>!a||total(b)>total(a)?b:a,null);
 const seq=w=>(w.steps||[]).map(x=>name(x.id)).join(" → ")||"시술 없음";
 const cols=db.stats.map(k=>'<th>'+esc(labels[k]||k)+'</th>').join("");
 const row=(title,v)=>'<tr><th>'+esc(title)+'</th>'+v.map(n=>'<td>'+fmt(n)+'</td>').join("")+'</tr>';
 const acts=s=>esc(s.type+" · "+name(s.id||s.research||s.transform||s.profile||s.source||s.event||""))+(s.items?'<small class="bs-sub">'+esc(Object.entries(s.items).map(([id,n])=>name(id)+" × "+n).join(" / "))+'</small>':"");
 return '<section class="scope-note" data-population-unlock="true"><h3>추가 모집 연구를 시간순으로 재생한 육성 경로</h3><p>선택 범위 '+fmt(rows.length)+'개 분기 · '+fmt(candidates.length)+'개 모집·시술 경로. 선택 분기 #'+fmt(ranks.get(p.branch))+' · 출생 최솟값 · 시술 중간 성장 없음 · 마지막 전투캡 조건부. 연구 표본·자원·이벤트 결과는 조건부이고 실제 최종 달성 인증은 아닙니다.</p><p><b>부족했던 연구:</b> '+p.missing.map(x=>esc(name(x))).join(" / ")+' · 추가 활성 연구 '+fmt(p.addedResearch.length)+'개 · 난이도 허용 '+esc(p.allowedDifficulties.join(", "))+' · 후속 계산 완료 D'+fmt(c?.completed?.[id]||1)+'</p><p>종착 '+esc(name(w.body))+' · '+esc(seq(w))+' · 전투캡 투영 합계 '+fmt(total(w))+'</p><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>구분</th>'+cols+'</tr></thead><tbody>'+row("시술 직후 원시 (재생)",r?.rawBeforeFinalGrowth||w.populationUnlock.rawBeforeFinalGrowth)+row("마지막 전투캡 원시 (가정)",w.raw)+row("영구 보너스",w.bonus)+row("실효 (가정)",w.vector)+(upper?row("별도 성장배치 상계 (미재생)",upper.vector):"")+'</tbody></table></div><details><summary>기존 연구 접두부 '+fmt(u.roots[p.root].actions.length)+'단계 및 추가 연구·모집 '+fmt(p.suffix.length)+'단계</summary><p>접두부 <code>'+esc(p.historyId)+'</code> · 전체 행동 SHA256 <code>'+esc(p.fullActionHash)+'</code></p><ol>'+u.roots[p.root].actions.map(x=>'<li>'+acts(x)+'</li>').join("")+'</ol><h4>추가 행동</h4><ol>'+p.suffix.map(x=>'<li>'+acts(x)+'</li>').join("")+'</ol><h4>시술 행동</h4><ol>'+((r?.actions||w.populationUnlock?.actions||[]).map(x=>'<li>'+acts(x)+'</li>').join(""))+'</ol></details><details><summary>같은 출생처의 모집·후속 시술 경로 '+fmt(candidates.length)+'개</summary><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>분기</th><th>최종 병종</th><th>시술 순서</th><th>마지막 전투캡 합계</th></tr></thead><tbody>'+candidates.sort((a,b)=>total(db.witnesses[b])-total(db.witnesses[a])).map(id=>{const x=db.witnesses[id],b=x.branchIds[0];return '<tr><td><a href="'+branchLink(b)+'">#'+fmt(ranks.get(b))+'</a></td><td>'+esc(name(x.body))+'</td><td>'+esc(seq(x))+'</td><td><a href="'+routeLink(pid,b,id)+'">'+fmt(total(x))+'</a></td></tr>';}).join("")+'</tbody></table></div></details></section>';
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
 const branchRows=j<0?'<details><summary>연구 분기별 탐색 상태 '+fmt(p.branches.length)+'쌍</summary><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>분기</th><th>상태</th><th>그룹</th></tr></thead><tbody>'+p.branches.map((bid,k)=>{const q=pair(db,v,i,k),b=db.branches.find(b=>b.id===bid);return '<tr><td><a href="'+branchLink(bid)+'">#'+fmt(b?.rank)+'</a></td><td><a href="'+routeLink(pid,bid)+'">'+esc(q.label)+'</a>'+(q.flags?' · '+esc(q.flags):"")+'</td><td>'+fmt(q.ids.length)+'</td></tr>';}).join("")+'</tbody></table></div></details>':"<p>쌍 상태: "+esc(pair(db,v,i,j).label)+(pair(db,v,i,j).flags?" · "+esc(pair(db,v,i,j).flags):"")+"</p>";
 if(!w)return head+'<p>이 범위의 제한 계산은 미진입입니다. 모집 연구가 다른 시점에 열리거나 추가 연구로 해금될 수 있으므로 불가능 증명으로 사용하지 않습니다.</p>'+branchRows+'</section>';
 const col=db.stats.map(k=>'<th>'+esc(labels[k]||k)+'</th>').join("");
 const row=(title,v)=>'<tr><th>'+esc(title)+'</th>'+v.map(n=>'<td>'+fmt(n)+'</td>').join("")+'</tr>';
 const ws=groups.filter(k=>v.groups[k].representativeIds.includes(best));
 const historyIds=[...new Set(ws.flatMap(k=>v.groups[k].historyIndices))].map(h=>v.histories[h]).filter(h=>!branchId||h.branchId===branchId);
 const seq=x=>(x.steps||[]).map((s,k)=>(x.growthBefore?.[k]?"[전투캡 성장] ":"")+name(s.id)).join(" → ")||"추가 시술 없음";
 return head+'<p>선택 종착 '+esc(name(w.body))+' · 출생 '+(w.birthBand==="max"?"최댓값":"최솟값")+' · '+esc(seq(w))+' · 마지막 전투캡 성장 가정 · 직접 시술비 '+fmt(w.fees)+' · 합계 '+fmt(total(w))+'</p><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>능력치</th>'+col+'</tr></thead><tbody>'+row("원시",w.raw)+row("영구 보너스",w.bonus)+row("실효",w.vector)+'</tbody></table></div><p>필요 연구: '+w.research.map(x=>esc(name(x))).join(" / ")+' · 연구 이력 참조 '+fmt(historyIds.length)+'개</p><details><summary>해당 모형의 연구 이력 별칭</summary>'+historyIds.map(h=>'<p><code>'+esc(h.id)+'</code> · '+fmt(h.steps)+'단계 · <a href="'+branchLink(h.branchId)+'">분기</a></p>').join("")+'</details><details><summary>제한 모형 대표 경로 '+fmt(ids.length)+'개</summary><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>최종 병종</th><th>시술</th><th>직접 시술비</th><th>합계</th></tr></thead><tbody>'+ids.sort((a,b)=>total(db.witnesses[b])-total(db.witnesses[a])).map(id=>{const x=db.witnesses[id];return '<tr><td>'+esc(name(x.body))+'</td><td>'+esc(seq(x))+'</td><td>'+fmt(x.fees)+'</td><td><a href="'+routeLink(pid,branchId,id)+'">'+fmt(total(x))+'</a></td></tr>';}).join("")+'</tbody></table></div></details>'+branchRows+'<p><a href="'+esc(new URL("./data/"+v.file,import.meta.url).href)+'">전체 보존 상태·행동 순서·전이 그래프 원장 (gzip)</a> · '+fmt(v.bytes/1048576)+' MiB · SHA256 <code>'+esc(v.sha256)+'</code></p></section>';
}
