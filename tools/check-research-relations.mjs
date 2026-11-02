import assert from 'node:assert/strict';import fs from 'node:fs';
import {RESEARCH_TERMS,researchRelations,researchRelationIndex,renderResearchRelations} from '../public/research-relations.js';
const fixture={A:{requires:['B'],dependencies:['C'],unlocks:['D'],disables:['E','F'],getOneFree:['G','G'],getOneFreeProtected:{B:['H']}},B:{},C:{},D:{},E:{disables:['A']},F:{},G:{},H:{}};
const index=researchRelationIndex(fixture),a=researchRelations('A',fixture);
assert.deepEqual(a.requires,['B']);assert.deepEqual(a.dependencies,['C']);
assert.deepEqual(index.B.requiredBy,['A']);assert.deepEqual(index.C.conditionFor,['A']);
assert.deepEqual(index.D.incomingUnlocks,['A']);assert.deepEqual(index.G.incomingUnlocks,[]);
assert.equal(index.G.freeIncoming.length,2,'RNG weight multiplicity must remain visible');
assert.deepEqual(index.H.freeIncoming,[{source:'A',guard:'B'}]);
assert.equal(a.disables.find(x=>x.to==='E').direction,'bidirectional');
assert.equal(a.disables.find(x=>x.to==='F').direction,'oneway');
assert.equal(researchRelations('F',fixture).disables.length,0,'Do not fabricate reverse exclusion');
const rendered=renderResearchRelations('A',fixture);
for(const name of ['무조건 필요','조건 충족','직접 해금','필수로 요구됨','조건으로 사용됨','직접 해금함','무료 지급 후보','무료 지급 출처'])assert(rendered.includes(name));
const current=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json')).researchRules;
const historical=Object.fromEntries(JSON.parse(fs.readFileSync('public/data/choice-simulator-index.json')).topics.map(r=>[r.id,r]));
for(const [version,rules] of [['v.o2',current],['v.o1.1.1 reference',historical]]){
 const inverse=researchRelationIndex(rules);let edges=0;
 for(const [id,r] of Object.entries(rules))for(const [forward,back] of [['requires','requiredBy'],['dependencies','conditionFor'],['unlocks','incomingUnlocks']])
   for(const target of r[forward]||[]){if(!rules[target])continue;assert(inverse[target][back].includes(id),version+' '+id+' '+forward+' '+target);edges++;}
 console.log('PASS research vocabulary and exact reverse fields: '+version+' / '+Object.keys(rules).length+' rules / '+edges+' edges');
}
assert.equal(RESEARCH_TERMS.requires,'무조건 필요');assert.equal(RESEARCH_TERMS.dependencies,'조건 충족');
console.log('PASS free rewards are not unlocks, protected source guards and duplicate weights survive, one-way excludes stay directional');
