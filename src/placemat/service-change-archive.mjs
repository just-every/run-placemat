/** Portable service decisions retain accountability, never executable guest capabilities. */
export function portableServiceChanges(changes){
 return (changes??[]).map(change=>({...change,tasks:change.tasks.map(task=>({...task,...task.relocation?{relocation:Object.fromEntries(Object.entries(task.relocation).filter(([key])=>key!=='tokenHash'))}:{}}))}));
}
export function validateServiceDecisions(state){
 const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
 for(const b of state.bookings)if(b.closureEmailConsent!==undefined&&(!date(b.closureEmailConsent.at)||typeof b.closureEmailConsent.emailHash!=='string'||!/^[a-f0-9]{64}$/.test(b.closureEmailConsent.emailHash)||b.closureEmailConsent.source!=='guest-supplied'))throw Error('Invalid booking contact permission');
 const ids=new Set();
 for(const change of state.serviceChanges??[])for(const task of change.tasks){
  if(ids.has(task.id))throw Error('Duplicate affected booking task');ids.add(task.id);
  const b=state.bookings.find(b=>b.id===task.bookingId),offer=task.relocation;
  if(offer){
   if(!offer.id||!date(offer.reviewedAt)||!date(offer.expiresAt)||typeof offer.reviewedBy!=='string'||typeof offer.reason!=='string'||offer.tokenHash!==undefined||offer.acceptedAt!==undefined&&!date(offer.acceptedAt)||offer.declinedAt!==undefined&&!date(offer.declinedAt)||offer.acceptedAt&&offer.declinedAt)throw Error('Invalid portable relocation offer');
   for(const row of [offer.before,offer.after])if(!row||row.id!==b.id||row.guestId!==b.guestId||!state.services.some(s=>s.id===row.serviceId)||!Array.isArray(row.tableIds)||!row.tableIds.length||row.tableIds.some(id=>!state.tables.some(t=>t.id===id))||!date(row.startAt)||!date(row.endAt)||row.startAt>=row.endAt||row.partySize!==offer.before.partySize)throw Error('Broken relocation relationship');
  }
  if(task.outreach&&(!offer||typeof task.outreach.id!=='string'||typeof task.outreach.actor!=='string'||!date(task.outreach.at)||!['sending','accepted','unconfirmed','guest-opened'].includes(task.outreach.state)))throw Error('Invalid service outreach outcome');
  if(task.cancellation&&(!date(task.cancellation.at)||typeof task.cancellation.actor!=='string'||typeof task.cancellation.reason!=='string'||!Number.isSafeInteger(task.cancellation.amountCents)||task.cancellation.amountCents<0||b.status!=='cancelled'||task.cancellation.amountCents>0&&!task.cancellation.refundId))throw Error('Invalid affected booking cancellation');
 }
}
