'use strict';
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..'),port=Number(process.env.R36KQ_PORT||9400);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.glb':'model/gltf-binary','.png':'image/png','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8'};
http.createServer((req,res)=>{try{
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
 const requestPath=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname),file=path.resolve(root,'.'+requestPath);
 if(!file.startsWith(root+path.sep))throw Error('unsafe path');
 const st=fs.statSync(file);if(!st.isFile())throw Error('not a file');
 res.writeHead(200,{'Content-Type':types[path.extname(file).toLowerCase()]||'application/octet-stream','Content-Length':st.size,'Cache-Control':'no-store'});
 if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end(e.message);}
}).listen(port,'127.0.0.1',()=>console.log('R36KQ review http://127.0.0.1:'+port+'/r36kq/preview/index.html'));
