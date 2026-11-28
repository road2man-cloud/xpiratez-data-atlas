// Conditional construction model: no grants, no instant facility availability.
// A 6x6 single-base layout; replacement construction is deliberately excluded.
const arr=x=>Array.isArray(x)?x:[];
const int=(v,min=0)=>Number.isSafeInteger(v)&&v>=min;
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
export const facilityRules=data=>data.campaignAssets?.facilities||{};
export function facilityMaterials(r){
 const items={};
 for(const [id,raw] of Object.entries(r.buildCostItems||{})){
  const n=typeof raw==='object'&&raw!==null?raw.build??0:raw;
  if(!int(n))throw Error('invalid-build-material:'+id);
  if(n)items[id]=n;
 }
 return items;
}
const dims=r=>[r.sizeX??r.size??1,r.sizeY??r.size??1];
function cells(x,y,sx,sy){
 if(![x,y,sx,sy].every(v=>int(v))||sx<1||sy<1||x+sx>6||y+sy>6)throw Error('invalid-layout');
 return Array.from({length:sx*sy},(_,i)=>[x+i%sx,y+Math.floor(i/sx)]);
}
function gridOf(w,data){
 if(!Array.isArray(w.baseLayout))throw Error('missing-start-layout');
 const grid=Array.from({length:6},()=>Array(6).fill(null));
 for(const f of w.baseLayout){
  const r=facilityRules(data)[f.id];
  if(!r)throw Error('missing-layout-rule:'+f.id);
  for(const [x,y] of cells(f.x,f.y,...dims(r))){
   if(grid[y][x])throw Error('layout-overlap');
   grid[y][x]=f;
  }
 }
 return grid;
}
export function freeFacilityPosition(w,id,data){
 const r=facilityRules(data)[id];if(!r)return null;
 if(arr(r.buildOverFacilities).length)return null;
 const [sx,sy]=dims(r),grid=gridOf(w,data);
 for(let y=0;y<=6-sy;y++)for(let x=0;x<=6-sx;x++){
  const footprint=cells(x,y,sx,sy);
  if(footprint.some(([i,j])=>grid[j][i]))continue;
  const connected=footprint.some(([i,j])=>[[i-1,j],[i+1,j],[i,j-1],[i,j+1]].some(([a,b])=>{
   const f=grid[b]?.[a];return f?.complete===true&&f.id!=='STR_RUBBLE'&&!facilityRules(data)[f.id].connectorsDisabled;
  }));
  if(connected)return {x,y};
 }
 return null;
}
function canPlace(w,id,x,y,data){
 const r=facilityRules(data)[id],grid=gridOf(w,data),footprint=cells(x,y,...dims(r));
 return !footprint.some(([i,j])=>grid[j][i])&&footprint.some(([i,j])=>[[i-1,j],[i+1,j],[i,j-1],[i,j+1]].some(([a,b])=>{
  const f=grid[b]?.[a];return f?.complete===true&&f.id!=='STR_RUBBLE'&&!facilityRules(data)[f.id].connectorsDisabled;
 }));
}
export function applyFacilityAction(input,step,data){
 const w=structuredClone(input),r=facilityRules(data)[step.id];
 if(!r)throw Error('missing-facility-rule:'+step.id);
 if(step.type==='buildFacility'){
  if(!Array.isArray(w.baseLayout)||!int(w.elapsedBuildDays))throw Error('missing-construction-clock-or-layout');
  if(arr(r.buildOverFacilities).length)throw Error('replacement-build-unmodeled');
  if(!int(r.buildCost)||!int(r.buildTime))throw Error('missing-build-cost-or-time');
  if(!arr(r.requires).every(id=>active(w,id))||arr(r.requires).includes('STR_UNAVAILABLE'))throw Error('facility-research-unavailable');
  if(!arr(r.requiresBaseFunc).every(f=>w.baseFunctions.has(f)))throw Error('facility-function-unavailable');
  if(Number(r.maxAllowedPerBase)>0&&w.baseLayout.filter(f=>f.id===step.id).length>=r.maxAllowedPerBase)throw Error('facility-limit');
  if(!canPlace(w,step.id,step.x,step.y,data))throw Error('facility-placement-unavailable');
  if(w.funds<r.buildCost)throw Error('facility-funds-unavailable');
  const materials=facilityMaterials(r);
  for(const [id,n] of Object.entries(materials))if((w.items[id]||0)<n)throw Error('facility-material-unavailable:'+id);
  w.funds-=r.buildCost;
  for(const [id,n] of Object.entries(materials))w.items[id]-=n;
  w.baseLayout.push({id:step.id,x:step.x,y:step.y,complete:false,readyDay:w.elapsedBuildDays+r.buildTime});
  return {ok:true,world:w,assumed:true,notes:['construction-start:'+step.id,'construction-days:'+r.buildTime]};
 }
 if(step.type==='finishFacility'){
  const f=w.baseLayout?.find(f=>f.id===step.id&&f.x===step.x&&f.y===step.y&&!f.complete);
  if(!f||!int(f.readyDay)||!int(w.elapsedBuildDays))throw Error('construction-not-started');
  const remaining=Math.max(0,f.readyDay-w.elapsedBuildDays);
  // This is a lower-bound serial build clock, not a fully scheduled calendar.
  // Never present this as actual game date, monthly income or survival proof.
  if(step.waitDays!==remaining)throw Error('construction-wait-mismatch');
  w.elapsedBuildDays+=remaining;f.complete=true;
  w.facilities.add(step.id);
  if(w.globalFacilities instanceof Set)w.globalFacilities.add(step.id);
  for(const k of arr(r.provideBaseFunc))w.baseFunctions.add(k);
  return {ok:true,world:w,assumed:true,notes:['construction-complete:'+step.id,'elapsed-construction-days:'+remaining,'calendar-and-monthly-economy-unresolved']};
 }
 throw Error('unsupported-facility-action');
}
