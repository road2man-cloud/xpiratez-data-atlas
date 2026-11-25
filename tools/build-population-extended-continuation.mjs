// Reuse recorded unlock and timed-event origins without flattening chronology.
// Each result retains its exact original root and all additional actions.
// No global optimality, random growth or campaign achievement is certified.
import fs from "node:fs";
import {createHash} from "node:crypto";
import {gunzipSync,gzipSync} from "node:zlib";
import {serialize} from "node:v8";
import {performance} from "node:perf_hooks";
import {createFoundationResearchPlanner} from "../public/soldiers/modern/foundation-research-planner.js";
import {auditOriginCampaignContext} from "../public/soldiers/modern/origin-campaign-context.js";
import {STAT_KEYS,bonusStats} from "../public/soldiers/modern/eligibility.js";
import {exactStateHash,createExactPrefixCheckpointCache} from "./origin-pair-exact-prefix-checkpoint.mjs";
import {evaluateCapGrowthChronologies} from "./damsel-madgal-cap-growth-chronology-core.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x));
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const arg=(k,d)=>process.argv.find(s=>s.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const db=decode("public/data/branch-soldier-results.json.gz"),u=db.originUnlockSearch,e=db.originEventBirth;
const data=read("public/data/soldiers-modern-index.json"),ledger=read("public/data/soldier-acquisition-progression-20261102.json"),catalog=read("public/data/soldier-source-catalog.json");
if(!u||!e||[u.sourceMetadataSha256,e.sourceMetadataSha256,data.meta.source.metadataSha256].some(x=>x!==db.sourceMetadataSha256)||STAT_KEYS.join()!==db.stats.join())throw Error("Source mismatch");
data.originRows=ledger.rows;data.sourceItemIds=new Set(catalog.itemIds);
const deps=["tools/build-population-extended-continuation.mjs","tools/damsel-madgal-cap-growth-chronology-core.mjs","tools/origin-pair-exact-prefix-checkpoint.mjs","public/data/soldiers-modern-index.json","public/data/soldier-acquisition-progression-20261102.json","public/data/soldier-source-catalog.json",...fs.readdirSync("public/soldiers/modern").filter(x=>x.endsWith(".js")&&x!=="app.js").sort().map(x=>"public/soldiers/modern/"+x)];
const hashes=Object.fromEntries(deps.map(p=>[p,sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))]));
const engine=key([db.sourceMetadataSha256,u.fingerprint,e.fingerprint,hashes]);
const file=arg("out","population-extended-continuation.json.gz"),prior=fs.existsSync(file)?decode(file):db.originExtendedContinuation||null;
const builder="tools/build-population-extended-continuation.mjs";
const legacyHashes={...hashes,[builder]:"64fa7f15eee999512b0fc6a254b5fa8e2841e5f1ce460650783fc4bafd918f2c"};
const legacyEngine=key([db.sourceMetadataSha256,u.fingerprint,e.fingerprint,legacyHashes]);
if(prior&&prior.engine!==engine&&(prior.engine!==legacyEngine||key(prior.hashes)!==key(legacyHashes)))throw Error("Explicit engine migration required");
const migration=prior&&prior.engine!==engine?{from:legacyEngine,to:engine,scope:"CHECKPOINT_RECEIPTS_AND_COMPLETED_SUBTREE_REUSE_ONLY"}:null;
if(prior&&db.originExtendedContinuation)for(const k of ["routes","models","birthReceipts"])for(const [id,r] of Object.entries(db.originExtendedContinuation[k]||{}))if(key(prior[k]?.[id])!==key(r))throw Error("Local seed is missing published evidence "+id);
const routes={...(prior?.routes||{})},models={...(prior?.models||{})},visits={...(prior?.visits||{})},complete={...(prior?.complete||{})},unresolved={...(prior?.unresolved||{})};
const birthReceipts={...(prior?.birthReceipts||{})},subtrees={...(prior?.subtrees||{})};
const branches=new Map(db.branches.map(b=>[b.id,b]));
const tasks=[];
for(const [id,p] of Object.entries(u.pairs)){
 const root=u.roots[p.root];if(!root||key(root.actions)!==p.root)throw Error("Unlock root mismatch "+id);
 tasks.push({id:"unlock:"+id,kind:"unlock",pair:id,record:p,actions:[...root.actions,...p.suffix]});
}
for(const [id,v] of Object.entries(e.variants)){
 const root=e.roots[v.root];
 if(!root||key(root.actions)!==v.root||!e.pairs[v.pair]?.variants.includes(id)||!Number.isInteger(v.insertionAt)||v.insertionAt<0||v.insertionAt>root.actions.length)throw Error("Event root mismatch "+id);
 tasks.push({id:"event:"+id,kind:"event",pair:v.pair,record:v,actions:[...root.actions.slice(0,v.insertionAt),...v.extraBeforeBirth,...v.inserted,...root.actions.slice(v.insertionAt)]});
}
const oldOrders=new Set();
for(const r of Object.values(db.originUnlockContinuation?.routes||{}))oldOrders.add(key(["unlock:"+r.pair,r.order]));
for(const p of Object.values(u.pairs))for(const wid of p.witnessIds||[]){const w=u.witnesses[wid];if(w)oldOrders.add(key(["unlock:"+w.populationUnlock.pair,w.steps.map(s=>s.id)]));}
for(const w of Object.values(e.witnesses))if(w.populationEvent)oldOrders.add(key(["event:"+w.populationEvent.variant,w.steps.map(s=>s.id)]));
const planner=createFoundationResearchPlanner(data,{maxSteps:1200});
// Only scheduling and receipt handling changed; retain the old namespace,
// whose verified stored world bytes are still tied to the same rule engine.
const cache=createExactPrefixCheckpointCache(".population-extended-cache",legacyEngine);
const vec=s=>STAT_KEYS.map(k=>s[k]||0),member=n=>n.world.soldiers.find(s=>s.id==="origin");
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
const deterministic=r=>!STAT_KEYS.some(k=>r.rerollStats?.[k]||["flat","percent","percentGained"].some(s=>Number(r[s+"Min"]?.[k]||0)!==Number(r[s+"Max"]?.[k]||0)));
const byBody=new Map(),bodies=new Map(data.soldiers.map(b=>[b.id,b]));
for(const r of data.transformations)if(r.allowsLiveSoldiers&&!r.createsClone&&!r.producedItem&&!r.requires.includes("STR_UNAVAILABLE")&&deterministic(r))
 for(const body of r.allowedSoldierTypes||[]){const a=byBody.get(body)||[];a.push(r);byBody.set(body,a);}
