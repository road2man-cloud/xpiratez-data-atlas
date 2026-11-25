import fs from "node:fs";
import {gunzipSync,gzipSync} from "node:zlib";
import {createResearchSetLookup} from "./final-career-research-set.mjs";
const index=JSON.parse(gunzipSync(fs.readFileSync("public/data/soldier-final-career-research-index.json.gz")));
const lookup=createResearchSetLookup(index),sets={},routes={};
for(const [id,r] of Object.entries(index.routes)){
 const transforms=[...new Set(r.transformGates.map(g=>g.transform))].sort();
 if(!transforms.length)continue;
 const k=JSON.stringify([r.branch,transforms]);
 if(!sets[k]){const m=lookup.match(r.branch,transforms);sets[k]={branch:r.branch,transforms,historyIds:m.matches.map(h=>h.history),status:m.status};}
 routes[id]={set:k,orderedGates:r.transformGates,originalHistory:r.history};
}
const summary={routes:Object.keys(routes).length,sets:Object.keys(sets).length,matchedSets:Object.values(sets).filter(s=>s.historyIds.length).length,maxDistinctTransforms:Math.max(0,...Object.values(sets).map(s=>s.transforms.length)),actualGameCertified:0};
const out={schema:"CONDITIONAL_RESEARCH_SET_MATCH_V1",sourceLedgerHash:index.sourceLedgerHash,summary,sets,routes};
fs.writeFileSync("public/data/soldier-final-career-research-sets.json.gz",gzipSync(JSON.stringify(out)));
fs.writeFileSync("public/branch-soldier-research-set-summary.js","export const researchSetSummary="+JSON.stringify({...summary,sourceLedgerHash:index.sourceLedgerHash})+";\n");
console.log(summary);
