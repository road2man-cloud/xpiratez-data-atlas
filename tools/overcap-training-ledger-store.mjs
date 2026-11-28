// One authoritative current training ledger, immutable earlier snapshots for exact proof hashes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
export const BASE='public/data/soldier-overcap-terminal-training.json';
export const MANIFEST='public/data/soldier-overcap-terminal-training-manifest.json';
export const hashLedger=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const read=p=>JSON.parse(p.endsWith('.gz')?gunzipSync(fs.readFileSync(p)):fs.readFileSync(p));
const schema='ATLAS_OVERCAP_TERMINAL_TRAINING_LEDGER_V1';
export function assertAppendOnly(old,next){
 assert.equal(old.schema,schema);assert.equal(next.schema,schema);
 for(const k of ['sourceMetadataSha256','sourceLedgerHash','sourceHash','terminalSourceHash'])assert.equal(next[k],old[k],k);
 const rows=new Map(next.rows.map(r=>[r.id,r]));
 assert.equal(rows.size,next.rows.length,'duplicate row ID');
 for(const r of old.rows)assert.deepEqual(rows.get(r.id),r,'lost or changed prior witness '+r.id);
}
function readManifest(){
 if(fs.existsSync(MANIFEST)){
  const m=read(MANIFEST);assert.equal(m.schema,'ATLAS_OVERCAP_TRAINING_SNAPSHOT_INDEX_V1');assert(m.snapshots[m.current]);return m;
 }
 const old=read(BASE),h=hashLedger(old);
 return {schema:'ATLAS_OVERCAP_TRAINING_SNAPSHOT_INDEX_V1',current:h,snapshots:{[h]:BASE}};
}
export function readTrainingLedger(expectedHash=null){
 const m=readManifest(),h=expectedHash||m.current,p=m.snapshots[h];
 assert(p,'Unknown immutable training snapshot '+h);
 const ledger=read(p);assert.equal(ledger.schema,schema);assert.equal(hashLedger(ledger),h,'training snapshot checksum');
 return ledger;
}
export function publishTrainingLedger(next){
 const m=readManifest(),old=readTrainingLedger();
 assertAppendOnly(old,next);
 const h=hashLedger(next),p='public/data/soldier-overcap-terminal-training-merged-'+h+'.json.gz';
 if(!m.snapshots[h]){
  if(fs.existsSync(p))assert.equal(hashLedger(read(p)),h);
  else fs.writeFileSync(p,gzipSync(JSON.stringify(next)+'\n'));
  m.snapshots[h]=p;
 }
 m.current=h;fs.writeFileSync(MANIFEST,JSON.stringify(m,null,2)+'\n');
 return {path:m.snapshots[h],hash:h,summary:next.summary};
}
