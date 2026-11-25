import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {ledgers,project,loadCareerRows,completionScope,readResearchWitness} from '../public/branch-soldier-atlas-career-core.js';
import {admitVerified,normalizedCombination} from './atlas-career-completion-core.mjs';
import {key} from './population-research-career-core.mjs';
const gz=f=>JSON.parse(gunzipSync(fs.readFileSync('public/data/'+f+'.json.gz')));
const modern=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json')),db=gz('branch-soldier-results'),c=completionScope(modern,db);
const all=ledgers.flatMap(l=>project(l,gz(l.file),db.sourceMetadataSha256).rows);
assert.equal(all.length,c.summary.candidateRows);
assert.equal(new Set(all.map(r=>key([r.origin,r.branch,r.hash]))).size,c.summary.uniqueEvidence);
assert.equal(all.filter(r=>c.classifications[r.source][r.id].traceHashVerified).length,c.summary.traceVerified);
assert.equal(c.rows.length,c.summary.completeCombinations);
const final=await loadCareerRows(modern,db);
assert.deepEqual(final.errors,[]);assert.equal(final.rows.length,c.rows.length);
assert(final.rows.every(r=>r.complete));
assert.equal(admitVerified({row:all[0],raw:{completionProof:{kind:'GAMEPLAY_REPLAY'}},db,classification:{traceHashVerified:true}}),null);
const t=c.terminalRule;
assert.equal(t.status,'RULES_AND_PRESERVED_ENGINE_EXTRACTED');
const {fingerprint,...source}=t;assert.equal(key(source),fingerprint);
assert(t.targets.length>=5);
for(const target of t.targets){assert.equal(target.stages.at(-1).winCutscene,target.terminalCutscene);assert(!target.stages.at(-1).nextStage);assert(target.researchGoals.every(id=>modern.researchRules[id]));}
const standard=t.targets.filter(r=>r.kind==='FINAL_DESTINATION');assert(standard.every(r=>r.stages.at(-1).id==='STR_CHECKMATE'));
const a=gz('soldier-population-missing-origin-career'),idx=gz('soldier-population-missing-origin-career-index'),l=ledgers.find(x=>x.key==='missingbirth');
const rows=new Map(project(l,a,db.sourceMetadataSha256).rows.map(r=>[r.id,r]));
let ready=0,advanced=0;
for(const r of Object.values(a.terminalResearch.records)){
 if(!r.suffixHash)continue;
 const id='MISSCAR:'+r.graph+':'+r.to,row=rows.get(id);
 assert(row);const witness=readResearchWitness(idx,row,db.sourceMetadataSha256);
 assert.equal(key(witness.fullActions),row.hash);
 const n=a.graphs[r.graph].nodes[r.to];assert.equal(n.stateHash,r.stateHash);
 advanced++;if(r.status==='CONDITIONAL_TARGET_RESEARCH_READY'){const goal=t.targets.find(x=>x.id===r.target);assert.deepEqual(r.remaining,[]);assert(goal.researchGoals.every(k=>r.achieved.includes(k)));ready++;}
}
assert.equal(advanced,a.terminalResearch.advanced);
assert.equal(ready,a.terminalResearch.ready);
console.log(JSON.stringify({complete:final.rows.length,conditional:all.length,unique:c.summary.uniqueEvidence,terminalTargets:t.targets.length,terminalAdvanced:advanced,terminalReady:ready}));
