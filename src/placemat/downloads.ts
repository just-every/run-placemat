import { fail,type State } from './model'
import { guests,save } from './store'
// Dial calendar-file.ts adapted: UTC dates, escaped text and UTF-8 folding.
const instant=(v:string)=>new Date(v).toISOString().slice(0,19).replaceAll('-','').replaceAll(':','')+'Z'
const text=(v:string)=>v.replace(/\r\n|\r|\n/g,'\n').replaceAll('\\','\\\\').replaceAll(';','\\;').replaceAll(',','\\,').replaceAll('\n','\\n')
function fold(line:string){let result='',length=0;for(const c of line){const n=new TextEncoder().encode(c).length;if(length+n>75){result+='\r\n ';length=1}result+=c;length+=n}return result}
export function calendar(s:State,bookingId:string){const b=s.bookings.find(b=>b.id===bookingId)??fail(404,'Booking not found.');return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Placemat//Booking//EN',`METHOD:${b.status==='cancelled'?'CANCEL':'PUBLISH'}`,'BEGIN:VEVENT',`UID:placemat-${b.id}@placemat`,`DTSTAMP:${instant(b.createdAt)}`,`DTSTART:${instant(b.startAt)}`,`DTEND:${instant(b.endAt)}`,`SUMMARY:${text(s.venue.name)} table for ${b.partySize}`,...(b.status==='cancelled'?['STATUS:CANCELLED']:[]),'END:VEVENT','END:VCALENDAR'].map(fold).join('\r\n')+'\r\n'}
// CSV cells neutralize spreadsheet formula evaluation, including phone numbers.
const cell=(v:string)=>'"'+(/^[=+\-@\t\r]/.test(v)?"'"+v:v).replaceAll('"','""')+'"'
export async function reminderCsv(db:D1Database,s:State,version:number){
 const people=await guests(db),rows=[['booking_id','guest','email','phone','message','approved_by','approved_at']]
 for(const r of s.reminders){const g=people.find(g=>g.id===r.guestId),b=s.bookings.find(b=>b.id===r.bookingId);if(!g||g.erased||b?.status!=='booked')continue;rows.push([r.bookingId,r.contactName??g.name,r.contactEmail??g.email,r.contactPhone??g.phone,r.message,r.approvedBy,r.approvedAt]);r.status='exported'}
 await save(db,s,version)
 return rows.map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n'
}
