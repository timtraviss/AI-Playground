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
