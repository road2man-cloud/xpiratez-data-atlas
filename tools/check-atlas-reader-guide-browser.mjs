// Human-reader acceptance gate for the 14 public DB entrances and 2.1 origin.
import assert from 'node:assert/strict';
import http from 'node:http';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const root=path.resolve('public');
const pages=['starting','captains','soldiers/modern','crafts','craft-weapons','facilities',
  'armors','items','research','manufacture','events','forces','weapons','reference'];
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
  '.gz':'application/octet-stream'};
const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,'http://localhost');
    const filename=path.resolve(root,'.'+decodeURIComponent(u.pathname),
      u.pathname.endsWith('/')?'index.html':'');
    if(!filename.startsWith(root+path.sep))throw Error('path outside public');
    const bytes=await fsp.readFile(filename);
    res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream',
      'Cache-Control':'no-store'});res.end(bytes);
  }catch{res.writeHead(404);res.end('missing');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port+'/';
const binary=[process.env.EDGE_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium',
  chromium.executablePath()]
  .find(x=>x&&fs.existsSync(x));
assert(binary,'Browser not available');
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:binary,args:['--no-sandbox']});
  for(const slug of pages){
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+slug+'/',{waitUntil:'domcontentloaded',timeout:30000});
    const guide=page.locator('[data-atlas-reader-guide]');
    await guide.waitFor({timeout:12000});
    assert.equal(await guide.count(),1,slug+' guide must be unique');
    assert((await guide.locator('.atlas-reader-head h2').textContent()).length>=8,slug+' requires readable purpose');
    assert((await guide.locator('.atlas-reader-actions > *').count())>=2,slug+' requires task navigation');
    assert.equal(await guide.evaluate(el=>el.scrollWidth>el.clientWidth+2),false,
      slug+' guide overflows narrow phone');
    const dir=guide.locator('.atlas-reader-directory');
    assert.equal(await dir.locator('.atlas-nav-group').count(),4);
    assert.equal(await dir.locator('a').count(),14);
    assert.equal(await guide.locator('.atlas-reader-id-toggle input').count(),1);
    assert.equal(await page.locator('body.atlas-show-source-ids').count(),0);
    await guide.locator('.atlas-reader-id-toggle input').check();
    assert.equal(await page.locator('body.atlas-show-source-ids').count(),1);
    await guide.locator('.atlas-reader-id-toggle input').uncheck();
    assert.equal(await page.locator('body.atlas-show-source-ids').count(),0);
    assert.deepEqual(errors,[],slug+' shared guide JS errors');
    await page.close();
  }
  const home=await browser.newPage({viewport:{width:390,height:844},isMobile:true});
  await home.goto(base,{waitUntil:'domcontentloaded'});
  await home.locator('.atlas-home-group').first().waitFor();
  assert.equal(await home.locator('.atlas-home-group').count(),4);
  assert.equal(await home.locator('.atlas-home-group a.card').count(),14);
  assert.equal(await home.locator('.atlas-home-directory:not([open])').count(),1);
  await home.close();
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'soldiers/modern/?profile=manufacture%3ASTR_THEBAN_ASSAULT_CLONE',
    {waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#originMaxima[data-validation="validated"]').waitFor({timeout:60000});
  await page.locator('#originDetails button[data-expand-origin-tree]').click();
  const guide=page.locator('#originDetails .origin-readable-guide').first();
  await guide.waitFor();
  assert((await guide.locator('.guide-card[data-guide-category="material"]').count())>=1);
  const material=guide.locator('.guide-card[data-guide-category="material"]').first();
  const previous=page.locator('#originDetails .origin-source-expansion');
  assert.equal(await previous.count(),1,'Original data can still be expanded for advanced users');
  assert.equal(await previous.evaluate(el=>el.open),false,
    'The old verbose acquisition ledger must not be visible by default');
  assert.equal(await material.locator('.guide-option').count(),3,
    'Assault clone should show shop, Egyptian start and propaganda event as three readable choices');
  assert((await material.locator('[data-quantity-method="buy"]').innerText()).includes('125,000'),
    'Clone quantity calculator must retain the exact store price');
  assert((await material.locator('[data-guide-method="EVENT:STR_START_COUNTRY_EGYPT_EVENT"] .guide-quantity').innerText())
    .includes('고정 지급 12개 / 필요 1개'),
    'Egypt start must independently cover one license without assuming an event repeats');
  assert((await material.locator('.guide-option-heading').allTextContents()).some(t=>t.includes('구매')));
  assert((await material.locator('.guide-option-heading').allTextContents()).some(t=>t.includes('보상')));
  assert.equal(await material.locator('[data-bootstrap-cycle]').count(),0,
    'Cleopatra research must not receive an invented same-item specimen-cycle warning');
  const methodsText=await material.innerText();
  assert(methodsText.includes('125,000'),'The store option should show its actual cost upfront');
  assert(methodsText.includes('12개 고정'),'Egypt start reward quantity must be readable');
  assert(methodsText.includes('3개 고정'),'Theban speech reward quantity must be readable');
  const shop=material.locator('[data-guide-method="BUY:STR_THEBAN_ASSAULT_CLONE_LICENSE"]');
  assert.equal(await shop.count(),1,'Shop purchase must remain a separate method');
  const gateText=await shop.locator('.guide-purchase-gates').innerText();
  assert(gateText.includes('클레오파트라의 도전을 완료했다'),
    'A player must see the real store-unlocking research before expanding raw rules: '+gateText);
  const preview=shop.locator('.guide-purchase-dependencies');
  assert.equal(await preview.count(),1,'All direct purchase research prerequisites should be inspectable');
  assert.equal(await preview.evaluate(el=>el.open),true,
    'Five Cleopatra laboratory prerequisites should be expanded automatically');
  assert.equal(await preview.locator('li').count(),5,
    'The default Cleopatra research route has five simultaneous direct prerequisites');
  assert((await preview.innerText()).includes('원시'),
    'The first-order prerequisite names should be visible without technical ID lookups');
  await shop.locator('.guide-option-details > summary').click();
  assert((await shop.locator('.guide-conditions').innerText()).includes('클레오파트라의 도전을 완료했다'));
  await shop.locator('[data-trace-research-root="STR_CLEO_CHALLENGE_COMPLETED"]').click();
  assert((await shop.locator('.origin-transform-research-root .origin-readable-guide').count())>=1,
    'The purchase prerequisite must open a research tree from the start of the campaign');
  assert((await shop.locator('.origin-transform-research-root').textContent()).includes('STR_MONSTER_HUNT_PRIMAL_WEREWOLF_DONE'),
    'Four primal monster hunts must be traceable upstream of Cleopatra completion');
  const sourceProof=guide.locator(':scope > .guide-technical-evidence');
  assert.equal(await sourceProof.evaluate(el=>el.open),false,
    'Source IDs must not dominate the default experience');
  assert.equal(await sourceProof.locator('.guide-source-id').first().isVisible(),false,
    'Raw identifier text must be hidden until a user asks for the source');
  const visible=await guide.locator(':scope > .guide-cards').innerText();
  assert(!visible.includes('STR_THEBAN_ASSAULT_CLONE_LICENSE'),'Raw item IDs must stay out of readable cards');
  assert((await shop.locator(':scope > .guide-option-details > .guide-conditions').innerText()).length>5);
  assert.equal(await guide.evaluate(el=>el.scrollWidth>el.clientWidth+2),false,
    'The readable birth guide must not overflow mobile');
  await sourceProof.locator(':scope > summary').click();
  assert.equal(await sourceProof.locator('.guide-source-id').first().isVisible(),true);
  const originNav=page.locator('#originDetails .atlas-detail-index');
  await originNav.waitFor({timeout:12000});
  assert((await originNav.locator('a.atlas-detail-link').count())>=3,
    'Soldier origin must expose navigable sections without raw source IDs');
  assert.equal(await originNav.evaluate(el=>el.scrollWidth>el.clientWidth+2),false,
    'Origin section navigation must fit a narrow phone');
  // A priced item can require its own specimen to unlock store purchases.
  // That is not a legal first-source purchase in the ordinary lab route.
  await page.locator('#search').fill('manufacture:STR_WILD_GIRL_RECRUITMENT');
  await page.locator('#originTable .origin-open').first().click();
  await page.locator('#originDetails button[data-expand-origin-tree]').click();
  const medallionCycle=page.locator('#originDetails [data-bootstrap-cycle="STR_MEDALLION"]');
  await medallionCycle.waitFor();
  const cycleText=await medallionCycle.innerText();
  assert(cycleText.includes('첫 구매 전 다른 공급 경로 확인 필요'));
  assert(cycleText.includes('이벤트')&&cycleText.includes('제조'),
    'Purchasable specimen cycle needs separately sourced supply alternatives');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,
    'Cyclic first-purchase notice must not overflow the mobile viewport');
  assert.deepEqual(errors,[],'Origin detail reader errors');
  await page.close();
  // Many items have hundreds of source records. Full counts must be shown
  // without pretending that only the first two events exist. Pagination must
  // work from the readable guide, without opening machine IDs.
  const pagesView=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const pageErrors=[];pagesView.on('pageerror',e=>pageErrors.push(e.message));
  await pagesView.goto(base+'soldiers/modern/?profile=manufacture%3ASTR_GLAMOUR_RECRUITMENT',
    {waitUntil:'domcontentloaded',timeout:30000});
  await pagesView.locator('#originMaxima[data-validation="validated"]').waitFor({timeout:60000});
  await pagesView.locator('#originDetails button[data-expand-origin-tree]').click();
  const glamour=pagesView.locator('#originDetails .guide-card[data-guide-item="STR_GLAMOUR"]').first();
  await glamour.waitFor({timeout:15000});
  assert.equal(await glamour.locator('[data-indexed-source-count="255"]').count(),1,
    'Glamour must show every indexed source record, not only a seven-option preview');
  assert.equal(await glamour.locator('.guide-option[data-guide-method^="EVENT:"]').count(),2,
    'The initial page deliberately contains two real event options');
  const glamourQuantities=await glamour.locator('.guide-option[data-guide-method^="EVENT:"] .guide-quantity').allInnerTexts();
  assert(glamourQuantities[0].includes('고정 지급 10개 / 필요 250개')&&
    glamourQuantities[0].includes('240개 부족')&&
    glamourQuantities[1].includes('고정 지급 20개 / 필요 250개')&&
    glamourQuantities[1].includes('230개 부족'),
    'USA and Japan start rewards must be independent and cannot be combined');
  assert.equal(await glamour.locator('.guide-more-sources[data-more-category="event"] button[data-required-quantity="250"]').count(),1,
    'Required 250 Glamour must be carried to the continuation button');
  const moreEvents=glamour.locator('.guide-more-sources[data-more-category="event"]').first();
  const trigger=moreEvents.locator(':scope > .guide-more-button');
  await trigger.click();
  assert.equal(await trigger.getAttribute('aria-expanded'),'true');
  const eventContinuation=moreEvents.locator(':scope > .guide-more-target');
  assert.equal(await eventContinuation.locator('.guide-option[data-guide-method^="EVENT:"]').count(),6,
    'The next page must expose six more distinct event choices');
  assert((await eventContinuation.locator('.guide-option[data-guide-method^="EVENT:"]').first()
    .locator('.guide-quantity').innerText()).includes('필요 250개'),
    'Additional event sources must compare their yield against the same birth requirement');
  assert.equal(await eventContinuation.locator('[data-more-category="event"] [data-required-quantity="250"]').count(),1,
    'A third event page must inherit the quantity context');
  assert.equal(await eventContinuation.locator('[data-more-category="event"] [data-trace-offset="8"]').count(),1,
    'Event pages must offer the next 9-14 sources without raw technical navigation');
  await trigger.click();
  assert.equal(await trigger.getAttribute('aria-expanded'),'false');
  assert.equal(await eventContinuation.locator('.origin-readable-guide').count(),0,
    'The expanded source page must be collapsible to avoid massive DOMs');
  const moreMaps=glamour.locator('.guide-more-sources[data-more-category="map"]').first();
  await moreMaps.locator(':scope > button').click();
  assert((await moreMaps.locator('.guide-more-target .guide-card[data-guide-category="method-page"]').count())>=1,
    'Map block sources must also have a human-readable next page');
  assert.equal(await pagesView.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,
    'Lazy-loaded supply options must not overflow a 390px phone');
  assert.deepEqual(pageErrors,[],'Paged 2.1 acquisition guide errors');
  await pagesView.close();
  // A real event detail must supply accessible, actionable section navigation.
  // This checks runtime content, not a synthetic injected test fixture.
  const eventPage=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const eventErrors=[];eventPage.on('pageerror',e=>eventErrors.push(e.message));
  await eventPage.goto(base+'events/',{waitUntil:'domcontentloaded',timeout:30000});
  await eventPage.locator('#eventTable tbody tr[data-id]').first().waitFor({timeout:30000});
  await eventPage.locator('#eventTable tbody tr[data-id]').first().click();
  await eventPage.locator('#detail .atlas-detail-index').waitFor({timeout:30000});
  const nav=eventPage.locator('#detail .atlas-detail-index');
  assert((await nav.locator('a.atlas-detail-link').count())>=3,
    'Real event detail must have multiple navigable information sections');
  assert.equal(await nav.evaluate(el=>el.scrollWidth>el.clientWidth+2),false,
    'Detail navigation must not overflow the 390px mobile viewport');
  const firstJump=nav.locator('a.atlas-detail-link').first();
  const firstTarget=(await firstJump.getAttribute('href')).slice(1);
  await firstJump.click();
  assert.equal(await eventPage.locator('#'+firstTarget).getAttribute('tabindex'),'-1',
    'Detail navigation must focus the selected section');
  assert.equal(await eventPage.locator('#detail details:not([open]) pre').first().isVisible(),false,
    'Original technical event details remain collapsed by default');
  assert.deepEqual(eventErrors,[],'Event detail navigation errors');
  const shotDir=process.env.TEMP||process.env.TMP||'.';
  await nav.screenshot({path:path.join(shotDir,'xpiratez-reader-mobile-390.png')});
  await eventPage.setViewportSize({width:1280,height:900});
  assert.equal(await nav.evaluate(el=>el.scrollWidth>el.clientWidth+2),false,
    'Detail navigation must not overflow desktop layout');
  await nav.screenshot({path:path.join(shotDir,'xpiratez-reader-desktop-1280.png')});
  await eventPage.close();
  console.log('PASS real event details: mobile section links, navigation, technical evidence collapsed');
  console.log('PASS readable site-wide guide in all 14 DBs, four homepage categories, 390px mobile');
  console.log('PASS assault clone: 3 plain-language acquisition methods, source IDs collapsed, detailed evidence preserved');
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
