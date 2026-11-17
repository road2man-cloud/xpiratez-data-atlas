// Calculate a bounded series of hypothetical procurement passes. Each pass
// starts from identical saved inventory, only adjusting *virtual additions*.
// This is a feasibility exploration, not an optimization or an automatic buy.
import { compareProcurementAcquisitions } from './procurement-whatif-core.mjs';

export function exploreProcurementRounds(planner, settings, context={},
  initialAdditions={}, {maxRounds=4, maxItemKinds=300}={}) {
  if (!Number.isSafeInteger(maxRounds)||maxRounds<1||maxRounds>8 ||
      !Number.isSafeInteger(maxItemKinds)||maxItemKinds<1||maxItemKinds>5000)
    throw new Error('탐색 횟수는 1~8회, 품목 수는 1~5,000종이어야 합니다.');
  const additions={...initialAdditions};
  const rounds=[];
  let finalComparison=null, stopReason='maximum-rounds';
  for(let round=0;round<maxRounds;round++){
    const comparison=compareProcurementAcquisitions(
      planner,settings,context,additions
    );
    finalComparison=comparison;
    const outstanding=comparison.after.external
      .filter(x=>x.quantity>0)
      .sort((a,b)=>a.id.localeCompare(b.id,'en'));
    const record={
      round:round+1,
      unresolvedKinds:outstanding.length,
      unresolvedUnits:outstanding.reduce((sum,x)=>sum+x.quantity,0),
      newlyIdentified:[],
      extraAdded:0
    };
    rounds.push(record);
    if(!outstanding.length){stopReason='no-external-shortage';break;}
    const next={...additions};
    let newCount=0;
    for(const row of outstanding){
      if(!planner.itemMap.has(row.id))continue;
      if(Object.keys(next).length>=maxItemKinds &&
        !Object.hasOwn(next,row.id))continue;
      const previous=next[row.id]||0;
      const held=settings.inventory?.[row.id]||0;
      if(!Number.isSafeInteger(row.quantity) || row.quantity<=0 ||
        !Number.isSafeInteger(previous)||previous<0||
        previous+held+row.quantity>10000000)continue;
      next[row.id]=previous+row.quantity;
      newCount+=row.quantity;
      record.newlyIdentified.push({
        id:row.id,name:planner.name(row.id),newQuantity:row.quantity,
        cumulativeQuantity:next[row.id]
      });
    }
    if(!newCount){stopReason='no-eligible-new-additions';break;}
    record.extraAdded=newCount;
    Object.assign(additions,next);
    if(round===maxRounds-1)stopReason='maximum-rounds';
  }
  // Ensure the returned final comparison reflects the final proposed
  // acquisition quantities; loop snapshots describe pre-round shortfalls.
  finalComparison=compareProcurementAcquisitions(
    planner,settings,context,additions
  );
  return {
    schema:'xpiratez-v2-procurement-rounds/v1',
    additions,rounds,stopReason,
    final:finalComparison,
    caution:'부족 목록의 확장을 가상으로 반복하는 탐색입니다. 구매·조달 가능 여부, 글로벌 최소 확보량, 실제 제조 성공을 보증하지 않습니다. 단가 미확인과 시설·연구 조건은 계속 별도로 남습니다.'
  };
}
