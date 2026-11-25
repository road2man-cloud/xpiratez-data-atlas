// Fixed-set conditional closure of the NEW ordered research witnesses.
 // Representative compression applies only inside each acquired research set,
 // never across research acquisition. Concrete node/edge actions are retained.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gzipSync,gunzipSync} from "node:zlib";
import {performance} from "node:perf_hooks";
import {createBridge,birthCatalog} from "./population-frontier-chronology-core.mjs";
import {key,sha,dominates} from "./population-research-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {researchSetId} from "./final-career-active-research-sets.mjs";
import {traitSnapshot} from "./population-rank-trait-priority.mjs";
import {createConditionalResourceQuotient} from "./final-career-conditional-resource-quotient.mjs";
const MODEL="EXPANDED_FIXED_RESEARCH_CONDITIONAL_CLOSURE_V1",read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const db=decode("public/data/branch-soldier-results.json.gz"),ledger=db.populationFrontierChronology,data=read("public/data/soldiers-modern-index.json");
const fixed=decode("public/data/soldier-final-career-active-closure-v3.json.gz"),exp=decode("public/data/soldier-final-career-research-expansion.json.gz");
assert.equal(fixed.fingerprint,exp.sourceClosureFingerprint);assert.equal(exp.sourceMetadataSha256,db.sourceMetadataSha256);
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
const fingerprint=key([MODEL,exp.fingerprint,fixed.fingerprint,sha(fs.readFileSync("tools/build-final-career-expanded-closure.mjs","utf8").replace(/\r\n/g,"\n")),sha(fs.readFileSync("tools/final-career-conditional-resource-quotient.mjs","utf8").replace(/\r\n/g,"\n")),sha(fs.readFileSync("tools/final-career-repeat-quotient.mjs","utf8").replace(/\r\n/g,"\n"))]);
const out="public/data/soldier-final-career-expanded-closure.json.gz",prior=fs.existsSync(out)?decode(out):null;if(prior)assert.equal(prior.fingerprint,fingerprint);
const graphs=prior?.graphs||{},quotient=createConditionalResourceQuotient(data),births=new Map(birthCatalog(db).map(r=>[r.input,r]));
const {engine,replay,loadBirth}=createBridge(data,db,ledger.cacheHashes||ledger.hashes,{cache:true});
const all=new Map();for(const r of data.transformations)for(const b of r.allowedSoldierTypes||[]){const a=all.get(b)||[];a.push(r);all.set(b,a);}
const cache=new Map(),seen=new Map(),roots=new Map(),round={roots:0,expanded:0,created:0,aliases:0,errors:[]};
function put(k,w){if(cache.size>=160)cache.delete(cache.keys().next().value);cache.set(k,w);}
function root(id){if(roots.has(id))return roots.get(id);const e=exp.expansions[id],f=fixed.graphs[e.root],r=ledger.routes[e.root];assert(r.fullActionHash===f.rootActionHash&&r.canonicalStateHash===f.rootStateHash);
 const b=loadBirth(births.get(r.input));let w=replay.replay(r.actions,b.n.world);assert.equal(exactWorld(w),f.rootStateHash);
 const path=[];for(let i=e.node;i!==0;i=f.nodes[i].parent)path.push(i);const steps=r.actions.slice();
 for(const i of path.reverse()){w=replay.replay(f.nodes[i].steps,w);assert.equal(exactWorld(w),f.nodes[i].stateHash);steps.push(...f.nodes[i].steps);}
 assert.equal(exactWorld(w),e.sourceStateHash);w=replay.replay(e.researchActions,w);steps.push(...e.researchActions);
 assert.equal(exactWorld(w),e.resultStateHash);assert.equal(researchSetId(w,e.branch),e.resultSet);assert.equal(key([...b.birth,...steps]),e.fullActionHash);
 const v={w,e,b,steps};if(roots.size>=60)roots.delete(roots.keys().next().value);roots.set(id,v);return v;
}
function load(id,g,i){const k=id+"|"+i;if(cache.has(k))return cache.get(k);const path=[];let j=i;while(j!==null&&!cache.has(id+"|"+j)){path.push(j);j=g.nodes[j].parent;}
 let w=j===null?root(id).w:cache.get(id+"|"+j);for(const p of path.reverse()){if(p!==0)w=replay.replay(g.nodes[p].steps,w);assert.equal(exactWorld(w),g.nodes[p].stateHash);put(id+"|"+p,w);}return w;}
