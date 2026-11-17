import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const inventory = fs.readFileSync(path.join(root,'src/Battlescape/InventoryState.cpp'),'utf8');

test('No auto-equip for signet ring, all mundane gems, TU-lowering medallion',()=>{
 for(const id of ['STR_RING','STR_MEDALLION','STR_YELLOW_GEM','STR_BLUE_GEM','STR_GREEN_GEM','STR_RED_GEM','STR_DIAMOND']){
   assert.match(inventory,new RegExp('id == "'+id+'"'));
 }
 assert.match(inventory,/if \(id == "STR_MEDALLION"[^]*?\) return -1;/);
});

test('Preserve functional legacy jewelry and medical priority',()=>{
 for(const id of ['STR_HELLERIUM_CHARM','STR_LUNAR_WARD','STR_AVATAR_MEDALLION','STR_HAREM_COLLAR','STR_AY_GOGGLES','STR_BEJEWELED_CAP']){
   assert.match(inventory,new RegExp('id == "'+id+'"\\) return [0-9]+;'));
 }
 assert.match(inventory,/getBattleType\(\) == BT_MEDIKIT\) return 10000/);
});

test('Restore proven useful hats omitted by overly restrictive R9F',()=>{
 for(const id of ['STR_GOLDEN_MASK','STR_GLITTERSKULL','STR_GAS_MASK','STR_FUR_HAT','STR_PIRATE_HAT','STR_POLYMAKH_SHAPKA','STR_RIBBON']){
   assert.match(inventory,new RegExp('id == "'+id+'"\\) return [0-9]+;'));
 }
 assert.match(inventory,/return -1; \/\/ Unknown effect => manual wear only/);
});

test('Auto-wear never displaces manual gear or grants overweight TU penalty',()=>{
 assert.match(inventory,/held->getSlot\(\) == wearSlot\) return/);
 assert.match(inventory,/totalWeight\(unit,candidate\) > unit->getBaseStats\(\)->strength/);
 assert.match(inventory,/!rule->canBePlacedIntoInventorySection\(wearSlot\)/);
 assert.match(inventory,/if \(candidateScore < 0/);
});

test('Retain important AutoAll and version lineage',()=>{
 assert.match(inventory,/shotsPacked >= 15/);
 assert.match(inventory,/R135-r3: secure whip and stun rod AFTER/);
 const main=fs.readFileSync(path.join(root,'src/main.cpp'),'utf8');
 assert.match(main,/R135-R9G-WEARABLE-SAFE/);
});
