import assert from "node:assert/strict";
import fs from "node:fs";
import {buildChoiceIndex} from "../public/captains/choice-simulator-core.js";
import {createResearchStoryOverlay,RESEARCH_STORY_ROUTES} from "../public/research/branch-access.js";

const runtime=JSON.parse(fs.readFileSync("public/data/choice-simulator-index.json","utf8"));
const index=buildChoiceIndex(runtime.topics,{inline:true,unresolvedByField:runtime.unresolvedByField});
assert.equal(runtime.topics.length,4612);
assert.equal(createResearchStoryOverlay(index,""),null);
assert.equal(createResearchStoryOverlay(index,"invalid"),null);

const male=createResearchStoryOverlay(index,"male-touch");
assert.equal(male.inspect("STR_WE_NEED_MALE_TOUCH_PREQ").kind,"completed");
assert.equal(male.inspect("STR_WE_NEED_MALE_TOUCH").kind,"completed");
assert.equal(male.inspect("STR_GALS_ARE_SUPERIOR_PREQ").kind,"direct");
assert.equal(male.inspect("STR_GALS_ARE_SUPERIOR").kind,"direct");
assert.equal(male.inspect("STR_PARTY").kind,"path-blocked");
assert.equal(male.inspect("STR_SHAKEUP_CEREMONY").kind,"path-blocked");
assert.equal(male.inspect("STR_SHAKEUP_CEREMONY").reasonPath[0],"STR_SHAKEUP_CEREMONY");
assert.equal(male.inspect("STR_SHAKEUP_CEREMONY").reasonPath.at(-1),"STR_GALS_ARE_SUPERIOR");
assert.notEqual(male.inspect("STR_BONDING_CEREMONY").kind,"path-blocked");
assert.equal(male.possible("STR_BONDING_CEREMONY"),true);
assert.notEqual(male.inspect("STR_PARTY_DEP").kind,"path-blocked",
  "Bonding Ceremony unlocks Party_DEP, bypassing conflicting nominal dependencies");
assert(male.viableAlternates("STR_PARTY_DEP").some(x=>x.source==="STR_BONDING_CEREMONY"));

const gals=createResearchStoryOverlay(index,"gals-superior");
assert.equal(gals.inspect("STR_WE_NEED_MALE_TOUCH").kind,"direct");
assert.equal(gals.inspect("STR_WE_NEED_MALE_TOUCH_PREQ").kind,"direct");
assert.notEqual(gals.inspect("STR_PARTY").kind,"path-blocked");
assert.notEqual(gals.inspect("STR_SHAKEUP_CEREMONY").kind,"path-blocked");
assert.equal(gals.possible("STR_SHAKEUP_CEREMONY"),true);

const mock=buildChoiceIndex([
  {id:"STR_WE_NEED_MALE_TOUCH_PREQ",disables:["CLOSED"]},
  {id:"STR_WE_NEED_MALE_TOUCH"},
  {id:"CLOSED"},
  {id:"FOLLOWUP",dependencies:["CLOSED"]},
  {id:"OPEN",dependencies:["CLOSED"]},
  {id:"OPEN_SOURCE",unlocks:["OPEN"]},
  {id:"HARD",requires:["CLOSED"],dependencies:["CLOSED"]},
  {id:"HARD_SOURCE",unlocks:["HARD"]},
  {id:"FREE",requires:["CLOSED"]},
  {id:"FREE_SOURCE",getOneFree:["FREE"]},
  {id:"PROTECTED_FREE",dependencies:["CLOSED"]},
  {id:"PROTECTED_FREE_SOURCE",getOneFreeProtected:{OPEN_SOURCE:["PROTECTED_FREE"]}},
  {id:"UNSAFE",dependencies:["CLOSED"]},
  {id:"UNSAFE_SOURCE",unlocks:["UNSAFE"],disables:["UNSAFE"]},
  {id:"CYCLE_ONE",dependencies:["CYCLE_TWO"]},
  {id:"CYCLE_TWO",dependencies:["CYCLE_ONE"]}
],{inline:true});
const route=createResearchStoryOverlay(mock,"male-touch");
assert.equal(route.inspect("CLOSED").kind,"direct");
assert.equal(route.inspect("FOLLOWUP").kind,"path-blocked");
assert.equal(route.inspect("OPEN").kind,"alternative");
assert.equal(route.inspect("HARD").kind,"path-blocked","unlocks cannot bypass requires");
assert.equal(route.inspect("FREE").kind,"alternative","free-grant alternative remains possible, not guaranteed");
assert.equal(route.inspect("PROTECTED_FREE").kind,"alternative");
assert.equal(route.inspect("UNSAFE").kind,"path-blocked","self-disabling unlockers are never safe");
assert.equal(route.possible("CYCLE_ONE"),true,"cycles without proven blockers remain uncertain");
for(const config of RESEARCH_STORY_ROUTES.filter(x=>x.id)){
  const choice=createResearchStoryOverlay(index,config.id);
  assert(choice.counts().completed>=2,config.id+" should seed the branch and its precondition");
}

const html=fs.readFileSync("public/research/index.html","utf8");
const js=fs.readFileSync("public/items/app.js","utf8");
for(const token of ["id=\"researchStoryRoute\"","id=\"researchStoryRouteInfo\"","male-touch","gals-superior"])
  assert(html.includes(token),"Research scenario UI missing "+token);
for(const token of ["createResearchStoryOverlay","researchStoryBadge(x.id)","researchStoryDetail(d.id)","routeStatus"])
  assert(js.includes(token),"Research list/detail scenario overlay missing "+token);
console.log("OK research branch scenario: Male Touch blocks Party/Shakeup; Gals route permits; Bonding->Party_DEP remains viable; unlock/require/free/cycle cases covered.");
