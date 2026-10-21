import {bookingRuleFields} from './placemat-rules.js'

export function restaurantSetup(state,defaults,{esc,field,form,isOwner,time,who}){
 if(!isOwner)return ''
 const p=state.venue.setup,rule=p?.bookingDefaults??defaults
 if(!rule)return ''
 const summary=Object.entries(rule).map(([channel,r])=>`<li>${esc(channel)}: parties ${r.minParty}–${r.maxParty}; inquiry above ${r.inquiryAbove}; ${r.horizonDays} venue-local days ahead; ${r.leadMinutes} minutes lead; ${r.sameDayCutoff?'same-day cutoff '+esc(r.sameDayCutoff):'no same-day cutoff'}; ${r.slotMinutes}-minute slots.</li>`).join('')
 return `<article class="card" aria-label="Restaurant setup"><h3>US restaurant setup</h3><p>Enter your restaurant details and review the policies for new services. Existing services retain their approved policies.</p>${p?`<p>Policy version ${p.version} acknowledged by ${esc(who(p.acknowledgment.actor))} · ${esc(time(p.acknowledgment.at))}</p>`:''}${form('venue.onboard',field('Trading name','name','text',state.venue.name,'required maxlength="120"')+field('Legal name','legalName','text',p?.legalName??'','required maxlength="200"')+field('US street address','address','text',p?.address??'','required maxlength="500"')+field('US phone','phone','tel',p?.phone??'','required autocomplete="tel"')+field('Contact email','email','email',p?.email??'','required')+field('Contact website (optional)','website','url',p?.website??'')+field('IANA venue timezone','timezone','text',state.venue.timezone,'required')+`<label>Currency<select name="currency"><option value="USD">USD · US dollars</option></select></label><label>Restaurant logo (optional; PNG, JPEG or WebP, up to 200 KB)<input type="file" name="logoFile" accept="image/png,image/jpeg,image/webp"></label><input type="hidden" name="logo" value="${esc(p?.logo??'')}"><label><input type="checkbox" name="removeLogo"> Remove saved logo</label><input type="hidden" name="version" value="${p?.version??0}">${p?.logo?`<img src="${esc(p.logo)}" alt="Restaurant logo" width="80" height="80" style="object-fit:contain">`:''}`+bookingRuleFields({bookingRules:rule},{field})+`<section class="wide" data-policy-summary><h4>Policy summary</h4><ul>${summary}</ul><p>All rules apply together. Cutoffs and physical capacity cannot be overridden. Only owner/admin may override party size, horizon or lead with a recorded reason. Changes below update this summary before acknowledgment.</p></section><label class="wide"><input type="checkbox" name="acknowledge" required> I acknowledge this booking policy summary.</label>`,'Save restaurant setup')}</article>`
}
export function updatePolicySummary(form){
 const target=form.querySelector('[data-policy-summary] ul');if(!target)return
 const data=new FormData(form)
 target.replaceChildren(...['online','walk-in','waitlist'].map(channel=>{
  const get=key=>data.get(`rule.${channel}.${key}`),li=document.createElement('li')
  li.textContent=`${channel}: parties ${get('minParty')}–${get('maxParty')}; inquiry above ${get('inquiryAbove')}; ${get('horizonDays')} venue-local days ahead; ${get('leadMinutes')} minutes lead; ${get('sameDayCutoff')?'same-day cutoff '+get('sameDayCutoff'):'no same-day cutoff'}; ${get('slotMinutes')}-minute slots.`;return li
 }))
 const acknowledgment=form.querySelector('[name="acknowledge"]');if(acknowledgment)acknowledgment.checked=false
}
export async function onboardingPayload(form,payload){
 payload.acknowledge=form.elements.acknowledge.checked
 payload.version=Number(payload.version)
 if(form.elements.removeLogo.checked)payload.logo=''
 else if(payload.logoFile?.size){
  if(payload.logoFile.size>200*1024||!['image/png','image/jpeg','image/webp'].includes(payload.logoFile.type))throw Error('Choose a PNG, JPEG or WebP logo up to 200 KB.')
  payload.logo=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(payload.logoFile)})
 }
 delete payload.logoFile;delete payload.removeLogo;return payload
}
export function bookingPreview(result,{esc,select}){
 const v=result.venue,format=at=>new Intl.DateTimeFormat('en-US',{timeZone:v.timezone,dateStyle:'full',timeStyle:'short'}).format(new Date(at))
 return `<article class="card" aria-label="Booking page preview"><h3>Book a table · ${esc(v.name)}</h3><p>Preview only · Nothing is published or booked. ${result.physicalSeats} physical seats · ${esc(v.currency??'USD')} · ${esc(v.timezone)}</p>${v.logo?`<img src="${esc(v.logo)}" alt="Restaurant logo" width="80" height="80" style="object-fit:contain">`:''}<p>${esc(v.address)} · ${esc(v.phone)} · ${esc(v.email)} ${esc(v.website)}</p>${select('Preview available arrival times','previewTime',result.results.map(r=>[r.startAt,`${format(r.startAt)} · table until ${format(r.endAt)}`]))}${result.results.length?'':`<p>${esc(result.message)}</p>`}<p>Policies: ${result.policies.map(p=>esc(`Parties ${p.minParty}–${p.maxParty}; inquiry above ${p.inquiryAbove}; ${p.horizonDays} local days; ${p.leadMinutes} minutes lead; ${p.sameDayCutoff?'cutoff '+p.sameDayCutoff:'no cutoff'}; ${p.slotMinutes}-minute slots`)).join('; ')}</p><button type="button" disabled>Booking disabled</button></article>`
}
