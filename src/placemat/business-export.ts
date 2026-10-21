import {fail,type Guest,type State} from './model'
import {analyticsSettings} from './analytics'

/** CSV business schema; independent of the structured backup format version. */
export const businessCsvVersion=1
export const businessExportKinds=[
 'venue','inventories','rooms','tables','allocation-tables','combinations','services','schedules',
 'guest-merges','service-notes','service-changes','bookings','waitlist','guests','inquiries','risk-tasks','audit','service-events','proposals','reminders','performance-reports',
] as const
export type BusinessExportKind=typeof businessExportKinds[number]
/** Native pm_performance_reports row; parse data before recursive credential scrubbing. */
export type BusinessPerformanceReport={id:string;service_id:string;published_at:string;published_by:string;floor_version:number;data:string}
type RecordValue=Record<string,unknown>
type Dataset={fields:readonly string[];rows:readonly unknown[]}

// Covers private links in nested proposal snapshots as well as live records.
function credentialKey(key:string):boolean {
 return /token|secret|password|credential|bearer|authorization|cookie|apikey|privatekey|session/.test(key.replace(/[^a-z0-9]/gi,'').toLowerCase())
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

function dataset(state:State,people:Guest[],kind:BusinessExportKind,reports:BusinessPerformanceReport[],merges:unknown[]):Dataset {
 switch(kind) {
  case 'guest-merges':return {fields:['id','guestId','duplicateId','status','createdAt','createdBy','unmergedAt','unmergedBy','purgedAt','snapshots_json','pendingAssignment_json'],rows:merges}
  case 'venue':return {fields:['name','timezone','setup_json','hostIds_json','pacingHostIds_json','embedOrigins_json','analytics_json'],rows:[{...state.venue,hostIds:state.hostIds,pacingHostIds:state.pacingHostIds,embedOrigins:state.embed?.origins??[],analytics:analyticsSettings(state)}]}
  case 'inventories':return {fields:['id','name','kind','capacity','turnMinutes','arrivalCovers','intervalMinutes','adjacent'],rows:state.inventories??[]}
  case 'rooms':return {fields:['id','name','kind'],rows:state.rooms??[]}
  case 'tables':return {fields:['id','label','seats','area','x','y','shape','retiredAt','accessTags_json','inventoryId','inventoryKind','ordinal','inventoryTurnMinutes'],rows:state.tables}
  case 'allocation-tables':return {fields:['id','label','seats','area','x','y','shape','retiredAt','accessTags_json'],rows:state.allocationTables??[]}
  case 'combinations':return {fields:['id','tableIds_json','capacity','accessTags_json','setupMinutes','enabled','adjacent'],rows:state.combinations??[]}
  case 'service-notes':return {fields:['id','date','kind','history_json'],rows:state.serviceNotes??[]}
  case 'services':return {fields:['id','name','startAt','endAt','status','version','turnMinutes','coverLimit','publicQueuePaused','closedAt','closedBy','closeReason','scheduleSource_json','bookingRules_json','turnPolicy_json','pacing_json','staffing_json','directInventory_json','preorderItems_json','managerPreorders_json'],rows:state.services}
  case 'schedules':return {fields:['id','name','shift','seasonStart','seasonEnd','startTime','endTime','startOffset','endOffset','turnMinutes','coverLimit','weekdays_json','exceptions_json','version','updatedAt','updatedBy'],rows:state.schedules??[]}
  case 'service-changes':return {fields:['id','serviceId','scope','tableIds_json','startAt','endAt','reason','approvedBy','approvedAt','tasks_json'],rows:state.serviceChanges??[]}
  case 'bookings':return {fields:['id','serviceId','guestId','partySize','startAt','endAt','status','source','attribution_json','createdAt','setupStartAt','cleanupEndAt','expectedEndAt','needsBussing','assignmentLocked','tableIds_json','combination_json','requiredArea','requiredAccessTags_json','requests_json','requestsAcknowledgedAt','ruleOverride_json','pacingOverride_json','serverId','sectionId','serverName','sectionName','servingHistory_json','preorders_json','handover_json'],rows:state.bookings}
  case 'waitlist':return {fields:['id','serviceId','guestId','bookingId','partySize','status','source','createdAt','seatedAt','resolvedAt','priority','owner','preferredAt','preferredArea','requiredAccessTags_json','contactConsent','contactPhone','actualWaitMinutes','quote_json','history_json','followUps_json'],rows:state.waitlist}
  case 'guests':return {fields:['id','name','email','phone','notes','erased','mergedInto','contacts_json','profile_json','provenance_json','notesHistory_json','history_json'],rows:people}
  case 'inquiries':return {fields:['id','guestId','ownerId','status','partySize','serviceId','requestedStartAt','requiredArea','requiredAccessTags_json','requests_json','replyDueAt','createdAt','updatedAt','closedAt','bookingId','acceptedOfferVersion','acceptedAt','offer_json','messages_json'],rows:state.inquiries??[]}
  case 'risk-tasks':return {fields:['id','bookingId','kind','decision','actor','at','reason','dueAt','completedAt','completedBy','outcome','snapshot_json'],rows:state.riskDecisions??[]}
  case 'audit':return {fields:['id','at','actor','source','action','subject','reason','before_json','after_json','changes_json','pacing_json'],rows:state.audit}
  case 'service-events':return {fields:['id','bookingId','at','actor','source','reason','correctsEventId','before_json','after_json'],rows:state.serviceEvents??[]}
  case 'proposals':return {fields:['id','kind','status','preparedBy','preparedAt','approvedBy','approvedAt','reason','plan_json'],rows:state.proposals}
  case 'reminders':return {fields:['id','bookingId','guestId','contactName','contactEmail','contactPhone','message','status','approvedBy','approvedAt'],rows:state.reminders}
  case 'performance-reports':return {fields:['id','serviceId','publishedAt','publishedBy','floorVersion','report_json'],rows:reports.map(row=>({id:row.id,serviceId:row.service_id,publishedAt:row.published_at,publishedBy:row.published_by,floorVersion:row.floor_version,report:JSON.parse(row.data)}))}
 }
}

/** Current records only. Caller owns native owner authorization and snapshot loading. */
export function businessCsv(state:State,people:Guest[],kind:string,reports:BusinessPerformanceReport[]=[],merges:unknown[]=[]):string {
 if(!businessExportKinds.includes(kind as BusinessExportKind))fail(404,'Unknown business export.')
 const {fields,rows}=dataset(state,people,kind as BusinessExportKind,reports,merges)
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
