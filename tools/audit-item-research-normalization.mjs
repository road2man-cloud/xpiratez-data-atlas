import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {restorePresentationResources,isPresentationResourceKey} from "./data-normalize.mjs";

const args=process.argv.slice(2);
const arg=(name,fallback)=>{const i=args.indexOf(name);return i>=0&&args[i+1]?args[i+1]:fallback};
const before=path.resolve(arg("--before",".baseline-data"));
const after=path.resolve(arg("--after",".normalized-data"));
const read=(root,...parts)=>JSON.parse(fs.readFileSync(path.join(root,...parts),"utf8"));

const oldManifest=read(before,"manifest.json"),newManifest=read(after,"manifest.json");
const oldRules=new Map((oldManifest.source?.rules||[]).map(x=>[x.file,x.sha256]));
const newRules=new Map((newManifest.source?.rules||[]).map(x=>[x.file,x.sha256]));
const changedRuleFiles=[...new Set([...oldRules.keys(),...newRules.keys()])].filter(k=>oldRules.get(k)!==newRules.get(k));
assert.equal(oldManifest.source?.metadataSha256,newManifest.source?.metadataSha256,"metadata source changed");
assert.deepStrictEqual(changedRuleFiles,[],"ruleset source changed");

function loadDetails(root,dir){
  const p=path.join(root,dir),out={};
  if(!fs.existsSync(p))return out;
  for(const f of fs.readdirSync(p).filter(x=>x.endsWith(".json")))Object.assign(out,JSON.parse(fs.readFileSync(path.join(p,f),"utf8")).details||{});
  return out;
}
const oldItems=loadDetails(before,"chunks"),newItems=loadDetails(after,"chunks");
const oldResearch=loadDetails(before,"research-chunks"),newResearch=loadDetails(after,"research-chunks");
const itemResources=loadDetails(after,path.join("resource-chunks","items"));
const researchResources=loadDetails(after,path.join("resource-chunks","research"));
const oldItemIndex=Object.fromEntries(read(before,"items-index.json").index.map(x=>[x.id,x]));
const newItemIndex=Object.fromEntries(read(after,"items-index.json").index.map(x=>[x.id,x]));
const oldResearchIndex=Object.fromEntries(read(before,"research-index.json").index.map(x=>[x.id,x]));
const newResearchIndex=Object.fromEntries(read(after,"research-index.json").index.map(x=>[x.id,x]));
const schema=read(after,"schema.json");
const names=read(after,"entities.json").names||{};

assert.equal(Object.keys(oldItems).length,Object.keys(newItems).length,"item detail count changed");
assert.equal(Object.keys(oldResearch).length,Object.keys(newResearch).length,"research detail count changed");

const sortRefs=xs=>xs.map(x=>({section:x.section,id:x.id??x.owner,paths:x.paths})).sort((a,b)=>(a.section+"\0"+a.id).localeCompare(b.section+"\0"+b.id));
const oldIdList=xs=>(xs||[]).map(x=>typeof x==="string"?x:x.id);
const sourceFromCodes=d=>Object.fromEntries((schema.effectiveCoreFields||[]).map((k,i)=>[k,schema.coreSourceLegend?.[d.effectiveCoreSourceCodes?.[i]]||""]));
let rawChecked=0,declaredChecked=0,referenceChecked=0,sortableChecked=0,nameChecked=0;

