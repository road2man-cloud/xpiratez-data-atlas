// Store equal sections or equal immediate subfields once. A partial
// attachment may retain older completion metadata; never alias unequal
// values. Readers restore exact original key order and fail on stale refs.
const V1="ATLAS_SHARED_CAREER_SECTIONS_V1",V2="ATLAS_SHARED_CAREER_SECTIONS_V2";
const FIELDS=["terminalResearch","traitChain"];
const own=(o,k)=>Object.hasOwn(o,k);
const object=o=>o&&typeof o==="object"&&!Array.isArray(o);
const equal=(a,b)=>a===b||JSON.stringify(a)===JSON.stringify(b);
const unique=a=>Array.isArray(a)&&new Set(a).size===a.length;
export function hydrateSharedCareerSections(db){
 const c=db?.careerCompletion,refs=c?.sharedLedgerRefs;
 if(!refs)return db;
 const ledger=db.populationMissingOriginCareer;
 const invalid=()=>{throw Error("Invalid shared career section reference");};
 if(!ledger||refs.sourceGraphSha256!==ledger.sourceGraphSha256)invalid();
 if(refs.schema===V1){
  if(!unique(refs.fields)||!refs.fields.every(k=>FIELDS.includes(k)&&own(ledger,k)&&!own(c,k)))invalid();
  for(const k of refs.fields)c[k]=ledger[k];
 }else if(refs.schema===V2){
  if(!Array.isArray(refs.sections)||!unique(refs.sections.map(r=>r.field)))invalid();
  for(const r of refs.sections){
   const k=r.field;if(!FIELDS.includes(k)||!own(ledger,k))invalid();
   if(r.whole===true){if(own(c,k))invalid();c[k]=ledger[k];continue;}
   const source=ledger[k],local=c[k];
   if(!object(source)||!object(local)||!unique(r.keys)||!unique(r.order)||!r.keys.length||!r.keys.every(x=>own(source,x)&&!own(local,x)&&r.order.includes(x))||!Object.keys(local).every(x=>r.order.includes(x))||r.order.length!==Object.keys(local).length+r.keys.length)invalid();
   const shared=new Set(r.keys);
   c[k]=Object.fromEntries(r.order.map(x=>[x,shared.has(x)?source[x]:local[x]]));
  }
 }else invalid();
 delete c.sharedLedgerRefs;
 return db;
}
export function packSharedCareerSections(db){
 const c=db?.careerCompletion,ledger=db?.populationMissingOriginCareer;
 if(!c||!ledger)return db;
 if(c.sharedLedgerRefs)hydrateSharedCareerSections(db);
 const sections=[];
 for(const field of FIELDS){
  if(!own(c,field)||!own(ledger,field))continue;
  const a=c[field],b=ledger[field];
  if(equal(a,b)){delete c[field];sections.push({field,whole:true});continue;}
  if(!object(a)||!object(b))continue;
  const order=Object.keys(a),keys=order.filter(k=>own(b,k)&&equal(a[k],b[k])&&JSON.stringify(a[k]).length>128);
  if(!keys.length)continue;
  const shared=new Set(keys);c[field]=Object.fromEntries(Object.entries(a).filter(([k])=>!shared.has(k)));
  sections.push({field,keys,order});
 }
 if(sections.length){
  if(typeof ledger.sourceGraphSha256!=="string"||!ledger.sourceGraphSha256)throw Error("Missing shared ledger identity");
  c.sharedLedgerRefs={schema:V2,sourceGraphSha256:ledger.sourceGraphSha256,sections};
 }
 return db;
}
