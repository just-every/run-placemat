import {requestFields,readRequests} from './placemat-requests.js'
export function phoneIntake(service,guests,{esc,form,field,select,localTime}){
 if(service.status!=='published'||service.closedAt)return ''
 return `<details><summary>Future phone or concierge reservation</summary><p class="help">Record the caller’s preferred channel and permission for a reservation confirmation. Confirmation delivery and policy-triggered deposits are pending.</p>${form('booking.phone',`<input type="hidden" name="serviceId" value="${esc(service.id)}">`+select('Returning guest (or enter a new guest below)','guestId',[['','New guest'],...guests.filter(g=>!g.erased).map(g=>[g.id,g.name])])+field('Guest name','name','text','','required maxlength="200"')+field('Email (optional)','email','email','','maxlength="254"')+field('Phone (optional)','phone','tel','','maxlength="40"')+field('Party size','partySize','number',2,'required min="1" max="500"')+select('Reservation source','staffSource',[['phone','Phone caller'],['concierge','Hotel concierge'],['offline','Offline inquiry']])+select('Contact preference','contactPreference',[['none','No confirmation requested'],['email','Email'],['sms','SMS']])+'<label><input type="checkbox" name="confirmationConsent"> Guest explicitly permits a reservation confirmation in the selected channel.</label>'+field(`Arrival (${service.timezone||'venue time'})`,'startAt','datetime-local',localTime(service.startAt),'required')+field('UTC offset (only for a repeated local time)','startOffset')+field('Manager rule override reason (when needed)','overrideReason','text','','maxlength="1000"')+requestFields(field),'Create phone booking')}</details>`
}
export function parsePhone(form,values){
 if(form.dataset.command!=='booking.phone')return
 values.staffIntake={source:values.staffSource,contactPreference:values.contactPreference,confirmationConsent:new FormData(form).has('confirmationConsent')}
 Object.assign(values,readRequests(form));for(const key of ['staffSource','contactPreference','confirmationConsent','occasion','requestedArea','seatingPreference','dietaryNotes','allergyNotes','stroller','highchair','wheelchair'])delete values[key]
 if(!values.guestId)delete values.guestId
}
export function selectReturningGuest(event){
 if(event.target.name!=='guestId')return
 const form=event.target.closest('form[data-command="booking.phone"]');if(!form)return
 for(const key of ['name','email','phone']){const input=form.elements.namedItem(key);input.disabled=Boolean(event.target.value);if(key==='name')input.required=!event.target.value}
}