for(const a of byBody.values())a.sort((x,y)=>x.id.localeCompare(y.id));
const depth=Number(arg("depth","4")),limit=Number(arg("limit","400")),seconds=Number(arg("seconds","24"));
if(!Number.isSafeInteger(depth)||depth<1||depth>6||!Number.isSafeInteger(limit)||limit<1||!Number.isFinite(seconds)||seconds<=0)throw Error("Invalid budget");
const start=performance.now(),before=Object.keys(routes).length;
const m={newRoutes:0,visited:0,birthReplays:0,birthHashMatches:0,birthHashChanged:0,birthFailures:0,transitions:0,gateRejected:0,oldOrderSkipped:0,numericComputed:0,numericReused:0,numericErrors:0,completedNow:0,bySource:{},originNew:{},receiptRecovered:0,receiptUnresolved:0,subtreesReused:0,verifiedCacheHits:0};
let pairStop=0;
const enough=()=>m.newRoutes<limit&&m.newRoutes<pairStop&&performance.now()-start<seconds*1000;
const timeout=()=>performance.now()-start>=seconds*1000;
function birth(t){
 const p=t.record;
 if(key(t.actions)!==p.fullActionHash)throw Error("Birth action hash mismatch");
 const ctx=auditOriginCampaignContext(t.actions,data);
 if(ctx.kind!=="compatible"||!ctx.allowedDifficulties.some(x=>p.allowedDifficulties.includes(x)))throw Error("Campaign context mismatch");
 let n=cache.load(t.actions,p.stateHash);
 const verifiedCache=!!n;
 if(n)m.verifiedCacheHits++;
 if(!n){
  n=planner.newNode();for(const step of t.actions)planner.append(n,step);
  m.birthReplays++;
  if(sha(serialize(n.world))===p.stateHash)cache.save(n,p.stateHash);
 }
 const s=member(n)?.state,b=branches.get(p.branch);
 if(!s?.exactStats||s.retired||s.soldierType!==p.body||key(vec(s.currentStats))!==key(p.raw))throw Error("Birth stats/body mismatch");
 if(!b||b.sourceRootConflict||!b.captain.every(x=>active(n.world,x))||Object.values(b.choices||{}).filter(Boolean).some(x=>!active(n.world,x)))throw Error("Branch commitments mismatch");
 if(p.bonus&&key(vec(bonusStats(s,data,{commendations:member(n).commendations||{}})))!==key(p.bonus))throw Error("Birth bonus mismatch");
 const restoredByteHash=sha(serialize(n.world));
 // A verified checkpoint validates its original serialized world bytes
 // against p.stateHash AND its round-trip canonical world identity.
 // The restored V8 encoding can differ without a semantic state change.
 const observed=verifiedCache?p.stateHash:restoredByteHash,hashMatch=observed===p.stateHash;
 if(hashMatch)m.birthHashMatches++;else m.birthHashChanged++;
 return {n,proof:{expected:p.stateHash,observed,restoredByteHash,mode:verifiedCache?"VERIFIED_STORED_WORLD":"DIRECT_REPLAY",canonical:exactStateHash(n.world),hashMatch,allowedDifficulties:ctx.allowedDifficulties.filter(x=>p.allowedDifficulties.includes(x))}};
}
function numeric(origin,order,body){
 const id="PXCM12:"+key([origin,order]).slice(0,24);
 if(models[id]){m.numericReused++;return id;}
 try{
  const r=evaluateCapGrowthChronologies(data,origin,order,{maxTransformations:12,deduplicateEnvelopes:true,correlatedPercent:true,tightenStatGates:true});
  if(r.finalBody!==body)throw Error("Terminal body mismatch");
  const frontier=r.frontiers.twelve.map(x=>({raw:vec(x.rawUpper),bonus:vec(x.permanentBonus),vector:vec(x.highEffective),schedule:x.schedule,conditionalGateCrossings:x.conditionalGateCrossings}));
  if(!frontier.length||frontier.some(x=>[...x.raw,...x.bonus,...x.vector].some(v=>!Number.isSafeInteger(v))))throw Error("Invalid envelope");
  models[id]={origin,order,body,frontier,actualGameCertified:false,scope:"RELAXED_CHRONOLOGICAL_GROWTH_ENVELOPE"};m.numericComputed++;return id;
 }catch{m.numericErrors++;return null;}
}
function visit(t,n,proof,order){
 if(order.length>=depth)return true;
 const sk=key([t.id,order]),remaining=depth-order.length;
 // Completion is specific to this ordered prefix, same immutable engine,
 // same input and limited depth. Never treat it as a global impossibility.
 if((subtrees[sk]||0)>=remaining){m.subtreesReused++;return true;}
 for(const r of byBody.get(member(n).state.soldierType)||[]){
  if(!enough())return false;
  if(!r.requires.every(id=>active(n.world,id))||(r.forbiddenSoldierTypes||[]).includes(member(n).state.soldierType))continue;
  const c=planner.clone(n),ord=[...order,r.id];
  try{planner.supply(c,{items:r.requiredItems||{},functions:r.requiresBaseFunc||[],funds:Math.max(0,r.cost||0)},"Conditional extended-origin transform "+r.id);planner.append(c,{type:"transform",soldier:"origin",transform:r.id});}catch{m.gateRejected++;continue;}
  const s=member(c)?.state;if(!s?.exactStats||s.retired){m.gateRejected++;continue;}
  m.transitions++;
  const rid="PXC12:"+key([t.id,ord]).slice(0,24),canonical=exactStateHash(c.world);
  if(routes[rid]){
   if(routes[rid].canonicalStateHash!==canonical||routes[rid].fullActionHash!==key(c.steps))throw Error("Prior route changed "+rid);
  }else if(oldOrders.has(key([t.id,ord])))m.oldOrderSkipped++;
  else{
   const raw=vec(s.currentStats),bonus=vec(bonusStats(s,data,{commendations:member(c).commendations||{}}));
   const body=bodies.get(s.soldierType),capRaw=raw.map((v,i)=>{const k=STAT_KEYS[i],cap=body.statCaps[k];if(k==="mana"&&!data.growthRules.manaPrimary&&!data.growthRules.manaSecondary)return v;return cap>v?(k==="bravery"?v+10*Math.floor((cap-v)/10):cap):v;});
   const effective=a=>a.map((v,i)=>STAT_KEYS[i]==="psiSkill"&&v<=0&&bonus[i]>0?v:Math.max(STAT_KEYS[i]==="health"?1:0,v+bonus[i]));
   if(![...raw,...bonus,...capRaw].every(Number.isSafeInteger))throw Error("Noninteger vector");
   routes[rid]={input:t.id,kind:t.kind,pair:t.pair,origin:t.record.origin,branch:t.record.branch,root:t.record.root,order:ord,actions:c.steps.slice(t.actions.length),birthActionHash:t.record.fullActionHash,birthProof:proof,fullActionHash:key(c.steps),canonicalStateHash:canonical,stateHash:sha(serialize(c.world)),body:s.soldierType,raw,bonus,vector:effective(raw),capRaw,capVector:effective(capRaw),model:numeric(t.record.origin,ord,s.soldierType),actualGameCertified:false};
   m.newRoutes++;m.bySource[t.kind]=(m.bySource[t.kind]||0)+1;m.originNew[t.record.origin]=(m.originNew[t.record.origin]||0)+1;
  }
  if(!visit(t,c,proof,ord))return false;
 }
 subtrees[sk]=Math.max(subtrees[sk]||0,remaining);
 return true;
}
// Recover quarantined labels only if a fresh verified birth and exact suffix
// independently reproduce their original canonical states and action hashes.
const taskById=new Map(tasks.map(t=>[t.id,t])),recoverByInput=new Map();
for(const [id,r] of Object.entries(routes))if(!r.birthProof.hashMatch&&!birthReceipts[id]){
 const list=recoverByInput.get(r.input)||[];list.push([id,r]);recoverByInput.set(r.input,list);
}
for(const [input,rows] of recoverByInput){
 if(performance.now()-start>=seconds*1000*0.25)break;
 const t=taskById.get(input);if(!t)continue;
 try{
  const {n,proof}=birth(t);
  if(!proof.hashMatch)throw Error("Original birth bytes not reproduced");
  for(const [id,r] of rows){
   try{
    if(proof.canonical!==r.birthProof.canonical)throw Error("Birth semantic state differs");
    const c=planner.clone(n);for(const step of r.actions)planner.append(c,step);
    if(key(c.steps)!==r.fullActionHash||exactStateHash(c.world)!==r.canonicalStateHash)throw Error("Suffix semantic state differs");
    birthReceipts[id]={birthProof:proof,fullActionHash:r.fullActionHash,canonicalStateHash:r.canonicalStateHash,scope:"INDEPENDENT_EXACT_SUFFIX_REPLAY"};
    m.receiptRecovered++;
   }catch{m.receiptUnresolved++;}
  }
 }catch{m.receiptUnresolved+=rows.length;}
}
const grouped=new Map(),count=new Map();
for(const r of Object.values(routes))count.set(r.origin,(count.get(r.origin)||0)+1);
for(const t of tasks){if((complete[t.id]||0)>=depth)continue;const a=grouped.get(t.record.origin)||[];a.push(t);grouped.set(t.record.origin,a);}
const groups=[...grouped].sort(([a],[b])=>(count.get(a)||0)-(count.get(b)||0)||a.localeCompare(b));
for(const [,a] of groups)a.sort((x,y)=>(visits[x.id]||0)-(visits[y.id]||0)||x.id.localeCompare(y.id));
const queue=[];for(let i=0;;i++){let any=false;for(const [,a] of groups)if(a[i]){queue.push(a[i]);any=true;}if(!any)break;}
const quota=Math.max(3,Math.ceil(limit/Math.max(1,groups.length))),perPair=Math.max(2,Math.ceil(quota/2));
for(const t of queue){
 if(timeout()||m.newRoutes>=limit)break;
 const remaining=quota-(m.originNew[t.record.origin]||0);if(remaining<=0)continue;
 pairStop=m.newRoutes+Math.min(remaining,perPair);visits[t.id]=(visits[t.id]||0)+1;m.visited++;
 try{const {n,proof}=birth(t);if(visit(t,n,proof,[])){complete[t.id]=depth;m.completedNow++;}delete unresolved[t.id];}
 catch(err){if(String(err.message).startsWith("Prior route changed"))throw err;m.birthFailures++;unresolved[t.id]={reason:String(err.message),status:"LIMITED_UNRESOLVED"};}
}
const all=Object.values(routes),summary={...m,priorRoutes:before,registeredRoutes:all.length,registeredModels:Object.keys(models).length,registeredOrigins:new Set(all.map(r=>r.origin)).size,registeredPairs:new Set(all.map(r=>r.pair)).size,registeredBranches:new Set(all.map(r=>r.branch)).size,completedInputs:Object.values(complete).filter(x=>x>=depth).length,completedAtAnyDepth:Object.keys(complete).length,requestedDepth:depth,completedByDepth:Object.fromEntries([1,2,3,4,5,6].map(d=>[d,Object.values(complete).filter(x=>x>=d).length])),subtreeRecords:Object.keys(subtrees).length,birthReceipts:Object.keys(birthReceipts).length,inputCount:tasks.length,unresolvedInputs:Object.keys(unresolved).length,seconds:(performance.now()-start)/1000,cache:cache.metrics,actualGameCertified:0,globalOptimalCertified:0};
const result={schemaVersion:1,kind:"POPULATION_EXTENDED_CONTINUATION",engine,hashes,migration,sourceMetadataSha256:db.sourceMetadataSha256,unlockFingerprint:u.fingerprint,eventFingerprint:e.fingerprint,routes,models,visits,complete,unresolved,birthReceipts,subtrees,summary,scope:"Independent replay of exact ordered unlock and event birth actions. Original and current replay hashes retained separately; explicit resource assumptions and conditional cap projection; no gameplay or global optimality proof."};
fs.writeFileSync(file+".tmp",gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(file+".tmp",file);console.log(JSON.stringify(summary));
