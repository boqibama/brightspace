# Brightspace Grades Dashboard (Chrome extension)

See your Brightspace (D2L) grades from every course in one place.

- **Popup** (click the toolbar icon): compact list of courses with overall % and letter grade, colour-coded
  (green ≥ 90, yellow 80–89, orange 70–79, red < 70).
- **Full dashboard** (button in the popup): every course expands to show each graded item: name,
  points earned / possible, %, weight (weighted gradebooks only), and instructor feedback.
- Refresh button, "last updated" time, results cached in `chrome.storage.local` so the popup opens instantly.
- Light and dark mode follow your system setting.

**Privacy:** the extension only talks to your school's Brightspace server, using the session you're already
logged in with. No password is asked for, there is no external server, and grades are stored only in your browser.

---

## 1. Set your school's Brightspace address (one line)

Open `manifest.json` and change the `host_permissions` line:

```json
"host_permissions": ["https://YOUR-SCHOOL.brightspace.com/*"]
```

to your school's address, for example:

```json
"host_permissions": ["https://myuni.brightspace.com/*"]
```

Use whatever is in your browser's address bar when you're on Brightspace. If your school uses its own
domain (e.g. `https://learn.myuni.edu`), use that: `"https://learn.myuni.edu/*"`. Keep the `/*` at the end.

That's the only place the address lives. The rest of the code reads it from the manifest.

## 2. Install it (unpacked)

1. Open Chrome and go to **`chrome://extensions`**.
2. Turn on **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the **`brightspace-grades`** folder (the one containing `manifest.json`).
5. Click the puzzle-piece icon in the toolbar and **pin** "Brightspace Grades Dashboard".
6. Log in to Brightspace in a normal tab if you aren't already.
7. Click the extension icon. The first load takes a few seconds, depending on how many courses you have.

**After editing any file**, go back to `chrome://extensions` and click the **↻ reload** arrow on the
extension's card, then reopen the popup.

## 3. Troubleshooting

| What you see | What to do |
| --- | --- |
| "Almost there", asking you to edit manifest.json | Do step 1, then reload the extension. |
| "You're not logged in" | Click **Log in to Brightspace**, log in, then press refresh (↻). |
| A course shows "Not available" | The instructor hasn't released the final grade or has hidden it. Hover the badge for the reason. Grade items may still show on the dashboard. |
| Old courses show up as current | Some schools never set end dates. Those courses count as current until Brightspace marks them inactive. |
| Anything else | On `chrome://extensions`, click **service worker** on the extension's card to open its console and look for `[Brightspace Grades]` messages. |

---

## How it works

```
popup / dashboard ──"refresh"──▶ background.js ──fetch (your cookies)──▶ your Brightspace
        ▲                                │
        └──── chrome.storage.local ◀─────┘   (results + progress)
```

1. `GET /d2l/api/versions/` picks the newest supported **lp** and **le** API versions.
2. `GET /d2l/api/lp/{ver}/users/whoami` checks you're logged in.
3. `GET /d2l/api/lp/{ver}/enrollments/myenrollments/?orgUnitTypeId=3` lists your courses (all pages).
4. For each course (4 at a time):
   - `GET /d2l/api/le/{ver}/{orgUnitId}/grades/final/values/myGradeValue`: overall grade
   - `GET /d2l/api/le/{ver}/{orgUnitId}/grades/values/myGradeValues/`: individual items

   A 403 or 404 on either request marks just that part "Not available". The rest keeps loading.

The fetching runs in the background service worker, so closing the popup mid-refresh doesn't cancel it.
If a refresh fails, your previously cached grades stay visible.

## Files

| File | What it does |
| --- | --- |
| `manifest.json` | Extension config. **Your Brightspace address goes here.** |
| `background.js` | Service worker. Runs a refresh and saves results to storage. |
| `lib/config.js` | Settings you might want to tweak: colour thresholds, how often the popup auto-refreshes, concurrency, timeouts. |
| `lib/brightspace.js` | Valence API calls (one function per endpoint). |
| `lib/grades.js` | Turns raw API JSON into tidy grade objects. Edit this to change how %, letters or "current course" are worked out. |
| `lib/store.js` | `chrome.storage.local` read/write helpers. |
| `lib/ui.js` | Shared UI helpers: grade badge, banners, formatting. |
| `common.css` | Colours and shared components for light and dark mode. Change the variables at the top to restyle. |
| `popup.*` | The toolbar popup. |
| `dashboard.*` | The full-page dashboard. |
| `icons/` | Toolbar and store icons (16/32/48/128 px). |

### Common tweaks

- **Different colour cutoffs:** edit `GRADE_BANDS` in `lib/config.js`.
- **Refresh the popup more or less often:** change `STALE_AFTER_MS` in `lib/config.js`.
- **Change what counts as a "current" course:** edit `classifyEnrollment()` in `lib/grades.js`.
- **Change colours:** edit the CSS variables at the top of `common.css`. The dark-mode values are in the
  `@media (prefers-color-scheme: dark)` block.
