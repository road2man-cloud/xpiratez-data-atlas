// Independent semantic checks for v.o1.1.1-only research path rendering.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createLegacyResearchTechAdapter} from '../public/research/acquisition-tech-adapter.js';

const data=JSON.parse(fs.readFileSync('public/research/acquisition-index.json','utf8'));
const topics=data.topics;
assert.equal(data.meta.sourceVersion,'v.o1.1.1');
assert.equal(Object.keys(topics).length,4612);
assert(topics.STR_SDD_CONTROL.requiresBaseFunc.includes('CPU'),
  'The genuine legacy base-function gate must remain visible');
const graph=createLegacyResearchTechAdapter(data,'STR_SDD_CONTROL');
const rootMethods=graph.expand(graph.root);
const lab=rootMethods.children.find(x=>x.id==='LAB:STR_SDD_CONTROL');
assert(lab,'Research laboratory method missing');
const gates=graph.expand(lab);
assert.equal(gates.relation,'and');
assert(gates.children.some(x=>x.kind==='facility-function'&&x.id==='CPU'));
const access=gates.children.find(x=>x.id==='ACCESS:STR_SDD_CONTROL');
assert(access,'Nominal prerequisite access must be represented');
const alternatives=graph.expand(access);
const deps=alternatives.children.find(x=>x.id==='DEPENDENCIES:STR_SDD_CONTROL');
assert(deps,'Nominal AND prerequisite gate must exist');
const prereqs=graph.expand(deps);
assert.equal(prereqs.relation,'and');
assert.equal(prereqs.children.length,topics.STR_SDD_CONTROL.dependencies.length);

// Find an actual ordinary AND-vs-unlock OR, excluding source research that
// disables the target. Do not silently accept a self-contradictory shortcut.
const candidate=Object.entries(topics).flatMap(([source,r])=>r.unlocks.map(target=>({source,target})))
  .find(({source,target})=>topics[target]?.dependencies.length&&
    !topics[source].disables.includes(target)&&!topics[source].disables.includes(source));
assert(candidate,'No viable direct-unlock example in source');
const trace=createLegacyResearchTechAdapter(data,candidate.target);
const plain=trace.expand(trace.root).children.find(x=>x.id==='LAB:'+candidate.target);
const choice=trace.expand(plain).children.find(x=>x.id==='ACCESS:'+candidate.target);
assert(choice,'An alternative direct-unlock access choice must exist');
const unlocked=trace.expand(choice);
assert.equal(unlocked.relation,'or');
assert(unlocked.children.some(x=>x.source===candidate.source));
assert(unlocked.children.some(x=>x.id==='DEPENDENCIES:'+candidate.target));
const unlocker=unlocked.children.find(x=>x.source===candidate.source);
assert.equal(trace.expand(unlocker).relation,'and');
const unsafeSources=Object.entries(topics).flatMap(([source,r])=>r.unlocks
  .filter(target=>topics[target]&&(r.disables.includes(target)||r.disables.includes(source)))
  .map(target=>({source,target})));
for(const {source,target} of unsafeSources){
  const selected=createLegacyResearchTechAdapter(data,target);
  const methods=selected.expand(selected.root).children;
  const researchRoute=methods.find(x=>x.id==='LAB:'+target);
  const access=selected.expand(researchRoute).children.find(x=>x.id==='ACCESS:'+target);
  if(access)assert(!selected.expand(access).children.some(x=>x.source===source),
    'A self-disabling or target-disabling unlock source must not appear as a viable OR path');
}

// Free research is a candidate draw, not a guaranteed grant.
const granting=Object.entries(topics).flatMap(([source,r])=>r.getOneFree.map(target=>({source,target})))
  .find(({target})=>topics[target]);
assert(granting,'Expected original free-research candidates');
const freeGraph=createLegacyResearchTechAdapter(data,granting.target);
const freeRoute=freeGraph.expand(freeGraph.root).children.find(x=>x.source===granting.source);
assert(freeRoute,'Grant source not shown');
assert(freeGraph.expand(freeRoute).children.some(x=>x.kind==='random-free'));
assert.match(freeGraph.describe(freeRoute).detail,/보장 아님/);

// A route must fail closed on an invalid index rather than borrowing v.o2 rules.
assert.throws(()=>createLegacyResearchTechAdapter({meta:{schemaVersion:999},topics},'STR_SDD_CONTROL'));
const proof=trace.renderEvidence(trace.root);
assert(proof.includes('v.o1.1.1')&&proof.includes(candidate.target));
const sampleTree=createLegacyResearchTechAdapter(data,'STR_FUNGUS_OUTBREAK');
const sampleLab=sampleTree.expand(sampleTree.root).children.find(n=>n.id==='LAB:STR_FUNGUS_OUTBREAK');
const specimen=sampleTree.expand(sampleLab).children.find(n=>n.kind==='item');
assert(specimen);
assert.equal(sampleTree.linkForNode(specimen).href,
  '../items/#item=STR_FUNGUS_OUTBREAK');
console.log('PASS legacy research tech: 4612 source-derived topics, mandatory base function, AND dependency, unlock OR, conditional grant RNG, unsafe-unlocker exclusion, version-isolated evidence');
