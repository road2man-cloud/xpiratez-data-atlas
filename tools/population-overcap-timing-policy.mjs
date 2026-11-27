// Timing scheduling only: no eligibility, material, research, or closure proof is granted.
export function createOvercapTimingPolicy(report){
 const map=new Map();
 for(const r of report.rows||[]){
  if(!(r.possibleExtra>0)||!r.body||!r.rule)continue;
  map.set(JSON.stringify([r.body,r.rule]),r);
 }
 const get=(body,rule)=>map.get(JSON.stringify([body,rule]))||null;
 function priority(body,rule){
  const r=get(body,rule);if(!r)return 1;
  const timing=r.gains.reduce((s,g)=>s+Math.max(0,g.timingGain??0),0);
  return 1+Math.min(.75,Math.max(r.extra,timing)/80);
 }
 function variants(body,rule,base,grown){
  const target=!!get(body,rule);
  return grown===base?[{node:base,timing:'CURRENT'}]:target?
   [{node:grown,timing:'GROW_THEN_TRAIN'},{node:base,timing:'TRAIN_WITHOUT_ADDED_GROWTH'}]:
   [{node:base,timing:'CURRENT'},{node:grown,timing:'GROW_THEN_TRAIN'}];
 }
 function compare(outcomes){
  const a=outcomes.find(x=>x.timing==='GROW_THEN_TRAIN'),b=outcomes.find(x=>x.timing==='TRAIN_WITHOUT_ADDED_GROWTH');
  if(!a||!b||a.band!==b.band||!Array.isArray(a.capRaw)||!Array.isArray(b.capRaw)||a.capRaw.length!==12||b.capRaw.length!==12)return null;
  const delta=a.capRaw.map((x,i)=>x-b.capRaw[i]);
  if(!delta.every(Number.isSafeInteger))return null;
  return {scope:'REPLAYED_SAME_RULE_SAME_ROLL_CAP_RAW',growFirstNode:a.to,trainFirstNode:b.to,delta,
    total:delta.reduce((s,v)=>s+v,0),distinct:a.stateHash!==b.stateHash,campaignVerified:false};
 }
 return {get,priority,variants,compare,summary:{bodies:new Set([...map.values()].map(r=>r.body)).size,pairs:map.size}};
}
