// Additive exploration evidence, not a canonical final admission ledger.
export const overcapSource={key:'overcap',label:'성장캡 초과 육성 재생',file:'soldier-overcap-expanded-lifecycle.json',projection:'soldier-overcap-unified-exploration.json'};
const valid=v=>Array.isArray(v)&&v.length===12&&v.every(Number.isSafeInteger);
export function projectOvercapExploration(modern,data){
 const metadata=modern.meta.source.metadataSha256;
 if(data.schema!=='ATLAS_OVERCAP_UNIFIED_EXPLORATION_V1'||data.sourceMetadataSha256!==metadata||data.sourceFile!==overcapSource.file||data.summary?.final!==0||data.rows?.length!==data.summary?.rows)throw Error('성장캡 원장 버전·정책 불일치');
 const profiles=new Set(modern.profiles.map(p=>p.id)),bodies=new Set(modern.soldiers.map(b=>b.id)),seen=new Set();
 return data.rows.map(r=>{
  if(!/^OVERCAP:[a-f0-9]{64}$/.test(r.id)||seen.has(r.id)||!profiles.has(r.origin)||!bodies.has(r.body)||r.finalAdmission!==false||r.commendationStatsIncluded!==false||r.sourceReplayVerified!==true||r.materialBudgetVerified!==false||r.branch!==null||r.capProjection!=='SCALAR_GROWTH_FROM_REPLAYED_ENDPOINT'||!valid(r.raw)||!valid(r.capRaw)||!valid(r.current)||!valid(r.cap)||!Array.isArray(r.order)||!Array.isArray(r.traits)||!Array.isArray(r.difficulties)||!r.hash)throw Error('성장캡 근거 오류: '+r.id);
  seen.add(r.id);
  return {...r,key:'overcap:'+r.id,source:'overcap',complete:false,certified:false,modelComplete:false,actualGameCertified:false,statPolicy:'CAREER_COMPARISON_NO_COMMENDATION_BONUS_V1',overcapEvidence:true};
 });
}
async function loadJson(file){const response=await fetch(new URL('./data/'+file,import.meta.url));if(!response.ok)throw Error('HTTP '+response.status);return response.json();}
const cache=new WeakMap();
export function loadOvercapRows(modern){
 if(!cache.has(modern))cache.set(modern,loadJson(overcapSource.projection).then(d=>projectOvercapExploration(modern,d)).catch(e=>{cache.delete(modern);throw e;}));
 return cache.get(modern);
}
let original;
export async function loadOvercapEvidence(modern,row){
 original??=loadJson(overcapSource.file).catch(e=>{original=null;throw e;});
 const d=await original;
 if(d.sourceMetadataSha256!==modern.meta.source.metadataSha256)throw Error('원본 버전 불일치');
 const r=d.results.find(x=>x.id===row.sourceRecordId);
 if(!r||r.origin!==row.origin||r.body!==row.body||JSON.stringify(r.effective)!==JSON.stringify(row.current)||r.commendationStatsIncluded!==false||r.finalAdmission!==false)throw Error('원본 경로 불일치');
 if(globalThis.crypto?.subtle){
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(r.actions))))].map(n=>n.toString(16).padStart(2,'0')).join('');
  if(hash!==row.hash)throw Error('원본 행동 지문 불일치');
 }
 return r;
}
