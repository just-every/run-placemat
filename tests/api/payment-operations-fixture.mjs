import assert from 'node:assert/strict'
import {feeEdge,feePolicyInput,feeApi,feeService,consentBooking} from './fee-fixture.mjs'
export const operationClock=Date.UTC(2026,10,4,12)
export const operationApi=(h,path,p,opts={})=>h.api('/api/payments/operations'+(path?'/'+path:''),p,opts)
export function operationEdge(){
 const fees=feeEdge(),disputes=new Map(),charges=new Map(),accountingCalls=[],stripeCalls=[]
 let accountingState='rejected'
 return {fees,accountingCalls,stripeCalls,setAccountingState(state){accountingState=state},
  dispute(bookingId,index=1){const id='synthetic-placemat-dispute-'+index,charge='synthetic-placemat-charge-'+index,created=Math.floor(operationClock/1000)
   charges.set(charge,{id:charge,object:'charge',livemode:false,paid:true,captured:true,currency:'usd',amount_captured:10000,created,metadata:{placemat_booking_id:bookingId},refunds:{has_more:false,data:[{id:'synthetic-placemat-refund-'+index,charge,currency:'usd',status:'succeeded',amount:1000,created}]}})
   disputes.set(id,{id,object:'dispute',livemode:false,charge,amount:9000,currency:'usd',reason:'product_not_received',status:'needs_response',evidence_details:{due_by:created+7*86400},balance_transactions:[{id:'synthetic-placemat-balance-'+index,object:'balance_transaction',currency:'usd',amount:-9000,created}]});return id
  },
  stripe:async request=>{const url=new URL(request.url),path=url.pathname;stripeCalls.push({path,method:request.method});if(path==='/v1/refunds'&&request.method==='GET')return Response.json({object:'list',...charges.get(url.searchParams.get('charge')).refunds});if(path.startsWith('/v1/disputes/')){assert.equal(request.method,'GET');return Response.json(disputes.get(path.split('/').at(-1))??{})}if(charges.has(path.split('/').at(-1))){assert.equal(request.method,'GET');return Response.json(charges.get(path.split('/').at(-1)))}return fees.edge(request)},
  accounting:async request=>{const url=new URL(request.url),body=await request.json();accountingCalls.push({url,body,method:request.method});assert.equal(request.method,'POST');assert.ok(url.searchParams.get('requestid'));if(accountingState==='unconfirmed')throw Error('Synthetic lost acceptance');return accountingState==='accepted'?Response.json({JournalEntry:{Id:'12345'}}):Response.json({Fault:{Error:[{code:'2500',Message:'synthetic secret body must not be retained'}]}},{status:400,headers:{intuit_tid:'synthetic-placemat-trace-1'}})},
 }
}
export async function operationBooking(h,edge,index=1){
 const {service}=await feeService(h,{startAt:new Date(operationClock+86400000).toISOString(),timezone:'Australia/Brisbane',tablePrefix:'Cedar'})
 const made=await h.api('/api/public/inquiries/create',{name:'Alex Rowan',email:'alex'+index+'@example.test',partySize:2,serviceId:service.id,requestedStartAt:service.startAt,message:'We are celebrating and accept an indoor table.'},{as:'',status:201})
 const offer=await h.command('inquiry.reply',{inquiryId:made.id,serviceId:service.id,startAt:service.startAt,message:'Your indoor table is available for two.'})
 await h.api('/api/public/inquiries/reply',{token:made.token,message:'We accept this exact table offer.',acceptOfferVersion:offer.offer.version},{as:''})
 const result=await h.command('inquiry.convert',{inquiryId:made.id}),booking=result.booking??result
 const policy=await feeApi(h,'fee-policy',feePolicyInput())
 await consentBooking(h,edge.fees,booking,policy,{acceptedAt:new Date(operationClock).toISOString()})
 await h.command('booking.status',{bookingId:booking.id,status:'arrived'})
 return {booking,policy,disputeId:edge.dispute(booking.id,index)}
}
export const operationBindings={STRIPE_SECRET_KEY:'synthetic-placemat-1',QBO_ACCESS_TOKEN:'synthetic-placemat-2',QBO_REALM_ID:'123456789'}
export const operationAccounts={clearing:'35',revenue:'79',disputes:'84'}
