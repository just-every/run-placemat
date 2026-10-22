import {projectHandover} from './handover'
import {paymentAlerts} from './payment-links'
import {load,guests} from './store'
import {floorStage} from './service-status'
import type {Actor,State} from './model'

export async function handoverAssignees(db:D1Database,state:State){
 const rows=await db.prepare("SELECT id,display_name AS name,role,status FROM oa_operators WHERE status='active' ORDER BY display_name,id").all<{id:string;name:string;role:string;status:string}>()
 return rows.results.filter(p=>['owner','admin'].includes(p.role)||state.hostIds?.includes(p.id)).map(p=>({...p,displayName:p.name}))
}
export async function hostFloor(db:D1Database,actor:Actor){
 const {state,version}=await load(db),people=await guests(db),now=new Date().toISOString(),assignees=await handoverAssignees(db,state),alerts=await paymentAlerts(db)
 const visibleTaskIds=new Set(state.bookings.flatMap(b=>(b.handover??[]).filter(t=>t.ownerId===actor.id).map(t=>t.id)))
 return {actor:{id:actor.id,name:actor.name,role:actor.role},version,venue:{name:state.venue.name,timezone:state.venue.timezone},assignees,pacingGranted:state.pacingHostIds?.includes(actor.id)===true,services:state.services.filter(s=>s.status==='published'&&!s.closedAt).map(s=>({id:s.id,name:s.name,startAt:s.startAt,endAt:s.endAt})),tables:state.tables.filter(t=>!t.retiredAt&&t.inventoryKind!=='pool').map(t=>({id:t.id,label:t.label,seats:t.seats})),waitlist:state.waitlist.map(w=>({id:w.id,serviceId:w.serviceId,name:people.find(g=>g.id===w.guestId)?.name??'Erased guest',partySize:w.partySize,status:w.status,requiredArea:w.preferredArea,requiredAccessTags:w.requiredAccessTags,contactConsent:w.contactConsent,quote:w.quote})),bookings:state.bookings.filter(b=>['booked','seated'].includes(b.status)||b.needsBussing||(b.handover??[]).some(t=>!t.history.some(e=>e.action==='completed'))).map(b=>{
  const stage=floorStage(state,b,now)
  return {id:b.id,serviceId:b.serviceId,name:people.find(g=>g.id===b.guestId)?.name??'Erased guest',partySize:b.partySize,startAt:b.startAt,endAt:b.endAt,source:b.source,tableIds:b.tableIds,assignmentLocked:b.assignmentLocked,status:stage.serviceStatus==='paid'?'seated':stage.serviceStatus,handover:projectHandover({handover:b.handover??[]},actor,visibleTaskIds).handover,paymentRequests:alerts.filter(r=>r.bookingId===b.id).map(r=>({...r,id:r.requestId,url:r.providerUrl})),nextStages:[...new Set([...stage.nextStages,...stage.nextFloorStages])].filter(s=>!['paid','check-open','check-dropped'].includes(s))}
 })}
}
