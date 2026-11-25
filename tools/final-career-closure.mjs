// Exact graph closure kernel. Adapter must enumerate every action family and
// return explicit unresolved obligations; a budget is never a depth limit.
import {serialize} from "node:v8";
import {createHash} from "node:crypto";
export const MODEL="FINAL_CAREER_CLOSURE_V1";
export const stateKey=s=>createHash("sha256").update(serialize(s)).digest("hex");
export function closure({seeds,expand,budget=Infinity,checkpoint}){
 const c=checkpoint??{nodes:[],edges:[],cursor:0,unresolved:[],terminals:[]};
 const seen=new Map(c.nodes.map((n,i)=>[n.key,i]));
 function insert(state,parent,action){
  const key=stateKey(state);
  if(seen.has(key))return seen.get(key);
  const id=c.nodes.length;seen.set(key,id);c.nodes.push({key,state,parent,action});return id;
 }
 for(const s of seeds)insert(s,null,null);
 let processed=0;
 while(c.cursor<c.nodes.length&&processed<budget){
  const id=c.cursor++,n=c.nodes[id];processed++;
  let result;
  try{result=expand(n.state);}catch(e){c.unresolved.push({id,reason:String(e)});continue;}
  if(!result||!Array.isArray(result.actions)||!Array.isArray(result.unresolved)){c.unresolved.push({id,reason:"INCOMPLETE_ADAPTER"});continue;}
  for(const reason of result.unresolved)c.unresolved.push({id,reason});
  if(result.complete!==true)c.unresolved.push({id,reason:"ACTION_FAMILY_COMPLETENESS_UNPROVEN"});
  if(result.complete===true&&!result.unresolved.length&&!result.actions.length)c.terminals.push(id);
  for(const a of result.actions){
   if(!a||!Object.hasOwn(a,"state")||!Object.hasOwn(a,"action")){c.unresolved.push({id,reason:"INVALID_EDGE"});continue;}
   const to=insert(a.state,id,a.action);c.edges.push({from:id,to,action:a.action});
  }
 }
 // Graph exhaustion is distinct from actual-game provenance and optimality.
 return {checkpoint:c,processed,pending:c.nodes.length-c.cursor,graphExhausted:c.cursor===c.nodes.length&&!c.unresolved.length,actualGameCertified:false};
}
