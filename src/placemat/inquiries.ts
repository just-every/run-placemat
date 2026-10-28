import {fail,id,number,text,type Actor,type Booking,type State} from './model'
import {instant,bookingFit,serviceBy} from './availability'
import {checkBookingRules,defaultRule,ruleFor} from './booking-rules'
import {accessTags} from './assignments'
import {searchTables} from './reservation-search'
import {checkStaffing,recordServing,servingFor} from './staffing-capacity'
import {guestFor,guestGuard,guestInsert} from './guests'
import {hash,load,save} from './store'
import {normalizeBookingRequests,requestTerms,type BookingRequests} from './booking-requests'
import {publicInquiryLimits} from './inquiry-limits.mjs'

export type InquiryMessage={id:string;author:'guest'|'venue';actorId?:string;at:string;message:string}
export type InquiryOffer={version:number;serviceId:string;startAt:string;endAt:string;cleanupEndAt:string;partySize:number;requiredArea?:string;requiredAccessTags:string[];guarantees:string[]}
export type Inquiry={
 id:string;guestId:string;ownerId:string;status:'open'|'offered'|'accepted'|'converted'|'closed';replyDueAt:string;
 partySize:number;requiredArea?:string;requiredAccessTags:string[];requests:BookingRequests;serviceId?:string;requestedStartAt?:string;
 messages:InquiryMessage[];offer?:InquiryOffer;acceptedOfferVersion?:number;acceptedAt?:string;tokenHash?:string;
 createdAt:string;updatedAt:string;closedAt?:string;bookingId?:string
}
const rows=(s:State):Inquiry[]=>(s.inquiries??=[])
const active=(row:Inquiry)=>!['closed','converted'].includes(row.status)
const unavailable=()=>fail(404,'Inquiry unavailable. Use your private inquiry link or contact the venue.')
const due=(value:unknown,now:string)=>{
 const at=instant(value,'Reply due')
 if(at<=now)fail(400,'Reply due must be in the future.')
 return at
}
function append(row:Inquiry,author:InquiryMessage['author'],message:unknown,now:string,actorId?:string){
 row.messages.push({id:id(),author,at:now,message:text(message,'Message',4000),...(actorId?{actorId}:{})})
}
function appendReply(row:Inquiry,author:InquiryMessage['author'],message:unknown,now:string,actorId?:string){
 if(row.messages.length>=publicInquiryLimits.messagesPerInquiry)fail(413,'This inquiry has reached its conversation limit. Close it or continue outside Placemat.')
 append(row,author,message,now,actorId)
}
const messageBytes=(messages:InquiryMessage[])=>messages.reduce((sum,message)=>sum+new TextEncoder().encode(message.message).byteLength,0)
function appendPublic(s:State,row:Inquiry,message:unknown,now:string){
 const value=text(message,'Message',4000),bytes=new TextEncoder().encode(value).byteLength
 if(row.messages.length>=publicInquiryLimits.messagesPerInquiry)fail(429,'This inquiry has reached its guest reply limit. Contact the venue directly for more help.')
 if(messageBytes(row.messages.filter(message=>message.author==='guest'))+bytes>publicInquiryLimits.messageBytesPerInquiry)fail(413,'This inquiry has reached its guest message size limit. Contact the venue directly for more help.')
 const venueBytes=rows(s).filter(active).reduce((sum,inquiry)=>sum+messageBytes(inquiry.messages.filter(message=>message.author==='guest')),0)
 if(venueBytes+bytes>publicInquiryLimits.activeMessageBytesPerVenue)fail(413,'Online inquiry replies are temporarily full. Contact the venue directly for more help.')
 appendReply(row,'guest',value,now)
}
function audit(s:State,row:Inquiry,now:string,actor:string,action:string){s.audit.push({id:id(),at:now,actor,action,subject:row.id})}
function view(s:State,row:Inquiry){
 return {inquiry:{id:row.id,status:row.status,partySize:row.partySize,requiredArea:row.requiredArea??null,requiredAccessTags:row.requiredAccessTags,requests:row.requests,
  serviceId:row.serviceId??null,requestedStartAt:row.requestedStartAt??null,replyDueAt:row.replyDueAt,
  messages:row.messages.map(({id,author,at,message})=>({id,author,at,message})),offer:row.offer??null,acceptedOfferVersion:row.acceptedOfferVersion??null,
  createdAt:row.createdAt,updatedAt:row.updatedAt},timezone:s.venue.timezone,
  notice:'This inquiry is not a booking. Replies appear on this private page; no email or SMS delivery is claimed. Offers do not hold capacity. Accept the exact offer here before the venue can confirm a booking.'}
}
async function byToken(s:State,token:unknown):Promise<Inquiry>{
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return unavailable()
 const digest=await hash(token)
 return rows(s).find(row=>active(row)&&row.tokenHash===digest)??unavailable()
}

