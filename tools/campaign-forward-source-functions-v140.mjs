// V140: narrow the old unknown-geography model only when all source rules
// and the locked native engine prove geography supplies no base functions.
// This is a conditional, source-backed model, not a native game certification.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const sha=b=>createHash('sha256').update(b).digest('hex');
const equal=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
export function createSourceFunctionGate(data,snapshot,raw,base,root,game){
 const dir=path.join(root,'tools/headless-simulator/native'),lock=JSON.parse(fs.readFileSync(path.join(dir,'source.lock.json'),'utf8')),archive=path.join(dir,lock.archive);
 assert.equal(sha(fs.readFileSync(archive)),lock.archiveSha256);
 const cpp=p=>execFileSync('tar',['--force-local','-xOf',archive,'./src/'+p],{encoding:'utf8',maxBuffer:8*1024*1024});
 for(const t of ['Country','Region']){
  const impl=cpp('Mod/Rule'+t+'.cpp'),header=cpp('Mod/Rule'+t+'.h');
  assert(impl.includes('reader["provideBaseFunc"]')&&impl.includes('reader["forbiddenBaseFunc"]'));
  assert(header.includes('_provideBaseFunc = 0;')&&header.includes('_forbiddenBaseFunc = 0;'));
 }
 const baseCpp=cpp('Savegame/Base.cpp');
 assert(baseCpp.includes('country->getRules()->getProvidedBaseFunc()')&&baseCpp.includes('region->getRules()->getProvidedBaseFunc()')&&baseCpp.includes('ret |= _provideBaseFunc;'));
 const yaml=createRequire(path.join(root,'package.json'))('js-yaml');
 const files={},counts={countries:0,regions:0};
 function inspect(p,expected,key){
  const bytes=fs.readFileSync(p);assert.equal(sha(bytes),expected,'geography source changed:'+key);files[key]=expected;
  const doc=yaml.load(bytes.toString('utf8'),{json:true})||{};
  for(const k of ['countries','regions'])for(const r of doc[k]||[]){
   if(r.delete)continue;
   counts[k]++;
   assert(!Object.keys(r).some(k=>/func|refNode|inherit/i.test(k)),'geography base function or inheritance requires new proof:'+r.type);
  }
 }
 const std={'countries.rul':'fabc6663a081db3c06b76f87eee04e6fc031a3a6316c0ae2e3594a923e1a5ddd','regions.rul':'0f2c119b2834e9cf4652df6945ee74bd99bf7b2af79ec2ebd5d7bf8606e8f77b'};
 for(const [f,h] of Object.entries(std))inspect(path.join(game,'standard/xcom1',f),h,'standard/'+f);
 const moddir=path.join(game,'user/mods/Piratez/Ruleset');
 assert.deepEqual(fs.readdirSync(moddir).filter(f=>f.endsWith('.rul')).sort(),data.meta.source.rules.map(r=>r.file).sort());
 for(const r of data.meta.source.rules)inspect(path.join(moddir,r.file),r.sha256,'mod/'+r.file);
 assert(counts.countries>0&&counts.regions>0);
 const proof={type:'sourceBoundBaseFunctions',assumeSameBase:true,assumeCompleteFacilityState:true,geographyProvides:[],geographyForbids:[],sourceSetSha256:sha(JSON.stringify(Object.entries(files).sort())),nativeArchiveSha256:lock.archiveSha256};
 function verifyFunctions(w){
  const functions=new Set();
  for(const id of w.facilities){const r=raw.facilities[id];assert(r,'unknown facility:'+id);for(const f of r.provideBaseFunc||[])functions.add(f);}
  assert(equal(functions,w.baseFunctions),'facility-only function set mismatch');
 }
 function apply(w,a){
  try{
   if(a.type==='sourceBoundBaseFunctions'){
    assert.deepEqual(a,proof);assert.equal(w.sourceFingerprint,snapshot.sourceFingerprint);assert(!w.pendingFree&&!w.sourceBoundFunctions);
    assert(w.autoZeroEvidence===true&&w.activeResearch instanceof Set);
    verifyFunctions(w);
    const z=structuredClone(w);
    z.sourceBoundFunctions={sourceSetSha256:proof.sourceSetSha256,nativeArchiveSha256:lock.archiveSha256,counts,geographyProvides:[],geographyForbids:[],conditionalSameBase:true};
    // The existing speculative mode calculates the exact supplied function
    // set, but remains explicitly conditional; do not change old graph states.
    z.autoZeroScenario=true;z.baseFunctionsKnown=true;
    return {ok:true,world:z,assumed:true,notes:['all-source-geography-function-fields-absent','known-facility-union-only','conditional-same-base-queue-model-not-native-certified']};
   }
   if(w.sourceBoundFunctions){
    assert.equal(w.sourceBoundFunctions.sourceSetSha256,proof.sourceSetSha256);verifyFunctions(w);
    const result=base.apply(w,a);
    if(result.ok)verifyFunctions(result.world);
    return result.ok?{...result,assumed:true}:result;
   }
   return base.apply(w,a);
  }catch(e){return {ok:false,world:w,reason:String(e.message||e)};}
 }
 return {apply,proof,counts,files};
}
