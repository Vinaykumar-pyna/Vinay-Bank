(function () {
  try {
    var saved = localStorage.getItem('ab-theme');
    var theme =
      saved === 'light' || saved === 'dark'
        ? saved
        : window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    document.documentElement.setAttribute('data-bs-theme', theme);
  } catch (e) {
    /* storage unavailable: keep the default light theme */
  }
})();
