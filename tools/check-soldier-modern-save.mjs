import fs from "node:fs";
import assert from "node:assert/strict";
import {importModernSave,modernSoldierProof} from "../public/soldiers/modern/save-adapter.js";
import {eligibleTransformation,battleStatsWithEquipment,initialState,structuralTransformationVerdict} from "../public/soldiers/modern/eligibility.js";
import {assessCampaignResearch} from "../public/soldiers/modern/comparison.js";
import {createStatEnvelope,effectiveEnvelope} from "../public/soldiers/modern/stat-envelope.js";
import {growStatEnvelope} from "../public/soldiers/modern/growth-envelope.js";
const data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json","utf8"));
const text=fs.readFileSync("tools/fixtures/modern-2.1-test.sav","utf8");
const fixture=importModernSave(text,data);
assert.equal(fixture.generatedEvents,null,"missing one-time history must remain unknown");
const eventFixture=importModernSave(text.replace("monthsPassed: 1",
  "monthsPassed: 1\ngeneratedEvents:\n  STR_REPEAT_EVENT: 2\n  STR_UNUSED_EVENT: 0"),data);
assert.equal(eventFixture.generatedEvents.STR_REPEAT_EVENT,2);
assert.equal(eventFixture.generatedEvents.STR_UNUSED_EVENT,0);
assert.equal(importModernSave(text.replace("monthsPassed: 1",
  "monthsPassed: 1\ngeneratedEvents:\n  STR_REPEAT_EVENT: invalid"),data).generatedEvents,null,
  "malformed event-history YAML must never turn into known absence");
assert.equal(fixture.funds,4000,"use LAST finance-history entry");
assert.equal(fixture.personnel.bases.length,1);
assert.equal(fixture.personnel.bases[0].soldiers.length,1);
assert.equal(fixture.personnel.bases[0].researchComplete,false,
  "missing active projects must remain unknown, never an empty proven list");
const activeText=text.replace("    facilities:",
  "    research:\n      - project: STR_VIOLENCE\n        assigned: 2\n      - project: STR_GLAMOUR\n        assigned: 0\n    facilities:");
const active=importModernSave(activeText,data);
const activeBase=active.personnel.bases[0];
assert.equal(activeBase.researchComplete,true);
assert.deepEqual([...activeBase.researchProjects],["STR_VIOLENCE","STR_GLAMOUR"]);
const activeProof=modernSoldierProof(data,active,0,0);
assert.equal(activeProof.options.activeResearchKnown,true);
assert(activeProof.options.activeResearch.includes("STR_GLAMOUR"));
const emptyResearch=importModernSave(text.replace("    facilities:",
  "    research: []\n    facilities:"),data);
assert.equal(emptyResearch.personnel.bases[0].researchComplete,true);
assert.equal(emptyResearch.personnel.bases[0].researchProjects.size,0);
const malformedResearch=importModernSave(text.replace("    facilities:",
  "    research:\n      - assigned: 5\n    facilities:"),data);
assert.equal(malformedResearch.personnel.bases[0].researchComplete,false);
assert.equal(modernSoldierProof(data,malformedResearch,0,0).options.activeResearch,null);
const duplicateResearch=importModernSave(text.replace("    facilities:",
  "    research:\n      - project: STR_VIOLENCE\n      - project: STR_VIOLENCE\n    facilities:"),data);
assert.equal(duplicateResearch.personnel.bases[0].researchComplete,false,
  "duplicate ongoing project is untrusted, not silently deduplicated");
assert.equal(fixture.research.completed.includes("STR_VIOLENCE"),true);
const p=modernSoldierProof(data,fixture,0,0);
assert.equal(p.kind,"proof");
assert.equal(p.state.soldierType,"STR_SOLDIER");
assert.equal(p.state.status,"healthy","zero-valued loss fields may be absent in an OXCE save");
assert.equal(p.state.currentStats.firing,70);
assert.equal(p.state.initialStats.firing,45);
assert.equal(p.state.history.has("STR_BASIC_FIREARMS_TRAINING"),true);
assert.equal(p.options.medalsKnown,true,"missing diary means no medals in complete soldier block");
assert.equal(p.state.exactStats,true);
assert.equal(p.options.items.STR_GLAMOUR,8);
const extraStock=importModernSave(text.replace("      STR_GLAMOUR: 8",
  "      STR_GLAMOUR: 8\n      STR_QA_RESEARCH_SPECIMEN: 3"),data);
const extraProof=modernSoldierProof(data,extraStock,0,0);
assert.equal(extraProof.options.items.STR_QA_RESEARCH_SPECIMEN,3,
  "research samples beyond transformation material whitelist must reach replay");
assert.equal(p.options.funds,4000);
assert.equal(p.options.baseFunctionsKnown,false,"country/region base-functions cannot be ruled out by facilities alone");
assert.throws(()=>importModernSave(text.replace("v.o2","v.o1.1.1"),data),/2[.]1/);
assert.throws(()=>importModernSave(text.replace("Extended 8.7.1","Extended 8.6"),data),/8[.]7[.]1/);
const strict={id:"QA",allowedSoldierTypes:["STR_SOLDIER"],allowsLiveSoldiers:true,
  requires:["STR_MISSING"],requiredItems:{STR_GLAMOUR:10},requiresBaseFunc:["UNKNOWN_FACILITY"],
  cost:1000,requiredCommendations:{},requiredMinStats:{},requiredMaxStats:null};
