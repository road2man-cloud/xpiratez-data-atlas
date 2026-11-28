// Shared forward evidence reader. Never merge completed research from distinct states.
export const ROOT_RESEARCH=['STR_INSPECT_MACHINERY','STR_JACKSTOWN_SCOUTING','STR_RECRUIT_PEASANTS','STR_WAT_DO'];
export const SOURCE='a16408dc92af6f7377511843533c12749fbb43c79508b8c194f9680ca49c751e';
export const FILES=['campaign-forward-tree-v2-japan-d4.json','campaign-forward-tree-v6-hybrid-synced-d7.json','campaign-forward-tree-v7-hybrid-awards-d20.json','campaign-forward-tree-v8-supply-d9.json'];
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
 const isConditional=e=>!!(e.conditional||e.action.assumeOutcome||e.action.assumeAvailability||e.action.assumeTransport||e.action.assumeRecovery);
 // Every edge must respect the source state's lab menu, including alternate parents.
 for(const e of g.edges)if(['research','repeatResearch'].includes(e.action.type)&&!nodes.get(e.from).availableResearch.includes(e.action.id))throw Error('illegal lab edge');
 function walk(unconditionalOnly){
  const parents=new Map([[0,null]]),queue=[0];
  for(let i=0;i<queue.length;i++)for(const e of out.get(queue[i])||[]){
   if(unconditionalOnly&&isConditional(e))continue;
   if(!parents.has(e.to)){parents.set(e.to,e);queue.push(e.to);}
  }
  return {parents,queue};
 }
 const all=walk(false),certain=walk(true);
 if(all.queue.length!==nodes.size)throw Error('unreachable graph state');
 function witness(id,last=null){
  const from=last?last.from:id;
  const parents=certain.parents.has(from)&&(!last||!isConditional(last))?certain.parents:all.parents;
  const edges=[];let cursor=from;
  while(cursor!==0){const e=parents.get(cursor);edges.push(e);cursor=e.from;}
  edges.reverse();if(last)edges.push(last);
  return {file,state:id,stateHash:nodes.get(id).stateHash,difficulty:g.difficulty,regions:g.regions,countries:g.countries,scope:g.scope,excluded:g.excluded||[],conditional:edges.some(isConditional),steps:edges.map(e=>({action:e.action,added:e.added||[],conditional:isConditional(e),itemDelta:e.itemDelta||{},fundsDelta:e.fundsDelta??null,addedFunctions:e.addedFunctions||[]})),status:'bounded-model',gameCertified:false};
 }
 function assetMatch(e,spec){
  const a=e.action,id=spec.id;
  if(spec.kind==='item'){
   if((e.itemDelta?.[id]||0)>0)return 'inventory-increase';
   if(['acquirePurchase','acquireFundedPurchase','acquireEventItems'].includes(a.type)&&a.item===id)return a.type;
   if(a.type==='missionResearch'&&a.recoverFixedItem?.item===id)return 'mission-recovery';
  }
  if(spec.kind==='recipe'&&a.type==='manufactureBundle'&&a.recipe===id)return 'manufacture-batch';
  if(spec.kind==='facility'&&a.id===id&&['buildFacility','finishFacility'].includes(a.type))return a.type;
  return null;
 }
 const sortWitness=(a,b)=>Number(a.conditional)-Number(b.conditional)||a.steps.length-b.steps.length;
 return {file,find(ids){
  if(!Array.isArray(ids)||!ids.length||ids.some(id=>typeof id!=='string'||!id))return null;
  for(const id of [...certain.queue,...all.queue]){const n=nodes.get(id);if(ids.every(k=>n.completed.includes(k)&&!n.disabled.includes(k)))return witness(id);}
  return null;
 },findAsset(spec){
  if(!spec||typeof spec.id!=='string'||!['item','recipe','facility'].includes(spec.kind))return [];
  const best=new Map();
  for(const e of g.edges){const match=assetMatch(e,spec);if(!match)continue;
   const w={...witness(e.to,e),match,asset:{kind:spec.kind,id:spec.id}};
   if(!best.has(match)||sortWitness(w,best.get(match))<0)best.set(match,w);
  }
  return [...best.values()].sort(sortWitness);
 }};
}
const sortWitness=(a,b)=>Number(a.conditional)-Number(b.conditional)||a.steps.length-b.steps.length;
let sharedPromise;
export async function loadForwardEvidence(base=new URL('./data/',import.meta.url)){
 const results=await Promise.allSettled(FILES.map(async file=>{
  const r=await fetch(new URL(file,base));if(!r.ok)throw Error(file+': HTTP '+r.status);
  return indexGraph(await r.json(),file);
 }));
 const graphs=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
 const errors=results.filter(r=>r.status==='rejected').map(r=>String(r.reason));
 return {errors,loaded:graphs.length,find(ids){
  return graphs.map(g=>g.find(ids)).filter(Boolean).sort(sortWitness)[0]||null;
 },findAsset(spec){
  const best=new Map();
  for(const w of graphs.flatMap(g=>g.findAsset(spec))){
   if(!best.has(w.match)||sortWitness(w,best.get(w.match))<0)best.set(w.match,w);
  }
  return [...best.values()].sort(sortWitness);
 }};
}
export const sharedForwardEvidence=()=>sharedPromise??=loadForwardEvidence();
const matchLabels={'inventory-increase':'재고 증가','acquirePurchase':'조건부 구매','acquireFundedPurchase':'자금 차감 구매','acquireEventItems':'이벤트 지급','mission-recovery':'임무 회수','manufacture-batch':'제조 실행','buildFacility':'건설 착수','finishFacility':'건설 완료'};
const addText=(host,tag,text)=>{const e=document.createElement(tag);e.textContent=text;host.append(e);return e;};
function renderAssetWitness(host,w){
 const box=addText(host,'details','');
 addText(box,'summary',(matchLabels[w.match]||w.match)+' · '+w.steps.length+'단계 · '+(w.conditional?'조건부 모델':'제한 모델')+' · 게임 미인증');
 addText(box,'p',[w.file,'상태 '+w.state,'난이도 '+w.difficulty,...(w.regions||[]),...(w.countries||[])].join(' / '));
 const list=addText(box,'ol','');
 for(const s of w.steps){const a=s.action;
  const delta=Object.entries(s.itemDelta).map(([id,n])=>id+' '+(n>0?'+':'')+n).join(', ');
  addText(list,'li',[a.type,a.id||a.research||a.recipe||a.item||a.event||'',s.added.length?'연구 완료 '+s.added.join(', '):'',delta?'재고 '+delta:'',s.fundsDelta?'자금 '+s.fundsDelta:'',s.conditional?'조건부':''].filter(Boolean).join(' · '));
 }
 addText(box,'p','제한: '+w.excluded.join('; '));
}
export function renderForwardAssetEvidence(host,evidence,specs,{legacy=false}={}){
 host.replaceChildren();
 addText(host,'h3','2.1 캠페인 정방향 획득 근거');
 addText(host,'p',legacy?'기존 화면의 구버전 수치와 독립된 2.1 모델의 동일 내부 ID 참조입니다. 두 버전의 규칙을 합치거나 획득 가능성을 확정하지 않습니다.':'기록된 실제 모델 행동만 표시합니다. 연구 완료, 재고 획득, 제조, 건설 완료는 서로 다른 증거입니다.');
 for(const spec of specs){
  if(!spec?.id)continue;
  const panel=addText(host,'section','');
  addText(panel,'strong',(spec.label||spec.kind)+' · '+spec.id);
  const matches=evidence.findAsset(spec);
  if(matches.length)for(const w of matches)renderAssetWitness(panel,w);
  else addText(panel,'p',evidence.loaded?'현재 생산 범위 내 해당 행동 미확인 (게임에서 불가능하다는 뜻은 아님).':'그래프 로딩 실패.');
  if(Array.isArray(spec.research)&&spec.research.length){
   const rh=addText(panel,'div','');renderForwardEvidence(rh,evidence,spec.research);
   addText(panel,'p','명시 연구의 공동 도달 여부이며 물품 획득이나 건설 인증은 아닙니다.');
  }
 }
 if(evidence.errors.length)addText(host,'p','일부 그래프 로딩 실패: '+evidence.errors.length+'개');
}
export function mountForwardAssetEvidence(host,specs,options={}){
 const old=host.querySelector(':scope > [data-forward-asset-evidence]');
 if(old)old.remove();
 const section=addText(host,'section','정방향 획득 근거 불러오는 중…');
 section.dataset.forwardAssetEvidence='1';
 section.className='section-card';
 sharedForwardEvidence().then(e=>{if(section.isConnected)renderForwardAssetEvidence(section,e,specs,options);}).catch(err=>{if(section.isConnected)section.textContent='정방향 자료 오류: '+err.message;});
 return section;
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
