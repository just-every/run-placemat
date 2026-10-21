import type {Guest,GuestFieldProvenance,State} from './model'

export type GuestContact={kind:'email'|'phone';value:string;sourceGuestId:string;provenance?:GuestFieldProvenance}
export type MergeGuest=Guest&{mergedInto?:string;contacts?:GuestContact[]}
export type MergeRecordKind='bookings'|'waitlist'|'reminders'|'inquiries'
export type MergeRecord=State['bookings'][number]|State['waitlist'][number]|State['reminders'][number]|NonNullable<State['inquiries']>[number]
export type GuestMergeLaterRecord={kind:MergeRecordKind|'guests';id:string;reason:'edited'|'created'|'missing'}
export type GuestMergeJournal={
 id:string;guestId:string;duplicateId:string;status:'merged'|'unmerged'|'erased';createdAt:string;createdBy:string;
 snapshots?:{
  guests:{survivor:{before:MergeGuest;after:MergeGuest;afterVersion:number};duplicate:{before:MergeGuest;after:MergeGuest;afterVersion:number}};
  auditIds:string[];
  records:Array<{kind:MergeRecordKind;id:string;before:MergeRecord;after:MergeRecord}>
 };
 unmergedAt?:string;unmergedBy?:string;pendingAssignment?:GuestMergeLaterRecord[];purgedAt?:string
}
export type GuestMergePayload={guestId:string;duplicateId:string;review:string;confirm:'MERGE'}
export type GuestUnmergePayload={mergeId:string;review:string;confirm:'UNMERGE'}
