import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {foundationWorld,applyOriginWitnessStep} from '../public/soldiers/modern/origin-witness.js';
import {auditOriginCampaignContext} from '../public/soldiers/modern/origin-campaign-context.js';
const read=p=>JSON.parse(fs.existsSync(p)?fs.readFileSync(p,'utf8'):execFileSync('git',['-c','safe.directory='+process.cwd().replaceAll('\\','/'),'show','HEAD:'+p],{encoding:'utf8',maxBuffer:64*1024*1024}));
const data=JSON.parse(gunzipSync(fs.readFileSync('public/data/soldiers-modern-index.json.gz')));
const catalog=read('public/data/soldier-source-catalog.json');
data.sourceItemIds=new Set(catalog.itemIds);
const target='public/data/soldier-overcap-context-expanded.json',out=read(target),queue=read('public/data/soldier-overcap-research-queue.json');
const packed=read('public/data/soldier-origin-candidates.json'),archive=JSON.parse(gunzipSync(Buffer.from(packed.payload,'base64')));
if(out.sourceMetadataSha256!==data.meta.source.metadataSha256||queue.sourceMetadataSha256!==out.sourceMetadataSha256||queue.sourceLedgerHash!==out.sourceLedgerHash||JSON.stringify(archive.sourceHashes)!==JSON.stringify(data.meta.source.rules))throw Error('source mismatch');
const done=new Set(out.entries.filter(e=>e.status==='RESEARCH_ONLY_SEQUENCE_COMPLETE').flatMap(e=>e.groups));
const wanted=new Set(queue.jobs.filter(j=>!done.has(j.id)).map(j=>j.origin));
const metrics={added:[],rejected:[]};
for(const record of archive.records.filter(r=>wanted.has(r.profileId))){
 const p=data.profiles.find(p=>p.id===record.profileId);if(!p)continue;
 const candidates=new Map();
 for(const c of record.candidates){
  const at=c.steps.findIndex(a=>a.type==='recruit'&&a.profile===p.id);if(at<0)continue;
  const prefix=c.steps.slice(0,at);if(prefix.some(a=>['recruit','transform','conditionalPromotion','conditionalCapGrowth'].includes(a.type)))continue;
  const lanes=c.campaignContext?.allowedDifficulties||[];
  for(const d of lanes){
   const actions=prefix[0]?.type==='campaignContext'?prefix:[{type:'campaignContext',difficulty:d,assumption:true},...prefix];
   if(actions[0]?.difficulty!==d)continue;
   const k=JSON.stringify(actions);if(!candidates.has(k))candidates.set(k,{actions,d,id:c.id});
  }
 }
 const lanes=new Set();
 for(const c of [...candidates.values()].sort((a,b)=>a.actions.length-b.actions.length)){
  if(lanes.has(c.d))continue;
  try{
   let w=foundationWorld();for(const a of c.actions){const q=applyOriginWitnessStep(w,a,data);if(!q.ok)throw Error(q.reason);w=q.world;}
   const ctx=auditOriginCampaignContext(c.actions,data);
   if(ctx.kind!=='compatible'||!ctx.allowedDifficulties.includes(c.d)||w.pendingFree||w.soldiers.length||!p.requires.every(k=>w.researched.has(k)&&!w.disabled.has(k)))throw Error('invalid birth prefix');
   const existing=out.prefixes.find(x=>JSON.stringify(x.actions)===JSON.stringify(c.actions));
   if(!existing){
    const id='prefix-'+String(out.prefixes.length+1).padStart(4,'0');
    if(out.prefixes.some(x=>x.id===id))throw Error('prefix ID collision');
    out.prefixes.push({id,actions:c.actions,activeResearch:[...w.researched].filter(k=>!w.disabled.has(k)).sort(),disabledResearch:[...w.disabled].sort(),month:w.month,allowedDifficulties:ctx.allowedDifficulties,researchOnlyReplayVerified:true,sourceBirthWitness:{profile:p.id,candidate:c.id}});
    metrics.added.push({origin:p.id,difficulty:c.d,id,steps:c.actions.length});
   }
   lanes.add(c.d);
  }catch(e){metrics.rejected.push({origin:p.id,candidate:c.id,difficulty:c.d,reason:e.message});}
 }
}
out.summary.uniquePrefixes=out.prefixes.length;out.summary.uniqueActions=out.prefixes.reduce((s,p)=>s+p.actions.length,0);
out.archiveSeedRuns=[...(out.archiveSeedRuns||[]),metrics];
fs.writeFileSync(target,JSON.stringify(out)+'\n');
console.log(JSON.stringify({added:metrics.added,rejected:metrics.rejected.slice(0,10),rejectedCount:metrics.rejected.length,summary:out.summary}));
