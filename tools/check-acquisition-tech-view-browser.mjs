// Real Chrome/Edge QA for the game-style left-to-right acquisition viewer.
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
    const u=new URL(req.url,'http://localhost');
    const filename=path.resolve(root,'.'+decodeURIComponent(u.pathname),
      u.pathname.endsWith('/')?'index.html':'');
    if(!filename.startsWith(root+path.sep))throw Error('outside public');
    const bytes=await fsp.readFile(filename);
    res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream',
      'Cache-Control':'no-store'});res.end(bytes);
  }catch{res.writeHead(404);res.end('missing');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const binary=[process.env.EDGE_PATH,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',chromium.executablePath()]
  .find(x=>x&&fs.existsSync(x));
assert(binary,'Chromium/Edge browser executable missing');
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:binary,args:['--no-sandbox']});
  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  mobile.setDefaultTimeout(25000);
  const errors=[];mobile.on('pageerror',e=>errors.push(e.message));
  await mobile.goto(base+'/soldiers/modern/?profile=manufacture%3ASTR_THEBAN_ASSAULT_CLONE',
    {waitUntil:'domcontentloaded'});
  await mobile.locator('#originMaxima[data-validation="validated"]').waitFor({timeout:70000});
  const graph=mobile.locator('#originDetails .tech-viewer');
  await graph.waitFor();
  const scroll=graph.locator('.tech-viewport');
  assert.equal(await graph.locator('.tech-original').evaluate(el=>el.open),false);
  assert.equal(await graph.locator('.origin-readable-guide').count(),0,
    'Default screen must not reproduce nested card grids');
  assert.equal(await graph.locator('.tech-node[data-tech-stage="0"]').count(),1);
  const birthGoal=await graph.locator('.tech-node[data-tech-stage="0"]').innerText();
  assert(birthGoal.includes('돌격 클론')&&!birthGoal.includes('농부'),
    'The graph goal must name the selected birth source, not its intermediate recruit body');
  assert((await graph.locator('.tech-node[data-tech-stage="1"]').count())>=3);
  assert((await graph.locator('.tech-wires path').count())>=3);
  assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,
    'A horizontal tech map must never enlarge the document width');
  const select=async(stage,index)=>{
    const node=graph.locator('.tech-node[data-tech-stage="'+stage+'"][data-tech-index="'+index+'"]');
    await node.click();
    return node;
  };
  await select(1,1); // material requirement, not a different research
  assert((await graph.locator('.tech-node[data-tech-stage="2"]').count())>=1);
  await select(2,0); // indexed physical license
  await select(3,0); // OR: independent supply methods
  const choices=graph.locator('.tech-node[data-tech-stage="4"]');
  assert.equal(await choices.count(),3,'Three source-backed license supply routes');
  assert((await choices.nth(0).innerText()).includes('상점에서 구매'));
  assert((await choices.nth(1).innerText()).includes('시작 국가 보상')||
    (await choices.nth(1).innerText()).includes('이벤트'));
  await select(4,0); // store
  const selected=graph.locator('.tech-selected');
  assert((await selected.innerText()).includes('상위 목표로 돌아가기'));
  assert((await selected.innerText()).includes('원본 상세 조건표 열기'));
  assert((await selected.innerText()).includes('선택한 노드'));
  assert((await graph.locator('.tech-node-icon').count())>0,
    'Node types must include immediately recognizable icons');
  await selected.locator('.tech-node-source summary').click();
  assert((await selected.locator('.tech-node-source code').innerText()).includes('BUY:'),
    'Selected node must expose the actual source identifier');
  const store=graph.locator('.tech-node[data-tech-stage="5"]');
  assert((await store.allInnerTexts()).some(t=>t.includes('클레오파트라의 도전을 완료했다')),
    'Store must show its requiresBuy research as a real upstream node');
  assert((await store.allInnerTexts()).some(t=>t.includes('125,000')),
    'Real shop price and missing-stock caveat are still visible');
  assert((await graph.locator('.tech-wire--alternative').count())>0);
  assert((await graph.locator('.tech-wire--required').count())>0);
  const span=await scroll.evaluate(el=>({client:el.clientWidth,total:el.scrollWidth}));
  assert(span.total>span.client*2,'Several prerequisite stages must be pan-scrollable horizontally');
  await select(4,2); // mutually alternative diplomatic speech
  const scripts=graph.locator('.tech-node[data-tech-stage="5"]');
  assert.equal(await scripts.count(),4,'Four independent event scripts must stay separate');
  await select(5,2); // third script, propaganda AND revolutionary headquarters
  const direct=await graph.locator('.tech-node[data-tech-stage="6"]').allInnerTexts();
  assert(direct.some(t=>t.includes('선전물')),'Third script requires propaganda research');
  assert(direct.some(t=>t.includes('혁명 본부')),'Third script also requires the war barracks');
  assert(direct.some(t=>t.includes('23%')),'Script execution odds must not disappear');
  assert(!direct.some(t=>t.includes('아직 펼치지 않은 선행 조건')),
    'Traversal limits are not original game prerequisites');
  if(process.env.ATLAS_TECH_SCREENSHOT==='1'){
    await graph.screenshot({path:path.join(os.tmpdir(),'xpiratez-tech-mobile.png')});
  }
  const widths=await graph.evaluate(el=>({
    left:el.querySelector('[data-tech-stage="6"]').getBoundingClientRect().left,
    right:el.querySelector('[data-tech-stage="0"]').getBoundingClientRect().left
  }));
  assert(widths.left<widths.right,'Prerequisites are laid out left-to-right toward the goal');
  const beforeZoom=await graph.locator('.tech-column').first().evaluate(el=>el.getBoundingClientRect().width);
  await graph.locator('[data-tech-action="zoom-in"]').click();
  const afterZoom=await graph.locator('.tech-column').first().evaluate(el=>el.getBoundingClientRect().width);
  assert(afterZoom>beforeZoom,'Zoom-in must visibly enlarge nodes');
  await graph.locator('[data-tech-action="reset"]').click();
  assert.equal(await graph.locator('.tech-column').count(),2,'Reset restores the initial graph');
  await select(1,1);
  assert.equal(await graph.locator('.tech-column').count(),3);
  await graph.locator('[data-tech-action="back"]').click();
  assert.equal(await graph.locator('.tech-column').count(),2,
    'Selected node panel must navigate back to the parent goal');
  await graph.locator('[data-tech-action="source"]').click();
  assert.equal(await graph.locator('.tech-original').evaluate(el=>el.open),true,
    'Selected node can open source evidence directly');
  graph.locator('.tech-original').evaluate(el=>el.open=false);
  const proof=graph.locator('.tech-original');
  await proof.locator('summary').click();
  await proof.locator('.origin-readable-guide').waitFor();
  assert((await proof.locator('.guide-card[data-guide-category="material"]').count())>0,
    'Complete legacy AND/OR evidence remains accessible on request');
  assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await mobile.setViewportSize({width:1280,height:900});
  const desktopSize=await graph.evaluate(el=>({actual:el.getBoundingClientRect().width,
    viewport:el.querySelector('.tech-viewport').clientWidth}));
  assert(desktopSize.actual>=900,'Desktop graph must use the available content width');
  const geometry=await graph.evaluate(el=>{
    const viewport=el.querySelector('.tech-viewport'),canvas=el.querySelector('.tech-canvas'),
      columns=el.querySelector('.tech-columns');
    const nodes=[...el.querySelectorAll('.tech-node')].map(n=>{
      const r=n.getBoundingClientRect();return {stage:n.dataset.techStage,x:r.x,y:r.y,width:r.width};
    });
    return {client:viewport.clientWidth,scrollWidth:viewport.scrollWidth,scrollLeft:viewport.scrollLeft,
      viewportX:viewport.getBoundingClientRect().x,
      canvasX:canvas.getBoundingClientRect().x,canvasWidth:canvas.getBoundingClientRect().width,
      columnsX:columns.getBoundingClientRect().x,columnsWidth:columns.getBoundingClientRect().width,nodes};
  });
  assert.equal(geometry.scrollLeft,0,
    'After zoom/reset and desktop resize, stale SVG width cannot push nodes offscreen');
  assert(geometry.nodes.length>=2&&geometry.nodes.every(n=>
    n.x+n.width>geometry.viewportX&&n.x<geometry.viewportX+geometry.client),
  'All current graph nodes must remain visible after narrowing/widening the viewport');
  assert.equal(geometry.scrollWidth,geometry.client,
    'The reset two-column graph must not retain scroll width from a much larger old graph');
  assert.equal(await graph.locator('.tech-legend').count(),1);
  if(process.env.ATLAS_TECH_SCREENSHOT==='1'){
    await proof.locator(':scope > summary').click(); // preview actual default, not raw proof
    await graph.screenshot({path:path.join(os.tmpdir(),'xpiratez-tech-desktop.png')});
    console.log('Tech-viewer preview saved in '+os.tmpdir());
  }
  assert.deepEqual(errors,[],'Browser JavaScript errors');
  console.log('PASS horizontal tech map: mobile 390px + desktop 1280px, 3 license methods, 4 scripts, source AND/OR wires, store gates, pan, zoom, reset, lazy original evidence');
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
