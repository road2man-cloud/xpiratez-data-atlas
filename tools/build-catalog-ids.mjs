// Regenerate the compact cross-catalog ID lookup from the published indexes.
import fs from "node:fs";
const dir="public/items/data";
const read=name=>JSON.parse(fs.readFileSync(dir+"/"+name,"utf8")).index||[];
const items=read("items-index.json").map(row=>row.id);
const research=read("research-index.json").map(row=>row.id);
if(new Set(items).size!==items.length||new Set(research).size!==research.length)
  throw new Error("Duplicate ID in catalog index");
fs.writeFileSync(dir+"/catalog-ids.json",JSON.stringify({items,research}));
console.log("Cross-catalog ID lookup:",items.length,"items",research.length,"research");
