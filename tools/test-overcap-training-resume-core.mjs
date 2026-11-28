import {buildTrainingResumeQueue,mergeTrainingReceipts} from './overcap-training-resume-core.mjs';
function runTrainingResumeTests(){
 const check=(ok,msg)=>{if(!ok)throw Error(msg);},throws=f=>{try{f();}catch{return true;}return false;};
 const body='B',a={id:'T',live:true,dead:false,clone:false,reset:false,destination:body,missingResearch:['R']};
 const row=(id,seq,extra={})=>({id,sourceTerminalId:'S',body,branch:'BR',target:'G',capGain:1,fullActionHash:'F'+id,suffixHash:'H'+id,suffix:seq.map(id=>({type:'transform',id})),conditionalReplayVerified:true,finalAdmission:false,firstSuccessorInventory:{firstInventoryClosed:false,open:[a]},...extra});
 const wave=(rows,extra={})=>({schema:'ATLAS_OVERCAP_TERMINAL_TRAINING_WAVE_V1',sourceHash:'H',sourceLedgerHash:'L',sourceMetadataSha256:'M',terminalSourceHash:'T',rows,...extra});
 const input=rows=>[{path:'w',report:wave(rows)}];
 let q=buildTrainingResumeQueue(input([row('a',['A']),row('ab',['A','B']),row('ac',['A','C'])]));
 check(q.checkpoints.length===2&&q.summary.deferredAncestorRows===1,'leaf selection');
 check(q.summary.sourceSeeds===1&&q.summary.resumeSeeds===1,'seed count');
 q=buildTrainingResumeQueue(input([row('a',['A']),row('b',['B'],{firstSuccessorInventory:{firstInventoryClosed:true,open:[]}}),row('c',['C'],{firstSuccessorInventory:{firstInventoryClosed:false,open:[{...a,dead:true,live:false}]}})]));
 check(q.summary.alreadyFirstInventoryClosed===1&&q.summary.otherOrNonLiveOnly===1&&q.checkpoints.length===1,'scope');
 check(throws(()=>buildTrainingResumeQueue([{path:'a',report:wave([])},{path:'b',report:wave([],{sourceHash:'old'})}])),'stale provenance');
 check(throws(()=>buildTrainingResumeQueue(input([row('a',['A']),row('a',['B'])]))),'collision');
 q=buildTrainingResumeQueue(input([row('a',['A']),row('a',['A'])]));check(q.summary.sourceRows===1,'dedup');
 check(throws(()=>buildTrainingResumeQueue(input([row('a',['A'],{finalAdmission:true})]))),'no final admission');
 const x={id:'S',body,origin:'O',branch:'BR',produced:['A'],attempted:[{id:'T'}],seedReplayVerified:true};
 const y={...x,produced:['A','B'],attempted:[{id:'T'},{id:'Q'}],resumeCheckpoints:['C'],seedReplayVerified:false,error:'blocked'};
 const m=mergeTrainingReceipts(x,y);check(m.produced.join(',')==='A,B'&&m.attempted.length===2&&m.seedReplayVerified&&m.error==='blocked'&&m.resumeCheckpoints[0]==='C','receipt union');
 check(throws(()=>mergeTrainingReceipts(x,{...y,branch:'OTHER'})),'receipt identity');
 return 9;
}
console.log('resume core: '+runTrainingResumeTests()+' regression checks passed');
