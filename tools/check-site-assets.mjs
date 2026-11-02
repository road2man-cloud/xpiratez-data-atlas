// Public navigation, assets and no-save/no-training-DB regression gate.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const home=read('index.html');
const expected=['starting','captains','soldiers','crafts','craft-weapons','facilities','armors','items','research','manufacture','events','forces','weapons','reference'];
const nav=[...home.matchAll(/<a\s+href="\.\/([a-z-]+)\/(?:\?[^\"]*)?"/g)].map(m=>m[1]);
assert.deepEqual([...new Set(nav)].sort(),[...expected].sort());
assert.equal(home.split('class="card" href="./soldiers/').length-1,1);
assert(!home.includes('href="./trainings/'),'Retired training DB entrance must not return');
const redirect=read('soldiers/index.html'),retired=read('trainings/index.html'),modern=read('soldiers/modern/index.html');
assert(redirect.includes('location.replace(target.href)'));
assert(retired.includes('location.replace(target.href)')&&!retired.includes('id="trainingTable"'));
assert(modern.includes('id="originTable"')&&modern.includes('id="catalogMetric"'));
assert(modern.includes('value="provisional"')&&modern.includes('value="certified"'));
assert(!modern.includes('id="legacyMaximaArchive"')&&!modern.includes('id="maximaTable"'));
assert(!modern.includes('type="file"')&&!modern.includes('modernSaveFile')&&!modern.includes('transformationPlanner'));
assert(!fs.existsSync(path.join(root,'soldiers/app.js'))&&!fs.existsSync(path.join(root,'trainings/app-2.1.js')));
const modernApp=read('soldiers/modern/app.js');
assert(modernApp.includes('replayOriginWitness')&&modernApp.includes('renderResearchRelations'));
assert(!modernApp.includes('initModernSaveControls'));
assert(!modernApp.includes('../../items/#item=')&&!modernApp.includes('function dbLink('));
const errors=[];let linkCount=0,jsCount=0;
const pages=['index.html',...expected.map(x=>x+'/index.html'),'soldiers/modern/index.html','trainings/index.html'];
const selectors={starting:'cards',captains:'matrixTable',soldiers:'originTable',crafts:'craftTable','craft-weapons':'weaponTable',facilities:'facilityTable',armors:'armorTable',items:'tbody',research:'tbody',manufacture:'manufactureTable',events:'eventTable',forces:'forceTable',weapons:'weaponTable',reference:'modes'};
for(const rel of pages){
  const html=read(rel),file=path.join(root,rel),slug=rel.split('/')[0];
  const isRedirect=rel==='soldiers/index.html'||rel==='trainings/index.html';
  if(!isRedirect&&selectors[slug]&&!html.includes('id="'+selectors[slug]+'"'))errors.push(rel+' missing primary table');
  if(rel!=='index.html'&&!isRedirect&&!html.includes('id="search"'))errors.push(rel+' missing search');
  if(/<input\b[^>]*\btype=["']file["']/i.test(html))errors.push(rel+' forbidden local file-upload UI');
  for(const [,href] of html.matchAll(/\b(?:src|href)="([^\"]+)"/g)){
    if(/^(?:https?:|data:|mailto:|tel:|javascript:|#|\/\/)/i.test(href))continue;
    const value=href.split(/[?#]/)[0];if(!value)continue;
    const resolved=path.resolve(path.dirname(file),decodeURIComponent(value));
    if(resolved!==root&&!resolved.startsWith(root+path.sep)){errors.push(rel+' escapes public');continue;}
    const target=value.endsWith('/')?path.join(resolved,'index.html'):resolved;
    if(!fs.existsSync(target))errors.push(rel+' missing '+href);else linkCount++;
  }
}
for(const dir of [...expected,'trainings','soldiers/modern'])for(const f of fs.readdirSync(path.join(root,dir)).filter(f=>f.endsWith('.js'))){
  jsCount++;try{execFileSync(process.execPath,['--check',path.join(root,dir,f)],{stdio:'pipe'});}catch(e){errors.push(dir+'/'+f+' '+e.stderr?.toString().slice(0,180));}
}
execFileSync(process.execPath,['--check',path.join(root,'research-relations.js')],{stdio:'pipe'});
for(const name of ['soldiers-modern-index.json','soldier-origin-candidates.json','soldier-source-catalog.json','facilities-index.json','weapons-index.json'])
  if(!fs.existsSync(path.join(root,'data',name)))errors.push('Missing '+name);
for(const name of ['items-index.json','research-index.json','schema.json','entities.json','catalog-ids.json','research-insight-index.json']){
  if(!fs.existsSync(path.join(root,'items/data',name)))errors.push('Missing canonical '+name);
  if(fs.existsSync(path.join(root,'data',name)))errors.push('Duplicate canonical '+name);
}
assert.deepEqual(errors,[],errors.join('\n'));
console.log('PASS assets: '+expected.length+' active DB entrances, retired training redirect, no file-input UI, '+linkCount+' links, '+jsCount+' JavaScript sources');
