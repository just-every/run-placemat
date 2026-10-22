import {businessCsv,type BusinessPerformanceReport,type BusinessFinancialRecords} from './business-export'
import {emptyState,type Guest,type State} from './model'

/** One D1 batch keeps venue, guest, journal and financial records in the same read transaction. */
export async function readBusinessCsv(db:D1Database,kind:string):Promise<string>{
 const [floor,people,merges,reports,payments,charges,refunds,events,contacts,links,admins,notices,webhooks,followups]=await db.batch<{data:string}>([
  db.prepare('SELECT data FROM pm_state WHERE id=1'),
  db.prepare('SELECT data FROM pm_guests ORDER BY id'),
  db.prepare('SELECT data FROM pm_guest_merges ORDER BY id'),
  db.prepare('SELECT id,service_id,published_at,published_by,floor_version,data FROM pm_performance_reports ORDER BY published_at,id'),
  db.prepare('SELECT * FROM pm_payment_requests ORDER BY created_at,id'),
  db.prepare('SELECT * FROM pm_refund_charges ORDER BY synced_at,charge_id'),
  db.prepare('SELECT * FROM pm_refunds ORDER BY created_at,id'),
  db.prepare('SELECT * FROM pm_refund_events ORDER BY id'),
  db.prepare('SELECT * FROM pm_booking_contacts ORDER BY booking_id'),
  db.prepare('SELECT id,name,origin,ceiling,joined_at,revoked_at FROM pm_group_links ORDER BY joined_at,id'),
  db.prepare('SELECT operator_id,venue_id,rights,granted_by,granted_at FROM pm_group_admins ORDER BY operator_id,venue_id'),
  db.prepare('SELECT * FROM pm_refund_notices ORDER BY requested_at,id'),
  db.prepare('SELECT id,event_id,refund_id,event_type,processor_status,received_at FROM pm_refund_webhooks ORDER BY id'),
  db.prepare('SELECT * FROM pm_refund_followups ORDER BY created_at,refund_id'),
 ])
 const state:State=floor.results[0]?JSON.parse(floor.results[0].data):emptyState()
 const guests:Guest[]=people.results.map(row=>JSON.parse(row.data))
 const finance={paymentRequests:payments.results,refundCharges:charges.results,refunds:refunds.results,refundEvents:events.results,refundNotices:notices.results,refundWebhooks:webhooks.results,refundFollowups:followups.results,bookingContacts:contacts.results,groupLinks:links.results,groupAdmins:admins.results} as unknown as BusinessFinancialRecords
 return businessCsv(state,guests,kind,reports.results as unknown as BusinessPerformanceReport[],merges.results.map(row=>JSON.parse(row.data)),finance)
}
