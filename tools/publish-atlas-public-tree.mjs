// Synchronize the canonical public tree and compatibility aliases atomically.
 // No checkout/reset, no force push, no publication of experimental/private files.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {execFileSync} from 'node:child_process';
const git=(args,env=process.env)=>execFileSync('git',args,{encoding:'utf8',env,maxBuffer:128*1024*1024}).trim();
const remote=ref=>{const s=git(['ls-remote','origin','refs/heads/'+ref]).split(/\s+/)[0];assert(/^[a-f0-9]{40}$/.test(s),ref);return s;};
const source=remote('main'),parent=remote('gh-pages');
git(['fetch','origin',source,parent]);
const entries=(ref,prefix='')=>new Map(git(['ls-tree','-r','-z',ref,...(prefix?['--',prefix]:[])]).split('\0').filter(Boolean).map(row=>{const [v,p]=row.split('\t');return [prefix?p.slice(prefix.length+1):p,v];}));
const expected=entries(source,'public'),live=entries(parent),alias=new Map();
const root='items/data/';
for(const name of ['items-index.json','research-index.json','entities.json','schema.json','manifest.json']){assert(expected.has(root+name),name);alias.set('data/'+name,expected.get(root+name));}
for(const dir of ['chunks/','research-chunks/','resource-chunks/items/']){
 const matches=[...expected].filter(([p])=>p.startsWith(root+dir));assert(matches.length,dir);
 for(const [p,v] of matches)alias.set('data/'+p.slice(root.length),v);
}
for(const [p,v] of alias){assert(!expected.has(p)||expected.get(p)===v,'Alias collision '+p);expected.set(p,v);}
const changed=[...expected].filter(([p,v])=>live.get(p)!==v).map(([p])=>p);
const retained=[...live].filter(([p])=>!expected.has(p)); // Keep independently published extras.
const report={source,parent,sourceFiles:expected.size-alias.size,aliases:alias.size,changedFiles:changed.length,changed,retainedExtras:retained.map(([p])=>p)};
if(!changed.length){console.log(JSON.stringify({...report,status:'already synchronized'},null,2));process.exit(0);}
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-full-pages-')),env={...process.env,GIT_INDEX_FILE:path.join(tmp,'index')};
try{
 git(['read-tree',parent],env);
 for(const [p,v] of expected){if(live.get(p)===v)continue;const m=/^(100644|100755) blob ([0-9a-f]{40})$/.exec(v);assert(m,'Unsupported asset '+p);git(['update-index','--add','--cacheinfo',m[1],m[2],p],env);}
 const tree=git(['write-tree'],env),actual=entries(tree);
 assert([...expected].every(([p,v])=>actual.get(p)===v),'Canonical asset mismatch');
 assert(retained.every(([p,v])=>actual.get(p)===v),'Unrelated Pages asset overwritten');
 report.tree=tree;
 if(process.argv.includes('--push')){
  assert.equal(remote('main'),source,'Main advanced; rerun against latest source');
  assert.equal(remote('gh-pages'),parent,'Pages advanced; rerun against latest parent');
  const commit=git(['commit-tree',tree,'-p',parent,'-m','Publish public atlas from '+source],env);
  git(['push','origin',commit+':refs/heads/gh-pages'],env);
  report.commit=commit;report.remote=remote('gh-pages');assert.equal(report.remote,commit);
 }
 console.log(JSON.stringify(report,null,2));
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
