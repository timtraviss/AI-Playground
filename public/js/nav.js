// Shared hamburger nav — works on all pages
(function () {
  const hamburger = document.getElementById('hamburger');
  const drawer    = document.getElementById('nav-drawer');
  const overlay   = document.getElementById('nav-overlay');
  const nav       = document.getElementById('site-nav');

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

  // ── Wordmark in nav bar ──
  if (nav) {
    const wordmark = document.createElement('a');
    wordmark.href = '/';
    wordmark.className = 'nav-wordmark';
    wordmark.textContent = 'Traviss.org';
    hamburger.after(wordmark);
  }

  // ── Theme toggle in nav bar (replaces floating button) ──
  const SUN_SVG  = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
  const MOON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  const THEME_KEY = 'ai-playground-theme';

  if (nav) {
    const themeBtn = document.createElement('button');
    themeBtn.className = 'nav-theme-btn';
    themeBtn.setAttribute('aria-label', 'Toggle light/dark mode');
    themeBtn.title = 'Toggle light/dark';
    nav.appendChild(themeBtn);

    function syncIcon() {
      themeBtn.innerHTML = document.body.classList.contains('light') ? MOON_SVG : SUN_SVG;
    }
    syncIcon();

    themeBtn.addEventListener('click', () => {
      const next = document.body.classList.contains('light') ? 'dark' : 'light';
      document.body.classList.toggle('light', next === 'light');
      try { localStorage.setItem(THEME_KEY, next); } catch {}
      syncIcon();
    });
  }
})();

// ── Auth: load current user, inject avatar and drawer user section ──
(async function initUser() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.status === 401) {
      window.location.href = '/login/?next=' + encodeURIComponent(location.pathname + location.search);
      return;
    }
    if (!res.ok) return;
    const user = await res.json();

    const initial = (user.displayName || user.username)[0].toUpperCase();

    // 1. Avatar in nav bar
    const nav = document.getElementById('site-nav');
    if (nav) {
      const avatar = document.createElement('div');
      avatar.className = 'nav-avatar';
      avatar.title = user.displayName;
      avatar.textContent = initial;
      avatar.addEventListener('click', () => document.getElementById('hamburger')?.click());
      nav.appendChild(avatar);
    }

    // 2. User section in drawer (inserted after .nav-logo)
    const drawer = document.getElementById('nav-drawer');
    if (drawer) {
      const section = document.createElement('div');
      section.className = 'nav-user-section';
      section.innerHTML = `
        <div class="nav-user-avatar">${initial}</div>
        <div class="nav-user-meta">
          <div class="nav-user-name">${user.displayName}</div>
          <div class="nav-user-role">${user.role} · ${user.username}</div>
        </div>
        <button class="nav-signout-btn" id="nav-signout">Sign out</button>
      `;
      const logo = drawer.querySelector('.nav-logo');
      if (logo) logo.after(section); else drawer.prepend(section);

      document.getElementById('nav-signout').addEventListener('click', async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/login/';
      });

      // 3. Hide admin link for non-admins, add My Usage link
      const links = drawer.querySelector('.nav-links');
      if (links) {
        if (user.role !== 'Admin') {
          links.querySelector('a[href="/admin"]')?.closest('li')?.remove();
        }
        const li = document.createElement('li');
        li.innerHTML = '<a href="/my-usage/">My Usage</a>';
        links.appendChild(li);
        li.querySelector('a').addEventListener('click', () => {
          drawer.classList.remove('open');
        });
      }
    }
  } catch {
    // network error — don't break the page
  }
})();