export async function publicCreateInquiry(db:D1Database,p:any){
 const {state:s,version}=await load(db),now=new Date().toISOString()
 const partySize=number(p.partySize,'Party size',1,500),requests=normalizeBookingRequests(p)
 if(requestTerms(requests).length&&p.requestsAcknowledged!==true)fail(400,'Acknowledge that requests are not guaranteed before submitting.')
 const {requiredArea,requiredAccessTags}=searchTables(s,p.requiredArea,p.requiredAccessTags)
 const serviceId=p.serviceId===undefined||p.serviceId===''?undefined:text(p.serviceId,'Service',100)
 if(serviceId){const service=serviceBy(s,serviceId);if(service.status!=='published'||service.closedAt||service.endAt<=now)fail(409,'Choose an open published service.')}
 const requestedStartAt=p.requestedStartAt===undefined||p.requestedStartAt===''?undefined:instant(p.requestedStartAt,'Requested start')
 if(requestedStartAt&&requestedStartAt<=now)fail(400,'Choose a future requested time.')
 if(requestedStartAt&&serviceId){const service=serviceBy(s,serviceId);if(requestedStartAt<service.startAt||requestedStartAt>=service.endAt)fail(400,'Choose a requested time within the service.')}
 if(typeof p.email!=='string'||!p.email.trim())fail(400,'Email is required for an online inquiry.')
 const [owner,entry]=await Promise.all([
  db.prepare("SELECT id FROM oa_operators WHERE role='owner' AND status='active' ORDER BY id LIMIT 1").first<{id:string}>(),guestFor(db,p)
 ])
 if(!owner)fail(409,'Online inquiries are unavailable. Contact the venue.')
 const row:Inquiry={id:id(),guestId:entry.guest.id,ownerId:owner!.id,status:'open',replyDueAt:new Date(Date.parse(now)+86400000).toISOString(),partySize,
  requiredAccessTags,...requiredArea?{requiredArea}:{},requests,...serviceId?{serviceId}:{},...requestedStartAt?{requestedStartAt}:{},messages:[],createdAt:now,updatedAt:now}
 if(p.message!==undefined&&p.message!=='')appendPublic(s,row,p.message,now)
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('')
 row.tokenHash=await hash(token);rows(s).push(row);audit(s,row,now,'guest','inquiry.create')
 await save(db,s,version,[guestGuard(db,entry),...(entry.fresh?[guestInsert(db,entry.guest,version)]:[])],{maxBytes:publicInquiryLimits.stateBytes})
 return {...view(s,row),id:row.id,token}
}
export async function publicReadInquiry(db:D1Database,token:unknown){const {state:s}=await load(db);return view(s,await byToken(s,token))}
export async function publicReplyInquiry(db:D1Database,p:any){
 const {state:s,version}=await load(db),row=await byToken(s,p.token),now=new Date().toISOString()
 if(Object.keys(p).some(key=>!['token','message','acceptOfferVersion'].includes(key)))fail(400,'Only a message or acceptance of the current offer may be submitted here.')
 if(p.message===undefined&&p.acceptOfferVersion===undefined)fail(400,'Send a reply or accept the current offer.')
 if(p.acceptOfferVersion!==undefined){
  if(!Number.isInteger(p.acceptOfferVersion)||!row.offer||p.acceptOfferVersion!==row.offer.version)fail(409,'The offer changed. Review and accept the current exact offer.')
  if(row.offer!.startAt<=now)fail(409,'This offer has passed. Ask the venue for a new offer.')
  row.acceptedOfferVersion=row.offer!.version;row.acceptedAt=now;row.status='accepted'
 }
 if(p.message!==undefined)appendPublic(s,row,p.message,now)
 row.updatedAt=now;audit(s,row,now,'guest',p.acceptOfferVersion===undefined?'inquiry.guest-reply':'inquiry.accept')
 await save(db,s,version,[],{maxBytes:publicInquiryLimits.stateBytes})
 return view(s,row)
}

