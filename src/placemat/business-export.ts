import {fail,type Guest,type State} from './model'
import {analyticsSettings} from './analytics'

/** CSV business schema; independent of the structured backup format version. */
export const businessCsvVersion=1
export const businessExportKinds=[
 'venue','inventories','rooms','tables','allocation-tables','combinations','services','schedules',
 'guest-merges','service-notes','service-changes','bookings','waitlist','guests','inquiries','risk-tasks','audit','service-events','proposals','reminders','performance-reports',
 'fee-policies','fee-consents','fee-assessments','fee-events','fee-disputes','payment-requests','refund-charges','refunds','refund-events','refund-webhooks','refund-followups','refund-notices','group-links','group-admins',
] as const
export type BusinessExportKind=typeof businessExportKinds[number]
/** Native pm_performance_reports row; parse data before recursive credential scrubbing. */
export type BusinessPerformanceReport={id:string;service_id:string;published_at:string;published_by:string;floor_version:number;data:string}
type RecordValue=Record<string,unknown>
export type BusinessFinancialRecords={feePolicies?:RecordValue[];feeConsents?:RecordValue[];feeAssessments?:RecordValue[];feeEvents?:RecordValue[];feeDisputes?:RecordValue[];paymentRequests:RecordValue[];refundCharges:RecordValue[];refunds:RecordValue[];refundEvents:RecordValue[];refundNotices?:RecordValue[];refundWebhooks?:RecordValue[];refundFollowups?:RecordValue[];bookingContacts?:RecordValue[];groupLinks?:RecordValue[];groupAdmins?:RecordValue[]}
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
  case 'guest-merges':return {fields:['id','guestId','duplicateId','status','createdAt','createdBy','unmergedAt','unmergedBy','purgedAt','snapshots_json','pendingAssignment_json'],rows:merges}
  case 'venue':return {fields:['name','timezone','setup_json','hostIds_json','pacingHostIds_json','leadIds_json','serverIds_json','financeIds_json','reportScopes_json','managerRefundLimits_json','embedOrigins_json','analytics_json'],rows:[{...state.venue,hostIds:state.hostIds,pacingHostIds:state.pacingHostIds,leadIds:state.leadIds,serverIds:state.serverIds,financeIds:state.financeIds,reportScopes:state.reportScopes,managerRefundLimits:state.managerRefundLimits,embedOrigins:state.embed?.origins??[],analytics:analyticsSettings(state)}]}
  case 'inventories':return {fields:['id','name','kind','capacity','turnMinutes','arrivalCovers','intervalMinutes','adjacent'],rows:state.inventories??[]}
  case 'rooms':return {fields:['id','name','kind'],rows:state.rooms??[]}
  case 'tables':return {fields:['id','label','seats','area','x','y','shape','retiredAt','accessTags_json','inventoryId','inventoryKind','ordinal','inventoryTurnMinutes'],rows:state.tables}
  case 'allocation-tables':return {fields:['id','label','seats','area','x','y','shape','retiredAt','accessTags_json'],rows:state.allocationTables??[]}
  case 'combinations':return {fields:['id','tableIds_json','capacity','accessTags_json','setupMinutes','enabled','adjacent'],rows:state.combinations??[]}
  case 'service-notes':return {fields:['id','date','kind','history_json'],rows:state.serviceNotes??[]}
  case 'services':return {fields:['id','name','startAt','endAt','status','version','turnMinutes','coverLimit','publicQueuePaused','closedAt','closedBy','closeReason','scheduleSource_json','bookingRules_json','turnPolicy_json','pacing_json','staffing_json','directInventory_json','preorderItems_json','managerPreorders_json'],rows:state.services}
  case 'schedules':return {fields:['id','name','shift','seasonStart','seasonEnd','startTime','endTime','startOffset','endOffset','turnMinutes','coverLimit','weekdays_json','exceptions_json','version','updatedAt','updatedBy'],rows:state.schedules??[]}
  case 'service-changes':return {fields:['id','serviceId','scope','tableIds_json','startAt','endAt','reason','approvedBy','approvedAt','tasks_json'],rows:state.serviceChanges??[]}
  case 'bookings':return {fields:['id','serviceId','guestId','partySize','startAt','endAt','status','source','attribution_json','createdAt','setupStartAt','cleanupEndAt','expectedEndAt','needsBussing','assignmentLocked','tableIds_json','combination_json','requiredArea','requiredAccessTags_json','requests_json','requestsAcknowledgedAt','ruleOverride_json','pacingOverride_json','serverId','sectionId','serverName','sectionName','servingHistory_json','preorders_json','handover_json','contact_json'],rows:state.bookings.map(b=>({...b,contact:finance.bookingContacts?.find(row=>row.booking_id===b.id)?.data?JSON.parse(String(finance.bookingContacts?.find(row=>row.booking_id===b.id)?.data)):undefined}))}
  case 'waitlist':return {fields:['id','serviceId','guestId','bookingId','partySize','status','source','createdAt','seatedAt','resolvedAt','priority','owner','preferredAt','preferredArea','requiredAccessTags_json','contactConsent','contactPhone','actualWaitMinutes','quote_json','history_json','followUps_json'],rows:state.waitlist}
  case 'guests':return {fields:['id','name','email','phone','notes','erased','mergedInto','contacts_json','profile_json','provenance_json','notesHistory_json','history_json'],rows:people}
  case 'inquiries':return {fields:['id','guestId','ownerId','status','partySize','serviceId','requestedStartAt','requiredArea','requiredAccessTags_json','requests_json','replyDueAt','createdAt','updatedAt','closedAt','bookingId','acceptedOfferVersion','acceptedAt','offer_json','messages_json'],rows:state.inquiries??[]}
  case 'risk-tasks':return {fields:['id','bookingId','kind','decision','actor','at','reason','dueAt','completedAt','completedBy','outcome','snapshot_json'],rows:state.riskDecisions??[]}
  case 'audit':return {fields:['id','at','actor','deviceId','source','action','subject','reason','before_json','after_json','changes_json','pacing_json'],rows:[...state.audit,...refundHistory(finance),...(finance.refundNotices??[]).map(n=>({id:'refund-notice-'+n.id,at:n.accepted_at??n.requested_at,actor:n.requested_by,action:'payment.refund-notice',subject:finance.refunds.find(r=>r.id===n.refund_id)?.booking_id,source:'person',changes:[{kind:'refundNotices',id:n.id,before:null,after:{refundId:n.refund_id,outcome:n.outcome,amountCents:n.amount_cents,remainingCents:n.remaining_cents,state:n.state}}]}))]}
  case 'service-events':return {fields:['id','bookingId','at','actor','source','reason','correctsEventId','before_json','after_json'],rows:state.serviceEvents??[]}
  case 'proposals':return {fields:['id','kind','status','preparedBy','preparedAt','approvedBy','approvedAt','reason','plan_json'],rows:state.proposals}
  case 'reminders':return {fields:['id','bookingId','guestId','contactName','contactEmail','contactPhone','message','status','approvedBy','approvedAt'],rows:state.reminders}
  case 'performance-reports':return {fields:['id','serviceId','publishedAt','publishedBy','floorVersion','report_json'],rows:reports.map(row=>({id:row.id,serviceId:row.service_id,publishedAt:row.published_at,publishedBy:row.published_by,floorVersion:row.floor_version,report:JSON.parse(row.data)}))}
  case 'fee-policies':return {fields:['id','version','created_by','created_at','data'],rows:finance.feePolicies??[]}
  case 'fee-consents':return {fields:['id','booking_id','policy_id','actor_id','accepted_at','recorded_at','evidence','booking_snapshot','review_text'],rows:finance.feeConsents??[]}
  case 'fee-assessments':return {fields:['id','request_id','booking_id','service_id','policy_id','consent_id','kind','event_id','action','status','amount_cents','actor_id','reason','evidence','processor_id','charge_id','created_at','updated_at'],rows:finance.feeAssessments??[]}
  case 'fee-events':return {fields:['id','booking_id','actor_id','at','action','subject_id','before_data','after_data'],rows:finance.feeEvents??[]}
  case 'fee-disputes':return {fields:['id','assessment_id','actor_id','at','reason','evidence'],rows:finance.feeDisputes??[]}
  case 'payment-requests':return {fields:['id','bookingId','amountCents','currency','dueAt','followupOwnerId','createdBy','createdAt','reason','state','providerAttemptAt','providerReference','verifiedAt','paidAt'],rows:finance.paymentRequests.map(r=>({id:r.id,bookingId:r.booking_id,amountCents:r.amount_cents,currency:r.currency,dueAt:r.due_at,followupOwnerId:r.followup_owner_id,createdBy:r.created_by,createdAt:r.created_at,reason:r.reason,state:r.state,providerAttemptAt:r.provider_attempt_at,providerReference:r.provider_session_id,verifiedAt:r.verified_at,paidAt:r.paid_at}))}
  case 'refund-charges':return {fields:['chargeId','bookingId','amountCents','importedRefundedCents','currency','syncedBy','syncedAt'],rows:finance.refundCharges.map(r=>({chargeId:r.charge_id,bookingId:r.booking_id,amountCents:r.amount_cents,importedRefundedCents:r.imported_refunded_cents,currency:r.currency,syncedBy:r.synced_by,syncedAt:r.synced_at}))}
  case 'refunds':return {fields:['id','requestId','actorId','bookingId','chargeId','amountCents','reason','status','processorId','createdAt','updatedAt'],rows:finance.refunds.map(r=>({id:r.id,requestId:r.request_id,actorId:r.actor_id,bookingId:r.booking_id,chargeId:r.charge_id,amountCents:r.amount_cents,reason:r.reason,status:r.status,processorId:r.processor_id,createdAt:r.created_at,updatedAt:r.updated_at}))}
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
