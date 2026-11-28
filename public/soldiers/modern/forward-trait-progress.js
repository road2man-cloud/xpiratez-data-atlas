// V172: supplemental branch-local forward production panel in the existing soldier DB.
// Never changes the certified/conditional route table or its ranking.
const BRANCH_LABELS={existing:'기존 남성 병종',hybrid:'혼종',priest:'성직자'};
const list=x=>Array.isArray(x)?x:[];
export function validateProgress(d){
 if(d?.schema!=='ATLAS_FORWARD_TRAIT_GOAL_PROGRESS_V1'||d.finalAdmission!==0||d.actualGameCertified!==0)throw Error('지원 자료 스키마 또는 인증 상태 불일치');
 const map=(rows,k)=>{const m=new Map(rows.map(x=>[x[k],x]));if(m.size!==rows.length)throw Error('중복 ID');return m;};
 const groups=map(d.groups,'id'),goals=map(d.goals,'id'),branches=map(d.branches,'id'),acquisitions=map(d.acquisitions,'id'),partials=map(d.partialRoutes,'id');
 if(goals.size!==d.preservedGoals||branches.size!==3)throw Error('목표 또는 분기 누락');
 for(const g of groups.values()){
  if(!acquisitions.has(g.acquisition)||g.branches.length!==branches.size||new Set(g.branches.map(x=>x.id)).size!==branches.size)throw Error('그룹 연결 누락');
  for(const b of g.branches)if(!branches.has(b.id)||b.missing.some(x=>!g.required.includes(x))||b.disabled.some(x=>!b.missing.includes(x)))throw Error('연구 조건 연결 불일치');
 }
 for(const g of goals.values())if(!groups.has(g.group)||g.finalAdmission!==false||(g.partialRoute&&!partials.has(g.partialRoute)))throw Error('목표 연결 누락');
 for(const p of partials.values())if(p.finalAdmission!==false||p.statKeys.length!==12||p.effective.length!==12)throw Error('부분 능력치 연결 불일치');
 return {groups,goals,branches,acquisitions,partials};
}
export function rowsFor(d,filter={},index=validateProgress(d)){
 const name=id=>d.names?.[id]||id;
 const branch=filter.branch||'existing',q=(filter.query||'').trim().toLowerCase();
 if(!index.branches.has(branch))throw Error('분기 ID 없음');
 return d.goals.flatMap(goal=>{
  const group=index.groups.get(goal.group),b=group.branches.find(x=>x.id===branch),acq=index.acquisitions.get(group.acquisition).branches.find(x=>x.id===branch);
  if(!b||!acq)throw Error('분기 연결 누락');
  if(filter.origin&&group.origin!==filter.origin||filter.partialOnly&&!goal.partialRoute)return [];
  if(filter.difficultyMatch&&goal.difficulty!==index.branches.get(branch).difficulty)return [];
  const search=[goal.id,goal.body,name(goal.body),group.origin,name(group.origin),...goal.traits.flatMap(x=>[x.id,name(x.id)]),...group.transformations.flatMap(x=>[x,name(x)])].join(' ').toLowerCase();
  if(q&&!search.includes(q))return [];
  return [{goal,group,branch:b,acq,met:group.required.length-b.missing.length,total:group.required.length,partial:goal.partialRoute?index.partials.get(goal.partialRoute):null,difficultyMatch:goal.difficulty===index.branches.get(branch).difficulty}];
 }).sort((a,b)=>a.branch.missing.length-b.branch.missing.length||a.goal.id.localeCompare(b.goal.id));
}
function node(tag,text,attrs={}){
 const n=document.createElement(tag);
 if(text!==null&&text!==undefined)n.textContent=String(text);
 for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));
 return n;
}
function loadPanel(panel){
 const status=panel.querySelector('[data-forward-status]'),body=panel.querySelector('[data-forward-content]');
 let loading=false,loaded=false;
 async function load(){
  if(loading||loaded)return;loading=true;status.textContent='순방향 연구 연결 자료를 불러오는 중…';
  try{
   const response=await fetch(new URL('../../data/soldier-forward-trait-progress-v172.json',import.meta.url));
   if(!response.ok)throw Error('HTTP '+response.status);
   const d=await response.json(),index=validateProgress(d);
   render(d,index,body,status);loaded=true;
  }catch(e){status.textContent='순방향 자료를 열 수 없습니다: '+e.message+' · 다시 펼쳐 재시도할 수 있습니다.';}
  finally{loading=false;}
 }
 panel.addEventListener('toggle',()=>{if(panel.open)void load();});
 document.querySelector('[data-forward-open]')?.addEventListener('click',()=>{panel.open=true;void load();});
 if(panel.open||location.hash==='#forwardTraitProgress'){panel.open=true;void load();}
}
function render(d,index,root,status){
 root.replaceChildren();
 const name=id=>d.names?.[id]||id;
 const names=ids=>list(ids).map(name).join(' · ')||'없음';
 const traits=xs=>list(xs).map(x=>Array.isArray(x)?name(x[0])+' ×'+x[1]:name(x.id)+' ×'+x.count).join(' · ')||'없음';
 const fields=node('div',null,{class:'route-toolbar'}),branch=node('select',null,{'aria-label':'독립 캠페인'}),origin=node('select',null,{'aria-label':'출생처'}),query=node('input',null,{type:'search',placeholder:'병종 · 특성 · 목표 ID', 'aria-label':'목표 검색'});
 const opt=(parent,value,label)=>parent.append(node('option',label,{value}));
 for(const b of d.branches)opt(branch,b.id,(BRANCH_LABELS[b.id]||b.id)+' · '+b.month+'개월차 · 난이도 '+b.difficulty);
 opt(origin,'','모든 출생처');
 for(const id of [...new Set(d.groups.map(x=>x.origin))])opt(origin,id,name(id));
 const checkbox=(label)=>{const wrap=node('label',null,{class:'tick'}),input=node('input',null,{type:'checkbox'});wrap.append(input,document.createTextNode(' '+label));fields.append(wrap);return input;};
 fields.append(branch,origin,query);
 const partial=checkbox('V167 부분 적용 이력만'),same=checkbox('목표 난이도 일치만');
 const counter=node('p',null,{role:'status','aria-live':'polite'});
 const note=node('p','정렬 기준은 선택한 한 캠페인의 미충족 연구 수입니다. 실제 시술 가능 여부와 최종 능력치 순위가 아닙니다.',{class:'scope-note'});
 const shell=node('div',null,{class:'table-shell',role:'region',tabindex:'0','aria-label':'순방향 목표 연결 비교'}),table=node('table'),head=node('thead'),tbody=node('tbody'),tr=node('tr');
 for(const h of ['기존 목표 / 출생처','목표 특성 (미인증)','연구 충족 / 미충족','신규 획득 조건','별도 V167 부분 적용 이력'])tr.append(node('th',h,{scope:'col'}));
 head.append(tr);table.append(head,tbody);shell.append(table);
 const controls=node('div',null,{class:'route-toolbar'}),prev=node('button','이전',{type:'button'}),next=node('button','다음',{type:'button'}),pageLabel=node('span');
 controls.append(prev,pageLabel,next);root.append(fields,counter,note,controls,shell);
 let page=0;const size=25;
 function refresh(reset=false){
  if(reset)page=0;
  const rows=rowsFor(d,{branch:branch.value,origin:origin.value,query:query.value,partialOnly:partial.checked,difficultyMatch:same.checked},index);
  const pages=Math.max(1,Math.ceil(rows.length/size));page=Math.min(page,pages-1);
  counter.textContent=rows.length+'개 목표 · '+(BRANCH_LABELS[branch.value]||branch.value)+' 단독 · 최종 인증 0건';
  pageLabel.textContent=(page+1)+' / '+pages;prev.disabled=page===0;next.disabled=page+1>=pages;tbody.replaceChildren();
  for(const r of rows.slice(page*size,(page+1)*size)){
   const row=node('tr'),g=r.goal,group=r.group,b=r.branch,a=r.acq,m=a.missing;
   const c1=node('td'),title=node('strong',name(g.body)),meta=node('p',name(group.origin)+' · 목표 난이도 '+g.difficulty+(r.difficultyMatch?'':' (불일치)'));
   const detail=node('details'),summary=node('summary','목표 ID / 원래 훈련 순서');detail.append(summary,node('p',g.id),node('p',names(group.transformations)));c1.append(title,meta,detail);
   const c2=node('td',traits(g.traits)),c3=node('td');c3.append(node('strong',r.met+' / '+r.total),node('p','미완료: '+names(b.missing)));
   if(b.disabled.length)c3.append(node('p','현재 분기에서 비활성: '+names(b.disabled)));
   const c4=node('td');c4.append(node('p',a.originAlreadyRecruited?'이 분기에서 해당 출생처 고용 이력 있음':'해당 출생처 고용 이력 없음'));
   const shortage=[...(m.research||[]).map(x=>'연구 '+name(x)),...(m.functions||[]).map(x=>'시설 '+x),...Object.entries(m.items||{}).map(([k,v])=>name(k)+' '+v+'개'),...(m.funds?['자금 $'+m.funds.toLocaleString('en-US')]:[])];
   c4.append(node('p','현재 신규 획득 부족: '+(shortage.join(' · ')||'기록된 부족 없음')));
   const c5=node('td');
   if(r.partial){const p=r.partial,det=node('details');det.append(node('summary','조건부 적용 '+p.applied.length+'회 · '+name(p.body)),node('p','시술: '+names(p.applied)),node('p','실제 모델 특성: '+traits(p.traits)),node('p','조건부 성장 수치: '+p.statKeys.map((k,i)=>(d.statLabels?.[k]||k)+' '+p.effective[i]).join(' · ')),node('p','V167 기존 분기의 별도 이력. 현재 선택 분기와 결합되지 않습니다.'));c5.append(det);}
   else c5.textContent='부분 적용 이력 없음';
   row.append(c1,c2,c3,c4,c5);tbody.append(row);
  }
  if(!rows.length){const empty=node('tr');empty.append(node('td','조건에 맞는 목표가 없습니다.',{colspan:5}));tbody.append(empty);}
 }
 for(const x of [branch,origin,partial,same])x.addEventListener('change',()=>refresh(true));
 query.addEventListener('input',()=>refresh(true));prev.addEventListener('click',()=>{page--;refresh();});next.addEventListener('click',()=>{page++;refresh();});
 status.textContent=d.preservedGoals+'개 기존 목표 · '+d.groups.length+'개 육성 그룹 · '+d.branches.length+'개 독립 분기 · '+d.goals.filter(g=>g.partialRoute).length+'개 목표의 별도 부분 적용 이력 · 최종 인증 0건';
 refresh(true);
}
if(typeof document!=='undefined'){
 const panel=document.getElementById('forwardTraitProgress');if(panel)loadPanel(panel);
}
