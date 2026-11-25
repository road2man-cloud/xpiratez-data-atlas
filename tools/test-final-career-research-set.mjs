import assert from "node:assert/strict";
import {createResearchSetLookup} from "./final-career-research-set.mjs";
const lookup=createResearchSetLookup({nodes:[{}, {parent:0},{parent:1},{parent:0}],histories:{a:{branch:"b",prefix:2},c:{branch:"b",prefix:3}},transformGates:{a:{branch:"b",transform:"A",prefix:1,requires:[],witnesses:[]},b:{branch:"b",transform:"B",prefix:2,requires:[],witnesses:[]},c:{branch:"b",transform:"C",prefix:3,requires:[],witnesses:[]}}});
assert.equal(lookup.match("b",["A","B"]).matches.length,1);
assert.equal(lookup.match("b",["A","C"]).status,"UNRESOLVED");
assert.equal(lookup.match("b",["B","A"]).matches[0].history,"a");
console.log("shared research-set tests passed");
