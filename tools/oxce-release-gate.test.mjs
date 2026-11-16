import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const cli=path.resolve('tools/oxce-release-gate.mjs');
const ids=[
'fire-mode-cycle-supported-only','new-enemy-team-scope-run-interrupt',
'interrupted-action-tu-accounting','selected-soldier-highlight',
'no-xp-enemy-tile-marker','grenade-prime-and-throw-tu-hover',
'inventory-low-tu-button','trait-adjusted-raw-stats-toggle','ammo-free-pow-hud',
'auto-equipment-ammo-15-eligibility','auto-equipment-offhand',
'auto-equipment-medical-wear-slots','auto-equipment-performance',
'base-defense-recovery-legend','hud-inventory-controls-preserved'];
const commit='a'.repeat(40), sha='b'.repeat(64);
const base=()=>({schema:'xpz-oxce-cumulative-release/v1',release:'R135',candidateBaseline:'R131',
 source:{repository:'example/actual-oxce-source',commit,branch:'main',toolchain:'MSVC Win32 C++14'},
 binary:{name:'openxcom_R135.exe',sha256:sha},
 build:{result:'PASS',sourceCommit:commit,evidence:'CI build report'},
 runtime:{result:'PASS',binarySha256:sha,evidence:'recorded actual-game smoke test'},
 features:ids.map(id=>({id,status:'PASS',test:'repro-'+id,evidence:'actual test output',source:'src/'+id+'.cpp',verifiedSourceCommit:commit,verifiedBinarySha256:sha}))});
function run(manifest){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'oxce-release-gate-'));
 try{
  const file=path.join(dir,'manifest.json');
  fs.writeFileSync(file,JSON.stringify(manifest));
  return spawnSync(process.execPath,[cli,file],{encoding:'utf8'});
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
}
test('complete traced manifest is accepted',()=>assert.equal(run(base()).status,0));
test('unverified R131 feature blocks release',()=>{const m=base();m.features[0].status='UNVERIFIED';assert.equal(run(m).status,1)});
test('missing legacy HUD feature blocks release',()=>{const m=base();m.features.pop();assert.equal(run(m).status,1)});
test('duplicate feature cannot satisfy gate',()=>{const m=base();m.features.push(m.features[0]);assert.equal(run(m).status,1)});
test('wrong executable hash blocks release',()=>{const m=base();m.runtime.binarySha256='c'.repeat(64);assert.equal(run(m).status,1)});
test('wrong source commit blocks release',()=>{const m=base();m.features[0].verifiedSourceCommit='b'.repeat(40);assert.equal(run(m).status,1)});
test('build or runtime UNVERIFIED blocks release',()=>{const m=base();m.runtime.result='UNVERIFIED';assert.equal(run(m).status,1)});
