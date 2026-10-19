/* Manager-approved physical table joins, rendered with the existing form components. */
export function combinationEditor(combination, state, {esc, field, select, form}) {
  const tableIds = combination?.tableIds || [];
  const tables = `<label class="wide">Tables to join<span class="help">Choose at least two distinct tables. Use Ctrl or ⌘ to select several. Each option lists the table's seats and access features.</span><select name="tableIds" multiple required>${state.tables.map(table => `<option value="${esc(table.id)}"${tableIds.includes(table.id) ? ' selected' : ''}>${esc(table.label)} · ${table.seats} seats · ${esc(table.area || 'No area recorded')} · ${esc((table.accessTags || []).join(', ') || 'No access features recorded')}</option>`).join('')}</select></label>`;
  const fields = `<input type="hidden" name="id" value="${esc(combination?.id || '')}">` + tables
    + field('Joined capacity', 'capacity', 'number', combination?.capacity ?? '', 'required min="1" step="1"')
    + field('Access features (comma separated)', 'accessTags', 'text', (combination?.accessTags || []).join(', '), 'maxlength="500"')
    + `<p class="help wide">Joined capacity cannot exceed the total seats of the selected tables. Every selected table must have every access feature entered here.</p>`
    + field('Setup before arrival (minutes)', 'setupMinutes', 'number', combination?.setupMinutes ?? 0, 'required min="0" step="1"')
    + select('Availability for future bookings', 'enabled', [['true', 'Enabled'], ['false', 'Disabled']], String(combination?.enabled ?? true))
    + `<p class="help wide">Setup reserves every joined table for these elapsed minutes before arrival. Setup, the guest's visit and cleanup must all fit within the service. Existing bookings retain their commitments; changes that conflict with active bookings are refused.</p>`
    + `<label class="wide"><input type="checkbox" name="adjacent" value="true" required> I confirm these tables are adjacent and can be joined</label>`;
  return `<details${combination || !state.combinations.length ? ' open' : ''}><summary>${combination ? 'Edit approved table combination' : 'Approve a table combination'}</summary>${form('combination.save', fields, combination ? 'Save table combination' : 'Approve table combination', state.tables.length < 2)}</details>`;
}

export function renderCombinations(state, editable, helpers) {
  const {esc, button, empty} = helpers;
  const tableLabel = tableId => state.tables.find(table => table.id === tableId)?.label || tableId;
  const rows = state.combinations.map(combination => `<article class="card"><h4>${esc(combination.tableIds.map(tableLabel).join(' + '))}</h4><p>${combination.capacity} guests · ${combination.enabled ? 'Enabled' : 'Disabled'}</p><p>Access features: ${esc(combination.accessTags.join(', ') || 'None approved')}<br>Setup: ${combination.setupMinutes} elapsed minutes before arrival</p>${editable ? `<div class="actions">${button('Edit combination', 'edit-combination', combination.id)}${combination.enabled ? button('Disable combination', 'disable-combination', combination.id) : ''}</div>` : ''}</article>`).join('');
  return `<section aria-label="Approved table combinations"><h3>Approved table combinations</h3><p class="help">Only these exact, manager-approved sets of adjacent tables can be joined. Disabled combinations remain listed to retain existing commitments.</p>${rows || empty('No table combinations have been approved.')}${editable ? `<div id="combination-editor">${combinationEditor(undefined, state, helpers)}</div>${state.tables.length < 2 ? '<p class="help">Add at least two tables before approving a combination.</p>' : ''}` : ''}</section>`;
}

export function validateCombination(payload, state) {
  const ids = payload.tableIds || [];
  if (ids.length < 2 || new Set(ids).size !== ids.length) throw new Error('Choose at least two distinct tables to join.');
  const tables = ids.map(tableId => state.tables.find(table => table.id === tableId));
  if (tables.some(table => !table)) throw new Error('A selected table is no longer available. Refresh the venue and choose again.');
  if (!Number.isInteger(payload.capacity) || payload.capacity < 1 || payload.capacity > tables.reduce((total, table) => total + table.seats, 0)) throw new Error('Joined capacity must be a whole number within the selected tables’ total seats.');
  if (payload.accessTags.some(tag => tables.some(table => !(table.accessTags || []).includes(tag)))) throw new Error('Each access feature must be present on every selected table.');
  if (!Number.isInteger(payload.setupMinutes) || payload.setupMinutes < 0) throw new Error('Setup must be a whole number of elapsed minutes, zero or more.');
  if (!payload.adjacent) throw new Error('Confirm that these tables are adjacent and can be joined.');
}
