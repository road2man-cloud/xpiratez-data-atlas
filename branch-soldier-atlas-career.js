import {ledgers,statKeys,project,routeUrl,branchUrl,readResearchWitness} from './branch-soldier-atlas-career-core.js?v=35-joint-unified';
import {sameChoices} from './branch-soldier-atlas-branch-compare-core.js?v=30';
import {rowsWithMissingOrigins,statValue,filterTable,sortTable} from './branch-soldier-atlas-table-core.js?v=35-joint-unified';
// Mounted only in the existing Soldier DB's originTable. No standalone page.
const root=new URL('./',import.meta.url);
export function mountRouteTable({modern,catalog,registry,isActive}){
const aliases={q:'search',status:'rowCount',errors:'routeErrors',tableScroll:'originTableScroll',reset:'routeReset',researchDialog:'routeResearchDialog',researchTitle:'routeResearchTitle',researchClose:'routeResearchClose',researchContent:'routeResearchContent'};
const $=id=>id==='head'?document.querySelector('#originTable thead'):id==='results'?document.querySelector('#originTable tbody'):document.getElementById(aliases[id]||id);
const params=new URLSearchParams(location.search);
const controls=['q','origin','body','captain','branch','training','trait','difficulty','metric','certified','fixedOptimumOnly','transitionBreakthroughOnly','jointOnly','jointAppliedOnly','missingOnly','selectedOnly','a','b','sameChoices'];
const checks=new Set(['certified','fixedOptimumOnly','transitionBreakthroughOnly','jointOnly','jointAppliedOnly','missingOnly','selectedOnly','sameChoices']);
const labels={tu:'TU',stamina:'기력',health:'체력',bravery:'용기',reactions:'반응',firing:'사격',throwing:'투척',strength:'근력',psiStrength:'Psi 강도',psiSkill:'Psi 기술',melee:'근접',mana:'Mana'};
const columns=[
 ['select','선택','sticky-select'],['origin','출생처','sticky-origin'],['body','최종 병종','sticky-body'],
 ...statKeys.map(k=>[k,labels[k],'num']),['total','합계','num sum'],
 ['captain','선장','choice'],['branch','분기','choice'],['path','진로','choice'],['cause','대의','choice'],['queen','여왕','choice'],['codex','코덱스','choice'],
 ['depth','시술 횟수','num'],['order','시술 순서','text-list'],['traitCount','특성 수','num'],['traits','보유 특성','text-list'],
 ['research','연구 이력','research'],['blocked','차단 연구','research'],['acquisition','모집 조건','text-list'],['difficulty','난이도','choice'],
 ['rank','계급','choice'],['medals','요구 훈장','text-list'],['status','상태','choice'],['source','원장·상세','source']
];
const sortable=new Set(columns.map(x=>x[0]).filter(k=>!['select','order','traits','research','acquisition','medals'].includes(k)));
let sort=sortable.has(params.get('sort'))?params.get('sort'):statKeys.includes(params.get('stat'))?params.get('stat'):'total';
let dir=params.get('dir')==='asc'?'asc':'desc',page=0,metadata,loaded=0,errors=[],rows=[],profiles=new Map(),names={},branches=new Map(),branchCaptains=new Map(),initial=true,dialogToken=0;
const selected=new Set(),indexCache=new Map(),fmt=x=>Number.isFinite(x)?x.toLocaleString('ko-KR'):'—';
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
const name=id=>names[id]||id||'—',originName=id=>profiles.get(id)?.sourceKoName||profiles.get(id)?.sourceEnName||id;
const branchName=id=>{const b=branches.get(id);return b?'#'+b.rank+' · '+b.captain.map(name).join(' → ')+' / '+[b.choices.path,b.choices.cause,b.choices.queen,b.choices.codex].map(name).join(' / '):id;};
const link=(text,path)=>{const a=el('a',text);a.href=new URL(path,root);return a};
const search=(kind,id)=>'search/?'+new URLSearchParams({kind,q:id});
const context=()=>({profiles,branches,branchCaptains,names,selected});
const sourceOf=r=>ledgers.find(s=>s.key===r.source);
const initialValue=id=>initial?(params.get(id)??(id==='origin'?params.get('profile'):null)??$(id).value):$(id).value;
function options(id,values,label){
 const select=$(id),value=initialValue(id),first=select.options[0]?.textContent||'전체';
 select.replaceChildren(new Option(first,''));
 for(const v of [...new Set(values)].filter(Boolean).sort((a,b)=>label(a).localeCompare(label(b),'ko',{numeric:true})))select.add(new Option(label(v),v));
 if(value&&![...select.options].some(o=>o.value===value))select.add(new Option(label(value),value));
 select.value=value||'';
}
function populate(){
 options('origin',[...profiles.keys(),...rows.map(r=>r.origin)],originName);
 options('body',rows.map(r=>r.body),name);
 options('captain',[...branchCaptains.values()].flat(),name);
 options('branch',[...new Set(rows.map(r=>r.branch)),...branches.keys()],branchName);
 options('training',rows.flatMap(r=>r.order),name);
 options('trait',rows.flatMap(r=>r.traits||[]),name);
 options('a',[...branches.keys(),...rows.map(r=>r.branch)],branchName);
 const a=$( 'a').value,matched=$( 'sameChoices').checked&&a;
 options('b',[...branches.keys(),...rows.map(r=>r.branch)].filter(b=>!matched||sameChoices(branches.get(a),branches.get(b))),branchName);
 if(matched&&$('b').value&&!sameChoices(branches.get(a),branches.get($('b').value)))$('b').value='';
}
function filter(){
 const f=Object.fromEntries(controls.map(id=>[id,checks.has(id)?$(id).checked:$(id).value]));
 return f;
}
function sync(){
 if(!isActive())return;
 const p=new URLSearchParams(location.search);p.set('group','routes');
 for(const k of [...p.keys()])if(controls.includes(k)||k==='sort'||k==='dir'||k==='stat'||k==='role'||k==='primary'||k.startsWith('role')||k.startsWith('min_')||k==='profile')p.delete(k);
 for(const id of controls){const v=checks.has(id)?($(id).checked?'1':''):$(id).value;if(v&&!(id==='metric'&&v==='cap'))p.set(id,v)}
 if(sort!=='total')p.set('sort',sort);if(dir==='asc')p.set('dir',dir);
 history.replaceState(null,'',location.pathname+(p.size?'?'+p:'')+location.hash);
}
async function json(path){const res=await fetch(new URL(path,root));if(!res.ok)throw Error('HTTP '+res.status);return res.json()}
async function gzip(file){
 if(typeof DecompressionStream==='undefined')throw Error('gzip 지원 브라우저 필요');
 const res=await fetch(new URL('data/'+file+'.json.gz',root));if(!res.ok)throw Error('HTTP '+res.status);
 return new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).json();
}
function indexLoad(file){if(!indexCache.has(file))indexCache.set(file,gzip(file).catch(e=>{indexCache.delete(file);throw e}));return indexCache.get(file)}
function appendList(td,ids,kind,sep=' · ',counts=null){
 if(!ids?.length){td.append(document.createTextNode('—'));return}
 ids.forEach((id,i)=>{if(i)td.append(document.createTextNode(sep));const a=link(name(id)+(counts?.[id]>1?' ×'+counts[id]:''),search(kind,id));a.title=id;td.append(a)});
}
function actionLabel(a){
 const id=a.research||a.id||a.transform||a.event||a.script||a.source;
 const kinds={research:'연구',repeatResearch:'반복 연구',freeResearch:'무료 연구',eventResearch:'이벤트 연구',missionResearch:'임무 연구'};
 return (kinds[a.type]||a.type)+(id?' · '+name(id):'')+(a.assumeOutcome||a.assumption?' (가정)':'');
}
async function showResearch(r){
 const token=++dialogToken,dialog=$('researchDialog'),content=$('researchContent'),source=sourceOf(r);
 $('researchTitle').textContent=originName(r.origin)+' · 연구 이력';
 content.replaceChildren(link(r.rootRoute?'기존 출발 경로':'전체 육성 근거',routeUrl(r)),el('p','불러오는 중…'));
 if(!dialog.open)dialog.showModal();
 if(!source?.index){content.replaceChildren(link('원본 경로에서 연구·시술 이력 보기',routeUrl(r)));return}
 try{
  const w=readResearchWitness(await indexLoad(source.index),r,metadata);if(token!==dialogToken)return;
  content.replaceChildren(link(r.rootRoute?'기존 출발 경로':'전체 육성 근거',routeUrl(r)),el('h3','시술 시점별 연구 요구'));
  if(r.fixedModelOptimum){const proof=r.fixedModelOptimum;content.append(el('h3','고정 연구 모형의 12능력치 동시 상계 도달'),el('p','이 연구 세트와 출발 상태에서 결정론적 비복제 생존 시술·성장을 허용한 조건부 모형의 상계와 기록 수치가 모두 일치합니다. 연구 순서 전체, 추가 연구, 실제 자원 및 미지원 행동의 최종 인증은 아닙니다.'),el('p',statKeys.map((k,i)=>labels[k]+' '+fmt(proof.vector[i])).join(' · ')),el('p','연구 세트 '+proof.researchSet+' · 상계 근거 '+proof.bound,'small'),link('조건부 상계 도달 원장','data/soldier-final-career-fixed-model-optima.json.gz'));}
  if(r.researchTransition){const t=r.researchTransition;content.append(el('h3','추가 연구 전후 상계와 실제 도달치'),el('p','동일 경로의 연구 직전 상태와 직후 상태를 비교한 조건부 모형입니다. 연구 전후 상계는 달성 수치가 아니며, 다른 육성 경로 전체의 최고치를 뜻하지 않습니다.'));const tbl=el('table');const head=el('tr');for(const x of ['능력치','연구 전 상계','연구 후 상계','기록 영구치','연구 전 상계 초과'])head.append(el('th',x));tbl.append(head);for(const [i,k] of statKeys.entries()){const row=el('tr');for(const x of [labels[k],fmt(t.beforeAxes[i]),fmt(t.afterAxes[i]),fmt(r.current[i]),t.actualExceeded[i]>0?'+'+fmt(t.actualExceeded[i]):t.actualExceeded[i]===null?'—':'0'])row.append(el('td',x));tbl.append(row);}content.append(tbl,el('p','연구 세트 '+t.sourceSet+' → '+t.resultSet,'small'),link('연구 확장 이전 상계 초과 원장','data/soldier-final-career-research-breakthroughs.json.gz'));}
  if(r.jointResearch){const j=r.jointResearch;content.append(el('h3','공동 연구 세트와 실제 수행 시술'),el('p','요청 '+j.requested.length+'개 중 '+j.achieved.length+'개 연구를 한 상태에서 동시에 활성화했습니다. '+(j.full?'요청 전체 충족':'부분 충족')+' · 실제 지원 시술 '+j.applied.length+'종. 시술 수행과 최종 특성 보유는 별개입니다.'),el('p','활성 연구: '+j.achieved.map(name).join(' · ')),el('p','남은 연구: '+(j.remaining.map(name).join(' · ')||'없음')),el('p','지원 시술: '+j.targets.map(name).join(' · ')),el('p','실제 후속 수행: '+(j.applied.map(name).join(' · ')||'아직 없음')),link('공동 연구·시술 근거 원장','data/soldier-final-career-joint-research.json.gz'));}
  if(r.researchSet)content.append(el('p','연구 세트: '+r.researchSet,'small'));
  const gates=el('ol',undefined,'dialog-list');
  for(const g of w.gates){const li=el('li');li.append(link(name(g.transform),search('training',g.transform)),document.createTextNode(' · '));appendList(li,g.requires,'research');gates.append(li)}
  content.append(gates,el('h3','시간순 연구 행동 ('+w.actions.length+')'));
  const list=el('ol',undefined,'dialog-list');for(const a of w.actions)list.append(el('li',actionLabel(a)));content.append(list);
  if(w.fullActions){const detail=el('details');detail.append(el('summary','전체 시간순 행동 ('+w.fullActions.length+')'));const full=el('ol',undefined,'dialog-list');for(const a of w.fullActions){const li=el('li',actionLabel(a));const raw=el('small',JSON.stringify(a),'small');li.append(raw);full.append(li)}detail.append(full);content.append(detail)}
 }catch(e){if(token===dialogToken)content.replaceChildren(el('p',e.message),link('원본 경로',routeUrl(r)))}
}
function detailsList(td,items,kind,title){
 if(!items){td.textContent='—';return}
 if(!items.length){td.textContent='0';return}
 const d=el('details'),s=el('summary',title||items.length+'개');d.append(s);
 const content=el('div');appendList(content,items,kind);d.append(content);td.append(d);
}
function renderHead(){
 const row=el('tr');
 for(const [key,title,cls] of columns){
  const th=el('th',undefined,cls);th.scope='col';
  if(sortable.has(key)){
   th.setAttribute('aria-sort',sort===key?(dir==='asc'?'ascending':'descending'):'none');
   const btn=el('button',title+(sort===key?(dir==='asc'?' ▲':' ▼'):''));btn.type='button';
   btn.onclick=()=>{dir=sort===key?(dir==='asc'?'desc':'asc'):['origin','body','captain','branch','path','cause','queen','codex','source','status'].includes(key)?'asc':'desc';sort=key;page=0;sync();render()};th.append(btn)
  }else th.textContent=title;
  row.append(th);
 }
 $('head').replaceChildren(row);
}
function renderRow(r,f){
 const tr=el('tr');tr.dataset.routeKey=r.key;tr.classList.toggle('selected',selected.has(r.key));const b=branches.get(r.branch),p=profiles.get(r.origin),source=sourceOf(r);
 for(const [key,title,cls] of columns){
  const td=el('td',undefined,cls);let filled=false;
  if(key==='total'||statKeys.includes(key)){td.textContent=fmt(statValue(r,key,f.metric,profiles));filled=true}
  else switch(key){
  case 'select':{const cb=el('input');cb.type='checkbox';cb.checked=selected.has(r.key);cb.setAttribute('aria-label',originName(r.origin)+' 행 선택');cb.onchange=()=>{if(cb.checked)selected.add(r.key);else selected.delete(r.key);tr.classList.toggle('selected',cb.checked);if($('selectedOnly').checked)render();else updateSelection()};td.append(cb);filled=true;break}
  case 'origin':td.append(link(originName(r.origin),'soldiers/modern/?'+new URLSearchParams({profile:r.origin})+'#originDetails'));if(p?.soldierKoName)td.append(el('span',p.soldierKoName,'small'));filled=true;break;
  case 'body':if(r.body){td.append(link(name(r.body),search('soldier',r.body)));filled=true}break;
  case 'captain':if(b){appendList(td,b.captain,'research',' → ');filled=true}break;
  case 'branch':if(r.branch){if(f.a===r.branch||f.b===r.branch)td.append(el('span',[f.a===r.branch?'A':'',f.b===r.branch?'B':''].filter(Boolean).join('/')+' ','pair-tag'));td.append(link(b?'#'+b.rank:r.branch,branchUrl(r.branch)));filled=true}break;
  case 'path':case 'cause':case 'queen':case 'codex':if(b?.choices[key]){td.append(link(name(b.choices[key]),search('research',b.choices[key])));filled=true}break;
  case 'depth':if(!r.missing){td.textContent=fmt(r.order.length);filled=true}break;
  case 'order':if(!r.missing){appendList(td,r.order,'training',' → ');filled=true}break;
  case 'traitCount':if(r.traits!==null){td.textContent=fmt(r.traits.length);filled=true}break;
  case 'traits':if(r.traits!==null){appendList(td,r.traits,'bonus',' · ',r.traitCounts);filled=true}break;
  case 'research':if(!r.missing){const btn=el('button',source?.index?'시점별 이력':'원본 이력');btn.type='button';btn.onclick=()=>showResearch(r);td.append(btn);if(r.requiredResearch?.length){const req=el('div');detailsList(req,r.requiredResearch,'research','요구 연구 '+r.requiredResearch.length+'개');td.append(req)}filled=true}break;
  case 'blocked':if(b?.blockedResearch){detailsList(td,b.blockedResearch,'research');filled=true}break;
  case 'acquisition':if(p){
   const items=p.acquisitionRequiredItems||{},req=p.requires||[];const d=el('details'),label=p.sourceType||'획득';
   d.append(el('summary',name(p.sourceId)||label));
   const div=el('div');if(req.length)appendList(div,req,'research');
   for(const [id,n] of Object.entries(items)){div.append(el('br'),link(name(id)+' ×'+n,search('item',id)))}
   if(p.cost!=null)div.append(el('span','비용 '+fmt(p.cost),'small'));
   if(p.time!=null)div.append(el('span','시간 '+fmt(p.time),'small'));
   d.append(div);td.append(d);filled=true
  }break;
  case 'difficulty':if(r.difficulties.length){td.textContent=r.difficulties.join(', ');filled=true}break;
  case 'rank':if(r.rank!=null){td.textContent=String(r.rank);filled=true}break;
  case 'medals':if(r.medals){const ids=Object.keys(r.medals);appendList(td,ids,'bonus',' · ',r.medals);filled=true}break;
  case 'status':td.textContent=r.missing?'미연결':r.certified?'최종 인증':r.fixedModelOptimum?'고정 연구 상계 도달':r.jointResearch?.applied.length>=2?'공동 연구·복수 시술':r.researchTransition?.exceededAxes>0?'연구 전 상계 초과':r.conditionalScopeComplete?'조건부 종결':'조건부';if(r.missing)td.classList.add('missing');filled=true;break;
  case 'source':if(source){td.append(link(source.label,routeUrl(r)));if(r.rootRoute)td.append(el('span','출발 경로','small'));td.title=r.id;filled=true}break;
  }
  if(!filled){td.textContent='—';td.classList.add('missing')}
  tr.append(td);
 }
 return tr;
}
function updateSelection(){$('clearSelection').textContent='선택 해제 ('+selected.size+')';$('clearSelection').disabled=!selected.size}
function render(){
 if(!isActive())return;
 const f=filter(),all=loaded===ledgers.length?rowsWithMissingOrigins(rows,[...profiles.values()]):rows;
 const matches=sortTable(filterTable(all,f,context()),sort,dir,f.metric,context());
 const size=Number($('pageSize').value),pages=Math.max(1,Math.ceil(matches.length/size));page=Math.min(page,pages-1);
 $('status').textContent=fmt(matches.length)+'행 / '+fmt(all.length)+'행'+(loaded<ledgers.length?' · 로딩 '+loaded+'/'+ledgers.length:'');
 $('status').dataset.routeStatus=loaded===ledgers.length?(errors.length?'partial':'loaded'):'loading';
 $('errors').hidden=!errors.length;$('errors').textContent=errors.join(' · ');
 $('page').textContent=(page+1)+' / '+pages;$('prev').disabled=page===0;$('next').disabled=page>=pages-1;
 renderHead();const frag=document.createDocumentFragment();
 for(const r of matches.slice(page*size,(page+1)*size))frag.append(renderRow(r,f));
 if(!matches.length){const tr=el('tr'),td=el('td','등록 기록 없음');td.colSpan=columns.length;tr.append(td);frag.append(tr)}
 $('results').replaceChildren(frag);updateSelection();
}
for(const id of controls){
 if(checks.has(id))$(id).checked=params.get(id)==='1';
 else if(id==='q'){}else if(['difficulty','metric'].includes(id)&&[...$(id).options].some(o=>o.value===params.get(id)))$(id).value=params.get(id);
}
if(params.has('a')||params.has('b')||location.hash==='#branchCompare')$('branchCompare').open=true;

