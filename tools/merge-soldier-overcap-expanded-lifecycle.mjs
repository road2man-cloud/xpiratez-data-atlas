import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const prep=read('public/data/soldier-overcap-context-expanded.json');
const base=read('public/data/soldier-overcap-conditional-lifecycle.json');
const inputs=[base,...process.argv.slice(2).map(read)];
const expected=prep.entries.filter(e=>e.status==='RESEARCH_ONLY_SEQUENCE_COMPLETE').flatMap(e=>e.groups);
const map=new Map();
for(const x of inputs){
 if(x.schema!==base.schema||x.sourceMetadataSha256!==prep.sourceMetadataSha256||x.sourceLedgerHash!==prep.sourceLedgerHash||JSON.stringify(x.statKeys)!==JSON.stringify(base.statKeys))throw Error('source or schema mismatch');
 for(const row of x.results){if(map.has(row.id))throw Error('duplicate '+row.id);map.set(row.id,row);}
}
if(new Set(expected).size!==expected.length||expected.length!==map.size||expected.some(id=>!map.has(id)))throw Error('missing or unexpected groups');
const results=expected.map(id=>map.get(id)), complete=results.filter(x=>x.status==='CONDITIONAL_LIFECYCLE_COMPLETE');
const pareto=complete.filter(a=>!complete.some(b=>a!==b&&a.body===b.body&&a.origin===b.origin&&b.effective.every((v,i)=>v>=a.effective[i])&&b.effective.some((v,i)=>v>a.effective[i]))).map(r=>r.id);
const byBody={};for(const r of results){const b=byBody[r.body]||{attempted:0,complete:0};b.attempted++;if(r.status==='CONDITIONAL_LIFECYCLE_COMPLETE')b.complete++}
const report={schema:base.schema,sourceMetadataSha256:base.sourceMetadataSha256,sourceLedgerHash:base.sourceLedgerHash,statKeys:base.statKeys,scope:base.scope,summary:{attempted:results.length,complete:complete.length,blocked:results.length-complete.length,paretoWithinOrigin:pareto.length,byBody,totalQueueGroups:prep.summary.totalGroups,notYetResearchPrepared:prep.summary.remaining},paretoWithinOrigin:pareto,results};
fs.writeFileSync('public/data/soldier-overcap-expanded-lifecycle.json',JSON.stringify(report)+'\n');
console.log(JSON.stringify({summary:report.summary,topNew:complete.filter(r=>r.body==='STR_SOLDIER_X').sort((a,b)=>b.total-a.total).slice(0,4).map(r=>({origin:r.origin,order:r.order,total:r.total,raw:r.raw,effective:r.effective}))}));
