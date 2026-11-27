import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import * as engine from '../public/soldiers/modern/eligibility.js';
import {produceOvercapConversionPaths} from '../public/branch-soldier-overcap-conversions.js';
const data=JSON.parse(gunzipSync(fs.readFileSync('public/data/soldiers-modern-index.json.gz')));
const report=JSON.parse(fs.readFileSync('public/data/soldier-overcap-training-candidates.json'));
const output=produceOvercapConversionPaths(data,report,engine,{sourceRuntimeBlob:process.argv[2]||null});
fs.writeFileSync('public/data/soldier-overcap-conversions.json',JSON.stringify(output)+'\n');
console.log(JSON.stringify(output.summary));
