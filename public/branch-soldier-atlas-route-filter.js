import {routeFilterIds} from './branch-soldier-atlas-career-core.js?v=41-multi';
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
