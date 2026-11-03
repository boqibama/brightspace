// ---------------------------------------------------------------------------
// Full-page dashboard: every course as an expandable card listing each
// graded item (name, points, %, weight). Live-updates from chrome.storage.
// ---------------------------------------------------------------------------

import { isConfigured, courseGradesUrl } from './lib/config.js';
import { loadState, saveSettings, requestRefresh, onStateChange, isLoading } from './lib/store.js';
import {
  el, icon, gradePill, gradeBand, formatPercent, formatNumber, absoluteUrl,
  visibleCourses, buildNotice, statusText, syncRefreshButton,
} from './lib/ui.js';

const $ = (id) => document.getElementById(id);
const refreshBtn = $('refresh');
const showPastInput = $('showPast');

let state = { cache: null, refresh: { status: 'idle' }, settings: { showPast: false } };

/** Which course cards are expanded, so re-renders don't collapse them. */
const openIds = new Set();

refreshBtn.append(icon('refresh'));
refreshBtn.addEventListener('click', () => requestRefresh());
showPastInput.addEventListener('change', () => saveSettings({ showPast: showPastInput.checked }));

$('expandAll').addEventListener('click', () => setAllOpen(true));
$('collapseAll').addEventListener('click', () => setAllOpen(false));

function setAllOpen(open) {
  for (const card of document.querySelectorAll('details.course')) card.open = open;
}

// --- Rendering ---------------------------------------------------------------

function render() {
  const { cache, refresh, settings } = state;

  $('status').textContent = statusText(state);
  $('status').title = cache?.updatedAt ? `Last updated ${new Date(cache.updatedAt).toLocaleString()}` : '';
  syncRefreshButton(refreshBtn, refresh);
  showPastInput.checked = settings.showPast;
  $('notice').replaceChildren(buildNotice(state) || '');

  const courses = visibleCourses(cache, settings.showPast);
  $('subtitle').textContent = subtitleText(cache, courses, settings.showPast);

  const container = $('courses');
  if (!cache) { container.replaceChildren(); return; }
  if (!courses.length) {
    container.replaceChildren(el('div', { className: 'empty' },
      cache.courses.length ? 'No current courses. Turn on “Show past courses” to see older ones.' : 'No courses found.'));
    return;
  }
  container.replaceChildren(...courses.map(renderCourse));
}

function subtitleText(cache, courses, showPast) {
  if (!cache) return isConfigured() ? '' : 'Not set up yet';
  const name = [cache.user?.firstName, cache.user?.lastName].filter(Boolean).join(' ');
  const count = `${courses.length} ${showPast ? '' : 'current '}course${courses.length === 1 ? '' : 's'}`;
  return name ? `${name} · ${count}` : count;
}

function renderCourse(course) {
  const band = course.final?.status === 'ok' ? gradeBand(course.final.percent) : null;
  const items = course.items?.list || [];
  const gradedCount = items.filter((i) => !i.isCategory).length;

  const details = el('details', {
    className: 'course',
    id: `course-${course.id}`,
    open: openIds.has(course.id),
    dataset: { band: band || 'none' },
  },
  el('summary', {},
    el('span', { className: 'chev' }, icon('chevron')),
    el('div', { className: 'course-head' },
      el('div', { className: 'course-name' },
        course.name,
        course.period !== 'current' ? el('span', { className: 'period-tag' }, course.period) : null),
      el('div', { className: 'course-sub' },
        [course.code, course.items?.status === 'ok' ? `${gradedCount} graded item${gradedCount === 1 ? '' : 's'}` : null]
          .filter(Boolean).join(' · '))),
    gradePill(course.final, { size: 'lg' })),
  el('div', { className: 'course-body' }, ...renderCourseBody(course)));

  details.addEventListener('toggle', () => {
    if (details.open) openIds.add(course.id); else openIds.delete(course.id);
  });
  return details;
}

