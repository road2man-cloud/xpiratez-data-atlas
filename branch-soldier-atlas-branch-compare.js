import {compareBranches,diffSets,unpackOptions,sameChoices} from './branch-soldier-atlas-branch-compare-core.js?v=30';
import {routeUrl,branchUrl} from './branch-soldier-atlas-career-core.js?v=29';
const root=new URL('./',import.meta.url),$=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
const fmt=n=>n.toLocaleString('ko-KR');
const link=(text,path)=>{const a=el('a',text);a.href=new URL(path,root);return a};
const search=(kind,id)=>'search/?'+new URLSearchParams({q:id,kind});
export async function loadBranchOptions(metadata){
 const response=await fetch(new URL('data/soldier-atlas-branch-options.json',root));if(!response.ok)throw Error('HTTP '+response.status);
 const packed=await response.json();
 if(packed.encoding!=='gzip-base64'||typeof DecompressionStream==='undefined')throw Error('분기 색인 압축 형식 미지원');
 const bytes=Uint8Array.from(atob(packed.payload),c=>c.charCodeAt(0));
 const raw=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
 const branches=unpackOptions(raw,metadata);if(branches.size!==packed.count)throw Error('분기 수 불일치');
 return branches;
}
export function setupBranchCompare(context){
 const params=new URLSearchParams(location.search),panel=$('branchCompare'),out=$('branchCompareOutput');
 let a=params.get('a')||params.get('branch')||'',b=params.get('b')||'',limit=15;
 let catalogue=new Map(),hasRows=new Set(),loaded=false,error='';
 if(params.has('a')||params.has('b')||location.hash==='#branchCompare')panel.open=true;
 const label=id=>context.name(id);
 const nameBranch=id=>context.branchName(id);
 const originName=id=>context.originName(id);
 const kinds={origin:'출생처',body:'최종 병종',training:'시술',trait:'측정 보유 특성'};
 const queryKind={origin:'origin',body:'soldier',training:'training',trait:'bonus',research:'research'};
 function sync(){const url=new URL(location.href);for(const [k,v] of [['a',a],['b',b]]){if(v)url.searchParams.set(k,v);else url.searchParams.delete(k)}history.replaceState(null,'',url);}
 function select(side){
  const select=$('branch'+side),q=$('branchSearch'+side).value.trim().toLocaleLowerCase('ko'),selected=side==='A'?a:b;
  const all=[...catalogue.values()].filter(x=>(side!=='B'||!$('branchSameChoices').checked||!a||sameChoices(catalogue.get(a),x))&&(!$('branchRegistered').checked||hasRows.has(x.id))&&(!q||q.split(/\s+/).every(t=>[nameBranch(x.id),x.id,x.rank,...x.captain,...Object.values(x.choices)].join(' ').toLocaleLowerCase('ko').includes(t))));
  all.sort((x,y)=>Number(hasRows.has(y.id))-Number(hasRows.has(x.id))||x.rank-y.rank);
  select.replaceChildren(new Option('분기 선택 ('+fmt(all.length)+'개 검색)', ''));
  for(const x of all.slice(0,100))select.add(new Option(nameBranch(x.id)+(hasRows.has(x.id)?' · 육성 기록 있음':''),x.id));
  if(selected&&![...select.options].some(x=>x.value===selected))select.add(new Option(nameBranch(selected),selected));
  select.value=selected;
 }
 function chips(ids,kind){
  const box=el('div',undefined,'bc-chips');
  for(const id of [...ids].sort((x,y)=>(kind==='origin'?originName(x):label(x)).localeCompare(kind==='origin'?originName(y):label(y),'ko'))){
   box.append(link(kind==='origin'?originName(id):label(id),search(queryKind[kind],id)));
  }
  if(!ids.length)box.append(el('span','현재 기록 없음','note'));
  return box;
 }
 function group(title,kind,diff){
  const d=el('details',undefined,'bc-detail');d.append(el('summary',title+' · 공통 '+diff.common.length+' / A만 '+diff.onlyA.length+' / B만 '+diff.onlyB.length));
  const grid=el('div',undefined,'bc-columns');
  for(const [label,items] of [['공통 기록',diff.common],['A에만 기록',diff.onlyA],['B에만 기록',diff.onlyB]]){
   const col=el('section');col.append(el('h4',label+' ('+items.length+')'),chips(items,kind));grid.append(col);
  }
  d.append(grid);return d;
 }
 function branchCard(side,id,rows,measured){
  const card=el('div',undefined,'bc-side');card.append(el('h3',side+' · '+nameBranch(id)),link('원본 분기 상세',branchUrl(id)));
  const b=catalogue.get(id);card.append(el('p',fmt(rows.length)+'개 조건부 육성 기록 · 특성 측정 '+fmt(measured)+'개'));
  if(b){
   card.append(el('p','조건부 연구 이력 '+fmt(b.historyCount)+'개'+(b.sourceRootConflict?' · 원천 모델 충돌 있음':''),'note'));
   if(b.blockedRoots?.length)card.append(el('p','원천 충돌 연구'),chips(b.blockedRoots,'research'));
  }else card.append(el('p','분기 메타데이터 미연결','note'));
  const url=new URL('career/',root);const f=context.filter();for(const k of ['origin','body','training','trait','difficulty','metric','stat'])if(f[k])url.searchParams.set(k,f[k]);if(f.certified)url.searchParams.set('certified','1');url.searchParams.set('branch',id);
  const a=el('a','이 분기의 육성 경로 보기');a.href=url;card.append(a);return card;
 }
 function render(){
  if(!panel.open)return;
  out.replaceChildren();
  if(error)out.append(el('p',error,'note'));
  if(!a||!b){out.append(el('p','A와 B 분기를 선택하세요. 이름·순위·내부 ID로 찾을 수 있습니다.'));return;}
  if(a===b){out.append(el('p','서로 다른 분기를 선택하세요.'));return;}
  const f=context.filter(),c=compareBranches(context.rows(),a,b,f);
  if(!loaded)out.append(el('p','육성 원장 불러오는 중입니다. 아래 결과는 현재 연결분입니다.','note'));
  const grid=el('div',undefined,'bc-columns two');grid.append(branchCard('A',a,c.left,c.measuredA),branchCard('B',b,c.right,c.measuredB));out.append(grid);
  out.append(el('p','아래 차이는 현재 필터의 등록 기록 차이이며, 한쪽에 없는 기록을 영구 포기 또는 불가능으로 판정하지 않습니다. 분기·선장 필터는 A/B 선택으로 대체합니다.','note'));
  for(const [k,title] of Object.entries(kinds))out.append(group(title,k,c.sets[k]));
  const ba=catalogue.get(a),bb=catalogue.get(b);
  if(ba&&bb){
   const picks=el('div',undefined,'compare-scroll'),table=el('table'),head=el('tr');for(const t of ['선택 항목','A','B'])head.append(el('th',t));table.append(head);
   for(const [k,title] of [['captain','선장'],['path','진로'],['cause','대의'],['queen','여왕'],['codex','코덱스']]){
    const av=k==='captain'?ba.captain:ba.choices[k]?[ba.choices[k]]:[],bv=k==='captain'?bb.captain:bb.choices[k]?[bb.choices[k]]:[];
    const different=JSON.stringify(av)!==JSON.stringify(bv),tr=el('tr');tr.append(el('th',title+(different?' · 차이':'')),el('td',av.map(label).join(' → ')||'미선택',different?'bc-changed':''),el('td',bv.map(label).join(' → ')||'미선택',different?'bc-changed':''));table.append(tr);
   }
   picks.append(table);out.append(picks);
   out.append(el('p',sameChoices(ba,bb)?'선장 외 네 가지 선택이 같습니다. 다만 개별 연구 순서와 공급·성장 가정 차이까지 통제된 인과 비교는 아닙니다.':'선장 이외의 연구 선택도 다릅니다. 능력치 차이를 선장 단독 효과로 해석할 수 없습니다.','note'));
  }
  if(Array.isArray(ba?.blockedResearch)&&Array.isArray(bb?.blockedResearch)){
   const d=el('details',undefined,'bc-detail');d.append(el('summary','분기 모델의 차단 연구 차이 · A '+ba.blockedResearch.length+' / B '+bb.blockedResearch.length));
   d.append(el('p','분기 원장의 blockedResearch 필드입니다. 모든 우회·재개방·시점 가능성을 배제한 실제 게임 영구 불가 증명은 아닙니다.','note'),group('차단 연구','research',diffSets(new Set(ba.blockedResearch),new Set(bb.blockedResearch))));out.append(d);
  }else out.append(el('p','차단 연구 메타데이터가 양쪽에 연결되지 않아 차이를 계산하지 않습니다.','note'));
  const h=el('h3','같은 출생처·최종 병종·난이도의 능력치 비교');out.append(h,el('p','공통 조건 '+fmt(c.matched.length)+'개 · A에만 등록 '+fmt(c.groupOnlyA)+'개 · B에만 등록 '+fmt(c.groupOnlyB)+'개. 각 셀은 정렬 기준에서 가장 높은 단일 등록 경로이며 서로 다른 경로의 최대값을 합치지 않습니다.','note'));
  if(!c.matched.length){out.append(el('p','동일 조건의 양쪽 기록이 아직 없습니다. 차이를 0으로 처리하지 않습니다.'));return;}
  const wrap=el('div',undefined,'compare-scroll'),table=el('table'),head=el('tr');for(const t of ['동일 조건','A 기록','B 기록','A − B'])head.append(el('th',t));table.append(head);
  for(const r of c.matched.slice(0,limit)){
   const tr=el('tr'),cell=el('td',undefined,'bc-pair');cell.append(el('strong',originName(r.origin)+' → '+label(r.body)),el('div','난이도 '+r.difficulty,'note'));tr.append(cell);
   for(const [row,value] of [[r.a,r.av],[r.b,r.bv]]){const td=el('td');td.append(link(fmt(value),routeUrl(row)),el('div',row.order.length+'회 시술','note'));tr.append(td);}
   tr.append(el('td',(r.delta>0?'+':'')+fmt(r.delta)));table.append(tr);
  }
  wrap.append(table);out.append(wrap);
  if(c.matched.length>limit){const more=el('button','동일 조건 더 보기');more.onclick=()=>{limit+=15;render()};out.append(more);}
 }
 function refreshOptions(){if(!panel.open)return;select('A');select('B');render();}
 for(const side of ['A','B']){
  $('branchSearch'+side).addEventListener('input',()=>select(side));
  $('branch'+side).addEventListener('change',e=>{if(side==='A')a=e.target.value;else b=e.target.value;if($('branchSameChoices').checked&&a&&b&&!sameChoices(catalogue.get(a),catalogue.get(b)))b='';limit=15;sync();refreshOptions();});
 }
 $('branchRegistered').addEventListener('change',refreshOptions);
 $('branchSameChoices').addEventListener('change',()=>{if($('branchSameChoices').checked&&a&&b&&!sameChoices(catalogue.get(a),catalogue.get(b)))b='';sync();refreshOptions();});
 $('branchSwap').addEventListener('click',()=>{[a,b]=[b,a];limit=15;sync();refreshOptions();});
 panel.addEventListener('toggle',()=>{if(panel.open)refreshOptions()});
 return {
  update(branches,rows,done,warning=''){catalogue=branches;hasRows=new Set(rows.map(r=>r.branch));loaded=done;error=warning;refreshOptions();},
  pick(id){if(!a||a===id)a=id;else{b=id;if($('branchSameChoices').checked&&!sameChoices(catalogue.get(a),catalogue.get(b)))$('branchSameChoices').checked=false;}panel.open=true;limit=15;sync();refreshOptions();panel.scrollIntoView({block:'start'});},
  render
 };
}
