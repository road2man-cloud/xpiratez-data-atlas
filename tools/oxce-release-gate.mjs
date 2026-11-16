#!/usr/bin/env node
// Release gate for custom OXCE R131+ executables.
// The canonical C++ source is NOT the atlas's JS/3D engine source.
// A release requires positive per-feature evidence; an unchecked entry is a failure.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const REQUIRED = [
  'fire-mode-cycle-supported-only',
  'new-enemy-team-scope-run-interrupt',
  'interrupted-action-tu-accounting',
  'selected-soldier-highlight',
  'no-xp-enemy-tile-marker',
  'grenade-prime-and-throw-tu-hover',
  'inventory-low-tu-button',
  'trait-adjusted-raw-stats-toggle',
  'ammo-free-pow-hud',
  'auto-equipment-ammo-15-eligibility',
  'auto-equipment-offhand',
  'auto-equipment-medical-wear-slots',
  'auto-equipment-performance',
  'base-defense-recovery-legend',
  'hud-inventory-controls-preserved',
];
const shaPattern = /^[a-f\d]{64}$/i;
const fail = [];
function requireString(v, field) {
  if (typeof v !== 'string' || !v.trim()) fail.push(field + ': missing');
  return v;
}
function verifyManifest(m, options = {}) {
  fail.length = 0;
  if (m?.schema !== 'xpz-oxce-cumulative-release/v1') fail.push('schema mismatch');
  if (!/^R\d+$/.test(String(m?.release ?? ''))) fail.push('release must be R-number');
  if (!/^R\d+$/.test(String(m?.candidateBaseline ?? ''))) fail.push('candidateBaseline missing');
  const src=m?.source ?? {};
  requireString(src.repository, 'source.repository');
  if (!/^[a-f0-9]{40}$/i.test(String(src.commit ?? ''))) fail.push('source.commit must be 40-hex commit');
  requireString(src.branch, 'source.branch');
  requireString(src.toolchain, 'source.toolchain');
  const bin=m?.binary ?? {};
  requireString(bin.name,'binary.name');
  if (!shaPattern.test(String(bin.sha256 ?? ''))) fail.push('binary.sha256 must be 64-hex');
  if (m?.build?.result !== 'PASS') fail.push('build.result not PASS');
  if (m?.runtime?.result !== 'PASS') fail.push('runtime.result not PASS');
  requireString(m?.build?.evidence,'build.evidence');
  requireString(m?.runtime?.evidence,'runtime.evidence');
  if (m?.build?.sourceCommit !== src.commit) fail.push('build/source commit mismatch');
  if (m?.runtime?.binarySha256 !== bin.sha256) fail.push('runtime/binary sha256 mismatch');
  const items=m?.features;
  if (!Array.isArray(items)) fail.push('features must be array');
  const byId=new Map();
  for (const f of Array.isArray(items)?items:[]) {
    if(!f || typeof f.id!=='string'){fail.push('feature without id');continue;}
    if(byId.has(f.id)) fail.push('duplicate feature '+f.id);
    byId.set(f.id,f);
  }
  for (const id of REQUIRED) {
    const f=byId.get(id);
    if(!f){fail.push('missing feature '+id);continue;}
    if(f.status !== 'PASS') fail.push('feature '+id+' not PASS');
    requireString(f.test,'feature '+id+' test');
    requireString(f.evidence,'feature '+id+' evidence');
    requireString(f.source,'feature '+id+' source symbol/path');
    if (f.verifiedSourceCommit !== src.commit) fail.push('feature '+id+' commit mismatch');
    if (f.verifiedBinarySha256 !== bin.sha256) fail.push('feature '+id+' binary mismatch');
  }
  if (typeof options.exe === 'string') {
    if (!fs.existsSync(options.exe)) fail.push('binary does not exist: '+options.exe);
    else {
      const digest=crypto.createHash('sha256').update(fs.readFileSync(options.exe)).digest('hex');
      if (digest.toLowerCase()!==String(bin.sha256??'').toLowerCase()) fail.push('local EXE SHA-256 mismatch');
    }
  }
  return [...fail];
}
const arg=process.argv.slice(2);
if (arg.includes('--help') || arg.length < 1) {
  console.log('Usage: node tools/oxce-release-gate.mjs <release-manifest.json> [--exe <local-exe>]');
  process.exit(arg.includes('--help') ? 0 : 2);
}
const i=arg.indexOf('--exe');
const exe=i>=0?arg[i+1]:undefined;
try {
  const manifest=JSON.parse(fs.readFileSync(path.resolve(arg[0]),'utf8'));
  const errs=verifyManifest(manifest,{exe});
  if (errs.length) {
    console.error('OXCE RELEASE BLOCKED ('+errs.length+' issues):\n'+errs.map(e=>' - '+e).join('\n'));
    process.exit(1);
  }
  console.log('OXCE RELEASE PASS: '+manifest.release+' '+manifest.binary.sha256);
} catch(e){console.error('OXCE RELEASE BLOCKED: '+e.message);process.exit(1)}
