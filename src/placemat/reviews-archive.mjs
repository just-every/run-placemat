const bad=()=>{throw Object.assign(new Error('Invalid review history. Nothing was restored.'),{status:400})}
const str=(v,max=255)=>typeof v==='string'&&!!v.trim()&&v.length<=max
const time=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))
/** Historical publication is data, never permission to expose a restored guest. */
export async function validateReviews(read,rows,guests){
 const [reviews,reports,events]=await Promise.all(['pm_reviews','pm_review_reports','pm_review_events'].map(read))
 const state=rows[0]?JSON.parse(rows[0].data):{bookings:[]},ids=new Map(),bookings=new Set(),reportIds=new Set(),eventIds=new Set()
 for(const r of reviews){
  const b=state.bookings.find(b=>b.id===r.booking_id),g=guests.find(g=>g.id===r.guest_id)
  if(!str(r.id)||ids.has(r.id)||bookings.has(r.booking_id)||!b||b.guestId!==r.guest_id||!g||JSON.parse(g.data).erased||!/^\d{4}-\d{2}-\d{2}$/.test(r.visit_date)||!time(r.visit_date)||!Number.isInteger(r.rating)||r.rating<1||r.rating>5||!str(r.comment,4000)||!time(r.published_at)||!time(r.consent_at)||r.historical!==1||!Number.isInteger(r.revision)||r.revision<1||typeof r.reply!=='string'||r.reply.length>2000)bad()
  if(r.reply?(!time(r.reply_at)||!str(r.reply_by)):(r.reply_at!==null||r.reply_by!==null))bad()
  ids.set(r.id,r);bookings.add(r.booking_id)
 }
 for(const r of reports){
  if(!str(r.id)||reportIds.has(r.id)||!ids.has(r.review_id)||!['spam','personal-data','threat','other'].includes(r.category)||!str(r.detail,2000)||!time(r.at)||!['pending','retained','escalated'].includes(r.outcome))bad()
  if(r.outcome==='pending'?(r.decided_at!==null||r.decided_by!==null||r.reason!==''):(!time(r.decided_at)||!str(r.decided_by)||!str(r.reason,2000)))bad()
  reportIds.add(r.id)
 }
 for(const e of events){
  if(!str(e.id)||eventIds.has(e.id)||!ids.has(e.review_id)||ids.get(e.review_id).booking_id!==e.booking_id||!str(e.actor)||!['review.published','review.reply','review.reported','review.moderated'].includes(e.action)||!time(e.at))bad()
  try{if(e.before_data!==null)JSON.parse(e.before_data);JSON.parse(e.after_data)}catch{bad()}
  eventIds.add(e.id)
 }
}
