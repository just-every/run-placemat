// Keep keyboard position and open disclosures when live records replace a view.
function path(node) {
 if (!node) return '';
 if (node === document.body) return 'body';
 if (node.id) return `#${CSS.escape(node.id)}`;
 for (const key of ['data-handover-task','data-proposal-id']) {
  if (node.hasAttribute(key)) return `[${key}="${CSS.escape(node.getAttribute(key))}"]`;
 }
 let part = node.localName;
 if (node.matches('form[data-command]')) {
  part += `[data-command="${CSS.escape(node.dataset.command)}"]`;
  for (const input of node.querySelectorAll('input[type=hidden]')) {
   part += `:has(input[name="${CSS.escape(input.name)}"][value="${CSS.escape(input.value)}"])`;
  }
 } else if (node.name) part += `[name="${CSS.escape(node.name)}"]`;
 else if (node.dataset.action) part += `[data-action="${CSS.escape(node.dataset.action)}"][data-id="${CSS.escape(node.dataset.id || '')}"]`;
 else part += `:nth-of-type(${[...node.parentElement.children].filter(el=>el.localName===node.localName).indexOf(node)+1})`;
 return `${path(node.parentElement)} > ${part}`;
}
export function rememberFocus() {
 const active = document.activeElement;
 if (!active || !active.matches('[data-action=refresh]') && !active.closest('#service-status-editor,[data-handover-task],[data-proposal-id],[data-timeline-filter]')) return () => {};
 const selector = path(active), region = active.closest('[data-handover-task],[data-proposal-id],#service-status-editor,section') || document.querySelector('main');
 const regionPath = path(region);
 const opened = [...document.querySelectorAll('#service-status-editor details[open],[data-handover-task] details[open],[data-proposal-id] details[open]')].map(path);
 return () => {
  // A person who moved elsewhere while a request ran keeps that new position.
  if (document.activeElement !== document.body && document.activeElement !== active) return;
  for (const selector of opened) document.querySelector(selector)?.setAttribute('open','');
  const target = active.isConnected ? active : document.querySelector(selector);
  if (target && !target.disabled && !target.closest('[hidden],details:not([open]),[inert]')) { target.focus({preventScroll:true}); return; }
  const heading = document.querySelector(regionPath)?.querySelector('h2,h3,h4');
  if (heading) { heading.tabIndex=-1; heading.focus({preventScroll:true}); }
 };
}
export function focusEditor(root) {
 const target=root.querySelector('select,input:not([type=hidden]),button');
 target?.focus({preventScroll:true});
 root.scrollIntoView({block:'center'});
}

export function restoreAfterUpdate(form, root) {
 const restore=rememberFocus();
 const observer=new MutationObserver(()=>{restore();observer.disconnect();});
 observer.observe(root,{childList:true,subtree:true});
}
