import assert from "node:assert/strict";
import fs from "node:fs";
import {initialState,eligibleTransformation,applyTransformation,researchPlan,findTransformationPath,availableSoldierArmors,battleStatsWithEquipment,reachableSoldierTypes,unavoidableHistoryByBody,structuralTransformationVerdict} from "../public/soldiers/modern/eligibility.js";

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
test("vanilla XCOM research inheritance is tracked without resurrecting Piratez deletions",()=>{
  assert.equal(Object.keys(data.researchRules).length,4654);
  assert.match(data.meta.source.standardResearch.sha256,/^[a-f0-9]{64}$/);
  assert.equal(data.researchRules.STR_HEAVY_PLASMA,undefined);
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
test("engine demotes rank when new body does not allow promotion",()=>{
  const soldierOld={id:"GAL",allowPromotion:true,minStats:{},maxStats:{},statCaps:{},raw:{rankStrings:["R0","R1","R2","R3","R4","R5"]}};
  const soldierNew={id:"R",allowPromotion:false,minStats:{},maxStats:{},statCaps:{},raw:{rankStrings:["R0"]}};
  const d={...mini,soldiers:[soldierOld,soldierNew]};
  const old={...state(),rank:4};
  const change=applyTransformation(rule("BODY",{producedSoldierType:"R"}),old,d,{mode:"current",funds:1000}).state;
  assert.equal(change.rank,0);
  const futureRank=rule("RANK2",{allowedSoldierTypes:["R"],minRank:2});
  assert.equal(check(futureRank,change,d).kind,"blocked");
});
test("engine truncates rank to the new body's rank string list",()=>{
  const d={...mini,soldiers:[
    {id:"GAL",allowPromotion:true,minStats:{},maxStats:{},statCaps:{}},
    {id:"X",allowPromotion:true,minStats:{},maxStats:{},statCaps:{},raw:{rankStrings:["R0","R1","R2"]}}
  ]};
  const src={...state(),rank:5};
  const target=applyTransformation(rule("TO_X",{producedSoldierType:"X"}),src,d,{mode:"current",funds:1000}).state;
  assert.equal(target.rank,2);
  assert.equal(applyTransformation(rule("RESET_RANK",{allowedSoldierTypes:["X"],resetRank:true}),target,d,{mode:"current",funds:1000}).state.rank,0);
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
test("same bonus from two transformations survives removal of only one source",()=>{
  const a=rule("SOURCE_A",{soldierBonusType:"BONUS"});
  const b=rule("SOURCE_B",{soldierBonusType:"BONUS"});
  const remove=rule("REMOVE_A",{removeTransformations:["SOURCE_A"]});
  const d={...mini,transformations:[a,b,remove],
    bonuses:[{id:"BONUS",stats:{firing:10}}]};
  let st=state();
  st=applyTransformation(a,st,d,{mode:"current",funds:1000}).state;
  st=applyTransformation(b,st,d,{mode:"current",funds:1000}).state;
  assert.equal(st.bonusCounts.get("BONUS"),2);
  st=applyTransformation(remove,st,d,{mode:"current",funds:1000}).state;
  assert.equal(st.bonusCounts.get("BONUS"),1);
  assert(st.bonusIds.has("BONUS"));
  assert(!st.history.has("SOURCE_A")&&st.history.has("SOURCE_B"));
});
test("acquisition bonus persists if another source of same bonus is removed",()=>{
  const a=rule("TEMP",{soldierBonusType:"BONUS"});
  const remove=rule("REMOVE",{removeTransformations:["TEMP"]});
  const d={...mini,transformations:[a,remove]};
  let st=state();st.bonusCounts=new Map([["BONUS",1]]);st.bonusIds=new Set(["BONUS"]);
  st=applyTransformation(a,st,d,{mode:"current",funds:1000}).state;
  st=applyTransformation(remove,st,d,{mode:"current",funds:1000}).state;
  assert.equal(st.bonusCounts.get("BONUS"),1);
  assert(st.bonusIds.has("BONUS"));
});
test("protected free research explicitly records source and guard",()=>{
  const v=researchPlan(["STR_DARK_STAR"],data.researchRules,{researched:["STR_CODEX_RED"]});
  assert.equal(v.kind,"conditional");
  assert(v.conditions.some(x=>x.includes("STR_CODEX_RED + STR_SHADOW_CHASING")));
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
test("level-zero medals require an actual owned medal, not a fabricated zero",()=>{
  const medal=rule("ZERO_MEDAL",{requiredCommendations:{RARE:0}});
  assert.equal(check(medal).kind,"blocked","absent medal is not decoration level 0");
  assert.equal(check(medal,state(),mini,{commendations:{RARE:-1}}).kind,"blocked");
  assert.equal(check(medal,state(),mini,{commendations:{RARE:0}}).kind,"eligible");
  assert.equal(check(medal,state(),mini,{commendations:{RARE:3}}).kind,"eligible");
  assert.equal(check(medal,state(),mini,{commendations:{},medalsKnown:false}).kind,"conditional");
  const real=data.transformations.filter(t=>Object.values(t.requiredCommendations||{}).includes(0));
  assert.deepEqual(real.map(t=>t.id).sort(),[
    "STR_SIVALINGA_RESURRECTION","STR_SLEEPING_BEAUTY_REVIVAL","STR_SWIFTPAW_TRAINING"
  ]);
});
test("STR_UNAVAILABLE permanently excludes the three internal-only projects",()=>{
  const internal=data.transformations.filter(t=>t.requires.includes("STR_UNAVAILABLE"));
  assert.deepEqual(internal.map(t=>t.id).sort(),[
    "STR_CAREER_SOLDIER","STR_LONE_WOLF","STR_THEBAN_ASSAULT_CLONE"
  ]);
  assert.equal(researchPlan(["STR_UNAVAILABLE"],data.researchRules).kind,"blocked");
  for(const t of internal){
    const s=initialState(data,"base:"+t.allowedSoldierTypes[0]);
    assert.equal(future(t,s,data).kind,"blocked",t.id);
    assert.equal(check(t,s,data,{researched:["STR_UNAVAILABLE"]}).kind,"blocked",t.id);
  }
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
test("ordered research history differs from simultaneous transformation requirements",()=>{
  const rules={A:{cost:5,disables:["B"]},B:{cost:5}};
  const p=researchPlan(["A","B"],rules);
  assert.equal(p.kind,"conditional","static B then A order alone does not prove future execution");
  assert.ok(p.order.indexOf("B")<p.order.indexOf("A"));
  assert.equal(researchPlan(["A","B"],rules,{goalSemantics:"simultaneous"}).kind,"blocked",
    "the transformation requires BOTH still-discovered research flags");
  assert.equal(researchPlan(["B"],rules,{researched:["A"]}).kind,"conditional",
    "historical completion alone is not proof of a present disabled status");
  assert.equal(researchPlan(["B"],rules,{researched:["A"],disabled:["B"]}).kind,"blocked");
});
test("symmetric research disables cannot coexist as currently required flags",()=>{
  const rules={A:{cost:5,disables:["B"]},B:{cost:5,disables:["A"]}};
  assert.equal(researchPlan(["A","B"],rules,{goalSemantics:"simultaneous"}).kind,"blocked");
  assert.equal(researchPlan(["A","B"],rules).kind,"conditional",
    "sequential goal completion without requiring coexistence is not the same proof");
});
test("a disabled nominal ancestor is NOT proof a directly granted goal is impossible",()=>{
  const researchRules={A:{cost:5,dependencies:["B"]},B:{cost:5,disables:["A"]}};
  const estimate=researchPlan(["A"],researchRules);
  assert.equal(estimate.kind,"conditional");
  assert(estimate.diagnosticBlockers.some(x=>x.includes("순환")));
  const a=rule("T1",{requires:["A"]}),b=rule("T2",{requires:["B"]});
  const d={...mini,researchRules};
  const s=state();
  const applied=applyTransformation(b,s,d,{mode:"future"});
  assert.equal(applied.verdict.kind,"conditional");
  assert.equal(eligibleTransformation(a,applied.state,d,{mode:"future"}).kind,"conditional");
  assert.equal(researchPlan(["A"],researchRules,{disabled:["A"]}).kind,"blocked",
    "an ACTUAL disabled target is a hard blocker in OXCE addFinishedResearch");
  assert.equal(researchPlan(["A"],researchRules,{disabled:["B"]}).kind,"conditional",
    "a closed intermediate dependency can be bypassed by a direct event grant");
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
test("half-super-peasant unavoidable history proves old-body dead ends",()=>{
  const half=initialState(data,"manufacture:STR_HALF_UBER_GIRL_RECRUITMENT");
  const must=unavoidableHistoryByBody(data,half);
  assert(must.get("STR_SOLDIER_PEASANT").has("STR_UBERIZATION"));
  assert(must.get("STR_SOLDIER_PEASANT").has("STR_MILITIA_TRAINING"));
  assert(must.get("STR_SOLDIER").has("STR_SHADE_EMBODIMENT"),
    "all Peasant -> ordinary Gal paths inherit the Shade Embodiment record");
  assert(!must.has("STR_SOLDIER_W"),
    "Weirdgal needs ordinary Gal WITHOUT Shade, so its body must be absent");
  assert(!must.has("STR_SOLDIER_R"),
    "ANG_102 needs ordinary Gal WITHOUT Shade, so Red-body cannot be reached");
  const forced=[
    "STR_MILITIA_TRAINING","STR_UBERIZATION","STR_WEIRDGAL_TRANSFORMATION",
    "STR_ANG_102","STR_ZOMBIFICATION","STR_BODY_SWAP","STR_ZOMBI_REVIVAL",
    "STR_CENOBITE_TRAINING","STR_PSYCHONAUT_TRAINING"
  ];
  for(const id of forced){
    const r=data.transformations.find(t=>t.id===id);
    const v=structuralTransformationVerdict(r,half,data);
    assert.equal(v.kind,"blocked",id);
    assert(v.proof,"missing proof: "+id);
  }
  assert.equal(data.transformations.filter(t=>
    structuralTransformationVerdict(t,half,data).kind==="blocked").length,45);
  assert.equal(data.transformations.filter(t=>
    findTransformationPath(t.id,half,data,{maxDepth:10,maxNodes:500}).kind==="unknown").length,0);
});
test("history fixed-point exclusion is sound against exhaustive small-graph paths",()=>{
  // Overapproximation may call a path conditional; it must NEVER call a
  // sequence executable under exact body/history rules permanently blocked.
  let seed=0x6A17BC13;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  const types=["GAL","W","R"];
  for(let caseId=0;caseId<40;caseId++){
    const ids=Array.from({length:6},(_,i)=>"T"+i);
    const transformations=ids.map(id=>{
      const from=types[rand()%types.length],add=types[rand()%types.length];
      const allowedSoldierTypes=from===add?[from]:[from,add];
      return {id,allowedSoldierTypes,
        producedSoldierType:rand()%3===0?types[rand()%types.length]:null,
        forbiddenPreviousTransformations:rand()%2?[ids[rand()%ids.length]]:[],
        requiredPreviousTransformations:rand()%5===0?[ids[rand()%ids.length]]:[],
        reset:rand()%8===0,removeTransformations:[]};
    });
    const d={transformations};
    const acquired=rand()%2?[["T0",1]]:[];
    const initial={soldierType:"GAL",history:new Map(acquired)};
    const must=unavoidableHistoryByBody(d,initial);
    const seen=new Set();
    const queue=[{type:"GAL",history:new Map(acquired),steps:0}];
    while(queue.length){
      const state=queue.shift();
      const key=state.type+"|"+[...state.history.keys()].sort().join(",");
      if(seen.has(key))continue;
      seen.add(key);
      const guaranteed=must.get(state.type);
      assert(guaranteed,"missing overapprox state "+caseId+" "+state.type);
      for(const id of guaranteed)assert(state.history.has(id),
        "false must-history at case "+caseId+" "+state.type+" "+id);
      if(state.steps>=5)continue;
      for(const t of transformations){
        if(!t.allowedSoldierTypes.includes(state.type))continue;
        if(t.forbiddenPreviousTransformations.some(id=>state.history.has(id)))continue;
        if(t.requiredPreviousTransformations.some(id=>!state.history.has(id)))continue;
        const verdict=structuralTransformationVerdict(t,initial,d);
        assert.notEqual(verdict.kind,"blocked",
          "FALSE PERMANENT EXCLUSION at case "+caseId+" "+key+" -> "+t.id);
        const history=t.reset?new Map():new Map(state.history);
        history.set(t.id,(history.get(t.id)||0)+1);
        queue.push({type:t.producedSoldierType||state.type,history,steps:state.steps+1});
      }
    }
  }
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
test("body-only closure proves 43 exclusions plus 2 additional internal-only Gal projects",()=>{
  const s=initialState(data,"base:STR_SOLDIER");
  const bodies=reachableSoldierTypes(data,s.soldierType);
  assert.equal(data.transformations.filter(t=>!(t.allowedSoldierTypes||[]).some(id=>bodies.has(id))).length,43);
  const paths=data.transformations.map(x=>findTransformationPath(x.id,s,data,{maxDepth:8,maxNodes:300}));
  assert.equal(paths.filter(x=>x.kind==="blocked").length,45);
  assert.equal(paths.filter(x=>x.kind==="conditional").length,38);
  assert.equal(paths.filter(x=>x.kind==="unknown").length,0);
  assert.ok(paths.find((_,i)=>data.transformations[i].id==="STR_HONOMORED_WARRIOR_TRAINING")==null||
    paths.length===83);
});
test("direct event research sources are indexed as possible but never guaranteed rewards",()=>{
  const names=data.eventResearchSources||{};
  assert(names.STR_SIVALINGA_RESURRECTION.some(x=>x.event==="STR_SIVALINGA_RESURRECTION_EVENT"));
  assert(names.STR_PSI_INITIATION.some(x=>x.scriptIds.includes("STR_PSI_INITIATION_EVENT_GRAY")));
  assert(names.STR_CAPTAINS_11.some(x=>x.event==="STR_CAPTAINS_11"));
  const plan=researchPlan(["STR_PSI_INITIATION"],data.researchRules,{
    eventResearchSources:names
  });
  assert.notEqual(plan.kind,"blocked");
  assert(plan.conditions.some(x=>x.includes("이벤트 직접 연구 지급 후보")));
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
  const divergent={...mini,profiles:[{
    id:"profile:divergent",soldierType:"GAL",traitNames:[],initialStats:{avg:{firing:40}},
    currentStatsBeforeTraits:{avg:{firing:70}},previousTransformations:{}
  }]};
  const sample=initialState(divergent,"profile:divergent");
  assert.equal(sample.currentStats.firing,70);
  assert.equal(sample.initialStats.firing,40);
  const ratio=rule("GAIN",{percentGainedStatChange:{firing:50}});
  assert.equal(applyTransformation(ratio,{...sample,exactStats:true},divergent,{mode:"current",funds:1000}).state.currentStats.firing,85);
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
test("psi skill has separate OXCE rules for soldier gate and final battle stats",()=>{
  const m={...mini,bonuses:[{id:"PSI",stats:{psiSkill:20}}]};
  const st=state();st.currentStats.psiSkill=0;st.bonusIds=new Set(["PSI"]);
  // Soldier::prepareStatsWithBonuses gates psi only on the soldier-only
  // temporary stats used by training. Battle/all-bonus stats remain +20.
  assert.equal(battleStatsWithEquipment(st,m).stats.psiSkill,20);
  assert.equal(check(rule("PSI_GATE",{requiredMinStats:{psiSkill:10},includeBonusesForMinStats:true}),st,m).kind,"blocked");
});
test("armor and negative soldier bonus add before a SINGLE final floor",()=>{
  const m={...mini,bonuses:[{id:"NEG",stats:{health:-50,firing:-30}}],
    armorCatalog:[{id:"SUIT",soldierTypes:["GAL"],stats:{health:30,firing:40}}]};
  const st=state();st.currentStats.health=20;st.currentStats.firing=10;
  st.armorId="SUIT";st.bonusIds=new Set(["NEG"]);
  const combat=battleStatsWithEquipment(st,m);
  assert.equal(combat.stats.health,1,"health (20-50+30) is clamped once");
  assert.equal(combat.stats.firing,20,"firing (10-30+40) must NOT pre-clamp");
});
test("real armor and commendation catalogs were indexed from rule sources",()=>{
  assert.equal(data.armorCatalog.length,540);
  assert.equal(Object.keys(data.commendationIndex).length,110);
  assert.ok(data.armorCatalog.some(x=>x.soldierTypes.includes("STR_SOLDIER")&&x.stats.firing>0));
  assert.ok(data.commendationIndex.STR_MEDAL_SERVICE_TIME_NAME.bonusLevels.length>=3);
});
console.log("SOLDIER_ELIGIBILITY_PASS="+checks);
