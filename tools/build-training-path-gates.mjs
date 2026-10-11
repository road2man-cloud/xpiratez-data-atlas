// Build a tiny, source-derived Diverging Paths compatibility sidecar.
// The soldiers page must not load the entire training/event database for each row.
import fs from "node:fs";
import assert from "node:assert/strict";
import {routeContext,trainingRouteAccess} from "../public/trainings/route-access.js";

const source="public/data/trainings-index.json";
const training=JSON.parse(fs.readFileSync(source,"utf8"));
const choices=training.routeChoices.find(x=>x.id==="path")?.choices||[];
assert.equal(choices.length,5,"Expected all five canonical Diverging Paths choices");
const contexts=choices.map(x=>routeContext(training,{path:x.id}));
const fullMask=(1<<choices.length)-1;
const masks={};
let constrained=0,none=0;
for(const t of training.transformations){
  let mask=0;
  for(let i=0;i<contexts.length;i++)
    if(!trainingRouteAccess(t,contexts[i],training).blocked)mask|=(1<<i);
  if(mask!==fullMask){masks[t.id]=mask;constrained++;}
  if(mask===0)none++;
}
const output={
  schemaVersion:1,
  modVersion:training.meta.mod.version,
  trainingRulesSha256:training.meta.sha256,
  // A missing ID means 'all five routes remain possible', not 'already unlocked'.
  paths:choices.map(x=>({id:x.id,koName:x.koName,enName:x.enName})),
  masks,
  counts:{transformations:training.transformations.length,constrained,noIndexedPath:none}
};
fs.writeFileSync("public/data/training-path-gates.json",JSON.stringify(output,null,2)+"\n");
console.log("Built training-path-gates.json: "+constrained+" constrained transforms of "+training.transformations.length+", "+none+" unindexed paths");
