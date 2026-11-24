// Both existing databases use the same registry; no second data source.
import {loadBranchSoldierResults} from "./branch-soldier-catalog.js";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=n=>Number.isFinite(n)?n.toLocaleString("ko-KR"):"미측정";
const dec=n=>Number.isFinite(n)?n.toFixed(2):"미측정";
const statNames=["행동력","지구력","체력","용기","반응","사격","투척","근력","부두 강도","부두 기술","근접","마나"];
function mount(root,db){
 const a=db.originNumericCache;if(!a||a.sourceMetadataSha256!==db.sourceMetadataSha256)throw Error("수치 캐시 원장 없음");
 const s=a.summary,b=s.benchmark,m=s.transitionMetrics;
 const row=(label,value)=>'<tr><th>'+esc(label)+'</th><td>'+esc(value)+'</td></tr>';
 root.innerHTML='<p><strong>72개 출생처 · 동일 수치 상태의 후속 계산 재사용</strong></p><p class="bs-sub">연구 이력, 자원, 실제 RNG, 훈장, 승급 가능성을 동일하다고 간주하지 않습니다. 아래 수치는 고정 시술 순서의 조건부 성장 모델이며 전역 최고치가 아닙니다.</p><div class="bs-scroll"><table class="bs-table"><tbody>'+
 row("초기 적용 후보 (출생처 × 연구 부모)",fmt(s.initialPairs))+
 row("기존 성장 모델 보존",fmt(s.archiveModelsChecked)+"개 / "+fmt(s.archiveVectorsPreserved)+"벡터")+
 row("새 후속 시술 수치 모델",fmt(s.newExtensionOrders)+"개 (기존 포함 "+fmt(s.extensionNumericModels)+"개)")+
 row("후속 시술 증거 연결",fmt(s.extensionWitnessesChecked)+"개")+
 row("수치 전이 요청 / 실제 계산",fmt(m.calls)+" / "+fmt(m.misses))+
 row("수치 캐시 적중",fmt(m.hits)+"회 · "+dec(100*m.hits/Math.max(1,m.calls))+"%")+
 row("동일 입력 벤치마크",fmt(b.jobs)+"개 · 결과 일치 · "+dec(b.uncached.seconds)+"초 → "+dec(b.cached.seconds)+"초 ("+dec(b.speedup)+"배)")+
 row("전역 최적성 인증",fmt(s.globalOptimalCertified)+"개")+
 row("전체 캠페인 상태 병합 / 안전한 전역 가지치기",fmt(s.fullCampaignStateMerged)+" / "+fmt(s.safeGlobalBoundPruned))+
 row("수치 계산 실패 (미해결)",fmt(s.failures))+
 '</tbody></table></div><p class="bs-sub">기준 '+esc(a.baseCommit.slice(0,12))+' · 전체 조합 완료율에 캐시 적중률을 더하지 않습니다.</p><details><summary>후속 시술의 12능력치 조건부 상계 모델</summary><div class="bs-controls"><label>출생처 <select data-nc-origin><option value="">전체</option>'+[...new Set(Object.values(a.extensionModels).map(x=>x.profileId))].map(id=>'<option value="'+esc(id)+'">'+esc(db.originCap12.records[id]?.name||id)+'</option>').join("")+'</select></label><label>우선 능력치 <select data-nc-stat><option value="-1">12능력치 합계</option>'+db.stats.map((k,i)=>'<option value="'+i+'">'+esc(statNames[i]||k)+'</option>').join("")+'</select></label><label><input type="checkbox" data-nc-new checked> 신규 시술 순서만</label></div><p data-nc-count></p><div class="bs-scroll"><table class="bs-table"><thead><tr><th>출생처 / 최종 병종</th><th>시술 순서</th>'+db.stats.map((k,i)=>'<th>'+esc(statNames[i]||k)+'</th>').join("")+'<th>성장 배치 / 근거 ID</th></tr></thead><tbody data-nc-rows></tbody></table></div></details>';
 const el=s=>root.querySelector(s),origin=el("[data-nc-origin]"),stat=el("[data-nc-stat]"),novel=el("[data-nc-new]");
 const label=id=>db.labels[id]||id;
 function draw(){
  const i=Number(stat.value),score=f=>i<0?f.vector.reduce((a,b)=>a+b,0):f.vector[i];
  const rows=Object.values(a.extensionModels).filter(x=>(!origin.value||origin.value===x.profileId)&&(!novel.checked||!x.archiveModelIds.length)).flatMap(x=>x.frontier.map(f=>({x,f}))).sort((a,b)=>score(b.f)-score(a.f));
  el("[data-nc-count]").textContent=fmt(rows.length)+"개 벡터 · 최대 100개 표시 · 실제 동시 달성 미인증";
  el("[data-nc-rows]").innerHTML=rows.slice(0,100).map(({x,f})=>'<tr><td>'+esc(db.originCap12.records[x.profileId]?.name||x.profileId)+' → '+esc(label(x.body))+'</td><td>'+esc(x.order.map(label).join(" → ")||"없음")+'</td>'+f.vector.map(v=>'<td>'+esc(fmt(v))+'</td>').join("")+'<td>'+esc(f.schedule.join(" / "))+'<details><summary>등록 증거 '+fmt(x.extensionWitnessIds.length)+'개</summary><code>'+esc(x.extensionWitnessIds.join(" / "))+'</code></details></td></tr>').join("");
 }
 for(const e of [origin,stat,novel])e.addEventListener("change",draw);draw();
}
for(const root of document.querySelectorAll("[data-origin-numeric-cache]")){
 const wrapper=root.closest("details"),start=()=>{if(root.dataset.loaded)return;root.dataset.loaded="1";loadBranchSoldierResults().then(db=>mount(root,db)).catch(e=>{root.textContent="공통 원장 연결 실패: "+e.message;delete root.dataset.loaded;});};
 if(!wrapper||wrapper.open)start();else wrapper.addEventListener("toggle",()=>{if(wrapper.open)start();});
}
