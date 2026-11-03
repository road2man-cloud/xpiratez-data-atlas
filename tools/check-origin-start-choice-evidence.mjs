import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initialCaptainChoices,captainChoiceStages,auditInitialChoiceEvidence,renderInitialChoiceEvidence}
  from '../public/soldiers/modern/origin-start-choice-evidence.js';
const index=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json'));
const names=JSON.parse(fs.readFileSync('public/data/soldier-source-catalog.json'));
assert.equal(index.meta.mod.version,'v.o2');
assert.deepEqual(names.sourceHashes,index.meta.source.rules);
const stages=captainChoiceStages(index.researchRules);
assert.deepEqual(stages.map(s=>s.options.length),[5,5,7,5]);
assert(stages.every(s=>s.reciprocal),'All four source-derived captain choice stages must mutually exclude alternatives');
assert.deepEqual(stages.map(s=>s.source),['STR_CAPTAIN_PERSONALITY_TEST',
  'STR_CAPTAIN_PUSSY_UP','STR_CAPTAIN_UNCLASSED','STR_CAPTAIN_PURE']);
const stage=initialCaptainChoices(index.researchRules);
assert.equal(stage.source,'STR_CAPTAIN_PERSONALITY_TEST');
assert.equal(stage.reciprocal,true);
assert.deepEqual(stage.options,[
  'STR_CAPTAIN_DUMBASS','STR_CAPTAIN_JACKASS','STR_CAPTAIN_LAZYASS',
  'STR_CAPTAIN_PUSSY','STR_CAPTAIN_SOREASS'
]);
for(const id of stage.options){
  const r=index.researchRules[id];
  assert(r.dependencies.includes(stage.source));
  assert.equal(r.cost,1);
  assert.equal(r.disables.filter(x=>stage.options.includes(x)).length,4);
  assert(index.eventResearchSources[id]?.some(e=>e.event.includes('AUTOCHOICE')),
    'Start option has a source-defined event auto-choice fallback: '+id);
}
const reports=index.profiles.map(p=>auditInitialChoiceEvidence(p,index));
assert.equal(reports.length,72);
assert(reports.every(r=>r.stages.length===4&&r.stages.every(s=>s.reciprocal)));
assert(reports.every(r=>r.sourceReferences.every(x=>x.required.length+x.forbidden.length>0)));
const affected=reports.filter(r=>r.sourceReferences.length);
assert(affected.length>=30,'Expected many actual source-linked beginning choices');
assert(affected.every(r=>r.sourceReferences.some(x=>x.kind==='item-event'||
  x.kind==='birth-event'||x.kind==='birth-research'||x.kind==='item-manufacture')));
const clone=reports.find(r=>r.profileId==='manufacture:STR_THEBAN_ASSAULT_CLONE');
assert(clone);
assert(!clone.sourceReferences.some(x=>x.source==='STR_CLEO_CHALLENGE'));
const freak=reports.find(r=>r.profileId==='manufacture:STR_FREAK_RECRUITMENT');
assert(freak?.sourceReferences.length>0);
const chosen=auditInitialChoiceEvidence(index.profiles.find(p=>p.id===clone.profileId),index,
  {steps:[{type:'research',id:'STR_CAPTAIN_DUMBASS'}]});
assert.deepEqual(chosen.selections,['STR_CAPTAIN_DUMBASS']);
const defaultHtml=renderInitialChoiceEvidence(chosen,{name:id=>names.names[id]||id});
assert(defaultHtml.includes('STR_CAPTAIN_DUMBASS'));
assert(defaultHtml.includes('data-trace-research-root="STR_CAPTAIN_DUMBASS"'));
assert.equal((defaultHtml.match(/data-start-choice="/g)||[]).length,22);
assert(defaultHtml.includes('직업 선택')&&defaultHtml.includes('Pure 최종 선택'));
const freakHtml=renderInitialChoiceEvidence(freak);
assert(freakHtml.includes('선택되어 있으면 이 경로 차단')||
  freakHtml.includes('반드시 선택되어 있어야 함'));
for(const event of ['STR_REVOLUTIONARY_SPEECH_THEBES','STR_START_COUNTRY_EGYPT_EVENT'])
  assert(names.names[event]&&names.names[event]!==event,'Missing v.o2 event localization: '+event);
const unexpected=index.profiles.some(p=>p.id.startsWith('event:STR_CLEO_CHALLENGE'));
assert(!unexpected,'Never invent a separate Cleopatra soldier birth source');
console.log('PASS v.o2 four captain stages (5/5/7/5), 22 mutually exclusive choice nodes with original event fallback, no legacy choice DB');
console.log('PASS 72 origins / '+affected.length+' with direct initial-choice script/material evidence kept separate by acquisition method');
console.log('PASS initial choice source localization, candidate selection scope, and no invented Cleopatra license path');
