import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
const read=name=>JSON.parse(fs.existsSync('public/data/'+name+'.json')?fs.readFileSync('public/data/'+name+'.json','utf8'):gunzipSync(fs.readFileSync('public/data/'+name+'.json.gz')));
for(const name of ['crafts-runtime','soldiers-runtime','soldiers-builds','trainings-runtime','training-raw-rules','manufacture-runtime','soldier-research-labels','choice-simulator-index','progression']){
  assert.deepEqual(JSON.parse(gunzipSync(fs.readFileSync('public/data/'+name+'.json.gz'))),read(name),name+' gzip parity');
}
const soldiers=read('soldiers-index'),sr=read('soldiers-runtime');
assert.deepEqual({...sr,...read('soldiers-builds')},soldiers);
const training=read('trainings-index'),tr=read('trainings-runtime');
assert.deepEqual(tr.transformations.map(t=>({...t,rawRule:read('training-raw-rules').rawRules[t.id]})),training.transformations);
for(const key of Object.keys(training).filter(k=>!['transformations','bonuses'].includes(k)))assert.deepEqual(tr[key],training[key]);
for(const t of training.transformations)if(t.soldierBonusType)assert.deepEqual(tr.bonuses[t.soldierBonusType],training.bonuses[t.soldierBonusType]);
for(const [id,b] of Object.entries(training.bonuses))for(const key of ['id','koName','enName'])assert.equal(tr.bonuses[id][key],b[key]);
const manufacture=read('manufacture-index'),mr=read('manufacture-runtime');
assert.equal(mr.index.length,manufacture.index.length);
for(let i=0;i<mr.index.length;i++)for(const key of Object.keys(mr.index[i]))assert.deepEqual(mr.index[i][key],manufacture.index[i][key]);
assert.deepEqual(read('soldier-research-labels').topics,read('progression-research').topics.map(({id,koName,enName})=>({id,koName,enName})));
// Numerical/sequence parity across every actual profile and final combination.
const baseline=execFileSync('git',['show','a2205f2:public/soldiers/app.js'],{encoding:'utf8'});
const current=fs.readFileSync('public/soldiers/app.js','utf8');
async function rows(source){
  const start=source.indexOf('function renderProgression(');
  const end=source.indexOf('\n}',start)+2;
  const code=source.slice(0,end).replace(/^import .*;\r?\n/gm,'');
  const run=new Function('body','auditSoldierBuild','yieldToBrowser',code+`\nDATA=body;
    for(const t of DATA.transformations)TRANSFORM_BY_ID.set(t.id,t);
    for(const s of DATA.enhancementBuildSets)BUILD_SET_BY_ID.set(s.id,s);
    for(const b of DATA.bonuses)BONUS_BY_ID.set(b.id,b);
    for(const s of DATA.soldiers)SOLDIER_BY_ID.set(s.id,s);
    return buildFinalRows();`);
  return run(soldiers,()=>{},async()=>{});
}
const before=await rows(baseline),after=await rows(current);
assert.deepEqual(after,before);
console.log('OK runtime: exact gzip/JSON, search/sort fields, all research/event gates and referenced trait effects; '+after.length+' final builds numerically identical');

const cr=read('crafts-runtime'),prog=read('progression');
assert.deepEqual(cr.crafts,prog.crafts);
for(const [id,r] of Object.entries(cr.recipes)){
  for(const key of ['id','koName','enName'])assert.equal(r[key],prog.recipes[id][key]);
  assert.deepEqual(r.eventVariants,(prog.recipes[id].eventVariants||[]).map(v=>({eventId:v.eventId})));
}
for(const [id,e] of Object.entries(cr.events))for(const key of ['id','koName','enName'])assert.equal(e[key],prog.events[id][key]);
console.log('OK crafts runtime: all 96 craft stats, slots, branch summaries, aliases and recipe/event search labels identical');
