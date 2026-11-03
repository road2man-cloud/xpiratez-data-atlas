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
const pages=(option("--pages")||"starting,captains,soldiers,crafts,craft-weapons,facilities,armors,items,research,manufacture,events,forces,weapons").split(",");
const ready={
  starting:"#cards .card", captains:"#matrixTable tbody tr", soldiers:"#originTable tbody tr", trainings:"#trainingTable tbody tr[data-id]",
  crafts:"#craftTable tbody tr", "craft-weapons":"#weaponTable tbody tr",
  facilities:"#facilityTable tbody tr", armors:"#armorTable tbody tr",
  items:"#tbody tr", research:"#tbody tr", manufacture:"#manufactureTable tbody tr",
  events:"#eventTable tbody tr", forces:"#forceTable tbody tr", weapons:"#weaponTable tbody tr[data-id]"
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
    if(slug==="manufacture"){
      // The manufacture dossier still folds its in-depth technical data.
      // Research no longer renders the legacy duplicated game-more block.
      await page.addInitScript(()=>{
        const reveal=()=>document.querySelectorAll("#detail details.game-more").forEach(node=>{if(!node.open)node.open=true});
        new MutationObserver(reveal).observe(document,{childList:true,subtree:true});
      });
    }
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
      if(slug==="soldiers"){
        // The old 1.1.1 catalog no longer exists. Verify only 2.1 source evidence.
        await page.waitForURL(u=>u.pathname.endsWith("/soldiers/modern/"),{timeout:30000});
        await page.waitForFunction(()=>document.querySelector("#originMaxima")
          ?.dataset.validation==="validated",{timeout:30000});
        count=await page.locator("#originTable tbody tr").count();
        if(count!==72)errors.push("2.1 original birth profiles: "+count+"/72");
        if(await page.locator("#legacyMaximaArchive").count()||
          await page.locator(".soldier-db-views").count())
          errors.push("Duplicate or 1.1.1 Soldier navigation remains");
        if(await page.locator("#catalogMetric").inputValue()!=="growth")
          errors.push("Endgame growth ceilings must be the comparison default");
        if(await page.locator('input[type="file"]').count())errors.push("Local save interface was not removed");
        await page.locator("#search").fill("direct:STR_SOLDIER_PEASANT");
        const narrowed=await page.locator("#originTable tbody tr").count();
        search=count+"->"+narrowed;
        if(narrowed!==1)errors.push("Acquisition source search mismatch "+narrowed);
        await page.locator("#originTable .origin-open").first().click();
        await page.waitForFunction(()=>document.querySelector('#originDetails')?.textContent.includes('연구 경로 재생 완료'),null,{timeout:45000});
        detail=String((await page.locator("#originDetails").innerText()).length);
        if(Number(detail)<150)errors.push("2.1 acquisition proof detail incomplete");
        await page.locator('#catalogMetric').selectOption('certified');
        if((await page.locator('#originTable .score').innerText()).trim()!=='—')errors.push('Provisional silently upgraded to certified');
        await page.locator('#catalogMetric').selectOption('growth');
        if(!(await page.locator('#catalogStatus').innerText()).includes('조건부'))errors.push('Growth-ceiling assumptions hidden');
        const networkPaths=await page.evaluate(()=>performance.getEntriesByType("resource")
          .map(r=>new URL(r.name).pathname));
        if(networkPaths.some(x=>x.endsWith("/soldiers-runtime.json.gz")))
          errors.push("Retired 1.1.1 Soldier runtime loaded");
        const ok=count===72&&!errors.length&&!httpErrors.length;
        results.push(ok);
        console.log((ok?"PASS":"FAIL")+" soldiers rows="+count+
          " search="+search+" detail="+detail+" errors="+JSON.stringify(errors)+
          " http="+JSON.stringify(httpErrors.slice(0,6)));
        await page.close();
        continue;
      }
      if(slug==="trainings"){
        // Current 2.1 source-first training DB. Legacy branch/captain scenarios
        // are covered by offline regressions, not exposed as 1.1.1 UI.
        await page.waitForFunction(()=>document.querySelector("#loadStatus")
          ?.dataset.state==="validated",{timeout:40000});
        count=await page.locator("#trainingTable tbody tr[data-id]").count();
        if(count!==83)errors.push("Expected 83 modern training rules, got "+count);
        if(await page.locator("#origin option").count()!==72)
          errors.push("Expected 72 real birth origins in modern training DB");
        if((await page.locator("header").textContent()).includes("1.1.1"))
          errors.push("Old 1.1.1 training UI remains visible");
        await page.locator("#search").fill("STR_BASIC_FIREARMS_TRAINING");
        const row=page.locator('#trainingTable tbody tr[data-id="STR_BASIC_FIREARMS_TRAINING"]');
        await row.click();
        const dossier=await page.locator("#detailPanel").innerText();
        detail=String(dossier.length);
        search=count+"->"+await page.locator("#trainingTable tbody tr[data-id]").count();
        if(!dossier.includes("필요 연구")||!dossier.includes("영구 특성 증가"))
          errors.push("2.1 training detail omitted source-grounded research or trait values");
        if(!(await page.locator("#addTraining").isEnabled()))
          errors.push("Initial conditional Gun Training is not plannable");
        else{
          await page.locator("#addTraining").click();
          if((await page.locator("#timeline").innerText()).includes("기본 총기 훈련")===false)
            errors.push("Training sequence did not retain source event");
          if(await page.locator("#addTraining").isEnabled())
            errors.push("One-shot training incorrectly remained repeatable");
          await page.locator("#undo").click();
        }
        const networkPaths=await page.evaluate(()=>performance.getEntriesByType("resource")
          .map(e=>new URL(e.name).pathname));
        if(networkPaths.some(x=>/trainings-runtime|training-access|soldiers-runtime|play-guide\/trainings/.test(x)))
          errors.push("Legacy 1.1.1 training runtime loaded");
        const ok=count===83&&!errors.length&&!httpErrors.length;
        results.push(ok);
        console.log((ok?"PASS":"FAIL")+" trainings rows="+count+
          " search="+search+" detail="+detail+" errors="+JSON.stringify(errors)+
          " http="+JSON.stringify(httpErrors.slice(0,6)));
        await page.close();
        continue;
      }
      if(slug==="weapons"&&await page.locator("#standardTab").count()){
        // First verify the integrated ranking, then switch to the unchanged
        // individual-enemy/action inspector for the existing play-guide tests.
        await page.locator("#evalRows tr[data-key]").first().waitFor({state:"visible",timeout:35000});
        if(!(await page.locator("#evalTotals").innerText()).includes("탄종조합"))errors.push("Standard weapon ranking failed to load");
        await page.locator("#legacyTab").click();
      }
      await page.locator(ready[slug]).first().waitFor({state:"attached",timeout:25000});
      count=await page.locator(ready[slug]).count();
      if(slug==="captains"){
        await page.waitForFunction(()=>window.CaptainBenefits&&document.querySelector('#captainBenefitsStatus')?.textContent.includes('22개 선택지'),{timeout:20000});
        const benefitStatus=await page.locator('#captainBenefitsStatus').innerText();
        if(!benefitStatus.includes('원본 근거 검증'))errors.push('Captain payoff index not loaded');
        const thiefCell=await page.locator('#matrixTable tbody tr[data-id="thief"] .captain-benefit-cell').innerText();
        if(!thiefCell.includes('선장의 11')||!thiefCell.includes('토큰 ×11'))
          errors.push('Thief payoff missing Captain’s 11 in comparison matrix');
        const thiefStage=await page.locator('#exclusiveRules .captain-branch-perks[data-benefit-choice="thief"]').textContent();
        if(!thiefStage.includes('선장의 11')||!thiefStage.includes('토큰 ×11'))
          errors.push('Thief class-stage card omitted its main reward');
        const otherBenefitRows=await page.locator('#matrixTable tbody .captain-benefit-cell').count();
        if(otherBenefitRows!==22)errors.push('Only '+otherBenefitRows+'/22 Captain branch advantage cells');
        const otherVisitorRows=await page.locator('#matrixTable tbody .captain-shared-visitor-cell').count();
        if(otherVisitorRows!==22)errors.push('Only '+otherVisitorRows+'/22 independent common-visitor cells');
        const visitorColumnHeading=await page.locator('#matrixTable thead .captain-shared-visitor-head').textContent();
        if(!visitorColumnHeading.includes('공통 방문')||!visitorColumnHeading.includes('전용 보상과 별개'))
          errors.push('Shared visitor header must be separate from exclusive perk header');
        const godCols=await page.locator('#matrixTable tbody .captain-god-cell').count();
        if(godCols!==22)errors.push('Only '+godCols+'/22 captain-to-G reward matrix cells');
        await page.locator('#godRewardCaptainChoice').waitFor({state:'attached',timeout:20000});
        const godSelect=page.locator('#godRewardCaptainChoice');
        if(await godSelect.locator('option').count()!==22)
          errors.push('G reward selector is missing one or more captain paths');
        await godSelect.selectOption('lazyass');
        const lazyG2=page.locator('#godRewardPlannerList [data-god-event="STR_CODEX_BONUS_G2A"]');
        const lazyG8=page.locator('#godRewardPlannerList [data-god-event="STR_CODEX_BONUS_G8A"]');
        const lazyG4=page.locator('#godRewardPlannerList [data-god-event="STR_CODEX_BONUS_G4A"]');
        if(!(await lazyG2.getAttribute('class')).includes('god-candidate')||
           !(await lazyG8.getAttribute('class')).includes('god-candidate')||
           !(await lazyG4.getAttribute('class')).includes('god-ineligible'))
          errors.push('Lazyass should link G2 and G8 via subsequent traits, not SoreDumb G4');
        const g7Danger=page.locator('#godRewardPlannerList [data-god-event="STR_CODEX_BONUS_G7C"]');
        if(await g7Danger.count()!==1||
          !(await g7Danger.textContent()).includes('13,000,000'))
          errors.push('G7C Poltergeist -13m source item value not displayed');
        const lazyText=await page.locator('#godRewardPlannerList').textContent();
        if(!lazyText.includes('어둠 추적')||!lazyText.includes('부두술')||
           !lazyText.includes('Saint')||!lazyText.includes('77/242'))
          errors.push('G bonus causal chain or G7 weighted risk absent');
        await godSelect.selectOption('jackass');
        const jackG6=page.locator('#godRewardPlannerList [data-god-event="STR_CODEX_BONUS_G6A"]');
        if(!(await jackG6.getAttribute('class')).includes('god-candidate')||
           !(await page.locator('#godRewardPlannerList [data-god-event="STR_CODEX_BONUS_G2A"]').getAttribute('class')).includes('god-ineligible'))
          errors.push('Jackass G6/G8 but not G2 causal link failed');
        await godSelect.selectOption('lazyass');
        // A tiny footnote was insufficient: Priest's first featured event was
        // titled only '똑 똑', while Thief's main perk was Captain's 11.
        // Both rows MUST have the same prominent, source-backed visitor status.
        const visitorHeads=[];
        for(const branch of ['thief','priest']){
          const tr=page.locator('#matrixTable tbody tr[data-id="'+branch+'"]');
          const visitor=tr.locator('.captain-shared-visitor-cell .benefit-visitor-primary[data-common-knock="eligible"]');
          if(await tr.locator('.captain-benefit-cell .benefit-visitor-primary').count())
            errors.push('Common Knock Knock physically nested inside '+branch+' exclusive reward cell');
          if(await visitor.count()!==1)errors.push('Prominent common Knock Knock missing on '+branch);
          const text=await visitor.innerText();
          if(!text.includes('똑 똑(똑똑이) 방문')||
             !text.includes('조건부 가능 · 공통 21종')||
             !text.includes('DumbLazy 연구 완료 후 외톨이 클론'))
            errors.push('Common vs special visitor distinction missing on '+branch+': '+text);
          visitorHeads.push((await visitor.locator('strong').innerText())+'|'+(await visitor.locator('b').innerText()));
          const stage=page.locator('#exclusiveRules .captain-shared-visitors[data-visitor-choice="'+branch+'"] .benefit-visitor-primary[data-common-knock="eligible"]');
          if(await stage.count()!==1)errors.push('Shared visitor omitted from '+branch+' independent class section');
          if(await page.locator('#exclusiveRules .captain-branch-perks[data-benefit-choice="'+branch+'"] .benefit-visitor-primary').count())
            errors.push('Shared visitor incorrectly rendered within '+branch+' perk bracket');
          const relationship=await page.evaluate(id=>{
            const perk=document.querySelector('#exclusiveRules .captain-branch-perks[data-benefit-choice="'+id+'"]');
            const shared=document.querySelector('#exclusiveRules .captain-shared-visitors[data-visitor-choice="'+id+'"]');
            return !!perk&&!!shared&&perk.parentElement===shared.parentElement&&perk.nextElementSibling===shared;
          },branch);
          if(!relationship)errors.push('Exclusive and shared '+branch+' brackets must be adjacent siblings');
        }
        if(visitorHeads[0]!==visitorHeads[1])
          errors.push('Thief and Priest present inconsistent identical shared Knock Knock conditions');
        const featured=await page.locator('#matrixTable tbody .benefit-main').allInnerTexts();
        if(featured.some(s=>s.trim()==='똑 똑'))
          errors.push('Undifferentiated Knock Knock event falsely promoted as a unique main branch reward');
        const thiefMain=await page.locator('#matrixTable tbody tr[data-id="thief"] .benefit-main').innerText();
        const priestMain=await page.locator('#matrixTable tbody tr[data-id="priest"] .benefit-main').innerText();
        if(!thiefMain.includes('선장의 11')||!priestMain.includes('건강미 훈련'))
          errors.push('Captain specific main perks replaced by anonymous shared visitor');
        const blocked=page.locator('#matrixTable tbody tr[data-id="soreass"] .captain-shared-visitor-cell .benefit-visitor-primary[data-common-knock="blocked"]');
        if(await blocked.count()!==1||!(await blocked.innerText()).includes('일반형 차단'))
          errors.push('Default Knock Knock was incorrectly allowed for Soreass');
        await page.locator('#search').fill('똑똑이');
        await page.waitForTimeout(300);
        for(const branch of ['thief','priest'])
          if(await page.locator('#matrixTable tbody tr[data-id="'+branch+'"]').count()!==1)
            errors.push('Searching 똑똑이 hides eligible '+branch+' captain');
        if(await page.locator('#matrixTable tbody tr[data-id="soreass"]').count()!==0)
          errors.push('Searching eligible 똑똑이 shows excluded Soreass');
        await page.locator('#search').fill('');
        for(const [width,height] of [[390,844],[375,667],[844,390]]){
          await page.setViewportSize({width,height});
          const metrics=await page.evaluate(()=>{
            const bar=document.querySelector('.toolbar');
            const shell=document.querySelector('#matrixTable')?.closest('.table-shell');
            const first=shell?.querySelector('thead tr.group th');
            const second=shell?.querySelector('thead tr:nth-child(2) th');
            if(shell)shell.scrollTop=330;
            return {barPosition:getComputedStyle(bar).position,
              height:window.innerHeight,
              first:first?.getBoundingClientRect().height||0,
              second:second?.getBoundingClientRect().height||0,
              headerHeight:Math.max(first?.getBoundingClientRect().height||0,
                (first?.getBoundingClientRect().height||0)+(second?.getBoundingClientRect().height||0))};
          });
          if(metrics.barPosition==='sticky'||metrics.barPosition==='fixed')
            errors.push('Mobile Captain toolbar blocks scrolling in '+width+'x'+height+' viewport');
          if(metrics.headerHeight>metrics.height*.2)
            errors.push('Mobile Captain sticky table headers cover '+Math.round(100*metrics.headerHeight/metrics.height)+'% of '+width+'x'+height);
        }
        await page.setViewportSize({width:390,height:844});
        const before=await page.evaluate(()=>performance.getEntriesByType("resource")
          .filter(entry=>/choice-simulator-index\.json|progression-research\.json|choice-research-gates\.json/.test(entry.name))
          .map(entry=>entry.name));
        if(before.length)errors.push("Captain simulator fetched heavy research data on first paint: "+before.join(", "));
      }
      // A fast first list must not fetch megabytes belonging exclusively to
      // the opposite catalog or to detail-only research/route calculations.
      const paths=await page.evaluate(()=>performance.getEntriesByType("resource")
        .map(entry=>new URL(entry.name).pathname));
      const forbidden={
        items:["research-index.json","research-insight-index.json","entities.json"],
        research:["items-index.json","item-usage-index.json","entities.json"],
        soldiers:["progression.json","progression-research.json"],
        crafts:["progression-research.json"],
        trainings:["progression-research.json","choice-research-gates.json"]
      };
      for(const path of forbidden[slug]||[])
        if(paths.some(item=>item.endsWith("/"+path)||item.endsWith("/"+path+".gz")))
          errors.push("Eager large catalog request on "+slug+": "+path);
      const compressedRequired={
        items:["items-index.json.gz","item-usage-index.json.gz","catalog-ids.json.gz"],
        research:["research-index.json.gz","research-insight-index.json.gz","catalog-ids.json.gz"],
        trainings:["trainings-runtime.json.gz"],
        crafts:["crafts-runtime.json.gz"],
        weapons:["weapons-index.json.gz"],
        armors:["armors-index.json.gz"],
        manufacture:["manufacture-runtime.json.gz"]
      };
      for(const required of compressedRequired[slug]||[])
        if(!paths.some(p=>p.endsWith("/"+required)))errors.push(slug+" omitted its compressed index: "+required);
      if(slug==="weapons"&&!paths.some(p=>/\/weapon-chunks\/[^/]+\.json\.gz$/.test(p)))
        errors.push("Weapon section did not use compressed chunks");
      if(slug==="weapons"||slug==="armors"){
        if(count>100)errors.push(slug+" rendered "+count+" table rows instead of at most 100");
        const pager=page.locator(slug==="weapons"?"#weaponPager":"#armorPager");
        const first=await page.locator(ready[slug]).first().locator(".name").innerText();
        await pager.locator('button[data-page="1"]').first().evaluate(button=>button.click());
        const second=await page.locator(ready[slug]).first().locator(".name").innerText();
        if(first===second)errors.push(slug+" pagination did not advance");
        await pager.locator('button[data-page="0"]').first().evaluate(button=>button.click());
      }
      // Every database row exposes a source-grounded, decision-first guide
      // without stealing the original table/detail interaction.
      const guide=page.locator(ready[slug]+" .xpz-guide-open").first();
      await guide.waitFor({state:"attached",timeout:25000});
      await guide.evaluate(el=>el.click());
      await page.locator("#xpz-play-dialog[open]").waitFor({state:"visible",timeout:25000});
      await page.waitForFunction(()=>{
        const t=document.querySelector("#xpz-play-dialog")?.innerText||"";
        return t.includes("한눈에 보는 결론")&&t.includes("실제 효과")&&t.includes("실행 방법")&&t.includes("언제 가치가 있는가")&&t.includes("주의 · 예외")&&t.includes("근거:");
      },{timeout:25000});
      if(!(await page.locator("#xpz-play-dialog .xpz-play-source").innerText()).includes("근거:"))errors.push("play guide has no provenance");
      await page.locator("#xpz-play-dialog .xpz-play-close").click();
      if(await page.locator("#xpz-play-dialog[open]").count())errors.push("play guide modal did not close");
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
          await page.locator(ready[slug]).first().waitFor({state:"attached",timeout:25000});
        }
        const row=page.locator(ready[slug]).first();
        // Item/research first table cell is a comparison checkbox; click the name instead.
        if(slug==="items"||slug==="research")await row.locator("td").nth(1).click();
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
        if(slug==="research"){
          await page.locator("#closeDrawer").click();
          // Male Touch must block Shakeup via Gals -> Party, not confuse
          // Bonding's Party_DEP with the research STR_PARTY.
          await page.locator("#researchStoryRoute").selectOption("male-touch");
          if(!page.url().includes("story=male-touch"))
            errors.push("Research branch scenario missing a linkable URL state");
          const routeInfo=await page.locator("#researchStoryRouteInfo").innerText();
          if(!routeInfo.includes("Male Touch")||!routeInfo.includes("일반 연구 경로 차단"))
            errors.push("Male Touch scenario summary missing");
          await page.locator("#search").fill("STR_SHAKEUP_CEREMONY");
          const shakeup=page.locator('#tbody tr[data-id="STR_SHAKEUP_CEREMONY"]');
          await shakeup.waitFor({state:"attached",timeout:12000});
          if(!(await shakeup.innerText()).includes("선행 경로 차단"))
            errors.push("Male Touch research list did not label Shakeup route blocked");
          await shakeup.locator("td").nth(2).click();
          await page.locator("#detail .research-story-detail").waitFor({state:"visible",timeout:12000});
          const routeDetails=await page.locator("#detail .research-story-detail").innerText();
          if(!routeDetails.includes("일반 연구 선행 경로 차단")||!routeDetails.includes("파티"))
            errors.push("Male Touch Shakeup detail omitted blocked research ancestry");
          await page.locator("#closeDrawer").click();
          await page.locator("#researchStoryRoute").selectOption("gals-superior");
          if((await shakeup.innerText()).includes("선행 경로 차단"))
            errors.push("Gals route falsely blocked Shakeup");
          // Shareable scenario deep links must restore both selected route and
          // its research detail when opened in a fresh page.
          await page.goto(new URL("research/?story=male-touch#research=STR_SHAKEUP_CEREMONY",base).href,{waitUntil:"domcontentloaded",timeout:45000});
          await page.waitForFunction(()=>{
            const detail=document.querySelector("#detail .research-story-detail")?.textContent||"";
            return document.querySelector("#researchStoryRoute")?.value==="male-touch"&&
              detail.includes("일반 연구 선행 경로 차단");
          },{timeout:25000});
          await page.locator("#closeDrawer").click();
          await page.locator("#researchStoryRoute").selectOption("");
          await page.locator("#search").fill("");
          await page.locator('[data-filter="branch"]').selectOption("alternative");
          const audited=await page.locator("#tbody tr").count();
          if(audited!==42)errors.push("Research multi-prerequisite conflict filter expected 42, got "+audited);
          await page.locator("#tbody tr").first().locator("td").nth(1).click();
          await page.locator("#drawer.open").waitFor({state:"visible",timeout:14000});
          const conflictText=await page.locator("#detail").innerText();
          if(!conflictText.includes("복수 선행 · 상호배제 감사")||
            !conflictText.includes("명시적 unlocks 출처")||!conflictText.includes("unlocks"))
            errors.push("Audited research did not show the alternative unlock path and conflict evidence");
          await page.locator("#closeDrawer").click();
          await page.locator('[data-filter="branch"]').selectOption("nested");
          const nestedCount=await page.locator("#tbody tr").count();
          if(nestedCount!==8)errors.push("Nested alternative-unlocker collision filter expected 8, got "+nestedCount);
          await page.locator("#tbody tr").first().locator("td").nth(1).click();
          await page.locator("#drawer.open").waitFor({state:"visible",timeout:14000});
          const nestedText=await page.locator("#detail").innerText();
          if(!nestedText.includes("대체 해금 출처에도 분기 충돌")||
            !nestedText.includes("출처 자체도 명목 선행 충돌"))
            errors.push("Nested research detail omitted source's own conflicting prerequisites");
          await page.locator("#closeDrawer").click();
          await page.locator('[data-filter="branch"]').selectOption("self-source");
          const selfSourceCount=await page.locator("#tbody tr").count();
          if(selfSourceCount!==3)errors.push("Self-disabling unlock-source filter expected 3, got "+selfSourceCount);
          await page.locator("#tbody tr").first().locator("td").nth(1).click();
          await page.locator("#drawer.open").waitFor({state:"visible",timeout:14000});
          const selfSourceDetail=await page.locator("#detail").innerText();
          if(!selfSourceDetail.includes("자기 배제하는 해금 출처")||
            !await page.locator('#detail [data-open="STR_CAPTAIN_GOLD_UP"]').count())
            errors.push("Research detail omitted persistent-unlock self-disabling warning");
          await page.locator("#closeDrawer").click();
          await page.locator('[data-filter="branch"]').selectOption("cycle");
          const cycleCount=await page.locator("#tbody tr").count();
          if(cycleCount!==95)errors.push("Nominal research cycle filter expected 95, got "+cycleCount);
          await page.locator("#tbody tr").first().locator("td").nth(1).click();
          await page.locator("#drawer.open").waitFor({state:"visible",timeout:14000});
          const cycleDetail=await page.locator("#detail").innerText();
          if(!cycleDetail.includes("명목 선행 순환 감사")||
             !cycleDetail.includes("실제 순환 근거")||!cycleDetail.includes("순환은 연구 불가능 판정이 아닙니다"))
            errors.push("Cycle detail omitted real loop witness or conditional bypass explanation");
          await page.locator("#closeDrawer").click();
          await page.locator('#tbody tr[data-id="STR_NINJA_WAR_READY"]').click();
          await page.locator("#drawer.open").waitFor({state:"visible",timeout:14000});
          const ninjaCycle=await page.locator("#detail").innerText();
          if(!ninjaCycle.includes("직접 연구 플래그 지급 이벤트")||
             !await page.locator('#detail [data-open="STR_NINJA_WAR"]').count())
            errors.push("Ninja war nominal cycle lacks its direct event grant escape evidence");
          await page.locator("#closeDrawer").click();
          await page.locator('[data-filter="branch"]').selectOption("");
        }
        if(slug==="captains"){
          await page.locator("#dialogClose").click();
          await page.locator('#matrixTable tbody tr[data-id="thief"]').click();
          await page.locator('#captainBenefitDetail .captain-key-reward').waitFor({state:'visible',timeout:24000});
          const chiefReward=await page.locator('#captainBenefitDetail').innerText();
          if(!chiefReward.includes('선장의 11')||!chiefReward.includes('토큰 11개')||
            !chiefReward.includes('100,000')||!chiefReward.includes('500시간')||
            !chiefReward.includes('병종 19종')||!chiefReward.includes('SoldierBonus'))
            errors.push('Captain’s 11 event/bonus full provenance was omitted from Thief detail');
          const directPayoffs=await page.locator('#captainBenefitDetail [data-benefit-event="STR_CAPTAINS_11"]').count();
          if(directPayoffs!==1)errors.push('Captain’s 11 event missing from direct event payoff list');
          if(!chiefReward.includes('원본 직접 disables')||!chiefReward.includes('후속 명시 해금 뒤 조건부 이벤트'))
            errors.push('Captain detail lacks exact exclusion or exhaustive conditional event summary');
          const commonThief=page.locator('#captainBenefitDetail .captain-common-visitor[data-common-visitor="eligible"]');
          if(await commonThief.count()!==1)errors.push('Default Knock Knock absent in Thief detail');
          else {
            const summary=await commonThief.innerText();
            if(!summary.includes('21종')||!summary.includes('STR_KNOCK_KNOCK_0')||
               !summary.includes('STR_CAPTAIN_SOREASS')||!summary.includes('executionOdds 23'))
              errors.push('Thief shared Knock Knock entry omitted source gates or all 21 outcomes');
            await commonThief.locator('details').evaluate(el=>el.open=true);
            if(await commonThief.locator('details .captain-shared-event-links a').count()!==21)
              errors.push('Not all common Knock Knock outcome IDs were linked');
          }
          if(await page.locator('#captainBenefitDetail .god-reward-inline .god-reward-group').count()!==8)
            errors.push('Captain detail has no self-contained G1-G8 causal reward breakdown');
          if(!(await page.locator('#captainBenefitDetail').innerText()).includes('STR_KNOCK_KNOCK_ROGUE_CLONE'))
            errors.push('Thief conditional DumbLazy/Rogue Clone entry absent');
          await page.locator('#dialogClose').click();
          await page.locator('#matrixTable tbody tr[data-id="priest"]').click();
          await page.locator('#captainBenefitDetail .captain-common-visitor[data-common-visitor="eligible"]').waitFor({state:'attached',timeout:16000});
          const priestCommon=await page.locator('#captainBenefitDetail .captain-common-visitor').innerText();
          if(!priestCommon.includes('일반 방문 가능 후보')||
             !priestCommon.includes('STR_CAPTAIN_SOREASS')||
             !priestCommon.includes('STR_KNOCK_KNOCK_ROGUE_CLONE'))
            errors.push('Priest shared and special Knock Knock routes not distinguished');
          await page.locator('#dialogClose').click();
          await page.locator('#search').fill('캡틴스11');
          await page.waitForTimeout(220);
          if(await page.locator('#matrixTable tbody tr[data-id="thief"]').count()!==1)
            errors.push('Captain eleven rewards not searchable');
          await page.locator('#search').fill('');
          // The full research graph is intentionally deferred while visitors
          // browse the comparison table; approaching the simulator loads it.
          await page.locator("#choiceSimulator").scrollIntoViewIfNeeded();
          await page.locator("#choiceSimulatorContent").waitFor({state:"visible",timeout:25000});
          const loaded=await page.evaluate(()=>performance.getEntriesByType("resource")
            .filter(entry=>/choice-simulator-index\.json/.test(entry.name)).length);
          if(loaded!==1)errors.push("Compact simulator should load exactly once when approached: "+loaded);
          const auditText=await page.locator("#choiceMultiPrerequisite").innerText();
          if(!auditText.includes("1777")&&!auditText.includes("1,777"))
            errors.push("Simulator multi-prerequisite total not present");
          if(!auditText.includes("42")||!auditText.includes("대체 해금")||
            !auditText.includes("8개")||!auditText.includes("3개"))
            errors.push("Simulator omitted 42 substitute-unlock research branches");
          await page.locator("#choiceMultiPrerequisite details").first().evaluate(el=>el.open=true);
          const allAudited=await page.locator('#choiceMultiPrerequisite details .choice-sim-block-row > strong > a[href*="../research/#research="]').count();
          const nestedAudit=await page.locator('#choiceMultiPrerequisite details .choice-sim-block-row small a[href*="../research/#research="]').count();
          if(nestedAudit<8)errors.push("Nested source link evidence absent: "+nestedAudit);
          if(allAudited!==42)errors.push("Simulator full conflict list count wrong: "+allAudited);
          await page.locator('#choiceCycleGroups').evaluate(el=>el.open=true);
          const cycleGroups=await page.locator('#choiceCycleGroups .choice-sim-cycle-row').count();
          if(cycleGroups!==7)errors.push("Simulator nominal cycle groups expected 7, got "+cycleGroups);
          const cycleText=await page.locator('#choiceCycleGroups').innerText();
          if(!cycleText.includes("95개")||!cycleText.includes("외부 unlocks"))
            errors.push("Simulator cycle summary does not distinguish external escape options");
          const linkedCards=await page.locator("#exclusiveRules .choice-option[data-choice-id]").count();
          if(linkedCards<80)
            errors.push("Branch cards are not wired to research IDs: "+linkedCards);
          const firstChoiceGuide=page.locator("#exclusiveRules .choice-option[data-choice-id] .xpz-guide-open").first();
          await firstChoiceGuide.waitFor({state:"attached",timeout:18000});
          const guideCount=await page.locator("#exclusiveRules .choice-option[data-choice-id] .xpz-guide-open").count();
          if(guideCount!==linkedCards)errors.push("Branch decision guides incomplete: "+guideCount+"/"+linkedCards);
          await firstChoiceGuide.evaluate(el=>el.click());
          await page.locator("#xpz-play-dialog[open]").waitFor({state:"visible",timeout:18000});
          await page.waitForFunction(()=>{
            const t=document.querySelector("#xpz-play-dialog .xpz-play-body")?.innerText||"";
            return t.includes("실제 효과")&&t.includes("해금 · 자격");
          },{timeout:25000});
          const branchGuideText=await page.locator("#xpz-play-dialog .xpz-play-body").innerText();
          if(!branchGuideText.includes("실제 효과")||!branchGuideText.includes("해금 · 자격"))errors.push("Branch research guide is missing core explanation");
          await page.locator("#xpz-play-dialog .xpz-play-close").click();
          const jack=page.locator('#exclusiveRules .choice-option[data-choice-id="STR_CAPTAIN_JACKASS"]').first();
          const dumb=page.locator('#exclusiveRules .choice-option[data-choice-id="STR_CAPTAIN_DUMBASS"]').first();
          await jack.locator("[data-sim-pick]").click();
          if(await dumb.getAttribute("data-sim-state")!=="blocked"||
            !await dumb.locator("[data-sim-pick]").isDisabled())
            errors.push("Selecting Jackass did not directly block Dumbass");
          const blockedPanel=await page.locator("#choiceScenarioBlocked").innerText();
          if(!blockedPanel.includes("무모한 선장"))errors.push("Blocked branch reason is not visible");
          await page.locator("#choiceScenarioReset").click();
          if(await page.locator('input[type="file"],#choiceSaveFile,#choiceSaveEvidence').count())
            errors.push('Local save input and evidence panels must remain deleted');
          await page.locator("#choiceScenarioReset").click();
          await page.locator("#choiceCompletedInput").fill("STR_GDX_012");
          await page.locator("#choiceCompletedApply").click();
          await page.locator("#choiceTopicSearch").fill("STR_TEC_168");
          await page.locator('[data-sim-search-plan="STR_TEC_168"]').click();
          const doc=page.locator('#exclusiveRules .choice-option[data-choice-id="STR_GDX_012"]');
          if(await doc.getAttribute("data-sim-state")!=="blocked")
            errors.push("OXCE must un-research the previously completed Dr. X flag");
          if(!(await page.locator("#choiceScenarioMessage").innerText()).includes("완료 플래그 제거"))
            errors.push("Missing retroactive research removal explanation");
          const aurora=page.locator('#exclusiveRules .choice-option[data-choice-id="STR_GDX_018"]');
          if(await aurora.getAttribute("data-sim-state")==="blocked")
            errors.push("Aurora conditional option was wrongly treated as direct mutual disable");
          const otherDoctor=page.locator('#exclusiveRules .choice-option[data-choice-id="STR_GDX_013"]');
          if(await otherDoctor.getAttribute("data-sim-state")!=="blocked")
            errors.push("Aurora route did not block ordinary Dr. X options");
          await page.locator("#choiceScenarioReset").click();
          await page.locator("#choiceTopicSearch").fill("STR_HOTEL");
          await page.locator('[data-sim-search-plan="STR_HOTEL"]').click();
          await jack.locator("[data-sim-pick]").click();
          if(!(await page.locator("#choiceScenarioTimeline").innerText()).includes("완료 플래그 제거됨"))
            errors.push("Retroactively un-researched Hotel not shown in timeline");
          if(!(await page.locator("#choiceScenarioMessage").innerText()).includes("완료 플래그 제거"))
            errors.push("Un-research effect missing from explanation");
          if(await page.locator("#choiceScenarioTimeline [data-sim-remove-step]").count()!==2)
            errors.push("Expected chronological Hotel / Jackass timeline");
          await page.locator("#choiceScenarioTimeline [data-sim-remove-step]").last().click();
          if(await jack.getAttribute("data-sim-state")==="completed")
            errors.push("Undo did not restore Jackass as a selectable option");
          await page.locator("#choiceScenarioReset").click();
          await page.locator("#choiceCompletedInput").fill("STR_POLTERGEIST_EMBODIMENT");
          await page.locator("#choiceCompletedApply").click();
          await page.locator("#choiceTopicSearch").fill("STR_FORMER_ZOMBIE_TRAIT");
          const bypassRow=page.locator('#choiceTopicResults [data-sim-search-plan="STR_FORMER_ZOMBIE_TRAIT"]').locator("..").locator("..");
          if(!(await bypassRow.innerText()).includes("unlocks로 dependencies 우회"))
            errors.push("Research unlock did not bypass an unmet dependency");
          await page.locator("#choiceScenarioReset").click();
          await page.locator("#choiceTopicSearch").fill("STR_NAZI_MAGE");
          const weightedSource=page.locator('#choiceTopicResults [data-sim-search-plan="STR_NAZI_MAGE"]').locator("..").locator("..");
          const weightedText=await weightedSource.innerText();
          if(!weightedText.includes("추첨칸")||!weightedText.includes("무료 지급 후보"))
            errors.push("Weighted free research candidate preview missing");
          detail+=" + engine unlock bypass + weighted bonus research + historical completion + undo";
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
        if(slug==="research"){
          // Guard against single-item summaries for strategically significant topics.
          await page.goto(new URL("research/#research=STR_CUNNING",base).href,{waitUntil:"domcontentloaded",timeout:45000});
          await page.waitForFunction(()=>(document.querySelector("#detail .game-dossier-foot")||document.querySelector("#detail > .id"))?.textContent.includes("STR_CUNNING"),{timeout:25000});
          // v5 hides the long source-backed context until requested. Verify
          // that opening it restores every deep evidence / reverse link.
          await page.locator("#detail .editorial-extra > summary").click();
          await page.waitForFunction(()=>{
            const t=document.querySelector("#detail")?.innerText||"";
            return t.includes("STR_CUNNING")&&t.includes("캠페인 내 위치")&&t.includes("시발링가 돌");
          },{timeout:25000});
          const txt=await page.locator("#detail").innerText();
          for(const word of ["16개","의사소통","사기와 도용","글래머 고용","미보유","시발링가 돌","바론 스컬페이스","가죽 채찍","X그로그"])
            if(!txt.includes(word))errors.push("Cunning research lacks context: "+word);
          const overview=await page.locator(".editorial-row.core p").first().innerText();
          if(overview.includes("가죽 채찍 제조를 여는 생산 기술"))errors.push("Cunning still uses shallow whip-only overview");
          const insight=page.locator(".editorial-row.context p").first();
          if(!(await insight.count())||!(await insight.innerText()).includes("후속 갈래"))errors.push("Research context is missing in frontend");
          await page.locator("#closeDrawer").click();
          await page.locator("#search").fill("STR_CUNNING");
          const target=page.locator("#tbody tr[data-id='STR_CUNNING']");
          await target.waitFor({state:"attached",timeout:12000});
          if(!(await target.innerText()).includes("후속 허브"))errors.push("Cunning hub not visible in search table");
          for(const sample of [
            {id:"STR_WINE",expected:["파티(연관)","중 한 경로","와인 실물"]},
            {id:"STR_CASH_BAG",expected:["$200,000","$202,200","91개","92개"]}
          ]){
            await page.goto(new URL("research/#research="+sample.id,base).href,{waitUntil:"domcontentloaded",timeout:45000});

[Showing lines 1-661 of 697 (50.0KB limit). Use offset=662 to continue.]