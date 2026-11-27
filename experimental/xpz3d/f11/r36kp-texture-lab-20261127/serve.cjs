'use strict';
const fs=require('fs'),http=require('http'),path=require('path');
const root=path.resolve(__dirname,'..'),port=Number(process.env.R36KP_TEXTURE_PORT||9402);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.glb':'model/gltf-binary','.json':'application/json; charset=utf-8','.md':'text/markdown; charset=utf-8'};
http.createServer((req,res)=>{try{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
 const n=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname),f=path.resolve(root,'.'+n);
 if(!f.startsWith(root+path.sep))throw Error('Path outside F11 root');
 const stat=fs.statSync(f);if(!stat.isFile())throw Error('Not a file');
 res.writeHead(200,{'Content-Type':mime[path.extname(f).toLowerCase()]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-store'});
 if(req.method==='HEAD')res.end();else fs.createReadStream(f).pipe(res);
 }catch(e){res.writeHead(404);res.end(String(e.message||e));}
}).listen(port,'127.0.0.1',()=>console.log('R36KP texture lab http://127.0.0.1:'+port+'/r36kp-texture-lab-20261127/index.html'));
