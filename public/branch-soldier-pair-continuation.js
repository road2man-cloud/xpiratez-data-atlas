// Joint chronological evidence, separate from the relaxed population D3 DAG.
export function pairContinuationMarkup(db){
 const a=db.originPairContinuation,s=a?.summary;if(!s)return "";
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const f=v=>Number.isFinite(v)?v.toLocaleString("ko-KR",{maximumFractionDigits:2}):"—";
 const cp=s.prefixCheckpoint;
 const checkpointText=cp?'<p>디스크 상태 체크포인트: 재사용 '+f(cp.hits)+'회 · 신규 저장 '+f(cp.writes)+'회 · 생략 행동 '+f(cp.avoidedActionSteps)+'단계 · 무효 '+f(cp.invalid)+'건 · 쓰기 오류 '+f(cp.writeErrors)+'건. 동일한 원본 행동 순서·엔진 해시·전체 상태를 기준으로 재사용합니다.</p>':"";
 const names={tu:"행동력",stamina:"지구력",health:"체력",bravery:"용기",reactions:"반응",firing:"사격",throwing:"투척",strength:"근력",psiStrength:"부두 강도",psiSkill:"부두 기술",melee:"근접",mana:"마나"};
 const origins=new Map(db.originPairSearch.origins.map(o=>[o.id,o.name])),branches=new Map(db.branches.map(b=>[b.id,b.rank]));
 const sum=v=>v.reduce((x,y)=>x+y,0),vec=v=>v.map(f).join(" / "),groups=new Map();
 for(const [id,r] of Object.entries(a.routes)){const m=a.models[r.model],frontier=m?.frontier||[],top=frontier.reduce((x,y)=>!x||sum(y.vector)>sum(x.vector)?y:x,null),arr=groups.get(r.origin)||[];arr.push({id,r,top,frontier});groups.set(r.origin,arr);}
 const rows=[...groups].sort((x,y)=>x[0].localeCompare(y[0])).map(([origin,rs])=>{
  rs.sort((x,y)=>(y.top?sum(y.top.vector):-1)-(x.top?sum(x.top.vector):-1)||x.id.localeCompare(y.id));
  const tr=rs.map(({id,r,top,frontier})=>'<tr><td>#'+f(branches.get(r.branch))+'<br><code>'+esc(id)+'</code></td><td>'+esc(db.labels[r.body]||r.body)+' · 계급 '+f(r.rank)+'</td><td>'+r.order.map(x=>esc(db.labels[x]||x)).join(" → ")+'</td><td>'+vec(r.effective)+'</td><td>'+(top?vec(top.vector)+'<br><small>'+esc(top.schedule.join(" → "))+'</small><details><summary>조건부 Pareto '+f(frontier.length)+'개</summary>'+frontier.map(v=>'<div>'+vec(v.vector)+' · '+esc(v.schedule.join(" → "))+'</div>').join("")+'</details>':"수치 모델 미해결")+'</td></tr>').join("");
  return '<details><summary>'+esc(origins.get(origin)||origin)+' · '+f(rs.length)+'개 공동 육성 경로</summary><p><code>'+esc(origin)+'</code></p><div class="bs-scroll"><table class="bs-table"><thead><tr><th>분기·증거 ID</th><th>최종 병종·계급</th><th>실제 재생 시술 순서</th><th>출생 최소값 재생 실효 능력치</th><th>별도 성장 모델 조건부 상계</th></tr></thead><tbody>'+tr+'</tbody></table></div></details>';
 }).join("");
 return '<section class="bs-note" data-origin-pair-continuation="true"><h3>공동 연구·모집 이후 실제 시술 재생</h3><p><b>'+f(s.registeredRoutes)+'개</b> 경로 · '+f(s.pairedOrigins)+'개 출생처 · '+f(s.pairsWithTraining)+'개 출생처·분기 조합 · 최대 '+f(Math.max(0,...Object.keys(s.byDepth).map(Number)))+'회 시술</p><p>12능력치 수치 모델 '+f(s.numericModels)+'개 / 경로 참조 '+f(s.numericModelReferences)+'개 · 최근 동일 수치 모델 재사용 '+f(s.numericHits)+'회 · 재생 '+f(s.rootReplays)+'개 연구 접두부 / 재사용 '+f(s.rootHits)+'회 · 제한 조건 미해결 '+f(s.limitedUnresolved)+'건.</p>'+checkpointText+'<p class="bs-warning">출생 최솟값에서 실제 활성 연구와 원본 시술 조건을 순서대로 재생했습니다. 외부 자원 획득은 가정입니다. 별도 성장 상계는 같은 시술 순서에 대한 완화 모델이며, 실제 성장·난수·훈장 획득 또는 전역 최적성 인증이 아닙니다. 기존 제한 수치 모델과 중복 합산하지 않습니다.</p><p>능력치 순서: '+db.stats.map(k=>esc(names[k]||k)).join(" / ")+'</p>'+rows+'</section>';
}
