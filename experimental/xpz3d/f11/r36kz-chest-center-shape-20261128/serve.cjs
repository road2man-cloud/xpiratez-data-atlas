'use strict';
const fs=require('fs'),path=require('path'),http=require('http');
const root=path.resolve(__dirname,'..'),port=Number(process.env.R36KZ_PORT||9408);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.mjs':'text/javascript; charset=utf-8','.png':'image/png','.glb':'model/gltf-binary',
 '.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8'};
http.createServer((req,res)=>{try{
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
 const name=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
 const file=path.resolve(root,'.'+name);
 if(!file.startsWith(root+path.sep))throw Error('unsafe file');
 const stat=fs.statSync(file);if(!stat.isFile())throw Error('not file');
 res.writeHead(200,{'Content-Type':types[path.extname(file).toLowerCase()]||'application/octet-stream',
 'Content-Length':stat.size,'Cache-Control':'no-store'});
 if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(404);res.end(e.message);}
}).listen(port,'127.0.0.1',()=>console.log('R36KZ dashboard http://127.0.0.1:'+port+'/r36kz-chest-center-shape-20261128/preview/index.html'));
