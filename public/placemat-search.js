import {cartFields,readCart,cartSummary} from './placemat-experience-options.js'
import {createCheckout} from './placemat-checkout.js'
import {preorderFields,readPreorders,preorderSummary} from './placemat-service-notes.js'
import {requestFields,readRequests,requestSummary} from './placemat-requests.js'
/* Guest availability and booking. Events stay inside the existing booking shell. */
export function createPublicSearch({api, esc, field, select, notice, analytics}) {
  const root = document.querySelector('#public-content');
  const checkout=createCheckout({api,root,esc,notice,formatTime:value=>fullTime(value),onConfirmed:confirmed,onReleased:()=>run(()=>search(query),'Refreshing availability…')});
  const pageSize = 40;
  let venue, response, query, selected, page = 0, working = false;
  let areas = [], accessTags = [], experiences = [], menus = new Map();
  let contact = {name: '', email: '', phone: ''}, requests, experienceCart, closureEmailConsent=false;
  const find = selector => root.querySelector(selector);
  const action = (label, value, disabled = false) => `<button type="button" class="secondary" data-public-action="${value}"${disabled ? ' disabled' : ''}>${esc(label)}</button>`;
  const fullTime = value => new Intl.DateTimeFormat('en-US', {
    timeZone: venue.timezone, dateStyle: 'full', timeStyle: 'short',
  }).format(new Date(value));
  function today() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: venue.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date()).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function rememberContact() {
    const form = find('[data-public-command="book"]');
    if (!form) return;
    const values = new FormData(form);
    closureEmailConsent=values.has('closureEmailConsent');
    experienceCart=selected?.experienceId?readCart(form):undefined;
    requests={...readRequests(form),preorders:readPreorders(form,menus.get(selected?.serviceId))};
    contact = Object.fromEntries(['name', 'email', 'phone'].map(name => [name, String(values.get(name) || '')]));
  }
  function preferences(form) {
    const values = new FormData(form);
    return {date: String(values.get('date')), partySize: Number(values.get('partySize')),
      area: String(values.get('area') || ''), requiredAccessTags: values.getAll('requiredAccessTags').map(String),
      experienceId: String(values.get('experienceId') || ''), ticketClassId: String(values.get('ticketClassId') || '')};
  }
  function constraints() {
    const inventory=response?.inventoryOptions?.find(i=>i.name===query.area);
    return `${query.partySize} guests · ${inventory?`${inventory.kind==='pool'?'Unassigned covers':'Counter seats'}: ${query.area}; hosts may transfer to physical seating`:query.area ? `Area guaranteed: ${query.area}` : 'Any available area'} · ${query.requiredAccessTags.length ? `Required access guaranteed: ${query.requiredAccessTags.join(', ')}` : 'No access requirements selected'}`;
  }
  function slotLabel(slot) {
    return `${slot.alternative ? 'Nearby date alternative' : 'Requested date'} · ${fullTime(slot.startAt)} · ${slot.serviceName}${slot.experienceId ? ` · ${slot.experienceName} · ${slot.className}` : ''} · until ${fullTime(slot.endAt)}`;
  }
  const price = entry => {
    const amount=new Intl.NumberFormat('en-US',{style:'currency',currency:entry.currency}).format(entry.amountCents/100);
    return entry.kind==='free'?`Free experience · ${amount}`:`Required ${entry.kind==='deposit'?'deposit':'prepayment'}: ${amount} per guest`;
  };
  function renderExperienceClasses(experienceId,classId='') {
    const target=find('[data-experience-class-filter]'),entry=experiences.find(row=>row.id===experienceId);
    target.innerHTML=entry?select('Ticket class','ticketClassId',[['','Choose a ticket class'],...entry.ticketClasses.map(row=>[row.id,`${row.name} · quantity limit ${row.quantityLimit}`])],classId):'';
    target.hidden=!entry;
  }
  function renderExperienceCatalog(experienceId='') {
    find('[data-public-experiences]').innerHTML=experiences.length?`<section aria-label="Dining experiences"><h2>Dining experiences</h2>${experiences.map(entry=>`<details class="card"${entry.id===experienceId?' open':''}><summary>${esc(entry.name)} · ${esc(price(entry))}</summary>${entry.image?`<img src="${esc(entry.image)}" alt="${esc(entry.name)}" width="320" loading="lazy" class="experience-image">`:''}<h3>Menu</h3><p class="experience-copy">${esc(entry.menu)}</p><h3>Dates and seating</h3><ul>${entry.dates.map(date=>`<li>${esc(date.name)} · ${esc(fullTime(date.startAt))} to ${esc(fullTime(date.endAt))} · last seating ${esc(fullTime(date.lastSeatingAt))}</li>`).join('')}</ul><p>Seating areas: ${esc(entry.areas.join(', '))}</p><p>${entry.turnMinutes} minutes dining · ${entry.cleanupMinutes} minutes cleanup</p><h3>Ticket classes</h3><ul>${entry.ticketClasses.map(ticket=>`<li>${esc(ticket.name)} · quantity limit ${ticket.quantityLimit}</li>`).join('')}</ul><h3>Cancellation rules</h3><p class="experience-copy">${esc(entry.cancellationRules)}</p><p>${entry.bookingAvailable?'Choose this experience and a ticket class, then search for available times.':'Online experience checkout is not available. This listing takes no payment and creates no reservation.'}</p></details>`).join('')}</section>`:'';
  }
  function experienceDisclosure(entry) {
    return `<section class="wide booking-policy" aria-label="Experience terms"><h3>${esc(selected.experienceName)} · ${esc(selected.className)}</h3><p>${esc(price(entry))} · ${entry.turnMinutes} minutes dining · ${entry.cleanupMinutes} minutes cleanup.</p><p class="experience-copy">Cancellation rules: ${esc(entry.cancellationRules)}</p><label><input type="checkbox" name="acknowledgedExperienceTerms" required> I agree to this experience’s price, dining duration, cleanup and cancellation rules.</label></section>`;
  }
  function renderSearch() {
    // Keep unavailable submitted constraints visible so guests can change them explicitly.
    const availableAreas = [...new Set([...areas, ...(query.area ? [query.area] : [])])];
    const tags = [...new Set([...accessTags, ...query.requiredAccessTags])];
    const experienceOptions=[['','Ordinary reservation'],...experiences.map(entry=>[entry.id,`${entry.name}${entry.bookingAvailable?'':' · online checkout unavailable'}`])];
    if(query.experienceId&&!experiences.some(entry=>entry.id===query.experienceId))experienceOptions.push([query.experienceId,'Previously selected experience · unavailable']);
    root.innerHTML = `<form data-public-command="search"><fieldset><div class="form-grid">${field('Arrival date', 'date', 'date', query.date, 'required')}${field('Party size', 'partySize', 'number', query.partySize, 'required min="1" max="500"')}${select('Required area', 'area', [['', 'Any available area'], ...availableAreas.map(area => [area, area])], query.area)}${select('Dining experience','experienceId',experienceOptions,query.experienceId)}<div data-experience-class-filter></div><fieldset class="wide"><legend>Required table access</legend>${tags.length ? tags.map(tag => `<label><input type="checkbox" name="requiredAccessTags" value="${esc(tag)}"${query.requiredAccessTags.includes(tag) ? ' checked' : ''}>${esc(tag)}</label>`).join('') : '<p class="help">No table access features are listed. Contact the venue if you need an access feature.</p>'}<p class="help">Choose every feature your party needs. Results must meet all selected requirements.</p></fieldset><div class="wide"><button type="submit">Find available times</button></div></div></fieldset></form><div data-public-experiences></div><div id="public-search-results" aria-live="polite"></div><div id="public-booking-form"></div>`;
    // An empty area means no constraint; this selector must permit that value.
    find('[name="area"]').required = false;
    find('[name="experienceId"]').required = false;
    renderExperienceClasses(query.experienceId,query.ticketClassId);
    renderExperienceCatalog(query.experienceId);
  }
  function clock(value) {
    const [hour, minute] = value.split(':').map(Number);
    return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
  }
  function policyText(p) {
    const day = new Intl.DateTimeFormat('en-US', {timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric'}).format(new Date(`${p.date}T12:00:00Z`));
    return `${p.serviceName} (${day}): online parties of ${p.minParty}–${p.maxParty}; parties over ${p.inquiryAbove} send a group inquiry; bookings open ${p.horizonDays} days ahead; ${p.sameDayCutoff?'same-day bookings until '+clock(p.sameDayCutoff):'no same-day cutoff'}; ${p.leadMinutes ? `book at least ${p.leadMinutes} minutes ahead` : 'no minimum notice'}; arrivals every ${p.slotMinutes} minutes.`;
  }
  function policies() {
    // BOOK-002 policy disclosure: the venue's online booking rules, shown before a guest confirms.
    const rows = response?.policies || [];
    return rows.length ? `<section class="booking-policy" aria-label="Booking policy"><h2>Booking policy</h2><ul>${rows.map(p => `<li>${esc(policyText(p))}</li>`).join('')}</ul><p class="help">Times are in ${esc(venue.timezone)}. Your reservation runs from arrival until the end time shown.</p></section>` : '';
  }
  function renderResults() {
    const target = find('#public-search-results');
    if (!response) {
      target.innerHTML = '<p class="help">Choose your visit details and find available times.</p>';
      return;
    }
    const rows = response.results;
    if (!rows.length) {
      target.innerHTML = `<p class="empty">${esc(response.message || 'No available times match your visit.')}</p><p>Change the date, party size, area or access requirements and search again, or contact the venue. No booking has been made.</p>${policies()}`;
      return;
    }
    const offset = page * pageSize, visible = rows.slice(offset, offset + pageSize);
    target.innerHTML = `<article class="card"><h2>Available arrival times</h2><p>${esc(constraints())}</p><p class="help">${esc(response.message || 'Choose an arrival time. Nearby date alternatives are labelled below.')} All times in ${esc(venue.timezone)}.</p><label>Choose an available time<select name="public-result"><option value="">Choose a time</option>${visible.map((slot, index) => `<option value="${offset + index}"${selected === slot ? ' selected' : ''}>${esc(slotLabel(slot))}</option>`).join('')}</select></label>${rows.length > pageSize ? `<p class="help">Times ${offset + 1}–${offset + visible.length} of ${rows.length}, in arrival order.</p><div class="actions">${action('Earlier times', 'previous', page === 0)}${action('Later times', 'next', offset + pageSize >= rows.length)}</div>` : ''}</article>${policies()}`;
  }
  function renderBooking() {
    const target = find('#public-booking-form');
    if (!selected) { target.innerHTML = ''; return; }
    const experience=selected.experienceId?experiences.find(entry=>entry.id===selected.experienceId):undefined;
    if(selected.experienceId&&(!experience||!experience.bookingAvailable||experience.kind!=='free')){target.innerHTML='<p role="alert">This experience is not available for online booking. Search again or contact the venue. No booking has been made.</p>';return;}
    target.innerHTML = `<article class="card"><h2>Your selected visit</h2><p>${esc(slotLabel(selected))}</p><p>${esc(constraints())}</p><p class="help">Availability is checked again when you confirm.</p><form data-public-command="book"><fieldset><div class="form-grid">${field('Your name', 'name', 'text', contact.name, 'required maxlength="200" autocomplete="name"')}${field('Email', 'email', 'email', contact.email, 'required autocomplete="email"')}${field('Phone (optional)', 'phone', 'tel', contact.phone, 'autocomplete="tel"')}<label class="wide"><input type="checkbox" name="closureEmailConsent"${closureEmailConsent?' checked':''}>Email me about a closure or proposed relocation for this reservation.</label>${counterSeats()}${requestFields(field,requests?.requests,response?.inventoryOptions?.some(i=>i.name===query.area))}${preorderFields(menus.get(selected.serviceId),{esc,field})}${experience?cartFields(experience,query.partySize,experienceCart,esc,selected.serviceId)+experienceDisclosure(experience):''}<div class="wide"><button type="submit">Confirm booking</button><button type="button" class="secondary" data-public-action="hold">Hold and review</button></div></div></fieldset></form></article>`;
  }
  function counterSeats(){
    const inventory=response?.inventoryOptions?.find(i=>i.name===query.area&&i.kind==='counter');
    if(!inventory)return '';
    const units=[...inventory.units].sort((a,b)=>a.ordinal-b.ordinal),choices=[['','Assign available seats']];
    for(let i=0;i+query.partySize<=units.length;i++)choices.push([units.slice(i,i+query.partySize).map(t=>t.id).join(','),units.slice(i,i+query.partySize).map(t=>t.label).join(', ')]);
    return select('Counter seats','counterSeats',choices).replace(' required','');
  }
  async function search(nextQuery) {
    query = nextQuery;
    selected = undefined;
    response = undefined;
    page = 0;
    renderSearch();
    renderResults();
    const params = new URLSearchParams({date: query.date, partySize: String(query.partySize), area: query.area});
    if(query.experienceId){params.set('experienceId',query.experienceId);params.set('ticketClassId',query.ticketClassId);}
    query.requiredAccessTags.forEach(tag => params.append('requiredAccessTags', tag));
    response = await api(`/api/public/search?${params}`);
    venue = response.venue;
    areas = response.areas;
    accessTags = response.accessTags;
    experiences = response.experiences;
    document.querySelector('#venue-line').textContent = `${venue.name} · All times in ${venue.timezone}`;
    let info=document.querySelector('#restaurant-contact');if(!info){info=document.createElement('div');info.id='restaurant-contact';document.querySelector('#venue-line').after(info);}
    info.innerHTML=`${venue.logo?`<img src="${esc(venue.logo)}" alt="Restaurant logo" width="80" height="80" style="object-fit:contain">`:''}<p>${esc([venue.address,venue.phone,venue.email,venue.website,venue.currency].filter(Boolean).join(' · '))}</p>`;
    query = response.query;
    renderSearch();
    renderResults();
  }
  async function book(review=false) {
    if (!selected) throw new Error('Choose an available arrival time before confirming.');
    if(selected.experienceId&&!find('[name="acknowledgedExperienceTerms"]')?.checked)throw new Error('Read and agree to the experience terms before confirming.');
    const form=find('[data-public-command=book]');
    const embedOrigin = document.body.dataset.embedOrigin;
    const payload = {...contact,...requests, closureEmailConsent:find('[name="closureEmailConsent"]')?.checked===true, ...(embedOrigin ? {embedOrigin} : {}), ...analytics.bookingFields(), partySize: query.partySize, area: query.area,
      ...(find('[name="counterSeats"]')?.value?{tableIds:find('[name="counterSeats"]').value.split(',')} : {}),
      requiredAccessTags: [...query.requiredAccessTags], serviceId: selected.serviceId, startAt: selected.startAt,
      ...(selected.experienceId?{experienceId:selected.experienceId,ticketClassId:selected.ticketClassId,experienceVersion:selected.experienceVersion,acknowledgedExperienceTerms:true,experienceCart:readCart(form)}:{})};
    const seats=find('[name="counterSeats"]');if(seats)seats.required=false;
    let result;
    try { if(review){await checkout.review(payload);return}result=await checkout.finish(payload); }
    catch (error) {
      if ([400, 409].includes(error.status)) {
        const recovered=await checkout.release();if(recovered){confirmed(recovered);return}
        selected = undefined;
        renderBooking();
        try { await search(query); }
        catch { throw new Error('No booking has been made. Availability could not be refreshed. Search again, then choose a new time. Your contact details are kept for your next selection.'); }
        throw new Error(`No booking has been made. ${error.message} Review the refreshed availability and choose a time again. Your contact details are kept for your next selection.`);
      }
      if(!error.status||error.status>=500)throw new Error('Booking confirmation was interrupted. Keep this tab and reload to recover the same reservation before starting another booking.');
      throw error;
    }
    confirmed(result);
  }
  function confirmed(result){
    const partySize=result.partySize;query={...(query||{}),partySize,area:result.area||'',requiredAccessTags:result.requiredAccessTags||[],experienceId:result.experienceId||'',ticketClassId:result.ticketClassId||''};
    root.innerHTML = `<article class="booking-confirmation"><h2>Booking confirmed</h2>${result.experienceId?`<p>${esc(result.experienceName)} · ${esc(result.className)}</p>`:''}<p>${contact.name?esc(contact.name)+', your':'Your'} reservation for ${partySize} guests is booked at ${esc(fullTime(result.startAt))}, until ${esc(fullTime(result.endAt))}.</p><p>${esc(query?constraints():result.area||'Your selected visit')}</p>${requestSummary(requests?.requests,esc)}${preorderSummary(result.preorders,esc)}${cartSummary(result.experienceCart,esc)}<p>Booking reference<br><code>${esc(result.id)}</code></p><p>${esc(result.confirmation)}</p>${result.assignment?`<p>${esc(result.assignment)}</p>`:''}${action('Make another booking', 'another')}<p><a href="/diner?booking=${encodeURIComponent(result.id)}">Optionally verify this booking in your diner account</a></p></article>`;
    notice('Your booking is confirmed.', 'success');
  }
  async function run(work, message) {
    if (working) return;
    working = true;
    const controls = [...root.querySelectorAll('fieldset, button')].map(element => [element, element.disabled]);
    controls.forEach(([element]) => { element.disabled = true; });
    root.inert = true;
    root.setAttribute('aria-busy', 'true');
    notice(message);
    try { await work(); }
    catch (error) { notice(error.message, 'error'); }
    finally {
      controls.forEach(([element, disabled]) => { if (element.isConnected) element.disabled = disabled; });
      root.removeAttribute('aria-busy');
      root.inert = false;
      working = false;
    }
  }
  async function load() {
    root.innerHTML = action('Try loading availability again', 'retry');
    // This endpoint also serves existing clients; only venue metadata bootstraps the search.
    const bootstrap = await api('/api/public/services?partySize=2');
    venue = bootstrap.venue;
    experiences = bootstrap.experiences;
    document.querySelector('#venue-line').textContent = `${venue.name} · All times in ${venue.timezone}`;
    menus = new Map(bootstrap.services.map(s=>[s.id,s.preorderItems||[]]));
    analytics.offer(bootstrap.analytics, venue);
    contact = {name: '', email: '', phone: ''};requests=undefined;closureEmailConsent=false;
    query??={date:today(),partySize:2,area:'',requiredAccessTags:[],experienceId:'',ticketClassId:''};
    if(await checkout.recover())return true;
    await search({date: today(), partySize: 2, area: '', requiredAccessTags: [],experienceId:'',ticketClassId:''});
    return false;
  }
  root.addEventListener('submit', event => {
    const form = event.target.closest('form[data-public-command]');
    if (!form) return;
    event.preventDefault();
    if (working || !form.reportValidity()) return;
    rememberContact();
    const nextQuery = form.dataset.publicCommand === 'search' ? preferences(form) : null;
    run(async () => {
      if (nextQuery) { await search(nextQuery); analytics.track('search', query.partySize); notice('Availability updated. Choose an arrival time.'); }
      else await book();
    }, nextQuery ? 'Checking availability…' : 'Confirming booking…');
  });
  root.addEventListener('change', event => {
    if (working) return;
    if (event.target.closest('[data-public-command="search"]')) {
      rememberContact();
      if(['experienceId','partySize'].includes(event.target.name))experienceCart=undefined;
      if(event.target.name==='experienceId'){
        renderExperienceClasses(event.target.value);
        renderExperienceCatalog(event.target.value);
      }
      selected = undefined;
      response = undefined;
      renderResults();
      renderBooking();
      notice('Visit details changed. Find available times before choosing a visit.');
    }
    if (event.target.name === 'public-result') {
      rememberContact();
      const value = event.target.value;
      selected = value === '' ? undefined : response?.results[Number(value)];
      renderBooking();
      if (selected) analytics.track('checkout-start', query.partySize);
      notice(selected ? 'Review the selected date and time, then enter your contact details.' : 'Choose an available arrival time.');
    }
  });
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-public-action]');
    if (!button || working) return;
    const value = button.dataset.publicAction;
    if(value==='hold'){const form=find('[data-public-command=book]');if(!form?.reportValidity())return;rememberContact();run(()=>book(true),'Reserving your table…');return;}
    if (value === 'next' || value === 'previous') {
      rememberContact();
      page += value === 'next' ? 1 : -1;
      selected = undefined;
      renderResults();
      renderBooking();
      find('[name="public-result"]').focus();
      return;
    }
    if(value==='another'){checkout.clear();experienceCart=undefined;}
    run(async () => { await load(); notice('Choose your next visit.'); }, 'Loading availability…');
  });
  return {load: () => run(async () => { if(!await load())notice('Choose an available arrival time.'); }, 'Loading availability…')};
}
