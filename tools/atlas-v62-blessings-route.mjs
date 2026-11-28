// A deliberately narrow mixed reward event. All inputs originate in the
// hash-checked local rules bootstrap; unsupported fields fail closed.
export function buildBlessingsRoute(data,events,eventScripts,items,files){
 const event='STR_BLESSINGS',research='STR_WASTELAND_PRIESTESS',item='STR_MUTANT_BLESSINGS';
 const e=events[event],s=eventScripts[event],r=data.researchRules[research];
 const indexed=data.eventResearchSources?.[research]?.find(x=>x.event===event&&x.choiceCount===1)?.scripts?.find(x=>x.script===event);
 const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const allowedEvent=['name','type','description','background','music','researchList','interruptResearch','everyItemList','points','timer','timerRandom'];
 const allowedScript=['type','eventWeights','minDifficulty','firstMonth','researchTriggers','executionOdds'];
 if(!e||!s||!r||!indexed||!items[item]||!files['Piratez_Events.rul']||
 Object.keys(e).some(k=>!allowedEvent.includes(k))||Object.keys(s).some(k=>!allowedScript.includes(k))||
 !eq(e.researchList,[research])||e.interruptResearch!==research||!eq(e.everyItemList,[item])||e.points!==50||e.timer!==60||e.timerRandom!==43400||
 !eq(s.eventWeights,{0:{[event]:100}})||s.minDifficulty!==1||s.firstMonth!==0||s.executionOdds!==23||!eq(s.researchTriggers,{[research]:false})||
 indexed.mode!=='weighted'||!eq(indexed.monthWeights,[{month:0,weight:100,totalWeight:100}])||indexed.firstMonth!==0||indexed.lastMonth!==null||indexed.executionOdds!==23||
 indexed.researchPositive.length||!eq(indexed.researchNegative,[research])||!eq(indexed.otherConditions,{minDifficulty:1})||
 r.lookup||r.unlocks.length||r.getOneFree.length||Object.keys(r.getOneFreeProtected).length)throw Error('blessings-source-mismatch');
 return {event,research,script:indexed,items:{[item]:1},points:50,interruptResearch:research,timer:e.timer,timerRandom:e.timerRandom,sourceSha256:files['Piratez_Events.rul']};
}
