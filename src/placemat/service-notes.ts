import {fail,id,text,number,type State,type Service,type Actor} from './model'
import {serviceBy} from './availability'
import {pacingReport} from './pacing'

export type ServiceNote={id:string;date:string;kind:'shift'|'kitchen';history:{text:string;actor:string;at:string}[]}
export type PreorderItem={id:string;name:string;active:boolean}
export type Preorder={itemId:string;itemName:string;quantity:number}
export type ManagerPreorder={itemId:string;quantity:number;actor:string;at:string}
export const localServiceDate=(instant:string,timezone:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(instant))
export const canReadShift=(actor:Actor)=>!actor.agent&&['owner','admin','host'].includes(actor.role)
export const notesFor=(s:State,date:string,names:Record<string,string>={})=> (s.serviceNotes??[]).filter(n=>n.date===date).map(n=>({...n,history:n.history.map(e=>({...e,author:names[e.actor]??e.actor}))}))
export function executeServiceNotes(s:State,actor:Actor,command:string,p:any,now:string){
 if(command==='service.note'){
  const date=text(p.date,'Service date',10)
  if(!s.services.some(v=>localServiceDate(v.startAt,s.venue.timezone)===date))fail(400,'Choose a date with a service.')
  if(!['shift','kitchen'].includes(p.kind))fail(400,'Choose shift or kitchen notes.')
  s.serviceNotes??=[]
  let note=s.serviceNotes.find(n=>n.date===date&&n.kind===p.kind)
  if(!note){note={id:id(),date,kind:p.kind,history:[]};s.serviceNotes.push(note)}
  note.history.push({text:text(p.text,'Note',2000),actor:actor.id,at:now});return note
 }
 const service=serviceBy(s,p.serviceId)
 if(command==='service.preorder-item'){
  const item={id:id(),name:text(p.name,'Dish name',120),active:true}
  if(service.preorderItems?.some(i=>i.name.toLowerCase()===item.name.toLowerCase()))fail(409,'That dish is already listed.')
  ;(service.preorderItems??=[]).push(item);return item
 }
 if(command==='service.preorder-active'){
  const item=service.preorderItems?.find(i=>i.id===p.itemId)??fail(404,'Dish not found.')
  if(typeof p.active!=='boolean')fail(400,'Choose whether this dish is published.')
  item.active=p.active;return item
 }
 const item=service.preorderItems?.find(i=>i.id===p.itemId)??fail(404,'Dish not found.')
 const count={itemId:item.id,quantity:number(p.quantity,'Manager count',0,500),actor:actor.id,at:now}
 service.managerPreorders=[...(service.managerPreorders??[]).filter(v=>v.itemId!==item.id),count];return {id:service.id,...count}
}
export function normalizePreorders(service:Service,value:unknown):Preorder[]{
 if(value===undefined)return []
 if(!Array.isArray(value)||value.length>50)return fail(400,'Choose dishes from the published list.')
 const seen=new Set<string>()
 return value.map(p=>{
  const item=service.preorderItems?.find(i=>i.id===p?.itemId&&i.active)??fail(409,'A selected dish is no longer published. Review the current list.')
  if(seen.has(item.id))fail(400,'Select each dish once.')
  seen.add(item.id);return {itemId:item.id,itemName:item.name,quantity:number(p.quantity,'Dish quantity',1,50)}
 })
}
/** All kitchen receivers share this identity-free projection. */
export function kitchen(s:State,actor:Actor,serviceId:string,now=new Date().toISOString(),names:Record<string,string>={}){
 if(actor.agent||!['owner','admin','host','member','server'].includes(actor.role))fail(403,'Sign in as restaurant staff to open the kitchen view.')
 const service=serviceBy(s,serviceId),server=actor.role==='server',own=(service.staffing?.servers??[]).filter(v=>v.operatorId===actor.id).map(v=>v.id)
 if(server&&!own.length)fail(403,'Servers open the kitchen view only for a shift they are linked to.')
 // A server sees only guest needs and large parties inside their own sections, no pacing or dish totals.
 const sections=new Set((service.staffing?.sections??[]).filter(v=>own.includes(v.serverId)).map(v=>v.id))
 const bookings=s.bookings.filter(b=>b.serviceId===serviceId&&!['cancelled','no-show'].includes(b.status)&&(!server||b.sectionId!==undefined&&sections.has(b.sectionId))),p=pacingReport(s,serviceId,now)
 const tables=(ids:string[])=>ids.map(id=>s.tables.find(t=>t.id===id)?.label??'Unknown table')
 return {audience:server?'Server' as const:'Staff' as const,venue:s.venue.name,timezone:s.venue.timezone,service:service.name,generatedAt:now,date:localServiceDate(service.startAt,s.venue.timezone),notes:notesFor(s,localServiceDate(service.startAt,s.venue.timezone),names).filter(n=>n.kind==='kitchen'),...(!server?{policy:p.policy}:{}),intervals:server?[]:p.intervals.map(({startAt,covers,limit,parties,partyLimit})=>({startAt,covers,limit,parties,partyLimit})),largeParties:bookings.filter(b=>b.partySize>=8).map(b=>({tables:tables(b.tableIds),partySize:b.partySize,startAt:b.startAt})),items:server?[]:(service.preorderItems??[]).map(item=>({name:item.name,guestQuantity:bookings.reduce((n,b)=>n+(b.preorders??[]).filter(v=>v.itemId===item.id).reduce((n,v)=>n+v.quantity,0),0),managerQuantity:(service.managerPreorders??[]).find(v=>v.itemId===item.id)?.quantity??0})),needs:bookings.map(b=>({tables:tables(b.tableIds),startAt:b.startAt,allergy:b.requests?.allergyNotes??'',dietary:b.requests?.dietaryNotes??'',access:[b.requests?.wheelchair?'Wheelchair':'',b.requests?.highchair?'Highchair':'',b.requests?.stroller?'Stroller':'',...(b.requiredAccessTags??[])].filter(Boolean)}))}
}
/** Existing API readers keep existing access, but new restricted notes never reach them via snapshots. */
export function filterNotes(s:State,actor:Actor){
 delete s.holds
 if(canReadShift(actor))return s
 s.serviceNotes=actor.agent?[]:(s.serviceNotes??[]).filter(n=>n.kind==='kitchen')
 s.audit=s.audit.map(e=>({...e,changes:e.changes?.filter(c=>c.kind!=='serviceNotes')}))
 return s
}
