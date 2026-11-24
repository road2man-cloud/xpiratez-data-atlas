import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {createHash} from "node:crypto";
import {packExactResourceIndex,unpackExactResourceIndex} from "../public/branch-soldier-exact-packed.js";
const dir=process.argv[2]||"public/data";
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
for(const file of fs.readdirSync(dir).filter(x=>/^branch-soldier-d[5-7]-exact-(damsel|madgal)\.json\.gz$/.test(x))){
 const filename=path.join(dir,file),original=fs.readFileSync(filename),sha=hash(original);
 const a=JSON.parse(zlib.gunzipSync(original));
 const raw=packExactResourceIndex(a,sha);
 const restored=unpackExactResourceIndex(raw,sha);
 if(restored.metrics.labels!==a.metrics.labels)throw Error("Packed label count mismatch");
 const target=filename.replace(".json.gz",".packed.gz"),gz=zlib.gzipSync(raw,{level:6});
 fs.writeFileSync(target,gz);
 console.log(JSON.stringify({file:path.basename(target),originalBytes:original.length,packedBytes:gz.length,packedRawBytes:raw.length,sha256:hash(gz),labels:a.metrics.labels}));
}
