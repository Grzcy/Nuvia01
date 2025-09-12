// Runtime lazy-helper: adds loading="lazy" and decoding="async" to images that lack them
(function () {
  try {
    const CLOUDINARY_REGEX = /https:\/\/res\.cloudinary\.com\/([^/]+)\/image\/upload\/([^/]+)\/(.+)$/;

    function enhanceImg(img) {
      try {
        if (!img.hasAttribute('loading')) img.setAttribute('loading', 'lazy');
        if (!img.hasAttribute('decoding')) img.setAttribute('decoding', 'async');

        // Only add small avatar-style srcsets for truly small Cloudinary images to avoid blurring large media
        const src = img.getAttribute('src') || '';
        const m = src.match(CLOUDINARY_REGEX);
        if (m) {
          const cloudName = m[1];
          const transforms = m[2] || '';
          const rest = m[3];

          // Heuristics to detect small avatar-like assets from transformation string or element hints
          const wMatch = transforms.match(/(?:^|,)w_(\d+)/);
          const hMatch = transforms.match(/(?:^|,)h_(\d+)/);
          const w = wMatch ? parseInt(wMatch[1], 10) : 0;
          const h = hMatch ? parseInt(hMatch[1], 10) : 0;
          const hintedSmall = img.classList.contains('avatar') || img.classList.contains('author-pic') || img.getAttribute('data-size') === 'avatar';
          const smallByTransform = (w && w <= 200) || (h && h <= 200);
          const isSmall = hintedSmall || smallByTransform;

          if (isSmall) {
            const base = `https://res.cloudinary.com/${cloudName}/image/upload`;
            const variant80 = `${base}/w_80,h_80,c_fill,g_face,q_auto/${rest}`;
            const variant160 = `${base}/w_160,h_160,c_fill,g_face,q_auto/${rest}`;
            const variant320 = `${base}/w_320,h_320,c_fill,g_face,q_auto/${rest}`;
            if (!img.hasAttribute('srcset')) {
              img.setAttribute('srcset', `${variant80} 80w, ${variant160} 160w, ${variant320} 320w`);
            }
            if (!img.hasAttribute('sizes')) {
              img.setAttribute('sizes', '(max-width:600px) 48px, 80px');
            }
          }
          // For larger content images, do not inject a tiny srcset/sizes to avoid the browser picking a low-res asset.
        }
      } catch (e) {
        // ignore per-image errors
      }
    }

    const imgs = Array.from(document.getElementsByTagName('img'));
    imgs.forEach(enhanceImg);

    // For dynamically inserted images, observe the document and update new nodes
    const observer = new MutationObserver(muts => {
      muts.forEach(m => {
        m.addedNodes && m.addedNodes.forEach(node => {
          if (node && node.tagName === 'IMG') {
            enhanceImg(node);
          } else if (node && node.querySelectorAll) {
            node.querySelectorAll('img').forEach(enhanceImg);
          }
        });
      });
    });
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
  } catch (err) {
    console.warn('lazy-images helper failed', err);
  }
})();
