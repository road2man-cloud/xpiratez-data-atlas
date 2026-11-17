import { createManufacturingPlanner } from './planner-core.mjs';

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
const state = { planner: null, recipes: [], currentId: null, choices: {}, plan: null };
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
  'node-budget': '계산 노드 상한 도달'
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
    make(line,'span','필요 '+nf(item.quantity)+'개','tree-subtitle');
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
  if (r.ids.length){
    const details=make(parent,'details');
    const summary=make(details,'summary','연구 목록 펼치기 ('+nf(r.ids.length)+'개)');
    const body=make(details,'div');
    for(const row of r.ids.slice(0, 150)){
      anchor(body,'../../research-v2/?id='+slug(row.id),row.name);
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
function renderPlan() {
  if(!state.planner||!state.currentId) return;
  try{
    const batchNum=Number($('batches').value);
    const depthNum=Number($('max-depth').value);
    const plan=state.planner.plan(state.currentId,{
      batches:batchNum,maxDepth:depthNum,
      assumeImplicit:$('assume-implicit').checked,choices:state.choices
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
    metric(summary,'누락·주의 유형',nf(plan.flags.length)+'개');
    $('completeness').textContent='참고 구매가는 외부 조달 재료 '+nf(plan.priceReference.totalCount)+
      '종 중 명시 단가 '+nf(plan.priceReference.pricedCount)+'종만 합산했습니다. '+
      '총 제조비+구매가를 실제 투입 금액으로 간주하지 마세요.';
    renderChoicePanel(plan);
    $('tree').replaceChildren();
    buildTree($('tree'),plan.tree);
    renderExternal(plan);
    renderResearch(plan);
    renderWarnings(plan);
    $('status').textContent='제조 경로 계산 완료 · 대상 '+plan.rootRecipeId;
  }catch(e){
    $('status').textContent='제조 경로 계산 실패: '+e.message;
  }
}
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
    fetch('../../data/items-v2-index.json',{cache:'no-store'})
  ]);
  if(responses.some(x=>!x.ok))throw new Error('2.1 데이터 파일 HTTP 오류');
  const [manufacture,research,items]=await Promise.all(responses.map(x=>x.json()));
  state.planner=createManufacturingPlanner({manufacture,research,items});
  state.recipes=manufacture.entries;
  const id=new URL(location.href).searchParams.get('id');
  const defaultId=state.planner.recipeMap.has(id)?id:
    state.planner.recipeMap.has('STR_3RL_HE_XXX')?'STR_3RL_HE_XXX':state.recipes[0].id;
  chooseRecipe(defaultId);
}catch(error){
  $('status').textContent='2.1 데이터 로드 실패: '+error.message;
}
