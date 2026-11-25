import {roles,roleAxes,recommend} from './branch-soldier-atlas-role-core.js?v=31';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
export function setupRole({labels,change}){
 const params=new URLSearchParams(location.search),state={role:Object.hasOwn(roles,params.get('role'))?params.get('role'):'',primary:params.get('primary')||'',minima:{},pareto:params.get('rolePareto')==='1',representative:params.get('roleRepresentative')==='1'};
 for(const k of roleAxes(state.role,state.primary)){const raw=params.get('min_'+k);if(raw!==null&&/^\d+$/.test(raw)&&Number(raw)<=9999)state.minima[k]=Number(raw);}
 const buttons=$('roleButtons'),advanced=$('roleAdvanced'),primary=$('rolePrimary'),minima=$('roleMinima'),pareto=$('rolePareto'),representative=$('roleRepresentative');
 function renderControls(){
  buttons.replaceChildren();
  for(const [key,name] of [['','전체 육성'],...Object.entries(roles).map(([k,v])=>[k,v.name])]){
   const b=el('button',name);b.type='button';b.setAttribute('aria-pressed',String(state.role===key));b.onclick=()=>{
    if(state.role===key)return;state.role=key;state.primary='';state.minima={};renderControls();change();
   };buttons.append(b);
  }
  advanced.hidden=!state.role;primary.replaceChildren();minima.replaceChildren();
  if(!state.role)return;
  const axes=roleAxes(state.role,state.primary);
  for(const k of roles[state.role].axes)primary.add(new Option(labels[k]||k,k));
  primary.value=axes[0];
  $('rolePriority').textContent=axes.map(k=>labels[k]||k).join(' → ')+' 순서로 비교';
  for(const k of axes){
   const label=el('label',labels[k]||k),input=el('input');
   input.type='number';input.min='0';input.max='9999';input.step='1';input.placeholder='제한 없음';input.value=state.minima[k]??'';
   input.addEventListener('change',()=>{
    if(input.value===''||!input.validity.valid){delete state.minima[k];input.value='';}
    else state.minima[k]=Number(input.value);
    change();
   });label.append(input);minima.append(label);
  }
  pareto.checked=state.pareto;representative.checked=state.representative;
 }
 primary.addEventListener('change',()=>{state.primary=primary.value;renderControls();change();});
 pareto.addEventListener('change',()=>{state.pareto=pareto.checked;change();});
 representative.addEventListener('change',()=>{state.representative=representative.checked;change();});
 $('roleClear').onclick=()=>{state.minima={};state.primary='';state.pareto=false;state.representative=false;renderControls();change();};
 renderControls();
 return {
  active:()=>!!state.role,
  apply:(rows,metric,difficulty)=>recommend(rows,{...state,metric,difficulty}),
  write(p){
   for(const k of [...p.keys()])if(k==='role'||k==='primary'||k==='rolePareto'||k==='roleRepresentative'||k.startsWith('min_'))p.delete(k);
   if(state.role){p.set('role',state.role);if(state.primary)p.set('primary',state.primary);if(state.pareto)p.set('rolePareto','1');if(state.representative)p.set('roleRepresentative','1');for(const [k,v] of Object.entries(state.minima))p.set('min_'+k,String(v));}
  },
  reset(){state.role='';state.primary='';state.minima={};state.pareto=false;state.representative=false;renderControls();},
  summary(result,total){
   $('roleSummary').textContent=state.role?roles[state.role].name+' · 최저치 충족 '+result.eligible.toLocaleString('ko-KR')+'/'+total.toLocaleString('ko-KR')+'경로'+(result.frontierCount===null?'':' · 역할 능력치 비지배 '+result.frontierCount.toLocaleString('ko-KR')+'경로')+(result.hidden?' · 동일 조건 대표 표시로 '+result.hidden.toLocaleString('ko-KR')+'경로 접음':''):'';
  }
 };
}
