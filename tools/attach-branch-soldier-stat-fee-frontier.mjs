// Attach the local graph result to the current release asset, preserving
// every other worker's records. Use the full builder for subsequent rebuilds.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {attachStatFeeFrontier} from "./branch-soldier-stat-fee-frontier.mjs";
const input=process.argv[2];
if(!input)throw Error("Usage: node tools/attach-branch-soldier-stat-fee-frontier.mjs <graph-result.json>");
const output="public/data/branch-soldier-results.json.gz";
const before=JSON.parse(zlib.gunzipSync(fs.readFileSync(output)));
const metrics=attachStatFeeFrontier(before,fs.readFileSync(input),path.basename(input));
const bytes=Buffer.from(JSON.stringify(before)),gz=zlib.gzipSync(bytes,{level:9});
fs.writeFileSync(output,gz);
console.log(JSON.stringify({metrics,witnesses:Object.keys(before.witnesses).length,bytes:bytes.length,gzipBytes:gz.length}));
