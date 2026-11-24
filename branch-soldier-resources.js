// Direct transformation resource ledger. No conversion of distinct items,
// medals or time into arbitrary scalar "cost", no inferred availability.
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const validNumber=n=>Number.isFinite(n);
const objectMap=o=>o!==null&&typeof o==="object"&&!Array.isArray(o);
export function summarizeRouteResources(w,ruleDetails){
 const out={actions:0,grossFees:0,credits:0,netFees:0,transferHours:0,recoveryDays:0,
  items:{},peakItems:{},medals:{},facilities:[],research:[],rankRequirements:[],
  complete:{actions:true,cash:true,transfer:true,recovery:true,items:true,medals:true,facilities:true,rank:true,research:true},unknownRules:[]};
 const fail=keys=>{for(const k of keys)out.complete[k]=false;};
 const facilities=new Set(),research=new Set();
 if(!Array.isArray(w?.steps)){fail(Object.keys(out.complete));return out;}
 for(let i=0;i<w.steps.length;i++){
  const s=w.steps[i],r=ruleDetails?.[s?.id],count=s?.count??1;
  if(!Number.isSafeInteger(count)||count<1){fail(Object.keys(out.complete));out.unknownRules.push(s?.id||"?");continue;}
  out.actions+=count;
  if(!r){fail(Object.keys(out.complete).filter(k=>k!=="actions"));out.unknownRules.push(s.id);continue;}
  if(validNumber(r.cost)){out.grossFees+=Math.max(0,r.cost)*count;out.credits+=Math.max(0,-r.cost)*count;}
  else fail(["cash"]);
  if(validNumber(r.transferTime)&&r.transferTime>=0)out.transferHours+=r.transferTime*count;
  else fail(["transfer"]);
  if(validNumber(r.recoveryTime)&&r.recoveryTime>=0)out.recoveryDays+=r.recoveryTime*count;
  else fail(["recovery"]);
  if(objectMap(r.requiredItems)){
   for(const [id,n] of Object.entries(r.requiredItems)){
    if(!Number.isSafeInteger(n)||n<0){fail(["items"]);continue;}
    if(!n)continue;
    out.items[id]=(out.items[id]||0)+n*count;
    out.peakItems[id]=Math.max(out.peakItems[id]||0,n);
   }
  }else fail(["items"]);
  if(objectMap(r.requiredCommendations)){
   for(const [id,n] of Object.entries(r.requiredCommendations)){
    if(!Number.isSafeInteger(n)||n<0){fail(["medals"]);continue;}
    out.medals[id]=own(out.medals,id)?Math.max(out.medals[id],n):n;
   }
  }else fail(["medals"]);
  if(Array.isArray(r.requiresBaseFunc))for(const f of r.requiresBaseFunc)facilities.add(f);
  else fail(["facilities"]);
  if(Array.isArray(r.requires))for(const id of r.requires)research.add(id);
  else fail(["research"]);
  if(Number.isSafeInteger(r.minRank)&&r.minRank>=0){
   if(r.minRank||r.resetRank||r.producedSoldierType)out.rankRequirements.push({step:i+1,ruleId:s.id,count,minRank:r.minRank,resetRank:!!r.resetRank,producedBody:r.producedSoldierType||null});
  }else fail(["rank"]);
 }
 out.netFees=out.grossFees-out.credits;
 out.facilities=[...facilities].sort();out.research=[...research].sort();
 return out;
}
export function parseResourceLimit(v){
 const text=String(v??"").trim();if(!text)return null;
 const n=Number(text);if(!Number.isSafeInteger(n)||n<0)throw Error("비용·기간·재료 제한은 0 이상의 정수여야 합니다.");
 return n;
}
export function hasResourceFilters(c){
 return Boolean(c&&(c.maxFees!=null||c.maxActions!=null||c.maxRecovery!=null||c.maxTransfer!=null||c.noMedals||c.noItems||c.noFacilities||c.itemId&&c.maxItem!=null||Object.keys(c.materialLimits||{}).length));
}
export function matchesResources(r,c){
 if(!c)return true;
 if(c.maxFees!=null&&(!r.complete.cash||r.grossFees>c.maxFees))return false;
 if(c.maxActions!=null&&(!r.complete.actions||r.actions>c.maxActions))return false;
 if(c.maxRecovery!=null&&(!r.complete.recovery||r.recoveryDays>c.maxRecovery))return false;
 if(c.maxTransfer!=null&&(!r.complete.transfer||r.transferHours>c.maxTransfer))return false;
 if(c.noMedals&&(!r.complete.medals||Object.keys(r.medals).length))return false;
 if(c.noItems&&(!r.complete.items||Object.keys(r.items).length))return false;
 if(c.noFacilities&&(!r.complete.facilities||r.facilities.length))return false;
 if(c.itemId&&c.maxItem!=null&&(!r.complete.items||(r.items[c.itemId]||0)>c.maxItem))return false;
 for(const [id,limit] of Object.entries(c.materialLimits||{}))if(!r.complete.items||(r.items[id]||0)>limit)return false;
 return true;
}
export function resourceSortValue(r,order){
 const field={fees:["cash","grossFees"],recovery:["recovery","recoveryDays"],transfer:["transfer","transferHours"],short:["actions","actions"]}[order];
 return field?(r.complete[field[0]]?r[field[1]]:Infinity):null;
}
