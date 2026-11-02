#!/usr/bin/env node
// XPZ3D Stage 24: real OXCE battle-save -> bounded cross-engine manifest.
// This module NEVER writes an OXCE .sav or original game resources.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const yaml=require('js-yaml');

function fail(code,message){ const e=new Error(message);e.code=code;throw e; }
function assert(v,code,message){if(!v)fail(code,message);}
function hash(data){return crypto.createHash('sha256').update(data).digest('hex');}
function integer(v,otherwise=null){return Number.isSafeInteger(v)?v:otherwise;}
function string(v,otherwise=''){return typeof v==='string'?v:otherwise;}
function triple(v){return Array.isArray(v)&&v.length===3&&v.every(Number.isSafeInteger)?v.slice():null;}
function options(args){
 const r={};
 for(let i=0;i<args.length;i++){
   if(args[i]==='--help')return {help:true};
   assert(args[i].startsWith('--'),'ARG','Invalid argument '+args[i]);
   const key=args[i].slice(2);
   assert(['save','out','battle','result'].includes(key),'ARG','Unknown flag '+args[i]);
   assert(i+1<args.length&&!args[i+1].startsWith('--'),'ARG','No value for '+args[i]);
   r[key]=args[++i];
 }return r;
}
export function extractBattle(savePath){
 const data=fs.readFileSync(savePath);
 assert(data.length>32&&data.length<512*1024*1024,'SAVE_SIZE','Invalid OXCE save length');
 const originalSha256=hash(data);
 const originalText=data.toString('utf8');
 // Native OXCE stores C0 status markers in UI messages; YAML 1.2 loaders forbid
 // literal C0 bytes. Remove them ONLY from a private parse copy, not the source.
 const sanitized=originalText.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
 let documents;
 try{documents=yaml.loadAll(sanitized,{json:true});}
 catch(e){fail('SAVE_YAML','Native YAML parse failed: '+(e.reason||e.message));}
 assert(documents.length>=2,'SAVE_DOCS','Expected OXCE multi-document save');
 const campaign=documents.find(x=>x&&typeof x==='object'&&x.battleGame);
 assert(campaign&&campaign.battleGame,'NOT_IN_BATTLE','No generated battle in this save. Export at/after OXCE mission generation.');
 const meta=documents[0]||{}, b=campaign.battleGame;
 const mapSize=[integer(b.width),integer(b.length),integer(b.height)];
 assert(mapSize.every(x=>x!==null&&x>0&&x<=512),'MAP_DIM','Bad map dimensions');
 assert(typeof b.missionType==='string'&&b.missionType.startsWith('STR_'),'MISSION','Missing mission ID');
 assert(Array.isArray(b.units)&&b.units.length>0&&b.units.length<=8192,'UNITS','Invalid unit roster');
 assert(Array.isArray(b.items)&&b.items.length<=50000,'ITEMS','Invalid item roster');
 const soldiers=new Map();
 for(const base of campaign.bases||[])for(const s of base.soldiers||[]){
  if(Number.isSafeInteger(s.id))soldiers.set(s.id,{name:string(s.name),type:string(s.type),armor:string(s.armor)});
 }
 const uids=new Set();
 const units=b.units.map(u=>{
  assert(u&&Number.isSafeInteger(u.id)&&u.id>=0,'UNIT_ID','Unit has no valid native ID');
  assert(!uids.has(u.id),'DUPLICATE_UNIT','Duplicated unit ID: '+u.id);uids.add(u.id);
  const s=u.genUnitType==='SOLDIER'?soldiers.get(u.id):null;
  const stats={};
  if(u.currStats&&typeof u.currStats==='object')for(const [k,v] of Object.entries(u.currStats))
    if(Number.isSafeInteger(v))stats[k]=v;
  return {
   unitId:u.id,unitKey:'unit:'+u.id,faction:integer(u.faction,-1),
   status:integer(u.status,-1),unitRule:string(u.genUnitType||u.type),
   armorRule:string(u.genUnitArmor||(s&&s.armor)),
   name:string((s&&s.name)||u.name||u.genUnitType||u.type,'unit:'+u.id),
   campaignSoldierId:s?u.id:null,tile:triple(u.position),
   facing:integer(u.direction,0),
   vital:{health:integer(u.health),stun:integer(u.stunlevel),energy:integer(u.energy),
     timeUnits:integer(u.tu),morale:integer(u.morale),mana:integer(u.mana),fire:integer(u.fire)},
   armorValues:Array.isArray(u.armor)?u.armor.filter(Number.isSafeInteger):[],
   stats,originalFaction:integer(u.originalFaction,integer(u.faction,-1))
  };
 });
 const iid=new Set(), assigned=new Map(units.map(u=>[u.unitId,[]]));
 const items=b.items.map(item=>{
  assert(item&&Number.isSafeInteger(item.id)&&item.id>=0,'ITEM_ID','Item has invalid ID');
  assert(!iid.has(item.id),'DUPLICATE_ITEM','Duplicated item ID '+item.id);iid.add(item.id);
  const owner=integer(item.owner);
  if(owner!==null)assert(uids.has(owner),'ITEM_OWNER','Missing item owner '+owner);
  const result={
   itemId:item.id,itemKey:'item:'+item.id,itemRule:string(item.type),ownerUnitId:owner,
   slot:string(item.inventoryslot),slotX:integer(item.inventoryX),slotY:integer(item.inventoryY),
   tile:triple(item.position),ammo:integer(item.ammoqty),
   xcomProperty:item.XCOMProperty===true,fuse:integer(item.fuseTimer)
  };
  if(owner!==null)assigned.get(owner).push(item.id);
  return result;
 });
 for(const unit of units)unit.itemIds=assigned.get(unit.unitId);
 const battleId=hash(JSON.stringify({
   source:originalSha256,mission:b.missionType,turn:b.turn,
   units:units.map(u=>u.unitId),items:items.map(i=>i.itemId)
 })).slice(0,32);
 return {
  schema:'xpz3d.battle-start.v1',battleId,
  origin:{
    engine:string(meta.version,'OXCE'),sourceKind:'native-oxce-battle-save',
    sourceSha256:originalSha256,sourceBytes:data.length,
    c0ControlCharsSanitizedInMemory:originalText.length-sanitized.length,
    modIds:(meta.mods||[]).filter(x=>typeof x==='string').slice(0,48)
  },
  mission:{
    type:b.missionType,turn:integer(b.turn,1),mapSize,
    target:string(b.strTarget||meta.target),environment:string(b.enviroEffectsType),
    terrainSets:Array.isArray(b.mapdatasets)?b.mapdatasets.filter(x=>typeof x==='string').slice(0,1024):[],
    mapScript:string(b.lastUsedMapScript),
    tilePayloadSha256:b.binTiles?hash(typeof b.binTiles==='string'?b.binTiles:JSON.stringify(b.binTiles)):null,
    exactGeometryConverted:false
  },
  units,items,
  counts:{
    units:units.length,items:items.length,
    player:units.filter(x=>x.faction===0).length,
    hostile:units.filter(x=>x.faction===1).length,
    neutral:units.filter(x=>x.faction===2).length,
    eligiblePreview:units.filter(x=>x.faction===0&&x.tile&&x.vital.health>0&&x.status===0).length
  },
  capability:{
    combatAuthority:'silent-storm-3d',campaignAuthority:'OXCE',
    resultWriteToCampaignSupported:false,exactBattleParityRequired:false,
    native3DArtMapped:false,native3DMapConverted:false
  }
 };
}
export function writeAtomic(file,payload){
 const parent=path.dirname(path.resolve(file));
 fs.mkdirSync(parent,{recursive:true});
 const tmp=path.join(parent,'.xpz3d-'+process.pid+'-'+crypto.randomBytes(6).toString('hex')+'.tmp');
 try{fs.writeFileSync(tmp,JSON.stringify(payload,null,2)+'\n',{encoding:'utf8',flag:'wx'});fs.renameSync(tmp,file);}
 catch(e){try{fs.unlinkSync(tmp);}catch{}throw e;}
}
export function validateResult(request,result){
 assert(request?.schema==='xpz3d.battle-start.v1','START_SCHEMA','Unrecognized battle start protocol');
 assert(result?.schema==='xpz3d.battle-result.v1','RESULT_SCHEMA','Unrecognized battle result protocol');
 assert(result.battleId===request.battleId,'RESULT_BATTLE','Battle ID mismatch');
 assert(result.sourceSha256===request.origin.sourceSha256,'RESULT_SOURCE','Stale campaign source');
 assert(['won','lost','aborted'].includes(result.outcome),'RESULT_OUTCOME','Bad outcome');
 const uids=new Map(request.units.map(u=>[u.unitId,u]));
 assert(Array.isArray(result.units)&&result.units.length===uids.size,'RESULT_UNITS','Unit set differs');
 const seen=new Set();
 for(const u of result.units){
  assert(u&&uids.has(u.unitId)&&!seen.has(u.unitId),'RESULT_UNIT_ID','Unknown/duplicate unit');
  seen.add(u.unitId);
  assert(['alive','dead','unconscious','escaped'].includes(u.state),'RESULT_UNIT_STATE','Bad unit state');
  assert(Number.isSafeInteger(u.health)&&u.health>=0,'RESULT_HEALTH','Bad health');
  assert(Number.isSafeInteger(u.stun)&&u.stun>=0,'RESULT_STUN','Bad stun');
  if(u.state==='dead')assert(u.health===0,'RESULT_DEAD','Dead unit has positive health');
  if(u.state==='alive')assert(u.health>0,'RESULT_ALIVE','Alive unit has zero health');
 }
 const items=new Set(request.items.map(x=>x.itemId)),used=new Set();
 assert(Array.isArray(result.items)&&result.items.length===items.size,'RESULT_ITEMS','Item conservation violated');
 for(const it of result.items){
  assert(it&&items.has(it.itemId)&&!used.has(it.itemId),'RESULT_ITEM_ID','Unknown/duplicate item');
  used.add(it.itemId);
  assert(it.ownerUnitId===null||uids.has(it.ownerUnitId),'RESULT_ITEM_OWNER','Unknown owner');
  if(it.ammo!==null)assert(Number.isSafeInteger(it.ammo)&&it.ammo>=0,'RESULT_AMMO','Invalid ammo');
 }
 return {
  schema:'xpz3d.result-validated.v1',battleId:request.battleId,
  sourceSha256:request.origin.sourceSha256,outcome:result.outcome,
  unitCount:result.units.length,itemCount:result.items.length,
  check:'schema-identity-inventory-only',
  campaignCommitPerformed:false,
  note:'OXCE authoritative post-battle apply is a separate, not-yet-implemented integration.'
 };
}
if (/[\\/]bridge[.]mjs$/.test(process.argv[1] || '')) {
 try{
  const command=process.argv[2]||'help';
  const args=options(process.argv.slice(3));
  if(command==='help'||args.help){
   console.log('Usage: node bridge.mjs export --save path.sav --out battle-start.json\n'+
     '       node bridge.mjs validate --battle battle-start.json --result battle-result.json --out checked.json');
  }else if(command==='export'){
   assert(args.save&&args.out,'ARG','Missing --save / --out');
   const battle=extractBattle(args.save);writeAtomic(args.out,battle);
   console.log(JSON.stringify({
    kind:'REAL_OXCE_BATTLE_EXPORTED',path:path.resolve(args.out),
    battleId:battle.battleId,mission:battle.mission.type,counts:battle.counts,
    sourceSha256:battle.origin.sourceSha256,originalSaveModified:false
   },null,2));
  }else if(command==='validate'){
   assert(args.battle&&args.result&&args.out,'ARG','Missing arguments');
   const request=JSON.parse(fs.readFileSync(args.battle,'utf8'));
   const result=JSON.parse(fs.readFileSync(args.result,'utf8'));
   const checked=validateResult(request,result);writeAtomic(args.out,checked);
   console.log(JSON.stringify(checked,null,2));
  }else fail('COMMAND','Unknown command '+command);
 }catch(e){console.error('[XPZ3D '+(e.code||'ERROR')+'] '+e.message);process.exitCode=1;}
}
