// Strict source extraction for the starting-stock junk-pile recipe.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
const start=JSON.parse(fs.readFileSync("tools/data/overcap-forward-starting-base-v3.json"));
const dir=process.argv.find(x=>x.startsWith("--rules="))?.slice(8);
assert(dir);
const sha=b=>createHash("sha256").update(b).digest("hex");
let source=null,lines=null;
for(const [file,hash] of Object.entries(start.ruleFiles)){
 const b=fs.readFileSync(path.join(dir,file));assert.equal(sha(b),hash,file);
 const a=b.toString("utf8").split(/\r?\n/);
 let section=null;
 for(let i=0;i<a.length;i++){
  if(/^[A-Za-z][A-Za-z0-9_]*:/.test(a[i]))section=a[i].split(":")[0];
  if(section==="manufacture"&&/^  - name: STR_JUNK_PILE_EX\s*$/.test(a[i])){
   assert(!lines,"Multiple junk pile recipe definitions");
   let j=i+1;while(j<a.length&&!/^  - |^[A-Za-z][A-Za-z0-9_]*:/.test(a[j]))j++;
   lines=a.slice(i,j);source={file,lineStart:i+1,lineEnd:j,sectionSha256:sha(lines.join("\n"))};
  }
 }
}
assert(lines);
const r={id:"STR_JUNK_PILE_EX",requires:[],functions:[],inputs:{},fixed:{},outcomes:[]};
let mode=null;
for(const l of lines.slice(1)){
 if(!l.trim()||/^\s*#/.test(l))continue;
 let m;
 if((m=l.match(/^    (requires|requiredItems|producedItems|randomProducedItems):\s*$/))){mode=m[1];continue;}
 if((m=l.match(/^    (space|time|cost): (\d+)\s*$/))){r[m[1]]=Number(m[2]);mode=null;continue;}
 if((m=l.match(/^    category: (STR_\w+)\s*$/))){r.category=m[1];mode=null;continue;}
 if((m=l.match(/^    refund: (true|false)\s*$/))){r.refund=m[1]==="true";mode=null;continue;}
 if(mode==="requires"&&(m=l.match(/^      - (STR_\w+)\s*$/))){r.requires.push(m[1]);continue;}
 if(["requiredItems","producedItems"].includes(mode)&&(m=l.match(/^      (STR_\w+): (\d+)\s*$/))){const t=mode==="requiredItems"?r.inputs:r.fixed;assert(!Object.hasOwn(t,m[1]));t[m[1]]=Number(m[2]);continue;}
 if(mode==="randomProducedItems"&&(m=l.match(/^      - \[(\d+), \{(STR_\w+): (\d+)\}\]\s*$/))){r.outcomes.push({weight:Number(m[1]),items:{[m[2]]:Number(m[3])}});continue;}
 throw Error("Unmodeled recipe line: "+l);
}
assert.equal(r.space,0);assert.equal(r.cost,0);assert(r.time>0&&r.outcomes.length&&r.inputs.STR_JUNK_PILE===1);
r.totalWeight=r.outcomes.reduce((n,x)=>n+x.weight,0);
const out={schema:"ATLAS_FORWARD_JUNK_EXTRACTION_V3",sourceMetadataSha256:start.sourceMetadataSha256,source,ruleFiles:start.ruleFiles,recipe:r,scope:"All fixed outputs plus exactly one weighted random outcome; input consumed at production start. Work time and outcome remain conditional."};
fs.writeFileSync("tools/data/overcap-forward-junk-extraction-v3.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({source,inputs:r.inputs,fixed:r.fixed,outcomes:r.outcomes.length,totalWeight:r.totalWeight},null,2));
