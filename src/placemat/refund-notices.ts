import type {Bindings} from '../auth.server'
import {operatorMail} from '../mail.server.mjs'
import {person} from './access'
import {fail,id,text,type Actor} from './model'

type Refund={id:string;booking_id:string;charge_id:string;amount_cents:number;status:string;processor_id:string|null}
type Notice={id:string;refund_id:string;outcome:string;amount_cents:number;remaining_cents:number;requested_by:string;requested_at:string;state:string;provider_id:string|null;accepted_at:string|null}
const usd=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100)
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const receipt=(r:Notice)=>({id:r.id,refundId:r.refund_id,outcome:r.outcome,amountCents:r.amount_cents,remainingCents:r.remaining_cents,state:r.state,requestedBy:r.requested_by,requestedAt:r.requested_at,acceptedAt:r.accepted_at})

/** Explicit, one-attempt owner delivery of a saved refund outcome, never automatic retry. */
export async function sendRefundNotice(env:Bindings,actor:Actor,p:any){
 person(actor,true)
 if(actor.deviceId)fail(403,'A full personal owner session is required.')
 if(p.acknowledged!==true)fail(400,'Confirm emailing this refund outcome to the recorded reservation contact.')
 if(Object.keys(p).some(key=>!['refundId','outcome','acknowledged'].includes(key)))fail(400,'Send the recorded outcome by email to the reservation contact only.')
 const refundId=text(p.refundId,'Refund',100),expectedOutcome=text(p.outcome,'Reviewed refund outcome',20)
 const sender=operatorMail(env)
 if(!sender||!env.MAIL_FROM||env.AUTH_LOCAL==='true'||env.RER_DEMO==='1')fail(409,'Configure a production mail sender before sending refund notices.')
 const refund=await env.DB.prepare('SELECT id,booking_id,charge_id,amount_cents,status,processor_id FROM pm_refunds WHERE id=?').bind(refundId).first<Refund>()??fail(404,'Refund not found.')
 if(refund.status!==expectedOutcome)fail(409,'The refund outcome changed. Review it before sending a notice.')
 const existing=await env.DB.prepare('SELECT * FROM pm_refund_notices WHERE refund_id=? AND outcome=?').bind(refundId,refund.status).first<Notice>()
 if(existing)return receipt(existing)
 const row=await env.DB.prepare(`SELECT COALESCE(c.data,g.data) AS contact,COALESCE(json_extract(g.data,'$.erased'),0) AS erased
 FROM pm_state s,json_each(s.data,'$.bookings') b JOIN pm_guests g ON g.id=json_extract(b.value,'$.guestId')
 LEFT JOIN pm_booking_contacts c ON c.booking_id=json_extract(b.value,'$.id')
 WHERE s.id=1 AND json_extract(b.value,'$.id')=?`).bind(refund.booking_id).first<{contact:string;erased:number}>()??fail(404,'Reservation contact unavailable.')
 const contact=JSON.parse(row.contact)
 if(row.erased||typeof contact.email!=='string'||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email))fail(409,'The reservation needs a recorded contact email before a refund notice can be sent.')
 const balance=await env.DB.prepare(`SELECT c.amount_cents-c.imported_refunded_cents-COALESCE((SELECT SUM(r.amount_cents) FROM pm_refunds r WHERE r.charge_id=c.charge_id AND r.status IN ('pending','succeeded')),0) AS remaining FROM pm_refund_charges c WHERE c.charge_id=?`).bind(refund.charge_id).first<{remaining:number}>()??fail(409,'Synchronize the captured charge before sending its refund outcome.')
 const noticeId=id(),now=new Date().toISOString()
 // This reservation checks live authority, the exact refund outcome and the current contact in one write.
 const inserted=await env.DB.prepare(`INSERT INTO pm_refund_notices(id,refund_id,outcome,amount_cents,remaining_cents,requested_by,requested_at,state)
 SELECT ?,r.id,r.status,r.amount_cents,?,?,?,'sending' FROM pm_refunds r JOIN oa_operators o ON o.id=?
 WHERE r.id=? AND r.status=? AND o.role='owner' AND o.status='active'
 AND EXISTS(SELECT 1 FROM pm_guests g JOIN pm_state s ON s.id=1,json_each(s.data,'$.bookings') b WHERE json_extract(b.value,'$.id')=r.booking_id AND g.id=json_extract(b.value,'$.guestId') AND COALESCE(json_extract(g.data,'$.erased'),0)=0 AND COALESCE((SELECT c.data FROM pm_booking_contacts c WHERE c.booking_id=r.booking_id),g.data)=?)
 ON CONFLICT(refund_id,outcome) DO NOTHING RETURNING *`).bind(noticeId,Math.max(0,balance.remaining),actor.id,now,actor.id,refundId,refund.status,row.contact).first<Notice>()
 if(!inserted){const concurrent=await env.DB.prepare('SELECT * FROM pm_refund_notices WHERE refund_id=? AND outcome=?').bind(refundId,refund.status).first<Notice>();if(concurrent)return receipt(concurrent);fail(409,'The refund, authority or recorded contact changed. Review it again.')}
 const outcome=refund.status==='succeeded'?'succeeded':refund.status==='pending'?'is pending':refund.status==='failed'?'failed':'was canceled'
 const message=`Your refund of ${usd(refund.amount_cents)} USD ${outcome}. Remaining refundable balance on this charge: ${usd(Math.max(0,balance.remaining))} USD, after pending and succeeded refunds. A pending refund is not a completed return of funds. Contact the venue for help. Reservation reference: ${refund.booking_id}.`
 let accepted=false,providerId:string|null=null
 try{
  const result=await sender!.send({deliveryId:noticeId,from:env.MAIL_FROM!,to:[contact.email],subject:`Reservation refund ${refund.status} · ${refund.id}`,text:message,html:`<p>${escape(message)}</p>`,headers:{'Auto-Submitted':'auto-generated'}})
  accepted=result.status==='accepted';providerId=result.providerMessageId
 }catch{/* Keep the attempt unconfirmed. No automatic or duplicate send follows. */}
 await env.DB.prepare('UPDATE pm_refund_notices SET state=?,provider_id=?,accepted_at=? WHERE id=?').bind(accepted?'accepted':'unconfirmed',providerId,accepted?new Date().toISOString():null,noticeId).run()
 return receipt((await env.DB.prepare('SELECT * FROM pm_refund_notices WHERE id=?').bind(noticeId).first<Notice>())!)
}

export async function refundNotices(db:D1Database){
 return (await db.prepare('SELECT * FROM pm_refund_notices ORDER BY requested_at,id').all<Notice>()).results.map(receipt)
}

/** Existing audit door presents the personally requested delivery and its actual provider outcome. */
export async function refundNoticeAudit(db:D1Database){
 const rows=await db.prepare('SELECT n.*,r.booking_id FROM pm_refund_notices n JOIN pm_refunds r ON r.id=n.refund_id ORDER BY n.requested_at,n.id').all<Notice&{booking_id:string}>()
 return rows.results.map(n=>({id:'refund-notice-'+n.id,at:n.accepted_at??n.requested_at,actor:n.requested_by,action:'payment.refund-notice',subject:n.booking_id,source:'person' as const,changes:[{kind:'refundNotices',id:n.id,before:null,after:receipt(n)}]}))
}
