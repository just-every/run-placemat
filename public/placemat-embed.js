/* Placemat booking widget loader for a restaurant's own website (BOOK-002).
   Paste: <div data-placemat-book></div><script src="https://YOUR-PLACEMAT/placemat-embed.js" async></script>
   The venue owner must list this page's exact https origin; otherwise the browser refuses the frame. */
(() => {
  const script = document.currentScript;
  if (!script) return;
  const placemat = new URL(script.src).origin;
  for (const host of document.querySelectorAll('[data-placemat-book]')) {
    if (host.querySelector('iframe')) continue;
    const frame = document.createElement('iframe');
    const url=new URL('/book',placemat);url.searchParams.set('embed','1');url.searchParams.set('origin',location.origin);
    frame.src = url.href;
    frame.title = host.dataset.title || 'Book a table';
    frame.style.cssText = 'display:block;width:100%;min-height:480px;border:0';
    host.append(frame);
    addEventListener('message', event => {
      if (event.origin !== placemat || event.source !== frame.contentWindow || event.data?.type !== 'placemat:height') return;
      const height = Number(event.data.height);
      if (Number.isFinite(height) && height > 0) frame.style.height = `${Math.min(Math.ceil(height), 20000)}px`;
    });
  }
})();
