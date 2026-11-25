// Player-facing 2.1 search. Source indexes stay canonical; no duplicated values.
export const kinds={soldier:'병종',origin:'출생처',training:'시술·훈련',bonus:'특성·보너스',research:'연구',item:'아이템',manufacture:'제조'};
export const sources=[
 {key:'soldiers',file:'soldiers-modern-index',compressed:true,kindList:['soldier','origin','training','bonus']},
 {key:'research',file:'research-v2-index',kindList:['research']},
 {key:'item',file:'items-v2-index',kindList:['item']},
 {key:'manufacture',file:'manufacture-v2-index',kindList:['manufacture']}
];
export const normalize=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('ko-KR').trim();
const compact=value=>normalize(value).replace(/[\s_:\-·]/g,'');
const arr=(value)=>Array.isArray(value)?value:[];
export function toRecords(key,data){
 const expected=key==='soldiers'?data.meta?.mod?.version:data.meta?.sourceVersion;
 if(expected!=='v.o2')throw Error('2.1 버전이 아닌 데이터');
 const make=(kind,row,extra={})=>({
  kind,id:row.id,name:row.koName||row.enName||row.id,en:row.enName||'',ko:row.koName||'',
  refs:[],...extra
 });
 const refs=(kind,ids)=>arr(ids).filter(id=>typeof id==='string').map(id=>({kind,id}));
 if(key==='soldiers'){
  for(const k of ['soldiers','profiles','transformations','bonuses'])if(!Array.isArray(data[k]))throw Error('누락된 '+k);
  const trainingByBonus=new Map();
  for(const t of data.transformations)if(t.soldierBonusType){
   const list=trainingByBonus.get(t.soldierBonusType)||[];list.push(t.id);trainingByBonus.set(t.soldierBonusType,list);
  }
  return [
   ...data.soldiers.map(r=>make('soldier',r,{refs:refs('research',r.requires)})),
   ...data.profiles.map(r=>make('origin',r,{name:r.sourceKoName||r.sourceEnName||r.id,en:[r.sourceEnName,r.soldierEnName].filter(Boolean).join(' · '),ko:[r.sourceKoName,r.soldierKoName].filter(Boolean).join(' · '),refs:[...refs('soldier',[r.soldierType]),...refs('research',r.requires)]})),
   ...data.transformations.map(r=>make('training',r,{refs:[...refs('research',r.requires),...refs('training',r.requiredPreviousTransformations),...refs('soldier',r.allowedSoldierTypes),...refs('bonus',[r.soldierBonusType])]})),
   ...data.bonuses.map(r=>make('bonus',r,{stats:r.stats,refs:refs('training',trainingByBonus.get(r.id))}))
  ];
 }
 const rows=key==='item'?data.items:data.entries;
 if(!Array.isArray(rows))throw Error('목록 누락');
 return rows.map(r=>make(key,r,{refs:[
  ...refs('research',r.links?.prerequisiteResearch),
  ...refs('research',r.links?.unlockedByResearch),
  ...refs('manufacture',r.links?.manufactureUnlocked),
  ...refs('item',r.links?.requiredItems),
  ...refs('item',r.links?.producedItems),
  ...refs('item',r.links?.directlyNamedItems)
 ]}));
}
export function target(record){
 const id=encodeURIComponent(record.id);
 switch(record.kind){
  case 'soldier':return 'soldiers/modern/?q='+id+'#originMaxima';
  case 'origin':return 'soldiers/modern/?profile='+id+'&group=origin#originMaxima';
  case 'training':return 'soldiers/modern/?training='+id;
  case 'research':return 'research-v2/?id='+id;
  case 'item':return 'items-v2/?id='+id;
  case 'manufacture':return 'manufacture-v2/?id='+id;
  default:return null;
 }
}
export function find(records,query,kind=''){
 const q=normalize(query), cq=compact(q), tokens=q.split(/\s+/).filter(Boolean);
 if(!cq)return [];
 const scored=[];
 for(const r of records){
  if(kind&&r.kind!==kind)continue;
  const fields=[r.id,r.name,r.en,r.ko].map(normalize);
  const combined=fields.join(' '), cs=compact(combined);
  if(!tokens.every(t=>combined.includes(t)||cs.includes(compact(t))))continue;
  let score=10;
  if(fields[0]===q)score=100;
  else if(fields.slice(1).some(s=>s===q))score=90;
  else if(fields.some(s=>compact(s)===cq))score=80;
  else if(fields.slice(1).some(s=>s.startsWith(q)))score=60;
  else if(fields.some(s=>s.includes(q)))score=40;
  scored.push({r,score});
 }
 return scored.sort((a,b)=>b.score-a.score||a.r.name.localeCompare(b.r.name,'ko')||a.r.kind.localeCompare(b.r.kind)||a.r.id.localeCompare(b.r.id)).map(x=>x.r);
}
export function related(record,byKey,byId){
 const seen=new Set([record.kind+':'+record.id]), out=[];
 for(const ref of [...record.refs,...(byId.get(record.id)||[])]){
  const key=ref.kind+':'+ref.id;
  if(seen.has(key))continue;seen.add(key);
  const found=byKey.get(key);
  if(found)out.push({record:found,relation:record.refs.some(x=>x.kind===ref.kind&&x.id===ref.id)?'원본 연결':'같은 내부 ID'});
 }
 return out;
}
