// ---------------------------------------------------------------------------
// Configuration
//
// Your school's Brightspace address lives in ONE place: the "host_permissions"
// entry in manifest.json. Everything else reads it from there, so you never
// have to keep two copies in sync.
// ---------------------------------------------------------------------------

/** "https://school.brightspace.com/*"  ->  "https://school.brightspace.com" */
export function getBaseUrl() {
  const pattern = chrome.runtime.getManifest().host_permissions?.[0] || '';
  return pattern.replace(/\/\*$/, '').replace(/\/+$/, '');
}

/** False while manifest.json still contains the placeholder domain. */
export function isConfigured() {
  const base = getBaseUrl();
  return /^https:\/\/[^/*]+$/.test(base) && !/your-school/i.test(base);
}

/** Where the "Log in to Brightspace" button sends you. */
export function loginUrl() {
  return `${getBaseUrl()}/d2l/login`;
}

/** The normal Brightspace "My Grades" page for one course. */
export function courseGradesUrl(orgUnitId) {
  return `${getBaseUrl()}/d2l/lms/grades/my_grades/main.d2l?ou=${encodeURIComponent(orgUnitId)}`;
}

// --- Tunables ---------------------------------------------------------------

/** The popup triggers a background refresh if the cache is older than this. */
export const STALE_AFTER_MS = 10 * 60 * 1000; // 10 minutes

/** How many courses to fetch at the same time (be gentle on the server). */
export const COURSE_CONCURRENCY = 4;

/** Give up on a single API request after this long. */
export const REQUEST_TIMEOUT_MS = 20 * 1000;

/** Grade colour bands. Change these if your school uses a different scale. */
export const GRADE_BANDS = [
  { min: 90, band: 'green' },
  { min: 80, band: 'yellow' },
  { min: 70, band: 'orange' },
  { min: -Infinity, band: 'red' },
];
