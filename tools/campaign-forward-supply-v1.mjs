// Bounded recursive supply candidates. Only emit currently executable single
// actions; no hypothetical stock, funds, or research is injected into the graph.
import {purchaseVerdict} from '../public/soldiers/modern/campaign-start-reachability-v1.js';
export function createSupplyPlanner(recipes,data,targets,{maxMaterialDepth=6}={}){
 const byId=new Map(recipes),byOutput=new Map();
 if(!Number.isInteger(maxMaterialDepth)||maxMaterialDepth<1||maxMaterialDepth>12)throw Error('invalid-supply-depth');
 for(const [id,r] of recipes)for(const item of Object.keys(r.outputs)){
  if(!byOutput.has(item))byOutput.set(item,[]);
  byOutput.get(item).push(id);
 }
 for(const id of targets)if(!byId.has(id))throw Error('unknown-supply-target:'+id);
 return function candidates(w){
  const actions=new Map();
  const add=a=>actions.set(JSON.stringify(a),a);
  const eligible=r=>r.requires.every(k=>w.researched.has(k)&&!w.disabled.has(k))&&r.functions.every(k=>w.baseFunctions.has(k))&&w.funds>=r.cost;
  function recipe(id,path,depth){
   if(depth>maxMaterialDepth||path.has(id)||w.forwardManufactureCounts?.[id])return;
   const r=byId.get(id);
   if(!r||!eligible(r))return;
   const missing=Object.entries(r.materials).filter(([k,n])=>(w.items[k]||0)<n);
   if(!missing.length){add({type:'manufactureBundle',recipe:id,count:1});return;}
   const next=new Set([...path,id]);
   for(const [item,qty] of missing){
    const count=qty-(w.items[item]||0);
    const raw=data.campaignAssets?.items?.[item];
    if(Number.isSafeInteger(raw?.costBuy)&&raw.costBuy>0&&Number.isSafeInteger(raw.costBuy*count)&&raw.costBuy*count<=w.funds){
     try{purchaseVerdict(w,item,count,data);add({type:'acquireFundedPurchase',item,count});}catch{}
    }
    for(const producer of byOutput.get(item)||[])recipe(producer,next,depth+1);
   }
  }
  for(const id of targets)recipe(id,new Set(),0);
  return [...actions.values()];
 };
}
