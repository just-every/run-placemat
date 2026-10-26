import type {Bindings} from '../auth.server'
import {fail,id,text,type Actor} from './model'
import {load,save} from './store'
import {feeAuthority,feeCommit,feeEvent} from './fee-policy'
import {bookingFor,ownedTask,ownerFence,operationCase,type PaymentReview,type AccountingExport} from './payment-operations'
import {postAccountingJournal} from './payment-accounting-provider'
import type {CaseMoney} from './payment-case-provider'

/** Explicit gross principal handoff. Payouts and processor fees remain separate reconciliation duties. */
function journalFor(caseId:string,ledger:CaseMoney[],accounts:any){
 const account=(key:string)=>{const v=text(accounts?.[key],key+' account',50);if(!/^\d+$/.test(v))fail(400,'Choose numeric QuickBooks account identifiers.');return v}
 const clearing=account('clearing'),revenue=account('revenue'),disputes=account('disputes')
 if(new Set([clearing,revenue,disputes]).size!==3)fail(400,'Choose distinct clearing, revenue and dispute accounts.')
 const line=(item:CaseMoney,posting:string,accountId:string)=>({Amount:item.amountCents/100,Description:item.kind+' '+item.id,DetailType:'JournalEntryLineDetail',JournalEntryLineDetail:{PostingType:posting,AccountRef:{value:accountId}}})
 return {TxnDate:ledger[0].at.slice(0,10),PrivateNote:'Placemat dispute '+caseId,CurrencyRef:{value:'USD'},Line:ledger.flatMap(item=>item.kind==='charge'?[line(item,'Debit',clearing),line(item,'Credit',revenue)]:item.kind==='refund'?[line(item,'Debit',revenue),line(item,'Credit',clearing)]:[line(item,'Debit',disputes),line(item,'Credit',clearing)])}
}
export async function exportPaymentAccounting(env:Bindings&{QBO_ACCESS_TOKEN?:string;QBO_REALM_ID?:string},actor:Actor,p:any){
 await feeAuthority(env.DB,actor)
 if(p.acknowledged!==true)fail(400,'Explicitly approve sending this ledger to the configured QuickBooks sandbox.')
 const c=await operationCase(env.DB,text(p.caseId,'Dispute',255)),reviewId=text(p.reviewId,'Approved evidence review',100)
 const prior=await env.DB.prepare('SELECT * FROM pm_accounting_exports WHERE case_id=?').bind(c.id).first<AccountingExport>()
 if(prior)return prior
 const review=await env.DB.prepare('SELECT * FROM pm_payment_reviews WHERE id=? AND case_id=? AND approved_at IS NOT NULL').bind(reviewId,c.id).first<PaymentReview>()
 if(!review||!await env.DB.prepare('SELECT 1 FROM pm_payment_operation_custody WHERE review_id=?').bind(reviewId).first())fail(409,'A current installation approval is required; restored history cannot authorize a new accounting send.')
 const {state,version}=await load(env.DB),booking=bookingFor(state,c.booking_id)
 const guest=await env.DB.prepare('SELECT data FROM pm_guests WHERE id=?').bind(booking.guestId).first<{data:string}>()
 if(!guest||JSON.parse(guest.data).erased)fail(409,'Accounting sends are refused after guest erasure.')
 const ledger=JSON.parse(c.ledger) as CaseMoney[],journal=journalFor(c.id,ledger,p.accounts),exportId=id(),now=new Date().toISOString()
 // Reserve both the send and its owned follow-up before the network edge. A crash cannot lose the work.
 ownedTask(booking,actor,'accounting-'+exportId,now,'Review accounting export '+exportId+' for dispute '+c.id+'. Confirm the QuickBooks result using this stable request reference before any manual correction. No automatic retry is permitted.')
 try{await save(env.DB,state,version,[ownerFence(env.DB,actor),env.DB.prepare('INSERT INTO pm_accounting_exports(id,case_id,review_id,actor_id,created_at,journal,ledger,state,code,updated_at) VALUES(?,?,?,?,?,?,?,\'reserved\',\'pending\',?)').bind(exportId,c.id,reviewId,actor.id,now,JSON.stringify(journal),c.ledger,now),feeEvent(env.DB,actor,'payment.accounting-reserve',exportId,{caseId:c.id,reviewId},c.booking_id)])}catch(error){const concurrent=await env.DB.prepare('SELECT * FROM pm_accounting_exports WHERE case_id=?').bind(c.id).first<AccountingExport>();if(concurrent)return concurrent;throw error}
 const result=await postAccountingJournal(env,exportId,journal),current=await load(env.DB)
 await feeCommit(env.DB,actor,current.version,[env.DB.prepare('UPDATE pm_accounting_exports SET state=?,provider_id=?,code=?,trace_id=?,updated_at=? WHERE id=? AND state=\'reserved\'').bind(result.state,result.providerId,result.code,result.traceId,new Date().toISOString(),exportId),feeEvent(env.DB,actor,'payment.accounting-result',exportId,{caseId:c.id,...result},c.booking_id)])
 return env.DB.prepare('SELECT * FROM pm_accounting_exports WHERE id=?').bind(exportId).first<AccountingExport>()
}
