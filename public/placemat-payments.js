import {feeWork} from './placemat-fees.js';
const usd = cents => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(cents / 100);
const committed = refund => ['pending','succeeded'].includes(refund.status);
function checkoutUrl(value) {
 if (!value) return '';
 try {
  const url = new URL(value);
  return url.protocol === 'https:' && url.hostname === 'checkout.stripe.com' && !url.username && !url.password && !url.port ? url.href : '';
 } catch { return ''; }
}

/** Uses the same command forms as the staff app; money inputs are integer USD cents. */
export function paymentWork({state,actor,paymentRequests=[],refundCharges=[],refunds=[],refundNotices=[],refundFollowups=[],bookingContacts={},feeWork:fees,people=[]},{esc,form,field,select,time,guest}) {
 const fullManager = actor && !actor.agent && !actor.deviceId && ['owner','admin'].includes(actor.role);
 const host = actor && !actor.agent && actor.role === 'host' && (state.hostIds || []).includes(actor.id);
 if (!fullManager && !host) return '';
 const owner = fullManager && actor.role === 'owner';
 const limit = state.managerRefundLimits?.[actor.id];
 const canRefund = fullManager && (owner || Number.isSafeInteger(limit) && limit >= 0);
 const hidden = (name,value) => `<input type="hidden" name="${name}" value="${esc(value)}">`;
 const bookingName = bookingId => {
  const booking = state.bookings.find(b => b.id === bookingId);
  return booking ? `${guest(booking.guestId)?.name || 'Erased guest'} · ${time(booking.startAt)}` : bookingId;
 };
 const personName = personId => people.find(p => p.id === personId)?.displayName || personId;
 const ownUsed = bookingId => refunds.filter(r => r.bookingId === bookingId && r.actorId === actor.id && committed(r)).reduce((sum,r) => sum + r.amountCents,0);
 const chargeUsed = chargeId => refunds.filter(r => r.chargeId === chargeId && committed(r)).reduce((sum,r) => sum + r.amountCents,0);
 const bookingChoices = state.bookings.map(b => [b.id,bookingName(b.id)]);
 const activeBookings = state.bookings.filter(b => ['booked','seated'].includes(b.status) && !paymentRequests.some(r => r.bookingId === b.id));
 const followupOwners = people.filter(p => p.status === 'active' && (['owner','admin'].includes(p.role) || (state.hostIds || []).includes(p.id)));
 const createRequest = fullManager && activeBookings.length ? `<details><summary>Create deposit request</summary><p class="help">Choose the deposit and its pay-by deadline. A host can then create a Stripe-hosted link to copy and share with the guest.</p>${form('payment.request',
  select('Guest reservation','bookingId',activeBookings.map(b => [b.id,bookingName(b.id)]))
  + field('Deposit amount (USD cents)','amountCents','number','','required min="50" max="99999999" step="1"')
  + field(`Pay-by deadline (${state.venue.timezone})`,'dueAt','datetime-local','','required')
  + field('Deadline UTC offset (only for repeated time)','startOffset')
  + select('Deposit follow-up owner','followupOwnerId',followupOwners.map(p => [p.id,p.displayName]),actor.id)
  + field('Deposit reason','reason','text','','required maxlength="500"'),
  'Save deposit request',!followupOwners.length)}${!followupOwners.length?'<p>Choose an active host or manager before creating a deposit request.</p>':''}</details>` : '';
 const requestRows = paymentRequests.map(request => {
  const url = checkoutUrl(request.providerUrl);
  return `<article class="card" data-payment-request="${esc(request.requestId)}"><h4>${esc(bookingName(request.bookingId))}</h4><p>${esc(usd(request.amountCents))} deposit · ${esc(request.state)}<br>Due ${esc(time(request.dueAt))}<br>Follow-up owner: ${esc(personName(request.followupOwnerId))}</p>${url?`<p><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open Stripe-hosted payment link</a></p>${field('Payment link to copy','paymentLink','url',url,'readonly')}`:''}<div class="actions">${request.state==='unpaid'?form('payment.link',hidden('requestId',request.requestId),url?'Retrieve saved payment link':'Create payment link'):''}${form('payment.sync',hidden('requestId',request.requestId),'Check payment status')}${fullManager?form('payment.close',hidden('requestId',request.requestId),'Close unpaid Checkout'):''}</div><p class="help">Keep the reservation while collection is open or uncertain. Closing unpaid Checkout requires Stripe’s final status; cancel the reservation separately afterward.</p></article>`;
 }).join('');
 let financial = '';
 if (fullManager) {
  const authority = owner ? 'Owner refund authority is uncapped.' : canRefund ? `Your refund authority is ${usd(limit)} per booking, including your pending and succeeded refunds across all its charges.` : 'No refund authority is recorded for you. An owner must set a limit before you can submit refunds.';
  const chargeSync = owner && bookingChoices.length ? `<details><summary>Synchronize Stripe charge</summary><p class="help">Use an existing captured USD charge whose Stripe metadata identifies this reservation.</p>${form('payment.charge-sync',select('Guest reservation','bookingId',bookingChoices)+field('Stripe charge reference','chargeId','text','','required maxlength="200"'),'Synchronize charge')}</details>` : '';
  const charges = refundCharges.map(charge => {
   const balance = Math.max(0,charge.amountCents-charge.importedRefundedCents-chargeUsed(charge.chargeId));
   const remaining = owner ? balance : canRefund ? Math.max(0,Math.min(balance,limit-ownUsed(charge.bookingId))) : 0;
   const newRefund = canRefund && remaining > 0 ? `<details><summary>Refund this charge</summary>${form('payment.refund',
    hidden('bookingId',charge.bookingId)+hidden('chargeId',charge.chargeId)+hidden('requestId',crypto.randomUUID())
    + field('Refund amount (USD cents)','amountCents','number','','required min="1" max="'+remaining+'" step="1"')
    + field('Refund reason','reason','text','','required maxlength="500"'),'Submit refund')}</details>` : '';
   return `<article class="card" data-refund-charge="${esc(charge.chargeId)}"><h4>${esc(bookingName(charge.bookingId))}</h4><p>Captured ${esc(usd(charge.amountCents))} · ${esc(usd(balance))} remaining after recorded and pending refunds.<br>Charge: ${esc(charge.chargeId)}${!owner&&canRefund?`<br>Your pending and succeeded refunds for this booking: ${esc(usd(ownUsed(charge.bookingId)))}`:''}</p>${newRefund}</article>`;
  }).join('');
  const history = refunds.slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map(refund => {
   const replay = canRefund && refund.actorId === actor.id && refund.status === 'pending' ? form('payment.refund',
    hidden('bookingId',refund.bookingId)+hidden('chargeId',refund.chargeId)+hidden('requestId',refund.requestId)
    + hidden('amountCents',refund.amountCents)+hidden('reason',refund.reason),'Reconcile pending refund') : '';
   const notice=refundNotices.find(n=>n.refundId===refund.id&&n.outcome===refund.status);
   const booking=state.bookings.find(b=>b.id===refund.bookingId),profile=booking&&guest(booking.guestId);
   const contact=bookingContacts[refund.bookingId]||profile;
   const contactEmail=!profile?.erased&&contact?.email||'';
   const deliveryTask=booking?.handover?.find(t=>t.id===notice?.followupTaskId);
   const completedDelivery=deliveryTask?.history?.findLast(e=>e.action==='completed');
   const deliveryHelp=profile?.erased?'Delivery follow-up removed with guest erasure. The retained refund outcome remains.':completedDelivery?`Delivery follow-up completed by ${esc(personName(completedDelivery.actor))}. Human outcome: ${esc(completedDelivery.outcome)}. This records the person's observation, not provider mailbox delivery.`:deliveryTask?`Delivery follow-up owner: ${esc(personName(deliveryTask.ownerId))}. Due ${esc(time(deliveryTask.dueAt))} while mailbox delivery is unconfirmed or bounced. Confirm receipt with the guest and record the human outcome in Guest requests &amp; promised callbacks.`:'No delivery follow-up is present in this view.';

   const notification=owner?(notice?`<p>Email notice: ${esc(notice.state==='accepted'?'Provider accepted; mailbox delivery unconfirmed':notice.state==='sending'?'Attempt in progress or unconfirmed; contact the guest directly':'Acceptance unconfirmed; contact the guest directly')} · ${esc(time(notice.requestedAt))}</p><p class="help">${deliveryHelp}</p>`:contactEmail?form('payment.refund-notice',hidden('refundId',refund.id)+hidden('outcome',refund.status)+hidden('expectedContactEmail',contactEmail)+`<p>Reviewed refund outcome: ${esc(refund.status)} · ${esc(usd(refund.amountCents))}. Email to ${esc(contactEmail)}.</p>`+'<label><input type="checkbox" name="acknowledged" required> Email this saved refund outcome once to the reviewed reservation contact.</label>','Send refund outcome email'):`<p class="help">Refund notice unavailable: ${profile?.erased?'the guest contact was erased':'record and review a reservation contact email first'}.</p>`):'';
   return `<article class="card" data-refund-id="${esc(refund.id)}"><h4>${esc(bookingName(refund.bookingId))} · ${esc(usd(refund.amountCents))}</h4><p>${esc(refund.status)} · Submitted by ${esc(personName(refund.actorId))}<br>${esc(time(refund.createdAt))}<br>${esc(refund.reason)}</p>${replay}${notification}</article>`;
  }).join('');
  const followups=refundFollowups.map(t=>`<article class="card" data-refund-followup="${esc(t.refundId)}"><h4>${esc(bookingName(t.bookingId))} · ${esc(usd(t.amountCents))}</h4><p>${esc(t.state)} · ${esc(t.failureStatus)} refund<br>Follow-up owner: ${esc(personName(t.ownerId))}<br>Created ${esc(time(t.createdAt))}</p><p>${esc(t.reason)}</p><p class="help">Contact the guest and review the processor outcome. This task never submits another refund.</p></article>`).join('');
  financial = `<section aria-label="Refunds"><h3>Refunds</h3><p>${esc(authority)}</p>${chargeSync}<h4>Confirmed booking charges</h4>${charges||'<p>No Stripe charges have been synchronized.</p>'}<h4>Refund history</h4>${history||'<p>No refunds submitted.</p>'}<h4>Failed refund follow-up</h4>${followups||'<p>No failed refunds need follow-up.</p>'}</section>`;
 }
 return `<section aria-label="Deposits and refunds"><h3>Reservation deposits</h3><p class="help">Amounts are in USD. Payment links open Stripe-hosted checkout; staff copy and share them with the guest. A saved link does not record delivery or payment.</p>${createRequest}${requestRows||'<p>No deposit requests for these reservations.</p>'}${owner?feeWork({state,work:fees,bookingName,personName},{esc,form,field,select,time}):''}${owner?'<p><a href="/payment-operations">Open disputes and accounting work</a></p>':''}${financial}</section>`;
}
