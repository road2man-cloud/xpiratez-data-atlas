import {kinds,sources,toRecords,target,find,related} from './branch-soldier-atlas-search-core.js';
const root=new URL('./',import.meta.url);
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const state={records:[],byKey:new Map(),byId:new Map(),kind:kinds[params.get('kind')]?params.get('kind'):'',limit:40,done:0,errors:[]};
$('q').value=params.get('q')||'';
const el=(tag,value,cls)=>{const e=document.createElement(tag);if(value!==undefined)e.textContent=value;if(cls)e.className=cls;return e;};
const searchUrl=(r)=>'search/?'+new URLSearchParams({q:r.id,kind:r.kind});
const href=r=>new URL(target(r)||searchUrl(r),root);
const labels={tu:'행동력',stamina:'기력',health:'체력',bravery:'용기',reactions:'반응',firing:'사격',throwing:'투척',strength:'힘',psiStrength:'정신력',psiSkill:'정신 기술',melee:'격투',mana:'마나'};
function sync(){
 const p=new URLSearchParams();if($('q').value.trim())p.set('q',$('q').value.trim());if(state.kind)p.set('kind',state.kind);
 history.replaceState(null,'',location.pathname+(p.size?'?'+p:''));
}
function filters(){
 $('filters').replaceChildren();
 for(const [key,name] of [['','전체'],...Object.entries(kinds)]){
  const b=el('button',name);b.type='button';b.setAttribute('aria-pressed',String(state.kind===key));b.onclick=()=>{state.kind=key;state.limit=40;sync();render();};$('filters').append(b);
 }
}
function card(r){
 const a=el('article',undefined,'search-result');
 const head=el('div',undefined,'result-head');
 head.append(el('span',kinds[r.kind],'kind'));const h=el('h2');
 if(target(r)){const link=el('a',r.name);link.href=href(r);h.append(link);}else h.textContent=r.name;
 head.append(h);a.append(head);
 if(r.en&&r.en!==r.name)a.append(el('p',r.en));
 a.append(el('p',r.id));
 if(r.stats){
  const stats=el('div',undefined,'stats');
  for(const [key,value] of Object.entries(r.stats))if(typeof value==='number'&&value!==0)stats.append(el('span',(labels[key]||key)+' '+(value>0?'+':'')+value));
  if(stats.childElementCount)a.append(stats);
  else a.append(el('p','기록된 능력치 변화 없음 (기타 효과는 별도).'));
 }
 const links=related(r,state.byKey,state.byId);
 if(links.length){
  const detail=el('details');detail.append(el('summary','관련 자료 '+links.length+'개'));
  const box=el('div',undefined,'related');
  for(const {record,relation} of links){
   const link=el('a',kinds[record.kind]+' · '+record.name);link.href=href(record);link.title=relation+' · '+record.id;box.append(link);
  }
  detail.append(box);a.append(detail);
 }
 return a;
}
function render(){
 filters();const q=$('q').value.trim(),hits=find(state.records,q,state.kind);
 const pending=state.done<sources.length;
 $('status').textContent=(!q?'검색어를 입력하세요 · ':'검색 결과 '+hits.length.toLocaleString('ko-KR')+'개 · ')+
  '연결된 자료 '+state.records.length.toLocaleString('ko-KR')+'개'+(pending?' · 자료 불러오는 중':'');
 $('errors').hidden=!state.errors.length;$('errors').textContent=state.errors.length?'일부 자료를 불러오지 못했습니다: '+state.errors.join(', ')+'. 현재 결과는 부분 검색입니다.':'';
 const frag=document.createDocumentFragment();
 if(q&&!hits.length&&!pending)frag.append(el('p','일치하는 항목이 없습니다. 다른 한국어 이름, 영문명 또는 내부 ID로 검색해 보세요.'));
 for(const r of hits.slice(0,state.limit))frag.append(card(r));
 $('results').replaceChildren(frag);$('more').hidden=hits.length<=state.limit;
}
async function load(source){
 const url=new URL('data/'+source.file+'.json',root);
 if(source.compressed&&typeof DecompressionStream!=='undefined'){
  try{const res=await fetch(url.href+'.gz');if(res.ok)return await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).json();}catch{}
 }
 const res=await fetch(url);if(!res.ok)throw Error('HTTP '+res.status);return res.json();
}
$('search-form').addEventListener('submit',e=>{e.preventDefault();state.limit=40;sync();render();});
let timer;$('q').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{state.limit=40;sync();render();},160);});
$('more').onclick=()=>{state.limit+=40;render();};
render();
await Promise.all(sources.map(async source=>{
 try{
  const records=toRecords(source.key,await load(source));
  for(const r of records){
   const key=r.kind+':'+r.id;if(state.byKey.has(key))continue;
   state.records.push(r);state.byKey.set(key,r);
   if(!state.byId.has(r.id))state.byId.set(r.id,[]);
   state.byId.get(r.id).push(r);
  }
 }catch(e){state.errors.push(source.kindList.map(k=>kinds[k]).join('·')+' ('+e.message+')');}
 finally{state.done++;render();}
}));
