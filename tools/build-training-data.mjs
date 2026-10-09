// Regenerate only the training/planning sidecar. Never rewrites other published DBs.
// node tools/build-training-data.mjs --source "D:/.../Piratez"
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import yaml from "js-yaml";

const args=process.argv.slice(2);
const arg=(name,fallback)=>{const i=args.indexOf(name);return i>=0?args[i+1]:fallback};
const source=arg("--source",process.env.XPIRATEZ_MOD_PATH);
const dataDir=path.resolve(arg("--data","public/data"));
if(!source)throw new Error("Supply --source <.../Piratez> (official v.o1.1.1 rules)");
const root=path.resolve(source);
const transformFile=path.join(root,"Ruleset","Piratez_Transformations.rul");
const read=p=>fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"");
const sha=p=>crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const locale=code=>{
  const obj=yaml.load(read(path.join(root,"Language",code+".yml")),{json:true})||{};
  return obj[code]||obj;
};
const ko=locale("ko"),en=locale("en-US");
const tr=(id,code="ko")=>{
  const value=(code==="ko"?ko:en)[id]??(code==="ko"?en:ko)[id]??id;
  return Array.isArray(value)?value.join(" / "):typeof value==="string"?value:id;
};
const doc=yaml.load(read(transformFile),{json:true})||{};
const raw=doc.soldierTransformation||[];
const soldierData=JSON.parse(read(path.join(dataDir,"soldiers-index.json")));
const researchData=JSON.parse(read(path.join(dataDir,"progression-research.json")));
const topics=new Map(researchData.topics.map(r=>[r.id,r]));
const original=new Map(raw.map(t=>[t.name,t]));
assert.equal(original.size,raw.length,"duplicate transformation rules");
assert.equal(raw.length,soldierData.transformations.length,"rules/index transformation count diverged");
for(const row of soldierData.transformations) {
  const t=original.get(row.id);
  assert.ok(t,"No original transformation for "+row.id);
  for(const key of ["requires","requiredPreviousTransformations","forbiddenPreviousTransformations","allowedSoldierTypes","forbiddenSoldierTypes"])
    assert.deepEqual(t[key]||[],row[key]||[],row.id+" "+key+" diverged; regenerate soldiers-index first");
  assert.equal(t.producedSoldierType||null,row.producedSoldierType||null,row.id+" producedSoldierType diverged");
}
const asList=x=>Array.isArray(x)?x:x==null?[]:[x];
const asIds=x=>asList(x).map(x=>typeof x==="string"?x:x?.id).filter(Boolean);
const name=id=>({id,koName:tr(id),enName:tr(id,"en")});
const kvEntries=o=>Object.entries(o&&typeof o==="object"&&!Array.isArray(o)?o:{}).map(([id,amount])=>({...name(id),amount}));
const researchGraph=new Map();
function visitResearch(id) {
  if(!topics.has(id)||researchGraph.has(id))return;
  const r=topics.get(id),p=asIds(r.prerequisites),disables=asIds(r.disables);
  researchGraph.set(id,{...name(id),cost:r.cost??null,prerequisites:p,disables,requiresBaseFunc:asList(r.requiresBaseFunc),needItem:r.needItem===true,destroyItem:r.destroyItem===true});
  for(const parent of p)visitResearch(parent);
}
const kindOf=t=>t.producedSoldierType?"병종 전환":t.createsClone?"복제/소환":/(TRAINING|EDUCATION|TIGER_TOURS)/.test(t.name)?"훈련/교육":"의식/개조";
const transformations=soldierData.transformations.map(row=>{
  const t=original.get(row.id);
  const requires=asList(t.requires);
  const researchRoots=requires.filter(x=>topics.has(x));
  researchRoots.forEach(visitResearch);
  return{
    ...row,kind:kindOf(t),researchRoots,requiredItems:kvEntries(t.requiredItems),
    requiredCommendations:kvEntries(t.requiredCommendations),
    transferTime:t.transferTime??null,minRank:t.minRank??null,
    allowsLiveSoldiers:t.allowsLiveSoldiers??null,
    allowsWoundedSoldiers:t.allowsWoundedSoldiers??null,
    allowsDeadSoldiers:t.allowsDeadSoldiers??null,
    requiredItemsByCode:t.requiredItems||{},requiredCommendationsByCode:t.requiredCommendations||{},
    // Keep true rule fields, including uncommon restrictions and stat transformations.
    rawRule:t
  };
});
const ids=new Set(transformations.map(t=>t.id));
const excludes=transformations.flatMap(t=>t.forbiddenPreviousTransformations.filter(x=>ids.has(x)).map(previous=>({previous,next:t.id})));
const excludedPairs=new Set(excludes.filter(e=>e.previous!==e.next).map(e=>[e.previous,e.next].sort().join("|")));
const completeSourceHash=soldierData.meta?.source?.rules?.find(x=>x.file==="Piratez_Transformations.rul")?.sha256;
assert.ok(!completeSourceHash||completeSourceHash===sha(transformFile),"Original transformation file differs from soldiers-index source");
const output={
  meta:{mod:soldierData.meta?.mod||{name:"X-Piratez",version:"v.o1.1.1"},ruleFile:"Piratez_Transformations.rul",sha256:sha(transformFile),
    source:"official ruleset + soldiers-index effective stats",schemaVersion:1},
  counts:{transformations:transformations.length,directionalExclusions:excludes.length,distinctExclusionPairs:excludedPairs.size,
    conditionalPrerequisites:transformations.filter(t=>t.requiredPreviousTransformations.length).length,
    categoryCounts:Object.fromEntries([...new Set(transformations.map(t=>t.kind))].map(k=>[k,transformations.filter(t=>t.kind===k).length]))},
  statKeys:soldierData.statKeys,statLabels:soldierData.statLabels,
  soldiers:soldierData.soldiers.map(s=>({id:s.id,koName:s.koName,enName:s.enName})),
  profiles:soldierData.profiles.map(p=>({id:p.id,sourceId:p.sourceId,sourceType:p.sourceType,
    sourceKoName:p.sourceKoName,sourceEnName:p.sourceEnName,soldierType:p.soldierType,
    soldierKoName:p.soldierKoName,previousTransformations:p.previousTransformations||{}})),
  bonuses:Object.fromEntries(soldierData.bonuses.map(b=>[b.id,b])),
  researchGraph:Object.fromEntries([...researchGraph].sort(([a],[b])=>a.localeCompare(b))),
  transformations,
};
const target=path.join(dataDir,"trainings-index.json");
fs.writeFileSync(target,JSON.stringify(output));
console.log("Built "+target+": "+output.counts.transformations+" transformations, "+excludes.length+" directional blocks, "+researchGraph.size+" research references; "+(fs.statSync(target).size/1024).toFixed(1)+" KiB");
