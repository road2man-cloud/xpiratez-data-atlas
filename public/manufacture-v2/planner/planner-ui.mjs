import { createManufacturingPlanner } from './planner-core.mjs';
import { initV2SaveImportUI } from './save-import-ui.mjs';
import { facilityReadiness, productionOrders } from './save-operations-core.mjs';
import { initQueueUI } from './queue-ui.mjs';
import { prepareExternalBasket, compareExternalBasket, compareExternalBasketScenarios, compatibleExternalBasketBaselines } from './external-basket-core.mjs';
import { exploreExternalCandidates, rankExternalCandidates } from './external-candidate-explorer.mjs';
import { prepareCandidateHandoff } from './external-candidate-handoff.mjs';
import { calculateRouteWorkbench } from './candidate-route-workbench.mjs';
import { summarizeRouteReadiness } from './candidate-route-evidence.mjs';
import { buildManufacturingReadinessChecklist } from './manufacturing-readiness-checklist.mjs';
import { prepareReadinessBatch, calculateReadinessBatch } from './readiness-acquisition-batch.mjs';
import { calculateRouteAwareReadinessBatch } from './route-aware-readiness-batch.mjs';
import { expandRouteAwareReadinessBatch } from './route-aware-cascade.mjs';
import { routeAcquisitionLedgerCsvRows } from './route-acquisition-ledger.mjs';
import { routeMaterialWorkflowCsvRows } from './route-material-workflow.mjs';
import { projectRouteActionBoard,routeActionReviewCsvRows,restoreRouteActionReview } from './route-action-board.mjs';
import { previewRouteActionCarryover,applyRouteActionCarryover,routeActionCarryoverAudit,routeActionCarryoverAuditCsvRows } from './route-action-carryover.mjs';

const $ = id => document.getElementById(id);
const make = (parent, tag, text, className) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined && text !== null) el.textContent = String(text);
  if (parent) parent.appendChild(el);
  return el;
};
const nf = n => typeof n === 'number' && Number.isFinite(n)
  ? n.toLocaleString('ko-KR') : '미확인';
const slug = id => encodeURIComponent(id);
let queueUI = null;
let externalBasketSelection = new Set();
let externalBasketAmounts = new Map();
let externalBasketReport = null;
let externalBasketScenarios = { A:null, B:null };
let externalBasketComparison = null;
let externalExploration = null;
let externalRouteWorkbench = null;
let mainChecklist = null;
let mainChecklistReviewed = new Set();
let mainBatchSelected = new Set();
let mainBatchAmounts = new Map();
let mainBatchResult = null;
const state = { planner: null, recipes: [], currentId: null, choices: {},
  inventory: {}, itemEntries: [], plan: null, saveDiscovered: null,
  baseOperations: null, baseOperationsSummary: null, facilitiesIndex: null,
  manufactureIndex: null };
const statuses = {
  manufactured: '하위 제조식 확장',
  'choice-required': '복수 경로 · 선택 필요',
  'external-choice': '직접 조달로 선택',
  external: '외부 조달/미검증',
  'unsupported-output': '산출량 또는 산출 방식 불명',
  'depth-limit': '설정한 단계에서 중단',
  cycle: '제조식 순환 감지',
  'invalid-choice': '선택한 제조식이 현재 조건과 맞지 않음',
  'unsafe-batches': '계산 가능한 수량 초과',
  'node-budget': '계산 노드 상한 도달',
  'stock-covered': '보유 재고·기생산물로 충당',
  'unsatisfied-output': '계획 산출 부족'
};

