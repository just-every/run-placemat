/* ROLE-001: venue group settings. Owners connect venues and grant read-only rights; group admins request a short-lived read token. */
export async function mountGroup(root,{api,esc,field,people,notice,reload}) {
  let status;
  try { status = await api('/api/group'); } catch { root.innerHTML = ''; return; }
  const rightLabels = {'reports.read':'Reservation report','preshift.read':'Pre-shift sheet'};
  const rights = (list, name = 'rights', checked = []) => list.map(right => `<label class="inline"><input type="checkbox" name="${name}" value="${esc(right)}"${checked.includes(right) ? ' checked' : ''}> ${esc(rightLabels[right] || right)}</label>`).join(' ');
  const form = (kind, body, button) => `<form data-group-form="${kind}"><fieldset><div class="form-grid">${body}<div class="wide"><button type="submit">${esc(button)}</button></div></div></fieldset></form>`;
  const names = id => people.find(person => person.id === id)?.displayName || id;
  if (status.role === 'admin') {
    root.innerHTML = `<details><summary>Group access</summary><p class="help">The owner granted you read-only access to reservation reports and pre-shift sheets: ${Object.entries(status.rights).map(([venue, list]) => `${esc(venue === 'home' ? 'this venue' : 'a connected venue')} (${esc(list.join(', '))})`).join('; ')}. A token lasts 12 hours and is shown once.</p>${form('token', '', 'Create group token')}<div id="group-token"></div></details>`;
  } else {
    const member = status.standing === 'member', home = status.standing === 'home', linked = status.links.filter(link => !link.revokedAt);
    const ceiling = status.available.map(right => `<label class="inline"><input type="checkbox" name="ceiling" value="${esc(right)}" checked> ${esc(rightLabels[right] || right)}</label>`).join(' ');
    root.innerHTML = `<details><summary>Venue group</summary><p class="help">Each venue stays its own installation. Group admins get read-only rights you choose per venue; in this slice they cannot change records, money, people, exports or providers.</p>`
      + (member ? `<article class="card"><p><strong>Member of the group at ${esc(status.home.origin)}</strong><br>Group admins may read here: ${esc(status.home.ceiling.map(r => rightLabels[r] || r).join(', ') || 'nothing')}.</p>${form('leave', '', 'Leave group')}</article>` : `${form('invite', field('Venue to invite','label','text','','required maxlength="80"'), 'Create one-use invitation')}<div id="group-code"></div>`)
      + (!home && !member ? `<h4>Join a group</h4>${form('join', field('Home venue address','homeOrigin','url','','required placeholder="https://venue.example"') + field('Invitation code','code','text','','required autocomplete="off"') + `<div class="wide"><span>Group admins may read here:</span> ${ceiling}</div>`, 'Join group')}` : '')
      + (linked.length ? `<h4>Connected venues</h4>${linked.map(link => `<article class="card"><p><strong>${esc(link.name)}</strong> · ${esc(link.origin)}<br>Group admins may read: ${esc(link.ceiling.map(r => rightLabels[r] || r).join(', ') || 'nothing')}</p>${form('disconnect', `<input type="hidden" name="linkId" value="${esc(link.id)}">`, 'Disconnect venue')}</article>`).join('')}` : '')
      + (home || (!member && !linked.length) ? '' : '')
      + (home ? `<h4>Group admins</h4>${status.admins.map(admin => `<article class="card"><p><strong>${esc(names(admin.operatorId))}</strong><br>${Object.entries(admin.venues).map(([venue, list]) => `${esc(venue === 'home' ? 'This venue' : linked.find(link => link.id === venue)?.name || 'Disconnected venue')}: ${esc(list.map(r => rightLabels[r] || r).join(', '))}`).join('<br>')}</p>${form('revoke', `<input type="hidden" name="operatorId" value="${esc(admin.operatorId)}">`, 'Revoke group access')}</article>`).join('')}${form('grant', `<label>Person<select name="operatorId" required>${people.filter(person => person.status === 'active' && person.role === 'member').map(person => `<option value="${esc(person.id)}">${esc(person.displayName)}</option>`).join('')}</select></label>${[['home', 'This venue', status.available], ...linked.map(link => [link.id, link.name, link.ceiling])].map(([venue, name, list]) => `<fieldset class="wide"><legend>${esc(name)}</legend>${rights(list, 'venue:' + venue)}</fieldset>`).join('')}`, 'Grant group access')}` : '')
      + '</details>';
  }
  root.addEventListener('submit', async event => {
    const el = event.target.closest('form[data-group-form]'); if (!el) return;
    event.preventDefault();
    const data = new FormData(el), kind = el.dataset.groupForm;
    try {
      if (kind === 'token') {
        const result = (await api('/api/group/token', {})).result;
        root.querySelector('#group-token').innerHTML = `<p class="help">Copy this token now; it is shown once and expires ${esc(new Date(result.expiresAt).toLocaleString())}.</p><pre>${esc(result.token)}</pre>`; notice('Group token created.', 'success'); return;
      }
      if (kind === 'invite') {
        const result = (await api('/api/group/invite', {label: data.get('label')})).result;
        root.querySelector('#group-code').innerHTML = `<p class="help">Give this one-use code to the other venue's owner. It is shown once and expires ${esc(new Date(result.expiresAt).toLocaleString())}.</p><pre>${esc(result.code)}</pre>`; notice('Invitation created.', 'success'); return;
      }
      if (kind === 'join') await api('/api/group/join', {homeOrigin: data.get('homeOrigin'), code: data.get('code'), ceiling: data.getAll('ceiling')});
      else if (kind === 'leave') await api('/api/group/leave', {});
      else if (kind === 'disconnect') await api('/api/group/link/revoke', {linkId: data.get('linkId')});
      else if (kind === 'revoke') await api('/api/group/admin/revoke', {operatorId: data.get('operatorId')});
      else if (kind === 'grant') await api('/api/group/admin', {operatorId: data.get('operatorId'), venues: Object.fromEntries([...new Set([...data.keys()].filter(key => key.startsWith('venue:')))].map(key => [key.slice(6), data.getAll(key)]))});
      await reload(); notice('Group settings saved.', 'success');
    } catch (error) { notice(error.message, 'error'); }
  });
}
