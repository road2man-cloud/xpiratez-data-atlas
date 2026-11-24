// All-origin growth projection from the ONE shared registry.
// No assumption of canonical branch compatibility. Old deep-cohort and
// exact-resource views retain their own scopes.
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=n=>Number.isFinite(n)?n.toLocaleString("ko-KR",{maximumFractionDigits:1}):"—";
const total=w=>(Array.isArray(w)?w:w.vector).reduce((a,b)=>a+b,0);
const length=w=>(w.steps||[]).reduce((n,s)=>n+(s.count??1),0);
export function allOriginCoverage(db){
 const o=db?.originCap12,s=o?.summary;if(!s)return null;
 return {origins:s.registeredOrigins,research:s.researchOrigins,modeled:s.modeledOrigins,archivePaths:s.archivePaths,paths:s.modeledFullRoutes,models:s.completedModels,pending:s.pendingModels,frontier:s.frontierVectors,sameBodyFrontier:s.sameBodyFrontierVectors,finalBodies:s.finalBodies,errors:s.attemptedModelErrors,canonicalPairs:s.canonicalResearchPairsCertified,certified:s.actualGameCertified,generatedAt:o.generatedAt,lastCalculation:s.lastCalculation};
}
export function allOriginCoverageText(db){
 const s=allOriginCoverage(db);if(!s)return "";
 const date=new Date(s.generatedAt);
 const rate=s.lastCalculation?.seconds>0?Math.round(s.lastCalculation.models/s.lastCalculation.seconds*3600):null;
 return "전체 출생처 "+fmt(s.origins)+"/72 · 연구 경로 "+fmt(s.research)+"/72 · 12능력치 기본 모델 "+fmt(s.modeled)+"/72 · 기존 호환 경로 "+fmt(s.paths)+"/"+fmt(s.archivePaths)+" · 고유 모델 "+fmt(s.models)+" · 남은 등록 모델 "+fmt(s.pending)+" · 전체 출생처 종착 수치 Pareto "+fmt(s.frontier)+" · 공통 연구 부모 신규 정확 연결 "+fmt(s.canonicalPairs)+"쌍 (전체 유효 조합 분모 미확정) · 실제 최고 인증 "+fmt(s.certified)+"/72 · 최근 순수 모델 계산 처리량 "+fmt(rate)+"개/시간 (연구·배포 제외) · 전체 잔여 시간 미산정 · 계산 원장 "+date.toLocaleString("ko-KR",{timeZone:"Asia/Seoul"});
}
export function allOriginBodyWitnessIds(db){
 const o=db?.originCap12;if(!o)return [];
 return [...new Set(Object.values(o.models||{}).flatMap(m=>m.witnessIds||[]).filter(id=>db.witnesses[id]?.source==="ORIGINCAP12"))];
}
export function mergeAllOriginRows(db,index,keys){
 const out=new Map(index),o=db?.originCap12;if(!o)return out;
 for(const r of Object.values(o.records)){
  const p=db.profiles[r.sameBodyProfile];if(!p?.objectives?.total)continue;
  const best=db.witnesses[p.objectives.total],own=r.modelIds.flatMap(id=>o.models[id]?.witnessIds||[]).filter(id=>db.witnesses[id]?.body===r.body);
  const longest=own.reduce((a,b)=>!a||length(db.witnesses[b])>length(db.witnesses[a])?b:a,null);
  const row={profileId:r.profileId,body:r.body,route:p.objectives.total,longestRoute:longest,steps:length(best),longestSteps:length(db.witnesses[longest]),representativeCount:own.length,branchCount:0,additionalBranchRepresentatives:0,stats:Object.fromEntries(keys.map(k=>[k,best.vector[db.stats.indexOf(k)]])),total:total(best),trainingIds:[...new Set(own.flatMap(id=>db.witnesses[id].steps.map(x=>x.id)))],source:"ORIGINCAP12"};
  const old=out.get(r.profileId);
  // Existing exact-parent cohort remains visible if its representative total
  // is at least as high. The new per-origin panel always shows both scopes.
  if(!old||row.total>old.total)out.set(r.profileId,row);
 }
 return out;
}
export function mergeOriginExtensionRows(db,index,keys,branchId=null){
 const out=new Map(index),ext=db?.originExtension12;if(!ext)return out;
 for(const [pid,r] of Object.entries(ext.records)){
  const body=db.originCap12?.records?.[pid]?.body;
  const ids=r.routeIds.filter(id=>{const w=db.witnesses[id];return w?.body===body&&(!branchId||w.branchIds.includes(branchId));});
  if(!ids.length)continue;
  const best=ids.reduce((a,b)=>total(db.witnesses[b])>total(db.witnesses[a])?b:a),w=db.witnesses[best];
  const longest=ids.reduce((a,b)=>length(db.witnesses[b])>length(db.witnesses[a])?b:a);
  const old=out.get(pid);
  const row={profileId:pid,body,route:best,longestRoute:longest,steps:length(w),longestSteps:length(db.witnesses[longest]),representativeCount:ids.length,branchCount:new Set(ids.flatMap(id=>db.witnesses[id].branchIds)).size,additionalBranchRepresentatives:ids.filter(id=>db.witnesses[id].branchIds.length).length,stats:Object.fromEntries(keys.map(k=>[k,w.vector[db.stats.indexOf(k)]])),total:total(w),trainingIds:[...new Set(ids.flatMap(id=>db.witnesses[id].steps.map(x=>x.id)))],source:"ORIGINEXT12"};
  if(!old){out.set(pid,row);continue;}
  const winner=row.total>old.total?row:old,long=row.longestSteps>old.longestSteps?row:old;
  out.set(pid,{...winner,longestSteps:long.longestSteps,longestRoute:long.longestRoute,representativeCount:old.representativeCount+row.representativeCount,trainingIds:[...new Set([...old.trainingIds,...row.trainingIds])]});
 }
 return out;
}
export function renderOriginExtension(db,pid,focus=null,labels={},branchId=null){
 const ext=db?.originExtension12,r=ext?.records?.[pid];if(!r)return "";
 const ids=r.routeIds.filter(id=>!branchId||db.witnesses[id]?.branchIds.includes(branchId));
 const button=(id,label)=>originCapButton(id,label);
 const name=id=>db.labels[id]||id;
 if(!ids.length)return '<p class="scope-note">활성 연구 후속 탐색: 기존 접두부 '+fmt(r.baselines.length)+'개 재생 · '+(branchId?"선택 분기에 연결된":"이번 조건에서 발견된")+' 후속 후보 없음. 추가 연구·승급을 포함한 모든 경로가 불가능하다는 뜻은 아닙니다.</p>';
 const order=ids.sort((a,b)=>total(db.witnesses[b])-total(db.witnesses[a])||db.witnesses[a].fees-db.witnesses[b].fees),id=ids.includes(focus)?focus:order[0],w=db.witnesses[id],e=w.originExtension;
 const cols=db.stats.map(k=>'<th>'+esc(labels[k]||k)+'</th>').join("");
 const row=(title,v)=>'<tr><th>'+esc(title)+'</th>'+v.map(n=>'<td>'+fmt(n)+'</td>').join("")+'</tr>';
 return '<section class="scope-note" data-origin-extension="true"><h3>기존 활성 연구를 활용한 후속 육성</h3><p>출생 경로 '+fmt(r.baselines.length)+'개 재생 · 발견 '+fmt(r.candidates)+'개 · 현재 범위 대표 '+fmt(ids.length)+'개. 접두부는 원본 출생 최솟값의 기존 연구·시술 순서 재생, 후속 최대 2회는 활성 연구만 이용합니다. 전투 성장캡·자금·재료·시설 조건부이며 새 연구·진급·훈장 획득 없음.</p><p>선택 최종 병종 '+esc(name(w.body))+' · 직접 시술비 '+fmt(w.fees)+' · '+fmt(length(w))+'단계 · 관측 정식 분기 뿌리 일치 '+fmt(w.branchIds.length)+'개 (공통 연구 이력 공동 재생 미인증)</p><p>'+w.steps.map((s,i)=>(i===e.seedDepth?' → [후속] ':'')+(w.growthBefore[i]?'[성장] ':'')+esc(name(s.id))).join(' → ')+'</p><p>기존 접두부 참조 <code>'+esc(e.seed)+'</code> · 후속 요구 활성 연구 '+e.activeRequiredResearch.map(x=>esc(name(x))).join(" / ")+'</p><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>능력치</th>'+cols+'</tr></thead><tbody>'+row("접두부 전투캡 조건부 실효",e.seedCapVector)+row("후속 원시",w.raw)+row("영구 보너스",w.bonus)+row("후속 실효",w.vector)+'</tbody></table></div><details open><summary>후속 대표 경로 '+fmt(ids.length)+'개</summary><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>최종 병종</th><th>후속 시술</th><th>직접 시술비</th><th>동일 경로 합계</th></tr></thead><tbody>'+order.map(id=>{const x=db.witnesses[id];return '<tr><td>'+esc(name(x.body))+'</td><td>'+x.originExtension.appended.map(k=>esc(name(k))).join(" → ")+'</td><td>'+fmt(x.fees)+'</td><td>'+button(id,fmt(total(x)))+'</td></tr>';}).join("")+'</tbody></table></div></details></section>';
}
export function originCapButton(id,label){
 return '<button type="button" class="origin-open" data-origin-cap-route="'+esc(id)+'" title="전체 출생처 통합 조건부 성장 상계">'+esc(label)+'</button>';
}
export function renderAllOriginCap(db,profileId,focusRoute=null,labels={}){
 const o=db?.originCap12,r=o?.records?.[profileId];if(!r)return "";
 const same=db.profiles[r.sameBodyProfile],lineage=db.profiles[r.lineageProfile];
 const selected=focusRoute&&db.witnesses[focusRoute]?.source==="ORIGINCAP12"&&db.witnesses[focusRoute].originProfile===profileId?focusRoute:same?.objectives?.total||lineage?.objectives?.total;
 const w=db.witnesses[selected],m=o.models[w?.reference];if(!w||!m)return "";
 const name=id=>db.labels[id]||id;
 const columns=db.stats.map(k=>'<th>'+esc(labels[k]||k)+'</th>').join("");
 const row=(label,vector)=>'<tr><th>'+esc(label)+'</th>'+db.stats.map((_,i)=>'<td>'+fmt(vector?.[i])+'</td>').join("")+'</tr>';
 const maxima=(label,p)=>'<tr><th>'+esc(label)+'</th>'+db.stats.map((_,i)=>{const id=p?.best?.[i];return '<td>'+(id?originCapButton(id,fmt(db.witnesses[id].vector[i])):"—")+'</td>';}).join("")+'</tr>';
 const objectiveRows=(p,title)=>p?'<p><strong>'+esc(title)+'</strong> · Pareto '+fmt(p.count)+'개 · 합계 최고 '+originCapButton(p.objectives.total,fmt(total(db.witnesses[p.objectives.total].vector)))+' · 사격 지표 '+originCapButton(p.objectives.firing,"경로")+' · 근접 지표 '+originCapButton(p.objectives.melee,"경로")+' · 부두 지표 '+originCapButton(p.objectives.psi,"경로")+'</p>':"";
 const bodyRows=Object.entries(r.bodyProfiles).map(([body,pid])=>{const p=db.profiles[pid],id=p.objectives.total;return '<tr><td>'+esc(name(body))+'</td><td>'+fmt(p.count)+'</td><td>'+originCapButton(id,fmt(total(db.witnesses[id].vector)))+'</td></tr>';}).join("");
 const feeRows=(same?.feeTotalFrontier||[]).map(id=>{const a=db.witnesses[id];return '<tr><td>'+fmt(a.directFees)+'</td><td>'+originCapButton(id,fmt(total(a.vector)))+'</td><td>'+fmt(length(a))+'</td></tr>';}).join("");
 return '<section class="scope-note" data-all-origin-cap="true"><h3>전체 출생처 통합 12능력치 모델</h3><p>기존 호환 경로 '+fmt(r.archivePaths)+'개 중 '+fmt(r.fullRouteCount)+'개 계산 · 고유 모델 '+fmt(r.modelIds.length)+'/'+fmt(r.uniqueOrders)+'개 · 최장 '+fmt(r.modeledDepth)+'단계 · 미계산 모델 '+fmt(r.unresolvedModelIds.length)+'개 · 실제 게임 인증 없음. 공통 연구 부모는 별도 연결 필요.</p>'+objectiveRows(same,"본체 유지")+objectiveRows(lineage,"병종 전환 포함")+'<p class="fine">역할 지표는 사격: 행동력+사격+반응, 근접: 행동력+근접+근력+체력, 부두: 부두 강도+기술+마나. 실제 무기·장갑·비용 최적성 증명이 아닙니다.</p><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>독립 최고 (각 셀 다른 경로 가능)</th>'+columns+'</tr></thead><tbody>'+maxima("본체 유지",same)+maxima("전환 포함",lineage)+'</tbody></table></div><h4>선택 경로의 조건부 상계 (한 경로)</h4><p>최종 병종 '+esc(name(w.body))+' · '+fmt(length(w))+'개 시술 · 직접 시술비 '+fmt(w.directFees)+' · 훈장 제외</p><p>'+ (w.steps.map(x=>esc(name(x.id))).join(" → ")||"모집 후 성장")+'</p><p>성장 배치 '+esc(w.growthSchedule.join(" / "))+' · 조건부 능력치 문턱 '+fmt(w.conditionalGateCrossings)+'개</p><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>능력치 구분</th>'+columns+'</tr></thead><tbody>'+row("출생 원시 최솟값",r.birthMin)+row("출생 원시 최댓값",r.birthMax)+row("출생 영구 보너스",r.birthBonus)+row("최종 병종 생성 상단",w.creationMax)+row("전투캡",w.rawCombatCaps)+row("시설 훈련캡",w.trainingCaps)+row("원시 상계",w.raw)+row("영구 보너스",w.bonus)+row("실효 상계",w.vector)+'</tbody></table></div><p>근거: 기존 연구 재생 '+esc(w.archiveCandidateId)+(w.archiveScope==="birth-prefix"?" (모집까지의 접두부)":" (전체 경로)")+' · 행동 '+fmt(w.archiveActionEnd)+'개. 실제 공동 RNG·성장·훈장 획득 미인증.</p><details><summary>종착 병종별 Pareto · 직접비용 비교</summary><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>최종 병종</th><th>Pareto</th><th>동일 경로 합계</th></tr></thead><tbody>'+bodyRows+'</tbody></table></div><p>본체 유지 직접 시술비–합계의 발견 최전선. 모집비·연구·재료·시설·전투 비용 제외.</p><div class="birth-stat-scroll"><table class="birth-stat-table"><thead><tr><th>직접 시술비</th><th>동일 경로 합계</th><th>시술</th></tr></thead><tbody>'+feeRows+'</tbody></table></div></details></section>';
}
