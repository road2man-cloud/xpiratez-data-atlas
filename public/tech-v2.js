'use strict';
(() => {
  const kind=document.body.dataset.techKind;
  if(!['research','manufacture'].includes(kind)) return;
  const $=id=>document.getElementById(id);
  const state={entries:[],limit:100,reverse:false};
  const elt=(parent,tag,text,className)=>{
    const e=document.createElement(tag);
    if(className)e.className=className;
    e.textContent=text;
    parent.appendChild(e);
    return e;
  };
  const nameOf=row=>row.koName||row.enName||row.id;
  const firstKey=kind==='research'?'cost':'cost';
  const secondKey=kind==='research'?'points':'time';
  const scalar=value=>typeof value==='number'?value.toLocaleString('ko-KR'):value===undefined?'—':String(value);
  const label=value=>value===null||value===undefined?'—':
    typeof value==='object'?JSON.stringify(value,null,2):String(value);
  const normalize=s=>String(s||'').toLocaleLowerCase('ko-KR').trim();
  const rows=()=>{
    const q=normalize($('search').value),sorted=state.entries.filter(row=>
      (!q||normalize([row.id,row.koName,row.enName].join(' ')).includes(q))&&
      (!$('has-ko').checked||!!row.koName));
    const sort=$('sort').value;
    sorted.sort((a,b)=>{
      let n=0;
      if(sort==='name'||sort==='id')
        n=(sort==='name'?nameOf(a):a.id).localeCompare(sort==='name'?nameOf(b):b.id,'ko');
      else {
        const x=a.fields[sort], y=b.fields[sort];
        const nx=typeof x==='number',ny=typeof y==='number';
        if(nx&&ny)n=x-y;
        else if(nx!==ny)return nx?-1:1;
      }
      return (state.reverse?-n:n)||a.id.localeCompare(b.id,'en');
    });
    $('rows').replaceChildren();
    const frag=document.createDocumentFragment();
    for(const row of sorted.slice(0,state.limit)){
      const tr=document.createElement('tr');
      const name=elt(tr,'td','');
      const btn=elt(name,'button',nameOf(row),'item-name');
      btn.type='button';btn.addEventListener('click',()=>detail(row));
      elt(name,'span',row.id,'item-id');
      elt(tr,'td',scalar(row.fields[firstKey]),'num');
      elt(tr,'td',scalar(row.fields[secondKey]),'num');
      const rel=kind==='research'?row.links.prerequisiteResearch:
        row.links.requiredItems;
      elt(tr,'td',rel.length?rel.length.toLocaleString('ko-KR')+'개':'—','num');
      elt(tr,'td',row.sourceFiles.at(-1)||'—','note');
      frag.appendChild(tr);
    }
    $('rows').appendChild(frag);
    $('status').textContent='2.1 '+(kind==='research'?'연구':'제조')+' '+sorted.length.toLocaleString('ko-KR')+
      '개 / 전체 '+state.entries.length.toLocaleString('ko-KR')+'개 · '+Math.min(state.limit,sorted.length)+'개 표시';
    $('more').hidden=sorted.length<=state.limit;
  };
  const routeFor=(ref,relation)=>{
    if(relation==='prerequisiteResearch'||relation==='unlockedByResearch')return '../research-v2/?id='+encodeURIComponent(ref);
    if(relation==='manufactureUnlocked')return '../manufacture-v2/?id='+encodeURIComponent(ref);
    if(relation==='requiredItems'||relation==='producedItems'||relation==='directlyNamedItems')
      return '../items-v2/?id='+encodeURIComponent(ref);
    return null;
  };
  function detail(row){
    $('detail').hidden=false;$('detail-name').textContent=nameOf(row);
    $('detail-meta').textContent=row.id+' · 원본: '+row.sourceFiles.join(' → ')+
      ' · 영문명: '+(row.enName||'미등록');
    $('detail-fields').replaceChildren();
    for(const [key,value] of Object.entries(row.fields)){
      const tr=document.createElement('tr');elt(tr,'th',key);
      const td=elt(tr,'td','');elt(td,'pre',label(value));$('detail-fields').appendChild(tr);
    }
    $('detail-links').replaceChildren();
    for(const [relation,refs] of Object.entries(row.links)){
      if(!Array.isArray(refs)||!refs.length)continue;
      const wrap=elt($('detail-links'),'div','', 'relation');
      elt(wrap,'strong',relation+': ');
      for(const ref of refs.slice(0,100)){
        const url=routeFor(ref,relation);
        if(url) {
          const link=elt(wrap,'a',ref);
          link.href=url;link.className='link-chip';
        } else elt(wrap,'span',ref,'link-chip unresolved');
      }
      if(refs.length>100)elt(wrap,'span','외 '+(refs.length-100)+'개','note');
    }
    $('detail').scrollIntoView({behavior:'smooth',block:'start'});
  }
  const change=()=>{state.limit=100;rows();};
  $('search').addEventListener('input',change);
  $('sort').addEventListener('change',change);
  $('has-ko').addEventListener('change',change);
  $('reverse').addEventListener('click',()=>{
    state.reverse=!state.reverse;
    $('reverse').textContent=state.reverse?'내림차순':'오름차순';change();
  });
  $('more').addEventListener('click',()=>{state.limit+=100;rows();});
  $('close').addEventListener('click',()=>{$('detail').hidden=true;});
  fetch('../data/'+kind+'-v2-index.json',{cache:'no-cache'})
    .then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
    .then(data=>{
      if(data.meta?.schema!=='xpiratez-v2-mod-'+kind+'/v1'||data.meta?.sourceVersion!=='v.o2'||
        !Array.isArray(data.entries))throw new Error('X-Piratez 2.1 '+kind+' 데이터가 아닙니다');
      state.entries=data.entries;rows();
      const deep=new URL(location.href).searchParams.get('id');
      if(deep) {
        const found=state.entries.find(row=>row.id===deep);
        if(found)detail(found);
      }
    }).catch(e=>{$('status').textContent='2.1 데이터를 불러오지 못했습니다: '+e.message;});
})();
