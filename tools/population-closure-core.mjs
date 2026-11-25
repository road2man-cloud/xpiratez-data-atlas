// Exact reachability closure of an explicitly restricted numeric transition
// system. This is not an unrestricted game/campaign solver.
import assert from "node:assert/strict";
import {initialState,applyTransformation,bonusStats,STAT_KEYS} from "../public/soldiers/modern/eligibility.js";
import {scalarGrowth} from "./population-scalar-upper-bound.mjs";
export const MODEL="FIXED_ACTIVE_DETERMINISTIC_CAP_TARGET_UNBOUNDED_V1";
export const vec=s=>STAT_KEYS.map(k=>s[k]);
export const sorted=s=>[...s].sort();
const object=v=>Object.fromEntries(STAT_KEYS.map((k,i)=>[k,v[i]]));
export const ruleList=data=>data.transformations.filter(r=>r.allowsLiveSoldiers&&!r.createsClone&&!r.producedItem&&!r.requires.includes("STR_UNAVAILABLE"));
// No selective removal means counts are observed only via presence; reset
// clears all counters. Rule engine gates inspect history.has and bonus IDs.
// This quotient must be disabled if a selective eraser is ever introduced.
export function assertPresenceQuotient(data){
 assert(data.transformations.every(r=>!(r.removeTransformations||[]).length),"Selective removal requires exact counts");
}
// Source ID, display steps/remarks and accumulated research requirements are
// not read by numeric current-mode gates; active research is supplied by mask.
// Preserve initial vector, armor, body, rank, status, history/bonus presence.
export function project(s){
 const a=[s.soldierType,s.armorId,s.status,!!s.corpseRecovered,s.rank,vec(s.initialStats),vec(s.currentStats),sorted(s.history.keys()),sorted(s.bonusIds),!!s.retired,s.historyKnown!==false,!!s.exactStats];
 assert(a[5].every(Number.isSafeInteger)&&a[6].every(Number.isSafeInteger));
 return a;
}
export function unpack(a){
 const [soldierType,armorId,status,corpseRecovered,rank,ini,raw,h,b,retired,historyKnown,exactStats]=a;
 return {soldierType,armorId,status,corpseRecovered,rank,initialStats:object(ini),currentStats:object(raw),history:new Map(h.map(k=>[k,1])),bonusCounts:new Map(b.map(k=>[k,1])),bonusIds:new Set(b),retired,historyKnown,exactStats,researchIds:new Set(),steps:[],remarks:[]};
}
// Reduced ordered BDD of the finite set of actually observed availability
// masks. This is exact membership in the observed relation, not a proof that
// unobserved histories are impossible or that the campaign is exhaustive.
export function observedBDD(masks,width){
 const unique=[...new Set(masks)].map(s=>BigInt("0x"+s)),nodes=[null,null],intern=new Map();
 function rec(xs,i){
  if(!xs.length)return 0;if(i===width)return 1;
  const bit=1n<<BigInt(i),lo=[],hi=[];
  for(const x of xs)(x&bit?hi:lo).push(x);
  const l=rec(lo,i+1),h=rec(hi,i+1);if(l===h)return l;
  const k=i+"|"+l+"|"+h;if(intern.has(k))return intern.get(k);
  const id=nodes.length;nodes.push([i,l,h]);intern.set(k,id);return id;
 }
 return {width,root:rec(unique,0),nodes,observedMasks:unique.length};
}
export function bddHas(bdd,mask){
 let n=bdd.root;while(n>1){const [i,l,h]=bdd.nodes[n];n=mask&(1n<<BigInt(i))?h:l;}return n===1;
}
export function createClosureModel(data,snapshot){
 assertPresenceQuotient(data);
 const rules=ruleList(data),bodies=new Map(data.soldiers.map(b=>[b.id,b])),byBody=new Map(),bits=rules.map((_,i)=>1n<<BigInt(i));
 assert.deepEqual(snapshot.rules,rules.map(r=>r.id));
 for(let i=0;i<rules.length;i++)for(const b of rules[i].allowedSoldierTypes||[]){const a=byBody.get(b)||[];a.push(i);byBody.set(b,a);}
 const vocab=new Map(snapshot.researchVocabulary.map((id,i)=>[id,1n<<BigInt(i)]));
 const hs=snapshot.histories.map(h=>BigInt("0x"+h.activeMaskHex)),active=(mask,id)=>!!(mask&(vocab.get(id)||0n));
 const available=hs.map(h=>rules.reduce((m,r,i)=>r.requires.every(k=>active(h,k))?m|bits[i]:m,0n));
 const bdd=observedBDD(available.map(m=>m.toString(16)),rules.length);
 assert(available.every(m=>bddHas(bdd,m)));
 function reachable(body,mask){
  let reach=0n;const seen=new Set([body]),queue=[body];
  for(let j=0;j<queue.length;j++)for(const i of byBody.get(queue[j])||[]){
   if(!(mask&bits[i]))continue;reach|=bits[i];const next=rules[i].producedSoldierType||queue[j];
   if(!seen.has(next)){seen.add(next);queue.push(next);}
  }
  return reach;
 }
 function initial(p){return ["min","max"].map(band=>project({...initialState(data,p,{band}),exactStats:true,historyKnown:true}));}
 function terminal(p){
  const s=unpack(p),raw=vec(s.currentStats),b=bonusStats(s,data),bonus=STAT_KEYS.map(k=>b[k]||0);
  const vector=raw.map((v,i)=>STAT_KEYS[i]==="psiSkill"&&v<=0&&bonus[i]>0?v:Math.max(STAT_KEYS[i]==="health"?1:0,v+bonus[i]));
  assert(vector.every(Number.isSafeInteger));return {body:s.soldierType,raw,bonus,vector};
 }
 function actions(p,mask){return [-1,...(byBody.get(p[0])||[]).filter(i=>mask&bits[i])];}
 function transition(p,i){
  const s=unpack(p);
  if(i===-1){
   const b=bodies.get(s.soldierType);assert(b);
   const raw=Object.fromEntries(STAT_KEYS.map(k=>[k,scalarGrowth(b,k,s.currentStats[k],data)]));
   return {kind:"OK",state:project({...s,currentStats:raw})};
  }
  const r=rules[i];assert(r);
  const q=applyTransformation(r,s,data,{mode:"current",researched:r.requires,disabled:[],baseFunctions:r.requiresBaseFunc||[],items:r.requiredItems||{},funds:Math.max(0,r.cost||0),commendations:{},statsKnown:true,medalsKnown:true});
  if(q.verdict.kind!=="eligible")return {kind:"GATE"};
  if(!q.state.exactStats||q.state.retired)return {kind:"OUTSIDE_MODEL"};
  return {kind:"OK",state:project(q.state)};
 }
 return {rules,bodies,byBody,bits,hs,active,available,bdd,reachable,initial,terminal,actions,transition};
}
const dominates=(a,b)=>a.every((n,i)=>n>=b[i]);
export function terminalFrontier(ids,nodes,model){
 // Exact reachable states remain untouched. Dominance only removes terminal
 // DISPLAY vectors within the same final body. Equality keeps one witness.
 const groups=new Map(),terminal=new Map();
 for(const id of ids){const t=model.terminal(nodes[id].state);terminal.set(id,t);const a=groups.get(t.body)||[];a.push(id);groups.set(t.body,a);}
 const result=[];
 for(const a of groups.values()){
  a.sort((i,j)=>terminal.get(j).vector.reduce((n,v)=>n+v,0)-terminal.get(i).vector.reduce((n,v)=>n+v,0)||i-j);
  const front=[];
  for(const id of a){const t=terminal.get(id);if(front.some(j=>dominates(terminal.get(j).vector,t.vector)))continue;front.push(id);}
  result.push(...front.map(id=>({id,...terminal.get(id)})));
 }
 return result;
}
// Independent structural closure audit. Every enabled action must have a
// cached outcome; every successful destination must be in the reachable set.
// A spanning parent tree must prove that every recorded state is reachable.
export function assertClosed(g,nodes,model){
 const index=new Map(g.ids.map((id,i)=>[id,i])),mask=BigInt("0x"+g.mask);
 assert.equal(index.size,g.ids.length);assert.equal(g.cursor,g.ids.length);
 for(let j=0;j<g.ids.length;j++){
  const id=g.ids[j],p=g.parents[j],n=nodes[id];assert(n);
  if(p===null)assert(g.roots.includes(id));
  else{const [parent,action]=p;assert(parent<j&&parent>=0);assert(model.actions(nodes[g.ids[parent]].state,mask).includes(action));assert.equal(nodes[g.ids[parent]].edges[String(action)],id);}
  for(const a of model.actions(n.state,mask)){
   assert(Object.hasOwn(n.edges,String(a)),"Missing edge");
   const to=n.edges[String(a)];
   assert(to===-1||to===-2||index.has(to),"Open successor");
  }
 }
 assert(g.roots.every(id=>index.has(id)));
}
