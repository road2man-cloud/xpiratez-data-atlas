// Build a v.o2-only facility capabilities catalogue from the locally verified mod.
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'node:url';
import { validateManifest, checkInstalledFiles } from './check-v2-source-manifest.mjs';
import { mergeValues } from './build-v2-items.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const manifestPath=path.join(root,'public/ruleset/manifest.json');
const out=path.join(root,'public/data/facilities-v2-index.json');
const fields=['provideBaseFunc','requiresBaseFunc','workshops','buildTime','buildCost','size','storage','livingSpace','laboratories'];
export function build(source){
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  const errors=[...validateManifest(manifest),...checkInstalledFiles(manifest,source)];
  if(errors.length)throw new Error('v.o2 source mismatch: '+errors.join('; '));
  const metadata=yaml.load(fs.readFileSync(path.join(source,'metadata.yml'),'utf8'),{json:true});
  if(metadata?.version!=='v.o2')throw new Error('Mod version mismatch');
  const rules=manifest.files.filter(f=>f.path.startsWith('Ruleset/')).map(f=>path.basename(f.path)).sort((a,b)=>a.localeCompare(b,'en'));
  const map=new Map();
  for(const file of rules){
    const documents=[];
    yaml.loadAll(fs.readFileSync(path.join(source,'Ruleset',file),'utf8'),doc=>{if(doc)documents.push(doc);},{json:true});
    for(const doc of documents){
      for(const rule of doc.facilities||[]){
        if(rule.delete){map.delete(rule.delete);continue;}
        if(typeof rule.type!=='string'||!rule.type)throw new Error('Facility without type: '+file);
        const previous=map.get(rule.type);
        const combined=previous?mergeValues(previous.rule,rule):rule;
        map.set(rule.type,{rule:combined,sources:[...new Set([...(previous?.sources||[]),file])]});
      }
    }
  }
  const facilities=[...map].map(([id,{rule,sources}])=>{
    const explicit={};
    for(const key of fields)if(Object.hasOwn(rule,key))explicit[key]=rule[key];
    return {id,fields:explicit,sourceFiles:sources};
  }).sort((a,b)=>a.id.localeCompare(b.id,'en'));
  return {
    meta:{schema:'xpiratez-v2-mod-facilities/v1',sourceVersion:'v.o2',
      sourceScope:'explicit mod facility fields, no engine defaults',
      sourceFiles:manifest.files.map(({path,sha256})=>({path,sha256})),
      count:facilities.length},
    facilities
  };
}
if(process.argv[1]&&fs.realpathSync(path.resolve(process.argv[1])).toLowerCase()===fs.realpathSync(fileURLToPath(import.meta.url)).toLowerCase()){
  try{
    const args=process.argv.slice(2),srcAt=args.indexOf('--source');
    if(srcAt<0||!args[srcAt+1])throw new Error('Usage: node tools/build-v2-facilities.mjs --source MOD_ROOT [--check]');
    const content=JSON.stringify(build(path.resolve(args[srcAt+1])))+'\n';
    if(args.includes('--check')){
      if(!fs.existsSync(out)||fs.readFileSync(out,'utf8')!==content)throw new Error('Published facilities data differs');
    }else {fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,content);}
    console.log('v.o2 facilities verified and '+(args.includes('--check')?'checked':'built'));
  }catch(e){console.error(e.message);process.exitCode=1;}
}
