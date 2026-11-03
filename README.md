**Brightspace Grades**: a Chrome extension that shows all your Brightspace grades in one place instead of clicking into every class.

- Click the icon for a quick list of every course with your overall % and letter grade (color-coded)
- Open the full dashboard to see every assignment: points, %, weight, and instructor feedback
- Works in light and dark mode

It only talks to your school's Brightspace using the login you already have. No password, no outside server, and your grades only get saved in your browser.

To install it:
1. It's set up for USC (brightspace.usc.edu). For another school, change the `host_permissions` line in `manifest.json` to whatever's in your address bar on Brightspace.
2. Go to `chrome://extensions` and turn on Developer mode (top right).
3. Click Load unpacked and pick this folder.
4. Pin it, log into Brightspace, and click the icon. The first load takes a few seconds.

If you change any files, hit the reload arrow on the extension's card in `chrome://extensions`.

If something's off: "You're not logged in" means log in and hit refresh. A course that says "Not available" usually means the professor hasn't released the grade or hid it.

How it works: it uses Brightspace's API to check you're logged in, list your courses, then pull the final grade and every graded item for each course, 4 courses at a time. It runs in the background, so closing the popup doesn't stop a refresh. Things like the color cutoffs and refresh timing are in `lib/config.js`.
