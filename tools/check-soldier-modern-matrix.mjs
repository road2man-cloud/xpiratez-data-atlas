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
    // A confirmed block can originate from the old body graph OR
    // from an unavoidable ordered-history conflict OR a proven unreachable
    // required predecessor; do not assume all blocks are body mismatches.
    assert.ok(row.requires.includes("STR_UNAVAILABLE")||
      !row.allowedSoldierTypes.some(x=>reachable.has(x))||
      structuralTransformationVerdict(row,state,data).proof,
      body.id+"/"+row.id+" missing structural proof");
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
    // An acquired initial history can CLOSE routes that are open for a
    // raw body (this is the exact reason for using acquisition profiles).
    // Body-graph and internal-sentinel impossibilities remain permanent.
    if(baseVerdict.kind==="blocked"&&
      (baseVerdict.proof==="internal-only research sentinel"||
        baseVerdict.reason==="현재 병종 계보로는 대상 병종에 도달할 수 없음"))
      assert.equal(verdict.kind,"blocked",profile.id+" / "+rule.id+
        ": source history must not override inherent body/sentinel exclusion");
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
const halfState=initialState(data,half.id);
const halfBlocked=data.transformations.filter(t=>
  structuralTransformationVerdict(t,halfState,data).kind==="blocked");
assert.equal(halfBlocked.length,45);
for(const id of ["STR_UBERIZATION","STR_MILITIA_TRAINING","STR_WEIRDGAL_TRANSFORMATION",
  "STR_ZOMBIFICATION","STR_BODY_SWAP","STR_ZOMBI_REVIVAL"]){
  assert.ok(halfBlocked.some(t=>t.id===id),id+" must be excluded from the half-super-peasant's actual inherited route");
}
console.log(JSON.stringify({
  status:"PASS",game:data.meta?.mod?.version,
  transformations:data.transformations.length,acquisitions:data.profiles.length,
  baseBodies:data.soldiers.length,bodyTransformTests:measured,
  gal,halfSuperPeasant:half,
  peasant:summary.find(x=>x.body==="STR_SOLDIER_PEASANT"),halfProfileExcluded:halfBlocked.length,
  initialTraitVariants:variantAudit.filter(x=>x.traits>0).length
},null,2));
