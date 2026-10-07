import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const args=process.argv.slice(2);
const arg=(name,fallback=null)=>{const i=args.indexOf(name);return i>=0&&i+1<args.length?args[i+1]:fallback};
const dataPath=path.resolve(arg("--data","public/data/soldiers-index.json"));
const source=arg("--source",process.env.XPIRATEZ_MOD_PATH);

if(!fs.existsSync(dataPath))throw new Error("Missing soldier data: "+dataPath);
const data=JSON.parse(fs.readFileSync(dataPath,"utf8"));

let ko={},en={};
if(source){
  const langDir=path.join(path.resolve(source),"Language");
  const loadLocale=code=>{
    const p=path.join(langDir,code+".yml");
    if(!fs.existsSync(p))return{};
    const doc=yaml.load(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,""),{json:true})||{};
    return doc[code]||doc;
  };
  ko=loadLocale("ko");
  en=loadLocale("en-US");
}
function tr(key,locale="ko"){
  if(typeof key!=="string")return key;
  const a=locale==="ko"?ko:en,b=locale==="ko"?en:ko;
  const v=a[key]??b[key]??key;
  if(Array.isArray(v))return v.join(" / ");
  if(v&&typeof v==="object")return JSON.stringify(v);
  return String(v).replaceAll("{NEWLINE}","\n").replaceAll("{SMALLLINE}","\n");
}

const salaryRanks=[
  ["rookie",null,"STR_ROOKIE"],
  ["squaddie","costSalarySquaddie","STR_SQUADDIE"],
  ["sergeant","costSalarySergeant","STR_SERGEANT"],
  ["captain","costSalaryCaptain","STR_CAPTAIN"],
  ["colonel","costSalaryColonel","STR_COLONEL"],
  ["commander","costSalaryCommander","STR_COMMANDER"]
];

for(const soldier of data.soldiers||[]){
  const raw=soldier.raw||{};
  const base=Number(soldier.costSalary??raw.costSalary)||0;
  const rankStrings=Array.isArray(raw.rankStrings)?raw.rankStrings:(Array.isArray(soldier.rankStrings)?soldier.rankStrings:[]);
  soldier.costSalary=base;
  soldier.costSalarySquaddie=Number(raw.costSalarySquaddie??soldier.costSalarySquaddie)||0;
  soldier.costSalarySergeant=Number(raw.costSalarySergeant??soldier.costSalarySergeant)||0;
  soldier.costSalaryCaptain=Number(raw.costSalaryCaptain??soldier.costSalaryCaptain)||0;
  soldier.costSalaryColonel=Number(raw.costSalaryColonel??soldier.costSalaryColonel)||0;
  soldier.costSalaryCommander=Number(raw.costSalaryCommander??soldier.costSalaryCommander)||0;
  soldier.rankStrings=rankStrings;
  soldier.salaryByRank=salaryRanks.map(([key,field,fallback],rank)=>{
    const id=rankStrings[rank]||fallback;
    const bonus=field?Number(soldier[field])||0:0;
    return{rank,key,id,koName:tr(id,"ko"),enName:tr(id,"en"),base,bonus,total:base+bonus};
  });
}

const soldierById=new Map((data.soldiers||[]).map(x=>[x.id,x]));
for(const profile of data.profiles||[]){
  const soldier=soldierById.get(profile.soldierType);
  if(!soldier)continue;
  const n=Number(profile.rank),rank=Number.isFinite(n)?Math.max(0,Math.min(5,Math.trunc(n))):0;
  const row=soldier.salaryByRank?.[rank];
  profile.salary=row?.total??soldier.costSalary??0;
}

fs.writeFileSync(dataPath,JSON.stringify(data));
console.log(JSON.stringify({
  soldiers:(data.soldiers||[]).length,
  profiles:(data.profiles||[]).length,
  dataPath
}));
