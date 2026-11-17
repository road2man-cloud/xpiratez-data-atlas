import { compareV2ManufacturingBases } from './base-comparison-core.mjs';

const $ = id => document.getElementById(id);
const number = n => Number.isFinite(n) ? n.toLocaleString('ko-KR') : '미확인';
const make = (parent, tag, text, cls) => {
  const el = document.createElement(tag);
  if (text !== undefined && text !== null) el.textContent=String(text);
  if (cls) el.className=cls;
  if (parent) parent.appendChild(el);
  return el;
};
const keyFor = settings => JSON.stringify([
  settings.recipeId, settings.batches,settings.maxDepth,
  settings.assumeImplicit,
  Object.entries(settings.choices||{}).sort(([a],[b])=>a.localeCompare(b,'en')),
  settings.saveDiscoveredResearchIds?.length || 0
]);

export function initBaseComparisonUI({planner,facilitiesIndex,getState,applyBase}) {
  let report=null, savedBases=null, savedKey=null;
  const panel=$('base-comparison');
  const content=$('base-comparison-results');
  const status=$('base-comparison-status');
  const runButton=$('base-comparison-run');
  const exportButton=$('base-comparison-export');
  const wipe=()=>{report=null;content.replaceChildren();exportButton.disabled=true;};

  const draw=selected=>{
    content.replaceChildren();
    if(!report)return;
    const headNote=make(content,'p','부족 재료 총량이 작은 순으로 표시합니다. 이는 실제 게임에서 제조하기 좋은 기지 순위가 아닙니다.','note');
    const table=make(content,'table',null,'base-comparison-table');
    const th=make(make(table,'thead'),'tr');
    for(const title of [
      '기지 (재료 부족 기준)','추가 조달','명시 제조비 / 작업량',
      '명시 필요 시설 기능','연구 참고','기존 주문','계획에 적용'
    ]) make(th,'th',title);
    const body=make(table,'tbody');
    report.sortedByMaterialShortage.forEach((index,position)=>{
      const entry=report.results[index];
      const tr=make(body,'tr');
      if(String(selected)===String(index))tr.className='base-comparison-current';
      const identity=make(tr,'td');
      make(identity,'strong',(position+1)+'. '+entry.name);
      make(identity,'code','기지 '+(index+1),'item-id');
      if(String(selected)===String(index))make(identity,'span','현재 계산 대상','note');
      make(tr,'td',number(entry.externalKinds)+'종 / '+number(entry.externalUnits)+'개');
      make(tr,'td',number(entry.manufacturingCost)+' / '+number(entry.manufacturingTime));
      const facility=make(tr,'td');
      if(entry.facilityEvidenceState==='unknown'){
        make(facility,'span','시설 목록 미확인','warn-note');
      }else if(entry.missingFunctions.length){
        make(facility,'strong','명시된 필요 기능 부족 '+number(entry.missingFunctions.length)+'종','warn-note');
        make(facility,'code',entry.missingFunctions.slice(0,10).join(', '),'item-id');
      }else{
        make(facility,'span',entry.requiredFunctions.length?
          '명시된 필요 기능 '+number(entry.requiredFunctions.length)+'종 존재':
          '명시 기능 요구 없음','note');
      }
      if(entry.functionsUnderConstruction.length)
        make(facility,'small','건설 중 기능: '+entry.functionsUnderConstruction.join(', '),'note');
      const research=make(tr,'td');
      if(entry.researchEvidenceState==='unknown')
        make(research,'span','세이브 연구 목록 미확인','note');
      else make(research,'span',entry.unmatchedResearch.length?
        'discovered 미일치 '+number(entry.unmatchedResearch.length)+'개':
        '확인한 목록에서 미일치 없음','note');
      make(tr,'td',number(entry.ordersInSave)+'개 · 예약 재료 미반영');
      const cell=make(tr,'td');
      const button=make(cell,'button',String(selected)===String(index)?
        '선택 중':'이 기지 재고 적용','secondary');
      button.type='button';
      button.disabled=String(selected)===String(index);
      button.title='기존 수동 입력 재고를 이 기지의 세이브 재고로 교체합니다.';
      button.addEventListener('click',()=>{
        try{
          applyBase(index);
          status.textContent='기지 '+(index+1)+'의 세이브 재고와 시설 목록을 계산기에 적용했습니다. 수동 입력 재고는 교체되었습니다.';
        }catch(e){status.textContent='기지 변경 실패: '+e.message;}
      });
      if(entry.external.length){
        const details=make(identity,'details');
        make(details,'summary','외부 부족 재료 '+number(entry.external.length)+'종');
        make(details,'p',entry.external.slice(0,12).map(x=>
          x.name+' '+number(x.quantity)+'개').join(' · '),'note');
      }
      if(entry.ruleFlags.length)make(facility,'small','규칙 주의: '+entry.ruleFlags.slice(0,5).join(', '),'note');
    });
    make(content,'h4','부족 재료별 기지 대조');
    make(content,'p','각 열은 별도 기지의 외부 부족 수량입니다. 0은 해당 기지의 가상 추가 제조에서 부족하지 않다는 뜻이며 수송이나 공동 창고를 가정하지 않습니다.','note');
    if(!report.shortageMatrix?.length)make(content,'p','현재 계획의 외부 부족 재료가 없습니다. 다른 제약은 별도로 확인하세요.','note');
    else {
      const matrix=make(content,'table',null,'base-comparison-table base-comparison-matrix');
      const heading=make(make(matrix,'thead'),'tr');
      make(heading,'th','부족 재료');
      for(const base of report.results)make(heading,'th',base.name);
      make(heading,'th','기지 간 부족량 차이');
      const body=make(matrix,'tbody');
      for(const item of report.shortageMatrix.slice(0,160)){
        const tr=make(body,'tr');
        const name=make(tr,'td');
        make(name,'strong',item.name);
        make(name,'code',item.id,'item-id');
        item.byBase.forEach(qty=>{
          make(tr,'td',number(qty)+'개',qty?'warn-note':'note');
        });
        make(tr,'td',number(item.spread)+'개','note');
      }
      if(report.shortageMatrix.length>160)
        make(content,'p','160종만 화면에 표시합니다. JSON에는 전부 포함됩니다.','note');
    }
    make(content,'p',report.caution,'note');
  };
  function refresh(){
    const state=getState();
    const bases=state?.bases;
    if(!Array.isArray(bases)||!bases.length||!state.recipeId){
      panel.hidden=true;savedBases=null;savedKey=null;wipe();return;
    }
    panel.hidden=false;
    const key=keyFor(state);
    if(savedBases!==bases || savedKey!==key){
      wipe();savedBases=bases;savedKey=key;
      status.textContent='로드한 '+number(bases.length)+'개 기지를 각각 계산할 수 있습니다. '+
        '현재 제조식 '+planner.name(state.recipeId)+' · '+number(state.batches)+'회';
    }else if(report)draw(state.selectedBaseIndex);
  }
  runButton.addEventListener('click',()=>{
    const state=getState();
    if(!state?.bases?.length)return;
    try{
      report=compareV2ManufacturingBases(planner,facilitiesIndex,state.bases,state);
      exportButton.disabled=false;
      status.textContent=number(report.results.length)+'개 기지를 독립 계산했습니다. '+
        '재료 부족 최소 관측값 '+number(report.minimumObservedExternalUnits)+
        '개. 시설·연구 등 전체 제조 가능성을 증명하지 않습니다.';
      savedBases=state.bases;savedKey=keyFor(state);
      draw(state.selectedBaseIndex);
    }catch(error){
      wipe();status.textContent='기지별 제조 비교 실패: '+error.message;
    }
  });
  exportButton.addEventListener('click',()=>{
    if(!report)return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)+'\n'],
      {type:'application/json'}));
    const a=document.createElement('a');
    a.href=url;a.download='xpiratez-v2-independent-bases.json';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  return {refresh};
}
