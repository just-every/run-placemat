import { queueAreaOptions, renderQueueEntry, renderQueueJoin } from './placemat-queue-guest-views.js';
import { queueToUtc } from './placemat-queue-time.js';

const content = document.querySelector('#queue-content');
const notice = document.querySelector('#notice');
let data, entry, token = location.hash.slice(1), working = false, refreshAfterWork = false;
const selectedId = new URL(location.href).searchParams.get('serviceId');

function announce(message, error = false) {
  notice.textContent = message;
  notice.dataset.kind = error ? 'error' : '';
  notice.setAttribute('role', error ? 'alert' : 'status');
}

async function request(action, body) {
  let response;
  try {
    response = await fetch(`/api/public/queue/${action}`, {
      credentials: 'omit', cache: 'no-store',
      ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error('Could not reach the queue. Check your connection and try again.');
  }
  // Never expose contact existence through a server's error details.
  if (!response.ok) throw new Error(action === 'join'
    ? 'Unable to join this queue. If you already joined, use your private link; otherwise check your details or ask the host. Active duplicate parties cannot join again.'
    : action === 'services' ? 'Could not load services. Please refresh or ask the host.'
    : 'Unable to manage this party. Refresh your private link or ask the host.');
  try { return await response.json(); }
  catch { throw new Error('The queue returned an unreadable response. Please refresh or ask the host.'); }
}

function saveToken(nextToken) {
  if (typeof nextToken !== 'string' || !nextToken) throw new Error('The queue did not return a private link. Please ask the host.');
  token = nextToken;
  const link = new URL('/queue', location.origin);
  link.hash = token;
  history.replaceState(null, '', link);
}

function render() {
  document.querySelector('h1').textContent = token ? 'Your queue status' : 'Join the queue';
  document.querySelector('#venue-line').textContent = `${data.venue.name} · All times in ${data.venue.timezone}`;
  content.innerHTML = token ? renderQueueEntry(entry, data, location.href) : renderQueueJoin(data, selectedId);
}

async function refresh() {
  // Services may be paused or absent while an existing private link remains valid.
  const requestedToken = token;
  const [services, status] = await Promise.all([request('services'), requestedToken ? request('status', { token: requestedToken }) : null]);
  if (requestedToken !== token) return;
  data = services;
  if (status) entry = status.entry;
  render();
}

async function busy(work, message) {
  if (working) return;
  working = true;
  const controls = [...content.querySelectorAll('fieldset, button')].map(element => [element, element.disabled]);
  controls.forEach(([element]) => { element.disabled = true; });
  announce(message);
  try { await work(); }
  catch (error) {
    announce(error.message, true);
    if (!content.firstElementChild) content.innerHTML = '<button type="button" class="secondary" data-queue-action="refresh">Try again</button><p class="help">If your private link no longer works, ask the host for help.</p>';
  }
  finally {
    controls.forEach(([element, disabled]) => { if (element.isConnected) element.disabled = disabled; });
    working = false;
    if (refreshAfterWork) {
      refreshAfterWork = false;
      busy(async () => { await refresh(); announce(''); }, 'Loading queue…');
    }
  }
}

function preferences(form) {
  const values = new FormData(form), preferredAt = String(values.get('preferredAt') || '');
  return {
    partySize: Number(values.get('partySize')),
    preferredAt: preferredAt ? queueToUtc(preferredAt, data.venue.timezone) : '',
    preferredArea: String(values.get('preferredArea') || ''),
    requiredAccessTags: String(values.get('requiredAccessTags') || '').split(',').map(value => value.trim()).filter(Boolean),
    contactConsent: values.get('contactConsent') === 'true',
  };
}

content.addEventListener('submit', event => {
  const form = event.target.closest('form[data-queue-command]');
  if (!form) return;
  event.preventDefault();
  // Read fields before busy disables the fieldset (disabled fields are absent from FormData).
  const action = form.dataset.queueCommand, submittedToken = token;
  let payload;
  try {
    if (action === 'join') {
      const values = new FormData(form);
      payload = { ...preferences(form), serviceId: values.get('serviceId'), name: values.get('name'), email: values.get('email'), phone: values.get('phone') };
    } else payload = action === 'update' ? { token, ...preferences(form) } : action === 'leave' ? { token, leave: true } : { token };
  } catch (error) { announce(error.message, true); return; }
  busy(async () => {
    const result = await request(action === 'leave' ? 'update' : action, payload);
    if (token !== submittedToken) return;
    if (action === 'join' || action === 'rotate') saveToken(result.token);
    entry = result.entry;
    render();
    announce(action === 'join' ? 'Your party joined the queue. Save your private link below.'
      : action === 'rotate' ? 'Private link replaced. The old link no longer works. Save the new link below.'
      : action === 'leave' ? 'Your party left the queue.' : 'Your party was updated.');
  }, 'Saving…');
});

content.addEventListener('change', event => {
  if (event.target.name !== 'serviceId') return;
  const service = data.services.find(row => row.id === event.target.value), form = event.target.form;
  form.querySelector('[name="preferredArea"]').innerHTML = queueAreaOptions(service);
  form.querySelector('button[type="submit"]').disabled = service.publicQueuePaused;
  document.querySelector('#queue-intake-note').textContent = service.publicQueuePaused
    ? 'Online joining is paused for this service. Please ask the host.'
    : 'Contact permission is optional and does not affect joining. Access needs record what you tell us.';
});

content.addEventListener('click', event => {
  if (!event.target.closest('[data-queue-action="refresh"]')) return;
  busy(async () => { await refresh(); announce(token ? 'Queue status refreshed.' : 'Services refreshed.'); }, 'Refreshing…');
});

addEventListener('hashchange', () => {
  token = location.hash.slice(1);
  entry = undefined;
  content.innerHTML = '';
  if (working) refreshAfterWork = true;
  else busy(async () => { await refresh(); announce(''); }, 'Loading queue…');
});

busy(async () => { await refresh(); announce(''); }, 'Loading queue…');
