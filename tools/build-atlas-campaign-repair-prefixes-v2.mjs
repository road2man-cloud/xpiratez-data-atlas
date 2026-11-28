// Pinned-source, whole-ledger queue and actual chronological codex-prefix repair.
// A repaired PREFIX never certifies the downstream career or trait vector.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {gunzipSync,gzipSync} from 'node:zlib';
import {campaignStartWorld,labVerdict,applyCampaignStartStep} from '../public/soldiers/modern/campaign-start-gate-v1.js';
import {auditOriginCampaignContext} from '../public/soldiers/modern/origin-campaign-context.js';
const args=Object.fromEntries(process.argv.slice(2).filter(s=>s.includes('=')).map(s=>s.replace(/^--/,'').split(/=(.*)/s).slice(0,2)));
const repo=args.repo||process.cwd(),game=args.game||'C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez';
const require=createRequire(path.join(repo,'package.json')),yaml=require('js-yaml');
const ref=execFileSync('git',['rev-parse',args.ref||'origin/main'],{encoding:'utf8'}).trim();
const bytes=p=>execFileSync('git',['show',ref+':'+p],{maxBuffer:256*1024*1024});
const read=p=>JSON.parse(bytes(p));const gz=f=>JSON.parse(gunzipSync(bytes('public/data/'+f+'.json.gz')));
const d=read('public/data/soldiers-modern-index.json'),catalog=read('public/data/soldier-source-catalog.json');
if(d.meta.mod.version!=='v.o2')throw Error('wrong-game-version');
d.sourceItemIds=new Set(catalog.itemIds);
const rules=path.join(game,'user/mods/Piratez/Ruleset'),files={},facilities={},items={},research={};
let base,date;
function load(p,expected){
 const bytes=fs.readFileSync(p),h=createHash('sha256').update(bytes).digest('hex');
 if(expected&&expected!==h)throw Error('source-hash-mismatch:'+p);
 files[path.basename(p)]=h;
 const doc=yaml.load(bytes.toString('utf8'),{json:true})||{};
 if(doc.startingBase)base=doc.startingBase;
 if(doc.startingTime)date=doc.startingTime;
 for(const [key,target] of Object.entries({facilities,items,research}))for(const row of doc[key]||[]){
  if(row.delete){delete target[row.delete];continue;}
  const id=row.type||row.name;if(id)target[id]={...target[id],...row};
 }
}
for(const name of ['vars','startingBase','facilities','items','research'])load(path.join(game,'standard/xcom1',name+'.rul'));
for(const e of [...d.meta.source.rules].sort((a,b)=>a.file.localeCompare(b.file,'en')))load(path.join(rules,e.file),e.sha256);
const researchGrants={};
for(const [id,r] of Object.entries(research)){
 const grants={};
 if(r.spawnedItem&&items[r.spawnedItem])grants[r.spawnedItem]=r.spawnedItemCount??1;
 for(const k of r.spawnedItemList||[])if(items[k])grants[k]=(grants[k]||0)+1;
 if(Object.keys(grants).length)researchGrants[id]=grants;
}
d.campaignAssets={sourceFingerprint:d.meta.source.metadataSha256,facilities,items,researchGrants};
const layout=base.facilities.map(f=>({id:f.type,x:f.x,y:f.y,complete:!(f.buildTime>0),readyDay:f.buildTime||0}));
const complete=layout.filter(f=>f.complete),functions=[...new Set(complete.flatMap(f=>facilities[f.id]?.provideBaseFunc||[]))].sort();
const snapshot={sourceFingerprint:d.meta.source.metadataSha256,items:base.items,facilities:complete.map(f=>f.id),functions,baseLayout:layout,
 funds:0,difficulty:Number(args.difficulty??1),researched:[],disabled:[],soldiers:[],startDate:date,
 otherItems:Object.fromEntries(Object.entries((base.crafts||[]).reduce((a,c)=>{for(const [k,n] of Object.entries(c.items||{}))a[k]=(a[k]||0)+n;return a;},{})))};

