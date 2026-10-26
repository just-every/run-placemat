/* Published options are bounded quantities and numbered guest choices, never a safety claim. */
const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
export function optionEditor(entry,field,esc){
 const row=(kind,value={})=>`<div class="form-grid wide" data-experience-option="${kind}" data-option-id="${esc(value.id||'')}">${field(kind==='addon'?'Included add-on name':'Dietary choice label','optionName','text',value.name||'','required maxlength="120"')}${kind==='addon'?field('Quantity available per service','optionLimit','number',value.quantityLimit||1,'required min="1" max="500"'):''}<button type="button" class="secondary" data-remove-experience-option>Remove option</button></div>`;
 return `<fieldset class="wide"><legend>Included add-ons</legend><p>These options cost USD 0.00. Paid add-ons are unavailable.</p><div data-experience-options="addon">${(entry?.addOns||[]).map(value=>row('addon',value)).join('')}</div><button type="button" class="secondary" data-add-experience-option="addon">Add included add-on</button></fieldset><fieldset class="wide"><legend>Dietary choices</legend><p>Guests may choose one published option per numbered guest. These are unverified requests, with no promise of allergy-safe preparation.</p><div data-experience-options="dietary">${(entry?.dietaryChoices||[]).map(value=>row('dietary',value)).join('')}</div><button type="button" class="secondary" data-add-experience-option="dietary">Add dietary choice</button></fieldset>`;
}
export function editOption(event,field,esc){
 const remove=event.target.closest('[data-remove-experience-option]');if(remove){remove.closest('[data-experience-option]').remove();return true;}
 const add=event.target.closest('[data-add-experience-option]');if(!add)return false;
 const kind=add.dataset.addExperienceOption,target=add.closest('fieldset').querySelector('[data-experience-options]');
 if(target.children.length>=20)throw new Error('Choose up to 20 options of each kind.');
 target.insertAdjacentHTML('beforeend',`<div class="form-grid wide" data-experience-option="${kind}" data-option-id="">${field(kind==='addon'?'Included add-on name':'Dietary choice label','optionName','text','','required maxlength="120"')}${kind==='addon'?field('Quantity available per service','optionLimit','number',1,'required min="1" max="500"'):''}<button type="button" class="secondary" data-remove-experience-option>Remove option</button></div>`);return true;
}
export function readOptions(form){
 const rows=kind=>[...form.querySelectorAll(`[data-experience-option="${kind}"]`)];
 const value=row=>({...row.dataset.optionId?{id:row.dataset.optionId}:{},name:row.querySelector('[name=optionName]').value});
 return {addOns:rows('addon').map(row=>({...value(row),unitAmountCents:0,quantityLimit:Number(row.querySelector('[name=optionLimit]').value)})),dietaryChoices:rows('dietary').map(value)};
}
export function optionSummary(entry,esc){
 return `<dt>Included add-ons</dt><dd>${(entry.addOns||[]).map(item=>`${esc(item.name)} · USD 0.00 · ${item.quantityLimit} per service`).join('<br>')||'None'}</dd><dt>Dietary choices</dt><dd>${(entry.dietaryChoices||[]).map(item=>esc(item.name)).join(', ')||'None'}</dd>`;
}
export function cartFields(entry,partySize,cart,esc,serviceId){
 if(!entry)return '';
 return `<fieldset class="wide experience-options"><legend>Your experience tickets and options</legend><p>${partySize} × ${esc(entry.name)} · ${money(entry.amountCents)} each. Included add-ons cost USD 0.00; no payment is taken.</p>${(entry.addOns||[]).map(item=>`<label>${esc(item.name)} · USD 0.00 · ${item.remainingByServiceId?.[serviceId]??item.quantityLimit} remaining for this service<input type="number" min="0" max="${item.remainingByServiceId?.[serviceId]??item.quantityLimit}" step="1" value="${cart?.items?.find(row=>row.id===item.id)?.quantity||0}" data-experience-cart-item="${esc(item.id)}"></label>`).join('')}${entry.dietaryChoices?.length?`<p>Optional guest-supplied dietary choices are unverified requests. No allergy-safe preparation is confirmed.</p>${Array.from({length:partySize},(_,index)=>`<label>Guest ${index+1} dietary choice<select data-experience-guest-number="${index+1}"><option value="">No choice supplied</option>${entry.dietaryChoices.map(item=>`<option value="${esc(item.id)}"${cart?.dietaryChoices?.some(row=>row.guestNumber===index+1&&row.choiceId===item.id)?' selected':''}>${esc(item.name)}</option>`).join('')}</select></label>`).join('')}`:''}<p>Ticket total: ${money(entry.amountCents*partySize)} USD. These tickets belong only to this reservation.</p></fieldset>`;
}
export function readCart(form){
 return {items:[...form.querySelectorAll('[data-experience-cart-item]')].map(input=>({id:input.dataset.experienceCartItem,quantity:Number(input.value)})).filter(item=>item.quantity!==0),dietaryChoices:[...form.querySelectorAll('[data-experience-guest-number]')].filter(input=>input.value).map(input=>({guestNumber:Number(input.dataset.experienceGuestNumber),choiceId:input.value}))};
}
export function cartSummary(cart,esc,preview=false){
 if(!cart)return '';
 return `<section aria-label="Experience ticket receipt"><h3>${preview?'Review ticket options':'Experience ticket receipt'}</h3><p>${cart.ticketQuantity} tickets · Total USD ${(cart.totalCents/100).toFixed(2)} · No payment taken.</p>${cart.items.map(item=>`<p>${item.quantity} × ${esc(item.name)} · USD ${(item.totalCents/100).toFixed(2)}</p>`).join('')}<p>${preview?'These options are held for this checkout only.':'Bound to this reservation only. No transfer, top-up or general spending.'}</p></section>`;
}
