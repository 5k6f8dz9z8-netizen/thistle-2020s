# Larkhall Thistle 2020s — Coach Availability

A one-page web app for confirming who's covering training and games. No build
step, no app store: put these files in a GitHub repo, turn on Pages, and share
the link.

## Files

| File | What it is |
|---|---|
| `index.html` | The page |
| `styles.css` | All the styling |
| `app.js` | The app |
| `config.js` | **The only file you need to edit** — coach names and database details |
| `badge.png`, `icon-192.png`, `icon-512.png` | Club badge and home-screen icons |
| `manifest.webmanifest` | Lets coaches add it to their home screen |
| `setup.html` | Open this on your computer — it writes `config.js` for you |
| `standalone.html` | The whole app in one file, if you'd rather upload just one thing |
| `database.rules.json` | The Firebase rules to paste in at step 2 |

## Quickest route

1. Open `setup.html` by double-clicking it — it runs on your own machine, nothing
   is uploaded. Fill in the squad details, paste your Firebase config, and press
   **Download config.js**.
2. Upload every file in this folder to a new GitHub repo, using the `config.js`
   you just downloaded in place of the one here.
3. Turn on Pages (below) and share the link.

If you'd rather upload a single file, use `standalone.html` instead: rename it to
`index.html`, edit the settings block at the very top, and upload just that. It
has the badge and everything else baked in. The only thing you lose is the
Android home-screen install, which needs the separate manifest file.

## 1. Put it on GitHub Pages

1. Create a new repository — public is fine, and it's required on the free plan
   for Pages to work.
2. Upload every file in this folder to the root of the repo (drag and drop into
   **Add file → Upload files** works).
3. **Settings → Pages → Build and deployment**. Source: *Deploy from a branch*.
   Branch: `main`, folder: `/ (root)`. Save.
4. Wait a minute, then your link is:
   `https://<your-username>.github.io/<repo-name>/`

At this point the app runs, but each coach's answers save only on their own
phone. Step 2 is what makes it shared.

## 2. Give it a shared database (Firebase, free)

1. Go to <https://console.firebase.google.com> and create a project. Turn off
   Google Analytics — you don't need it.
2. In the left menu: **Build → Realtime Database → Create database**. Pick a
   European location (`europe-west1`) and start in **test mode**.
3. Go to the **Rules** tab and replace what's there with this, then Publish:

   ```json
   {
     "rules": {
       "squads": {
         "$squad": { ".read": true, ".write": true }
       }
     }
   }
   ```

   Test mode rules stop working after 30 days, so don't skip this — the app
   would silently stop saving.
4. **Project settings → General → Your apps → Web (`</>`)**. Register an app
   (any nickname, skip Hosting). Firebase shows a `firebaseConfig` block.
5. Copy those values into `FIREBASE` in `config.js` and remove the `//` from
   each line. `databaseURL` is the one that matters most — if it's missing,
   copy it from the Realtime Database page.
6. Commit `config.js`. Within a minute the site picks it up and the footer
   changes to "Shared with every coach on the list."

## 3. Share it

Paste the link into the coaches' WhatsApp group and pin the message. Tell them
to open it once and use **Add to Home Screen** (Share menu on iPhone, three
dots on Android) — it then opens full screen with the badge as its icon.

Each coach types their name to get in. The name is remembered on their device,
so it's a one-off.

## Changing things later

Everything worth adjusting is in `config.js`:

- **`ROSTER`** — the coaches who can sign in. Removing a name locks them out;
  their past answers stay put.
- **`COVERED_AT`** — how many "yes" answers count as covered (green). Set it to
  `3` if games need three of you.
- **`CLUB` / `SQUAD`** — the wording in the masthead.
- **`DB_PATH`** — change to `squads/2018s` and you have a second, separate
  squad running from the same Firebase project and the same repo copy.

Edit the file on GitHub, commit, and the live site updates in about a minute.
If a coach's phone shows the old version, the **Reload** link at the bottom of
the app forces a refresh.

## Worth knowing

- The Firebase keys in `config.js` are meant to be public — that's how web apps
  work — but with the rules above, anyone who has the link can read and change
  the diary. That's the same risk as the WhatsApp group itself, and fine for
  availability, but don't put anything sensitive in the notes.
- Signing in by name isn't real security: a coach could type someone else's
  name. If you ever want that tightened, Firebase Authentication with a magic
  email link is the usual next step.
- Free tier limits are far beyond what a squad of six will ever use.
