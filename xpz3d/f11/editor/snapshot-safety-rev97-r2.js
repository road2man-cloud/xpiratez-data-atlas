'use strict';
// XPZ3D F11 rev97. Crash-safe, source-scoped and append-friendly browser checkpoints.
// Does NOT claim to recover deleted face IDs absent from existing backups.
// Small recoverable snapshots go to localStorage; full coordinates go to IndexedDB.
// The peak-deletion checkpoint is preserved separately from the latest checkpoint.
(()=>{
const SCHEMA='XPZ3D.F11.Rev97.SafeCheckpoint.v1';
const PREFIX='xpz3d.f11.rev97.';
const DBNAME='XPZ3D_F11_REV97_REVISIONS';
const $=id=>document.getElementById(id);
let currentSource='',restoring=false,started=false,writeTimer=null,serial=0,lastArchived=0,dbPromise=null;
function fileKey(type,source){return PREFIX+type+'.'+encodeURIComponent(source);}
function status(s,warning=false){
 const e=$('rev97BackupStatus');
 if(e){e.textContent=s;e.style.color=warning?'#ffcc80':'#a6efc5';}
}
function readLocal(type,source){
 try{const raw=localStorage.getItem(fileKey(type,source));return raw?JSON.parse(raw):null;}
 catch(e){status('브라우저 저장소 읽기 실패: '+e.message,true);return null;}
}
function valid(saved,source){
 return !!saved&&saved.schema===SCHEMA&&saved.sourceGLB===source&&
  saved.controls&&Object.keys(saved.controls).length===106&&
  Array.isArray(saved.deletedFaces)&&
  saved.deletionCount===saved.deletedFaces.length&&
  saved.deletedFaces.every(f=>Number.isInteger(f.primitive)&&Number.isInteger(f.triangle)&&
   Array.isArray(f.vertices)&&f.vertices.length===3);
}
function openDB(){
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{
  if(!window.indexedDB){reject(Error('IndexedDB unavailable'));return;}
  const req=indexedDB.open(DBNAME,1);
  req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('revisions'))db.createObjectStore('revisions',{keyPath:'id'});};
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error||Error('IndexedDB error'));
 });
 return dbPromise;
}
function modelSnapshot(){
 const polygon=window.XPZPolygon?.snapshot?.();
 const manual=window.XPZManual?.snapshot?.();
 if(!polygon||!manual||!polygon.sourceGLB||polygon.sourceGLB!==currentSource)return null;
 if(Object.keys(manual.controls||{}).length!==106)throw Error('Control count changed: refusing save');
 if(polygon.deletedFaces.length!==polygon.deletionCount)throw Error('Deletion count mismatch');
 const sourceGLB=polygon.sourceGLB;
 const compact={
  schema:SCHEMA,sourceGLB,createdAt:new Date().toISOString(),
  controls:{...manual.controls},enabled:manual.enabled!==false,mirror:manual.mirror===true,
  deletedFaces:polygon.deletedFaces.map(f=>({primitive:f.primitive,triangle:f.triangle,vertices:f.vertices.slice(),layer:f.layer})),
  deletionCount:polygon.deletedFaces.length
 };
 return {compact,full:manual};
}
function storeCompact(compact){
 try{
  const previous=readLocal('peak',compact.sourceGLB);
  localStorage.setItem(fileKey('latest',compact.sourceGLB),JSON.stringify(compact));
  if(!valid(previous,compact.sourceGLB)||compact.deletionCount>previous.deletionCount)
   localStorage.setItem(fileKey('peak',compact.sourceGLB),JSON.stringify(compact));
  return true;
 }catch(e){status('저장 실패: '+e.message,true);return false;}
}
async function storeArchive(full,compact){
 try{
  const db=await openDB(),id=Date.now()+'-'+(++serial);
  await new Promise((resolve,reject)=>{
   const tx=db.transaction('revisions','readwrite');
   tx.objectStore('revisions').put({id,sourceGLB:compact.sourceGLB,savedAt:compact.createdAt,
    deletedCount:compact.deletionCount,compact,full});
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });
  // Keep up to 80 full snapshots; local latest + peak are never deleted.
  const keys=await new Promise((resolve,reject)=>{
   const tx=db.transaction('revisions','readonly'),q=tx.objectStore('revisions').getAllKeys();
   q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
  });
  if(keys.length>80){
   await new Promise((resolve,reject)=>{
    const tx=db.transaction('revisions','readwrite'),store=tx.objectStore('revisions');
    for(const key of keys.sort().slice(0,keys.length-80))store.delete(key);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
   });
  }
 }catch(e){status('JSON 자동복구는 유지됨 · 추가 이력 저장 실패: '+e.message,true);}
}
function updateCount(){
 if(!currentSource)return;
 const current=window.XPZPolygon?.snapshot?.();
 const peak=readLocal('peak',currentSource);
 const el=$('rev97BackupCount');
 if(el)el.textContent='현재 삭제 '+(current?.deletionCount??0)+'면 · 보호된 최대 '+(peak?.deletionCount??0)+'면';
}
function persist(immediate=false){
 if(!started||restoring||!currentSource)return;
 if(writeTimer){clearTimeout(writeTimer);writeTimer=null;}
 const save=()=>{
  if(!started||restoring||!currentSource)return;
  try{
   const row=modelSnapshot();if(!row)return;
   if(storeCompact(row.compact)){
    updateCount();status('자동저장 '+new Date().toLocaleTimeString()+' · '+row.compact.deletionCount+'면 · 원본 GLB 보존');
    if(Date.now()-lastArchived>3000){
     lastArchived=Date.now();
     void storeArchive(row.full,row.compact);
    }
   }
  }catch(e){status('자동저장 중단: '+e.message,true);}
 };
 if(immediate)save();else writeTimer=setTimeout(save,550);
}
function restore(data,reason){
 const source=window.XPZPolygon?.snapshot?.().sourceGLB;
 if(!valid(data,source))throw Error('복구 파일의 원본/106개 설정/삼각형 목록이 일치하지 않습니다');
 if(restoring)throw Error('이미 복구 중입니다');
 restoring=true;
 try{
  window.XPZManual.restoreFromCheckpoint(data);
  const n=window.XPZPolygon.loadState(data); // checks original triangle vertices
  if(n!==data.deletionCount)throw Error('복구된 삭제 수가 기록과 다릅니다');
  status(reason+' · '+n+'면 복구');
 }finally{restoring=false;}
 updateCount();persist(true);
}
function bind(source){
 if(!source||currentSource===source)return;
 currentSource=source;started=false;
 let restorationBlocked=false;
 const latest=readLocal('latest',source),peak=readLocal('peak',source);
 if(valid(latest,source)){
  try{restore(latest,'이전 세션 자동 복구');}
  catch(e){restorationBlocked=true;status('자동 복구 실패: '+e.message+' · 자동 덮어쓰기를 중지했습니다',true);}
 }else if(latest){
  restorationBlocked=true;status('이전 저장 기록 불일치 · 자동 덮어쓰기 중지 · 원본 보존',true);
 }else{
  status('새 원본을 불러왔습니다. 이때부터 삭제면·설정이 자동 저장됩니다');
 }
 started=!restorationBlocked;
 if(started)persist(true);
 const count=window.XPZPolygon?.snapshot?.().deletionCount||0;
 if(count===0&&valid(peak,source)&&peak.deletionCount>0)
  status('이전 최대 '+peak.deletionCount+'면 기록이 보호되어 있습니다. 복구 버튼으로 확인하세요',true);
}
function exportJSON(){
 if(!started||!currentSource){status('GLB 로드 완료 후 내보내기 가능',true);return;}
 try{
  persist(true);
  const row=modelSnapshot();
  if(!row)throw Error('No complete snapshot');
  const payload={...row.full,rev97SafeBackup:{schema:SCHEMA,latestDeletedFaces:row.compact.deletionCount,
   peakDeletedFaces:readLocal('peak',currentSource)?.deletionCount||0,
   source:currentSource,createdAt:new Date().toISOString()}};
  const blob=new Blob([JSON.stringify(payload,null,2)+'\n'],{type:'application/json'});
  const a=document.createElement('a'),url=URL.createObjectURL(blob);
  a.href=url;
  a.download='XPZ3D-F11-rev97-protected-'+row.compact.deletionCount+'faces-'+
   new Date().toISOString().replace(/[:.]/g,'-')+'.json';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  status('원본 '+currentSource+' · 삭제 '+row.compact.deletionCount+'면 포함 전체 JSON 내보내기');
 }catch(e){status('JSON 내보내기 실패: '+e.message,true);}
}
function restorePeak(){
 const peak=readLocal('peak',currentSource);
 if(!valid(peak,currentSource)){status('복구 가능한 최대 삭제 기록이 없습니다',true);return;}
 if(!confirm('과거 최대 '+peak.deletionCount+'면 삭제 상태와 106개 설정을 다시 적용하시겠습니까? 현재 수정은 먼저 JSON으로 내보내세요.'))return;
 try{restore(peak,'보호된 최대 삭제 기록');}catch(e){status('복구 실패: '+e.message+' (기록 보존됨)',true);}
}
function init(){
 if($('rev97Export'))$('rev97Export').addEventListener('click',exportJSON);
 if($('rev97RecoverPeak'))$('rev97RecoverPeak').addEventListener('click',restorePeak);
 document.addEventListener('xpz-polygon-change',()=>{
  const source=window.XPZPolygon?.snapshot?.().sourceGLB;
  if(source&&source!==currentSource)bind(source);
  if(started&&!restoring)persist(true);
 });
 document.addEventListener('xpz-manual-update',()=>{if(started&&!restoring)persist(false);});
 window.addEventListener('pagehide',()=>{if(started)persist(true);});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&started)persist(true);});
 // If the viewer bound before this file installed, perform the same initialization.
 const source=window.XPZPolygon?.snapshot?.().sourceGLB;
 if(source)bind(source);
}
window.XPZRev97Safety={exportJSON,restorePeak,peek:()=>({currentSource,
 latest:readLocal('latest',currentSource),peak:readLocal('peak',currentSource)})};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();