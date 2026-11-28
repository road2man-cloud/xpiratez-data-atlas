// Adapter for loadSupplyRules: preserve source-backed construction and research rewards.
export function campaignAssetsFromSupply(index){
 if(!index?.evidence?.fingerprint||!(index.facilities instanceof Map)||!(index.grants instanceof Map))throw Error('missing-source-supply-index');
 const researchGrants={};
 for(const [asset,grants] of index.grants){
  if(!asset.startsWith('ITEM:'))continue;
  for(const g of grants){
   if(!Number.isSafeInteger(g.count)||g.count<1)throw Error('invalid-grant-count:'+asset);
   const row=researchGrants[g.research]??={};
   row[asset.slice(5)]=g.count;
  }
 }
 return {sourceFingerprint:index.evidence.fingerprint,facilities:Object.fromEntries(index.facilities),researchGrants};
}
