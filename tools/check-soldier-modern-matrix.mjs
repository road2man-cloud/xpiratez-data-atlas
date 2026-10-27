import assert from "node:assert/strict";
import fs from "node:fs";
import {initialState,reachableSoldierTypes,structuralTransformationVerdict,findTransformationPath} from "../public/soldiers/modern/eligibility.js";
const data=JSON.parse(fs.readFileSync(process.argv[2]||"public/data/soldiers-modern-index.json","utf8"));
const summary=[];
let measured=0;
for(const body of data.soldiers){
  const state=initialState(data,"base:"+body.id);
  const reachable=reachableSoldierTypes(data,body.id);
  const blocked=data.transformations.filter(t=>structuralTransformationVerdict(t,state,data).kind==="blocked");
  for(const row of blocked){
    assert.ok(row.requires.includes("STR_UNAVAILABLE")||
      !row.allowedSoldierTypes.some(x=>reachable.has(x)),body.id+"/"+row.id+" inconsistent");
    assert.equal(findTransformationPath(row.id,state,data).kind,"blocked");
  }
  summary.push({body:body.id,koName:body.koName,bodyTypes:reachable.size,excluded:blocked.length,
    bodyOnlyExcluded:data.transformations.filter(t=>
      !(t.allowedSoldierTypes||[]).some(id=>reachable.has(id))).length,
    internalOnlyExcluded:blocked.filter(t=>t.requires.includes("STR_UNAVAILABLE")&&
      t.allowedSoldierTypes.some(id=>reachable.has(id))).length,
    structuralCandidates:data.transformations.length-blocked.length});
  measured+=data.transformations.length;
}
const variantAudit=[];
for(const profile of data.profiles){
  const state=initialState(data,profile.id);
  const base=initialState(data,"base:"+profile.soldierType);
  for(const rule of data.transformations){
    const verdict=structuralTransformationVerdict(rule,state,data);
    const baseVerdict=structuralTransformationVerdict(rule,base,data);
    assert.equal(verdict.kind==="blocked",baseVerdict.kind==="blocked",
      profile.id+" / "+rule.id+": acquisition bonus must not change inherent body eligibility");
    measured++;
  }
  variantAudit.push({id:profile.id,body:state.soldierType,traits:[...state.bonusIds].length,
    initialHistory:state.history.size});
}
const gal=summary.find(x=>x.body==="STR_SOLDIER");
const half=variantAudit.find(x=>x.id==="manufacture:STR_HALF_UBER_GIRL_RECRUITMENT");
assert.ok(gal);
assert.ok(half);
assert.equal(gal.excluded,45);
assert.equal(half.body,"STR_SOLDIER_PEASANT");
console.log(JSON.stringify({
  status:"PASS",game:data.meta?.mod?.version,
  transformations:data.transformations.length,acquisitions:data.profiles.length,
  baseBodies:data.soldiers.length,bodyTransformTests:measured,
  gal,halfSuperPeasant:half,
  peasant:summary.find(x=>x.body==="STR_SOLDIER_PEASANT"),
  initialTraitVariants:variantAudit.filter(x=>x.traits>0).length
},null,2));
