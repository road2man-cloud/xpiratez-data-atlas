import { compareProcurementAcquisitions, expandProcurementAcquisitions } from './procurement-whatif-core.mjs';
import { buildProcurementChecklist } from './queue-core.mjs';

const $ = id => document.getElementById(id);
const fmt = n => Number.isFinite(n) ? n.toLocaleString('ko-KR') : '미확인';
const element = (parent,tag,content,cls) => {
  const node=document.createElement(tag);
  if (content!==undefined && content!==null) node.textContent=String(content);
  if (cls) node.className=cls;
  parent?.appendChild(node);
  return node;
};
const field = (parent,labelText,value) => {
  const label=element(parent,'label',null,'queue-whatif-field');
  element(label,'span',labelText);
  const input=element(label,'input');
  input.type='number';input.min='0';input.max='10000000';input.step='1';
  input.value=String(value);
  return input;
};
const metric=(parent,heading,value)=>{
  const box=element(parent,'div',null,'metric');
  element(box,'span',heading);
  element(box,'strong',value);
};
const makeTable=(container,columns)=>{
  const table=element(container,'table');
  const heading=element(element(table,'thead'),'tr');
  for(const col of columns) element(heading,'th',col);
  return element(table,'tbody');
};

export function initProcurementWhatIfUI(planner) {
  let currentScenario=null;
  let baseReference=null;
  let inputs=new Map();
  let comparison=null;
  let lastExploration=null;
  const clearTrace=()=>{
    lastExploration=null;
    $('queue-whatif-trace').replaceChildren();
    $('queue-whatif-trace').hidden=true;
    $('queue-whatif-trace-json').disabled=true;
  };
  const showMessage=message=>{$('queue-whatif-status').textContent=message;};

  const renderInputs=()=>{
    const parent=$('queue-whatif-inputs');parent.replaceChildren();
    if(!currentScenario) return;
    const list=buildProcurementChecklist(planner,currentScenario.baseline);
    const inputKeys=new Set([...list.entries.map(row=>row.id),...inputs.keys()]);
    const max=300;
    const candidates=[...inputKeys]
      .map(id=>({
        id, name:planner.name(id),
        deficit:list.entries.find(row=>row.id===id)?.quantity||0,
        assigned:inputs.get(id)||0
      }))
      .filter(x=>x.deficit || x.assigned)
      .sort((a,b)=>{
        const xa=list.entries.findIndex(row=>row.id===a.id);
        const xb=list.entries.findIndex(row=>row.id===b.id);
        return (xa<0?Infinity:xa)-(xb<0?Infinity:xb)||a.id.localeCompare(b.id,'en');
      });
    if(!candidates.length){
      element(parent,'p','현재 외부 조달로 남은 품목이 없습니다. 가상 확보는 필요하지 않습니다.','note');
      return;
    }
    const wrapper=element(parent,'div',null,'table-wrap');
    const tableBody=makeTable(wrapper,['재료 · 2.1 ID','현재 부족 수량','가상 추가 확보 수량']);
    for(const candidate of candidates.slice(0,max)){
      const row=element(tableBody,'tr');
      const first=element(row,'td');
      element(first,'strong',candidate.name);
      element(first,'code',candidate.id,'item-id');
      element(row,'td',fmt(candidate.deficit));
      const quantityCell=element(row,'td');
      const quantity=field(quantityCell,candidate.id+' 가상 추가 확보',candidate.assigned);
      quantity.addEventListener('change',()=>{
        const n=Number(quantity.value);
        if(!Number.isSafeInteger(n)||n<0||n>10000000){
          quantity.value=String(inputs.get(candidate.id)||0);
          showMessage('가상 추가 수량은 0~10,000,000 사이의 정수여야 합니다.');
          return;
        }
        if(n)inputs.set(candidate.id,n);
        else inputs.delete(candidate.id);
        comparison=null;
        $('queue-whatif-json').disabled=true;
        $('queue-whatif-report').hidden=true;
        showMessage('가상 확보 수량을 변경했습니다. 비교 계산을 누르면 재계산합니다.');
      });
    }
    if(candidates.length>max)
      element(parent,'p','목록은 처음 300개 품목만 표시합니다. 이전에 입력한 다른 품목은 계산에 남아 있습니다.','note');
  };
  const updateSummary=report=>{
    const parent=$('queue-whatif-summary');parent.replaceChildren();
    for(const [label,value] of [
      ['외부 부족 재료 종류',fmt(report.summary.beforeExternalKinds)+' → '+fmt(report.summary.afterExternalKinds)],
      ['외부 부족 재료 수량',fmt(report.summary.beforeExternalUnits)+' → '+fmt(report.summary.afterExternalUnits)],
      ['외부 재료 없는 주문',fmt(report.summary.jobsWithNoExternalMaterialsBefore)+' → '+fmt(report.summary.jobsWithNoExternalMaterialsAfter)],
      ['명시된 제조비 합',fmt(report.summary.beforeDeclaredManufactureCost)+' → '+fmt(report.summary.afterDeclaredManufactureCost)],
      ['명시된 작업량 합',fmt(report.summary.beforeDeclaredWork)+' → '+fmt(report.summary.afterDeclaredWork)],
      ['가상 확보 참고가격',report.acquisitionReference.fullReference===null?
        '일부 '+fmt(report.acquisitionReference.knownReferenceSubtotal):
        fmt(report.acquisitionReference.fullReference)]
    ]) metric(parent,label,value);
  };
  const renderComparison=report=>{
    updateSummary(report);
    const differences=$('queue-whatif-differences');differences.replaceChildren();
    if(report.differences.length){
      const tbody=makeTable(differences,['재료','가상 확보','확보 전 부족','확보 후 부족','부족 감소']);
      for(const diff of report.differences.slice(0,300)){
        const row=element(tbody,'tr');
        const item=element(row,'td');
        const link=element(item,'a',diff.name);
        link.href='../../items-v2/?id='+encodeURIComponent(diff.id);
        element(item,'code',diff.id,'item-id');
        for(const n of [diff.added,diff.before,diff.after,diff.shortageReduction])
          element(row,'td',fmt(n));
      }
    }else element(differences,'p','가상 확보에 따른 재료 부족량 변화가 없습니다.','note');
    const jobs=$('queue-whatif-jobs');jobs.replaceChildren();
    const tbody=makeTable(jobs,['가상 작업','확보 전 부족','확보 후 부족','여전히 불확실한 조건']);
    for(const job of report.jobChanges){
      const row=element(tbody,'tr');
      const name=element(row,'td');
      element(name,'strong',job.position+'번째 · '+job.name);
      element(name,'code',job.recipeId,'item-id');
      element(row,'td',fmt(job.beforeExternalUnits)+'개 / '+fmt(job.beforeExternalKinds)+'종');
      element(row,'td',fmt(job.afterExternalUnits)+'개 / '+fmt(job.afterExternalKinds)+'종');
      const issues=[
        job.afterFutureOutputsBlocked?'후속 주문으로 산출물 이전 불가':null,
        job.remainingMissingFacilityFunctions.length?'시설 기능 '+job.remainingMissingFacilityFunctions.join(', '):null,
        job.remainingNotDiscovered.length?'discovered에 없는 연구 '+fmt(job.remainingNotDiscovered.length)+'개':null,
        job.remainingCalculationFlags.length?job.remainingCalculationFlags.join(', '):null
      ].filter(Boolean);
      element(row,'td',issues.join(' / ')||'명시된 항목 외 제약은 별도 확인 필요','note');
    }
    element(jobs,'p',report.note,'note');
    $('queue-whatif-report').hidden=false;
    $('queue-whatif-json').disabled=false;
    showMessage('가상 확보 전후 계산 완료. 실제 게임 재고나 세이브 파일은 변경하지 않았습니다.');
  };
  const run=()=>{
    if(!currentScenario)return;
    clearTrace();
    try{
      const additions=Object.fromEntries(inputs);
      comparison=compareProcurementAcquisitions(
        planner,currentScenario.settings,currentScenario.context,
        additions,currentScenario.baseline);
      renderComparison(comparison);
    }catch(e){
      comparison=null;
      $('queue-whatif-json').disabled=true;
      $('queue-whatif-report').hidden=true;
      showMessage('가상 확보 비교 실패: '+e.message);
    }
  };
  $('queue-whatif-fill').addEventListener('click',()=>{
    if(!currentScenario)return;
    const checklist=buildProcurementChecklist(planner,currentScenario.baseline);
    inputs=new Map(checklist.entries.slice(0,300).map(x=>[x.id,x.quantity]));
    renderInputs();run();
  });
  $('queue-whatif-expand').addEventListener('click',()=>{
    if(!currentScenario)return;
    try{
      const expanded=expandProcurementAcquisitions(planner,
        currentScenario.settings,currentScenario.context,Object.fromEntries(inputs),
        {maxRounds:5});
      inputs=new Map(Object.entries(expanded.additions).filter(([,n])=>n>0));
      renderInputs();
      comparison=expanded.result;
      renderComparison(comparison);
      lastExploration=expanded;
      const area=$('queue-whatif-trace');area.replaceChildren();
      const table=element(area,'table');
      const head=element(element(table,'thead'),'tr');
      for(const title of ['탐색 단계','단계 시작 부족','추가 가정 품목','가상 확보 수량'])
        element(head,'th',title);
      const body=element(table,'tbody');
      for(const record of expanded.history){
        const row=element(body,'tr');
        element(row,'td',fmt(record.round));
        element(row,'td',fmt(record.beforeExternalKinds)+'종 / '+fmt(record.beforeExternalUnits)+'개');
        element(row,'td',record.newlyAdded.slice(0,20).map(x=>x.name+' '+fmt(x.quantity)).join(' · '));
        element(row,'td',fmt(record.newlyAdded.reduce((sum,x)=>sum+x.quantity,0))+'개');
      }
      if(!expanded.history.length)element(area,'p','추가 가상 조달 없이 탐색을 종료했습니다.','note');
      element(area,'p','종료 사유: '+expanded.stopped+' · 남은 외부 조달 '+
        fmt(expanded.remainingExternal.length)+'종. 실제 확보 여부는 미확인입니다.','note');
      area.hidden=false;
      $('queue-whatif-trace-json').disabled=false;
      const status=expanded.stopped==='no-unresolved-materials'
        ? '현재 계산 범위의 외부 부족량을 해소하는 가상 수량을 찾았습니다.'
        : '탐색이 제한에서 중단됐습니다. 남은 부족 항목을 확인하세요.';
      showMessage(status+' 추가 부족 탐색 '+expanded.history.length+'회. 실제 확보·제조 가능성은 미확인입니다.');
    }catch(e){showMessage('반복 부족 탐색 실패: '+e.message);}
  });
  $('queue-whatif-trace-json').addEventListener('click',()=>{
    if(!lastExploration)return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(lastExploration,null,2)+'\n'],
      {type:'application/json'}));
    const a=document.createElement('a');a.href=url;
    a.download='xpiratez-v2-procurement-round-history.json';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('queue-whatif-clear').addEventListener('click',()=>{
    clearTrace();
    inputs.clear();comparison=null;
    $('queue-whatif-report').hidden=true;
    $('queue-whatif-json').disabled=true;
    renderInputs();
    showMessage('가상 확보 수량을 초기화했습니다. 실제 보유 재고는 그대로입니다.');
  });
  $('queue-whatif-run').addEventListener('click',run);
  $('queue-whatif-json').addEventListener('click',()=>{
    if(!comparison)return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(comparison,null,2)+'\n'],
      {type:'application/json'}));
    const a=document.createElement('a');
    a.href=url;a.download='xpiratez-v2-procurement-whatif.json';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  return {
    refresh(scenario){
      if(scenario?.context?.base!==baseReference){
        baseReference=scenario?.context?.base||null;
        inputs.clear();
      }
      currentScenario=scenario||null;
      clearTrace();
      comparison=null;
      $('queue-whatif-report').hidden=true;
      $('queue-whatif-json').disabled=true;
      renderInputs();
      showMessage(currentScenario
        ? '추가로 확보할 수량을 입력한 뒤 비교 계산을 실행하세요.'
        : '선택된 기지와 제조 주문이 없습니다.');
    },
    reset(){
      clearTrace();
      currentScenario=null;baseReference=null;inputs.clear();comparison=null;
      $('queue-whatif-inputs').replaceChildren();
      $('queue-whatif-report').hidden=true;
      $('queue-whatif-json').disabled=true;
    }
  };
}
