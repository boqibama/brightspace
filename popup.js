// ---------------------------------------------------------------------------
// Popup: shows the cached grades instantly, then refreshes in the background
// if the cache is stale. Re-renders whenever storage changes.
// ---------------------------------------------------------------------------

import { STALE_AFTER_MS, isConfigured } from './lib/config.js';
import { loadState, saveSettings, requestRefresh, onStateChange, isLoading } from './lib/store.js';
import { el, icon, gradePill, gradeBand, visibleCourses, buildNotice, statusText, syncRefreshButton } from './lib/ui.js';

const $ = (id) => document.getElementById(id);
const refreshBtn = $('refresh');
const showPastInput = $('showPast');

let state = { cache: null, refresh: { status: 'idle' }, settings: { showPast: false } };

refreshBtn.append(icon('refresh'));
refreshBtn.addEventListener('click', () => requestRefresh());

showPastInput.addEventListener('change', () => saveSettings({ showPast: showPastInput.checked }));

$('openDashboard').addEventListener('click', () => openDashboard());

/** Open dashboard.html in a new tab, optionally jumping to one course. */
function openDashboard(courseId) {
  const hash = courseId != null ? `#course-${courseId}` : '';
  chrome.tabs.create({ url: chrome.runtime.getURL(`dashboard.html${hash}`) });
  window.close();
}

function render() {
  const { cache, refresh, settings } = state;

  $('status').textContent = statusText(state);
  $('status').title = cache?.updatedAt ? new Date(cache.updatedAt).toLocaleString() : '';
  syncRefreshButton(refreshBtn, refresh);
  showPastInput.checked = settings.showPast;

  $('notice').replaceChildren(buildNotice(state) || '');

  const list = $('list');
  if (!cache) { list.replaceChildren(); return; }

  const courses = visibleCourses(cache, settings.showPast);
  if (!courses.length) {
    const hasOthers = cache.courses.length > 0;
    list.replaceChildren(el('li', { className: 'empty' },
      hasOthers ? 'No current courses. Turn on “Past courses” to see older ones.' : 'No courses found.'));
    return;
  }

  list.replaceChildren(...courses.map((course) => el('li', {},
    el('button', {
      className: 'course-row',
      type: 'button',
      title: 'Show all grade items',
      dataset: { band: (course.final?.status === 'ok' && gradeBand(course.final.percent)) || 'none' },
      onclick: () => openDashboard(course.id),
    },
    el('div', { className: 'course-text' },
      el('div', { className: 'course-name' }, course.name),
      el('div', { className: 'course-code' },
        course.code,
        course.period !== 'current' ? el('span', { className: 'period-tag' }, course.period) : null)),
    gradePill(course.final)))));
}

async function init() {
  state = await loadState();

  // Fetch fresh data if we have nothing, or what we have is old. Show the
  // loading state straight away rather than waiting for the worker to report it.
  const stale = !state.cache || Date.now() - state.cache.updatedAt > STALE_AFTER_MS;
  const shouldRefresh = isConfigured() && stale && !isLoading(state.refresh);
  if (shouldRefresh) state.refresh = { status: 'loading', startedAt: Date.now(), done: 0, total: 0 };
  render();
  if (shouldRefresh) requestRefresh();

  onStateChange(async () => { state = await loadState(); render(); });

  // Keep "Updated 5 min ago" ticking while the popup is open.
  setInterval(() => { $('status').textContent = statusText(state); }, 30 * 1000);
}

init();
