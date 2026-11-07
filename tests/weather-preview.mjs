// Local QA only: proxy the development preview while simulating weather failure.
import http from 'node:http';
const server=http.createServer(async(incoming,outgoing)=>{
 try{
  if(incoming.url?.startsWith('/api/weather')){outgoing.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});outgoing.end(JSON.stringify({error:'Weather is unavailable.'}));return;}
  const url='http://127.0.0.1:5173'+incoming.url;
  const response=await fetch(url,{headers:{Accept:incoming.headers.accept??'*/*'}});
  const headers=Object.fromEntries([...response.headers].filter(([key])=>!['content-encoding','content-length','transfer-encoding'].includes(key)));
  outgoing.writeHead(response.status,headers);outgoing.end(Buffer.from(await response.arrayBuffer()));
 }catch{outgoing.writeHead(502);outgoing.end('Local QA upstream unavailable.');}
});
server.listen(5174,'127.0.0.1',()=>console.log('Weather-failure QA preview: http://127.0.0.1:5174/'));
