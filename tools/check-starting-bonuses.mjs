import fs from "node:fs";

const path=process.argv[2]||"public/data/starting-bonuses.json";
const data=JSON.parse(fs.readFileSync(path,"utf8"));
const events=[...(data.regions||[]),...(data.countries||[])];
const profiles=events.flatMap(e=>e.unitProfiles||[]);
const fail=msg=>{throw new Error(msg);};
const keys=["tu","stamina","health","bravery","reactions","firing","throwing","strength","psiStrength","psiSkill","melee","mana"];

if(!profiles.length)fail("No embedded starting unit profiles");
const egypt=events.find(e=>e.triggerIds?.includes("STR_EGYPT"));
const clone=egypt?.unitProfiles?.find(p=>p.sourceId==="STR_THEBAN_ASSAULT_CLONE");
if(!clone)fail("Egypt Assault Clone embedded profile missing");
if(clone.rewardItemId!=="STR_THEBAN_ASSAULT_CLONE_LICENSE"||clone.rewardQty!==12||clone.maxRuns!==12)fail("Egypt Assault Clone license conversion metadata wrong");
if(!(clone.traitNames||[]).includes("STR_THEBAN_ASSAULT_CLONE"))fail("Egypt Assault Clone trait missing");
const expected={tu:80,stamina:110,health:55,bravery:90,reactions:70,firing:80,throwing:60,strength:45,psiStrength:50,psiSkill:0,melee:80,mana:35};
for(const k of keys){
  for(const band of ["min","avg","max"]){
    if(Number(clone.effectiveStats?.[band]?.[k])!==expected[k])fail(`Egypt clone ${band} ${k}: expected ${expected[k]}, got ${clone.effectiveStats?.[band]?.[k]}`);
  }
}

for(const p of profiles){
  if(!p.currentStatsBeforeTraits||!p.effectiveStats)continue;
  const delta=Object.fromEntries(keys.map(k=>[k,0]));
  for(const t of p.traits||[])for(const k of keys)delta[k]+=Number(t.stats?.[k])||0;
  for(const band of ["min","avg","max"])for(const k of keys){
    const base=Number(p.currentStatsBeforeTraits?.[band]?.[k])||0;
    let want=base+delta[k];
    want=Math.max(k==="health"?1:0,want);
    if(k==="psiSkill"&&base<=0)want=base;
    const got=Number(p.effectiveStats?.[band]?.[k]);
    if(got!==want)fail(`${p.id} ${band} ${k}: trait-inclusive expected ${want}, got ${got}`);
  }
}
console.log(`OK starting bonuses: ${events.length} events, ${profiles.length} embedded unit links; Egypt Assault Clone fixed stats + trait included`);
