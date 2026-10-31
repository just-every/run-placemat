import {fail,id,text,Problem,type Actor} from './model'
import {recordMoneyAttribution} from './audit'
import {load,save} from './store'
import {moneySettlements} from './money-ledger-archive.mjs'
import {verifyStripeEventBytes,type RefundWebhookBindings} from './refund-events'

type Item={source_id:string;kind:'charge'|'refund';charge_id:string;booking_id:string|null;amount_cents:number;currency:'usd';recorded_at:string}
type Settlement={id:string;source:string;amount:number;fee:number;net:number;currency:'usd'}
type Payout={id:string;amount_cents:number;currency:'usd';items:string;actor_id:string;recorded_at:string}
type Adjustment={id:string;payout_id:string;transaction_id:string;booking_id:string;actor_id:string;recorded_at:string}
const identifier=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=255
const cents=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&Math.abs(v)<=99999999
const reply=(status:number,value:unknown)=>Response.json(value,{status,headers:{'cache-control':'no-store'}})
async function owner(db:D1Database,actor:Actor){
 if(actor.role!=='owner'||actor.agent||actor.deviceId||!await db.prepare("SELECT 1 FROM oa_operators WHERE id=? AND role='owner' AND status='active'").bind(actor.id).first())fail(403,'A personal owner must review this ledger.')
}
const ownerFence=(db:D1Database,actor:Actor)=>db.prepare("INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND role='owner' AND status='active') THEN 1 ELSE 0 END").bind(actor.id)
async function commit(db:D1Database,statements:D1PreparedStatement[]){
 try{await db.batch(statements)}catch{fail(409,'Ledger authority or facts changed. Reload before recording another adjustment.')}
}
const bookingFence=(db:D1Database,bookingId:string)=>db.prepare("INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_state s,json_each(s.data,'$.bookings') b WHERE s.id=1 AND json_extract(b.value,'$.id')=?) THEN 1 ELSE 0 END").bind(bookingId)

