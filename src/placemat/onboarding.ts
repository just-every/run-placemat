import {fail,text,type Actor,type State} from './model'
import {defaultRule,normalizeRules,type BookingRules} from './booking-rules'

export type RestaurantSetup={legalName:string;address:string;phone:string;email:string;website:string;logo:string;currency:'USD';bookingDefaults:BookingRules;version:number;acknowledgment:{actor:string;at:string;version:number;rules:BookingRules}}
export const onboardingDefaults=():BookingRules=>({online:{...defaultRule(),maxParty:8,inquiryAbove:8,horizonDays:60,sameDayCutoff:'16:00',leadMinutes:30},'walk-in':{...defaultRule(),sameDayCutoff:''},waitlist:{...defaultRule(),sameDayCutoff:''}})
export function saveOnboarding(s:State,actor:Actor,p:any,now:string){
 if(actor.agent||actor.role!=='owner')fail(403,'The venue owner must acknowledge restaurant setup.')
 if(p.version!==(s.venue.setup?.version??0))fail(409,'Restaurant setup changed. Refresh and review the current policy summary.')
 if(p.acknowledge!==true)fail(400,'Review and acknowledge the booking policy summary before saving.')
 const name=text(p.name,'Trading name',120),timezone=text(p.timezone,'Timezone',80)
 try{new Intl.DateTimeFormat('en',{timeZone:timezone}).format()}catch{fail(400,'Use a valid IANA venue timezone.')}
 if(s.services.length&&timezone!==s.venue.timezone)fail(409,'Keep the venue timezone after creating a service; existing services retain their instants.')
 const phone=text(p.phone,'US phone',40).replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'')
 if(!/^[2-9]\d{2}[2-9]\d{6}$/.test(phone))fail(400,'Enter a US phone number with its area code.')
 const email=text(p.email,'Contact email',254)
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Enter a valid contact email.')
 const website=typeof p.website==='string'?p.website.trim():''
 if(website){try{const url=new URL(website);if(url.protocol!=='https:'||url.username||url.password)throw Error()}catch{fail(400,'Use an HTTPS contact website without credentials.')}}
 const logo=typeof p.logo==='string'?p.logo:''
 if(logo&&(!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(logo)||logo.length>280000))fail(400,'Choose a PNG, JPEG or WebP logo up to 200 KB.')
 if(p.currency!=='USD')fail(400,'This restaurant edition uses USD.')
 const bookingDefaults=normalizeRules(p.bookingRules??onboardingDefaults())
 if(bookingDefaults.online.inquiryAbove!==bookingDefaults.online.maxParty)fail(400,'Set the online inquiry threshold equal to the maximum party size so every size has a route.')
 const version=(s.venue.setup?.version??0)+1
 const setup:RestaurantSetup={legalName:text(p.legalName,'Legal name',200),address:text(p.address,'US address',500),phone:'+1'+phone,email,website,logo,currency:'USD',bookingDefaults,version,acknowledgment:{actor:actor.id,at:now,version,rules:structuredClone(bookingDefaults)}}
 s.venue={name,timezone,setup};return s.venue
}
/** Only intentionally public restaurant contact/branding fields cross guest doors. */
export function publicVenue(venue:State['venue']){
 const p=venue.setup
 return {name:venue.name,timezone:venue.timezone,...p?{address:p.address,phone:p.phone,email:p.email,website:p.website,logo:p.logo,currency:p.currency}:{}}
}
