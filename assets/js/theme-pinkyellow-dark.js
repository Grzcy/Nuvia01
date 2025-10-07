(function(){
  try {
    const root = document.documentElement;
    if (!root) return;
    // Set darker pink and yellow gradient accents used by page backgrounds
    root.style.setProperty('--background-gradient-1', '#ec4899'); // pink (darkish)
    root.style.setProperty('--background-gradient-2', '#f59e0b'); // yellow/amber (darkish)
    // Keep overall background dark if page doesn't define the variable
    if (getComputedStyle(document.body).getPropertyValue('--background-main') === '') {
      document.body.style.backgroundColor = '#0f0f1f';
    }
  } catch (_) {}
})();
