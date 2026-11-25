// Necessary research conditions, not a campaign witness or full SAT model.
// P(id): topic has ever been processed; A(id): ever usable (active).
// Disabled zero-cost queued projects may be processed without being active.
// All resources, lab durations, unknown grants, and event negative gates are
// relaxed. A branch commits to having its named topics processed. Only
// positive-cost commitments justify lifetime exclusion against active rivals;
// zero-cost commitments may have been processed after being disabled in a queue.
import assert from "node:assert/strict";
const arr=x=>Array.isArray(x)?x:[];
const uniq=x=>[...new Set(x)].sort();
export function createResearchConstraintModel(data){
 const rules=data.researchRules,ids=Object.keys(rules).sort(),idx=new Map(ids.map((id,i)=>[id,i]));
 const N=ids.length,P=id=>idx.has(id)?idx.get(id):-1,A=id=>idx.has(id)?N+idx.get(id):-1;
 const rev=new Set(Object.values(rules).flatMap(r=>arr(r.reenables)));
 const mutual=(a,b)=>a!==b&&!rev.has(a)&&!rev.has(b)&&arr(rules[a]?.disables).includes(b)&&arr(rules[b]?.disables).includes(a);
 const sameStage=(a,b)=>a!==b&&((!rev.has(b)&&arr(rules[a]?.disables).includes(b))||(!rev.has(a)&&arr(rules[b]?.disables).includes(a)));
 const alternatives=ids.map(()=>[]),unknownInputs=new Set();
 const add=(id,deps,kind,source=null)=>{
  if(!idx.has(id))return;
  const xs=[];for(const [mode,k] of deps){
   const v=mode==="A"?A(k):P(k);
   if(v<0){unknownInputs.add(k);continue;} // fail open for missing indexed flags.
   xs.push(v);
  }
  const ds=[...new Set(xs)].sort((a,b)=>a-b);
  alternatives[idx.get(id)].push({deps:ds,kind,source});
 };
 const asP=xs=>arr(xs).map(x=>["P",x]);
 const asA=xs=>arr(xs).map(x=>["A",x]);
 for(const [id,r] of Object.entries(rules)){
  const req=arr(r.requires),deps=arr(r.dependencies);
  // For cost zero we relax protected-source ordering and active-project
  // checks. For positive projects with requires, omit the manual route
  // exactly as the indexed lab eligibility code does.
  if(!Number.isFinite(r.cost)||r.cost<0)add(id,[],"unknown-lab");
  else if(r.cost===0||!req.length)add(id,asP([...req,...deps]),r.cost===0?"auto-relaxed":"lab-relaxed");
  for(const t of arr(r.unlocks)){
   const q=rules[t];if(!q)continue;
   if(q.cost===0||!arr(q.requires).length)add(t,asP([id,...arr(q.requires)]),"unlock-relaxed",id);
  }
  // A laboratory free reward may occur before the source completes. Do not
  // require P(source), and relax its protected guard as well.
  for(const t of arr(r.getOneFree))add(t,[],"free-before-source-relaxed",id);
  for(const [guard,targets] of Object.entries(r.getOneFreeProtected||{}))
   for(const t of typeof targets==="string"?[targets]:arr(targets))add(t,[],"protected-free-relaxed",id+"|"+guard);
  if(r.lookup&&r.lookup!==id)add(r.lookup,asP([id]),"lookup",id);
 }
 for(const [kind,index] of [["event",data.eventResearchSources],["mission",data.missionResearchSources]])
  for(const [id,sources] of Object.entries(index||{}))
   for(const source of arr(sources)){
    if(!arr(source.scripts).length){add(id,[],kind+"-unknown-script",source.event||source.deployment);continue;}
    for(const script of source.scripts)add(id,asA(script.researchPositive),kind+"-positive",script.script);
   }
 // Preserve explicit unknown acquisition methods: an indexed rule with
 // no known source is not proof of unattainability.
 for(let i=0;i<N;i++)if(!alternatives[i].length)add(ids[i],[],"unknown-source-relaxed");
 // Compile disjunctive acquisition clauses to a forward hyperedge program.
 // Each route is P(target) <- conjunction(P/A inputs).
 const edges=[],out=Array.from({length:2*N},()=>[]),roots=[];
 for(let i=0;i<N;i++)for(const a of alternatives[i]){
  const e=edges.length;edges.push({target:i,...a});
  if(!a.deps.length)roots.push(e);else for(const v of a.deps)out[v].push(e);
 }
 const metrics={runs:0,processedActivated:0,activeActivated:0,edgeVisits:0,cacheHits:0};
 const cache=new Map();
 function analyze(commitments){
  commitments=uniq(commitments);
  const forbidden=new Set(),conflicts={};
  for(const c of commitments)if(rules[c]?.cost>0)for(const x of arr(rules[c]?.disables))if(mutual(c,x)){
   forbidden.add(x);(conflicts[x]??=[]).push(c);
  }
  const key=JSON.stringify([...forbidden].sort());
  if(cache.has(key)){metrics.cacheHits++;return {...cache.get(key),conflicts};}
  metrics.runs++;
  const impossibleP=new Set([...forbidden].filter(id=>rules[id]?.cost>0));
  // Every non-zero-cost explicit completion is rejected if already
  // disabled. Zero-cost queued completion can still appear in discovered.
  // Re-enable targets are never lifetime-excluded.
  const yes=new Uint8Array(2*N),pending=Int32Array.from(edges,e=>e.deps.length),queue=[];
  const activate=v=>{if(v<0||yes[v])return;yes[v]=1;queue.push(v);};
  const grant=i=>{if(!impossibleP.has(ids[i]))activate(i);};
  for(const e of roots)grant(edges[e].target);
  for(let qi=0;qi<queue.length;qi++){
   const v=queue[qi];
   if(v<N){
    metrics.processedActivated++;
    if(!forbidden.has(ids[v])&&(!arr(rules[ids[v]].disables).includes(ids[v])||rev.has(ids[v])))activate(N+v);
   }else metrics.activeActivated++;
   for(const e of out[v]){metrics.edgeVisits++;if(--pending[e]===0)grant(edges[e].target);}
  }
  const isP=id=>P(id)<0||!!yes[P(id)],isA=id=>A(id)<0||!!yes[A(id)];
  const explain=id=>{
   if(isA(id))return null;
   if(forbidden.has(id))return {kind:"RECIPROCAL_PERMANENT_DISABLE",id};
   if(arr(rules[id]?.disables).includes(id)&&!rev.has(id))return {kind:"SELF_DISABLE",id};
   if(!idx.has(id))return null;
   return {kind:"NO_RELAXED_ACQUISITION_ROUTE",id,alternatives:alternatives[idx.get(id)].map(a=>({
    kind:a.kind,source:a.source,missing:a.deps.filter(v=>!yes[v]).map(v=>({mode:v<N?"P":"A",id:ids[v%N]}))
   }))};
  };
  const result={key,forbidden:[...forbidden].sort(),impossibleP:[...impossibleP].sort(),yes,isP,isA,explain};
  cache.set(key,result);return {...result,conflicts};
 }
 function actionPossible(r,x){
  return r.requires.every(k=>x.isA(k))&&!r.requires.some(a=>r.requires.some(b=>sameStage(a,b)));
 }
 return {ids,alternatives,edges,metrics,unknownInputs:[...unknownInputs].sort(),analyze,actionPossible,mutual,sameStage};
}
// Reduced ordered BDD over action-use subsets. A branch may use ANY
// subset of its allowed mask, except a pair with permanently exclusive
// research. This is a necessary relation, not sufficient for legal paths.
export function createActionSubsetBDD(rules,research){
 const W=rules.length,bits=rules.map((_,i)=>1n<<BigInt(i));
 const conflicts=rules.map((r,i)=>rules.reduce((m,t,j)=>i!==j&&r.requires.some(a=>t.requires.some(b=>research.mutual(a,b)))?m|bits[j]:m,0n));
 const nodes=[null,null],intern=new Map(),memo=new Map();
 function build(i,allowed){
  if(i===W)return 1;
  const remaining=allowed&~((1n<<BigInt(i))-1n),k=i+"|"+remaining.toString(16);
  if(memo.has(k))return memo.get(k);
  const lo=build(i+1,remaining),hi=(remaining&bits[i])?build(i+1,remaining&~conflicts[i]):0;
  let id=lo;
  if(lo!==hi){
   const sig=i+"|"+lo+"|"+hi;
   if(intern.has(sig))id=intern.get(sig);else{id=nodes.length;nodes.push([i,lo,hi]);intern.set(sig,id);}
  }
  memo.set(k,id);return id;
 }
 const accepts=(root,mask)=>{
  let n=root;while(n>1){const [i,l,h]=nodes[n];n=(mask&bits[i])?h:l;}return n===1;
 };
 const allowedMask=(rules,x)=>rules.reduce((m,r,i)=>research.actionPossible(r,x)?m|bits[i]:m,0n);
 return {nodes,conflicts,bits,build:mask=>build(0,mask),accepts,allowedMask};
}
