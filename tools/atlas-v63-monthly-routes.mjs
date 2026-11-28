// Two source-checked month-one acquisition scenarios. The random bundle
// is an explicitly selected native list entry, never an isolated item grant.
export function buildMonthlyRoutes(data,events,scripts,items,files){
 const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const result=[];
 const defs=[
  {event:'STR_SECRET_DOOR_MEDICAL_SUPPLIES',script:'STR_SECRET_DOOR_VERY_EARLY',sample:'STR_MEDICAL_SUPPLIES',fixed:Array(10).fill('STR_MEDICAL_SUPPLIES'),firstMonth:1,lastMonth:4,odds:36,positive:['STR_EXPLORE_TUNNELS'],negative:['STR_CAPTAIN_SOREASS'],funds:0,timer:60,timerRandom:43400},
  {event:'STR_DELINQUENT_SPORTS_BAD',script:'STR_DELINQUENT_SCORE',sample:'STR_SECTOWEED',fixed:['STR_BEER','STR_BEER','STR_BEER','STR_VODKA'],firstMonth:1,lastMonth:null,odds:85,positive:['STR_SCHOOLING_1'],negative:[],funds:1000,timer:1000,timerRandom:42000,outcome:3,random:{STR_SECTOWEED:3,STR_CRACK:1},otherConditions:{minScore:-300,maxScore:999}}
 ];
 for(const d of defs){
  const e=events[d.event],s=scripts[d.script];
  const route=data.itemSupply?.[d.sample]?.eventGrants?.find(x=>x.event===d.event)?.scriptRoutes?.find(x=>x.script===d.script);
  const allowedEvent=['name','type','description','background','music','everyItemList','timer','timerRandom','funds',...(d.random?['randomMultiItemList']:[])];
  const allowedScript=['type','eventWeights','firstMonth','lastMonth','executionOdds','researchTriggers',...(d.otherConditions?Object.keys(d.otherConditions):[])];
  if(!e||!s||!route||!files['Piratez_Events.rul']||Object.keys(e).some(k=>!allowedEvent.includes(k))||Object.keys(s).some(k=>!allowedScript.includes(k))||
   !eq(e.everyItemList,d.fixed)||(e.funds??0)!==d.funds||e.timer!==d.timer||e.timerRandom!==d.timerRandom||
   s.firstMonth!==d.firstMonth||(s.lastMonth??null)!==d.lastMonth||s.executionOdds!==d.odds||
   !eq(s.researchTriggers,Object.fromEntries([...d.positive.map(k=>[k,true]),...d.negative.map(k=>[k,false])]))||
   !eq(route.researchPositive,d.positive)||!eq(route.researchNegative,d.negative)||route.firstMonth!==d.firstMonth||route.lastMonth!==d.lastMonth||route.executionOdds!==d.odds||route.mode!=='weighted'||!eq(route.otherConditions,d.otherConditions??{})||
   Object.entries(d.otherConditions??{}).some(([k,v])=>s[k]!==v))throw Error('monthly-event-source-mismatch:'+d.event);
  const weights=Object.entries(s.eventWeights||{}).map(([month,w])=>({month:Number(month),weight:w[d.event]??0,totalWeight:Object.values(w).reduce((a,b)=>a+b,0)})).sort((a,b)=>a.month-b.month);
  if(!eq(weights,route.monthWeights))throw Error('monthly-event-weight-mismatch:'+d.event);
  const grants={};
  for(const k of d.fixed)grants[k]=(grants[k]||0)+1;
  if(d.random){
   const choices=e.randomMultiItemList;
   if(!Array.isArray(choices)||choices.length!==5||!eq(choices[d.outcome],d.random))throw Error('monthly-event-choice-mismatch:'+d.event);
   for(const [k,n] of Object.entries(d.random))grants[k]=(grants[k]||0)+n;
  }
  if(Object.entries(grants).some(([k,n])=>!items[k]||!Number.isSafeInteger(n)||n<1))throw Error('monthly-event-item-mismatch:'+d.event);
  result.push({event:d.event,script:route,items:grants,funds:d.funds,points:0,...(d.random?{outcome:d.outcome,choiceCount:5}:{}),sourceSha256:files['Piratez_Events.rul']});
 }
 return result;
}
