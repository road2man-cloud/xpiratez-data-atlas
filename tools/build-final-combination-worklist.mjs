// Internal replay work queue for the existing DB's canonical completion index.
// This command emits data to stdout. It never modifies the legacy ledgers.
// --emit=worklist|batch|prepared-batch|obligation-batch|summary ; --offset=N --limit=N
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {ledgers,project,compileResearchSearch} from '../public/branch-soldier-atlas-career-core.js';
import {classifyReplayWork,digest,WORK_SCHEMA,flags} from './final-combination-production.mjs';
import {prepareReplayPrefixes} from './final-combination-seed-prefixes.mjs';
const arg=(key,fallback)=>process.argv.find(a=>a.startsWith('--'+key+'='))?.slice(key.length+3)??fallback;
const sha=b=>createHash('sha256').update(b).digest('hex');
const base=new URL('../public/data/',import.meta.url);
const read=name=>fs.readFileSync(new URL(name,base));
const compressed=name=>{const bytes=read(name+'.json.gz');return {raw:JSON.parse(gunzipSync(bytes)),sha256:sha(bytes)};};
const modern=JSON.parse(read('soldiers-modern-index.json'));
const metadata=modern.meta.source.metadataSha256;
const registry=compressed('branch-soldier-results');
assert.equal(registry.raw.sourceMetadataSha256,metadata);
const errors=[],research=new Map(),indices=new Map(),sources=[];
for(const ledger of ledgers){
 const {raw,sha256}=compressed(ledger.file);
 assert.equal(raw.sourceMetadataSha256,metadata);
 const p=project(ledger,raw,metadata);
 if(ledger.registryKey)assert.deepEqual(registry.raw[ledger.registryKey]?.routes,raw.routes,'Canonical registry and ledger disagree: '+ledger.key);
 let indexSha=null;
 if(ledger.index){try{
  const x=compressed(ledger.index);indexSha=x.sha256;
  research.set(ledger.key,compileResearchSearch(ledger,x.raw,metadata));indices.set(ledger.key,x.raw);
 }catch(e){errors.push({source:ledger.key,error:e.message});}}
 const ids=Object.keys(raw.routes).sort();
 sources.push({key:ledger.key,file:ledger.file,sha256,indexSha,idsHash:digest(ids),raw,rows:p.rows,ids});
}
const result=classifyReplayWork(sources,{hasWitness:r=>research.get(r.source)?.hasWitness(r)===true});
const prefixes=prepareReplayPrefixes(sources,registry.raw,indices,metadata);
const prefixOpportunity=prefixes.opportunity(result.queue),obligations=prefixes.firstObligations(result.queue);
const graphSources=[];
for(const name of ['soldier-final-career-active-closure-v3','soldier-final-career-expanded-closure','soldier-final-career-alternating-v9','soldier-population-missing-origin-career']){
 const {raw,sha256}=compressed(name);assert.equal(raw.sourceMetadataSha256,metadata);
 let states=0,expanded=0,pending=0;
 for(const graph of Object.values(raw.graphs||{})){
  const n=graph.nodes.length,c=graph.nodes.filter(node=>Array.isArray(node.edges)).length;
  states+=n;expanded+=c;pending+=n-c;
 }
 graphSources.push({file:name,sha256,graphs:Object.keys(raw.graphs||{}).length,states,expanded,pending});
}
const sourceDescriptors=sources.map(({key,file,sha256,indexSha,idsHash,ids})=>({key,file,sha256,indexSha,idsHash,rows:ids.length}));
const summary={...result.summary,totalOrigins:modern.profiles.length,staticBranches:registry.raw.branches.length,
 conditionalHistoryBranches:registry.raw.branches.filter(b=>b.historyCount>0&&!b.sourceRootConflict).length,
 knownPendingGraphEntries:graphSources.reduce((n,g)=>n+g.pending,0),knownGraphEntries:graphSources.reduce((n,g)=>n+g.states,0),
 completedBranches:registry.raw.careerCompletion.summary.fullyEnumeratedBranches,globalOptima:registry.raw.careerCompletion.summary.globalOptimalCertified,fullSpaceSize:registry.raw.careerCompletion.summary.totalSearchSpace,complete:registry.raw.careerCompletion.summary.completeCombinations,finalEquivalenceMerges:registry.raw.careerCompletion.summary.equivalentCombinationsCompressed,replayPrefixes:prefixes.summary,conditionalReplayReuse:prefixOpportunity,firstObligations:obligations.summary};
const codeHashes=Object.fromEntries(['build-final-combination-worklist.mjs','final-combination-production.mjs','final-combination-seed-prefixes.mjs','atlas-career-completion-core.mjs'].map(p=>[p,sha(fs.readFileSync(new URL(p,import.meta.url)))]));
const snapshot=digest({metadata,registry:registry.sha256,sources:sourceDescriptors,graphSources,policy:WORK_SCHEMA,codeHashes});
const queueHash=digest(result.queue.map(x=>[x.key,x.seed,x.aliases,!!x.requiresComparison]));
const batch=(offset,limit)=>result.queue.slice(offset,offset+limit).map(({key,origin,branch,difficulty,seed,aliases,priority,requiresComparison=false})=>{
 const ref=([si,ri])=>({source:sources[si].key,id:sources[si].ids[ri]});
 return {key,origin,branch,difficulty,seed:ref(seed),aliases:aliases.map(ref),priority,requiresComparison};
});
const worklist={schema:WORK_SCHEMA,sourceMetadataSha256:metadata,snapshot,registrySha256:registry.sha256,sources:sourceDescriptors,
 graphSources,summary,sourceStats:result.sourceStats,flags,classificationEncoding:'canonical careerCompletion.classifications; worklist flags apply to internal scheduling only',
 queueHash,firstBatch:batch(0,24),firstObligations:obligations.items.slice(0,6).map(({units,origins,...g})=>({...g,originCount:origins.length,originSample:origins.slice(0,3),unitSample:units.slice(0,3)})),codeHashes,prefixErrors:prefixes.errors,errors};
const mode=arg('emit','summary');
if(mode==='worklist')console.log(JSON.stringify(worklist));
else if(mode==='batch'||mode==='prepared-batch'||mode==='obligation-batch'){
 const offset=Number(arg('offset','0')),limit=Number(arg('limit','72'));
 assert(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=0&&limit<=1000);
 const items=mode==='obligation-batch'?obligations.items.slice(offset,offset+limit).map(g=>obligations.resolve(g)):batch(offset,limit);
 if(mode==='prepared-batch')for(const [i,item] of items.entries())item.prepared=prefixes.resolve(result.queue[offset+i].seed);
 console.log(JSON.stringify({snapshot,queueHash,offset,units:mode==='obligation-batch'?obligations.items.length:summary.replayWorkUnits,items}));
}else if(mode==='summary')console.log(JSON.stringify({snapshot,queueHash,summary,sourceStats:result.sourceStats,graphSources,prefixErrors:prefixes.errors.slice(0,10),errors},null,2));
else throw Error('Unknown --emit mode');
