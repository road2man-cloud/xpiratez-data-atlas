import fs from "node:fs";
const items=JSON.parse(fs.readFileSync("public/data/items-index.json","utf8"));
const research=JSON.parse(fs.readFileSync("public/data/research-index.json","utf8"));
const schema=JSON.parse(fs.readFileSync("public/data/schema.json","utf8"));
if(!items.index.length)throw new Error("No items generated");
if(!research.index.length)throw new Error("No research generated");
if(items.index.length!==new Set(items.index.map(x=>x.id)).size)throw new Error("Duplicate item ids");
if(research.index.length!==new Set(research.index.map(x=>x.id)).size)throw new Error("Duplicate research ids");
const cache={};
for(const x of items.index){
  cache[x.bucket]??=JSON.parse(fs.readFileSync(`public/data/chunks/${x.bucket}.json`,"utf8")).details;
  const d=cache[x.bucket][x.id];if(!d)throw new Error("Missing item detail "+x.id);
  if(!d.raw||!d.effectiveCore)throw new Error("Incomplete item detail "+x.id);
}
const rc={};
for(const x of research.index){
  rc[x.bucket]??=JSON.parse(fs.readFileSync(`public/data/research-chunks/${x.bucket}.json`,"utf8")).details;
  if(!rc[x.bucket][x.id])throw new Error("Missing research detail "+x.id);
}
if(!schema.sortableItemFields?.length)throw new Error("No sortable fields");
console.log(`OK: ${items.index.length} items, ${research.index.length} research, ${schema.sortableItemFields.length} sortable item fields`);
