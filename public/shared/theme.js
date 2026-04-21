(function () {
  const KEY = 'ai-playground-theme';
  const btn = document.getElementById('theme-toggle');

  function apply(theme) {
    if (document.body) document.body.classList.toggle('light', theme === 'light');
    if (btn) btn.textContent = theme === 'light' ? '🌙' : '☀️';
  }

  function getTheme() { try { return localStorage.getItem(KEY); } catch { return null; } }
  function saveTheme(t) { try { localStorage.setItem(KEY, t); } catch {} }

  apply(getTheme() || 'dark');

  if (btn) {
    btn.addEventListener('click', function () {
      var next = document.body.classList.contains('light') ? 'dark' : 'light';
      saveTheme(next);
      apply(next);
    });
  }
})();
