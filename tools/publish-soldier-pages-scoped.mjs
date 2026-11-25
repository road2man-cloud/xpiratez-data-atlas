// Publish only the locally tested Soldier/Captain DB changes to the existing Pages tree.
// Never copy local saves, experimental artifacts or unrelated worker changes.
// Usage: node tools/publish-soldier-pages-scoped.mjs --push
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const git=(args,env=process.env)=>execFileSync('git',args,{encoding:'utf8',env,maxBuffer:64*1024*1024}).trim();
const scope=p=>/^branch-soldier-[^/]+\.(?:js|css)$/.test(p)||p.startsWith('soldiers/')||p==='captains/index.html'||p==='all-origin-cap-frontier.js'||p==='origin-numeric-cache.js'||/^data\/soldiers?-/.test(p)||p==='data/branch-soldier-results.json.gz'||/^data\/branch-soldier-d[1-9]\d*-exact-(damsel|madgal)\.(?:json|packed)\.gz$/.test(p);
const source=git(['rev-parse','HEAD']);
git(['fetch','origin','main','gh-pages']);
const main=git(['ls-remote','origin','refs/heads/main']).split(/\s+/)[0];
const parent=git(['ls-remote','origin','refs/heads/gh-pages']).split(/\s+/)[0];
assert(/^[0-9a-f]{40}$/.test(main)&&/^[0-9a-f]{40}$/.test(parent),'Remote branch provenance missing');
git(['merge-base','--is-ancestor',source,main]);
git(['cat-file','-e',parent+'^{commit}']);
const message=git(['log','-1','--format=%B',parent]);
const previous=message.match(/^(?:Publish public atlas from |Atlas-Soldier-Source: )([0-9a-f]{40})$/m)?.[1];
assert(previous,'Public source provenance missing; refuse a blind overlay');
git(['merge-base','--is-ancestor',previous,source]);
// Reconcile every scoped source blob with the actual deployment tree.
const entries=(ref,prefix)=>new Map(git(['ls-tree','-r',ref,...(prefix?['--',prefix]:[])]).split('\n').filter(Boolean).map(row=>{
  const match=row.match(/^(100644|100755) blob ([0-9a-f]{40})\t(.+)$/);
  return match?[match[3].slice(prefix?prefix.length+1:0),match[1]+' '+match[2]]:null;
}).filter(Boolean));
const expected=entries(source,'public');
const deployed=entries(parent,'');
const paths=[...expected.keys()].filter(p=>scope(p)&&expected.get(p)!==deployed.get(p));
const dataPath='data/branch-soldier-results.json.gz';
assert(expected.has(dataPath),'Required source data missing');
if(!paths.length){
  console.log(JSON.stringify({source,parent,files:0,changed:[],status:'already synchronized'},null,2));
  process.exit(0);
}
assert(!paths.some(p=>p.includes('..')||p.includes('\\')),'Unexpected path');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-soldier-pages-'));
const env={...process.env,GIT_INDEX_FILE:path.join(tmp,'index')};
try{
  git(['read-tree',parent],env);
  for(const p of paths){
    const row=git(['ls-tree',source,'--','public/'+p]);
    const match=row.match(/^(100644|100755) blob ([0-9a-f]{40})\t/);
    assert(match,'Deleted or unsupported scoped source: '+p);
    git(['update-index','--add','--cacheinfo',match[1],match[2],p],env);
  }
  const tree=git(['write-tree'],env);
  const changed=git(['diff','--name-only',parent,tree]).split('\n').filter(Boolean);
  assert(changed.length&&changed.every(p=>paths.includes(p)&&scope(p)),'Unrelated public changes');
  for(const p of paths)assert.equal(git(['rev-parse',tree+':'+p]),git(['rev-parse',source+':public/'+p]),p);
  const data='data/branch-soldier-results.json.gz';
  assert.equal(git(['rev-parse',tree+':'+data]),git(['rev-parse',source+':public/'+data]));
  const report={source,parent,tree,files:changed.length,changed};
  if(process.argv.includes('--push')){
    assert.equal(git(['ls-remote','origin','refs/heads/gh-pages']).split(/\s+/)[0],parent,'Public branch moved; abort');
    const commit=git(['commit-tree',tree,'-p',parent,'-m','Publish tested Soldier and Captain DB changes','-m','Atlas-Soldier-Source: '+source],env);
    git(['push','origin',commit+':refs/heads/gh-pages'],env);
    report.commit=commit;
    report.remote=git(['ls-remote','origin','refs/heads/gh-pages']).split(/\s+/)[0];
    assert.equal(report.remote,commit);
  }
  console.log(JSON.stringify(report,null,2));
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
