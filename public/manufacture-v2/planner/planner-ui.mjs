import { createManufacturingPlanner } from './planner-core.mjs';
import { initV2SaveImportUI } from './save-import-ui.mjs';
import { facilityReadiness, productionOrders } from './save-operations-core.mjs';
import { initQueueUI } from './queue-ui.mjs';
import { initBaseComparisonUI } from './base-comparison-ui.mjs';

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
let saveImportUI = null;
let baseComparisonUI = null;
const state = { planner: null, recipes: [], currentId: null, choices: {},
  inventory: {}, itemEntries: [], plan: null, saveDiscovered: null,
  baseOperations: null, baseOperationsSummary: null, facilitiesIndex: null,
  manufactureIndex: null, saveBases: null, selectedBaseIndex: null };
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
function renderExternal(plan) {
  const parent = $('external');parent.replaceChildren();
  if (!plan.external.length){
    make(parent,'p','현재 확장 범위의 모든 재료가 하위 제조식으로 연결됐습니다. 재료 보유 여부와 실제 게임 조건은 별도입니다.','note');
    return;
  }
  const wrap=make(parent,'div',null,'table-wrap'),table=make(wrap,'table');
  const head=make(table,'thead'),hr=make(head,'tr');
  for(const title of ['재료','수량','원본 구매 단가','참고 구매가','미확장 이유'])make(hr,'th',title);
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
  }
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
function renderConsolidated(plan) {
  const parent=$('consolidated');parent.replaceChildren();
  const rows=plan.consolidated.filter(x=>x.demand||x.produced||
    x.remainingInventory||x.remainingProduced);
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
    if(instance.buildTime===undefined||instance.buildTime===0)
      for(const name of match.fields.provideBaseFunc||[])allProvided.add(name);
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
    baseComparisonUI?.refresh();
    queueUI?.refresh();
    renderWarnings(plan);
    $('status').textContent='제조 경로 계산 완료 · 대상 '+plan.rootRecipeId;
  }catch(e){
    $('status').textContent='제조 경로 계산 실패: '+e.message;
  }
}
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
$('recipe-search').addEventListener('input',searchChoices);
$('recipe-select').addEventListener('change',event=>chooseRecipe(event.target.value));
$('recalculate').addEventListener('click',renderPlan);
$('batches').addEventListener('change',renderPlan);
$('max-depth').addEventListener('change',renderPlan);
$('assume-implicit').addEventListener('change',()=>{state.choices={};renderPlan();});
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
  baseComparisonUI=initBaseComparisonUI({
    planner:state.planner,facilitiesIndex:facilities,
    getState:()=>({bases:state.saveBases,selectedBaseIndex:state.selectedBaseIndex,
      recipeId:state.currentId,batches:Number($('batches').value),
      maxDepth:Number($('max-depth').value),choices:state.choices,
      assumeImplicit:$('assume-implicit').checked,
      ...(state.saveDiscovered!==null?
        {saveDiscoveredResearchIds:state.saveDiscovered}:{})}),
    applyBase:index=>saveImportUI.selectBase(index)
  });
  saveImportUI=initV2SaveImportUI({
    itemIds:new Set(items.items.map(item=>item.id)),
    researchIds:new Set(research.entries.map(topic=>topic.id)),
    onApply:({inventory,discoveredResearchIds,operations,baseOperationsSummary,
      bases,selectedBaseIndex})=>{
      state.inventory={...inventory};
      state.saveDiscovered=discoveredResearchIds;
      state.baseOperations=operations;
      state.baseOperationsSummary=baseOperationsSummary;
      state.saveBases=bases;
      state.selectedBaseIndex=selectedBaseIndex;
      renderInventory();renderPlan();
    },
    onDisconnect:()=>{
      state.saveDiscovered=null;
      state.baseOperations=null;
      state.baseOperationsSummary=null;
      state.saveBases=null;
      state.selectedBaseIndex=null;
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
