// V163: append GDX prison -> direct school unlock -> library -> book production.
// Prior ranked checkpoint is restored, never rewritten or imported as final stats.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {restoreRanked,data,rp,monthly,repeatCash,settle,lab,receipt,active,qty,ranked,rankedPath,read,sha,key,lock} from './atlas-overcap-forward-ranked-checkpoint-v1.mjs';
import {createGdxPrisonLibrary} from './atlas-overcap-forward-gdx-prison-library-v1.mjs';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
const proofPath='tools/data/overcap-gdx-prison-library-source-v1-4565d6263b83cb9c995f.json';
const proof=read(proofPath);assert.equal(proof.engineArchiveSha256,lock.archiveSha256);
const a=createGdxPrisonLibrary(data,rp,proof,sha(fs.readFileSync(proofPath)));
const {s:seed,l:oldLedger}=restoreRanked();
const rules=data.researchRules,training=data.transformations.find(t=>t.id==='STR_ANG_102');
const req={research:training.requires,functions:training.requiresBaseFunc,items:training.requiredItems,cost:training.cost};
const tracked=['STR_GDX_005','STR_LOC_GDX_PRISON_DONE','STR_SCHOOL_BOOKS','STR_LIBRARY','STR_PLOTTING','STR_PILLOW_BOOK','STR_ZOMBIE_DREAMS','STR_CONTACT_MUTANT_ALLIANCE'];
const dreamDirect=rules.STR_ZOMBIE_DREAMS.dependencies;
const snapshot=s=>({month:s.world.month,balance:s.world.funds,researchCount:s.world.researched.size,active:tracked.filter(k=>active(s.world,k)),dreamDirect:dreamDirect.filter(k=>active(s.world,k)),dreamMissing:dreamDirect.filter(k=>!active(s.world,k)),schoolMissing:rules.STR_SCHOOL_BOOKS.dependencies.filter(k=>!active(s.world,k)),libraryBuilt:s.world.facilities.has('STR_LIBRARY'),lib:s.world.baseFunctions.has('LIB'),culture:s.world.baseFunctions.has('CULT'),stock:Object.fromEntries(['STR_GDX_005','STR_PILLOW_BOOK','STR_PORN','STR_VAMPIRE_ESSENCE','STR_ZOMBIE_ESSENCE'].map(k=>[k,qty(s.world,k)])),trainingMissing:rp.missing(s,req)});
function step(s,act){
 if(act.type==='sourceMonthlyBoundary')return monthly.advance(s,act);
 if(act.type==='sourceMonthlyFixedReward'){
  assert.equal(act.event,'STR_MAXIMUM_EXPLOITATION');
  return repeatCash.apply(s,act);
 }
 if(['sourceGdxPrisonDocumentRecovery','sourceStartLibrary','sourceCompleteLibrary','sourceManufactureImplicitBook'].includes(act.type))return a.apply(s,act);
 if(act.type==='missionResearch'){
  assert.deepEqual(act,a.missionAction);assert.equal(s.actions.at(-1)?.type,'sourceMonthlyBoundary');
  return rp.research(s,act);
 }
 return rp.research(s,act);
}
let state=seed;const steps=[],errors=[];
function produce(label,fn){
 const prev=state;
 try{
  const next=fn(prev);assert.deepEqual(next.actions.slice(0,prev.actions.length),prev.actions);
  for(const [k,n] of Object.entries(req.items))assert(qty(next.world,k)>=n,'Reserved training stock deficit: '+k);
  state=next;
  steps.push({label,added:next.actions.length-prev.actions.length,newResearch:[...next.world.researched].filter(k=>!prev.world.researched.has(k)&&active(next.world,k)),before:snapshot(prev),after:snapshot(next),status:next===prev?'ALREADY_MET':'PRODUCED'});
 }catch(e){errors.push({label,reason:String(e.message)});}
}
produce('GDX prison victory and fixed document recovery',s=>{
 const prev=s;s=monthly.advance(s);
 assert(rp.options(s).some(o=>JSON.stringify(o.action)===JSON.stringify(a.missionAction)));
 s=rp.research(s,a.missionAction);assert(active(s.world,'STR_LOC_GDX_PRISON_DONE'));
 const opt=a.recoveryOption(s);assert(opt,'Document recovery not available');
 s=a.apply(s,opt);assert.equal(qty(s.world,'STR_GDX_005'),qty(prev.world,'STR_GDX_005')+1);assert.equal(a.recoveryOption(s),null);return s;
});
produce('GDX document research',s=>{
 const n=lab(s,'STR_GDX_005');assert(active(n.world,'STR_GDX_005'));assert.equal(qty(n.world,'STR_GDX_005'),qty(s.world,'STR_GDX_005')-1);return n;
});
produce('School books via explicit GDX unlock',s=>{
 assert(active(s.world,'STR_GDX_005'));
 const o=rp.options(s).find(o=>o.action.type==='research'&&o.action.id==='STR_SCHOOL_BOOKS');
 assert(o,'Explicit school unlock unavailable');
 assert.equal(o.evidence.kind,'EXPLICIT_UNLOCK');assert(o.evidence.requires.includes('STR_GDX_005'));
 const n=lab(s,'STR_SCHOOL_BOOKS');
 assert(active(n.world,'STR_SCHOOL_BOOKS'));assert(n.world.disabled.has('STR_GDX_190_PREQ'));return n;
});
produce('Library research',s=>{const n=lab(s,'STR_LIBRARY');assert(active(n.world,'STR_LIBRARY'));return n;});
for(let i=0;i<3&&state.world.funds<a.buildCost+a.bookCost;i++){
 const old=state.world.funds;
 produce('Library funding installment '+(i+1),s=>{
  const prev=s;s=monthly.advance(s);
  const o=repeatCash.options(s)[0];assert(o,'Funding event unavailable');
  const n=settle(repeatCash.apply(s,o.action));assert.equal(n.world.funds,prev.world.funds+500000);return n;
 });
 if(state.world.funds<=old)break;
}
produce('Library construction and completion',s=>{
 if(s.world.baseFunctions.has('LIB'))return s;
 const prev=s,opt=a.startOption(s);assert(opt,'Library build unavailable');
 s=a.apply(s,opt);assert(!s.world.baseFunctions.has('LIB'));
 s=monthly.advance(s);const completion=a.completeOption(s);assert(completion);
 s=a.apply(s,completion);assert(s.world.baseFunctions.has('LIB'));
 assert.equal(s.world.funds,prev.world.funds-a.buildCost);return s;
});
produce('Plotting research',s=>{const n=lab(s,'STR_PLOTTING');assert(active(n.world,'STR_PLOTTING'));return n;});
produce('Implicit-output book manufacture',s=>{
 const prev=s,opt=a.bookOption(s);assert(opt,'Book recipe unavailable');
 s=a.apply(s,opt);
 assert.equal(qty(s.world,'STR_PILLOW_BOOK'),qty(prev.world,'STR_PILLOW_BOOK')+1);
 assert.equal(qty(s.world,'STR_PORN'),qty(prev.world,'STR_PORN')-3);
 assert.equal(s.world.funds,prev.world.funds-50);return s;
});
produce('Pillow book research',s=>{
 const prev=s,o=rp.options(s).find(o=>o.action.type==='research'&&o.action.id==='STR_PILLOW_BOOK');assert(o,'Book research unavailable');
 let n=rp.research(s,o.action);
 for(let i=0;!rp.settled(n);i++){
  assert(i<60);const options=rp.options(n);
  // Prefer the next known mythology gate if it is an actual free candidate.
  const p=options.find(o=>o.action.type==='freeResearch'&&o.action.research==='STR_GODS_E7')||options[0];
  assert(p);n=rp.research(n,p.action);
 }
 assert(active(n.world,'STR_PILLOW_BOOK'));assert.equal(qty(n.world,'STR_PILLOW_BOOK'),qty(prev.world,'STR_PILLOW_BOOK')-1);return n;
});
const before=snapshot(seed),after=snapshot(state),newActions=state.actions.slice(seed.actions.length);
let restored=restoreRanked().s;
for(const action of newActions)restored=step(restored,action);
assert.equal(exactStateHash(restored.world),exactStateHash(state.world));
assert.deepEqual(receipt(restored),receipt(state));
const groupRefs=ranked.groupRefs.map(g=>({...g,checkpointRef:'continuation',status:'SHARED_CHECKPOINT_ADVANCED'}));
const summary={legacyGoals:new Set(groupRefs.flatMap(g=>g.goals)).size,careerGroups:groupRefs.length,newActions:newActions.length,newResearch:[...state.world.researched].filter(k=>!seed.world.researched.has(k)&&active(state.world,k)).length,successfulMilestones:steps.filter(s=>s.status==='PRODUCED').length,gdx005:active(state.world,'STR_GDX_005'),school:active(state.world,'STR_SCHOOL_BOOKS'),allianceStillAbsent:!active(state.world,'STR_CONTACT_MUTANT_ALLIANCE'),libraryResearch:active(state.world,'STR_LIBRARY'),libraryBuilt:after.libraryBuilt,plotting:active(state.world,'STR_PLOTTING'),bookManufactured:steps.some(s=>s.label==='Implicit-output book manufacture'&&s.status==='PRODUCED'),bookResearch:active(state.world,'STR_PILLOW_BOOK'),dreamDirectBefore:before.dreamDirect.length,dreamDirectAfter:after.dreamDirect.length,actualGameCertified:0,finalAdmission:0};
const report={schema:'ATLAS_OVERCAP_GDX_PRISON_LIBRARY_WAVE_V1',scope:'Conditional selected monthly chronology, exact document/recipe/stock/cash transitions and native explicit-unlock semantics. No tactical, full economy, laboratory duration or complete regional score certification. V162 score ledger is preserved, not extended into this new interval.',sourceMetadataSha256:data.meta.source.metadataSha256,engineArchiveSha256:lock.archiveSha256,checkpointPath:rankedPath,checkpointSha256:sha(fs.readFileSync(rankedPath)),proofPath,proofSha256:sha(fs.readFileSync(proofPath)),summary,before,after,steps,errors,newActions,priorScoreLedgerAnchor:oldLedger.anchor,scoreCoverage:'NOT_EXTENDED_AFTER_V162',continuation:receipt(state),groupRefs,actualGameCertified:false,normalizationComplete:false};
const out='tools/data/overcap-gdx-prison-library-wave-v1-'+key(report).slice(0,20)+'.json.gz';
if(fs.existsSync(out))assert.deepEqual(read(out),report);else fs.writeFileSync(out,gzipSync(JSON.stringify(report)+'\n'),{flag:'wx'});
console.log(JSON.stringify({out,summary,before,after,steps:steps.map(s=>({label:s.label,added:s.added,newResearch:s.newResearch})),errors,bytes:fs.statSync(out).size}));
