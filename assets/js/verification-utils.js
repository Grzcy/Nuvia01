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
export function renderVerifiedBadge(targetEl, isVerified, size = 'md') {
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

/**
 * Render corner badges inside an avatar container (e.g., .profile-pic-wrapper)
 * - Verified: green circular badge with check icon (bottom-right)
 * - Premium: gold circular badge with crown icon (top-right)
 *
 * @param {HTMLElement} containerEl - The avatar container (must be position: relative)
 * @param {{verified?: boolean, premium?: boolean}} flags
 */
export function renderAvatarStatusBadges(containerEl, flags = {}) {
  try {
    if (!containerEl) return;
    const { verified = false, premium = false } = flags;
    const doc = containerEl.ownerDocument || document;

    // Choose host: prefer an outer anchor to avoid overflow clipping
    const host = (containerEl.classList && containerEl.classList.contains('profile-pic-wrapper') && containerEl.parentElement && containerEl.parentElement.classList.contains('profile-avatar-anchor'))
      ? containerEl.parentElement
      : containerEl;

    // Helper to create/find a badge
    const ensureBadge = (suffix, className, iconClass, title) => {
      const id = `${(host.id || containerEl.id || 'avatar')}__${suffix}-badge`;
      let el = doc.getElementById(id);
      if (!el) {
        el = doc.createElement('span');
        el.id = id;
        el.className = className;
        el.setAttribute('aria-hidden', 'false');
        el.setAttribute('role', 'img');
        el.setAttribute('title', title);
        const i = doc.createElement('i');
        i.className = iconClass;
        el.appendChild(i);
        host.appendChild(el);
      }
      return el;
    };

    const verifiedEl = ensureBadge('verified', 'profile-avatar-badge verified', 'fas fa-circle-check', 'Verified');
    const premiumEl = ensureBadge('premium', 'profile-avatar-badge premium', 'fas fa-crown', 'Premium');

    verifiedEl.style.display = verified ? 'flex' : 'none';
    premiumEl.style.display = premium ? 'flex' : 'none';
  } catch (e) {
    console.error('renderAvatarStatusBadges error:', e);
  }
}