for(const [id,o] of Object.entries(oldItems)){
  const n=newItems[id];
  assert.ok(n,"missing normalized item "+id);
  assert.deepStrictEqual(restorePresentationResources(n.raw,itemResources[id]?.effective||[]),o.raw,"item raw changed "+id);
  rawChecked++;
  if(n.inheritedViaRefNode){
    assert.deepStrictEqual(restorePresentationResources(n.rawDeclared,itemResources[id]?.declared||[]),o.rawDeclared,"item declared raw changed "+id);
  }else{
    assert.deepStrictEqual(o.rawDeclared,o.raw,"baseline non-inherited rawDeclared was not redundant "+id);
    assert.ok(!Object.prototype.hasOwnProperty.call(n,"rawDeclared"),"redundant normalized rawDeclared "+id);
  }
  declaredChecked++;
  assert.deepStrictEqual(n.effectiveCore,o.effectiveCore,"effective core changed "+id);
  assert.deepStrictEqual(sourceFromCodes(n),o.effectiveCoreSources,"effective core sources changed "+id);
  assert.deepStrictEqual(schema.globalItemDefaults,o.globalItemDefaults,"global defaults changed "+id);
  for(const k of ["id","koName","enName","kind","battleType","battleTypeLabel","summaryKo","sourceFiles","sourceFile","damageType","damageTypeKey","damageTypeKo","damageTypeEn","fireModes","compatibleAmmo","usedByWeapons","ufopaedia","inheritedViaRefNode"])assert.deepStrictEqual(n[k],o[k],"item metadata changed "+id+" "+k);

  const union=[
    ...(n.research||[]).map(x=>({section:"research",id:x.id,paths:x.paths})),
    ...(n.manufacture||[]).map(x=>({section:"manufacture",id:x.id,paths:x.paths})),
    ...(n.otherReferences||[])
  ];
  assert.deepStrictEqual(sortRefs(union),sortRefs(o.references||[]),"item reference union changed "+id);
  referenceChecked++;

  const projectResearch=x=>({id:x.id,paths:x.paths,cost:x.cost??null,points:x.points??null,needItem:x.needItem??null,destroyItem:x.destroyItem??null,sourceFile:x.sourceFile??null});
  assert.deepStrictEqual((n.research||[]).map(projectResearch),(o.research||[]).map(projectResearch),"item research relations changed "+id);
  const projectManufacture=x=>({id:x.id,paths:x.paths,time:x.time??null,cost:x.cost??null,category:x.category??null,requiredQty:x.requiredQty??null,producedQty:x.producedQty??null,sourceFile:x.sourceFile??null});
  assert.deepStrictEqual((n.manufacture||[]).map(projectManufacture),(o.manufacture||[]).map(projectManufacture),"item manufacture relations changed "+id);

  for(const r of o.references||[]){
    const owner=r.id??r.owner;if(owner?.startsWith("#"))continue;
    assert.deepStrictEqual(names[owner],[r.koName,r.enName],"entity name changed "+owner);nameChecked++;
  }

  const oi=oldItemIndex[id],ni=newItemIndex[id];
  for(const [k,v] of Object.entries(oi.sortable||{})){
    if(isPresentationResourceKey(k))continue;
    if(k==="type"){assert.deepStrictEqual(ni.id,v,"sortable type/id changed "+id);sortableChecked++;continue;}
    const spec=(schema.sortableItemFields||[]).find(x=>x.key===k);
    assert.ok(spec,"missing sortable schema "+k);
    const nv=spec.storage==="topLevel"?ni[k]:ni.sortable?.[k];
    assert.deepStrictEqual(nv,v,"sortable value changed "+id+" "+k);sortableChecked++;
  }
}

for(const [id,o] of Object.entries(oldResearch)){
  const n=newResearch[id];
  assert.ok(n,"missing normalized research "+id);
  assert.deepStrictEqual(restorePresentationResources(n.raw,researchResources[id]?.effective||[]),o.raw,"research raw changed "+id);
  rawChecked++;
  for(const k of ["id","bucket","koName","enName","summaryKo","cost","points","needItem","destroyItem","getOneFreeProtected","sourceFiles"])assert.deepStrictEqual(n[k],o[k],"research metadata changed "+id+" "+k);
  for(const k of ["dependencies","requiredBy","unlocks","getOneFree"])assert.deepStrictEqual(n[k],oldIdList(o[k]),"research ids changed "+id+" "+k);
  const union=[...(n.itemReferences||[]),...(n.manufactureReferences||[]),...(n.otherReferences||[])];
  assert.deepStrictEqual(sortRefs(union),sortRefs(o.references||[]),"research reference union changed "+id);referenceChecked++;
  for(const r of o.references||[]){
    const owner=r.id??r.owner;if(owner?.startsWith("#"))continue;
    assert.deepStrictEqual(names[owner],[r.koName,r.enName],"research entity name changed "+owner);nameChecked++;
  }
  assert.deepStrictEqual(newResearchIndex[id],oldResearchIndex[id],"research index changed "+id);
}

console.log(JSON.stringify({
  status:"lossless normalization verified",
  sourceRules:oldRules.size,
  items:Object.keys(newItems).length,
  research:Object.keys(newResearch).length,
  rawChecked,declaredChecked,referenceChecked,sortableChecked,nameChecked,
  separatedResourceFields:newManifest.counts?.separatedResourceFields||0
}));
