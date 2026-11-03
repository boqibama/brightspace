// ---------------------------------------------------------------------------
// Background service worker
//
// Does the actual fetching so a refresh keeps going even if you close the
// popup halfway through. Results go into chrome.storage.local, and the popup
// and dashboard re-render automatically when storage changes.
// ---------------------------------------------------------------------------

import { getBaseUrl, isConfigured, COURSE_CONCURRENCY } from './lib/config.js';
import {
  ApiError,
  getLatestVersions,
  whoAmI,
  getMyCourseEnrollments,
  getMyFinalGrade,
  getMyGradeValues,
} from './lib/brightspace.js';
import { toCourse, summarizeFinalGrade, normalizeGradeItems, unavailable, describeFailure } from './lib/grades.js';
import { KEYS, loadState, setRefreshState } from './lib/store.js';

/** The refresh currently in progress (so repeated clicks don't start a second one). */
let inFlight = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'refresh') {
    refresh();
    sendResponse({ started: true });
  }
});

// A brand-new worker can't have a refresh running, so any leftover "loading"
// state is from a worker Chrome shut down mid-refresh. Reset it.
loadState().then(({ refresh: state }) => {
  if (state.status === 'loading' && !inFlight) setRefreshState({ status: 'idle' });
});

function refresh() {
  if (!inFlight) inFlight = runRefresh().finally(() => { inFlight = null; });
  return inFlight;
}

async function runRefresh() {
  const startedAt = Date.now();
  await setRefreshState({ status: 'loading', startedAt, done: 0, total: 0 });

  try {
    if (!isConfigured()) {
      throw new ApiError('Set your Brightspace address in manifest.json first.', { code: 'NOT_CONFIGURED' });
    }

    // 1. Discover API versions, 2. make sure we're logged in, 3. list courses.
    const versions = await getLatestVersions();
    const user = await whoAmI(versions.lp);
    const enrollments = await getMyCourseEnrollments(versions.lp);

    const courses = enrollments
      .filter((e) => e?.OrgUnit?.Id != null && e.Access?.CanAccess !== false)
      .map((e) => toCourse(e, startedAt));

    // 4. Fetch grades for every course, a few at a time.
    let done = 0;
    await setRefreshState({ status: 'loading', startedAt, done, total: courses.length });
    await mapWithConcurrency(courses, COURSE_CONCURRENCY, async (course) => {
      await loadCourseGrades(versions.le, course);
      done += 1;
      await setRefreshState({ status: 'loading', startedAt, done, total: courses.length });
    });

    // Current courses first, then alphabetical.
    const periodOrder = { current: 0, upcoming: 1, past: 2 };
    courses.sort((a, b) => periodOrder[a.period] - periodOrder[b.period] || a.name.localeCompare(b.name));

    await chrome.storage.local.set({
      [KEYS.cache]: {
        updatedAt: Date.now(),
        baseUrl: getBaseUrl(),
        versions,
        user: { firstName: user?.FirstName || '', lastName: user?.LastName || '' },
        courses,
      },
      [KEYS.refresh]: { status: 'idle', finishedAt: Date.now() },
    });
  } catch (err) {
    console.warn('[Brightspace Grades] refresh failed:', err);
    await setRefreshState({
      status: 'error',
      finishedAt: Date.now(),
      error: { code: err.code || 'UNKNOWN', status: err.status || 0, message: err.message || String(err) },
    });
  }
}

/**
 * Fill in course.final and course.items. Each request fails independently:
 * a hidden final grade still lets the item list show, and vice versa.
 */
async function loadCourseGrades(le, course) {
  const [finalResult, itemsResult] = await Promise.allSettled([
    getMyFinalGrade(le, course.id),
    getMyGradeValues(le, course.id),
  ]);

  // If the session expired in the middle of a refresh, stop everything and
  // show the login prompt rather than marking every course "Not available".
  for (const r of [finalResult, itemsResult]) {
    if (r.status === 'rejected' && r.reason?.code === 'NOT_LOGGED_IN') throw r.reason;
  }

  course.final = finalResult.status === 'fulfilled'
    ? summarizeFinalGrade(finalResult.value)
    : unavailable(describeFailure(finalResult.reason));

  course.items = itemsResult.status === 'fulfilled'
    ? { status: 'ok', list: normalizeGradeItems(itemsResult.value) }
    : { ...unavailable(describeFailure(itemsResult.reason)), list: [] };
}

/** Like Promise.all(items.map(fn)) but with at most `limit` running at once. */
async function mapWithConcurrency(items, limit, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
