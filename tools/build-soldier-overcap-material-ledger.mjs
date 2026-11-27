// Resource ledger for the v.o2 conditional overcap lifecycle dataset.
// Source-indexed quantities, not a claim of real-world campaign supply.
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const path='public/data/soldier-overcap-expanded-lifecycle.json';
const output='public/data/soldier-overcap-material-ledger.json';
const readBytes=p=>fs.existsSync(p)?fs.readFileSync(p):execFileSync('git',['-c','safe.directory='+process.cwd().replaceAll('\\','/'),'show','HEAD:'+p],{maxBuffer:128*1024*1024});
const read=p=>JSON.parse(readBytes(p));
const digest=b=>createHash('sha256').update(b).digest('hex');
// JSON fingerprints are insensitive to checkout CRLF conversion.
const jsonDigest=x=>digest(JSON.stringify(x));
const lifeBytes=readBytes(path),life=JSON.parse(lifeBytes);
const runtimeBytes=readBytes('public/data/soldiers-modern-index.json.gz'),data=JSON.parse(gunzipSync(runtimeBytes));
const itemBytes=readBytes('public/data/items-v2-index.json'),items=JSON.parse(itemBytes);
const rules=data.researchRules,supply=data.itemSupply||{},arr=x=>Array.isArray(x)?x:[];
const metadata=data.meta.source.metadataSha256;
if(data.meta.mod.version!=='v.o2'||life.sourceMetadataSha256!==metadata||items.meta.sourceVersion!=='v.o2'||items.meta.sourceFiles.find(x=>x.path==='metadata.yml')?.sha256!==metadata)throw Error('version/source mismatch');
for(const r of data.meta.source.rules){const f=items.meta.sourceFiles.find(x=>x.path.split('/').at(-1)===r.file);if(!f||f.sha256!==r.sha256)throw Error('item labels source hash mismatch '+r.file);}
const labels=new Map(items.items.map(x=>[x.id,x.koName||x.enName||x.id]));
const bodies=new Map(data.soldiers.map(x=>[x.id,x.koName||x.id]));
const profiles=new Map(data.profiles.map(x=>[x.id,x])),transforms=new Map(data.transformations.map(x=>[x.id,x]));
const completed=life.results.filter(r=>r.status==='CONDITIONAL_LIFECYCLE_COMPLETE');
if(completed.length!==life.summary.complete||new Set(completed.map(r=>r.id)).size!==completed.length)throw Error('inconsistent lifecycle input');
const reopened=new Set(Object.values(rules).flatMap(r=>arr(r.reenables)));
const eventEvidence=new Map();
for(const [research,sources] of Object.entries(data.eventResearchSources||{}))for(const source of sources){
 const e=eventEvidence.get(source.event)||{awards:new Set(),scripts:new Map()};e.awards.add(research);
 for(const s of arr(source.scripts))e.scripts.set(s.script,s);eventEvidence.set(source.event,e);
}
function finiteGrant(g){
 const e=eventEvidence.get(g.event),awards=new Set([...arr(g.directResearchAwards),...(e?.awards||[])]);
 const ids=arr(g.scriptIds),routes=new Map(arr(g.scriptRoutes).map(s=>[s.script,s]));
 // Some item-supply rows omit script details; same-version event-research
 // evidence may fill those details, but unknown scripts may not be ignored.
 if(!ids.length)return null;
 const scripts=ids.map(id=>routes.get(id)||e?.scripts.get(id));
 if(scripts.some(s=>!s))return null;
 const viable=scripts.filter(s=>s.executionOdds!==0);
 if(!viable.length)return null;
 const evidence=[];
 for(const s of viable){
  const lock=arr(s.researchNegative).find(k=>awards.has(k)&&rules[k]&&rules[k].repeatable!==true&&!reopened.has(k));
  const once=['oneTimeRandom','oneTimeSequential'].includes(s.mode);
  if(!lock&&!once)return null;
  evidence.push({script:s.script,lock:lock||null,oneTime:once});
 }
 const gs=arr(g.grants);if(!gs.length||gs.some(x=>!['every','everyMulti'].includes(x.mode)||!Number.isSafeInteger(x.count)||x.count<=0))return null;
 const qty=gs.reduce((s,x)=>s+x.count,0),common=evidence[0].lock;
 const occurrences=common&&evidence.every(x=>x.lock===common)?1:new Set(evidence.map(x=>x.script)).size;
 return {event:g.event,quantity:qty,maxOccurrences:occurrences,maxUnits:qty*occurrences,evidence};
}
const catalog=new Map();
for(const [id,s] of Object.entries(supply)){
 const purchase=Number(s.buyCost)>0,recipes=[...arr(s.manufacture),...arr(s.randomManufacture)],events=arr(s.eventGrants),research=arr(s.researchGrants),loot=Number(s.mapLoot?.sourceCount||0)>0||arr(s.mapLoot?.sources).length>0;
 const finite=events.map(finiteGrant);
 const onlyFinite=events.length>0&&finite.every(Boolean)&&!purchase&&!recipes.length&&!research.length&&!loot&&!s.mapLoot?.possiblyTruncated;
 const cap=onlyFinite?finite.reduce((n,g)=>n+g.maxUnits,0):null;
 const kind=onlyFinite?'INDEXED_FINITE_EVENT_POOL':purchase?'PURCHASE_ROUTE_ASSUMED':recipes.length?'MANUFACTURE_ROUTE_ASSUMED':loot?'LOOT_ROUTE_ASSUMED':events.length||research.length?'GRANT_REPEATABILITY_UNKNOWN':'SOURCE_UNRESOLVED';
 const c={id,name:labels.get(id)||id,kind,cap,hardCap:false,purchase:purchase?{cost:s.buyCost,requires:arr(s.buyRequires),functions:arr(s.buyRequiresBaseFunc),country:s.buyRequiresCountry||null}:null,recipeCount:recipes.length,fixedRecipeCount:arr(s.manufacture).length,randomRecipeCount:arr(s.randomManufacture).length,eventCount:events.length,researchGrantCount:research.length,lootSourceCount:s.mapLoot?.sourceCount??0,lootIndexTruncated:!!s.mapLoot?.possiblyTruncated,finiteGrantEvidence:finite.filter(Boolean)};
 catalog.set(id,c);
}
const captain=catalog.get('STR_CAPTAINS_11_TOKEN');
if(captain?.cap!==11||captain.finiteGrantEvidence.length!==1||captain.finiteGrantEvidence[0].event!=='STR_CAPTAINS_11')throw Error('Captain 11 same-version source changed');
captain.kind='CONFIRMED_FINITE_CAPTAINS_11';captain.hardCap=true;
// Derive dependency risk without asserting that manufactured outputs have a
// known global cap: alternate sources and incomplete loot evidence stay visible.
const limited=new Set([...catalog.values()].filter(x=>x.cap!=null).map(x=>x.id));
let changed=true;
while(changed){
 changed=false;
 for(const [id,c] of catalog){
  if(limited.has(id)||c.purchase||c.eventCount||c.researchGrantCount||c.lootSourceCount||c.lootIndexTruncated||!c.recipeCount)continue;
  const s=supply[id],recipes=[...arr(s.manufacture),...arr(s.randomManufacture)];
  if(recipes.every(r=>Object.keys(r.requiredItems||{}).some(k=>limited.has(k)))){
   limited.add(id);changed=true;c.kind='FINITE_INPUT_DEPENDENCY';
   c.recipeDependencies=recipes.map(r=>({recipe:r.id,limitedInputs:Object.fromEntries(Object.entries(r.requiredItems||{}).filter(([k])=>limited.has(k)))}));
  }
 }
}
const used=new Set(),rows=[];
const sums=(o,k,n)=>{if(!Number.isSafeInteger(n)||n<0)throw Error('invalid quantity '+k+':'+n);if(n)o[k]=(o[k]||0)+n;};
const sorted=o=>Object.fromEntries(Object.entries(o).sort(([a],[b])=>a.localeCompare(b)));
for(const r of completed){
 const supplied={},researchConsumed={},birthConsumed={},trainingConsumed={},sampleUses={},reusableSamples={},funds={external:0,birth:0,training:0},first={},functions=new Set(),events=new Map(),grantGap={};
 for(const [index,a] of r.actions.entries()){
  function add(obj,k,n){sums(obj,k,n);used.add(k);if(!Object.hasOwn(first,k))first[k]=index+1;}
  if(a.type==='eventResearch')events.set(a.event,(events.get(a.event)||0)+1);
  if(a.type==='externalInputs'){
   for(const [k,n] of Object.entries(a.items||{})){
    add(supplied,k,n);
    const c=catalog.get(k);
    if(c?.cap!=null){
     const witnessed=c.finiteGrantEvidence.reduce((s,g)=>s+Math.min(g.maxOccurrences,events.get(g.event)||0)*g.quantity,0);
     grantGap[k]=Math.max(grantGap[k]||0,supplied[k]-witnessed);
    }
   }
   for(const f of a.functions||[])functions.add(f);funds.external+=a.funds||0;
  }else if(a.type==='research'||a.type==='repeatResearch'){
   const rule=rules[a.id];if(!rule)throw Error('missing research '+a.id);
   if(rule.needItem){const id=rule.neededItem||a.id;add(sampleUses,id,1);if(rule.destroyItem)add(researchConsumed,id,1);else add(reusableSamples,id,1);}
  }else if(a.type==='recruit'){
   const p=profiles.get(a.profile);if(!p)throw Error('missing profile '+a.profile);
   if(p.sourceType==='event')events.set(p.sourceId,(events.get(p.sourceId)||0)+1);
   else {for(const [k,n] of Object.entries(p.acquisitionRequiredItems||{}))add(birthConsumed,k,n);funds.birth+=p.cost||0;}
  }else if(a.type==='transform'){
   const t=transforms.get(a.transform);if(!t)throw Error('missing transform '+a.transform);
   for(const [k,n] of Object.entries(t.requiredItems||{}))add(trainingConsumed,k,n);funds.training+=t.cost||0;
  }else if(!['campaignContext','conditionalCapGrowth','conditionalPromotion','freeResearch','advanceMonth','missionResearch','eventResearch'].includes(a.type))throw Error('unsupported ledger action '+a.type);
 }
 if(JSON.stringify(sorted(supplied))!==JSON.stringify(sorted(r.assumedItems||{}))||funds.external!==r.assumedFunds)throw Error('external input mismatch '+r.id);
 const materials=[],flags=[];
 for(const id of Object.keys(first).sort()){
  if(!catalog.has(id))catalog.set(id,{id,name:labels.get(id)||id,kind:'SOURCE_UNRESOLVED',cap:null,hardCap:false});
  const c=catalog.get(id),external=supplied[id]||0,lab=researchConsumed[id]||0,birth=birthConsumed[id]||0,training=trainingConsumed[id]||0,gross=lab+birth+training;
  const demand=Math.max(external,gross),pool=c.cap==null?null:{cap:c.cap,externalAboveCap:Math.max(0,external-c.cap),grossAboveCap:Math.max(0,gross-c.cap),unbackedExternalUnits:grantGap[id]||0};
  if(pool&&(pool.externalAboveCap||pool.grossAboveCap))flags.push({id,kind:c.hardCap?'HARD_FINITE_CAP_EXCEEDED':'INDEXED_FINITE_CAP_REVIEW',demand,cap:c.cap});
  else if(pool?.unbackedExternalUnits)flags.push({id,kind:'FINITE_EVENT_SUPPLY_NOT_REPLAYED',units:pool.unbackedExternalUnits,cap:c.cap});
  if(c.kind==='FINITE_INPUT_DEPENDENCY')flags.push({id,kind:'FINITE_MANUFACTURE_INPUT_REVIEW'});
  if(c.kind==='SOURCE_UNRESOLVED')flags.push({id,kind:'ACQUISITION_SOURCE_UNRESOLVED'});
  materials.push({id,external,lab,birth,training,gross,sampleUses:sampleUses[id]||0,reusableSampleUses:reusableSamples[id]||0,firstAction:first[id],pool});
 }
 rows.push({id:r.id,origin:r.origin,body:r.body,difficulty:r.difficulty,total:r.total,materials,funds,functions:[...functions].sort(),flags,status:flags.some(f=>f.kind==='HARD_FINITE_CAP_EXCEEDED')?'HARD_FINITE_CAP_EXCEEDED':flags.some(f=>f.kind==='INDEXED_FINITE_CAP_REVIEW')?'INDEXED_FINITE_CAP_REVIEW':flags.some(f=>f.kind==='FINITE_EVENT_SUPPLY_NOT_REPLAYED'||f.kind==='FINITE_MANUFACTURE_INPUT_REVIEW')?'FINITE_SOURCE_CONDITIONAL':flags.length?'SOURCE_UNRESOLVED':'ORDINARY_ACQUISITION_CONDITIONAL',materialBudgetVerified:false,actualGameCertified:false,finalAdmission:false});
}
const usedCatalog=Object.fromEntries([...used].sort().map(id=>[id,catalog.get(id)]));
const byStatus={},byKind={},byBody={},itemTotals={};
for(const c of Object.values(usedCatalog))byKind[c.kind]=(byKind[c.kind]||0)+1;
for(const r of rows){
 byStatus[r.status]=(byStatus[r.status]||0)+1;
 const b=byBody[r.body]??={name:bodies.get(r.body)||r.body,rows:0,finiteReviewRows:0,unresolvedRows:0};b.rows++;
 if(r.flags.some(f=>f.kind.includes('FINITE')))b.finiteReviewRows++;
 if(r.flags.some(f=>f.kind==='ACQUISITION_SOURCE_UNRESOLVED'))b.unresolvedRows++;
 for(const m of r.materials){const t=itemTotals[m.id]??={routes:0,maxExternal:0,maxGross:0,maxTraining:0};t.routes++;t.maxExternal=Math.max(t.maxExternal,m.external);t.maxGross=Math.max(t.maxGross,m.gross);t.maxTraining=Math.max(t.maxTraining,m.training);}
}
const finiteUsed=Object.values(usedCatalog).filter(c=>c.cap!=null).map(c=>({id:c.id,name:c.name,cap:c.cap,hardCap:c.hardCap,...itemTotals[c.id]}));
const summary={routes:rows.length,distinctUsedItems:used.size,distinctExternalItems:new Set(completed.flatMap(r=>Object.keys(r.assumedItems||{}))).size,byStatus,byKind,byBody,finiteUsed,rowsWithUnresolvedSource:rows.filter(r=>r.flags.some(f=>f.kind==='ACQUISITION_SOURCE_UNRESOLVED')).length,rowsWithUnresolvedBirthOrTraining:rows.filter(r=>r.materials.some(m=>(m.birth>0||m.training>0)&&usedCatalog[m.id].kind==='SOURCE_UNRESOLVED')).length,rowsWithFiniteReview:rows.filter(r=>r.flags.some(f=>f.kind.includes('FINITE'))).length,hardLimitExceeded:byStatus.HARD_FINITE_CAP_EXCEEDED||0};
const report={schema:'ATLAS_OVERCAP_MATERIAL_LEDGER_V1',sourceVersion:'v.o2',sourceMetadataSha256:metadata,sourceLedgerHash:life.sourceLedgerHash,inputs:{lifecycle:{path,canonicalJsonSha256:jsonDigest(life)},runtime:{path:'public/data/soldiers-modern-index.json.gz',sha256:digest(runtimeBytes)},labels:{path:'public/data/items-v2-index.json',canonicalJsonSha256:jsonDigest(items)}},scope:{eachRouteIndependent:true,ordinaryPhysicalAcquisitionAssumed:true,finiteEventPoolsIndexedOnly:true,consumption:'explicit gross recruitment, research destroyItem and transformation inputs; excludes armor refunds, implicit auto research and actual acquisition simulation',eventEvidence:'observed prior eventResearch or event recruit actions; not physical reward proof',notCampaignCertification:true,notFinalAdmission:true},summary,confirmedReferencePool:captain,catalog:usedCatalog,itemMaxPerRoute:sorted(itemTotals),rows};
fs.writeFileSync(output,JSON.stringify(report)+'\n');
console.log(JSON.stringify({summary,bytes:fs.statSync(output).size}));
