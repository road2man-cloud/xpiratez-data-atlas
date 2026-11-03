import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeOriginReport} from './origin-report-codec.mjs';
import {researchBranchEvidence} from '../public/soldiers/modern/origin-branch-evidence.js';
import {replayOriginWitness} from '../public/soldiers/modern/origin-witness.js';

const rules={
 A:{disables:['B']},B:{disables:['A']},
 C:{disables:['B','D']},D:{disables:[]},
 E:{disables:['E']},X:{disables:[]}
};
const replay={
 ok:true,world:{disabled:new Set(['B','D','E'])},
 trace:[
 {index:0,type:'research',id:'A',added:['A'],closed:['B'],reopened:[]},
 {index:1,type:'research',id:'C',added:['C'],closed:['D'],reopened:[]},
 {index:2,type:'research',id:'X',added:['X'],closed:[],reopened:['B']},
 {index:3,type:'research',id:'E',added:[],closed:['E'],reopened:[]},
 {index:4,type:'freeResearch',id:'B',added:[],closed:['B'],reopened:[]}
]};
const choices=researchBranchEvidence(replay,rules);
assert.deepEqual(choices.map(x=>x.id),['A','C','E']);
const a=choices.find(x=>x.id==='A').excludes[0];
assert.equal(a.direction,'bidirectional');
assert.equal(a.closedInStep,true);
assert.equal(a.firstClosedAt,0);
assert.equal(a.reopenedAt,2);
assert.equal(a.closedAtEnd,true);
assert.equal(a.closureTiming,'new-in-step');
const c=choices.find(x=>x.id==='C');
assert.equal(c.excludes[0].closureTiming,'already-closed',
 'A previously closed B; C must not be credited with reopening or newly closing B');
assert.equal(c.excludes[0].closedInStep,false);
assert.equal(c.excludes[1].closureTiming,'new-in-step');
assert.equal(c.excludes[1].direction,'oneway');
const e=choices.find(x=>x.id==='E');
assert.equal(e.excludes[0].direction,'self');
assert.equal(e.excludes[0].closedInStep,true,
 'Self-disabling completed research is absent from the active researched set but must remain an explicit choice');
const later={...replay,world:{disabled:new Set(['D','E'])},
 trace:replay.trace.slice(0,4)};
const aLater=researchBranchEvidence(later,rules).find(x=>x.id==='A').excludes[0];
assert.equal(aLater.closedInStep,true);
assert.equal(aLater.closedAtEnd,false,
 'The final state alone must not erase a genuine earlier one-way/bidirectional closure');

const data=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json','utf8'));
const catalog=JSON.parse(fs.readFileSync('public/data/soldier-source-catalog.json','utf8'));
const ledger=decodeOriginReport(fs.readFileSync('public/data/soldier-origin-candidates.json','utf8'));
data.sourceItemIds=new Set(catalog.itemIds);
data.originRows=ledger.records.map(r=>r.sourceProof);
let verified=0,representatives=0,changes=0,newlyClosed=0,previouslyClosed=0;
const birthCache=new Map();
for(const record of ledger.records){
  for(const [index,candidate] of record.candidates.entries()){
    // The parallel shard gate independently replays EVERY witness; this
    // second gate audits the indexed exclusion corpus and independently
    // samples one real chronology per origin, avoiding a redundant full run.
    const actual=candidate.branchChoices;
    if(index===0){
      const real=replayOriginWitness(candidate.steps,data,{birthCache});
      assert(real.ok,record.profileId+': '+real.reason);
      assert.deepEqual(researchBranchEvidence(real,data.researchRules),actual,
        'The published research branch provenance must match a fresh same-person replay');
      representatives++;
    }
    changes+=actual.length;
    for(const choice of actual){
      assert(data.researchRules[choice.id],
        'Every published exclusion must come from an indexed v.o2 research rule');
      for(const exclusion of choice.excludes){
        assert(data.researchRules[choice.id].disables.includes(exclusion.id),
          'Invented research exclusion: '+choice.id+' -> '+exclusion.id);
        const expected=exclusion.id===choice.id?'self':
          data.researchRules[exclusion.id]?.disables.includes(choice.id)?'bidirectional':'oneway';
        assert.equal(exclusion.direction,expected);
        assert.equal(exclusion.actuallyClosed,exclusion.closedAtEnd);
        if(exclusion.closedInStep)newlyClosed++;
        if(exclusion.closedBeforeStep)previouslyClosed++;
        assert(['self','bidirectional','oneway'].includes(exclusion.direction));
      }
    }
    verified++;
  }
}
assert.equal(verified,ledger.summary.witnesses,'Never drop an agent-added candidate during the proof audit');
assert.equal(representatives,ledger.summary.withCompleteResearch);
console.log('PASS chronological research exclusion: self-disable, one-way vs mutual, earlier closure, later reenable and final closure are distinct');
console.log('PASS v.o2 branch provenance: '+verified+' indexed witnesses / '+representatives+
  ' independently replayed profile examples / '+changes+' branch choices; '+
  newlyClosed+' observed new closures / '+previouslyClosed+' already closed at choice');
