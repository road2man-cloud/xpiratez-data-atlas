import fs from "node:fs";
import assert from "node:assert/strict";
import {decodeOriginReport} from "./origin-report-codec.mjs";
import {trainingOrderEvidence} from "../public/soldiers/modern/training-order-evidence.js";
const data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json","utf8"));
const archive=decodeOriginReport(fs.readFileSync("public/data/soldier-origin-candidates.json","utf8"));
let counted=0,steps=0,maxBound=0,statBound=0,reset=0;
for(const r of archive.records){
  const p=data.profiles.find(x=>x.id===r.profileId);
  assert(p,"missing profile "+r.profileId);
  for(const candidate of r.candidates){
    const audit=trainingOrderEvidence(p,candidate,data);
    assert.equal(audit.kind,"ready",r.profileId+"/"+candidate.id+" "+audit.reason);
    assert.equal(audit.finalType,candidate.finalSoldierType,candidate.id+" final type");
    assert.equal(audit.stages.length,candidate.transforms.length,candidate.id+" stage count");
    for(const stage of audit.stages){
      const rule=data.transformations.find(x=>x.id===stage.id);
      assert.equal(stage.upper,rule.upperBoundAtMaxStats?"maxStats":rule.upperBoundAtStatCaps?"statCaps":null);
      assert.equal(stage.reset,rule.reset===true);
      assert.equal(stage.requiredResearch.length,rule.requires.length);
      for(const [key,change] of Object.entries(stage.changes)){
        if(stage.upper)assert.equal(change.max,data.soldiers.find(x=>x.id===stage.to)[stage.upper][key]);
      }
      maxBound+=stage.upper==="maxStats"?1:0;
      statBound+=stage.upper==="statCaps"?1:0;
      reset+=stage.reset?1:0;steps++;
    }
    counted++;
  }
}
const freak=data.profiles.find(x=>x.soldierType==="STR_SOLDIER_X");
const make=transforms=>({transforms,steps:transforms.map(transform=>({type:"transform",transform}))});
const repentance=trainingOrderEvidence(freak,make(["STR_ANG_102"]),data);
assert.equal(repentance.kind,"ready");
assert.equal(repentance.finalType,"STR_SOLDIER_R");
assert.equal(repentance.stages[0].reset,true);
assert.equal(repentance.stages[0].upper,null);
assert.equal(repentance.stages[0].changes.health.flat,10);
const healthy=trainingOrderEvidence(freak,make(["STR_BREAD_AND_FISHES_TRAINING"]),data);
assert.equal(healthy.kind,"ready");
assert.equal(healthy.stages[0].upper,"maxStats");
assert.equal(healthy.stages[0].soft,true);
assert.equal(healthy.stages[0].changes.health.max,120);
console.log("PASS all registered candidate path stages",JSON.stringify({counted,steps,maxBound,statBound,reset}));
