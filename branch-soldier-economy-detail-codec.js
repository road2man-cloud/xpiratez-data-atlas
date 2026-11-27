// Lossless JSON row dictionaries for the repeated economy/calendar traces.
// The archived record order, fields, values and hashes are unchanged on hydration.
const SCHEMA='ATLAS_ECONOMY_DETAIL_DICTIONARY_V1';
const fields={terminalEconomy:['cashLedger','events','monthly'],earlyEconomy:['cashLedger'],researchCalendar:['transactions','calendar','monthly'],codexSourcePrefixes:['suffix']};
const clone=v=>Array.isArray(v)?v.map(clone):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clone(x)])):v;
export function packEconomyDetails(db){
 const c=db.careerCompletion;if(!c)return db;
 for(const [name,keys] of Object.entries(fields)){
  const comp=c[name];if(!comp)continue;
  if(comp.detailCodec){if(comp.detailCodec.schema!==SCHEMA)throw Error('Unknown economy codec');continue;}
  const tables={};
  for(const field of keys){
   const table=[],seen=new Map(),updates=[];let oldSize=0,newSize=0;
   for(const rec of Object.values(comp.records||{})){
    if(!Array.isArray(rec[field]))continue;
    const ids=rec[field].map(row=>{const k=JSON.stringify(row);if(!seen.has(k)){seen.set(k,table.length);table.push(row);}return seen.get(k);});
    oldSize+=JSON.stringify(rec[field]).length;
    const ref={economyRowIds:ids};newSize+=JSON.stringify(ref).length;updates.push([rec,ref]);
   }
   newSize+=JSON.stringify(table).length+field.length+32;
   if(updates.length&&newSize<oldSize){tables[field]=table;for(const [r,ref] of updates)r[field]=ref;}
  }
  if(Object.keys(tables).length)comp.detailCodec={schema:SCHEMA,tables};
 }
 return db;
}
export function hydrateEconomyDetails(db){
 const c=db.careerCompletion;if(!c)return db;
 for(const [name,keys] of Object.entries(fields)){
  const comp=c[name],codec=comp?.detailCodec;if(!codec)continue;
  if(codec.schema!==SCHEMA||!codec.tables||Object.keys(codec.tables).some(k=>!keys.includes(k)))throw Error('Invalid economy codec');
  for(const [field,table] of Object.entries(codec.tables)){
   if(!Array.isArray(table))throw Error('Invalid economy row dictionary');
   for(const rec of Object.values(comp.records||{})){
    const ref=rec[field];if(ref==null)continue;
    if(!Array.isArray(ref.economyRowIds)||Object.keys(ref).length!==1)throw Error('Invalid economy row reference');
    rec[field]=ref.economyRowIds.map(i=>{if(!Number.isSafeInteger(i)||i<0||i>=table.length)throw Error('Invalid economy row index');return clone(table[i]);});
   }
  }
  delete comp.detailCodec;
 }
 return db;
}
