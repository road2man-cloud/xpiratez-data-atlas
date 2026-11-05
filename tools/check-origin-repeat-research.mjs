// Repeat projects must be separate, validated lab actions with fresh RNG tokens.
import assert from 'node:assert/strict';
import {foundationWorld,applyOriginWitnessStep} from '../public/soldiers/modern/origin-witness.js';
import {createFoundationResearchPlanner} from '../public/soldiers/modern/foundation-research-planner.js';
const rule=(extra={})=>({requires:[],dependencies:[],disables:[],reenables:[],unlocks:[],
  lookup:null,getOneFree:[],getOneFreeProtected:{},requiresBaseFunc:[],cost:1,
  needItem:false,destroyItem:false,sequentialGetOneFree:false,repeatable:false,...extra});
const makeData=()=>({researchRules:{
  GUARD:rule(),SOURCE:rule({cost:5,needItem:true,neededItem:'SAMPLE',destroyItem:true,
    getOneFreeProtected:{GUARD:['A','B']}}),
  A:rule({cost:0,needItem:true,neededItem:'A'}),B:rule({cost:0,needItem:true,neededItem:'B'})
},profiles:[],transformations:[],sourceItemIds:new Set(['SAMPLE']),eventResearchSources:{},missionResearchSources:{}});
const data=makeData();
const apply=(world,step)=>{
  const out=applyOriginWitnessStep(world,step,data);
  assert(out.ok,out.reason);return out.world;
};
let world=foundationWorld();
world=apply(world,{type:'externalInputs',items:{SAMPLE:2},assumption:true,reason:'Synthetic two distinct specimens'});
world=apply(world,{type:'research',id:'GUARD'});
world=apply(world,{type:'research',id:'SOURCE'});
assert.equal(world.items.SAMPLE,1,'The first research consumes its specimen');
assert(world.pendingFree?.choices.includes('A'));
world=apply(world,{type:'freeResearch',source:'SOURCE',research:'A',assumeOutcome:true});
assert(world.researched.has('SOURCE')&&world.researched.has('A'));
assert.equal(applyOriginWitnessStep(world,{type:'freeResearch',source:'SOURCE',research:'B',assumeOutcome:true},data).ok,false,
  'The old one-off payout token cannot be reused');
assert.equal(applyOriginWitnessStep(world,{type:'research',id:'SOURCE'},data).ok,false,
  'Ordinary research may not silently claim repeatability');
assert.equal(applyOriginWitnessStep(world,{type:'repeatResearch',id:'SOURCE'},data).ok,false,
  'Availability assumptions must be explicitly marked');
const noSample=structuredClone(world);noSample.items.SAMPLE=0;
assert.equal(applyOriginWitnessStep(noSample,{type:'repeatResearch',id:'SOURCE',assumeAvailability:true},data).ok,false);
const busy=structuredClone(world);busy.activeResearch.add('SOURCE');
assert.equal(applyOriginWitnessStep(busy,{type:'repeatResearch',id:'SOURCE',assumeAvailability:true},data).ok,false);
const noGuard=structuredClone(world);noGuard.researched.delete('GUARD');
assert.equal(applyOriginWitnessStep(noGuard,{type:'repeatResearch',id:'SOURCE',assumeAvailability:true},data).ok,false,
  'Protected rewards require the guard at this new completion, not a past selection');
const disabled=structuredClone(world);disabled.disabled.add('SOURCE');
assert.equal(applyOriginWitnessStep(disabled,{type:'repeatResearch',id:'SOURCE',assumeAvailability:true},data).ok,false);
const again=applyOriginWitnessStep(world,{type:'repeatResearch',id:'SOURCE',assumeAvailability:true},data);
assert(again.ok&&again.assumed,again.reason);
world=again.world;
assert.equal(world.items.SAMPLE,0,'The repeat consumes a separate specimen');
assert.deepEqual(world.pendingFree.choices,['B']);
world=apply(world,{type:'freeResearch',source:'SOURCE',research:'B',assumeOutcome:true});
assert(world.researched.has('B'));
assert.equal(applyOriginWitnessStep(world,{type:'repeatResearch',id:'SOURCE',assumeAvailability:true},data).ok,false,
  'No available reward means no invented repeat project');

// Discover the source before its guard: a later guarded payout requires a
// new project, not retroactive attachment to the first completed source.
let early=foundationWorld();
early=apply(early,{type:'externalInputs',items:{SAMPLE:2},assumption:true,reason:'Explicit specimens'});
early=apply(early,{type:'research',id:'SOURCE'});
assert(!early.pendingFree);
early=apply(early,{type:'research',id:'GUARD'});
assert.equal(applyOriginWitnessStep(early,{type:'freeResearch',source:'SOURCE',research:'A',assumeOutcome:true},data).ok,false);
early=apply(early,{type:'repeatResearch',id:'SOURCE',assumeAvailability:true});
assert(early.pendingFree.choices.includes('A'));

const planner=createFoundationResearchPlanner(makeData(),{maxAttempts:80});
const first=planner.ensure(['A']);assert(first.ok,first.reason);
const second=planner.ensure(['B'],first.node);assert(second.ok,second.reason);
assert(second.node.steps.some(s=>s.type==='repeatResearch'&&s.id==='SOURCE'));
assert.equal(second.node.steps.filter(s=>s.type==='freeResearch'&&s.source==='SOURCE').length,2);
assert.equal(first.node.steps.filter(s=>s.type==='repeatResearch').length,0,
  'Planning a later payout must not mutate the first witness');

const seq=makeData();seq.researchRules.SOURCE.sequentialGetOneFree=true;
let sw=foundationWorld();
for(const step of [{type:'externalInputs',items:{SAMPLE:2},assumption:true,reason:'Sequential fixture'},
  {type:'research',id:'GUARD'},{type:'research',id:'SOURCE'}]){
  const r=applyOriginWitnessStep(sw,step,seq);assert(r.ok,r.reason);sw=r.world;
}
assert.equal(applyOriginWitnessStep(sw,{type:'freeResearch',source:'SOURCE',research:'B',assumeOutcome:true},seq).ok,false,
  'Sequential free research cannot skip the first remaining entry');
const unsafe=makeData();unsafe.researchRules.SOURCE.lookup='UNMODELED';
assert.equal(applyOriginWitnessStep(first.node.world,{type:'repeatResearch',id:'SOURCE',assumeAvailability:true},unsafe).ok,false,
  'Unknown lookup side effects cannot silently become a completed repeat witness');
console.log('PASS explicit repeat lab: current guards, two consumed specimens, fresh payout tokens, no retrospective rewards, no duplicate RNG, sequential ordering, and conservative lookup safeguards');
