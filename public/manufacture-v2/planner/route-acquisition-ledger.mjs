// Material-by-material and stage-by-stage procurement ledger for an edited
// single-recipe X-Piratez v.o2 simulation. No action is executed in-game.
// Starting inventory is descriptive evidence, NOT a spendable guarantee.
const SCHEMA='xpiratez-v2-route-aware-cascade/v1';
const LIMIT=10000000;
const MAX_TYPES=5000;
const isAmount=x=>Number.isSafeInteger(x)&&x>=0&&x<=LIMIT;
const numberOrNull=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0?x:null;
const sum=(rows,field)=>rows.reduce((n,row)=>n+row[field],0);
const byId=(a,b)=>a.id.localeCompare(b.id,'en');

export function buildRouteAcquisitionLedger(report,startingInventory={}) {
  if(report?.schema!==SCHEMA || report.sourceVersion!=='v.o2' ||
    typeof report.rootRecipeId!=='string' || !Array.isArray(report.initialAcquired) ||
    !Array.isArray(report.history) || !Array.isArray(report.acquiredHypothetically) ||
    !Array.isArray(report.remainingExternal) || !startingInventory ||
    typeof startingInventory!=='object' || Array.isArray(startingInventory))
    throw new Error('편집 제조 경로의 v.o2 반복 조달 결과와 입력 재고가 필요합니다.');
  if(report.history.length>6 || report.acquiredHypothetically.length>MAX_TYPES)
    throw new Error('반복 단계 또는 재료 종류가 허용 상한을 넘었습니다.');
  const amounts=new Map();
  const entry=(id,name)=>{
    if(typeof id!=='string'||!id || id==='__proto__')
      throw new Error('단계별 재료 ID가 올바르지 않습니다.');
    if(!amounts.has(id)){
      const stock=Object.hasOwn(startingInventory,id)?startingInventory[id]:0;
      if(!isAmount(stock))throw new Error('현재 재고 수량이 올바르지 않습니다: '+id);
      if(amounts.size>=MAX_TYPES)
        throw new Error('조달 재료 종류가 5,000종을 초과합니다.');
      amounts.set(id,{
        id,name:name||id,startingInventory:stock,initialAcquisition:0,
        rounds:Array(report.history.length).fill(0),
        totalAcquisition:0,hypotheticalStockTarget:stock,
        remainingShortage:0,
        referenceUnitBuy:null,referenceSubtotal:null
      });
    }
    const item=amounts.get(id);
    if(name && item.name===id)item.name=name;
    return item;
  };
  const add=(row,index,seen)=>{
    if(typeof row?.id!=='string' || !Number.isSafeInteger(row.quantity) ||
      row.quantity<1 || row.quantity>LIMIT || seen.has(row.id))
      throw new Error('단계의 중복·잘못된 확보 재료가 있습니다.');
    seen.add(row.id);
    const item=entry(row.id,row.name);
    if(index===0)item.initialAcquisition+=row.quantity;
    else item.rounds[index-1]+=row.quantity;
    item.totalAcquisition+=row.quantity;
    if(item.startingInventory+item.totalAcquisition>LIMIT)
      throw new Error('누적 가상 재고가 10,000,000개를 초과합니다: '+item.id);
    item.hypotheticalStockTarget=item.startingInventory+item.totalAcquisition;
  };
  const first=new Set();
  for(const row of report.initialAcquired)add(row,0,first);
  const stages=[{
    stage:0,title:'최초 선택',kind:'selected',
    addedKinds:report.initialAcquired.length,
    addedUnits:sum(report.initialAcquired,'quantity'),
    shortageBeforeKinds:report.routeOnly?.shortageKinds??null,
    shortageBeforeUnits:report.routeOnly?.shortageUnits??null,
    shortageAfterKinds:report.history[0]?.shortageBefore?.kinds??
      report.routeAndAcquisition?.shortageKinds??null,
    shortageAfterUnits:report.history[0]?.shortageBefore?.units??
      report.routeAndAcquisition?.shortageUnits??null,
    additions:report.initialAcquired.map(x=>({id:x.id,name:x.name||x.id,quantity:x.quantity}))
  }];
  for(const [i,pass] of report.history.entries()){
    if(pass?.round!==i+1 || !Array.isArray(pass.added))
      throw new Error('후속 조달 단계 순서가 올바르지 않습니다.');
    const unique=new Set();
    for(const row of pass.added)add(row,i+1,unique);
    const count=sum(pass.added,'quantity');
    if(pass.addedUnits!==count || pass.addedKinds!==pass.added.length)
      throw new Error('후속 조달 단계 합계가 일치하지 않습니다.');
    stages.push({
      stage:i+1,title:'추가 '+(i+1)+'단계',kind:'additional',
      addedKinds:pass.added.length,addedUnits:count,
      shortageBeforeKinds:pass.shortageBefore.kinds,
      shortageBeforeUnits:pass.shortageBefore.units,
      shortageAfterKinds:pass.shortageAfter.kinds,
      shortageAfterUnits:pass.shortageAfter.units,
      additions:pass.added.map(x=>({id:x.id,name:x.name||x.id,quantity:x.quantity}))
    });
  }
  const reported=new Set();
  for(const row of report.acquiredHypothetically){
    if(typeof row?.id!=='string'||reported.has(row.id))
      throw new Error('반복 조달 최종 결과의 아이템 ID가 중복되었습니다.');
    reported.add(row.id);
    const entryRow=amounts.get(row.id);
    if(!entryRow || row.quantity!==entryRow.totalAcquisition ||
      row.target!==entryRow.hypotheticalStockTarget ||
      row.previous!==entryRow.startingInventory)
      throw new Error('단계별 확보량과 최종 수량이 일치하지 않습니다: '+row.id);
    const unit=numberOrNull(row.listedUnitBuy);
    const cost=unit===null?null:unit*entryRow.totalAcquisition;
    entryRow.referenceUnitBuy=unit;
    entryRow.referenceSubtotal=Number.isFinite(cost)?cost:null;
  }
  const remaining=new Set();
  for(const row of report.remainingExternal){
    if(typeof row?.id!=='string'||!isAmount(row.quantity)||remaining.has(row.id))
      throw new Error('최종 남은 부족 재료 목록이 올바르지 않습니다.');
    remaining.add(row.id);
    entry(row.id,row.name).remainingShortage=row.quantity;
  }
  const materials=[...amounts.values()].sort(byId);
  const acquired=materials.filter(x=>x.totalAcquisition>0);
  if(acquired.length!==reported.size)
    throw new Error('단계별 조달 항목과 최종 조달 목록의 종류 수가 다릅니다.');
  const totalInitial=sum(materials,'initialAcquisition');
  const totalAcquired=sum(materials,'totalAcquisition');
  const totalAdditional=totalAcquired-totalInitial;
  const referenceKnown=acquired.filter(x=>x.referenceSubtotal!==null);
  const pricedSubtotal=referenceKnown.reduce((n,x)=>n+x.referenceSubtotal,0);
  const fullyPriced=referenceKnown.length===acquired.length;
  return {
    schema:'xpiratez-v2-route-acquisition-ledger/v1',
    sourceVersion:'v.o2',rootRecipeId:report.rootRecipeId,
    stopped:report.stopped,
    stages,
    materials,
    summary:{
      materialKinds:acquired.length,
      listedKinds:materials.length,
      initialUnits:totalInitial,additionalUnits:totalAdditional,
      totalAcquiredUnits:totalAcquired,
      remainingShortageKinds:remaining.size,
      remainingShortageUnits:sum(report.remainingExternal,'quantity'),
      pricedKinds:referenceKnown.length,unpricedKinds:acquired.length-referenceKnown.length,
      knownReferenceSubtotal:pricedSubtotal,
      fullReferenceSubtotal:fullyPriced?pricedSubtotal:null
    },
    caution:'모든 확보 수량과 재고 목표는 가상 계산이며 실제 게임 재고를 바꾸지 않습니다. 최초 재고는 입력값이며, 남은 부족량은 시뮬레이션 결과입니다. 참고가는 규칙의 명시 단가일 뿐 시장 판매·구매 가능성이나 실제 비용이 아닙니다.'
  };
}

export function routeAcquisitionLedgerCsvRows(ledger) {
  if(ledger?.schema!=='xpiratez-v2-route-acquisition-ledger/v1' ||
    !Array.isArray(ledger.stages)||!Array.isArray(ledger.materials))
    throw new Error('단계별 조달 목록을 확인할 수 없습니다.');
  const headings=[
    '아이템 ID','한글 이름','현재 입력 재고','최초 선택 가정',
    ...ledger.stages.slice(1).map(x=>x.title+' 추가 가정'),
    '후속 가정 합계','총 추가 확보 가정','확보 후 가상 재고',
    '반복 종료 시 남은 부족','규칙 참고 단가','규칙 참고 확보가'
  ];
  return [headings,...ledger.materials.map(row=>[
    row.id,row.name,row.startingInventory,row.initialAcquisition,
    ...row.rounds,
    row.totalAcquisition-row.initialAcquisition,
    row.totalAcquisition,row.hypotheticalStockTarget,row.remainingShortage,
    row.referenceUnitBuy,row.referenceSubtotal
  ])];
}
