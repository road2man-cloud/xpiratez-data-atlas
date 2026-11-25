import {ledgers,statKeys,project,filterRows,rankRows,routeUrl,branchUrl,readResearchWitness,sum} from './branch-soldier-atlas-career-core.js?v=29';
import {loadBranchOptions,setupBranchCompare} from './branch-soldier-atlas-branch-compare.js?v=30';
import {setupRole} from './branch-soldier-atlas-role.js?v=31';
const root=new URL('./',import.meta.url),$=id=>document.getElementById(id);
const params=new URLSearchParams(location.search),controls=['origin','body','captain','branch','training','trait','difficulty','metric','stat','certified'];
const labels={tu:'TU',stamina:'기력',health:'체력',bravery:'용기',reactions:'반응',firing:'사격',throwing:'투척',strength:'근력',psiStrength:'Psi 강도',psiSkill:'Psi 기술',melee:'근접',mana:'Mana'};
let metadata,names={},origins=new Map(),branches=new Map(),branchCaptains=new Map(),rows=[],limit=30,loaded=0,errors=[],pins=new Map(),initial=true,branchWarning='',ledgerIncomplete=false;
const indexCache=new Map();
const el=(tag,value,cls)=>{const e=document.createElement(tag);if(value!==undefined)e.textContent=value;if(cls)e.className=cls;return e};
const name=id=>names[id]||id||'미선택',originName=id=>origins.get(id)||name(id);
const branchName=id=>{const b=branches.get(id);return b?'#'+b.rank+' · '+b.captain.map(name).join(' → ')+' / '+[b.choices.path,b.choices.cause,b.choices.codex,b.choices.queen].map(name).join(' / '):id;};
const fmt=x=>x.toLocaleString('ko-KR');
const link=(label,path,cls)=>{const a=el('a',label,cls);a.href=new URL(path,root);return a;};
const search=(kind,id)=>'search/?'+new URLSearchParams({q:id,kind});
const sourceOf=r=>ledgers.find(s=>s.key===r.source);
const branchCompare=setupBranchCompare({name,originName,branchName,filter,rows:()=>rows});
const roleView=setupRole({labels,change(){initial=false;limit=30;sync();render();}});
async function json(path){const res=await fetch(new URL(path,root));if(!res.ok)throw Error('HTTP '+res.status);return res.json();}
async function gzip(file){
 if(typeof DecompressionStream==='undefined')throw Error('gzip 지원 브라우저가 필요합니다');
 const res=await fetch(new URL('data/'+file+'.json.gz',root));if(!res.ok)throw Error('HTTP '+res.status);
 return new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).json();
}
function options(id,ids,label){
 const select=$(id),current=initial?params.get(id)||select.value:select.value,first=select.options[0].textContent;
 select.replaceChildren(new Option(first,''));
 const sorted=[...new Set(ids)].filter(Boolean).sort((a,b)=>label(a).localeCompare(label(b),'ko'));
 for(const v of sorted)select.add(new Option(label(v),v));
 if(current&&!sorted.includes(current))select.add(new Option(label(current)+' (등록 후보 없음 또는 로딩 중)',current));
 select.value=current||'';
}
function populate(){
 options('origin',[...origins.keys(),...rows.map(r=>r.origin)],originName);
 options('body',rows.map(r=>r.body),name);
 options('captain',[...branchCaptains.values()].flat(),name);
 options('branch',rows.map(r=>r.branch),branchName);
 options('training',rows.flatMap(r=>r.order),name);
 options('trait',rows.flatMap(r=>r.traits||[]),name);
}
function filter(){
 const f=Object.fromEntries(controls.map(id=>[id,id==='certified'?$(id).checked:$(id).value]));
 f.branchCaptains=branchCaptains;return f;
}
function sync(){
 const p=new URLSearchParams(location.search);for(const id of controls)p.delete(id);
 for(const id of controls){const v=id==='certified'?($(id).checked?'1':''):$(id).value;if(v&&!(id==='metric'&&v==='cap')&&!(id==='stat'&&v==='total'))p.set(id,v);}
 roleView.write(p);history.replaceState(null,'',location.pathname+(p.size?'?'+p:'')+location.hash);
}
function vectorMarkup(r,metric,stat){
 const grid=el('div',undefined,'career-stats');statKeys.forEach((k,i)=>{const d=el('div',undefined,k===stat?'focus':'');d.append(el('small',labels[k]),el('strong',fmt(r[metric][i])));grid.append(d)});return grid;
}
function renderCompare(){
 const section=$('compare');section.hidden=!pins.size;section.replaceChildren();if(!pins.size)return;
 const metric=$('metric').value;section.append(el('h2','선택 경로 비교 ('+pins.size+'/3)'));
 const wrap=el('div',undefined,'compare-scroll'),table=el('table'),head=el('tr');head.append(el('th','능력치'));
 for(const r of pins.values()){const th=el('th');th.append(link(originName(r.origin)+' → '+name(r.body),routeUrl(r)),el('p',branchName(r.branch)));const b=el('button','비교 해제');b.onclick=()=>{pins.delete(r.key);render();};th.append(b);head.append(th);}
 table.append(head);
 const all=[...pins.values()];
 for(const [i,key] of [...statKeys.entries(),[-1,'total']]){
  const tr=el('tr');tr.append(el('th',i<0?'합계':labels[key]));const vs=all.map(r=>i<0?sum(r[metric]):r[metric][i]),max=Math.max(...vs);
  vs.forEach(v=>tr.append(el('td',fmt(v),vs.length>1&&v===max?'best':'')));table.append(tr);
 }
 wrap.append(table);section.append(wrap,el('p','비교 경로는 각자의 분기와 조건에서만 성립합니다. 동일 캠페인에서 모두 가능한 조합이라는 뜻이 아닙니다.','note'));
}
function indexLoad(file){if(!indexCache.has(file))indexCache.set(file,gzip(file).catch(e=>{indexCache.delete(file);throw e;}));return indexCache.get(file);}
function actionLabel(a){
 const id=a.research||a.id||a.event||a.script||a.source;
 const kinds={research:'연구',repeatResearch:'반복 연구',freeResearch:'무료 연구',eventResearch:'이벤트 연구',missionResearch:'임무 연구'};
 return (kinds[a.type]||a.type)+' · '+name(id)+(a.assumeOutcome?' (결과 가정)':'');
}
function witness(r){
 const source=sourceOf(r);if(!source.index)return null;
 const detail=el('details',undefined,'witness');detail.append(el('summary','시술 시점별 연구 이력 확인'));
 const panel=el('div');detail.append(panel);let started=false;
 detail.addEventListener('toggle',async()=>{if(!detail.open||started)return;started=true;panel.textContent='연구 이력 불러오는 중…';
 try{const w=readResearchWitness(await indexLoad(source.index),r,metadata);panel.replaceChildren();
  const gates=el('ol',undefined,'research-gates');for(const g of w.gates){const li=el('li');li.append(link(name(g.transform),search('training',g.transform)),document.createTextNode(' · 행동 '+(g.index+1)+' · 필요 연구: '));for(const id of g.requires||[])li.append(link(name(id),search('research',id)),document.createTextNode(' '));if(!g.requires?.length)li.append(document.createTextNode('명시 조건 없음'));gates.append(li);}
  panel.append(el('p','기록된 시술별 연구 요구 '+w.gates.length+'개 (시간순 인덱스 연결)'),gates);
  const d=el('details');d.append(el('summary','등록 연구 행동 '+w.actions.length+'개'));const list=el('ol',undefined,'research-history');for(const a of w.actions)list.append(el('li',actionLabel(a)));d.append(list);panel.append(d,el('p','위 목록은 연구 행동 접두부이며 출생·공급·승급·시술 전체 행동은 원본 경로에서 확인하세요.','note'));
 }catch(e){panel.textContent=e.message+' · 아래 원본 경로에서 확인하세요.';started=false;}
 });return detail;
}
function card(r,metric,stat,roleResult=null){
 const a=el('article',undefined,'career-card');const title=el('h2');title.append(link(originName(r.origin),search('origin',r.origin)),document.createTextNode(' → '),link(name(r.body),search('soldier',r.body)));a.append(title);
 const branch=el('p',undefined,'branch');branch.append(link(branchName(r.branch),branchUrl(r.branch)));a.append(branch);
 a.append(el('p',fmt(sum(r[metric]))+'점 · 시술 '+r.order.length+'회 · '+(r.certified?'전역 인증':'조건부 등록 후보')+' · '+sourceOf(r).label,'note'));
 if(roleResult){const summary=roleResult.axes.map(k=>(labels[k]||k)+' '+fmt(r[metric][statKeys.indexOf(k)])).join(' · ');a.append(el('p',summary,'role-result-label'));
  if(roleResult.frontier.has(r.key))a.append(el('p','역할 비지배 난이도: '+[...roleResult.frontier.get(r.key)].sort((a,b)=>a-b).join(', '),'note'));}
 a.append(vectorMarkup(r,metric,roleResult?.axes[0]||stat));
 const list=el('ol',undefined,'career-order');r.order.forEach((id,i)=>{const li=el('li');if(i)li.append(document.createTextNode('→ '));li.append(link(name(id),search('training',id)));list.append(li);});
 a.append(el('p','기록된 시술 순서'),list);
 if(r.traits){const tr=el('div',undefined,'career-order');for(const id of r.traits)tr.append(link(name(id)+(r.traitCounts?.[id]>1?' ×'+r.traitCounts[id]:''),search('bonus',id),'trait-chip'));a.append(el('p','측정된 보유 특성 '+r.traits.length+'종'),tr);}else a.append(el('p','보유 특성 목록 미기록','note'));
 const tool=el('div',undefined,'toolbar');tool.append(link('전체 연구·육성 근거 열기',routeUrl(r)));
 const pin=el('button',pins.has(r.key)?'비교 해제':'비교에 추가');pin.disabled=!pins.has(r.key)&&pins.size>=3;pin.onclick=()=>{if(pins.has(r.key))pins.delete(r.key);else if(pins.size<3)pins.set(r.key,r);render();};tool.append(pin);const compareBranch=el('button','분기 비교에 추가');compareBranch.onclick=()=>branchCompare.pick(r.branch);tool.append(compareBranch);a.append(tool);
 const w=witness(r);if(w)a.append(w);
 const info=el('details');info.append(el('summary','세부 조건 및 원장 ID'),el('p','난이도: '+(r.difficulties.join(', ')||'미기록')+' · 계급: '+(r.rank??'미기록')+' · ID: '+r.id),el('p','행동 이력 해시: '+r.hash),link('등록 원장 (gzip)','data/'+sourceOf(r).file+'.json.gz'));if(r.medals&&Object.keys(r.medals).length)info.append(el('p','요구 훈장: '+Object.entries(r.medals).map(([id,n])=>name(id)+' '+n).join(' · ')));a.append(info);return a;
}
function render(){
 const f=filter(),scoped=filterRows(rows,f),roleResult=roleView.active()?roleView.apply(scoped,f.metric,f.difficulty):null;
 const matches=roleResult?roleResult.rows:rankRows(scoped,f.metric,f.stat);roleView.summary(roleResult,scoped.length);
 $('status').textContent=fmt(matches.length)+'개 등록 경로 · 연결 '+fmt(rows.length)+'개 / 원장 '+loaded+'/'+ledgers.length+(loaded<ledgers.length?' (불러오는 중)':'');
 $('errors').hidden=!errors.length;$('errors').textContent=errors.join(' · ');
 const frag=document.createDocumentFragment();if(!matches.length&&loaded===ledgers.length)frag.append(el('p','현재 연결된 원장에 해당 조건의 기록이 없습니다. 다른 조건을 선택해 보세요. 불가능 판정은 아닙니다.'));
 for(const r of matches.slice(0,limit))frag.append(card(r,f.metric,f.stat,roleResult));
 $('results').replaceChildren(frag);$('more').hidden=matches.length<=limit;renderCompare();branchCompare.update(branches,rows,loaded===ledgers.length,[branchWarning,ledgerIncomplete?'일부 육성 원장이 미연결 또는 불완전합니다. 비교는 현재 연결분만 반영합니다.':''].filter(Boolean).join(' · '));
}
for(const k of statKeys)$('stat').add(new Option(labels[k],k));
for(const id of ['difficulty','metric','stat'])if(params.has(id)&&[...$(id).options].some(o=>o.value===params.get(id)))$(id).value=params.get(id);
$('certified').checked=params.get('certified')==='1';
for(const id of controls)$(id).addEventListener('change',()=>{initial=false;limit=30;sync();render();});
$('more').onclick=()=>{limit+=30;render();};$('reset').onclick=()=>{initial=false;roleView.reset();for(const id of controls)if(id==='certified')$(id).checked=false;else $(id).selectedIndex=0;limit=30;sync();render();};
try{
 const modern=await gzip('soldiers-modern-index');
 if(modern.meta?.mod?.version!=='v.o2')throw Error('2.1 병종 자료가 아닙니다');
 metadata=modern.meta.source.metadataSha256;
 for(const r of [...modern.soldiers,...modern.transformations,...modern.bonuses])names[r.id]=r.koName||r.enName||r.id;
 for(const r of modern.profiles)origins.set(r.id,r.sourceKoName||r.sourceEnName||r.id);
 try{const cat=await json('data/soldier-source-catalog.json');if(cat.sourceVersion==='v.o2')names={...cat.names,...names};}catch(e){errors.push('한국어 참조 일부 미연결');}
 try{branches=await loadBranchOptions(metadata);branchCaptains=new Map([...branches].map(([id,b])=>[id,b.captain]));}catch(e){branchWarning='전체 분기 색인 연결 실패: '+e.message+' · 현재 등록 분기 이름만 사용합니다.';try{const b=await json('data/soldier-atlas-career-branches.json');if(b.sourceMetadataSha256!==metadata)throw Error('버전 불일치');branches=new Map(b.branches.map(x=>[x.id,x]));branchCaptains=new Map(b.branches.map(x=>[x.id,x.captain]));}catch(e){errors.push('분기 이름 연결 실패: '+e.message);}}
 populate();initial=false;render();
 // Load independently, release large ledger objects after projection, and keep partial results.
 for(const source of ledgers){
  try{const {rows:added,rejected}=project(source,await gzip(source.file),metadata);rows.push(...added);if(rejected.length){ledgerIncomplete=true;errors.push(source.label+' '+rejected.length+'개 불완전 기록 제외');}}
  catch(e){ledgerIncomplete=true;errors.push(source.label+' 미연결: '+e.message);}
  finally{loaded++;populate();render();await new Promise(resolve=>setTimeout(resolve,0));}
  const li=el('li');li.append(link(source.label,'data/'+source.file+'.json.gz'));$('source-list').append(li);
 }
}catch(e){ledgerIncomplete=true;errors.push('병종 원본 연결 실패: '+e.message);loaded=ledgers.length;render();}
