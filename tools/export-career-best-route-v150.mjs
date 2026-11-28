// Export a self-contained single-route receipt from a completed production batch.
// No new research or stat computation; preserve the exact action array and hashes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const folder=path.resolve(process.argv[2]||'docs/career-batches/v150-run1');
const prefix=path.basename(folder).split('-run')[0],sha=b=>createHash('sha256').update(b).digest('hex');
const read=name=>JSON.parse(fs.readFileSync(path.join(folder,name),'utf8'));
const report=read(prefix+'-production-report.json'),source=read(prefix+'-new-training-witnesses.json');
assert.equal(report.sourceFingerprint,source.sourceFingerprint);
assert.equal(report.graphSha256,source.graphSha256);
const score=w=>Object.values(w.evidence.after.permanentStats).reduce((a,b)=>a+b,0);
const candidates=source.witnesses.filter(w=>Array.isArray(w.actions)&&w.evidence?.after?.permanentStats).sort((a,b)=>score(b)-score(a)||b.evidence.after.permanentStats.tu-a.evidence.after.permanentStats.tu||a.actions.length-b.actions.length);
const best=candidates[0];assert(best);
assert.equal(score(best),report.summary.ledger.bestPermanentSum);
assert.equal(sha(JSON.stringify(best.actions)),best.actionHash);
assert.equal(best.actionCount,best.actions.length);
const result={version:report.version,sourceFingerprint:report.sourceFingerprint,graphSha256:report.graphSha256,scope:report.summary.scope,conditionalModel:true,gameCertified:false,registered:false,permanentSum:score(best),permanentStats:best.evidence.after.permanentStats,terminal:best.to,actionCount:best.actions.length,actionHash:best.actionHash,witness:best};
const target=path.join(folder,prefix+'-best-route.json');
fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({file:target,bytes:fs.statSync(target).size,sha256:sha(fs.readFileSync(target)),sum:result.permanentSum,tu:result.permanentStats.tu,actionCount:result.actionCount,actionHash:result.actionHash}));
