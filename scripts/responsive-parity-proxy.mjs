import {createServer} from 'node:http';
/** Test-only frozen display clock; the scene still comes from the real published API snapshot. */
export async function parityProxy(context,origin,asOf){
 const server=createServer(async(req,res)=>{
  try{
   if(req.method!=='GET'||!/^\/api\/v1\/public\/invitations\/[0-9a-f-]{36}$/.test(req.url??'')){res.writeHead(404);res.end();return;}
   const response=await fetch(new URL(req.url,origin),{signal:AbortSignal.timeout(10000)});
   res.statusCode=response.status;
   for(const key of ['content-type','cache-control','x-content-type-options'])if(response.headers.has(key))res.setHeader(key,response.headers.get(key));
   const body=await response.json();if(response.ok&&body.scene&&body.context)body.context.asOf=asOf;
   res.end(JSON.stringify(body));
  }catch{res.writeHead(503,{'Content-Type':'application/json'});res.end('{"code":"PARITY_PROXY_UNAVAILABLE"}');}
 });
 await new Promise((accept,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',accept);});
 context.extraCleanup.push(async()=>{server.closeAllConnections();await new Promise((accept,reject)=>server.close(error=>error?reject(error):accept()));});
 return `http://127.0.0.1:${server.address().port}/api/v1`;
}
