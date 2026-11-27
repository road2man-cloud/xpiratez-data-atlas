'use strict';
const fs=require('fs'),path=require('path'),http=require('http');
const root=path.resolve(__dirname,'..'),port=Number(process.env.R36KP_SKINLAB_PORT||9403);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8','.glb':'model/gltf-binary','.png':'image/png','.json':'application/json; charset=utf-8'};
http.createServer((req,res)=>{try{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
 const rel=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname),
       filename=path.resolve(root,'.'+rel);
 if(!filename.startsWith(root+path.sep))throw Error('path denied');
 const stat=fs.statSync(filename);if(!stat.isFile())throw Error('not found');
 res.writeHead(200,{'Content-Type':types[path.extname(filename).toLowerCase()]||'application/octet-stream',
  'Content-Length':stat.size,'Cache-Control':'no-store'});
 if(req.method==='HEAD')res.end();else fs.createReadStream(filename).pipe(res);
 }catch(e){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end(e.message);}
}).listen(port,'127.0.0.1',()=>console.log('R36KP pelvis lab: http://127.0.0.1:'+port+'/r36kp-pelvis-skinlab-20261128/preview/index.html'));
