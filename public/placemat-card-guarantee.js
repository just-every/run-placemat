/** A private guest link adds one consent form to the existing reservation shell. */
export async function cardMode(){
 window.addEventListener('hashchange',()=>{if(location.hash.startsWith('#card='))location.reload();});
 const token=location.hash.slice(6),notice=document.querySelector('#notice'),content=document.querySelector('#management-content');history.replaceState(null,'',location.pathname);
 const api=async(action,p={})=>{const r=await fetch('/api/public/card-guarantee/'+action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token,...p})}),v=await r.json();if(!r.ok)throw Error(v.error||'Collection could not be confirmed.');return v;};
 const render=async()=>{
  const g=await api('status');document.querySelector('h1').textContent='Card guarantee';document.querySelector('#venue-line').textContent='Review the fee terms for this reservation before Stripe collects your card.';content.replaceChildren();
  const add=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;content.append(node);return node;};
  const venueTime=at=>new Intl.DateTimeFormat('en-US',{timeZone:g.reservation.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(at))+' · '+g.reservation.timezone;
  add('p',g.reservation.venue+' · '+g.reservation.partySize+' guests · '+new Intl.DateTimeFormat('en-US',{timeZone:g.reservation.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(g.reservation.startAt))+' · '+g.reservation.timezone);
  add('p',g.reviewText);add('p','Maximum permitted fee: '+new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(g.maxFeeCents/100)+'. Authority expires '+venueTime(g.expiresAt)+'.');
  add('p','Authorization '+g.authorizationState+'. '+(g.collectionMode==='setup'?'No funds held.':(g.heldState==='release-unconfirmed'?'Last verified held amount: ':'Held guarantee amount: ')+new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(g.fundsHeldCents/100)+'. '+(g.heldState==='release-unconfirmed'?'Release is unconfirmed.':g.heldState==='released'?'Stripe confirmed release.':'No capture claimed.'))+' '+(g.protection==='tokenized-card-guarantee'?'Tokenized card guarantee confirmed.':g.protection==='card-authorization'?'Card authorization confirmed.':'This reservation is unprotected.'));
  if(g.acceptedAt)add('p','You accepted these exact terms at '+venueTime(g.acceptedAt)+'.');
  if(g.authorizationState==='expired'){add('p','Ask the restaurant for a new collection link. No message has been sent.');return;}
  if(g.protection==='unprotected'){
   const form=document.createElement('form'),label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.required=true;label.append(check,document.createTextNode(' I accept these exact fees for this reservation and authorize the restaurant to use the card collected by Stripe for the permitted later fee until the stated expiry.'));form.append(label);const button=document.createElement('button');button.textContent='Continue to Stripe';form.append(button);content.append(form);
   form.addEventListener('submit',async e=>{e.preventDefault();button.disabled=true;try{const v=await api('accept',{accept:check.checked,reviewedText:g.reviewText});const link=new URL(v.hostedUrl);if(link.protocol!=='https:'||link.hostname!=='checkout.stripe.com')throw Error('Stripe collection link is unavailable.');location.assign(link.href);}catch(error){notice.textContent=error.message;button.disabled=false;}});
  }
  const refresh=add('button','Check collection status');refresh.addEventListener('click',async()=>{refresh.disabled=true;try{await api('sync');await render();notice.textContent='Collection status checked with Stripe.';}catch(error){await render();notice.textContent=error.message;refresh.disabled=false;}});
 };
 try{await render();notice.textContent='Private reservation collection.';}catch(error){notice.textContent=error.message;}
}
