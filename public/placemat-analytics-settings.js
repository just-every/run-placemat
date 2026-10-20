/* BOOK-002: the owner's consent-aware GA4 and Meta booking events. Keys are write-only: the form never shows a saved key. */
const labels = {ga4: 'GA4', meta: 'Meta'};
function status(provider, settings, keys) {
  const keyName = provider === 'ga4' ? 'API secret' : 'access token';
  if (!settings.enabled) return `${labels[provider]} events are off${keys.includes(provider) ? `; the ${keyName} stays saved` : ''}.`;
  return keys.includes(provider) ? `${labels[provider]} events are on; the ${keyName} is saved.` : `${labels[provider]} events are switched on, but the ${keyName} is missing (for example after a restore). Nothing is sent until you enter it again.`;
}
export function analyticsSettings(state, data, {esc, form, field, who, time}) {
  const a = state.analytics || {ga4: {enabled: false, measurementId: '', debugMode: false}, meta: {enabled: false, datasetId: '', testEventCode: ''}};
  const keys = data.analytics?.keys || [], results = data.analytics?.results || [];
  const check = (name, label, on) => `<label class="wide"><input type="checkbox" name="${name}"${on ? ' checked' : ''}> ${esc(label)}</label>`;
  const secret = (label, name, saved) => `<label>${esc(label)}<input name="${name}" type="password" autocomplete="new-password" placeholder="${saved ? 'Saved. Leave blank to keep it' : 'Not saved'}"></label>`;
  const changes = state.audit.filter(e => e.action === 'analytics.settings').slice(-5).reverse();
  const on = settings => ['ga4', 'meta'].filter(p => settings?.[p]?.enabled).map(p => labels[p]).join(' and ') || 'none';
  return `<details id="analytics-settings"><summary>Booking analytics (GA4 and Meta)</summary><p class="help">Placemat’s server sends search, checkout start and completed booking events only after a guest presses Accept on the booking page or widget’s analytics question. Each event carries only party size, booking source (booking page, or the website showing the widget) and a random visit ID, plus the browser’s user agent for Meta; never guest contact data, IP address, cookies, booking reference or reservation date and time. No provider script loads on your pages. Keys are write-only: they are never shown again and backups and CSV exports leave them out, so a restored installation needs them entered again. Switching a provider off stops its events; a saved key stays until you enter a new one.</p>`
    + form('analytics.settings', `<fieldset class="wide"><legend>Google Analytics 4 (Measurement Protocol)</legend><div class="form-grid">${check('ga4Enabled', 'Send GA4 events', a.ga4.enabled)}${field('GA4 measurement ID', 'ga4MeasurementId', 'text', a.ga4.measurementId, 'placeholder="G-ABC123XYZ" autocomplete="off"')}${secret('GA4 API secret', 'ga4ApiSecret', keys.includes('ga4'))}${check('ga4DebugMode', 'Test mode: send GA4 events with debug_mode so they appear in DebugView', a.ga4.debugMode)}</div></fieldset><fieldset class="wide"><legend>Meta (Conversions API)</legend><div class="form-grid">${check('metaEnabled', 'Send Meta events', a.meta.enabled)}${field('Meta dataset (Pixel) ID', 'metaDatasetId', 'text', a.meta.datasetId, 'inputmode="numeric" autocomplete="off"')}${secret('Meta access token', 'metaAccessToken', keys.includes('meta'))}${field('Meta test event code (optional; events then appear under Test events)', 'metaTestEventCode', 'text', a.meta.testEventCode, 'placeholder="TEST12345" autocomplete="off"')}</div></fieldset>`, 'Save analytics settings')
    + `<ul class="analytics-status">${['ga4', 'meta'].map(p => `<li>${esc(status(p, a[p], keys))}</li>`).join('')}</ul>`
    + (results.length ? `<p class="help">Latest provider answers (Placemat records the HTTP status only; it never claims a provider verified an event):</p><ul class="analytics-results">${results.map(r => `<li>${esc(labels[r.provider])} · ${esc(r.event)} · ${r.status ? `HTTP ${esc(r.status)}` : 'no answer'} · ${esc(time(r.at))} · ${esc(r.detail)}</li>`).join('')}</ul>` : '')
    + (changes.length ? `<ul class="widget-changes">${changes.map(e => `<li>${esc(time(e.at))} · ${esc(who(e.actor))} · on: ${esc(on(e.after))}</li>`).join('')}</ul>` : '')
    + '</details>';
}
/** The command payload; blank keys keep the saved key. */
export function analyticsPayload(formEl) {
  const values = new FormData(formEl), text = name => String(values.get(name) || '').trim();
  return {
    ga4: {enabled: values.has('ga4Enabled'), measurementId: text('ga4MeasurementId'), debugMode: values.has('ga4DebugMode'), apiSecret: text('ga4ApiSecret')},
    meta: {enabled: values.has('metaEnabled'), datasetId: text('metaDatasetId'), testEventCode: text('metaTestEventCode'), accessToken: text('metaAccessToken')},
  };
}
