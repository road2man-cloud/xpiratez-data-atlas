// Compress the already-published manufacturer index without needing mod assets.
// The primary build-manufacture-data.mjs generator also creates this sidecar.
import fs from "node:fs";
import {gzipSync} from "node:zlib";
const file="public/data/manufacture-index.json";
const input=fs.readFileSync(file);
const data=JSON.parse(input.toString("utf8"));
if(!Array.isArray(data.index)||data.index.length!==2158)throw new Error("Unexpected manufacture source index");
const output=gzipSync(input,{level:9});
fs.writeFileSync(file+".gz",output);
console.log("Manufacture index compressed:",input.length,"->",output.length,"bytes");
