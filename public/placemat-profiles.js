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
