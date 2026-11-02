#!/usr/bin/env node
// Stage26: inspect the real source battle's 44 actors/410 item instances
// against actually installed X-Piratez armor/weapon graphics rules.
// Emits reference paths & SHA fingerprints ONLY; no copyrighted pixels.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const yaml=require('js-yaml');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const must=(condition,message)=>{if(!condition)throw Error(message);};
function args(argv){
  const o={};
  for(let i=0;i<argv.length;i++){
    must(argv[i].startsWith('--')&&i+1<argv.length,'Unknown/empty flag '+argv[i]);
    o[argv[i++].slice(2)]=argv[i];
  }
  return o;
}
function localFile(home,rel){
  if(!rel||typeof rel!=='string'||rel.includes('..')||path.isAbsolute(rel))return null;
  let at=home;
  for(const segment of rel.replaceAll('\\','/').split('/')){
    if(!fs.existsSync(at))return null;
    const list=fs.readdirSync(at);
    const next=list.find(x=>x.toUpperCase()===segment.toUpperCase());
    if(!next)return null;
    at=path.join(at,next);
  }
  return fs.existsSync(at)&&fs.statSync(at).isFile()?at:null;
}
function assetRef(modDir,rel){
  const full=localFile(modDir,rel);
  return {sourceRelativePath:rel,exists:!!full,
    bytes:full?fs.statSync(full).size:null,
    sha256:full?sha(fs.readFileSync(full)):null};
}
function flattenSprites(rules){
  const map=new Map();
  for(const {file,data} of rules){
    for(const entry of data.extraSprites||[]){
      if(!entry||typeof entry!=='object')continue;
      const k=entry.type||entry.typeSingle;
      if(!k)continue;
      const paths=[];
      if(typeof entry.fileSingle==='string')paths.push({index:0,ref:entry.fileSingle});
      if(entry.files&&typeof entry.files==='object'){
        for(const [n,ref] of Object.entries(entry.files))
          if(typeof ref==='string')paths.push({index:Number(n),ref});
      }
      if(!map.has(k))map.set(k,[]);
      map.get(k).push({file,kind:entry.typeSingle?'single':'sheet',images:paths,
        dimensions:entry.typeSingle?null:{w:entry.width||null,h:entry.height||null,subX:entry.subX||null,subY:entry.subY||null}});
    }
  }
  return map;
}
function findSprites(spriteDb,k,slot=null){
  if(!k)return [];
  return (spriteDb.get(k)||[]).map(e=>{
    let images=e.images;
    let selection='entire-sprite-sheet-reference';
    if(Number.isInteger(slot)){
      const exact=images.filter(i=>i.index===slot);
      if(exact.length){images=exact;selection='matching-index';}
      else {
        const candidates=images.filter(i=>Number.isInteger(i.index)&&i.index<=slot)
          .sort((a,b)=>b.index-a.index);
        if(candidates.length && slot-candidates[0].index<8){
          images=[candidates[0]];selection='preceding-frame-group-not-validated';
        }else {images=[];selection='no-index-match';}
      }
    }
    return {...e,selection,images};
  });
}
export function appearanceFromSave(savePath,battle){
  const raw=fs.readFileSync(savePath);
  must(sha(raw)===battle.origin.sourceSha256,'Source save changed after Stage24; abort graphics identity resolution');
  const cleaned=raw.toString('utf8').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
  const documents=yaml.loadAll(cleaned,{json:true});
  const geoscape=documents.find(x=>x&&Array.isArray(x.bases));
  const battleDoc=documents.find(x=>x&&x.battleGame);
  must(geoscape&&battleDoc,'Saved battle / geoscape soldier records not found');
  const appearance=new Map();
  const rawUnits=new Map((battleDoc.battleGame.units||[]).map(x=>[x.id,x]));
  for(const base of geoscape.bases){
    for(const soldier of base.soldiers||[]){
      if(!Number.isInteger(soldier.id)||!Number.isInteger(soldier.gender)||
         !Number.isInteger(soldier.look)||!Number.isInteger(soldier.lookVariant))continue;
      const unit=rawUnits.get(soldier.id);
      if(!unit)continue;
      appearance.set(soldier.id,{gender:soldier.gender,look:soldier.look,
        lookVariant:soldier.lookVariant,armorRule:soldier.armor,
        battleRecolor:Array.isArray(unit.recolor)?unit.recolor:null,
        evidence:'geoscape original Soldier + battleGame BattleUnit in matching source save'});
    }
  }
  return appearance;
}
export function buildCatalog(battle,modDir,appearance=new Map()){
  must(battle?.schema==='xpz3d.battle-start.v1'&&Array.isArray(battle.units)&&Array.isArray(battle.items),'Invalid Stage24 battle manifest');
  const ruleDir=path.join(modDir,'Ruleset');
  must(fs.existsSync(ruleDir),'Original Piratez ruleset folder absent');
  const names=fs.readdirSync(ruleDir).filter(x=>/\.rul$/i.test(x)).sort((a,b)=>{
    if(a==='Piratez.rul')return -1;
    if(b==='Piratez.rul')return 1;
    return a.localeCompare(b);
  });
  const rules=names.map(file=>{
    const buf=fs.readFileSync(path.join(ruleDir,file));
    return {file,sha256:sha(buf),data:yaml.load(buf.toString('utf8'),{json:true})||{}};
  });
  const sprites=flattenSprites(rules);
  const armorDefs=new Map(),itemDefs=new Map();
  for(const {file,data} of rules){
    for(const [key,dest] of [['armors',armorDefs],['items',itemDefs]]){
      for(const record of data[key]||[]){
        if(!record?.type)continue;
        if(!dest.has(record.type))dest.set(record.type,[]);
        dest.get(record.type).push({file,record});
      }
    }
  }
  const pick=(map,id)=>{
    const entries=map.get(id)||[];
    const merged={};for(const x of entries)Object.assign(merged,x.record);
    return {merged,definitions:entries.map(x=>x.file),hasRule:entries.length>0};
  };
  const fileRefCache=new Map();
  const cachedRef=rel=>{
    if(!fileRefCache.has(rel))fileRefCache.set(rel,assetRef(modDir,rel));
    return fileRefCache.get(rel);
  };
  const sprite=(k,slot=null)=>{
    if(!k||((k==='BIGOBS.PCK'||k==='FLOOROB.PCK'||k==='HANDOB.PCK')&&!Number.isInteger(slot)))return [];
    const exact=[...sprites.keys()].find(x=>x.toUpperCase()===String(k).toUpperCase());
    return findSprites(sprites,exact||k,slot).map(e=>({...e,images:e.images.map(x=>({...x,source:cachedRef(x.ref)}))}));
  };
  const unitsByArmor=new Map();
  for(const unit of battle.units){
    if(!unitsByArmor.has(unit.armorRule))unitsByArmor.set(unit.armorRule,[]);
    unitsByArmor.get(unit.armorRule).push(unit);
  }
  const armorCatalog=[...unitsByArmor].map(([armorRule,actors])=>{
    const def=pick(armorDefs,armorRule),rule=def.merged;
    const layered=rule.layersDefinition&&typeof rule.layersDefinition==='object';
    const variants=layered?Object.keys(rule.layersDefinition):[];
    const bodyPrefix=rule.layersDefaultPrefix||null;
    const actualVariants=actors.filter(x=>appearance.has(x.unitId)).map(actor=>{
      const sourceLook=appearance.get(actor.unitId);
      const prefix=sourceLook.gender===0?'M':'F';
      let variantKey=null,fallbackDepth=null;
      for(let maskShift=0;maskShift<=6;maskShift++){
        const key=prefix+(sourceLook.look+(sourceLook.lookVariant&(63>>maskShift))*4);
        if(rule.layersDefinition&&Object.hasOwn(rule.layersDefinition,key)){
          variantKey=key;fallbackDepth=maskShift;break;
        }
      }
      if(!variantKey&&rule.layersDefinition&&Object.hasOwn(rule.layersDefinition,prefix+'0')){
        variantKey=prefix+'0';fallbackDepth=7;
      }
      return {unitId:actor.unitId,gender:sourceLook.gender,look:sourceLook.look,
        lookVariant:sourceLook.lookVariant,battleRecolor:sourceLook.battleRecolor,
        resolvedLayerKey:variantKey,variantFallbackDepth:fallbackDepth,
        exactLayerVariant:variantKey!==null&&fallbackDepth===0};
    });
    const representative=actualVariants.find(x=>x.resolvedLayerKey)||null;
    const representativeKey=representative?.resolvedLayerKey||variants.find(x=>/^(F0|M0)$/.test(x))||variants[0]||null;
    const layers=layered?rule.layersDefinition[representativeKey]:[];
    const slots=Array.isArray(layers)?layers.map((a,i)=>({slot:i,textureKey:a,
      resolved:a?sprite((rule.layersSpecificPrefix?.[i]||bodyPrefix)+'__'+i+'__'+a):[]})).filter(x=>x.textureKey):[];
    const matchingSprites=rule.spriteSheet?sprite(rule.spriteSheet):[];
    const fullSpriteNames=new Set(slots.flatMap(x=>x.resolved.flatMap(e=>e.images.map(y=>y.ref))))
    for(const e of matchingSprites)for(const y of e.images)fullSpriteNames.add(y.ref);
    return {
      armorRule,actors:actors.length,sourceUnitIds:actors.map(x=>x.unitId),
      sourceUnitRules:[...new Set(actors.map(x=>x.unitRule))],
      nativeArtworkReady:false,riggedModelReady:false,realisticMaterialReady:false,
      motionAnimationReady:false,definitions:def.definitions,
      defined: def.hasRule,spriteSheet:rule.spriteSheet||null,sourceSheetRefs:matchingSprites,
      layered:!!layered,bodyPrefix,layerVariantCount:variants.length,
      representativeVariant:representativeKey,
      representativeVariantFromActualSave:!!representative,
      actualActorVariants:actualVariants,
      selectedLayerSourceRefs:slots,sourceReferenceAssetCount:fullSpriteNames.size,
      size:rule.size||1,loftempsSet:rule.loftempsSet||null,
      locomotion:{canRun:rule.allowsRunning??null,canKneel:rule.allowsKneeling??null,
        canStrafe:rule.allowsStrafing??null},
      artworkQuality:'licensed 2D reference only; no 3D mesh authored'
    };
  }).sort((a,b)=>b.actors-a.actors);
  const itemsByRule=new Map();
  for(const item of battle.items){
    if(!itemsByRule.has(item.itemRule))itemsByRule.set(item.itemRule,[]);
    itemsByRule.get(item.itemRule).push(item);
  }
  const itemCatalog=[...itemsByRule].map(([itemRule,instances])=>{
    const def=pick(itemDefs,itemRule),rule=def.merged;
    const hands=instances.filter(i=>i.slot==='STR_LEFT_HAND'||i.slot==='STR_RIGHT_HAND');
    return {
      itemRule,instances:instances.length,sourceItemIds:instances.map(x=>x.itemId),
      inHands:hands.length,
      owners:[...new Set(instances.map(x=>x.ownerUnitId).filter(x=>x!=null))],
      ruleFound:def.hasRule,definitions:def.definitions,battleType:rule.battleType??null,
      twoHanded:rule.twoHanded??null,weight:rule.weight??null,
      compatibleAmmo:rule.compatibleAmmo||[],
      combatRelevant:!!(rule.battleType && rule.battleType>0),
      spriteIndices:{big:rule.bigSprite??null,floor:rule.floorSprite??null,hand:rule.handSprite??null},
      spriteSources:{
        big:sprite('BIGOBS.PCK',rule.bigSprite),
        floor:sprite('FLOOROB.PCK',rule.floorSprite),
        hand:sprite('HANDOB.PCK',rule.handSprite)
      },
      nativeWeaponMeshReady:false,rigSocketReady:false,muzzleReady:false,
      animationsReady:false,
      graphicWorkStatus:'2D references indexed only; 3D weapon to be modeled'
    };
  }).sort((a,b)=>b.inHands-a.inHands||b.instances-a.instances);
  const playerUnits=battle.units.filter(u=>u.faction===0);
  const representative=playerUnits.map(u=>{
    const equipped=battle.items.filter(i=>i.ownerUnitId===u.unitId&&
      (i.slot==='STR_LEFT_HAND'||i.slot==='STR_RIGHT_HAND'));
    return {unitId:u.unitId,armorRule:u.armorRule,name:u.name,sourceTile:u.tile,
      sourceAppearance:appearance.get(u.unitId)||null,
      handItems:equipped.map(i=>({itemRule:i.itemRule,hand:i.slot,itemId:i.itemId}))};
  });
  return {
    schema:'xpz3d.graphics-asset-worklist.v1',
    source:{battleId:battle.battleId,saveSha256:battle.origin.sourceSha256,mapSize:battle.mission.mapSize},
    coverage:{sourceUnits:battle.units.length,sourceItems:battle.items.length,
      uniqueArmorRules:armorCatalog.length,uniqueItemRules:itemCatalog.length,
      definedArmorRules:armorCatalog.filter(a=>a.defined).length,
      definedItemRules:itemCatalog.filter(i=>i.ruleFound).length,
      sourceSpritesIndexed:sprites.size,
      geoscapeSoldierAppearancesResolved:representative.filter(x=>x.sourceAppearance).length,
      actorArtworkNativeConverted:0,weaponArtworkNativeConverted:0,
      S2ImportForRealActor: false},
    ruleSources:rules.map(x=>({file:x.file,sha256:x.sha256})),
    policy:{spriteReferencesOnly:true,originalArtPixelsEmbedded:false,
      contentLicense:'Local X-Piratez assets as modeling references; no redistribution',
      rulesetMergeOrderNotValidated:true,
      threeDNeeds:'Distinct rigged character body shapes + modular clothing + authentic weapons, textures, PBR materials, animations and collision',
      falsification:'Source names alone and hypothetical sockets never count as a finished native character/weapon'},
    armorCatalog,itemCatalog,playerSpawnEquipment:representative
  };
}
export function run(o){
  must(o.battle&&o['game-root']&&o.out&&o.save,'Required --battle --game-root --save --out');
  const b=JSON.parse(fs.readFileSync(o.battle,'utf8'));
  const appearances=appearanceFromSave(o.save,b);
  const d=buildCatalog(b,path.join(o['game-root'],'user','mods','Piratez'),appearances);
  const out=path.resolve(o.out);
  fs.mkdirSync(path.dirname(out),{recursive:true});
  if(fs.existsSync(out)){
    const old=JSON.parse(fs.readFileSync(out,'utf8'));
    must(old.source.battleId===d.source.battleId,'Refuse to overwrite different battle artwork worklist');
  }
  fs.writeFileSync(out,JSON.stringify(d,null,2)+'\n','utf8');
  return {out,coverage:d.coverage,firstPlayer:d.playerSpawnEquipment[0],
    dominantArmor:d.armorCatalog.slice(0,7).map(x=>({armor:x.armorRule,actors:x.actors,defined:x.defined,
      variants:x.layerVariantCount,sprite:x.spriteSheet})),
    equippedItemRules:d.itemCatalog.filter(x=>x.inHands>0).slice(0,20)
      .map(x=>({item:x.itemRule,held:x.inHands,graphicSourceFound:[...Object.values(x.spriteSources)]
        .flat().some(a=>a.images?.some(b=>b.source.exists))}))};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/graphics-catalog.mjs')){
  try{console.log(JSON.stringify(run(args(process.argv.slice(2))),null,2))}
  catch(e){console.error('GRAPHICS_CATALOG_ERROR '+e.stack);process.exitCode=1;}
}
