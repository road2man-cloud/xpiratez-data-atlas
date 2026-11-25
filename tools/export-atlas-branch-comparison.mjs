// Project branch metadata only, leaving the canonical research/route registry intact.
import fs from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const source=fs.readFileSync(new URL('../public/data/branch-soldier-results.json.gz',import.meta.url));
const db=JSON.parse(gunzipSync(source));
const groups=new Map(),captains=new Map(),choices=new Map();
const ix=(map,value)=>{const key=JSON.stringify(value);if(!map.has(key))map.set(key,map.size);return map.get(key)};
const rows=db.branches.map(b=>[b.id,b.rank,ix(captains,b.captain),ix(choices,b.choices),b.historyCount,ix(groups,[b.blockedResearch||[],b.blockedRoots||[]]),!!b.sourceRootConflict]);
const unpack=map=>[...map.keys()].map(JSON.parse);
const raw={schema:'ATLAS_BRANCH_OPTIONS_V1',sourceMetadataSha256:db.sourceMetadataSha256,sourceRegistrySha256:createHash('sha256').update(source).digest('hex'),rows,captains:unpack(captains),choices:unpack(choices),blocked:unpack(groups)};
const encoded=gzipSync(JSON.stringify(raw)).toString('base64');
const offset=Number(process.argv[2]||0),size=Number(process.argv[3]||16000);
console.log(JSON.stringify({length:encoded.length,count:rows.length,sha256:createHash('sha256').update(encoded).digest('hex'),part:encoded.slice(offset,offset+size)}));
