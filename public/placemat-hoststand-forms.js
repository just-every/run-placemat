import {requestFields} from './placemat-requests.js';
import {localTime} from './placemat-local-time.js';

export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const hidden=(name,value)=>`<input type="hidden" name="${esc(name)}" value="${esc(value)}">`;
export const field=(label,name,type='text',value='',attrs='')=>`<label>${esc(label)}<input name="${esc(name)}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
export const select=(label,name,options,value='',attrs='')=>`<label>${esc(label)}<select name="${esc(name)}" ${attrs}>${options.map(([id,label])=>`<option value="${esc(id)}"${id===value?' selected':''}>${esc(label)}</option>`).join('')}</select></label>`;
export const form=(action,fields,label)=>`<form data-host-action="${esc(action)}">${fields}<div data-pacing-warning></div><button>${esc(label)}</button></form>`;
export const tableField=(data,selected=[],required=false)=>`<label>Physical seats or table${required?'':' (optional; leave empty for automatic assignment)'}<select name="tableIds" multiple${required?' required':''}>${data.tables.map(t=>`<option value="${esc(t.id)}"${selected.includes(t.id)?' selected':''}>${esc(t.label)} · ${esc(t.seats)} seats</option>`).join('')}</select></label>`;
export function timeFields(label,name,at,data){
 return field(`${label} (${data.venue.timezone})`,name,'datetime-local',localTime(at,data.venue.timezone),'required')+field('UTC offset (only for a repeated local time)','startOffset','text','','placeholder="-04:00"');
}
export function bookingIntake(data,service){
 if(!service)return '';
 const now=new Date(Math.max(Date.now(),Date.parse(service.startAt))).toISOString();
 const fields=()=>hidden('serviceId',service.id)+field('Guest name','name','text','','required maxlength="200"')+field('Email (optional)','email','email','','maxlength="254"')+field('Phone (optional)','phone','tel','','maxlength="40"')+field('Party size','partySize','number',2,'required min="1" max="500"');
 return `<section aria-label="New parties"><h2>Add a party</h2><details><summary>Phone booking</summary>${form('booking.phone',select('Returning guest (or enter a new guest below)','guestId',[['','New guest'],...(data.returningGuests||[]).map(g=>[g.id,g.name])])+fields()+select('Reservation source','staffSource',[['phone','Phone caller'],['concierge','Hotel concierge'],['offline','Offline inquiry']])+select('Confirmation channel','contactPreference',[['none','No confirmation requested'],['email','Email'],['sms','SMS']])+'<label><input type="checkbox" name="confirmationConsent"> Guest explicitly permits a reservation confirmation in the selected channel.</label>'+field('Manager rule override reason (when needed)','overrideReason','text','','maxlength="1000"')+requestFields(field)+timeFields('Arrival time','startAt',now,data)+tableField(data),'Create phone booking')}</details>${data.pacingGranted?`<details><summary>Walk-in</summary>${form('booking.walkin',fields()+timeFields('Seating time','startAt',now,data)+tableField(data),'Seat walk-in')}</details>`:''}<details><summary>Add a waiting party</summary>${form('waitlist.add',fields()+field('No-phone contact arrangement (optional)','contactReason','text','','maxlength="500"')+'<label><input type="checkbox" name="contactConsent" value="true"> Guest permits contact about this queue entry.</label>','Add to waitlist')}</details></section>`;
}
export function waitlist(data,serviceId){
 return `<section aria-label="Host stand waitlist"><h2>Waitlist</h2>${data.waitlist.filter(w=>w.serviceId===serviceId).map(w=>`<article class="card" data-device-waitlist="${esc(w.id)}"><h3>${esc(w.name)}</h3><p>${esc(w.partySize)} guests · ${esc(w.status)}</p><p class="help">Required area: ${esc(w.requiredArea||'Any area')}<br>Declared access needs: ${esc((w.requiredAccessTags||[]).join(', ')||'None recorded')}</p>${w.quote?`<p>Quoted wait: ${esc(w.quote.minMinutes)}–${esc(w.quote.maxMinutes)} minutes</p>`:''}${form('waitlist.party',hidden('waitlistId',w.id)+field('Party size','partySize','number',w.partySize,'required min="1" max="500"'),'Update party size')}${data.pacingGranted?`<details><summary>Seat waiting party</summary>${form('waitlist.seat',hidden('waitlistId',w.id)+timeFields('Seating time','startAt',new Date(Math.max(Date.now(),Date.parse(data.services.find(s=>s.id===serviceId).startAt))).toISOString(),data)+tableField(data),'Seat waiting party')}</details>`:''}</article>`).join('')||'<p>No waiting parties for this service.</p>'}</section>`;
}
export function paymentLink(url){
 if(typeof url!=='string'||!url)return '';
 const link=new URL(url,location.origin);
 if(link.protocol!=='https:'&&link.origin!==location.origin)return '';
 return `<p><a href="${esc(link.href)}" target="_blank" rel="noopener noreferrer">Open guest payment link</a></p><p class="help">Share the link with the guest. This screen does not confirm message delivery.</p>`;
}
