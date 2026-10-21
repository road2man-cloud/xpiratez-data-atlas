import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {enumerateConversionRoutes} from '../public/soldiers/conversion-routes.js';
const read=name=>JSON.parse(fs.existsSync('public/data/'+name+'.json')?fs.readFileSync('public/data/'+name+'.json','utf8'):gunzipSync(fs.readFileSync('public/data/'+name+'.json.gz')));
for(const name of ['crafts-runtime','soldiers-runtime','soldiers-builds','trainings-runtime','training-raw-rules','manufacture-runtime','manufacture-search','soldier-research-labels','choice-simulator-index','progression']){
  assert.deepEqual(JSON.parse(gunzipSync(fs.readFileSync('public/data/'+name+'.json.gz'))),read(name),name+' gzip parity');
}
const soldiers=read('soldiers-index'),sr=read('soldiers-runtime');
assert.deepEqual({...sr,...read('soldiers-builds')},soldiers);
const training=read('trainings-index'),tr=read('trainings-runtime');
assert.deepEqual(tr.transformations.map(({needsCorpseRecovered,...t})=>({...t,rawRule:read('training-raw-rules').rawRules[t.id]})),training.transformations);
for(const t of tr.transformations)assert.equal(t.needsCorpseRecovered,read('training-raw-rules').rawRules[t.id]?.needsCorpseRecovered===true,t.id+' corpse recovery gate');
for(const key of Object.keys(training).filter(k=>!['transformations','bonuses'].includes(k)))assert.deepEqual(tr[key],training[key]);
for(const t of training.transformations)if(t.soldierBonusType)assert.deepEqual(tr.bonuses[t.soldierBonusType],training.bonuses[t.soldierBonusType]);
for(const [id,b] of Object.entries(training.bonuses))for(const key of ['id','koName','enName'])assert.equal(tr.bonuses[id][key],b[key]);
const manufacture=read('manufacture-index'),mr=read('manufacture-runtime');
assert.equal(mr.index.length,manufacture.index.length);
for(const row of manufacture.index)assert.equal(read('manufacture-search').search[row.id],row.searchText);
for(let i=0;i<mr.index.length;i++)for(const key of Object.keys(mr.index[i]))assert.deepEqual(mr.index[i][key],manufacture.index[i][key]);
assert.deepEqual(read('soldier-research-labels').topics,read('progression-research').topics.map(({id,koName,enName})=>({id,koName,enName})));
// Numerical/sequence parity across every actual profile and final combination.
const baseline=execFileSync('git',['show','a2205f2:public/soldiers/app.js'],{encoding:'utf8'});
const current=fs.readFileSync('public/soldiers/app.js','utf8');
const sourceConditions=Object.fromEntries(tr.transformations.map(t=>[t.id,t.allowsLiveSoldiers]));
async function rows(source){
  const start=source.indexOf('function renderProgression(');
  const end=source.indexOf('\n}',start)+2;
  const code=source.slice(0,end).replace(/^import .*;\r?\n/gm,'');
  const run=new Function('body','auditSoldierBuild','yieldToBrowser','enumerateConversionRoutes','sourceConditions',code+`\nDATA=body;
    if(typeof CONVERSION_TRANSFORMS!=="undefined")
      CONVERSION_TRANSFORMS=DATA.transformations.map(t=>({...t,allowsLiveSoldiers:sourceConditions[t.id]}));
    for(const t of DATA.transformations)TRANSFORM_BY_ID.set(t.id,t);
    for(const s of DATA.enhancementBuildSets)BUILD_SET_BY_ID.set(s.id,s);
    for(const b of DATA.bonuses)BONUS_BY_ID.set(b.id,b);
    for(const s of DATA.soldiers)SOLDIER_BY_ID.set(s.id,s);
    return buildFinalRows();`);
  return run(soldiers,()=>{},async()=>{},enumerateConversionRoutes,sourceConditions);
}
const before=await rows(baseline),after=await rows(current);
// Conversion enumeration now includes additional ordered, legal multi-step
// routes. Every historical one-stage final build must retain its exact
// numerical result, but its generated row ID/order may legitimately change.
const signature=row=>row.profile.id+"|"+row.combo.transformationIds.join(",");
const afterBySignature=new Map();
for(const row of after){
  const key=signature(row);
  if(!afterBySignature.has(key))afterBySignature.set(key,[]);
  afterBySignature.get(key).push(row);
}
const numericKeys=["finalSoldierType","finalStats","finalRawStats","finalCap",
  "deltaByBand","preGrowthByBand","cost","recoveryTime","totalTraitCount"];
let unchanged=0;
for(const old of before){
  const matched=(afterBySignature.get(signature(old))||[]).some(row=>
    numericKeys.every(key=>JSON.stringify(row[key])===JSON.stringify(old[key])));
  assert(matched,"Historical final build changed or vanished: "+signature(old));
  unchanged++;
}
const oldSignatures=new Set(before.map(signature));
const newRows=after.filter(row=>!oldSignatures.has(signature(row)));
const converterIds=new Set(soldiers.transformations.filter(t=>t.producedSoldierType).map(t=>t.id));
assert(newRows.length>0,"No additional conversion paths added");
for(const row of newRows)
  assert(row.combo.transformationIds.filter(id=>converterIds.has(id)).length>=2,
    "Additional final build lacks multiple valid type changes: "+signature(row));
console.log("OK runtime: exact gzip/JSON and all historical "+unchanged+
  " final builds numerically preserved, "+newRows.length+" new sequential conversion builds");

const cr=read('crafts-runtime'),prog=read('progression');
assert.deepEqual(cr.crafts,prog.crafts);
for(const [id,r] of Object.entries(cr.recipes)){
  for(const key of ['id','koName','enName'])assert.equal(r[key],prog.recipes[id][key]);
  assert.deepEqual(r.eventVariants,(prog.recipes[id].eventVariants||[]).map(v=>({eventId:v.eventId})));
}
for(const [id,e] of Object.entries(cr.events))for(const key of ['id','koName','enName'])assert.equal(e[key],prog.events[id][key]);
console.log('OK crafts runtime: all 96 craft stats, slots, branch summaries, aliases and recipe/event search labels identical');
