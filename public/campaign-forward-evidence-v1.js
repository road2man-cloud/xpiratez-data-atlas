// Shared forward evidence reader. Never merge completed research from distinct states.
export const ROOT_RESEARCH=['STR_INSPECT_MACHINERY','STR_JACKSTOWN_SCOUTING','STR_RECRUIT_PEASANTS','STR_WAT_DO'];
export const SOURCE='a16408dc92af6f7377511843533c12749fbb43c79508b8c194f9680ca49c751e';
export const FILES=['campaign-forward-tree-v2-japan-d4.json','campaign-forward-tree-v6-hybrid-synced-d7.json','campaign-forward-tree-v7-hybrid-awards-d20.json'];
export function indexGraph(g,file=''){
 if(g.schema!=='ATLAS_CAMPAIGN_FORWARD_TREE_V1'||g.sourceMetadataSha256!==SOURCE||!Array.isArray(g.nodes)||!Array.isArray(g.edges))throw Error('forward graph version mismatch');
 const root=g.nodes[0];
 if(root?.id!==0||root.completed?.length!==0||JSON.stringify([...root.availableResearch].sort())!==JSON.stringify(ROOT_RESEARCH))throw Error('invalid forward root');
 const nodes=new Map(g.nodes.map(n=>[n.id,n]));
 if(nodes.size!==g.nodes.length)throw Error('duplicate state');
 const out=new Map();
 for(const e of g.edges){
  if(!nodes.has(e.from)||!nodes.has(e.to)||!e.action?.type)throw Error('invalid edge');
  if(!out.has(e.from))out.set(e.from,[]);
  out.get(e.from).push(e);
 }
 const parents=new Map([[0,null]]),queue=[0];
 for(let i=0;i<queue.length;i++){
  const from=queue[i];
  for(const e of out.get(from)||[]){
   if(['research','repeatResearch'].includes(e.action.type)&&!nodes.get(from).availableResearch.includes(e.action.id))throw Error('illegal lab edge');
   if(!parents.has(e.to)){parents.set(e.to,e);queue.push(e.to);}
  }
 }
 if(queue.length!==nodes.size)throw Error('unreachable graph state');
 function witness(id){
  const edges=[];let cursor=id;
  while(cursor!==0){const e=parents.get(cursor);edges.push(e);cursor=e.from;}
  edges.reverse();
  return {file,state:id,stateHash:nodes.get(id).stateHash,difficulty:g.difficulty,regions:g.regions,countries:g.countries,scope:g.scope,excluded:g.excluded||[],conditional:edges.some(e=>e.conditional||e.action.assumeOutcome||e.action.assumeAvailability),steps:edges.map(e=>({action:e.action,added:e.added||[],conditional:!!e.conditional})),status:'bounded-model',gameCertified:false};
 }
 return {file,find(ids){
  if(!Array.isArray(ids)||!ids.length||ids.some(id=>typeof id!=='string'||!id))return null;
  for(const id of queue){const n=nodes.get(id);if(ids.every(k=>n.completed.includes(k)&&!n.disabled.includes(k)))return witness(id);}
  return null;
 }};
}
export async function loadForwardEvidence(base=new URL('./data/',import.meta.url)){
 const results=await Promise.allSettled(FILES.map(async file=>{
  const r=await fetch(new URL(file,base));if(!r.ok)throw Error(file+': HTTP '+r.status);
  return indexGraph(await r.json(),file);
 }));
 const graphs=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
 const errors=results.filter(r=>r.status==='rejected').map(r=>String(r.reason));
 return {errors,loaded:graphs.length,find(ids){
  const candidates=graphs.map(g=>g.find(ids)).filter(Boolean).sort((a,b)=>Number(a.conditional)-Number(b.conditional)||a.steps.length-b.steps.length);
  return candidates[0]||null;
 }};
}
export function renderForwardEvidence(host,evidence,ids){
 const add=(tag,s,parent=host)=>{const el=document.createElement(tag);el.textContent=s;parent.append(el);return el;};
 host.replaceChildren();
 add('strong','캠페인 시작 기준 정방향 연구');
 if(!ids.length){add('p','명시적 연구 목표 없음. 실제 획득 가능성은 별도 확인 필요.');return;}
 const w=evidence.find(ids);
 if(!w){add('p',evidence.loaded?'현재 생산 그래프에서 공동 도달 미확인 (불가능을 의미하지 않음).':'정방향 자료 로딩 실패.');}
 else{
  add('p','제한 모델 도달 · 실제 게임 미인증'+(w.conditional?' · 조건부 행동 포함':'')+' · 행동 '+w.steps.length+'단계');
  add('p',[w.file,'상태 '+w.state,'난이도 '+w.difficulty,...(w.regions||[]),...(w.countries||[])].join(' / '));
  const list=add('ol','');
  for(const s of w.steps){const a=s.action;add('li',[a.type,a.id||a.research||a.recipe||a.item||a.event||'',s.added.length?'완료: '+s.added.join(', '):'',s.conditional?'조건부':''].filter(Boolean).join(' · '),list);}
  add('p','연구 시간, 경제 및 이벤트 스케줄 등 모델 제한: '+w.excluded.join('; '));
 }
 if(evidence.errors.length)add('p','일부 그래프 로딩 실패: '+evidence.errors.length+'개');
}
