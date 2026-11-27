import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import * as engine from '../public/soldiers/modern/eligibility.js';
import {produceOvercapLocalPaths} from '../public/branch-soldier-overcap-local-paths.js';
const data=JSON.parse(gunzipSync(fs.readFileSync('public/data/soldiers-modern-index.json.gz')));
const report=JSON.parse(fs.readFileSync('public/data/soldier-overcap-training-candidates.json'));
const output=produceOvercapLocalPaths(data,report,engine,{sourceRuntimeBlob:process.argv[2]||null});
fs.writeFileSync('public/data/soldier-overcap-local-paths.json',JSON.stringify(output)+'\n');
console.log(JSON.stringify(output.summary));
