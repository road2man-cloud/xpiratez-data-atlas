// V130: goal-local heuristic only. All transitions remain governed by V129's source gates.
const arr=x=>Array.isArray(x)?x:[];
const cap=300;
const impossible=()=>({cost:cap,research:new Set(),items:new Map(),functions:new Set()});
const empty=()=>({cost:0,research:new Set(),items:new Map(),functions:new Set()});
const one=(id,cost=1)=>({cost,research:new Set([id]),items:new Map(),functions:new Set()});
function combine(...rows){
 const r=empty();
 for(const p of rows){r.cost=Math.min(cap,r.cost+p.cost);for(const k of p.research)r.research.add(k);for(const [k,v] of p.items)r.items.set(k,Math.max(v,r.items.get(k)||0));for(const k of p.functions)r.functions.add(k);}
 return r;
}
const choose=rows=>rows.length?rows.reduce((a,b)=>a.cost<=b.cost?a:b):impossible();
export function createGoalPlanner(data,targets,{purchaseVerdict,facilityMaterials}){
 const reverse=new Map(),free=new Map(),grants=new Map();
 const add=(m,k,v)=>{if(!m.has(k))m.set(k,[]);m.get(k).push(v);};
 for(const [id,r] of Object.entries(data.researchRules)){
  for(const k of arr(r.unlocks))add(reverse,k,id);
  for(const k of arr(r.getOneFree))add(free,k,{id});
  for(const [gate,ids] of Object.entries(r.getOneFreeProtected||{}))for(const k of arr(ids))add(free,k,{id,gate});
 }
 for(const [id,items] of Object.entries(data.campaignAssets.researchGrants||{}))for(const [k,n] of Object.entries(items))if(n>0)add(grants,k,{id,n});
 const cache=new WeakMap();
 function analyze(w,n,target){
  if(cache.get(w)?.has(target))return cache.get(w).get(target);
  let calls=0;
  const available=new Set(n.available),memo=new Map(),active=id=>w.researched.has(id)&&!w.disabled.has(id);
  function research(id,stack=new Set()){
   if(active(id))return empty();
   if(w.disabled.has(id)||!data.researchRules[id]||stack.has('r:'+id)||stack.size>9||++calls>1800)return impossible();
   if(available.has(id))return one(id);
   const key='r:'+id;if(memo.has(key))return memo.get(key);
   const s=new Set(stack).add(key),r=data.researchRules[id],options=[];
   if(r.cost>0&&!arr(r.requires).length){
    const deps=choose([combine(...arr(r.dependencies).filter(k=>!w.researched.has(k)).map(k=>research(k,s))),...arr(reverse.get(id)).map(k=>w.researched.has(k)?empty():research(k,s))]);
    const materials=r.needItem?item(r.neededItem||id,1,s):empty();
    const funcs=arr(r.requiresBaseFunc).map(k=>facility(k,s));
    options.push(combine(one(id),deps,materials,...funcs));
   }
   // Zero-cost topics may be automatically granted by a source. Never offer them as lab actions.
   if(r.cost===0)for(const k of arr(reverse.get(id)))options.push(combine({ ...empty(),cost:1 },research(k,s)));
   for(const f of arr(free.get(id))){
    const gate=f.gate?research(f.gate,s):empty();
    // Completed source can yield another award only if the common menu says repeat is available.
    const src=active(f.id)?(available.has(f.id)?one(f.id):impossible()):research(f.id,s);
    options.push(combine(src,gate,{...empty(),cost:1}));
   }
   // Event/capture routes outside the current adapter are intentionally not considered proven.
   let result=choose(options);
   if(result.cost>=cap&&r.cost>0&&!arr(r.requires).length){result=combine(one(id,25),...arr(r.dependencies).filter(k=>!w.researched.has(k)).slice(0,6).map(k=>research(k,s)),r.needItem?item(r.neededItem||id,1,s):empty());}
   memo.set(key,result);return result;
  }
  function item(id,count,stack){
   const missing=Math.max(0,count-(w.items[id]||0));if(!missing)return empty();
   const key='i:'+id+':'+missing;if(stack.has('i:'+id)||stack.size>9||++calls>1800)return impossible();if(memo.has(key))return memo.get(key);
   const s=new Set(stack).add('i:'+id),need={...empty(),cost:1,items:new Map([[id,missing]])},options=[],supply=data.itemSupply?.[id];
   try{purchaseVerdict(w,id,missing,data);options.push(need);}catch{}
   if(supply?.buyCost>0)options.push(combine(need,...arr(supply.buyRequires).map(k=>research(k,s)),...arr(supply.buyRequiresBaseFunc).map(k=>facility(k,s))));
   for(const r of arr(supply?.manufacture)){
    if(!r.id||r.weight!==undefined)continue;
    const mats=Object.entries(r.requiredItems||{}).map(([k,n])=>item(k,n,s));
    options.push(combine(need,...arr(r.requires).map(k=>research(k,s)),...arr(r.requiresBaseFunc).map(k=>facility(k,s)),...mats));
   }
   for(const g of arr(grants.get(id)))if(!active(g.id))options.push(combine(need,research(g.id,s)));
   const result=options.length?choose(options):{...need,cost:60};memo.set(key,result);return result;
  }
  function facility(id,stack){
   if(w.baseFunctions.has(id))return empty();
   const key='f:'+id;if(stack.has(key)||stack.size>9||++calls>1800)return impossible();if(memo.has(key))return memo.get(key);
   const s=new Set(stack).add(key),need={...empty(),cost:2,functions:new Set([id])},options=[];
   for(const [k,r] of Object.entries(data.campaignAssets.facilities)){
    if(w.facilities.has(k)||arr(r.buildOverFacilities).length||!arr(r.provideBaseFunc).includes(id))continue;
    let mats;try{mats=facilityMaterials(r);}catch{continue;}
    options.push(combine(need,...arr(r.requires).map(x=>research(x,s)),...arr(r.requiresBaseFunc).map(x=>facility(x,s)),...Object.entries(mats).map(([x,n])=>item(x,n,s))));
   }
   const result=options.length?choose(options):{...need,cost:60};memo.set(key,result);return result;
  }
  const plan=research(target);if(!cache.has(w))cache.set(w,new Map());cache.get(w).set(target,plan);return plan;
 }
 function supply(w,plan){
  const out=[];
  for(const [id,missing] of plan.items){
   try{purchaseVerdict(w,id,missing,data);out.push({type:'acquirePurchase',item:id,count:missing});}catch{}
   for(const r of arr(data.itemSupply?.[id]?.manufacture)){
    if(!r.id||r.weight!==undefined||!arr(r.requires).every(k=>w.researched.has(k)&&!w.disabled.has(k))||!arr(r.requiresBaseFunc).every(k=>w.baseFunctions.has(k)))continue;
    if(Object.entries(r.requiredItems||{}).every(([k,n])=>(w.items[k]||0)>=n))out.push({type:'manufacture',item:id,recipe:r.id,count:1});
   }
  }
  for(const [id,r] of Object.entries(data.campaignAssets.facilities)){
   if(w.facilities.has(id)||arr(r.buildOverFacilities).length||!arr(r.provideBaseFunc).some(k=>plan.functions.has(k)))continue;
   if(!arr(r.requires).every(k=>w.researched.has(k)&&!w.disabled.has(k))||!arr(r.requiresBaseFunc).every(k=>w.baseFunctions.has(k)))continue;
   try{if(Object.entries(facilityMaterials(r)).every(([k,n])=>(w.items[k]||0)>=n))out.push({type:'acquireFacility',id});}catch{}
  }
  return out;
 }
 return {analyze,supply};
}
