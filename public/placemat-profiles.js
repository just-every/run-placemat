/* Structured, explicitly supplied profile facts; no automatic enrichment. */
export function profileSummary(g,{esc,who,time}) {
 if(!g||g.erased)return '';
 const p=g.profile;
 const source=value=>!value?'Source not recorded':`${{'guest-supplied':'Guest supplied','staff-observed':'Staff observed',imported:'Imported'}[value.source]}${value.actor?' · '+who(value.actor):''} · ${value.at?time(value.at):'Date not recorded'}`;
 return `<div class="help">${p?.vipLevel&&p.vipLevel!=='none'?`<p>${esc(p.vipLevel.toUpperCase())} · ${esc(source(p.provenance?.vipLevel))}</p>`:''}${p?.tags?.length?`<p>Tags: ${esc(p.tags.join(', '))}<br>${esc(source(p.provenance?.tags))}</p>`:''}${p?.seatingPreference?`<p>Seating preference: ${esc(p.seatingPreference)}<br>${esc(source(p.provenance?.seatingPreference))}</p>`:''}</div>`;
}
export function guestProfile(g,{esc,who,time,canEdit,form,field,select}) {
 const p=g.profile;
 const provenance=value=>!value?'Source not recorded':`${{'guest-supplied':'Guest supplied','staff-observed':'Staff observed',imported:'Imported'}[value.source]}${value.actor?' · '+who(value.actor):''} · ${value.at?time(value.at):'Date not recorded'}`;
 const summary=profileSummary(g,{esc,who,time});
 const sources=`<details><summary>Contact and note sources</summary>${['name','email','phone','notes'].map(key=>`<p>${esc(key)}: ${esc(provenance(g.provenance?.[key]))}</p>`).join('')}</details>`;
 const history=g.notesHistory?.length?`<details><summary>Dated service notes (${g.notesHistory.length})</summary>${g.notesHistory.map(n=>`<p>${esc(n.notes||'Note cleared')}<br><span class="help">${esc(provenance(n.provenance))}</span></p>`).join('')}</details>`:'';
 return summary+sources+(canEdit?form('guest.profile',`<input type="hidden" name="guestId" value="${esc(g.id)}">`+field('Tags (comma separated)','tags','text',p?.tags?.join(', ')||'','maxlength="840"')+select('VIP level','vipLevel',[['none','None'],['regular','Regular'],['vip','VIP']],p?.vipLevel||'none')+field('Seating preference','seatingPreference','text',p?.seatingPreference||'','maxlength="500"')+`<label class="wide">Guest notes<textarea name="notes" maxlength="4000">${esc(g.notes)}</textarea></label>`,'Save profile'):`<p class="notes-label">Guest notes</p><p>${esc(g.notes||'No notes.')}</p>`)+history;
}

// GUEST-004: uses the existing guest card and disclosure styles.
export function duplicatePreview(review,{esc,time}) {
 const facts=entry=>`<p>${esc(entry.guest.email||'No email')} · ${esc(entry.guest.phone||'No phone')}</p><p>${entry.importedVisits.length} imported visits · ${entry.bookings.length} linked bookings</p>${entry.importedVisits.map(v=>`<p>${esc(v.date)} · ${esc(v.partySize)} guests · ${esc(v.status)}</p>`).join('')}${entry.bookings.map(b=>`<p>Booking ${esc(b.id)} · ${esc(time(b.startAt))} · ${esc(b.partySize)} guests · ${esc(b.status)} · ${esc(b.source)}</p>`).join('')}<p>Marketing permission: ${esc(entry.marketingPermission)}. Spend: not recorded.</p>${entry.queueContactPermissions.map(w=>`<p>Queue ${esc(w.entryId)} contact permission: ${w.contactConsent===null?'not recorded':w.contactConsent?'yes':'no'} (this entry only)</p>`).join('')}`;
 return `<p class="help">${esc(review.notice)}</p><details open><summary>Selected profile: ${esc(review.selected.guest.name)}</summary>${facts(review.selected)}</details>`+(review.candidates.length?review.candidates.map(c=>`<details class="card"><summary>Possible duplicate: ${esc(c.guest.name)}</summary><p>${esc(c.reasons.join(' · '))}</p>${facts(c)}<h4>Profile conflicts</h4>${c.conflicts.length?c.conflicts.map(f=>`<p>${esc(f.field)} — selected: ${esc(Array.isArray(f.selected)?f.selected.join(', '):f.selected)||'empty'}; candidate: ${esc(Array.isArray(f.candidate)?f.candidate.join(', '):f.candidate)||'empty'}</p>`).join(''):'<p>No profile field conflicts.</p>'}</details>`).join(''):'<p>No possible duplicates found.</p>');
}
