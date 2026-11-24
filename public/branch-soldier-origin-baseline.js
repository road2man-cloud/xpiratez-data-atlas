// Shared population baseline reader: existing Soldier and Captain pages.
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=n=>n==null?"—":Number(n).toLocaleString("ko-KR");
const ko={tu:"행동력",stamina:"지구력",health:"체력",bravery:"용기",reactions:"반응",firing:"사격",throwing:"투척",strength:"근력",psiStrength:"부두 강도",psiSkill:"부두 기술",melee:"근접",mana:"마나"};
const roleNames={gun:"사격 우선",melee:"근접 우선",voodoo:"부두 우선",survival:"생존 우선",mobility:"행동력 우선"};
const model=(r,id)=>id==null?null:r.models[id];
const name=(b,id)=>b.bodyNames?.[id]||id;
const compatible=db=>db.originBaseline?.schemaVersion===1&&db.originBaseline.sourceMetadataSha256===db.sourceMetadataSha256;
function validReport(b,report){
 if(b.sourceReportHash!==report.sourceHash||b.rows.length!==report.records.length)return false;
 return b.rows.every(r=>{const original=report.records.find(x=>x.profileId===r.profileId);if(!original)return false;const ids=new Set(original.candidates.map(c=>c.id));return r.refs.length===original.candidates.filter(c=>c.campaignContext?.kind==="compatible").length&&r.refs.every(x=>ids.has(x.id));});
}
const table=(head,rows)=>'<div class="bs-scroll" role="region" tabindex="0" aria-label="가로 스크롤 비교표"><table class="bs-table"><thead><tr>'+head.map(x=>'<th>'+esc(x)+'</th>').join("")+'</tr></thead><tbody>'+rows+'</tbody></table></div>';
const cell=v=>'<td>'+esc(v)+'</td>';
const sourceLink=(profile,route,body)=>{
 const u=new URL("./soldiers/modern/",import.meta.url);u.searchParams.set("profile",profile);u.searchParams.set("candidate",route);
 if(body==="STR_SOLDIER_CHORT")u.searchParams.set("terminal","chort");u.hash="originDetails";return u.href;
};
export function mountOriginBaseline(host,db,report,openSource){
 if(!host)return;
 if(!compatible(db)){host.textContent="전체 출생처 통합 기본 모델: 아직 원장에 연결되지 않았습니다.";return;}
 const b=db.originBaseline,s=b.summary;
 if(report?!validReport(b,report):db.originCap12?.archiveSHA256!==b.sourceSha256){host.textContent="전체 출생처 기본 모델과 현재 출생 원장이 다릅니다. 재생성 전까지 수치 비교를 보류합니다.";return;}
 const summary='<p><b>전체 출생처 기본 모델 '+fmt(s.modeledOrigins)+'/'+fmt(s.origins)+'</b> · 기존 조건부 연구 경로 '+fmt(s.originalRoutes)+'개 · 고유 수치 모델 '+fmt(s.numericModels??s.distinctModels)+'개 · 경로/이력 보존 모델 '+fmt(s.distinctModels)+'개 · 출생처별 비지배 후보 '+fmt(s.originFrontier)+'개 · 미계산 경로 '+fmt(s.unresolvedRoutes)+'개.</p>'+
 '<p>공통 연구 이력 보유 분기 '+fmt(s.eligibleSharedBranches)+'개 중 출생 기록의 비중립 선택 뿌리 일치 '+fmt(s.rootMatchedBranches)+'개 · 출생처×분기 '+fmt(s.rootMatchedOriginBranchPairs)+'/'+fmt(s.origins*s.eligibleSharedBranches)+'개 (현재 연구 이력 보유 분기만 분모). <b>공동 시간순 재생 인증은 별도 미확정</b>.</p>'+
 '<p>최종 최고치 인증 '+fmt(s.actualGameCertified)+'/'+fmt(s.origins)+' · 공개 계산 자료 시각 '+esc(b.generatedAt)+' · 최근 일괄 계산 '+fmt(Math.round(s.elapsedMs/1000))+'초 / '+fmt(s.attempts)+'개 배치 시험. 전체 탐색의 시간당 처리량·잔여 시간은 전체 분모 미확정으로 산정하지 않음.</p>';
 const rows=[...b.rows].sort((a,c)=>(model(c,c.best)?.total??-1)-(model(a,a.best)?.total??-1)||a.profileId.localeCompare(c.profileId));
 const trs=rows.map(r=>'<tr><th><button type="button" class="bs-value" data-baseline-origin="'+esc(r.profileId)+'">'+esc(r.name)+'</button><small class="bs-sub">'+esc(r.soldierName)+'</small></th>'+[r.depth,r.routeCount,r.numericModelCount??r.modelCount,r.frontier.length,r.branchCount,r.unresolvedRoutes].map(x=>cell(fmt(x))).join("")+cell(fmt(model(r,r.bestSame)?.total))+cell(fmt(model(r,r.bestConverted)?.total))+cell(fmt(model(r,r.best)?.total))+'</tr>').join("");
 host.innerHTML='<h2>전체 72개 출생처 · 동일 기준 육성 탐색</h2>'+summary+'<details><summary>전체 출생처별 탐색 범위와 조건부 비교표</summary><p class="bs-sub">기존 출생·연구·시술 순서마다 최소/최대 출생값과 모든 이진 성장 배치, 마지막 전투캡 성장을 조건부 계산합니다. 계급·훈장·전투 XP 실제 획득 및 연구 추가 분기·새 시술 순서 전체 탐색은 포함하지 않습니다. 기존 장기 상계나 심층 계산과 혼합하지 않습니다.</p>'+table(["출생처","기록 최장","원본 경로","수치 모델","비지배 후보","뿌리 일치 분기","미계산 경로","본체 최고 합","전환 최고 합","전체 최고 합"],trs)+'</details><div data-baseline-detail aria-live="polite"></div>';
 const detail=host.querySelector("[data-baseline-detail]");
 let selected=null;
 const button=(id,title)=>id==null?'<span>'+esc(title)+': —</span>':'<button type="button" data-baseline-model="'+id+'">'+esc(title)+'</button>';
 function show(r,id){
  selected=r;const m=model(r,id);if(!m){detail.textContent="수치 모델 미확정";return;}
  const ref=r.refs.find(x=>x.id===m.route);
  const sequence=ref?.order||report?.records.find(x=>x.profileId===r.profileId)?.candidates.find(x=>x.id===m.route)?.transforms||[];
  const route=sequence.map((x,i)=>(m.mask&(1<<i)?"[전투캡 성장 후] ":"")+esc(db.labels[x]||x)).join(" → ")||"시술 없음";
  const choices=[button(r.best,"합계 최고"),button(r.bestSame,"본체 유지"),button(r.bestConverted,"병종 전환"),button(r.cheapest,"최소 직접 지출"),...Object.entries(r.roleBest||{}).map(([k,id])=>button(id,roleNames[k]||k))].join(" ");
  const max=b.stats.map((k,i)=>{const x=model(r,r.maxima[i]);return x?'<td>'+button(x.id,fmt(x.vector[i]))+'</td>':"<td>—</td>";}).join("");
  const vectorRows=[["원시",m.raw],["영구 보너스",m.bonus],["실효",m.vector]].map(([k,v])=>'<tr><th>'+k+'</th>'+v.map(x=>cell(fmt(x))).join("")+'</tr>').join("");
  const opts=[...r.models].sort((a,c)=>c.total-a.total||a.fees-c.fees).map(x=>'<option value="'+x.id+'"'+(x.id===m.id?" selected":"")+'>'+esc(name(b,x.body))+' · '+fmt(x.total)+'점 · '+fmt(x.depth)+'회 · $'+fmt(x.fees)+'</option>').join("");
  const itemText=Object.entries(ref?.items||{}).map(([k,n])=>esc(db.labels[k]||k)+" ×"+fmt(n)).join(" · ")||"없음";
  detail.innerHTML='<h3>'+esc(r.name)+' · '+esc(name(b,m.body))+'</h3><p>'+choices+'</p><label>같은 출생처의 등록 모델 <select data-baseline-select>'+opts+'</select></label><p><b>'+fmt(m.total)+'점</b> · '+(m.band==="min"?"최소":"최대")+' 출생값 가정 · 마지막 성장 적용 · 직접 비용 $'+fmt(m.fees)+' · 회복 '+fmt(ref?.recovery)+'일 · 이동 '+fmt(ref?.transfer)+'시간</p><p>'+route+'</p><p>재료: '+itemText+' · 실제 연구/재료/훈장 획득 미인증.</p>'+table(["능력치",...b.stats.map(k=>ko[k]||k)],vectorRows)+'<p>각 독립 최고값의 경로 (동일 대원으로 합산 금지)</p>'+table(b.stats.map(k=>ko[k]||k),"<tr>"+max+"</tr>")+'<p><button type="button" data-baseline-source>이 모델의 기존 연구·시술 원본 보기</button></p><p class="bs-sub">수치·비용 전선은 표시 목적이며, 지배된 후보와 후속 시술 가능성은 제거하지 않았습니다.</p>';
  detail.querySelector("[data-baseline-source]").addEventListener("click",()=>openSource?openSource(r.profileId,m.route,m.body):location.assign(sourceLink(r.profileId,m.route,m.body)));
 }
 host.addEventListener("click",ev=>{
  const pick=ev.target.closest("[data-baseline-origin]");
  if(pick){const r=b.rows.find(x=>x.profileId===pick.dataset.baselineOrigin);if(r){show(r,r.best);detail.scrollIntoView({block:"nearest"});}return;}
  const m=ev.target.closest("[data-baseline-model]");if(m&&selected)show(selected,Number(m.dataset.baselineModel));
 });
 host.addEventListener("change",ev=>{if(ev.target.matches("[data-baseline-select]")&&selected)show(selected,Number(ev.target.value));});
}
export function branchOriginBaselineMarkup(db,branch){
 if(!compatible(db))return "";
 const b=db.originBaseline,links=b.branchLinks[branch.id]||{},entries=Object.entries(links);
 if(!entries.length)return '<p class="bs-sub">전체 출생처 기본 모델: 이 분기와 모든 선택 뿌리가 일치하는 기존 출생 연구 경로는 아직 연결되지 않았습니다. 불가능 판정 아님.</p>';
 const rows=entries.map(([id,routeIds])=>{
  const r=b.rows.find(x=>x.profileId===id),ids=new Set(routeIds);
  if(!r)return "";
  const refs=r.refs.filter(x=>ids.has(x.id));let best=null;
  for(const ref of refs)for(const mid of ref.modelIds){const m=model(r,mid);if(m&&(!best||m.total>best.m.total))best={m,ref};}
  return '<tr><th>'+esc(r.name)+'</th>'+cell(fmt(refs.length))+cell(fmt(best?.m.total))+cell(best?name(b,best.m.body):"미계산")+'<td>'+(best?'<a href="'+esc(sourceLink(id,best.ref.id,best.m.body))+'">기존 출생 경로</a>':"—")+'</td></tr>';
 }).join("");
 return '<details class="bs-note"><summary>출생처 기본 모델 연결 · '+fmt(entries.length)+'개 출생처 (선택 뿌리 일치)</summary><p>기존 출생 경로에 현재 분기의 모든 비중립 선택 연구가 관측된 경우만 연결합니다. 별도 공통 이력과의 시간순 공동 재생은 아직 아닙니다.</p>'+table(["출생처","일치 경로","조건부 합계","최종 병종","원본"],rows)+'</details>';
}
