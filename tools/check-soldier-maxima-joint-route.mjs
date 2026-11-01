// Diagnose whether a coherent research CHOICE configuration exists for each
// currently advertised theoretical soldier maximum. This is necessary but
// NOT sufficient: event/RNG/medal/resource/chronological reachability is separate.
import fs from "node:fs";
import assert from "node:assert/strict";
import {routeContext,trainingRouteAccess} from "../public/trainings/route-access.js";
const d=JSON.parse(fs.readFileSync("public/data/trainings-index.json","utf8"));
const r=JSON.parse(fs.readFileSync("public/data/soldier-research-maxima-20261101.json","utf8"));
const source=new Map(d.transformations.map(x=>[x.id,x]));
const groupNames=["captain","path","cause","queen","codex","god"];
const groups=groupNames.map(id=>{
  const g=d.routeChoices.find(x=>x.id===id);
  return{id,ids:g.choices.map(c=>c.id).filter(x=>x!=="STR_CAPTAIN_PUSSY")};
});
let checked=0;
for(const row of r.rows){
  let examined=0,denials=0,first=null;
  function search(i,chosen){
    const ctx=routeContext(d,chosen);
    examined++;
    if(ctx.contradictions.length){denials++;return false}
    if(row.transformations.some(id=>trainingRouteAccess(source.get(id),ctx,d).blocked)){
      denials++;return false;
    }
    if(i===groups.length){first={...chosen};return true}
    const g=groups[i];
    for(const id of g.ids)if(search(i+1,{...chosen,[g.id]:id}))return true;
    return false;
  }
  const possible=search(0,{});
  assert(possible,row.id+" has no mutually compatible route-choice configuration");
  assert(Object.keys(first).length===groups.length,row.id+" incomplete route-choice certificate");
  checked++;
}
console.log("PASS "+checked+" conditional candidates each admit one source-checked six-group branch configuration; no chronology, RNG, event or material completeness claimed");
