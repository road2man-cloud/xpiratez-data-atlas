import {routeFilterIds,routeThreshold} from './branch-soldier-atlas-career-core.js?v=42-minima';
import {minimumStatKeys,readStatMinimums} from './branch-soldier-atlas-table-core.js?v=42-minima';
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

