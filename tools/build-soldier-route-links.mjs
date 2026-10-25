import fs from "node:fs";
import path from "node:path";
const dir=path.resolve("public/data");
const source=JSON.parse(fs.readFileSync(path.join(dir,"soldiers-index.json"),"utf8"));
const profiles=source.profiles.map(p=>({
  id:p.id,sourceId:p.sourceId,sourceType:p.sourceType,name:p.sourceKoName,
  base:p.soldierKoName,baseId:p.soldierType,
  traits:(p.traits||[]).map(t=>t.koName),requirements:p.requires||[],
  itemId:p.sourceId.endsWith("_RECRUITMENT")?p.sourceId.slice(0,-"_RECRUITMENT".length):null
}));
const out={source:"soldiers-index.json",profiles};
fs.writeFileSync(path.join(dir,"soldier-route-links.json"),JSON.stringify(out));
console.log("Soldier route links: "+profiles.length);
