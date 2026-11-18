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
