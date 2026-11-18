import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root=path.resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8'};
const server=http.createServer((req,res)=>{
  try {
    const u=new URL(req.url,'http://localhost');
    let name=path.resolve(root,'.'+decodeURIComponent(u.pathname));
    if(name!==root&&!name.startsWith(root+path.sep))throw new Error('Forbidden');
    if(fs.statSync(name).isDirectory())name=path.join(name,'index.html');
    res.writeHead(200,{'Content-Type':mime[path.extname(name)]||'application/octet-stream'});
    fs.createReadStream(name).pipe(res);
  }catch{res.writeHead(404).end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  const choices=['C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/chromium',chromium.executablePath()];
  const executablePath=choices.find(x=>x&&fs.existsSync(x));
  if(!executablePath)throw new Error('Chrome or Edge missing');
  browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-gpu']});
  const page=await browser.newPage({viewport:{width:1250,height:850}});
  const errors=[];
  page.on('pageerror',error=>errors.push('pageerror '+error.message));
  page.on('response',r=>{if(r.status()>=400)errors.push('HTTP '+r.status()+' '+r.url());});
  const host='http://127.0.0.1:'+server.address().port;
  await page.goto(host+'/manufacture-v2/planner/?id=STR_3RL_HE_XXX',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('계산 완료'),null,{timeout:20000});
  assert((await page.locator('#plan-id').innerText()).includes('STR_3RL_HE_XXX'));
  assert(await page.locator('#main-readiness').isVisible());
  assert(await page.locator('#main-readiness-json').isEnabled());
  assert(await page.locator('#main-readiness-csv').isEnabled());
  assert((await page.locator('#main-readiness-status').innerText()).includes('재료'));
  assert((await page.locator('#main-readiness-table').innerText()).includes('재고 입력 준비'));
  const mainRows=await page.locator('#main-readiness-table tbody tr').count();
  assert(mainRows>=1);
  await page.locator('#main-readiness-filter').selectOption('material');
  const materialRows=await page.locator('#main-readiness-table tbody tr').count();
  assert(materialRows>=1 && materialRows<=mainRows);
  const review=page.locator('#main-readiness-table .readiness-review').first();
  await review.check();
  assert((await page.locator('#main-readiness-status').innerText()).includes('개인 검토 표시 1건'));
  const readinessDownload=page.waitForEvent('download');
  await page.locator('#main-readiness-json').click();
  const readinessFile=await readinessDownload;
  assert.equal(readinessFile.suggestedFilename(),'xpiratez-v2-readiness-STR_3RL_HE_XXX.json');
  const readinessJson=JSON.parse(fs.readFileSync(await readinessFile.path(),'utf8'));
  assert.equal(readinessJson.schema,'xpiratez-v2-single-goal-readiness-checklist/v1');
  assert.equal(readinessJson.rootRecipeId,'STR_3RL_HE_XXX');
  assert.equal(readinessJson.locallyReviewedKeys.length,1);
  assert(readinessJson.tasks.length>=mainRows);
  const readinessCsvDownload=page.waitForEvent('download');
  await page.locator('#main-readiness-csv').click();
  const readinessCsvFile=await readinessCsvDownload;
  assert.equal(readinessCsvFile.suggestedFilename(),'xpiratez-v2-readiness-STR_3RL_HE_XXX.csv');
  const readinessCsv=fs.readFileSync(await readinessCsvFile.path(),'utf8');
  assert(readinessCsv.startsWith('\uFEFF"확인 순서","종류"'));
  assert(readinessCsv.includes('STR_'));
  await page.locator('#main-readiness-reset').click();
  assert((await page.locator('#main-readiness-status').innerText()).includes('개인 검토 표시 0건'));
  await page.locator('#main-readiness-filter').selectOption('all');
  assert.equal(await page.locator('#main-readiness-table tbody tr').count(),mainRows);
  await page.locator('#main-batch-all').click();
  const mainSelectedCount=await page.locator('#main-readiness-table .main-batch-check:checked').count();
  assert(mainSelectedCount>=1);
  assert(await page.locator('#main-batch-preview').isEnabled());
  const mainFirstAmount=page.locator('#main-readiness-table .main-batch-amount:not([disabled])').first();
  const mainFirstValid=await mainFirstAmount.inputValue();
  await mainFirstAmount.fill('0');
  assert(await page.locator('#main-batch-preview').isDisabled());
  assert((await page.locator('#main-batch-status').innerText()).includes('확보 수량 확인'));
  await mainFirstAmount.fill(mainFirstValid);
  assert(await page.locator('#main-batch-preview').isEnabled());
  await page.locator('#main-batch-preview').click();
  assert(await page.locator('#main-batch-results').isVisible());
  assert((await page.locator('#main-batch-summary').innerText()).includes('재료 부족'));
  assert((await page.locator('#main-batch-status').innerText()).includes('기존 재고는 변경하지 않았습니다'));
  assert(await page.locator('#main-batch-json').isEnabled());
  const mainBatchDownload=page.waitForEvent('download');
  await page.locator('#main-batch-json').click();
  const mainBatchFile=await mainBatchDownload;
  assert.equal(mainBatchFile.suggestedFilename(),
    'xpiratez-v2-readiness-batch-STR_3RL_HE_XXX.json');
  const mainBatchJson=JSON.parse(fs.readFileSync(await mainBatchFile.path(),'utf8'));
  assert.equal(mainBatchJson.schema,'xpiratez-v2-readiness-acquisition-batch/v1');
  assert.equal(mainBatchJson.acquiredHypothetically.length,mainSelectedCount);
  assert((await page.locator('#main-batch-items').innerText()).includes('가상 재고'));
  assert(mainBatchJson.acquiredHypothetically.every(x=>
    Number.isSafeInteger(x.target)&&x.target===x.previous+x.quantity));
  assert.equal(mainBatchJson.checklistAfter.schema,'xpiratez-v2-single-goal-readiness-checklist/v1');
  assert.equal(mainBatchJson.hypotheticalScenario.schema,
    'xpiratez-v2-single-recipe-acquisition-basket/v1');
  assert((await page.locator('#stock-list').innerText()).includes('입력된 보유 재고 없음'));
  const mainBatchCsvDownload=page.waitForEvent('download');
  await page.locator('#main-batch-csv').click();
  const mainBatchCsvFile=await mainBatchCsvDownload;
  assert.equal(mainBatchCsvFile.suggestedFilename(),
    'xpiratez-v2-acquisition-draft-STR_3RL_HE_XXX.csv');
  const mainBatchCsv=fs.readFileSync(await mainBatchCsvFile.path(),'utf8');
  assert(mainBatchCsv.startsWith('\uFEFF"아이템 ID","이름","현재 부족"'));
  assert(mainBatchCsv.includes('"가상 확보"'));
  assert(mainBatchCsv.includes('STR_'));
  await page.locator('#main-batch-stock').click();
  assert.equal(await page.locator('#stock-bulk-text').inputValue(),mainBatchJson.stockDraft);
  await page.locator('#main-batch-stock').click();
  assert((await page.locator('#main-batch-status').innerText()).includes('덮어쓰지 않았습니다'));
  assert.equal(await page.locator('#stock-bulk-text').inputValue(),mainBatchJson.stockDraft);
  await page.locator('#stock-bulk-text').fill('');
  await page.locator('#main-batch-a').click();
  await page.locator('#main-batch-b').click();
  assert(await page.locator('#external-basket-compare').isEnabled());
  await page.locator('#main-batch-clear').click();
  assert(await page.locator('#main-batch-preview').isDisabled());
  assert(await page.locator('#main-batch-json').isDisabled());
  assert(await page.locator('#main-batch-results').isHidden());
  assert((await page.locator('#tree').innerText()).includes('화학물질'));
  assert(await page.locator('#choice-panel').isVisible());
  const chemical=page.locator('select[aria-label*="화학물질 조달 방법"]');
  assert(await chemical.count()===1);
  await chemical.selectOption('STR_CHEMICALS_XXX');
  await page.waitForFunction(()=>document.querySelector('#tree')?.textContent?.includes('STR_CHEMICALS_XXX'),null,{timeout:20000});
  assert((await page.locator('#tree').innerText()).includes('하위 제조'));
  await page.locator('#batches').fill('3');
  await page.locator('#recalculate').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('계산 완료'));
  assert((await page.locator('#tree').innerText()).includes('3회 · 제조비 30,000'));
  assert((await page.locator('#summary').innerText()).includes('명시된 제조비 합'));
  assert(await page.locator('#download-plan').isEnabled());
  assert(await page.locator('#consolidated-csv').isEnabled());
  const materialsDownload=page.waitForEvent('download');
  await page.locator('#consolidated-csv').click();
  const materialsFile=await materialsDownload;
  assert.equal(materialsFile.suggestedFilename(),'xpiratez-v2-materials-STR_3RL_HE_XXX.csv');
  const materialsCsv=fs.readFileSync(await materialsFile.path(),'utf8');
  assert(materialsCsv.startsWith('\uFEFF"아이템 ID","이름","총 필요"'));
  assert(materialsCsv.includes('"STR_CHEMICALS"'));
  assert(materialsCsv.includes('\r\n'));
  await chemical.selectOption('external');
  assert(await page.locator('#external-csv').isEnabled());
  const externalDownload=page.waitForEvent('download');
  await page.locator('#external-csv').click();
  const externalFile=await externalDownload;
  assert.equal(externalFile.suggestedFilename(),'xpiratez-v2-external-STR_3RL_HE_XXX.csv');
  const externalCsv=fs.readFileSync(await externalFile.path(),'utf8');
  assert(externalCsv.startsWith('\uFEFF"아이템 ID","이름"'));
  assert(externalCsv.includes('STR_'));
  assert(externalCsv.includes('\r\n'));
  assert(await page.locator('#external-basket-controls').isVisible());
  const basketChoices=page.locator('#external input.external-basket-checkbox:not([disabled])');
  assert((await basketChoices.count())>=1);
  const basketCount=await basketChoices.count();
  await page.locator('#external-basket-all').click();
  assert.equal(await page.locator('#external input.external-basket-checkbox:checked').count(),basketCount);
  assert(await page.locator('#external-basket-preview').isEnabled());
  await page.locator('#external-basket-preview').click();
  assert(await page.locator('#external-basket-report').isVisible());
  assert((await page.locator('#external-basket-summary').innerText()).includes('외부 부족 수량'));
  assert((await page.locator('#external-basket-status').innerText()).includes('세이브는 수정하지 않았습니다'));
  assert((await page.locator('#stock-list').innerText()).includes('입력된 보유 재고 없음'));
  assert(await page.locator('#external-basket-export').isEnabled());
  const basketDownload=page.waitForEvent('download');
  await page.locator('#external-basket-export').click();
  const basketFile=await basketDownload;
  assert.equal(basketFile.suggestedFilename(),
    'xpiratez-v2-acquisition-basket-STR_3RL_HE_XXX.json');
  const basketJson=JSON.parse(fs.readFileSync(await basketFile.path(),'utf8'));
  assert.equal(basketJson.schema,'xpiratez-v2-single-recipe-acquisition-basket/v1');
  assert.equal(basketJson.acquiredHypothetically.length,basketCount);
  assert.equal(basketJson.sourceVersion,'v.o2');
  const chemicalBasketRow=page.locator('#external tbody tr')
    .filter({hasText:'STR_CHEMICALS'}).first();
  const chemicalFull=Number((await chemicalBasketRow.locator('td').nth(1)
    .innerText()).replaceAll(',',''));
  assert(chemicalFull>1);
  const chemicalPartial=Math.max(1,Math.floor(chemicalFull/2));
  const chemicalAmount=chemicalBasketRow.locator('input.external-basket-amount');
  await chemicalAmount.fill('0');
  assert(await page.locator('#external-basket-save-a').isDisabled());
  assert((await page.locator('#external-basket-status').innerText()).includes('수량 확인'));
  await chemicalAmount.fill(String(chemicalPartial));
  assert(await page.locator('#external-basket-save-a').isEnabled());
  await page.locator('#external-basket-save-a').click();
  assert((await page.locator('#external-basket-scenarios-status').innerText()).includes('A:'));
  await chemicalAmount.fill(String(chemicalFull));
  await page.locator('#external-basket-save-b').click();
  assert(await page.locator('#external-basket-compare').isEnabled());
  await page.locator('#external-basket-compare').click();
  assert(await page.locator('#external-basket-comparison').isVisible());
  assert((await page.locator('#external-basket-compare-summary').innerText()).includes('남은 외부 부족'));
  assert((await page.locator('#external-basket-compare-materials').innerText()).includes('STR_CHEMICALS'));
  assert(await page.locator('#external-basket-compare-export').isEnabled());
  const abDownload=page.waitForEvent('download');
  await page.locator('#external-basket-compare-export').click();
  const abFile=await abDownload;
  assert.equal(abFile.suggestedFilename(),
    'xpiratez-v2-acquisition-a-b-STR_3RL_HE_XXX.json');
  const abData=JSON.parse(fs.readFileSync(await abFile.path(),'utf8'));
  assert.equal(abData.schema,'xpiratez-v2-single-recipe-acquisition-scenarios/v1');
  assert.equal(abData.sourceVersion,'v.o2');
  assert(abData.scenarioB.acquiredUnits>abData.scenarioA.acquiredUnits);
  assert.equal(abData.acquiredHypotheticallyA.find(x=>x.id==='STR_CHEMICALS').quantity,
    chemicalPartial);
  assert.equal(abData.acquiredHypotheticallyB.find(x=>x.id==='STR_CHEMICALS').quantity,
    chemicalFull);
  assert(await page.locator('#external-explore-run').isEnabled());
  await page.locator('#external-explore-run').click();
  assert(await page.locator('#external-explore-results').isVisible());
  const exploredRows=page.locator('#external-explore-table tbody tr');
  const exploredCount=await exploredRows.count();
  assert(exploredCount>=1 && exploredCount<=22);
  assert((await page.locator('#external-explore-status').innerText()).includes('조달 조합'));
  await page.locator('#external-explore-sort').selectOption('efficiency');
  assert.equal(await exploredRows.count(),exploredCount);
  await exploredRows.first().getByRole('button',{name:'A에 저장'}).click();
  await exploredRows.last().getByRole('button',{name:'B에 저장'}).click();
  assert(await page.locator('#external-basket-compare').isEnabled());
  await page.locator('#external-basket-compare').click();
  assert(await page.locator('#external-basket-comparison').isVisible());
  assert(await page.locator('#external-explore-export').isEnabled());
  const exploreDownload=page.waitForEvent('download');
  await page.locator('#external-explore-export').click();
  const exploreFile=await exploreDownload;
  assert.equal(exploreFile.suggestedFilename(),
    'xpiratez-v2-procurement-combinations-STR_3RL_HE_XXX.json');
  const exploreData=JSON.parse(fs.readFileSync(await exploreFile.path(),'utf8'));
  assert.equal(exploreData.schema,'xpiratez-v2-single-recipe-procurement-explorer/v1');
  assert.equal(exploreData.sourceVersion,'v.o2');
  assert.equal(exploreData.sortBy,'efficiency');
  assert.equal(exploreData.successes,exploredCount);
  assert(exploreData.candidates.every(x=>x.report.rootRecipeId==='STR_3RL_HE_XXX'));
  assert(exploreData.candidates.every(x=>x.evidence.schema==='xpiratez-v2-route-evidence/v1'));
  assert(exploreData.candidates.every(x=>x.evidence.facilityEvidenceSource==='no-single-base-selected'));
  assert((await page.locator('#external-explore-table').innerText()).includes('시설 요구'));
  assert((await page.locator('#stock-list').innerText()).includes('입력된 보유 재고 없음'));
  await exploredRows.first().getByRole('button',{name:/후보 작업대에서 경로 편집/}).click();
  assert(await page.locator('#external-route-workbench').isVisible());
  assert((await page.locator('#external-route-workbench-summary').innerText()).includes('경로 편집 + 가상 확보'));
  assert((await page.locator('#external-route-workbench-status').innerText()).includes('게임 세이브는 그대로'));
  assert((await page.locator('#external-route-workbench-evidence-summary').innerText()).includes('시설 근거'));
  assert((await page.locator('#external-route-workbench-evidence-summary').innerText()).includes('연구 근거'));
  assert((await page.locator('#external-route-workbench-requirements').innerText()).includes('STR_3RL_HE_XXX'));
  assert((await page.locator('#external-route-workbench-evidence-actions').innerText()).includes('조건 확인'));
  assert((await page.locator('#external-route-workbench-checklist-summary').innerText()).includes('남은 재료 부족'));
  assert((await page.locator('#external-route-workbench-checklist-changes').innerText()).includes('경로 변경'));
  assert((await page.locator('#external-route-workbench-checklist-table').innerText()).includes('다음 확인'));
  assert(await page.locator('#external-route-workbench-checklist-csv').isEnabled());
  const workbenchAmount=page.locator('#external-route-workbench-materials input[type=number]').first();
  const workbenchOriginalQuantity=await workbenchAmount.inputValue();
  await workbenchAmount.fill('0');
  await workbenchAmount.press('Tab');
  assert(await page.locator('#external-route-workbench-export').isDisabled());
  assert((await page.locator('#external-route-workbench-status').innerText()).includes('계산 중단'));
  await workbenchAmount.fill(workbenchOriginalQuantity);
  await workbenchAmount.press('Tab');
  assert(await page.locator('#external-route-workbench-export').isEnabled());
  const workbenchChemical=page.locator('select[aria-label="화학물질 작업대 제조 경로"]');
  const routeInputs=page.locator('#external-route-batch-inputs tbody tr');
  assert((await routeInputs.count())>=1,await page.locator('#external-route-batch-status').innerText());
  assert(await page.locator('#external-route-batch-all').isEnabled());
  await page.locator('#external-route-batch-all').click();
  const routeSelected=await page.locator('#external-route-batch-inputs .route-batch-check:checked').count();
  assert(routeSelected>=1);
  assert(await page.locator('#external-route-batch-preview').isEnabled());
  const routeAmount=page.locator('#external-route-batch-inputs .route-batch-amount').first();
  const routeFull=await routeAmount.inputValue();
  await routeAmount.fill('0');
  assert(await page.locator('#external-route-batch-preview').isDisabled());
  await routeAmount.fill(routeFull);
  assert(await page.locator('#external-route-batch-preview').isEnabled());
  await page.locator('#external-route-batch-preview').click();
  assert(await page.locator('#external-route-batch-results').isVisible());
  assert((await page.locator('#external-route-batch-summary').innerText()).includes('경로 변경 + 가상 조달'));
  assert((await page.locator('#external-route-batch-status').innerText()).includes('게임 세이브는 변경되지 않았습니다'));
  assert(await page.locator('#external-route-batch-json').isEnabled());
  const routeBatchDownload=page.waitForEvent('download');
  await page.locator('#external-route-batch-json').click();
  const routeBatchFile=await routeBatchDownload;
  assert.equal(routeBatchFile.suggestedFilename(),
    'xpiratez-v2-route-aware-batch-STR_3RL_HE_XXX.json');
  const routeBatchPayload=JSON.parse(fs.readFileSync(await routeBatchFile.path(),'utf8'));
  assert.equal(routeBatchPayload.schema,'xpiratez-v2-route-aware-readiness-batch/v1');
  assert.equal(routeBatchPayload.rootRecipeId,'STR_3RL_HE_XXX');
  assert.equal(routeBatchPayload.acquiredHypothetically.length,routeSelected);
  assert.equal(routeBatchPayload.editedRouteChecklist.schema,
    'xpiratez-v2-single-goal-readiness-checklist/v1');
  assert.equal(routeBatchPayload.finalChecklist.schema,
    'xpiratez-v2-single-goal-readiness-checklist/v1');
  assert(routeBatchPayload.hypotheticalScenario.routeChoices);
  assert((await page.locator('#stock-list').innerText()).includes('입력된 보유 재고 없음'));
  const routeBatchCsvDownload=page.waitForEvent('download');
  await page.locator('#external-route-batch-csv').click();
  const routeBatchCsv=await routeBatchCsvDownload;
  assert.equal(routeBatchCsv.suggestedFilename(),
    'xpiratez-v2-route-aware-batch-STR_3RL_HE_XXX.csv');
  assert(fs.readFileSync(await routeBatchCsv.path(),'utf8').includes('가상 확보 수량'));
  await page.locator('#external-route-batch-a').click();
  await page.locator('#external-route-batch-b').click();
  assert(await page.locator('#external-basket-compare').isEnabled());
  await page.locator('#external-route-batch-draft').click();
  assert.equal(await page.locator('#stock-bulk-text').inputValue(),
    routeBatchPayload.stockDraft);
  await page.locator('#external-route-batch-draft').click();
  assert((await page.locator('#external-route-batch-status').innerText()).includes('덮어쓰지 않았습니다'));
  await page.locator('#stock-bulk-text').fill('');
  let canExpand=false;
  const routeInputsForPartial=page.locator('#external-route-batch-inputs .route-batch-amount');
  for(let i=0;i<await routeInputsForPartial.count();i++){
    const input=routeInputsForPartial.nth(i);
    const amount=Number(await input.inputValue());
    if(amount>1){
      await input.fill(String(Math.max(1,Math.floor(amount/2))));
      canExpand=true;
      break;
    }
  }
  assert(canExpand,'2.1 browser fixture needs a shortage greater than one to test repeated route acquisition');
  if(canExpand){
    assert(await page.locator('#external-route-batch-preview').isEnabled());
    await page.locator('#external-route-batch-preview').click();
    assert(await page.locator('#external-route-batch-expand').isEnabled());
    await page.locator('#external-route-batch-expand').click();
    assert(await page.locator('#external-route-batch-trace').isVisible());
    assert((await page.locator('#external-route-batch-trace-status').innerText()).includes('추가 탐색'));
    assert((await page.locator('#external-route-batch-status').innerText()).includes('누적 가상 확보량'));
    const expandedDownload=page.waitForEvent('download');
    await page.locator('#external-route-batch-json').click();
    const expandedFile=await expandedDownload;
    const expandedPayload=JSON.parse(fs.readFileSync(await expandedFile.path(),'utf8'));
    assert.equal(expandedPayload.schema,'xpiratez-v2-route-aware-cascade/v1');
    assert.equal(expandedPayload.acquisitionLedger.schema,
      'xpiratez-v2-route-acquisition-ledger/v1');
    assert.equal(expandedPayload.materialWorkflow.schema,
      'xpiratez-v2-route-material-workflow/v1');
    assert.equal(expandedPayload.actionBoard.schema,'xpiratez-v2-route-action-board/v1');
    assert(await page.locator('#external-route-action-board').isVisible());
    assert(await page.locator('#external-route-action-csv').isEnabled());
    assert(await page.locator('#external-route-action-json').isEnabled());
    const routeActionRows=page.locator('#external-route-action-table tbody tr');
    const actionCount=await routeActionRows.count();
    assert(actionCount>=1 && actionCount<=100);
    if(expandedPayload.actionBoard.tasks.length>100){
      assert(await page.locator('#external-route-action-next').isEnabled());
      await page.locator('#external-route-action-next').click();
      assert((await page.locator('#external-route-action-page').innerText())
        .includes('페이지 2/'));
      assert((await routeActionRows.first().innerText()).includes('101'));
      await page.locator('#external-route-action-prev').click();
      assert((await page.locator('#external-route-action-page').innerText())
        .includes('페이지 1/'));
    }
    assert((await page.locator('#external-route-action-status').innerText())
      .includes('검토 표시 0건'));
    await page.locator('#external-route-action-table .route-action-check').first().check();
    assert((await page.locator('#external-route-action-status').innerText())
      .includes('검토 표시 1건'));
    await page.locator('#external-route-action-table .route-action-note').first()
      .fill('게임에서 재료 확보 경로 재확인');
    const actionDownload=page.waitForEvent('download');
    await page.locator('#external-route-action-json').click();
    const actionFile=await actionDownload;
    assert.equal(actionFile.suggestedFilename(),
      'xpiratez-v2-route-action-review-STR_3RL_HE_XXX.json');
    const actionPayload=JSON.parse(fs.readFileSync(await actionFile.path(),'utf8'));
    assert.equal(actionPayload.schema,'xpiratez-v2-route-action-review/v1');
    assert.equal(actionPayload.summary.reviewed,1);
    assert.equal(actionPayload.tasks[0].note,'게임에서 재료 확보 경로 재확인');
    assert(actionPayload.tasks.some(x=>x.type==='recipe'));
    assert(actionPayload.tasks.every(x=>Array.isArray(x.unreviewedPrerequisiteIds)));
    const actionCsvDownload=page.waitForEvent('download');
    await page.locator('#external-route-action-csv').click();
    const actionCsvFile=await actionCsvDownload;
    assert.equal(actionCsvFile.suggestedFilename(),
      'xpiratez-v2-route-action-review-STR_3RL_HE_XXX.csv');
    const actionCsv=fs.readFileSync(await actionCsvFile.path(),'utf8');
    assert(actionCsv.startsWith('\uFEFF"작업 순서","작업 구분"'));
    assert(actionCsv.includes('게임에서 재료 확보 경로 재확인'));
    await page.locator('#external-route-action-filter').selectOption('pending');
    assert.equal(await routeActionRows.count(),Math.min(100,
      actionPayload.summary.tasks-1));
    await page.locator('#external-route-action-filter').selectOption('all');
    await page.locator('#external-route-action-search').fill(actionPayload.tasks[0].requirementId);
    assert((await routeActionRows.count())>=1);
    await page.locator('#external-route-action-search').fill('');
    await page.locator('#external-route-action-clear').click();
    assert((await page.locator('#external-route-action-status').innerText())
      .includes('검토 표시 0건'));
    await page.locator('#external-route-action-import').setInputFiles({
      name:'saved-route-review.json',mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify(actionPayload),'utf8')
    });
    await page.waitForFunction(()=>
      document.getElementById('external-route-action-import-status')
        ?.textContent.includes('검토 메모를 불러왔습니다'));
    assert((await page.locator('#external-route-action-import-status').innerText())
      .includes('검토 메모를 불러왔습니다'));
    assert((await page.locator('#external-route-action-status').innerText())
      .includes('검토 표시 1건'));
    assert.equal(await page.locator('#external-route-action-table .route-action-note')
      .first().inputValue(),'게임에서 재료 확보 경로 재확인');
    await page.locator('#external-route-action-import').setInputFiles({
      name:'wrong-recipe-review.json',mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify({
        ...actionPayload,rootRecipeId:'STR_DIFFERENT'
      }),'utf8')
    });
    await page.waitForFunction(()=>
      document.getElementById('external-route-action-import-status')
        ?.textContent.includes('불러오기 중단'));
    assert((await page.locator('#external-route-action-import-status').innerText())
      .includes('불러오기 중단'));
    assert((await page.locator('#external-route-action-status').innerText())
      .includes('검토 표시 1건'));
    const staleReview={
      ...actionPayload,
      tasks:actionPayload.tasks.map((row,i)=>i===0?
        {...row,quantity:(row.quantity||0)+1}:
        i===1?{...row,reviewed:true,note:'변경된 계획에 선별 재사용할 메모'}:row)
    };
    await page.locator('#external-route-action-carryover-file').setInputFiles({
      name:'previous-different-plan-review.json',mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify(staleReview),'utf8')
    });
    await page.waitForFunction(()=>
      document.getElementById('external-route-action-carryover-status')
        ?.textContent.includes('검토 JSON 비교 완료'));
    assert(await page.locator('#external-route-action-carryover-apply').isEnabled());
    assert((await page.locator('#external-route-action-carryover-summary').innerText())
      .includes('변경·모호함으로 제외'));
    assert((await page.locator('#external-route-action-carryover-items').innerText())
      .includes('이어받기 제외'));
    await page.locator('#external-route-action-carryover-apply').click();
    assert((await page.locator('#external-route-action-carryover-status').innerText())
      .includes('선택적 이어받기 완료'));
    assert((await page.locator('#external-route-action-status').innerText())
      .includes('검토 표시 2건'));
    const carryoverReviewDownload=page.waitForEvent('download');
    await page.locator('#external-route-action-json').click();
    const carryoverReviewFile=await carryoverReviewDownload;
    const carryoverReview=JSON.parse(fs.readFileSync(
      await carryoverReviewFile.path(),'utf8'));
    assert.equal(carryoverReview.summary.reviewed,2);
    assert.equal(carryoverReview.tasks[0].note,'게임에서 재료 확보 경로 재확인');
    assert.equal(carryoverReview.tasks[1].note,'변경된 계획에 선별 재사용할 메모');
    assert(await page.locator('#external-route-batch-workflow').isVisible());
    assert(await page.locator('#external-route-batch-workflow-csv').isEnabled());
    assert((await page.locator('#external-route-batch-workflow-summary').innerText())
      .includes('조달 사유 그룹'));
    assert((await page.locator('#external-route-batch-workflow-materials').innerText())
      .includes('다음에 확인할 작업'));
    assert((await page.locator('#external-route-batch-workflow-recipes').innerText())
      .includes('하위 제조식'));
    const workflow=expandedPayload.materialWorkflow;
    assert.equal(workflow.rootRecipeId,'STR_3RL_HE_XXX');
    assert.equal(workflow.summary.materialKinds,expandedPayload.acquisitionLedger.materials.length);
    assert(workflow.recipeSequenceAfter.length>=1);
    assert.equal(workflow.recipeSequenceAfter.at(-1).recipeId,'STR_3RL_HE_XXX');
    assert(workflow.materials.every(x=>x.availability==='unverified'));
    const workflowItems=page.locator('#external-route-batch-workflow-materials tbody tr');
    const unfilteredWorkflowCount=await workflowItems.count();
    assert(unfilteredWorkflowCount>0);
    const workflowSelect=page.locator('#external-route-batch-workflow-filter');
    assert((await workflowSelect.locator('option').count())>=2);
    await workflowSelect.selectOption(workflow.procurementGroups[0].id);
    assert((await workflowItems.count())>0);
    assert((await workflowItems.count())<=unfilteredWorkflowCount);
    await workflowSelect.selectOption('all');
    assert.equal(await workflowItems.count(),unfilteredWorkflowCount);
    const workflowCsvDownload=page.waitForEvent('download');
    await page.locator('#external-route-batch-workflow-csv').click();
    const workflowCsvFile=await workflowCsvDownload;
    assert.equal(workflowCsvFile.suggestedFilename(),
      'xpiratez-v2-route-material-workflow-STR_3RL_HE_XXX.csv');
    const workflowCsv=fs.readFileSync(await workflowCsvFile.path(),'utf8');
    assert(workflowCsv.startsWith('\uFEFF"종류","순서"'));
    assert(workflowCsv.includes('"하위 제조식 선행 순서"'));
    assert(workflowCsv.includes('STR_3RL_HE_XXX'));
    assert(await page.locator('#external-route-batch-ledger').isVisible());
    assert(await page.locator('#external-route-batch-ledger-csv').isEnabled());
    assert((await page.locator('#external-route-batch-ledger-summary').innerText())
      .includes('가상 추가 확보 총계'));
    assert((await page.locator('#external-route-batch-ledger-table').innerText())
      .includes('현재 입력 재고'));
    const acquisitionLedger=expandedPayload.acquisitionLedger;
    assert.equal(acquisitionLedger.summary.totalAcquiredUnits,
      expandedPayload.acquiredHypothetically.reduce((s,x)=>s+x.quantity,0));
    assert(acquisitionLedger.materials.every(row=>
      row.startingInventory+row.totalAcquisition===row.hypotheticalStockTarget));
    const ledgerRows=page.locator('#external-route-batch-ledger-table tbody tr');
    const ledgerCount=await ledgerRows.count();
    assert(ledgerCount>=1);
    const firstLedgerMaterial=acquisitionLedger.materials[0];
    await page.locator('#external-route-batch-ledger-search').fill(firstLedgerMaterial.id);
    assert.equal(await ledgerRows.count(),1);
    assert((await page.locator('#external-route-batch-ledger-table').innerText())
      .includes(firstLedgerMaterial.id));
    await page.locator('#external-route-batch-ledger-sort').selectOption('name');
    assert.equal(await ledgerRows.count(),1);
    await page.locator('#external-route-batch-ledger-search').fill('');
    assert.equal(await ledgerRows.count(),ledgerCount);
    const ledgerDownload=page.waitForEvent('download');
    await page.locator('#external-route-batch-ledger-csv').click();
    const ledgerFile=await ledgerDownload;
    assert.equal(ledgerFile.suggestedFilename(),
      'xpiratez-v2-acquisition-ledger-STR_3RL_HE_XXX.csv');
    const ledgerCsv=fs.readFileSync(await ledgerFile.path(),'utf8');
    assert(ledgerCsv.startsWith('\uFEFF"아이템 ID","한글 이름"'));
    assert(ledgerCsv.includes('"최초 선택 가정"'));
    assert(ledgerCsv.includes('"확보 후 가상 재고"'));
    assert(ledgerCsv.includes(firstLedgerMaterial.id));
    assert(Array.isArray(expandedPayload.history));
    assert(expandedPayload.history.length<=4);
    assert(expandedPayload.acquiredHypothetically.every(x=>
      x.quantity===x.firstPass+(expandedPayload.additionalAcquired
        .find(y=>y.id===x.id)?.quantity||0)));
    assert.equal(expandedPayload.hypotheticalScenario.rootRecipeId,'STR_3RL_HE_XXX');
    assert((await page.locator('#stock-list').innerText()).includes('입력된 보유 재고 없음'));
    await page.locator('#external-route-batch-draft').click();
    assert.equal(await page.locator('#stock-bulk-text').inputValue(),
      expandedPayload.stockDraft);
    await page.locator('#stock-bulk-text').fill('');
  }
  await page.locator('#external-route-batch-clear').click();
  assert(await page.locator('#external-route-batch-ledger').isHidden());
  assert(await page.locator('#external-route-batch-ledger-csv').isDisabled());
  assert(await page.locator('#external-route-batch-workflow').isHidden());
  assert(await page.locator('#external-route-batch-workflow-csv').isDisabled());
  assert(await page.locator('#external-route-action-board').isHidden());
  assert(await page.locator('#external-route-action-json').isDisabled());
  assert(await page.locator('#external-route-batch-preview').isDisabled());
  assert(await page.locator('#external-route-batch-json').isDisabled());
  assert(await page.locator('#external-route-batch-results').isHidden());
  if(await workbenchChemical.count()){
    await workbenchChemical.selectOption('STR_CHEMICALS_XXX');
    assert(await page.locator('#external-route-workbench-export').isEnabled());
    assert(await page.locator('#external-route-batch-json').isDisabled());
    assert(await page.locator('#external-route-batch-results').isHidden());
  }
  const workbenchDownload=page.waitForEvent('download');
  await page.locator('#external-route-workbench-export').click();
  const workbenchFile=await workbenchDownload;
  assert.equal(workbenchFile.suggestedFilename(),
    'xpiratez-v2-route-workbench-STR_3RL_HE_XXX.json');
  const workbenchPayload=JSON.parse(fs.readFileSync(await workbenchFile.path(),'utf8'));
  assert.equal(workbenchPayload.schema,'xpiratez-v2-route-workbench/v1');
  assert.equal(workbenchPayload.sourceVersion,'v.o2');
  assert.equal(workbenchPayload.checklists.original.schema,'xpiratez-v2-single-goal-readiness-checklist/v1');
  assert.equal(workbenchPayload.checklists.withAcquisition.schema,'xpiratez-v2-single-goal-readiness-checklist/v1');
  assert.equal(workbenchPayload.checklistChanges.acquisitionOnly.schema,'xpiratez-v2-checklist-changes/v1');
  assert.equal(workbenchPayload.evidence.original.schema,'xpiratez-v2-route-evidence/v1');
  assert.equal(workbenchPayload.evidence.original.facilityEvidenceSource,'no-single-base-selected');
  assert.equal(workbenchPayload.evidence.original.researchEvidenceSource,'no-discovered-data');
  assert(Array.isArray(workbenchPayload.evidenceChanges.routeOnly.facilityRequirements.added));
  assert(workbenchPayload.additions.length>=1);
  if(await workbenchChemical.count())
    assert.equal(workbenchPayload.sourceChoices.STR_CHEMICALS,'STR_CHEMICALS_XXX');
  const workbenchReadinessDownload=page.waitForEvent('download');
  await page.locator('#external-route-workbench-checklist-csv').click();
  const workbenchReadinessFile=await workbenchReadinessDownload;
  assert.equal(workbenchReadinessFile.suggestedFilename(),
    'xpiratez-v2-workbench-readiness-STR_3RL_HE_XXX.csv');
  assert(fs.readFileSync(await workbenchReadinessFile.path(),'utf8').includes('STR_'));
  await page.locator('#external-route-workbench-a').click();
  await page.locator('#external-route-workbench-b').click();
  assert(await page.locator('#external-basket-compare').isEnabled());
  await page.locator('#external-route-workbench-draft').click();
  assert.equal(await page.locator('#stock-bulk-text').inputValue(),workbenchPayload.stockDraft);
  assert((await page.locator('#stock-list').innerText()).includes('입력된 보유 재고 없음'));
  await page.locator('#external-route-workbench-draft').click();
  assert((await page.locator('#external-route-workbench-status').innerText()).includes('덮어쓰지 않았습니다'));
  await page.locator('#stock-bulk-text').fill('');
  await page.locator('#external-route-workbench-close').click();
  assert(await page.locator('#external-route-workbench').isHidden());
  assert.equal(await chemical.inputValue(),'external');
  assert(await page.locator('#main-route-workbench-open').isEnabled());
  await page.locator('#main-route-workbench-open').click();
  assert(await page.locator('#external-route-workbench').isVisible());
  assert((await page.locator('#external-route-workbench-status').innerText()).includes('직접 열었습니다'));
  assert((await page.locator('#external-route-batch-inputs').innerText()).includes('경로에서 부족한 재료'));
  await page.locator('#external-route-workbench-close').click();
  assert(await page.locator('#external-route-workbench').isHidden());
  await exploredRows.first().getByRole('button',{name:/후보 재고 입력문 준비/}).click();
  const candidateDraft=await page.locator('#stock-bulk-text').inputValue();
  assert(exploreData.candidates[0].additions.every(x=>candidateDraft.includes(x.id+'='+x.target)));
  assert((await page.locator('#stock-list').innerText()).includes('입력된 보유 재고 없음'));
  await exploredRows.first().getByRole('button',{name:/후보 재고 입력문 준비/}).click();
  assert((await page.locator('#external-explore-status').innerText()).includes('기존 일괄 재고 입력문'));
  assert.equal(await page.locator('#stock-bulk-text').inputValue(),candidateDraft);
  await page.locator('#stock-bulk-text').fill('');
  await exploredRows.first().getByRole('button',{name:/후보 선택에 불러오기/}).click();
  assert(await page.locator('#external-explore-results').isHidden());
  assert(await page.locator('#external-explore-export').isDisabled());
  assert.equal(await page.locator('#external input.external-basket-checkbox:checked').count(),
    exploreData.candidates[0].additions.length);
  for(const item of exploreData.candidates[0].additions){
    const row=page.locator('#external tbody tr').filter({hasText:item.id}).first();
    assert.equal(await row.locator('input.external-basket-amount').inputValue(),String(item.quantity));
  }
  assert((await page.locator('#external-basket-status').innerText()).includes('선택에 불러왔습니다'));
  assert((await page.locator('#stock-list').innerText()).includes('입력된 보유 재고 없음'));
  await chemicalAmount.fill(String(chemicalPartial));
  assert(await page.locator('#external-explore-export').isDisabled());
  assert(await page.locator('#external-explore-results').isHidden());
  await page.locator('#external-basket-prefill').click();
  assert((await page.locator('#stock-bulk-text').inputValue()).includes('STR_'));
  assert((await page.locator('#stock-list').innerText()).includes('입력된 보유 재고 없음'));
  await page.locator('#stock-bulk-text').fill('');
  await page.locator('#external-basket-clear').click();
  assert(await page.locator('#external-basket-preview').isDisabled());
  assert(await page.locator('#external-basket-report').isHidden());
  assert(await page.locator('#external-basket-export').isDisabled());
  const shortage=page.locator('#external tbody tr').filter({hasText:'STR_CHEMICALS'}).first();
  const requested=Number((await shortage.locator('td').nth(1).innerText()).replaceAll(',',''));
  assert(requested>0);
  await shortage.getByRole('button',{name:'화학물질 확보 시 변화'}).click();
  assert(await page.locator('#external-preview').isVisible());
  assert((await page.locator('#external-preview-summary').innerText()).includes('외부 조달 수량'));
  assert((await page.locator('#external-preview-status').innerText()).includes('원래 입력과 세이브는 수정하지 않았습니다'));
  assert((await page.locator('#stock-list').innerText()).includes('입력된 보유 재고 없음'));
  await shortage.getByRole('button',{name:'화학물질 부족분 재고 입력'}).click();
  assert.equal(await page.locator('#stock-select').inputValue(),'STR_CHEMICALS');
  assert.equal(await page.locator('#stock-qty').inputValue(),String(requested));
  assert((await page.locator('#stock-message').innerText()).includes('적용 버튼을 누르기 전에는'));
  await page.locator('#stock-add').click();
  assert((await page.locator('#stock-list').innerText()).includes('STR_CHEMICALS'));
  assert(await page.locator('#external-preview').isHidden());
  await page.locator('#stock-clear').click();
  await chemical.selectOption('STR_CHEMICALS_XXX');
  // Actual v.o2 inventory entry is applied to the consolidated bill.
  await page.locator('#stock-search').fill('STR_CHEMICALS');
  await page.locator('#stock-select').selectOption('STR_CHEMICALS');
  await page.locator('#stock-qty').fill('40');
  await page.locator('#stock-add').click();
  await page.waitForFunction(()=>document.querySelector('#summary')?.textContent?.includes('기존 재고 사용량'));
  assert((await page.locator('#stock-list').innerText()).includes('화학물질'));
  assert((await page.locator('#consolidated').innerText()).includes('STR_CHEMICALS'));
  assert((await page.locator('#summary').innerText()).includes('36개'));
  assert((await page.locator('#tree').innerText()).includes('보유 재고 36개'));
  await page.locator('#stock-clear').click();
  await page.waitForFunction(()=>document.querySelector('#stock-list')?.textContent?.includes('입력된 보유 재고 없음'));
  await page.locator('button').filter({hasText:'대체 경로 비용 비교'}).first().click();
  assert(await page.locator('#comparison-section').isVisible());
  assert((await page.locator('#comparison-data').innerText()).includes('전체 제조비'));
  assert((await page.locator('#comparison-data tbody tr').count()) >= 2);
  // The selected save is a synthetic v.o2 fixture. No real save is
  // embedded in the repository, sent over HTTP, or used as a default.
  assert(await page.locator('#save-file').isEnabled());
  const sample = [
    'name: Save Preview Test',
    'version: Extended 8.7.1',
    'engine: Extended',
    'mods:',
    "  - 'piratez ver: v.o2'",
    '---',
    'bases:',
    '  - lon: 0.1',
    '    name: Test Primary',
    '    facilities:',
    '      - type: STR_RED_FORGE',
    '        x: 0',
    '        y: 0',
    '      - type: STR_STILL',
    '        buildTime: 8',
    '    items:',
    '      STR_CHEMICALS: 40',
    '    productions:',
    '      - item: STR_GROG_BARREL',
    '        assigned: 7',
    '        spent: 140',
    '        amount: 12',
    '        infinite: false',
    '  - lon: 0.2',
    '    name: Test Secondary',
    '    facilities: []',
    '    productions: []',
    '    items:',
    '      STR_CHEMICALS: 2',
    'discovered:',
    '  - STR_3RL'
  ].join('\n') + '\n';
  await page.locator('#save-file').setInputFiles({
    name:'sample-v2.sav',mimeType:'text/plain',buffer:Buffer.from(sample,'utf8')
  });
  await page.waitForFunction(()=>document.querySelector('#save-preview')?.hidden === false);
  assert((await page.locator('#save-metadata').innerText()).includes('Test Primary'));
  assert((await page.locator('#stock-list').innerText()).includes('입력된 보유 재고 없음'));
  await page.locator('#save-apply').click();
  await page.waitForFunction(()=>document.querySelector('#save-active')?.hidden === false);
  assert((await page.locator('#stock-list').innerText()).includes('STR_CHEMICALS'));
  assert((await page.locator('#summary').innerText()).includes('기존 재고 사용량'));
  assert((await page.locator('#summary').innerText()).includes('36개'));
  assert((await page.locator('#research').innerText()).includes('discovered에서 확인'));
  assert(await page.locator('#base-operations').isVisible());
  assert((await page.locator('#base-facility-summary').innerText()).includes('STR_3RL_HE_XXX') ||
    (await page.locator('#base-facility-summary').innerText()).includes('필요 시설 기능'));
  assert((await page.locator('#base-production-orders').innerText()).includes('STR_GROG_BARREL'));
  assert((await page.locator('#base-production-orders').innerText()).includes('140'));
  assert(await page.locator('#queue-section').isVisible());
  assert((await page.locator('#queue-options').innerText()).includes('STR_GROG_BARREL'));
  await page.waitForFunction(()=>document.querySelector('#queue-status')?.textContent?.includes('가상 작업 순서'));
  assert((await page.locator('#queue-steps').innerText()).includes('STR_GROG_BARREL'));
  assert((await page.locator('#queue-steps').innerText()).includes('STR_3RL_HE_XXX'));
  await page.locator('#queue-select-none').click();
  assert.equal(await page.locator('#queue-steps tr').count(),1);
  await page.locator('#queue-select-all').click();
  assert.equal(await page.locator('#queue-steps tr').count(),2);
  await page.locator('#queue-position').selectOption('first');
  assert((await page.locator('#queue-steps tr').first().innerText()).includes('STR_3RL_HE_XXX'));
  assert(await page.locator('#queue-download').isEnabled());
  assert((await page.locator('#queue-procurement-table').innerText()).includes('조달') ||
    (await page.locator('#queue-procurement-table').innerText()).includes('재료가 없습니다'));
  if(await page.locator('#queue-procurement-csv').isEnabled()){
    const event=page.waitForEvent('download');
    await page.locator('#queue-procurement-csv').click();
    const download=await event;
    assert.equal(download.suggestedFilename(),'xpiratez-v2-procurement-list.csv');
  }
  assert(await page.locator('#queue-whatif').isVisible());
  assert((await page.locator('#queue-whatif-status').innerText()).includes('확보할 수량'));
  const originalStockText=await page.locator('#stock-list').innerText();
  await page.locator('#queue-whatif-fill').click();
  assert(await page.locator('#queue-whatif-report').isVisible());
  assert((await page.locator('#queue-whatif-summary').innerText()).includes('외부 부족 재료'));
  assert((await page.locator('#queue-whatif-jobs').innerText()).includes('확보 후 부족'));
  assert(await page.locator('#queue-readiness-jobs').isVisible());
  assert(await page.locator('#queue-readiness-actions').isVisible());
  assert((await page.locator('#queue-readiness-actions').innerText()).includes('첫 주문') ||
    (await page.locator('#queue-readiness-actions').innerText()).includes('명시적으로 식별된'));
  assert.equal(await page.locator('#queue-readiness-jobs tbody tr').count(),2);
  assert((await page.locator('#queue-readiness-summary').innerText()).includes('가상 재료 부족 주문'));
  assert((await page.locator('#queue-readiness-supplies').innerText()).includes('가상 추가'));
  assert((await page.locator('#queue-readiness-jobs').innerText()).includes('실제 제조 가능')===false);
  assert(await page.locator('#queue-whatif-json').isEnabled());
  assert.equal(await page.locator('#stock-list').innerText(),originalStockText);
  const downloadWhatif=page.waitForEvent('download');
  await page.locator('#queue-whatif-json').click();
  const whatifFile=await downloadWhatif;
  assert.equal(whatifFile.suggestedFilename(),'xpiratez-v2-procurement-whatif.json');
  const whatifPayload=JSON.parse(fs.readFileSync(await whatifFile.path(),'utf8'));
  assert.equal(whatifPayload.evidence.schema,'xpiratez-v2-manufacture-evidence-matrix/v1');
  assert.equal(whatifPayload.evidence.sourceVersion,'v.o2');
  await page.locator('#queue-whatif-expand').click();
  assert(await page.locator('#queue-whatif-trace').isVisible());
  assert(await page.locator('#queue-whatif-trace-json').isEnabled());
  const traceDownload=page.waitForEvent('download');
  await page.locator('#queue-whatif-trace-json').click();
  assert.equal((await traceDownload).suggestedFilename(),
    'xpiratez-v2-procurement-round-history.json');
  assert((await page.locator('#queue-whatif-status').innerText()).includes('추가 부족 탐색'));
  assert(await page.locator('#queue-whatif-report').isVisible());
  await page.locator('#queue-whatif-clear').click();
  assert(await page.locator('#queue-whatif-report').isHidden());
  assert(await page.locator('#queue-whatif-json').isDisabled());
  await page.locator('#queue-compare').click();
  assert(await page.locator('#queue-order-comparison').isVisible());
  assert((await page.locator('#queue-order-compare-summary').innerText()).includes('신규 먼저'));
  assert((await page.locator('#queue-order-compare-summary').innerText()).includes('신규 나중'));
  await page.locator('#save-base').selectOption('1');
  await page.locator('#save-apply').click();
  assert((await page.locator('#tree').innerText()).includes('보유 재고 2개'));
  assert((await page.locator('#base-production-orders').innerText()).includes('제조 주문이 없습니다'));
  assert(await page.locator('#queue-section').isVisible());
  assert.equal(await page.locator('#queue-steps tr').count(),1);
  await page.locator('#save-base').selectOption('all');
  await page.locator('#save-apply').click();
  assert((await page.locator('#summary').innerText()).includes('36개'));
  assert((await page.locator('#save-active-text').innerText()).includes('모든 기지'));
  assert((await page.locator('#base-operation-message').innerText()).includes('시설 기능이나 생산 주문을 단일 공장처럼 합치지 않습니다'));
  assert(await page.locator('#queue-section').isHidden());
  assert(await page.locator('#queue-order-comparison').isHidden());
  const oldSave = sample.replace('piratez ver: v.o2','piratez ver: v.o1.1.1');
  await page.locator('#save-file').setInputFiles({
    name:'old.sav',mimeType:'text/plain',buffer:Buffer.from(oldSave,'utf8')
  });
  await page.waitForFunction(()=>document.querySelector('#save-message')?.textContent?.includes('가져오기 중단'));
  assert(await page.locator('#save-preview').isHidden());
  assert((await page.locator('#stock-list').innerText()).includes('STR_CHEMICALS'));
  await page.locator('#save-disconnect').click();
  assert((await page.locator('#research').innerText()).includes('미확인 ID'));
  assert(!(await page.locator('#research').innerText()).includes('discovered에서 확인'));
  assert.deepEqual(errors,[]);
  console.log('PASS 2.1 manufacturing planner UI: nested production, stock deduction, consolidated materials, alternative comparison and JSON export');
}finally{if(browser)await browser.close();await new Promise(done=>server.close(done));}
