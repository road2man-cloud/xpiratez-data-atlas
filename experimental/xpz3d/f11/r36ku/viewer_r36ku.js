import * as THREE from './viewer_deps/node_modules/three/build/three.module.js';
import {GLTFLoader} from './viewer_deps/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {OrbitControls} from './viewer_deps/node_modules/three/examples/jsm/controls/OrbitControls.js';
const $=id=>document.getElementById(id), loader=new GLTFLoader();
const camera=new THREE.PerspectiveCamera(32,1,.01,100);
const panes=['before','after'].map(id=>{
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.NoToneMapping;renderer.setClearColor(0x17222a);
 $(id).appendChild(renderer.domElement);
 const scene=new THREE.Scene();scene.add(new THREE.AmbientLight(0xffffff,.48));
 const key=new THREE.DirectionalLight(0xffffff,1.25);key.position.set(-2,3,4);scene.add(key);
 const fill=new THREE.DirectionalLight(0xc8deef,.22);fill.position.set(3,1,-2);scene.add(fill);
 return {id,renderer,scene,key,model:null};
});
const controls=new OrbitControls(camera,panes[0].renderer.domElement);controls.enableDamping=true;
controls.minDistance=.18;controls.maxDistance=7;
let models={},current='1024',height=2, errors=[];
window.addEventListener('error',e=>errors.push(e.message));window.VIEWER_ERRORS=errors;
function decode(s){const a=atob(s),b=new Uint8Array(a.length);for(let i=0;i<a.length;i++)b[i]=a.charCodeAt(i);return b.buffer;}
async function load(name){
 const gltf=await new Promise((resolve,reject)=>loader.parse(decode(window.MODEL_DATA[name]),'',resolve,reject));
 const root=gltf.scene;root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root),center=box.getCenter(new THREE.Vector3());
 root.position.x-=center.x;root.position.y-=box.min.y;root.position.z-=center.z;
 root.updateMatrixWorld(true);
 root.traverse(o=>{
  if(o.isBone)o.userData.restQuaternion=o.quaternion.clone();
  if(o.isMesh){o.frustumCulled=false;const mats=Array.isArray(o.material)?o.material:[o.material];
   for(const m of mats){if(!m.userData.savedR36KU)m.userData.savedR36KU={map:m.roughnessMap,factor:m.roughness,normal:m.normalScale.clone()};}
  }
 });
 models[name]=root;return root;
}
function mount(pane,root){if(pane.model)pane.scene.remove(pane.model);pane.model=root;pane.scene.add(root);}
function pose(){const arm=Number($('arm').value),leg=Number($('leg').value);for(const root of Object.values(models))root.traverse(o=>{
 if(!o.isBone||!o.userData.restQuaternion)return;
 const angles={R_UArm:-arm,L_UArm:arm,L_Thigh:-leg,R_Thigh:leg};
 o.quaternion.copy(o.userData.restQuaternion);
 if(o.name in angles)o.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),THREE.MathUtils.degToRad(angles[o.name])));
 });$('poseText').textContent=`팔 ${arm}° / 다리 ${leg}°`;}
function appearance(){
 const on=$('detail').checked,wire=$('wire').checked,mode=$('mode').value;
 for(const root of Object.values(models))root.traverse(o=>{if(o.isMesh){
  if(!o.userData.pbrMaterial)o.userData.pbrMaterial=o.material;
  const original=o.userData.pbrMaterial,mat=Array.isArray(original)?original:[original];
  for(const m of mat){m.wireframe=wire;if(m.userData.R36KU){const s=m.userData.savedR36KU;m.normalScale.copy(on?s.normal:new THREE.Vector2(0,0));m.roughnessMap=on?s.map:null;m.roughness=on?s.factor:.9;m.needsUpdate=true;}}
  if(mode==='albedo'){
   if(!o.userData.albedoMaterial)o.userData.albedoMaterial=mat.map(m=>new THREE.MeshBasicMaterial({color:m.color,map:m.map,vertexColors:m.vertexColors,side:m.side}));
   for(const m of o.userData.albedoMaterial)m.wireframe=wire;
   o.material=Array.isArray(original)?o.userData.albedoMaterial:o.userData.albedoMaterial[0];
  }else o.material=original;
 }});
}
function view(preset){
 const options={full:{target:[0,height*.50,0],position:[.0,height*.54,4.5]},head:{target:[0,height*.875,.025],position:[.12,height*.89,.63]},arm:{target:[-.50,height*.70,.01],position:[-.57,height*.76,.76]}};
 const v=options[preset]||options.head;camera.position.fromArray(v.position);controls.target.fromArray(v.target);controls.update();
 $('preset').value=preset;window.CURRENT_PRESET=preset;
}
window.setView=view;
function resize(){for(const p of panes){const el=$(p.id),w=el.clientWidth,h=el.clientHeight;p.renderer.setSize(w,h,false);}const e=$('before');camera.aspect=e.clientWidth/e.clientHeight;camera.updateProjectionMatrix();}
function render(){requestAnimationFrame(render);controls.update();const az=Number($('light').value)*Math.PI/180;
 for(const p of panes){p.key.position.set(Math.sin(az)*3,2.5,Math.cos(az)*3);p.renderer.render(p.scene,camera);}}
$('preset').onchange=e=>view(e.target.value);$('arm').oninput=pose;$('leg').oninput=pose;
for(const id of ['detail','wire','mode'])$(id).onchange=appearance;
$('resolution').onchange=()=>{current=$('resolution').value;mount(panes[1],models[current]);$('afterLabel').textContent=`R36KU · ${current} · 새 디테일`;pose();appearance();};
window.addEventListener('resize',resize);
Promise.all(['before','1024','512'].map(load)).then(()=>{
 mount(panes[0],models.before);mount(panes[1],models['1024']);
 height=new THREE.Box3().setFromObject(models.before).getSize(new THREE.Vector3()).y;
 pose();appearance();resize();view(new URLSearchParams(location.search).get('view')||'head');
 $('status').textContent='GLB 3개 로드 완료 · 외부 연결 없음 · 두 화면의 카메라·조명 동일';
 window.TEST_READY=true;window.MODEL_REPORT={height,before:'R36KS',after:'R36KU',triangles:2100,bones:63};render();
}).catch(e=>{$('status').textContent='로딩 실패: '+e.message;errors.push(e.stack||String(e));console.error(e);});