for(const id of controls.filter(k=>k!=='q'))$(id).onchange=()=>{
 if(initial||!isActive())return;
 if(id==='a'||id==='sameChoices'){if($('sameChoices').checked&&$('b').value&&!sameChoices(branches.get($('a').value),branches.get($('b').value)))$('b').value='';populate()}
 if(id==='branch'&&$('branch').value){$('a').value='';$('b').value=''}
 if((id==='a'||id==='b')&&$(id).value)$('branch').value='';
 page=0;sync();render();
};
$('reset').onclick=()=>{initial=false;for(const id of controls)if(checks.has(id))$(id).checked=false;else if(id==='q')$(id).value='';else $(id).selectedIndex=0;sort='total';dir='desc';page=0;populate();sync();render()};
$('clearPair').onclick=()=>{$('a').value='';$('b').value='';$('sameChoices').checked=false;populate();page=0;sync();render()};
$('clearSelection').onclick=()=>{selected.clear();$('selectedOnly').checked=false;page=0;sync();render()};
$('prev').onclick=()=>{page--;render();$('tableScroll').scrollTop=0};$('next').onclick=()=>{page++;render();$('tableScroll').scrollTop=0};$('pageSize').onchange=()=>{page=0;render()};
$('researchClose').onclick=()=>{dialogToken++;$('researchDialog').close()};
async function load(){
 try{
 if(modern?.meta?.mod?.version!=='v.o2')throw Error('2.1 병종 자료가 아닙니다');
 metadata=modern.meta.source.metadataSha256;
 names={...(registry?.labels||{}),...(catalog?.names||{})};
 for(const r of [...modern.soldiers,...modern.transformations,...modern.bonuses])names[r.id]=r.koName||r.enName||r.id;
 profiles=new Map(modern.profiles.map(p=>[p.id,p]));
 if(registry?.sourceMetadataSha256===metadata){
  branches=new Map(registry.branches.map(x=>[x.id,x]));
 }else errors.push('공통 분기 원장 미연결');
 branchCaptains=new Map([...branches].map(([id,b])=>[id,b.captain]));
 populate();initial=false;render();
 for(const source of ledgers){
  try{
   const canonical=source.registryKey&&registry?.sourceMetadataSha256===metadata?registry[source.registryKey]:null;
   const {rows:added,rejected}=project(source,canonical||await gzip(source.file),metadata);
   rows.push(...added);if(rejected.length)errors.push(source.label+' '+rejected.length+'행 제외');
  }catch(e){errors.push(source.label+' 미연결: '+e.message)}
  finally{loaded++;populate();render();await new Promise(resolve=>setTimeout(resolve,0))}
 }
 }catch(e){errors.push('병종 원본 미연결: '+e.message);loaded=ledgers.length;initial=false;render()}
}
render();void load();
return {render,searchChanged(){page=0;sync();render();}};
}
