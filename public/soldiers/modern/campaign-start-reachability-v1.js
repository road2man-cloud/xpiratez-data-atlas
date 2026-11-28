// Research-path policy: eligibility and scarce quantities, not an economy simulator.
const arr=x=>Array.isArray(x)?x:[];
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
const positive=n=>Number.isSafeInteger(n)&&n>0;
export function purchaseRequirements(data,id){
 const raw=data.campaignAssets?.items?.[id],s=data.itemSupply?.[id];
 if(raw){
  if(!(raw.costBuy>0))return null;
  return {research:[...new Set([...arr(raw.requires),...arr(raw.requiresBuy)])],
   functions:arr(raw.requiresBuyBaseFunc),country:raw.requiresBuyCountry,
   advanced:raw.buyRequirements,limit:raw.monthlyBuyLimit??0,script:raw.script||raw.scripts};
 }
 if(!s||!(s.buyCost>0))return null;
 return {research:[...new Set([...arr(s.generalRequires),...arr(s.buyRequires)])],
  functions:arr(s.buyRequiresBaseFunc),country:s.buyRequiresCountry,
  advanced:s.buyRequirements,limit:s.monthlyBuyLimit,script:s.script||s.scripts};
}
export function purchaseVerdict(w,id,count,data){
 const r=purchaseRequirements(data,id);
 if(!r||!positive(count))throw Error('purchase-unavailable:'+id);
 if(!r.research.every(k=>active(w,k))||!r.functions.every(k=>w.baseFunctions.has(k)))throw Error('purchase-gate:'+id);
 if(r.country&&!(w.countries instanceof Set&&w.countries.has(r.country)))throw Error('purchase-country-unresolved:'+id);
 if(r.advanced&&(typeof r.advanced!=='object'||Object.keys(r.advanced).length)||r.script)throw Error('purchase-special-rule-unresolved:'+id);
 if(!Number.isSafeInteger(r.limit)||r.limit<0)throw Error('purchase-limit-unknown:'+id);
 const used=w.purchaseCounts?.[w.month]?.[id]||0;
 if(r.limit&&used+count>r.limit)throw Error('monthly-purchase-limit:'+id);
 return r;
}
export function applyReachabilityAction(input,step,data){
 const w=structuredClone(input);
 if(step.type==='acquirePurchase'){
  purchaseVerdict(w,step.item,step.count,data);
  const month=(w.purchaseCounts??={})[w.month]??={};
  month[step.item]=(month[step.item]||0)+step.count;
  w.items[step.item]=(w.items[step.item]||0)+step.count;
  return {ok:true,world:w,assumed:true,notes:['eligible-purchase:'+step.item+' x'+step.count,'price-and-transfer-not-modeled']};
 }
 if(step.type==='acquireFacility'){
  const r=data.campaignAssets?.facilities?.[step.id];
  if(!r||arr(r.buildOverFacilities).length)throw Error('facility-rule-unresolved:'+step.id);
  if(!arr(r.requires).every(k=>active(w,k))||arr(r.requires).includes('STR_UNAVAILABLE'))throw Error('facility-research-gate:'+step.id);
  if(!arr(r.requiresBaseFunc).every(k=>w.baseFunctions.has(k)))throw Error('facility-function-gate:'+step.id);
  if(arr(r.forbiddenBaseFunc).some(k=>w.baseFunctions.has(k)))throw Error('facility-forbidden-function:'+step.id);
  for(const id of w.facilities)if(arr(data.campaignAssets.facilities[id]?.forbiddenBaseFunc).some(k=>arr(r.provideBaseFunc).includes(k)))throw Error('existing-facility-conflict:'+id);
  if(w.facilities.has(step.id))throw Error('facility-already-available:'+step.id);
  for(const [id,raw] of Object.entries(r.buildCostItems||{})){
   const n=raw&&typeof raw==='object'?raw.build??0:raw;
   if(!Number.isSafeInteger(n)||n<0||(w.items[id]||0)<n)throw Error('facility-material-gate:'+id);
   w.items[id]=(w.items[id]||0)-n;
  }
  w.facilities.add(step.id);
  if(w.globalFacilities instanceof Set)w.globalFacilities.add(step.id);
  for(const f of arr(r.provideBaseFunc))w.baseFunctions.add(f);
  return {ok:true,world:w,assumed:true,notes:['eligible-facility:'+step.id,'layout-cost-build-time-not-modeled']};
 }
 throw Error('unsupported-reachability-action');
}
