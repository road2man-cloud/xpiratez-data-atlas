// V120 runner: source-hash-checked campaign research graph. No injected research.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {gzipSync} from 'node:zlib';
import {produceGraph} from './campaign-forward-graph-core-v120.mjs';
import {START_RESEARCH} from '../public/soldiers/modern/campaign-start-gate-v1.js';
const opts=Object.fromEntries(process.argv.slice(2).map(s=>{const m=/^--([a-z-]+)=(.+)$/.exec(s);assert(m,'invalid option '+s);return [m[1],m[2]]}));
const req=k=>{assert(opts[k],'missing --'+k);return opts[k]};
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const root=path.resolve(opts.root||'.'),game=req('game'),out=path.resolve(req('out'));
const prefix=read(path.join(root,'public/data/campaign-start-gold-v3.json'));
const data=read(path.join(root,'public/data/soldiers-modern-index.json'));
const source=data.meta.source.metadataSha256;
assert.equal(data.meta.mod.version,'v.o2');
assert.equal(prefix.sourceMetadataSha256,source);
assert.equal(prefix.snapshot.sourceFingerprint,source);
assert.deepEqual([...prefix.initialResearch].sort(),Object.keys(START_RESEARCH).sort());
assert(!prefix.snapshot.researched.length&&!prefix.snapshot.disabled.length);
const yaml=createRequire(path.join(root,'package.json'))('js-yaml');
const files={},research={},items={},facilities={};
function load(file,expected){
 const bytes=fs.readFileSync(file),name=path.basename(file),digest=sha(bytes);
 assert.equal(digest,expected||prefix.sourceFiles[name],'source hash mismatch '+name);
 files[name]=digest;
 const doc=yaml.load(bytes.toString('utf8'),{json:true})||{};
 for(const [k,dst] of Object.entries({research,items,facilities}))for(const row of doc[k]||[]){
  if(row.delete){delete dst[row.delete];continue;}
  const id=row.type||row.name||row.id;if(id)dst[id]={...dst[id],...row};
 }
}
for(const n of ['vars','startingBase','facilities','items','research'])load(path.join(game,'standard/xcom1',n+'.rul'));
for(const e of [...data.meta.source.rules].sort((a,b)=>a.file.localeCompare(b.file,'en')))load(path.join(game,'user/mods/Piratez/Ruleset',e.file),e.sha256);
for(const [n,h] of Object.entries(prefix.sourceFiles))assert.equal(files[n],h,'prefix source mismatch '+n);
const researchGrants={};
for(const [id,r] of Object.entries(research)){
 const grants={};if(r.spawnedItem&&items[r.spawnedItem])grants[r.spawnedItem]=r.spawnedItemCount??1;
 for(const k of r.spawnedItemList||[])if(items[k])grants[k]=(grants[k]||0)+1;
 if(Object.keys(grants).length)researchGrants[id]=grants;
}
data.campaignAssets={sourceFingerprint:source,facilities,items,researchGrants};
const snapshot=structuredClone(prefix.snapshot);
const maxStates=Number(opts.states||250),maxDepth=Number(opts.depth||12);
const graph=produceGraph(data,snapshot,{maxStates,maxDepth});
graph.sourceFiles=files;graph.snapshot=snapshot;graph.scope='lab-and-free-research-only; no economy, native clock, facility, event or combat expansion';
graph.budget={maxStates,maxDepth};
const byResearch={},byId=new Map(graph.nodes.map(n=>[n.id,n]));
for(const edge of graph.edges)for(const id of edge.added){
 const row=byResearch[id]??={firstDepth:Infinity,firstState:null,transitionCount:0};
 row.transitionCount++;
 const depth=byId.get(edge.to).depth;
 if(depth<row.firstDepth){row.firstDepth=depth;row.firstState=edge.to;}
}
const rootEdges=graph.edges.filter(e=>e.from===graph.initial);
assert.deepEqual(rootEdges.map(e=>e.action.id).sort(),Object.keys(START_RESEARCH).sort());
const summary={states:graph.nodes.length,transitions:graph.edges.length,frontier:graph.frontier.length,rejected:graph.rejected.length,distinctCompleted:Object.keys(byResearch).length,maxDepth:Math.max(...graph.nodes.map(n=>n.depth)),rootActions:rootEdges.map(e=>({action:e.action,added:e.added,availableAfter:e.availableAfter,pendingFree:byId.get(e.to).pendingFree})),gameCertified:0,complete:false,scope:graph.scope};
fs.mkdirSync(out,{recursive:true});
const write=(n,v)=>fs.writeFileSync(path.join(out,n),JSON.stringify(v,null,2)+'\n','utf8');
const gz=gzipSync(Buffer.from(JSON.stringify(graph)));
fs.writeFileSync(path.join(out,'campaign-forward-research-graph-v120.json.gz'),gz);
write('campaign-forward-research-index-v120.json',{version:120,sourceFingerprint:source,graphSha256:sha(gz),initial:graph.initial,summary,byResearch});
write('v120-research-frontier.json',{sourceFingerprint:source,graphSha256:sha(gz),frontier:graph.frontier});
write('v120-production-report.json',{version:120,sourceFingerprint:source,sourceFiles:files,graphSha256:sha(gz),budget:graph.budget,summary});
console.log(JSON.stringify(summary));
