// Source-backed snapshot adapter for the campaign start gate.
// early is returned by loadEarlyEconomyRules; facilityRules is the merged Map.
export function buildCampaignStartSnapshot({early,facilityRules,difficulty,initialSoldiers,researched,disabled}){
 if(!early?.evidence?.fingerprint||!early.startBase||!early.startDate)throw Error('missing-source-evidence');
 if(!(facilityRules instanceof Map)||!Array.isArray(initialSoldiers)||!Array.isArray(researched)||!Array.isArray(disabled))throw Error('missing-initial-state-evidence');
 const base=early.startBase;
 if(!base.items||!Array.isArray(base.facilities))throw Error('missing-start-base-stock-or-layout');
 const count=typeof base.randomSoldiers==='number'?base.randomSoldiers:Object.values(base.randomSoldiers||{}).reduce((a,b)=>a+b,0);
 if(count>initialSoldiers.length)throw Error('starting-soldier-realization-unresolved');
 const functions=new Set(),facilities=[];
 for(const f of base.facilities){
  const rule=facilityRules.get(f.type);
  if(!rule)throw Error('missing-start-facility-rule:'+f.type);
  if(Number(f.buildTime||0)>0)continue;
  facilities.push(f.type);
  for(const k of rule.provideBaseFunc||[])functions.add(k);
 }
 for(const k of ['WELL','SHOP','ALKO','LAB','CPU'])if(!functions.has(k))throw Error('missing-expected-start-function:'+k);
 return {sourceFingerprint:early.evidence.fingerprint,items:{...base.items},facilities,
  functions:[...functions],funds:early.openingCash,difficulty,researched:[...researched],disabled:[...disabled],
  soldiers:structuredClone(initialSoldiers),startDate:structuredClone(early.startDate)};
}
