// Utilities for rendering a verified badge next to target elements using existing theme colors
// Usage: import { renderVerifiedBadge } from './assets/js/verification-utils.js'

/**
 * Ensure a verified badge element exists right after the target element.
 * The badge uses gradient text with var(--blue) and var(--pink) as in the app theme.
 *
 * @param {HTMLElement} targetEl - Element to place badge after (e.g., span#headerDisplayName or h2#profileUsername)
 * @param {boolean} isVerified - Whether to show the badge
 * @param {('sm'|'md')} size - Badge size
 */
export function renderVerifiedBadge(targetEl, isVerified, size = 'sm') {
  try {
    if (!targetEl) return;
    const doc = targetEl.ownerDocument || document;
    const badgeId = `${targetEl.id || 'verified'}__badge`;
    let badgeEl = doc.getElementById(badgeId);

    if (!badgeEl) {
      badgeEl = doc.createElement('span');
      badgeEl.id = badgeId;
      badgeEl.className = `verified-badge ${size}`.trim();
      badgeEl.setAttribute('title', 'Verified');
      badgeEl.setAttribute('aria-label', 'Verified');
      const icon = doc.createElement('i');
      icon.className = 'fas fa-circle-check';
      badgeEl.appendChild(icon);
      // Place right after the target element
      targetEl.insertAdjacentElement('afterend', badgeEl);
    }

    // Update class size if changed
    badgeEl.classList.remove('sm', 'md');
    if (size) badgeEl.classList.add(size);

    // Toggle visibility
    badgeEl.style.display = isVerified ? 'inline-flex' : 'none';
  } catch (e) {
    console.error('renderVerifiedBadge error:', e);
  }
}
