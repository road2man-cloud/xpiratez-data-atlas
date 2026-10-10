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
          await page.locator("#dataset").selectOption("final");
          const safeRows=Number((await page.locator("#rowCount").innerText()).match(/^\d+/)?.[0]||0);
          if(!safeRows)errors.push("All soldier final builds vanished after hard-gate filtering");
          await page.locator("#finalBranchFilter").selectOption("all");
          const allRows=Number((await page.locator("#rowCount").innerText()).match(/^\d+/)?.[0]||0);
          if(allRows<=safeRows)errors.push("Soldier final build selector did not expose known theoretical conflicts");
          await page.locator("#finalBranchFilter").selectOption("hard");
          if(!await page.locator("#soldierTable tbody .branch-hard").count())
            errors.push("Known impossible soldier final build has no visible exclusion badge");
          const excludedRow=page.locator("#soldierTable tbody tr").first();
          await excludedRow.locator("td").first().click();
          const auditDetail=await page.locator("#detailBody").innerText();
          if(!auditDetail.includes("연구·선장 분기로 실행 불가능한 조합"))
            errors.push("Soldier detail omitted hard research/event branch conflicts");
          await page.locator("#closeDialog").click();
          await page.locator("#dataset").selectOption("profiles");
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
        if(slug==="captains"){
          await page.locator("#dialogClose").click();
          await page.locator("#choiceSimulatorContent").waitFor({state:"visible",timeout:25000});
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
          const sampleSave=[
            "name: Smoke Save","---","difficulty: 2","funds: 1000",
            "bases:","  - name: Demo","    research:","      - project: STR_CAPTAIN_LAZYASS",
            "discovered:","  - STR_GDX_012",
            "researchRuleStatus:","  STR_TEC_169: 2","  STR_GDX_013: 2",
            "researchDiary:",
            "  - {date: [2601, 1, 29], name: STR_TEC_168, sourceType: 4, sourceName: STR_AURORA_EVENT}"
          ].join("\\n")+"\\n";
          await page.locator("#choiceSaveFile").setInputFiles({
            name:"choice-smoke.sav",mimeType:"text/plain",buffer:Buffer.from(sampleSave.replaceAll("\\n","\n"))
          });
          await page.waitForFunction(()=>document.querySelector("#choiceSaveSummary")?.textContent.includes("영구 배제 2개"),{timeout:10000});
          if(!await page.locator("#choiceSaveEvidence").isVisible())
            errors.push("Research diary evidence panel did not appear");
          const evidence=await page.locator("#choiceSaveEvidenceContent").innerText();
          if(!evidence.includes("배제 원인 후보")||!evidence.includes("이벤트 보상"))
            errors.push("Research diary evidence failed to connect event source with ruleset disables");
          if(await page.locator('#exclusiveRules .choice-option[data-choice-id="STR_GDX_012"]').getAttribute("data-sim-state")!=="completed")
            errors.push("Save discovered was not marked completed");
          if(await page.locator('#exclusiveRules .choice-option[data-choice-id="STR_TEC_169"]').getAttribute("data-sim-state")!=="blocked")
            errors.push("Save researchRuleStatus=2 was ignored");
          if((await page.locator("#choiceScenarioStats").innerText()).includes("연구 직접 봉쇄")===false)
            errors.push("Missing save-backed exclusions metric");
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
        if(slug==="trainings"){
          trainingStage="close detail button";
          await page.locator("#closeDialog").click();
          trainingStage="quick-add cultural education";
          await page.locator("#quickTraining").selectOption("STR_PERSON_OF_CULTURE_TRAINING");
          await page.locator("#quickAdd").click({timeout:12000});
          await input.fill("STR_PERSON_OF_CULTURE_TRAINING");
          const culture=page.locator('#trainingTable tbody tr[data-id="STR_PERSON_OF_CULTURE_TRAINING"]');
          if(!await culture.locator('[data-toggle]').isChecked())errors.push("Table checkbox did not reflect selected cultural education");
          if(await page.locator("#timeline .timeline-row").count()!==1)errors.push("Quick add did not select cultural education");
          if(!await page.locator('#newBlockedList [data-info="STR_NEPOTISM"]').count())errors.push("Newly blocked list omitted nepotism");
          if(!await page.locator('#newBlockedList [data-info="STR_MILITARY_DRILL_TRAINING"]').count())errors.push("Newly blocked list omitted military drill");
          if(!await page.locator("#latestSelectionHint").innerText().then(t=>t.includes("문화 교육")))errors.push("No selected training reason shown next to exclusions");
          const mobileTitle=await page.locator("#mobileExclusionTitle").innerText();
          if(!mobileTitle.includes("4개"))errors.push("Mobile live exclusion title did not show the four newly blocked trainings: "+mobileTitle);
          const mobileNames=await page.locator("#mobileExclusionNames").innerText();
          if(!mobileNames.includes("혈연중시")||!mobileNames.includes("군사 훈련"))
            errors.push("Mobile checklist-adjacent exclusion names missing");
          if(await page.locator(".mobile-exclusion-brief").evaluate(el=>getComputedStyle(el).position)!=="sticky")
            errors.push("Mobile exclusion summary does not stay visible during table scrolling");
          await page.locator("#mobileExclusionDetails summary").click();
          if(!(await page.locator("#mobileExclusionFull").innerText()).includes("배제 원인: 문화 교육"))
            errors.push("Mobile full exclusion list omitted ruleset-backed reasons");
          await page.locator("#mobileExclusionDetails summary").click();
          const cultureCells=await culture.locator("td").allTextContents();
          if(!cultureCells[5].includes("사격+2")||!cultureCells[6].includes("사격+1"))
            errors.push("Direct vs SoldierBonus firing bonuses not separately displayed: "+cultureCells.slice(5,7));
          trainingStage="trait stats sort";
          await input.fill("");
          await page.locator("#sortBy").selectOption("trait:firing");
          let statOrder=await page.locator("#trainingTable tbody tr[data-sort-value]").evaluateAll(trs=>trs.map(t=>Number(t.dataset.sortValue)));
          if(statOrder.length!==83||!statOrder.some(v=>v>0)||statOrder.some((v,i)=>i>0&&statOrder[i-1]<v))
            errors.push("Trait firing descending sort incorrect: count="+statOrder.length+" first="+statOrder.slice(0,12).join(",")+" max="+Math.max(...statOrder));
          await page.locator("#sortDirection").selectOption("asc");
          statOrder=await page.locator("#trainingTable tbody tr[data-sort-value]").evaluateAll(trs=>trs.map(t=>Number(t.dataset.sortValue)));
          if(statOrder.length!==83||statOrder.some((v,i)=>i>0&&statOrder[i-1]>v))
            errors.push("Trait firing ascending sort incorrect: count="+statOrder.length+" first="+statOrder.slice(0,12).join(",")+" max="+Math.max(...statOrder));
          await page.locator("#sortBy").selectOption("status");
          await input.fill("STR_NEPOTISM");
          await page.locator('#trainingTable tbody tr[data-id="STR_NEPOTISM"]').waitFor({state:"attached",timeout:10000});
          if(await page.locator('#trainingTable tbody tr[data-id="STR_NEPOTISM"] .blocked').count()!==1)errors.push("Nepotism was not blocked after cultural education");
          trainingStage="undo cultural education";
          await page.locator("#undo").click();
          if(await page.locator("#newBlockedList .choice").count())errors.push("Undo left stale newly blocked training rows");
          if(!(await page.locator("#mobileExclusionTitle").innerText()).includes("0개"))
            errors.push("Undo left stale exclusion count in the mobile summary");
          trainingStage="select and deselect via checkbox";
          await input.fill("STR_PERSON_OF_CULTURE_TRAINING");
          await culture.locator("[data-toggle]").check();
          if(!await page.locator('#newBlockedList [data-info="STR_NEPOTISM"]').count())
            errors.push("Checkbox click did not update the adjacent exclusion list");
          await culture.locator("[data-toggle]").uncheck();
          if(await page.locator("#timeline .timeline-row").count()||await page.locator("#newBlockedList .choice").count())
            errors.push("Unchecking did not clear the planning sequence and newly excluded list");
          if(!(await page.locator("#mobileExclusionTitle").innerText()).includes("0개"))
            errors.push("Unchecking did not clear the mobile exclusion summary");
          await input.fill("");
          trainingStage="quick-add military drill prerequisite chain";
          await page.locator("#quickTraining").selectOption("STR_MILITARY_DRILL_TRAINING");
          await page.locator("#quickAdd").click({timeout:12000});
          if(await page.locator("#timeline .timeline-row").count()!==3)errors.push("Three-step military prerequisite chain not added");
          if(!await page.locator('#newBlockedList [data-info="STR_PERSON_OF_CULTURE_TRAINING"]').count())
            errors.push("Newly blocked list omitted culture after military chain");
          if(!(await page.locator("#latestSelectionHint").innerText()).includes("자동 선행 포함"))
            errors.push("New exclusion list failed to indicate automatically added prerequisites");
          await input.fill("STR_MILITARY_DRILL_TRAINING");
          if(!await page.locator('#trainingTable tbody tr[data-id="STR_MILITARY_DRILL_TRAINING"] [data-toggle]').isChecked())errors.push("Military drill checkbox was not retained after rerender");
          await input.fill("STR_PERSON_OF_CULTURE_TRAINING");
          await page.locator('#trainingTable tbody tr[data-id="STR_PERSON_OF_CULTURE_TRAINING"]').waitFor({state:"attached",timeout:10000});
          if(await page.locator('#trainingTable tbody tr[data-id="STR_PERSON_OF_CULTURE_TRAINING"] .blocked').count()!==1)errors.push("Cultural education not blocked after military drill");
          trainingStage="overlapping exclusion causes after two valid choices";
          await page.locator("#reset").click();
          await input.fill("");
          await page.locator("#quickTraining").selectOption("STR_BREAD_AND_FISHES_TRAINING");
          await page.locator("#quickAdd").click({timeout:12000});
          if(!await page.locator('#newBlockedList [data-info="STR_MILITARY_DRILL_TRAINING"]').count())
            errors.push("Bread and Fishes did not initially exclude military drill");
          await page.locator("#quickTraining").selectOption("STR_PERSON_OF_CULTURE_TRAINING");
          await page.locator("#quickAdd").click({timeout:12000});
          if(await page.locator("#timeline .timeline-row").count()!==2)
            errors.push("Two separate training selections were not retained in sequence");
          if(await page.locator('#newBlockedList [data-info="STR_MILITARY_DRILL_TRAINING"]').count())
            errors.push("Overlapping military drill exclusion incorrectly counted as a new target");
          const extraRow=page.locator('#extraBlockedList .choice:has([data-info="STR_MILITARY_DRILL_TRAINING"])');
          if(!await extraRow.count()||!(await extraRow.innerText()).includes("이번 선택이 추가한 배제 원인: 문화 교육"))
            errors.push("Second choice omitted shared military drill exclusion cause");
          const previousRow=page.locator('#blockedList .choice:has([data-info="STR_MILITARY_DRILL_TRAINING"])');
          if(!await previousRow.count()||!(await previousRow.innerText()).includes("건강미 훈련")||
              !(await previousRow.innerText()).includes("문화 교육"))
            errors.push("Cumulative exclusion row does not retain BOTH blockers");
          if(!(await page.locator("#mobileExclusionTitle").innerText()).includes("원인 추가 1개")||
              !(await page.locator("#mobileExclusionNames").innerText()).includes("군사 훈련 · 원인 추가"))
            errors.push("Mobile exclusion summary concealed the second blocker");
          await page.locator("#undo").click();
          if(await page.locator("#extraBlockedList .choice").count()||
              !await page.locator('#blockedList [data-info="STR_MILITARY_DRILL_TRAINING"]').count())
            errors.push("Undo should remove the added cause while keeping the original blocker");
          trainingStage="desktop panel beside the training table";
          await page.setViewportSize({width:1500,height:900});
          await page.evaluate(()=>window.scrollTo(0,0));
          const layout=await page.evaluate(()=>{
            const table=document.querySelector(".training-workspace .listing").getBoundingClientRect();
            const side=document.querySelector(".training-workspace .decision").getBoundingClientRect();
            return{tableRight:table.right,sideLeft:side.left,tableTop:table.top,sideTop:side.top,
              sidePosition:getComputedStyle(document.querySelector(".training-workspace .decision")).position,
              mobileHidden:getComputedStyle(document.querySelector(".mobile-exclusion-brief")).display==="none",
              bodyScrollWidth:document.documentElement.scrollWidth,windowWidth:window.innerWidth};
          });
          if(layout.tableRight>=layout.sideLeft||Math.abs(layout.tableTop-layout.sideTop)>3||
            layout.sidePosition!=="sticky"||!layout.mobileHidden||layout.bodyScrollWidth>layout.windowWidth+1)
            errors.push("Training table and exclusion panel are not side-by-side on desktop: "+JSON.stringify(layout));
          await page.setViewportSize({width:390,height:844});
          trainingStage="captain route exclusivity";
          await page.locator("#captainRoute").selectOption("DUMBASS_SAINT");
          if(!(await page.locator("#routeAccessSummary").innerText()).includes("Rogue 클론 — Saint 증원")||
              !(await page.locator("#routeAccessSummary").innerText()).includes("Rogue 클론 — DumbLazy 방문")||
              !(await page.locator("#routeAccessSummary").innerText()).includes("Rogue 클론 — TroubleSeeking"))
            errors.push("Dumbass+Saint must expose all THREE repeatable Rogue recruitment event sources");
          await input.fill("STR_CAPTAINS_11");
          const cap11=page.locator('#trainingTable tbody tr[data-id="STR_CAPTAINS_11"]');
          if(!await cap11.locator('[data-toggle]').isDisabled()||
             !await page.locator('#branchBlockedList [data-info="STR_CAPTAINS_11"]').count())
            errors.push("Dumbass+Saint incorrectly allowed Thief-only Captains 11");
          await page.locator("#captainRoute").selectOption("THIEF");
          await input.fill("STR_CAPTAINS_11");
          if(await cap11.locator('[data-toggle]').isDisabled())
            errors.push("Thief must be able to plan Captains 11 with further event prerequisites");
          if(!(await page.locator("#routeAccessSummary").innerText()).includes("선택 분기에서는 불가"))
            errors.push("Thief route did not display Saint conflict");
          await page.locator("#captainRoute").selectOption("PRIEST");
          await input.fill("STR_BREAD_AND_FISHES_TRAINING");
          if(await page.locator('#trainingTable tbody tr[data-id="STR_BREAD_AND_FISHES_TRAINING"] [data-toggle]').isDisabled())
            errors.push("Priest-exclusive Bread and Fishes was blocked in Priest branch");
          await page.locator("#captainRoute").selectOption("ANY");
          await page.locator("#origin").selectOption("profile:manufacture:STR_THEBAN_ASSAULT_CLONE");
          await input.fill("STR_BATTLE_FORM_AUGMENTATION");
          if(!await page.locator('#trainingTable tbody tr[data-id="STR_BATTLE_FORM_AUGMENTATION"] [data-toggle]').isDisabled())
            errors.push("Egyptian Assault Clone was permitted forbidden Battle Form");
          await input.fill("STR_CAREER_SOLDIER");
          if(!await page.locator('#trainingTable tbody tr[data-id="STR_CAREER_SOLDIER"] [data-toggle]').isDisabled())
            errors.push("STR_UNAVAILABLE internal transformation became executable");
          await page.locator("#captainRoute").selectOption("DUMBASS_SAINT");
          await page.locator("#origin").selectOption("profile:manufacture:STR_ROGUE_CLONE_RECRUITMENT");
          await input.fill("STR_BREAD_AND_FISHES_TRAINING");
          if(!await page.locator('#trainingTable tbody tr[data-id="STR_BREAD_AND_FISHES_TRAINING"] [data-toggle]').isDisabled())
            errors.push("Rogue clone omitted prior Theban transformation exclusion");
          trainingStage="additional research branch exclusions";
          await page.locator("#captainRoute").selectOption("ANY");
          await page.locator("#origin").selectOption("base:STR_SOLDIER");
          if(await page.locator("#researchRouteSelectors select").count()<5)
            errors.push("Cross-branch training DB selectors not present");
          await page.locator("#research-route-path").selectOption("STR_PEASANT_REVOLUTION_PREQ");
          await input.fill("STR_PURE_MAIDEN_TRAINING");
          if(!await page.locator('#branchBlockedList [data-info="STR_PURE_MAIDEN_TRAINING"]').count())
            errors.push("Peasant Revolution failed to close Pure Maiden training");
          await page.locator("#research-route-path").selectOption("STR_CAT_PATH_PREQ");
          if(await page.locator('#branchBlockedList [data-info="STR_PURE_MAIDEN_TRAINING"]').count())
            errors.push("Cat path falsely inherited Peasant Revolution block");
          await page.locator("#research-route-path").selectOption("STR_HYBRID_PATH_PREQ");
          if(await page.locator('#branchBlockedList [data-info="STR_PURE_MAIDEN_TRAINING"]').count())
            errors.push("Hybrid path falsely inherited Peasant Revolution block");
          await page.locator(".research-route-panel details.extra-research summary").click();
          await page.locator("#researchRouteExtra").fill("STR_UNKNOWN_RESEARCH_SMOKE");
          await page.locator("#researchRouteExtra").dispatchEvent("change");
          if(!(await page.locator("#researchRouteHint").innerText()).includes("STR_UNKNOWN_RESEARCH_SMOKE"))
            errors.push("Unknown research IDs silently ignored in training branch planner");
          await page.locator("#researchRouteExtra").fill("");
          await page.locator("#researchRouteExtra").dispatchEvent("change");
          await page.locator("#captainRoute").selectOption("DUMBASS_SAINT");
          await input.fill("STR_CAPTAINS_11");
          await page.locator('#trainingTable tbody tr[data-id="STR_CAPTAINS_11"] td').first().click();
          const capEvidence=await page.locator("#detailBody").innerText();
          if(!capEvidence.includes("동일 이벤트 연구+전용 재료")||
             !capEvidence.includes("STR_CAPTAINS_11_TOKEN")||
             !capEvidence.includes("STR_CAPTAIN_THIEF"))
            errors.push("Captain's 11 detail omitted event-to-research/token/Thief evidence");
          await page.locator("#closeDialog").click();
          trainingStage="completed";
          detail+=" + checkbox / exclusion deltas / trait stat sort / prerequisite chain / captain branch + Rogue clone";
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
          detail+=" + Cunning downstream/event gates";
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
