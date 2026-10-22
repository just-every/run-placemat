const invalid=message=>{throw Object.assign(new Error(message+'. Nothing was restored; correct the source records and download a fresh backup.'),{status:400})}
/** A restored follow-up must retain its real assignment and terminal history. */
export function validateHandover(state){
 const text=value=>typeof value==='string'&&value.trim().length>0;
 const instant=value=>typeof value==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(value)&&Number.isFinite(Date.parse(value));
 for(const booking of state.bookings){
  if(booking.handover===undefined)continue;
  if(!Array.isArray(booking.handover)||booking.handover.length>40)invalid('Invalid handover tasks');
  const ids=new Set();
  for(const task of booking.handover){
   if(!task||!text(task.id)||ids.has(task.id)||!['request','callback'].includes(task.kind)||!text(task.text)||task.text.length>1000||!text(task.ownerId)||!instant(task.dueAt)||!Array.isArray(task.history)||!task.history.length)invalid('Invalid handover task');
   ids.add(task.id);let assignment,completed=false;
   for(const event of task.history){
    if(!event||completed||!text(event.actor)||!instant(event.at))invalid('Invalid handover history');
    if(event.action==='assigned'){
     if(!text(event.ownerId)||!instant(event.dueAt))invalid('Invalid handover assignment');
     assignment=event;
    }else if(event.action==='completed'&&assignment&&text(event.outcome)&&event.outcome.length<=1000)completed=true;
    else invalid('Invalid handover history');
   }
   if(!assignment||assignment.ownerId!==task.ownerId||assignment.dueAt!==task.dueAt)invalid('Invalid handover ownership');
  }
 }
}
