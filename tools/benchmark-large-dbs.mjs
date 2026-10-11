// Repeatable browser A/B benchmark: cold contexts, identical host compression,
// CDP bandwidth/latency + CPU throttling, actual row readiness, no extrapolation.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {gzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const baseline=process.env.ATLAS_BASELINE||'/tmp/atlas-baseline/public';
const current=path.resolve('public');
const candidates=[process.env.EDGE_PATH,'/usr/bin/google-chrome','/usr/bin/chromium',chromium.executablePath()];
const executablePath=candidates.find(x=>x&&fs.existsSync(x));
assert(executablePath,'A browser binary is required for real measurements');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.gz':'application/octet-stream'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const match=url.pathname.match(/^\/(before|after)\/(.*)$/);
  if(!match){res.writeHead(404).end();return;}
  const root=match[1]==='before'?baseline:current;
  const file=path.resolve(root,match[2],match[2].endsWith('/')?'index.html':'');
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  const ext=path.extname(file),raw=fs.readFileSync(file);
  // Static Pages-like HTTP gzip, same policy for both versions. .gz assets are
  // already compressed and must not be encoded a second time.
  const compressed=ext!=='.gz'&&/gzip/.test(req.headers['accept-encoding']||'');
  res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream','Cache-Control':'no-store',...(compressed?{'Content-Encoding':'gzip'}:{})});
  res.end(compressed?gzipSync(raw):raw);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
const selectors={crafts:'#craftTable tbody tr[data-id]',soldiers:'#soldierTable tbody tr[data-row]',trainings:'#trainingTable tbody tr[data-id]',manufacture:'#manufactureTable tbody tr[data-id]'};
const reports=[];
const modes=[{name:'desktop',width:1440,height:900,cpu:1,latency:40,mbps:10},{name:'mobile',width:390,height:844,cpu:4,latency:150,mbps:1.6}];
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
try{
  for(const mode of modes)for(const slug of Object.keys(selectors)){
    const samples={before:[],after:[]};
    for(let trial=0;trial<3;trial++)for(const variant of ['before','after']){
      const context=await browser.newContext({viewport:{width:mode.width,height:mode.height},isMobile:mode.name==='mobile',hasTouch:mode.name==='mobile'});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('response',r=>{if(r.status()>=400)errors.push(r.url()+' '+r.status());});
      await page.addInitScript(()=>{
        window.__longTasks=[];
        new PerformanceObserver(list=>window.__longTasks.push(...list.getEntries().map(x=>({start:x.startTime,duration:x.duration})))).observe({type:'longtask',buffered:true});
      });
      const cdp=await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
      await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:mode.latency,downloadThroughput:mode.mbps*1e6/8,uploadThroughput:mode.mbps*1e6/8});
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:mode.cpu});
      await cdp.send('Performance.enable');
      await page.goto(`${base}/${variant}/${slug}/`,{waitUntil:'domcontentloaded',timeout:90000});
      await page.locator(selectors[slug]).first().waitFor({state:'attached',timeout:90000});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const metrics=await page.evaluate(()=>({
        readyMs:performance.now(),
        dataEncodedBytes:performance.getEntriesByType('resource').filter(x=>/\.json(?:\.gz)?(?:\?|$)/.test(x.name)).reduce((sum,x)=>sum+x.encodedBodySize,0),
        dataDecodedBytes:performance.getEntriesByType('resource').filter(x=>/\.json(?:\.gz)?(?:\?|$)/.test(x.name)).reduce((sum,x)=>sum+x.decodedBodySize,0),
        requests:performance.getEntriesByType('resource').filter(x=>/\.json(?:\.gz)?(?:\?|$)/.test(x.name)).map(x=>x.name.split('/').pop()),
        longTaskMs:window.__longTasks.reduce((sum,x)=>sum+x.duration,0),maxLongTaskMs:Math.max(0,...window.__longTasks.map(x=>x.duration)),
        measures:performance.getEntriesByType('measure').map(x=>({name:x.name,ms:x.duration}))
      }));
      const cpu=(await cdp.send('Performance.getMetrics')).metrics;
      metrics.scriptMs=1000*cpu.find(x=>x.name==='ScriptDuration').value;
      metrics.layoutMs=1000*cpu.find(x=>x.name==='LayoutDuration').value;
      const initialCount=await page.locator(selectors[slug]).count();
      // Search must find the same names/codes after reducing the catalogs.
      await page.locator('#search').fill('__no_match_benchmark__');
      await page.waitForFunction(selector=>document.querySelectorAll(selector).length===0,selectors[slug]);
      await page.locator('#search').fill('');
      await page.locator(selectors[slug]).first().waitFor();
      assert.equal(await page.locator(selectors[slug]).count(),initialCount);
      if(variant==='after'){
        assert(!metrics.requests.some(x=>/soldiers-index|soldiers-builds|progression.json|progression-research|trainings-index|manufacture-index|training-raw-rules|choice-research-gates/.test(x)),'Unexpected heavy initial request');
        if(slug==='soldiers'){
          const start=Date.now();
          await page.locator('#dataset').selectOption('final');
          await page.locator('#soldierTable tbody tr[data-row]').first().waitFor({state:'attached',timeout:60000});
          metrics.finalMs=Date.now()-start;
          await page.locator('#dataset').selectOption('profiles');
          await page.locator('#dataset').selectOption('final');
          assert.equal(await page.evaluate(()=>performance.getEntriesByName('soldiers:final').length),1,'Final calculations should be cached');
        }
      }
      assert.deepEqual(errors,[]);
      samples[variant].push(metrics);
      await context.close();
    }
    const summary={mode:mode.name,page:slug};
    for(const variant of ['before','after'])summary[variant]=Object.fromEntries(['readyMs','scriptMs','layoutMs','dataEncodedBytes','longTaskMs','maxLongTaskMs'].map(key=>[key,Math.round(median(samples[variant].map(x=>x[key])))]));
    summary.samples=samples;
    reports.push(summary);
    console.log('BENCHMARK '+JSON.stringify(summary));
  }
  fs.writeFileSync('large-db-benchmark.json',JSON.stringify({conditions:modes,baseline,results:reports},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
