// Lossless dictionary of repeated diagnostic evidence in nonfinal witnesses.
// Open-rule arrays and certified final proofs keep their existing shape;
// the old production readers can continue to consume them directly.
export const INVENTORY_CODEC="BODY_SCOPE_NONFINAL_INVENTORY_V1";
const fields=["blocked","alternativeObjectives","repeatProofs","exampleResearch"];
export function packBodyScopeInventory(witnesses){
 const entries=[],index=new Map();let packed=0;
 for(const v of Object.values(witnesses)){
  if(v.certificate)continue;
  const refs={};
  for(const field of fields){
   if(!Array.isArray(v[field]))continue;
   refs[field]=v[field].map(value=>{
    const k=JSON.stringify(value);
    if(!index.has(k)){index.set(k,entries.length);entries.push(value);}
    return index.get(k);
   });
   delete v[field];
  }
  if(Object.keys(refs).length){v.inventoryRefs=refs;packed++;}
 }
 return {schema:INVENTORY_CODEC,entries,packedWitnesses:packed};
}
export function unpackBodyScopeWitness(witness,inventory){
 if(!witness?.inventoryRefs)return witness;
 if(inventory?.schema!==INVENTORY_CODEC||!Array.isArray(inventory.entries))throw Error("Unknown body scope inventory codec");
 const out={...witness};delete out.inventoryRefs;
 for(const [field,ids] of Object.entries(witness.inventoryRefs)){
  if(!fields.includes(field)||!Array.isArray(ids))throw Error("Invalid scope evidence field");
  out[field]=ids.map(i=>{
   if(!Number.isSafeInteger(i)||i<0||i>=inventory.entries.length)throw Error("Invalid scope evidence index");
   return inventory.entries[i];
  });
 }
 return out;
}
