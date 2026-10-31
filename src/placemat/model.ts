import type {ExperienceCart} from './experience-cart'
import type {Experience} from './experiences'
import type {ExperienceCommitment} from './experience-fit'
import type {HoldAllocation} from './booking-holds'
import type {ServiceNote,PreorderItem,Preorder,ManagerPreorder} from './service-notes'
import type {ServiceChange} from './service-changes'
import type {BookingRequests} from './booking-requests'
import type {Inquiry} from './inquiries'
import type {RiskDecision} from './no-show'
import type {PacingPolicy,LimitViolation} from './pacing'
import type {ServiceEvent} from './service-status'
import type {ScheduleTemplate} from './schedules'
import type {QueueEntry} from './queue'
import type {TurnPolicy} from './turn-policy'
import type { BookingRules } from './booking-rules'
import type {AnalyticsSettings,AnalyticsAudit} from './analytics'
export type TableShape = 'round'|'square'|'rectangle'|'bar'
export type Room = {id:string;name:string;kind:'indoor'|'outdoor'|'bar'}
export type Inventory = {id:string;name:string;kind:'counter'|'pool';capacity:number;turnMinutes:number;arrivalCovers:number;intervalMinutes:number;adjacent:boolean}
export type Table = { inventoryId?:string;inventoryKind?:'counter'|'pool';ordinal?:number;inventoryTurnMinutes?:number; id:string; label:string; seats:number; area?:string; accessTags?:string[]; x:number; y:number; shape?:TableShape; retiredAt?:string }
export type Combination = {id:string;tableIds:string[];capacity:number;accessTags:string[];setupMinutes:number;enabled:boolean;adjacent:true}
export type CombinationSnapshot = Omit<Combination,'enabled'|'adjacent'> & {areas:string[]}
export type ShiftServer={id:string;name:string;coverCap:number;onBreak:boolean;operatorId?:string}
export type Section={id:string;name:string;serverId:string;tableIds:string[]}
export type Staffing={servers:ShiftServer[];sections:Section[];kitchenAreaCaps:Record<string,number>}
export type ServingAssignment={serverId:string;serverName:string;sectionId:string;sectionName:string}
export type ServingEvent={id:string;at:string;actor:string;action:string;from:ServingAssignment|null;to:ServingAssignment|null;reason?:string}
export type PacingOverride={actor:string;at:string;reason:string;violations:LimitViolation[]}
export type DirectInventory={id:string;tableIds:string[];startAt:string;endAt:string;partySize:number}
export type Service = { preorderItems?:PreorderItem[]; managerPreorders?:ManagerPreorder[]; directInventory?:DirectInventory[]; pacing?:PacingPolicy; id:string; name:string; startAt:string; endAt:string; turnMinutes:number; coverLimit:number; staffing?:Staffing; status:'draft'|'published'; version:number; scheduleSource?:{scheduleId:string;scheduleVersion:number;localDate:string}; bookingRules?:BookingRules; turnPolicy?:TurnPolicy; publicQueuePaused?:boolean; closedAt?:string; closedBy?:string; closeReason?:string }
export type GuestFieldProvenance = { source:'guest-supplied'|'staff-observed'|'imported'; actor:string|null; at:string|null; reference?:string }
export type GuestProfile = { tagProvenance?:Record<string,GuestFieldProvenance>; tags:string[]; vipLevel:'none'|'regular'|'vip'; seatingPreference:string; provenance:Partial<Record<'tags'|'vipLevel'|'seatingPreference',GuestFieldProvenance>> }
export type Guest = { mergedInto?:string; contacts?:Array<{kind:'email'|'phone';value:string;sourceGuestId:string;provenance?:GuestFieldProvenance}>; id:string; name:string; email:string; phone:string; notes:string; profile?:GuestProfile; provenance?:Partial<Record<'name'|'email'|'phone'|'notes',GuestFieldProvenance>>; notesHistory?:Array<{notes:string;provenance:GuestFieldProvenance}>; history?:Array<{date:string;partySize:number;status:string}>; erased?:boolean }
export type HandoverTask={paymentRequestId?:string;id:string;kind:'request'|'callback';text:string;ownerId:string;dueAt:string;history:Array<{actor:string;at:string;action:'assigned'|'completed';ownerId?:string;dueAt?:string;outcome?:string}>}
export type Booking = { feedbackEmailConsent?:{at:string;emailHash:string;source:'guest-supplied';historical?:true}; experienceCart?:ExperienceCart; experience?:ExperienceCommitment; closureEmailConsent?:{at:string;emailHash:string;source:'guest-supplied'}; lateOperations?:import('./late-arrivals').LateOperations; needHistory?:import('./needs').NeedEvent[]; staffIntake?:{source:'phone'|'concierge'|'offline';contactPreference:'email'|'sms'|'none';confirmationConsent:boolean}; handover?:HandoverTask[]; preorders?:Preorder[]; requests?:BookingRequests; requestsAcknowledgedAt?:string; pacingOverride?:PacingOverride; serverId?:string;sectionId?:string;serverName?:string;sectionName?:string;servingHistory?:ServingEvent[]; id:string; serviceId:string; guestId:string; partySize:number; startAt:string; endAt:string; cleanupEndAt?:string; setupStartAt?:string; combination?:CombinationSnapshot; tableIds:string[]; status:'booked'|'seated'|'completed'|'cancelled'|'no-show'; source:'online'|'phone'|'walk-in'|'waitlist'; attribution?:{door:'widget';origin:string}|{door:'booking-page'}; createdAt:string; needsBussing?:boolean; assignmentLocked?:boolean; expectedEndAt?:string; requiredAccessTags?:string[]; requiredArea?:string; ruleOverride?:{actor:string;at:string;channel:string;violations:string[];reason:string} }
export type Waiting = QueueEntry
export type Proposal = { id:string; kind:'service.amend'|'service.closure'|'inventory.protect'|'service.adjust'|'allocation.improve'|'schedule.publish'|'service.publish'|'service.turns'|'reminders'|'table.assign'|'floor.change'; plan:any; status:'pending'|'approved'|'declined'; preparedBy:string; preparedAt:string; approvedBy?:string; approvedAt?:string; reason:string }
export type Reminder = { contactName?:string;contactEmail?:string;contactPhone?:string; id:string; bookingId:string; guestId:string; message:string; status:'approved'|'exported'; approvedBy:string; approvedAt:string }
export type AssignmentSnapshot = {serverId?:string;sectionId?:string;serverName?:string;sectionName?:string;bookingId:string;tableIds:string[];locked:boolean;setupStartAt?:string;combination?:CombinationSnapshot}
export type AuditEntry = {deviceId?:string;source?:'guest-supplied'|'provider'|'person'|'preparation-key';changes?:import('./audit').AuditChange[];pacing?:PacingOverride;id:string;at:string;actor:string;action:string;subject:string;before?:AssignmentSnapshot[]|{expectedEndAt:string}|{endAt:string;version:number}|{origins:string[]}|AnalyticsAudit;after?:AssignmentSnapshot[]|{expectedEndAt:string}|{endAt:string;version:number}|{origins:string[]}|AnalyticsAudit;reason?:string}
export type State = { guestEnrichments?:import('./guest-enrichment').GuestEnrichment[]; experiences?:Experience[]; holds?:HoldAllocation[]; financeIds?:string[];serverIds?:string[];leadIds?:string[];reportScopes?:Record<string,string[]>;managerRefundLimits?:Record<string,number>; inventories?:Inventory[]; serviceNotes?:ServiceNote[]; embed?:{origins:string[]}; analytics?:AnalyticsSettings; serviceChanges?:ServiceChange[]; inquiries?:Inquiry[]; riskDecisions?:RiskDecision[]; venue:{name:string;timezone:string;setup?:import('./onboarding').RestaurantSetup}; hostIds?:string[]; pacingHostIds?:string[]; rooms?:Room[]; allocationTables?:Table[]; tables:Table[]; combinations?:Combination[]; services:Service[]; schedules?:ScheduleTemplate[]; serviceEvents?:ServiceEvent[]; bookings:Booking[]; waitlist:Waiting[]; proposals:Proposal[]; reminders:Reminder[]; audit:AuditEntry[] }
export type Actor = {deviceId?:string;deviceGeneration?:number;id:string;name:string;role:string;agent?:boolean}
export const emptyState = ():State => ({venue:{name:'Placemat',timezone:'America/New_York'},rooms:[],tables:[],combinations:[],services:[],bookings:[],waitlist:[],proposals:[],reminders:[],audit:[]})
export class Problem extends Error { constructor(public status:number, message:string){super(message)} }
export const fail = (status:number,message:string):never=>{throw new Problem(status,message)}
export const id = ()=>crypto.randomUUID()
export const text = (value:unknown,label:string,max=200):string => typeof value==='string' && value.trim().length>0 && value.trim().length<=max ? value.trim() : fail(400,`${label} is required (up to ${max} characters).`)
export const number = (value:unknown,label:string,min:number,max:number):number => Number.isInteger(Number(value)) && Number(value)>=min && Number(value)<=max ? Number(value) : fail(400,`${label} must be ${min}–${max}.`)
