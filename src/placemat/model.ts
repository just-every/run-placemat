export type Table = { id:string; label:string; seats:number; x:number; y:number }
export type Service = { id:string; name:string; startAt:string; endAt:string; turnMinutes:number; coverLimit:number; status:'draft'|'published'; version:number }
export type Guest = { id:string; name:string; email:string; phone:string; notes:string; history?:Array<{date:string;partySize:number;status:string}>; erased?:boolean }
export type Booking = { id:string; serviceId:string; guestId:string; partySize:number; startAt:string; endAt:string; tableIds:string[]; status:'booked'|'seated'|'completed'|'cancelled'|'no-show'; source:'online'|'walk-in'|'waitlist'; createdAt:string }
export type Waiting = { id:string; serviceId:string; guestId:string; partySize:number; status:'waiting'|'seated'|'cancelled' }
export type Proposal = { id:string; kind:'service.publish'|'reminders'|'table.assign'; plan:any; status:'pending'|'approved'|'declined'; preparedBy:string; preparedAt:string; approvedBy?:string; approvedAt?:string; reason:string }
export type Reminder = { id:string; bookingId:string; guestId:string; message:string; status:'approved'|'exported'; approvedBy:string; approvedAt:string }
export type State = { venue:{name:string;timezone:string}; tables:Table[]; services:Service[]; bookings:Booking[]; waitlist:Waiting[]; proposals:Proposal[]; reminders:Reminder[]; audit:Array<{id:string;at:string;actor:string;action:string;subject:string}> }
export type Actor = {id:string;name:string;role:string;agent?:boolean}
export const emptyState = ():State => ({venue:{name:'Placemat',timezone:'America/New_York'},tables:[],services:[],bookings:[],waitlist:[],proposals:[],reminders:[],audit:[]})
export class Problem extends Error { constructor(public status:number, message:string){super(message)} }
export const fail = (status:number,message:string):never=>{throw new Problem(status,message)}
export const id = ()=>crypto.randomUUID()
export const text = (value:unknown,label:string,max=200):string => typeof value==='string' && value.trim().length>0 && value.trim().length<=max ? value.trim() : fail(400,`${label} is required (up to ${max} characters).`)
export const number = (value:unknown,label:string,min:number,max:number):number => Number.isInteger(Number(value)) && Number(value)>=min && Number(value)<=max ? Number(value) : fail(400,`${label} must be ${min}–${max}.`)
