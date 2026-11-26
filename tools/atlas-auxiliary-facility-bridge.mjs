// V55: source-bound second-base construction, without sharing local capacities.
// Layout, purchase and research plans are concrete; campaign survival remains open.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import yaml from "js-yaml";
import {key,sha} from "./population-research-career-core.mjs";
const arr=x=>Array.isArray(x)?x:[],n=x=>Number(x)||0,rad=x=>x*Math.PI/180;
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const dims=r=>[r.sizeX||r.size||1,r.sizeY||r.size||1];
const mats=r=>Object.fromEntries(Object.entries(r.buildCostItems||{}).map(([id,v])=>[id,n(typeof v==="object"?v.build:v)]).filter(([,v])=>v>0));
function insideRegion(r,lon,lat){return arr(r.areas).some(([a,b,c,d])=>(a<=b?lon>=a&&lon<b:lon>=a||lon<b)&&(lat>0?lat>c&&lat<=d:lat>=c&&lat<d));}
function polygonAt(bytes,longitude,latitude){
 const lon=rad(longitude),lat=rad(latitude),c=Math.cos(lat),s=Math.sin(lat);
 assert.equal(bytes.length%20,0);
 for(let off=0;off<bytes.length;off+=20){
  const v=Array.from({length:10},(_,i)=>bytes.readInt16LE(off+2*i)),count=v[6]===-1?3:4;
  const vertices=Array.from({length:count},(_,i)=>[rad(v[2*i]/8),rad(v[2*i+1]/8)]);
  if(vertices.some(([p,q])=>c*Math.cos(q)*Math.cos(p-lon)+s*Math.sin(q)<.75))continue;
  const xy=vertices.map(([p,q])=>[Math.cos(q)*Math.sin(p-lon),c*Math.sin(q)-s*Math.cos(q)*Math.cos(p-lon)]);
  let odd=false;for(let j=0;j<count;j++){const [x,y]=xy[j],[x2,y2]=xy[(j+1)%count];if((y>0)!==(y2>0)&&0<(x2-x)*(0-y)/(y2-y)+x)odd=!odd;}
  if(odd)return {index:off/20,texture:v[8],vertices:vertices.map(([x,y])=>[x*180/Math.PI,y*180/Math.PI])};
 }
 return null;
}
export function loadAuxiliaryFacilityRules(gameRoot,metadata){
 const manifest=JSON.parse(fs.readFileSync("public/ruleset/manifest.json")),root=path.join(gameRoot,"user/mods/Piratez");
 assert.equal(manifest.sourceVersion,"v.o2");const files={},regions=new Map(),textures=new Map(),research=new Map();let globeFile=null,globals={};
 const merge=(map,rows,field)=>{for(const r of arr(rows)){if(r.delete!==undefined){map.delete(r.delete);continue;}const id=r[field]??r.name??r.type;assert(id!==undefined);map.set(id,{...map.get(id),...r});}};
 function read(file,p,expected){
  const buf=fs.readFileSync(p);files[file]=sha(buf);if(expected)assert.equal(files[file],expected,file);
  const d=yaml.load(buf.toString("utf8"),{json:true});merge(regions,d.regions,"type");merge(textures,d.globe?.textures,"id");merge(research,d.research,"name");
  if(d.globe?.data)globeFile=d.globe.data;if(d.globe?.polygons)throw Error("YAML_GLOBE_POLYGONS_UNSUPPORTED:"+file);
  for(const k of ["newBaseUnlockResearch","costHireScientist"])if(d[k]!==undefined)globals[k]=d[k];
 }
 for(const f of ["regions","research","globe"]){const p="standard/xcom1/"+f+".rul";if(fs.existsSync(path.join(gameRoot,p)))read(p,path.join(gameRoot,p));}
 for(const f of manifest.files.filter(x=>x.path.startsWith("Ruleset/")&&x.path.endsWith(".rul")).sort((a,b)=>a.path.localeCompare(b.path,"en")))read(f.path,path.join(root,f.path),f.sha256);
 assert.equal(globeFile.toUpperCase(),"GEODATA/WORLD.DAT");const buf=fs.readFileSync(path.join(root,"GEODATA/WORLD.DAT"));files["GEODATA/WORLD.DAT"]=sha(buf);
 // One explicit inland site in Australasia, rather than claiming a global
 // optimum for all region placements. OXCE latitude convention is south positive.
 const candidates=[[135,25],[133,25],[140,25],[138,28],[145,30]];
 let site=null;
 for(const [longitude,latitude] of candidates){
  const region=[...regions.values()].find(r=>insideRegion(r,longitude,latitude)),poly=polygonAt(buf,longitude,latitude),texture=textures.get(poly?.texture);
  if(!region||region.type!=="STR_AUSTRALASIA"||!poly||texture?.isOcean||texture?.fakeUnderwater||!Number.isSafeInteger(region.cost)||region.cost<=0)continue;
  site={region:region.type,longitude,latitude,latitudeConvention:"OXCE_SOUTH_POSITIVE",cost:region.cost,regionAreas:region.areas,polygon:poly,texture:{id:poly.texture,isOcean:!!texture?.isOcean,fakeUnderwater:!!texture?.fakeUnderwater},scope:"SOURCE_GLOBE_LAND_AND_FIRST_MATCHING_REGION"};break;
 }
 assert(site,"No source-backed inland candidate");assert(globals.newBaseUnlockResearch);
 const evidence={schema:"ATLAS_AUXILIARY_BASE_SOURCE_V1",sourceMetadataSha256:metadata,files,site,globals,engine:["RuleGlobe::loadDat","Globe::getPolygonFromLonLat/insideLand/insideFakeUnderwaterTexture","ConfirmNewBaseState::btnOkClick","PlaceLiftState::viewClick","Base::getAvailableStores/getFacilityMaintenance","PlaceFacilityState::viewClick","PurchaseState::btnOkClick","SavedGame::isFacilityBuilt","GeoscapeState::determineAlienMissions"]};
 return {research,site,globals,evidence:{...evidence,fingerprint:key(evidence)}};
}
export function ordinaryResearchPlan({data,raw,world,goals,replay}){
 // Deliberately restrict supplemental research to ordinary, side-effect-free
 // rules. A branch choice, item, event, free award or disable must not be invented.
 const actions=[],seen=new Set(),visiting=new Set();let trial=world;
 function add(id){
  if(active(trial,id)||seen.has(id))return;
  assert(!trial.disabled.has(id),"AUX_RESEARCH_DISABLED:"+id);assert(!visiting.has(id),"AUX_RESEARCH_CYCLE:"+id);visiting.add(id);
  const r=data.researchRules[id],source=raw.get(id);assert(r&&source,"AUX_RESEARCH_RULE_MISSING:"+id);
  assert(Object.keys(source).every(k=>["name","type","cost","points","dependencies","requires","listOrder"].includes(k)),"AUX_RESEARCH_SIDE_EFFECT:"+id);
  assert(!r.needItem&&!r.lookup&&!r.repeatable&&!arr(r.requiresBaseFunc).length&&!arr(r.disables).length&&!arr(r.reenables).length&&!arr(r.unlocks).length&&!arr(r.getOneFree).length&&!Object.keys(r.getOneFreeProtected||{}).length,"AUX_RESEARCH_SPECIAL_GATE:"+id);
  for(const k of [...arr(r.dependencies),...arr(r.requires)])add(k);
  const a={type:"research",id};trial=replay.apply(trial,a);assert(active(trial,id)&&!trial.pendingFree,"AUX_RESEARCH_NOT_ACTIVE:"+id);
  visiting.delete(id);seen.add(id);actions.push(a);
 }
 for(const id of goals)add(id);
 return actions;
}
export function planAuxiliaryFacility({id,index,source,difficulty,economy}){
 const lift=index.facilities.get("STR_ACCESS_LIFT"),store=index.facilities.get("STR_GENERAL_STORES"),target=index.facilities.get(id);assert(lift&&store&&target);
 const plain=r=>!arr(r.requiresBaseFunc).length&&!arr(r.forbiddenBaseFunc).length&&!arr(r.buildOverFacilities).length&&!r.upgradeOnly&&!r.fakeUnderwaterOnly;
 assert(lift.lift&&plain(lift)&&plain(store)&&plain(target)&&!Object.keys(mats(lift)).length&&!Object.keys(mats(store)).length);
 assert.deepEqual(dims(lift),[1,1]);assert.deepEqual(dims(store),[1,1]);
 const materials=mats(target),purchases=Object.entries(materials).map(([item,count])=>{
  const r=index.items.get(item);assert(r&&r.costBuy>0&&!r.requiresBuyCountry&&!r.liveAlien&&!arr(r.requiresBuyBaseFunc).length&&!Object.keys(r.buyRequirements||{}).length&&!n(r.monthlyBuyLimit)&&!r.scripts,"AUX_PURCHASE_GATE:"+item);
  const unit=Math.trunc(r.costBuy*economy.g.buyCoefficients[difficulty]/100),volume=n(r.size)*count,delay=r.transferTime??24;
  assert(Number.isSafeInteger(unit)&&Number.isSafeInteger(count)&&Number.isSafeInteger(delay)&&delay>=0&&volume>=0);
  return {item,count,unit,cost:unit*count,volume,delay,research:[...arr(r.requires),...arr(r.requiresBuy)],source:index.source("items",item)};
 });
 const volume=purchases.reduce((s,x)=>s+x.volume,0),needed=Math.max(0,Math.ceil((volume-n(lift.storage))/n(store.storage)));
 assert(n(store.storage)>0&&(!n(store.maxAllowedPerBase)||needed<=n(store.maxAllowedPerBase)),"AUX_STORAGE_LIMIT");
 const grid=Array.from({length:6},()=>Array(6).fill(null)),placements=[];
 function put(fid,r,x,y,kind){const [sx,sy]=dims(r);assert(x>=0&&y>=0&&x+sx<=6&&y+sy<=6);
  for(let j=y;j<y+sy;j++)for(let i=x;i<x+sx;i++){assert(!grid[j][i]);grid[j][i]=fid;}
  placements.push({id:fid,x,y,sx,sy,kind,cost:kind==="LIFT"?0:n(r.buildCost),days:kind==="LIFT"?0:n(r.buildTime),storage:n(r.storage),monthlyCost:n(r.monthlyCost),source:index.source("facilities",fid)});
 }
 const [tx,ty]=dims(target);assert(tx<=3&&ty<=3,"AUX_LAYOUT_TARGET_SIZE");
 put("STR_ACCESS_LIFT",lift,3,2,"LIFT");put(id,target,0,0,"TARGET");
 // Target must touch the completed access lift, not depend on unfinished or
 // connector-disabled facilities. For 3x3 barracks this is (2,2) -> (3,2).
 assert(ty>=3&&tx===3,"AUX_LAYOUT_TARGET_NOT_CONNECTED");
 const neighbors=[[4,2],[3,1],[3,3]];
 assert(needed<=neighbors.length,"AUX_LAYOUT_STORAGE_LIMIT");
 for(const [x,y] of neighbors.slice(0,needed))put("STR_GENERAL_STORES",store,x,y,"STORE");
 const goals=[...new Set([source.globals.newBaseUnlockResearch,...arr(lift.requires),...arr(store.requires),...arr(target.requires),...purchases.flatMap(x=>x.research)])];
 const directCost=source.site.cost+placements.reduce((s,p)=>s+p.cost,0)+purchases.reduce((s,p)=>s+p.cost,0);
 return {id,site:source.site,goals,materials,purchases,placements,storageBeforeTarget:n(lift.storage)+needed*n(store.storage),materialVolume:volume,directCost,monthlyCost:placements.reduce((s,p)=>s+p.monthlyCost,0),sourceFingerprint:source.evidence.fingerprint};
}
