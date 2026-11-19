import assert from "node:assert/strict";
import {routeCandidate,routeNumbers,routeDifference,routeEvidence,routeOnly} from "../public/soldiers/modern/route-table-compare.js";
const KEYS=["tu","firing","mana"];
const ready=(id,raw,bonus)=>({
  id,description:id,steps:[{type:"research",id:"TECH_A"},{type:"transform",transform:id}],
  assumptions:[],limitations:[],display:{stats:raw,total:Object.values(raw).reduce((a,b)=>a+b,0)},
  growth:{kind:"conditional-upper-envelope",stats:bonus,total:Object.values(bonus).reduce((a,b)=>a+b,0)}
});
const a={profileId:"a",displayBirth:{tu:80,firing:50,mana:40},candidates:[
  ready("a1",{tu:95,firing:80,mana:50},{tu:100,firing:100,mana:75}),
  ready("a2",{tu:120,firing:110,mana:70},{tu:100,firing:110,mana:80})
]};
const b={profileId:"b",displayBirth:{tu:65,firing:40,mana:30},candidates:[
  ready("b1",{tu:90,firing:120,mana:55},{tu:105,firing:130,mana:80})
]};
assert.equal(routeCandidate(a,"growth").id,"a2");
assert.equal(routeCandidate(a,"provisional","a1").id,"a1");
assert.equal(routeNumbers(a,"birth",null,KEYS).total,170);
assert.equal(routeNumbers(a,"certified",null,KEYS),null);
assert.equal(routeNumbers(a,"growth","a1",KEYS).total,275);
assert.equal(routeDifference(routeNumbers(a,"growth","a1",KEYS),routeNumbers(b,"growth",null,KEYS),KEYS).total,-40);
assert.deepEqual(routeDifference(routeNumbers(a,"growth","a1",KEYS),routeNumbers(b,"growth",null,KEYS),KEYS).stats,{tu:-5,firing:-30,mana:-5});
assert.deepEqual(routeEvidence(routeNumbers(a,"growth","a1",KEYS)).research,["TECH_A"]);
assert.deepEqual(routeOnly(["A","B","C"],["A","C"]),["B"]);
assert.equal(routeNumbers({displayBirth:null,candidates:[]}, "growth",null,KEYS),null);
assert.equal(routeNumbers({displayBirth:{tu:1,firing:2},candidates:[]}, "birth",null,KEYS),null);
assert.equal(routeNumbers({candidates:[{id:"unfinished",display:{stats:{tu:1,firing:2,mana:3}}}]}, "growth",null,KEYS),null);
console.log("route-table comparison: 11 cases passed");
