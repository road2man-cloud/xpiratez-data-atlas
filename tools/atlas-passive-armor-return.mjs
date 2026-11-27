// A passive stock counter is not a new source of scarce items. This quotient
// is ONLY for hypothetical fixed-research, same-body surgery/growth cycles.
// The actual replay world and material grant/consumption ledger stay intact.
export function passiveArmorReturns(data,materials){
 const consumers=new Set((data.transformations||[]).flatMap(r=>Object.keys(r.requiredItems||{})));
 const ordinary=new Set(),indexedFinite=new Map();
 for(const a of data.armorCatalog||[]){
  const k=a.storeItem;
  if(!k||k==='STR_NONE'||consumers.has(k))continue;
  const f=materials.finite.get(k);
  if(!f){ordinary.add(k);continue;}
  // Never abstract a confirmed hard limit, an unknown finite source, or a
  // finite item used by even one indexed transformation of any body.
  if(f.hard!==false||f.kind!=='INDEXED_FINITE_GRANT_POOL'||!Number.isSafeInteger(f.cap)||f.cap<=0||!f.grants?.length)continue;
  const v=indexedFinite.get(k)||{id:k,indexedGrantCap:f.cap,grantSources:f.grants,armorIds:[],researchReaders:Object.entries(data.researchRules||{}).filter(([id,r])=>r.needItem&&(r.neededItem||id)===k).map(([id])=>id).sort(),recruitReaders:(data.profiles||[]).filter(p=>Object.hasOwn(p.acquisitionRequiredItems||{},k)).map(p=>p.id).sort()};
  v.armorIds.push(a.id);indexedFinite.set(k,v);
 }
 return {ordinary,indexedFinite,all:new Set([...ordinary,...indexedFinite.keys()])};
}
export function passiveReturnDelta(k,before,after,returned,projection){
 return k===returned&&projection.all.has(k)&&Number.isSafeInteger(before)&&before>=0&&after===before+1;
}
