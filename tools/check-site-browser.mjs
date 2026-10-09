// Browser smoke test for the public XPiratez Data Atlas.
// Run with a local install of playwright-core and Microsoft Edge:
//   node tools/check-site-browser.mjs --local
//   node tools/check-site-browser.mjs --base=https://road2man-cloud.github.io/xpiratez-data-atlas/
//   node tools/check-site-browser.mjs --local --pages=starting,items,research
import http from "node:http";
import fs from "node:fs/promises";
import {existsSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright-core";

const publicDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../public");
const args=process.argv.slice(2);
const option=(prefix)=>args.find(x=>x.startsWith(prefix+"="))?.slice(prefix.length+1);
const pages=(option("--pages")||"starting,captains,soldiers,trainings,crafts,craft-weapons,facilities,armors,items,research,manufacture,events,forces,weapons").split(",");
const ready={
  starting:"#cards .card", captains:"#matrixTable tbody tr", soldiers:"#soldierTable tbody tr", trainings:"#trainingTable tbody tr[data-id]",
  crafts:"#craftTable tbody tr", "craft-weapons":"#weaponTable tbody tr",
  facilities:"#facilityTable tbody tr", armors:"#armorTable tbody tr",
  items:"#tbody tr", research:"#tbody tr", manufacture:"#manufactureTable tbody tr",
  events:"#eventTable tbody tr", forces:"#forceTable tbody tr", weapons:"#weaponTable tbody tr"
};
const htmlError=/데이터를 불러오지 못했습니다|로딩 실패|데이터 불러오기 실패|Error loading|TypeError:|ReferenceError:/i;
let server;
if(args.includes("--local")){
  const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".gz":"application/octet-stream"};
  server=http.createServer(async(req,res)=>{
    try{
      const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
      const file=path.resolve(publicDir,"."+pathname,(pathname.endsWith("/")?"index.html":""));
      if(!file.startsWith(publicDir+path.sep)&&file!==publicDir){res.writeHead(403);res.end();return;}
      const bytes=await fs.readFile(file);
      res.writeHead(200,{"Content-Type":mime[path.extname(file)]||"application/octet-stream","Cache-Control":"no-store"});
      res.end(bytes);
    }catch(e){res.writeHead(404);res.end("Not found");}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
}
const base=server?"http://127.0.0.1:"+server.address().port+"/":option("--base")||"https://road2man-cloud.github.io/xpiratez-data-atlas/";
const browserCandidates=[
  process.env.EDGE_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome","/usr/bin/google-chrome-stable","/usr/bin/chromium",
  chromium.executablePath()
];
const edge=browserCandidates.find(x=>x&&existsSync(x));
if(!edge)throw new Error("Chrome/Edge not found; set EDGE_PATH or install Playwright Chromium");
const browser=await chromium.launch({executablePath:edge,headless:true,args:["--no-first-run","--no-sandbox"]});
const results=[];
try {
  for(const slug of pages){
    if(!ready[slug]){console.log("FAIL "+slug+" unknown-page");results.push(false);continue;}
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const errors=[],httpErrors=[];
    page.on("pageerror",e=>errors.push(e.message));
    page.on("console",msg=>{if(msg.type()==="error"&&!msg.location().url.endsWith("/favicon.ico"))errors.push("console: "+msg.text()+" ["+msg.location().url+"]")});
    page.on("response",r=>{if(r.status()>=400&&!r.url().split("?")[0].endsWith("/favicon.ico"))httpErrors.push(r.status()+" "+r.url().slice(0,180))});
    page.on("requestfailed",r=>{
      const reason=r.failure()?.errorText||"";
      // Search/detail navigation may cancel obsolete lazy-loads; an aborted
      // request is not an outage. Keep recording all other network failures.
      if(reason.includes("net::ERR_ABORTED"))return;
      httpErrors.push("network "+r.url().slice(0,180)+" "+reason);
    });
    let count=0,search="skip",detail="skip",display="",trainingStage="opening";
    try{
      await page.goto(new URL(slug+"/",base).href,{waitUntil:"domcontentloaded",timeout:45000});
      await page.locator(ready[slug]).first().waitFor({state:"attached",timeout:25000});
      count=await page.locator(ready[slug]).count();
      if(slug==="starting"){
        await page.locator("#search").fill("STR_EGYPT");
        await page.waitForTimeout(180);
        search=String(await page.locator("#cards .card").count());
        if(+search<1||+search>=count)errors.push("search STR_EGYPT unexpectedly returned "+search+" (expected at least 1, less than "+count+")");
        await page.locator("#search").fill("");
        await page.locator("#kind").selectOption("country");
        const country=await page.locator("#cards .card").count();
        if(country<1||country>=count)errors.push("country filter returned "+country);
        await page.locator("#kind").selectOption("all");
        await page.locator("#sort").selectOption("points");
        await page.locator("#cards details").first().evaluate(el=>el.open=true);
        detail=String(await page.locator("#cards details[open] .event-row").count());
        if(+detail<1)errors.push("start card details empty");
      }else{
        const input=page.locator("#search");
        if(await input.count()){
          const before=await page.locator(ready[slug]).count();
          await input.fill("unlikely_no_match_search_88bbb");
          await page.waitForTimeout(350);
          const after=await page.locator(ready[slug]).count();
          search=before+"->"+after;
          if(after>=before&&before>2)errors.push("search no-match did not filter ("+search+")");
          await input.fill("");
        }
        const row=page.locator(ready[slug]).first();
        // Item/research first table cell is a comparison checkbox; click the name instead.
        if(slug==="items"||slug==="research")await row.locator("td").nth(1).click();
        else if(slug==="soldiers"){
          // On mobile, the tall sticky soldier filters blocked row taps.
          const portrait=await page.locator(".toolbar").evaluate(el=>getComputedStyle(el).position);
          if(portrait==="sticky")errors.push("portrait soldier toolbar overlays the table");
          await page.setViewportSize({width:844,height:390});
          const landscape=await page.locator(".toolbar").evaluate(el=>getComputedStyle(el).position);
          if(landscape==="sticky")errors.push("landscape soldier toolbar overlays the table");
          await page.setViewportSize({width:390,height:844});
          await row.locator("td").first().click();
        }
        else await row.click();
        const selector=await page.locator("#detailDialog").count()?"#detailDialog[open]":"#drawer.open";
        await page.locator(selector).waitFor({state:"visible",timeout:14000});
        const contentSelector=await page.locator("#detailBody").count()?"#detailBody":slug==="captains"?"#dialogBody":"#detail";
        // A visible drawer can still contain an async loading placeholder,
        // especially on the live Pages CDN. Assert the finished detail.
        await page.waitForFunction(selector=>{
          const text=document.querySelector(selector)?.innerText||"";
          return text.length>45&&!/상세 데이터 불러오는 중|데이터 로딩 중/i.test(text);
        },contentSelector,{timeout:25000});
        const content=await page.locator(contentSelector).innerText();
        detail=String(content.length);
        if(content.length<45||htmlError.test(content))errors.push("detail appears empty or errored: "+content.slice(0,120).replace(/\\s+/g," "));
        if(slug==="trainings"){
          trainingStage="close detail button";
          await page.locator("#closeDialog").click();
          await input.fill("STR_PERSON_OF_CULTURE_TRAINING");
          const culture=page.locator('#trainingTable tbody tr[data-id="STR_PERSON_OF_CULTURE_TRAINING"]');
          trainingStage="check cultural education";
          await culture.locator('[data-toggle]').check({timeout:12000});
          if(await page.locator("#timeline .timeline-row").count()!==1)errors.push("Training checkbox did not select cultural education");
          await input.fill("STR_NEPOTISM");
          await page.locator('#trainingTable tbody tr[data-id="STR_NEPOTISM"]').waitFor({state:"attached",timeout:10000});
          if(await page.locator('#trainingTable tbody tr[data-id="STR_NEPOTISM"] .blocked').count()!==1)errors.push("Nepotism was not blocked after cultural education");
          trainingStage="undo cultural education";
          await page.locator("#undo").click();
          await input.fill("STR_MILITARY_DRILL_TRAINING");
          trainingStage="add military drill prerequisite chain";
          await page.locator('#trainingTable tbody tr[data-id="STR_MILITARY_DRILL_TRAINING"] [data-toggle]').check({timeout:12000});
          if(await page.locator("#timeline .timeline-row").count()!==3)errors.push("Three-step military prerequisite chain not added");
          await input.fill("STR_PERSON_OF_CULTURE_TRAINING");
          await page.locator('#trainingTable tbody tr[data-id="STR_PERSON_OF_CULTURE_TRAINING"]').waitFor({state:"attached",timeout:10000});
          if(await page.locator('#trainingTable tbody tr[data-id="STR_PERSON_OF_CULTURE_TRAINING"] .blocked').count()!==1)errors.push("Cultural education not blocked after military drill");
          trainingStage="completed";
          detail+=" + checkbox / exclusivity / prerequisite chain";
        }
        if(slug==="items"){
          // Regression: the real-world item page must expose the relationships,
          // not merely ship the correct data in an unused JSON sidecar.
          for(const target of [
            {id:"STR_MUTANT_BLESSINGS",required:["영웅의 축복","제조에서 실물 재료로 소모","자색 리본","Champion Summoning","퍼플 블룸의 하사품","×1","×32","×69"],materialUses:3},
            {id:"STR_OFFERING_TO_PURPLE_BLOOM",required:["퍼플 블룸의 하사품","월 유지비 -33,000","33,000","시발링가 부활"],materialUses:0},
            {id:"STR_GLAMOUR",required:["글래머","제조에서 실물 재료로 소모","×250","×1,600"],materialUses:45},
            {id:"STR_INDUSTRIAL_STOCKS",required:["무기 회사 주식","월 유지비 -100,000","100,000"],materialUses:0}
          ]){
            await page.locator("#closeDrawer").click();
            await input.fill(target.id);
            const targetRow=page.locator(`#tbody tr[data-id="${target.id}"]`);
            await targetRow.waitFor({state:"attached",timeout:12000});
            const actualId=(await targetRow.locator("td").nth(2).innerText()).trim();
            if(actualId!==target.id)errors.push("item search "+target.id+" resolved to "+actualId);
            const cells=await targetRow.locator("td").allTextContents();
            if(Number(cells[10]?.replaceAll(",",""))!==target.materialUses)
              errors.push(target.id+" item table manufacture usage count: "+cells[10]);
            await targetRow.locator("td").nth(1).click();
            await page.waitForFunction(id=>{
              const head=document.querySelector("#detail > .id")?.innerText||"";
              const s=document.querySelector("#detail")?.innerText||"";
              return head.includes("· "+id)&&s.includes("GPT 아이템 인사이트")&&s.includes("실제 사용처·획득처 전수 분석");
            },target.id,{timeout:20000});
            const visible=await page.locator("#detail").innerText();
            for(const word of target.required)if(!visible.includes(word))
              errors.push(target.id+" missing visible insight: "+word);
            if(target.id==="STR_MUTANT_BLESSINGS"){
              const links=await page.locator("#detail a[href*='recipe=']").evaluateAll(xs=>xs.map(a=>a.getAttribute("href")));
              for(const id of ["STR_RIBBON","STR_WARRIOR_SUMMONING","STR_OFFERING_TO_PURPLE_BLOOM"])
                if(!links.some(h=>h.includes("recipe="+id)))errors.push("Missing recipe link: "+id);
            }
          }
          // A bookmark opened directly must resolve the correct drawer too.
          await page.goto(new URL("items/#item=STR_MUTANT_BLESSINGS",base).href,{waitUntil:"domcontentloaded",timeout:45000});
          await page.waitForFunction(()=>document.querySelector("#detail > .id")?.innerText.includes("STR_MUTANT_BLESSINGS"),{timeout:20000});
          if(!(await page.locator("#detail").innerText()).includes("×69"))errors.push("Item deep-link missing blessing consumption detail");
          detail+=" + four item usages / direct link";
        }
        if(slug==="manufacture"){
          await page.goto(new URL("manufacture/#recipe=STR_WARRIOR_SUMMONING",base).href,{waitUntil:"domcontentloaded",timeout:45000});
          await page.waitForFunction(()=>document.querySelector("#detail > .id")?.innerText.includes("STR_WARRIOR_SUMMONING"),{timeout:20000});
          const recipeText=await page.locator("#detail").innerText();
          if(!recipeText.includes("영웅의 축복")||!recipeText.includes("32"))errors.push("Champion Summoning deep-link missing 32 Blessings input");
          detail+=" + champion recipe deep link";
        }
      }
      display=(await page.locator("body").innerText()).slice(-320).replace(/\s+/g," ");
      if(htmlError.test(display))errors.push("failure text in body tail");
    }catch(e){
      if(slug==="trainings")console.log("TRAINING MOBILE DIAGNOSTIC: "+e.message.slice(0,1800));
      errors.push((slug==="trainings"?"stage="+trainingStage+": ":"")+e.message.split("\n")[0]);
      display=(await page.locator("body").innerText().catch(()=>"<no DOM>")).slice(0,260).replace(/\s+/g," ");
    }
    const ok=!!count&&!errors.length&&!httpErrors.length;
    results.push(ok);
    console.log((ok?"PASS":"FAIL")+" "+slug+" rows="+count+" search="+search+" detail="+detail+" errors="+JSON.stringify(errors)+" http="+JSON.stringify(httpErrors.slice(0,6))+(ok?"":" DOM="+display));
    await page.close();
  }
}finally{
  await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
}
const pass=results.filter(Boolean).length;
console.log("SITE SMOKE "+pass+"/"+results.length+" passed | base="+base);
if(pass!==results.length)process.exitCode=1;
