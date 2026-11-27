import fs from "node:fs";
import {makeOvercapContinuationQueue} from "./overcap-continuation-queue-v1.mjs";
const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const q=makeOvercapContinuationQueue(read("public/data/soldier-overcap-unified-exploration.json"),read("public/data/soldier-atlas-career-branches.json"));
fs.mkdirSync("tools/data",{recursive:true});
fs.writeFileSync("tools/data/overcap-continuation-queue-v1.json",JSON.stringify(q)+"\n");
console.log(JSON.stringify(q.summary));
