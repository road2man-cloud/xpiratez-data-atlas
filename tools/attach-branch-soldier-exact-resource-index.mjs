import fs from "node:fs";
import zlib from "node:zlib";
import {attachExactResourceIndex} from "./branch-soldier-exact-resource-index.mjs";
const filename="public/data/branch-soldier-results.json.gz",dir=process.argv[2];
if(!dir)throw Error("Pass the generated index directory");
const db=JSON.parse(zlib.gunzipSync(fs.readFileSync(filename)));
console.log(JSON.stringify(attachExactResourceIndex(db,dir,"public/data")));
fs.writeFileSync(filename,zlib.gzipSync(Buffer.from(JSON.stringify(db)),{level:9}));