async function manager(db:D1Database,actor:Actor){
 if(actor.agent||!['owner','admin'].includes(actor.role))fail(403,'A venue manager is required.')
 const native=await db.prepare('SELECT role,status FROM oa_operators WHERE id=?').bind(actor.id).first<{role:string;status:string}>()
 if(!native||native.status!=='active'||native.role!==actor.role)fail(403,'An active native venue manager is required.')
}
function offeredFit(s:State,row:Inquiry,offer:Pick<InquiryOffer,'serviceId'|'startAt'|'partySize'|'requiredArea'|'requiredAccessTags'>,now:string){
 const service=serviceBy(s,offer.serviceId)
 if(service.status!=='published'||service.closedAt)fail(409,'Choose an open published service.')
 if(offer.startAt<=now)fail(409,'Choose a future offer time.')
 // The inquiry threshold routes direct bookings into this accepted-offer workflow.
 // Raising only that threshold keeps every other online rule and inventory fence.
 const rules=service.bookingRules??{online:defaultRule(),'walk-in':defaultRule(),waitlist:defaultRule()}
 const rule=ruleFor(service,'online'),approved={...service,bookingRules:{...rules,online:{...rule,inquiryAbove:Math.max(rule.inquiryAbove,row.partySize)}}}
 checkBookingRules(s,approved,row.partySize,offer.startAt,'online')
 const {state:filtered}=searchTables(s,offer.requiredArea,offer.requiredAccessTags)
 const fit=bookingFit(filtered,approved,row.partySize,offer.startAt)
 checkStaffing(s,[{serviceId:service.id,partySize:row.partySize,startAt:fit.startAt,endAt:fit.endAt,tableIds:fit.tables.map(t=>t.id),status:'booked'}],now)
 return fit
}
function makeOffer(s:State,row:Inquiry,p:any,now:string):InquiryOffer{
 if(p.partySize!==undefined&&number(p.partySize,'Party size',1,500)!==row.partySize)fail(409,'The offer must preserve the inquiry party size.')
 const requiredArea=p.requiredArea===undefined?row.requiredArea:p.requiredArea===''?undefined:text(p.requiredArea,'Required dining area',80)
 if(row.requiredArea&&requiredArea!==row.requiredArea)fail(409,'An offer cannot weaken the required dining area.')
 const requiredAccessTags=p.requiredAccessTags===undefined?row.requiredAccessTags:accessTags(p.requiredAccessTags,'Required access tags')
 if(row.requiredAccessTags.some(tag=>!requiredAccessTags.includes(tag)))fail(409,'An offer cannot weaken required access needs.')
 if(p.guarantees!==undefined)fail(400,'Offer guarantees are derived from verified party size, timing, dining area and access needs.')
 const constraints={serviceId:text(p.serviceId,'Offered service',100),startAt:instant(p.startAt,'Offered start'),partySize:row.partySize,...requiredArea?{requiredArea}:{},requiredAccessTags}
 const fit=offeredFit(s,row,constraints,now)
 const format=(at:string)=>new Intl.DateTimeFormat('en-US',{timeZone:s.venue.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(at))
 const guarantees=[`Party of ${row.partySize}.`,`Arrival: ${format(fit.startAt)} (${s.venue.timezone}).`,`Table until: ${format(fit.endAt)} (${s.venue.timezone}).`,
  ...requiredArea?[`Required dining area: ${requiredArea}.`]:[],...requiredAccessTags.map(tag=>`Required access: ${tag}.`)]
 return {...constraints,version:(row.offer?.version??0)+1,endAt:fit.endAt,cleanupEndAt:fit.cleanupEndAt,guarantees}
}

/** The existing dispatcher performs its atomic save and common command audit. */
export async function executeInquiry(s:State,actor:Actor,command:string,p:any,now:string,db:D1Database){
 await manager(db,actor)
 now=instant(now,'Command time')
 const row=rows(s).find(row=>row.id===(p.inquiryId??p.id))??fail(404,'Inquiry not found.')
 if(!active(row))fail(409,'This inquiry is resolved.')
 if(command==='inquiry.assign'){
  const ownerId=text(p.ownerId,'Inquiry owner',100)
  const owner=await db.prepare("SELECT id FROM oa_operators WHERE id=? AND role IN ('owner','admin') AND status='active'").bind(ownerId).first<{id:string}>()
  if(!owner)fail(409,'Choose an active native venue manager as inquiry owner.')
  row.ownerId=ownerId;if(p.replyDueAt!==undefined)row.replyDueAt=due(p.replyDueAt,now)
 }else if(command==='inquiry.reply'){
  const offerPayload=p.offer??p,hasOffer=p.offer!==undefined||p.serviceId!==undefined||p.startAt!==undefined
  if(!hasOffer&&p.message===undefined)fail(400,'Write a reply or supply an exact offer.')
  if(hasOffer){row.offer=makeOffer(s,row,offerPayload,now);delete row.acceptedOfferVersion;delete row.acceptedAt;row.status='offered'}
  if(p.message!==undefined)appendReply(row,'venue',p.message,now,actor.id)
  if(p.replyDueAt!==undefined)row.replyDueAt=due(p.replyDueAt,now)
 }else if(command==='inquiry.close'){
  if(p.message!==undefined)append(row,'venue',p.message,now,actor.id)
  row.status='closed';row.closedAt=now;delete row.tokenHash
 }else if(command==='inquiry.convert'){
  const offer=row.offer
  if(!offer||row.acceptedOfferVersion!==offer.version||row.status!=='accepted')fail(409,'The guest must explicitly accept the current exact offer before conversion.')
  const accepted=offer!
  if(accepted.partySize!==row.partySize||row.requiredArea&&accepted.requiredArea!==row.requiredArea||row.requiredAccessTags.some(tag=>!accepted.requiredAccessTags.includes(tag)))fail(409,'The accepted offer does not preserve this inquiry’s requirements.')
  const fit=offeredFit(s,row,accepted,now),{tables,...slot}=fit
  if(slot.endAt!==accepted.endAt||slot.cleanupEndAt!==accepted.cleanupEndAt)fail(409,'The offered turn changed. Send a new exact offer for guest acceptance.')
  const guest=await db.prepare("SELECT id FROM pm_guests WHERE id=? AND COALESCE(json_extract(data,'$.erased'),0)=0").bind(row.guestId).first<{id:string}>()
  if(!guest)fail(409,'This guest record is unavailable.')
  if(s.bookings.some(b=>b.guestId===row.guestId&&b.startAt===accepted.startAt&&!['cancelled','no-show'].includes(b.status)))fail(409,'A booking already exists for this guest at that time.')
  const booking:Booking={id:id(),guestId:row.guestId,serviceId:accepted.serviceId,partySize:row.partySize,...slot,requiredAccessTags:[...accepted.requiredAccessTags],...accepted.requiredArea?{requiredArea:accepted.requiredArea}:{},requests:structuredClone(row.requests),requestsAcknowledgedAt:row.acceptedAt,tableIds:tables.map(t=>t.id),status:'booked',source:'online',createdAt:now}
  recordServing(booking,servingFor(s,booking.serviceId,booking.tableIds),actor.id,now,command)
  s.bookings.push(booking);s.audit.push({id:id(),at:now,actor:actor.id,action:'booking.inquiry',subject:booking.id})
  row.status='converted';row.bookingId=booking.id;row.closedAt=now;row.updatedAt=now;delete row.tokenHash
  return {id:row.id,inquiry:row,booking,before:[guestGuard(db,{guest:{id:row.guestId},fresh:false,hashes:[]})]}
 }else fail(400,'Unknown inquiry command.')
 row.updatedAt=now
 return row
}
