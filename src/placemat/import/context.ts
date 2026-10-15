import { operatorAuth, type Bindings } from '../../auth.server'
import { Problem, type Actor } from '../model'
import { guestTargets, DESTINATION,NAMESPACE,MAPPING_VERSION } from './adapter'
import type { D1ImportContext,D1Database,D1Sql } from './kit'

export function requireOwner(actor:Actor){if(actor.agent||actor.role!=='owner')throw new Problem(403,'A native owner must approve move-in and erasure.')}
export function contextWithAuthority(db:D1Database,principalId:string,predicate:()=>D1Sql):D1ImportContext{return {destination:DESTINATION,namespace:NAMESPACE,mappingVersion:MAPPING_VERSION,batchSize:10,maxBatches:3,storage:{database:db,targets:guestTargets},authorization:{principalId,predicate}}}
export async function requestContext(request:Request,env:Bindings,actor:Actor){
 requireOwner(actor)
 const session=await operatorAuth(env).getSession(request)
 if(!session||session.operator.id!==actor.id||session.operator.role!=='owner')throw new Problem(403,'An active owner session is required.')
 return contextWithAuthority(env.DB,actor.id,()=>({sql:"EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id WHERE s.id=? AND o.id=? AND o.role='owner' AND o.status='active' AND o.version=? AND s.operator_version=o.version AND s.revoked_at IS NULL AND s.expires_at>unixepoch()*1000)",params:[session.id,actor.id,session.operator.version]}))
}
