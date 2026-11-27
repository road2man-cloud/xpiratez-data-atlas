// Scheduling only: reserve graph slots for uncovered target bodies.
// A selected graph may supply multiple bodies; preserve all graph choices
// in the ordinary queue. No candidate is deemed equivalent or closed.
export function balanceClosureGraphs(candidates,{bodies,limit,compare}){
 if(!Array.isArray(bodies)||!Number.isSafeInteger(limit)||limit<1||typeof compare!=="function")throw Error("Invalid graph selection budget");
 const wanted=[...new Set(bodies)],allowed=new Set(wanted),ranked=candidates.filter(c=>allowed.has(c.body)).slice().sort(compare),byBody=new Map(),graphBodies=new Map();
 for(const c of ranked){
  if(!byBody.has(c.body))byBody.set(c.body,[]);
  byBody.get(c.body).push(c);
  if(!graphBodies.has(c.graph))graphBodies.set(c.graph,new Set());
  graphBodies.get(c.graph).add(c.body);
 }
 const result=[],chosen=new Set(),covered=new Set();
 function take(c){
  if(!c||chosen.has(c.graph)||result.length>=limit)return;
  chosen.add(c.graph);result.push(c);
  for(const b of graphBodies.get(c.graph))covered.add(b);
 }
 // Respect explicit requested-body order when the budget cannot cover all.
 for(const b of wanted){
  if(!covered.has(b))take(byBody.get(b)?.find(c=>!chosen.has(c.graph)));
 }
 for(const c of ranked)take(c);
 return result;
}
