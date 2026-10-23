import type {Bindings} from '../auth.server'
import {actorFor,person,originCheck,jsonBody} from './access'
import {Problem,fail,id,text} from './model'
import {load} from './store'
import {calculate,integer,month} from './costs-calculation'
import {costsPage} from './costs-view'
const headers={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}
export async function costsResponse(request:Request,env:Bindings):Promise<Response|null>{
 const u=new URL(request.url),path=u.pathname
 if(path!=='/costs'&&path!=='/api/costs'&&!path.startsWith('/api/costs/'))return null
 const json=(data:unknown,status=200)=>Response.json(data,{status,headers})
 try{
  const actor=await actorFor(request,env);if(!actor)fail(401,'Sign in to the venue first.');person(actor!,true)
  if(path==='/costs'){if(request.method!=='GET')return json({error:'Method not allowed'},405);return costsPage()}
  if(path==='/api/costs'&&request.method==='GET'){
   const selected=month(u.searchParams.get('month')), {state}=await load(env.DB)
   const previews=(await env.DB.prepare('SELECT id,created_at AS createdAt,data FROM pm_cost_previews WHERE month=? ORDER BY created_at,id').bind(selected).all<{id:string;createdAt:string;data:string}>()).results.map(r=>({...r,data:JSON.parse(r.data)}))
   const invoices=(await env.DB.prepare('SELECT i.id,i.reference,i.created_at AS createdAt,i.data FROM pm_cost_invoices i JOIN pm_cost_previews p ON p.id=i.preview_id WHERE p.month=? ORDER BY i.created_at,i.id').bind(selected).all<{id:string;reference:string;createdAt:string;data:string}>()).results.map(r=>({...r,data:JSON.parse(r.data)}))
   const budget=await env.DB.prepare('SELECT amount_cents AS amountCents FROM pm_cost_budgets WHERE month=?').bind(selected).first<{amountCents:number}>()
   const observed=await env.DB.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(amount_cents),0) AS grossCents FROM pm_payment_requests WHERE state='paid' AND substr(paid_at,1,7)=?").bind(selected).first<{count:number;grossCents:number}>()
   const invoiceCents=invoices.reduce((n,r)=>n+r.data.totalCents,0),forecastMicros=previews.at(-1)?.data.totalMicros??null
   return json({month:selected,previews,invoices,budget,invoiceCents,forecastMicros,alert:budget?{invoiceExceeded:invoiceCents>budget.amountCents,forecastExceeded:forecastMicros!==null&&forecastMicros>budget.amountCents*10000}:null,usage:{approvedReminders:state.reminders.filter(r=>r.approvedAt?.startsWith(selected)).length,exportedReminders:state.reminders.filter(r=>r.approvedAt?.startsWith(selected)&&r.status==='exported').length,paidDeposits:observed,scope:'Reminder counts use approval month; export is not delivery. Paid deposits use payment month. Other provider usage and processing fees are not connected.'}})
  }
  if(request.method!=='POST')return json({error:'Method not allowed'},405)
  originCheck(request,env);const p=await jsonBody(request),now=new Date().toISOString()
  if(path==='/api/costs/preview'){
   const data=calculate(p),previewId=id();await env.DB.prepare('INSERT INTO pm_cost_previews(id,month,actor_id,created_at,data) VALUES(?,?,?,?,?)').bind(previewId,data.input.month,actor!.id,now,JSON.stringify(data)).run();return json({id:previewId,...data},201)
  }
  if(path==='/api/costs/budget'){
   const selected=month(p.month),amount=integer(p.amountCents,'Budget cents',100000000000)
   await env.DB.prepare('INSERT INTO pm_cost_budgets(month,amount_cents,actor_id,updated_at) VALUES(?,?,?,?) ON CONFLICT(month) DO UPDATE SET amount_cents=excluded.amount_cents,actor_id=excluded.actor_id,updated_at=excluded.updated_at').bind(selected,amount,actor!.id,now).run();return json({saved:true})
  }
  if(path==='/api/costs/invoice'){
   const previewId=text(p.previewId,'Preview'),reference=text(p.reference,'Provider invoice reference',160),evidence=text(p.evidence,'Invoice evidence or statement reference',1000)
   if(p.acknowledge!==true)fail(400,'Acknowledge this is an owner-entered invoice, not provider verification.')
   const preview=await env.DB.prepare('SELECT data FROM pm_cost_previews WHERE id=?').bind(previewId).first<{data:string}>();if(!preview)fail(404,'Preview not found.')
   const costCents=integer(p.costCents,'Provider costs excluding processor fees',100000000000),processorFeeCents=integer(p.processorFeeCents,'Actual processor fees',100000000000)
   const units=integer(p.units,'Invoice usage units'),unitLabel=text(p.unitLabel,'Usage unit description',100),provider=text(p.provider,'Provider',100)
   const duplicate=await env.DB.prepare('SELECT id FROM pm_cost_invoices WHERE reference=?').bind(reference).first();if(duplicate)fail(409,'That invoice reference is already recorded.')
   const estimate=JSON.parse(preview!.data)
   const usageKind=['sms_segments','promoted_covers','card_payments','other'].includes(p.usageKind)?p.usageKind:fail(400,'Choose an invoice usage category.')
   const paid=usageKind==='card_payments'?await env.DB.prepare("SELECT COUNT(*) AS count FROM pm_payment_requests WHERE state='paid' AND substr(paid_at,1,7)=?").bind(estimate.input.month).first<{count:number}>():null
   const plannedUnits=usageKind==='sms_segments'?estimate.input.reminders*estimate.input.segments:usageKind==='promoted_covers'?estimate.input.covers:usageKind==='card_payments'?estimate.input.payments:null
   const data={provider,previewId,evidence,units,unitLabel,usageKind,plannedUnits,actualUnits:paid?.count??null,usageVariance:paid?units-paid.count:null,usageBasis:paid?'Observed paid deposits only; other card payments are excluded.':'Provider usage is not connected. Approved/exported reminders do not prove billable SMS; promoted covers are planning inputs.',costCents,processorFeeCents,totalCents:costCents+processorFeeCents,estimateMicros:estimate.totalMicros,varianceMicros:(costCents+processorFeeCents)*10000-estimate.totalMicros,basis:'Owner-entered invoice; not independently provider-verified. Variance compares this invoice to the entire linked preview; reconcile matching scope only.'}
   const invoiceId=id();const written=await env.DB.prepare('INSERT INTO pm_cost_invoices(id,preview_id,reference,actor_id,created_at,data) VALUES(?,?,?,?,?,?) ON CONFLICT(reference) DO NOTHING').bind(invoiceId,previewId,reference,actor!.id,now,JSON.stringify(data)).run();if(written.meta.changes!==1)fail(409,'That invoice reference is already recorded.');return json({id:invoiceId,...data},201)
  }
  return json({error:'Not found'},404)
 }catch(e){if(e instanceof Problem)return json({error:e.message},e.status);throw e}
}
