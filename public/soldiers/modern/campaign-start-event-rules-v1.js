// Source-backed event subset. Piratez_Events.rul SHA256 verified against
// public/ruleset/manifest.json. Each script still uses the chronological gate.
export const EVENT_SOURCE_SHA256='00ab639389dbb3dbed360575882e958f57e08e0e1393fa69ba9626010ccb53a6';
const weighted=(script,positive,negative,items,weight=100,totalWeight=100,executionOdds=100,extra={})=>({
 script,mode:'weighted',firstMonth:0,monthWeights:[{month:0,weight,totalWeight}],
 executionOdds,researchPositive:positive,researchNegative:negative,itemPositive:items,...extra
});
export const START_EVENT_RULES=Object.freeze({
 STR_FORTUNA_ANOMALY_EVENT:{
  research:'STR_ANOMALY_DEP2',items:{"STR_CODEX_GRAY":1,"STR_DATA_DISK":7,"STR_GNOME":1,"STR_BRAINER_OUTFIT":1,"STR_LIBER_OCCULTIS":1,"STR_TOME_OF_WITCHERY":1},
  timer:7000,timerRandom:23000,points:0,funds:0,
  scripts:[weighted('STR_FORTUNA_ANOMALY_EVENT',['STR_FORTUNA_ANOMALY','STR_ANOMALY_DEP'],['STR_ANOMALY_DEP2'],['STR_FORTUNA_ANOMALY'])]
 },
 STR_METALLO_ANOMALY_EVENT:{
  research:'STR_ANOMALY_DEP2',items:{"STR_CODEX_RED":1,"STR_RAYGUN":2,"STR_RAY_RIFLE":2,"STR_RAYGUN_CLIP":50,"STR_AGGRESSOR_ARMOR":8,"STR_SKULL":1},
  timer:7000,timerRandom:23000,points:0,funds:0,
  scripts:[weighted('STR_METALLO_ANOMALY_EVENT',['STR_METALLO_ANOMALY','STR_ANOMALY_DEP'],['STR_ANOMALY_DEP2'],['STR_METALLO_ANOMALY'])]
 },
 STR_VENTURA_ANOMALY_EVENT:{
  research:'STR_ANOMALY_DEP2',items:{"STR_CODEX_GREEN":1,"STR_HEALING_GEL":20,"STR_MEDICAL_SUPPLIES":10,"STR_NURSE_OUTFIT":1,"STR_STASIS_POD_GREEN_GAL":3},
  timer:7000,timerRandom:23000,points:0,funds:0,
  scripts:[weighted('STR_VENTURA_ANOMALY_EVENT',['STR_VENTURA_ANOMALY','STR_ANOMALY_DEP'],['STR_ANOMALY_DEP2'],['STR_VENTURA_ANOMALY'])]
 },
 STR_FUEGO_ANOMALY_EVENT:{
  research:'STR_ANOMALY_DEP2',
  items:{STR_CODEX_GOLD:1,STR_SILVER_BAR:12,STR_GOLD_BAR:36,STR_TREASURE_CHEST:1,STR_SPACE_SUIT:3,STR_CLOTHING_OFFICER:1,STR_OFFICERS_BATON:1},
  timer:7000,timerRandom:23000,points:0,funds:0,
  scripts:[weighted('STR_FUEGO_ANOMALY_EVENT',['STR_FUEGO_ANOMALY','STR_ANOMALY_DEP'],['STR_ANOMALY_DEP2'],['STR_FUEGO_ANOMALY'])]
 },
 STR_START_COUNTRY_EGYPT_EVENT:{
  research:'STR_EGYPT',items:{STR_THEBAN_ASSAULT_CLONE_LICENSE:12},
  timer:3200,timerRandom:1200,points:-600,funds:0,
  scripts:[weighted('STR_START_COUNTRY_EGYPT_EVENT',[],[],[],100,100,100,{lastMonth:0,countryPositive:['STR_EGYPT']})]
 },
 STR_REVOLUTIONARY_SPEECH_THEBES:{
  research:'STR_THEBAN_ASSAULT_CLONE_LICENSE',items:{STR_THEBAN_ASSAULT_CLONE_LICENSE:3},
  timer:60,timerRandom:43400,points:-150,funds:0,
  scripts:[
   weighted('STR_PROPAGANDA_1',['STR_PEASANT_REVOLUTION'],['STR_THE_GREAT_CAUSE'],[],25,450,23),
   weighted('STR_PROPAGANDA_2',['STR_PROPAGANDA'],[],[],25,425,23),
   weighted('STR_PROPAGANDA_3',['STR_PROPAGANDA'],[],[],75,475,23,{facilityPositive:['STR_WAR_BARRACKS']}),
   weighted('STR_PROPAGANDA_4',['STR_PROPAGANDA','STR_PERSUASION'],[],[],25,350,23)
  ]
 }
});
export function eventItemRoutes(id){
 return Object.entries(START_EVENT_RULES).filter(([,e])=>e.items[id]>0)
  .flatMap(([event,e])=>e.scripts.map(script=>({event,script,research:e.research,count:e.items[id]})));
}