/** Signed successful economic facts only. Refunds may arrive before their charge; no provider writes occur. */
export async function moneyWebhook(env:RefundWebhookBindings,request:Request){
 if(request.method!=='POST')return reply(405,{error:'Method not allowed.'})
 if(!env.STRIPE_WEBHOOK_SECRET)return reply(503,{error:'Ledger verification is not configured.'})
 try{
  const raw=await verifyStripeEventBytes(request,env.STRIPE_WEBHOOK_SECRET)
  if(!raw)return reply(400,{error:'Invalid ledger signature.'})
  const event=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)),v=event?.data?.object
  if(!identifier(event?.id)||!identifier(event.type))return reply(400,{error:'Invalid ledger event.'})
  if(!['charge.succeeded','refund.created','refund.updated'].includes(event.type))return reply(200,{received:true,ignored:true})
  const kind=event.type==='charge.succeeded'?'charge':'refund'
  if(kind==='refund'&&v?.status!=='succeeded')return reply(200,{received:true,ignored:true})
  const amount=kind==='charge'?v?.amount_captured:v?.amount,chargeId=kind==='charge'?v?.id:v?.charge
  if(v?.object!==kind||!identifier(v.id)||!identifier(chargeId)||v.currency!=='usd'||!cents(amount)||amount<=0||kind==='charge'&&(v.paid!==true||v.captured!==true)||v.metadata?.placemat_booking_id!=null&&!identifier(v.metadata.placemat_booking_id))return reply(400,{error:'Invalid ledger money fact.'})
  const bookingId=v.metadata?.placemat_booking_id??null,now=new Date().toISOString(),db=env.DB
  // Conflicting replays cannot silently replace either an amount or a booking association.
  await db.batch([
   db.prepare("INSERT INTO pm_money_items(source_id,kind,charge_id,booking_id,amount_cents,currency,recorded_at) VALUES(?,?,?,?,?,'usd',?) ON CONFLICT(source_id) DO NOTHING").bind(v.id,kind,chargeId,bookingId,amount,now),
   db.prepare("INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_money_items WHERE source_id=? AND kind=? AND charge_id=? AND booking_id IS ? AND amount_cents=?) AND NOT EXISTS(SELECT 1 FROM pm_money_receipts WHERE event_id=? AND source_id!=?) THEN 1 ELSE 0 END").bind(v.id,kind,chargeId,bookingId,amount,event.id,v.id),
   db.prepare('INSERT INTO pm_money_receipts(event_id,source_id,received_at) VALUES(?,?,?) ON CONFLICT(event_id) DO NOTHING').bind(event.id,v.id,now),
   db.prepare('DELETE FROM pm_assertions')])
  return reply(200,{received:true})
 }catch{return reply(409,{error:'Ledger event could not be reconciled. Redeliver or review the conflicting fact.'})}
}
async function stripe(secret:string|undefined,path:string){
 if(!secret)fail(503,'Stripe reconciliation is not configured.')
 let response:Response
 try{response=await fetch('https://api.stripe.com/v1/'+path,{headers:{authorization:'Bearer '+secret},redirect:'manual',signal:AbortSignal.timeout(15000)})}catch{return fail(502,'Stripe reconciliation is unavailable.')}
 if(!response.ok)fail(502,'Stripe did not confirm this settlement.')
 return await response.json() as any
}
function settlement(v:any):Settlement{
 if(v?.object!=='balance_transaction'||!identifier(v.id)||!identifier(v.source)||v.currency!=='usd'||!cents(v.amount)||!cents(v.fee)||v.fee<0||!cents(v.net)||v.net!==v.amount-v.fee)fail(409,'Stripe settlement contains an unsupported money item.')
 return {id:v.id,source:v.source,amount:v.amount,fee:v.fee,net:v.net,currency:'usd'}
}
/** Read the complete provider settlement explicitly; a bounded incomplete list is refused, never saved. */
export async function importPayout(env:RefundWebhookBindings,actor:Actor,p:any){
 await owner(env.DB,actor)
 const payoutId=text(p.payoutId,'Payout',255),v=await stripe(env.STRIPE_SECRET_KEY,'payouts/'+encodeURIComponent(payoutId))
 if(v?.object!=='payout'||v.id!==payoutId||v.currency!=='usd'||v.status!=='paid'||!cents(v.amount)||v.amount<=0)fail(409,'Stripe must confirm a paid USD payout.')
 const items:Settlement[]=[],seen=new Set<string>();let cursor=''
 for(let page=0;page<20;page++){
  const list=await stripe(env.STRIPE_SECRET_KEY,'balance_transactions?'+new URLSearchParams({payout:payoutId,limit:'100',...cursor?{starting_after:cursor}:{}}))
  if(list?.object!=='list'||!Array.isArray(list.data)||typeof list.has_more!=='boolean')fail(409,'Stripe did not return a complete settlement.')
  for(const raw of list.data){const item=settlement(raw);if(seen.has(item.id))fail(409,'Stripe repeated a settlement item.');seen.add(item.id);items.push(item)}
  if(!list.has_more)break
  if(!list.data.length||page===19)fail(409,'Settlement exceeds the supported review size; nothing was recorded.')
  cursor=items.at(-1)!.id
 }
 items.sort((a,b)=>a.id.localeCompare(b.id))
 if(items.reduce((n,item)=>n+item.net,0)!==v.amount)fail(409,'Settlement net does not equal the payout; nothing was recorded.')
 const encoded=JSON.stringify(items),db=env.DB
 await commit(db,[ownerFence(db,actor),db.prepare("INSERT INTO pm_money_payouts(id,amount_cents,currency,items,actor_id,recorded_at) VALUES(?,?,'usd',?,?,?) ON CONFLICT(id) DO NOTHING").bind(payoutId,v.amount,encoded,actor.id,new Date().toISOString()),db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_money_payouts WHERE id=? AND amount_cents=? AND items=?) THEN 1 ELSE 0 END').bind(payoutId,v.amount,encoded),db.prepare('DELETE FROM pm_assertions')])
 return readMoneyLedger(db,actor)
}
export async function readMoneyLedger(db:D1Database,actor:Actor){
 await owner(db,actor)
 const [items,payouts,adjustments]=await db.batch<Item|Payout|Adjustment>([db.prepare('SELECT * FROM pm_money_items ORDER BY recorded_at,source_id'),db.prepare('SELECT * FROM pm_money_payouts ORDER BY recorded_at,id'),db.prepare('SELECT * FROM pm_money_adjustments ORDER BY recorded_at,id')])
 const facts=items.results as Item[],corrections=adjustments.results as Adjustment[]
 const bookings=new Set((await db.prepare("SELECT json_extract(b.value,'$.id') AS id FROM pm_state s,json_each(s.data,'$.bookings') b WHERE s.id=1").all<{id:string}>()).results.map(b=>b.id))
 const bookingFor=(fact:Item|undefined)=>{const booking=fact?.booking_id??facts.find(c=>c.kind==='charge'&&c.source_id===fact?.charge_id)?.booking_id;return booking&&bookings.has(booking)?booking:null}
 const settlements=moneySettlements(facts,payouts.results as Payout[],corrections,[...bookings])
 return {items:facts.map(f=>({...f,resolvedBookingId:bookingFor(f)})),payouts:settlements,adjustments:corrections}
}
/** A correction adds attribution only. No historical amount, provider reference or prior fact can be edited. */
export async function adjustMoneyLedger(db:D1Database,actor:Actor,p:any){
 await owner(db,actor)
 const payoutId=text(p.payoutId,'Payout',255),transactionId=text(p.transactionId,'Settlement transaction',255),bookingId=text(p.bookingId,'Booking',100)
 if(!await db.prepare("SELECT 1 FROM pm_state s,json_each(s.data,'$.bookings') b WHERE s.id=1 AND json_extract(b.value,'$.id')=?").bind(bookingId).first())fail(409,'Choose an existing booking for this adjustment.')
 const ledger=await readMoneyLedger(db,actor),payout=ledger.payouts.find(row=>row.id===payoutId)
 if(!payout||!payout.unmatched.includes(transactionId))fail(409,'Only an unmatched settlement item may receive a new attribution adjustment.')
 const item=payout!.items.find(row=>row.id===transactionId)!,adjustmentId=id(),now=new Date().toISOString()
 const reason=p.reason==null?undefined:text(p.reason,'Attribution reason',1000)
 const {state,version}=await load(db)
 const booking=state.bookings.find(b=>b.id===bookingId)??fail(409,'Choose an existing booking for this adjustment.')
 if(reason&&await db.prepare("SELECT 1 FROM pm_guests WHERE id=? AND json_extract(data,'$.erased')=1").bind(booking.guestId).first())fail(409,'An erased guest can retain financial references only.')
 recordMoneyAttribution(state,actor,now,payoutId,adjustmentId,item,bookingId,reason)
 try{
  await save(db,state,version,[ownerFence(db,actor),bookingFence(db,bookingId),db.prepare('INSERT INTO pm_money_adjustments(id,payout_id,transaction_id,booking_id,actor_id,recorded_at) VALUES(?,?,?,?,?,?)').bind(adjustmentId,payoutId,transactionId,bookingId,actor.id,now)])
 }catch(error){
  if(error instanceof Problem)throw error
  fail(409,'Ledger authority or facts changed. Reload before recording another adjustment.')
 }
 return readMoneyLedger(db,actor)
}
