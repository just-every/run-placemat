const validDate=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))
const str=v=>typeof v==='string'&&v.trim().length>0
const bad=()=>{throw Error('Invalid privacy request or retention record. Nothing was restored.')}
export async function validatePrivacy(read,guests){
 const [policies,requests,tasks,events]=await Promise.all(['pm_privacy_policy','pm_privacy_requests','pm_privacy_processors','pm_privacy_events'].map(read))
 const guestIds=new Set(guests.map(g=>g.id)),ids=new Set(requests.map(r=>r.id))
 if(policies.length>1)bad()
 for(const row of policies){
  if(row.id!==1||!Number.isSafeInteger(row.version)||row.version<1||!str(row.actor_id)||!validDate(row.updated_at))bad()
  const rules=JSON.parse(row.data)
  for(const key of ['guestNotes','messageContent','imports','financialEvidence']){const r=rules[key];if(!r||!Number.isSafeInteger(r.days)||r.days<(key==='financialEvidence'?1:0)||r.days>36500||!str(r.ground)||r.ground.length>500)bad()}
 }
 for(const r of requests)if(!str(r.id)||!guestIds.has(r.guest_id)||!['access','correction','deletion','retention'].includes(r.kind)||!['open','completed'].includes(r.state)||!str(r.actor_id)||!validDate(r.created_at)||r.state==='completed'&&!validDate(r.completed_at)||r.policy_version!==null&&(!Number.isSafeInteger(r.policy_version)||r.policy_version<1||r.policy_version>(policies[0]?.version??0)))bad()
 for(const t of tasks)if(!str(t.id)||!ids.has(t.request_id)||!str(t.provider)||!str(t.reference)||!['open','submitted','confirmed','retained'].includes(t.state)||!str(t.actor_id)||!validDate(t.updated_at)||typeof t.ground!=='string'||t.state!=='open'&&!str(t.ground))bad()
 for(const e of events)if(!str(e.id)||e.request_id!==null&&!ids.has(e.request_id)||!str(e.actor_id)||!str(e.action)||!validDate(e.at)||!JSON.parse(e.details)||typeof JSON.parse(e.details)!=='object')bad()
}
