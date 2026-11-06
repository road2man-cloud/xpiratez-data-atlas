import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {createHash} from 'node:crypto';import {chromium} from 'playwright-core';
import {encodeOriginReport,decodeOriginReport} from './origin-report-codec.mjs';
const root=path.resolve('public');const external=process.argv.find(x=>x.startsWith('--base='))?.slice(7);let server;
if(!external){server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://localhost');let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!file.startsWith(root+path.sep)||!fs.existsSync(file))throw Error('404');res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.gz':'application/octet-stream'})[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res)}catch{res.writeHead(404).end('not found')}});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));}
const base=external||'http://127.0.0.1:'+server.address().port+'/';
const url=p=>new URL(p,base).href;
const chrome=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium',chromium.executablePath()].find(fs.existsSync);
if(!chrome){server?.close();throw Error('Browser required for the deployed catalog gate')}
let browser;
try{
 browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
 await page.goto(url(''),{waitUntil:'domcontentloaded'});
 assert.equal(await page.locator('a.card[href="./soldiers/"]').count(),1);
 assert.equal(await page.locator('a[href="./trainings/"]').count(),0);
 await page.locator('a.card[href="./soldiers/"]').click();
 await page.waitForFunction(()=>document.querySelector('#originMaxima')?.dataset.validation==='validated',null,{timeout:60000});
 assert.equal(await page.locator('#originTable tbody tr[data-origin-id]').count(),72);
 assert.equal(await page.locator('input[type=file]').count(),0);
 assert.equal(await page.locator('#transformationPlanner,#legacyMaximaArchive,#maximaTable').count(),0);
 assert.equal(await page.locator('#catalogMetric').inputValue(),'growth');
 const dependencyAudit=await (await page.request.get(url('data/soldier-route-dependency-audit.json'))).json();
 assert.equal(dependencyAudit.kind,'soldier-route-dependency-pruning-v1');
 assert.deepEqual([dependencyAudit.stats.claims,dependencyAudit.stats.withResearchRemoved,
   dependencyAudit.stats.withInputAssumptionsRemoved],[28,25,28]);
 assert((await page.locator('#routePruningScope').innerText()).includes('연구·지급 단계 추가 생략 25건'));
 const expectedReport=decodeOriginReport(await (await page.request.get(url('data/soldier-origin-candidates.json'))).json());
 const expectedSummary=expectedReport.summary;
 assert.equal(expectedSummary.profiles,72);
 assert((await page.locator('#catalogSummary').innerText()).includes(expectedSummary.withCompleteResearch+'/72'));
 assert((await page.locator('#catalogSummary').innerText()).includes(String(expectedSummary.witnesses-61)));
 const chort=page.locator('#chortTarget[data-target-type="STR_SOLDIER_CHORT"]');
 assert.equal(await chort.count(),1,'Chort is a separate terminal body, not a new birth profile');
 const factValues=await chort.locator('.terminal-facts strong').allTextContents();
 assert.deepEqual(factValues,['16','42','17','25']);
 assert((await chort.locator('.terminal-gate').innerText()).includes('Psi 강도 40 이상'));
 await chort.locator('.terminal-source-types > summary').click();
 assert.equal(await chort.locator('.terminal-type-list span').count(),16);
 assert((await chort.locator('.terminal-type-list').innerText()).includes('농부'));
 await chort.locator('.terminal-source-origins > summary').click();
 assert.equal(await chort.locator('.terminal-source-list [data-open-origin]').count(),42);
 assert((await chort.locator('.terminal-source-list').innerText()).includes('20~70'));
 await chort.locator('.terminal-verified-paths > summary').click();
 assert.equal(await chort.locator('[data-open-shared-candidate]').count(),3);
 assert((await chort.locator('.terminal-paths').innerText()).includes('2,131'));
 assert((await page.locator('#catalogSummary').innerText()).includes('코르트 변신 61건은 별도 병종'));
 assert.equal(await page.locator('#originTable tbody tr[data-origin-id]').count(),72);
 assert.deepEqual(await page.locator('#originTable thead th').allTextContents(),
   ['출생처 / 최초 병종','상태','12종 합계','TU','기력','체력','용기','반응','사격','투척','근접','근력','Psi 강도','Psi 기술','Mana']);
 const score12=async()=>{
   const cells=await page.locator('#originTable tbody tr[data-origin-id] td').allTextContents();
   assert.equal(cells.length,15);
   const read=text=>Number(text.trim().replaceAll(',',''));
   const total=read(cells[2]),stats=cells.slice(3).map(read);
   assert(stats.every(Number.isInteger));assert.equal(total,stats.reduce((sum,n)=>sum+n,0));
   return {total,mana:stats[11]};
 };
 console.log('PASS 72 independent origins: 4306 ranked candidates, 61 Chort terminal paths separately retained, 16 permitted bodies, 42 source origins and 12 stats; no save/custom trainer');
 await page.locator('#search').fill('direct:STR_SOLDIER_PEASANT');
 assert.equal(await page.locator('#originTable tbody tr[data-origin-id]').count(),1);
 const grown=(await score12()).total;
 assert(grown>0);
 await page.locator('#catalogMetric').selectOption('provisional');
 const provisional=(await score12()).total;
 assert(provisional>0&&grown>=provisional,'Endgame growth ceiling must not be a birth/ungrown score');
 await page.locator('#originTable [data-open-origin="direct:STR_SOLDIER_PEASANT"]').click();
 await page.waitForFunction(()=>document.querySelector('#originDetails')?.textContent.includes('연구 경로 재생 완료'),null,{timeout:60000});
 const detail=await page.locator('#originDetails').innerText();
 assert(detail.includes('사전 완료 연구 0개')&&detail.includes('잠정')&&detail.includes('가정'));
 assert(detail.includes('전역 최적성: 미증명'));
 assert(await page.locator('#originDetails [data-exclusion="oneway"]').count()>0);
 assert(await page.locator('#originDetails [data-exclusion="bidirectional"]').count()>0);
 assert(await page.locator('#originDetails [data-closure="new-in-step"]').count()>0);
 assert((await page.locator('#originDetails').textContent()).includes('이 연구 단계에서 새로 폐쇄 확인'),
   'Directional disable links must distinguish observed closure time from final disabled state');
 await page.locator('#originDetails .branch-choice').evaluateAll(nodes=>nodes.forEach(x=>x.open=true));
 await page.locator('#originDetails .branch-choice [data-research-node="STR_CAPTAIN_PUSSY"]').first().click();
 await page.locator('#researchDialog[open]').waitFor();
 const relations=await page.locator('#researchDetail').innerText();
 for(const text of ['좌측 · 이 연구의 조건','우측 · 이 연구의 영향','무조건 필요','조건 충족','직접 해금','필수로 요구됨','조건으로 사용됨','직접 해금함'])assert(relations.includes(text),text);
 await page.locator('#researchDetail .research-extra').evaluate(x=>x.open=true);
 assert((await page.locator('#researchDetail').innerText()).includes('무료 지급 후보'));
 assert((await page.locator('#researchDetail').innerText()).includes('일방향 배제'));
 assert((await page.locator('#researchDetail').innerText()).includes('양방향 배제'));
 await page.locator('#closeResearchDialog').click();
 await page.locator('#catalogMetric').selectOption('certified');
 assert.equal((await page.locator('#originTable .score').innerText()).trim(),'—');
 await page.locator('#catalogMetric').selectOption('birth');
 const birth=Number((await page.locator('#originTable .score').innerText()).replaceAll(',',''));
 assert(birth<provisional,'Provisional training must not be conflated with source birth');
 await page.locator('#catalogMetric').selectOption('provisional');
 assert.equal(Number((await page.locator('#originTable .score').innerText()).replaceAll(',','')),provisional);
 await page.locator('#catalogMetric').selectOption('growth');
 assert.equal(Number((await page.locator('#originTable .score').innerText()).replaceAll(',','')),grown);
 await page.locator('#originTable .origin-open').click();
 await page.waitForFunction(()=>document.querySelector('#originDetails')?.textContent.includes('성장 완료 가정'),null,{timeout:60000});
 assert((await page.locator('#originDetails').innerText()).includes('동시 달성'));
 assert((await page.locator('#originDetails [data-growth-stamina-basis]').innerText()).includes('원시 성장캡'),
   'Growth values must expose the raw rule cap, raw projection, and bonus');
 console.log('PASS one real chronological record replayed; growth-cap ceiling default is distinct from ungrown stats and does not claim actual attainment');
 await page.locator('#search').fill('manufacture:STR_THEBAN_ASSAULT_CLONE');
 assert.equal(await page.locator('#originTable tbody tr[data-origin-id]').count(),1);
 assert.notEqual(Number((await page.locator('#originTable .score').innerText()).replaceAll(',','')),provisional);
 assert((await page.locator('#originTable tbody tr[data-origin-id="manufacture:STR_THEBAN_ASSAULT_CLONE"]').innerText()).includes('코르트 변환 상한 2,131 · 기본 비교 제외'));
 assert.notEqual((await page.locator('#originTable tbody tr[data-origin-id="manufacture:STR_THEBAN_ASSAULT_CLONE"] .score').innerText()).trim(),'2,131',
   'Shared Chort cap must not overwrite assault clone own final-type ranking');
 await page.locator('#originTable .origin-open').click();
 await page.waitForFunction(()=>document.querySelector('#originDetails')?.textContent.includes('연구 경로 재생 완료'),null,{timeout:60000});
 assert.equal(await page.locator('#originDetails [data-excluded-terminal="STR_SOLDIER_CHORT"]').count(),1);
 assert((await page.locator('#originDetails [data-excluded-terminal="STR_SOLDIER_CHORT"]').innerText()).includes('2,131'));
 const cloneEfficiency=page.locator('#originDetails .origin-route-efficiency');
 assert.equal(await cloneEfficiency.count(),1);
 assert.equal(await cloneEfficiency.getAttribute('data-exact-peers'),'2');
 assert.equal(await cloneEfficiency.getAttribute('data-different-vector'),'0');
 await cloneEfficiency.locator('summary').click();
 assert((await cloneEfficiency.innerText()).includes('시술 2단계'));
 assert.equal(await cloneEfficiency.locator('button[data-candidate]').count(),1,
   'Same-stat alternatives must be selectable without altering their original witnesses');
 assert(!(await page.locator('#originDetails .detail-head + p').innerText()).includes('출생 → 코르트'),
   'Default assault clone goal must remain its own target, never Chort');
 const provenance=page.locator('#originDetails .origin-source-expansion');
 assert.equal(await provenance.count(),1);
 assert.equal(await provenance.evaluate(el=>el.open),false,
   'Raw source-ID listing must be collapsed by default for general users');
 await provenance.locator(':scope > summary').click();
 const acquisition=provenance.locator('.origin-acquisition');
 assert.equal(await acquisition.count(),1);
 assert((await acquisition.innerText()).includes('최초 생성 방식: 제조를 통한 병사 생성'));
 assert((await acquisition.innerText()).includes('돌격 클론 면허'));
 assert((await acquisition.innerText()).includes('연구 비용 3'));
 await acquisition.locator('[data-required-item="STR_THEBAN_ASSAULT_CLONE_LICENSE"] > summary').click();
 assert((await acquisition.innerText()).includes('구매: 125,000 / 1개'));
 await acquisition.locator('[data-event="STR_START_COUNTRY_EGYPT_EVENT"] > summary').click();
 await acquisition.locator('[data-event="STR_REVOLUTIONARY_SPEECH_THEBES"] > summary').click();
 const acquired=await acquisition.innerText();
 assert(acquired.includes('12개 고정'));
 assert(acquired.includes('3개 고정'));
 assert(acquired.includes('같은 이벤트의 연구 직접 지급'));
 for(const script of ['STR_PROPAGANDA_1','STR_PROPAGANDA_2','STR_PROPAGANDA_3','STR_PROPAGANDA_4'])
   assert.equal(await acquisition.locator('[data-script="'+script+'"]').count(),1);
 assert.equal(await acquisition.locator('[data-open-origin="manufacture:STR_ROGUE_CLONE_RECRUITMENT"]').count(),1);
 assert.equal(await acquisition.locator('[data-open-origin="manufacture:STR_THEBAN_ASSAULT_CATGIRL_RECRUITMENT"]').count(),1);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,
   'Expanded license sources and alternative origins must fit a mobile viewport');
 await page.setViewportSize({width:1440,height:950});
 await acquisition.locator('.origin-related > summary').click();
 await acquisition.locator('[data-open-origin="manufacture:STR_ROGUE_CLONE_RECRUITMENT"]').click();
 await page.waitForFunction(()=>document.querySelector('#originDetails')?.querySelector('[data-acquisition-profile="manufacture:STR_ROGUE_CLONE_RECRUITMENT"]')!==null,{timeout:60000});
 assert((await page.locator('#originDetails').innerText()).includes('외톨이 클론'));
 console.log('PASS assault-clone acquisition: store license 125000, Egypt 12, Theban speech 3+research, four OR scripts, sibling births, mobile details');
 await page.locator('#chortTarget [data-open-shared-candidate]').first().click();
 await page.waitForFunction(()=>document.querySelector('#originDetails')?.textContent.includes('코르트 별도 병종 경로'),null,{timeout:60000});
 const chortDetails=await page.locator('#originDetails').innerText();
 assert(chortDetails.includes('코르트')&&chortDetails.includes('출생처 기본 비교에서 제외된 변신 증거'));
 const chortPruning=page.locator('#originDetails .origin-route-pruning');
 assert(Number(await chortPruning.getAttribute('data-pruning-proofs'))>=1,
   'The independent Chort catalog must expose chronologically replayed training-omission evidence');
 await chortPruning.locator('summary').click();
 assert.equal(await chortPruning.locator('[data-dependency-proof]').count(),
   Number(await chortPruning.getAttribute('data-pruning-proofs')),
   'Each Chort training omission must include its own research and material audit');
 assert((await chortPruning.innerText()).includes('캠페인 재생 및 성장 상한 12종 일치'));
 assert.equal(await page.locator('#originDetails .shared-terminal-origin-note').count(),1);
 assert((await page.locator('#originDetails .detail-head + p').innerText()).includes('코르트'),
   'Chort path remains fully viewable from its own separate Soldier unit');
 const chortAlternatives=page.locator('#originDetails [data-candidate]');
 assert(await chortAlternatives.count()>0);
 const chortIds=new Set(expectedReport.records.flatMap(r=>r.candidates.filter(c=>
   c.finalSoldierType==='STR_SOLDIER_CHORT').map(c=>c.id)));
 const displayedIds=await chortAlternatives.evaluateAll(nodes=>nodes.map(x=>x.dataset.candidate));
 assert(displayedIds.every(id=>chortIds.has(id)),
   'The separate Chort view must compare ONLY source-validated Chort terminal alternatives: '+
     JSON.stringify(displayedIds.filter(id=>!chortIds.has(id)).slice(0,5)));
 await chortAlternatives.last().evaluate(el=>{el.closest('details').open=true});
 await chortAlternatives.last().click();
 await page.waitForFunction(()=>document.querySelector('#originDetails')?.textContent.includes('코르트 별도 병종 경로'),null,{timeout:60000});
 assert((await page.locator('#originDetails .detail-head + p').innerText()).includes('→ 코르트'),
   'Switching Chort candidates must remain within the separate terminal record');
 await page.locator('#search').fill('manufacture:STR_THEBAN_ASSAULT_CLONE');
 await page.locator('#originTable .origin-open').click();
 await page.waitForFunction(()=>document.querySelector('#originDetails')?.textContent.includes('코르트 변신은 별도 병종으로 비교합니다'),null,{timeout:60000});
 assert(!(await page.locator('#originDetails .detail-head + p').innerText()).includes('→ 코르트'),
   'A normal origin click must never inherit the special Chort terminal selection');
 console.log('PASS separate Chort body: original 2131-point route openable only from terminal unit, while source birth default is distinct and annotated');
 const poltergeist=expectedReport.records.find(r=>r.profileId==='manufacture:STR_POLTERGEIST_EMBODIMENT');
 const poltergeistBest=poltergeist.candidates.find(c=>c.id===poltergeist.bestCandidateId);
 assert(poltergeistBest&&poltergeistBest.total>=453);
 await page.locator('#search').fill(poltergeist.profileId);
 assert((await score12()).total>poltergeistBest.total,'Mana must actually be included, not a blank 12th column');
 await page.locator('#originTable .origin-open').click();
 await page.waitForFunction(()=>document.querySelector('#originDetails')?.textContent.includes('연구 경로 재생 완료'),null,{timeout:60000});
 assert((await page.locator('#originDetails').textContent()).includes('전역 최적성: 미증명'));
 const routeEfficiency=page.locator('#originDetails [data-route-efficiency="true"]');
 assert.equal(await routeEfficiency.count(),1,'Origin detail must expose same-vector route efficiency');
 assert(Number(await routeEfficiency.getAttribute('data-equal-vector-count'))>=2,
   'Known Poltergeist route has a fully equivalent shorter-step alternative');
 assert((await routeEfficiency.locator('summary').innerText()).includes('시술 3단계'),
   'Poltergeist default must prefer the 3-stage route over the older 4-stage tie');
 assert((await routeEfficiency.textContent()).includes('연구·재료·시간'),
   'An efficient recorded route cannot claim unknown resources are optimized');
 assert((await routeEfficiency.textContent()).includes('연구·시술 잠정 합계'),
   'Equivalent endgame ceilings can differ in immediate power and must expose it');
 assert((await routeEfficiency.textContent()).includes('성장에 필요한 시간'),
   'Fewer training steps cannot be claimed to minimize unknown growth effort');
 await page.locator('#originDetails .assumptions').evaluate(el=>el.open=true);
 const poltergeistDetail=await page.locator('#originDetails').innerText();
 assert(Number(await page.locator('#originDetails .origin-route-pruning').getAttribute('data-pruning-proofs'))>=1,
   'A normal non-Chort birth must retain its own independently replayed training-omission evidence');
 await page.locator('#originDetails .origin-route-pruning > summary').click();
 const poltergeistDependency=page.locator('#originDetails [data-dependency-proof]').first();
 assert.equal(await poltergeistDependency.getAttribute('data-research-removed'),'1');
 assert.equal(await poltergeistDependency.getAttribute('data-input-removed'),'1');
 assert((await poltergeistDependency.innerText()).includes('외부 확보 가정'));
 assert((await poltergeistDependency.innerText()).includes('50,000'));
 assert(poltergeistDetail.includes('STR_BLESSINGS'),
   'The selected compatible route must show its actual difficulty-1 event source');
 assert(!poltergeistDetail.includes('STR_ENJOYING_THE_DREAM'),
   'The mutually exclusive difficulty-0 event belongs only to archived counterexamples');
 assert(poltergeistDetail.includes('무료 지급 추첨 결과를 가정'));
 console.log('PASS Poltergeist selected route excludes impossible mixed-difficulty event and retains conditional free-research evidence');
 await page.locator('#search').fill('manufacture:STR_APOSTATE_OF_APOCALYPSE_RECRUITMENT');
 assert((await page.locator('#originTable .origin-route-tie').innerText()).includes('능력치·병종 다름 1'));
 await page.locator('#originTable .origin-open').click();
 await page.waitForFunction(()=>document.querySelector('#originDetails')?.textContent.includes('연구 경로 재생 완료'),null,{timeout:60000});
 const mixedVector=page.locator('#originDetails .origin-route-efficiency');
 assert.equal(await mixedVector.getAttribute('data-different-vector'),'1');
 await mixedVector.locator(':scope > summary').click();
 assert((await mixedVector.textContent()).includes('동등한 육성 결과로 합치지 않았습니다'));
 const tradeoff=page.locator('#originDetails [data-same-total-different-vector]');
 assert.equal(await tradeoff.count(),1,'Different 12-stat vectors at equal sum must be shown separately');
 assert(Number(await tradeoff.getAttribute('data-same-total-different-vector'))>=1);
 assert((await tradeoff.textContent()).includes('능력치')&&await tradeoff.locator('button[data-candidate]').count()>0,
   'Stat allocation tradeoff must link to its original candidate witness');
 await tradeoff.locator(':scope > summary').click();
 assert((await tradeoff.innerText()).includes('동등한 육성 결과로 합치지 않았습니다'),
   'Expanded stat-tradeoff disclaimer must be visible');
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,
   'Detailed stat-tradeoff alternatives must not create mobile horizontal overflow');
 await page.setViewportSize({width:1440,height:950});
 console.log('PASS same-score different body/stat tradeoffs stay distinct and navigable on mobile');
 await page.locator('#search').fill('direct:STR_SOLDIER_DOLL');
 await page.locator('#originTable .origin-open').click();
 await page.waitForFunction(()=>document.querySelector('#originDetails .detail-head h2')?.textContent.includes('영혼 인형'),null,{timeout:60000});
 assert((await page.locator('#originDetails [data-route-efficiency] summary').first().innerText()).includes('시술 1단계'),
   'Doll must retain its shorter one-training equal-ceiling source route');
 const catgirl=expectedReport.records.find(r=>r.profileId==='manufacture:STR_CATGIRL_WARRIOR_RECRUITMENT');
 const catgirlBest=catgirl?.candidates.find(c=>c.id===catgirl.bestCandidateId);
 assert(catgirlBest&&catgirlBest.total>=620&&catgirlBest.researchCount>=627);
 await page.locator('#search').fill(catgirl.profileId);
 const catgirlGrowth=await score12();
 await page.locator('#catalogMetric').selectOption('provisional');
 const catgirlShown=await score12();
 assert(catgirlGrowth.total>=catgirlShown.total,'Endgame max must not be lower than ungrown witness');
 assert(catgirlShown.total>=660,'New proven growth paths must not lower the original 660-point 12-stat route');
 assert.equal(catgirlShown.mana,40,'A 12-stat growth candidate must preserve and display real Mana');
 await page.locator('#originTable .origin-open').click();
 await page.waitForFunction(()=>document.querySelector('#originDetails')?.textContent.includes('연구 경로 재생 완료'),null,{timeout:60000});
 assert((await page.locator('#originDetails').innerText()).includes('전역 최적성: 미증명'));
 console.log('PASS Nekomimi warrior retains '+catgirlShown.total+' ungrown 12-stat score (Mana 40), with separate '+catgirlGrowth.total+' growth ceiling');
 await page.locator('#catalogMetric').selectOption('growth');
 const pending=expectedReport.records.find(r=>!r.candidates.length);
 if(pending){
   await page.locator('#search').fill(pending.profileId);
   assert.equal((await page.locator('#originTable .score').innerText()).trim(),'—');
   await page.locator('#originTable .origin-open').click();
   await page.waitForFunction(()=>document.querySelector('#originDetails')?.textContent.includes('완결 연구 경로 미확보'));
   assert((await page.locator('#originDetails').innerText()).includes('영구 불가능 판정이 아닙니다'));
   assert((await page.locator('#originDetails').innerText()).includes('상위 연구·이벤트 근거'));
   assert(await page.locator('#originDetails li [data-research-node]').count()>0,
     'Unresolved origins must identify the first missing research/event evidence, not a fabricated stat');
 }
 console.log('PASS independent clone/farmer origins and unresolved paths never receive fabricated maxima');
 await page.goto(url('trainings/?training=STR_BASIC_FIREARMS_TRAINING'));
 await page.waitForFunction(()=>document.querySelector('#originMaxima')?.dataset.validation==='validated',null,{timeout:60000});
 assert(new URL(page.url()).pathname.endsWith('/soldiers/modern/'));
 assert.equal(await page.locator('#trainingTable,input[type=file]').count(),0);
 await page.locator('#researchDialog[open]').waitFor({timeout:15000});
 assert((await page.locator('#researchDetail').innerText()).includes('기본 총기 훈련'));
 await page.locator('#closeResearchDialog').click();
 await page.setViewportSize({width:390,height:844});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
 assert.equal(overflow,false,'No mobile page horizontal overflow');
 const mobile=await page.evaluate(()=>({
   table:document.querySelector('#originTable').getBoundingClientRect().width,
   panel:document.querySelector('#originTableScroll').clientWidth,
   name:document.querySelector('#originTable tbody td:first-child').getBoundingClientRect().width,
   stickyName:getComputedStyle(document.querySelector('#originTable tbody td:first-child')).position,
   stickySum:getComputedStyle(document.querySelector('#originTable tbody td:nth-child(3)')).position,
   hiddenStatus:getComputedStyle(document.querySelector('#originTable tbody td:nth-child(2)')).display
 }));
 assert(mobile.table>mobile.panel&&mobile.name<=135&&mobile.stickyName==='sticky'&&mobile.stickySum==='sticky'&&mobile.hiddenStatus==='none',JSON.stringify(mobile));
 await page.locator('#scrollStatsRight').click();
 await page.waitForFunction(()=>document.querySelector('#originTableScroll').scrollLeft>50);
 assert.equal(await page.locator('#originTable').evaluate(e=>getComputedStyle(e).display),'table');
 console.log('PASS 390px mobile: genuine swipeable 12-stat table, compact pinned name and total, working next-columns control');
 await page.goto(url('captains/'));
 assert.equal(await page.locator('input[type=file],#choiceSaveFile').count(),0);
 assert(!requests.some(r=>r.method!=='GET'));
 console.log('PASS retired training deep link routes to read-only soldier evidence; no local file-input UI on soldier/captain views');
 if(!external){
   const corrupt=await browser.newPage();
   await corrupt.route('**/soldier-origin-candidates.json*',async route=>{const response=await route.fetch();const body=decodeOriginReport(await response.json());body.records.find(r=>r.candidates.length).candidates[0].stats.health+=999;await route.fulfill({response,body:encodeOriginReport(body),contentType:'application/json'})});
   await corrupt.goto(url('soldiers/modern/'));
   await corrupt.waitForFunction(()=>document.querySelector('#originMaxima')?.dataset.validation==='rejected',null,{timeout:60000});
   assert.equal(await corrupt.locator('#originTable tbody tr').count(),0);
   assert((await corrupt.locator('#catalogStatus').innerText()).includes('표시 중단'));
   await corrupt.close();
   // Every origin now has a source-checked conditional route; there is no
   // unresolved row left in which to inject a fabricated research bottleneck.
   // Falsify the campaign context instead, so a forged impossible difficulty
   // can never enter a valid origin comparison.
   const brokenContext=await browser.newPage();
   await brokenContext.route('**/soldier-origin-candidates.json*',async route=>{
     const response=await route.fetch();const body=decodeOriginReport(await response.json());
     const record=body.records.find(r=>r.profileId==='manufacture:STR_POLTERGEIST_EMBODIMENT');
     const candidate=record.candidates.find(c=>c.campaignContext.kind==='compatible');
     candidate.campaignContext.allowedDifficulties=[0];
     await route.fulfill({response,body:encodeOriginReport(body),contentType:'application/json'});
   });
   await brokenContext.goto(url('soldiers/modern/'));
   await brokenContext.waitForFunction(()=>document.querySelector('#originMaxima')?.dataset.validation==='rejected',
     null,{timeout:60000});
   assert.equal(await brokenContext.locator('#originTable tbody tr').count(),0);
   await brokenContext.close();
   const wrongBranch=await browser.newPage();
   await wrongBranch.route('**/soldier-origin-candidates.json*',async route=>{
     const response=await route.fetch();const body=decodeOriginReport(await response.json());
     const record=body.records.find(r=>r.profileId==='direct:STR_SOLDIER_PEASANT');
     // UI chooses the best 12-stat route, which can differ from the stored
     // legacy 11-stat bestCandidateId after deep-search improvements. Corrupt
     // each branch-bearing route so the selected route is always challenged.
     for(const candidate of record.candidates){
       if(!candidate.branchChoices[0]?.excludes.length)continue;
       const edge=candidate.branchChoices[0].excludes[0];
       edge.closedInStep=!edge.closedInStep;
       edge.closureTiming=edge.closedInStep?'new-in-step':'closed-after';
       candidate.resultHash=createHash('sha256').update(JSON.stringify({
         steps:candidate.steps,raw:candidate.raw,stats:candidate.stats,
         total:candidate.total,branches:candidate.branchChoices
       })).digest('hex');
     }
     await route.fulfill({response,body:encodeOriginReport(body),contentType:'application/json'});
   });
   await wrongBranch.goto(url('soldiers/modern/'));
   await wrongBranch.waitForFunction(()=>document.querySelector('#originMaxima')?.dataset.validation==='validated',
     null,{timeout:60000});
   await wrongBranch.locator('#originTable [data-open-origin="direct:STR_SOLDIER_PEASANT"]').click();
   await wrongBranch.waitForFunction(()=>document.querySelector('#originMaxima')?.dataset.validation==='rejected',
     null,{timeout:60000});
   assert((await wrongBranch.locator('#catalogStatus').innerText()).includes('연구 분기 폐쇄 시점 재생 불일치'));
   await wrongBranch.close();
   const corruptedDependency=await browser.newPage();
   await corruptedDependency.route('**/soldier-route-dependency-audit.json*',async route=>{
     const response=await route.fetch();const body=await response.json();
     body.findings[0].removedInputs[0].items.STR_GOVT_CORPSE+=1;
     await route.fulfill({response,body:JSON.stringify(body),contentType:'application/json'});
   });
   await corruptedDependency.goto(url('soldiers/modern/'));
   await corruptedDependency.waitForFunction(()=>document.querySelector('#originMaxima')?.dataset.validation==='rejected',null,{timeout:60000});
   assert.equal(await corruptedDependency.locator('#originTable tbody tr').count(),0);
   await corruptedDependency.close();
   const wrong=await browser.newPage();
   await wrong.route('**/soldier-source-catalog.json*',async route=>{const response=await route.fetch();const body=await response.json();body.sourceVersion='v.o1.1.1';await route.fulfill({response,body:JSON.stringify(body),contentType:'application/json'})});
   await wrong.goto(url('soldiers/modern/'));
   await wrong.waitForFunction(()=>document.querySelector('#originMaxima')?.dataset.validation==='rejected',null,{timeout:60000});
   assert.equal(await wrong.locator('#originTable tbody tr').count(),0);await wrong.close();
   console.log('PASS corrupted results or cross-version source fail closed before any provisional values appear');
 }
 assert.deepEqual(errors,[],errors.join('\n'));
 console.log('PASS source-first read-only Soldier DB browser gate | '+base);
}finally{await browser?.close();if(server)await new Promise(ok=>server.close(ok));}
