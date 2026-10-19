import { queueLocalTime, queueTime } from './placemat-queue-time.js';

export const escapeQueue = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const esc = escapeQueue;
const field = (label, name, type, value = '', attributes = '') => `<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${attributes}></label>`;
const option = (value, label, selected) => `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`;
const consent = checked => `<label class="wide"><input type="checkbox" name="contactConsent" value="true"${checked ? ' checked' : ''}>I give permission to use my provided contact details about this queue (optional; not marketing).</label>`;
export const queueActive = entry => ['waiting', 'queued', 'offered', 'accepted', 'arrived'].includes(entry.status);

export function queueAreaOptions(service, selected = '') {
  const areas = [...new Set([...(service?.areas || []), ...(selected ? [selected] : [])])];
  return option('', 'Any area', selected) + areas.map(area => option(area, area, selected)).join('');
}

function preferences(service, venue, entry = {}) {
  return field('Party size', 'partySize', 'number', entry.partySize ?? 2, 'required min="1" max="500"')
    + field(`Preferred time (${venue.timezone}, optional)`, 'preferredAt', 'datetime-local', entry.preferredAt ? queueLocalTime(entry.preferredAt, venue.timezone) : '')
    + `<label>Preferred area (optional)<select name="preferredArea">${queueAreaOptions(service, entry.preferredArea)}</select></label>`
    + field('Access needs (optional, comma separated)', 'requiredAccessTags', 'text', (entry.requiredAccessTags || []).join(', '), 'maxlength="1000"')
    + consent(entry.contactConsent);
}

export function renderQueueJoin(data, selectedId) {
  if (!data.services.length) return '<p class="empty">No services are open for queue joining. Please ask the host.</p><button type="button" data-queue-action="refresh" class="secondary">Refresh services</button>';
  const service = selectedId ? data.services.find(row => row.id === selectedId) : data.services[0];
  if (!service) return '<p>This service is not open for queue joining. Please ask the host or <a href="/queue">choose another service</a>.</p>';
  return `<p>Joining the queue does not reserve a table. Save the private link shown after joining to manage your party.</p><form data-queue-command="join"><fieldset><div class="form-grid"><label class="wide">Service<select name="serviceId" required>${data.services.map(row => option(row.id, `${row.name} · ${queueTime(row.startAt, data.venue.timezone)}${row.publicQueuePaused ? ' · Online joining paused' : ''}`, service.id)).join('')}</select></label>${field('Your name', 'name', 'text', '', 'required maxlength="200" autocomplete="name"')}${field('Email', 'email', 'email', '', 'required autocomplete="email"')}${field('Phone (optional)', 'phone', 'tel', '', 'autocomplete="tel"')}${preferences(service, data.venue)}<p class="wide help" id="queue-intake-note">${service.publicQueuePaused ? 'Online joining is paused for this service. Please ask the host.' : 'Contact permission is optional and does not affect joining. Access needs record what you tell us.'}</p><div class="wide"><button type="submit"${service.publicQueuePaused ? ' disabled' : ''}>Join queue</button></div></div></fieldset></form>`;
}

export function renderQueueEntry(entry, data, privateLink) {
  const service = data.services.find(row => row.id === entry.serviceId);
  const preferredTime = entry.preferredAt ? queueTime(entry.preferredAt, data.venue.timezone) : 'Any time';
  const status = entry.status === 'waiting' ? 'queued' : entry.status === 'cancelled' ? 'declined' : entry.status;
  return `<article class="booking-confirmation"><h2>Your party</h2>${service ? `<p>${esc(service.name)}</p>` : ''}<dl><dt>Status</dt><dd>${esc(status)}</dd><dt>Party size</dt><dd>${esc(entry.partySize)}</dd><dt>Preferred time</dt><dd>${esc(preferredTime)}</dd><dt>Preferred area</dt><dd>${esc(entry.preferredArea || 'Any area')}</dd><dt>Declared access needs</dt><dd>${esc((entry.requiredAccessTags || []).join(', ') || 'None recorded')}</dd><dt>Queue contact permission</dt><dd>${entry.contactConsent ? 'Given' : 'Not given'}</dd></dl><p class="help">Joining does not reserve a table. Ask the host for an estimated wait.</p><label>Save your private management link<input id="queue-private-link" type="text" value="${esc(privateLink)}" readonly autocomplete="off" spellcheck="false"></label><p class="help">Anyone with this link can view and manage your party. Save it privately. This page does not send the link by email or text.</p><div class="actions"><button type="button" class="secondary" data-queue-action="refresh">Refresh status</button></div>${queueActive(entry) ? `<details><summary>Update your party</summary><form data-queue-command="update"><fieldset><div class="form-grid">${preferences(service, data.venue, entry)}<div class="wide"><button type="submit">Save party</button></div></div></fieldset></form></details><form data-queue-command="leave"><fieldset><button type="submit" class="danger">Leave queue</button></fieldset></form>` : '<p>This party is no longer waiting in the queue.</p>'}${queueActive(entry)?`<details><summary>Replace private link</summary><p>The current link will stop working. Save the replacement link after continuing.</p><form data-queue-command="rotate"><fieldset><button type="submit" class="secondary">Replace private link</button></fieldset></form></details>`:''}</article>`;
}
