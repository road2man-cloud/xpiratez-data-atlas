// Existing all-origin panel; read the same registry used by both databases.
import {loadBranchSoldierResults} from "./branch-soldier-catalog.js?v=20261124-all-origin-4324-fix1";
import {allOriginCoverageText,renderAllOriginCap} from "./branch-soldier-origin-cap.js?v=20261124-all-origin-4324-fix1";
import {mountOriginBaseline} from "./branch-soldier-origin-baseline.js?v=20261124-population-1";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const n=v=>Number.isFinite(v)?v.toLocaleString("ko-KR"):"—";
const names={tu:"행동력",stamina:"지구력",health:"체력",bravery:"용기",reactions:"반응",firing:"사격",throwing:"투척",strength:"근력",psiStrength:"부두 강도",psiSkill:"부두 기술",melee:"근접",mana:"마나"};
const sum=v=>v.reduce((a,b)=>a+b,0);
const dominates=(a,b)=>a.every((v,i)=>v>=b[i])&&a.some((v,i)=>v>b[i]);
function mount(root,db){
 const o=db.originCap12;if(!o||o.schemaVersion!==1||o.sourceMetadataSha256!==db.sourceMetadataSha256)throw Error("전체 출생처 공통 원장 미연결");
 const records=Object.values(o.records);
 const label=id=>db.labels[id]||id;
 const list=(rows,chosen)=>rows.map(([v,t])=>'<option value="'+esc(v)+'"'+(v===chosen?" selected":"")+'>'+esc(t)+'</option>').join("");
 const choices=c=>(o.archiveEvidence[c.id]?.branchChoices||[]).filter(x=>c.scope==="full-route"||x.at<c.actionEnd);
 const rows=Object.values(o.models).flatMap(m=>m.witnessIds.map(id=>({id,m,w:db.witnesses[id],r:o.records[m.profileId]})));
 const bodyIds=[...new Set(rows.map(x=>x.w.body))].sort((a,b)=>label(a).localeCompare(label(b),"ko"));
 const captains=[...new Set(Object.values(o.archiveEvidence).flatMap(x=>x.branchChoices.map(y=>y.id).filter(y=>y.startsWith("STR_CAPTAIN_"))))].sort();
 const statChoices=[["total","12능력치 합계"],...db.stats.map(k=>[k,names[k]||k])];
 root.innerHTML='<p data-all-origin-model-coverage="true"><strong>전체 출생처 '+n(o.summary.modeledOrigins)+' / 72개</strong> · 기존 호환 경로 '+n(o.summary.modeledFullRoutes)+' / '+n(o.summary.archivePaths)+' · 성장 배치 고유 모델 '+n(o.summary.completedModels)+'개</p><p class="bs-sub">'+esc(allOriginCoverageText(db))+'</p><p class="bs-sub">전체 등록 후보를 같은 엔진으로 계산했습니다. 현재 수치는 출생처 연구 재생을 근거로 한 시간순 조건부 성장 상계입니다. 선택한 선장 기록은 공통 부모 이력의 정확 연결을 뜻하지 않습니다. 다른 작업자의 영애·미치광이 심층 결과는 별도 근거 수준으로 보존합니다.</p><div class="bs-controls"><label>출생처 <select data-oc-origin>'+list([["","전체"],...records.map(r=>[r.profileId,r.soldierName+" · "+r.name])],"")+'</select></label><label>최종 병종 <select data-oc-body>'+list([["","전체"],...bodyIds.map(id=>[id,label(id)])],"")+'</select></label><label>기록된 선장 선택 <select data-oc-captain>'+list([["","전체"],...captains.map(id=>[id,label(id)])],"")+'</select></label><label>우선 능력치 <select data-oc-stat>'+list(statChoices,"total")+'</select></label><label>최소 시술 횟수 <input data-oc-depth type="number" min="0" step="1" value="0"></label><label>비교 범위 <select data-oc-scope>'+list([["all","전환 포함"],["same","본체 유지"]],"all")+'</select></label><label>결과 <select data-oc-mode>'+list([["pareto","선택 범위별 종착 Pareto"],["all","등록 모델 전체"]],"pareto")+'</select></label><button type="button" data-oc-clear>초기화</button></div><details><summary>출생처별 계산 진척도 (72개)</summary><div class="bs-scroll"><table class="bs-table"><thead><tr><th>출생처</th><th>기존 경로</th><th>모델 적용</th><th>깊이</th><th>본체 Pareto</th><th>전환 포함 Pareto</th><th>미계산</th></tr></thead><tbody>'+records.map(r=>'<tr><td><button type="button" data-oc-select-origin="'+esc(r.profileId)+'">'+esc(r.soldierName+" · "+r.name)+'</button></td><td>'+n(r.fullRouteCount)+' / '+n(r.archivePaths)+'</td><td>'+n(r.modelIds.length)+' / '+n(r.uniqueOrders)+'</td><td>'+n(r.modeledDepth)+'</td><td>'+n(db.profiles[r.sameBodyProfile]?.count)+'</td><td>'+n(db.profiles[r.lineageProfile]?.count)+'</td><td>'+n(r.unresolvedModelIds.length)+'</td></tr>').join("")+'</tbody></table></div></details><p data-oc-count aria-live="polite"></p><div class="bs-controls"><button type="button" data-oc-prev>이전</button><span data-oc-page></span><button type="button" data-oc-next>다음</button></div><div class="bs-scroll"><table class="bs-table"><thead><tr><th>출생처 / 최종 병종</th><th>시술 횟수</th>'+db.stats.map(k=>'<th>'+esc(names[k]||k)+'</th>').join("")+'<th>상세</th></tr></thead><tbody data-oc-rows></tbody></table></div><section data-oc-detail class="bs-note" aria-live="polite"></section><p class="bs-sub">기준 커밋 <code>'+esc(o.baseCommit.slice(0,12))+'</code> · 연구 후보 원본 <code>'+esc(o.archiveSHA256.slice(0,12))+'</code> · 비용·시간·훈장·전역 최고치 미인증.</p>';
 const el=s=>root.querySelector(s),origin=el("[data-oc-origin]"),body=el("[data-oc-body]"),captain=el("[data-oc-captain]"),stat=el("[data-oc-stat]"),depth=el("[data-oc-depth]"),scope=el("[data-oc-scope]"),mode=el("[data-oc-mode]");
 let shown=[],chosen=null,page=0;const pageSize=50;
 const evidence=x=>x.m.candidates.find(c=>(!captain.value||choices(c).some(y=>y.id===captain.value))&&c.scope==="full-route")||x.m.candidates.find(c=>!captain.value||choices(c).some(y=>y.id===captain.value));
 function detail(x){
  if(!x){el("[data-oc-detail]").innerHTML="<p>선택한 조건에 등록된 후보가 없습니다.</p>";return;}
  const e=evidence(x);
  const trace=e?'<details><summary>선택한 등록 연구 경로의 선장·배제 기록</summary><p>근거 ID <code>'+esc(e.id)+'</code> · '+(e.scope==="birth-prefix"?"출생까지의 접두부":"전체 행동 기록")+' · 행동 '+n(e.actionEnd)+'개</p>'+choices(e).map(y=>'<p>'+esc(label(y.id))+' · '+n(y.at)+' 단계'+(e.scope==="full-route"?' · 종료 시 폐쇄 '+esc(y.excludes.map(label).join(" / ")||"없음"):"")+'</p>').join("")+'</details>':"";
  el("[data-oc-detail]").innerHTML='<h4>'+esc(x.r.soldierName+" · "+x.r.name)+' → '+esc(label(x.w.body))+'</h4>'+renderAllOriginCap(db,x.r.profileId,x.id,names)+trace;
 }
 function draw(reset=true){
  if(reset)page=0;
  const i=db.stats.indexOf(stat.value),min=Math.max(0,Number(depth.value)||0);
  const score=x=>i<0?sum(x.w.vector):x.w.vector[i];
  const eligible=rows.filter(x=>(!origin.value||x.r.profileId===origin.value)&&(!body.value||x.w.body===body.value)&&(!captain.value||evidence(x))&&x.m.order.length>=min&&(scope.value!=="same"||x.w.body===x.r.body));
  // Apply the filters first. A route dominated in another captain/depth
  // cohort is not removed from the underlying registry or the filtered view.
  if(mode.value==="pareto"){
   const groups=new Map();
   for(const x of eligible){const k=x.r.profileId+"|"+x.w.body;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x);}
   shown=[...groups.values()].flatMap(g=>{
    const unique=new Map();for(const x of g.sort((a,b)=>a.m.order.length-b.m.order.length||a.id.localeCompare(b.id)))if(!unique.has(x.w.vector.join(",")))unique.set(x.w.vector.join(","),x);
    const all=[...unique.values()].sort((a,b)=>sum(b.w.vector)-sum(a.w.vector)),f=[];
    for(const x of all)if(!f.some(y=>dominates(y.w.vector,x.w.vector)))f.push(x);
    return f;
   });
  }else shown=eligible;
  shown.sort((a,b)=>score(b)-score(a)||a.m.order.length-b.m.order.length||a.id.localeCompare(b.id));
  const pages=Math.max(1,Math.ceil(shown.length/pageSize));page=Math.min(page,pages-1);
  el("[data-oc-count]").textContent=n(shown.length)+"개 표시 벡터 / "+n(eligible.length)+"개 등록 벡터 · "+n(new Set(eligible.map(x=>x.r.profileId)).size)+"개 출생처. 기존 경로 삭제 없음.";
  el("[data-oc-page]").textContent=(page+1)+" / "+pages;el("[data-oc-prev]").disabled=page===0;el("[data-oc-next]").disabled=page>=pages-1;
  el("[data-oc-rows]").innerHTML=shown.slice(page*pageSize,(page+1)*pageSize).map(x=>'<tr><td>'+esc(x.r.soldierName+" · "+x.r.name)+'<small class="bs-sub">'+esc(label(x.w.body))+'</small></td><td>'+n(x.m.order.length)+'</td>'+x.w.vector.map((v,k)=>'<td>'+(i===k?'<strong>'+n(v)+'</strong>':n(v))+'</td>').join("")+'<td><button type="button" data-oc-row="'+esc(x.id)+'">경로</button></td></tr>').join("");
  if(!shown.includes(chosen))chosen=shown[0];detail(chosen);
 }
 for(const e of [origin,body,captain,stat,depth,scope,mode])e.addEventListener("change",()=>draw());
 el("[data-oc-clear]").addEventListener("click",()=>{origin.value=body.value=captain.value="";stat.value="total";depth.value="0";scope.value="all";mode.value="pareto";draw();});
 el("[data-oc-prev]").addEventListener("click",()=>{page=Math.max(0,page-1);draw(false);});
 el("[data-oc-next]").addEventListener("click",()=>{page++;draw(false);});
 root.addEventListener("click",e=>{
  const pick=e.target.closest("[data-oc-select-origin]");if(pick){origin.value=pick.dataset.ocSelectOrigin;draw();return;}
  const button=e.target.closest("[data-oc-row],[data-origin-cap-route]");if(!button)return;
  e.stopPropagation();
  const id=button.dataset.ocRow||button.dataset.originCapRoute,x=rows.find(r=>r.id===id);if(!x)return;
  chosen=x;detail(x);el("[data-oc-detail]").scrollIntoView({block:"nearest"});
 });
 draw();
 if(db.originBaseline){
  root.insertAdjacentHTML("beforeend",'<details class="bs-note" data-population-binary><summary>전체 등록 경로의 전수 이진 전투캡 성장 배치 · 직접비용 비교</summary><section data-binary-baseline></section></details>');
  const panel=root.querySelector("[data-population-binary]");
  panel.addEventListener("toggle",()=>{if(panel.open&&!panel.dataset.loaded){panel.dataset.loaded="1";mountOriginBaseline(panel.querySelector("[data-binary-baseline]"),db,null,null);}});
 }
}
if(typeof document!=="undefined")for(const root of document.querySelectorAll("[data-all-origin-cap-frontier]")){
 const wrapper=root.closest("details");
 const start=()=>{if(root.dataset.loaded)return;root.dataset.loaded="1";loadBranchSoldierResults().then(db=>mount(root,db)).catch(e=>{root.textContent="전체 출생처 공통 원장 연결 실패: "+e.message;delete root.dataset.loaded;});};
 if(!wrapper||wrapper.open)start();else wrapper.addEventListener("toggle",()=>{if(wrapper.open)start();});
}
