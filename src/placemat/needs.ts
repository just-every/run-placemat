import {fail,id,text,type Actor,type Booking,type State} from './model'

export type NeedEvent={id:string;field:'allergy'|'dietary'|'access';action:'acknowledge'|'clarify'|'correct';value:string;declaration:string;reason:string;actor:string;at:string}
/** Original declarations remain on the booking; staff actions append to its history. */
export const needsRevision=(b:Booking)=>JSON.stringify([b.requests??null,b.requiredAccessTags??[],b.needHistory?.length??0])
export function needFacts(b:Booking){
 const original={allergy:b.requests?.allergyNotes??'',dietary:b.requests?.dietaryNotes??'',access:[b.requests?.wheelchair?'Wheelchair':'',b.requests?.highchair?'Highchair':'',b.requests?.stroller?'Stroller':'',...(b.requiredAccessTags??[])].filter(Boolean).join(', ')}
 return (['allergy','dietary','access'] as const).flatMap(field=>{
  const history=(b.needHistory??[]).filter(e=>e.field===field),correction=history.findLast(e=>e.action==='correct'),latest=history.at(-1),value=correction?.value??original[field]
  if(!value&&!history.length)return []
  return [{field,value,original:original[field],declaredAt:b.createdAt,source:correction?'Guest clarification recorded by staff':'Booking declaration (unverified)',status:latest&&latest.declaration!==original[field]?'Clarification required':latest?.action==='acknowledge'?'Staff acknowledged':latest?.action==='clarify'?'Clarification required':'Awaiting staff acknowledgment',at:correction?.at??b.createdAt,actor:correction?.actor??null,history}]
 })
}
export function needLines(b:Booking,names:Record<string,string>={}):string[]{return needFacts(b).map(f=>`${f.field}: ${f.value} | ${f.source} | ${f.at} | ${f.status}${f.history.at(-1)?` | ${names[f.history.at(-1)!.actor]??'Staff member'} | ${f.history.at(-1)!.at}`:''}`)}
export function executeNeeds(s:State,actor:Actor,p:any,now:string){
 const b=s.bookings.find(b=>b.id===p.bookingId)??fail(404,'Booking not found.')
 if(p.revision!==needsRevision(b))fail(409,'These needs changed. Refresh and review the current facts before recording an action.')
 if(!['allergy','dietary','access'].includes(p.field)||!['acknowledge','clarify','correct'].includes(p.action))fail(400,'Choose a need and a review action.')
 const fact=needFacts(b).find(f=>f.field===p.field)??fail(409,'No declared fact is recorded for that field.')
 if(p.action==='acknowledge'&&fact.status==='Clarification required')fail(409,'Obtain and record the guest clarification before acknowledging this fact.')
 if(p.action==='correct'&&p.guestConfirmed!==true)fail(400,'Confirm that the guest supplied this clarification.')
 const value=p.action==='correct'?text(p.value,'Guest clarification',1000):fact.value
 const reason=text(p.reason,'Review or clarification reason',1000)
 ;(b.needHistory??=[]).push({id:id(),field:p.field,action:p.action,value,declaration:fact.original,reason,actor:actor.id,at:now})
 return b
}
