// Cost-aware ranking only. Historical failures never establish impossibility.
// Use a fixed per-batch model so priority heaps remain valid. New measured
// observations are persisted in the ordinary attempt records for next batch.
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const key=(...v)=>JSON.stringify(v);
const fresh=()=>({n:0,success:0,timed:0,ms:0,gain:0});
export function createCareerProductivity({records,graphs,weight=24}){
 const global=new Map(),byRule=new Map(),byBodyRule=new Map();
 const metrics={schema:"EMPIRICAL_GAIN_PER_REPLAY_COST_V1",historical:0,historicalReady:0,historicalResearch:0,historicalUnknown:0,historicalTimed:0,candidates:0,selected:0,readySelected:0,measured:0,productive:0,newStates:0,elapsedMs:0,readyMs:0,researchMs:0,readyMeasured:0,researchMeasured:0,estimatedMs:0,capGain:0,templateRepairs:0,perMode:{}};
 const cache=new WeakMap(),group=(m,k)=>{let a=m.get(k);if(!a){a=fresh();m.set(k,a);}return a;};
 const usable=r=>typeof r?.status==="string"&&r.status!=="HISTORY_GATE"&&r.status!=="TARGET_INACTIVE";
 function add(a,r){
  const rows=(r.outcomes||[]).filter(e=>e.status==="CONDITIONAL_REPLAY"),ok=rows.length>0;
  a.n++;a.success+=Number(ok);a.gain+=Math.max(0,...rows.map(e=>Number(e.capTotalDelta)||0));
  if(Number.isFinite(r.elapsedMs)&&r.elapsedMs>=0){a.timed++;a.ms+=clamp(r.elapsedMs,10,30000);}
 }
 for(const r of Object.values(records)){
  if(!usable(r))continue;
  const body=graphs[r.graph]?.nodes[r.node]?.body,mode=r.alreadyActive===true?"ready":r.alreadyActive===false?"research":"unknown";
  metrics.historical++;metrics["historical"+mode[0].toUpperCase()+mode.slice(1)]++;metrics.historicalTimed+=Number(Number.isFinite(r.elapsedMs));
  add(group(global,mode),r);add(group(byRule,key(r.action,mode)),r);if(body)add(group(byBodyRule,key(body,r.action,mode)),r);
 }
 const prior=(mode)=>({ready:{p:.60,ms:350},research:{p:.34,ms:2100},unknown:{p:.40,ms:1350}}[mode]);
 function smooth(a,p,strength){
  return {p:(a.success+strength*p.p)/(a.n+strength),ms:(a.ms+strength*p.ms)/(a.timed+strength)};
 }
 function estimate(x,{ready=false,templateCount=0}={}){
  if(cache.has(x))return cache.get(x);
  const mode=ready||!x.r.requires.length?"ready":"research",root=smooth(global.get(mode)||fresh(),prior(mode),12),r=smooth(byRule.get(key(x.r.id,mode))||fresh(),root,8),body=smooth(byBodyRule.get(key(x.n.body,x.r.id,mode))||fresh(),r,5);
  const predictedMs=clamp(body.ms*(mode==="research"&&templateCount>0?.80:1),75,15000);
  const gain=Math.max(1,Number(x.capGain)||0),yieldHint=1+Math.min(2,Math.log1p(gain)/3);
  // Bounded adjustment to the existing numerical/material potential.
  // Do not change the numerical proof threshold or candidate eligibility.
  const throughput=body.p*yieldHint/(predictedMs/1000);
  const adjustment=clamp(weight*Math.log2(Math.max(.015,throughput)/.45)/3,-weight,weight);
  const result={mode,p:body.p,predictedMs,adjustment,estimatedGain:gain,templateCount};
  cache.set(x,result);metrics.candidates++;return result;
 }
 function select(x,estimateResult){
  const a=estimateResult||estimate(x);metrics.selected++;metrics.readySelected+=Number(a.mode==="ready");metrics.estimatedMs+=a.predictedMs;
  return {mode:a.mode,successEstimate:a.p,predictedMs:Math.round(a.predictedMs),adjustment:a.adjustment,estimatedGain:a.estimatedGain};
 }
 function observe(rec,ms){
  if(!rec)return;
  rec.elapsedMs=Math.round(ms);
  const mode=rec.alreadyActive===true?"ready":rec.alreadyActive===false?"research":"unknown",rows=(rec.outcomes||[]).filter(e=>e.status==="CONDITIONAL_REPLAY"),gain=Math.max(0,...rows.map(e=>Number(e.capTotalDelta)||0));
  metrics.measured++;metrics.elapsedMs+=ms;metrics.productive+=Number(rows.length>0);metrics.newStates+=rows.length;metrics.capGain+=gain;
  if(mode==="ready"){metrics.readyMeasured++;metrics.readyMs+=ms;}if(mode==="research"){metrics.researchMeasured++;metrics.researchMs+=ms;}
  const a=metrics.perMode[mode]??={attempts:0,productive:0,states:0,elapsedMs:0};a.attempts++;a.productive+=Number(rows.length>0);a.states+=rows.length;a.elapsedMs+=ms;
 }
 return {estimate,select,observe,metrics};
}
