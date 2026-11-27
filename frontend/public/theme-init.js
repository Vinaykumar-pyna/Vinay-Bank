// Runs before the first paint (see index.html), so the page never flashes the
// wrong theme.
(function () {
  var theme = null;
  try {
    theme = localStorage.getItem('vb-theme');
  } catch (e) {
    // storage unavailable: use the device setting
  }

  // Light or dark theme: the saved choice, else the device setting.
  if (theme !== 'light' && theme !== 'dark') {
    var prefersDark =
      !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    theme = prefersDark ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-bs-theme', theme);
})();
