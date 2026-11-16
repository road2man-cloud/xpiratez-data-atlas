'use strict';
// XPZ3D F11 rev95, stable per-primitive triangle picker and nondestructive face deletion.
// Geometry is not changed until GLB export: the preview filters the same indexed faces.
(()=>{
const $=id=>document.getElementById(id);
const state={source:'',parts:[],selected:null,deleted:new Set(),undo:[],redo:[],revision:0};
function key(p,t){return String(p)+':'+String(t);}
function record(){state.undo.push(new Set(state.deleted));if(state.undo.length>150)state.undo.shift();state.redo.length=0;}
function parseEntry(input){
 if(!input||typeof input!=='object')return null;
 const p=Number(input.primitive),t=Number(input.triangle??input.face);
 if(!Number.isInteger(p)||!Number.isInteger(t)||p<0||t<0)return null;
 const part=state.parts.find(v=>v.primitiveIndex===p);
 if(!part||t>=part.sourceIndices.length/3)return null;
 return {primitive:p,triangle:t,vertices:Array.from(part.sourceIndices.slice(t*3,t*3+3)),layer:part.isGarment?'의복':part.isPatch?'중앙 패치':'피부·몸통'};
}
function label(face){return face?'프리미티브 '+face.primitive+' · 삼각형 '+face.triangle+' · 정점 ['+face.vertices.join(', ')+'] · '+face.layer:'선택한 삼각형이 없습니다';}
function list(){return [...state.deleted].sort((a,b)=>{const A=a.split(':').map(Number),B=b.split(':').map(Number);return A[0]-B[0]||A[1]-B[1];}).map(x=>{const [primitive,triangle]=x.split(':').map(Number);return parseEntry({primitive,triangle});}).filter(Boolean);}
function changed(){state.revision++;update();document.dispatchEvent(new CustomEvent('xpz-polygon-change',{detail:{revision:state.revision,deleted:state.deleted.size}}));}
function bind(parts,source){
 const same=state.source===source && state.parts.length===parts.length;
 state.parts=parts;state.source=source||'';
 if(!same){state.deleted.clear();state.selected=null;state.undo=[];state.redo=[];}
 changed();
}
function select(input){
 const next=parseEntry(input);if(!next){state.selected=null;changed();return false;}
 if(state.deleted.has(key(next.primitive,next.triangle))){state.selected=null;changed();return false;}
 state.selected=next;changed();
 if($('polyDeleteImmediately')?.checked)remove();
 return true;
}
function remove(){
 const p=state.selected;if(!p)return false;
 const id=key(p.primitive,p.triangle);if(state.deleted.has(id))return false;
 record();state.deleted.add(id);state.selected=null;changed();return true;
}
function restore(p,t){
 const id=key(p,t);if(!state.deleted.has(id))return false;
 record();state.deleted.delete(id);changed();return true;
}
function restoreAll(){
 if(!state.deleted.size)return false;
 if(!window.confirm('삭제 표시된 '+state.deleted.size+'개 면을 모두 복원하시겠습니까?'))return false;
 record();state.deleted.clear();state.selected=null;changed();return true;
}
function undo(){if(!state.undo.length)return false;state.redo.push(new Set(state.deleted));state.deleted=state.undo.pop();state.selected=null;changed();return true;}
function redo(){if(!state.redo.length)return false;state.undo.push(new Set(state.deleted));state.deleted=state.redo.pop();state.selected=null;changed();return true;}
function isDeleted(primitive,triangle){return state.deleted.has(key(primitive,triangle));}
function filteredIndices(primitive,indices){
 if(!state.deleted.size)return Array.from(indices);
 const kept=[];for(let t=0;t<indices.length/3;t++)if(!isDeleted(primitive,t))kept.push(indices[t*3],indices[t*3+1],indices[t*3+2]);return kept;
}
function snapshot(){return {sourceGLB:state.source,deletedFaces:list().map(({primitive,triangle,vertices,layer})=>({primitive,triangle,vertices,layer})),deletionCount:state.deleted.size};}
function loadState(data){
 const entries=data?.deletedFaces||[];
 if(!Array.isArray(entries))throw Error('deletedFaces 배열이 아닙니다');
 if(entries.length && data.sourceGLB && data.sourceGLB!==state.source)throw Error('면 삭제 정보의 원본 GLB가 현재 모델과 다릅니다. 먼저 모델 선택을 맞춰주세요.');
 const next=new Set();for(const item of entries){const p=parseEntry(item);if(!p)throw Error('삭제 목록에 현재 모델에 없는 삼각형이 있습니다');if(Array.isArray(item.vertices)&&p.vertices.join(',')!==item.vertices.join(','))throw Error('선택한 삼각형의 정점 ID가 저장된 JSON과 다릅니다');next.add(key(p.primitive,p.triangle));}
 record();state.deleted=next;state.selected=null;changed();return state.deleted.size;
}
function update(){
 const selection=$('polySelected');if(selection)selection.textContent=label(state.selected);
 const summary=$('polyStatus');if(summary){
 const all=state.parts.reduce((n,p)=>n+p.sourceIndices.length/3,0);
 summary.textContent='삭제 지정 '+state.deleted.size+'면 / 원본 '+all+'면 · 현재 '+(all-state.deleted.size)+'면 · 원본 GLB 보존';
 }
 for(const [id,enabled] of [['polyDelete',!!state.selected],['polyUndo',state.undo.length>0],['polyRedo',state.redo.length>0],['polyClear',state.deleted.size>0],['polyFocus',!!state.selected]]){const e=$(id);if(e)e.disabled=!enabled;}
 const panel=$('polyDeletedList');if(panel){
 panel.replaceChildren();const arr=list().slice(-36).reverse();
 for(const item of arr){const button=document.createElement('button');button.type='button';button.textContent='↶ '+item.primitive+':'+item.triangle;button.title='이 삼각형만 복원';button.addEventListener('click',()=>restore(item.primitive,item.triangle));panel.append(button);}
 if(state.deleted.size>36){const more=document.createElement('small');more.textContent='표시: 최근 36개 / 전체 '+state.deleted.size+'개';panel.append(more);}
 }
 const viewer=window.XPZEditorBridge?.getModel?.();
 if(viewer?.meta&&$('metaAfter')){
 const all=viewer.meta.tris;$('metaAfter').textContent=(all-state.deleted.size).toLocaleString()+' Tri 표시 · '+all.toLocaleString()+' Tri 원본 · '+viewer.meta.bones+' Bones';
 }
}
function install(){
 $('polyDelete')?.addEventListener('click',remove);
 $('polyUndo')?.addEventListener('click',undo);
 $('polyRedo')?.addEventListener('click',redo);
 $('polyClear')?.addEventListener('click',restoreAll);
 $('polyFocus')?.addEventListener('click',()=>{if(state.selected)window.XPZEditorBridge?.focusFace?.(state.selected);});
 document.addEventListener('keydown',e=>{
   if(!(e.key==='Delete'||e.key==='Backspace'))return;
   if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
   if($('polyPickMode')?.checked && state.selected){e.preventDefault();remove();}
 });
 update();
}
window.XPZPolygon={state,bind,select,remove,restore,restoreAll,undo,redo,isDeleted,filteredIndices,snapshot,loadState,update};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();