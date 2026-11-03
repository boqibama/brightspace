// ---------------------------------------------------------------------------
// Small UI helpers shared by popup.js and dashboard.js.
// All text from Brightspace is inserted with textContent (never innerHTML),
// so course or item names can't inject HTML into the extension pages.
// ---------------------------------------------------------------------------

import { GRADE_BANDS, getBaseUrl, isConfigured, loginUrl } from './config.js';
import { isLoading } from './store.js';

/**
 * Tiny element builder: el('div', { className: 'x', onclick }, 'text', child)
 * Props starting with "on" become event listeners; `dataset` and `attrs` are objects.
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'attrs') for (const [a, v] of Object.entries(value)) node.setAttribute(a, v);
    else node[key] = value;
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** 'green' | 'yellow' | 'orange' | 'red' | null for a percentage. */
export function gradeBand(percent) {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) return null;
  return GRADE_BANDS.find((b) => percent >= b.min).band;
}

/** 92.456 -> "92.5%", 90 -> "90%" */
export function formatPercent(percent) {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) return '';
  return `${formatNumber(percent, 1)}%`;
}

/** Up to `digits` decimals, no trailing zeros. */
export function formatNumber(n, digits = 2) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

/** "just now", "5 min ago", "3 h ago", "2 days ago" */
export function timeAgo(timestamp) {
  if (!timestamp) return 'never';
  const seconds = Math.max(0, (Date.now() - timestamp) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** Absolute links for Brightspace paths like "/d2l/home/123". */
export function absoluteUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  try { return new URL(pathOrUrl, getBaseUrl()).href; } catch { return null; }
}

/**
 * Coloured grade badge: "92.5%  A-", or a muted "Not available".
 * @param {object|undefined} final  course.final from the cache
 */
export function gradePill(final, { size = 'md' } = {}) {
  if (!final || final.status !== 'ok') {
    return el('span', {
      className: `pill pill-${size} pill-muted`,
      title: final?.reason || 'Not loaded yet',
    }, 'Not available');
  }
  const band = gradeBand(final.percent);
  return el('span', {
    className: `pill pill-${size} ${band ? `band-${band}` : 'pill-neutral'}`,
    title: final.displayed ? `Brightspace shows: ${final.displayed}` : '',
  },
  final.percent != null ? el('span', { className: 'pill-pct' }, formatPercent(final.percent)) : null,
  final.letter ? el('span', { className: 'pill-letter' }, final.letter) : null);
}

/** Courses to show given the "show past courses" toggle. */
export function visibleCourses(cache, showPast) {
  const courses = cache?.courses || [];
  return showPast ? courses : courses.filter((c) => c.period === 'current');
}

/**
 * Banner for setup / login / error / progress states, or null if all is well.
 * The login banner includes a button that opens your Brightspace login page.
 */
export function buildNotice({ cache, refresh }) {
  if (!isConfigured()) {
    return el('div', { className: 'notice notice-warn' },
      el('strong', {}, 'Almost there'),
      el('p', {}, 'Open manifest.json and replace YOUR-SCHOOL.brightspace.com in "host_permissions" with your school’s Brightspace address, then reload the extension.'));
  }

  if (refresh?.status === 'error') {
    const err = refresh.error || {};
    if (err.code === 'NOT_LOGGED_IN') {
      return el('div', { className: 'notice notice-warn' },
        el('strong', {}, 'You’re not logged in'),
        el('p', {}, cache ? 'Showing your last saved grades. Log in, then hit refresh.' : 'Log in to Brightspace, then hit refresh.'),
        el('button', {
          className: 'btn btn-primary',
          onclick: () => chrome.tabs.create({ url: loginUrl() }),
        }, 'Log in to Brightspace'));
    }
    return el('div', { className: 'notice notice-error' },
      el('strong', {}, 'Couldn’t refresh'),
      el('p', {}, err.message || 'Something went wrong.', cache ? ' Showing your last saved grades.' : ''));
  }

  if (isLoading(refresh) && !cache) {
    return el('div', { className: 'notice' },
      el('span', { className: 'spinner', attrs: { 'aria-hidden': 'true' } }),
      el('span', {}, refresh.total ? `Loading grades… ${refresh.done}/${refresh.total} courses` : 'Connecting to Brightspace…'));
  }
  return null;
}

/** Text for the "last updated" line, including live progress while loading. */
export function statusText({ cache, refresh }) {
  if (isLoading(refresh)) {
    return refresh.total ? `Updating… ${refresh.done}/${refresh.total}` : 'Updating…';
  }
  return cache?.updatedAt ? `Updated ${timeAgo(cache.updatedAt)}` : 'Not loaded yet';
}

/** Put the refresh button in its spinning/disabled state while loading. */
export function syncRefreshButton(button, refresh) {
  const loading = isLoading(refresh);
  button.classList.toggle('is-spinning', loading);
  button.disabled = loading || !isConfigured();
  button.setAttribute('aria-busy', String(loading));
}

/** Inline SVG icons (kept here so there are no extra image files to load). */
export const ICONS = {
  refresh: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
  external: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
};

/** Build an element from one of the trusted ICONS strings above. */
export function icon(name) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.innerHTML = ICONS[name]; // static, trusted markup only
  return span;
}
