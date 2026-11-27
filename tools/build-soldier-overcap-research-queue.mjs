import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {buildOvercapResearchQueue} from '../public/branch-soldier-overcap-research-queue.js';
const read=p=>JSON.parse(fs.readFileSync(p));
const gz=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const result=buildOvercapResearchQueue(gz('public/data/soldiers-modern-index.json.gz'),read('public/data/soldier-overcap-local-paths.json'),read('public/data/soldier-overcap-conversions-v2-rank.json'),gz('public/data/soldier-final-career-research-sets.json.gz'));
fs.writeFileSync('public/data/soldier-overcap-research-queue.json',JSON.stringify(result)+'\n');
console.log(JSON.stringify(result.summary));
