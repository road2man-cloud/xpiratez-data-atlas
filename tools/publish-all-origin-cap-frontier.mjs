// Publish only the all-origin frontier files; never stage concurrent workers' changes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const ok=(v,m)=>{if(!v)throw Error(m);};
function git(a,{env=process.env,input,buffer=false}={}){
 const r=spawnSync('git',a,{env,input,encoding:buffer?null:'utf8',maxBuffer:256*1024*1024,windowsHide:true});
 if(r.error||r.status!==0)throw Error('git '+a[0]+': '+String(r.error||r.stderr||r.status));
 return buffer?r.stdout:r.stdout.trim();
}
git(['fetch','origin','main']);
const base=git(['rev-parse','origin/main']);
const get=p=>git(['show',base+':'+p],{buffer:true});
const asset='public/data/soldier-origin-cap-frontier.json',data=JSON.parse(fs.readFileSync(asset));
ok(data.kind==='ALL_ORIGIN_GROWTH_SCHEDULE_FRONTIERS'&&data.records.length===72&&new Set(data.records.map(r=>r.profileId)).size===72,'Bad origin coverage');
ok(data.summary.actualGameCertified===0&&data.records.every(r=>r.actualGameCertified===false),'False certification');
ok(sha(get('public/data/soldier-origin-candidates.json'))===data.originArchiveSha256,'Published origin archive changed: rebuild');
const modern=JSON.parse(get('public/data/soldiers-modern-index.json'));
ok(modern.meta.source.metadataSha256===data.sourceMetadataSha256,'Published rule source changed: rebuild');
ok(modern.profiles.every(p=>data.records.some(r=>r.profileId===p.id)),'Missing source profile');
const patch=new Map();
for(const p of [asset,'public/all-origin-cap-frontier.js','tools/build-all-origin-cap-frontier.mjs','tools/damsel-madgal-cap-growth-chronology-core.mjs','tools/publish-all-origin-cap-frontier.mjs'])patch.set(p,fs.readFileSync(p));
for(const [file,anchor,prefix] of [
 ['public/soldiers/modern/index.html','<details id="integratedCaps"','../../'],
 ['public/captains/index.html','<section id="integratedBranches"','../']]){
 let h=get(file).toString('utf8');
 if(!h.includes('data-all-origin-cap-frontier')){
  ok(h.split(anchor).length===2,'Missing or ambiguous UI anchor '+file);
  const panel='<details class="card" id="allOriginCapFrontier"><summary>전체 72개 출생처 · 성장 배치 Pareto 비교</summary><section class="bs-results" data-all-origin-cap-frontier aria-label="전체 출생처 최종 성장 비교"><p>펼치면 공통 성장 원장을 불러옵니다.</p></section></details>\n';
  h=h.replace(anchor,panel+anchor);
 }
 if(!h.includes('all-origin-cap-frontier.js'))h=h.replace('</body>','<script type="module" src="'+prefix+'all-origin-cap-frontier.js?v=20261124-all-origin-1"></script>\n</body>');
 patch.set(file,Buffer.from(h));
}
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'xpz-all-origin-index-'));
try{
 const env={...process.env,GIT_INDEX_FILE:path.join(tmp,'index')};
 git(['read-tree',base],{env});
 for(const [p,b] of patch){const hash=git(['hash-object','-w','--stdin'],{input:b});git(['update-index','--add','--cacheinfo','100644,'+hash+','+p],{env});}
 const tree=git(['write-tree'],{env});
 const commit=git(['commit-tree',tree,'-p',base,'-m','feat(atlas): publish growth schedule Pareto models for all 72 origins'],{env});
 const changed=git(['diff-tree','--no-commit-id','--name-only','-r',commit]).split('\n').filter(Boolean);
 ok(changed.length&&changed.every(p=>patch.has(p)),'Unexpected modified file');
 git(['push','origin',commit+':refs/heads/main']);
 console.log(JSON.stringify({published:true,base,commit,changed,summary:data.summary,assetSha256:sha(patch.get(asset)),pagesCertified:false}));
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
