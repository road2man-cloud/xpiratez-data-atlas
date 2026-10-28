// SPDX-License-Identifier: GPL-3.0-or-later
// Synthetic local-packaging fixture. No game or battle is executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {packageHeadlessAssets,verifyHeadlessAssets,shouldCopy,sanitizeOptions,sha256} from './prepare-runtime-assets.mjs';

test('soundless local-only pack preserves gameplay rules and *all* installed mods',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'xpz-native-resources-'));
  const game=path.join(root,'game'),out=path.join(root,'out');
  function put(rel,bytes){
    const p=path.join(game,rel);fs.mkdirSync(path.dirname(p),{recursive:true});
    fs.writeFileSync(p,bytes);return p;
  }
  try{
    for(const name of ['UFO','TFTD','common','standard'])
      put(name+'/PLACEHOLDER',name);
    put('user/mods/Piratez/metadata.yml','id: piratez\n');
    put('user/mods/Piratez/Ruleset/Piratez.rul','items:\n');
    put('user/mods/Piratez/TERRAIN/TILE.MCD',Buffer.from([0,255,23]));
    put('user/mods/Piratez/SOUND/music.ogg','MUSIC_BYTES');
    put('user/mods/Piratez/SOUND/explode.wav','SOUND_BYTES');
    put('user/mods/Piratez/IMAGES/Units.png','GFX_BYTES');
    put('user/mods/Piratez/temp.backup_before_restore_2026','DO_NOT_COPY');
    put('user/mods/Ratling Village Visibility/metadata.yml','id: ratlingVillageVisibility\n');
    put('user/mods/Ratling Village Visibility/Ruleset/ratling_visibility.rul','terrains:\n');
    put('user/options.cfg','mods:\n - id: piratez\n   active: true\n - id: ratlingVillageVisibility\n   active: true\noptions:\n  password: example-secret\n  lazyLoadResources: true\n  keyBattleEndTurn: 8\n');
    const save=put('user/piratez/3.sav',Buffer.from('ORIGINAL_SAVE_BYTES\n'));
    put('user/piratez/17.sav','PRIVATE_OTHER_CAMPAIGN_SAVE');
    const saveHash=sha256(fs.readFileSync(save));
    const r=packageHeadlessAssets(game,save,out,{archive:false});
    assert.equal(r.externalUploadPerformed,false);
    assert.equal(r.sourceSaveSha256,saveHash);
    const bundle=path.join(out,'bundle');
    assert.equal(verifyHeadlessAssets(bundle).validated,true);
    assert.equal(fs.existsSync(path.join(bundle,'data/user/mods/Piratez/SOUND/music.ogg')),false);
    assert.equal(fs.existsSync(path.join(bundle,'data/user/mods/Piratez/SOUND/explode.wav')),false);
    assert.equal(fs.existsSync(path.join(bundle,'data/user/mods/Piratez/IMAGES/Units.png')),true);
    assert.equal(fs.existsSync(path.join(bundle,'data/user/mods/Ratling Village Visibility/Ruleset/ratling_visibility.rul')),true);
    assert.equal(fs.existsSync(path.join(bundle,'inputs/17.sav')),false);
    const options=fs.readFileSync(path.join(bundle,'config/options.cfg'),'utf8');
    assert.ok(!options.includes('password'));
    assert.ok(!options.includes('example-secret'));
    assert.ok(options.includes('ratlingVillageVisibility'));
    assert.ok(options.includes('keyBattleEndTurn: 8'));
    assert.equal(sha256(fs.readFileSync(save)),saveHash);
    assert.throws(()=>packageHeadlessAssets(game,save,path.join(game,'baddir'),{archive:false}),
      /OUTPUT_MUST_NOT_BE_GAME_INSTALL/);
    assert.throws(()=>packageHeadlessAssets(game,save,out,{archive:false}),
      /OUTPUT_ALREADY_EXISTS/);
    fs.appendFileSync(path.join(bundle,'data/user/mods/Piratez/Ruleset/Piratez.rul'),'tamper');
    assert.throws(()=>verifyHeadlessAssets(bundle),/HEADLESS_ASSET_HASH_MISMATCH/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('filter excludes all audio and backups, keeps terrain and images',()=>{
  for(const f of ['user/mods/Piratez/SOUND/track.ogg','SOUND/n.wav','user/mods/Piratez/X/file.wav',
                   'user/piratez/other.sav','user/mods/Piratez/a.backup_before_restore_123'])
    assert.equal(shouldCopy(f),false,f);
  for(const f of ['user/mods/Piratez/TERRAIN/SEED.MCD','UFO/GEODATA/PALETTES.DAT',
                   'user/mods/Piratez/IMAGES/a.png','user/mods/Ratling Village Visibility/Ruleset/a.rul'])
    assert.equal(shouldCopy(f),true,f);
  const opts=sanitizeOptions('mods:\n  - id: piratez\n  password: dont-copy\n  Password: dont-copy-either\n  lazyLoadResources: true\n');
  assert.doesNotMatch(opts,/dont-copy/);
  assert.match(opts,/lazyLoadResources: true/);
});
