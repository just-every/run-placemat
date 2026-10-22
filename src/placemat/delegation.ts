import {fail,number,text,type Actor,type State} from './model'
import {jsonBody} from './access'

/** New delegation is owner-issued; a lead receives seating exceptions only and a server receives own-section views only. */
export async function executeDelegation(db:D1Database,s:State,actor:Actor,command:string,p:any){
 if(actor.agent||actor.role!=='owner')fail(403,'Only the owner can delegate authority.')
 const operatorId=text(p.operatorId,'Team member',100),operator=await db.prepare('SELECT role,status FROM oa_operators WHERE id=?').bind(operatorId).first<{role:string;status:string}>()
 if(!operator||operator.status!=='active')fail(409,'Choose an active team member.')
 if(command==='team.lead'){
  if(operator!.role!=='member'||typeof p.enabled!=='boolean')fail(400,'Choose an active native member and whether lead access is enabled.')
  if(p.enabled&&(s.hostIds?.includes(operatorId)||s.serverIds?.includes(operatorId)))fail(409,'Remove the host or server grant before choosing the separate shift-lead grant.')
  s.leadIds=[...new Set([...(s.leadIds??[]).filter(id=>id!==operatorId),...(p.enabled?[operatorId]:[])])]
  if(!p.enabled&&s.reportScopes)delete s.reportScopes[operatorId]
  return {id:operatorId,enabled:p.enabled}
 }
 if(command==='team.server'){
  if(operator!.role!=='member'||typeof p.enabled!=='boolean')fail(400,'Choose an active native member and whether server access is enabled.')
  if(p.enabled&&(s.hostIds?.includes(operatorId)||s.leadIds?.includes(operatorId)))fail(409,'Remove the host or shift-lead grant before choosing the separate server grant.')
  s.serverIds=[...new Set([...(s.serverIds??[]).filter(id=>id!==operatorId),...(p.enabled?[operatorId]:[])])]
  if(!p.enabled)for(const service of s.services)if(service.staffing?.servers.some(server=>server.operatorId===operatorId)){for(const server of service.staffing.servers)if(server.operatorId===operatorId)delete server.operatorId;service.version++}
  return {id:operatorId,enabled:p.enabled}
 }
 if(command==='team.manager-limit'){
  if(operator!.role!=='admin')fail(400,'Only a native manager can receive refund authority.')
  const refundLimitCents=number(p.refundLimitCents,'Refund limit in USD cents',0,100000000)
  ;(s.managerRefundLimits??={})[operatorId]=refundLimitCents
  return {id:operatorId,refundLimitCents,refundsAvailable:true}
 }
 if(operator!.role!=='admin'&&!s.leadIds?.includes(operatorId))fail(400,'Choose a manager or shift lead for report access.')
 if(!Array.isArray(p.serviceIds)||p.serviceIds.some((id:unknown)=>typeof id!=='string'||!s.services.some(v=>v.id===id))||new Set(p.serviceIds).size!==p.serviceIds.length)fail(400,'Choose distinct existing service scopes.')
 ;(s.reportScopes??={})[operatorId]=[...p.serviceIds]
 return {id:operatorId,serviceIds:p.serviceIds}
}

/** All report doors and immutable snapshot reads enforce the same service scope. */
export async function authorizeReports(db:D1Database,actor:Actor,request:Request,url:URL){
 if(actor.role==='owner'&&!actor.agent)return
 if(actor.agent||!['admin','lead'].includes(actor.role))fail(403,'A manager or explicitly authorized lead must open reports.')
 if(actor.role==='lead'&&(request.method!=='GET'||!['/api/reports/reservations','/api/reports/performance'].includes(url.pathname)))fail(403,'Shift leads have read-only reservation and performance JSON; no exports or report publication.')
 const {state}=await import('./store').then(m=>m.load(db)),scope=state.reportScopes?.[actor.id]
 if(scope===undefined&&actor.role==='admin')return
 let serviceId=request.method==='POST'?(await jsonBody(request.clone())).serviceId:url.searchParams.get('serviceId')
 const snapshot=url.searchParams.get('snapshot')
 if(snapshot){const row=await db.prepare('SELECT service_id FROM pm_performance_reports WHERE id=?').bind(snapshot).first<{service_id:string}>();if(!row||serviceId&&serviceId!==row.service_id)fail(403,'Choose a report inside your permitted service scope.');serviceId=row!.service_id}
 if(typeof serviceId!=='string'||!(scope??[]).includes(serviceId))fail(403,'Choose a report inside your permitted service scope.')
}

/** Financial/grant policy and its audit snapshots are owner-only, apart from a person's own grant. */
export function projectAuthority(value:any,actor?:Actor|null):any{
 if(actor?.role==='owner'&&!actor.agent)return value
 if(Array.isArray(value))return value.map(v=>projectAuthority(v,actor))
 if(!value||typeof value!=='object')return value
 if(['managerRefundLimits','reportScopes','groupAdmins','groupLinks','groupHome'].includes(value.kind))return {...value,before:value.before===null?null:{restricted:true},after:value.after===null?null:{restricted:true}}
 return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,['managerRefundLimits','reportScopes'].includes(key)?actor&&!actor.agent&&(key==='reportScopes'&&['admin','lead'].includes(actor.role)||key==='managerRefundLimits'&&actor.role==='admin')&&item&&typeof item==='object'&&Object.hasOwn(item,actor.id)?{[actor.id]:(item as any)[actor.id]}:undefined:projectAuthority(item,actor)]))
}
