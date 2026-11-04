// Verify that a body requirement exposes every source and preserves each
// independent birth's own mandatory research, materials and occurrence gates.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildAcquisitionSubtree,buildAcquisitionTree}
  from '../public/soldiers/modern/acquisition-condition-tree.js';

const data=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json','utf8'));
assert.equal(data.meta?.mod?.version,'v.o2');
const birthsByBody=new Map();
for(const profile of data.profiles){
  const group=birthsByBody.get(profile.soldierType)||[];
  group.push(profile);birthsByBody.set(profile.soldierType,group);
}
let covered=0,events=0;
for(const [bodyId,births] of birthsByBody){
  const tree=buildAcquisitionSubtree('soldier-body',bodyId,data);
  const body=tree.root.children.find(n=>n.kind==='soldier-body'&&n.id===bodyId);
  assert(body,'Missing soldier-body trace '+bodyId);
  const alternatives=body.children.find(n=>n.id==='BODY_SOURCE:'+bodyId);
  assert.equal(alternatives?.kind,'or','Independent births must be OR');
  assert.deepEqual(alternatives.children.map(n=>n.id),births.map(p=>'BIRTH_SOURCE:'+p.id),
    'Every source must remain reachable, including direct peasant recruitment');
  assert(!alternatives.children.some(n=>n.kind==='source-limit'),
    'No registered birth may disappear behind a dead-end source limit');
  for(const profile of births){
    const full=buildAcquisitionTree(profile,data);
    const children=full.root.children;
    for(const research of profile.requires||[])
      assert(children.some(n=>n.id===research),
        'Birth prerequisite must be independent of other births: '+profile.id+' '+research);
    for(const [material,quantity] of Object.entries(profile.acquisitionRequiredItems||{})){
      const item=children.find(n=>n.id==='REQUIRED_ITEM:'+material);
      assert(item&&item.note.includes(String(quantity))&&item.children[0]?.id===material,
        'Birth material and required physical quantity missing: '+profile.id+' '+material);
    }
    for(const functionId of profile.requiresBaseFunc||[])
      assert(children.some(n=>n.id===functionId),
        'Birth base function missing: '+profile.id+' '+functionId);
    if(profile.sourceType==='event'){
      events++;
      const event=children.find(n=>n.id==='BIRTH_EVENT:'+profile.sourceId);
      assert(event?.kind==='or','Event birth needs its own script alternatives: '+profile.id);
      assert.equal(event.children.length,profile.acquisitionEventScripts?.length||1);
      for(const script of event.children.filter(n=>n.sourceScript))
        assert(script.kind==='and','Event script has simultaneous gates: '+script.id);
    }
    if(profile.cost)assert(children.some(n=>n.kind==='funds'),
      'Birth costs cannot disappear when reaching a body through another path');
    covered++;
  }
}
assert.equal(covered,data.profiles.length);
assert.equal(events,data.profiles.filter(p=>p.sourceType==='event').length);
const peasant=birthsByBody.get('STR_SOLDIER_PEASANT');
assert.equal(peasant.length,9);
assert(peasant.some(p=>p.id==='direct:STR_SOLDIER_PEASANT'));
console.log('PASS '+birthsByBody.size+' soldier bodies / '+covered+
  ' independent birth routes (including peasant 9/9) / '+events+' source-specific event births');
