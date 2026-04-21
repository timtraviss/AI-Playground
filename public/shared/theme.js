(function () {
  const KEY = 'ai-playground-theme';
  const btn = document.getElementById('theme-toggle');

  function apply(theme) {
    document.body.classList.toggle('light', theme === 'light');
    if (btn) btn.textContent = theme === 'light' ? '🌙' : '☀️';
  }

  apply(localStorage.getItem(KEY) || 'dark');

  if (btn) {
    btn.addEventListener('click', function () {
      var next = document.body.classList.contains('light') ? 'dark' : 'light';
      localStorage.setItem(KEY, next);
      apply(next);
    });
  }
})();
