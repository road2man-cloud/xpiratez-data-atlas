'use strict';
/* R36LD: serve actual GLBs/PNG, sibling models and vendored Three.js. */
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../../../..');
const entry='/experimental/xpz3d/f11/r36ld-character-compare-20261128/preview/index.html';
const port=Number(process.env.PORT)||9406;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.glb':'model/gltf-binary','.png':'image/png','.json':'application/json'};
http.createServer((req,res)=>{
 try{
  const raw=decodeURIComponent((req.url||'/').split('?')[0]);const uri=raw==='/'?entry:raw;
  const file=path.resolve(root,'.'+uri);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('File not found');return;}
  const ct=path.basename(file).includes('.glb.part')?'application/octet-stream':(mime[path.extname(file)]||'application/octet-stream');
  res.writeHead(200,{'Content-Type':ct,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(400);res.end('Malformed URL');}
}).listen(port,'127.0.0.1',()=>console.log('R36LD http://127.0.0.1:'+port+entry));
