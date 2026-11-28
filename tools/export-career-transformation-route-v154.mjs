// Export one actual transformation witness and its complete ancestry.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const folder=path.resolve(process.argv[2]||'docs/career-batches/v154-run1'),id=process.argv[3]||'STR_DREAMLINK_TRAINING';
assert(/^STR_[A-Z0-9_]+$/.test(id));
const prefix=path.basename(folder).split('-run')[0],sha=b=>createHash('sha256').update(b).digest('hex');
const report=JSON.parse(fs.readFileSync(path.join(folder,prefix+'-production-report.json'),'utf8')),source=JSON.parse(fs.readFileSync(path.join(folder,prefix+'-new-training-witnesses.json'),'utf8'));
assert.equal(report.sourceFingerprint,source.sourceFingerprint);assert.equal(report.graphSha256,source.graphSha256);
const sum=v=>Object.values(v).reduce((a,b)=>a+b,0);
const witnesses=source.witnesses.filter(w=>w.evidence?.transformation===id&&w.evidence?.after?.permanentStats&&Array.isArray(w.actions)).sort((a,b)=>sum(b.evidence.after.permanentStats)-sum(a.evidence.after.permanentStats)||a.actionCount-b.actionCount);
const witness=witnesses[0];assert(witness,'no produced witness for '+id);
assert.equal(witness.actions.length,witness.actionCount);assert.equal(sha(JSON.stringify(witness.actions)),witness.actionHash);
const before=witness.evidence.before.permanentStats,after=witness.evidence.after.permanentStats;
const record={version:report.version,sourceFingerprint:report.sourceFingerprint,graphSha256:report.graphSha256,transformation:id,scope:report.summary.scope,conditionalModel:true,gameCertified:false,actionCount:witness.actionCount,actionHash:witness.actionHash,terminal:witness.to,before,after,beforeSum:sum(before),afterSum:sum(after),delta:Object.fromEntries(Object.keys(after).map(k=>[k,after[k]-before[k]])),witness};
const target=path.join(folder,prefix+'-'+id.toLowerCase().replace(/^str_/,'').replaceAll('_','-')+'-route.json');
fs.writeFileSync(target,JSON.stringify(record,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({file:target,bytes:fs.statSync(target).size,sha256:sha(fs.readFileSync(target)),actionCount:record.actionCount,actionHash:record.actionHash,beforeSum:record.beforeSum,afterSum:record.afterSum}));