function renderCourseBody(course) {
  const parts = [];
  const items = course.items;

  if (!items || items.status !== 'ok') {
    parts.push(el('p', { className: 'muted' }, `Grade items not available. ${items?.reason || ''}`));
  } else if (!items.list.length) {
    parts.push(el('p', { className: 'muted' }, 'No graded items have been released yet.'));
  } else {
    parts.push(el('div', { className: 'table-wrap' }, renderItemsTable(items.list)));
  }

  const homeUrl = absoluteUrl(course.homeUrl);
  parts.push(el('div', { className: 'course-foot' },
    el('span', { className: 'muted' }, finalDetail(course.final)),
    el('span', {},
      el('a', { href: courseGradesUrl(course.id), target: '_blank', rel: 'noopener' }, 'Grades in Brightspace', icon('external')),
      homeUrl ? '   ' : null,
      homeUrl ? el('a', { href: homeUrl, target: '_blank', rel: 'noopener' }, 'Course home', icon('external')) : null)));
  return parts;
}

/** One line under the table explaining the final grade (or why it's missing). */
function finalDetail(final) {
  if (!final) return '';
  if (final.status !== 'ok') return `Final grade: not available — ${final.reason}`;
  const points = final.numerator != null && final.denominator != null
    ? `${formatNumber(final.numerator)} / ${formatNumber(final.denominator)}`
    : null;
  return `Final grade: ${[points, final.displayed].filter(Boolean).join(' · ')}`;
}

function renderItemsTable(list) {
  const hasWeights = list.some((i) => i.weight != null);
  return el('table', { className: 'items' },
    el('thead', {}, el('tr', {},
      el('th', {}, 'Item'),
      el('th', { className: 'num' }, 'Score'),
      el('th', { className: 'num' }, '%'),
      hasWeights ? el('th', { className: 'num col-weight', title: 'How much this item counts toward your final grade' }, 'Weight') : null)),
    el('tbody', {}, ...list.map((item) => renderItemRow(item, hasWeights))));
}

function renderItemRow(item, hasWeights) {
  const band = gradeBand(item.percent);
  const score = item.numerator != null && item.denominator != null
    ? `${formatNumber(item.numerator)} / ${formatNumber(item.denominator)}`
    : item.displayed || '—';

  return el('tr', { className: item.isCategory ? 'category' : '' },
    el('td', {},
      el('div', { className: 'item-name' }, item.name),
      item.feedback ? el('div', { className: 'item-feedback' }, item.feedback) : null),
    el('td', { className: 'num' }, score),
    el('td', { className: 'num' },
      item.percent != null
        ? el('span', { className: `pct-text ${band ? `band-${band}` : ''}` }, formatPercent(item.percent))
        // No %: show a letter/symbol only if it adds something beyond the Score column.
        : (item.letter && item.letter !== score ? item.letter : '—')),
    hasWeights
      ? el('td', {
        className: 'num col-weight',
        title: item.weight != null && item.weightEarned != null
          ? `You earned ${formatNumber(item.weightEarned)} of ${formatNumber(item.weight)} weighted points`
          : '',
      }, item.weight != null ? `${formatNumber(item.weight)}%` : '—')
      : null);
}

/** If opened as dashboard.html#course-123 (from the popup), jump to that course. */
function revealHashTarget() {
  const match = location.hash.match(/^#course-(.+)$/);
  if (!match) return false;
  const card = document.getElementById(`course-${match[1]}`);
  if (!card) return false;
  card.open = true;
  card.classList.add('is-target');
  card.scrollIntoView({ block: 'start' });
  setTimeout(() => card.classList.remove('is-target'), 2000);
  return true;
}

// --- Start up ------------------------------------------------------------------

async function init() {
  state = await loadState();

  // If the popup linked to a past course, turn on "show past" so it's visible.
  const target = location.hash.match(/^#course-(.+)$/)?.[1];
  if (target && !state.settings.showPast) {
    const course = state.cache?.courses?.find((c) => String(c.id) === target);
    if (course && course.period !== 'current') {
      state.settings.showPast = true;
      saveSettings({ showPast: true });
    }
  }

  render();
  revealHashTarget();

  if (isConfigured() && !state.cache && !isLoading(state.refresh)) requestRefresh();

  onStateChange(async () => { state = await loadState(); render(); });

  setInterval(() => { $('status').textContent = statusText(state); }, 30 * 1000);
}

init();
