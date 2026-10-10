import fs from "node:fs";
import path from "node:path";

// Keep research decision-gate facts independent from the older compact
// "prerequisites" union. Read the generated effective-raw research sources
// already published with the Atlas, not hand-authored lists.
const detailDir="public/items/data/research-chunks";
const output="public/data/choice-research-gates.json";
const known=new Set(JSON.parse(fs.readFileSync("public/data/progression-research.json","utf8")).topics.map(x=>x.id));
const data={};
const unknownReferences=new Map();
let counts={dependencies:0,requires:0,unlocks:0,freeSources:0,protectedSources:0,repeatable:0,sequential:0};
const names=(value,id,key)=> {
  const arr=Array.isArray(value)?value:value==null?[]:[value];
  for(const name of arr){
    if(typeof name!=="string"||!known.has(name)){
      const bucket=key+"|"+String(name);
      unknownReferences.set(bucket,(unknownReferences.get(bucket)||0)+1);
    }
  }
  const recognized=arr.filter(x=>typeof x==="string"&&known.has(x));
  // Duplicates in getOneFree are intentional lottery weights in the OXCE
  // possibilities vector: never deduplicate or sort these entries.
  return key==="getOneFree"||key==="getOneFreeProtected"?recognized:[...new Set(recognized)];
};
for(const file of fs.readdirSync(detailDir).filter(x=>x.endsWith(".json")).sort()){
  const json=JSON.parse(fs.readFileSync(path.join(detailDir,file),"utf8"));
  for(const detail of Object.values(json.details||{})){
    const {id,raw}=detail;
    if(!known.has(id)||data[id])throw new Error("Duplicate or unknown research "+id);
    const row={};
    for(const [field,src] of [
      ["dependencies","dependencies"],["requires","requires"],["unlocks","unlocks"],
      ["getOneFree","getOneFree"]]){
      const refs=names(raw[src],id,src);
      if(refs.length)row[field]=refs;
    }
    if(raw.getOneFreeProtected && typeof raw.getOneFreeProtected==="object"){
      const protectedMap={};
      for(const [pre,targets] of Object.entries(raw.getOneFreeProtected)){
        if(!known.has(pre)){unknownReferences.set("protectedPre|"+pre,1);continue;}
        const refs=names(targets,id,"getOneFreeProtected");
        if(refs.length)protectedMap[pre]=refs;
      }
      if(Object.keys(protectedMap).length)row.getOneFreeProtected=protectedMap;
    }
    const unknown=(key)=>[...(Array.isArray(raw[key])?raw[key]:raw[key]==null?[]:[raw[key]])]
      .filter(x=>typeof x==="string"&&!known.has(x));
    if(unknown("dependencies").length)row.unresolvedDependencies=unknown("dependencies");
    if(unknown("requires").length)row.unresolvedRequires=unknown("requires");
    if(unknown("getOneFree").length)row.unresolvedGetOneFree=unknown("getOneFree");
    if(raw.sequentialGetOneFree===true)row.sequentialGetOneFree=true;
    if(raw.repeatable===true)row.repeatable=true;
    if(raw.requiresBaseFunc)row.requiresBaseFunc=namesBase(raw.requiresBaseFunc,id);
    if(raw.needItem)row.neededItem=raw.neededItem || id;
    if(raw.cost===0)row.zeroCost=true;
    if(typeof raw.lookup==="string"&&known.has(raw.lookup))row.lookup=raw.lookup;
    data[id]=row;
    if(row.dependencies?.length)counts.dependencies++;
    if(row.requires?.length)counts.requires++;
    if(row.unlocks?.length)counts.unlocks++;
    if(row.getOneFree?.length)counts.freeSources++;
    if(row.getOneFreeProtected)counts.protectedSources++;
    if(row.repeatable)counts.repeatable++;
    if(row.sequentialGetOneFree)counts.sequential++;
  }
}
function namesBase(value,id){
  if(!Array.isArray(value))return [String(value)];
  return value.filter(x=>typeof x==="string");
}
if(Object.keys(data).length!==known.size)throw new Error("Research detail coverage "+Object.keys(data).length+" / "+known.size);
const unresolvedByField={};
for(const [key,count] of unknownReferences){const field=key.split("|")[0];unresolvedByField[field]=(unresolvedByField[field]||0)+count;}
const manifest={schemaVersion:1,count:known.size,source:"published effective-raw research chunks",counts,unresolvedByField};
// One compact topic per line keeps every line below the transport size limit
// while retaining the exact OXCE order and any duplicate lottery tickets.
const serialized=JSON.stringify(manifest).slice(0,-1)+',"topics":{\n'+
  Object.entries(data).map(([id,row])=>JSON.stringify(id)+":"+JSON.stringify(row)).join(",\n")+"\n}}";
fs.writeFileSync(output,serialized);
console.log("Generated "+output+" "+(Buffer.byteLength(serialized)/1024).toFixed(1)+" KiB",counts,"unresolved references",unresolvedByField);
