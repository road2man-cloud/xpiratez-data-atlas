import { simulateManufacturingQueue, compareManufacturingQueueOrders } from './queue-core.mjs';

const $=id=>document.getElementById(id);
const add=(parent,tag,value,cls)=>{
  const el=document.createElement(tag);
  if(value!==undefined&&value!==null)el.textContent=String(value);
  if(cls)el.className=cls;
  parent?.appendChild(el);
  return el;
};
const fmt=n=>Number.isFinite(n)?n.toLocaleString('ko-KR'):'미확인';
const sortNum=(a,b)=>a-b;

export function initQueueUI({ planner, manufactureIndex, facilitiesIndex, current }) {
  let baseReference=null;
  let order=[];
  let selected=new Map();
  let latest=null;
  let latestSpec=null;
  const catalog=new Set(manufactureIndex.entries.map(row=>row.id));
  const maxSaved=31; // plus the user's new target = 32
  const updateControls=()=>{
    const parent=$('queue-options');
    parent.replaceChildren();
    if(!baseReference)return;
    for(let position=0;position<order.length;position++){
      const i=order[position],saved=baseReference.productions[i];
      const line=add(parent,'div',null,'queue-option');
      const label=add(line,'label',null,'queue-check');
      const check=add(label,'input');
      check.type='checkbox';check.checked=selected.has(i);
      check.setAttribute('aria-label',saved.item+' 추가 생산 시나리오 선택');
      const name=planner.name(saved.item);
      add(label,'strong',name);
      add(line,'code',saved.item,'item-id');
      const amount=add(line,'input');
      amount.type='number';amount.min='1';amount.max='100';amount.step='1';
      amount.value=String(selected.get(i)||1);
      amount.disabled=!selected.has(i);
      amount.setAttribute('aria-label',saved.item+' 추가 생산 횟수');
      const up=add(line,'button','위로','secondary');
      const down=add(line,'button','아래로','secondary');
      up.type='button';down.type='button';
      up.disabled=position===0;down.disabled=position===order.length-1;
      add(line,'span','세이브 원본 주문량 '+fmt(saved.amount)+
        ' · 배정값 '+fmt(saved.assigned)+' · spent '+fmt(saved.spent),
        'note');
      check.addEventListener('change',()=>{
        if(check.checked)selected.set(i,1);else selected.delete(i);
        updateControls();run();
      });
      amount.addEventListener('change',()=>{
        const n=Number(amount.value);
        if(!Number.isSafeInteger(n)||n<1||n>100){
          $('queue-status').textContent='추가 생산 횟수는 각 주문당 1~100회입니다.';
          amount.value=String(selected.get(i)||1);return;
        }
        selected.set(i,n);run();
      });
      const move=(next)=>{
        [order[position],order[next]]=[order[next],order[position]];
        updateControls();run();
      };
      up.addEventListener('click',()=>move(position-1));
      down.addEventListener('click',()=>move(position+1));
    }
  };
  const renderReport=result=>{
    $('queue-report').hidden=false;
    const status=$('queue-status');
    status.textContent='신규 계획 포함 '+fmt(result.jobs.length)+'개 가상 작업 순서를 계산했습니다. '
      +'기존 주문의 실제 남은 작업량은 별도이며, 차감하지 않았습니다.';
    const summary=$('queue-summary');summary.replaceChildren();
    for(const [title,value] of [
      ['가상 제조 실행 횟수',fmt(result.totals.batches)],
      ['명시된 제조비 합계',fmt(result.totals.manufactureCost)],
      ['명시된 작업량 합계',fmt(result.totals.manufactureTime)],
      ['외부 조달 재료',fmt(result.external.length)+'종'],
      ['기초 재고 사용량',fmt(Object.values(result.inventory.usedStarting).reduce((s,n)=>s+n,0))+'개'],
      ['계획 산출물 재사용',fmt(Object.values(result.inventory.usedFromEarlierHypothetical).reduce((s,n)=>s+n,0))+'개']
    ]){
      const card=add(summary,'div',null,'metric');
      add(card,'span',title);add(card,'strong',value);
    }
    const body=$('queue-steps');body.replaceChildren();
    for(const [index,step] of result.jobs.entries()){
      const tr=add(body,'tr');
      const name=add(tr,'td');
      add(name,'strong',(index+1)+'. '+step.name);
      add(name,'code',step.recipeId,'item-id');
      add(name,'span',(step.source==='saved-order-hypothetical'?'기존 주문 추가 생산 가정':'현재 신규 계획')+
        ' · '+fmt(step.requestedBatches)+'회','note');
      add(tr,'td','제조비 '+fmt(step.declaredCost)+' / 작업량 '+fmt(step.declaredTime));
      add(tr,'td','기초 '+fmt(step.startingStockUsed)+'개 / 앞선 가상 산출 '+fmt(step.earlierPlannedStockUsed)+'개');
      add(tr,'td',step.external.length?
        step.external.map(x=>x.name+' '+fmt(x.quantity)).slice(0,8).join(' · '):'현재 범위 없음');
      const uncertain=[];
      if(step.missingFacilityFunctions.length)
        uncertain.push('시설 기능: '+step.missingFacilityFunctions.join(', '));
      if(step.researchAbsentFromDiscovered.length)
        uncertain.push('discovered에 없는 연구 '+step.researchAbsentFromDiscovered.length+'개');
      if(step.flags.length)uncertain.push(step.flags.slice(0,5).join(', '));
      if(!uncertain.length)uncertain.push('명시된 조건 이외는 미확인');
      add(tr,'td',uncertain.join(' / '),'note');
    }
    const wrap=$('queue-materials');wrap.replaceChildren();
    if(!result.materials.length){add(wrap,'p','현재 가상 시나리오에는 추적할 재료 소요가 없습니다.','note');return;}
    const table=add(wrap,'table');
    const header=add(add(table,'thead'),'tr');
    for(const title of ['재료','가상 총 수요','기초 재고 사용','앞선 산출 사용','외부 조달','기초 잔여','계획 산출 잔여'])
      add(header,'th',title);
    const body2=add(table,'tbody');
    for(const mat of result.materials.slice(0,300)){
      const tr=add(body2,'tr');
      const td=add(tr,'td');
      const a=add(td,'a',mat.name);a.href='../../items-v2/?id='+encodeURIComponent(mat.id);
      add(td,'code',mat.id,'item-id');
      for(const key of ['demand','startingUsed','earlierPlannedUsed','externallyNeeded',
        'startingRemain','futureOutputRemain'])
        add(tr,'td',fmt(mat[key]));
    }
    if(result.materials.length>300)add(wrap,'p','300종 표시, JSON 파일에는 전부 포함','note');
  };
  const run=()=>{
    const state=current();
    if(!baseReference||!state?.rootRecipeId){$('queue-report').hidden=true;return;}
    try{
      const planned=order.filter(i=>selected.has(i)).map(i=>({
        key:'saved-'+i,source:'saved',savedOrderIndex:i,
        recipeId:baseReference.productions[i].item,batches:selected.get(i)
      }));
      const target={
        key:'new-'+state.rootRecipeId,source:'new',
        recipeId:state.rootRecipeId,batches:state.batches
      };
      const jobs=$('queue-position').value==='first'?[target,...planned]:[...planned,target];
      const settings={
        jobs,inventory:state.inventory,maxDepth:state.maxDepth,choices:state.choices,
        assumeImplicit:state.assumeImplicit,
        ...(state.saveDiscovered!==null?{saveDiscoveredResearchIds:state.saveDiscovered}:{})
      };
      const context={base:baseReference,facilitiesIndex};
      const result=simulateManufacturingQueue(planner,settings,context);
      latestSpec={settings,context,targetKey:target.key};
      $('queue-order-comparison').hidden=true;
      latest=result;
      renderReport(result);
      $('queue-download').disabled=false;
    }catch(error){
      latest=null;latestSpec=null;
      $('queue-order-comparison').hidden=true;
      $('queue-report').hidden=true;
      $('queue-download').disabled=true;
      $('queue-status').textContent='가상 주문 계산 실패: '+error.message;
    }
  };
  const refresh=()=>{
    const state=current();
    const base=state?.baseOperations||null;
    $('queue-section').hidden=!base;
    if(!base){
      baseReference=null;order=[];selected.clear();
      latest=null;latestSpec=null;
      $('queue-order-comparison').hidden=true;$('queue-report').hidden=true;return;
    }
    if(baseReference!==base){
      baseReference=base;
      order=base.productions.map((_,i)=>i)
        .filter(i=>catalog.has(base.productions[i].item)).slice(0,maxSaved);
      selected=new Map(order.map(i=>[i,1]));
      const ignored=base.productions.filter(p=>!catalog.has(p.item)).length;
      $('queue-source').textContent='세이브에 저장된 제조 주문 '+fmt(base.productions.length)+
        '개 중 2.1 제조식으로 확인된 '+fmt(order.length)+
        '개를 선택했습니다.'+(ignored?' 목록에 없는 '+fmt(ignored)+'개는 제외.':'')+
        ' 기본 1회는 실제 미완료 횟수가 아닌 가상 추가 생산량입니다.';
      updateControls();
    }
    run();
  };

  const showOrderComparison=()=>{
    if(!latestSpec)return;
    try{
      const comparison=compareManufacturingQueueOrders(planner,
        latestSpec.settings,latestSpec.context,latestSpec.targetKey);
      const summary=$('queue-order-compare-summary');
      const container=$('queue-order-compare-materials');
      summary.replaceChildren();container.replaceChildren();
      const statistics=[
        ['신규 먼저 · 외부 부족',comparison.newFirst.external.length+'종'],
        ['신규 나중 · 외부 부족',comparison.newLast.external.length+'종'],
        ['신규 먼저 · 명시 제조비',fmt(comparison.newFirst.totals.manufactureCost)],
        ['신규 나중 · 명시 제조비',fmt(comparison.newLast.totals.manufactureCost)],
        ['순서에 따라 다른 재료',comparison.differences.length+'종']
      ];
      for(const [title,value] of statistics){
        const card=add(summary,'div',null,'metric');
        add(card,'span',title);add(card,'strong',value);
      }
      if(comparison.differences.length){
        const table=add(container,'table');
        const th=add(add(table,'thead'),'tr');
        for(const title of ['재료','신규 먼저 부족','신규 나중 부족','나중 − 먼저'])
          add(th,'th',title);
        const body=add(table,'tbody');
        for(const item of comparison.differences){
          const line=add(body,'tr');
          const name=add(line,'td');
          const link=add(name,'a',item.name);
          link.href='../../items-v2/?id='+encodeURIComponent(item.id);
          add(name,'code',item.id,'item-id');
          add(line,'td',fmt(item.newFirst));
          add(line,'td',fmt(item.newLast));
          add(line,'td',(item.lastMinusFirst>0?'+':'')+fmt(item.lastMinusFirst));
        }
      }else{
        add(container,'p','현재 선택한 주문·재고·깊이에서는 신규 제조식 순서를 바꿔도 집계된 외부 부족 품목 수량이 같습니다.','note');
      }
      add(container,'p',comparison.note,'note');
      $('queue-order-comparison').hidden=false;
      $('queue-order-comparison').scrollIntoView({behavior:'smooth',block:'nearest'});
    }catch(error){
      $('queue-status').textContent='순서 대조 실패: '+error.message;
    }
  };

  $('queue-position').addEventListener('change',run);
  $('queue-compare').addEventListener('click',showOrderComparison);
  $('queue-run').addEventListener('click',run);
  $('queue-select-all').addEventListener('click',()=>{
    selected=new Map(order.map(i=>[i,selected.get(i)||1]));
    updateControls();run();
  });
  $('queue-select-none').addEventListener('click',()=>{
    selected.clear();updateControls();run();
  });
  $('queue-download').addEventListener('click',()=>{
    if(!latest)return;
    const blob=new Blob([JSON.stringify(latest,null,2)+'\n'],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download='xpiratez-v2-queue-scenario-'+Date.now()+'.json';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  return {refresh};
}
