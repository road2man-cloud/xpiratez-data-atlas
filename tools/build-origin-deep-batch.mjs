// Deterministic resumable deep-search pass across the existing origin registry.
// Each scoped invocation replays the selected origin from a preserved birth
// witness. Never fabricate research flags or overwrite unrelated origins.
// Incremental writes allow safe interruption; final publication requires --check.
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {decodeOriginReport} from './origin-report-codec.mjs';
const path='public/data/soldier-origin-candidates.json';
const limitText=process.argv.find(x=>x.startsWith('--limit='))?.slice(8);
const max=limitText===undefined?Number.POSITIVE_INFINITY:Number(limitText);
if(!(max===Infinity||Number.isSafeInteger(max)&&max>=1))
  throw Error('Positive --limit required');
const includeUnresolved=process.argv.includes('--retry-unresolved');
const selected=process.argv.find(x=>x.startsWith('--only='))?.slice(7)?.split(',').filter(Boolean);
const start=Date.now();
let completed=0,failures=0;
const attempted=new Set();
while(completed<max){
  const report=decodeOriginReport(fs.readFileSync(path,'utf8'));
  const eligible=report.records.filter(r=>
    (includeUnresolved||r.candidates.length>0)&&
    r.searchScope?.mode!=='bounded-beam'&&
    !attempted.has(r.profileId)&&
    (!selected||selected.includes(r.profileId)));
  if(!eligible.length)break;
  const row=eligible[0],flags=['tools/build-soldier-origin-candidates.mjs',

    '--profile='+row.profileId,'--deep-search'];
  const duration=Date.now();
  const result=spawnSync(process.execPath,flags,{
    cwd:process.cwd(),encoding:'utf8',timeout:240000,maxBuffer:1024*1024
  });
  if(result.status!==0){
    failures++;
    console.error('FAILED '+row.profileId+' '+(result.error?.message||result.stderr?.slice(-1800)||'unknown'));
    // Preserve the previous archive and move on to a different origin.
    attempted.add(row.profileId);
    continue;
  }
  const fresh=decodeOriginReport(fs.readFileSync(path,'utf8'));
  const now=fresh.records.find(r=>r.profileId===row.profileId);
  if(now?.searchScope?.mode!=='bounded-beam'||!now.candidates.length)
    throw Error('Scoped deep pass did not produce a persisted record: '+row.profileId);
  completed++;
  console.log('DONE '+row.profileId+' '+now.candidates.length+
    ' candidates; total '+fresh.summary.witnesses+
    '; deep '+fresh.records.filter(r=>r.searchScope?.mode==='bounded-beam').length+
    '; elapsed '+Math.round((Date.now()-duration)/1000)+'s');
}
const final=decodeOriginReport(fs.readFileSync(path,'utf8'));
console.log('BATCH '+JSON.stringify({completed,failures,witnesses:final.summary.witnesses,
  deep:final.records.filter(r=>r.searchScope?.mode==='bounded-beam').length,
  unresolved:final.summary.unresolved,seconds:Math.round((Date.now()-start)/1000)}));
if(failures)process.exitCode=1;
