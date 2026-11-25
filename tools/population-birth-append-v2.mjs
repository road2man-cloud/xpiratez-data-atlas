// Append-only unlock AND event catalog migration. Reconstruct the exact old
// ordered hash from prefixes of the two independently ordered catalogs.
import assert from "node:assert/strict";
import {birthCatalog,sourceIdentity} from "./population-frontier-chronology-core.mjs";
import {birthActions} from "./population-growth-replay-core.mjs";
import {key} from "./population-research-career-core.mjs";
export function proveBirthAppendV2(db,prior){
 const {baseline:ob,births:oldHash,...oldStable}=prior.source;
 const {baseline:nb,births:newHash,...newStable}=sourceIdentity(db);
 assert.deepEqual(newStable,oldStable,"Non-birth source changed");
 const oldCount=prior.summary.birthInputs,all=birthCatalog(db);
 assert(Number.isSafeInteger(oldCount)&&oldCount>=0&&oldCount<=all.length);
 const tuple=r=>{const {p}=birthActions(db,r);return [r.input,p.fullActionHash,p.stateHash];};
 const u=all.filter(r=>r.kind==="unlock").map(tuple),e=all.filter(r=>r.kind==="event").map(tuple);
 assert.equal(key([...u,...e]),newHash);
 const matches=[];
 for(let i=Math.max(0,oldCount-e.length);i<=Math.min(u.length,oldCount);i++){
  const j=oldCount-i;if(key([...u.slice(0,i),...e.slice(0,j)])===oldHash)matches.push([i,j]);
 }
 assert.equal(matches.length,1,"Old birth catalog not an unambiguous two-prefix append");
 const [oldUnlock,oldEvent]=matches[0];
 return {oldHash,newHash,oldCount,newCount:all.length,oldUnlock,oldEvent,newUnlock:u.length,newEvent:e.length,added:[...u.slice(oldUnlock),...e.slice(oldEvent)]};
}
