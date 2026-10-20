/* BOOK-002: consent-aware booking analytics on /book and the widget. The question is asked once per page visit;
   the answer and the random visit ID live only in this page's memory, and nothing is sent before Accept.
   Events go to Placemat's own server, which forwards them to GA4 and Meta; no provider script loads here. */
const providerNames = {ga4: 'Google Analytics 4 (GA4)', meta: 'Meta'};
export function createAnalyticsConsent({api, esc}) {
  let providers = [], answer = '', visitId = '', venueName = '';
  const embedOrigin = () => document.body.dataset.embedOrigin;
  function section() {
    let root = document.querySelector('#analytics-consent');
    if (!root) {
      root = document.createElement('section');
      root.id = 'analytics-consent';
      root.className = 'card analytics-consent';
      root.setAttribute('aria-labelledby', 'analytics-consent-title');
      document.querySelector('#public-content').before(root);
    }
    return root;
  }
  function render() {
    if (!providers.length) { document.querySelector('#analytics-consent')?.remove(); return; }
    const names = providers.map(p => providerNames[p]).join(' and ');
    const root = section();
    if (answer) {
      root.innerHTML = `<h2 id="analytics-consent-title">Booking analytics</h2><p>${answer === 'accepted' ? `Accepted for this visit: ${esc(names)} receive${providers.length === 1 ? 's' : ''} the events described.` : 'Declined for this visit. Nothing is sent.'}</p>`;
      return;
    }
    root.innerHTML = `<h2 id="analytics-consent-title">Booking analytics</h2><p>${esc(venueName)} uses ${esc(names)}. If you accept, Placemat’s server sends ${providers.length === 1 ? 'it' : 'them'} three events from this visit: search, checkout start and completed booking. Each carries only your party size, where you are booking (this booking page, or the website showing this booking widget) and a random visit ID${providers.includes('meta') ? ', plus your browser’s user agent for Meta' : ''}. Your name, email, phone, IP address, cookies, booking reference and reservation date and time are never sent. Nothing is sent if you decline or do not answer, and your choice lasts only for this visit.</p><div class="actions"><button type="button" data-analytics="accepted">Accept analytics</button><button type="button" class="secondary" data-analytics="declined">Decline</button></div>`;
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-analytics]');
    if (!button || answer) return;
    answer = button.dataset.analytics;
    if (answer === 'accepted') visitId = crypto.randomUUID();
    render();
    document.querySelector('#analytics-consent h2').tabIndex = -1;
    document.querySelector('#analytics-consent h2').focus();
  });
  return {
    offer(list, venue) { providers = list || []; venueName = venue?.name || 'This restaurant'; render(); },
    /** Search and checkout start; a failed send never interrupts the guest. */
    track(event, partySize) {
      if (!visitId) return;
      api('/api/public/analytics', {event, visitId, partySize, ...(embedOrigin() ? {embedOrigin: embedOrigin()} : {})}).catch(() => {});
    },
    /** The completed-booking event is sent by the server after the booking, only with this consented visit ID. */
    bookingFields: () => visitId ? {analytics: {visitId}} : {},
  };
}
