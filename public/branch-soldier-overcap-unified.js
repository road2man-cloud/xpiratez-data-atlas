// Additive exploration evidence, not a canonical final admission ledger.
import {expandOvercapSuccessor} from './branch-soldier-overcap-successor-core.js?v=1';
export const overcapSource={key:'overcap',label:'성장캡 초과 육성 재생',file:'soldier-overcap-expanded-lifecycle.json',projection:'soldier-overcap-unified-exploration.json',material:'soldier-overcap-material-ledger.json'};
export const overcapSuccessorSource={key:'overcap',label:'성장캡 초과 후속 육성',file:'soldier-overcap-direct-successors.json',projection:'soldier-overcap-successor-unified-exploration.json',material:'soldier-overcap-successor-material-ledger.json'};
const valid=v=>Array.isArray(v)&&v.length===12&&v.every(Number.isSafeInteger);
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const count=v=>Number.isSafeInteger(v)&&v>=0;
const statuses=new Set(['HARD_FINITE_CAP_EXCEEDED','INDEXED_FINITE_CAP_REVIEW','FINITE_SOURCE_CONDITIONAL','SOURCE_UNRESOLVED','ORDINARY_ACQUISITION_CONDITIONAL']);
function validMaterial(m){
 return m&&statuses.has(m.status)&&hex(m.hash)&&count(m.unresolvedCount)&&count(m.unresolvedBirthOrTraining)&&m.unresolvedBirthOrTraining<=m.unresolvedCount&&count(m.finiteReviewCount)&&Array.isArray(m.finiteInputs)&&m.finiteInputs.every(x=>typeof x.id==='string'&&typeof x.name==='string'&&count(x.cap)&&count(x.external)&&count(x.gross)&&count(x.unbackedExternalUnits)&&typeof x.hardCap==='boolean')&&m.funds&&['external','birth','training'].every(k=>Number.isSafeInteger(m.funds[k]));
}
export function projectOvercapExploration(modern,data,source=overcapSource){
 const metadata=modern.meta.source.metadataSha256,successor=source===overcapSuccessorSource;
 if(data.schema!=='ATLAS_OVERCAP_UNIFIED_EXPLORATION_V2'||data.sourceMetadataSha256!==metadata||data.sourceFile!==source.file||data.materialSourceFile!==source.material||successor&&!hex(data.baseSourceHash)||!hex(data.sourceHash)||!hex(data.materialSourceHash)||data.summary?.final!==0||data.rows?.length!==data.summary?.rows||data.summary?.materialLinked!==data.rows.length)throw Error('성장캡 원장 버전·정책 불일치');
 const profiles=new Set(modern.profiles.map(p=>p.id)),bodies=new Set(modern.soldiers.map(b=>b.id)),seen=new Set(),sourceIds=new Set();
 return data.rows.map(r=>{
  if(!/^OVERCAP:[a-f0-9]{64}$/.test(r.id)||seen.has(r.id)||typeof r.sourceRecordId!=='string'||sourceIds.has(r.sourceRecordId)||!profiles.has(r.origin)||!bodies.has(r.body)||r.finalAdmission!==false||r.commendationStatsIncluded!==false||r.sourceReplayVerified!==true||r.materialBudgetVerified!==false||r.branch!==null||r.capProjection!=='SCALAR_GROWTH_FROM_REPLAYED_ENDPOINT'||!valid(r.raw)||!valid(r.capRaw)||!valid(r.current)||!valid(r.cap)||!Array.isArray(r.order)||!Array.isArray(r.traits)||!Array.isArray(r.difficulties)||!hex(r.hash)||!validMaterial(r.materialEvidence))throw Error('성장캡 근거 오류: '+r.id);
  if(successor?!(r.successorEvidence===true&&typeof r.parentRecordId==='string'&&count(r.capGain)&&Array.isArray(r.fullyActiveBranchCandidates)):r.successorEvidence)throw Error('후속 육성 근거 오류: '+r.id);
  seen.add(r.id);sourceIds.add(r.sourceRecordId);
  return {...r,key:'overcap:'+r.id,source:'overcap',complete:false,certified:false,modelComplete:false,actualGameCertified:false,statPolicy:'CAREER_COMPARISON_NO_COMMENDATION_BONUS_V1',overcapEvidence:true,materialSourceHash:data.materialSourceHash,lifecycleSourceHash:data.sourceHash,sourceLedgerHash:data.sourceLedgerHash,...(successor?{baseSourceHash:data.baseSourceHash}:{})};
 });
}
async function loadJson(file){const response=await fetch(new URL('./data/'+file,import.meta.url));if(!response.ok)throw Error('HTTP '+response.status);return response.json();}
async function digest(value){
 if(!globalThis.crypto?.subtle)return null;
 return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
const cache=new WeakMap();
export function loadOvercapRows(modern){
 if(!cache.has(modern))cache.set(modern,loadJson(overcapSource.projection).then(d=>projectOvercapExploration(modern,d)).catch(e=>{cache.delete(modern);throw e;}));
 return cache.get(modern);
}
const successorCache=new WeakMap();
export function loadOvercapSuccessorRows(modern){
 if(!successorCache.has(modern))successorCache.set(modern,loadJson(overcapSuccessorSource.projection).then(d=>projectOvercapExploration(modern,d,overcapSuccessorSource)).catch(e=>{successorCache.delete(modern);throw e;}));
 return successorCache.get(modern);
}
let original,successors;
const materialCache=new Map();
async function baseArchive(){
 original??=loadJson(overcapSource.file).then(async d=>({data:d,hash:await digest(d),rows:new Map(d.results.map(r=>[r.id,r]))})).catch(e=>{original=null;throw e;});
 return original;
}
async function successorArchive(){
 successors??=loadJson(overcapSuccessorSource.file).then(async d=>({data:d,hash:await digest(d),rows:new Map(d.rows.map(r=>[r.id,r]))})).catch(e=>{successors=null;throw e;});
 return successors;
}
export async function loadOvercapEvidence(modern,row){
 const base=await baseArchive(),src=row.successorEvidence?await successorArchive():base,d=src.data;
 if(d.sourceMetadataSha256!==modern.meta.source.metadataSha256||d.sourceLedgerHash!==row.sourceLedgerHash||src.hash&&src.hash!==row.lifecycleSourceHash)throw Error('원본 버전 불일치');
 let r=src.rows.get(row.sourceRecordId);
 if(row.successorEvidence){
  if(!r||r.sourceRecordId!==row.parentRecordId||d.sourceHash!==row.baseSourceHash||base.hash&&base.hash!==row.baseSourceHash||d.schema!=='ATLAS_OVERCAP_DIRECT_SUCCESSOR_LEDGER_V1')throw Error('후속 원본 버전 불일치');
  r=expandOvercapSuccessor(base.rows.get(row.parentRecordId),r);
 }
 if(!r||r.origin!==row.origin||r.body!==row.body||JSON.stringify(r.effective)!==JSON.stringify(row.current)||r.commendationStatsIncluded!==false||r.finalAdmission!==false)throw Error('원본 경로 불일치');
 const hash=await digest(r.actions);if(hash&&hash!==row.hash)throw Error('원본 행동 지문 불일치');
 return r;
}
export async function loadOvercapMaterial(modern,row){
 const file=row.successorEvidence?overcapSuccessorSource.material:overcapSource.material;
 if(!materialCache.has(file))materialCache.set(file,loadJson(file).then(async d=>({data:d,hash:await digest(d),rows:new Map(d.rows.map(r=>[r.id,r]))})).catch(e=>{materialCache.delete(file);throw e;}));
 const {data:d,hash,rows}=await materialCache.get(file);
 if(d.schema!=='ATLAS_OVERCAP_MATERIAL_LEDGER_V1'||d.sourceMetadataSha256!==modern.meta.source.metadataSha256||d.sourceLedgerHash!==row.sourceLedgerHash||d.inputs?.lifecycle?.canonicalJsonSha256!==row.lifecycleSourceHash||row.successorEvidence&&d.inputs?.baseLifecycle?.canonicalJsonSha256!==row.baseSourceHash||hash&&hash!==row.materialSourceHash)throw Error('재료 원장 버전 불일치');
 const r=rows.get(row.sourceRecordId);
 if(!r||r.origin!==row.origin||r.body!==row.body||r.difficulty!==row.difficulties[0]||r.status!==row.materialEvidence.status||r.materialBudgetVerified!==false||r.finalAdmission!==false)throw Error('재료 경로 불일치');
 const rowHash=await digest(r);if(rowHash&&rowHash!==row.materialEvidence.hash)throw Error('재료 경로 지문 불일치');
 return {row:r,catalog:d.catalog};
}
