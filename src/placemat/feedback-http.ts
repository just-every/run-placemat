import type {Bindings} from '../auth.server'
import {actorFor,originCheck,jsonBody} from './access'
import {fail,Problem} from './model'
import {hash} from './store'
import {assignFeedback,closeFeedback,publicFeedbackReply,readFeedback,readPublicFeedback,saveFeedbackSettings,submitFeedback,withdrawFeedback} from './feedback'
import {replyFeedback} from './feedback-mail'

export async function feedbackResponse(request:Request,env:Bindings):Promise<Response|null>{
 const path=new URL(request.url).pathname,publicRoute=path.startsWith('/api/public/feedback/')
 if(!publicRoute&&path!=='/api/feedback'&&!path.startsWith('/api/feedback/'))return null
 const headers={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}
 try{
  if(!publicRoute&&path==='/api/feedback'&&request.method==='GET'){
   const actor=await actorFor(request,env);if(!actor)fail(401,'Sign in with your personal venue account.')
   return Response.json(await readFeedback(env.DB,actor!),{headers})
  }
  if(request.method!=='POST')return Response.json({error:'Method not allowed.'},{status:405,headers})
  originCheck(request,env)
  const p=await jsonBody(request)
  if(publicRoute){
   const bucket=await hash((request.headers.get('CF-Connecting-IP')??'local')+':feedback:'+Math.floor(Date.now()/60000)),limit=await env.DB.prepare('INSERT INTO pm_public_limits(bucket,count) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket).first<{count:number}>()
   if((limit?.count??0)>60)fail(429,'Too many feedback requests. Please wait a minute.')
   const result=path==='/api/public/feedback/status'?await readPublicFeedback(env.DB,p):path==='/api/public/feedback/submit'?await submitFeedback(env.DB,p):path==='/api/public/feedback/reply'?await publicFeedbackReply(env.DB,p):path==='/api/public/feedback/withdraw'?await withdrawFeedback(env.DB,p):fail(404,'Feedback route not found.')
   return Response.json(result,{headers})
  }
  const actor=await actorFor(request,env);if(!actor)fail(401,'Sign in with your personal venue account.')
  const result=path==='/api/feedback/settings'?await saveFeedbackSettings(env.DB,actor!,p,env.AUTH_ORIGIN):path==='/api/feedback/reply'?await replyFeedback(env,actor!,p):path==='/api/feedback/close'?await closeFeedback(env.DB,actor!,p):path==='/api/feedback/assign'?await assignFeedback(env.DB,actor!,p):fail(404,'Feedback route not found.')
  return Response.json(result,{headers})
 }catch(error){return Response.json({error:error instanceof Problem?error.message:'Feedback could not be saved. Review the existing record before trying again.'},{status:error instanceof Problem?error.status:503,headers})}
}
