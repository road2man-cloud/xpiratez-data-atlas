// Canonical presentation vocabulary. Raw OXCE field names remain unchanged.
export const RESEARCH_TERMS=Object.freeze({
  incomingTitle:"이 연구의 조건",outgoingTitle:"이 연구의 영향",
  requires:"무조건 필요",dependencies:"조건 충족",incomingUnlocks:"직접 해금",
  requiredBy:"필수로 요구됨",conditionFor:"조건으로 사용됨",unlocks:"직접 해금함",
  freeIncoming:"무료 지급 출처",getOneFree:"무료 지급 후보",
  getOneFreeProtected:"조건부 무료 지급 후보",lookup:"완료 후 연결 연구",
  disables:"이 선택으로 배제",disabledBy:"이 연구를 배제하는 선택",
  reenables:"다시 활성화함"
});
const arr=x=>Array.isArray(x)?x:[];
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cache=new WeakMap();
export function researchRelationIndex(rules){
  if(cache.has(rules))return cache.get(rules);
  const index=Object.fromEntries(Object.keys(rules).map(id=>[id,{requiredBy:[],conditionFor:[],incomingUnlocks:[],freeIncoming:[],disabledBy:[]}]));
  const put=(id,key,value)=>{if(index[id])index[id][key].push(value)};
  for(const [id,r] of Object.entries(rules)){
    arr(r.requires).forEach(x=>put(x,'requiredBy',id));
    arr(r.dependencies).forEach(x=>put(x,'conditionFor',id));
    arr(r.unlocks).forEach(x=>put(x,'incomingUnlocks',id));
    arr(r.disables).forEach(x=>put(x,'disabledBy',id));
    arr(r.getOneFree).forEach(x=>put(x,'freeIncoming',{source:id,guard:null}));
    for(const [guard,ids] of Object.entries(r.getOneFreeProtected||{}))
      arr(ids).forEach(x=>put(x,'freeIncoming',{source:id,guard}));
  }
  cache.set(rules,index);return index;
}
export function researchRelations(id,rules){
  const r=rules[id];if(!r)return null;
  const reverse=researchRelationIndex(rules)[id];
  return {id,...reverse,requires:arr(r.requires),dependencies:arr(r.dependencies),
    unlocks:arr(r.unlocks),getOneFree:arr(r.getOneFree),getOneFreeProtected:r.getOneFreeProtected||{},
    lookup:r.lookup||null,reenables:arr(r.reenables),disables:arr(r.disables).map(target=>({
      from:id,to:target,direction:target===id?'self':arr(rules[target]?.disables).includes(id)?'bidirectional':'oneway',
      reverse:arr(rules[target]?.disables).includes(id)
    }))};
}
export function renderResearchRelations(id,rules,names={}){
  const x=researchRelations(id,rules);if(!x)return '<p>원본 연구 규칙 없음: '+esc(id)+'</p>';
  const chip=id=>'<button type="button" class="research-node" data-research-node="'+esc(id)+'">'+esc(names[id]||id)+'</button>';
  const group=(key,values)=>'<section data-relation="'+key+'"><h4>'+RESEARCH_TERMS[key]+'</h4><div>'+
    (values.length?values.map(chip).join(' '):'<span class="muted">없음</span>')+'</div></section>';
  return '<div class="research-relation-columns"><div><h3>좌측 · '+RESEARCH_TERMS.incomingTitle+'</h3>'+
    group('requires',x.requires)+group('dependencies',x.dependencies)+group('incomingUnlocks',x.incomingUnlocks)+
    '</div><div><h3>우측 · '+RESEARCH_TERMS.outgoingTitle+'</h3>'+group('requiredBy',x.requiredBy)+
    group('conditionFor',x.conditionFor)+group('unlocks',x.unlocks)+'</div></div>'+
    '<p class="relation-note"><code>unlocks</code>는 조건 충족 경로를 대체할 수 있지만 무조건 필요(<code>requires</code>)를 없애지 않습니다. 무료 지급은 직접 해금과 별도이며 후보 전체가 지급되는 것이 아닙니다.</p>'+
    '<details class="research-extra"><summary>무료 지급 · 연결 연구 · 방향성 배제</summary>'+
    '<h4>'+RESEARCH_TERMS.freeIncoming+'</h4>'+(x.freeIncoming.length?x.freeIncoming.map(g=>'<p>'+chip(g.source)+(g.guard?' · 보호 조건 '+chip(g.guard):'')+' 완료 시 지급 후보</p>').join(''):'<p>없음</p>')+
    group('getOneFree',x.getOneFree)+group('lookup',x.lookup?[x.lookup]:[])+
    '<h4>'+RESEARCH_TERMS.getOneFreeProtected+'</h4>'+Object.entries(x.getOneFreeProtected).map(([guard,ids])=>
      '<p>'+chip(guard)+' 보유 시: '+arr(ids).map(chip).join(' ')+'</p>').join('')+
    '<h4>'+RESEARCH_TERMS.disables+'</h4>'+ (x.disables.length?x.disables.map(e=>'<p data-exclusion="'+e.direction+'">'+
      chip(e.from)+(e.direction==='bidirectional'?' ↔ ':' → ')+chip(e.to)+' · '+
      ({bidirectional:'양방향 배제',oneway:'일방향 배제',self:'완료 후 자기 비활성화'}[e.direction])+ '</p>').join(''):'<p>없음</p>')+
    group('disabledBy',x.disabledBy)+group('reenables',x.reenables)+
    '<p class="relation-note">일방향 배제는 반대 방향의 배제를 의미하지 않습니다. 먼저 받은 영구 훈련의 유지 여부는 해당 시점의 연구·변신 이력으로 판단합니다.</p></details>';
}
