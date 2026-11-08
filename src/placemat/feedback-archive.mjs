const bad=()=>{throw Object.assign(new Error('Invalid feedback history. Nothing was restored.'),{status:400})}
const string=(v,max=255)=>typeof v==='string'&&v.trim().length>0&&v.length<=max
const instant=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))
const optionalInstant=v=>v===null||instant(v)
const optionalId=v=>v===null||string(v)

/** Preserve consent evidence throughout snapshots without transporting permission to send. */
export function portableFeedbackState(state){
 const walk=value=>{
  if(!value||typeof value!=='object')return
  if(Array.isArray(value)){for(const item of value)walk(item);return}
  for(const [key,item] of Object.entries(value)){
   if(key==='feedbackEmailConsent'&&item&&typeof item==='object'&&!Array.isArray(item))item.historical=true
   walk(item)
  }
 }
 walk(state)
 return state
}

/** Feedback history travels without settings, bearer credentials or sending authority. */
export async function validateFeedback(read,rows,guests){
 const [visits,messages]=await Promise.all(['pm_feedback_visits','pm_feedback_messages'].map(read))
 const state=rows[0]?JSON.parse(rows[0].data):{bookings:[]}
 if(!Array.isArray(state.bookings))bad()
 const validateConsent=value=>{
  if(!value||typeof value!=='object')return
  if(Array.isArray(value)){for(const item of value)validateConsent(item);return}
  for(const [key,item] of Object.entries(value)){
   if(key==='feedbackEmailConsent'&&(!item||typeof item!=='object'||Array.isArray(item)||!instant(item.at)||typeof item.emailHash!=='string'||!/^[a-f0-9]{64}$/.test(item.emailHash)||item.source!=='guest-supplied'||item.historical!==true))bad()
   validateConsent(item)
  }
 }
 validateConsent(state)
 const bookings=new Map(state.bookings.map(b=>[b.id,b])),people=new Map(guests.map(g=>[g.id,JSON.parse(g.data)]))
 const ids=new Map(),bookingIds=new Set(),messageIds=new Set(),requests=new Set(),acceptedReplies=new Set()
 for(const v of visits){
  const booking=bookings.get(v.booking_id),guest=people.get(v.guest_id)
  if(!string(v.id)||ids.has(v.id)||!booking||bookingIds.has(v.booking_id)||booking.guestId!==v.guest_id||!guest||guest.erased||!/^\d{4}-\d{2}-\d{2}$/.test(v.visit_date)||!instant(v.visit_date)||new Date(v.visit_date).toISOString().slice(0,10)!==v.visit_date||!['claimed','accepted','unconfirmed','suppressed'].includes(v.invite_state)||!instant(v.created_at)||!optionalInstant(v.submitted_at)||!optionalInstant(v.withdrawn_at)||typeof v.comment!=='string'||v.comment.length>4000||typeof v.outcome!=='string'||v.outcome.length>2000)bad()
  if(v.rating===null){if(v.submitted_at!==null||v.comment!==''||v.case_state!==null)bad()}
  else if(!Number.isInteger(v.rating)||v.rating<1||v.rating>5||!instant(v.submitted_at)||Date.parse(v.submitted_at)<Date.parse(v.created_at))bad()
  if(!optionalId(v.provider_id)||!optionalInstant(v.assigned_at)||v.withdrawn_at!==null&&Date.parse(v.withdrawn_at)<Date.parse(v.created_at))bad()
  if(v.case_state===null){
   if(v.assignee_id!==null||v.assigned_by!==null||v.assigned_at!==null||v.due_at!==null||v.closed_by!==null||v.closed_at!==null||v.outcome!==''||v.rating!==null&&v.rating<=2)bad()
  }else{
   if(!['open','closed'].includes(v.case_state)||v.rating===null||v.rating>2||!string(v.assignee_id)||!string(v.assigned_by)||!instant(v.assigned_at)||Date.parse(v.assigned_at)<Date.parse(v.submitted_at)||!instant(v.due_at))bad()
   if(v.case_state==='open'&&(v.closed_by!==null||v.closed_at!==null||v.outcome!==''))bad()
   if(v.case_state==='closed'&&(!string(v.closed_by)||!instant(v.closed_at)||Date.parse(v.closed_at)<Date.parse(v.submitted_at)||!string(v.outcome,2000)))bad()
  }
  ids.set(v.id,v);bookingIds.add(v.booking_id)
 }
 for(const m of messages){
  const visit=ids.get(m.visit_id)
  if(!string(m.id)||messageIds.has(m.id)||!visit||visit.rating===null||!string(m.message,4000)||!instant(m.at)||Date.parse(m.at)<Date.parse(visit.submitted_at)||!optionalId(m.actor_id)||!optionalId(m.request_id)||!optionalId(m.provider_id))bad()
  if(m.author==='guest'){
   if(m.actor_id!==null||m.request_id!==null||m.provider_id!==null||m.state!=='recorded')bad()
  }else if(m.author==='manager'){
   if(!string(m.actor_id)||!string(m.request_id)||!['pending','accepted','unconfirmed'].includes(m.state)||requests.has(m.request_id))bad()
   requests.add(m.request_id)
   if(m.state==='accepted')acceptedReplies.add(m.visit_id)
  }else bad()
  messageIds.add(m.id)
 }
 for(const v of visits)if(v.case_state==='closed'&&!acceptedReplies.has(v.id))bad()
}
