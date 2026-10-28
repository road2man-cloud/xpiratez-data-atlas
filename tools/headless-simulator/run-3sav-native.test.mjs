// SPDX-License-Identifier: GPL-3.0-or-later
// Syntax and fail-closed CLI tests only. No engine or battle is launched.
import test from 'node:test';
import assert from 'node:assert/strict';
import {parse3SavArgs,inspectArchiveListing,SAVE_HASH,ARCHIVE_HASH} from './run-3sav-native.mjs';

const args=['--archive','3sav.tar.gz','--binary','oxce-native','--manifest','native-build.json','--out','/tmp/3sav-run'];
test('original 3.sav only: strict seed and trial count validation',()=>{
  const standard=parse3SavArgs(args);
  assert.equal(standard.count,1);
  assert.equal(standard.timeout,180);
  assert.deepEqual(parse3SavArgs([...args,'--count','20','--start-seed','1234']).count,20);
  assert.equal(parse3SavArgs([...args,'--xvfb','--smoke-only']).args['--smoke-only'],true);
  assert.throws(()=>parse3SavArgs([...args,'--count','2']),/MULTIPLE_TRIALS_REQUIRE_EXPLICIT_START_SEED/);
  assert.throws(()=>parse3SavArgs([...args,'--count','0']),/TRIALS_PER_PLAN/);
  assert.throws(()=>parse3SavArgs([...args,'--count','101']),/TRIALS_PER_PLAN/);
  assert.throws(()=>parse3SavArgs([...args,'--count','2','--start-seed','18446744073709551615']),/INVALID_UINT64_START_SEED/);
  assert.throws(()=>parse3SavArgs([...args,'--seed','5']),/INVALID_ARGUMENT/);
  assert.throws(()=>parse3SavArgs([...args,'--out','/tmp/b']),/DUPLICATE_ARGUMENT/);
  assert.throws(()=>parse3SavArgs(['--binary','a']),/REQUIRED_ARGUMENT/);
  assert.match(SAVE_HASH,/^[0-9a-f]{64}$/);
  assert.match(ARCHIVE_HASH,/^[0-9a-f]{64}$/);
});
test('private archive requires complete data roots and both mods and one explicit original save',()=>{
  const content=['UFO/','UFO/test','TFTD/','TFTD/a','standard/','standard/a','common/','common/a',
    'user/mods/Piratez/metadata.yml','user/mods/Ratling Village Visibility/metadata.yml',
    'inputs/3.sav','config/options.cfg','resource-manifest.json'].join('\n')+'\n';
  const good=inspectArchiveListing(content);
  assert.equal(good.memberCount,13);
  assert.deepEqual(good.verifiedModNames,['piratez','ratlingVillageVisibility']);
  for(const leak of ['user/piratez/17.sav','user/mods/Piratez/SOUND/new.ogg','user/mods/Piratez/Resources/Sounds/Deep/FX.WAV'])
    assert.throws(()=>inspectArchiveListing(content+leak+'\n'),/OTHER_CAMPAIGN_SAVE_DETECTED|AUDIO_RESOURCE_DETECTED/);
  assert.throws(()=>inspectArchiveListing(content+'../escape\n'),/UNSAFE_PRIVATE_TAR_ENTRY/);
  assert.throws(()=>inspectArchiveListing(content.replace('Ratling Village Visibility/metadata.yml','Ratling Village Visibility/RMP/test.rmp')),/REQUIRED_ORIGINAL_RESOURCE_MISSING/);
  assert.throws(()=>inspectArchiveListing(''),/REQUIRED_ORIGINAL_RESOURCE_MISSING/);
});
