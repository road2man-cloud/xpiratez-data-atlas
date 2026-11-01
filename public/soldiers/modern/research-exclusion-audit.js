// Source-derived, complete OXCE research-disables audit for X-Piratez 2.1.
// Uses the same 4,654 effective research rules already loaded by the modern
// soldier page. No parallel rules table, no hand-maintained exclusion list.
const list=v=>Array.isArray(v)?v:[];
const text=v=>String(v??"");
const escape=v=>text(v).replace(/[&<>"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));
const htmlIds=ids=>ids.length?ids.map(id=>'<code>'+escape(id)+'</code>').join(" · "):'<span class="muted">없음</span>';

export function completeResearchDisables(rules={}){
  const pairs=[];
  const set=new Set(Object.entries(rules).flatMap(([source,rule])=>
    list(rule.disables).map(target=>source+"\u0000"+target)));
  for(const [source,rule] of Object.entries(rules)){
    for(const target of list(rule.disables)){
      const type=source===target?"self":set.has(target+"\u0000"+source)?"reciprocal":"oneway";
      pairs.push({source,target,type});
    }
  }
  pairs.sort((a,b)=>a.source.localeCompare(b.source,"en")||
    a.target.localeCompare(b.target,"en"));
  const reciprocalEdges=pairs.filter(x=>x.type==="reciprocal").length;
  const onewayEdges=pairs.filter(x=>x.type==="oneway").length;
  const selfEdges=pairs.filter(x=>x.type==="self").length;
  return {pairs,counts:{namedResearch:Object.keys(rules).length,directEdges:pairs.length,
    reciprocalPairs:reciprocalEdges/2,onewayEdges,selfEdges,
    sourceResearch:new Set(pairs.map(x=>x.source)).size}};
}

export function researchSourceDetail(id,data){
  const rules=data?.researchRules||{};
  const r=rules[id];
  if(!r)return {id,missing:true};
  const unlockSources=[],freeSources=[],protectedFreeSources=[];
  for(const [source,row] of Object.entries(rules)){
    if(list(row.unlocks).includes(id))unlockSources.push(source);
    if(list(row.getOneFree).includes(id))freeSources.push(source);
    for(const [guard,targets] of Object.entries(row.getOneFreeProtected||{})){
      const values=typeof targets==="string"?[targets]:list(targets);
      if(values.includes(id))protectedFreeSources.push({source,guard});
    }
  }
  return {id,missing:false,dependencies:list(r.dependencies),
    requires:list(r.requires),unlocks:list(r.unlocks),
    getOneFree:list(r.getOneFree),getOneFreeProtected:r.getOneFreeProtected||{},
    unlockSources,freeSources,protectedFreeSources,
    eventSources:list(data.eventResearchSources?.[id]),
    needItem:!!r.needItem,destroyItem:!!r.destroyItem,
    baseFunctions:list(r.requiresBaseFunc),cost:r.cost??null,
    disables:list(r.disables),reenables:list(r.reenables)};
}

function researchDetailHtml(item){
  if(item.missing)return '<p>현재 2.1 연구 병합 데이터에 없는 연구: '+escape(item.id)+'</p>';
  const protectedSources=item.protectedFreeSources.map(x=>x.source+" (가드 "+x.guard+")");
  const eventSources=item.eventSources.map(x=>x.event||x.id||"(unknown event)");
  return '<section><h4><code>'+escape(item.id)+'</code></h4>'+
    '<p><strong>필수 requires</strong> '+htmlIds(item.requires)+'</p>'+
    '<p><strong>일반 dependencies</strong> '+htmlIds(item.dependencies)+'</p>'+
    '<p><strong>대체 unlocks 출처</strong> '+htmlIds(item.unlockSources)+'</p>'+
    '<p><strong>일반 무료 연구 출처</strong> '+htmlIds(item.freeSources)+'</p>'+
    '<p><strong>보호 무료 연구 출처</strong> '+htmlIds(protectedSources)+'</p>'+
    '<p><strong>이벤트 직접 지급 후보</strong> '+htmlIds([...new Set(eventSources)])+'</p>'+
    '<p><strong>완료 시 직접 비활성화</strong> '+htmlIds(item.disables)+'</p>'+
    '<p><strong>재활성화</strong> '+htmlIds(item.reenables)+'</p>'+
    '<p class="muted">연구 비용 '+escape(item.cost??"미확인")+
    ' · 실물 표본 필요 '+(item.needItem?"예":"아니요")+
    ' · 표본 소비 '+(item.destroyItem?"예":"아니요")+
    ' · 시설 '+htmlIds(item.baseFunctions)+'</p></section>';
}

export function initResearchExclusionAudit(data){
  const host=document.querySelector("#researchExclusionAudit");
  if(!host)return;
  const {pairs,counts}=completeResearchDisables(data.researchRules||{});
  const summary=document.querySelector("#researchExclusionSummary");
  const find=document.querySelector("#researchExclusionSearch");
  const kind=document.querySelector("#researchExclusionKind");
  const tbody=document.querySelector("#researchExclusionTable tbody");
  const rowsLabel=document.querySelector("#researchExclusionCount");
  const detail=document.querySelector("#researchExclusionDetail");
  if(!pairs.length){
    summary.textContent="연구 상호배제 출처가 없습니다. 원본 데이터를 확인하세요.";
    return;
  }
  if(pairs.length!==441||counts.reciprocalPairs!==134||
    counts.onewayEdges!==172||counts.selfEdges!==1){
    summary.textContent="연구 배제 감사 불일치: 2.1 원본과 연구 자료를 다시 생성해야 합니다.";
    return;
  }
  summary.textContent=counts.namedResearch+"종의 2.1 병합 연구 · 직접 disables "+
    counts.directEdges+"건 · 양방향 "+counts.reciprocalPairs+"쌍 · 단방향 "+
    counts.onewayEdges+"건 · 자기 자신 "+counts.selfEdges+"건";
  const labels={reciprocal:"양방향 상호배제",oneway:"단방향 · 순서 중요",self:"자기 비활성화"};
  function render(){
    const query=find.value.trim().toUpperCase();
    const filtered=pairs.filter(x=>(kind.value==="all"||kind.value===x.type)&&
      (!query||x.source.toUpperCase().includes(query)||x.target.toUpperCase().includes(query)));
    tbody.innerHTML=filtered.map(x=>'<tr><td><button class="research-audit-pair" type="button" data-from="'+
      escape(x.source)+'" data-to="'+escape(x.target)+'">'+escape(x.source)+
      '</button></td><td><code>'+escape(x.target)+'</code></td><td>'+
      labels[x.type]+'</td></tr>').join("")||
      '<tr><td colspan="3">조건에 맞는 배제 없음</td></tr>';
    rowsLabel.textContent=filtered.length+" / "+pairs.length+"건 표시";
  }
  find.addEventListener("input",render);
  kind.addEventListener("change",render);
  tbody.addEventListener("click",event=>{
    const button=event.target.closest(".research-audit-pair");
    if(!button)return;
    const a=researchSourceDetail(button.dataset.from,data);
    const b=researchSourceDetail(button.dataset.to,data);
    detail.hidden=false;
    detail.innerHTML='<div class="maxima-detail-head"><h3>연구 배제 원본 근거</h3>'+
      '<button type="button" id="researchAuditClose">닫기</button></div>'+
      '<p>원본 연구 A가 B를 <code>disables</code>합니다. 단방향 배제는 B를 먼저 획득한 뒤 A를 연구하는 이력이 가능할 수 있습니다. 연구의 완료 플래그가 삭제되어도 그 전에 획득한 병사의 변신 이력은 소급 취소되지 않습니다.</p>'+
      '<div class="research-audit-detail-grid">'+researchDetailHtml(a)+researchDetailHtml(b)+'</div>'+
      '<p class="muted">연구의 직접 선행만으로 실제 연구 가능을 확정하지 않습니다. 무료 연구는 1회당 1개 추첨이며 보호 조건, 이벤트 선택, 연구 표본, 연구 비용과 시점이 추가로 필요합니다.</p>';
    detail.querySelector("#researchAuditClose").onclick=()=>{
      detail.hidden=true;detail.innerHTML="";
    };
  });
  render();
}
