// Source-bound calendar expansion for the first unresolved monthly event.
// It produces replay inputs, not events that have actually occurred.
// Full-world scheduling, other scripts, survival and RNG remain obligations.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import yaml from 'js-yaml';
import {digest} from './final-combination-production.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const arr=x=>Array.isArray(x)?x:[];
const fields=(r,keys)=>Object.fromEntries(keys.filter(k=>r[k]!==undefined).map(k=>[k,r[k]]));
export function loadInitialEventRules(gameRoot,metadata){
 const manifest=JSON.parse(fs.readFileSync('public/ruleset/manifest.json'));
 assert.equal(manifest.sourceVersion,'v.o2');
 const root=path.join(gameRoot,'user/mods/Piratez'),files={},events=new Map(),scripts=new Map(),refs={};
 let start=null;
 function read(file,full,expected){
  const b=fs.readFileSync(full),h=sha(b);if(expected){assert.equal(h,expected.sha256,file);assert.equal(b.length,expected.bytes,file);}
  files[file]=h;const doc=yaml.load(b.toString('utf8'),{json:true});
  if(doc?.startingTime)start=doc.startingTime;
  for(const [section,map] of [['events',events],['eventScripts',scripts]]){
   for(const rule of arr(doc?.[section])){
    if(rule.delete){map.delete(rule.delete);continue;}
    const id=section==='events'?rule.name:rule.type;if(!id)continue;
    map.set(id,{...map.get(id),...rule});(refs[section+'|'+id]??=[]).push(file);
   }
  }
 }
 const base='standard/xcom1/vars.rul';read(base,path.join(gameRoot,base));
 for(const e of manifest.files.filter(e=>e.path.startsWith('Ruleset/')&&e.path.endsWith('.rul')).sort((a,b)=>a.path.localeCompare(b.path,'en')))read(e.path,path.join(root,e.path),e);
 assert(start&&Number.isSafeInteger(start.year)&&Number.isSafeInteger(start.month)&&Number.isSafeInteger(start.day));
 const archive='tools/headless-simulator/native/oxce-source.tar.gz',engine={};
 const markers={
  'src/Geoscape/GeoscapeState.cpp':['getMonthsPassed() == -1','determineAlienMissions();','void GeoscapeState::time30Minutes()','ge->think();','getInterruptResearch()','getEventScriptList()','RNG::percent(eventScript->getExecutionOdds())','eventCommand->generate(save->getMonthsPassed())','save->spawnEvent(eventRules)'],
  'src/Savegame/SavedGame.cpp':['int minutes = (eventRules->getTimer() + (RNG::generate(0, eventRules->getTimerRandom()))) / 30 * 30;','if (minutes < 60) minutes = 60;','addGeneratedEvent(eventRules);'],
  'src/Savegame/GeoscapeEvent.cpp':['if (_spawnCountdown > 30)','_spawnCountdown -= 30;','_over = true;'],
  'src/Mod/RuleEventScript.cpp':['_firstMonth(0), _lastMonth(-1), _executionOdds(100)','return rw->second->choose();'],
  'src/Mod/RuleEvent.cpp':['_timer(30), _timerRandom(0)'],
  'src/Geoscape/GeoscapeEventState.cpp':['rule.getResearchList()','RNG::generate(0, possibilities.size() - 1)']
 };
 for(const [file,ms] of Object.entries(markers)){
  const b=execFileSync('tar',['-xOf',archive,'./'+file],{maxBuffer:16777216}),lines=b.toString().split(/\r?\n/);
  engine[file]={sha256:sha(b),markers:ms.map(m=>{const n=lines.findIndex(l=>l.includes(m))+1;assert(n,m);return {line:n,marker:m};})};
 }
 const evidence={schema:'ATLAS_INITIAL_EVENT_SOURCE_V1',sourceMetadataSha256:metadata,files,start,engineArchiveSha256:sha(fs.readFileSync(archive)),engine,scope:'MANIFEST_MATCHED_MOD_AND_PRESERVED_ENGINE_SOURCE_NOT_RUNTIME'};
 return {events,scripts,refs,start,evidence:{...evidence,fingerprint:digest(evidence)}};
}
export function countdownDomain(timer=30,random=0){
 assert(Number.isSafeInteger(timer)&&timer>=0&&Number.isSafeInteger(random)&&random>=0);
 // C++ integer division then minimum 60. No assumption about RNG seed or distribution.
 const min=Math.max(60,Math.floor(timer/30)*30),max=Math.max(60,Math.floor((timer+random)/30)*30);
 return {minMinutes:min,maxMinutes:max,stepMinutes:30,possibleCountdowns:(max-min)/30+1};
}
const allowedScript=new Set(['type','firstMonth','lastMonth','executionOdds','minDifficulty','maxDifficulty','researchTriggers','eventWeights','affectsGameProgression','minScore','maxScore','minFunds','maxFunds']);
const allowedEvent=new Set(['name','description','background','music','alignBottom','researchList','timer','timerRandom']);
function dateAfter(start,minutes){
 const d=new Date(Date.UTC(start.year,start.month-1,start.day,start.hour||0,start.minute||0,start.second||0)+minutes*60000);
 assert(Number.isFinite(d.getTime()));return d.toISOString().slice(0,16);
}
export function planInitialEvent(group,index){
 const a=group.action,open=reason=>({kind:'UNRESOLVED',reason});
 if(a.type!=='eventResearch')return open('NON_EVENT_OBLIGATION');
 if(!group.actions.every(x=>x.type==='campaignContext'&&x.difficulty===group.difficulty))return open('NON_INITIAL_PREFIX_REQUIRES_WORLD_CLOCK');
 const event=index.events.get(a.event),script=index.scripts.get(a.script);
 if(!event||!script)return open('SOURCE_RULE_MISSING');
 // Fail closed for any script gate or reward semantics this narrow planner
 // does not model; do not skip the unknown field or pretend all starts match.
 if(Object.keys(script).some(k=>!allowedScript.has(k)))return open('ADDITIONAL_SCRIPT_CONDITIONS');
 if(Object.keys(event).some(k=>!allowedEvent.has(k)))return open('ADDITIONAL_EVENT_EFFECTS');
 if((script.firstMonth??0)>0||(script.lastMonth??-1)<-1||((script.lastMonth??-1)!==-1&&(script.lastMonth??-1)<0))return open('NOT_MONTH_ZERO');
 if(group.difficulty<(script.minDifficulty??0)||group.difficulty>(script.maxDifficulty??4))return open('DIFFICULTY_MISMATCH');
 if((script.executionOdds??100)!==100)return open('SCRIPT_RNG_REQUIRED');
 const triggers=script.researchTriggers||{};
 if(Object.values(triggers).some(v=>v!==false))return open('POSITIVE_OR_UNKNOWN_RESEARCH_TRIGGER');
 const month=script.eventWeights?.['0'];if(!month||Object.values(month).some(n=>!Number.isSafeInteger(n)||n<0))return open('MONTH_ZERO_WEIGHTS_MISSING');
 const possible=Object.entries(month).filter(([,v])=>v>0);
 if(possible.length!==1||possible[0][0]!==a.event)return open('EVENT_SELECTION_RNG_REQUIRED');
 if(!Array.isArray(event.researchList)||event.researchList.length!==1||event.researchList[0]!==a.research)return open('RESEARCH_SELECTION_UNPROVEN');
 const delay=countdownDomain(event.timer??30,event.timerRandom??0);
 const plan={kind:'SOURCE_BOUND_INITIAL_EVENT_SCHEDULE',script:a.script,event:a.event,research:a.research,
  difficulty:group.difficulty,month:0,dispatch:'FIRST_NAMED_BASE_MONTH_ZERO_EVENT_SCRIPT_PASS',
  delay,conditionalCalendar:{start:index.start,earliest:dateAfter(index.start,delay.minMinutes),latest:dateAfter(index.start,delay.maxMinutes),assumesDispatchAtConfiguredStart:true},
  conditions:{researchAbsent:Object.keys(triggers).sort(),namedBase:true,monthZero:true,otherScriptsAndStartingResearchMustBeChecked:true,clockTicks:30},
  steps:[{type:'establishInitialCampaign',difficulty:group.difficulty},{type:'dispatchMonthlyEvent',month:0,script:a.script,event:a.event},{type:'waitGeoscapeCountdown',...delay},{type:'resolveEventResearch',event:a.event,research:a.research}],
  source:{script:index.refs['eventScripts|'+a.script],event:index.refs['events|'+a.event],scriptRule:fields(script,[...allowedScript]),eventRule:fields(event,[...allowedEvent]),fingerprint:index.evidence.fingerprint},
  unresolved:['ACTUAL_START_SAVE_AND_ACTIVE_MOD_PARITY','OTHER_MONTH_ZERO_SCRIPTS_AND_MISSIONS','GEOSCAPE_TICKS_AND_RNG_SEED','SURVIVAL_AND_RESOURCE_STATE_DURING_WAIT','ACTUAL_EVENT_AND_RESEARCH_APPLICATION','FOLLOWING_CAMPAIGN_REPLAY'],
  campaignProven:false,assumptionDischarged:false};
 return {...plan,planHash:digest(plan)};
}
export function produceInitialEventSchedules(obligations,index){
 const plans={},bindings={},open={};let covered=0,groups=0,eventGroups=0,eventUnits=0;
 for(const g of obligations.items){
  if(g.action.type==='eventResearch'){eventGroups++;eventUnits+=g.count;}
  const result=planInitialEvent(obligations.resolve(g),index);
  if(result.kind!=='SOURCE_BOUND_INITIAL_EVENT_SCHEDULE'){
   const r=open[result.reason]??={groups:0,units:0};r.groups++;r.units+=g.count;continue;
  }
  plans[result.planHash]??=result;
  bindings[g.id]={planHash:result.planHash,branch:g.branch,difficulty:g.difficulty,prefixHash:g.prefixHash,representative:g.representative,affectedWorkUnits:g.count,origins:g.origins.length};
  groups++;covered+=g.count;
 }
 const summary={firstObligationGroups:obligations.items.length,eventGroups,eventUnits,planTemplates:Object.keys(plans).length,scheduledGroups:groups,scheduledWorkUnits:covered,unresolvedGroups:obligations.items.length-groups,openReasons:open,dischargedAssumptions:0,completeCampaigns:0};
 // Store counts and canonical references only; expand individual unit IDs via
 // the worklist CLI. Do not publish a separate career ledger.
 return {schema:'ATLAS_INITIAL_EVENT_SCHEDULES_V1',sourceMetadataSha256:index.evidence.sourceMetadataSha256,sourceEvidence:index.evidence,plans,bindings,summary};
}
