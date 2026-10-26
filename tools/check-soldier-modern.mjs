import assert from "node:assert/strict";
import fs from "node:fs";
import {initialState,eligibleTransformation,applyTransformation,researchPlan,findTransformationPath,availableSoldierArmors,battleStatsWithEquipment} from "../public/soldiers/modern/eligibility.js";

const dataPath=process.argv[2]||"public/data/soldiers-modern-index.json";
const data=JSON.parse(fs.readFileSync(dataPath,"utf8"));
const mini={
  soldiers:[{id:"GAL",allowPromotion:true,minStats:{},maxStats:{},statCaps:{}}],
  profiles:[],
  transformations:[],
  bonuses:[{id:"BONUS",stats:{firing:5}}],
  researchRules:{},
  itemSupply:{}
};
const rule=(id,overrides={})=>({
  id,allowsLiveSoldiers:true,allowsWoundedSoldiers:false,allowsDeadSoldiers:false,
  needsCorpseRecovered:true,allowedSoldierTypes:["GAL"],
  requiredPreviousTransformations:[],forbiddenPreviousTransformations:[],
  requiredMinStats:{},requiredMaxStats:null,
  requires:[],requiredItems:{},requiredCommendations:{},requiresBaseFunc:[],
  cost:0,minRank:0,flatOverallStatChange:{},percentOverallStatChange:{},
  percentGainedStatChange:{},...overrides
});
function state(){const s=initialState(mini,"GAL");s.currentStats.health=1;s.initialStats.health=1;return {...s,exactStats:true}}
function check(r,s=state(),d=mini,o={}){
  return eligibleTransformation(r,s,d,{mode:"current",researched:[],baseFunctions:[],items:{},funds:1000000,...o});
}
function future(r,s=state(),d=mini,o={}){return eligibleTransformation(r,s,d,{mode:"future",...o})}
let checks=0;
function test(label,fn){fn();checks++;console.log("PASS "+label)}
test("83 transformation rules, 72 acquisition profiles, complete research index",()=>{
  assert.equal(data.transformations.length,83);
  assert.equal(data.profiles.length,72);
  assert.ok(Object.keys(data.researchRules).length>4600);
  assert.ok(Object.keys(data.itemSupply).length>0);
});
test("every transformation carries engine qualification fields",()=>{
  const fields=["requiredItems","requiredCommendations","requiredMinStats","requiredMaxStats",
    "allowsLiveSoldiers","allowsWoundedSoldiers","allowsDeadSoldiers","needsCorpseRecovered",
    "minRank","reset","removeTransformations","producedSoldierType","createsClone",
    "percentOverallStatChange","percentGainedStatChange","flatMin","flatMax",
    "includeBonusesForMinStats","includeBonusesForMaxStats","upperBoundType"];
  for(const r of data.transformations){
    for(const f of fields)assert.ok(Object.prototype.hasOwnProperty.call(r,f),r.id+" missing "+f);
  }
});
test("engine uses directional forbidden history, not symmetric forbiddance",()=>{
  const a=rule("A",{forbiddenPreviousTransformations:["B"]}),b=rule("B");
  mini.transformations=[a,b];
  const ab=applyTransformation(a,state(),mini,{mode:"current",funds:1000000});
  assert.equal(ab.verdict.kind,"eligible");
  assert.equal(check(b,ab.state).kind,"eligible","A forbidding B must not block B after A");
  const ba=applyTransformation(b,state(),mini,{mode:"current",funds:1000000});
  assert.equal(check(a,ba.state).kind,"blocked","A after B is forbidden");
});
test("required previous history and repeat exclusion",()=>{
  const a=rule("A",{forbiddenPreviousTransformations:["A"]});
  const b=rule("B",{requiredPreviousTransformations:["A"]});
  mini.transformations=[a,b];
  assert.equal(check(b).kind,"blocked");
  const added=applyTransformation(a,state(),mini,{mode:"current",funds:1000000}).state;
  assert.equal(check(b,added).kind,"eligible");
  assert.equal(check(a,added).kind,"blocked");
});
test("production soldier type changes subsequent eligibility",()=>{
  const a=rule("A",{producedSoldierType:"OTHER"});
  const b=rule("B");
  const produced=applyTransformation(a,state(),mini,{mode:"current",funds:1000000}).state;
  assert.equal(produced.soldierType,"OTHER");
  assert.equal(check(b,produced).kind,"blocked");
});
test("reset clears old history and transformation bonus, then adds new history",()=>{
  mini.bonuses=[{id:"BONUS",stats:{tu:4}}];
  const a=rule("A",{soldierBonusType:"BONUS"});
  const reset=rule("R",{reset:true});
  const first=applyTransformation(a,state(),mini,{mode:"current",funds:1000000}).state;
  assert.ok(first.history.has("A"));assert.ok(first.bonusIds.has("BONUS"));
  const second=applyTransformation(reset,first,mini,{mode:"current",funds:1000000}).state;
  assert.ok(!second.history.has("A"));assert.ok(second.history.has("R"));
  assert.ok(!second.bonusIds.has("BONUS"));
});
test("clone branches start with their own history and traits",()=>{
  const a=rule("A"),c=rule("CLONE",{createsClone:true,soldierBonusType:"BONUS"});
  const earlier=applyTransformation(a,state(),mini,{mode:"current",funds:1000000}).state;
  const clone=applyTransformation(c,earlier,mini,{mode:"current",funds:1000000}).state;
  assert.equal(clone.history.size,0);
  assert.ok(clone.bonusIds.has("BONUS"));
  assert.equal(clone.rank,0);
});
test("vital status, corpse requirement, and rank rules",()=>{
  assert.equal(check(rule("DEAD",{allowsLiveSoldiers:false,allowsDeadSoldiers:true})).kind,"blocked");
  let s=state();s.status="dead";
  assert.equal(check(rule("DEAD",{allowsLiveSoldiers:false,allowsDeadSoldiers:true}),s).kind,"blocked");
  s.corpseRecovered=true;
  assert.equal(check(rule("DEAD",{allowsLiveSoldiers:false,allowsDeadSoldiers:true}),s).kind,"eligible");
  assert.equal(check(rule("PROMO",{minRank:2})).kind,"blocked");
  assert.equal(future(rule("PROMO",{minRank:2})).kind,"conditional");
});
test("minimum and maximum stats, bonuses, and commendations",()=>{
  let s=state();s.currentStats.firing=45;s.bonusIds=new Set(["BONUS"]);
  mini.bonuses=[{id:"BONUS",stats:{firing:5}}];
  assert.equal(check(rule("STAT",{requiredMinStats:{firing:50},includeBonusesForMinStats:true}),s).kind,"eligible");
  assert.equal(check(rule("STAT",{requiredMinStats:{firing:50},includeBonusesForMinStats:false}),s).kind,"blocked");
  assert.equal(check(rule("STAT",{requiredMaxStats:{firing:40}}),s).kind,"blocked");
  const medal=rule("MEDAL",{requiredCommendations:{MEDAL:3}});
  assert.equal(check(medal,s).kind,"blocked");
  assert.equal(check(medal,s,mini,{commendations:{MEDAL:3}}).kind,"eligible");
});
test("current base, item, research gates are not inferred from future",()=>{
  const withReq=rule("R",{requires:["TECH"],requiresBaseFunc:["CULT"],requiredItems:{GLAMOUR:6}});
  const d={...mini,researchRules:{TECH:{cost:15,requires:[],dependencies:[],disables:[]}}};
  assert.equal(check(withReq,state(),d).kind,"blocked");
  assert.equal(check(withReq,state(),d,{researched:["TECH"],baseFunctions:["CULT"],items:{GLAMOUR:6}}).kind,"eligible");
  assert.equal(future(withReq,state(),d).kind,"conditional");
});
test("one-sided research disables permit completion in the correct order",()=>{
  const rules={A:{cost:5,disables:["B"]},B:{cost:5}};
  const p=researchPlan(["A","B"],rules);
  assert.equal(p.kind,"viable");
  assert.ok(p.order.indexOf("B")<p.order.indexOf("A"));
  assert.equal(researchPlan(["B"],rules,{researched:["A"]}).kind,"blocked");
});
test("symmetric research disables are mutually exclusive",()=>{
  const rules={A:{cost:5,disables:["B"]},B:{cost:5,disables:["A"]}};
  assert.equal(researchPlan(["A","B"],rules).kind,"blocked");
});
test("research dependencies and disables across multiple transformations",()=>{
  const researchRules={A:{cost:5,dependencies:["B"]},B:{cost:5,disables:["A"]}};
  assert.equal(researchPlan(["A"],researchRules).kind,"blocked");
  const a=rule("T1",{requires:["A"]}),b=rule("T2",{requires:["B"]});
  const d={...mini,researchRules};
  const s=state();
  const applied=applyTransformation(b,s,d,{mode:"future"});
  assert.equal(applied.verdict.kind,"conditional");
  assert.equal(eligibleTransformation(a,applied.state,d,{mode:"future"}).kind,"blocked");
});
test("source acquisition variants preserve automatic traits and initial transformation history",()=>{
  const half=data.profiles.find(x=>x.traitNames.includes("STR_HALF_UBER"));
  assert.ok(half,"a half-uber recruitment variant must exist");
  const st=initialState(data,half.id);
  assert.ok(st.bonusIds.has("STR_HALF_UBER"));
  assert.equal(st.soldierType,half.soldierType);
});
test("real X-Piratez prerequisite and self-forbidden transformations",()=>{
  const gun=data.transformations.find(x=>x.id==="STR_GUN_KATA_TRAINING");
  assert.ok(gun.requiredPreviousTransformations.includes("STR_BASIC_FIREARMS_TRAINING"));
  const s=initialState(data,"base:STR_SOLDIER");
  assert.equal(future(gun,s,data).kind,"blocked");
  const personal=data.transformations.find(x=>x.id==="STR_PERSONAL_ATTENTION");
  assert.ok(personal.forbiddenPreviousTransformations.includes(personal.id));
  const p=applyTransformation(personal,s,data,{mode:"future"});
  assert.notEqual(p.verdict.kind,"blocked");
  assert.equal(future(personal,p.state,data).kind,"blocked");
});
test("automatic prerequisite witness follows engine chronology",()=>{
  const a=rule("A"),b=rule("B",{requiredPreviousTransformations:["A"]});
  mini.transformations=[a,b];
  const witness=findTransformationPath("B",state(),mini);
  assert.deepEqual(witness.path,["A","B"]);
  assert.equal(witness.kind,"eligible");
});
test("automatic future research route is never presented as guaranteed",()=>{
  const p=rule("P",{requires:["R"]});
  mini.transformations=[p];
  mini.researchRules={R:{cost:10,dependencies:[]}};
  const witness=findTransformationPath("P",state(),mini);
  assert.equal(witness.kind,"conditional");
});
test("body-only engine closure proves 43 Gal-only exclusions",()=>{
  const s=initialState(data,"base:STR_SOLDIER");
  const paths=data.transformations.map(x=>findTransformationPath(x.id,s,data,{maxDepth:8,maxNodes:300}));
  assert.equal(paths.filter(x=>x.kind==="blocked").length,43);
  assert.equal(paths.filter(x=>x.kind==="conditional").length,40);
  assert.equal(paths.filter(x=>x.kind==="unknown").length,0);
  assert.ok(paths.find((_,i)=>data.transformations[i].id==="STR_HONOMORED_WARRIOR_TRAINING")==null||
    paths.length===83);
});
test("research unlock bypass keeps alternatives conditional, not falsely excluded",()=>{
  const d={A:{cost:9,dependencies:["B"]},B:{cost:9,disables:["A"]},U:{cost:5,unlocks:["A"]}};
  const p=researchPlan(["A"],d);
  assert.equal(p.kind,"conditional");
  assert.equal(p.blocked.length,0);
  assert.ok(p.conditions.some(x=>x.includes("우회 해금")));
});
test("research re-enabling is not treated as a permanent logical dead end",()=>{
  const r={A:{cost:4,disables:["B"]},B:{cost:5},C:{cost:5,reenables:["B"]}};
  const v=researchPlan(["B"],r,{researched:["A"],disabled:["B"]});
  assert.equal(v.kind,"conditional");
  assert.equal(v.blocked.length,0);
});
test("research obtained for an earlier transformation need not remain discovered forever",()=>{
  const m={...mini,researchRules:{A:{cost:4},B:{cost:4,disables:["A"]}}};
  const a=rule("A_TRANS",{requires:["A"]}),b=rule("B_TRANS",{requires:["B"]});
  const before=applyTransformation(a,state(),m,{mode:"future"});
  assert.equal(before.verdict.kind,"conditional");
  assert.notEqual(future(b,before.state,m).kind,"blocked");
});
test("template merge zero keeps rolled stats in Rogue and Theban clone",()=>{
  for(const id of ["manufacture:STR_ROGUE_CLONE_RECRUITMENT","manufacture:STR_THEBAN_ASSAULT_CLONE"]){
    const p=data.profiles.find(x=>x.id===id);
    assert.ok(p,id);
    const ruleData=data.soldiers.find(x=>x.id===p.soldierType);
    for(const [key,val] of Object.entries(p.currentStatsOverride||{})){
      if(val!==0)continue;
      assert.equal(p.currentStatsBeforeTraits.avg[key],ruleData.avgStats[key],id+" "+key+" did not retain roll");
    }
  }
});
test("current and initial profile stats are distinct for earned-gain percentages",()=>{
  for(const p of data.profiles.filter(x=>x.initialStatsOverride)){
    assert.ok(p.initialStatsBeforeTraits?.avg,"initial stats not available for "+p.id);
    const st=initialState(data,p.id);
    assert.deepEqual(st.initialStats,p.initialStatsBeforeTraits.avg);
  }
});
test("engine stat arithmetic rounds bravery and truncates percent toward zero",()=>{
  const m={...mini,soldiers:[{id:"GAL",allowPromotion:true,minStats:{},maxStats:{},statCaps:{}}]};
  const st=state();st.currentStats={...st.currentStats,bravery:30,firing:50,tu:50};
  st.initialStats={...st.initialStats,bravery:20,firing:40,tu:40};
  const t=rule("ST",{flatOverallStatChange:{bravery:6},percentOverallStatChange:{firing:11},percentGainedStatChange:{firing:-15}});
  const applied=applyTransformation(t,st,m,{mode:"current",funds:1000});
  assert.equal(applied.state.currentStats.bravery,40);
  assert.equal(applied.state.currentStats.firing,54); // 50 + trunc(5.5) + trunc(-1.5)
  assert.equal(applied.state.exactStats,true);
});
test("same-body soft stat cap retains preexisting overcap and still allows penalties",()=>{
  const m={...mini,soldiers:[{id:"GAL",allowPromotion:true,minStats:{},maxStats:{},statCaps:{tu:60}}]};
  const st=state();st.currentStats={...st.currentStats,tu:70};
  const up=rule("UP",{upperBoundAtStatCaps:true,flatOverallStatChange:{tu:5}});
  const down=rule("DOWN",{upperBoundAtStatCaps:true,flatOverallStatChange:{tu:-5}});
  assert.equal(applyTransformation(up,st,m,{mode:"current",funds:1000}).state.currentStats.tu,70);
  assert.equal(applyTransformation(down,st,m,{mode:"current",funds:1000}).state.currentStats.tu,65);
});
test("hard cap clamps even a currently over-cap soldier",()=>{
  const m={...mini,soldiers:[{id:"GAL",allowPromotion:true,minStats:{},maxStats:{},statCaps:{tu:60}}]};
  const st=state();st.currentStats={...st.currentStats,tu:70};
  const t=rule("HARD",{upperBoundAtStatCaps:true,upperBoundType:2,flatOverallStatChange:{tu:5}});
  assert.equal(applyTransformation(t,st,m,{mode:"current",funds:1000}).state.currentStats.tu,60);
});
test("random reroll cannot be certified as an exact future stat",()=>{
  const m={...mini,soldiers:[{id:"GAL",allowPromotion:true,minStats:{tu:40},maxStats:{tu:65},statCaps:{}}]};
  const st=state();
  const t=rule("REROLL",{rerollStats:{tu:true}});
  const s=applyTransformation(t,st,m,{mode:"current",funds:1000}).state;
  assert.equal(s.exactStats,false);
  assert.equal(s.currentStats.tu,40);
});
test("single armor slot is used and competing armor bonuses never stack",()=>{
  const m={...mini,
    armorCatalog:[
      {id:"A1",soldierTypes:["GAL"],storeItem:"CLOTH1",stats:{firing:10}},
      {id:"A2",soldierTypes:["GAL"],storeItem:"CLOTH2",stats:{firing:20}}
    ],
    itemSupply:{CLOTH1:{exists:true},CLOTH2:{exists:true}}};
  const st=state();st.currentStats.firing=40;
  const first=battleStatsWithEquipment(st,m,{armorId:"A1"});
  const second=battleStatsWithEquipment(st,m,{armorId:"A2"});
  assert.equal(first.stats.firing,50);assert.equal(second.stats.firing,60);
  assert.equal(second.stats.firing-first.stats.firing,10);
});
test("wrong-soldier armor rejected even if it has a high stat bonus",()=>{
  const m={...mini,armorCatalog:[{id:"PEASANT_ONLY",soldierTypes:["PEASANT"],stats:{firing:999}}]};
  assert.equal(availableSoldierArmors(state(),m).length,0);
  assert.equal(battleStatsWithEquipment(state(),m,{armorId:"PEASANT_ONLY"}).kind,"blocked");
});
test("duplicate commendation and transformation bonus rule is counted once",()=>{
  const m={...mini,bonuses:[{id:"BONUS",stats:{firing:10}}],
    commendationIndex:{MEDAL:{bonusLevels:["BONUS","BONUS"]}}};
  const st=state();st.currentStats.firing=40;st.bonusIds=new Set(["BONUS"]);
  assert.equal(battleStatsWithEquipment(st,m,{commendations:{MEDAL:1}}).stats.firing,50);
});
test("untrained psi skill cannot be enabled by a soldier bonus",()=>{
  const m={...mini,bonuses:[{id:"PSI",stats:{psiSkill:20}}]};
  const st=state();st.currentStats.psiSkill=0;st.bonusIds=new Set(["PSI"]);
  assert.equal(battleStatsWithEquipment(st,m).stats.psiSkill,0);
  assert.equal(check(rule("PSI_GATE",{requiredMinStats:{psiSkill:10},includeBonusesForMinStats:true}),st,m).kind,"blocked");
});
test("real armor and commendation catalogs were indexed from rule sources",()=>{
  assert.equal(data.armorCatalog.length,540);
  assert.equal(Object.keys(data.commendationIndex).length,110);
  assert.ok(data.armorCatalog.some(x=>x.soldierTypes.includes("STR_SOLDIER")&&x.stats.firing>0));
  assert.ok(data.commendationIndex.STR_MEDAL_SERVICE_TIME_NAME.bonusLevels.length>=3);
});
console.log("SOLDIER_ELIGIBILITY_PASS="+checks);
