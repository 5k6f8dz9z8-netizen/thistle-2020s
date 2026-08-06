// ---------------------------------------------------------------------------
// The only file you need to edit. See README.md for the Firebase steps.
// ---------------------------------------------------------------------------

// Who can sign in. A coach types their name exactly as written here
// (capitals don't matter). Add or remove names as the coaching team changes.
export const ROSTER = ["Chris", "Arron", "Steven", "Greg", "Davie", "Jenna"];

// How many "yes" answers count as covered. Below this, the session shows amber
// (1 coach) or red (nobody).
export const COVERED_AT = 2;

// Shown in the masthead and on the sign-in screen.
export const CLUB = "Larkhall Thistle";
export const SQUAD = "2020s";

// Paste your Firebase web app config between the braces. Until you do, the app
// still works but saves only on the device you're using — nothing is shared.
export const FIREBASE = {
  // apiKey: "...",
  // authDomain: "your-project.firebaseapp.com",
  // databaseURL: "https://your-project-default-rtdb.europe-west1.firebasedatabase.app",
  // projectId: "your-project",
  // appId: "..."
};

// Where the squad's data lives in the database. Change this if you ever run a
// second squad from the same Firebase project (e.g. "squads/2018s").
export const DB_PATH = "squads/2020s";
