// Ordered digest proof for additions to either birth family. No alteration
// or deletion of any old input is allowed. Preserve every route and attempt.
import assert from "node:assert/strict";
import {birthCatalog,sourceIdentity} from "./population-frontier-chronology-core.mjs";
import {birthActions} from "./population-growth-replay-core.mjs";
import {key} from "./population-research-career-core.mjs";
export function proveCatalogExtension(db,prior,oldInputs){
 const {baseline:ob,births:oldHash,...oldStable}=prior.source,{baseline:nb,births:newHash,...newStable}=sourceIdentity(db);
 assert.deepEqual(newStable,oldStable);
 const all=birthCatalog(db),map=new Map(all.map(r=>[r.input,r])),ids=new Set(oldInputs);
 assert.equal(ids.size,oldInputs.length);assert.equal(oldInputs.length,prior.summary.birthInputs);
 const tuple=r=>{assert(r);const {p}=birthActions(db,r);return [r.input,p.fullActionHash,p.stateHash];};
 assert.equal(key(oldInputs.map(id=>tuple(map.get(id)))),oldHash,"Historical ordered catalogue changed");
 assert.equal(key(all.map(tuple)),newHash);
 const added=all.filter(r=>!ids.has(r.input)).map(tuple);
 assert.equal(all.length,oldInputs.length+added.length);
 return {oldHash,newHash,oldInputs,oldCount:oldInputs.length,newCount:all.length,added};
}
