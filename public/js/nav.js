// Shared hamburger nav — works on all pages
(function () {
  const hamburger = document.getElementById('hamburger');
  const drawer    = document.getElementById('nav-drawer');
  const overlay   = document.getElementById('nav-overlay');

  if (!hamburger || !drawer || !overlay) return;

  function open() {
    drawer.classList.add('open');
    overlay.classList.add('visible');
    hamburger.classList.add('open');
    hamburger.setAttribute('aria-expanded', 'true');
  }

  function close() {
    drawer.classList.remove('open');
    overlay.classList.remove('visible');
    hamburger.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
  }

  function toggle() {
    drawer.classList.contains('open') ? close() : open();
  }

  hamburger.addEventListener('click', toggle);
  overlay.addEventListener('click', close);

  // Close on nav link click
  drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', close));

  // Close on Escape
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
})();
