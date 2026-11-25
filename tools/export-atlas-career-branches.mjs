// Emits a small branch lookup from the canonical registry; no writes or source changes.
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
const db=JSON.parse(gunzipSync(fs.readFileSync(new URL('../public/data/branch-soldier-results.json.gz',import.meta.url))));
const keys=['populationNewPairCareer','populationFrontierChronology','populationResearchCareer','populationChronologicalCareer','populationGrowthReplay','populationMissingOriginCareer'];
const ids=new Set(keys.flatMap(k=>Object.values(db[k]?.routes||{}).map(r=>r.branch)));
const branches=db.branches.filter(b=>ids.has(b.id)).map(({id,rank,captain,choices,historyCount})=>({id,rank,captain,choices,historyCount}));
if(branches.length!==ids.size)throw Error('Missing branch definition');
console.log(JSON.stringify({sourceMetadataSha256:db.sourceMetadataSha256,branches}));
