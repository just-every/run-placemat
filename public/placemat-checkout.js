import {cartSummary} from './placemat-experience-options.js'
/* Recovery keeps only this tab's random checkout capability, never contact or request text. */
export function createCheckout({api,root,esc,notice,formatTime,onConfirmed,onReleased}){
 const key='placemat-checkout',random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('')
 let capability,payload,expiryTimer
 const read=()=>{try{return JSON.parse(sessionStorage.getItem(key)||'null')}catch{return null}}
 const retain=value=>{capability=value;sessionStorage.setItem(key,JSON.stringify(value))}
 const clear=()=>{clearInterval(expiryTimer);capability=undefined;payload=undefined;sessionStorage.removeItem(key)}
 function held(view){
  clearInterval(expiryTimer)
  root.innerHTML=`<article class="card" aria-label="Checkout hold"><h2>Table held for you</h2><p>Your table is reserved until <time>${esc(formatTime(view.hold.expiresAt))}</time>.</p><p data-hold-countdown role="status"></p><p>${esc(view.hold.partySize)} guests · ${esc(formatTime(view.hold.startAt))}, until ${esc(formatTime(view.hold.endAt))}.</p>${cartSummary(view.hold.experienceCart,esc)}<p class="help">A hold is not a confirmed booking. No payment is requested before your reservation is saved.${payload?' Review your visit, then finish the reservation.':' This tab has recovered the hold. Release it to re-enter your contact and visit details.'}</p>${payload?'<button type="button" data-checkout="finish">Finish reservation</button> ':''}<button type="button" class="secondary" data-checkout="release">Release hold</button></article>`
  const update=()=>{const node=root.querySelector('[data-hold-countdown]');if(!node){clearInterval(expiryTimer);return}const remaining=Math.max(0,Math.ceil((Date.parse(view.hold.expiresAt)-Date.now())/1000));node.textContent=remaining?`${Math.floor(remaining/60)} min ${remaining%60} sec remaining`:'Hold expired. Release it and select a new time.';if(!remaining){root.querySelector('[data-checkout="finish"]')?.setAttribute('disabled','');clearInterval(expiryTimer)}}
  update();expiryTimer=setInterval(update,1000)
 }
 async function reserve(booking){
  if(!capability)retain({requestId:crypto.randomUUID(),token:random()})
  payload=booking
  const view=await api('/api/public/booking-holds',{...capability,booking,ttlSeconds:300})
  if(view.status==='completed'){clearInterval(expiryTimer);onConfirmed(view.result);return view}
  if(view.status!=='active')throw new Error('This hold expired or was released. Release it and choose a new time.')
  return view
 }
 async function finish(booking=payload){
  if(!booking)throw new Error('Recover this hold or release it before starting a new reservation.')
  const view=await reserve(booking)
  if(view.status==='completed')return view.result
  const result=(await api('/api/public/book',{...booking,checkout:capability})).result
  clearInterval(expiryTimer);return result
 }
 async function recover(){
  capability=read();if(!capability)return false
  let view
  try{view=await api('/api/public/booking-holds/status',capability)}catch(error){if([400,404].includes(error.status)){clear();notice('Previous checkout recovery is no longer available. Choose a new visit.');return false}throw error}
  if(view.status==='completed'){onConfirmed(view.result);return true}
  if(view.status==='active'){held(view);notice('Your table hold was recovered. Review its expiry before continuing.');return true}
  clear();notice('Your previous hold expired or was released. Choose an available time.');return false
 }
 root.addEventListener('click',async event=>{
  const button=event.target.closest('[data-checkout]');if(!button||button.disabled)return
  const controls=[...root.querySelectorAll('button')];controls.forEach(b=>b.disabled=true)
  try{
   if(button.dataset.checkout==='release'){await api('/api/public/booking-holds/abandon',capability);clear();await onReleased();notice('Hold released. Choose an available time.')}
   else onConfirmed(await finish())
  }catch(error){notice(error.message,'error')}
  finally{controls.forEach(b=>{if(b.isConnected)b.disabled=false})}
 })
 return {finish,async review(booking){const view=await reserve(booking);if(view.status==='active'){held(view);notice('Table held. Review your visit and expiry, then finish your reservation.')}},recover,clear,async release(){if(!capability)return;let view;try{view=await api('/api/public/booking-holds/abandon',capability)}catch(error){if(error.status!==404)throw error;clear();return}if(view.status==='completed')return view.result;clear()}}
}
