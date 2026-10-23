import {subscriptions} from './events'
import type {Bindings} from '../../auth.server'
import {actorFor,jsonBody,originCheck,person} from '../access'
import {Problem,fail,id,text,type Actor} from '../model'
import {hash,load} from '../store'
import {instant} from '../availability'
import {reservationSearch} from '../reservation-search'

const scopes=['availability:read','reservations:read','guests:read','events:read'] as const
const headers={'cache-control':'no-store','x-content-type-options':'nosniff','x-placemat-api-version':'1'}
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers})
type Key={id:string;name:string;scopes:string;created_by:string;expires_at:string}
const live="SELECT k.id,k.name,k.scopes,k.created_by,k.expires_at FROM pm_integration_keys k JOIN oa_operators o ON o.id=k.created_by WHERE k.digest=? AND k.revoked_at IS NULL AND k.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND o.role='owner' AND o.status='active'"
const ownerFence=(db:D1Database,actor:Actor)=>db.prepare("INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND role='owner' AND status='active') THEN 1 ELSE 0 END").bind(actor.id)
const audit=(db:D1Database,keyId:string,actorId:string,action:string,at:string)=>db.prepare('INSERT INTO pm_integration_audit(id,key_id,actor_id,action,at) VALUES(?,?,?,?,?)').bind(id(),keyId,actorId,action,at)
async function owner(request:Request,env:Bindings){
 const actor=await actorFor(request,env)??fail(401,'Sign in as the venue owner.')
 person(actor,true)
 if(actor.deviceId)fail(403,'Use a personal owner session.')
 return actor
}
async function manage(request:Request,env:Bindings,url:URL){
 const actor=await owner(request,env),db=env.DB
 if(url.pathname==='/api/integration-keys'&&request.method==='GET'){
  const keys=(await db.prepare('SELECT id,name,scopes,created_by AS createdBy,created_at AS createdAt,expires_at AS expiresAt,revoked_at AS revokedAt FROM pm_integration_keys ORDER BY created_at,id').all()).results
  const events=(await db.prepare('SELECT key_id AS keyId,actor_id AS actorId,action,at FROM pm_integration_audit ORDER BY at,id').all()).results
  return reply({keys:keys.map(k=>({...k,scopes:JSON.parse(k.scopes as string)})),events})
 }
 if(request.method!=='POST')return reply({error:'Method not allowed'},405)
 originCheck(request,env)
 const p=await jsonBody(request),now=new Date().toISOString()
 if(url.pathname==='/api/integration-keys'){
  if(p.acknowledged!==true)fail(400,'Explicitly acknowledge the selected integration read access.')
  if(!Array.isArray(p.scopes)||!p.scopes.length||p.scopes.length>scopes.length||new Set(p.scopes).size!==p.scopes.length||p.scopes.some((scope:unknown)=>!scopes.includes(scope as typeof scopes[number])))fail(400,'Select one or more documented read scopes.')
  const name=text(p.name,'Integration name',100),expiresAt=instant(p.expiresAt,'Key expiry')
  if(expiresAt<=now||Date.parse(expiresAt)>Date.parse(now)+90*86400000)fail(400,'Choose a future expiry within 90 days.')
  const key=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join(''),keyId=id()
  await db.batch([ownerFence(db,actor),db.prepare('INSERT INTO pm_integration_keys(id,name,digest,scopes,created_by,created_at,expires_at) VALUES(?,?,?,?,?,?,?)').bind(keyId,name,await hash(key),JSON.stringify(p.scopes),actor.id,now,expiresAt),audit(db,keyId,actor.id,'created',now),db.prepare('DELETE FROM pm_assertions')])
  return reply({id:keyId,name,key,scopes:p.scopes,expiresAt,notice:'Save this key now. It is shown once; revoke it if the response is lost.'},201)
 }
 const match=url.pathname.match(/^\/api\/integration-keys\/([^/]+)\/revoke$/)
 if(!match)fail(404,'Integration key route not found.')
 const keyId=match![1],found=await db.prepare('SELECT id,revoked_at FROM pm_integration_keys WHERE id=?').bind(keyId).first<{id:string;revoked_at:string|null}>()
 if(!found)fail(404,'Integration key not found.')
 // Repeating revocation preserves its first timestamp and does not create another event.
 await db.batch([ownerFence(db,actor),db.prepare("INSERT INTO pm_integration_audit(id,key_id,actor_id,action,at) SELECT ?,?,?, 'revoked',? WHERE EXISTS(SELECT 1 FROM pm_integration_keys WHERE id=? AND revoked_at IS NULL)").bind(id(),keyId,actor.id,now,keyId),db.prepare('UPDATE pm_integration_keys SET revoked_at=COALESCE(revoked_at,?) WHERE id=?').bind(now,keyId),db.prepare('DELETE FROM pm_assertions')])
 return reply({id:keyId,revoked:true})
}
async function signature(secret:string,value:string){
 const encoder=new TextEncoder(),key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign'])
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value))),n=>n.toString(16).padStart(2,'0')).join('')
}
async function cursor(secret:string,key:Key,kind:string,after:string){
 const body=btoa(JSON.stringify({keyId:key.id,kind,after})).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')
 return body+'.'+await signature(secret,body)
}
async function afterCursor(secret:string,key:Key,kind:string,value:string|null){
 if(!value)return ''
 if(value.length>1000)fail(400,'Invalid cursor.')
 const [body,mac,...extra]=value.split('.')
 if(extra.length||!body||!mac||mac!==await signature(secret,body))fail(400,'Invalid cursor.')
 let data:any
 try{data=JSON.parse(atob(body.replaceAll('-','+').replaceAll('_','/')))}catch{fail(400,'Invalid cursor.')}
 if(data.keyId!==key.id||data.kind!==kind||typeof data.after!=='string'||data.after.length>100)fail(400,'This cursor belongs to a different key or collection.')
 return data.after as string
}

