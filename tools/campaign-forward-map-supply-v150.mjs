// V150: additional source reachability for map blocks and implicit recipe outputs.
// V148 actions remain replay-compatible through the unmodified legacy adapter.
// New actions never assert tactical success, economy, or an exact calendar.
import assert from 'node:assert/strict';
const arr=x=>Array.isArray(x)?x:[];
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const pos=n=>Number.isFinite(n)&&n>0;
const cmp=(a,b)=>a.localeCompare(b,'en');
const weightedKeys=t=>[...new Set(Object.values(t||{}).flatMap(v=>Object.entries(v||{}).filter(([,n])=>pos(n)).map(([k])=>k)))].sort(cmp);
export function createMapSupply(data,snapshot,raw,legacy){
 const {items,manufacture,missionScripts,alienMissions,alienDeployments,ufos,terrains}=raw;
 const map=new Map(),implicit=new Map();
 const add=(m,k,v)=>{if(!m.has(k))m.set(k,[]);m.get(k).push(v);};
 const allowedScript=new Set(['type','name','missionWeights','regionWeights','useTable','executionOdds','researchTriggers','firstMonth','lastMonth','startDelay','randomDelay','facilityTriggers','itemTriggers','minDifficulty','maxDifficulty','targetBaseOdds']);
 function eligible(w,id,mission){
  const s=missionScripts[id];
  if(!s||s.useTable!==false||!Object.keys(s).every(k=>allowedScript.has(k))||(s.executionOdds??100)<=0)return false;
  if(!Object.entries(s.researchTriggers||{}).every(([k,v])=>typeof v==='boolean'&&active(w,k)===v))return false;
  if(!Object.entries(s.facilityTriggers||{}).every(([k,v])=>typeof v==='boolean'&&w.facilities.has(k)===v))return false;
  if(!Object.entries(s.itemTriggers||{}).every(([k,v])=>typeof v==='boolean'&&((w.items[k]||0)+(w.otherItems?.[k]||0)>0)===v))return false;
  if(w.difficulty<(s.minDifficulty??0)||w.difficulty>(s.maxDifficulty??4))return false;
  const month=Math.max(w.month||0,s.firstMonth??0);
  if(s.lastMonth!=null&&month>s.lastMonth)return false;
  // The earliest possible eligible month, not an arbitrary union of weighted tables.
  const key=Object.keys(s.missionWeights||{}).map(Number).filter(k=>k<=month).sort((a,b)=>b-a)[0];
  return key!==undefined&&pos(s.missionWeights[key]?.[mission]);
 }
 function blockItems(b){
  const a=[];
  for(const [k,v] of Object.entries(b.items||{}))if(arr(v).length)a.push([k,{placement:'fixed',count:v.length}]);
  for(const [i,r] of arr(b.randomizedItems).entries())if(pos(r.amount))for(const k of new Set(arr(r.itemList)))a.push([k,{placement:'random',poolIndex:i,draws:r.amount,occurrences:r.itemList.filter(x=>x===k).length,poolSize:r.itemList.length}]);
  return a.filter(([k])=>items[k]&&items[k].recover!==false&&!items[k].liveAlien);
 }
 // A directly bound custom UFO is the actual mission map, not an arbitrary terrain.
 for(const [script,s] of Object.entries(missionScripts)){
  if(s.useTable!==false)continue;
  for(const mission of weightedKeys(s.missionWeights)){
   const d=alienDeployments[mission],m=alienMissions[mission];if(!d||!m||!arr(m.waves).some(x=>x.objective===true))continue;
   if(typeof d.customUfo!=='string')continue;
   const u=ufos[d.customUfo];if(!u)continue;
   for(const b of arr(u.battlescapeTerrainData?.mapBlocks))for(const [k,p] of blockItems(b)){
    add(map,k,{kind:'map',route:'custom-ufo',script,mission,deployment:mission,ufo:d.customUfo,block:b.name,...p});
   }
  }
 }
 // Terrain selection evidence from the generated atlas, checked again against
 // the exact raw terrain, block, deployment, mission and script.
 for(const [item,record] of Object.entries(data.itemSupply||{})){
  if(!items[item]||items[item].recover===false||items[item].liveAlien)continue;
  for(const row of arr(record.mapLoot?.sources)){
   if(!row.selectors?.length||!row.mapScript)continue;
   const t=terrains[row.terrain],b=arr(t?.mapBlocks).find(x=>x.name===row.block);
   if(!b)continue;
   const placements=blockItems(b).filter(([k])=>k===item);
   for(const p of arr(row.missionPaths)){
    const d=alienDeployments[p.deployment],s=missionScripts[p.script],m=alienMissions[p.mission];
    if(!d||!s||!m||p.deployment!==p.mission||!arr(d.terrains).includes(row.terrain)||(d.script||t.script)!==row.mapScript||!weightedKeys(s.missionWeights).includes(p.mission)||!arr(m.waves).some(x=>x.objective===true))continue;
    for(const [,placement] of placements)add(map,item,{kind:'map',route:'indexed-terrain',script:p.script,mission:p.mission,deployment:p.deployment,terrain:row.terrain,mapScript:row.mapScript,block:row.block,blockSelection:row.blockSelection,...placement});
   }
  }
 }
 const recipeFields=new Set(['name','type','category','requires','requiresBaseFunc','space','time','cost','requiredItems','producedItems','randomProducedItems','refund','listOrder']);
 for(const [id,r] of Object.entries(manufacture)){
  if(!items[id]||Object.hasOwn(r,'producedItems')||arr(r.randomProducedItems).length||r.category==='STR_CRAFT'||!Object.keys(r).every(k=>recipeFields.has(k)))continue;
  if(!data.itemSupply[id]?.manufacture?.some(x=>x.id===id&&x.implicit===true))continue;
  add(implicit,id,{kind:'implicit-manufacture',recipe:id});
 }
 function prove(w,item,seen=new Set(),depth=0,allowStock=true){
  if(!items[item]||seen.has(item)||depth>7)return null;
  if(allowStock&&(w.items[item]||0)>0)return {kind:'stock',item};
  // Prefer a current map source before historical abstraction.
  for(const s of map.get(item)||[])if(eligible(w,s.script,s.mission))return {item,...s,access:'conditional-generated-map'};
  const old=legacy.prove(w,item,new Set(seen),depth,false);if(old)return old;
  const next=new Set(seen);next.add(item);
  for(const s of implicit.get(item)||[]){
   const r=manufacture[s.recipe];if(!arr(r.requires).every(k=>active(w,k))||!arr(r.requiresBaseFunc).every(k=>w.baseFunctions.has(k)))continue;
   const inputs=[];let ok=true;
   for(const [k,n] of Object.entries(r.requiredItems||{})){
    if(!Number.isSafeInteger(n)||n<1){ok=false;break;}
    const p=prove(w,k,next,depth+1);if(!p){ok=false;break;}inputs.push({quantity:n,proof:p});
   }
   if(ok)return {item,...s,inputs,access:'unlocked-implicit-manufacture'};
  }
  return null;
 }
 function action(w,item,minimum=1){
  if(!Number.isSafeInteger(minimum)||minimum<1||minimum>10000||(w.items[item]||0)>=minimum)return null;
  const proof=prove(w,item,new Set(),0,false);if(!proof)return null;
  // Keep a new action namespace: never change an older proof's meaning.
  return {type:'researchSupplyV150',item,minimum,proof,sourceFingerprint:snapshot.sourceFingerprint,researchOnly:true,assumeSourceAccess:true,assumeRequiredQuantity:true};
 }
 function apply(w,a){
  if(a.type!=='researchSupplyV150')return legacy.apply(w,a);
  try{
   assert(w.researchOnly===true&&w.sourceFingerprint===snapshot.sourceFingerprint&&!w.pendingFree);
   assert.deepEqual(a,action(w,a.item,a.minimum),'source is not reachable in this world');
   const z=structuredClone(w);z.items[a.item]=a.minimum;
   return {ok:true,world:z,assumed:true,notes:['v150-map-or-implicit-source-reachability','conditional-map-selection-and-recovery','quantities-economy-and-calendar-abstracted','not-native-certified']};
  }catch(e){return {ok:false,world:w,reason:String(e.message||e)};}
 }
 const counts={mapItems:map.size,mapSources:[...map.values()].reduce((n,x)=>n+x.length,0),implicitItems:implicit.size};
 return {apply,action,prove,counts};
}
