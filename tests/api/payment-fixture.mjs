import assert from 'node:assert/strict'
export function paymentEdge(){
 const calls=[],sessions=new Map(),charges=new Map(),refunds=new Map(),keys=new Map();let refundStatus='succeeded';
 const edge=async request=>{
  const u=new URL(request.url),body=request.method==='POST'?new URLSearchParams(await request.text()):null;calls.push({path:u.pathname,method:request.method,body});
  if(request.method==='POST'&&u.pathname==='/v1/checkout/sessions'){
   const key=request.headers.get('idempotency-key');if(keys.has(key))return Response.json(keys.get(key));
   const row={object:'checkout.session',id:`synthetic-placemat-session-${sessions.size+1}`,mode:'payment',client_reference_id:body.get('client_reference_id'),metadata:{request_id:body.get('metadata[request_id]'),booking_id:body.get('metadata[booking_id]')},amount_total:Number(body.get('line_items[0][price_data][unit_amount]')),currency:'usd',expires_at:Number(body.get('expires_at')),payment_status:'unpaid',status:'open',url:`https://checkout.stripe.com/c/pay/synthetic-placemat-${sessions.size+1}`};sessions.set(row.id,row);keys.set(key,row);return Response.json(row);
  }
  if(request.method==='GET'&&u.pathname.startsWith('/v1/checkout/sessions/'))return Response.json(sessions.get(decodeURIComponent(u.pathname.split('/').at(-1))));
  if(request.method==='GET'&&u.pathname.startsWith('/v1/charges/')){const row=charges.get(decodeURIComponent(u.pathname.split('/').at(-1)));assert.ok(row,'Only a fixture-owned Stripe charge can be synchronized');return Response.json(row)}
  if(request.method==='POST'&&u.pathname==='/v1/refunds'){
   const key=request.headers.get('idempotency-key');if(keys.has(key))return Response.json(keys.get(key));
   const row={object:'refund',id:`synthetic-placemat-refund-${refunds.size+1}`,charge:body.get('charge'),amount:Number(body.get('amount')),currency:'usd',metadata:{placemat_refund_id:body.get('metadata[placemat_refund_id]'),placemat_booking_id:body.get('metadata[placemat_booking_id]')},status:refundStatus};refunds.set(row.id,row);keys.set(key,row);return Response.json(row);
  }
  if(request.method==='GET'&&u.pathname.startsWith('/v1/refunds/'))return Response.json(refunds.get(decodeURIComponent(u.pathname.split('/').at(-1))));
  throw Error('Unexpected Stripe network edge '+request.method+' '+u.pathname);
 };
 return {edge,calls,sessions,refunds,charges,completeCheckout(id){const session=sessions.get(id);assert.ok(session);if(session.payment_status==='paid')return session.charge;session.payment_status='paid';session.status='complete';session.charge=`synthetic-placemat-charge-${charges.size+1}`;charges.set(session.charge,{object:'charge',id:session.charge,currency:'usd',paid:true,captured:true,amount_captured:session.amount_total,amount_refunded:0,metadata:{placemat_booking_id:session.metadata.booking_id}});return session.charge},setRefundStatus(value){refundStatus=value},charge(bookingId,amount=15000){const id=`synthetic-placemat-charge-${charges.size+1}`;charges.set(id,{object:'charge',id,currency:'usd',paid:true,captured:true,amount_captured:amount,amount_refunded:0,metadata:{placemat_booking_id:bookingId}});return id}};
}
