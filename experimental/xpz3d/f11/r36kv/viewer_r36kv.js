import * as THREE from './viewer_deps/node_modules/three/build/three.module.js';
import {GLTFLoader} from './viewer_deps/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {OrbitControls} from './viewer_deps/node_modules/three/examples/jsm/controls/OrbitControls.js';
const $=id=>document.getElementById(id),loader=new GLTFLoader(),camera=new THREE.PerspectiveCamera(32,1,.01,100);
const errors=[];window.VIEWER_ERRORS=errors;window.addEventListener('error',e=>errors.push(e.message));
const panes=['before','after'].map(id=>{
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;renderer.setClearColor(0x17222a);$(id).appendChild(renderer.domElement);
 const scene=new THREE.Scene();scene.add(new THREE.AmbientLight(0xffffff,.48));
 const key=new THREE.DirectionalLight(0xffffff,1.25);key.position.set(-2,3,4);scene.add(key);
 const fill=new THREE.DirectionalLight(0xc8deef,.22);fill.position.set(3,1,-2);scene.add(fill);
 return {id,renderer,scene,key,model:null};
});
const controls=new OrbitControls(camera,panes[0].renderer.domElement);controls.enableDamping=true;controls.minDistance=.18;controls.maxDistance=7;
let models={},height=2,current='1024';const stats={};
function decode(s){const a=atob(s),b=new Uint8Array(a.length);for(let i=0;i<a.length;i++)b[i]=a.charCodeAt(i);return b.buffer;}
async function load(name){
 const gltf=await new Promise((resolve,reject)=>loader.parse(decode(window.MODEL_DATA[name]),'',resolve,reject));
 const root=gltf.scene;root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root),center=box.getCenter(new THREE.Vector3());root.position.x-=center.x;root.position.y-=box.min.y;root.position.z-=center.z;root.updateMatrixWorld(true);
 let vertices=0,triangles=0,bones=0;
 root.traverse(o=>{if(o.isBone){o.userData.restQuaternion=o.quaternion.clone();bones++;}
 if(o.isMesh){o.frustumCulled=false;vertices+=o.geometry.attributes.position.count;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
 for(const m of Array.isArray(o.material)?o.material:[o.material])if(!m.userData.saved)m.userData.saved={roughnessMap:m.roughnessMap,roughness:m.roughness,normal:m.normalScale.clone()};}});
 stats[name]={vertices,triangles,bones};models[name]=root;return root;
}
function mount(pane,root){if(pane.model)pane.scene.remove(pane.model);pane.model=root;pane.scene.add(root);}
function pose(){const arm=+$('arm').value,leg=+$('leg').value;
 for(const root of Object.values(models))root.traverse(o=>{if(!o.isBone||!o.userData.restQuaternion)return;o.quaternion.copy(o.userData.restQuaternion);const angles={R_UArm:-arm,L_UArm:arm,L_Thigh:-leg,R_Thigh:leg};if(o.name in angles)o.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),THREE.MathUtils.degToRad(angles[o.name])));});
 $('poseText').textContent=`팔 ${arm}° / 다리 ${leg}°`;
}
function appearance(){const on=$('detail').checked,wire=$('wire').checked,mode=$('mode').value;
 for(const root of Object.values(models))root.traverse(o=>{if(!o.isMesh)return;if(!o.userData.pbr)o.userData.pbr=o.material;const orig=o.userData.pbr,mats=Array.isArray(orig)?orig:[orig];
 for(const m of mats){m.wireframe=wire;if(m.userData.R36KU){const s=m.userData.saved;m.normalScale.copy(on?s.normal:new THREE.Vector2(0,0));m.roughnessMap=on?s.roughnessMap:null;m.roughness=on?s.roughness:.9;m.needsUpdate=true;}}
 if(mode==='albedo'){if(!o.userData.albedo)o.userData.albedo=mats.map(m=>new THREE.MeshBasicMaterial({color:m.color,map:m.map,vertexColors:m.vertexColors,side:m.side}));for(const m of o.userData.albedo)m.wireframe=wire;o.material=Array.isArray(orig)?o.userData.albedo:o.userData.albedo[0];}else o.material=orig;});
}
function view(preset){const opt={full:{t:[0,height*.5,0],p:[0,height*.54,4.5]},head:{t:[0,height*.875,.025],p:[.12,height*.89,.63]},arm:{t:[-.50,height*.70,.01],p:[-.57,height*.76,.76]}};const v=opt[preset]||opt.head;camera.position.fromArray(v.p);controls.target.fromArray(v.t);controls.update();$('preset').value=preset;}
window.setView=view;
function resize(){for(const p of panes){const e=$(p.id);p.renderer.setSize(e.clientWidth,e.clientHeight,false);}const e=$('before');camera.aspect=e.clientWidth/e.clientHeight;camera.updateProjectionMatrix();}
function draw(){const az=+$('light').value*Math.PI/180;for(const p of panes){p.key.position.set(Math.sin(az)*3,2.5,Math.cos(az)*3);p.renderer.render(p.scene,camera);}}
function loop(){requestAnimationFrame(loop);controls.update();draw();}
function selection(){current=$('resolution').value;mount(panes[1],models[current]);$('afterLabel').textContent=`R36KV · ${current} · ${stats[current].vertices.toLocaleString()} 정점`;pose();appearance();}
$('preset').onchange=e=>view(e.target.value);$('arm').oninput=pose;$('leg').oninput=pose;for(const id of ['detail','wire','mode'])$(id).onchange=appearance;$('resolution').onchange=selection;window.addEventListener('resize',resize);
// Read actual WebGL pixel buffers for comparison, excluding HTML label overlays.
window.measurePixels=()=>{draw();const a=panes[0].renderer,b=panes[1].renderer;const w=a.domElement.width,h=a.domElement.height;if(w!==b.domElement.width||h!==b.domElement.height)throw Error('Unequal canvas dimensions');const x=new Uint8Array(w*h*4),y=new Uint8Array(x.length);a.getContext().readPixels(0,0,w,h,6408,5121,x);b.getContext().readPixels(0,0,w,h,6408,5121,y);let total=0,max=0,changed=0;for(let i=0;i<x.length;i+=4){let d=0;for(let j=0;j<3;j++){const z=Math.abs(x[i+j]-y[i+j]);total+=z;max=Math.max(max,z);d+=z;}if(d)changed++;}return {width:w,height:h,meanAbsoluteRGB:total/(w*h*3),maxChannelDifference:max,differentPixels:changed,totalPixels:w*h};};
Promise.all(['before','1024','512'].map(load)).then(()=>{mount(panes[0],models.before);mount(panes[1],models['1024']);height=new THREE.Box3().setFromObject(models.before).getSize(new THREE.Vector3()).y;pose();appearance();resize();view('head');selection();$('status').textContent='내장 GLB 3개 로드 완료 · 카메라·조명 동기화';window.MODEL_REPORT={before:'R36KU',after:'R36KV',stats};window.TEST_READY=true;loop();}).catch(e=>{errors.push(e.stack||String(e));$('status').textContent='로딩 실패: '+e.message;console.error(e);});