/** The versioned read door is isolated from native sessions and preparation credentials. */
async function integrationRoute(request:Request,env:Bindings):Promise<Response|null>{
 const url=new URL(request.url),path=url.pathname
 if(path==='/api/integration-subscriptions'||path.startsWith('/api/integration-subscriptions/')){
  const actor=await owner(request,env)
  if(!['GET','POST'].includes(request.method))return reply({error:'Method not allowed'},405)
  if(request.method==='POST')originCheck(request,env)
  return reply(await subscriptions(env,actor,path,request.method,request.method==='POST'?await jsonBody(request):{}))
 }
 if(path==='/api/integration-keys'||path.startsWith('/api/integration-keys/'))return manage(request,env,url)
 if(!/^\/api\/v[^/]*(?:\/|$)/.test(path))return null
 if(!path.startsWith('/api/v1/'))return reply({version:'1',error:'Unsupported API version. Use the documented v1 routes.'},404)
 if(request.method!=='GET')return reply({version:'1',error:'This API slice permits reads only.'},405)
 const kind=path.slice('/api/v1/'.length)
 if(!['availability','reservations','guests','events'].includes(kind))return reply({version:'1',error:'Unknown v1 collection.'},404)
 const bearer=request.headers.get('authorization')
 if(!bearer?.startsWith('Bearer ')||! /^[a-f0-9]{64}$/.test(bearer.slice(7)))fail(401,'An active scoped integration key is required.')
 const digest=await hash(bearer!.slice(7)),key=await env.DB.prepare(live).bind(digest).first<Key>()??fail(401,'An active scoped integration key is required.')
 const minute=Math.floor(Date.now()/60000)
 const count=await env.DB.prepare('INSERT INTO pm_integration_limits(key_id,minute,count) VALUES(?,?,1) ON CONFLICT(key_id,minute) DO UPDATE SET count=count+1 RETURNING count').bind(key.id,minute).first<{count:number}>()
 await env.DB.prepare('DELETE FROM pm_integration_limits WHERE minute<?').bind(minute-1).run()
 if((count?.count??0)>60)return new Response(JSON.stringify({version:'1',error:'Integration rate limit reached. Retry in the next minute.'}),{status:429,headers:{...headers,'content-type':'application/json','retry-after':String(60-Math.floor(Date.now()/1000)%60)}})
 if(!JSON.parse(key.scopes).includes(kind+':read'))fail(403,'This key does not grant the requested read scope.')
 if(kind==='availability'){
  const result=reservationSearch((await load(env.DB)).state,url.searchParams)
  if(!await env.DB.prepare(live).bind(digest).first())fail(401,'Integration key was revoked or expired.')
  return reply({version:'1',...result})
 }
 const limitText=url.searchParams.get('limit')??'50'
 if(!/^[1-9]\d?$|^100$/.test(limitText))fail(400,'Page size must be an integer from 1 to 100.')
 const limit=Number(limitText),after=await afterCursor(env.SESSION_SECRET,key,kind,url.searchParams.get('cursor'))
 if(kind==='events'){
  if(after&&!/^[1-9]\d*$/.test(after))fail(400,'Invalid event cursor.')
  const rows=(await env.DB.prepare('SELECT sequence,payload FROM pm_integration_events WHERE sequence>? ORDER BY sequence LIMIT ?').bind(after?Number(after):0,limit+1).all<{sequence:number;payload:string}>()).results
  const items=rows.slice(0,limit),nextCursor=rows.length>limit?await cursor(env.SESSION_SECRET,key,kind,String(items.at(-1)!.sequence)):null
  if(!await env.DB.prepare(live).bind(digest).first())fail(401,'Integration key was revoked or expired.')
  return reply({version:'1',items:items.map(row=>JSON.parse(row.payload)),nextCursor})
 }
 const fields=kind==='guests'?['id']:['id','serviceId','partySize','startAt','endAt','status','source']
 if(url.searchParams.has('fields')&&url.searchParams.get('fields')!.split(',').some(field=>!fields.includes(field)))fail(403,'Requested fields are outside this read scope. Contact and private profile fields are denied.')
 let rows:Record<string,unknown>[]
 if(kind==='guests'){
  rows=(await env.DB.prepare("SELECT id FROM pm_guests WHERE id>? AND COALESCE(json_extract(data,'$.erased'),0)=0 AND json_extract(data,'$.mergedInto') IS NULL ORDER BY id LIMIT ?").bind(after,limit+1).all<{id:string}>()).results
 }else{
  rows=(await load(env.DB)).state.bookings.filter(b=>b.id>after).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).slice(0,limit+1).map(b=>Object.fromEntries(fields.map(field=>[field,b[field as keyof typeof b]])))
 }
 const more=rows.length>limit,items=rows.slice(0,limit),nextCursor=more?await cursor(env.SESSION_SECRET,key,kind,String(items.at(-1)!.id)):null
 if(!await env.DB.prepare(live).bind(digest).first())fail(401,'Integration key was revoked or expired.')
 return reply({version:'1',items,nextCursor})
}

export async function integrationResponse(request:Request,env:Bindings):Promise<Response|null>{
 try{return await integrationRoute(request,env)}catch(error){
  if(error instanceof Problem)return reply({version:'1',error:error.message},error.status)
  throw error
 }
}
