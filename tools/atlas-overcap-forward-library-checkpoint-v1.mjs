// V164: restore V163 exactly, then produce independent trait-route prefixes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {restoreRanked,data,rp,monthly,repeatCash,receipt,read,sha,lock} from './atlas-overcap-forward-ranked-checkpoint-v1.mjs';
import {createGdxPrisonLibrary} from './atlas-overcap-forward-gdx-prison-library-v1.mjs';
export const checkpointPath='tools/data/overcap-gdx-prison-library-wave-v1-de90d9fc99e4c2fd5e3e.json.gz';
export const checkpoint=read(checkpointPath);
export function restoreLibrary(){
 assert.equal(sha(fs.readFileSync(checkpointPath)),'3f260c1523911970ddbf09e9de7592ca904e6ecd0e50b189260ac3ca613ec045');
 assert.equal(checkpoint.sourceMetadataSha256,data.meta.source.metadataSha256);
 assert.equal(checkpoint.engineArchiveSha256,lock.archiveSha256);
 assert.equal(sha(fs.readFileSync(checkpoint.proofPath)),checkpoint.proofSha256);
 const a=createGdxPrisonLibrary(data,rp,read(checkpoint.proofPath),checkpoint.proofSha256);
 const {s:seed,l}=restoreRanked();let s=seed;
 assert.deepEqual(checkpoint.continuation.actions.slice(0,s.actions.length),s.actions);
 for(const act of checkpoint.newActions){
  if(act.type==='sourceMonthlyBoundary')s=monthly.advance(s,act);
  else if(act.type==='sourceMonthlyFixedReward'){assert.equal(act.event,'STR_MAXIMUM_EXPLOITATION');s=repeatCash.apply(s,act);}
  else if(['sourceGdxPrisonDocumentRecovery','sourceStartLibrary','sourceCompleteLibrary','sourceManufactureImplicitBook'].includes(act.type))s=a.apply(s,act);
  else {if(act.type==='missionResearch'){assert.deepEqual(act,a.missionAction);assert.equal(s.actions.at(-1)?.type,'sourceMonthlyBoundary');}s=rp.research(s,act);}
 }
 assert.deepEqual(receipt(s),checkpoint.continuation);
 return {s,l};
}
export {data,rp,receipt,read,sha};