const strictResult=eligibleTransformation(strict,p.state,data,p.options);
assert.equal(strictResult.kind,"blocked","missing owned research and short stock are immediate blockers");
assert(strictResult.blockers.some(x=>x.includes("연구")));
assert(strictResult.blockers.some(x=>x.includes("재료")));
assert(strictResult.conditions.some(x=>x.includes("기지 기능")),"unknown geo function must stay conditional");
const futureResult=eligibleTransformation(strict,p.state,data,{...p.options,mode:"future"});
assert.notEqual(futureResult.kind,"eligible","future material/research must remain contingent");
const unknownEquipment=battleStatsWithEquipment({...p.state,armorId:"ARMOR_NOT_IN_CURRENT_INDEX"},data,p.options);
assert.equal(unknownEquipment.kind,"unverified","unknown armor must not silently disappear from final stats");
const unknownStock=eligibleTransformation({...strict,requires:[],requiredItems:{STR_NOT_PARSED:2},
  requiresBaseFunc:[]},{...p.state},data,{...p.options,itemsKnown:false});
assert.equal(unknownStock.kind,"conditional","incomplete stock is unknown, never fake shortage");
const unitUnknown=eligibleTransformation({...strict,requires:[],requiredItems:{},requiresBaseFunc:[],
  requiredMinStats:{firing:100}},p.state,data,{...p.options,statsKnown:false});
assert.equal(unitUnknown.kind,"conditional","unparsed stats cannot be a permanent blocker");
const realPath=process.argv[2];
if(realPath){
  const real=importModernSave(fs.readFileSync(realPath,"utf8"),data);
  assert.equal(real.personnel.bases.length,2);
  assert.equal(real.personnel.bases.reduce((n,b)=>n+b.soldiers.length,0),53);
  assert.equal(real.research.disabled.length,44);
  assert(real.funds!==null);
  assert(real.generatedEvents&&Object.keys(real.generatedEvents).length>50,
    "actual X-Piratez 2.1 save contains one-time event history");
  let checked=0,exactRaw=0,unverifiedRaw=0,displayedWithEquipment=0,overcapStats=0;
  for(let b=0;b<real.personnel.bases.length;b++)
    for(let s=0;s<real.personnel.bases[b].soldiers.length;s++){
      const ps=modernSoldierProof(data,real,b,s);
      assert.equal(ps.kind,"proof");
      const bounds=createStatEnvelope(data,"base:"+ps.state.soldierType,{state:ps.state});
      if(ps.state.exactStats){
        exactRaw++;
        assert.equal(bounds.kind,"ready");
        for(const k of data.statKeys){
          assert.equal(bounds.low[k],ps.state.currentStats[k],
            "real save must never substitute random starting-body stats");
          assert.equal(bounds.high[k],ps.state.currentStats[k]);
        }
        const future=growStatEnvelope(bounds,ps.state,data,"@BATTLE_GROWTH");
        assert.equal(future.kind,"ready");
        const classRules=data.soldiers.find(x=>x.id===ps.state.soldierType);
        for(const k of data.statKeys){
          assert(future.high[k]>=ps.state.currentStats[k],
            "never delete a preexisting overcap stat during an estimated future-growth phase");
          assert.equal(future.low[k],ps.state.currentStats[k],
            "future growth phase must not falsely imply the soldier has already grown");
          if(ps.state.currentStats[k]>classRules.statCaps[k])overcapStats++;
        }
        const gear=effectiveEnvelope(bounds,ps.state,data,ps.options);
        if(gear.kind==="ready")displayedWithEquipment++;
      }else{
        unverifiedRaw++;
        assert.equal(bounds.kind,"unverified",
          "incomplete live-save stats MUST NOT be fabricated from body creation");
      }
      checked++;
    }
  const flags={};
  for(const origin of ["base:STR_SOLDIER","manufacture:STR_HALF_UBER_GIRL_RECRUITMENT"]){
    const state=initialState(data,origin);
    const rows=data.transformations.filter(t=>
      structuralTransformationVerdict(t,state,data).kind!=="blocked");
    flags[origin]=rows.reduce((counts,t)=>{
      const kind=assessCampaignResearch(data,real,t).kind;
      counts[kind]=(counts[kind]||0)+1;
      return counts;
    },{});
    assert.equal(rows.length,38);
    assert.equal(flags[origin].closed||0,0,
      "an intermediate disabled topic must not be promoted to a direct closed goal");
    assert.equal(flags[origin].complete,4);
  }
  assert.equal(flags["base:STR_SOLDIER"].nominal,7);
  assert.equal(flags["manufacture:STR_HALF_UBER_GIRL_RECRUITMENT"].nominal,4);
  assert.equal(exactRaw+unverifiedRaw,checked);
  assert.equal(overcapStats,48,"existing battle/transform overcap values must be preserved");
  console.log("PASS optional local 2.1 save QA: "+checked+
    " soldiers; "+exactRaw+" exact raw stat envelopes, "+unverifiedRaw+
    " conservatively unverified, "+displayedWithEquipment+
    " one-armor/medal-aware previews; "+overcapStats+
    " preexisting above-cap stat instances preserved; 38/38 structural candidates research-checked, 7/4 nominal conflicts never mislabeled as final exclusions; private data not exported");
}
console.log("PASS modern 2.1 local save import, version lock, research, funds, class, automatic evidence, missing-source safeguards");