function insert(id,g,w,parent,action,steps){const stateHash=exactWorld(w),projection=quotient.project(w);let m=seen.get(id);if(!m){m=new Map(g.nodes.map((n,i)=>[n.projection,i]));seen.set(id,m);}
 if(m.has(projection)){round.aliases++;return {status:"CONDITIONAL_EQUIVALENT_STATE",to:m.get(projection),stateHash,projection,steps};}
 const to=g.nodes.length;m.set(projection,to);g.nodes.push({parent,action,steps,stateHash,projection,...replay.finish(w),traits:traitSnapshot(w),edges:null});put(id+"|"+to,w);if(parent!==null)round.created++;return {status:"CONDITIONAL_REPLAY",to,stateHash,projection,steps};}
for(const [id,g] of Object.entries(graphs)){const e=exp.expansions[id];assert(e&&e.resultStateHash===g.rootStateHash&&e.fullActionHash===g.rootActionHash&&e.resultSet===g.researchSet);}
const seconds=Number(arg("seconds","25")),limit=Number(arg("nodes","600")),start=performance.now();
for(const [id,e] of Object.entries(exp.expansions)){if(graphs[id]||performance.now()-start>=seconds*1000)continue;
 try{const v=root(id),g={rootStateHash:e.resultStateHash,rootActionHash:e.fullActionHash,researchSet:e.resultSet,origin:e.origin,branch:e.branch,nodes:[],cursor:0};insert(id,g,v.w,null,null,[]);graphs[id]=g;round.roots++;}catch(err){round.errors.push({id,reason:String(err.message)});}
}
function expand(id,g){const i=g.cursor,n=g.nodes[i],w=load(id,g,i),s=member(w).state,edges=[];
 function offer(action,x){if(!x){edges.push({action,status:"UNRESOLVED_LOCAL_GATE"});return;}if(researchSetId(x.world,g.branch)!==g.researchSet){edges.push({action,status:"RESEARCH_CHANGE_OUTSIDE_SCOPE"});return;}edges.push({action,...insert(id,g,x.world,i,action,x.steps)});}
 try{const x=replay.grow({world:w,steps:[]});if(x.steps.length)offer("CAP_GROWTH",x);else edges.push({action:"CAP_GROWTH",status:"AT_CAP"});}catch(err){edges.push({action:"CAP_GROWTH",status:"UNRESOLVED_LOCAL_GATE",reason:String(err.message)});}
 const supported=new Set((engine.byBody.get(s.soldierType)||[]).map(r=>r.id));
 for(const r of all.get(s.soldierType)||[]){const action=r.id;
  if(r.forbiddenSoldierTypes?.includes(s.soldierType)){edges.push({action,status:"BODY_GATE"});continue;}
  if(!r.requires.every(k=>replay.active(w,k))){edges.push({action,status:"INACTIVE_RESEARCH"});continue;}
  if(r.requiredPreviousTransformations?.some(k=>!s.history.has(k))||r.forbiddenPreviousTransformations?.some(k=>s.history.has(k))){edges.push({action,status:"HISTORY_GATE"});continue;}
  if(!supported.has(action)){edges.push({action,status:"UNSUPPORTED_FAMILY"});continue;}
  try{offer(action,replay.transform({world:w,steps:[]},r));}catch(err){edges.push({action,status:"UNRESOLVED_LOCAL_GATE",reason:String(err.message)});}
 }
 n.edges=edges;g.cursor++;round.expanded++;
}
let work=true;while(work&&round.expanded<limit&&performance.now()-start<seconds*1000){work=false;
 for(const [id,g] of Object.entries(graphs)){if(round.expanded>=limit||performance.now()-start>=seconds*1000)break;if(g.cursor>=g.nodes.length)continue;work=true;try{expand(id,g);}catch(err){g.blocker=String(err.message);round.errors.push({id,reason:g.blocker});}}
 if(round.errors.length)break;
}
const details=[],statusCounts={};let states=0,processed=0,changed=0,novelVector=0,traitGains=0;
for(const [id,g] of Object.entries(graphs)){
 const base=g.nodes[0],e=exp.expansions[id],f=fixed.graphs[e.root].nodes[e.node],frontier=new Map();let unresolved=0,unsupported=0,aliases=0,improvements=0,maxTraits=base.traits.length,distinctVectors=new Set();
 for(const [i,n] of g.nodes.entries()){
  distinctVectors.add(key([n.body,n.permanentVector]));maxTraits=Math.max(maxTraits,n.traits.length);
  for(const edge of n.edges||[]){statusCounts[edge.status]=(statusCounts[edge.status]||0)+1;if(edge.status==="UNRESOLVED_LOCAL_GATE"||edge.status==="RESEARCH_CHANGE_OUTSIDE_SCOPE")unresolved++;if(edge.status==="UNSUPPORTED_FAMILY")unsupported++;if(edge.status==="CONDITIONAL_EQUIVALENT_STATE")aliases++;}
  if(i&&(n.body!==f.body||n.permanentVector.some((v,j)=>v>f.permanentVector[j])||n.traits.some(t=>!f.traits.includes(t))))improvements++;
  const xs=frontier.get(n.body)||[];if(!xs.some(j=>dominates(g.nodes[j].permanentVector,n.permanentVector)))frontier.set(n.body,[...xs.filter(j=>!dominates(n.permanentVector,g.nodes[j].permanentVector)),i]);
 }
 const done=g.cursor===g.nodes.length&&!g.blocker;g.scopeComplete=done&&!unresolved&&!unsupported;g.frontier=Object.fromEntries(frontier);states+=g.nodes.length;processed+=g.cursor;changed+=Number(improvements>0);novelVector+=distinctVectors.size-1;traitGains+=Number(maxTraits>f.traits.length);
 details.push({id,root:e.root,origin:e.origin,branch:e.branch,rootActionHash:e.fullActionHash,sourceSet:e.sourceSet,researchSet:e.resultSet,states:g.nodes.length,expanded:g.cursor,unresolved,unsupported,aliases,scopeComplete:g.scopeComplete,improvements,rootTraits:f.traits.length,maxTraits,frontierCount:[...frontier.values()].flat().length});
}
const summary={expansionInputs:Object.keys(exp.expansions).length,roots:details.length,states,processed,pending:states-processed,scopeComplete:details.filter(r=>r.scopeComplete).length,changedRoots:changed,distinctBodyVectorIncreases:novelVector,traitGainRoots:traitGains,aliases:statusCounts.CONDITIONAL_EQUIVALENT_STATE||0,unresolved:statusCounts.UNRESOLVED_LOCAL_GATE||0,unsupported:statusCounts.UNSUPPORTED_FAMILY||0,statusCounts,actualGameCertified:0,round,details};
const result={schema:MODEL,fingerprint,sourceExpansionFingerprint:exp.fingerprint,sourceMetadataSha256:db.sourceMetadataSha256,scope:"Conditional deterministic cap-growth/live-transform continuation with fixed newly acquired research. Partial growth, arbitrary rank/medal, resources, timing and research acquisition remain unresolved; no global certificate.",quotientProof:quotient.proof,summary,graphs};
const bytes=gzipSync(JSON.stringify(result));fs.writeFileSync(out+".tmp",bytes);fs.renameSync(out+".tmp",out);
fs.writeFileSync("public/branch-soldier-expanded-closure-summary.js","export const expandedClosureSummary="+JSON.stringify({...summary,sourceExpansionFingerprint:exp.fingerprint,sourceMetadataSha256:db.sourceMetadataSha256,file:"soldier-final-career-expanded-closure.json.gz",sha256:sha(bytes)})+";\n");
console.log(JSON.stringify({...summary,details:details.slice(0,3),bytes:bytes.length}));
