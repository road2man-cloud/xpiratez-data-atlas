// Deduplicate worklist entries across all hypothetical manufacturing orders.
// Priority is the first affected queue position, NOT a claim of optimum.
const order = {material:0,facility:1,research:2,rule:3,evidence:4};
const assertArray = x => Array.isArray(x) ? x : [];
export function buildManufacturingActionBoard(evidence, comparison) {
  if(evidence?.schema!=='xpiratez-v2-manufacture-evidence-matrix/v1' ||
    comparison?.schema!=='xpiratez-v2-procurement-whatif/v1' ||
    !Array.isArray(evidence.jobs) || !Array.isArray(comparison.after?.jobs) ||
    evidence.jobs.length!==comparison.after.jobs.length)
    throw new Error('2.1 제조 근거 행렬과 조달 계산이 필요합니다.');
  const actions=new Map();
  const add=(type,id,position,key,label,quantity=0)=>{
    const identity=type+':'+id;
    const existing=actions.get(identity)||{
      id, type,label, firstAffectedOrder:position,
      affectedOrders:[],totalQuantity:0,
      priorityMeaning:'earliest-affected-order'
    };
    existing.firstAffectedOrder=Math.min(existing.firstAffectedOrder,position);
    if(!existing.affectedOrders.some(x=>x.key===key))
      existing.affectedOrders.push({key,position});
    existing.totalQuantity+=quantity;
    if(!Number.isSafeInteger(existing.totalQuantity))
      throw new Error('우선 조치 수량이 정수 범위를 초과했습니다.');
    actions.set(identity,existing);
  };
  for(let i=0;i<evidence.jobs.length;i++){
    const item=evidence.jobs[i],saved=comparison.after.jobs[i];
    if(item.key!==saved.key)
      throw new Error('조달 계산과 제조 장애 순서가 일치하지 않습니다.');
    const pos=i+1;
    for(const m of assertArray(saved.external)) {
      if(!Number.isSafeInteger(m.quantity) || m.quantity<1)
        throw new Error('외부 부족 재료 수량이 유효하지 않습니다.');
      add('material',m.id,pos,item.key,'재료 확보 검토: '+m.name,m.quantity);
    }
    for(const fn of assertArray(item.missingFunctions))
      add('facility',fn,pos,item.key,'필요 시설 기능 확인: '+fn);
    for(const research of assertArray(item.researchNotDiscovered))
      add('research',research,pos,item.key,'세이브 연구 발견 여부 확인: '+research);
    for(const flag of assertArray(item.blockingFlags))
      add('rule',flag,pos,item.key,'제조 규칙 불확실성 검토: '+flag);
    if(item.facilityState==='not-checked')
      add('evidence','facility-roster',pos,item.key,'기지 시설 자료를 불러와 확인');
    if(item.researchState==='not-checked')
      add('evidence','research-discovered',pos,item.key,'세이브 discovered 연구 목록 확인');
  }
  const list=[...actions.values()].sort((a,b)=>
    a.firstAffectedOrder-b.firstAffectedOrder ||
    order[a.type]-order[b.type] ||
    b.affectedOrders.length-a.affectedOrders.length ||
    a.id.localeCompare(b.id,'en')
  );
  return {
    schema:'xpiratez-v2-manufacture-action-board/v1',
    entries:list,
    summary:{
      actions:list.length,
      materialUnits:list.filter(x=>x.type==='material')
        .reduce((s,x)=>s+x.totalQuantity,0),
      affectedOrders:new Set(list.flatMap(x=>x.affectedOrders.map(a=>a.key))).size
    },
    caveat:'첫 영향을 받는 주문 순서 기준의 확인 목록입니다. 시설 건설 또는 연구 가능 여부, 실제 구매 수단, 비용의 최적화는 판정하지 않습니다.'
  };
}
