// Verify prefix memoization cannot change campaign outcomes or turn a rejected
// transformation into a valid path. The cache is never a source of new grants.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeOriginReport} from './origin-report-codec.mjs';
import {replayOriginWitness} from '../public/soldiers/modern/origin-witness.js';
const data=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json','utf8'));
const catalog=JSON.parse(fs.readFileSync('public/data/soldier-source-catalog.json','utf8'));
const report=decodeOriginReport(fs.readFileSync('public/data/soldier-origin-candidates.json','utf8'));
data.originRows=report.records.map(r=>r.sourceProof);
data.sourceItemIds=new Set(catalog.itemIds);
const cache=new Map();
let checked=0;
for(const row of report.records.filter(r=>r.candidates.length>=2).slice(0,5)){
  for(const c of row.candidates.slice(0,3)){
    const slow=replayOriginWitness(c.steps,data);
    const quick=replayOriginWitness(c.steps,data,{birthCache:cache});
    assert(slow.ok&&quick.ok,slow.reason||quick.reason);
    assert.deepEqual(quick.trace,slow.trace);
    assert.deepEqual(quick.stats,slow.stats);
    assert.equal(quick.total,slow.total);
    assert.deepEqual(quick.world.researched,slow.world.researched);
    assert.deepEqual(quick.world.disabled,slow.world.disabled);
    checked++;
  }
}
assert(cache.size>=5,'Five independent birth prefixes should have been cached');
const row=report.records.find(r=>r.candidates.some(c=>c.transforms.length));
const c=row.candidates.find(c=>c.transforms.length);
const steps=structuredClone(c.steps);
const index=steps.findIndex(s=>s.type==='transform');
assert(index>=0);
steps[index].transform='STR_UNAVAILABLE';
const rejected=replayOriginWitness(steps,data,{birthCache:cache});
assert(!rejected.ok,'Cached birth does not bypass an invalid transformation');
console.log('PASS shared birth prefix memoization equals independent full replay for '+checked+' witnesses');
console.log('PASS forged transformation after a cached birth is rejected');
