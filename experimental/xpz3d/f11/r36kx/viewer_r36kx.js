import * as THREE from './viewer_deps/node_modules/three/build/three.module.js';
import {GLTFLoader} from './viewer_deps/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {OrbitControls} from './viewer_deps/node_modules/three/examples/jsm/controls/OrbitControls.js';
const $=id=>document.getElementById(id),loader=new GLTFLoader(),errors=[];
window.VIEWER_ERRORS=errors;window.addEventListener('error',e=>errors.push(e.message));
const camera=new THREE.PerspectiveCamera(32,1,.01,100),models={};
const panes=['before','after'].map(id=>{
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.NoToneMapping;renderer.setClearColor(0x17222a);$(id).appendChild(renderer.domElement);
 const scene=new THREE.Scene();scene.add(new THREE.AmbientLight(0xffffff,.48));
 const key=new THREE.DirectionalLight(0xffffff,1.25);scene.add(key);
 const fill=new THREE.DirectionalLight(0xc8deef,.22);fill.position.set(3,1,-2);scene.add(fill);
 return {id,renderer,scene,key,model:null};
});
const controls=new OrbitControls(camera,panes[0].renderer.domElement);controls.enableDamping=false;controls.minDistance=.12;controls.maxDistance=16;
let height=2,current='1024';
function decode(s){const a=atob(s),b=new Uint8Array(a.length);for(let i=0;i<a.length;i++)b[i]=a.charCodeAt(i);return b.buffer;}
async function load(name){
 const gltf=await new Promise((resolve,reject)=>loader.parse(decode(window.MODEL_DATA[name]),'',resolve,reject));
 const root=gltf.scene;root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root),center=box.getCenter(new THREE.Vector3());
 root.position.x-=center.x;root.position.y-=box.min.y;root.position.z-=center.z;root.updateMatrixWorld(true);
 root.traverse(o=>{
  if(o.isBone)o.userData.rest=o.quaternion.clone();
  if(o.isMesh){o.frustumCulled=false;o.userData.originalMaterial=o.material;
   for(const m of Array.isArray(o.material)?o.material:[o.material]){
    if(!m.userData.originalNormalScale)m.userData.originalNormalScale=m.normalScale.clone();
    if(m.normalMap&&!m.normalMap.userData.originalMin)m.normalMap.userData.originalMin=m.normalMap.minFilter;
   }
  }
 });models[name]=root;return root;
}
function stats(root){let vertices=0,triangles=0,primitives=0,bones=0;const textures=new Set();root.traverse(o=>{
 if(o.isMesh){vertices+=o.geometry.attributes.position.count;triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;primitives++;if(o.skeleton)bones=Math.max(bones,o.skeleton.bones.length);
 for(const m of Array.isArray(o.material)?o.material:[o.material])for(const k of ['map','normalMap','roughnessMap','metalnessMap','aoMap'])if(m[k])textures.add(m[k]);}
 });return {vertices,triangles,primitives,bones,textureObjects:textures.size};}
function mount(pane,root){if(pane.model)pane.scene.remove(pane.model);pane.model=root;pane.scene.add(root);}
function pose(){const arm=+$('arm').value,leg=+$('leg').value;for(const root of Object.values(models))root.traverse(o=>{
 if(!o.isBone||!o.userData.rest)return;const a={R_UArm:-arm,L_UArm:arm,L_Thigh:-leg,R_Thigh:leg};o.quaternion.copy(o.userData.rest);
 if(o.name in a)o.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),THREE.MathUtils.degToRad(a[o.name])));
 });$('poseText').textContent=`팔 ${arm}° / 다리 ${leg}°`;}
function appearance(){const on=$('normal').checked,wire=$('wire').checked,albedo=$('mode').value==='albedo',baseOnly=$('sampling').value==='base';
 for(const root of Object.values(models))root.traverse(o=>{if(!o.isMesh)return;const orig=o.userData.originalMaterial,mats=Array.isArray(orig)?orig:[orig];
  for(const m of mats){m.wireframe=wire;m.normalScale.copy(on?m.userData.originalNormalScale:new THREE.Vector2(0,0));
   if(m.normalMap){const filter=baseOnly?THREE.LinearFilter:m.normalMap.userData.originalMin;if(m.normalMap.minFilter!==filter){m.normalMap.minFilter=filter;m.normalMap.needsUpdate=true;}}
  }
  if(albedo){if(!o.userData.albedo)o.userData.albedo=mats.map(m=>new THREE.MeshBasicMaterial({color:m.color,map:m.map,vertexColors:m.vertexColors,side:m.side}));
   for(const m of o.userData.albedo)m.wireframe=wire;o.material=Array.isArray(orig)?o.userData.albedo:o.userData.albedo[0];
  }else o.material=orig;
 });}
function view(preset){const views={
 head:{t:[0,height*.875,.025],p:[.12,height*.89,.63]},feet:{t:[0,.18,.01],p:[.15,.26,1.15]},
 full:{t:[0,height*.50,0],p:[0,height*.54,4.5]},back:{t:[0,height*.50,0],p:[0,height*.54,-4.5]},
 far:{t:[0,height*.50,0],p:[0,height*.54,10]}};const v=views[preset]||views.head;camera.position.fromArray(v.p);controls.target.fromArray(v.t);controls.update();$('preset').value=preset;}
function sync(){current=$('resolution').value;mount(panes[0],models['before'+current]);mount(panes[1],models['after'+current]);
 $('beforeLabel').textContent=`R36KW · ${current}`;$('afterLabel').textContent=`R36KX · ${current}`;
 const r=window.BUILD_REPORTS[current];$('savings').textContent=`노멀 이미지 면적 ${r.affectedNormalAreaReductionPercent.toFixed(2)}% 감소 · RGBA8/밉 제외 계산 ${(r.savedRGBA8BytesNoMips/1048576).toFixed(3)} MiB 절약`;
 pose();appearance();}
function resize(){for(const p of panes)p.renderer.setSize($(p.id).clientWidth,$(p.id).clientHeight,false);camera.aspect=$('before').clientWidth/$('before').clientHeight;camera.updateProjectionMatrix();}
function render(){requestAnimationFrame(render);controls.update();const az=+$('light').value*Math.PI/180;for(const p of panes){p.key.position.set(Math.sin(az)*3,2.5,Math.cos(az)*3);p.renderer.render(p.scene,camera);}}
function exportModel(){const key='after'+current,blob=new Blob([decode(window.MODEL_DATA[key])],{type:'model/gltf-binary'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`R36KX_F11_COMPACT_NORMAL_${current}_2100TRI.glb`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
$('resolution').onchange=sync;$('preset').onchange=e=>view(e.target.value);$('arm').oninput=pose;$('leg').oninput=pose;
for(const id of ['normal','wire','mode','sampling'])$(id).onchange=appearance;$('export').onclick=exportModel;
window.addEventListener('resize',resize);window.setView=view;
Promise.all(['before1024','before512','after1024','after512'].map(load)).then(()=>{
 height=new THREE.Box3().setFromObject(models.before1024).getSize(new THREE.Vector3()).y;sync();resize();view('head');
 $('status').textContent='GLB 4개 로드 완료 · 외부 연결 없음 · WebGL2 비교 렌더';window.MODEL_REPORT={before:'R36KW',after:'R36KX',stats:Object.fromEntries(Object.entries(models).map(([k,v])=>[k,stats(v)])),webgl2:panes.every(p=>p.renderer.getContext() instanceof WebGL2RenderingContext)};
 window.TEST_READY=true;render();
}).catch(e=>{errors.push(String(e));$('status').textContent='로딩 실패: '+e.message;console.error(e);});
