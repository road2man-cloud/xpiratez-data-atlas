// Empirical scheduling only: chronological graph edges are observations,
 // not globally valid effects, dominance proofs or closure certificates.
const key=(...xs)=>JSON.stringify(xs);
const finiteVec=x=>Array.isArray(x)&&x.length===12&&x.every(Number.isFinite);
const capped=n=>finiteVec(n.raw)&&finiteVec(n.capRaw)&&n.raw.every((v,i)=>v===n.capRaw[i]);
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
export function createSuccessorEffectPriority({graphs,historyIndex}){
 const local=new Map(),broad=new Map(),seen=new WeakMap();
 const metrics={samples:0,positive:0,negative:0,mixed:0,neutral:0,unknown:0,liveSamples:0,groups:0};
 function update(table,k,e){
  const a=table.get(k)||{n:0,score:0,positive:0,negative:0,mixed:0,neutral:0};
  a.n++;a.score+=e.score;a[e.classification]++;table.set(k,a);
 }
 function record(g,i,live=false){
  let visited=seen.get(g);if(!visited){visited=new Set();seen.set(g,visited);}
  if(visited.has(i))return null;visited.add(i);
  const n=g.nodes[i],p=g.nodes[n?.parent];
  if(!n||!p||!Array.isArray(n.steps))return null;
  // Separate surgery-only endpoints from growth, promotions, research or
  // multiple surgeries so their gains are never attributed to one rule.
  const transforms=n.steps.filter(a=>a.type==="transform"&&a.soldier==="origin");
  if(transforms.length!==1||n.steps.some(a=>a.type!=="transform"&&a.type!=="externalInputs")||n.steps.some(a=>a.type==="transform"&&a.soldier!=="origin"))return null;
  const a=transforms[0],h=historyIndex?.history(g,n.parent);
  if(!(h instanceof Set)||![p.permanentVector,n.permanentVector,p.permanentCapVector,n.permanentCapVector].every(finiteVec)){metrics.unknown++;return null;}
  const repeat=h.has(a.transform),atCap=capped(p),immediate=n.permanentVector.map((v,j)=>v-p.permanentVector[j]),cap=n.permanentCapVector.map((v,j)=>v-p.permanentCapVector[j]);
  const traitsBefore=new Set(p.traits||[]),traitsAfter=new Set(n.traits||[]),gained=[...traitsAfter].filter(t=>!traitsBefore.has(t)),lost=[...traitsBefore].filter(t=>!traitsAfter.has(t));
  const sum=(v,positive)=>v.reduce((s,x)=>s+(positive?Math.max(0,x):Math.max(0,-x)),0);
  const gains=sum(cap,true),losses=sum(cap,false),nowGains=sum(immediate,true),nowLosses=sum(immediate,false);
  const positive=gains>0||nowGains>0,negative=losses>0||nowLosses>0;
  const classification=positive?(negative?"mixed":"positive"):negative?"negative":"neutral";
  // Transparent heuristic, not a player utility function: cap and current
  // stats stay separate; traits count as novelty, not inherently good.
  const score=clamp((gains-losses)/40+(nowGains-nowLosses)/80,-3,3);
  const effect={policy:"OBSERVED_PERMANENT_EFFECT_V1",sourceHash:p.stateHash,targetHash:n.stateHash,body:p.body,destination:n.body,action:a.transform,repeat,atCap,immediate,cap,gains,losses,nowGains,nowLosses,gained,lost,classification,score,closureCertified:false};
  update(local,key(p.body,a.transform,repeat,atCap),effect);update(broad,key(p.body,a.transform,repeat),effect);
  metrics.samples++;metrics[classification]++;if(live)metrics.liveSamples++;metrics.groups=local.size;
  return effect;
 }
 for(const g of Object.values(graphs))if(!g.blocker)for(let i=1;i<g.nodes.length;i++)record(g,i);
 function estimate(n,action,repeat){
  if(typeof repeat!=="boolean")return {samples:0,localSamples:0,score:0,factor:1};
  const b=broad.get(key(n.body,action,repeat)),a=local.get(key(n.body,action,repeat,capped(n)));
  // Shrink estimates toward zero. Unknown/rare observations remain open.
  const prior=(b?.score||0)/(4+(b?.n||0)),score=a?(a.score+3*prior)/(a.n+3):prior;
  return {samples:b?.n||0,localSamples:a?.n||0,score,factor:clamp(1+score*0.45,0.35,2.35)};
 }
 return {record,estimate,metrics};
}
