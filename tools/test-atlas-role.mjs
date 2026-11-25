import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {ledgers,project,statKeys} from '../public/branch-soldier-atlas-career-core.js';
import {roles,roleAxes,roleFrontier,recommend,lexCompare} from '../public/branch-soldier-atlas-role-core.js';
const make=(key,values,extra={})=>{const cap=statKeys.map(k=>values[k]??0);return {key,origin:'O',body:'B',branch:'X',difficulties:[0],cap,current:cap.slice(),...extra}};
const a=make('a',{firing:120,tu:80,reactions:60,stamina:100});
const b=make('b',{firing:110,tu:100,reactions:60,stamina:100});
const dominated=make('c',{firing:100,tu:80,reactions:50,stamina:90});
const tied=make('d',{firing:120,tu:80,reactions:60,stamina:100},{branch:'Y'});
const otherDifficulty=make('e',{firing:10},{difficulties:[1]});
const otherBody=make('f',{firing:1},{body:'C'});
const unknown=make('g',{firing:999},{difficulties:[]});
const all=[a,b,dominated,tied,otherDifficulty,otherBody,unknown];
const axes=roleAxes('shooter');
const front=roleFrontier(all,'cap',axes);
assert.deepEqual([...front.keys()].sort(),['a','b','d','e','f']);
assert.deepEqual([...front.get('e')],[1]);
assert.equal(recommend([a,b],{role:'shooter',primary:'tu'}).rows[0].key,'b');
assert.equal(recommend(all,{role:'shooter',minima:{firing:120},pareto:true}).rows.length,2);
assert.equal(recommend([a,tied],{role:'shooter',representative:true}).rows.length,2);
assert.equal(recommend([a,{...a,key:'z'}],{role:'shooter',representative:true}).rows.length,1);
assert.equal(recommend([a,b],{role:''}).rows.length,2);
const read=n=>JSON.parse(fs.readFileSync(new URL('../public/data/'+n+'.json',import.meta.url)));
const gz=n=>JSON.parse(gunzipSync(fs.readFileSync(new URL('../public/data/'+n+'.json.gz',import.meta.url))));
const metadata=read('soldiers-modern-index').meta.source.metadataSha256;
const rows=ledgers.flatMap(s=>project(s,gz(s.file),metadata).rows);
const summary={};
for(const [role,preset] of Object.entries(roles)){
 const result=recommend(rows,{role,pareto:true});
 const ranked=recommend(rows,{role});
 assert.equal(ranked.rows.length,rows.length);
 assert(ranked.rows.every((r,i)=>!i||lexCompare(ranked.rows[i-1],r,'cap',preset.axes)<=0));
 assert(result.rows.every(r=>result.frontier.get(r.key)?.size));
 // Compare each surviving vector with every record of the same body/difficulty.
 const ix=preset.axes.map(k=>statKeys.indexOf(k));
 const group=new Map();
 for(const r of rows)for(const d of r.difficulties){const key=r.body+'|'+d;if(!group.has(key))group.set(key,[]);group.get(key).push(r);}
 for(const r of result.rows)for(const d of result.frontier.get(r.key)){
  assert(!(group.get(r.body+'|'+d)||[]).some(o=>ix.every(i=>o.cap[i]>=r.cap[i])&&ix.some(i=>o.cap[i]>r.cap[i])));
 }
 const top=ranked.rows[0];
 summary[role]={frontier:result.frontierCount,topValue:top.cap[statKeys.indexOf(preset.axes[0])],topOrigin:top.origin,topBody:top.body};
}
console.log(JSON.stringify({rows:rows.length,roleCount:Object.keys(roles).length,summary,status:'passed'},null,2));
