// Public 2.1 research/manufacture output integrity check; no local mod required.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=(p)=>fs.readFileSync(path.join(root,p));
const hash=b=>createHash('sha256').update(b).digest('hex');

export function validateTechIndex(index,kind,manifest,itemHash,manifestHash) {
  const errors=[];
  if(!index||typeof index!=='object'||!index.meta||!Array.isArray(index.entries))
    return ['Invalid index'];
  const m=index.meta;
  if(m.schema!=='xpiratez-v2-mod-'+kind+'/v1'||m.sourceVersion!=='v.o2')errors.push('Wrong schema/version');
  if(m.sourceManifestSha256!==manifestHash||m.itemIndexSha256!==itemHash)
    errors.push('Input source hash mismatch');
  if(!Array.isArray(m.sourceFiles)||m.sourceFiles.length!==manifest.files.length||
    m.sourceFiles.some(f=>manifest.files.find(x=>x.path===f.path)?.sha256!==f.sha256))
    errors.push('Inconsistent source inventory');
  if(index.entries.length<1000||index.entries.length!==m.count)errors.push('Count mismatch');
  const ids=new Set(index.entries.map(x=>x.id));
  if(ids.size!==index.entries.length) errors.push('Duplicate IDs');
  let korean=0;
  for(const entry of index.entries){
    if(!entry||typeof entry.id!=='string'||!Array.isArray(entry.sourceFiles)||!entry.sourceFiles.length||
      !entry.fields||typeof entry.fields!=='object'||!entry.links||typeof entry.links!=='object') {
      errors.push('Malformed row '+entry?.id);break;
    }
    if(entry.koName) korean++;
    if(!entry.sourceFiles.every(x=>m.sourceFiles.some(y=>y.path==='Ruleset/'+x))){
      errors.push('Row with untrusted source file '+entry.id);break;
    }
  }
  if(korean!==m.koreanLabels)errors.push('Korean label count mismatch');
  return errors;
}
if(process.argv[1]&&fs.realpathSync(path.resolve(process.argv[1])).toLowerCase()===
  fs.realpathSync(fileURLToPath(import.meta.url)).toLowerCase()){
  try {
    const manifestBytes=read('public/ruleset/manifest.json');
    const itemBytes=read('public/data/items-v2-index.json');
    const manifest=JSON.parse(manifestBytes.toString('utf8'));
    for(const kind of ['research','manufacture']){
      const data=JSON.parse(read('public/data/'+kind+'-v2-index.json').toString('utf8'));
      const errors=validateTechIndex(data,kind,manifest,hash(itemBytes),hash(manifestBytes));
      if(errors.length)throw new Error(kind+': '+errors.join(' | '));
      console.log('PASS 2.1 '+kind+': '+data.meta.count+' entries, source matched');
    }
  } catch(e){console.error(e.message);process.exitCode=1;}
}
