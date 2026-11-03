// ---------------------------------------------------------------------------
// Brightspace Valence REST API client
//
// Every request goes straight from your browser to your school's Brightspace
// server, using the cookies of the session you're already logged in with
// (`credentials: 'include'`). Nothing is sent anywhere else.
//
// API reference: https://docs.valence.desire2learn.com/
// ---------------------------------------------------------------------------

import { getBaseUrl, REQUEST_TIMEOUT_MS } from './config.js';

/** Error with an HTTP status and a short machine-readable code for the UI. */
export class ApiError extends Error {
  /**
   * @param {string} message  Human-readable description.
   * @param {{status?: number, code?: string}} [opts]
   *   code is one of: HTTP, NETWORK, NOT_LOGGED_IN, NOT_CONFIGURED, BAD_RESPONSE
   */
  constructor(message, { status = 0, code = 'HTTP' } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** GET a Valence route (path starts with "/d2l/api/...") and return parsed JSON. */
export async function apiGet(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(getBaseUrl() + path, {
      credentials: 'include', // send your existing Brightspace session cookies
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (err) {
    throw new ApiError(
      err.name === 'AbortError' ? 'Brightspace took too long to respond.' : 'Could not reach Brightspace. Check your connection.',
      { code: 'NETWORK' },
    );
  } finally {
    clearTimeout(timer);
  }

  // When you're logged out, some Brightspace instances answer with a redirect
  // to the login page (HTML) instead of a clean 401.
  if (res.redirected && /\/d2l\/(login|logon)/i.test(res.url)) {
    throw new ApiError('Not logged in to Brightspace.', { status: 401, code: 'NOT_LOGGED_IN' });
  }
  if (!res.ok) {
    throw new ApiError(`Brightspace returned HTTP ${res.status}.`, { status: res.status });
  }
  const type = res.headers.get('content-type') || '';
  if (!type.includes('json')) {
    throw new ApiError('Brightspace sent an unexpected (non-JSON) response.', { status: res.status, code: 'BAD_RESPONSE' });
  }
  return res.json();
}

// --- API versions ------------------------------------------------------------

/** Compare "1.47" vs "1.9" numerically, part by part. */
function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

/**
 * Ask the server which API versions it supports and pick the newest "lp"
 * (Learning Platform) and "le" (Learning Environment) versions.
 * GET /d2l/api/versions/   (works without logging in)
 * @returns {Promise<{lp: string, le: string}>}
 */
export async function getLatestVersions() {
  const products = await apiGet('/d2l/api/versions/');
  const pick = (code) => {
    const product = (products || []).find((p) => String(p.ProductCode).toLowerCase() === code);
    const candidates = [product?.LatestVersion, ...(product?.SupportedVersions || [])].filter(Boolean);
    if (!candidates.length) {
      throw new ApiError(`Brightspace didn't report a supported "${code}" API version.`, { code: 'BAD_RESPONSE' });
    }
    return candidates.sort(compareVersions).at(-1);
  };
  return { lp: pick('lp'), le: pick('le') };
}

// --- Who am I / login check ---------------------------------------------------

/**
 * Returns the current user. A 401/403 here means there's no valid session,
 * so it's converted into a NOT_LOGGED_IN error the UI knows how to show.
 * GET /d2l/api/lp/{ver}/users/whoami
 */
export async function whoAmI(lp) {
  try {
    return await apiGet(`/d2l/api/lp/${lp}/users/whoami`);
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      throw new ApiError('Not logged in to Brightspace.', { status: err.status, code: 'NOT_LOGGED_IN' });
    }
    throw err;
  }
}

// --- Courses -------------------------------------------------------------------

/**
 * All of your course enrollments (org unit type 3 = Course Offering).
 * The endpoint is paged with a "bookmark", so keep fetching until done.
 * GET /d2l/api/lp/{ver}/enrollments/myenrollments/?orgUnitTypeId=3
 */
export async function getMyCourseEnrollments(lp) {
  const items = [];
  let bookmark = '';
  for (let page = 0; page < 50; page++) { // hard cap so a bad response can't loop forever
    const query = new URLSearchParams({ orgUnitTypeId: '3' });
    if (bookmark) query.set('bookmark', bookmark);
    const data = await apiGet(`/d2l/api/lp/${lp}/enrollments/myenrollments/?${query}`);
    items.push(...(data?.Items || []));
    if (!data?.PagingInfo?.HasMoreItems || !data.PagingInfo.Bookmark) break;
    bookmark = data.PagingInfo.Bookmark;
  }
  return items;
}

// --- Grades ---------------------------------------------------------------------

/**
 * Your final/overall grade in one course. 403/404 usually means the
 * instructor hasn't released it (or the course has no final grade item).
 * GET /d2l/api/le/{ver}/{orgUnitId}/grades/final/values/myGradeValue
 */
export function getMyFinalGrade(le, orgUnitId) {
  return apiGet(`/d2l/api/le/${le}/${orgUnitId}/grades/final/values/myGradeValue`);
}

/**
 * Every grade item that's been released to you in one course.
 * GET /d2l/api/le/{ver}/{orgUnitId}/grades/values/myGradeValues/
 */
export function getMyGradeValues(le, orgUnitId) {
  return apiGet(`/d2l/api/le/${le}/${orgUnitId}/grades/values/myGradeValues/`);
}

/**
 * D2L's GradeObjectType numbers, used to tell regular items apart from
 * categories and the final grade.
 */
export const GRADE_OBJECT_TYPE = {
  NUMERIC: 1,
  PASS_FAIL: 2,
  SELECT_BOX: 3,
  TEXT: 4,
  CALCULATED: 5,
  FORMULA: 6,
  FINAL_CALCULATED: 7,
  FINAL_ADJUSTED: 8,
  CATEGORY: 9,
};
