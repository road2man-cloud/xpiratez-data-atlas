import fs from 'node:fs';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {ledgers,project} from '../public/branch-soldier-atlas-career-core.js';
import {unpackOptions,compareBranches,sameChoices,diffSets} from '../public/branch-soldier-atlas-branch-compare-core.js';
const read=n=>fs.readFileSync(new URL('../public/data/'+n,import.meta.url));
const source=read('branch-soldier-results.json.gz'),db=JSON.parse(gunzipSync(source));
const packed=JSON.parse(read('soldier-atlas-branch-options.json')),raw=JSON.parse(gunzipSync(Buffer.from(packed.payload,'base64')));
assert.equal(createHash('sha256').update(packed.payload).digest('hex'),packed.sha256);
assert.equal(createHash('sha256').update(source).digest('hex'),raw.sourceRegistrySha256,'Regenerate branch options from updated registry');
const branches=unpackOptions(raw,db.sourceMetadataSha256);
assert.equal(branches.size,db.branches.length);assert.equal(branches.size,packed.count);
for(const b of db.branches){const x=branches.get(b.id);assert.deepEqual(x.captain,b.captain);assert.deepEqual(x.choices,b.choices);assert.deepEqual(x.blockedResearch,b.blockedResearch||[]);assert.deepEqual(x.blockedRoots,b.blockedRoots||[]);assert.equal(x.sourceRootConflict,!!b.sourceRootConflict);assert.equal(x.historyCount,b.historyCount);}
const rows=ledgers.flatMap(s=>project(s,JSON.parse(gunzipSync(read(s.file+'.json.gz'))),db.sourceMetadataSha256).rows);
const covered=[...new Set(rows.map(r=>r.branch))];
assert(covered.every(id=>branches.has(id)));
let example;
for(const a of covered){for(const b of covered){if(a===b||!sameChoices(branches.get(a),branches.get(b)))continue;const c=compareBranches(rows,a,b,{metric:'cap',stat:'firing'});if(c.matched.length){example={a,b,c};break;}}if(example)break;}
assert(example,'Need a same-choice matched branch pair');
for(const m of example.c.matched){
 assert.equal(m.a.origin,m.b.origin);assert.equal(m.a.body,m.b.body);assert(m.a.difficulties.includes(m.difficulty)&&m.b.difficulties.includes(m.difficulty));assert.equal(m.av-m.bv,m.delta);
 const candidates=rows.filter(r=>r.origin===m.origin&&r.body===m.body&&r.difficulties.includes(m.difficulty));
 for(const [id,v] of [[example.a,m.av],[example.b,m.bv]])assert.equal(v,Math.max(...candidates.filter(r=>r.branch===id).map(r=>r.cap[5])));
}
const sample=example.c.matched[0];
const fixture=[{...sample.a,difficulties:[0],traits:null},{...sample.b,difficulties:[1],traits:['TEST_TRAIT']}];
const disjoint=compareBranches(fixture,example.a,example.b,{metric:'cap',stat:'total'});
assert.equal(disjoint.matched.length,0);assert.equal(disjoint.groupOnlyA,1);assert.equal(disjoint.groupOnlyB,1);assert.equal(disjoint.measuredA,0);assert.deepEqual(disjoint.sets.trait.onlyB,['TEST_TRAIT']);
assert.throws(()=>compareBranches(rows,example.a,example.a));
assert.deepEqual(diffSets(new Set(['a','b']),new Set(['b','c'])),{common:['b'],onlyA:['a'],onlyB:['c']});
console.log(JSON.stringify({branches:branches.size,covered:covered.length,rows:rows.length,historyBranches:[...branches.values()].filter(b=>b.historyCount>0).length,example:{a:example.a,b:example.b,rankA:branches.get(example.a).rank,rankB:branches.get(example.b).rank,matched:example.c.matched.length,first:{origin:sample.origin,body:sample.body,difficulty:sample.difficulty,firingA:sample.av,firingB:sample.bv}},status:'passed'},null,2));
