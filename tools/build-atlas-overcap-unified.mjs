// Reuse the worker's already independently replayed lifecycle evidence.
 // Compute a separate conditional growth-cap projection from exact raw
 // endpoint + permanent traits, not an invented second replay certificate.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {STAT_KEYS,bonusStats} from '../public/soldiers/modern/eligibility.js';
import {scalarGrowth} from './population-scalar-upper-bound.mjs';
import {key} from './population-research-career-core.mjs';
const read=n=>JSON.parse(fs.readFileSync('public/data/'+n+'.json'));
const d=read('soldiers-modern-index'),src=read('soldier-overcap-expanded-lifecycle');
const db=JSON.parse(gunzipSync(fs.readFileSync('public/data/branch-soldier-results.json.gz')));
assert.equal(src.sourceMetadataSha256,d.meta.source.metadataSha256);
assert.equal(db.sourceMetadataSha256,src.sourceMetadataSha256);
assert.deepEqual(src.statKeys,STAT_KEYS);
const bodies=new Map(d.soldiers.map(b=>[b.id,b])),profiles=new Set(d.profiles.map(p=>p.id)),rules=new Map(d.transformations.map(r=>[r.id,r])),bonuses=new Set(d.bonuses.map(b=>b.id));
const rows=[],failures=[];
for(const r of src.results){
 assert.equal(r.finalAdmission,false);assert.equal(r.actualGameCertified,false);assert.equal(r.commendationStatsIncluded,false);
 assert.equal(r.status,'CONDITIONAL_LIFECYCLE_COMPLETE');assert.equal(r.conditionalReplayVerified,true);assert.equal(r.soldierBirthReplayed,true);
 const id='OVERCAP:'+key(r.id),traitCounts=Object.fromEntries(r.traits);
 assert(profiles.has(r.origin)&&bodies.has(r.body)&&r.order.every(k=>rules.has(k))&&r.traits.every(([k,n])=>bonuses.has(k)&&Number.isSafeInteger(n)&&n>0));
 assert(r.raw.length===12&&r.raw.every(Number.isSafeInteger));
 assert(r.actions.some(a=>a.type==='recruit'&&a.profile===r.origin&&a.soldier==='origin'));
 assert.deepEqual(r.actions.filter(a=>a.type==='transform'&&a.soldier==='origin').map(a=>a.transform),r.order);
 assert(!r.actions.some(a=>['conditionalMedal','medal','commendation'].includes(a.type)));
 const body=bodies.get(r.body),bonus=bonusStats({bonusIds:new Set(Object.keys(traitCounts))},d,{commendations:{}});
 const effective=raw=>raw.map((v,i)=>{const k=STAT_KEYS[i],b=bonus[k]||0;return k==='psiSkill'&&v<=0&&b>0?v:Math.max(k==='health'?1:0,v+b);});
 const current=effective(r.raw);
 assert.deepEqual(current,r.effective,id);
 assert.equal(current.reduce((s,v)=>s+v,0),r.total);
 const capRaw=r.raw.map((v,i)=>scalarGrowth(body,STAT_KEYS[i],v,d)),cap=effective(capRaw);
 const researchActions=r.actions.flatMap(a=>['research','repeatResearch'].includes(a.type)&&typeof a.id==='string'?[a.id]:['freeResearch','eventResearch','missionResearch'].includes(a.type)&&typeof a.research==='string'?[a.research]:[]);
 rows.push({id,sourceRecordId:r.id,origin:r.origin,body:r.body,order:r.order,current,cap,raw:r.raw,capRaw,branch:null,traits:r.traits.map(([k])=>k),traitCounts,rank:r.rank,medals:{},difficulties:[r.difficulty],hash:key(r.actions),researchActions,sourceReplayVerified:true,capProjection:'SCALAR_GROWTH_FROM_REPLAYED_ENDPOINT',finalAdmission:false,materialBudgetVerified:false,commendationStatsIncluded:false});
}
assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
const report={schema:'ATLAS_OVERCAP_UNIFIED_EXPLORATION_V1',sourceMetadataSha256:src.sourceMetadataSha256,sourceLedgerHash:src.sourceLedgerHash,sourceFile:'soldier-overcap-expanded-lifecycle.json',sourceHash:key(src),summary:{rows:rows.length,capProjected:rows.length,committedBranchVerified:0,final:0},rows,failures};
fs.writeFileSync('public/data/soldier-overcap-unified-exploration.json',JSON.stringify(report)+'\n');
console.log(JSON.stringify(report.summary));
