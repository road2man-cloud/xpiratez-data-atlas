// Shared all-origin growth schedule view. Unlike the legacy per-stat maxima,
// every displayed comparison row is one retained conditional witness vector.
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const n=v=>Number.isFinite(v)?v.toLocaleString("ko-KR"):"—";
const statNames={tu:"행동력",stamina:"지구력",health:"체력",bravery:"용기",reactions:"반응",firing:"사격",throwing:"투척",strength:"근력",psiStrength:"부두 강도",psiSkill:"부두 기술",melee:"근접",mana:"마나"};
const phases={NONE:"성장 없음",PHYSICAL:"체력훈련",COMBAT:"전투 성장",PHYSICAL_COMBAT:"체력 → 전투",COMBAT_PHYSICAL:"전투 → 체력"};
let promise;
function load(){return promise??=fetch(new URL("./data/soldier-origin-cap-frontier.json",import.meta.url)).then(r=>{if(!r.ok)throw Error("HTTP "+r.status);return r.json();}).then(d=>{if(d.kind!=="ALL_ORIGIN_GROWTH_SCHEDULE_FRONTIERS"||d.records.length!==d.summary.origins)throw Error("원장 형식 불일치");return d;});}
function mount(root,d){
 const label=id=>d.labels?.[id]||id;
 const list=(rows,chosen)=>rows.map(([v,t])=>'<option value="'+esc(v)+'"'+(v===chosen?' selected':'')+'>'+esc(t)+'</option>').join("");
 const rows=d.records.flatMap(r=>r.bodies.flatMap(b=>b.frontier.map(f=>({r,b,f,m:r.models.find(x=>x.candidateId===f.candidateId)}))));
 const bodyIds=[...new Set(rows.map(x=>x.b.body))].sort((a,b)=>label(a).localeCompare(label(b),"ko"));
 const captains=[...new Set(rows.flatMap(x=>(x.m?.branchChoices||[]).map(y=>y.id).filter(y=>y.startsWith("STR_CAPTAIN_"))))].sort();
 root.innerHTML='<p><strong>전체 출생처 '+n(d.summary.originsWithModels)+' / '+n(d.summary.origins)+'개</strong> · 성장 배치 모델 '+n(d.summary.evaluated)+'개 · 병종별 Pareto '+n(d.summary.frontierCount)+'개</p><p class="bs-sub">출생처마다 기존 서명된 후보 중 최대 '+n(d.scope.perOrigin)+'개를 선택해 성장 배치를 계산했습니다. 최종 병종별로 분리하며, 상계의 동시 달성·게임 전역 최고치는 인증되지 않았습니다. 전체 '+n(d.summary.sourceWitnesses)+'개 재생 후보를 전수 최적화한 결과는 아닙니다.</p><div class="bs-controls"><label>출생처 <select data-oc-origin>'+list([["","전체"],...d.records.map(r=>[r.profileId,r.soldierName+" · "+r.name])],"")+'</select></label><label>최종 병종 <select data-oc-body>'+list([["","전체"],...bodyIds.map(id=>[id,label(id)])],"")+'</select></label><label>기록된 선장 선택 <select data-oc-captain>'+list([["","전체"],...captains.map(id=>[id,id])],"")+'</select></label><label>우선 능력치 <select data-oc-stat>'+list(d.stats.map(k=>[k,statNames[k]||k]),"tu")+'</select></label><label>최소 시술 횟수 <input data-oc-depth type="number" min="0" step="1" value="0"></label><button type="button" data-oc-clear>초기화</button></div><p data-oc-count aria-live="polite"></p><div class="bs-scroll"><table class="bs-table"><thead><tr><th>출생처 / 최종 병종</th><th>시술 횟수</th>'+d.stats.map(k=>'<th>'+esc(statNames[k]||k)+'</th>').join("")+'<th>상세</th></tr></thead><tbody data-oc-rows></tbody></table></div><section data-oc-detail class="bs-note" aria-live="polite"></section><p class="bs-sub">원장 기준 커밋 <code>'+esc(d.sourceRevision.slice(0,12))+'</code> · 연구 후보 원본 <code>'+esc(d.originArchiveSha256.slice(0,12))+'</code> · 일반 통합 DB의 영애·미치광이 심층 결과는 별도 근거 수준으로 유지합니다.</p>';
 const el=s=>root.querySelector(s),origin=el("[data-oc-origin]"),body=el("[data-oc-body]"),captain=el("[data-oc-captain]"),stat=el("[data-oc-stat]"),depth=el("[data-oc-depth]");
 let shown=[],chosen=null;
 function detail(x){
  if(!x){el("[data-oc-detail]").innerHTML="<p>선택한 조건에 등록된 후보가 없습니다.</p>";return;}
  const f=x.f,m=x.m;
  el("[data-oc-detail]").innerHTML='<h4>'+esc(x.r.soldierName+" · "+x.r.name)+' → '+esc(label(f.body))+'</h4><p>경로 ID <code>'+esc(f.candidateId)+'</code> · 기존 연구 '+n(m?.sourceResearchCount)+'개 · 상계 조건 교차 '+n(f.gateCrossings)+'개</p><ol>'+f.order.map((id,i)=>'<li>'+esc(phases[f.schedule[i]]||f.schedule[i])+' 후 '+esc(label(id))+' <small>'+esc(id)+'</small></li>').join("")+'</ol><p>마지막 성장: '+esc(phases[f.schedule.at(-1)]||f.schedule.at(-1))+'</p><div class="bs-scroll"><table class="bs-table"><thead><tr><th>구분</th>'+d.stats.map(k=>'<th>'+esc(statNames[k]||k)+'</th>').join("")+'</tr></thead><tbody>'+[["생성 최대",m?.creationMax],["전투 성장캡",m?.rawCaps],["체력훈련캡",m?.trainingCaps],["원시 상계",f.raw],["영구 보너스",f.bonus],["실효 상계",f.vector]].map(([t,v])=>'<tr><th>'+esc(t)+'</th>'+d.stats.map((_,i)=>'<td>'+n(v?.[i])+'</td>').join("")+'</tr>').join("")+'</tbody></table></div><details><summary>연구 분기 선택 및 배제 기록</summary>'+((m?.branchChoices||[]).map(y=>'<p><code>'+esc(y.id)+'</code> · '+n(y.at)+' 단계 · 종료 시 폐쇄 '+esc((y.excludes||[]).filter(z=>z.closedAtEnd).map(z=>z.id).join(" / ")||"기록 없음")+'</p>').join("")||'<p>등록된 분기 선택 기록 없음 (범용 경로라는 의미가 아님)</p>')+'</details><p class="bs-sub">원본 재생 후보와 별도로 성장 배치를 조건부로 투사한 결과입니다. 훈장·실제 성장·최종 동시 달성을 인증하지 않습니다.</p>';
 }
 function draw(){
  const i=d.stats.indexOf(stat.value),min=Math.max(0,Number(depth.value)||0);
  shown=rows.filter(x=>(!origin.value||x.r.profileId===origin.value)&&(!body.value||x.b.body===body.value)&&(!captain.value||(x.m?.branchChoices||[]).some(y=>y.id===captain.value))&&x.f.order.length>=min).sort((a,b)=>b.f.vector[i]-a.f.vector[i]||a.f.order.length-b.f.order.length||a.r.profileId.localeCompare(b.r.profileId));
  el("[data-oc-count]").textContent=n(shown.length)+"개 동일 경로 벡터 · "+n(new Set(shown.map(x=>x.r.profileId)).size)+"개 출생처";
  el("[data-oc-rows]").innerHTML=shown.map((x,j)=>'<tr><td>'+esc(x.r.soldierName+" · "+x.r.name)+'<small class="bs-sub">'+esc(label(x.b.body))+'</small></td><td>'+n(x.f.order.length)+'</td>'+x.f.vector.map((v,k)=>'<td>'+(i===k?'<strong>'+n(v)+'</strong>':n(v))+'</td>').join("")+'<td><button type="button" data-oc-row="'+j+'">경로</button></td></tr>').join("");
  if(!shown.includes(chosen))chosen=shown[0];detail(chosen);
 }
 for(const e of [origin,body,captain,stat,depth])e.addEventListener("change",draw);
 el("[data-oc-clear]").addEventListener("click",()=>{origin.value=body.value=captain.value="";stat.value="tu";depth.value="0";draw();});
 root.addEventListener("click",e=>{const button=e.target.closest("[data-oc-row]");if(!button)return;chosen=shown[Number(button.dataset.ocRow)];detail(chosen);el("[data-oc-detail]").scrollIntoView({block:"nearest"});});
 draw();
}
for(const root of document.querySelectorAll("[data-all-origin-cap-frontier]")){
 const wrapper=root.closest("details");
 const start=()=>{if(root.dataset.loaded)return;root.dataset.loaded="1";load().then(d=>mount(root,d)).catch(e=>{root.textContent="전체 출생처 성장 원장 연결 실패: "+e.message;delete root.dataset.loaded;});};
 if(!wrapper||wrapper.open)start();else wrapper.addEventListener("toggle",()=>{if(wrapper.open)start();});
}
