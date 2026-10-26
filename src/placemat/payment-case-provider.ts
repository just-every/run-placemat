import {fail} from './model'
export type CaseMoney={id:string;kind:'charge'|'refund'|'dispute';amountCents:number;at:string}
const identifier=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=255
const amount=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>0&&Number(v)<=99999999
async function stripe(secret:string|undefined,path:string):Promise<any>{
 if(!secret)fail(503,'Configure Stripe before importing a dispute.')
 let r:Response
 try{r=await fetch('https://api.stripe.com/v1/'+path,{headers:{authorization:'Bearer '+secret},redirect:'manual',signal:AbortSignal.timeout(15000)})}catch{return fail(502,'Stripe did not confirm this dispute.')}
 if(!r.ok)fail(502,'Stripe did not confirm this dispute.')
 return r.json()
}
/** Read verified provider facts. This door never creates a charge or submits a response. */
export async function observeDispute(secret:string|undefined,disputeId:string,bookingId:string){
 const d=await stripe(secret,'disputes/'+encodeURIComponent(disputeId)+'?expand%5B%5D=balance_transactions')
 const chargeId=typeof d.charge==='string'?d.charge:d.charge?.id
 if(d.livemode!==false||d.object!=='dispute'||d.id!==disputeId||!identifier(chargeId)||!amount(d.amount)||d.currency!=='usd'||!identifier(d.reason)||!identifier(d.status)||!Number.isSafeInteger(d.evidence_details?.due_by))fail(409,'Stripe returned unsupported dispute facts.')
 const charge=await stripe(secret,'charges/'+encodeURIComponent(chargeId))
 if(charge.livemode!==false||charge.object!=='charge'||charge.id!==chargeId||!charge.paid||!charge.captured||!amount(charge.amount_captured)||charge.currency!=='usd'||charge.metadata?.placemat_booking_id!==bookingId||!Number.isSafeInteger(charge.created)||d.amount>charge.amount_captured)fail(409,'The disputed charge does not match this booking.')
 const at=(seconds:number)=>new Date(seconds*1000).toISOString()
 const ledger:CaseMoney[]=[{id:charge.id,kind:'charge',amountCents:charge.amount_captured,at:at(charge.created)}]
 const refunds:any[]=[];let cursor=''
 for(let page=0;page<20;page++){
  const list=await stripe(secret,'refunds?'+new URLSearchParams({charge:chargeId,limit:'100',...cursor?{starting_after:cursor}:{}}))
  if(list.object!=='list'||!Array.isArray(list.data)||typeof list.has_more!=='boolean')fail(409,'Stripe did not confirm complete refund history.')
  refunds.push(...list.data)
  if(!list.has_more)break
  if(!list.data.length||page===19||!identifier(list.data.at(-1).id))fail(409,'Refund history exceeds this review; no dispute was imported.')
  cursor=list.data.at(-1).id
 }
 for(const r of refunds){
  if(r.status!=='succeeded')continue
  if(!identifier(r.id)||r.charge!==chargeId||r.currency!=='usd'||!amount(r.amount)||!Number.isSafeInteger(r.created))fail(409,'Stripe returned inconsistent refund facts.')
  ledger.push({id:r.id,kind:'refund',amountCents:r.amount,at:at(r.created)})
 }
 if(ledger.filter(r=>r.kind==='refund').reduce((n,r)=>n+r.amountCents,0)>charge.amount_captured)fail(409,'Stripe refund amounts exceed the captured charge.')
 if(!Array.isArray(d.balance_transactions)||!d.balance_transactions.length)fail(409,'The dispute needs a verified balance withdrawal before accounting export.')
 let withdrawn=0
 for(const b of d.balance_transactions){
  if(!identifier(b.id)||b.object!=='balance_transaction'||b.currency!=='usd'||!Number.isSafeInteger(b.amount)||b.amount>=0||!Number.isSafeInteger(b.created))fail(409,'Dispute reversals require manual accounting review; no export was created.')
  withdrawn-=b.amount;ledger.push({id:b.id,kind:'dispute',amountCents:-b.amount,at:at(b.created)})
 }
 if(withdrawn!==d.amount||new Set(ledger.map(v=>v.id)).size!==ledger.length)fail(409,'The dispute withdrawal does not reconcile; review it at Stripe.')
 return {id:d.id,chargeId,amountCents:d.amount,currency:'usd',reason:d.reason,status:d.status,dueAt:at(d.evidence_details.due_by),ledger}
}
