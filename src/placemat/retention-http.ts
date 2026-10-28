import type {Bindings} from '../auth.server'
import {actorFor,originCheck,jsonBody,person} from './access'
import {fail,Problem} from './model'
import {hash} from './store'
import {retentionPage} from './retention-view'
import {readRetention,grantRetention,saveRetentionFacts,draftRetention,previewRetention,approveRetention,stopRetention} from './retention'
import {publicRetentionConsent,publicRetentionStatus,publicRetentionUnsubscribe} from './retention-consent'
import {captureRetentionAttribution} from './retention-mail'

export async function retentionResponse(request:Request,env:Bindings):Promise<Response|null>{
 const path=new URL(request.url).pathname,publicRoute=path.startsWith('/api/public/retention/')
 if(!publicRoute&&!['/retention','/retention/settings','/api/retention'].includes(path)&&!path.startsWith('/api/retention/'))return null
 const headers={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}
 try{
  if(path==='/retention'&&['GET','HEAD'].includes(request.method))return retentionPage(request,'public')
  if(path==='/retention/settings'){
   if(!['GET','HEAD'].includes(request.method))fail(405,'Method not allowed.')
   const actor=await actorFor(request,env)
   if(!actor)return new Response(null,{status:303,headers:{location:'/signin?returnTo=%2Fretention%2Fsettings'}})
   person(actor,true);return retentionPage(request,'settings')
  }
  if(!publicRoute&&path==='/api/retention'&&request.method==='GET'){
   const actor=await actorFor(request,env);if(!actor)fail(401,'Sign in with your personal venue account.')
   return Response.json(await readRetention(env.DB,actor!),{headers})
  }
  if(request.method!=='POST')fail(405,'Method not allowed.')
  originCheck(request,env)
  const p=await jsonBody(request)
  if(publicRoute){
   const bucket=await hash((request.headers.get('CF-Connecting-IP')??'local')+':retention:'+Math.floor(Date.now()/60000))
   const limit=await env.DB.prepare('INSERT INTO pm_public_limits(bucket,count) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket).first<{count:number}>()
   if((limit?.count??0)>60)fail(429,'Too many requests. Please wait a minute.')
   const result=path==='/api/public/retention/request'?await publicRetentionConsent(env,{email:p.email}):path==='/api/public/retention/confirm'?await publicRetentionConsent(env,{token:p.token,confirm:p.confirm===true}):path==='/api/public/retention/status'?await publicRetentionStatus(env,p):path==='/api/public/retention/unsubscribe'?await publicRetentionUnsubscribe(env,p):path==='/api/public/retention/attribution'?await captureRetentionAttribution(env.DB,p.token,p.bookingId):fail(404,'Marketing route not found.')
   return Response.json(result,{headers})
  }
  const actor=await actorFor(request,env);if(!actor)fail(401,'Sign in with your personal venue account.')
  const result=path==='/api/retention/grant'?await grantRetention(env.DB,actor!,p):path==='/api/retention/facts'?await saveRetentionFacts(env.DB,actor!,p):path==='/api/retention/draft'?await draftRetention(env.DB,actor!,p):path==='/api/retention/preview'?await previewRetention(env.DB,actor!,p):path==='/api/retention/approve'?await approveRetention(env.DB,actor!,p):path==='/api/retention/stop'?await stopRetention(env.DB,actor!,p):fail(404,'Marketing route not found.')
  return Response.json(result,{headers})
 }catch(error){return Response.json({error:error instanceof Problem?error.message:'Marketing could not be saved. Review the existing record before trying again.'},{status:error instanceof Problem?error.status:503,headers})}
}
