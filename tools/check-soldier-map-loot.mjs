import assert from "node:assert/strict";
import fs from "node:fs";
import {buildMapLootSources} from "./soldier-map-provenance.mjs";
import {renderRareMapLootProof} from "../public/soldiers/modern/map-loot-ui.js";

const data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json","utf8"));
let checks=0;
function test(label,fn){fn();checks++;console.log("PASS "+label)}
const by=(id,block)=>data.itemSupply[id]?.mapLoot?.sources.find(x=>x.block===block);
const choose=(src,id)=>src?.missionPaths?.find(m=>m.deployment===id);
test("GDX 005 is fixed on ABASE_03 and map script forces the sole group-7 block",()=>{
  const e=by("STR_GDX_005","ABASE_03");
  assert(e);assert.equal(e.terrain,"GDX_PRISON");
  assert.equal(e.placement,"fixedOnBlock");assert.equal(e.count,1);
  assert.equal(e.blockSelection,"soleCandidateForAddBlock");
  const s=e.selectors.find(x=>x.soleCandidate);
  assert.equal(s.groups,7);assert.equal(s.size,2);assert.equal(s.candidateCount,1);
});
test("GDX prison mission is gated on GDX_004 without prison-already-complete",()=>{
  const e=by("STR_GDX_005","ABASE_03");
  const m=choose(e,"STR_LOC_GDX_PRISON");
  assert(m);assert.equal(m.script,"gdxPrisonMission");assert.equal(m.executionOdds,100);
  assert(m.researchPositive.includes("STR_GDX_004"));
  assert(m.researchNegative.includes("STR_LOC_GDX_PRISON_DONE"));
  assert.equal(m.monthWeights[0].weight,100);
});
test("mansion's sole 30x30 map block carries five Dream Echo items",()=>{
  const e=by("STR_DREAM_ECHO","EMANS_VOID20");
  assert(e);assert.equal(e.count,5);
  assert.equal(e.terrain,"EMANSION_MAG");
  const s=e.selectors.find(x=>x.soleCandidate);
  assert(s);assert.equal(s.size,3);assert.equal(s.candidateCount,1);
});
test("future mansion script needs butcher cleared and is conditional 13 percent",()=>{
  const m=choose(by("STR_DREAM_ECHO","EMANS_VOID20"),"STR_LOC_EMANSION_MAG");
  assert(m);assert.equal(m.executionOdds,13);
  assert(m.researchPositive.includes("STR_BUTCHER_DONE"));
  assert.equal(m.script,"EmansionShadworealms");
});
test("mansion void block contains one fixed mystery box on the same terrain",()=>{
  const e=by("STR_MYSTERY_BOX","EMANS_VOID20");
  assert(e);assert.equal(e.count,1);
  assert.equal(e.blockSelection,"soleCandidateForAddBlock");
});
test("sewer block 00/03/07 has fixed Dream Echo but map choice is not guaranteed",()=>{
  const counts=[4,2,2];
  for(const [i,block] of ["CATACOMBS_SEWER_00","CATACOMBS_SEWER_03",
    "CATACOMBS_SEWER_07"].entries()){
    const e=by("STR_DREAM_ECHO",block);
    assert(e);assert.equal(e.count,counts[i]);
    assert.equal(e.blockSelection,"conditional");
    assert(choose(e,"STR_LOC_CITY_OF_THE_DEAD_SEWERS"));
  }
});
test("first sewer and repeat sewer mission conditions are not conflated",()=>{
  const e=by("STR_DREAM_ECHO","CATACOMBS_SEWER_00");
  const a=e.missionPaths.find(x=>x.script==="SewersOfTheDead");
  const b=e.missionPaths.find(x=>x.script==="SewersOfTheDeadAfter");
  assert.equal(a.executionOdds,75);
  assert(a.researchPositive.includes("STR_MISSION_DEAD_SEWERS"));
  assert.equal(b.executionOdds,35);
  assert(b.researchPositive.includes("STR_DEAD_SEWERS_DONE"));
});
test("map-placed mystery box and probabilistic medallion manufacture stay distinct",()=>{
  assert.equal(data.itemSupply.STR_AVATAR_MEDALLION.mapLoot.sources.length,0);
  const recipes=data.itemSupply.STR_AVATAR_MEDALLION.randomManufacture;
  assert(recipes.some(r=>r.id==="STR_MYSTERY_BOX_OPEN"&&r.weight===1&&r.weightTotal===34));
  assert(recipes.some(r=>r.id==="STR_WIZ_128_EX"&&r.weight===3&&r.weightTotal===480));
  const saint=data.itemSupply.STR_SAINT_OUTFIT.manufacture;
  assert(saint.some(r=>r.requiredItems.STR_AVATAR_MEDALLION===1&&
    r.requiresBaseFunc.includes("SUMM")));
});
test("mission existence alone cannot make a missing MapScript block certain",()=>{
  const mini={
    terrains:[{name:"T",script:"S",mapBlocks:[
      {name:"A",width:20,length:20,groups:7,items:{I:[[1,1,0]]}},
      {name:"B",width:20,length:20,groups:7,items:{I:[[2,2,0]]}}
    ]}],
    mapScripts:[{type:"S",commands:[{type:"addBlock",size:2,groups:7}]}],
    alienDeployments:[{type:"MISSION",terrains:["T"]}],
    alienMissions:[{type:"MISSION",waves:[{ufo:"dummy"}]}],
    missionScripts:[{type:"SCRIPT",missionWeights:{0:{MISSION:100}}}]
  };
  const map=buildMapLootSources(mini,["I"]);
  assert.equal(map.I.sources.length,2);
  assert(map.I.sources.every(x=>x.blockSelection==="conditional"));
  assert(map.I.sources.every(x=>x.recovery.includes("actual generated mission")));
});
test("map item provenance stays bounded and is clearly marked truncated",()=>{
  const m=data.itemSupply.STR_DREAM_ECHO.mapLoot;
  assert(m.sourceCount>m.sources.length);
  assert(m.possiblyTruncated);
  assert(m.sources.length<=m.maxPerItem);
  assert(data.itemSupply.STR_GDX_005.mapLoot.sources.length===1);
});
test("browser markup includes map script, mission prerequisites and no guaranteed recovery",()=>{
  const node={innerHTML:""};
  renderRareMapLootProof(node,data);
  assert(node.innerHTML.includes("EMANS_VOID20"));
  assert(node.innerHTML.includes("ABASE_03"));
  assert(node.innerHTML.includes("STR_GDX_004"));
  assert(node.innerHTML.includes("임무 발동"));
  assert(node.innerHTML.includes("STR_MYSTERY_BOX_OPEN"));
});
console.log(JSON.stringify({result:"PASS",checks,itemsWithSource:
  Object.values(data.itemSupply).filter(x=>x.mapLoot?.sources?.length).length}));
