// Publish only the locally tested Soldier/Captain DB changes to the existing Pages tree.
// Never copy local saves, experimental artifacts or unrelated worker changes.
// V2: recover omitted source trailers from matching scoped blobs and Main ancestry.
// Usage: node tools/publish-soldier-pages-scoped-v2.mjs --push
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const git=(args,env=process.env)=>execFileSync('git',args,{encoding:'utf8',env,maxBuffer:64*1024*1024}).trim();
const scope=p=>p==='index.html'||p==='search/index.html'||p==='career/index.html'||/^(?:items-v2|research-v2|manufacture-v2)\//.test(p)||/^tech-v2\.(?:js|css)$/.test(p)||/^data\/(?:items|research|manufacture|facilities)-v2-index\.json$/.test(p)||p==='ruleset/manifest.json'||/^branch-soldier-[^/]+\.(?:js|css)$/.test(p)||p.startsWith('soldiers/')||p==='captains/index.html'||p==='all-origin-cap-frontier.js'||p==='origin-numeric-cache.js'||/^data\/soldiers?-/.test(p)||p==='data/branch-soldier-results.json.gz'||/^data\/branch-soldier-d[1-9]\d*-exact-(damsel|madgal)\.(?:json|packed)\.gz$/.test(p);
const source=git(['rev-parse','HEAD']);
git(['fetch','origin','main','gh-pages']);
const main=git(['ls-remote','origin','refs/heads/main']).split(/\s+/)[0];
const parent=git(['ls-remote','origin','refs/heads/gh-pages']).split(/\s+/)[0];
assert(/^[0-9a-f]{40}$/.test(main)&&/^[0-9a-f]{40}$/.test(parent),'Remote branch provenance missing');
git(['merge-base','--is-ancestor',source,main]);
git(['cat-file','-e',parent+'^{commit}']);
// Reconcile every scoped source blob with the actual deployment tree.
const entries=(ref,prefix)=>new Map(git(['ls-tree','-r',ref,...(prefix?['--',prefix]:[])]).split('\n').filter(Boolean).map(row=>{
  const match=row.match(/^(100644|100755) blob ([0-9a-f]{40})\t(.+)$/);
  return match?[match[3].slice(prefix?prefix.length+1:0),match[1]+' '+match[2]]:null;
}).filter(Boolean));
// Recover provenance only from an uninterrupted, bounded first-parent
// Pages history whose actual changed blobs match forward Main snapshots.
// A missing trailer alone is not permission to overlay a deployment.
const sourceTrailer=ref=>git(['log','-1','--format=%B',ref]).match(/^(?:Publish public atlas from |Atlas-Soldier-Source: )([0-9a-f]{40})$/m)?.[1];
const provenance=(()=>{
  const recorded=sourceTrailer(parent);
  if(recorded){
    git(['merge-base','--is-ancestor',recorded,source]);
    return {mode:'trailer',source:recorded,recovered:[]};
  }
  const unmarked=[];
  let cursor=parent,anchor;
  for(let i=0;i<32;i++){
    anchor=sourceTrailer(cursor);
    if(anchor)break;
    const row=git(['rev-list','--parents','-n','1',cursor]).split(/\s+/);
    assert(row.length===2,'Unmarked Pages commit has non-linear history: '+cursor);
    unmarked.push({commit:cursor,parent:row[1]});
    cursor=row[1];
  }
  assert(anchor,'No trusted Pages source trailer within recovery window');
  git(['merge-base','--is-ancestor',anchor,source]);
  const forward=git(['rev-list','--first-parent','--ancestry-path','--reverse',anchor+'..'+source]).split('\n').filter(Boolean);
  assert(forward.length<=128,'Main recovery window too large');
  const candidates=[anchor,...forward];
  let lower=0;
  const cache=new Map();
  const snapshot=ref=>{
    if(!cache.has(ref))cache.set(ref,entries(ref,'public'));
    return cache.get(ref);
  };
  const recovered=[];
  for(const step of unmarked.reverse()){
    const changed=git(['diff','--name-only','--no-renames','-z',step.parent,step.commit]).split('\0').filter(Boolean);
    assert(changed.length>0,'Empty unmarked Pages change: '+step.commit);
    assert(changed.every(p=>scope(p)&&!p.includes('..')&&!p.includes('\\')),'Unmarked Pages change outside allowed scope: '+step.commit);
    const live=entries(step.commit,'');
    assert(changed.every(p=>live.has(p)),'Unmarked Pages deletion or unsupported file: '+step.commit);
    const keys=[...new Set([...changed,'data/branch-soldier-results.json.gz'])];
    assert(keys.every(p=>live.has(p)),'Required deployed data missing: '+step.commit);
    let found=-1;
    for(let i=lower;i<candidates.length;i++){
      const tree=snapshot(candidates[i]);
      if(keys.every(p=>tree.get(p)===live.get(p))){found=i;break;}
    }
    assert(found>=0,'No forward Main snapshot proves the unmarked Pages change: '+step.commit);
    lower=found;
    recovered.push({pages:step.commit,source:candidates[found],files:changed.length});
  }
  return {mode:'verified-history',anchor,source:candidates[lower],recovered};
})();
git(['merge-base','--is-ancestor',provenance.source,source]);
const expected=entries(source,'public');
const deployed=entries(parent,'');
const paths=[...expected.keys()].filter(p=>scope(p)&&expected.get(p)!==deployed.get(p));
const dataPath='data/branch-soldier-results.json.gz';
assert(expected.has(dataPath),'Required source data missing');
if(!paths.length){
  console.log(JSON.stringify({source,parent,files:0,changed:[],provenance,status:'already synchronized'},null,2));
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
  const report={source,parent,tree,files:changed.length,changed,provenance};
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