const label = row => row.koName || row.enName || row.id;
function searchChoices() {
  const q = $('recipe-search').value.trim().toLocaleLowerCase('ko-KR');
  const matches = state.recipes.filter(r => !q ||
    [r.id,r.koName,r.enName].some(s => String(s||'').toLocaleLowerCase('ko-KR').includes(q)));
  const select = $('recipe-select');
  select.replaceChildren();
  for (const row of matches.slice(0, 100)) {
    const option = make(select,'option',label(row)+' — '+row.id);
    option.value = row.id;
  }
  if (matches.length && matches.some(x => x.id === state.currentId) &&
      [...select.options].some(x => x.value === state.currentId))
    select.value = state.currentId;
  $('match-count').textContent = '검색 결과 '+nf(matches.length)+'개 · 목록은 최대 100개 표시';
}
function chooseRecipe(id) {
  if (!state.planner?.recipeMap.has(id)) return;
  state.currentId = id;
  state.choices = {};
  $('recipe-search').value = id;
  searchChoices();
  $('recipe-select').value = id;
  const url = new URL(location.href);
  url.searchParams.set('id',id);
  history.replaceState(null,'',url);
  renderPlan();
}
function metric(parent, label, value) {
  const box = make(parent,'div',null,'metric');
  make(box,'span',label);
  make(box,'strong',value);
}
function anchor(parent, url, title) {
  const a = make(parent,'a',title,'link-chip');
  a.href = url;
  return a;
}
function buildTree(parent, node) {
  const container = make(parent,'details',null,node.depth===0?'root':'subtree');
  if (node.depth <= 1) container.open = true;
  const heading = make(container,'summary');
  const first = make(heading,'div',null,'tree-line');
  make(first,'strong',node.name);
  make(first,'code',node.id,'tag');
  make(first,'span',nf(node.count)+'회 · 제조비 '+nf(node.cost)+' · 시간 '+nf(node.time),'tree-subtitle');
  if (node.viaItem) make(container,'p', '투입 재료 '+node.viaItem+
    ' / 명시·가정 산출 '+nf(node.yieldCount)+'개/회','tree-subtitle');
  if (node.prerequisites?.length)
    make(container,'p','선행 ID: '+node.prerequisites.join(' · '),'tree-subtitle');
  const body=make(container,'div');
  if(!node.inputs.length) {
    make(body,'p','직접 선언된 requiredItems 항목 없음','note');return;
  }
  for (const item of node.inputs) {
    if (item.kind==='unresolved') {
      make(body,'div',item.name+' ('+item.id+') — '+item.reason,'tree-leaf warning');
      continue;
    }
    const leaf = make(body,'div',null, 'tree-leaf'+
      (['cycle','choice-required','unsupported-output','invalid-choice'].includes(item.status) ? ' warning':''));
    const line = make(leaf,'div',null,'tree-line');
    make(line,'strong',item.name);
    make(line,'code',item.id,'tag');
    make(line,'span','필요 '+nf(item.quantity)+'개 · 보유 재고 '+nf(item.inventoryUsed)+
      '개 · 생산 잉여 활용 '+nf(item.surplusUsed)+'개 · 추가 필요 '+nf(item.deficit)+'개','tree-subtitle');
    make(line,'span',statuses[item.status]||item.status,
      ['manufactured','external'].includes(item.status)?'tag':'tag warn');
    if(item.neededBatches!==null)
      make(leaf,'p','하위 제조 '+nf(item.neededBatches)+'회 · 개당 산출 '+nf(item.yieldCount)+
        ' · 잉여 '+nf(item.extra)+(item.assumed?' · 산출량 가정':''),
        'tree-subtitle');
    for(const child of item.children) buildTree(leaf,child);
  }
}
function collectChoices(node, out) {
  for(const item of node.inputs || []) {
    if(item.kind!=='item') continue;
    if(item.producerCount && item.status!=='depth-limit') out.set(item.id,item);
    for(const child of item.children || []) collectChoices(child,out);
  }
}
function renderChoicePanel(plan) {
  const seen = new Map();
  collectChoices(plan.tree,seen);
  const parent = $('choices');
  parent.replaceChildren();
  $('choice-panel').hidden = seen.size === 0;
  for(const item of [...seen.values()].sort((a,b)=>a.name.localeCompare(b.name,'ko'))) {
    const candidates = state.planner.listProducers(item.id,$('assume-implicit').checked);
    const wrapper=make(parent,'div',null,'producer-row');
    make(wrapper,'span',item.name+' ('+item.id+') · 경로 '+candidates.length+'개');
    const select=make(wrapper,'select');
    select.setAttribute('aria-label',item.name+' 조달 방법');
    const direct=make(select,'option','외부 조달(제조비 제외)');
    direct.value='external';
    for(const candidate of candidates){
      const option=make(select,'option',candidate.name+' · '+candidate.recipeId+
        ' · 산출 '+nf(candidate.yieldCount)+'개/회'+
        ' · 제조비 '+nf(candidate.costPerBatch)+' · 시간 '+nf(candidate.timePerBatch)+
        ' · 재료 '+nf(candidate.inputKinds)+'종'+
        ' · 연구 조건 '+nf(candidate.researchKinds)+'개'+
        (candidate.assumed?' (산출량 가정)':''));
      option.value=candidate.recipeId;
    }
    const explicit = state.choices[item.id];
    if(explicit !== undefined) select.value=explicit;
    else if(candidates.length===1) select.value=candidates[0].recipeId;
    else select.value='external';
    select.addEventListener('change',()=>{
      state.choices[item.id]=select.value;
      renderPlan();
    });
    if (candidates.length > 1) {
      const btn=make(wrapper,'button','대체 경로 비용 비교','secondary');
      btn.type='button';
      btn.addEventListener('click',()=>renderComparison(item.id));
    }
  }
}
function prefillStockFromExternal(row) {
  if(!state.planner.itemMap.has(row.id))
    throw new Error('2.1 재고 목록에 없는 아이템은 입력할 수 없습니다: '+row.id);
  const current=state.inventory[row.id] || 0;
  const intended=current+row.quantity;
  if(!Number.isSafeInteger(intended)||intended>10000000)
    throw new Error('입력 재고가 최대 10,000,000개를 초과합니다: '+row.id);
  $('stock-search').value=row.id;
  searchInventoryItems();
  $('stock-select').value=row.id;
  $('stock-qty').value=String(intended);
  $('stock-message').textContent=row.name+' · 현재 입력 '+nf(current)+
    '개 + 부족량 '+nf(row.quantity)+'개 = '+nf(intended)+
    '개를 입력란에 준비했습니다. 적용 버튼을 누르기 전에는 계산·게임 세이브가 바뀌지 않습니다.';
  $('stock-qty').focus();
  $('stock-qty').scrollIntoView({behavior:'smooth',block:'center'});
}
function previewExternalAcquisition(row) {
  const current=state.inventory[row.id] || 0;
  const intended=current+row.quantity;
  if(!state.planner.itemMap.has(row.id)||!Number.isSafeInteger(intended)||
    intended>10000000)throw new Error('이 재료는 안전하게 가상 확보할 수 없습니다: '+row.id);
  const before=state.plan;
  const after=state.planner.plan(state.currentId,{
    batches:Number($('batches').value),maxDepth:Number($('max-depth').value),
    assumeImplicit:$('assume-implicit').checked,choices:state.choices,
    inventory:{...state.inventory,[row.id]:intended},
    ...(state.saveDiscovered ? {saveDiscoveredResearchIds:state.saveDiscovered}: {})
  });
  const panel=$('external-preview');
  $('external-preview-status').textContent=row.name+' ('+row.id+') '+nf(row.quantity)+
    '개를 추가 확보했다고 가정한 결과입니다. 원래 입력과 세이브는 수정하지 않았습니다.';
  const parent=$('external-preview-summary');parent.replaceChildren();
  const total=items=>items.reduce((sum,item)=>sum+item.quantity,0);
  metric(parent,'외부 조달 종류',nf(before.external.length)+'종 → '+nf(after.external.length)+'종');
  metric(parent,'외부 조달 수량',nf(total(before.external))+'개 → '+nf(total(after.external))+'개');
  metric(parent,'명시 제조비',nf(before.totals.declaredCost)+' → '+nf(after.totals.declaredCost));
  metric(parent,'명시 작업량',nf(before.totals.declaredTime)+' → '+nf(after.totals.declaredTime));
  const diffs=$('external-preview-diff');diffs.replaceChildren();
  const left=new Map(before.external.map(entry=>[entry.id,entry]));
  const right=new Map(after.external.map(entry=>[entry.id,entry]));
  const changed=[...new Set([...left.keys(),...right.keys()])].map(id=>({
    id,name:left.get(id)?.name||right.get(id)?.name||id,
    previous:left.get(id)?.quantity||0,current:right.get(id)?.quantity||0
  })).filter(entry=>entry.previous!==entry.current)
    .sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  if(!changed.length)make(diffs,'p','현재 계획에서 표시 가능한 외부 조달 변화가 없습니다.','note');
  else {
    const table=make(diffs,'table'),head=make(make(table,'thead'),'tr');
    for(const heading of ['재료','기존 부족','가정 후 부족','변화'])make(head,'th',heading);
    const body=make(table,'tbody');
    for(const entry of changed){
      const tr=make(body,'tr'),nameCell=make(tr,'td');
      anchor(nameCell,'../../items-v2/?id='+slug(entry.id),entry.name);
      make(nameCell,'code',entry.id,'item-id');
      for(const value of [nf(entry.previous),nf(entry.current),
        nf(entry.current-entry.previous)])make(tr,'td',value);
    }
  }
  panel.hidden=false;
  panel.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function canSelectExternalBasket(row) {
  const previous=state.inventory[row.id] || 0;
  return state.planner.itemMap.has(row.id) &&
    Number.isSafeInteger(previous) && previous>=0 && previous<10000000 &&
    Number.isSafeInteger(row.quantity) && row.quantity>0;
}
function updateBasketScenarioControls() {
  const name=slot=>{
    const scenario=externalBasketScenarios[slot];
    if(!scenario)return slot+': 미저장';
    return slot+': '+nf(scenario.acquiredHypothetically.length)+'종 · '+
      nf(scenario.acquiredHypothetically.reduce((sum,row)=>sum+row.quantity,0))+'개 확보 가정 저장';
  };
  $('external-basket-scenarios-status').textContent=name('A')+' / '+name('B');
  const comparable=!!(externalBasketScenarios.A && externalBasketScenarios.B);
  $('external-basket-compare').disabled=!comparable;
  if(!comparable){
    externalBasketComparison=null;
    $('external-basket-comparison').hidden=true;
    $('external-basket-compare-export').disabled=true;
  }
}
function updateExternalBasketControls() {
  const options=state.plan?.external || [];
  externalBasketSelection=new Set([...externalBasketSelection].filter(id=>
    options.some(row=>row.id===id && canSelectExternalBasket(row))));
  let basket=null, problem=null;
  if(externalBasketSelection.size){
    try{basket=selectedExternalBasket();}
    catch(error){problem=error.message;}
  }
  $('external-basket-status').textContent=problem?
    '확보 수량 확인 필요: '+problem : basket?
    '선택 '+nf(basket.selectedKinds)+'종 · 지정 확보량 '+nf(basket.selectedUnits)+
      '개. 아직 재고나 세이브에 반영하지 않았습니다.' :
    '아래 표에서 부족 재료를 선택하세요. 입력 가능한 '+
      nf(options.filter(canSelectExternalBasket).length)+'종';
  $('external-basket-all').disabled=!options.some(canSelectExternalBasket);
  $('external-basket-clear').disabled=!externalBasketSelection.size;
  for(const id of ['external-basket-preview','external-basket-prefill',
    'external-basket-save-a','external-basket-save-b'])
    $(id).disabled=!basket;
  externalBasketReport=null;
  $('external-basket-export').disabled=true;
  $('external-basket-report').hidden=true;
  $('external-explore-run').disabled=!basket;
  externalExploration=null;
  $('external-explore-results').hidden=true;
  $('external-explore-export').disabled=true;
  $('external-explore-status').textContent='선택한 재료의 개별·2종·전체 조합을 탐색할 수 있습니다.';
}
function selectedExternalBasket() {
  return prepareExternalBasket({
    external:state.plan.external,inventory:state.inventory,
    selectedIds:externalBasketSelection,itemIds:state.planner.itemMap,
    requestedQuantities:externalBasketAmounts
  });
}
function evidenceForCurrentPlan(plan) {
  return summarizeRouteReadiness(plan,{
    recipeMap:state.planner.recipeMap,researchMap:state.planner.researchMap,
    baseOperations:state.baseOperations,facilitiesIndex:state.facilitiesIndex
  });
}
function previewExternalBasket() {
  const basket=selectedExternalBasket(), before=state.plan;
  const after=state.planner.plan(state.currentId,{
    batches:Number($('batches').value),maxDepth:Number($('max-depth').value),
    assumeImplicit:$('assume-implicit').checked,choices:state.choices,
    inventory:basket.inventory,
    ...(state.saveDiscovered ? {saveDiscoveredResearchIds:state.saveDiscovered}: {})
  });
  const result=compareExternalBasket(before,after,basket);
  result.evidence=evidenceForCurrentPlan(after);
  const summary=$('external-basket-summary');summary.replaceChildren();
  metric(summary,'가상 확보 재료',nf(basket.selectedKinds)+'종 · '+nf(basket.selectedUnits)+'개');
  metric(summary,'외부 부족 종류',nf(result.initialShortage.kinds)+'종 → '+nf(result.hypotheticalShortage.kinds)+'종');
  metric(summary,'외부 부족 수량',nf(result.initialShortage.units)+'개 → '+nf(result.hypotheticalShortage.units)+'개');
  metric(summary,'명시 제조비',nf(result.beforeDeclaredCost)+' → '+nf(result.afterDeclaredCost));
  metric(summary,'명시 작업량',nf(result.beforeDeclaredTime)+' → '+nf(result.afterDeclaredTime));
  metric(summary,'제약·불확실성',nf(result.initialFlags.length)+'개 → '+nf(result.hypotheticalFlags.length)+'개');
  const parent=$('external-basket-diff');parent.replaceChildren();
  if(!result.changes.length)make(parent,'p','현재 확장 조건에서 부족 수량 변화가 없습니다.','note');
  else {
    const table=make(parent,'table'),header=make(make(table,'thead'),'tr');
    for(const name of ['재료','기존 외부 부족','가정 후 외부 부족','수량 변화'])make(header,'th',name);
    const body=make(table,'tbody');
    for(const item of result.changes){
      const row=make(body,'tr'),name=make(row,'td');
      anchor(name,'../../items-v2/?id='+slug(item.id),item.name);
      make(name,'code',item.id,'item-id');
      for(const value of [nf(item.before),nf(item.after),nf(item.after-item.before)])
        make(row,'td',value);
    }
  }
  externalBasketReport=result;
  $('external-basket-export').disabled=false;
  $('external-basket-report').hidden=false;
  $('external-basket-status').textContent='선택한 '+nf(basket.selectedKinds)+
    '종의 가상 확보를 재계산했습니다. 원래 입력 재고와 세이브는 수정하지 않았습니다.';
  $('external-basket-report').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function saveExternalBasketScenario(slot) {
  if(slot!=='A' && slot!=='B')throw new Error('시나리오 이름이 올바르지 않습니다.');
  previewExternalBasket();
  const other=slot==='A'?'B':'A';
  if(externalBasketScenarios[other] &&
      !compatibleExternalBasketBaselines(externalBasketScenarios[other],externalBasketReport))
    externalBasketScenarios[other]=null;
  externalBasketScenarios[slot]=externalBasketReport;
  externalBasketComparison=null;
  $('external-basket-comparison').hidden=true;
  $('external-basket-compare-export').disabled=true;
  updateBasketScenarioControls();
  $('external-basket-status').textContent='시나리오 '+slot+
    '를 저장했습니다. 다른 확보 수량을 입력하고 나머지 시나리오를 저장하면 비교할 수 있습니다.';
}
function renderExternalBasketComparison() {
  const result=compareExternalBasketScenarios(
    externalBasketScenarios.A,externalBasketScenarios.B);
  const summary=$('external-basket-compare-summary');summary.replaceChildren();
  metric(summary,'가정 확보 A / B',
    nf(result.scenarioA.acquiredUnits)+'개 / '+nf(result.scenarioB.acquiredUnits)+'개');
  metric(summary,'남은 외부 부족 A / B',
    nf(result.scenarioA.shortageUnits)+'개 / '+nf(result.scenarioB.shortageUnits)+'개');
  metric(summary,'명시 제조비 A / B',
    nf(result.scenarioA.declaredCost)+' / '+nf(result.scenarioB.declaredCost));
  metric(summary,'명시 작업량 A / B',
    nf(result.scenarioA.declaredTime)+' / '+nf(result.scenarioB.declaredTime));
  metric(summary,'제약·불확실성 A / B',
    nf(result.scenarioA.flags.length)+'건 / '+nf(result.scenarioB.flags.length)+'건');
  const evidenceA=externalBasketScenarios.A?.evidence;
  const evidenceB=externalBasketScenarios.B?.evidence;
  if(evidenceA||evidenceB){
    const facilityText=e=>e?nf(e.facilityCounts.confirmed)+'건 확인 · '+
      nf(e.facilityCounts.pending+e.facilityCounts.notObserved+
        e.facilityCounts.unverified)+'건 확인 필요':'정보 없음';
    const researchText=e=>e?nf(e.researchCounts.confirmed)+'개 discovered · '+
      nf(e.researchCounts.notInDiscovered+e.researchCounts.unverified+
        e.researchCounts.unresolved)+'개 확인 필요':'정보 없음';
    metric(summary,'시설 기능 근거 A / B',facilityText(evidenceA)+' / '+facilityText(evidenceB));
    metric(summary,'연구 참조 근거 A / B',researchText(evidenceA)+' / '+researchText(evidenceB));
  }
  const parent=$('external-basket-compare-materials');parent.replaceChildren();
  const table=make(parent,'table'),header=make(make(table,'thead'),'tr');
  for(const label of ['재료','A 확보 가정','B 확보 가정','A 남은 부족',
    'B 남은 부족','부족 차이 B−A'])make(header,'th',label);
  const tbody=make(table,'tbody');
  const aQty=new Map(result.acquiredHypotheticallyA.map(row=>[row.id,row.quantity]));
  const bQty=new Map(result.acquiredHypotheticallyB.map(row=>[row.id,row.quantity]));
  const allIds=new Set([...aQty.keys(),...bQty.keys()]);
  const entries=[...result.materials];
  for(const id of allIds){
    if(!entries.some(row=>row.id===id))
      entries.push({id,name:state.planner.name(id),aShortage:0,bShortage:0,
        differenceBMinusA:0});
  }
  entries.sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  for(const row of entries){
    const tr=make(tbody,'tr'),cell=make(tr,'td');
    anchor(cell,'../../items-v2/?id='+slug(row.id),row.name);
    make(cell,'code',row.id,'item-id');
    for(const value of [aQty.get(row.id)||0,bQty.get(row.id)||0,
      row.aShortage,row.bShortage,row.differenceBMinusA])
      make(tr,'td',nf(value));
  }
  externalBasketComparison=result;
  $('external-basket-compare-export').disabled=false;
  $('external-basket-comparison').hidden=false;
  $('external-basket-comparison').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function candidateHandoff(candidate) {
  return prepareCandidateHandoff({
    candidate,rootRecipeId:state.plan.rootRecipeId,external:state.plan.external,
    inventory:state.inventory,itemIds:state.planner.itemMap
  });
}
function draftCandidateStock(candidate) {
  const handoff=candidateHandoff(candidate);
  const input=$('stock-bulk-text');
  if(input.value.trim())
    throw new Error('기존 일괄 재고 입력문이 있어 덮어쓰지 않았습니다. 먼저 내용을 적용하거나 비워 주세요.');
  input.value=handoff.stockText;
  input.closest('details').open=true;
  $('stock-message').textContent=
    '탐색 후보 '+nf(handoff.selectedKinds)+'종 · 가상 확보 '+nf(handoff.selectedUnits)+
    '개를 재고 입력문으로 준비했습니다. 여러 재고 적용 버튼을 누르기 전까지 실제 입력 재고와 세이브는 변경되지 않습니다.';
  $('external-explore-status').textContent='조달 후보를 재고 입력문에 복사했습니다. 게임 세이브는 수정하지 않습니다.';
  input.scrollIntoView({behavior:'smooth',block:'center'});
  input.focus();
}
function loadCandidateSelection(candidate) {
  const handoff=candidateHandoff(candidate);
  externalBasketSelection=handoff.selectedIds;
  externalBasketAmounts=handoff.requestedQuantities;
  for(const tr of $('external').querySelectorAll('tbody tr')){
    const checkbox=tr.querySelector('input.external-basket-checkbox');
    const input=tr.querySelector('input.external-basket-amount');
    if(!checkbox || !input)continue;
    checkbox.checked=handoff.selectedIds.has(checkbox.value);
    if(checkbox.checked)input.value=String(handoff.requestedQuantities.get(checkbox.value));
  }
  updateExternalBasketControls();
  $('external-basket-status').textContent='탐색 후보 '+nf(handoff.selectedKinds)+
    '종 · '+nf(handoff.selectedUnits)+'개의 가상 확보 수량을 일괄 선택에 불러왔습니다. '+
    '재고와 원본 세이브는 변경하지 않았으며, 다시 탐색하려면 조합 자동 탐색을 누르세요.';
  $('external-basket-controls').scrollIntoView({behavior:'smooth',block:'center'});
}
function openRouteWorkbench(candidate) {
  const handoff=candidateHandoff(candidate);
  externalRouteWorkbench={
    candidate,
    selectedIds:new Set(handoff.selectedIds),
    amounts:new Map(handoff.requestedQuantities),
    choices:{...state.choices},
    calculation:null
  };
  $('external-route-workbench').hidden=false;
  renderWorkbenchMaterials();
  recalculateRouteWorkbench();
  $('external-route-workbench').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderWorkbenchMaterials() {
  const wb=externalRouteWorkbench;
  const parent=$('external-route-workbench-materials');parent.replaceChildren();
  if(!wb)return;
  const table=make(parent,'table');
  const header=make(make(table,'thead'),'tr');
  for(const value of ['확보 가정','재료','현재 부족','가정 확보 수량'])make(header,'th',value);
  const body=make(table,'tbody');
  for(const item of wb.candidate.additions) {
    const shortage=state.plan.external.find(row=>row.id===item.id);
    if(!shortage)continue;
    const row=make(body,'tr'),toggleCell=make(row,'td');
    const checkbox=make(toggleCell,'input');
    checkbox.type='checkbox';checkbox.checked=wb.selectedIds.has(item.id);
    checkbox.setAttribute('aria-label',shortage.name+' 작업대 확보 선택');
    checkbox.addEventListener('change',()=>{
      if(checkbox.checked)wb.selectedIds.add(item.id);
      else wb.selectedIds.delete(item.id);
      recalculateRouteWorkbench();
    });
    const name=make(row,'td');
    anchor(name,'../../items-v2/?id='+slug(item.id),shortage.name);
    make(name,'code',item.id,'item-id');
    make(row,'td',nf(shortage.quantity)+'개');
    const quantityCell=make(row,'td'),quantity=make(quantityCell,'input');
    quantity.type='number';quantity.min='1';quantity.step='1';
    quantity.max=String(Math.min(shortage.quantity,10000000-(state.inventory[item.id]||0)));
    quantity.value=String(wb.amounts.get(item.id)??item.quantity);
    quantity.setAttribute('aria-label',shortage.name+' 작업대 가정 확보 수량');
    quantity.addEventListener('change',()=>{
      wb.amounts.set(item.id,Number(quantity.value));
      recalculateRouteWorkbench();
    });
  }
}
function renderWorkbenchRouteChoices() {
  const wb=externalRouteWorkbench;
  const parent=$('external-route-workbench-choices');parent.replaceChildren();
  if(!wb?.calculation)return;
  const items=new Map();
  collectChoices(state.plan.tree,items);
  collectChoices(wb.calculation.routeBaseline.tree,items);
  collectChoices(wb.calculation.acquisitionPlan.tree,items);
  const available=[...items.values()].sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  if(!available.length){
    make(parent,'p','현재 확장된 경로에서 선택 가능한 하위 제조식이 없습니다.','note');
    return;
  }
  for(const item of available.slice(0,80)) {
    const producers=state.planner.listProducers(item.id,$('assume-implicit').checked);
    if(!producers.length)continue;
    const wrap=make(parent,'div',null,'route-workbench-choice');
    const labelNode=make(wrap,'label');
    make(labelNode,'strong',item.name);
    make(labelNode,'code',item.id,'tag');
    const select=make(labelNode,'select');
    select.setAttribute('aria-label',item.name+' 작업대 제조 경로');
    const external=make(select,'option','외부 조달 (하위 제조 안 함)');
    external.value='external';
    for(const entry of producers) {
      const option=make(select,'option',entry.name+' · '+entry.recipeId+
        ' · 산출 '+nf(entry.yieldCount)+'개/회 · 제조비 '+nf(entry.costPerBatch)+
        ' · 시간 '+nf(entry.timePerBatch));
      option.value=entry.recipeId;
    }
    const chosen=wb.choices[item.id];
    select.value=chosen!==undefined?chosen:
      producers.length===1?producers[0].recipeId:'external';
    select.addEventListener('change',()=>{
      wb.choices[item.id]=select.value;
      recalculateRouteWorkbench();
    });
  }
  if(available.length>80)
    make(parent,'p','처음 80종만 경로 편집을 표시합니다. 나머지는 기본 경로를 유지합니다.','note');
}
function renderWorkbenchComparison() {
  const wb=externalRouteWorkbench, result=wb.calculation.report;
  const parent=$('external-route-workbench-summary');parent.replaceChildren();
  const table=make(parent,'table'),head=make(make(table,'thead'),'tr');
  for(const title of ['지표','현재 제조 원안','경로만 편집','경로 편집 + 가상 확보'])
    make(head,'th',title);
  const body=make(table,'tbody');
  const refs=[
    result.activePlan,result.editedRouteBeforeAcquisition,
    result.editedRouteAfterAcquisition
  ];
  for(const [name,field,suffix] of [
    ['외부 부족 종류','shortageKinds','종'],
    ['외부 부족 수량','shortageUnits','개'],
    ['명시 제조비','declaredCost',''],
    ['명시 작업량','declaredTime',''],
    ['주의 조건','flags','건']
  ]){
    const tr=make(body,'tr');make(tr,'th',name);
    for(const ref of refs)make(tr,'td',nf(field==='flags'?ref.flags.length:ref[field])+suffix);
  }
  const diff=$('external-route-workbench-differences');diff.replaceChildren();
  make(diff,'p','아래 변화는 편집된 동일 제조 경로에서 재료를 가정 확보하기 전후의 차이입니다.','note');
  if(!result.shortageChanges.length){
    make(diff,'p','현재 확장 범위에서 외부 부족 수량 변화가 없습니다.','note');
    return;
  }
  const changes=make(diff,'table'),changeHead=make(make(changes,'thead'),'tr');
  for(const label of ['재료','확보 전 부족','가정 후 부족','차이'])make(changeHead,'th',label);
  const rows=make(changes,'tbody');
  for(const entry of result.shortageChanges){
    const tr=make(rows,'tr'),name=make(tr,'td');
    anchor(name,'../../items-v2/?id='+slug(entry.id),entry.name);
    make(name,'code',entry.id,'item-id');
    for(const value of [entry.before,entry.after,entry.after-entry.before])
      make(tr,'td',nf(value));
  }
}
const CHECKLIST_VISIBLE_LIMIT=200;
function checklistCsvRows(checklist) {
  return [
    ['확인 순서','종류','항목 ID','이름','수량','증거 상태','필요한 다음 확인',
      '근거','영향 제조식','참고 구매 단가','참고 구매 소계'],
    ...checklist.tasks.map((row,i)=>[
      i+1,row.categoryLabel,row.requirementId,row.title,row.quantity,
      row.statusLabel,row.action,row.evidence,row.recipeIds.join('; '),
      row.listedUnitBuy,row.listedBuySubtotal
    ])
  ];
}
function downloadReadinessJson(checklist,reviewedKeys,filename) {
  const payload={
    ...checklist,
    locallyReviewedKeys:[...reviewedKeys].sort(),
    reviewNote:'검토 체크는 브라우저 내 표시일 뿐, 재료 확보·시설 완공·연구 달성을 의미하지 않습니다.'
  };
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)+'\n'],
    {type:'application/json'}));
  const a=document.createElement('a');
  a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),500);
}
function appendChecklistTable(parent,checklist,{
  reviewed=null,onReview=null,batchSelection=null,batchAmounts=null,onBatchChange=null
}={}) {
  parent.replaceChildren();
  if(!checklist.tasks.length) {
    make(parent,'p','현재 계산에서 목록화한 추가 재료·확인 항목이 없습니다. 이는 실제 제조 가능 판정이 아닙니다.','note');
    return;
  }
  const table=make(parent,'table',null,'manufacture-checklist-table');
  const header=make(make(table,'thead'),'tr');
  for(const column of [
    ...(reviewed?['검토 표시']:[]),'우선 순서','종류','항목·수량',
    '근거 상태','다음 확인·조치', '재고 입력',
    ...(batchSelection?['일괄 확보 수량']:[])
  ])make(header,'th',column);
  const body=make(table,'tbody');
  for(const [index,row] of checklist.tasks.slice(0,CHECKLIST_VISIBLE_LIMIT).entries()) {
    const tr=make(body,'tr');
    if(reviewed){
      const cell=make(tr,'td'),check=make(cell,'input');
      check.type='checkbox';
      check.checked=reviewed.has(row.key);
      check.className='readiness-review';
      check.setAttribute('aria-label',row.title+' 검토 표시');
      check.addEventListener('change',()=>{
        if(check.checked)reviewed.add(row.key);
        else reviewed.delete(row.key);
        onReview?.();
      });
    }
    make(tr,'td',nf(index+1));
    make(tr,'td',row.categoryLabel);
    const name=make(tr,'td');
    make(name,'strong',row.title);
    make(name,'code',row.requirementId,'item-id');
    if(row.quantity!==null)make(name,'span','부족 '+nf(row.quantity)+'개','note');
    const status=make(tr,'td');
    make(status,'span',row.statusLabel,
      row.status==='shortage'||row.status==='pending'?'warn-note':'note');
    make(status,'p',row.evidence,'note');
    const action=make(tr,'td');
    make(action,'span',row.action);
    if(row.recipeIds.length)
      make(action,'p','영향 제조식: '+row.recipeIds.join(', '),'note');
    const ctl=make(tr,'td');
    if(row.category==='material'){
      const btn=make(ctl,'button','재고 입력 준비','secondary');
      btn.type='button';
      btn.setAttribute('aria-label',row.title+' 부족분 재고 입력 준비');
      btn.addEventListener('click',()=>{
        try{
          prefillStockFromExternal({
            id:row.requirementId,name:row.title,quantity:row.quantity
          });
        }catch(error){
          $('stock-message').textContent='재고 입력 준비 중단: '+error.message;
        }
      });
    }else make(ctl,'span','—','note');
    if(batchSelection){
      const cell=make(tr,'td',null,'readiness-batch-cell');
      if(row.category!=='material'){
        make(cell,'span','—','note');
      }else{
        const max=Math.min(row.quantity,10000000-(state.inventory[row.requirementId]||0));
        const supported=state.planner.itemMap.has(row.requirementId) && max>=1;
        const checkbox=make(cell,'input');
        checkbox.type='checkbox';checkbox.className='main-batch-check';
        checkbox.value=row.requirementId;
        checkbox.checked=batchSelection.has(row.requirementId);
        checkbox.disabled=!supported;
        checkbox.setAttribute('aria-label',row.title+' 일괄 확보 선택');
        checkbox.addEventListener('change',()=>{
          if(checkbox.checked)batchSelection.add(row.requirementId);
          else batchSelection.delete(row.requirementId);
          onBatchChange?.();
        });
        const amount=make(cell,'input');
        amount.type='number';amount.min='1';amount.step='1';
        amount.max=String(Math.max(0,max));
        amount.className='main-batch-amount';
        amount.value=String(batchAmounts.get(row.requirementId)??Math.max(1,max));
        amount.disabled=!supported;
        amount.setAttribute('aria-label',row.title+' 일괄 확보 수량');
        amount.addEventListener('input',()=>{
          batchAmounts.set(row.requirementId,Number(amount.value));
          onBatchChange?.();
        });
        if(!supported)make(cell,'span','재고 상한 또는 2.1 아이템 ID 미확인','note');
      }
    }
  }
  if(checklist.tasks.length>CHECKLIST_VISIBLE_LIMIT)
    make(parent,'p','화면에는 처음 '+nf(CHECKLIST_VISIBLE_LIMIT)+
      '개 작업만 표시합니다. CSV와 JSON에는 전체 작업을 저장합니다.','note');
}
function resetMainBatchResult() {
  mainBatchResult=null;
  $('main-batch-results').hidden=true;
  for(const id of ['main-batch-stock','main-batch-a','main-batch-b','main-batch-json',
    'main-batch-csv'])$(id).disabled=true;
  $('main-batch-summary').replaceChildren();
  $('main-batch-items').replaceChildren();
  $('main-batch-changes').replaceChildren();
}
function updateMainBatchStatus(){
  const materialRows=mainChecklist?.tasks.filter(x=>x.category==='material')||[];
  $('main-batch-all').disabled=!materialRows.some(row=>mainBatchAmounts.has(row.requirementId));
  $('main-batch-clear').disabled=!mainBatchSelected.size;
  if(!mainChecklist){
    $('main-batch-preview').disabled=true;
    $('main-batch-status').textContent='현재 제조 계획이 없습니다.';
    return;
  }
  if(!mainBatchSelected.size){
    $('main-batch-preview').disabled=true;
    $('main-batch-status').textContent='재료를 선택하세요. 확보할 수량을 바꾸면 현재 재고에 추가된 가상 재고로 독립 계산합니다.';
    return;
  }
  try {
    const draft=prepareReadinessBatch({
      checklist:mainChecklist,plan:state.plan,inventory:state.inventory,
      itemIds:state.planner.itemMap,selectedIds:mainBatchSelected,
      requestedQuantities:mainBatchAmounts
    });
    $('main-batch-preview').disabled=false;
    $('main-batch-status').textContent='선택한 재료 '+nf(draft.selectedKinds)+
      '종 · 가상 확보 '+nf(draft.selectedUnits)+
      '개. 계산 전에는 현재 보유 재고·세이브를 변경하지 않습니다.';
  }catch(error){
    $('main-batch-preview').disabled=true;
    $('main-batch-status').textContent='가상 확보 수량 확인 필요: '+error.message;
  }
}
function invalidateMainBatch(){
  resetMainBatchResult();
  updateMainBatchStatus();
}
function renderMainBatchResult(){
  const result=mainBatchResult?.report;
  if(!result)return;
  const summary=$('main-batch-summary');summary.replaceChildren();
  metric(summary,'가상 확보',nf(result.acquiredHypothetically.length)+'종 · '+
    nf(result.acquiredHypothetically.reduce((s,x)=>s+x.quantity,0))+'개');
  metric(summary,'재료 부족',nf(result.before.shortageKinds)+'종 · '+nf(result.before.shortageUnits)+
    '개 → '+nf(result.after.shortageKinds)+'종 · '+nf(result.after.shortageUnits)+'개');
  metric(summary,'확인 작업 수',nf(result.before.tasks)+'건 → '+nf(result.after.tasks)+'건');
  metric(summary,'새로 필요한 확인',nf(result.newlyRequired.length)+'건');
  metric(summary,'계산 목록에서 제외',nf(result.noLongerListed.length)+'건');
  metric(summary,'수량·상태 변화',nf(result.changedTasks.length)+'건');
  const acquisition=$('main-batch-items');acquisition.replaceChildren();
  const aTable=make(acquisition,'table'),aHead=make(make(aTable,'thead'),'tr');
  for(const name of ['재료','현재 부족','입력 재고','가상 확보','가상 재고',
    '원본 참고 단가','가정 확보분 참고가'])make(aHead,'th',name);
  const aBody=make(aTable,'tbody');
  for(const entry of result.acquiredHypothetically){
    const row=make(aBody,'tr'),first=make(row,'td');
    make(first,'strong',entry.name);
    make(first,'code',entry.id,'item-id');
    for(const field of ['shortage','previous','quantity','target'])
      make(row,'td',nf(entry[field]));
    make(row,'td',nf(entry.listedUnitBuy));
    make(row,'td',nf(entry.listedBuyReference));
  }
  make(acquisition,'p','참고가는 원본 규칙의 명시 단가만 계산하며 실제 판매·구매 가능성이나 지급 금액을 뜻하지 않습니다.','note');
  const target=$('main-batch-changes');target.replaceChildren();
  const changes=[
    ...result.newlyRequired.map(x=>({kind:'신규',row:x,before:'—',after:x.quantity})),
    ...result.noLongerListed.map(x=>({kind:'계산에서 제외',row:x,before:x.quantity,after:'—'})),
    ...result.changedTasks.map(x=>({kind:'변경',row:x.current,
      before:x.previous.quantity,after:x.current.quantity}))
  ];
  if(!changes.length){
    make(target,'p','현재 확장 조건에서 체크리스트 변경 항목이 없습니다.','note');
  }else{
    const table=make(target,'table'),header=make(make(table,'thead'),'tr');
    for(const name of ['유형','종류','항목','기존 수량 / 가정 후 수량'])make(header,'th',name);
    const body=make(table,'tbody');
    const format=v=>v===null?'조건 확인':typeof v==='number'?nf(v)+'개':v;
    for(const entry of changes.slice(0,100)){
      const tr=make(body,'tr');
      make(tr,'td',entry.kind);
      make(tr,'td',entry.row.categoryLabel);
      const first=make(tr,'td');
      make(first,'strong',entry.row.title);
      make(first,'code',entry.row.requirementId,'item-id');
      make(tr,'td',format(entry.before)+' → '+format(entry.after));
    }
    if(changes.length>100)
      make(target,'p','목록의 처음 100건을 표시했습니다. 전체 변화는 JSON에 포함됩니다.','note');
  }
  $('main-batch-results').hidden=false;
}
function runMainBatch(){
  resetMainBatchResult();
  try{
    const calculated=calculateReadinessBatch({
      checklist:mainChecklist,plan:state.plan,inventory:state.inventory,
      itemIds:state.planner.itemMap,selectedIds:mainBatchSelected,
      requestedQuantities:mainBatchAmounts,
      planWithInventory:inventory=>state.planner.plan(state.currentId,{
        batches:Number($('batches').value),maxDepth:Number($('max-depth').value),
        assumeImplicit:$('assume-implicit').checked,choices:state.choices,
        inventory,
        ...(state.saveDiscovered?
          {saveDiscoveredResearchIds:state.saveDiscovered}:{})
      }),
      evidenceForPlan:evidenceForCurrentPlan
    });
    mainBatchResult=calculated;
    renderMainBatchResult();
    for(const id of ['main-batch-stock','main-batch-a','main-batch-b','main-batch-json',
      'main-batch-csv'])$(id).disabled=false;
    $('main-batch-status').textContent='선택 재료를 가상 확보하고 제조 준비 목록을 재계산했습니다. 게임 세이브와 기존 재고는 변경하지 않았습니다.';
    $('main-batch-results').scrollIntoView({behavior:'smooth',block:'nearest'});
  }catch(error){
    $('main-batch-status').textContent='재계산 실패: '+error.message;
  }
}
function mainBatchToStockDraft(){
  const report=mainBatchResult?.report;
  if(!report)throw new Error('먼저 가상 확보를 재계산하세요.');
  const input=$('stock-bulk-text');
  if(input.value.trim())
    throw new Error('기존 일괄 재고 입력문이 있어 덮어쓰지 않았습니다. 기존 내용을 적용하거나 지운 뒤 다시 시도하세요.');
  input.value=report.stockDraft;
  input.closest('details').open=true;
  $('stock-message').textContent='선택한 가상 확보 재고를 입력란에 준비했습니다. 여러 재고 적용을 누르기 전에는 계산기 재고와 게임 세이브가 바뀌지 않습니다.';
  input.scrollIntoView({behavior:'smooth',block:'center'});
  input.focus();
}
function storeMainBatchScenario(slot) {
  if(!mainBatchResult || !['A','B'].includes(slot))
    throw new Error('가상 확보 결과와 저장 위치가 필요합니다.');
  const scenario=mainBatchResult.report.hypotheticalScenario;
  const opposite=slot==='A'?'B':'A';
  const old=externalBasketScenarios[opposite];
  if(old && !compatibleExternalBasketBaselines(old,scenario))
    externalBasketScenarios[opposite]=null;
  externalBasketScenarios[slot]=scenario;
  externalBasketComparison=null;
  $('external-basket-comparison').hidden=true;
  $('external-basket-compare-export').disabled=true;
  updateBasketScenarioControls();
  $('main-batch-status').textContent='가상 조달 결과를 시나리오 '+slot+
    '에 저장했습니다. 두 시나리오는 기존 A/B 비교 기능에서 확인할 수 있습니다. 실제 재고는 그대로입니다.';
}
function updateMainChecklistStatus(){
  if(!mainChecklist)return;
  const filtered=$('main-readiness-filter').value;
  const visible=filtered==='all'?mainChecklist.tasks:
    mainChecklist.tasks.filter(x=>x.category===filtered);
  const reviewed=mainChecklist.tasks.filter(x=>mainChecklistReviewed.has(x.key)).length;
  $('main-readiness-status').textContent='전체 '+nf(mainChecklist.totals.tasks)+
    '건 · 재료 '+nf(mainChecklist.totals.shortageKinds)+'종 ('+
    nf(mainChecklist.totals.shortageUnits)+'개 부족) · 시설 기능 '+
    nf(mainChecklist.totals.facilityFunctions)+'건 · 연구 참조 '+
    nf(mainChecklist.totals.researchReferences)+'건 · 규칙 확인 '+
    nf(mainChecklist.totals.unverifiedRuleFlags)+'건 · 현재 표시 '+
    nf(visible.length)+'건 · 개인 검토 표시 '+nf(reviewed)+'건. 검토 표시는 제조 조건 충족 판정이 아닙니다.';
}
function paintMainChecklist(){
  if(!mainChecklist)return;
  const selected=$('main-readiness-filter').value;
  const tasks=selected==='all'?mainChecklist.tasks:
    mainChecklist.tasks.filter(x=>x.category===selected);
  appendChecklistTable($('main-readiness-table'),{
    ...mainChecklist,tasks
  },{
    reviewed:mainChecklistReviewed,onReview:updateMainChecklistStatus,
    batchSelection:mainBatchSelected,batchAmounts:mainBatchAmounts,
    onBatchChange:invalidateMainBatch
  });
  updateMainChecklistStatus();
}
function renderMainChecklist(plan){
  const evidence=evidenceForCurrentPlan(plan);
  mainChecklist=buildManufacturingReadinessChecklist(plan,evidence);
  mainChecklistReviewed=new Set();
  mainBatchSelected=new Set();
  mainBatchAmounts=new Map();
  for(const row of mainChecklist.tasks.filter(row=>row.category==='material')){
    const max=Math.min(row.quantity,10000000-(state.inventory[row.requirementId]||0));
    if(state.planner.itemMap.has(row.requirementId)&&max>=1)
      mainBatchAmounts.set(row.requirementId,max);
  }
  resetMainBatchResult();
  updateMainBatchStatus();
  $('main-readiness-csv').disabled=false;
  $('main-readiness-json').disabled=false;
  $('main-route-workbench-open').disabled=!plan.external.some(canSelectExternalBasket);
  paintMainChecklist();
}
function renderWorkbenchChecklist(){
  const wb=externalRouteWorkbench;
  if(!wb?.calculation)return;
  const report=wb.calculation.report;
  const original=report.checklists.original,
    edited=report.checklists.editedRoute,
    final=report.checklists.withAcquisition;
  const container=$('external-route-workbench-checklist-summary');
  container.replaceChildren();
  metric(container,'원안 확인 목록',nf(original.totals.tasks)+'건');
  metric(container,'경로 편집 후',nf(edited.totals.tasks)+'건');
  metric(container,'재료 확보 가정 후',nf(final.totals.tasks)+'건');
  metric(container,'남은 재료 부족',nf(final.totals.shortageKinds)+
    '종 · '+nf(final.totals.shortageUnits)+'개');
  const delta=$('external-route-workbench-checklist-changes');
  delta.replaceChildren();
  const table=make(delta,'table'),head=make(make(table,'thead'),'tr');
  for(const title of ['확인 목록 변화','경로 변경','가상 확보 반영'])make(head,'th',title);
  const body=make(table,'tbody');
  for(const [name,read] of [
    ['추가 작업',x=>x.added.length],
    ['제외 작업',x=>x.removed.length],
    ['수량·상태·영향 제조식 변화',x=>x.changed.length]
  ]) {
    const row=make(body,'tr');
    make(row,'th',name);
    for(const x of [
      report.checklistChanges.routeOnly,
      report.checklistChanges.acquisitionOnly
    ])make(row,'td',nf(read(x))+'건');
  }
  const details=[];
  for(const [origin,x] of [
    ['경로 변경',report.checklistChanges.routeOnly],
    ['가상 확보',report.checklistChanges.acquisitionOnly]
  ])for(const row of x.added)
    details.push(origin+' · 신규 확인: '+row.title+' ('+row.requirementId+')');
  for(const [origin,x] of [
    ['경로 변경',report.checklistChanges.routeOnly],
    ['가상 확보',report.checklistChanges.acquisitionOnly]
  ])for(const row of x.removed)
    details.push(origin+' · 계산에서 제외된 확인: '+row.title+' ('+
      row.requirementId+')'+
      (row.quantity!==null?' · 기존 부족 '+nf(row.quantity)+'개':''));
  for(const [origin,x] of [
    ['경로 변경',report.checklistChanges.routeOnly],
    ['가상 확보',report.checklistChanges.acquisitionOnly]
  ])for(const row of x.changed)
    details.push(origin+' · 변경: '+row.current.title+
      ' ('+row.current.requirementId+')'+
      (row.current.quantity!==null?' · '+nf(row.previous.quantity)+'→'+
        nf(row.current.quantity)+'개':''));
  if(details.length){
    const list=make(delta,'ul');
    for(const line of details.slice(0,30))make(list,'li',line);
    if(details.length>30)
      make(delta,'p','변경 내역 '+nf(details.length-30)+
        '건은 JSON 보고서에 추가로 포함됩니다.','note');
  }
  appendChecklistTable($('external-route-workbench-checklist-table'),final);
  $('external-route-workbench-checklist-csv').disabled=false;
}
function renderWorkbenchEvidence() {
  const wb=externalRouteWorkbench;
  if(!wb?.calculation)return;
  const evidence=wb.calculation.report.evidence;
  const changes=wb.calculation.report.evidenceChanges;
  const summary=$('external-route-workbench-evidence-summary');summary.replaceChildren();
  const table=make(summary,'table'),head=make(make(table,'thead'),'tr');
  for(const label of ['조건 증거','원안','경로 변경','경로 변경 + 확보'])
    make(head,'th',label);
  const body=make(table,'tbody');
  const cols=[evidence.original,evidence.editedRoute,evidence.withAcquisition];
  const fields=[
    ['실제 확장된 제조식',x=>x.recipeIds.length+'종'],
    ['명시 시설 기능 요구',x=>nf(x.facilities.length)+'건'],
    ['저장 시설에서 기능 확인',x=>nf(x.facilityCounts.confirmed)+'건'],
    ['시설 건설 중',x=>nf(x.facilityCounts.pending)+'건'],
    ['기능 제공 미관측',x=>nf(x.facilityCounts.notObserved)+'건'],
    ['시설 근거 불명',x=>nf(x.facilityCounts.unverified)+'건'],
    ['연구 참조 (선행 포함)',x=>nf(x.research.length)+'개'],
    ['discovered에 있음',x=>nf(x.researchCounts.confirmed)+'개'],
    ['discovered에 없음',x=>nf(x.researchCounts.notInDiscovered)+'개'],
    ['연구 확인 불가',x=>nf(x.researchCounts.unverified)+'개'],
    ['규칙상 미해결 연구 ID',x=>nf(x.researchCounts.unresolved)+'개']
  ];
  for(const [name,read] of fields){
    const tr=make(body,'tr');make(tr,'th',name);
    for(const e of cols)make(tr,'td',read(e));
  }
  const source=evidence.withAcquisition;
  const evidenceText=source.facilityEvidenceSource==='saved-single-base' ?
    '선택한 단일 기지의 저장 시설 목록 사용' :
    source.facilityEvidenceSource==='no-single-base-selected' ?
      '선택한 단일 기지 시설 정보 없음 (합산 모드는 시설 대조하지 않음)' :
      '세이브 시설 목록 또는 규칙 인덱스를 확인할 수 없음';
  make(summary,'p','시설 근거: '+evidenceText+' · 연구 근거: '+
    (source.researchEvidenceSource==='saved-discovered' ?
      '세이브 discovered 목록 사용':'세이브 discovered 목록 미연결'),'note');
  const delta=$('external-route-workbench-evidence-changes');delta.replaceChildren();
  const changesTable=make(delta,'table'),changesHeader=make(make(changesTable,'thead'),'tr');
  for(const name of ['경로 변화','경로 편집으로 추가 / 해제','재료 확보 후 추가 / 해제'])
    make(changesHeader,'th',name);
  const deltaBody=make(changesTable,'tbody');
  for(const [label,prop] of [
    ['확장 제조식','recipes'],
    ['제조식별 시설 요구','facilityRequirements'],
    ['제조식별 직접 연구 참조','directResearchReferences'],
    ['선행 포함 연구 참조','researchClosure']
  ]){
    const row=make(deltaBody,'tr');make(row,'th',label);
    for(const diff of [changes.routeOnly[prop],changes.acquisitionOnly[prop]]){
      const added=diff.added.length?'추가 '+diff.added.join(', '):'';
      const removed=diff.removed.length?'제외 '+diff.removed.join(', '):'';
      make(row,'td',[added,removed].filter(Boolean).join(' / ')||'변동 없음');
    }
  }
  const requirements=$('external-route-workbench-requirements');
  requirements.replaceChildren();
  const recipeRows=source.facilities;
  const researchStatus=new Map(source.research.map(x=>[x.id,x.status]));
  const recipeGroups=new Map();
  for(const id of source.recipeIds)recipeGroups.set(id,{
    facilities:[],research:[]
  });
  for(const entry of recipeRows)recipeGroups.get(entry.recipeId)?.facilities.push(entry);
  for(const entry of source.directResearch)recipeGroups.get(entry.recipeId)?.research.push(entry);
  const rTable=make(requirements,'table'),rHead=make(make(rTable,'thead'),'tr');
  for(const name of ['제조식','필요 시설 기능 / 세이브 근거',
    '직접 선언 연구 참조 / discovered 근거'])make(rHead,'th',name);
  const rBody=make(rTable,'tbody');
  const description={
    confirmed:'저장 목록 확인',pending:'건설 중',notObserved:'제공 기능 미관측',
    unverified:'근거 없음',notInDiscovered:'discovered에 없음',
    'unknown-reference':'연구 인덱스 미해결'
  };
  for(const [id,group] of [...recipeGroups].slice(0,100)){
    const row=make(rBody,'tr'),cell=make(row,'td');
    anchor(cell,'../?id='+slug(id),state.planner.name(id));
    make(cell,'code',id,'item-id');
    const functions=make(row,'td');
    if(!group.facilities.length)make(functions,'span','직접 명시된 요구 없음','note');
    for(const req of group.facilities)
      make(functions,'p',req.functionId+' · '+(description[req.status]||req.status),
        req.status==='confirmed'?'note':'warn-note');
    const research=make(row,'td');
    if(!group.research.length)make(research,'span','직접 선언 참조 없음','note');
    for(const ref of group.research){
      const status=ref.status==='unknown-reference'?'unknown-reference':
        (researchStatus.get(ref.researchId)||'unverified');
      make(research,'p',ref.researchId+' · '+(description[status]||status),
        status==='confirmed'?'note':'warn-note');
    }
  }
  if(recipeGroups.size>100)
    make(requirements,'p','화면에는 제조식 100개만 표시합니다. 전체 조건은 작업대 JSON에 보존됩니다.','note');
  const actions=$('external-route-workbench-evidence-actions');actions.replaceChildren();
  const list=source.actions;
  make(actions,'p','조건 확인 필요 '+nf(list.length)+
    '건 · 실제 연구 잠금이나 제조 가능 판정이 아닌 증거 확인 목록입니다.','note');
  if(list.length){
    const ul=make(actions,'ul');
    for(const action of list.slice(0,80))
      make(ul,'li',(action.recipeId?action.recipeId+' · ':'')+
        action.requirementId+' — '+action.action);
    if(list.length>80)
      make(actions,'p','나머지 '+nf(list.length-80)+'건은 JSON에 포함됩니다.','note');
  }
}
function clearRouteActionCarryover(){
  const rb=externalRouteWorkbench?.routeBatch;
  if(rb)rb.actionCarryoverPreview=null;
  $('external-route-action-carryover-file').value='';
  $('external-route-action-carryover-file').disabled=true;
  $('external-route-action-carryover-apply').disabled=true;
  $('external-route-action-carryover-json').disabled=true;
  $('external-route-action-carryover-csv').disabled=true;
  $('external-route-action-carryover-status').textContent='';
  $('external-route-action-carryover-summary').replaceChildren();
  $('external-route-action-carryover-summary').hidden=true;
  $('external-route-action-carryover-items').replaceChildren();
  $('external-route-action-carryover-items').hidden=true;
}
function renderRouteActionCarryoverPreview(){
  const preview=externalRouteWorkbench?.routeBatch?.actionCarryoverPreview;
  if(!preview)return;
  const summary=$('external-route-action-carryover-summary');
  summary.replaceChildren();summary.hidden=false;
  metric(summary,'이전 검토·메모 보유 항목',nf(preview.counts.priorAnnotated)+'건');
  metric(summary,'동일 작업으로 판정',nf(preview.counts.eligible)+'건');
  metric(summary,'재사용 가능 검토 표시',nf(preview.counts.eligibleReviewed)+'건');
  metric(summary,'재사용 가능 메모',nf(preview.counts.eligibleNotes)+'건');
  metric(summary,'제조식 위치만 변경',nf(preview.counts.positionMoved)+'건');
  metric(summary,'변경·모호함으로 제외',nf(preview.counts.excluded)+'건');
  metric(summary,'제외 기록 관련 기존 제조식',nf(preview.counts.excludedAffectedRecipeKinds)+'종');
  const target=$('external-route-action-carryover-items');
  target.replaceChildren();
  // Always show exclusions before matches so dangerous/stale rows are not
  // hidden behind the visible 100-row preview limit.
  const rows=[
    ...preview.skipped.map(x=>({
      status:'이어받기 제외',label:x.label,type:x.type,
      previous:x.oldId,current:'—',detail:x.reason,
      affectedRecipeIds:x.affectedRecipeIds,
      currentRecipeTaskIds:x.currentRecipeTaskIds,
      missingRecipeIds:x.missingRecipeIds
    })),
    ...preview.matched.map(x=>({
      status:'동일한 작업',label:x.label,type:x.type,
      previous:x.oldId,current:x.currentId,
      currentRecipeTaskIds:[x.currentId],affectedRecipeIds:[],missingRecipeIds:[],
      detail:(x.reviewed?'기존 검토 표시':'검토 메모만 있음')+
        (x.note?' · 메모 포함':'')+
        (x.positionChanged?' · 위치 변경':'')
    }))
  ];
  if(!rows.length)make(target,'p','이전 JSON에 이어받을 검토 표시나 메모가 없습니다.','note');
  else{
    const table=make(target,'table');
    const header=make(make(table,'thead'),'tr');
    for(const title of ['판정','작업','기존 ID','현재 ID','판정 근거','관련 제조식·작업 이동'])
      make(header,'th',title);
    const body=make(table,'tbody');
    for(const row of rows.slice(0,100)){
      const tr=make(body,'tr');
      make(tr,'td',row.status);
      const title=make(tr,'td');make(title,'strong',row.label);
      make(title,'span',row.type,'note');
      make(tr,'td',row.previous);
      make(tr,'td',row.current);
      make(tr,'td',row.detail);
      const links=make(tr,'td');
      if(row.affectedRecipeIds.length)
        make(links,'p','이전 계획 영향 제조식: '+
          row.affectedRecipeIds.slice(0,8).join(', ')+
          (row.affectedRecipeIds.length>8?' 외 '+nf(row.affectedRecipeIds.length-8)+'종':''),'note');
      if(row.missingRecipeIds.length)
        make(links,'p','현재 계획에 없는 제조식: '+
          row.missingRecipeIds.slice(0,8).join(', ')+
          (row.missingRecipeIds.length>8?' 외 추가':''),'note');
      for(const taskId of row.currentRecipeTaskIds.slice(0,8)){
        const go=make(links,'button',taskId,'route-link-jump');
        go.type='button';
        go.setAttribute('aria-label',taskId+' 현재 작업표에서 찾기');
        go.addEventListener('click',()=>focusRouteActionTask(taskId));
      }
      if(row.currentRecipeTaskIds.length>8)
        make(links,'span','나머지 '+nf(row.currentRecipeTaskIds.length-8)+'건은 CSV/JSON 확인','note');
      if(!row.currentRecipeTaskIds.length)
        make(links,'span','현재 동일 ID 제조식 작업 없음','note');
    }
    if(rows.length>100)
      make(target,'p','대응·제외 결과 '+nf(rows.length-100)+
        '건은 화면에서 생략했습니다. 안전한 동일 작업의 수는 위에 모두 집계됩니다.','note');
  }
  target.hidden=false;
  $('external-route-action-carryover-apply').disabled=preview.counts.eligible===0;
  $('external-route-action-carryover-json').disabled=false;
  $('external-route-action-carryover-csv').disabled=false;
  $('external-route-action-carryover-status').textContent=
    '검토 JSON 비교 완료: 동일한 작업 '+nf(preview.counts.eligible)+'건, 제외 '+
    nf(preview.counts.excluded)+'건. 아직 현재 작업표에는 적용하지 않았습니다.'+
    ' 기존 사용자 메모는 적용 시에도 덮어쓰지 않습니다.';
}
function clearRouteActionBoard(){
  clearRouteActionCarryover();
  $('external-route-action-board').hidden=true;
  $('external-route-action-table').replaceChildren();
  $('external-route-action-status').textContent='';
  $('external-route-action-import-status').textContent='';
  $('external-route-action-import').value='';
  $('external-route-action-import').disabled=true;
  for(const id of ['csv','json','clear','prev','next'])
    $('external-route-action-'+id).disabled=true;
  $('external-route-action-page').textContent='페이지 0/0';
  $('external-route-action-filter').value='all';
  $('external-route-action-search').value='';
}
function focusRouteActionTask(taskId){
  const current=routeActionState();
  if(!current||!current.board.tasks.some(row=>row.id===taskId))return false;
  $('external-route-action-filter').value='all';
  $('external-route-action-search').value=taskId;
  current.rb.actionFocusId=taskId;
  current.rb.actionPage=0;
  renderRouteActionBoard();
  $('external-route-action-board').scrollIntoView({behavior:'smooth',block:'start'});
  return true;
}
function routeActionState(){
  const rb=externalRouteWorkbench?.routeBatch;
  const board=rb?.expanded?.report?.actionBoard;
  if(!rb||!board)return null;
  if(!rb.actionReviewed)rb.actionReviewed=new Set();
  if(!rb.actionNotes)rb.actionNotes=new Map();
  return {rb,board};
}
function renderRouteActionBoard(){
  const current=routeActionState();
  if(!current){clearRouteActionBoard();return;}
  const {rb,board}=current;
  const review=projectRouteActionBoard(board,{
    reviewed:rb.actionReviewed,notes:rb.actionNotes
  });
  const status=$('external-route-action-status');
  const filter=$('external-route-action-filter').value;
  const text=$('external-route-action-search').value.trim().toLocaleLowerCase('ko-KR');
  const rows=review.tasks.filter(row=>
    (!rb.actionFocusId||row.id===rb.actionFocusId)&&
    (filter==='all'||(filter==='pending'?!row.reviewed:row.type===filter))&&
    (!text||[row.label,row.requirementId,row.id].some(x=>
      String(x).toLocaleLowerCase('ko-KR').includes(text))));
  const pageSize=100;
  const pages=Math.max(1,Math.ceil(rows.length/pageSize));
  rb.actionPage=Math.max(0,Math.min(rb.actionPage||0,pages-1));
  const start=rb.actionPage*pageSize;
  const visible=rows.slice(start,start+pageSize);
  $('external-route-action-page').textContent='페이지 '+nf(rb.actionPage+1)+
    '/'+nf(pages)+' · '+(visible.length?nf(start+1)+'~'+nf(start+visible.length):'0')+
    ' / '+nf(rows.length)+'건';
  $('external-route-action-prev').disabled=rb.actionPage===0;
  $('external-route-action-next').disabled=rb.actionPage>=pages-1;
  status.textContent='전체 '+nf(review.summary.tasks)+'건 · 재료 확인 '+
    nf(review.summary.material)+'건 · 연구·시설·규칙 확인 '+
    nf(review.summary.condition)+'건 · 제조식 검토 '+nf(review.summary.recipe)+
    '건 · 검토 표시 '+nf(review.summary.reviewed)+'건 (미검토 '+
    nf(review.summary.unreviewed)+'건) · 현재 '+nf(rows.length)+
    '건 표시. 검토 표시와 선행 확인 수는 게임 내 완료 판정이 아닙니다.';
  const parent=$('external-route-action-table');parent.replaceChildren();
  const table=make(parent,'table'),head=make(make(table,'thead'),'tr');
  for(const heading of [
    '사용자 검토','작업 순서','작업 구분','항목 / 참고 수량',
    '선행 확인 작업','다음 확인할 일','사용자 메모'
  ])make(head,'th',heading);
  const tbody=make(table,'tbody');
  const labels={material:'재료 확보 확인',condition:'연구·시설·규칙 검토',
    recipe:'제조식 검토'};
  for(const item of visible){
    const tr=make(tbody,'tr');
    if(item.reviewed)tr.classList.add('action-reviewed');
    if(rb.actionFocusId===item.id)tr.classList.add('route-action-focused');
    const checkCell=make(tr,'td'),check=make(checkCell,'input');
    check.type='checkbox';check.checked=item.reviewed;
    check.className='route-action-check';
    check.setAttribute('aria-label',item.label+' 사용자 검토 표시');
    check.addEventListener('change',()=>{
      if(check.checked)rb.actionReviewed.add(item.id);
      else rb.actionReviewed.delete(item.id);
      renderRouteActionBoard();
    });
    make(tr,'td',nf(item.order));
    make(tr,'td',labels[item.type]||item.type);
    const title=make(tr,'td');
    make(title,'strong',item.label);
    make(title,'code',item.requirementId,'item-id');
    if(item.type==='material'){
      const known=externalRouteWorkbench?.routeBatch?.expanded?.report?.acquisitionLedger
        ?.materials.some(x=>x.id===item.requirementId);
      if(known){
        const go=make(title,'button','조달 원장 보기','route-link-jump');
        go.type='button';
        go.addEventListener('click',()=>focusRouteLedgerMaterial(item.requirementId));
      }
      const flow=make(title,'button','제조 순서에서 재료 찾기','route-link-jump');
      flow.type='button';
      flow.addEventListener('click',()=>focusRouteWorkflowReference(item.requirementId));
    }else if(item.type==='recipe'){
      const step=Number(item.id.replace(/^recipe::/,''));
      if(Number.isSafeInteger(step)&&step>0){
        const go=make(title,'button','제조 순서에서 보기','route-link-jump');
        go.type='button';
        go.addEventListener('click',()=>focusRouteWorkflowReference(item.requirementId,step));
      }
    }
    if(item.quantity!==null)
      make(title,'span',(item.type==='recipe'?'참고 제조 ':'가상 수량 ')+
        nf(item.quantity)+(item.type==='recipe'?'회':'개'),'note');
    const deps=make(tr,'td');
    make(deps,'span',item.dependsOn.length?
      nf(item.dependsOn.length)+'건 중 미검토 '+nf(item.unreviewedPrerequisiteIds.length)+'건':
      '직접 선행 작업 없음');
    if(item.unreviewedPrerequisiteIds.length)
      make(deps,'p',item.unreviewedPrerequisiteIds.slice(0,8).join(', ')+
        (item.unreviewedPrerequisiteIds.length>8?' 외 추가':''),'note');
    const action=make(tr,'td');
    make(action,'span',item.action);
    make(action,'p',item.detail,'note');
    const notes=make(tr,'td'),input=make(notes,'input');
    input.type='text';input.maxLength=300;
    input.className='route-action-note';
    input.value=item.note;
    input.placeholder='검토 메모 (300자)';
    input.setAttribute('aria-label',item.label+' 검토 메모');
    input.addEventListener('input',()=>{
      rb.actionNotes.set(item.id,input.value);
    });
  }
  if(rows.length>pageSize)
    make(parent,'p','대량 작업표는 100건씩 페이지로 표시합니다. CSV·JSON에는 전체 작업과 사용자 메모를 보존합니다.','note');
  $('external-route-action-board').hidden=false;
  $('external-route-action-import').disabled=false;
  $('external-route-action-carryover-file').disabled=false;
  for(const id of ['csv','json','clear'])$('external-route-action-'+id).disabled=false;
}
function exportRouteActionBoardJson(){
  const current=routeActionState();
  if(!current)return;
  const review=projectRouteActionBoard(current.board,{
    reviewed:current.rb.actionReviewed,notes:current.rb.actionNotes
  });
  const payload=JSON.stringify(review,null,2)+'\n';
  const url=URL.createObjectURL(new Blob([payload],{type:'application/json'}));
  const a=document.createElement('a');
  a.href=url;a.download='xpiratez-v2-route-action-review-'+review.rootRecipeId+'.json';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),500);
}
function focusRouteWorkflowReference(referenceId,position=null){
  const rb=externalRouteWorkbench?.routeBatch;
  if(!rb?.expanded?.report?.materialWorkflow)return false;
  $('external-route-batch-workflow-filter').value='all';
  $('external-route-batch-workflow-search').value=referenceId;
  rb.workflowFocusPosition=position;
  renderRouteMaterialWorkflow();
  $('external-route-batch-workflow').scrollIntoView({behavior:'smooth',block:'start'});
  return true;
}
function focusRouteLedgerMaterial(materialId){
  const rb=externalRouteWorkbench?.routeBatch;
  if(!rb?.expanded?.report?.acquisitionLedger?.materials.some(x=>x.id===materialId))
    return false;
  $('external-route-batch-ledger-search').value=materialId;
  rb.ledgerFocusId=materialId;
  renderRouteAcquisitionLedger();
  $('external-route-batch-ledger').scrollIntoView({behavior:'smooth',block:'start'});
  return true;
}
function clearRouteMaterialWorkflow(){
  $('external-route-batch-workflow').hidden=true;
  $('external-route-batch-workflow-csv').disabled=true;
  for(const id of ['summary','groups','materials','recipes','consumption','changes'])
    $('external-route-batch-workflow-'+id).replaceChildren();
  $('external-route-batch-workflow-status').textContent='';
  $('external-route-batch-workflow-search').value='';
  const filter=$('external-route-batch-workflow-filter');
  filter.replaceChildren();
  const option=make(filter,'option','전체');option.value='all';
}
function renderRouteMaterialWorkflow(){
  const workflow=externalRouteWorkbench?.routeBatch?.expanded?.report?.materialWorkflow;
  if(!workflow){clearRouteMaterialWorkflow();return;}
  const main=$('external-route-batch-workflow');
  const summary=$('external-route-batch-workflow-summary');summary.replaceChildren();
  metric(summary,'조달 사유 그룹',nf(workflow.summary.groups)+'개');
  metric(summary,'조달·부족 재료',nf(workflow.summary.materialKinds)+'종');
  metric(summary,'가상 추가 확보',nf(workflow.summary.hypotheticalAcquisitionUnits)+'개');
  metric(summary,'계산 종료 후 부족',nf(workflow.summary.remainingShortageUnits)+'개');
  metric(summary,'가상 확보 후 제조식',nf(workflow.summary.plannedRecipeOccurrences)+'개 노드');
  metric(summary,'제조식 변경',nf(workflow.summary.changedRecipeKinds)+'종');
  const filter=$('external-route-batch-workflow-filter');
  if(filter.options.length===1 && filter.value==='all'){
    for(const group of workflow.procurementGroups){
      const option=make(filter,'option',group.label+' ('+nf(group.kinds)+'종)');
      option.value=group.id;
    }
  }
  const groupWrap=$('external-route-batch-workflow-groups');groupWrap.replaceChildren();
  const groups=make(groupWrap,'table'),groupHeader=make(make(groups,'thead'),'tr');
  for(const column of ['규칙상 조달 사유','재료 종류','가상 확보량','계산 후 부족량'])
    make(groupHeader,'th',column);
  const groupBody=make(groups,'tbody');
  for(const group of workflow.procurementGroups){
    const tr=make(groupBody,'tr');
    for(const value of [group.label,nf(group.kinds)+'종',
      nf(group.acquiredUnits)+'개',nf(group.remainingUnits)+'개'])
      make(tr,'td',value);
  }
  const selected=filter.value;
  const query=$('external-route-batch-workflow-search').value.trim().toLocaleLowerCase('ko-KR');
  const availableTaskIds=new Set(routeActionState()?.board.tasks.map(x=>x.id)||[]);
  const order=new Map(workflow.procurementGroups.map((x,i)=>[x.id,i]));
  const materials=workflow.materials
    .filter(x=>(selected==='all'||x.categoryId===selected)&&
      (!query||[x.id,x.name].some(t=>String(t||'').toLocaleLowerCase('ko-KR').includes(query))))
    .sort((a,b)=>(order.get(a.categoryId)??999)-(order.get(b.categoryId)??999)||
      b.totalAcquisition-a.totalAcquisition||a.id.localeCompare(b.id,'en'));
  const materialWrap=$('external-route-batch-workflow-materials');
  materialWrap.replaceChildren();
  const table=make(materialWrap,'table'),head=make(make(table,'thead'),'tr');
  for(const value of ['재료','조달 근거','확보 단계',
    '현재 재고','가상 확보 합계','남은 부족','다음에 확인할 작업'])
    make(head,'th',value);
  const tbody=make(table,'tbody');
  const originLabel={
    'initial-selected':'최초 선택','later-round':'후속 반복',
    'unresolved-only':'확보되지 않음'
  };
  for(const item of materials.slice(0,200)){
    const tr=make(tbody,'tr'),name=make(tr,'td');
    make(name,'strong',item.name);make(name,'code',item.id,'item-id');
    if(availableTaskIds.has('material::'+item.id)){
      const go=make(name,'button','작업표에서 확인','route-link-jump');
      go.type='button';go.addEventListener('click',()=>focusRouteActionTask('material::'+item.id));
    }
    if(externalRouteWorkbench?.routeBatch?.expanded?.report?.acquisitionLedger
      ?.materials.some(x=>x.id===item.id)){
      const go=make(name,'button','조달 원장 보기','route-link-jump');
      go.type='button';go.addEventListener('click',()=>focusRouteLedgerMaterial(item.id));
    }
    make(tr,'td',item.categoryLabel);
    make(tr,'td',originLabel[item.origin]||'근거 확인');
    for(const v of [item.startingInventory,item.totalAcquisition,item.remainingShortage])
      make(tr,'td',nf(v));
    const action=make(tr,'td');
    make(action,'span',item.action);
    if(item.reasonIds.length)
      make(action,'p','규칙 근거: '+item.reasonIds.join(', '),'note');
  }
  if(materials.length>200)
    make(materialWrap,'p','표에는 최대 200종만 표시합니다. CSV에는 모든 재료를 보존합니다.','note');
  const recipes=$('external-route-batch-workflow-recipes');recipes.replaceChildren();
  const sequence=make(recipes,'table'),sHead=make(make(sequence,'thead'),'tr');
  for(const value of [
    '참고 순서','제조식','제조 횟수','앞서 준비할 하위 제조식',
    '직접 필요 재료','명시 제조비 / 작업량'
  ])make(sHead,'th',value);
  const sBody=make(sequence,'tbody');
  const focusPosition=externalRouteWorkbench?.routeBatch?.workflowFocusPosition;
  const displayedSteps=workflow.recipeSequenceAfter.filter(step=>
    (focusPosition===null||focusPosition===undefined||step.position===focusPosition)&&
    (!query||[step.recipeId,step.recipeName,...step.inputMaterials.flatMap(x=>[x.id,x.name])]
      .some(t=>String(t||'').toLocaleLowerCase('ko-KR').includes(query))));
  for(const step of displayedSteps.slice(0,200)){
    const tr=make(sBody,'tr');
    make(tr,'td',nf(step.position));
    const name=make(tr,'td');
    make(name,'strong',step.recipeName);make(name,'code',step.recipeId,'item-id');
    if(availableTaskIds.has('recipe::'+step.position)){
      const go=make(name,'button','작업표에서 확인','route-link-jump');
      go.type='button';
      go.addEventListener('click',()=>focusRouteActionTask('recipe::'+step.position));
    }
    make(tr,'td',nf(step.batches)+'회');
    make(tr,'td',step.prerequisiteStepNumbers.length?
      step.prerequisiteStepNumbers.map(n=>'#'+nf(n)).join(', '):'없음');
    const input=make(tr,'td');
    if(!step.inputMaterials.length)make(input,'span','직접 명시 재료 없음','note');
    for(const material of step.inputMaterials.slice(0,15))
      make(input,'p',(material.name||material.id)+' · '+
        (material.quantity===null?'수량 미확인':nf(material.quantity)+'개')+
        ' · '+material.status,'note');
    if(step.inputMaterials.length>15)
      make(input,'p','기타 재료 '+nf(step.inputMaterials.length-15)+'종은 JSON에 포함','note');
    make(tr,'td',nf(step.declaredCost)+' / '+nf(step.declaredTime));
  }
  if(displayedSteps.length>200)
    make(recipes,'p','검색 결과 중 처음 200개의 제조식 노드만 표시합니다. 전체 순서는 JSON/CSV에 포함됩니다.','note');
  const consumed=$('external-route-batch-workflow-consumption');consumed.replaceChildren();
  if(!workflow.stockConsumption.length)
    make(consumed,'p','현재 계산에서 재고 차감을 확인할 항목이 없습니다.','note');
  else {
    const cTable=make(consumed,'table'),cHead=make(make(cTable,'thead'),'tr');
    for(const label of ['재료','계획상 차감 수량'])make(cHead,'th',label);
    const cBody=make(cTable,'tbody');
    for(const row of workflow.stockConsumption.slice(0,100)){
      const tr=make(cBody,'tr'),cell=make(tr,'td');
      make(cell,'span',row.name);make(cell,'code',row.id,'item-id');
      make(tr,'td',nf(row.quantityFromPlannedStock)+'개');
    }
    if(workflow.stockConsumption.length>100)
      make(consumed,'p','나머지 재료의 계산상 차감량은 JSON에서 확인할 수 있습니다.','note');
  }
  make(consumed,'p','계획상 차감량에는 원래 재고와 가상 확보 재고가 모두 포함될 수 있습니다. 두 출처의 실제 소비량은 분리 판정하지 않습니다.','note');
  const changeWrap=$('external-route-batch-workflow-changes');changeWrap.replaceChildren();
  if(!workflow.recipeChanges.length)
    make(changeWrap,'p','원래 경로와 가상 확보 후 제조식의 종류·횟수 변화가 없습니다.','note');
  else {
    const cTable=make(changeWrap,'table'),cHead=make(make(cTable,'thead'),'tr');
    for(const label of ['제조식','확보 전 횟수','가상 확보 후 횟수','차이'])
      make(cHead,'th',label);
    const cBody=make(cTable,'tbody');
    for(const row of workflow.recipeChanges.slice(0,100)){
      const tr=make(cBody,'tr'),first=make(tr,'td');
      make(first,'strong',row.name);make(first,'code',row.recipeId,'item-id');
      for(const v of [row.beforeBatches,row.afterBatches,
        row.afterBatches-row.beforeBatches])make(tr,'td',nf(v));
    }
    if(workflow.recipeChanges.length>100)
      make(changeWrap,'p','나머지 변경 제조식은 JSON에서 확인할 수 있습니다.','note');
  }
  $('external-route-batch-workflow-status').textContent=
    '조달 사유별 '+nf(materials.length)+'종 검색됨 · 관련 제조식 '+
    nf(displayedSteps.length)+'개 노드 (전체 '+nf(workflow.recipeSequenceAfter.length)+
    '개). 화면 최대 200건 · 구매 가능성·게임 내 제조 실행 순서는 확인되지 않았습니다.';
  main.hidden=false;
  $('external-route-batch-workflow-csv').disabled=false;
}
function clearRouteAcquisitionLedger(){
  clearRouteActionBoard();
  clearRouteMaterialWorkflow();
  $('external-route-batch-ledger').hidden=true;
  $('external-route-batch-ledger-search').value='';
  $('external-route-batch-ledger-sort').value='quantity';
  $('external-route-batch-ledger-csv').disabled=true;
  $('external-route-batch-ledger-table').replaceChildren();
  $('external-route-batch-ledger-summary').replaceChildren();
  $('external-route-batch-ledger-status').textContent='';
}
function renderRouteAcquisitionLedger(){
  const ledger=externalRouteWorkbench?.routeBatch?.expanded?.report?.acquisitionLedger;
  if(!ledger){clearRouteAcquisitionLedger();return;}
  const container=$('external-route-batch-ledger-summary');
  container.replaceChildren();
  const summary=ledger.summary;
  metric(container,'가상 추가 확보 총계',nf(summary.materialKinds)+'종 · '+
    nf(summary.totalAcquiredUnits)+'개');
  metric(container,'최초 선택 확보 가정',nf(summary.initialUnits)+'개');
  metric(container,'후속 단계 추가 가정',nf(summary.additionalUnits)+'개');
  metric(container,'반복 후 남은 부족',nf(summary.remainingShortageKinds)+'종 · '+
    nf(summary.remainingShortageUnits)+'개');
  metric(container,'규칙상 단가 확인',nf(summary.pricedKinds)+'종 / '+
    nf(summary.materialKinds)+'종');
  metric(container,'명시 구매 참고가 합계',summary.fullReferenceSubtotal!==null?
    nf(summary.fullReferenceSubtotal):nf(summary.knownReferenceSubtotal)+
      ' (단가 없는 '+nf(summary.unpricedKinds)+'종 제외)');
  const query=$('external-route-batch-ledger-search').value.trim().toLocaleLowerCase('ko-KR');
  const sort=$('external-route-batch-ledger-sort').value;
  const focused=externalRouteWorkbench?.routeBatch?.ledgerFocusId;
  const list=ledger.materials.filter(x=>(!focused||x.id===focused)&&(!query||
    [x.id,x.name].some(s=>String(s||'').toLocaleLowerCase('ko-KR').includes(query))));
  list.sort((a,b)=>{
    if(sort==='name')return a.name.localeCompare(b.name,'ko')||a.id.localeCompare(b.id,'en');
    if(sort==='remaining')return b.remainingShortage-a.remainingShortage||
      b.totalAcquisition-a.totalAcquisition||a.id.localeCompare(b.id,'en');
    return b.totalAcquisition-a.totalAcquisition||
      b.remainingShortage-a.remainingShortage||a.id.localeCompare(b.id,'en');
  });
  const content=$('external-route-batch-ledger-table');content.replaceChildren();
  const table=make(content,'table');
  const header=make(make(table,'thead'),'tr');
  for(const title of [
    '재료','현재 입력 재고','최초 선택',
    ...ledger.stages.slice(1).map(x=>x.title),
    '후속 합계','총 추가 확보','확보 후 가상 재고','종료 시 남은 부족',
    '규칙 참고 단가','확보분 참고가'
  ])make(header,'th',title);
  const body=make(table,'tbody');
  const taskIds=new Set(routeActionState()?.board.tasks.map(x=>x.id)||[]);
  for(const item of list.slice(0,200)){
    const tr=make(body,'tr'),name=make(tr,'td');
    make(name,'strong',item.name);
    make(name,'code',item.id,'item-id');
    if(taskIds.has('material::'+item.id)){
      const go=make(name,'button','작업표에서 확인','route-link-jump');
      go.type='button';
      go.addEventListener('click',()=>focusRouteActionTask('material::'+item.id));
    }
    const workflowGo=make(name,'button','제조식의 사용처 찾기','route-link-jump');
    workflowGo.type='button';
    workflowGo.addEventListener('click',()=>focusRouteWorkflowReference(item.id));
    for(const value of [
      item.startingInventory,item.initialAcquisition,...item.rounds,
      item.totalAcquisition-item.initialAcquisition,
      item.totalAcquisition,item.hypotheticalStockTarget,item.remainingShortage,
      item.referenceUnitBuy,item.referenceSubtotal
    ])make(tr,'td',nf(value));
  }
  $('external-route-batch-ledger-status').textContent=
    '전체 '+nf(ledger.materials.length)+'종 중 '+nf(list.length)+
    '종 검색됨 · 화면에는 최대 200종 표시 · CSV에는 전체 단계별 수량을 저장합니다.'+
    ' 현재 재고는 사용자가 입력한 값이며 실제 게임 재고를 변경하지 않았습니다.';
  $('external-route-batch-ledger').hidden=false;
  $('external-route-batch-ledger-csv').disabled=false;
}
const ROUTE_BATCH_VISIBLE_LIMIT=200;
function resetRouteBatch() {
  const wb=externalRouteWorkbench;
  if(wb)wb.routeBatch={selected:new Set(),amounts:new Map(),result:null,
    expanded:null,actionReviewed:new Set(),actionNotes:new Map(),actionPage:0};
  $('external-route-batch-inputs').replaceChildren();
  $('external-route-batch-results').hidden=true;
  $('external-route-batch-trace').hidden=true;
  $('external-route-batch-trace-table').replaceChildren();
  clearRouteAcquisitionLedger();
  $('external-route-batch-summary').replaceChildren();
  $('external-route-batch-changes').replaceChildren();
  for(const id of ['all','clear','preview','expand','draft','a','b','json','csv'])
    $('external-route-batch-'+id).disabled=true;
  $('external-route-batch-status').textContent='경로를 계산하면 해당 경로의 부족 재료를 선택할 수 있습니다.';
}
function routeBatchContext() {
  const wb=externalRouteWorkbench;
  if(!wb?.calculation || !wb.routeBatch)
    throw new Error('먼저 편집한 제조 경로를 계산하세요.');
  return {
    wb,rb:wb.routeBatch,
    plan:wb.calculation.routeBaseline,
    checklist:wb.calculation.report.checklists.editedRoute
  };
}
function routeBatchInvalidate() {
  const wb=externalRouteWorkbench;
  if(!wb?.routeBatch)return;
  wb.routeBatch.result=null;
  wb.routeBatch.expanded=null;
  wb.routeBatch.actionReviewed=new Set();
  wb.routeBatch.actionNotes=new Map();
  wb.routeBatch.actionPage=0;
  wb.routeBatch.actionFocusId=null;
  wb.routeBatch.workflowFocusPosition=null;
  wb.routeBatch.ledgerFocusId=null;
  $('external-route-batch-results').hidden=true;
  clearRouteAcquisitionLedger();
  $('external-route-batch-trace').hidden=true;
  $('external-route-batch-trace-table').replaceChildren();
  $('external-route-batch-expand').disabled=true;
  for(const id of ['draft','a','b','json','csv'])
    $('external-route-batch-'+id).disabled=true;
  updateRouteBatchStatus();
}
function updateRouteBatchStatus() {
  const wb=externalRouteWorkbench;
  if(!wb?.calculation || !wb.routeBatch)return;
  const rb=wb.routeBatch,plan=wb.calculation.routeBaseline;
  $('external-route-batch-clear').disabled=!rb.selected.size;
  if(!rb.selected.size){
    $('external-route-batch-preview').disabled=true;
    $('external-route-batch-status').textContent=
      '현재 경로에서 부족한 '+nf(plan.external.length)+'종 중 확보할 재료를 선택하세요.';
    return;
  }
  try{
    const basket=prepareReadinessBatch({
      checklist:wb.calculation.report.checklists.editedRoute,
      plan,inventory:state.inventory,itemIds:state.planner.itemMap,
      selectedIds:rb.selected,requestedQuantities:rb.amounts
    });
    $('external-route-batch-preview').disabled=false;
    $('external-route-batch-status').textContent='경로 기준으로 선택한 '+
      nf(basket.selectedKinds)+'종 · '+nf(basket.selectedUnits)+
      '개를 가상 확보합니다. 기존 탐색 후보의 확보량은 합산하지 않습니다.';
  }catch(error){
    $('external-route-batch-preview').disabled=true;
    $('external-route-batch-status').textContent=
      '경로 기준 일괄 확보 입력 확인: '+error.message;
  }
}
function renderRouteBatchEditor() {
  const {wb,rb,plan}=routeBatchContext();
  const parent=$('external-route-batch-inputs');parent.replaceChildren();
  const rows=plan.external.filter(row=>{
    const base=state.inventory[row.id]||0;
    return state.planner.itemMap.has(row.id) &&
      Number.isSafeInteger(row.quantity) && row.quantity>0 &&
      Number.isSafeInteger(base) && base>=0 && base<10000000;
  });
  for(const row of rows){
    const max=Math.min(row.quantity,10000000-(state.inventory[row.id]||0));
    rb.amounts.set(row.id,max);
  }
  $('external-route-batch-all').disabled=!rows.length;
  if(!rows.length){
    make(parent,'p','현재 경로에 가상 확보 수량을 입력할 수 있는 부족 재료가 없습니다.','note');
    updateRouteBatchStatus();
    return;
  }
  const table=make(parent,'table');
  const head=make(make(table,'thead'),'tr');
  for(const text of ['선택','경로에서 부족한 재료','현재 부족','입력 재고','가상 확보 수량'])
    make(head,'th',text);
  const body=make(table,'tbody');
  for(const row of rows.slice(0,ROUTE_BATCH_VISIBLE_LIMIT)){
    const tr=make(body,'tr'),mark=make(tr,'td');
    const box=make(mark,'input');
    box.type='checkbox';box.value=row.id;box.className='route-batch-check';
    box.setAttribute('aria-label',row.name+' 경로 기준 확보 선택');
    box.addEventListener('change',()=>{
      if(box.checked)rb.selected.add(row.id);
      else rb.selected.delete(row.id);
      routeBatchInvalidate();
    });
    const material=make(tr,'td');
    make(material,'strong',row.name);
    make(material,'code',row.id,'item-id');
    make(tr,'td',nf(row.quantity)+'개');
    make(tr,'td',nf(state.inventory[row.id]||0)+'개');
    const cell=make(tr,'td'),input=make(cell,'input');
    input.type='number';input.min='1';
    input.max=String(rb.amounts.get(row.id));input.step='1';
    input.className='route-batch-amount';
    input.value=String(rb.amounts.get(row.id));
    input.setAttribute('aria-label',row.name+' 경로 기준 가상 확보 수량');
    input.addEventListener('input',()=>{
      rb.amounts.set(row.id,Number(input.value));
      routeBatchInvalidate();
    });
  }
  if(rows.length>ROUTE_BATCH_VISIBLE_LIMIT)
    make(parent,'p','화면에는 상위 '+nf(ROUTE_BATCH_VISIBLE_LIMIT)+
      '개 재료를 표시합니다. 전체 선택은 현재 경로의 검증 가능한 모든 부족 재료를 사용합니다.','note');
  updateRouteBatchStatus();
}
function effectiveRouteBatchReport(){
  const rb=externalRouteWorkbench?.routeBatch;
  return rb?.expanded?.report||rb?.result?.report||null;
}
function renderRouteBatchResult(){
  const result=effectiveRouteBatchReport();
  if(!result)return;
  const target=$('external-route-batch-summary');target.replaceChildren();
  const table=make(target,'table'),head=make(make(table,'thead'),'tr');
  for(const label of ['비교 항목','원안','제조 경로만 편집','경로 변경 + 가상 조달'])
    make(head,'th',label);
  const body=make(table,'tbody');
  for(const [title,key,suffix] of [
    ['외부 부족 종류','shortageKinds','종'],
    ['외부 부족 수량','shortageUnits','개'],
    ['명시 제조비','declaredCost',''],
    ['명시 작업량','declaredTime',''],
    ['불확실 조건','flags','건']
  ]){
    const tr=make(body,'tr');make(tr,'th',title);
    for(const plan of [result.original,result.routeOnly,result.routeAndAcquisition])
      make(tr,'td',nf(key==='flags'?plan.flags.length:plan[key])+suffix);
  }
  const changes=$('external-route-batch-changes');changes.replaceChildren();
  make(changes,'p','경로 변경과 가상 조달의 차이를 분리한 작업 목록입니다. 계산 결과에만 적용됩니다.','note');
  const rows=[
    ...result.routeOnlyChanges.added.map(x=>['경로 변경','신규 확인',x]),
    ...result.routeOnlyChanges.removed.map(x=>['경로 변경','계산에서 제외',x]),
    ...result.acquisitionChanges.added.map(x=>['가상 조달','신규 확인',x]),
    ...result.acquisitionChanges.removed.map(x=>['가상 조달','계산에서 제외',x]),
    ...result.acquisitionChanges.changed.map(x=>['가상 조달','부족량·상태 변경',x.current])
  ];
  if(rows.length){
    const table=make(changes,'table'),head=make(make(table,'thead'),'tr');
    for(const name of ['변경 단계','변화','확인 항목','현재 가상 수량'])
      make(head,'th',name);
    const tbody=make(table,'tbody');
    for(const [stage,kind,row] of rows.slice(0,100)){
      const tr=make(tbody,'tr');
      make(tr,'td',stage);make(tr,'td',kind);
      const name=make(tr,'td');
      make(name,'strong',row.title);
      make(name,'code',row.requirementId,'item-id');
      make(tr,'td',row.quantity===null?'조건 근거':nf(row.quantity)+'개');
    }
    if(rows.length>100)
      make(changes,'p',nf(rows.length-100)+'건은 JSON 결과에 포함됩니다.','note');
  }else make(changes,'p','가상 제조 확인 목록에 변동이 없습니다.','note');
  $('external-route-batch-results').hidden=false;
}
function runRouteBatch() {
  const {wb,rb}=routeBatchContext();
  rb.result=null;
  rb.expanded=null;
  rb.actionReviewed=new Set();
  rb.actionNotes=new Map();
  rb.actionPage=0;
  $('external-route-batch-results').hidden=true;
  clearRouteAcquisitionLedger();
  $('external-route-batch-trace').hidden=true;
  $('external-route-batch-trace-table').replaceChildren();
  $('external-route-batch-expand').disabled=true;
  try{
    rb.result=calculateRouteAwareReadinessBatch({
      planner:state.planner,originalPlan:state.plan,
      originalChecklist:wb.calculation.report.checklists.original,
      routeBaseline:wb.calculation.routeBaseline,
      routeChecklist:wb.calculation.report.checklists.editedRoute,
      inventory:state.inventory,choices:wb.choices,
      selectedIds:rb.selected,requestedQuantities:rb.amounts,
      batches:Number($('batches').value),maxDepth:Number($('max-depth').value),
      assumeImplicit:$('assume-implicit').checked,
      saveDiscoveredResearchIds:state.saveDiscovered,
      evidenceForPlan:evidenceForCurrentPlan
    });
    for(const id of ['draft','a','b','json','csv'])
      $('external-route-batch-'+id).disabled=false;
    $('external-route-batch-expand').disabled=!rb.result.after.external.length;
    renderRouteBatchResult();
    $('external-route-batch-status').textContent=
      '편집한 제조 경로와 가상 조달을 함께 계산했습니다. 본 계산기의 제조 경로·재고와 게임 세이브는 변경되지 않았습니다.';
    $('external-route-batch-results').scrollIntoView({behavior:'smooth',block:'nearest'});
  }catch(error){
    for(const id of ['draft','a','b','json','csv'])
      $('external-route-batch-'+id).disabled=true;
    $('external-route-batch-status').textContent='경로·조달 통합 계산 중단: '+error.message;
  }
}
function renderRouteBatchTrace() {
  const report=externalRouteWorkbench?.routeBatch?.expanded?.report;
  const root=$('external-route-batch-trace');
  root.hidden=!report;
  const parent=$('external-route-batch-trace-table');parent.replaceChildren();
  if(!report)return;
  const reasons={
    'no-unresolved-materials':'현재 계산 범위의 외부 부족 재료 0종',
    'round-limit':'반복 단계 제한 도달',
    'item-limit':'재고 아이템 종류 5,000종 제한',
    'stock-or-item-limit':'재고 종류·수량 상한 또는 목록 미확인',
    'no-progress':'추가 가능한 재료 없음'
  };
  $('external-route-batch-trace-status').textContent=
    '최초 선택 확보 '+nf(report.initialAcquired.reduce((n,row)=>n+row.quantity,0))+
    '개 + 후속 가정 '+nf(report.additionalAcquired.reduce((n,row)=>n+row.quantity,0))+
    '개 · 추가 탐색 '+nf(report.history.length)+'단계 · 종료: '+
    (reasons[report.stopped]||report.stopped)+
    ' · 남은 외부 부족 '+nf(report.remainingExternal.length)+'종. 실제 확보 가능성은 미확인입니다.';
  if(!report.history.length){
    make(parent,'p','추가 가상 확보 없이 탐색이 종료됐습니다.','note');
    return;
  }
  const table=make(parent,'table'),head=make(make(table,'thead'),'tr');
  for(const label of ['단계','단계 시작 부족','이번 단계 추가 가정',
    '새로 드러난 재료','단계 종료 부족'])make(head,'th',label);
  const body=make(table,'tbody');
  for(const stage of report.history){
    const row=make(body,'tr');
    make(row,'td',nf(stage.round));
    make(row,'td',nf(stage.shortageBefore.kinds)+'종 · '+
      nf(stage.shortageBefore.units)+'개');
    const acquired=make(row,'td');
    make(acquired,'strong',nf(stage.addedKinds)+'종 · '+nf(stage.addedUnits)+'개');
    for(const item of stage.added.slice(0,25))
      make(acquired,'p',item.name+' ('+item.id+') +'+nf(item.quantity)+'개','note');
    if(stage.added.length>25)
      make(acquired,'p','기타 '+nf(stage.added.length-25)+'종은 JSON에 포함','note');
    const exposed=make(row,'td');
    if(!stage.newlyExposed.length)make(exposed,'span','없음','note');
    for(const item of stage.newlyExposed.slice(0,25))
      make(exposed,'p',(item.name||item.id)+' '+nf(item.quantity)+'개','note');
    make(row,'td',nf(stage.shortageAfter.kinds)+'종 · '+
      nf(stage.shortageAfter.units)+'개');
  }
  if(report.remainingExternal.length){
    make(parent,'p','계산 범위에서 남은 부족 재료: '+
      report.remainingExternal.slice(0,35)
        .map(x=>x.name+' '+nf(x.quantity)+'개').join(' · ')+
      (report.remainingExternal.length>35?' · 기타 목록은 JSON 확인':''),'note');
  }
}
function expandRouteBatch(){
  const {wb,rb}=routeBatchContext();
  if(!rb.result)throw new Error('먼저 일괄 확보를 재계산하세요.');
  rb.expanded=null;
  $('external-route-batch-expand').disabled=true;
  try{
    rb.expanded=expandRouteAwareReadinessBatch({
      planner:state.planner,originalPlan:state.plan,
      originalChecklist:wb.calculation.report.checklists.original,
      routeBaseline:wb.calculation.routeBaseline,
      routeChecklist:wb.calculation.report.checklists.editedRoute,
      inventory:state.inventory,choices:wb.choices,
      selectedIds:rb.selected,requestedQuantities:rb.amounts,
      batches:Number($('batches').value),maxDepth:Number($('max-depth').value),
      assumeImplicit:$('assume-implicit').checked,
      saveDiscoveredResearchIds:state.saveDiscovered,
      evidenceForPlan:evidenceForCurrentPlan,maxRounds:4
    });
    renderRouteBatchResult();
    renderRouteBatchTrace();
    renderRouteAcquisitionLedger();
    renderRouteMaterialWorkflow();
    renderRouteActionBoard();
    $('external-route-batch-status').textContent=
      '후속 부족 재료 반복 가정을 반영했습니다. 이후 재고 초안·CSV·JSON·A/B 버튼은 누적 가상 확보량을 사용합니다. 게임 재고는 변경하지 않았습니다.';
    $('external-route-batch-trace').scrollIntoView({behavior:'smooth',block:'nearest'});
  }catch(error){
    // Keep the successful one-pass scenario available if later rounds fail.
    rb.expanded=null;
    clearRouteAcquisitionLedger();
    renderRouteBatchResult();
    $('external-route-batch-status').textContent=
      '반복 부족 계산 중단: '+error.message+' · 기존 1차 계산 결과는 유지됩니다.';
    $('external-route-batch-expand').disabled=false;
  }
}
function draftRouteBatchStock(){
  const report=effectiveRouteBatchReport();
  if(!report)throw new Error('먼저 경로·조달 통합 계산을 진행하세요.');
  const editor=$('stock-bulk-text');
  if(editor.value.trim())
    throw new Error('기존 일괄 재고 입력문이 있어 덮어쓰지 않았습니다.');
  editor.value=report.stockDraft;
  editor.closest('details').open=true;
  $('stock-message').textContent='경로 기준 가상 조달 재고를 입력문에 준비했습니다. 별도 적용 전에는 계산기 재고와 게임 세이브가 변경되지 않습니다.';
  editor.scrollIntoView({behavior:'smooth',block:'center'});
  editor.focus();
}
function storeRouteBatchScenario(slot){
  const report=effectiveRouteBatchReport();
  if(!report||!['A','B'].includes(slot))
    throw new Error('가상 계산 결과가 없습니다.');
  const scenario=report.hypotheticalScenario;
  const opposite=slot==='A'?'B':'A';
  const old=externalBasketScenarios[opposite];
  const incompatible=old && !compatibleExternalBasketBaselines(old,scenario);
  if(incompatible)externalBasketScenarios[opposite]=null;
  externalBasketScenarios[slot]=scenario;
  externalBasketComparison=null;
  $('external-basket-comparison').hidden=true;
  $('external-basket-compare-export').disabled=true;
  updateBasketScenarioControls();
  $('external-route-batch-status').textContent='편집 경로 기준 가상 조달을 '+slot+
    '에 저장했습니다. '+(incompatible?'기준 제조 경로가 다른 기존 '+opposite+
      ' 결과는 비교 오류를 막기 위해 초기화했습니다. ':'')+
    '본 계산기 재고·경로·세이브는 그대로입니다.';
}
function recalculateRouteWorkbench() {
  const wb=externalRouteWorkbench;
  if(!wb)return;
  wb.calculation=null;
  resetRouteBatch();
  for(const id of ['external-route-workbench-draft',
    'external-route-workbench-apply-choices','external-route-workbench-a',
    'external-route-workbench-b','external-route-workbench-export',
    'external-route-workbench-checklist-csv'])
    $(id).disabled=true;
  $('external-route-workbench-summary').replaceChildren();
  $('external-route-workbench-differences').replaceChildren();
  for(const id of ['external-route-workbench-checklist-summary',
    'external-route-workbench-checklist-changes',
    'external-route-workbench-checklist-table'])$(id).replaceChildren();
  for(const id of ['external-route-workbench-evidence-summary',
    'external-route-workbench-evidence-changes',
    'external-route-workbench-requirements',
    'external-route-workbench-evidence-actions'])$(id).replaceChildren();
  try{
    wb.calculation=calculateRouteWorkbench({
      planner:state.planner,candidate:wb.candidate,currentPlan:state.plan,
      inventory:state.inventory,choices:wb.choices,
      requestedQuantities:wb.amounts,selectedIds:wb.selectedIds,
      batches:Number($('batches').value),maxDepth:Number($('max-depth').value),
      assumeImplicit:$('assume-implicit').checked,
      saveDiscoveredResearchIds:state.saveDiscovered,
      baseOperations:state.baseOperations,facilitiesIndex:state.facilitiesIndex
    });
    for(const id of ['external-route-workbench-draft',
      'external-route-workbench-apply-choices','external-route-workbench-a',
      'external-route-workbench-b','external-route-workbench-export'])
      $(id).disabled=false;
    renderWorkbenchRouteChoices();
    renderWorkbenchComparison();
    renderWorkbenchEvidence();
    renderWorkbenchChecklist();
    renderRouteBatchEditor();
    const rep=wb.calculation.report;
    $('external-route-workbench-status').textContent=
      '가상 확보 '+nf(rep.additions.length)+'종 · '+
      nf(rep.additions.reduce((sum,row)=>sum+row.quantity,0))+
      '개로 재계산했습니다. 본 계산기 재고·제조 경로와 게임 세이브는 그대로입니다.';
  }catch(error){
    $('external-route-workbench-status').textContent=
      '작업대 계산 중단: '+error.message+
      ' · 현재 입력을 수정한 뒤 다시 계산하세요. 이전 결과는 저장할 수 없습니다.';
  }
}
function draftWorkbenchStock() {
  const wb=externalRouteWorkbench;
  if(!wb?.calculation)throw new Error('작업대 계산 결과가 없습니다.');
  const editor=$('stock-bulk-text');
  if(editor.value.trim())
    throw new Error('기존 일괄 재고 입력문이 있어 덮어쓰지 않았습니다.');
  editor.value=wb.calculation.report.stockDraft;
  editor.closest('details').open=true;
  $('stock-message').textContent=
    '작업대의 가상 확보 수량을 입력문으로 준비했습니다. 여러 재고 적용 버튼을 누르기 전에는 실제 재고와 게임 세이브가 변경되지 않습니다.';
  editor.scrollIntoView({behavior:'smooth',block:'center'});
  editor.focus();
}
function saveWorkbenchScenario(slot) {
  const wb=externalRouteWorkbench;
  if(!wb?.calculation || !['A','B'].includes(slot))
    throw new Error('작업대 계산 결과와 A/B 저장 위치가 필요합니다.');
  const scenario=wb.calculation.report.scenarioReport;
  const other=slot==='A'?'B':'A';
  const incompatible=externalBasketScenarios[other] &&
    !compatibleExternalBasketBaselines(externalBasketScenarios[other],scenario);
  if(incompatible)externalBasketScenarios[other]=null;
  externalBasketScenarios[slot]=scenario;
  externalBasketComparison=null;
  $('external-basket-comparison').hidden=true;
  $('external-basket-compare-export').disabled=true;
  updateBasketScenarioControls();
  $('external-route-workbench-status').textContent='작업대 결과를 '+slot+
    '에 저장했습니다. '+(incompatible?
      '경로 기준이 다른 기존 '+other+' 시나리오는 비교 오류를 막기 위해 초기화했습니다. ':
      '')+'같은 제조 경로를 기준으로 다른 확보량을 저장하면 A/B 비교할 수 있습니다.';
}
function renderExternalExploration() {
  if(!externalExploration)return;
  const exploration=externalExploration;
  const sortBy=$('external-explore-sort').value;
  const candidates=rankExternalCandidates(exploration.candidates,sortBy);
  const parent=$('external-explore-table');parent.replaceChildren();
  if(!candidates.length)
    make(parent,'p','계산 가능한 후보가 없습니다. JSON 결과에서 후보별 실패 이유를 확인할 수 있습니다.','warn-note');
  else {
    const table=make(parent,'table'),header=make(make(table,'thead'),'tr');
    for(const label of ['후보 조합','가상 확보','잔여 외부 부족','부족 수량 감소',
      '확보 1개당 감소','명시 제조비 / 작업량','시설·연구 근거','주의 항목','시나리오에 저장'])
      make(header,'th',label);
    const body=make(table,'tbody');
    const kind={single:'단일 재료',pair:'두 재료',all:'선택 전체'};
    for(const candidate of candidates){
      const tr=make(body,'tr');
      const nameCell=make(tr,'td');
      make(nameCell,'strong',kind[candidate.type]||candidate.type);
      for(const item of candidate.additions)
        make(nameCell,'p',item.name+' ('+item.id+') +'+nf(item.quantity)+'개','note');
      make(tr,'td',nf(candidate.acquiredKinds)+'종 · '+nf(candidate.acquiredUnits)+'개');
      make(tr,'td',nf(candidate.shortageKinds)+'종 · '+nf(candidate.shortageUnits)+'개');
      make(tr,'td',nf(candidate.reducedUnits)+'개');
      make(tr,'td',Number.isFinite(candidate.reductionPerAcquiredUnit)?
        candidate.reductionPerAcquiredUnit.toFixed(2):'미확인');
      make(tr,'td',nf(candidate.declaredCost)+' / '+nf(candidate.declaredTime));
      const evidenceCell=make(tr,'td');
      if(candidate.evidence){
        const e=candidate.evidence;
        const f=e.facilityCounts,r=e.researchCounts;
        make(evidenceCell,'p','시설 요구 '+nf(e.facilities.length)+
          '건 · 확인 '+nf(f.confirmed)+' · 건설 중 '+nf(f.pending),'note');
        make(evidenceCell,'p','시설 미관측 '+nf(f.notObserved)+
          ' · 근거 불명 '+nf(f.unverified),'note');
        make(evidenceCell,'p','연구 discovered '+nf(r.confirmed)+
          ' · 목록에 없음 '+nf(r.notInDiscovered)+
          ' · 미확인 '+nf(r.unverified+r.unresolved),'note');
      } else make(evidenceCell,'span','근거 미계산','note');
      make(tr,'td',nf(candidate.flagsCount)+'개');
      const actions=make(tr,'td');
      for(const slot of ['A','B']){
        const button=make(actions,'button',slot+'에 저장','secondary');
        button.type='button';
        button.setAttribute('aria-label',kind[candidate.type]+' 후보 '+slot+'에 저장');
        button.addEventListener('click',()=>{
          const scenario={
            ...candidate.report,evidence:candidate.evidence
          };
          const other=slot==='A'?'B':'A';
          if(externalBasketScenarios[other] &&
              !compatibleExternalBasketBaselines(externalBasketScenarios[other],scenario))
            externalBasketScenarios[other]=null;
          externalBasketScenarios[slot]=scenario;
          externalBasketComparison=null;
          $('external-basket-comparison').hidden=true;
          $('external-basket-compare-export').disabled=true;
          updateBasketScenarioControls();
          $('external-explore-status').textContent='선택한 후보를 시나리오 '+
            slot+'에 저장했습니다. 다른 후보를 저장한 뒤 A/B 비교 버튼을 사용할 수 있습니다.';
        });
      }
      const draft=make(actions,'button','재고 입력문 준비','secondary');
      draft.type='button';
      draft.setAttribute('aria-label',kind[candidate.type]+' 후보 재고 입력문 준비');
      draft.addEventListener('click',()=>{
        try{draftCandidateStock(candidate);}
        catch(error){$('external-explore-status').textContent='재고 입력문 준비 중단: '+error.message;}
      });
      const load=make(actions,'button','선택에 불러오기','secondary');
      load.type='button';
      load.setAttribute('aria-label',kind[candidate.type]+' 후보 선택에 불러오기');
      load.addEventListener('click',()=>{
        try{loadCandidateSelection(candidate);}
        catch(error){$('external-explore-status').textContent='후보 불러오기 중단: '+error.message;}
      });
      const work=make(actions,'button','작업대에서 경로 편집','secondary');
      work.type='button';
      work.setAttribute('aria-label',kind[candidate.type]+' 후보 작업대에서 경로 편집');
      work.addEventListener('click',()=>{
        try{openRouteWorkbench(candidate);}
        catch(error){$('external-explore-status').textContent='작업대 열기 실패: '+error.message;}
      });
    }
  }
  const truncation=exploration.omittedItems?
    ' · 선택한 '+nf(exploration.selectedTotal)+'종 중 확보 수량 상위 '+
      nf(exploration.examinedItems)+'종만 탐색':'';
  $('external-explore-status').textContent=
    '조달 조합 '+nf(exploration.candidateCount)+'개 생성 · '+nf(exploration.successes)+
    '개 계산 · 실패 '+nf(exploration.failures.length)+'개'+truncation+
    '. 순위는 부족 재료 수량 기준의 참고 정보입니다.';
  $('external-explore-results').hidden=false;
}
function runExternalExploration() {
  externalExploration=exploreExternalCandidates({
    before:state.plan,inventory:state.inventory,
    itemIds:state.planner.itemMap,selectedIds:externalBasketSelection,
    requestedQuantities:externalBasketAmounts,
    planWithInventory:inventory=>state.planner.plan(state.currentId,{
      batches:Number($('batches').value),maxDepth:Number($('max-depth').value),
      assumeImplicit:$('assume-implicit').checked,choices:state.choices,
      inventory,
      ...(state.saveDiscovered ? {saveDiscoveredResearchIds:state.saveDiscovered}: {})
    }),
    summarizeEvidence:evidenceForCurrentPlan
  });
  $('external-explore-export').disabled=false;
  renderExternalExploration();
  $('external-explore-results').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function prefillExternalBasketStock() {
  const basket=selectedExternalBasket(), input=$('stock-bulk-text');
  if(input.value.trim())throw new Error('일괄 재고 입력란에 작성된 내용이 있어 덮어쓰지 않았습니다. 내용을 적용하거나 지운 뒤 다시 선택하세요.');
  input.value=basket.additions.map(item=>item.id+'='+item.target).join('\n');
  input.closest('details').open=true;
  $('stock-message').textContent='선택한 부족 재료 '+nf(basket.selectedKinds)+
    '종을 일괄 입력란에 준비했습니다. 여러 재고 적용 버튼을 눌러야 계산기에 반영됩니다. 게임 세이브에는 영향을 주지 않습니다.';
  $('external-basket-status').textContent='재고 입력문만 준비했습니다. 계산기 재고는 그대로입니다.';
  input.scrollIntoView({behavior:'smooth',block:'center'});
  input.focus();
}
function renderExternal(plan) {
  $('external-preview').hidden=true;
  $('external-preview-summary').replaceChildren();
  $('external-preview-diff').replaceChildren();
  $('external-csv').disabled=!plan.external.length;
  externalBasketSelection.clear();
  externalBasketAmounts.clear();
  externalBasketReport=null;
  externalBasketScenarios={A:null,B:null};
  externalBasketComparison=null;
  externalExploration=null;
  externalRouteWorkbench=null;
  $('external-route-workbench').hidden=true;
  $('external-explore-results').hidden=true;
  $('external-explore-export').disabled=true;
  $('external-explore-run').disabled=true;
  $('external-basket-controls').hidden=!plan.external.length;
  $('external-basket-report').hidden=true;
  $('external-basket-comparison').hidden=true;
  $('external-basket-compare-export').disabled=true;
  $('external-basket-export').disabled=true;
  updateBasketScenarioControls();
  const parent = $('external');parent.replaceChildren();
  if (!plan.external.length){
    make(parent,'p','현재 확장 범위의 모든 재료가 하위 제조식으로 연결됐습니다. 재료 보유 여부와 실제 게임 조건은 별도입니다.','note');
    return;
  }
  const wrap=make(parent,'div',null,'table-wrap'),table=make(wrap,'table');
  const head=make(table,'thead'),hr=make(head,'tr');
  for(const title of ['재료','수량','원본 구매 단가','참고 구매가','미확장 이유','다음 작업','일괄 선택','가정 확보 수량'])make(hr,'th',title);
  const body=make(table,'tbody');
  for(const row of plan.external) {
    const tr=make(body,'tr');
    const nameCell=make(tr,'td');
    anchor(nameCell,'../../items-v2/?id='+slug(row.id),row.name);
    make(nameCell,'span',row.id,'item-id');
    make(tr,'td',nf(row.quantity));
    make(tr,'td',nf(row.listedUnitBuy));
    make(tr,'td',nf(row.listedBuySubtotal));
    make(tr,'td',row.reasons.join(', '));
    const actions=make(tr,'td');
    const safe=state.planner.itemMap.has(row.id)&&
      Number.isSafeInteger((state.inventory[row.id]||0)+row.quantity)&&
      (state.inventory[row.id]||0)+row.quantity<=10000000;
    const simulate=make(actions,'button','확보 시 변화','secondary');
    simulate.type='button';simulate.disabled=!safe;
    simulate.setAttribute('aria-label',row.name+' 확보 시 변화');
    simulate.addEventListener('click',()=>{
      try{previewExternalAcquisition(row);}
      catch(error){$('status').textContent='확보 가정 계산 실패: '+error.message;}
    });
    const enter=make(actions,'button','재고 입력','secondary');
    enter.type='button';enter.disabled=!safe;
    enter.setAttribute('aria-label',row.name+' 부족분 재고 입력');
    enter.addEventListener('click',()=>{
      try{prefillStockFromExternal(row);}
      catch(error){$('status').textContent='재고 입력 준비 실패: '+error.message;}
    });
    const basketCell=make(tr,'td',null,'external-basket-cell');
    const checkbox=make(basketCell,'input');
    checkbox.type='checkbox';checkbox.value=row.id;
    checkbox.className='external-basket-checkbox';
    checkbox.disabled=!canSelectExternalBasket(row);
    checkbox.setAttribute('aria-label',row.name+' 부족분 일괄 선택');
    if(checkbox.disabled)checkbox.title='2.1 아이템 목록 또는 재고 수량 제한으로 선택 불가';
    checkbox.addEventListener('change',()=>{
      if(checkbox.checked)externalBasketSelection.add(row.id);
      else externalBasketSelection.delete(row.id);
      updateExternalBasketControls();
    });
    const quantityCell=make(tr,'td',null,'external-basket-amount-cell');
    const amount=make(quantityCell,'input');
    amount.type='number';amount.min='1';amount.step='1';
    amount.className='external-basket-amount';
    amount.disabled=!canSelectExternalBasket(row);
    amount.max=String(Math.min(row.quantity,10000000-(state.inventory[row.id]||0)));
    amount.value=amount.max;
    amount.setAttribute('aria-label',row.name+' 가정 확보 수량');
    if(!amount.disabled)externalBasketAmounts.set(row.id,Number(amount.value));
    amount.addEventListener('input',()=>{
      externalBasketAmounts.set(row.id,Number(amount.value));
      updateExternalBasketControls();
    });
  }
  updateExternalBasketControls();
}
function renderResearch(plan){
  const parent=$('research');parent.replaceChildren();
  const r=plan.research;
  make(parent,'p','연결된 연구 ID '+nf(r.ids.length)+'개 · 미확인 ID '+nf(r.unresolved.length)+'개','note');
  if(r.saveEvidence)make(parent,'p','가져온 세이브의 discovered에서 확인 '+
    nf(r.saveEvidence.confirmed)+'개 · discovered에 없는 연구 '+
    nf(r.saveEvidence.absent)+'개. 목록에 없다고 연구 잠금 또는 미완료를 확정할 수는 없습니다.','note');
  if (r.ids.length){
    const details=make(parent,'details');
    const summary=make(details,'summary','연구 목록 펼치기 ('+nf(r.ids.length)+'개)');
    const body=make(details,'div');
    for(const row of r.ids.slice(0, 150)){
      const link=anchor(body,'../../research-v2/?id='+slug(row.id),row.name);
      if(r.saveEvidence){
        const label=make(body,'span',row.inSaveDiscovered?
          '세이브 discovered에 있음':'세이브 discovered에 없음',
          'research-save-status '+(row.inSaveDiscovered?'is-discovered':'is-absent'));
        label.title=row.id;
      }
    }
    if(r.ids.length>150)make(body,'p','처음 150개 표시 · 원본 목록은 결과 JSON에 모두 포함됩니다.','note');
  }
  if(r.unresolved.length){
    const details=make(parent,'details');
    make(details,'summary','출처 인덱스에 없는 연구 ID ('+nf(r.unresolved.length)+'개)');
    make(details,'p',r.unresolved.slice(0,100).join(' · '),'note');
  }
}
function renderWarnings(plan) {
  const parent=$('warnings');parent.replaceChildren();
  if(!plan.flags.length)make(parent,'p','현재 표시 단계에서 구조적 오류가 발견되지 않았습니다. 그러나 실제 게임에서 실행 가능하다는 뜻은 아닙니다.','note');
  else {
    for (const flag of plan.flags) make(parent,'p',flag,'warn-note');
  }
  for(const notice of plan.notices.slice(0,40))make(parent,'p',notice,'note');
  if(plan.notices.length>40)make(parent,'p','기타 '+nf(plan.notices.length-40)+'개는 JSON에 포함됩니다.','note');
  if(plan.extraOutputs.length){
    const txt=plan.extraOutputs.slice(0,20).map(x=>x.name+' '+nf(x.quantity)).join(', ');
    make(parent,'p','계산상 잉여 산출물: '+txt,'note');
  }
}
function searchInventoryItems() {
  const term=$('stock-search').value.trim().toLocaleLowerCase('ko-KR');
  const matches=state.itemEntries.filter(item =>
    !term || [item.id,item.koName,item.enName]
      .some(value=>String(value||'').toLocaleLowerCase('ko-KR').includes(term)));
  const select=$('stock-select');
  const previous=select.value;
  select.replaceChildren();
  for(const item of matches.slice(0,80)) {
    const option=make(select,'option',label(item)+' — '+item.id);
    option.value=item.id;
  }
  if([...select.options].some(x=>x.value===previous))select.value=previous;
  $('stock-message').textContent='일치하는 아이템 '+nf(matches.length)+
    '종 · 최대 80종 표시 · 입력한 재고 '+nf(Object.keys(state.inventory).length)+'종';
}
function renderInventory() {
  const parent=$('stock-list');
  parent.replaceChildren();
  const entries=Object.entries(state.inventory).sort(([a],[b])=>
    state.planner.name(a).localeCompare(state.planner.name(b),'ko'));
  if(!entries.length)make(parent,'p','입력된 보유 재고 없음 · 모든 재료는 제조 또는 외부 조달로 계산됩니다.','note');
  for(const [id,count] of entries) {
    const row=make(parent,'div',null,'stock-row');
    make(row,'span',state.planner.name(id),'stock-name');
    make(row,'code',id,'tag');
    const quantity=make(row,'input');
    quantity.type='number';quantity.min='0';quantity.max='10000000';quantity.step='1';
    quantity.value=String(count);quantity.setAttribute('aria-label',id+' 보유 재고 수량');
    quantity.addEventListener('change',()=>{
      try{updateInventory(id,Number(quantity.value));}
      catch(e){$('stock-message').textContent=e.message;quantity.value=String(state.inventory[id]);}
    });
    const remove=make(row,'button','삭제','secondary');
    remove.type='button';
    remove.setAttribute('aria-label',id+' 재고 삭제');
    remove.addEventListener('click',()=>updateInventory(id,0));
  }
  searchInventoryItems();
}
function updateInventory(id,quantity) {
  if (!state.planner?.itemMap.has(id)) throw new Error('2.1 아이템 ID를 찾을 수 없습니다: '+id);
  if (!Number.isSafeInteger(quantity)||quantity<0||quantity>10000000)
    throw new Error(id+': 0~10,000,000 사이의 정수만 입력할 수 있습니다.');
  if (!Object.hasOwn(state.inventory,id) && quantity>0 &&
      Object.keys(state.inventory).length>=5000)
    throw new Error('재고는 최대 5,000종까지 지정할 수 있습니다.');
  if (quantity>0) state.inventory[id]=quantity;
  else delete state.inventory[id];
  renderInventory();
  renderPlan();
}
function consolidatedRows(plan) {
  return plan.consolidated.filter(x=>x.demand||x.produced||
    x.remainingInventory||x.remainingProduced);
}
function renderConsolidated(plan) {
  const parent=$('consolidated');parent.replaceChildren();
  const rows=consolidatedRows(plan);
  $('consolidated-csv').disabled=!rows.length;
  if(!rows.length){make(parent,'p','현재 제조식에는 재료 소요가 선언되어 있지 않습니다.','note');return;}
  const table=make(parent,'table');
  const head=make(table,'thead'),heading=make(head,'tr');
  for(const title of ['재료','총 필요','보유 사용','생산물 재사용','제조 산출','외부 조달','보유 잔량','생산 잔량'])
    make(heading,'th',title);
  const body=make(table,'tbody');
  for(const entry of rows.slice(0,200)) {
    const tr=make(body,'tr');
    const first=make(tr,'td');
    anchor(first,'../../items-v2/?id='+slug(entry.id),entry.name);
    make(first,'code',entry.id,'item-id');
    for(const field of ['demand','initialUsed','surplusUsed','produced','external',
      'remainingInventory','remainingProduced']) make(tr,'td',nf(entry[field]));
  }
  if(rows.length>200)make(parent,'p','표는 200종만 보여 줍니다. JSON 결과에는 모두 포함됩니다.','note');
}
function renderComparison(itemId) {
  if(!state.planner || !state.currentId)return;
  const target=$('comparison-data');target.replaceChildren();
  try{
    const report=state.planner.compareAlternatives(state.currentId,itemId,{
      batches:Number($('batches').value),
      maxDepth:Number($('max-depth').value),
      assumeImplicit:$('assume-implicit').checked,
      inventory:state.inventory,choices:state.choices,limit:12,
      ...(state.saveDiscovered ? {saveDiscoveredResearchIds:state.saveDiscovered}: {})
    });
    $('comparison-title').textContent='대체 생산 경로: '+report.itemName;
    const table=make(target,'table');
    const head=make(table,'thead'),tr=make(head,'tr');
    for(const title of ['생산 경로','개당 명시 제조비','전체 제조비','전체 제조 시간',
      '미확인 조달 종류','참고 구매가 일부 합','명시 가격 합(조건부)','경로 선택'])make(tr,'th',title);
    const body=make(table,'tbody');
    for(const candidate of report.scenarios){
      const line=make(body,'tr');
      const first=make(line,'td');
      make(first,'strong',candidate.name);
      make(first,'code',candidate.recipeId,'item-id');
      make(line,'td',candidate.costPerBatch===null?'미확인':nf(candidate.costPerBatch/candidate.yieldCount));
      make(line,'td',nf(candidate.declaredManufactureCost));
      make(line,'td',nf(candidate.declaredManufactureTime));
      make(line,'td',nf(candidate.externalKinds)+'종 (단가 미확인 '+nf(candidate.unpricedExternalKinds)+'종)');
      make(line,'td',nf(candidate.knownExternalBuyReference));
      make(line,'td',candidate.declaredPlusFullyPricedReference===null?'불완전':
        nf(candidate.declaredPlusFullyPricedReference));
      const cell=make(line,'td');
      const choose=make(cell,'button','선택','secondary');choose.type='button';
      choose.addEventListener('click',()=>{
        state.choices[itemId]=candidate.recipeId;renderPlan();
      });
      if(candidate.flags.length)
        make(first,'p','제약: '+candidate.flags.slice(0,6).join(', '),'note');
    }
    if(report.truncated)make(target,'p','후보 '+nf(report.totalCandidates)+
      '개 중 명시 직접 제조비/산출량 기준 상위 '+nf(report.displayedCandidates)+
      '개만 표시합니다. 다른 후보는 위 제조식 선택창에서 직접 고를 수 있습니다.','note');
    make(target,'p',report.caveat,'note');
    $('comparison-section').hidden=false;
    $('comparison-section').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(error){
    make(target,'p',error.message,'warn-note');
    $('comparison-section').hidden=false;
  }
}
function renderOperations(plan) {
  const panel=$('base-operations');
  panel.hidden=!state.baseOperationsSummary;
  const summary=$('base-facility-summary'), orders=$('base-production-orders');
  summary.replaceChildren();orders.replaceChildren();
  if(!state.baseOperationsSummary)return;
  if(!state.baseOperations){
    $('base-operation-message').textContent='전체 기지 재고 합산 모드입니다. 서로 다른 기지의 시설 기능이나 생산 주문을 단일 공장처럼 합치지 않습니다.';
    const ul=make(summary,'ul');
    for(const entry of state.baseOperationsSummary)
      make(ul,'li',entry.name+' · 설치 시설 '+nf(entry.facilities)+'개 · 저장된 생산 주문 '+nf(entry.orders)+'개');
    return;
  }
  const base=state.baseOperations;
  const activeRecipes=new Set();
  const collect=node=>{
    if(!node||node.kind!=='recipe')return;
    activeRecipes.add(node.id);
    for(const item of node.inputs||[])for(const child of item.children||[])collect(child);
  };
  collect(plan.tree);
  $('base-operation-message').textContent='선택 기지의 시설 '+nf(base.facilities.length)+
    '개 · 등록된 제조 주문 '+nf(base.productions.length)+
    '개. 아래 평가는 저장 시설 type과 2.1 규칙의 명시된 제공 기능만 대조합니다.';
  const facilityList=make(summary,'div',null,'facility-readiness');
  const table=make(facilityList,'table');
  const head=make(table,'thead'),header=make(head,'tr');
  for(const column of ['계획 제조식','필요 시설 기능','확인된 기능','미확인/부족 기능'])
    make(header,'th',column);
  const body=make(table,'tbody');
  for(const id of activeRecipes){
    const recipe=state.planner.recipeMap.get(id);
    if(!recipe)continue;
    const info=facilityReadiness(base,state.facilitiesIndex,recipe);
    const row=make(body,'tr');
    const name=make(row,'td');
    anchor(name,'../?id='+slug(id),state.planner.name(id));
    make(row,'td',info.required.join(', ')||'명시 요구 없음');
    make(row,'td',info.required.filter(x=>info.provided.includes(x)).join(', ')||'—');
    make(row,'td',info.missing.join(', ')||'없음 (다른 요구 조건은 미확인)',
      info.missing.length?'warn-note':'note');
  }
  if(!activeRecipes.size)make(summary,'p','선택 제조식 없음','note');
  const allProvided=new Set(), unrecognised=new Set();
  for(const instance of base.facilities){
    const match=state.facilitiesIndex.facilities.find(x=>x.id===instance.type);
    if(!match){unrecognised.add(instance.type);continue;}
    if(instance.buildTime===undefined||instance.buildTime===0){
      const raw=match.fields?.provideBaseFunc;
      for(const name of Array.isArray(raw)?raw:
        typeof raw==='string'?[raw]:[])allProvided.add(name);
    }
  }
  make(summary,'p','저장된 완공/진행 정보로 확인된 제공 기능: '+
    ([...allProvided].sort().join(', ')||'명시값 없음'),'note');
  if(unrecognised.size)make(summary,'p','2.1 시설 목록에서 찾지 못한 유형: '+[...unrecognised].join(', '),'warn-note');
  const manufacture=state.manufactureIndex;
  const list=productionOrders(base,manufacture);
  if(!list.length){make(orders,'p','현재 기지에 저장된 제조 주문이 없습니다.','note');return;}
  const jobs=make(orders,'table');
  const h=make(make(jobs,'thead'),'tr');
  for(const column of ['저장된 제조 주문','배정값','주문량','spent 원본값','무한 주문','원본 규칙 일치'])
    make(h,'th',column);
  const tbody=make(jobs,'tbody');
  for(const entry of list){
    const row=make(tbody,'tr'),name=make(row,'td');
    if(entry.catalogued)anchor(name,'../?id='+slug(entry.id),entry.name);
    else make(name,'span',entry.name);
    make(name,'code',entry.id,'item-id');
    for(const value of [entry.assigned,entry.amount,entry.spent,
      entry.infinite===null?'미확인':entry.infinite?'예':'아니오',
      entry.catalogued?'확인':'2.1 DB에 없음'])
      make(row,'td',typeof value==='number'?nf(value):value??'미확인');
  }
  make(orders,'p','assigned, spent, amount는 세이브에 저장된 원본 수치입니다. 이 값만으로 남은 제조 시간, 인력 가용량 또는 완료율을 계산하지 않습니다.','note');
}
function renderPlan() {
  if(!state.planner||!state.currentId) return;
  try{
    const batchNum=Number($('batches').value);
    const depthNum=Number($('max-depth').value);
    const plan=state.planner.plan(state.currentId,{
      batches:batchNum,maxDepth:depthNum,
      assumeImplicit:$('assume-implicit').checked,choices:state.choices,
      inventory:state.inventory,
      ...(state.saveDiscovered ? {saveDiscoveredResearchIds:state.saveDiscovered}: {})
    });
    state.plan=plan;
    $('output').hidden=false;
    $('download-plan').disabled=false;
    $('plan-name').textContent=plan.rootName;
    $('plan-id').textContent=plan.rootRecipeId+' · 출처 X-Piratez v.o2';
    const summary=$('summary');summary.replaceChildren();
    metric(summary,'제조식 총 실행 횟수',nf(plan.totals.batches));
    metric(summary,'명시된 제조비 합',nf(plan.totals.declaredCost));
    metric(summary,'명시된 제조 시간 합',nf(plan.totals.declaredTime));
    metric(summary,'외부 조달 항목',nf(plan.external.length)+'종');
    metric(summary,'참고 구매가 일부 합',nf(plan.priceReference.knownBuySubtotal));
    metric(summary,'기존 재고 사용량',nf(Object.values(plan.inventory.consumed)
      .reduce((sum,n)=>sum+n,0))+'개');
    metric(summary,'남은 생산 산출물',nf(plan.extraOutputs.reduce((sum,x)=>sum+x.quantity,0))+'개');
    metric(summary,'누락·주의 유형',nf(plan.flags.length)+'개');
    $('completeness').textContent='참고 구매가는 외부 조달 재료 '+nf(plan.priceReference.totalCount)+
      '종 중 명시 단가 '+nf(plan.priceReference.pricedCount)+'종만 합산했습니다. '+
      '총 제조비+구매가를 실제 투입 금액으로 간주하지 마세요.';
    renderChoicePanel(plan);
    $('comparison-section').hidden=true;
    $('comparison-data').replaceChildren();
    $('tree').replaceChildren();
    buildTree($('tree'),plan.tree);
    renderExternal(plan);
    renderConsolidated(plan);
    renderResearch(plan);
    renderOperations(plan);
    renderMainChecklist(plan);
    queueUI?.refresh();
    renderWarnings(plan);
    $('status').textContent='제조 경로 계산 완료 · 대상 '+plan.rootRecipeId;
  }catch(e){
    // Never leave a previous plan downloadable or actionable after invalid input.
    state.plan=null;
    mainChecklist=null;
    mainChecklistReviewed.clear();
    mainBatchSelected.clear();
    mainBatchAmounts.clear();
    resetMainBatchResult();
    updateMainBatchStatus();
    $('main-readiness-csv').disabled=true;
    $('main-readiness-json').disabled=true;
    $('main-route-workbench-open').disabled=true;
    $('main-readiness-table').replaceChildren();
    $('main-readiness-status').textContent='계산 실패로 이전 확인 목록을 지웠습니다.';
    $('output').hidden=true;
    $('download-plan').disabled=true;
    $('external-csv').disabled=true;
    $('external-preview').hidden=true;
    $('external-basket-controls').hidden=true;
    $('external-basket-report').hidden=true;
    $('external-basket-comparison').hidden=true;
    externalBasketReport=null;
    externalBasketComparison=null;
    externalBasketScenarios={A:null,B:null};
    externalExploration=null;
    externalRouteWorkbench=null;
    $('external-route-workbench').hidden=true;
    $('external-explore-results').hidden=true;
    $('external-explore-export').disabled=true;
    $('external-explore-run').disabled=true;
    $('external-basket-export').disabled=true;
    $('external-basket-compare-export').disabled=true;
    $('external-basket-compare').disabled=true;
    $('consolidated-csv').disabled=true;
    $('status').textContent='제조 경로 계산 실패: '+e.message;
  }
}
$('main-batch-all').addEventListener('click',()=>{
  mainBatchSelected=new Set((mainChecklist?.tasks||[])
    .filter(row=>row.category==='material'&&mainBatchAmounts.has(row.requirementId))
    .map(row=>row.requirementId));
  invalidateMainBatch();
  paintMainChecklist();
});
$('main-batch-clear').addEventListener('click',()=>{
  mainBatchSelected.clear();
  invalidateMainBatch();
  paintMainChecklist();
});
$('main-batch-preview').addEventListener('click',runMainBatch);
$('main-batch-stock').addEventListener('click',()=>{
  try{mainBatchToStockDraft();}
  catch(error){$('main-batch-status').textContent='재고 입력문 준비 중단: '+error.message;}
});
for(const slot of ['A','B']){
  $('main-batch-'+slot.toLowerCase()).addEventListener('click',()=>{
    try{storeMainBatchScenario(slot);}
    catch(error){$('main-batch-status').textContent='시나리오 저장 중단: '+error.message;}
  });
}
$('main-batch-json').addEventListener('click',()=>{
  if(!mainBatchResult)return;
  const report=mainBatchResult.report;
  const data=JSON.stringify(report,null,2)+'\n';
  const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
  const a=document.createElement('a');
  a.href=url;
  a.download='xpiratez-v2-readiness-batch-'+report.rootRecipeId+'.json';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),500);
});
$('main-batch-csv').addEventListener('click',()=>{
  const report=mainBatchResult?.report;
  if(!report)return;
  downloadCsv([
    ['아이템 ID','이름','현재 부족','입력 재고','가상 확보','가상 재고',
      '원본 참고 단가','가정 확보분 참고가'],
    ...report.acquiredHypothetically.map(row=>[
      row.id,row.name,row.shortage,row.previous,row.quantity,row.target,
      row.listedUnitBuy,row.listedBuyReference
    ])
  ],'xpiratez-v2-acquisition-draft-'+report.rootRecipeId+'.csv');
});
$('main-batch-close').addEventListener('click',()=>{
  $('main-batch-results').hidden=true;
});
$('main-readiness-filter').addEventListener('change',paintMainChecklist);
$('main-readiness-reset').addEventListener('click',()=>{
  mainChecklistReviewed.clear();
  paintMainChecklist();
});
$('main-readiness-csv').addEventListener('click',()=>{
  if(!mainChecklist)return;
  downloadCsv(checklistCsvRows(mainChecklist),
    'xpiratez-v2-readiness-'+mainChecklist.rootRecipeId+'.csv');
});
$('main-readiness-json').addEventListener('click',()=>{
  if(!mainChecklist)return;
  downloadReadinessJson(mainChecklist,mainChecklistReviewed,
    'xpiratez-v2-readiness-'+mainChecklist.rootRecipeId+'.json');
});
$('external-route-workbench-checklist-csv').addEventListener('click',()=>{
  const checklist=externalRouteWorkbench?.calculation?.report?.checklists?.withAcquisition;
  if(!checklist)return;
  downloadCsv(checklistCsvRows(checklist),
    'xpiratez-v2-workbench-readiness-'+checklist.rootRecipeId+'.csv');
});
$('stock-search').addEventListener('input',searchInventoryItems);
$('stock-add').addEventListener('click',()=>{
  try{
    const id=$('stock-select').value;
    if(!id)throw new Error('먼저 검색 결과에서 아이템을 선택하세요.');
    updateInventory(id,Number($('stock-qty').value));
  }catch(e){$('stock-message').textContent=e.message;}
});
$('stock-clear').addEventListener('click',()=>{
  state.inventory={};renderInventory();renderPlan();
});
$('stock-bulk-apply').addEventListener('click',()=>{
  try{
    const additions={...state.inventory};
    for(const line of $('stock-bulk-text').value.split(/\r?\n/)){
      if(!line.trim()||line.trim().startsWith('#'))continue;
      const parsed=line.trim().match(/^([^\s=,]+)\s*(?:=|,|\s)\s*(\d+)$/);
      if(!parsed)throw new Error('재고 입력 형식 오류: '+line);
      const id=parsed[1],quantity=Number(parsed[2]);
      if(!state.planner.itemMap.has(id))throw new Error('등록되지 않은 2.1 아이템: '+id);
      if(!Number.isSafeInteger(quantity)||quantity>10000000)
        throw new Error('재고 수량 범위 초과: '+id);
      if(quantity>0)additions[id]=quantity;
      else delete additions[id];
    }
    if(Object.keys(additions).length>5000)throw new Error('재고는 최대 5,000종까지 지정 가능합니다.');
    state.inventory=additions;renderInventory();renderPlan();
  }catch(e){$('stock-message').textContent=e.message;}
});
$('comparison-close').addEventListener('click',()=>{$('comparison-section').hidden=true;});
$('external-preview-close').addEventListener('click',()=>{$('external-preview').hidden=true;});
$('external-basket-all').addEventListener('click',()=>{
  externalBasketSelection=new Set((state.plan?.external||[])
    .filter(canSelectExternalBasket).map(row=>row.id));
  for(const input of $('external').querySelectorAll('input.external-basket-checkbox'))
    input.checked=externalBasketSelection.has(input.value);
  updateExternalBasketControls();
});
$('external-basket-clear').addEventListener('click',()=>{
  externalBasketSelection.clear();
  for(const input of $('external').querySelectorAll('input.external-basket-checkbox'))
    input.checked=false;
  updateExternalBasketControls();
});
$('external-basket-preview').addEventListener('click',()=>{
  try{previewExternalBasket();}
  catch(error){
    externalBasketReport=null;
    $('external-basket-export').disabled=true;
    $('external-basket-report').hidden=true;
    $('external-basket-status').textContent='가상 확보 계산 실패: '+error.message;
  }
});
$('external-basket-prefill').addEventListener('click',()=>{
  try{prefillExternalBasketStock();}
  catch(error){$('external-basket-status').textContent='재고 입력문 준비 중단: '+error.message;}
});
$('external-basket-close').addEventListener('click',()=>{
  $('external-basket-report').hidden=true;
});
for(const slot of ['A','B']){
  $('external-basket-save-'+slot.toLowerCase()).addEventListener('click',()=>{
    try{saveExternalBasketScenario(slot);}
    catch(error){$('external-basket-status').textContent=
      '시나리오 '+slot+' 저장 실패: '+error.message;}
  });
}
$('external-basket-compare').addEventListener('click',()=>{
  try{renderExternalBasketComparison();}
  catch(error){
    externalBasketComparison=null;
    $('external-basket-comparison').hidden=true;
    $('external-basket-compare-export').disabled=true;
    $('external-basket-status').textContent='A/B 비교 실패: '+error.message;
  }
});
$('external-basket-compare-close').addEventListener('click',()=>{
  $('external-basket-comparison').hidden=true;
});
$('external-basket-compare-export').addEventListener('click',()=>{
  if(!externalBasketComparison)return;
  const content=JSON.stringify(externalBasketComparison,null,2)+'\n';
  const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));
  const link=document.createElement('a');
  link.href=url;
  link.download='xpiratez-v2-acquisition-a-b-'+externalBasketComparison.rootRecipeId+'.json';
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),500);
});
$('main-route-workbench-open').addEventListener('click',()=>{
  try{
    if(!state.plan)throw new Error('제조 계획을 먼저 계산하세요.');
    const row=state.plan.external.find(canSelectExternalBasket);
    if(!row)throw new Error('현재 규칙 범위에서 가상 확보 가능한 부족 재료가 없습니다.');
    const count=Math.min(row.quantity,10000000-(state.inventory[row.id]||0));
    // Use a minimal valid local candidate to open the existing route editor
    // directly from the currently selected recipe (no candidate search).
    openRouteWorkbench({
      report:{sourceVersion:'v.o2',rootRecipeId:state.plan.rootRecipeId},
      additions:[{id:row.id,quantity:count}]
    });
    $('external-route-workbench-status').textContent=
      '현재 제조 목표에서 작업대를 직접 열었습니다. 경로를 바꾸면 아래 일괄 확보 목록도 새 경로를 기준으로 갱신됩니다.';
  }catch(error){$('main-readiness-status').textContent='작업대 열기 실패: '+error.message;}
});
$('external-route-batch-all').addEventListener('click',()=>{
  try{
    const {rb,plan}=routeBatchContext();
    rb.selected=new Set(plan.external.map(row=>row.id)
      .filter(id=>rb.amounts.has(id)));
    for(const check of $('external-route-batch-inputs')
      .querySelectorAll('input.route-batch-check'))
      check.checked=rb.selected.has(check.value);
    routeBatchInvalidate();
  }catch(error){$('external-route-batch-status').textContent=error.message;}
});
$('external-route-batch-clear').addEventListener('click',()=>{
  const rb=externalRouteWorkbench?.routeBatch;
  if(!rb)return;
  rb.selected.clear();
  for(const check of $('external-route-batch-inputs')
    .querySelectorAll('input.route-batch-check'))
    check.checked=false;
  routeBatchInvalidate();
});
$('external-route-batch-preview').addEventListener('click',runRouteBatch);
$('external-route-batch-expand').addEventListener('click',expandRouteBatch);
$('external-route-batch-ledger-search').addEventListener('input',()=>{
  if(externalRouteWorkbench?.routeBatch)externalRouteWorkbench.routeBatch.ledgerFocusId=null;
  renderRouteAcquisitionLedger();
});
$('external-route-batch-ledger-sort').addEventListener('change',renderRouteAcquisitionLedger);
$('external-route-batch-workflow-filter').addEventListener('change',()=>{
  if(externalRouteWorkbench?.routeBatch)externalRouteWorkbench.routeBatch.workflowFocusPosition=null;
  renderRouteMaterialWorkflow();
});
$('external-route-batch-workflow-search').addEventListener('input',()=>{
  if(externalRouteWorkbench?.routeBatch)externalRouteWorkbench.routeBatch.workflowFocusPosition=null;
  renderRouteMaterialWorkflow();
});
$('external-route-action-filter').addEventListener('change',()=>{
  const current=routeActionState();if(current){current.rb.actionPage=0;current.rb.actionFocusId=null;}
  renderRouteActionBoard();
});
$('external-route-action-search').addEventListener('input',()=>{
  const current=routeActionState();if(current){current.rb.actionPage=0;current.rb.actionFocusId=null;}
  renderRouteActionBoard();
});
$('external-route-action-prev').addEventListener('click',()=>{
  const current=routeActionState();if(!current)return;
  current.rb.actionPage=Math.max(0,(current.rb.actionPage||0)-1);
  renderRouteActionBoard();
});
$('external-route-action-next').addEventListener('click',()=>{
  const current=routeActionState();if(!current)return;
  current.rb.actionPage=(current.rb.actionPage||0)+1;
  renderRouteActionBoard();
});
$('external-route-action-clear').addEventListener('click',()=>{
  const current=routeActionState();
  if(!current)return;
  current.rb.actionReviewed.clear();
  current.rb.actionNotes.clear();
  renderRouteActionBoard();
});
$('external-route-action-csv').addEventListener('click',()=>{
  const current=routeActionState();
  if(!current)return;
  const review=projectRouteActionBoard(current.board,{
    reviewed:current.rb.actionReviewed,notes:current.rb.actionNotes
  });
  downloadCsv(routeActionReviewCsvRows(review),
    'xpiratez-v2-route-action-review-'+review.rootRecipeId+'.csv');
});
$('external-route-action-json').addEventListener('click',exportRouteActionBoardJson);
$('external-route-action-carryover-file').addEventListener('change',async ()=>{
  const control=$('external-route-action-carryover-file');
  const file=control.files?.[0];
  if(!file)return;
  const old=routeActionState();
  const rb=old?.rb;
  if(rb)rb.actionCarryoverPreview=null;
  $('external-route-action-carryover-apply').disabled=true;
  $('external-route-action-carryover-json').disabled=true;
  $('external-route-action-carryover-csv').disabled=true;
  $('external-route-action-carryover-summary').hidden=true;
  $('external-route-action-carryover-summary').replaceChildren();
  $('external-route-action-carryover-items').hidden=true;
  $('external-route-action-carryover-items').replaceChildren();
  try{
    if(!old)throw new Error('현재 제조 작업표를 먼저 계산하세요.');
    if(file.size>12*1024*1024)
      throw new Error('검토 JSON은 12MB 이하로 제한합니다.');
    const loadId=(rb.actionCarryoverLoadId||0)+1;
    rb.actionCarryoverLoadId=loadId;
    const saved=JSON.parse(await file.text());
    if(routeActionState()?.board!==old.board ||
      rb.actionCarryoverLoadId!==loadId)
      throw new Error('파일을 읽는 동안 작업표가 변경되었습니다.');
    rb.actionCarryoverPreview=previewRouteActionCarryover(old.board,saved);
    renderRouteActionCarryoverPreview();
  }catch(error){
    $('external-route-action-carryover-status').textContent=
      '선택적 비교 중단: '+error.message+' · 기존 검토 메모는 유지됩니다.';
  }finally{control.value='';}
});
$('external-route-action-carryover-json').addEventListener('click',()=>{
  const preview=routeActionState()?.rb.actionCarryoverPreview;
  if(!preview)return;
  const audit=routeActionCarryoverAudit(preview);
  const url=URL.createObjectURL(new Blob([JSON.stringify(audit,null,2)+'\n'],
    {type:'application/json;charset=utf-8'}));
  const a=document.createElement('a');
  a.href=url;a.download='xpiratez-v2-carryover-audit-'+audit.rootRecipeId+'.json';
  a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('external-route-action-carryover-csv').addEventListener('click',()=>{
  const preview=routeActionState()?.rb.actionCarryoverPreview;
  if(!preview)return;
  downloadCsv(routeActionCarryoverAuditCsvRows(preview),
    'xpiratez-v2-carryover-audit-'+preview.rootRecipeId+'.csv');
});
$('external-route-action-carryover-apply').addEventListener('click',()=>{
  const current=routeActionState();
  const preview=current?.rb.actionCarryoverPreview;
  if(!preview)return;
  try{
    const merged=applyRouteActionCarryover(current.board,preview,{
      reviewed:current.rb.actionReviewed,notes:current.rb.actionNotes
    });
    current.rb.actionReviewed=merged.reviewed;
    current.rb.actionNotes=merged.notes;
    current.rb.actionCarryoverPreview=null;
    clearRouteActionCarryover();
    current.rb.actionPage=0;
    renderRouteActionBoard();
    $('external-route-action-carryover-status').textContent=
      '선택적 이어받기 완료: 검토 표시 '+nf(merged.counts.addedReviews)+
      '건, 메모 '+nf(merged.counts.addedNotes)+'건 추가. 기존 메모 '+
      nf(merged.counts.preservedNotes)+'건 유지, 변경·모호한 항목 '+
      nf(merged.counts.excluded)+'건 제외. 실제 게임 상태는 변경하지 않았습니다.';
  }catch(error){
    $('external-route-action-carryover-status').textContent=
      '선택적 이어받기 중단: '+error.message+
      ' · 현재 검토 기록은 변경하지 않았습니다.';
  }
});
$('external-route-action-import').addEventListener('change',async ()=>{
  const control=$('external-route-action-import');
  const file=control.files?.[0];
  if(!file)return;
  try{
    const current=routeActionState();
    if(!current)throw new Error('먼저 현재 제조 목표의 작업표를 계산하세요.');
    if(file.size>12*1024*1024)
      throw new Error('검토 JSON 파일은 12MB 이하로 제한합니다.');
    const saved=JSON.parse(await file.text());
    if(routeActionState()?.board!==current.board)
      throw new Error('파일을 읽는 동안 현재 제조 계획이 변경되었습니다.');
    const restored=restoreRouteActionReview(current.board,saved);
    current.rb.actionReviewed=restored.reviewed;
    current.rb.actionNotes=restored.notes;
    current.rb.actionPage=0;
    renderRouteActionBoard();
    $('external-route-action-import-status').textContent=
      '현재 조달·제조 작업표에 맞는 검토 메모를 불러왔습니다. '+
      nf(restored.reviewed.size)+'건 표시 · '+nf(restored.notes.size)+
      '건 메모. 실제 게임 재고·연구·제조 상태는 변경되지 않았습니다.';
  }catch(error){
    $('external-route-action-import-status').textContent=
      '검토 메모 불러오기 중단: '+error.message+
      ' · 기존 작업표와 검토 메모는 유지됩니다.';
  }finally{control.value='';}
});
$('external-route-batch-workflow-csv').addEventListener('click',()=>{
  const workflow=externalRouteWorkbench?.routeBatch?.expanded?.report?.materialWorkflow;
  if(!workflow)return;
  downloadCsv(routeMaterialWorkflowCsvRows(workflow),
    'xpiratez-v2-route-material-workflow-'+workflow.rootRecipeId+'.csv');
});
$('external-route-batch-ledger-csv').addEventListener('click',()=>{
  const ledger=externalRouteWorkbench?.routeBatch?.expanded?.report?.acquisitionLedger;
  if(!ledger)return;
  downloadCsv(routeAcquisitionLedgerCsvRows(ledger),
    'xpiratez-v2-acquisition-ledger-'+ledger.rootRecipeId+'.csv');
});
$('external-route-batch-draft').addEventListener('click',()=>{
  try{draftRouteBatchStock();}
  catch(error){$('external-route-batch-status').textContent=
    '재고 입력문 준비 중단: '+error.message;}
});
for(const slot of ['A','B']){
  $('external-route-batch-'+slot.toLowerCase()).addEventListener('click',()=>{
    try{storeRouteBatchScenario(slot);}
    catch(error){$('external-route-batch-status').textContent=
      '시나리오 저장 중단: '+error.message;}
  });
}
$('external-route-batch-json').addEventListener('click',()=>{
  const report=effectiveRouteBatchReport();
  if(!report)return;
  const text=JSON.stringify(report,null,2)+'\n';
  const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
  const a=document.createElement('a');
  a.href=url;a.download='xpiratez-v2-route-aware-batch-'+report.rootRecipeId+'.json';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),500);
});
$('external-route-batch-csv').addEventListener('click',()=>{
  const report=effectiveRouteBatchReport();
  if(!report)return;
  const startingShortage=new Map(report.editedRouteChecklist.tasks
    .filter(x=>x.category==='material').map(x=>[x.requirementId,x.quantity]));
  downloadCsv([
    ['아이템 ID','이름','경로 변경 직후 부족','입력 재고','가상 확보 수량',
      '확보 후 가상 재고','원본 참고 단가','참고 확보가'],
    ...report.acquiredHypothetically.map(x=>[
      x.id,x.name,startingShortage.get(x.id)??0,x.previous,x.quantity,x.target,
      x.listedUnitBuy,x.listedBuyReference
    ])
  ],'xpiratez-v2-route-aware-batch-'+report.rootRecipeId+'.csv');
});
$('external-route-workbench-close').addEventListener('click',()=>{
  externalRouteWorkbench=null;
  $('external-route-workbench').hidden=true;
});
$('external-route-workbench-run').addEventListener('click',recalculateRouteWorkbench);
$('external-route-workbench-draft').addEventListener('click',()=>{
  try{draftWorkbenchStock();}
  catch(error){$('external-route-workbench-status').textContent='재고 입력문 준비 중단: '+error.message;}
});
$('external-route-workbench-apply-choices').addEventListener('click',()=>{
  if(!externalRouteWorkbench?.calculation)return;
  state.choices={...externalRouteWorkbench.choices};
  renderPlan();
  $('status').textContent='선택한 제조 경로를 본 계산기에 적용했습니다. 보유 재고와 원본 세이브는 변경하지 않았습니다.';
});
for(const slot of ['A','B']){
  $('external-route-workbench-'+slot.toLowerCase()).addEventListener('click',()=>{
    try{saveWorkbenchScenario(slot);}
    catch(error){$('external-route-workbench-status').textContent=
      '작업대 결과 '+slot+' 저장 실패: '+error.message;}
  });
}
$('external-route-workbench-export').addEventListener('click',()=>{
  if(!externalRouteWorkbench?.calculation)return;
  const report=externalRouteWorkbench.calculation.report;
  const content=JSON.stringify(report,null,2)+'\n';
  const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));
  const link=document.createElement('a');
  link.href=url;
  link.download='xpiratez-v2-route-workbench-'+report.rootRecipeId+'.json';
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),500);
});
$('external-explore-run').addEventListener('click',()=>{
  try{runExternalExploration();}
  catch(error){
    externalExploration=null;
    $('external-explore-results').hidden=true;
    $('external-explore-export').disabled=true;
    $('external-explore-status').textContent='조합 탐색 실패: '+error.message;
  }
});
$('external-explore-sort').addEventListener('change',()=>{
  if(externalExploration)renderExternalExploration();
});
$('external-explore-close').addEventListener('click',()=>{
  $('external-explore-results').hidden=true;
});
$('external-explore-export').addEventListener('click',()=>{
  if(!externalExploration)return;
  const exportReport={
    ...externalExploration,
    candidates:rankExternalCandidates(externalExploration.candidates,
      $('external-explore-sort').value),
    sortBy:$('external-explore-sort').value
  };
  const content=JSON.stringify(exportReport,null,2)+'\n';
  const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));
  const link=document.createElement('a');
  link.href=url;
  link.download='xpiratez-v2-procurement-combinations-'+exportReport.rootRecipeId+'.json';
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),500);
});
$('external-basket-export').addEventListener('click',()=>{
  if(!externalBasketReport)return;
  const content=JSON.stringify(externalBasketReport,null,2)+'\n';
  const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));
  const link=document.createElement('a');
  link.href=url;link.download='xpiratez-v2-acquisition-basket-'+externalBasketReport.rootRecipeId+'.json';
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),500);
});
$('recipe-search').addEventListener('input',searchChoices);
$('recipe-select').addEventListener('change',event=>chooseRecipe(event.target.value));
$('recalculate').addEventListener('click',renderPlan);
$('batches').addEventListener('change',renderPlan);
$('max-depth').addEventListener('change',renderPlan);
$('assume-implicit').addEventListener('change',()=>{state.choices={};renderPlan();});
function downloadCsv(rows, filename) {
  // UTF-8 BOM for Korean spreadsheets, CRLF and formula-injection escaping.
  const cell=value=>{
    const raw=String(value??'');
    const safe=/^[\s]*[=+@-]/.test(raw)?"'"+raw:raw;
    return '"'+safe.replace(/"/g,'""')+'"';
  };
  const csv='\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');
  a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),500);
}
$('consolidated-csv').addEventListener('click',()=>{
  if(!state.plan)return;
  const rows=consolidatedRows(state.plan);
  if(!rows.length)return;
  downloadCsv([
    ['아이템 ID','이름','총 필요','보유 사용','생산물 재사용','제조 산출','외부 조달','보유 잔량','생산 잔량'],
    ...rows.map(x=>[x.id,x.name,x.demand,x.initialUsed,x.surplusUsed,x.produced,
      x.external,x.remainingInventory,x.remainingProduced])
  ],'xpiratez-v2-materials-'+state.plan.rootRecipeId+'.csv');
});
$('external-csv').addEventListener('click',()=>{
  if(!state.plan?.external?.length)return;
  downloadCsv([
    ['아이템 ID','이름','필요 수량','원본 구매 단가','참고 구매가','미확장 이유'],
    ...state.plan.external.map(x=>[x.id,x.name,x.quantity,x.listedUnitBuy,
      x.listedBuySubtotal,x.reasons.join('; ')])
  ],'xpiratez-v2-external-'+state.plan.rootRecipeId+'.csv');
});
$('download-plan').addEventListener('click',()=>{
  if(!state.plan)return;
  const text=JSON.stringify(state.plan,null,2)+'\n';
  const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
  const a=document.createElement('a');
  a.href=url;a.download='xpiratez-v2-manufacture-plan-'+state.plan.rootRecipeId+'.json';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),500);
});
try{
  const responses=await Promise.all([
    fetch('../../data/manufacture-v2-index.json',{cache:'no-store'}),
    fetch('../../data/research-v2-index.json',{cache:'no-store'}),
    fetch('../../data/items-v2-index.json',{cache:'no-store'}),
    fetch('../../data/facilities-v2-index.json',{cache:'no-store'})
  ]);
  if(responses.some(x=>!x.ok))throw new Error('2.1 데이터 파일 HTTP 오류');
  const [manufacture,research,items,facilities]=await Promise.all(responses.map(x=>x.json()));
  if(facilities.meta?.schema!=='xpiratez-v2-mod-facilities/v1'||
    facilities.meta?.sourceVersion!=='v.o2' ||
    JSON.stringify(facilities.meta.sourceFiles)!==JSON.stringify(manufacture.meta.sourceFiles))
      throw new Error('시설 데이터의 2.1 규칙 출처가 제조 DB와 일치하지 않습니다.');
  state.facilitiesIndex=facilities;
  state.manufactureIndex=manufacture;
  state.planner=createManufacturingPlanner({manufacture,research,items});
  state.recipes=manufacture.entries;
  state.itemEntries=items.items;
  queueUI=initQueueUI({
    planner:state.planner,manufactureIndex:manufacture,facilitiesIndex:facilities,
    current:()=>({baseOperations:state.baseOperations,rootRecipeId:state.currentId,
      batches:Number($('batches').value),maxDepth:Number($('max-depth').value),
      inventory:state.inventory,choices:state.choices,
      assumeImplicit:$('assume-implicit').checked,saveDiscovered:state.saveDiscovered})
  });
  initV2SaveImportUI({
    itemIds:new Set(items.items.map(item=>item.id)),
    researchIds:new Set(research.entries.map(topic=>topic.id)),
    onApply:({inventory,discoveredResearchIds,operations,baseOperationsSummary})=>{
      state.inventory={...inventory};
      state.saveDiscovered=discoveredResearchIds;
      state.baseOperations=operations;
      state.baseOperationsSummary=baseOperationsSummary;
      renderInventory();renderPlan();
    },
    onDisconnect:()=>{
      state.saveDiscovered=null;
      state.baseOperations=null;
      state.baseOperationsSummary=null;
      renderPlan();
    }
  });
  $('save-file').disabled=false;
  renderInventory();
  const id=new URL(location.href).searchParams.get('id');
  const defaultId=state.planner.recipeMap.has(id)?id:
    state.planner.recipeMap.has('STR_3RL_HE_XXX')?'STR_3RL_HE_XXX':state.recipes[0].id;
  chooseRecipe(defaultId);
}catch(error){
  $('status').textContent='2.1 데이터 로드 실패: '+error.message;
}
