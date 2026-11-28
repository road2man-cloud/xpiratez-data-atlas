// Union of reachability evidence, NEVER a union of campaign state.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const [out,...inputs]=process.argv.slice(2);
if(!out||!inputs.length)throw Error('usage: output.json graph1.json graph2.json ...');
const hash=b=>createHash('sha256').update(b).digest('hex');
const sources=[],entries=new Map(),goals={};let fingerprint;
const goalIds=['STR_MEDICAL_SUPPLIES','STR_SECTOWEED','STR_CRACK','STR_MEDICINE','STR_SOLDIER_TYPE_PEA','STR_TAKE_ME_TO_YOUR_DEALER','STR_HYBRID_PATH_PREQ','STR_HYBRID_PATH','STR_CONTACT_RETICULANS','STR_RETICULAN_GENETICS','STR_HYBRID_RECRUITMENT','STR_CAT_PATH','STR_CATGIRL_RECRUITMENT'];
for(const [source,p] of inputs.entries()){
 const bytes=fs.readFileSync(p),g=JSON.parse(bytes);
 if(g.schema!=='ATLAS_CAMPAIGN_FORWARD_TREE_V1'||g.nodes.some((n,i)=>n.id!==i))throw Error('invalid-graph');
 fingerprint??=g.sourceMetadataSha256;
 if(fingerprint!==g.sourceMetadataSha256)throw Error('different-source-rules');
 sources.push({file:path.basename(p),sha256:hash(bytes),states:g.nodes.length,edges:g.edges.length,projection:g.projection??null,scenario:{difficulty:g.difficulty,regions:g.regions,countries:g.countries},researchIds:g.summary.researchIds});
 const parents=new Map();
 for(const [index,e] of g.edges.entries())if(e.from<e.to&&!parents.has(e.to))parents.set(e.to,{e,index});
 const active=new Map(),completed=new Map(),available=new Map();
 const setBest=(map,id,n)=>{const prior=map.get(id);if(!prior||n.depth<prior.depth||(n.depth===prior.depth&&n.id<prior.id))map.set(id,n);};
 for(const n of g.nodes){
  for(const id of n.completed){setBest(completed,id,n);if(!n.pendingFree&&!n.disabled.includes(id))setBest(active,id,n);}
  if(!n.pendingFree)for(const id of n.availableResearch)setBest(available,id,n);
 }
 const ref=n=>n?{source,state:n.id,depth:n.depth,month:n.month,stateHash:n.stateHash,pendingFree:!!n.pendingFree}:null;
 const pathFor=n=>{const a=[];let i=n.id;while(i!==0){const p=parents.get(i);if(!p)throw Error('missing-parent:'+i);a.push({edge:p.index,from:p.e.from,to:p.e.to,action:p.e.action,conditional:p.e.conditional});i=p.e.from;}return a.reverse();};
 for(const id of g.summary.researchIds){
  if(!completed.has(id))throw Error('reported-research-missing:'+id);
  if(!entries.has(id))entries.set(id,[]);
  entries.get(id).push({source,completed:ref(completed.get(id)),activeResolved:ref(active.get(id))});
 }
 for(const id of goalIds){
  const best=active.get(id)||completed.get(id)||available.get(id);
  const status=active.has(id)?'active-resolved':completed.has(id)?'completed-not-active-or-pending':available.has(id)?'available-not-completed':'not-reached';
  (goals[id]??=[]).push({source,status,witness:ref(best),path:best?pathFor(best):null});
 }
}
const researchIds=[...entries.keys()].sort();
const result={schema:'ATLAS_CONDITIONAL_RESEARCH_WITNESS_INDEX_V1',sourceMetadataSha256:fingerprint,sources,summary:{distinctCompletedResearchAcrossGraphs:researchIds.length,activeResolvedAcrossGraphs:researchIds.filter(id=>entries.get(id).some(x=>x.activeResolved)).length},research:researchIds.map(id=>({id,evidence:entries.get(id)})),goals,limitations:['independent state witnesses, not simultaneously researched','projected graph is not a replacement for original graph','research reachability does not establish recruitment or training eligibility','conditional model, not native certification']};
fs.writeFileSync(out,JSON.stringify(result),{flag:'wx'});
console.log(JSON.stringify({summary:result.summary,goals:Object.fromEntries(goalIds.map(id=>[id,goals[id].map(x=>x.status)])),bytes:fs.statSync(out).size,sha256:hash(fs.readFileSync(out))}));
