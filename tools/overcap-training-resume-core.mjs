// Resume existing exact action witnesses without declaring campaign completion.
export function buildTrainingResumeQueue(waves){
 const check=(ok,msg)=>{if(!ok)throw Error(msg);};
 check(Array.isArray(waves)&&waves.length>0,'resume waves required');
 const provenance=['sourceHash','sourceLedgerHash','sourceMetadataSha256','terminalSourceHash'];
 const reference=waves[0].report,records=new Map(),paths=new Set();
 for(const {path,report} of waves){
  check(typeof path==='string'&&path.length&&!paths.has(path),'duplicate/missing wave path');paths.add(path);
  check(report.schema==='ATLAS_OVERCAP_TERMINAL_TRAINING_WAVE_V1','wrong wave schema');
  for(const k of provenance)check(typeof reference[k]==='string'&&reference[k].length&&report[k]===reference[k],'stale wave '+k);
  for(const row of report.rows){
   check(row.conditionalReplayVerified===true&&row.finalAdmission===false&&Array.isArray(row.suffix)&&row.firstSuccessorInventory,'invalid checkpoint');
   const old=records.get(row.id);
   if(old)check(JSON.stringify(old.row)===JSON.stringify(row),'checkpoint collision '+row.id);
   else records.set(row.id,{path,row,keys:row.suffix.map(a=>JSON.stringify(a))});
  }
 }
 const groups=new Map();for(const rec of records.values()){
  const a=groups.get(rec.row.sourceTerminalId)||[];a.push(rec);groups.set(rec.row.sourceTerminalId,a);
 }
 const checkpoints=[],summary={sourceWaves:waves.length,sourceRows:records.size,sourceSeeds:groups.size,alreadyFirstInventoryClosed:0,deferredAncestorRows:0,otherOrNonLiveOnly:0,checkpoints:0,byBody:{}};
 for(const group of groups.values())for(const rec of group){
  const r=rec.row,inv=r.firstSuccessorInventory;
  if(inv.firstInventoryClosed===true){summary.alreadyFirstInventoryClosed++;continue;}
  const actions=(inv.open||[]).filter(a=>a.live===true&&!a.dead&&!a.clone&&!a.reset&&a.destination===r.body).map(a=>({id:a.id,missingResearch:[...new Set(a.missingResearch||[])].sort()})).sort((a,b)=>a.id.localeCompare(b.id));
  if(!actions.length){summary.otherOrNonLiveOnly++;continue;}
  if(group.some(other=>other.keys.length>rec.keys.length&&rec.keys.every((k,i)=>k===other.keys[i]))){summary.deferredAncestorRows++;continue;}
  const readyActions=actions.filter(a=>!a.missingResearch.length).length,missingResearchCount=new Set(actions.flatMap(a=>a.missingResearch)).size;
  checkpoints.push({checkpointId:r.id,sourceTerminalId:r.sourceTerminalId,wavePath:rec.path,fullActionHash:r.fullActionHash,suffixHash:r.suffixHash,body:r.body,branch:r.branch,target:r.target,capGain:r.capGain,readyActions,missingResearchCount,actions});
  summary.byBody[r.body]=(summary.byBody[r.body]||0)+1;
 }
 checkpoints.sort((a,b)=>a.body.localeCompare(b.body)||a.sourceTerminalId.localeCompare(b.sourceTerminalId)||b.readyActions-a.readyActions||a.missingResearchCount-b.missingResearchCount||b.capGain-a.capGain||a.checkpointId.localeCompare(b.checkpointId));
 summary.checkpoints=checkpoints.length;summary.resumeSeeds=new Set(checkpoints.map(c=>c.sourceTerminalId)).size;
 return {schema:'ATLAS_OVERCAP_TRAINING_RESUME_QUEUE_V1',...Object.fromEntries(provenance.map(k=>[k,reference[k]])),scope:'Existing conditional same-body action witnesses; leaf-first scheduling only, deferred ancestors remain valid, no new replay or final admission.',waves:[...paths],summary,checkpoints};
}
export function mergeTrainingReceipts(old,next){
 if(!old)return next;
 for(const k of ['id','body','origin','branch'])if(old[k]!==next[k])throw Error('receipt identity collision '+k);
 const union=(a,b)=>[...new Set([...(a||[]),...(b||[])])];
 const attempted=[...new Map([...(old.attempted||[]),...(next.attempted||[])].map(a=>[JSON.stringify(a),a])).values()];
 const errors=union(old.errors||[old.error].filter(Boolean),next.errors||[next.error].filter(Boolean));
 const seedReplayVerified=old.seedReplayVerified===true||next.seedReplayVerified===true;
 const out={...old,...next,produced:union(old.produced,next.produced),attempted,seedReplayVerified,status:seedReplayVerified?'OPEN_NOT_EXHAUSTED':'SEED_OR_WAVE_ERROR',finalAdmission:false};
 if(old.resumeCheckpoints||next.resumeCheckpoints)out.resumeCheckpoints=union(old.resumeCheckpoints,next.resumeCheckpoints);
 if(errors.length){out.errors=errors;out.error=errors.join('; ');}
 return out;
}
