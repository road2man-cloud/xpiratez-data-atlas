'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../../..');
const entry='/experimental/xpz3d/f11/r36le-seamsafe-20261128/preview/index.html';
const port=Number(process.env.PORT)||9407;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.glb':'model/gltf-binary','.png':'image/png','.json':'application/json'};
http.createServer((req,res)=>{
 try{
  const uri=decodeURIComponent((req.url||'/').split('?')[0]);
  const file=path.resolve(root,'.'+(uri==='/'?entry:uri));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('Not found');return;}
  const ct=path.basename(file).includes('.glb.part')?'application/octet-stream':(types[path.extname(file)]||'application/octet-stream');
  res.writeHead(200,{'Content-Type':ct,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
  fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(400);res.end('Bad request');}
}).listen(port,'127.0.0.1',()=>console.log('R36LE http://127.0.0.1:'+port+entry));