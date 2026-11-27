import * as THREE from './viewer_deps/node_modules/three/build/three.module.js';
import {GLTFLoader} from './viewer_deps/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {OrbitControls} from './viewer_deps/node_modules/three/examples/jsm/controls/OrbitControls.js';
const $=id=>document.getElementById(id),loader=new GLTFLoader(),camera=new THREE.PerspectiveCamera(32,1,.01,100);
const panes=['before','after'].map(id=>{
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.NoToneMapping;renderer.setClearColor(0x17222a);$(id).appendChild(renderer.domElement);
 const scene=new THREE.Scene();scene.add(new THREE.AmbientLight(0xffffff,.48));
 const key=new THREE.DirectionalLight(0xffffff,1.25);key.position.set(-2,3,4);scene.add(key);
 const fill=new THREE.DirectionalLight(0xc8deef,.22);fill.position.set(3,1,-2);scene.add(fill);
 return {id,renderer,scene,key,model:null};
});
const controls=new OrbitControls(camera,panes[0].renderer.domElement);controls.enableDamping=true;controls.minDistance=.12;controls.maxDistance=7;
let models={},resolution='1024',height=2;const errors=[];
window.VIEWER_ERRORS=errors;window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
function decode(s){const a=atob(s),b=new Uint8Array(a.length);for(let i=0;i<a.length;i++)b[i]=a.charCodeAt(i);return b.buffer;}
async function load(name){
 const gltf=await new Promise((resolve,reject)=>loader.parse(decode(window.MODEL_DATA[name]),'',resolve,reject));
 const root=gltf.scene;root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root),c=box.getCenter(new THREE.Vector3());
 root.position.x-=c.x;root.position.y-=box.min.y;root.position.z-=c.z;root.updateMatrixWorld(true);
 root.traverse(o=>{if(o.isBone)o.userData.restQuaternion=o.quaternion.clone();
  if(o.isMesh){o.frustumCulled=false;for(const m of (Array.isArray(o.material)?o.material:[o.material]))m.userData.savedNormal=m.normalMap;}
 });models[name]=root;return root;
}
function mount(p,root){if(p.model)p.scene.remove(p.model);p.model=root;p.scene.add(root);}
function pose(){const arm=Number($('arm').value),leg=Number($('leg').value);
 for(const root of Object.values(models))root.traverse(o=>{if(!o.isBone||!o.userData.restQuaternion)return;o.quaternion.copy(o.userData.restQuaternion);
  const a={R_UArm:-arm,L_UArm:arm,L_Thigh:-leg,R_Thigh:leg};if(o.name in a)o.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),THREE.MathUtils.degToRad(a[o.name])));
 });$('poseText').textContent=`팔 ${arm}° / 다리 ${leg}°`;
}
function appearance(){
 const wire=$('wire').checked,mode=$('mode').value,on=$('normal').checked;
 for(const root of Object.values(models))root.traverse(o=>{if(!o.isMesh)return;
  if(!o.userData.pbrMaterial)o.userData.pbrMaterial=o.material;
  const original=o.userData.pbrMaterial,mats=Array.isArray(original)?original:[original];
  for(const m of mats){m.wireframe=wire;m.normalMap=on?m.userData.savedNormal:null;m.needsUpdate=true;}
  if(mode==='albedo'){
   if(!o.userData.albedoMaterial)o.userData.albedoMaterial=mats.map(m=>new THREE.MeshBasicMaterial({color:m.color,map:m.map,vertexColors:m.vertexColors,side:m.side}));
   for(const m of o.userData.albedoMaterial)m.wireframe=wire;
   o.material=Array.isArray(original)?o.userData.albedoMaterial:o.userData.albedoMaterial[0];
  }else o.material=original;
 });
}
function view(preset){
 const options={head:{target:[0,height*.89,.02],position:[.22,height*.91,.64]},full:{target:[0,height*.50,0],position:[.15,height*.53,4.5]},
  legs:{target:[0,height*.20,.025],position:[.45,height*.24,1.6]},feet:{target:[0,height*.07,.015],position:[.25,height*.17,.65]},
  back:{target:[0,height*.57,0],position:[-.45,height*.60,-3.6]}};
 const v=options[preset]||options.head;camera.position.fromArray(v.position);controls.target.fromArray(v.target);controls.update();$('preset').value=preset;window.CURRENT_PRESET=preset;
}
window.setView=view;
function stats(root){let vertices=0,triangles=0,primitives=0,bones=0;root.traverse(o=>{if(o.isMesh){vertices+=o.geometry.attributes.position.count;triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;primitives++;}if(o.isBone)bones++;});return {vertices,triangles,primitives,bones};}
function mountPair(){resolution=$('resolution').value;mount(panes[0],models['before'+resolution]);mount(panes[1],models['after'+resolution]);
 $('beforeLabel').textContent=`R36KV · ${resolution} · 기존 모델`;$('afterLabel').textContent=`R36KW · ${resolution} · 노멀 UV 보완`;
 pose();appearance();}
function resize(){for(const p of panes){const el=$(p.id);p.renderer.setSize(el.clientWidth,el.clientHeight,false);}camera.aspect=$('before').clientWidth/$('before').clientHeight;camera.updateProjectionMatrix();}
function render(){requestAnimationFrame(render);controls.update();const az=Number($('light').value)*Math.PI/180;for(const p of panes){p.key.position.set(Math.sin(az)*3,2.5,Math.cos(az)*3);p.renderer.render(p.scene,camera);}}
$('preset').onchange=e=>view(e.target.value);$('resolution').onchange=mountPair;$('arm').oninput=pose;$('leg').oninput=pose;
for(const id of ['wire','mode','normal'])$(id).onchange=appearance;window.addEventListener('resize',resize);
Promise.all(Object.keys(window.MODEL_DATA).map(load)).then(()=>{
 height=new THREE.Box3().setFromObject(models.before1024).getSize(new THREE.Vector3()).y;mountPair();resize();view('head');
 window.MODEL_REPORT={before:'R36KV',after:'R36KW',stats:Object.fromEntries(Object.entries(models).map(([k,v])=>[k,stats(v)]))};
 window.TEST_READY=true;$('status').textContent='GLB 4개 로드 완료 · 동일 해상도·카메라·조명 비교 · 외부 연결 없음';render();
}).catch(e=>{$('status').textContent='로딩 실패: '+e.message;errors.push(e.stack||String(e));console.error(e);});
