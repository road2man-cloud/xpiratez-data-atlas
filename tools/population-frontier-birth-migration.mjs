// Accept only an append-only extension of unlock births, with the old
// ordered catalogue digest reproduced exactly. Event births may not change.
import assert from "node:assert/strict";
import {birthCatalog,sourceIdentity} from "./population-frontier-chronology-core.mjs";
import {birthActions} from "./population-growth-replay-core.mjs";
import {key} from "./population-research-career-core.mjs";
export function proveBirthAppend(db,prior){
 const {baseline:ob,births:oldHash,...oldStable}=prior.source;
 const {baseline:nb,births:newHash,...newStable}=sourceIdentity(db);
 assert.deepEqual(newStable,oldStable,"Non-birth source changed");
 const all=birthCatalog(db),unlock=all.filter(r=>r.kind==="unlock"),events=all.filter(r=>r.kind==="event");
 const oldCount=prior.summary.birthInputs,oldUnlock=oldCount-events.length;
 assert(Number.isSafeInteger(oldUnlock)&&oldUnlock>=0&&oldUnlock<=unlock.length);
 const before=[...unlock.slice(0,oldUnlock),...events];
 const tuple=r=>{const {p}=birthActions(db,r);return [r.input,p.fullActionHash,p.stateHash];};
 assert.equal(key(before.map(tuple)),oldHash,"Previous birth catalogue is not an unchanged prefix");
 const added=unlock.slice(oldUnlock);
 assert.equal(key(all.map(tuple)),newHash);
 return {oldHash,newHash,oldCount,newCount:all.length,added:added.map(tuple)};
}
