import {portableServiceChanges} from './service-change-archive.mjs'
import {fail,type Guest,type State} from './model'
import {analyticsSettings} from './analytics'

/** CSV business schema; independent of the structured backup format version. */
export const businessCsvVersion=1
export const businessExportKinds=[
 'reviews','review-reports','review-events','feedback-visits','feedback-messages','diner-accounts','diner-bookings','venue','inventories','rooms','tables','allocation-tables','combinations','services','schedules',
 'guest-merges','service-notes','service-changes','bookings','waitlist','guests','inquiries','risk-tasks','audit','service-events','proposals','reminders','performance-reports',
 'experiences','payment-cases','payment-reviews','accounting-exports','money-items','money-receipts','money-payouts','money-adjustments','card-guarantees','card-collections','fee-policies','fee-consents','fee-assessments','fee-events','fee-disputes','payment-requests','refund-charges','refunds','refund-events','refund-webhooks','refund-followups','refund-notices','group-links','group-admins','report-schedules','report-deliveries',
] as const
export type BusinessExportKind=typeof businessExportKinds[number]
/** Native pm_performance_reports row; parse data before recursive credential scrubbing. */
export type BusinessPerformanceReport={id:string;service_id:string;published_at:string;published_by:string;floor_version:number;data:string}
type RecordValue=Record<string,unknown>
export type BusinessFinancialRecords={reviews?:RecordValue[];reviewReports?:RecordValue[];reviewEvents?:RecordValue[];feedbackVisits?:RecordValue[];feedbackMessages?:RecordValue[];dinerAccounts?:RecordValue[];dinerBookings?:RecordValue[];paymentCases?:RecordValue[];paymentReviews?:RecordValue[];accountingExports?:RecordValue[];moneyItems?:RecordValue[];moneyReceipts?:RecordValue[];moneyPayouts?:RecordValue[];moneyAdjustments?:RecordValue[];reportSchedules?:RecordValue[];reportDeliveries?:RecordValue[];cardGuarantees?:RecordValue[];cardCollections?:RecordValue[];feePolicies?:RecordValue[];feeConsents?:RecordValue[];feeAssessments?:RecordValue[];feeEvents?:RecordValue[];feeDisputes?:RecordValue[];paymentRequests:RecordValue[];refundCharges:RecordValue[];refunds:RecordValue[];refundEvents:RecordValue[];refundNotices?:RecordValue[];refundWebhooks?:RecordValue[];refundFollowups?:RecordValue[];bookingContacts?:RecordValue[];groupLinks?:RecordValue[];groupAdmins?:RecordValue[]}
const noFinancialRecords:BusinessFinancialRecords={paymentRequests:[],refundCharges:[],refunds:[],refundEvents:[]}
type Dataset={fields:readonly string[];rows:readonly unknown[]}

// Covers private links in nested proposal snapshots as well as live records.
function credentialKey(key:string):boolean {
 const normalized=key.replace(/[^a-z0-9]/gi,'').toLowerCase()
 return /token|secret|password|credential|bearer|authorization|cookie|apikey|privatekey|session/.test(normalized)||['providerurl','providerreturnurl','processinguntil'].includes(normalized)
}
function clean(value:unknown):unknown {
 if(Array.isArray(value))return value.map(clean)
 if(value!==null&&typeof value==='object') {
  const row=value as RecordValue
  if(row.erased===true&&typeof row.id==='string')return {id:row.id,name:'Erased guest',email:'',phone:'',notes:'',history:[],erased:true}
  return Object.fromEntries(Object.entries(row).filter(([key])=>!credentialKey(key)).map(([key,item])=>[key,clean(item)]))
 }
 return value
}

