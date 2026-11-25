import {routeFilterIds,routeThreshold,loadResearchSearch} from './branch-soldier-atlas-career-core.js?v=43-research';
import {minimumStatKeys,readStatMinimums} from './branch-soldier-atlas-table-core.js?v=43-research';
// The original dropdown is reused as an add control. One compact removable list
// shows all active conditions; no Ctrl-click, modal or extra database is needed.
export function mountMultiFilter(select,{initial='',label,onChange}){
 let ids=routeFilterIds(initial);
 const host=document.createElement('span');host.className='route-multi-filter';
 select.before(host);host.append(select);
 const chips=document.createElement('span');chips.className='route-multi-chips';chips.setAttribute('aria-label',label+' 선택 조건');host.append(chips);
 const itemName=id=>[...select.options].find(o=>o.value===id)?.textContent||id;
 function refresh(){
  select.value='';if(select.options[0])select.options[0].textContent=label+' 추가…';
  for(const o of select.options)if(o.value)o.disabled=ids.includes(o.value);
  chips.replaceChildren();
  for(const id of ids){
   const button=document.createElement('button');button.type='button';button.className='route-multi-chip';
   button.textContent=itemName(id)+' ×';button.title=id;button.setAttribute('aria-label',itemName(id)+' 조건 제거');
   button.onclick=()=>{ids=ids.filter(v=>v!==id);refresh();onChange();select.focus();};
   chips.append(button);
  }
 }
 select.addEventListener('change',()=>{const id=select.value;if(!id||ids.includes(id))return;ids.push(id);refresh();onChange();});
 refresh();
 return {value:()=>ids.join(','),clear(){ids=[];refresh();},refresh};
}
// One compact expandable filter shared by both existing tables.
export function mountStatMinimums(host,{params,labels,onChange}){
 const inputs=new Map();
 const initial=readStatMinimums(params);
 const details=document.createElement('details');details.className='route-stat-minima';
 const summary=document.createElement('summary');details.append(summary);
 const grid=document.createElement('div');grid.className='route-stat-minima-grid';details.append(grid);
 for(const key of minimumStatKeys){
  const label=document.createElement('label');
  label.textContent=key==='total'?'합계':labels[key]||key;
  const input=document.createElement('input');input.type='number';input.min='0';input.step='1';input.placeholder='—';
  input.dataset.minimumStat=key;input.value=initial[key]??'';
  label.append(input);grid.append(label);inputs.set(key,input);
  input.addEventListener('change',()=>{
   const value=routeThreshold(input.value);
   input.value=value===null?'':String(value);refresh();onChange();
  });
 }
 const clear=document.createElement('button');clear.type='button';clear.textContent='능력치 조건 해제';clear.className='route-minima-clear';details.append(clear);
 function value(){return Object.fromEntries([...inputs].flatMap(([key,input])=>{
  const v=routeThreshold(input.value);return v===null?[]:[[key,v]];
 }))}
 function refresh(){
  const entries=Object.entries(value());
  summary.textContent='최소 능력치'+(entries.length?' ('+entries.length+')':'');
  summary.title=entries.map(([key,n])=>(key==='total'?'합계':labels[key]||key)+' ≥ '+n).join(' · ');
  clear.disabled=!entries.length;
 }
 function reset(){for(const input of inputs.values())input.value='';refresh()}
 clear.onclick=()=>{reset();onChange()};
 host.append(details);details.open=Object.keys(initial).length>0;refresh();
 return {value,clear:reset};
}
// The recorded research filter is lazy. The default table never downloads
// large research witnesses merely to display ability values.
export const researchFilterKeys=['researchAction','recruitResearch','recruitItem'];
export function writeResearchFilters(params,filters){
 for(const k of researchFilterKeys){params.delete(k);const value=routeFilterIds(filters[k]).join(',');if(value)params.set(k,value);}
 return params;
}
export function mountResearchFilters(host,{modern,params,name,onChange}){
 const details=document.createElement('details');details.className='route-stat-minima route-research-filters';
 const summary=document.createElement('summary');details.append(summary);
 const grid=document.createElement('div');grid.className='route-research-filter-grid';details.append(grid);
 const status=document.createElement('p');status.className='route-research-status';status.setAttribute('role','status');details.append(status);
 const clear=document.createElement('button');clear.type='button';clear.textContent='연구·모집 조건 해제';clear.className='route-minima-clear';details.append(clear);
 const profiles=modern.profiles||[],known={
  researchAction:[],
  recruitResearch:profiles.flatMap(p=>p.requires||[]),
  recruitItem:profiles.flatMap(p=>Object.keys(p.acquisitionRequiredItems||{}).filter(id=>Number(p.acquisitionRequiredItems[id])>0))
 };
 const labels={researchAction:'기록 연구 행동',recruitResearch:'모집 요구 연구',recruitItem:'모집 요구 재료'};
 const controls=new Map(),selects=new Map();
 let index=null,loading=false;
 function value(){return Object.fromEntries([...controls].map(([k,c])=>[k,c.value()]));}
 function refresh(){
  const f=value(),count=researchFilterKeys.reduce((n,k)=>n+routeFilterIds(f[k]).length,0);
  summary.textContent='연구·모집 조건'+(count?' ('+count+')':'');
  clear.disabled=!count;
  status.textContent=loading?'연구 이력 연결 중…':index?('기록 연구 행동: '+index.sources+'/4 원장 · 조건부 이벤트 포함'+(index.errors.length?' · 일부 미연결: '+index.errors.join(' / '):'')):'기록 연구 행동은 등록된 시간순 이력 기준입니다.';
 }
 function refill(key){
  const select=selects.get(key),control=controls.get(key);
  const ids=[...new Set([...known[key],...routeFilterIds(control.value())])].sort((a,b)=>name(a).localeCompare(name(b),'ko',{numeric:true}));
  select.replaceChildren(new Option('전체',''),...ids.map(id=>new Option(name(id),id)));
  control.refresh();
  select.disabled=key==='researchAction'&&!index;
 }
 for(const key of researchFilterKeys){
  const div=document.createElement('div');div.className='route-multi-control';
  const select=document.createElement('select');select.setAttribute('aria-label',labels[key]);
  div.append(select);grid.append(div);selects.set(key,select);
  controls.set(key,mountMultiFilter(select,{initial:params.getAll(key),label:labels[key],onChange:()=>{refresh();onChange();}}));
  refill(key);
 }
 async function ensure(){
  if(index||loading)return;
  loading=true;refresh();
  try{index=await loadResearchSearch(modern);known.researchAction=index.ids;refill('researchAction');}
  catch(e){index={sources:0,errors:[e.message],ids:[],matches:()=>false,hasWitness:()=>false};refill('researchAction');}
  finally{loading=false;refresh();onChange();}
 }
 function reset(){for(const c of controls.values())c.clear();refresh();}
 clear.onclick=()=>{reset();onChange()};
 details.addEventListener('toggle',()=>{if(details.open)void ensure()});
 host.append(details);
 details.open=researchFilterKeys.some(k=>routeFilterIds(value()[k]).length);
 refresh();if(details.open)void ensure();
 return {value,clear:reset,refreshNames(){for(const k of researchFilterKeys)refill(k);},index:()=>index,notice(){return value().researchAction?(loading||!index?' · 연구 이력 연결 중':index.errors.length?' · 일부 연구 원장 미연결':' · 연구 행동 기록 기준'):'';}};
}


