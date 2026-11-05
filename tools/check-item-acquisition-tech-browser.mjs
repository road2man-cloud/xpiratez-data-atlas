// Item DB acquisition smoke: live legacy sources, not fabricated success paths.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {chromium} from 'playwright-core';

const root=path.resolve('public');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8',
  '.gz':'application/gzip'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname),
      url.pathname.endsWith('/')?'index.html':'');
    if(!file.startsWith(root+path.sep))throw Error('Path outside public');
    const bytes=await fsp.readFile(file);
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream',
      'Cache-Control':'no-store'});res.end(bytes);
  }catch{res.writeHead(404);res.end('missing');}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const base=(process.env.ATLAS_TECH_SITE_BASE||
  ('http://127.0.0.1:'+server.address().port)).replace(/\/+$/,'');
const binary=[process.env.EDGE_PATH,process.env.CHROME_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome','/usr/bin/google-chrome-stable',
  '/usr/bin/chromium','/usr/bin/chromium-browser','/opt/google/chrome/chrome',
  chromium.executablePath()].find(x=>x&&fs.existsSync(x));
assert(binary,'Browser executable missing');
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:binary,
    args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  page.setDefaultTimeout(35000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/items/#item=STR_BUCKSHOT_HV',{waitUntil:'domcontentloaded'});
  const launch=page.locator('#detail [data-open-item-tech="STR_BUCKSHOT_HV"]');
  await launch.waitFor({timeout:80000});
  await launch.click();
  const dialog=page.locator('#itemTechDialog');
  const tech=dialog.locator('.tech-viewer');
  await tech.waitFor({timeout:60000});
  const purchaseCheck=dialog.locator('#purchaseReadinessHost details.purchase-readiness-panel');
  await purchaseCheck.waitFor();
  assert.equal(await purchaseCheck.evaluate(el=>el.open),false,
    'Player-specific checker must be optional, not a nested-card replacement for the map');
  await purchaseCheck.locator('summary').click();
  assert((await purchaseCheck.locator('.purchase-check-result').innerText()).includes('현재 구매 가능 여부 미확인'),
    'Missing save state must not be treated as completed or blocked');
  assert.equal(await tech.locator('.tech-column').count(),2);
  assert((await tech.locator('.tech-adapter-notice').innerText()).includes('v.o1.1.1'));
  assert((await tech.locator('.tech-adapter-notice').innerText()).includes('재고'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  const node=(stage,index)=>tech.locator('.tech-node[data-tech-stage="'+stage+
    '"][data-tech-index="'+index+'"]');
  assert.equal(await tech.locator('.tech-node[data-tech-stage="1"]').count(),2);
  await node(1,0).click(); // store candidate
  const store=await tech.locator('.tech-node[data-tech-stage="2"]').allInnerTexts();
  assert(store.some(t=>t.includes('연구')&&t.includes('벅샷')));
  assert(store.some(t=>t.includes('재고')));
  assert(store.some(t=>t.includes('100')));
  await tech.locator('.tech-node[data-tech-stage="2"].tech-node--research').click();
  assert((await tech.locator('.tech-source-link').getAttribute('href'))
    .includes('../research/#research=STR_BUCKSHOT_HV'));
  await tech.locator('[data-tech-action="reset"]').click();
  await node(1,1).click(); // manufacturing random outcome
  const manufacture=await tech.locator('.tech-node[data-tech-stage="2"]').allInnerTexts();
  assert(manufacture.some(t=>t.includes('황무지주민의 배낭')));
  assert(manufacture.some(t=>t.includes('0.388%')));
  const ingredient=tech.locator('.tech-node[data-tech-stage="2"].tech-node--item');
  await ingredient.click();
  assert.equal(await tech.locator('.tech-column').count(),4);
  assert((await tech.locator('.tech-source-link').getAttribute('href'))
    .includes('../items/#item=STR_WASTELANDER_BACKPACK'));
  assert((await tech.locator('.tech-route-step').count())>=3);
  await tech.locator('[data-tech-action="source"]').click();
  await tech.locator('.tech-original .tech-adapter-proof').waitFor();
  const evidence=await tech.locator('.tech-original .tech-adapter-proof').innerText();
  assert(evidence.includes('v.o1.1.1'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  if(process.env.ATLAS_ITEM_SCREENSHOT==='1'){
    await tech.locator('.tech-original > summary').click();
    await tech.screenshot({path:path.join(os.tmpdir(),'xpiratez-item-tech-mobile.png')});
  }
  await dialog.locator('#closeItemTech').click();
  assert.equal(await dialog.evaluate(el=>el.open),false);
  assert.equal(await page.locator('#drawer').getAttribute('aria-hidden'),'false',
    'Opening and closing acquisition map cannot close the item dossier');

  // Source-only purchase gates: preserve monthly quota and buy-only base
  // function without promoting a cost field into a verified shop listing.
  await page.goto(base+'/items/#item=STR_LOOTBOX_MEDICAL',{waitUntil:'domcontentloaded'});
  const medicalLaunch=page.locator('#detail [data-open-item-tech="STR_LOOTBOX_MEDICAL"]');
  await medicalLaunch.waitFor();
  await medicalLaunch.click();
  const medicalTech=dialog.locator('.tech-viewer');
  await medicalTech.waitFor();
  await medicalTech.locator('.tech-node[data-tech-stage="1"]')
    .filter({hasText:'상점 구매 후보'}).click();
  const medicalNodes=await medicalTech.locator('.tech-node[data-tech-stage="2"]').allInnerTexts();
  assert(medicalNodes.some(x=>x.includes('STR_MED_TRADE')),
    'Buy-only required base function must be displayed');
  assert(medicalNodes.some(x=>x.includes('월별 구매 상한 1개')),
    'Monthly limit from original item rule must be displayed');
  assert(medicalNodes.some(x=>x.includes('상점 출현')&&x.includes('미검증')),
    'Engine-derived candidates must never become guaranteed runtime store listings');
  const medicalCheck=dialog.locator('#purchaseReadinessHost details');
  await medicalCheck.waitFor();
  if(!await medicalCheck.evaluate(el=>el.open))await medicalCheck.locator('summary').click();
  await medicalCheck.locator('select[data-purchase-state="baseFunctions"][data-purchase-id="STR_MED_TRADE"]')
    .selectOption('no');
  assert((await medicalCheck.locator('.purchase-check-result').innerText()).includes('현재 입력에서 막힌 구매 조건'),
    'A missing base function must block the conditional purchase in the scenario');
  await medicalCheck.locator('select[data-purchase-state="baseFunctions"][data-purchase-id="STR_MED_TRADE"]')
    .selectOption('yes');
  await medicalCheck.locator('input[data-purchase-number="purchasedThisMonthByItem"]').fill('1');
  await medicalCheck.locator('input[data-purchase-number="purchasedThisMonthByItem"]').press('Tab');
  assert((await medicalCheck.locator('.purchase-check-result').innerText()).includes('남은 구매 가능 수량 0개'),
    'A monthly cap must block the current manually entered state');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await dialog.locator('#closeItemTech').click();

  // OXCE item purchases require BOTH ordinary item.requires and the
  // purchase-only requiresBuy research, not one alternative or either alone.
  await page.goto(base+'/items/#item=STR_RETICULAN_ELECTROGUN',{waitUntil:'domcontentloaded'});
  const electronLaunch=page.locator('#detail [data-open-item-tech="STR_RETICULAN_ELECTROGUN"]');
  await electronLaunch.waitFor();
  await electronLaunch.click();
  const electronTech=dialog.locator('.tech-viewer');
  await electronTech.waitFor();
  await electronTech.locator('.tech-node[data-tech-stage="1"]').filter({hasText:'상점 구매 후보'}).click();
  const electronStudies=electronTech.locator('.tech-node[data-tech-stage="2"].tech-node--research');
  assert.equal(await electronStudies.count(),2,
    'A buy-priced weapon must require both normal unlock and purchase-only research');
  const bothStudyLabels=await electronStudies.allInnerTexts();
  assert(bothStudyLabels.some(x=>x.includes('일반 아이템 해금(requires)')));
  assert(bothStudyLabels.some(x=>x.includes('구매 전용 해금(requiresBuy)')));
  const cycleNode=electronTech.locator('.tech-node[data-tech-stage="2"].tech-node--warning');
  assert((await cycleNode.allInnerTexts()).some(x=>x.includes('첫 획득 경로 순환 주의')),
    'A self-specimen lab prerequisite is not a free initial purchase');
  const electronCheck=dialog.locator('#purchaseReadinessHost details');
  await electronCheck.waitFor();
  if(!await electronCheck.evaluate(el=>el.open))await electronCheck.locator('summary').click();
  assert.equal(await electronCheck.locator('select[data-purchase-state="research"]').count(),2,
    'The checker must expose BOTH general research and purchase-specific research');
  await electronCheck.locator('select[data-purchase-state="research"]').first().selectOption('yes');
  await electronCheck.locator('select[data-purchase-state="research"]').nth(1).selectOption('yes');
  await electronCheck.locator('select[data-purchase-state="storeVisibleByItem"]').selectOption('yes');
  await electronCheck.locator('input[data-purchase-number="funds"]').fill('100000');
  await electronCheck.locator('input[data-purchase-number="funds"]').press('Tab');
  await electronCheck.locator('input[data-purchase-number="checkoutPriceByItem"]').fill('5000');
  await electronCheck.locator('input[data-purchase-number="checkoutPriceByItem"]').press('Tab');
  assert((await electronCheck.locator('.purchase-check-result').innerText()).includes('입력상 조건 충족 · 구매 완료 미검증'),
    'Only an explicit player-observed listing and full input may yield conditional status');
  await electronCheck.locator('input[data-purchase-number="checkoutPriceByItem"]').fill('200000');
  await electronCheck.locator('input[data-purchase-number="checkoutPriceByItem"]').press('Tab');
  assert((await electronCheck.locator('.purchase-check-result').innerText()).includes('현재 입력에서 막힌 구매 조건'),
    'Affordability must use the observed adjusted checkout price, not the base costBuy');
  await electronCheck.locator('.purchase-check-reset').click();
  assert((await electronCheck.locator('.purchase-check-result').innerText()).includes('현재 구매 가능 여부 미확인'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await dialog.locator('#closeItemTech').click();

  // The same specimen-first problem also applies to many requiresBuy
  // research gates, not only normal item.requires gates.
  await page.goto(base+'/items/#item=STR_MINIGUN',{waitUntil:'domcontentloaded'});
  const minigunLaunch=page.locator('#detail [data-open-item-tech="STR_MINIGUN"]');
  await minigunLaunch.waitFor();
  await minigunLaunch.click();
  const minigunTech=dialog.locator('.tech-viewer');
  await minigunTech.waitFor();
  await minigunTech.locator('.tech-node[data-tech-stage="1"]').filter({hasText:'상점 구매 후보'}).click();
  const minigunWarning=await minigunTech.locator('.tech-node[data-tech-stage="2"].tech-node--warning').allInnerTexts();
  assert(minigunWarning.some(x=>x.includes('첫 획득 경로 순환 주의')),
    'An item whose requiresBuy lab needs the same specimen cannot be treated as a first-supply purchase');
  await dialog.locator('#closeItemTech').click();

  await page.goto(base+'/items/#item=STR_MED_CANNON_PARTS',{waitUntil:'domcontentloaded'});
  // Same-path hash navigation does not reload the document. Wait for the
  // new item's exact ID, not an old button from the previous drawer state.
  const eventLaunch=page.locator('#detail [data-open-item-tech="STR_MED_CANNON_PARTS"]');
  await eventLaunch.waitFor();
  await eventLaunch.click();
  await dialog.locator('.tech-viewer').waitFor();
  const eventGraph=dialog.locator('.tech-viewer');
  await eventGraph.locator('.tech-node[data-tech-stage="1"]').first().click();
  await eventGraph.locator('.tech-node[data-tech-stage="2"]').first().waitFor();
  const eventGates=await eventGraph.locator('.tech-node[data-tech-stage="2"]').allInnerTexts();
  assert(eventGates.some(t=>t.includes('이벤트 발생')));
  assert(eventGates.some(t=>t.includes('지급')));
  assert(!eventGates.some(t=>t.includes('랜덤표 내부 비중')));
  await dialog.locator('#closeItemTech').click();

  // A 25mm cannon requires an actual workshop/base function. Trace it inside
  // the same map through its provider building, research, scrap and price.
  await page.goto(base+'/items/#item=STR_SMALL_CANNON',{waitUntil:'domcontentloaded'});
  await page.locator('#detail [data-open-item-tech="STR_SMALL_CANNON"]').waitFor();
  await page.locator('#detail [data-open-item-tech="STR_SMALL_CANNON"]').click();
  const cannon=dialog.locator('.tech-viewer');
  await cannon.locator('.tech-node[data-tech-stage="1"]').nth(1).click();
  const shop=cannon.locator('.tech-node[data-tech-stage="2"][data-tech-kind="facility-function"]');
  assert.equal(await shop.count(),1,'Manufacture must preserve original SHOP base-function prerequisite');
  await shop.click();
  await cannon.locator('.tech-node[data-tech-stage="3"]').click();
  const war=cannon.locator('.tech-node[data-tech-stage="4"][data-tech-kind="facility-type"]')
    .filter({hasText:'혁명 본부'});
  assert.equal(await war.count(),1,'SHOP must link to source-backed Revolution HQ provider');
  await war.click();
  assert((await cannon.locator('.tech-source-link').getAttribute('href'))
    .includes('../facilities/#facility=STR_WAR_BARRACKS'));
  const buildingDetail=await browser.newPage({viewport:{width:390,height:844}});
  try{
    await buildingDetail.goto(base+'/facilities/#facility=STR_WAR_BARRACKS',
      {waitUntil:'domcontentloaded'});
    await buildingDetail.locator('#detailDialog[open]').waitFor({timeout:60000});
    assert((await buildingDetail.locator('#detailBody').innerText()).includes('혁명 본부'),
      'Deep-linking from the tech viewer must open the actual facility dossier');
  }finally{await buildingDetail.close();}
  const construct=cannon.locator('.tech-node[data-tech-stage="5"]').filter({hasText:'시설 건설'});
  assert.equal(await construct.count(),1);
  await construct.click();
  const constructGates=await cannon.locator('.tech-node[data-tech-stage="6"]').allInnerTexts();
  assert(constructGates.some(x=>x.includes('고철')&&x.includes('3,000')),
    'Real 3,000 scrap construction input must remain a traceable item');
  assert(constructGates.some(x=>x.includes('700,000')),
    'Original facility cost must not be replaced by the cannon manufacturing price');
  assert(constructGates.some(x=>x.includes('36')&&x.includes('일')),
    'Building time must be distinct from manufacturing workload');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await dialog.locator('#closeItemTech').click();

  await page.goto(base+'/items/#item=SPC_CUM_OR_ELSE',{waitUntil:'domcontentloaded'});
  await page.locator('#detail [data-open-item-tech="SPC_CUM_OR_ELSE"]').waitFor();
  await page.locator('#detail [data-open-item-tech="SPC_CUM_OR_ELSE"]').click();
  const unsupported=dialog.locator('.tech-viewer');
  await unsupported.waitFor();
  assert((await unsupported.locator('.tech-node[data-tech-stage="1"]').innerText())
    .includes('확인된 획득 경로 없음'));
  await dialog.locator('#closeItemTech').click();
  await page.setViewportSize({width:1280,height:900});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  const desktop=await browser.newPage({viewport:{width:1280,height:900}});
  try{
    await desktop.goto(base+'/items/#item=STR_LOOTBOX_MEDICAL',{waitUntil:'domcontentloaded'});
    const open=desktop.locator('#detail [data-open-item-tech="STR_LOOTBOX_MEDICAL"]');
    await open.waitFor({timeout:80000});await open.click();
    const wide=desktop.locator('#purchaseReadinessHost details');
    await wide.waitFor({timeout:60000});
    await wide.locator('summary').click();
    const measure=await wide.evaluate(el=>{
      const r=el.getBoundingClientRect();return {left:r.left,right:r.right,viewport:innerWidth};
    });
    assert(measure.left>=0&&measure.right<=measure.viewport+1,
      'The purchase checker must be fully contained on 1280px desktop');
    assert((await wide.locator('.purchase-check-result').innerText()).includes('현재 구매 가능 여부 미확인'),
      'A new page cannot inherit guessed research/funds from a previous session');
    assert.equal(await desktop.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  }finally{await desktop.close();}
  assert.deepEqual(errors,[],'Unexpected page JavaScript errors');
  console.log('PASS item acquisition viewer: 390px + 1280px, complete AND research and 94 cycles, interactive unknown/blocked/conditional purchase readiness, monthly cap, base function, adjusted price, event/facility paths, no overflow');
}finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
}
