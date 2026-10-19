import { operatorAuth,type Bindings } from '../auth.server'
import { fail,type Actor } from './model'
import { hash,load } from './store'
export async function actorFor(request:Request,env:Bindings):Promise<Actor|null>{
 const bearer=request.headers.get('authorization')
 if(bearer?.startsWith('Bearer ')){
  const key=await env.DB.prepare("SELECT k.id,k.name FROM pm_agent_keys k JOIN oa_operators o ON o.id=k.created_by WHERE k.digest=? AND k.revoked_at IS NULL AND o.role='owner' AND o.status='active'").bind(await hash(bearer.slice(7))).first<{id:string;name:string}>()
  return key?{id:key.id,name:key.name,role:'agent',agent:true}:null
 }
 const session=await operatorAuth(env).getSession(request)
 if(!session||session.operator.status!=='active')return null
 const role=session.operator.role==='member'&&(await load(env.DB)).state.hostIds?.includes(session.operator.id)?'host':session.operator.role
 return {id:session.operator.id,name:session.operator.displayName,role}
}
export function person(actor:Actor,owner=false){if(actor.agent||!(owner?['owner']:['owner','admin']).includes(actor.role))fail(403,owner?'The venue owner must do this.':'A venue manager must do this.')}
export function originCheck(request:Request,env:Bindings){if(request.headers.get('origin')!==env.AUTH_ORIGIN)fail(403,'Use the venue page on its own origin.')}
export async function jsonBody(request:Request){
 const data=await request.text();if(data.length>5000000)fail(413,'Request is too large.')
 try{const p=JSON.parse(data);if(p&&typeof p==='object'&&!Array.isArray(p))return p}catch{}
 return fail(400,'Send a JSON object.')
}