const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const c=gz('branch-soldier-results').careerCompletion,meta=d.meta.source.metadataSha256;
if(c.sourceMetadataSha256!==meta)throw Error('career/source mismatch');
const specs=[['missingbirth','soldier-population-missing-origin-career','soldier-population-missing-origin-career-index'],['alternating','soldier-final-career-alternating-candidates','soldier-final-career-alternating-candidate-index'],['frontier','soldier-population-frontier-chronology'],['newpair','soldier-population-new-pair-career'],['research','soldier-population-research-career'],['chronological','soldier-population-chronological-career'],['growth','soldier-population-growth-replay']];
const paths={};
for(const f of [args.gold||'public/data/campaign-start-gold-v3.json',args.other||'public/data/campaign-start-other-codex-v4.json']){
 const j=JSON.parse(fs.readFileSync(f,'utf8'));if(j.sourceMetadataSha256!==meta)throw Error('prefix/source mismatch');
 for(const r of j.records)if(r.status==='conditional-replay')paths[r.goal]=r.actions;
}
const codex=/^STR_CODEX_(RED|GREEN|GOLD|GRAY)$/;
if(Object.keys(paths).filter(k=>codex.test(k)).length!==4)throw Error('missing codex production');
const queue=[],groups=new Map(),pairRecords=c.researchTraitSets.records,final=new Set(c.rows.flatMap(r=>[r.routeId,...(r.alternatives||[]).map(a=>a.routeId).filter(Boolean)])),initialCache=new Map();
function unpack(idx,id,r){
 const w=idx.routes[id];if(!w||w.fullActionHash!==r.fullActionHash)throw Error('witness mismatch');
 const a=[],seen=new Set();let p=w.fullPrefix;
 while(p!==null){if(!Number.isInteger(p)||seen.has(p)||!idx.actionNodes[p])throw Error('invalid prefix');seen.add(p);const n=idx.actionNodes[p];if(n.action)a.push(n.action);p=n.parent;}
 if(a.length!==w.actionCount)throw Error('action count mismatch');return a.reverse();
}
for(const [source,file,index] of specs){
 const ledger=gz(file),idx=index?gz(index):null;
 if(ledger.sourceMetadataSha256!==meta||idx&&idx.sourceMetadataSha256!==meta)throw Error('ledger/source mismatch:'+file);
 for(const [id,r] of Object.entries(ledger.routes)){
  const t=pairRecords[id],q={source,id,origin:r.origin,body:r.body,branch:r.branch,actionHash:r.fullActionHash,pairId:t?.pairId??null,pathId:t?.pathId??null,traitId:t?.traitId??null,priority:final.has(id)?0:t?1:2,status:'repair-pending'};
  try{
   const a=idx?unpack(idx,id,r):r.actions;
   if(!Array.isArray(a))throw Error('missing actions');
   q.actionCount=a.length;
   if(!idx&&!a.some(s=>s.type==='recruit')){
    q.status='parent-link-pending';q.parentRefs=[r.seed,r.root,r.sourceRoute,r.rootRoute].filter(Boolean);queue.push(q);continue;
   }
   const i=a.findIndex(s=>s.type==='externalInputs'&&Object.keys(s.items||{}).some(k=>codex.test(k)));
   if(i<0)throw Error('no codex injection in full history');
   const goal=Object.keys(a[i].items).find(k=>codex.test(k)),j=a.findIndex((s,k)=>k>i&&s.type==='research'&&s.id===goal);
   if(j!==i+1)throw Error('nonadjacent codex research');
   let end=j+1;while(a[end]?.type==='freeResearch'&&a[end].source===goal)end++;
   const ctx=a.slice(0,i).find(s=>s.type==='campaignContext'),allowed=r.allowedDifficulties;
   const difficulty=ctx?.difficulty??(Array.isArray(allowed)&&allowed.includes(1)?1:allowed?.[0]);
   if(!Number.isInteger(difficulty)||difficulty<0||difficulty>4||Array.isArray(allowed)&&!allowed.includes(difficulty))throw Error('difficulty unresolved');
   const old=a.slice(0,end),key=hash({difficulty,old});
   q.prefixGroup=key;q.codex=goal;q.suffixAt=end;q.status='prefix-queued';
   if(!groups.has(key))groups.set(key,{id:key,goal,difficulty,oldPrefix:old,injectAt:i,routeCount:0,traitLinked:0,finalLinked:0});
   const g=groups.get(key);g.routeCount++;g.traitLinked+=!!t;g.finalLinked+=final.has(id);
  }catch(e){q.reason=e.message;q.status='repair-pending';}
  queue.push(q);
 }
}
function initial(diff){
 if(!initialCache.has(diff))initialCache.set(diff,campaignStartWorld(d,{...snapshot,difficulty:diff}));
 return initialCache.get(diff);
}
function execute(w,step){
 if(['research','repeatResearch'].includes(step.type)){
  const v=labVerdict(w,step.id,d,{repeat:step.type==='repeatResearch'});if(!v.ok)throw Error('lab '+step.id+': '+v.reason);
 }
 const r=applyCampaignStartStep(w,step,d);if(!r.ok)throw Error(r.reason);
 return r.world;
}
const receipts=[];
for(const g of [...groups.values()].sort((a,b)=>b.finalLinked-a.finalLinked||b.routeCount-a.routeCount||a.id.localeCompare(b.id))){
 const result={...g,status:'prefix-unresolved',gameCertified:false};let w;
 try{
  w=structuredClone(initial(g.difficulty));
  const prefix=g.oldPrefix.slice(0,g.injectAt).filter(s=>s.type!=='campaignContext');
  if(prefix.some(s=>s.type==='externalInputs'))throw Error('prior external inputs unresolved');
  for(const s of prefix)w=execute(w,s);
  if(w.pendingFree)throw Error('pending free before codex');
  const grant=g.oldPrefix[g.injectAt];
  if(Object.keys(grant.items||{}).length!==1||grant.items[g.goal]!==1||(grant.functions||[]).some(f=>!w.baseFunctions.has(f))||(grant.funds||0)!==0)throw Error('additional legacy resource obligations');
  const oldAwards=g.oldPrefix.slice(g.injectAt+2).map(s=>s.research);
  const newAwards=paths[g.goal].filter(s=>s.type==='freeResearch'&&s.source===g.goal).map(s=>s.research);
  if(JSON.stringify(oldAwards)!==JSON.stringify(newAwards))throw Error('legacy free award differs');
  const committed=[...w.researched].filter(k=>!w.disabled.has(k)),replacement=[...prefix];
  for(const s of paths[g.goal]){
   if(s.type==='research'&&w.researched.has(s.id)&&!w.disabled.has(s.id))continue;
   if(s.type==='freeResearch'&&!w.pendingFree&&w.researched.has(s.research)&&!w.disabled.has(s.research))continue;
   w=execute(w,s);replacement.push(s);
  }
  if(w.pendingFree||!w.researched.has(g.goal)||w.disabled.has(g.goal)||committed.some(k=>!w.researched.has(k)||w.disabled.has(k)))throw Error('branch or award commitment lost');
  const context=auditOriginCampaignContext(replacement,d);
  if(context.kind!=='compatible'||!context.allowedDifficulties.includes(g.difficulty))throw Error('campaign context conflict or unknown');
  result.status='prefix-replayed-conditional';result.replacement=replacement;result.replacementHash=hash(replacement);
  result.endStateHash=hash({researched:[...w.researched].sort(),disabled:[...w.disabled].sort(),items:w.items,functions:[...w.baseFunctions].sort(),month:w.month});
 }catch(e){result.reason=e.message;}
 receipts.push(result);
}
const byGroup=new Map(receipts.map(r=>[r.id,r]));
for(const q of queue)if(q.prefixGroup)q.status=byGroup.get(q.prefixGroup).status==='prefix-replayed-conditional'?'suffix-repair-pending':'prefix-repair-pending';
const statuses={};for(const q of queue)statuses[q.status]=(statuses[q.status]||0)+1;
const pairs=Object.entries(c.researchTraitSets.pairs).map(([id,p])=>({id,pathId:p.pathId,traitId:p.traitId,routes:p.routes,status:'career-replay-pending'}));
const summary={routes:queue.length,pairs:pairs.length,legacyFinal:c.rows.length,groups:receipts.length,successfulGroups:receipts.filter(r=>r.status==='prefix-replayed-conditional').length,coveredRoutes:statuses['suffix-repair-pending']||0,statuses,normalizedCareers:0};
const head={schema:'ATLAS_CAMPAIGN_PREFIX_REPAIR_V2',sourceCommit:ref,sourceMetadataSha256:meta,sourceFiles:files,scope:'PREFIX_REPLAY_ONLY; SUFFIX AND TRAITS NOT YET NORMALIZED',summary};
fs.writeFileSync(args.out||'campaign-prefix-repair.json',JSON.stringify({...head,receipts}));
fs.writeFileSync(args.queue||'campaign-repair-worklist.json.gz',gzipSync(JSON.stringify({...head,queue,pairs})));
console.log(JSON.stringify({...head,failures:receipts.filter(r=>r.reason).map(r=>({goal:r.goal,routeCount:r.routeCount,reason:r.reason})).slice(0,15)}));
