import type {Bindings} from '../auth.server'
import {actorFor,originCheck,jsonBody} from './access'
import {Problem,fail} from './model'
import {feeAuthority} from './fee-policy'
import {readPaymentOperations,openPaymentCase,assemblePaymentCase,approvePaymentCase} from './payment-operations'
import {exportPaymentAccounting} from './payment-accounting'
import {paymentOperationsPage} from './payment-operations-view'

export async function paymentOperationsResponse(request:Request,env:Bindings):Promise<Response|null>{
 const url=new URL(request.url),path=url.pathname,prefix='/api/payments/operations'
 if(path!=='/payment-operations'&&path!==prefix&&!path.startsWith(prefix+'/'))return null
 const headers={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}
 try{
  const actor=await actorFor(request,env)
  if(!actor)fail(401,'Sign in with your personal venue owner account.')
  await feeAuthority(env.DB,actor!)
  if(request.method==='GET'){
   const view=await readPaymentOperations(env.DB,actor!)
   if(path==='/payment-operations')return paymentOperationsPage(view)
   if(path===prefix)return Response.json(view,{headers})
   let record:unknown,filename:string
   if(path===prefix+'/bundle'){
    const review=view.reviews.find(r=>r.id===url.searchParams.get('reviewId')&&r.approved_at)??fail(404,'Approved response not found.')
    record={case:view.cases.find(c=>c.id===review.case_id),review:{...review,evidence:JSON.parse(review.evidence)},submission:'Not sent. Submit separately after reviewing the current Stripe deadline.'};filename='dispute-response.json'
   }else if(path===prefix+'/journal'){
    const row=view.exports.find(e=>e.id===url.searchParams.get('exportId'))??fail(404,'Accounting export not found.')
    record={...row,journal:JSON.parse(row.journal),ledger:JSON.parse(row.ledger)};filename='accounting-journal.json'
   }else return Response.json({error:'Not found.'},{status:404,headers})
   return Response.json(record,{headers:{...headers,'content-disposition':'attachment; filename="'+filename+'"'}})
  }
  if(request.method!=='POST'||!path.startsWith(prefix+'/'))return Response.json({error:'Method not allowed.'},{status:405,headers})
  originCheck(request,env)
  const p=await jsonBody(request)
  const result=path===prefix+'/open'?await openPaymentCase(env,actor!,p):path===prefix+'/assemble'?await assemblePaymentCase(env.DB,actor!,p):path===prefix+'/approve'?await approvePaymentCase(env.DB,actor!,p):path===prefix+'/export'?await exportPaymentAccounting(env,actor!,p):fail(404,'Unknown payment operation.')
  return Response.json({result},{headers})
 }catch(error){return Response.json({error:error instanceof Problem?error.message:'Payment operation could not be saved. Review the existing record before trying again.'},{status:error instanceof Problem?error.status:503,headers})}
}
