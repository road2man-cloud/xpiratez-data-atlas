// Forward career demand ledger. Existing career actions are deliberately not inputs.
// This produces research and recruitment evidence, not certified soldier careers.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export const GRAPH_FILES=[
 'campaign-forward-tree-v2-japan-d4.json',
 'campaign-forward-tree-v6-hybrid-synced-d7.json',
 'campaign-forward-tree-v7-hybrid-awards-d20.json',
 'campaign-forward-tree-v8-supply-d9.json','campaign-forward-tree-v9-career-focus-d20.json','campaign-forward-tree-v10-firearms-d24.json','campaign-forward-tree-v11-militia-d40.json'
];
const ROOT=['STR_INSPECT_MACHINERY','STR_JACKSTOWN_SCOUTING','STR_RECRUIT_PEASANTS','STR_WAT_DO'];
const unique=xs=>[...new Set(xs)];
const conditional=e=>!!(e.conditional||e.action.assumeOutcome||e.action.assumeAvailability||e.action.assumeTransport||e.action.assumeRecovery);
const better=(a,b)=>Number(a.conditional)-Number(b.conditional)||a.steps.length-b.steps.length||a.file.localeCompare(b.file);
export function projectRuntime(d){
 if(d.meta?.mod?.version!=='v.o2')throw Error('wrong-runtime-version');
 return {source:d.meta.source.metadataSha256,
 profiles:d.profiles.map(p=>({id:p.id,sourceType:p.sourceType,sourceId:p.sourceId,soldierType:p.soldierType,requires:p.requires,functions:p.requiresBaseFunc,items:p.acquisitionRequiredItems})),
 trainings:d.transformations.map(t=>({id:t.id,requires:t.requires,functions:t.requiresBaseFunc,items:t.requiredItems,previous:t.requiredPreviousTransformations,forbidden:t.forbiddenPreviousTransformations,output:t.producedSoldierType}))};
}
export function projectGraph(g,file,source){
 if(g.schema!=='ATLAS_CAMPAIGN_FORWARD_TREE_V1'||g.sourceMetadataSha256!==source||g.nodes[0]?.id!==0||g.nodes[0]?.completed?.length!==0||JSON.stringify([...g.nodes[0].availableResearch].sort())!==JSON.stringify(ROOT))throw Error('bad graph '+file);
 const nodes=new Map(g.nodes.map(n=>[n.id,n])),out=new Map();
 if(nodes.size!==g.nodes.length)throw Error('duplicate state');
 for(const e of g.edges){
  if(!nodes.has(e.from)||!nodes.has(e.to))throw Error('bad edge');
  if(['research','repeatResearch'].includes(e.action.type)&&!nodes.get(e.from).availableResearch.includes(e.action.id))throw Error('illegal lab edge');
  if(!out.has(e.from))out.set(e.from,[]);
  out.get(e.from).push(e);
 }
 function walk(strict){const p=new Map([[0,null]]),q=[0];for(let i=0;i<q.length;i++)for(const e of out.get(q[i])||[]){if(strict&&conditional(e))continue;if(!p.has(e.to)){p.set(e.to,e);q.push(e.to);}}return {p,q};}
 const all=walk(false),strict=walk(true);
 if(all.q.length!==nodes.size)throw Error('unreachable state');
 function witness(id,last=null){
  let v=last?last.from:id;const p=strict.p.has(v)&&(!last||!conditional(last))?strict.p:all.p,es=[];
  while(v!==0){const e=p.get(v);es.push(e);v=e.from;}es.reverse();if(last)es.push(last);
  return {file,state:id,stateHash:nodes.get(id).stateHash,scenario:{difficulty:g.difficulty,regions:g.regions,countries:g.countries},conditional:es.some(conditional),steps:es.map(e=>e.action),gameCertified:false};
 }
 const active=(id,ids)=>ids.every(k=>nodes.get(id).completed.includes(k)&&!nodes.get(id).disabled.includes(k));
 return {file,states:nodes.size,edges:g.edges.length,find(ids){for(const id of unique([...strict.q,...all.q]))if(active(id,ids))return witness(id);return null;},recruit(p){if(p.sourceType!=='manufacture')return null;return g.edges.filter(e=>e.action.type==='manufactureBundle'&&e.action.recipe===p.sourceId&&active(e.from,p.requires)).map(e=>witness(e.to,e)).sort(better)[0]||null;}};
}
export function buildTargets(runtime,graphs){
 const best=xs=>xs.filter(Boolean).sort(better)[0]||null,cache=new Map();
 const find=ids=>{const k=JSON.stringify([...ids].sort());if(!cache.has(k))cache.set(k,best(graphs.map(g=>g.find(ids))));return cache.get(k);};
 const make=(rows,kind)=>rows.map(row=>{
  if(!Array.isArray(row.requires)||row.requires.some(id=>typeof id!=='string'||!id))throw Error('unresolved requires '+row.id);
  const ids=unique(row.requires),w=ids.length?find(ids):null;
  return {...row,kind,researchStatus:!ids.length?'no-explicit-research':w?'joint-model-reached':'not-observed-jointly',researchWitness:w,topicStatus:ids.map(id=>({id,observed:!!find([id])})),manufactureWitness:kind==='profile'?best(graphs.map(g=>g.recruit(row))):null,careerStatus:'not-replayed',gameCertified:false};
 });
 const profiles=make(runtime.profiles,'profile'),trainings=make(runtime.trainings,'training'),missing=new Map();
 for(const row of [...profiles,...trainings])for(const t of row.topicStatus)if(!t.observed){if(!missing.has(t.id))missing.set(t.id,{id:t.id,profiles:[],trainings:[]});missing.get(t.id)[row.kind==='profile'?'profiles':'trainings'].push(row.id);}
 // STR_UNAVAILABLE is a zero-cost, self-sample gate; do not schedule it as ordinary lab research.
 // Keep the affected targets visible; this does not certify permanent impossibility.
 const unresolved=[...missing.values()].sort((a,b)=>b.profiles.length+b.trainings.length-a.profiles.length-a.trainings.length||a.id.localeCompare(b.id));
 const specialGates=unresolved.filter(x=>x.id==='STR_UNAVAILABLE').map(x=>({...x,reason:'zero-cost self-sample gate; ordinary expansion excluded'}));
 const priorities=unresolved.filter(x=>x.id!=='STR_UNAVAILABLE');
 const summary=rows=>({total:rows.length,jointResearch:rows.filter(r=>r.researchStatus==='joint-model-reached').length,noExplicitResearch:rows.filter(r=>r.researchStatus==='no-explicit-research').length,notObservedJointly:rows.filter(r=>r.researchStatus==='not-observed-jointly').length,manufactureActions:rows.filter(r=>r.manufactureWitness).length,careerCertified:0});
 return {schema:'ATLAS_FORWARD_CAREER_TARGETS_V1',sourceMetadataSha256:runtime.source,scope:'BOUNDED_RESEARCH_TARGETS_ONLY; NO_LEGACY_ACTIONS; NO_CAREER_REPLAY',graphs:graphs.map(({file,states,edges})=>({file,states,edges})),profiles,trainings,priorities,specialGates,summary:{profiles:summary(profiles),trainings:summary(trainings),missingResearchTopics:unresolved.length,ordinaryExpansionTopics:priorities.length,specialGateTopics:specialGates.length,gameCertified:0}};
}
export function produce(repo,files=GRAPH_FILES){
 const hash=b=>createHash('sha256').update(b).digest('hex');
 const bytes=fs.readFileSync(path.join(repo,'public/data/soldiers-modern-index.json')),runtime=projectRuntime(JSON.parse(bytes));
 const sources=files.map(file=>{const b=fs.readFileSync(path.join(repo,'public/data',file));return {sha256:hash(b),graph:projectGraph(JSON.parse(b),file,runtime.source)};});
 const result=buildTargets(runtime,sources.map(x=>x.graph));
 result.runtimeSha256=hash(bytes);result.graphs.forEach((g,i)=>g.sha256=sources[i].sha256);return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const args=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith('--')&&x.includes('=')).map(x=>x.slice(2).split(/=(.*)/s).slice(0,2)));
 if(!args.out)throw Error('--out is required');
 const result=produce(args.repo||process.cwd(),args.graphs?args.graphs.split(','):GRAPH_FILES);
 fs.writeFileSync(args.out,JSON.stringify(result,null,2)+String.fromCharCode(10));console.log(JSON.stringify(result.summary));
}
