import type {Bindings} from '../../auth.server'
import {actorFor,jsonBody,originCheck,person} from '../access'
import {fail,Problem} from '../model'
import {guests} from '../store'
import {accessExport} from './access'
import {policy,savePolicy,reviewRetention} from './store'
import {correctNeed,eraseRequest,processorTask,runRetention} from './requests'
import {privacyPage} from './view'
const headers={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}
export async function privacyResponse(request:Request,env:Bindings):Promise<Response|null>{
 const url=new URL(request.url),path=url.pathname
 if(path!=='/privacy'&&path!=='/api/privacy'&&!path.startsWith('/api/privacy/'))return null
 const reply=(value:unknown,status=200)=>Response.json(value,{status,headers})
 try{
  const actor=await actorFor(request,env)??fail(401,'Sign in as the venue owner.');person(actor,true)
  if(actor.deviceId)fail(403,'Use a personal owner session.')
  if(path==='/privacy'&&request.method==='GET')return privacyPage()
  if(path==='/api/privacy'&&request.method==='GET'){
   const [people,current,requests,tasks,events]=await Promise.all([guests(env.DB),policy(env.DB),env.DB.prepare('SELECT * FROM pm_privacy_requests ORDER BY created_at DESC,id').all(),env.DB.prepare('SELECT * FROM pm_privacy_processors ORDER BY updated_at,id').all(),env.DB.prepare('SELECT * FROM pm_privacy_events ORDER BY at,id').all()])
   return reply({guests:people.map(g=>({id:g.id,name:g.name,erased:!!g.erased})),policy:current,requests:requests.results,tasks:tasks.results,events:events.results})
  }
  if(request.method!=='POST')return reply({error:'Method not allowed'},405)
  originCheck(request,env);const p=await jsonBody(request)
  if(path==='/api/privacy/policy')return reply(await savePolicy(env.DB,actor,p))
  if(path==='/api/privacy/access')return reply(await accessExport(env.DB,actor,p.guestId))
  if(path==='/api/privacy/correction')return reply(await correctNeed(env.DB,actor,p))
  if(path==='/api/privacy/erase')return reply(await eraseRequest(env.DB,actor,p))
  if(path==='/api/privacy/processors')return reply(await processorTask(env.DB,actor,p))
  if(path==='/api/privacy/retention-preview')return reply(await reviewRetention(env.DB))
  if(path==='/api/privacy/retention-run')return reply(await runRetention(env.DB,actor,p))
  return reply({error:'Privacy route not found'},404)
 }catch(error){return reply({error:error instanceof Error?error.message:'Privacy request failed'},error instanceof Problem?error.status:409)}
}
