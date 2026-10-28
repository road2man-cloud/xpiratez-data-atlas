// SPDX-License-Identifier: GPL-3.0-or-later
// Synthetic TAR fixture; never runs original OXCE.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {makeRuntimeArchive,verifyRuntimeArchive} from './prepare-runtime-archive.mjs';
test('streaming native TAR excludes audio, secrets and extra saves without copying entire game',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'xpz-tar-test-'));
  const game=path.join(root,'game'),out=path.join(root,'archive');
  const put=(p,content)=>{
    const f=path.join(game,p);fs.mkdirSync(path.dirname(f),{recursive:true});
    fs.writeFileSync(f,content);return f;
  };
  try{
    for(const x of ['UFO','TFTD','standard','common'])put(x+'/test.bin','BASE');
    put('user/mods/Piratez/metadata.yml','id: piratez\n');
    put('user/mods/Piratez/Ruleset/Piratez.rul','weapons:\n');
    put('user/mods/Piratez/TERRAIN/tile.MCD',Buffer.from([1,2,3]));
    put('user/mods/Piratez/SOUND/track.ogg','PRIVATE_AUDIO');
    put('user/mods/Piratez/SOUND/bang.wav','PRIVATE_AUDIO');
    put('user/mods/Piratez/Resources/Sounds/Distress/PEA Berserk/PINGA.WAV','PRIVATE_AUDIO');
    put('user/mods/Piratez/IMAGES/units.png','IMAGE_DATA');
    put('user/mods/Piratez/file.backup_before_restore_2026','OLD_FILE');
    put('user/mods/Ratling Village Visibility/metadata.yml','id: ratlingVillageVisibility\n');
    put('user/mods/Ratling Village Visibility/Ruleset/ratling_visibility.rul','terrains:\n');
    put('user/options.cfg','mods:\n - id: piratez\n - id: ratlingVillageVisibility\noptions:\n  password: MY_PASSWORD\n  keyBattleEndTurn: 8\n');
    const save=put('user/piratez/3.sav','FAKE_SAVE');
    put('user/piratez/17.sav','PRIVATE_OTHER_SAVE');
    const x=makeRuntimeArchive(game,save,out);
    assert.equal(x.created,true);
    assert.equal(x.externalUploadPerformed,false);
    assert.ok(x.archiveBytes>0);
    assert.equal(verifyRuntimeArchive(out).validated,true);
    const names=spawnSync('tar',['-tzf','oxce-3sav-resources.tar.gz'],{cwd:out,encoding:'utf8'});
    assert.equal(names.status,0,names.stderr);
    assert.ok(names.stdout.includes('Ratling Village Visibility/Ruleset/ratling_visibility.rul'));
    assert.ok(names.stdout.includes('Piratez/TERRAIN/tile.MCD'));
    assert.ok(names.stdout.includes('inputs/3.sav'));
    assert.ok(!names.stdout.includes('.ogg'));
    assert.ok(!names.stdout.includes('.wav'));
    assert.ok(!names.stdout.includes('PINGA.WAV'));
    assert.ok(!names.stdout.includes('17.sav'));
    const options=fs.readFileSync(path.join(out,'staging/config/options.cfg'),'utf8');
    assert.ok(!options.includes('MY_PASSWORD'));
    assert.ok(options.includes('ratlingVillageVisibility'));
    assert.equal(fs.readFileSync(save,'utf8'),'FAKE_SAVE');
    fs.appendFileSync(path.join(out,'oxce-3sav-resources.tar.gz'),'TAMPER');
    assert.throws(()=>verifyRuntimeArchive(out),/TAR_ARCHIVE_HASH_MISMATCH/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
