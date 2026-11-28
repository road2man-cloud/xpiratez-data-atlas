// Materialize only the witnessed ancestor paths of named frontier states.
// All original state hashes and actions remain untouched; IDs are remapped.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const [source,output,targetsArg]=process.argv.slice(2);
if(!source||!output||!targetsArg)throw Error('usage: source.json output.json originalNodeIds');
const bytes=fs.readFileSync(source),g=JSON.parse(bytes);
if(g.schema!=='ATLAS_CAMPAIGN_FORWARD_TREE_V1'||g.nodes.some((n,i)=>n.id!==i))throw Error('invalid-source-graph');
const targets=[...new Set(targetsArg.split(',').map(Number))];
if(targets.some(i=>!Number.isSafeInteger(i)||i<0||i>=g.nodes.length||g.nodes[i].pendingFree))throw Error('invalid-focus-target');
const parent=new Map();
for(const [index,e] of g.edges.entries())if(e.from<e.to&&!parent.has(e.to))parent.set(e.to,{e,index});
const keep=new Set([0]),chosen=new Set();
function add(id){
 while(id!==0&&!keep.has(id)){
  keep.add(id);const p=parent.get(id);if(!p)throw Error('missing-parent:'+id);
  chosen.add(p.index);id=p.e.from;
 }
}
for(const i of Object.values(g.firstBranches))add(i);
for(const i of targets)add(i);
const oldIds=[...keep].sort((a,b)=>a-b),map=new Map(oldIds.map((id,i)=>[id,i]));
const nodes=oldIds.map((originalId,id)=>({...g.nodes[originalId],id,expanded:false,candidateCount:null,omitted:0,blocked:[],frontierReason:'ancestor-projection-not-expanded'}));
const sourceEdgeIndices=[...chosen].sort((a,b)=>a-b);
const edges=sourceEdgeIndices.map(i=>({...g.edges[i],from:map.get(g.edges[i].from),to:map.get(g.edges[i].to)}));
const researchIds=[...new Set(edges.flatMap(e=>e.added||[]))].sort();
const {nodes:oldNodes,edges:oldEdges,summary:oldSummary,continuation:oldContinuation,...metadata}=g;
const projection={kind:'ancestor-path-subgraph-v1',sourceFile:path.basename(source),sourceSha256:createHash('sha256').update(bytes).digest('hex'),sourceStates:oldNodes.length,sourceEdges:oldEdges.length,oldIds,sourceEdgeIndices,targets:targets.map(originalId=>({originalId,id:map.get(originalId)}))};
const out={...metadata,scope:'FOCUSED_ANCESTOR_PATH_PROJECTION; NO_NATIVE_CERTIFICATION',projection,firstBranches:Object.fromEntries(Object.entries(g.firstBranches).map(([k,v])=>[k,map.get(v)])),nodes,edges,continuation:null,summary:{states:nodes.length,edges:edges.length,distinctCompletedResearch:researchIds.length,researchIds,expandedStates:0,frontierStates:nodes.length,omittedActions:null,rejectedActions:0,gameCertified:0,exhaustive:false},excluded:[...g.excluded,'all off-path states and non-parent edges omitted from ancestor projection']};
fs.writeFileSync(output,JSON.stringify(out),{flag:'wx'});
console.log(JSON.stringify({states:nodes.length,edges:edges.length,targets:projection.targets,sourceSha256:projection.sourceSha256}));
