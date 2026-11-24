import assert from "node:assert/strict";
import {registeredResourcePareto} from "../public/branch-soldier-pareto.js";
const witnesses={},refs={},resources={};
function add(id,{v=[100,90],fee=0,branches=["A","B"],source="GATE12",origin=null,
 items={},medals={},facilities=[],research=[],actions=1,rank=[],unknown=false,body="X"}={}){
 witnesses[id]={source,body,originProfile:origin,vector:v,steps:[],research};
 refs[id]=branches;
 resources[id]={grossFees:fee,items,medals,facilities,research,actions,recoveryDays:0,transferHours:0,
  rankRequirements:rank,complete:Object.fromEntries(["cash","items","medals","facilities","research","actions","recovery","transfer","rank"].map(k=>[k,!unknown]))};
}
add("best",{v:[110,90],fee:10});
add("inferior",{v:[100,90],fee:20,branches:["A"]});
add("tie",{v:[110,90],fee:10,branches:["A"]});
add("otherBranch",{v:[90,80],fee:20,branches:["C"]});
add("otherSource",{v:[90,80],fee:20,source:"REPLAY8"});
add("otherOrigin",{v:[90,80],fee:20,origin:"Y"});
add("noReference",{v:[90,80],fee:20,branches:[]});
add("missingFee",{v:[90,80],fee:0,unknown:true});
add("missingStat",{v:[100,null],fee:20});
const run=(ids,options={})=>registeredResourcePareto({ids,witnesses,resourceFor:id=>resources[id],supportFor:id=>refs[id],...options});
const a=run(Object.keys(witnesses),{statIndices:[0,1]});
assert.deepEqual(a.removed,[{id:"inferior",dominator:"best"}]);
assert(a.ids.includes("tie")&&a.ids.includes("otherBranch")&&a.ids.includes("otherSource")&&a.ids.includes("otherOrigin"));
assert.equal(a.unranked.length,3);
assert.deepEqual(a.reasons,{missingStats:1,missingResources:1,missingBranchSupport:1});
add("fish",{v:[110,90],fee:10,items:{FISH:1}});
add("leek",{v:[110,90],fee:10,items:{LEEK:1}});
add("freeOfMaterial",{v:[110,90],fee:10});
add("medalZero",{v:[110,90],fee:10,medals:{M:0}});
add("rankChange",{v:[90,80],fee:20,rank:[{step:1,ruleId:"R",minRank:1,resetRank:true}]});
const b=run(["fish","leek","freeOfMaterial","medalZero","rankChange"],{resourceMode:"requirements"});
assert.deepEqual(new Set(b.removed.map(x=>x.id)),new Set(["fish","leek","medalZero"]));
assert(b.ids.includes("rankChange"));
const c=run(["fish","leek"],{resourceMode:"requirements"});
assert.equal(c.removed.length,0);
console.log("PASS branch-preserving resource Pareto: strict dominance, ties, unknowns, distinct materials, medal zero, rank chronology");
