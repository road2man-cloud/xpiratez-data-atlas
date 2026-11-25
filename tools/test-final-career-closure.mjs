import assert from "node:assert/strict";
import {closure} from "./final-career-closure.mjs";
const expand=s=>({complete:true,unresolved:[],actions:s.n<40?[{action:"train",state:{n:s.n+1,history:s.history}}]:[{action:"loop",state:s}]});
const seeds=[{n:0,history:["A"]},{n:0,history:["B"]}];
const a=closure({seeds,expand,budget:7});assert.equal(a.graphExhausted,false);
const b=closure({seeds,expand,checkpoint:a.checkpoint});assert.equal(b.graphExhausted,true);assert.equal(b.checkpoint.nodes.length,82);assert.equal(b.actualGameCertified,false);
const c=closure({seeds,expand:()=>({complete:false,actions:[],unresolved:["RNG"]})});assert.equal(c.graphExhausted,false);
console.log("closure tests passed: 40 transitions, separate histories, resume, loops, unresolved");
