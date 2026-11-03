// ---------------------------------------------------------------------------
// chrome.storage.local helpers shared by the popup, dashboard and background.
//
// Stored keys:
//   gradesCache   { updatedAt, baseUrl, user, versions, courses: [...] }
//                 Only replaced after a fully successful refresh, so a failed
//                 refresh never wipes the grades you already had.
//   refreshState  { status: 'idle'|'loading'|'error', startedAt, done, total, error }
//   settings      { showPast: boolean }
// ---------------------------------------------------------------------------

export const KEYS = {
  cache: 'gradesCache',
  refresh: 'refreshState',
  settings: 'settings',
};

const DEFAULT_SETTINGS = { showPast: false };

/** A "loading" state older than this is assumed dead (e.g. the worker was killed). */
const LOADING_TIMEOUT_MS = 3 * 60 * 1000;

export async function loadState() {
  const data = await chrome.storage.local.get(Object.values(KEYS));
  return {
    cache: data[KEYS.cache] || null,
    refresh: data[KEYS.refresh] || { status: 'idle' },
    settings: { ...DEFAULT_SETTINGS, ...(data[KEYS.settings] || {}) },
  };
}

export async function saveSettings(patch) {
  const { settings } = await loadState();
  await chrome.storage.local.set({ [KEYS.settings]: { ...settings, ...patch } });
}

export function setRefreshState(state) {
  return chrome.storage.local.set({ [KEYS.refresh]: state });
}

export function isLoading(refresh) {
  return refresh?.status === 'loading' && Date.now() - (refresh.startedAt || 0) < LOADING_TIMEOUT_MS;
}

/** Ask the background worker to re-fetch everything. Safe to call repeatedly. */
export function requestRefresh() {
  return chrome.runtime.sendMessage({ type: 'refresh' }).catch(() => {});
}

/** Call `callback` whenever any of our keys change (from any extension page). */
export function onStateChange(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && Object.values(KEYS).some((k) => k in changes)) callback(changes);
  });
}
