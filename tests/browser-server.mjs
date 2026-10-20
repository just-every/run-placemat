// Local HTTP transport for the real Worker and shipped static assets. This lets
// the browser stream attachments through its native download manager.
import {createServer} from 'node:https'
import {execFileSync} from 'node:child_process'
import {tmpdir} from 'node:os'
import {readFile,mkdtemp,rm} from 'node:fs/promises'
import {resolve,extname,join} from 'node:path'
export async function browserServer(h){
 let origin
 const certificates=await mkdtemp(join(tmpdir(),'placemat-browser-tls-'))
 const key=join(certificates,'key.pem'),cert=join(certificates,'cert.pem')
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost'],{stdio:'ignore'})
 const server=createServer({key:await readFile(key),cert:await readFile(cert)},async(req,res)=>{
  try{
   const path=new URL(req.url,'http://localhost').pathname,file=resolve('public','.'+path)
   if(file.startsWith(resolve('public')+'/')&&extname(file)){
    try{const body=await readFile(file);res.writeHead(200,{'content-type':{'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'}[extname(file)]||'application/octet-stream'});res.end(body);return}catch{}
   }
   const chunks=[];for await(const chunk of req)chunks.push(chunk)
   const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value)
   headers.set('host',new URL(h.origin).host)
   if(headers.get('origin')===origin)headers.set('origin',h.origin)
   const response=await h.mf.dispatchFetch(h.origin+req.url,{method:req.method,headers,...chunks.length?{body:Buffer.concat(chunks)}:{}})
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))
  }catch{res.writeHead(500);res.end('Browser transport failed')}
 })
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
 origin=`https://127.0.0.1:${server.address().port}`
 return {origin,async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(certificates,{recursive:true,force:true})}}
}