/** Always quote cells, retain embedded CR/LF, and neutralize spreadsheet formulas. */
function cell(value:unknown):string {
 let text=value===undefined||value===null?'':String(value)
 if(/^[\s\uFEFF]*[=+\-@]/u.test(text))text="'"+text
 return '"'+text.replace(/"/g,'""')+'"'
}

/** Mirrors the financial history exposed by the audit door using this export's one read snapshot. */
function refundHistory(finance:BusinessFinancialRecords){
 const refunds=new Map(finance.refunds.map(row=>[row.id,row]))
 return finance.refundEvents.map(row=>({id:'refund-'+row.id,at:row.at,actor:row.actor_id,action:'payment.refund',subject:refunds.get(row.refund_id)?.booking_id,source:'person',changes:[{kind:'refunds',id:row.refund_id,before:row.before_data?JSON.parse(String(row.before_data)):null,after:JSON.parse(String(row.after_data))}]}))
}
function dataset(state:State,people:Guest[],kind:BusinessExportKind,reports:BusinessPerformanceReport[],merges:unknown[],finance:BusinessFinancialRecords):Dataset {
 switch(kind) {
  case 'reviews':return {fields:['id','booking_id','guest_id','visit_date','rating','comment','published_at','consent_at','historical','reply','reply_at','reply_by','revision'],rows:(finance.reviews??[]).map(r=>({...r,historical:1}))}
  case 'review-reports':return {fields:['id','review_id','category','detail','at','outcome','decided_at','decided_by','reason'],rows:finance.reviewReports??[]}
  case 'review-events':return {fields:['id','review_id','booking_id','actor','action','at','before_data','after_data'],rows:finance.reviewEvents??[]}

  case 'feedback-visits':return {fields:['id','booking_id','guest_id','visit_date','invite_state','created_at','provider_id','rating','comment','submitted_at','withdrawn_at','assignee_id','due_at','assigned_by','assigned_at','case_state','outcome','closed_at','closed_by'],rows:finance.feedbackVisits??[]}
  case 'feedback-messages':return {fields:['id','visit_id','author','actor_id','message','at','state','request_id','provider_id'],rows:finance.feedbackMessages??[]}
  case 'diner-accounts':return {fields:['id','email','created_at','updated_at','favorite','preferences'],rows:finance.dinerAccounts??[]}
  case 'diner-bookings':return {fields:['account_id','booking_id','guest_id','verified_at'],rows:finance.dinerBookings??[]}
  case 'payment-cases':return {fields:['id','booking_id','charge_id','amount_cents','currency','reason','status','due_at','opened_by','opened_at','ledger_json'],rows:(finance.paymentCases??[]).map(r=>({...r,ledger:JSON.parse(String(r.ledger))}))}
  case 'payment-reviews':return {fields:['id','case_id','digest','response','created_by','created_at','approved_by','approved_at','evidence_json'],rows:(finance.paymentReviews??[]).map(r=>({...r,evidence:JSON.parse(String(r.evidence))}))}
  case 'accounting-exports':return {fields:['id','case_id','review_id','actor_id','created_at','state','provider_id','code','trace_id','updated_at','ledger_json','journal_json'],rows:(finance.accountingExports??[]).map(r=>({...r,ledger:JSON.parse(String(r.ledger)),journal:JSON.parse(String(r.journal))}))}
  case 'money-items':return {fields:['source_id','kind','charge_id','booking_id','amount_cents','currency','recorded_at'],rows:finance.moneyItems??[]}
  case 'money-receipts':return {fields:['event_id','source_id','received_at'],rows:finance.moneyReceipts??[]}
  case 'money-payouts':return {fields:['id','amount_cents','currency','items_json','actor_id','recorded_at'],rows:(finance.moneyPayouts??[]).map(r=>({...r,items:JSON.parse(String(r.items))}))}
  case 'money-adjustments':return {fields:['id','payout_id','transaction_id','booking_id','actor_id','recorded_at'],rows:finance.moneyAdjustments??[]}
  case 'guest-merges':return {fields:['id','guestId','duplicateId','status','createdAt','createdBy','unmergedAt','unmergedBy','purgedAt','snapshots_json','pendingAssignment_json'],rows:merges}
  case 'venue':return {fields:['name','timezone','setup_json','hostIds_json','pacingHostIds_json','leadIds_json','serverIds_json','financeIds_json','reportScopes_json','managerRefundLimits_json','embedOrigins_json','analytics_json'],rows:[{...state.venue,hostIds:state.hostIds,pacingHostIds:state.pacingHostIds,leadIds:state.leadIds,serverIds:state.serverIds,financeIds:state.financeIds,reportScopes:state.reportScopes,managerRefundLimits:state.managerRefundLimits,embedOrigins:state.embed?.origins??[],analytics:analyticsSettings(state)}]}
  case 'inventories':return {fields:['id','name','kind','capacity','turnMinutes','arrivalCovers','intervalMinutes','adjacent'],rows:state.inventories??[]}
  case 'rooms':return {fields:['id','name','kind'],rows:state.rooms??[]}
  case 'tables':return {fields:['id','label','seats','area','x','y','shape','retiredAt','accessTags_json','inventoryId','inventoryKind','ordinal','inventoryTurnMinutes'],rows:state.tables}
  case 'allocation-tables':return {fields:['id','label','seats','area','x','y','shape','retiredAt','accessTags_json'],rows:state.allocationTables??[]}
  case 'combinations':return {fields:['id','tableIds_json','capacity','accessTags_json','setupMinutes','enabled','adjacent'],rows:state.combinations??[]}
  case 'service-notes':return {fields:['id','date','kind','history_json'],rows:state.serviceNotes??[]}
  case 'experiences':return {fields:['id','version','status','name','image','menu','kind','amountCents','currency','serviceIds_json','areas_json','ticketClasses_json','addOns_json','dietaryChoices_json','cancellationRules','turnMinutes','cleanupMinutes','lastSeatingAt_json','createdAt','createdBy','updatedAt','updatedBy','publishedAt','publishedBy'],rows:state.experiences??[]}
  case 'services':return {fields:['id','name','startAt','endAt','status','version','turnMinutes','coverLimit','publicQueuePaused','closedAt','closedBy','closeReason','scheduleSource_json','bookingRules_json','turnPolicy_json','pacing_json','staffing_json','directInventory_json','preorderItems_json','managerPreorders_json'],rows:state.services}
  case 'schedules':return {fields:['id','name','shift','seasonStart','seasonEnd','startTime','endTime','startOffset','endOffset','turnMinutes','coverLimit','weekdays_json','exceptions_json','version','updatedAt','updatedBy'],rows:state.schedules??[]}
  case 'service-changes':return {fields:['id','serviceId','scope','tableIds_json','startAt','endAt','reason','approvedBy','approvedAt','tasks_json'],rows:portableServiceChanges(state.serviceChanges)}
  case 'bookings':return {fields:['id','serviceId','guestId','partySize','startAt','endAt','status','source','attribution_json','createdAt','setupStartAt','cleanupEndAt','expectedEndAt','needsBussing','assignmentLocked','tableIds_json','combination_json','requiredArea','requiredAccessTags_json','requests_json','requestsAcknowledgedAt','ruleOverride_json','pacingOverride_json','serverId','sectionId','serverName','sectionName','servingHistory_json','preorders_json','handover_json','needHistory_json','lateOperations_json','staffIntake_json','closureEmailConsent_json','feedbackEmailConsent_json','experience_json','experienceCart_json','contact_json'],rows:state.bookings.map(b=>({...b,contact:finance.bookingContacts?.find(row=>row.booking_id===b.id)?.data?JSON.parse(String(finance.bookingContacts?.find(row=>row.booking_id===b.id)?.data)):undefined}))}
  case 'waitlist':return {fields:['id','serviceId','guestId','bookingId','partySize','status','source','createdAt','seatedAt','resolvedAt','priority','owner','preferredAt','preferredArea','requiredAccessTags_json','contactConsent','contactPhone','actualWaitMinutes','quote_json','history_json','followUps_json'],rows:state.waitlist}
  case 'guests':return {fields:['id','name','email','phone','notes','erased','mergedInto','contacts_json','profile_json','provenance_json','notesHistory_json','history_json'],rows:people}
  case 'inquiries':return {fields:['id','guestId','ownerId','status','partySize','serviceId','requestedStartAt','requiredArea','requiredAccessTags_json','requests_json','replyDueAt','createdAt','updatedAt','closedAt','bookingId','acceptedOfferVersion','acceptedAt','offer_json','messages_json'],rows:state.inquiries??[]}
  case 'risk-tasks':return {fields:['id','bookingId','kind','decision','actor','at','reason','dueAt','completedAt','completedBy','outcome','snapshot_json'],rows:state.riskDecisions??[]}
  case 'audit':return {fields:['id','at','actor','deviceId','source','action','subject','reason','before_json','after_json','changes_json','pacing_json'],rows:[...state.audit,...refundHistory(finance),...(finance.feeEvents??[]).map(e=>({id:'fee-'+e.id,at:e.at,actor:e.actor_id,action:e.action,subject:e.booking_id??e.subject_id,source:e.action==='payment.guarantee-guest-consent'?'guest-supplied':['payment.card-verified','payment.merchant-capability','payment.card-hold-observed','payment.card-hold-unconfirmed'].includes(String(e.action))?'provider':'person',changes:[{kind:'fees',id:e.subject_id,before:e.before_data?JSON.parse(String(e.before_data)):null,after:JSON.parse(String(e.after_data))}]})),...(finance.refundNotices??[]).map(n=>({id:'refund-notice-'+n.id,at:n.accepted_at??n.requested_at,actor:n.requested_by,action:'payment.refund-notice',subject:finance.refunds.find(r=>r.id===n.refund_id)?.booking_id,source:'person',changes:[{kind:'refundNotices',id:n.id,before:null,after:{refundId:n.refund_id,outcome:n.outcome,amountCents:n.amount_cents,remainingCents:n.remaining_cents,state:n.state}}]}))]}
  case 'service-events':return {fields:['id','bookingId','at','actor','source','reason','correctsEventId','before_json','after_json'],rows:state.serviceEvents??[]}
  case 'proposals':return {fields:['id','kind','status','preparedBy','preparedAt','approvedBy','approvedAt','reason','plan_json'],rows:state.proposals}
  case 'reminders':return {fields:['id','bookingId','guestId','contactName','contactEmail','contactPhone','message','status','approvedBy','approvedAt'],rows:state.reminders}
  case 'performance-reports':return {fields:['id','serviceId','publishedAt','publishedBy','floorVersion','report_json'],rows:reports.map(row=>({id:row.id,serviceId:row.service_id,publishedAt:row.published_at,publishedBy:row.published_by,floorVersion:row.floor_version,report:JSON.parse(row.data)}))}
  case 'card-guarantees':return {fields:['id','booking_id','policy_id','actor_id','created_at','accepted_at','review_text','booking_snapshot','expires_at','ended_at','recollection_requested_at','max_fee_cents','hold_amount_cents','hold_reference','hold_state','held_cents','hold_expires_at','hold_verified_at'],rows:(finance.cardGuarantees??[]).map(({authorization_cents,authorization_reference,authorization_state,authorization_held_cents,authorization_expires_at,authorization_verified_at,...row})=>({...row,hold_amount_cents:authorization_cents,hold_reference:authorization_reference,hold_state:authorization_state,held_cents:authorization_held_cents,hold_expires_at:authorization_expires_at,hold_verified_at:authorization_verified_at}))}
  case 'card-collections':return {fields:['id','booking_id','account_id','created_by','created_at','expires_at','provider_reference','state','verified_at'],rows:finance.cardCollections??[]}
  case 'fee-policies':return {fields:['id','version','created_by','created_at','data'],rows:finance.feePolicies??[]}
  case 'fee-consents':return {fields:['id','booking_id','policy_id','actor_id','accepted_at','recorded_at','evidence','booking_snapshot','review_text','expires_at','recollection_requested_at'],rows:finance.feeConsents??[]}
  case 'fee-assessments':return {fields:['id','request_id','booking_id','service_id','policy_id','consent_id','guest_consent_id','kind','event_id','action','status','amount_cents','actor_id','reason','evidence','processor_id','charge_id','created_at','updated_at'],rows:finance.feeAssessments??[]}
  case 'fee-events':return {fields:['id','booking_id','actor_id','at','action','subject_id','before_data','after_data'],rows:finance.feeEvents??[]}
  case 'fee-disputes':return {fields:['id','assessment_id','actor_id','at','reason','evidence'],rows:finance.feeDisputes??[]}
  case 'payment-requests':return {fields:['id','bookingId','perGuestCents','originalPartySize','amountCents','currency','dueAt','followupOwnerId','createdBy','createdAt','reason','state','providerAttemptAt','providerReference','verifiedAt','paidAt'],rows:finance.paymentRequests.map(r=>({id:r.id,bookingId:r.booking_id,perGuestCents:r.per_guest_cents,originalPartySize:r.original_party_size,amountCents:r.amount_cents,currency:r.currency,dueAt:r.due_at,followupOwnerId:r.followup_owner_id,createdBy:r.created_by,createdAt:r.created_at,reason:r.reason,state:r.state,providerAttemptAt:r.provider_attempt_at,providerReference:r.provider_session_id,verifiedAt:r.verified_at,paidAt:r.paid_at}))}
  case 'refund-charges':return {fields:['chargeId','bookingId','amountCents','importedRefundedCents','currency','syncedBy','syncedAt'],rows:finance.refundCharges.map(r=>({chargeId:r.charge_id,bookingId:r.booking_id,amountCents:r.amount_cents,importedRefundedCents:r.imported_refunded_cents,currency:r.currency,syncedBy:r.synced_by,syncedAt:r.synced_at}))}
  case 'refunds':return {fields:['id','requestId','actorId','bookingId','chargeId','amountCents','reason','status','processorId','createdAt','updatedAt'],rows:finance.refunds.map(r=>({id:r.id,requestId:r.request_id,actorId:r.actor_id,bookingId:r.booking_id,chargeId:r.charge_id,amountCents:r.amount_cents,reason:r.reason,status:r.status,processorId:r.processor_id,createdAt:r.created_at,updatedAt:r.updated_at}))}
  case 'report-schedules':return {fields:['id','owner_id','recipient_id','report_kind','service_id','venues','timezone','next_at','approved_at','enabled'],rows:finance.reportSchedules??[]}
  case 'report-deliveries':return {fields:['id','schedule_id','due_at','date_from','date_to','state','reason'],rows:finance.reportDeliveries??[]}
  case 'group-links':return {fields:['id','name','origin','ceiling_json','joinedAt','revokedAt'],rows:(finance.groupLinks??[]).map(r=>({id:r.id,name:r.name,origin:r.origin,ceiling:JSON.parse(String(r.ceiling)),joinedAt:r.joined_at,revokedAt:r.revoked_at}))}
  case 'group-admins':return {fields:['operatorId','venueId','rights_json','grantedBy','grantedAt'],rows:(finance.groupAdmins??[]).map(r=>({operatorId:r.operator_id,venueId:r.venue_id,rights:JSON.parse(String(r.rights)),grantedBy:r.granted_by,grantedAt:r.granted_at}))}
  case 'refund-webhooks':return {fields:['id','eventId','refundId','eventType','processorStatus','receivedAt'],rows:(finance.refundWebhooks??[]).map(r=>({id:r.id,eventId:r.event_id,refundId:r.refund_id,eventType:r.event_type,processorStatus:r.processor_status,receivedAt:r.received_at}))}
  case 'refund-followups':return {fields:['refundId','ownerId','actorId','requestId','state','failureStatus','createdAt','updatedAt','resolvedAt'],rows:(finance.refundFollowups??[]).map(r=>({refundId:r.refund_id,ownerId:r.owner_id,actorId:r.actor_id,requestId:r.request_id,state:r.state,failureStatus:r.failure_status,createdAt:r.created_at,updatedAt:r.updated_at,resolvedAt:r.resolved_at}))}
  case 'refund-notices':return {fields:['id','refundId','outcome','amountCents','remainingCents','requestedBy','requestedAt','state','providerId','acceptedAt'],rows:(finance.refundNotices??[]).map(r=>({id:r.id,refundId:r.refund_id,outcome:r.outcome,amountCents:r.amount_cents,remainingCents:r.remaining_cents,requestedBy:r.requested_by,requestedAt:r.requested_at,state:r.state,providerId:r.provider_id,acceptedAt:r.accepted_at}))}
  case 'refund-events':return {fields:['id','refundId','actorId','at','before_json','after_json'],rows:finance.refundEvents.map(r=>({id:r.id,refundId:r.refund_id,actorId:r.actor_id,at:r.at,before:r.before_data?JSON.parse(String(r.before_data)):null,after:JSON.parse(String(r.after_data))}))}
 }
}

/** Current records only. Caller owns native owner authorization and snapshot loading. */
export function businessCsv(state:State,people:Guest[],kind:string,reports:BusinessPerformanceReport[]=[],merges:unknown[]=[],finance:BusinessFinancialRecords=noFinancialRecords):string {
 if(!businessExportKinds.includes(kind as BusinessExportKind))fail(404,'Unknown business export.')
 const {fields,rows}=dataset(state,people,kind as BusinessExportKind,reports,merges,finance)
 const lines:unknown[][]=[['csv_version',...fields,'data_json']]
 for(const source of rows) {
  const row=clean(source) as RecordValue
  const values=fields.map(field=>{
   const json=field.endsWith('_json'),value=row[json?field.slice(0,-5):field]
   return json&&value!==undefined?JSON.stringify(value):value
  })
  lines.push([businessCsvVersion,...values,JSON.stringify(row)])
 }
 return lines.map(line=>line.map(cell).join(',')).join('\r\n')+'\r\n'
}
