import fs from 'node:fs';
const paths=process.argv.slice(2);
if(!paths.length)throw Error('Supply lifecycle batch JSON paths');
const parts=paths.map(p=>JSON.parse(fs.readFileSync(p,'utf8'))).sort((a,b)=>a.batch.offset-b.batch.offset);
const first=parts[0],results=[],ids=new Set();let cursor=0;
for(const part of parts){
 if(part.schema!==first.schema||part.sourceMetadataSha256!==first.sourceMetadataSha256||part.sourceLedgerHash!==first.sourceLedgerHash||JSON.stringify(part.statKeys)!==JSON.stringify(first.statKeys)||part.batch.total!==first.batch.total||part.batch.offset!==cursor)throw Error('incompatible or noncontiguous batch');
 for(const row of part.results){if(ids.has(row.id))throw Error('duplicate '+row.id);ids.add(row.id);results.push(row);cursor++;}
}
if(cursor!==first.batch.total)throw Error('incomplete batch coverage');
const complete=results.filter(r=>r.status==='CONDITIONAL_LIFECYCLE_COMPLETE');
const pareto=complete.filter(a=>!complete.some(b=>a!==b&&a.body===b.body&&a.origin===b.origin&&b.effective.every((v,i)=>v>=a.effective[i])&&b.effective.some((v,i)=>v>a.effective[i]))).map(r=>r.id);
const summary={attempted:results.length,complete:complete.length,blocked:results.length-complete.length,paretoWithinOrigin:pareto.length,byBody:Object.fromEntries([...new Set(results.map(r=>r.body))].map(b=>[b,{complete:complete.filter(r=>r.body===b).length,attempted:results.filter(r=>r.body===b).length}]))};
const report={schema:first.schema,sourceMetadataSha256:first.sourceMetadataSha256,sourceLedgerHash:first.sourceLedgerHash,statKeys:first.statKeys,scope:first.scope,summary,paretoWithinOrigin:pareto,results,batches:parts.map(p=>({offset:p.batch.offset,count:p.results.length,complete:p.summary.complete}))};
const target='public/data/soldier-overcap-conditional-lifecycle.json';
fs.writeFileSync(target,JSON.stringify(report)+'\n');
console.log(JSON.stringify({summary,bytes:fs.statSync(target).size,top:complete.slice().sort((a,b)=>b.total-a.total).slice(0,4).map(r=>({origin:r.origin,body:r.body,order:r.order,total:r.total,raw:r.raw,effective:r.effective}))}));
