import { ROSTER, COVERED_AT, CLUB, SQUAD, FIREBASE, DB_PATH } from "./config.js";

/* ------------------------------------------------------------------ setup */

const BADGE = "badge.png";
const ME_KEY = "thistle:me";
const LOCAL_KEY = "thistle:data";

const COACHES = ROSTER.map((name) => ({ id: name.toLowerCase(), name, initial: name[0].toUpperCase() }));
const coachById = (id) => COACHES.find((c) => c.id === id);

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); };
const longDate = (s) => {
  const d = fromIso(s);
  if (isNaN(d)) return "";
  return `${WEEKDAYS[(d.getDay() + 6) % 7]} ${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
};
const addWeeks = (s, n) => { const d = fromIso(s); d.setDate(d.getDate() + n * 7); return iso(d); };
const plusHour = (t) => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${pad((h + 1) % 24)}:${pad(m)}`; };
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Answers are stored as { v, note }; older plain-string answers still read fine.
const answerOf = (a) => (typeof a === "string" ? a : a && a.v) || null;
const noteOf = (a) => (a && typeof a === "object" && a.note) || "";

const today = iso(new Date());
const thisMonth = today.slice(0, 7);

/* ------------------------------------------------------- coach info table */

// Grouped so the table has sensible headers and the edit card reads in order.
const INFO_GROUPS = [
  { label: "Registration", fields: [
    { key: "cometId", head: "Comet ID", type: "text" },
  ]},
  { label: "Role", fields: [
    { key: "headCoach", head: "Head Coach", type: "tick" },
    { key: "coach", head: "Coach", type: "tick" },
    { key: "firstAider", head: "First Aider", type: "tick" },
    { key: "secretary", head: "Secretary", type: "tick" },
  ]},
  { label: "Conduct & training", fields: [
    { key: "conduct", head: "Conduct Signed", type: "date" },
    { key: "wellbeing", head: "Wellbeing Exp", type: "month" },
    { key: "mental", head: "Mental Exp", type: "month" },
    { key: "selfDec", head: "Self Dec Exp", type: "month" },
  ]},
  { label: "Qualifications", fields: [
    { key: "q11", head: "1.1", type: "tick" },
    { key: "q12c", head: "1.2 Children", type: "tick" },
    { key: "q13c", head: "1.3 Children", type: "tick" },
    { key: "q12y", head: "1.2 Youth", type: "tick" },
    { key: "q13y", head: "1.3 Youth", type: "tick" },
    { key: "otherBadges", head: "Other Badges", type: "tick" },
    { key: "badgeExpiry", head: "Badge Expiry", type: "month" },
  ]},
  { label: "First aid & PVG", fields: [
    { key: "firstAidExp", head: "First Aid Exp", type: "month" },
    { key: "pvgType", head: "PVG Type", type: "choice", options: ["", "Adult", "Child"] },
    { key: "pvg", head: "PVG", type: "month" },
  ]},
];

const INFO_FIELDS = INFO_GROUPS.flatMap((g) => g.fields);
const fieldOf = (key) => INFO_FIELDS.find((f) => f.key === key);
const EXPIRY_KEYS = INFO_FIELDS.filter((f) => f.type === "month").map((f) => f.key);

// Starting values from the club sheet, written once if the table is still
// empty. Contact details are deliberately left out — see README. Once every
// coach has filled their row in, this block can be deleted.
const SEED = {
  greg:   { fullName: "Greg Gilfillan", cometId: "1393250", firstAider: true, conduct: "2026-03-08",
            wellbeing: "2028-12", mental: "2028-12", selfDec: "2026-12", q11: true,
            badgeExpiry: "2029-12", firstAidExp: "2029-05", pvgType: "Adult", pvg: "2029-01" },
  chris:  { fullName: "Christopher Smith", cometId: "1402665", coach: true, conduct: "2026-03-08",
            wellbeing: "2029-02", mental: "2029-02", selfDec: "2027-03", q11: true,
            badgeExpiry: "2029-12", pvgType: "Child", pvg: "2029-02" },
  jenna:  { fullName: "Jenna Kirk", cometId: "1400662", secretary: true, conduct: "2026-03-08",
            wellbeing: "2029-01", mental: "2029-01", selfDec: "2027-02",
            firstAidExp: "2029-05", pvgType: "Adult", pvg: "2029-02" },
  steven: { fullName: "Stephen Pollock", cometId: "1400665", coach: true, conduct: "2026-03-08",
            wellbeing: "2029-01", mental: "2029-01", selfDec: "2027-02", q11: true,
            badgeExpiry: "2029-12", firstAidExp: "2029-05", pvgType: "Adult", pvg: "2029-02" },
  arron:  { fullName: "Arran Gardiner", cometId: "982635", headCoach: true, firstAider: true,
            conduct: "2026-03-13", wellbeing: "2029-03", mental: "2029-05", selfDec: "2026-11",
            q11: true, q12c: true, badgeExpiry: "2029-12", firstAidExp: "2026-10",
            pvgType: "Adult", pvg: "2028-11" },
  davie:  { fullName: "David Ralston", cometId: "1256174", coach: true,
            wellbeing: "2028-02", mental: "2027-02", selfDec: "2027-06",
            pvgType: "Adult", pvg: "2029-06" },
};

// Rows already saved under the old column names get remapped once, so nobody
// has to retype anything. Firebase rejects undefined, hence delete.
const INFO_VERSION = 2;

function migrateInfo(d) {
  if (Number(d.infoVersion || 1) >= INFO_VERSION) return null;
  const info = {};
  for (const [id, raw] of Object.entries(d.info || {})) {
    const row = { ...raw };
    if (row.manager) row.headCoach = true;   // Manager became Head Coach
    delete row.manager;
    delete row.coach;                        // the old separate Coach column is gone
    if (row.helper) row.coach = true;        // Team Helper became Coach
    delete row.helper;
    if (!row.cometId && SEED[id]?.cometId) row.cometId = SEED[id].cometId;
    delete row.email; delete row.dob; delete row.phone;
    info[id] = row;
  }
  if (info.jenna) {
    info.jenna = { ...info.jenna, secretary: true };
    delete info.jenna.headCoach; delete info.jenna.coach; delete info.jenna.firstAider;
  }
  return { ...d, info, infoVersion: INFO_VERSION };
}

const monthLabel = (v) => {
  if (!v) return "";
  const [y, m] = String(v).split("-").map(Number);
  if (!y || !m) return "";
  return `${SHORT_MONTHS[m - 1]} ${String(y).slice(-2)}`;
};

const dateLabel = (v) => {
  if (!v) return "";
  const d = fromIso(v);
  if (isNaN(d)) return "";
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
};

// How close an expiry is, used for the colour and the summary counts.
function expiryState(v) {
  if (!v) return "missing";
  if (v < thisMonth) return "expired";
  const [y, m] = v.split("-").map(Number);
  const months = (y - Number(thisMonth.slice(0, 4))) * 12 + (m - Number(thisMonth.slice(5, 7)));
  return months <= 3 ? "soon" : "ok";
}

const infoFor = (id) => state.data.info?.[id] || {};

/* ---------------------------------------------------------------- storage */

// Two modes. With a Firebase config the squad shares one live database and
// changes appear on everyone's phone. Without one, the app falls back to this
// device only, so you can try it before setting Firebase up.
const store = {
  mode: "local",
  db: null, ref: null, fb: null,

  async start(onChange) {
    if (FIREBASE && FIREBASE.databaseURL) {
      try {
        const [{ initializeApp }, dbMod] = await Promise.all([
          import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
          import("https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js"),
        ]);
        this.fb = dbMod;
        const app = initializeApp(FIREBASE);
        this.db = dbMod.getDatabase(app);
        this.ref = dbMod.ref(this.db, DB_PATH);
        this.mode = "cloud";
        dbMod.onValue(this.ref, (snap) => onChange(normalise(snap.val())), () => {
          state.error = "Can't reach the database right now. Answers won't save until it's back.";
          render();
        });
        return;
      } catch (e) {
        console.error(e);
        state.error = "Couldn't connect to the database, so this is running on your device only.";
      }
    }
    let local = null;
    try { local = JSON.parse(localStorage.getItem(LOCAL_KEY)); } catch { /* first run */ }
    onChange(normalise(local));
  },

  // Firebase transactions merge two coaches answering at the same moment
  // instead of one overwriting the other.
  async apply(updater) {
    if (this.mode === "cloud") {
      try {
        await this.fb.runTransaction(this.ref, (current) => updater(normalise(current)));
      } catch (e) {
        console.error(e);
        state.error = "That didn't save. Check your connection and try again.";
        render();
      }
    } else {
      state.data = updater(normalise(state.data));
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(state.data)); } catch { /* private mode */ }
      render();
    }
  },
};

// Firebase drops empty objects and arrays, so put the shape back every time.
function normalise(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  const sessions = Array.isArray(d.sessions) ? d.sessions : Object.values(d.sessions || {});
  const tr = d.trophy || {};
  const list = (x) => (Array.isArray(x) ? x : Object.values(x || {})).filter(Boolean);
  return { sessions: sessions.filter(Boolean), responses: d.responses || {}, info: d.info || {},
           trophy: { players: list(tr.players), awards: list(tr.awards) },
           infoVersion: d.infoVersion || 1,
           teamMoves: list(d.teamMoves), teams: list(d.teams), teamsSet: Boolean(d.teamsSet) };
}

/* ------------------------------------------------------------------ state */

const state = {
  data: { sessions: [], responses: {} },
  meId: null,
  ready: false,
  error: "",
  gateError: "",
  entry: "",
  view: "calendar",
  cursor: { y: new Date().getFullYear(), m: new Date().getMonth() },
  selected: today,
  adding: false,
  editingId: null,
  confirmingId: null,
  form: null,
  infoEditing: null,
  infoForm: null,
  trophyForm: null,
  trophyNew: "",
  trophyConfirm: null,
  trophyPlayerConfirm: null,
  teamMoving: null,
  teamNew: "",
  teamRemove: null,
  teamHistory: false,
  teamDelete: null,
  teamNewName: "",
  teamNewColour: "green",
  teamMsg: "",
  bdayManage: false,
  bdayNew: { name: "", d: "", m: "" },
  bdayPaste: "",
  bdayMsg: "",
};

const app = document.getElementById("app");

/* --------------------------------------------------------------- rendering */

const coverOf = (id) => {
  const yes = Object.values(state.data.responses[id] || {}).filter((a) => answerOf(a) === "yes").length;
  return yes >= COVERED_AT ? "ok" : yes === 1 ? "thin" : "none";
};
const coverColour = (id) => ({ ok: "var(--green)", thin: "var(--ink)", none: "var(--red)" }[coverOf(id)]);

const sessionsOn = (date) =>
  state.data.sessions.filter((s) => s.date === date).sort((a, b) => (a.time || "").localeCompare(b.time || ""));

function render() {
  const focus = captureFocus();
  app.className = state.meId ? "ca" : "ca gate";
  app.innerHTML = !state.ready ? loadingHtml() : state.meId ? mainHtml() : gateHtml();
  restoreFocus(focus);
}

const loadingHtml = () => `<div class="wrap"><p class="note" style="margin-top:60px">Opening the diary…</p></div>`;

function gateHtml() {
  return `
  <div class="gatebox">
    <img class="gatecrest" src="${BADGE}" alt="${esc(CLUB)} Football Club badge" />
    <h1>${esc(CLUB)}</h1>
    <div class="sub"><b>${esc(SQUAD)}</b> Coach Availability</div>
    <div class="rule"></div>
    <p>Enter your name to get in. Only the coaches on the list can use the app, and everything inside is shared with all of them.</p>
    <div class="form" style="background:transparent;border:0;padding:0">
      <label for="name">Your name</label>
      <input id="name" autocomplete="off" placeholder="e.g. ${esc(COACHES[0]?.name || "Chris")}" value="${esc(state.entry)}" />
      ${state.gateError ? `<div class="err" style="margin-top:12px;margin-bottom:0;text-align:left">${esc(state.gateError)}</div>` : ""}
      <div class="actions"><button class="primary" data-act="signin">Go in</button></div>
    </div>
    ${store.mode === "local" ? `<p class="note" style="margin-top:22px">Running on this device only — add your Firebase details to share with the squad.</p>` : ""}
  </div>`;
}

function mainHtml() {
  const me = coachById(state.meId);
  return `
  <header class="top">
    <img class="watermark" src="${BADGE}" alt="" aria-hidden="true" />
    <div class="wrap toprow">
      <img class="crest" src="${BADGE}" alt="${esc(CLUB)} Football Club badge" />
      <div class="club">
        <h1>${esc(CLUB)}</h1>
        <div class="sub"><b>${esc(SQUAD)}</b> Coach Availability</div>
      </div>
      <button class="who" data-act="signout" title="Sign out">
        <span class="chip">${esc(me.initial)}</span>
        <span class="name">${esc(me.name)}</span>
      </button>
    </div>
  </header>

  <div class="wrap">
    ${state.error ? `<div class="err">${esc(state.error)}</div>` : ""}
    <div class="tabs">
      <button class="tab" data-act="view" data-view="calendar" data-on="${state.view === "calendar"}">Calendar</button>
      <button class="tab" data-act="view" data-view="list" data-on="${state.view === "list"}">Upcoming</button>
      <button class="tab" data-act="view" data-view="teams" data-on="${state.view === "teams"}">Teams</button>
      <button class="tab" data-act="view" data-view="info" data-on="${state.view === "info"}"><span class="lg">Coach Info</span><span class="sm">Info</span></button>
      <button class="tab" data-act="view" data-view="trophy" data-on="${state.view === "trophy"}"><span class="lg">Endeavour Trophy</span><span class="sm">Trophy</span></button>
    </div>
    ${state.view === "calendar" ? calendarHtml() + (state.bdayManage ? "" : bdayStripHtml()) + dayPanelHtml() : state.view === "list" ? listHtml() : state.view === "teams" ? teamsHtml() : state.view === "info" ? infoHtml() : trophyHtml()}
    <p class="note">
      ${store.mode === "cloud" ? "Shared with every coach on the list. Answers save the moment you tap them." : "Saving on this device only — add your Firebase details to share with the squad."}
      <br /><button class="linkish" data-act="reload">Reload</button>
    </p>
  </div>`;
}

function calendarHtml() {
  const { y, m } = state.cursor;
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(iso(new Date(y, m, d)));
  while (cells.length % 7 !== 0) cells.push(null);

  return `
  <div class="cal">
    <div class="calhead">
      <div class="month">${MONTHS[m]} <b>${y}</b></div>
      <div class="nav">
        <button class="navbtn" data-act="month" data-step="-1" aria-label="Previous month">&lsaquo;</button>
        <button class="navbtn" data-act="month" data-step="1" aria-label="Next month">&rsaquo;</button>
      </div>
    </div>
    <div class="dow">${WEEKDAYS.map((d) => `<div>${d[0]}</div>`).join("")}</div>
    <div class="grid">
      ${cells.map((day, i) => {
        if (!day) return `<button class="cell" disabled></button>`;
        const bars = sessionsOn(day).slice(0, 3)
          .map((s) => `<div class="bar" style="background:${coverColour(s.id)}"></div>`).join("");
        const cake = birthdaysOn(day).length ? `<span class="cellcake">${CAKE}</span>` : "";
        return `<button class="cell" data-act="day" data-date="${day}"
          data-sel="${day === state.selected}" data-today="${day === today}">${cake}${Number(day.slice(-2))}
          <div class="bars">${bars}</div></button>`;
      }).join("")}
    </div>
    <div class="legend">
      <span><i style="background:var(--green)"></i>${COVERED_AT}+ coaches in</span>
      <span><i style="background:var(--ink)"></i>1 coach in</span>
      <span><i style="background:var(--red)"></i>nobody yet</span>
      <button class="legendlink" data-act="bday-open">${CAKE}Birthdays</button>
    </div>
  </div>`;
}

function dayPanelHtml() {
  if (state.bdayManage) return bdayManageHtml();
  const list = sessionsOn(state.selected);
  return `
  <div class="panel">
    <div class="panelhead">
      <div class="daytitle">${longDate(state.selected)}</div>
      <button class="add" data-act="add-open">+ Session</button>
    </div>
    ${birthdaysOn(state.selected).map((p) => `
      <div class="bdayline">${CAKE}<span>Happy birthday, <b>${esc(p.name)}</b>!</span></div>`).join("")}
    ${state.adding ? formHtml(null) : ""}
    ${list.map(cardHtml).join("")}
    ${!state.adding && list.length === 0
      ? `<div class="empty">Nothing on this day. Add a session or game and the coaches can start answering.</div>` : ""}
  </div>`;
}

function listHtml() {
  const upcoming = state.data.sessions
    .filter((s) => s.date >= today)
    .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
  return `
  <div class="panel">
    <div class="panelhead">
      <div class="daytitle">Next up</div>
      <button class="add" data-act="add-open">+ Session</button>
    </div>
    ${bdayStripHtml()}
    ${upcoming.map((s) => cardHtml(s, true)).join("")}
    ${upcoming.length === 0 ? `<div class="empty">Nothing in the diary yet. Add your next training session or game.</div>` : ""}
  </div>`;
}

/* --------------------------------------------------------------- birthdays */

// Birthdays sit on the same squad list as the Endeavour Trophy. Stored as
// "MM-DD" only — no year, so no ages or full dates of birth are kept.
const CAKE = `<svg class="cakeicon" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 1.6c1.3 1.5 1.3 2.8 0 3.7-1.3-.9-1.3-2.2 0-3.7z" fill="#F2A516"/>
  <rect x="11.2" y="5.4" width="1.6" height="4.2" rx=".5" fill="#101012"/>
  <rect x="4.2" y="9.6" width="15.6" height="4.6" rx="1.4" fill="#DE1E2D"/>
  <rect x="3" y="13.6" width="18" height="7.6" rx="1.6" fill="#fff" stroke="#101012" stroke-width="1.4"/>
  <path d="M3.8 17c1.4 1 2.9 1 4.2 0s2.8-1 4 0 2.8 1 4 0 2.8-1 4.2 0" fill="none" stroke="#DE1E2D" stroke-width="1.3"/>
</svg>`;

const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const squad = () => [...(state.data.trophy?.players || [])];

const bdayLabel = (b) => {
  if (!b) return "";
  const [m, d] = b.split("-").map(Number);
  return `${d} ${SHORT_MONTHS[m - 1]}`;
};

// A 29 Feb birthday is celebrated on the 28th in non-leap years.
const bdayMatches = (b, date) => {
  if (!b) return false;
  const md = date.slice(5);
  if (b === md) return true;
  return b === "02-29" && md === "02-28" && !isLeap(Number(date.slice(0, 4)));
};

const birthdaysOn = (date) => squad().filter((p) => bdayMatches(p.bday, date)).sort(byName);

function birthdaysAhead(days) {
  const out = [];
  const start = fromIso(today);
  for (let i = 0; i <= days; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    for (const p of birthdaysOn(iso(d))) out.push({ p, date: iso(d), inDays: i });
  }
  return out;
}

function bdayStripHtml() {
  const soon = birthdaysAhead(14);
  if (!soon.length) return "";
  return `
  <div class="bdaystrip">
    ${CAKE}
    <div class="bdaylist">
      <span class="bdayhead">Birthdays coming up</span>
      ${soon.map(({ p, date, inDays }) => `<span class="bdayitem"><b>${esc(p.name)}</b> ${
        inDays === 0 ? "today!" : inDays === 1 ? "tomorrow" : esc(longDate(date))}</span>`).join("")}
    </div>
  </div>`;
}

// "Jamie 14 March", "Ava - 3/11", "Leo: 21st Jan", "Mia 1.6.2019" → name + MM-DD.
// Any year given is dropped.
const MONTH_WORDS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
function parseBdayLine(line) {
  const text = line.trim();
  if (!text) return null;
  let m, day, month, name;
  if ((m = text.match(/^(.*?)[\s,:\-–]*(\d{1,2})(?:st|nd|rd|th)?\s*[\/.\-]\s*(\d{1,2})(?:\s*[\/.\-]\s*\d{2,4})?\s*$/i))) {
    [, name, day, month] = m;
  } else if ((m = text.match(/^(.*?)[\s,:\-–]*(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3,})\.?(?:,?\s+\d{4})?\s*$/i))) {
    [, name, day] = m; month = MONTH_WORDS.indexOf(m[3].slice(0, 3).toLowerCase()) + 1;
  } else if ((m = text.match(/^(.*?)[\s,:\-–]*([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+\d{4})?\s*$/i))) {
    name = m[1]; month = MONTH_WORDS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1; day = m[3];
  } else return { error: text };
  day = Number(day); month = Number(month);
  name = String(name || "").replace(/[\s,:\-–]+$/, "").trim();
  if (!name || !month || month > 12 || !day || day > MONTH_DAYS[month - 1]) return { error: text };
  return { name, bday: `${pad(month)}-${pad(day)}` };
}

function bdayManageHtml() {
  const players = squad().sort(byName);
  const n = state.bdayNew;
  const dayOpts = (sel) => `<option value="">Day</option>` +
    Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}"${Number(sel) === i + 1 ? " selected" : ""}>${i + 1}</option>`).join("");
  const monOpts = (sel) => `<option value="">Month</option>` +
    SHORT_MONTHS.map((mn, i) => `<option value="${i + 1}"${Number(sel) === i + 1 ? " selected" : ""}>${mn}</option>`).join("");

  return `
  <div class="panel">
    <div class="panelhead">
      <div class="daytitle">Birthdays</div>
      <button class="add" data-act="bday-close">Done</button>
    </div>

    <div class="form bdays">
      ${players.length ? players.map((p) => {
        const [bm, bd] = p.bday ? p.bday.split("-").map(Number) : ["", ""];
        return `
        <div class="brow" data-id="${p.id}">
          <span class="bname">${p.bday ? CAKE : ""}${esc(p.name)}</span>
          <select data-bday="d" aria-label="Day">${dayOpts(bd)}</select>
          <select data-bday="m" aria-label="Month">${monOpts(bm)}</select>
          ${p.bday ? `<button class="mini" data-danger="true" data-act="bday-clear" data-id="${p.id}" aria-label="Clear">✕</button>` : `<span class="bspacer"></span>`}
        </div>`;
      }).join("") : `<p class="field-hint" style="margin:6px 0 0">No kids on the list yet — add them below.</p>`}

      <div class="grouphead">Add a player</div>
      <div class="brow">
        <input id="b-name" value="${esc(n.name)}" placeholder="First name or initials" autocomplete="off" />
        <select id="b-d" aria-label="Day">${dayOpts(n.d)}</select>
        <select id="b-m" aria-label="Month">${monOpts(n.m)}</select>
      </div>
      <div class="actions"><button class="primary" data-act="bday-add">Add</button></div>

      <div class="grouphead">Paste a list</div>
      <textarea id="b-paste" rows="5" placeholder="One per line, e.g.&#10;Jamie 14 March&#10;Ava 3/11&#10;Leo - 21st Jan">${esc(state.bdayPaste)}</textarea>
      <div class="actions"><button class="primary" data-act="bday-import">Add list</button></div>
      ${state.bdayMsg ? `<div class="bdaymsg">${state.bdayMsg}</div>` : ""}

      <div class="field-hint">Day and month only — no year, so no ages are stored. Kids added here also join the Endeavour Trophy rotation. Visible to anyone with the app link, so keep to first names or initials.</div>
    </div>
  </div>`;
}

const setBday = (id, bday) => store.apply((d) => ({ ...d, trophy: { ...d.trophy,
  players: d.trophy.players.map((p) => {
    if (p.id !== id) return p;
    const next = { ...p };
    if (bday) next.bday = bday; else delete next.bday;
    return next;
  }) } }));

function addBdayPlayer() {
  const { name, d, m } = state.bdayNew;
  const clean = String(name || "").trim();
  if (!clean) { state.bdayMsg = "Type a name first."; return render(); }
  let bday = null;
  if (d && m) {
    if (Number(d) > MONTH_DAYS[Number(m) - 1]) { state.bdayMsg = "That date doesn't exist."; return render(); }
    bday = `${pad(m)}-${pad(d)}`;
  }
  const existing = squad().find((p) => p.name.toLowerCase() === clean.toLowerCase());
  if (existing) {
    if (bday) setBday(existing.id, bday);
  } else {
    const player = { id: uid(), name: clean, ...(bday ? { bday } : {}) };
    store.apply((dd) => ({ ...dd, trophy: { ...dd.trophy, players: [...dd.trophy.players, player] } }));
  }
  state.bdayNew = { name: "", d: "", m: "" };
  state.bdayMsg = existing ? `Updated ${esc(existing.name)}.` : `Added ${esc(clean)}.`;
  render();
}

function importBdays() {
  const lines = String(state.bdayPaste || "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return;
  const parsed = lines.map(parseBdayLine).filter(Boolean);
  const good = parsed.filter((x) => !x.error);
  const bad = parsed.filter((x) => x.error);
  // Count against the list as it stands now, before the save lands.
  const known = new Set(squad().map((p) => p.name.toLowerCase()));
  const added = good.filter((g) => !known.has(g.name.toLowerCase())).length;
  const updated = good.length - added;
  store.apply((d) => {
    const players = [...d.trophy.players];
    for (const { name, bday } of good) {
      const i = players.findIndex((p) => p.name.toLowerCase() === name.toLowerCase());
      if (i >= 0) players[i] = { ...players[i], bday };
      else players.push({ id: uid(), name, bday });
    }
    return { ...d, trophy: { ...d.trophy, players } };
  });
  state.bdayPaste = bad.map((b) => b.error).join("\n");
  state.bdayMsg = [
    added ? `Added ${added}.` : "",
    updated ? `Updated ${updated}.` : "",
    bad.length ? `Couldn't read ${bad.length} line${bad.length > 1 ? "s" : ""} — left in the box to fix.` : "",
  ].filter(Boolean).join(" ");
  render();
}

/* ------------------------------------------------------------------ teams */

// Bib colours only on screen. What each one means is the coaches' business,
// not something a child or a passing parent should read off a phone.
// Teams are stored data, not fixed in the code. Colours come from this palette
// so a new team styles itself without any new CSS.
const PALETTE = {
  red:    { label: "Red",    bar: "#DE1E2D", bg: "#FCEBEB", ink: "#6E1B1B", line: "#F2C9C9", dot: "#DE1E2D" },
  blue:   { label: "Blue",   bar: "#2E6DB4", bg: "#E9F1FA", ink: "#16416E", line: "#C6DAF0", dot: "#2E6DB4" },
  white:  { label: "White",  bar: "#9A9AA2", bg: "#FFFFFF", ink: "#101012", line: "#DEDEE1", dot: "#FFFFFF" },
  green:  { label: "Green",  bar: "#1E8A4B", bg: "#E8F4EC", ink: "#145130", line: "#C2E2CF", dot: "#1E8A4B" },
  amber:  { label: "Amber",  bar: "#B9761B", bg: "#FBF3E6", ink: "#6E4510", line: "#EFD9B6", dot: "#B9761B" },
  purple: { label: "Purple", bar: "#6B4FB8", bg: "#EFEBFA", ink: "#3C2C72", line: "#D5CBF0", dot: "#6B4FB8" },
  teal:   { label: "Teal",   bar: "#17807A", bg: "#E4F2F1", ink: "#0D4A47", line: "#BCDFDD", dot: "#17807A" },
  black:  { label: "Black",  bar: "#101012", bg: "#EFEFF0", ink: "#101012", line: "#CFCFD3", dot: "#101012" },
};
const DEFAULT_TEAMS = [
  { id: "red", name: "Red", colour: "red" },
  { id: "blue", name: "Blue", colour: "blue" },
  { id: "white", name: "White", colour: "white" },
];
const NO_TEAM = { bar: "#C4C4CA", bg: "#FFFFFF", ink: "#4A4A50", line: "#C4C4CA", dot: "#C4C4CA" };

const teams = () => (state.data.teamsSet ? (state.data.teams || []) : DEFAULT_TEAMS);
const teamById = (id) => teams().find((t) => t.id === id);
const teamName = (id) => teamById(id)?.name || "No team";
const paint = (id) => PALETTE[teamById(id)?.colour] || NO_TEAM;

function teamsHtml() {
  const list = teams();
  const players = squad().sort(byName);
  const inTeam = (id) => players.filter((p) => (p.team || "") === id);
  const unassigned = players.filter((p) => !p.team || !list.some((t) => t.id === p.team));
  const moves = [...(state.data.teamMoves || [])]
    .sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, state.teamHistory ? 40 : 6);
  const nameOf = (id) => players.find((p) => p.id === id)?.name || "Removed player";
  const dot = (id) => `<i class="tdot" style="background:${paint(id).dot};${
    paint(id).dot === "#FFFFFF" ? "box-shadow:inset 0 0 0 1.5px #7A8B95" : ""}"></i>`;

  const chip = (p) => {
    const c = paint(p.team || "");
    return `<button class="tchip" data-act="team-move-open" data-id="${p.id}" data-drag="${p.id}"
      style="background:${c.bg};color:${c.ink};border-color:${c.line}${p.team ? "" : ";border-style:dashed"}">${esc(p.name)}</button>`;
  };

  const band = (t) => {
    const c = t ? paint(t.id) : NO_TEAM;
    const members = t ? inTeam(t.id) : unassigned;
    return `
    <div class="band" data-band="${t ? t.id : ""}" style="border-left-color:${c.bar}${t ? "" : ";border-style:dashed;border-left-style:solid"}">
      <div class="bandhead">
        <span class="bandname" style="color:${t ? c.bar : "#7A8B95"}">${esc(t ? t.name : "Not in a team")}</span>
        <span class="bandcount">${members.length}${t ? ` player${members.length === 1 ? "" : "s"}` : ""}</span>
      </div>
      <div class="chips">
        ${members.map(chip).join("") || `<span class="bandempty">${t ? "Drop a name here" : "Everyone's placed"}</span>`}
      </div>
    </div>`;
  };

  return `
  <div class="panel">
    <div class="panelhead">
      <div class="daytitle">Teams</div>
      <span class="hint-inline">Drag a name, or tap to move</span>
    </div>

    ${state.teamMoving ? moveSheetHtml(players) : ""}

    ${list.map(band).join("")}
    ${band(null)}

    ${moves.length ? `
      <div class="grouplabel" style="margin-top:20px">Recent moves</div>
      <div class="history">
        ${moves.map((m) => `
          <div class="hrow">
            <span class="hdate">${esc(shortDay(m.date))}</span>
            <span class="hname">${esc(nameOf(m.playerId))}</span>
            <span class="hmove">${dot(m.from)}${esc(teamName(m.from))} → ${dot(m.to)}${esc(teamName(m.to))}</span>
          </div>`).join("")}
      </div>
      ${state.data.teamMoves?.length > 6
        ? `<button class="linkish" data-act="team-history" style="margin-top:8px">${state.teamHistory ? "Show fewer" : `Show all ${state.data.teamMoves.length}`}</button>` : ""}
    ` : ""}

    <div class="grouplabel" style="margin-top:20px">Set up teams</div>
    <div class="form squad">
      ${list.map((t) => {
        const n = inTeam(t.id).length;
        return `
        <div class="srow">
          <span class="sname">${dot(t.id)}${esc(t.name)}<em class="scount">${n} player${n === 1 ? "" : "s"}</em></span>
          ${state.teamDelete === t.id
            ? `<span><button class="mini" data-danger="true" data-act="team-delete" data-id="${t.id}">Confirm remove</button>
               <button class="mini" data-act="team-delete-cancel">Keep</button></span>`
            : `<button class="mini" data-danger="true" data-act="team-delete-open" data-id="${t.id}">Remove</button>`}
        </div>
        ${state.teamDelete === t.id && n
          ? `<div class="field-hint" style="margin:0 0 8px">${n} player${n === 1 ? "" : "s"} will move to "Not in a team". Nobody is deleted.</div>` : ""}`;
      }).join("")}
      <div class="addrow">
        <input id="team-newteam" value="${esc(state.teamNewName)}" placeholder="Team name" autocomplete="off" />
        <select id="team-newcolour">
          ${Object.entries(PALETTE).map(([k, v]) =>
            `<option value="${k}"${k === state.teamNewColour ? " selected" : ""}>${esc(v.label)}</option>`).join("")}
        </select>
        <button class="primary" data-act="team-add">Add</button>
      </div>
      ${state.teamMsg ? `<div class="field-hint" style="color:var(--red)">${esc(state.teamMsg)}</div>` : ""}
    </div>

    <div class="grouplabel" style="margin-top:20px">Squad list</div>
    <div class="form squad">
      ${players.map((p) => `
        <div class="srow">
          <span class="sname">${dot(p.team || "")}${esc(p.name)}</span>
          ${state.teamRemove === p.id
            ? `<span><button class="mini" data-danger="true" data-act="team-player-remove" data-id="${p.id}">Confirm remove</button>
               <button class="mini" data-act="team-player-cancel">Keep</button></span>`
            : `<button class="mini" data-danger="true" data-act="team-player-open" data-id="${p.id}">Remove</button>`}
        </div>`).join("")}
      <div class="addrow">
        <input id="team-newplayer" value="${esc(state.teamNew)}" placeholder="First name or initials" autocomplete="off" />
        <button class="primary" data-act="team-player-add">Add</button>
      </div>
      <div class="field-hint">This is the master squad list — it drives the Endeavour Trophy and birthdays too. Removing someone here removes them from both. Visible to anyone with the app link, so keep it to first names or initials.</div>
    </div>
  </div>`;
}

function moveSheetHtml(players) {
  const p = players.find((x) => x.id === state.teamMoving);
  if (!p) return "";
  const btn = (id, label, on) => {
    const c = paint(id);
    return `<button class="movebtn" data-act="team-set" data-id="${p.id}" data-team="${id}"
      style="border-color:${c.bar};color:${on ? "#fff" : c.bar}${on ? `;background:${c.bar}` : ""}"${on ? ' data-on="true"' : ""}>${esc(label)}</button>`;
  };
  return `
  <div class="form movesheet">
    <div class="movename">Move <b>${esc(p.name)}</b> to</div>
    <div class="movebtns">
      ${teams().map((t) => btn(t.id, t.name, p.team === t.id)).join("")}
      ${btn("", "None", !p.team)}
    </div>
    <div class="actions"><button class="ghost" data-act="team-move-cancel">Cancel</button></div>
  </div>`;
}

function addTeam() {
  const name = String(state.teamNewName || "").trim();
  if (!name) { state.teamMsg = "Give the team a name."; return render(); }
  if (teams().some((t) => t.name.toLowerCase() === name.toLowerCase())) {
    state.teamMsg = "There's already a team with that name."; return render();
  }
  const team = { id: uid(), name, colour: state.teamNewColour || "red" };
  const current = teams();
  store.apply((d) => ({ ...d, teamsSet: true, teams: [...(d.teamsSet ? d.teams || [] : current), team] }));
  state.teamNewName = "";
  state.teamMsg = "";
  render();
}

// Removing a team never deletes players — they drop back to "Not in a team",
// and each move is logged so the history still makes sense.
function deleteTeam(id) {
  const current = teams();
  const affected = squad().filter((p) => p.team === id);
  const moves = affected.map((p) => ({
    id: uid(), playerId: p.id, from: id, to: "", date: today, at: Date.now(),
  }));
  store.apply((d) => ({
    ...d,
    teamsSet: true,
    teams: (d.teamsSet ? d.teams || [] : current).filter((t) => t.id !== id),
    trophy: { ...d.trophy, players: d.trophy.players.map((p) => {
      if (p.team !== id) return p;
      const next = { ...p };
      delete next.team;
      return next;
    }) },
    teamMoves: [...(d.teamMoves || []), ...moves].slice(-200),
  }));
  state.teamDelete = null;
  render();
}

function setTeam(id, team) {
  const player = squad().find((p) => p.id === id);
  if (!player) return;
  const from = player.team || "";
  if (from === team) { state.teamMoving = null; return render(); }
  const move = { id: uid(), playerId: id, from, to: team, date: today, at: Date.now() };
  store.apply((d) => ({
    ...d,
    trophy: { ...d.trophy, players: d.trophy.players.map((p) => {
      if (p.id !== id) return p;
      const next = { ...p };
      if (team) next.team = team; else delete next.team;
      return next;
    }) },
    teamMoves: [...(d.teamMoves || []), move].slice(-200),
  }));
  state.teamMoving = null;
  render();
}

function addTeamPlayer() {
  const name = String(state.teamNew || "").trim();
  if (!name) return;
  if (squad().some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    state.teamNew = "";
    return render();
  }
  const player = { id: uid(), name };
  store.apply((d) => ({ ...d, trophy: { ...d.trophy, players: [...d.trophy.players, player] } }));
  state.teamNew = "";
  render();
}

// Removing from the master list clears their trophy awards and team history too.
const removeTeamPlayer = (id) => store.apply((d) => ({
  ...d,
  trophy: {
    players: d.trophy.players.filter((p) => p.id !== id),
    awards: d.trophy.awards.filter((a) => a.playerId !== id),
  },
  teamMoves: (d.teamMoves || []).filter((m) => m.playerId !== id),
}));

/* --- dragging ------------------------------------------------------------
   HTML5 drag-and-drop doesn't fire on iOS at all, so this is pointer-based:
   it works the same with a finger or a mouse. A short press-and-move starts
   the drag; a plain tap falls through to the move sheet. */

const drag = { id: null, ghost: null, from: null, started: false, x: 0, y: 0, chip: null, justDropped: false };

function dragStart(e, chip) {
  drag.id = chip.dataset.drag;
  drag.chip = chip;
  drag.from = chip.closest("[data-band]")?.dataset.band ?? "";
  drag.started = false;
  drag.x = e.clientX; drag.y = e.clientY;
  chip.setPointerCapture?.(e.pointerId);
}

function dragMove(e) {
  if (!drag.id) return;
  if (!drag.started) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
    drag.started = true;
    const r = drag.chip.getBoundingClientRect();
    drag.ghost = drag.chip.cloneNode(true);
    drag.ghost.className = "tchip ghostchip";
    drag.ghost.style.width = `${r.width}px`;
    document.body.appendChild(drag.ghost);
    drag.chip.classList.add("lifting");
  }
  e.preventDefault();
  drag.ghost.style.left = `${e.clientX}px`;
  drag.ghost.style.top = `${e.clientY}px`;
  const over = dropUnder(e.clientX, e.clientY);
  for (const b of app.querySelectorAll("[data-band]")) b.classList.toggle("over", b === over);
}

function dropUnder(x, y) {
  if (drag.ghost) drag.ghost.style.display = "none";
  const el = document.elementFromPoint(x, y);
  if (drag.ghost) drag.ghost.style.display = "";
  return el?.closest("[data-band]") || null;
}

function dragEnd(e) {
  if (!drag.id) return;
  const wasDragging = drag.started;
  const band = wasDragging ? dropUnder(e.clientX, e.clientY) : null;
  const id = drag.id;
  drag.ghost?.remove();
  drag.chip?.classList.remove("lifting");
  for (const b of app.querySelectorAll("[data-band]")) b.classList.remove("over");
  Object.assign(drag, { id: null, ghost: null, from: null, started: false, chip: null });
  if (!wasDragging) return;          // a plain tap — the click handler deals with it
  drag.justDropped = true;           // stop the trailing click opening the move sheet
  setTimeout(() => { drag.justDropped = false; }, 350);
  if (band) setTeam(id, band.dataset.band);
  else render();                      // dropped outside: put the chip back
}

/* ------------------------------------------------------- coach info view */

function cellHtml(f, info) {
  const v = info[f.key];
  if (f.type === "tick") {
    return v
      ? `<td class="c-tick" data-yes="true"><span>✓</span></td>`
      : `<td class="c-tick"><span>–</span></td>`;
  }
  if (f.type === "month") {
    const st = expiryState(v);
    return `<td class="c-exp" data-exp="${st}">${v ? esc(monthLabel(v)) : "—"}</td>`;
  }
  if (f.type === "date") return `<td>${v ? esc(dateLabel(v)) : "—"}</td>`;
  if (f.type === "email") return v ? `<td><a href="mailto:${esc(v)}">${esc(v)}</a></td>` : `<td>—</td>`;
  if (f.type === "tel") return v ? `<td><a href="tel:${esc(String(v).replace(/\s+/g, ""))}">${esc(v)}</a></td>` : `<td>—</td>`;
  return `<td>${v ? esc(v) : "—"}</td>`;
}

function infoHtml() {
  if (state.infoEditing) return infoFormHtml();

  // One count per problem so the strip tells you what actually needs chasing.
  let expired = 0, soon = 0, missing = 0;
  for (const c of COACHES) {
    const info = infoFor(c.id);
    for (const k of EXPIRY_KEYS) {
      const st = expiryState(info[k]);
      if (st === "expired") expired++;
      else if (st === "soon") soon++;
      else if (st === "missing") missing++;
    }
  }

  const head = INFO_GROUPS.map((g) =>
    `<th class="grp" colspan="${g.fields.length}">${esc(g.label)}</th>`).join("");
  const sub = INFO_GROUPS.flatMap((g) => g.fields)
    .map((f) => `<th>${esc(f.head)}</th>`).join("");

  const rows = COACHES.map((c) => {
    const info = infoFor(c.id);
    const worst = EXPIRY_KEYS.map((k) => expiryState(info[k]));
    const flag = worst.includes("expired") ? "expired" : worst.includes("soon") ? "soon" : "ok";
    return `<tr>
      <th class="stick" data-flag="${flag}">
        <button class="rowname" data-act="info-edit" data-id="${c.id}">
          <span class="chip">${esc(c.initial)}</span>
          <span class="rn">${esc(info.fullName || c.name)}</span>
          <span class="pencil">Edit</span>
        </button>
      </th>
      ${INFO_FIELDS.map((f) => cellHtml(f, info)).join("")}
    </tr>`;
  }).join("");

  return `
  <div class="panel">
    <div class="panelhead">
      <div class="daytitle">Coach Info</div>
    </div>

    <div class="statstrip">
      <div class="stat" data-tone="${expired ? "bad" : "good"}"><b>${expired}</b><span>Expired</span></div>
      <div class="stat" data-tone="${soon ? "warn" : "good"}"><b>${soon}</b><span>Due in 3 months</span></div>
      <div class="stat"><b>${missing}</b><span>Not recorded</span></div>
    </div>

    <div class="scrollnote">Swipe the table sideways · tap a name to edit that row</div>

    <div class="tablewrap">
      <table class="ctable">
        <thead>
          <tr><th class="stick grp">Coach</th>${head}</tr>
          <tr><th class="stick sub">Name</th>${sub}</tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div class="legend">
      <span><i style="background:var(--green)"></i>more than 3 months left</span>
      <span><i style="background:var(--amber)"></i>within 3 months</span>
      <span><i style="background:var(--red)"></i>expired or not recorded</span>
    </div>
  </div>`;
}

function infoFormHtml() {
  const c = coachById(state.infoEditing);
  const f = state.infoForm || {};
  return `
  <div class="panel">
    <div class="panelhead">
      <div class="daytitle">${esc(f.fullName || c.name)}</div>
      <button class="add" data-act="info-cancel">Back</button>
    </div>
    <div class="form">
      <label for="i-fullName">Full name</label>
      <input id="i-fullName" data-info="fullName" value="${esc(f.fullName || c.name)}" />

      ${INFO_GROUPS.map((g) => `
        <div class="grouphead">${esc(g.label)}</div>
        ${g.fields.map((fd) => {
          const v = f[fd.key] ?? "";
          if (fd.type === "tick") return `
            <label class="check" style="margin:10px 0 0">
              <input type="checkbox" data-info="${fd.key}" ${f[fd.key] ? "checked" : ""} />
              <span>${esc(fd.head)}</span>
            </label>`;
          if (fd.type === "choice") return `
            <label for="i-${fd.key}">${esc(fd.head)}</label>
            <select id="i-${fd.key}" data-info="${fd.key}">
              ${fd.options.map((o) => `<option value="${esc(o)}"${o === v ? " selected" : ""}>${o ? esc(o) : "—"}</option>`).join("")}
            </select>`;
          const type = fd.type === "month" ? "month" : fd.type === "date" ? "date"
            : fd.type === "email" ? "email" : fd.type === "tel" ? "tel" : "text";
          return `
            <label for="i-${fd.key}">${esc(fd.head)}</label>
            <input id="i-${fd.key}" type="${type}" data-info="${fd.key}" value="${esc(v)}" />`;
        }).join("")}
      `).join("")}

      <div class="actions">
        <button class="primary" data-act="info-save">Save</button>
        <button class="ghost" data-act="info-cancel">Cancel</button>
      </div>
    </div>
  </div>`;
}

/* ------------------------------------------------------ endeavour trophy */

const trophyOf = () => state.data.trophy || { players: [], awards: [] };
const shortDay = (v) => { const d = fromIso(v); return isNaN(d) ? "" : `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`; };
const byName = (a, b) => a.name.localeCompare(b.name);

// Works the rounds out from the award log: a round closes once every player
// on the list has had the trophy, and the next award starts a new one.
function trophyRounds(t) {
  const live = new Set(t.players.map((p) => p.id));
  const awards = t.awards.filter((a) => live.has(a.playerId))
    .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.at || 0) - (b.at || 0));
  const rounds = [];
  let cur = {};
  for (const a of awards) {
    if (cur[a.playerId]) { rounds.push(cur); cur = {}; }
    cur[a.playerId] = a;
    if (live.size && Object.keys(cur).length >= live.size) { rounds.push(cur); cur = {}; }
  }
  rounds.push(cur);
  return rounds;
}

function trophyHtml() {
  const t = trophyOf();
  const players = [...t.players].sort(byName);
  const rounds = trophyRounds(t);
  const current = rounds[rounds.length - 1];
  const roundNo = rounds.length;
  const pending = players.filter((p) => !current[p.id]);
  const counts = {};
  for (const r of rounds) for (const id of Object.keys(r)) counts[id] = (counts[id] || 0) + 1;
  const nameOf = (id) => t.players.find((p) => p.id === id)?.name || "Removed player";
  const recent = [...t.awards].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.at || 0) - (a.at || 0)).slice(0, 8);

  const table = players.length ? `
    <div class="scrollnote">Swipe sideways for earlier rounds · tap Award to give it out</div>
    <div class="tablewrap">
      <table class="ctable ttable">
        <thead><tr>
          <th class="stick sub">Player</th>
          ${rounds.map((_, i) => `<th${i === roundNo - 1 ? ` class="now"` : ""}>Round ${i + 1}${i === roundNo - 1 ? " · now" : ""}</th>`).join("")}
          <th>Times</th>
        </tr></thead>
        <tbody>
          ${players.map((p) => `<tr>
            <th class="stick" data-flag="${current[p.id] ? "ok" : "soon"}"><span class="tname">${esc(p.name)}</span></th>
            ${rounds.map((r, i) => {
              const a = r[p.id];
              if (a) return `<td class="t-won"><span>✓</span><em>${esc(shortDay(a.date))}</em></td>`;
              if (i === roundNo - 1) return `<td class="t-pending"><button data-act="trophy-award-open" data-id="${p.id}">Award</button></td>`;
              return `<td class="t-none">–</td>`;
            }).join("")}
            <td class="t-count">${counts[p.id] || 0}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>` : "";

  return `
  <div class="panel">
    <div class="panelhead">
      <div class="daytitle">Endeavour Trophy</div>
      ${players.length ? `<button class="add" data-act="trophy-award-open">+ Award</button>` : ""}
    </div>

    ${state.trophyForm ? trophyFormHtml(players, current) : ""}

    ${players.length ? `
    <div class="statstrip">
      <div class="stat" data-tone="good"><b>${roundNo}</b><span>Round</span></div>
      <div class="stat"><b>${players.length - pending.length}/${players.length}</b><span>Had it</span></div>
      <div class="stat" data-tone="${pending.length ? "warn" : "good"}"><b>${pending.length}</b><span>Still to go</span></div>
    </div>

    ${roundNo > 1 && pending.length === players.length ? `
      <div class="roundnote">Round ${roundNo - 1} complete — everyone's had a turn. Round ${roundNo} starts with the next award.</div>` : ""}

    ${pending.length ? `
    <div class="stillto">
      <div class="grouplabel">Still to go this round</div>
      <div class="pchips">${pending.map((p) =>
        `<button class="pchip" data-act="trophy-award-open" data-id="${p.id}">${esc(p.name)}</button>`).join("")}</div>
    </div>` : ""}

    ${table}` : `
    <div class="empty">Add the squad below to start the rotation. First names or initials are plenty.</div>`}

    ${recent.length ? `
    <div class="grouplabel" style="margin-top:20px">Recent awards</div>
    <div class="history">
      ${recent.map((a) => `
        <div class="hrow">
          <span class="hdate">${esc(shortDay(a.date))}</span>
          <span class="hname">${esc(nameOf(a.playerId))}</span>
          ${state.trophyConfirm === a.id
            ? `<button class="mini" data-danger="true" data-act="trophy-remove" data-id="${a.id}">Confirm remove</button>
               <button class="mini" data-act="trophy-remove-cancel">Keep</button>`
            : `<button class="mini" data-danger="true" data-act="trophy-remove-open" data-id="${a.id}">Remove</button>`}
        </div>`).join("")}
    </div>` : ""}

    <div class="squadnote">The squad list lives in <button class="linkish" data-act="goto-teams">Teams</button> — add or remove players there and the rotation follows.</div>
  </div>`;
}

function trophyFormHtml(players, current) {
  const f = state.trophyForm;
  const pending = players.filter((p) => !current[p.id]);
  const done = players.filter((p) => current[p.id]);
  const opt = (p) => `<option value="${p.id}"${p.id === f.playerId ? " selected" : ""}>${esc(p.name)}</option>`;
  return `
  <div class="form">
    <label for="t-player">Who gets it</label>
    <select id="t-player" data-trophy="playerId">
      ${pending.length ? `<optgroup label="Still to go">${pending.map(opt).join("")}</optgroup>` : ""}
      ${done.length ? `<optgroup label="Already had it this round">${done.map(opt).join("")}</optgroup>` : ""}
    </select>
    <label for="t-date">Date</label>
    <input id="t-date" type="date" data-trophy="date" value="${esc(f.date)}" />
    <div class="actions">
      <button class="primary" data-act="trophy-award-save" ${f.playerId && f.date ? "" : "disabled"}>Give the trophy</button>
      <button class="ghost" data-act="trophy-award-cancel">Cancel</button>
    </div>
  </div>`;
}

function addPlayer() {
  const name = String(state.trophyNew || "").trim();
  if (!name) return;
  const player = { id: uid(), name };
  store.apply((d) => ({ ...d, trophy: { ...d.trophy, players: [...d.trophy.players, player] } }));
  state.trophyNew = "";
  render();
}

function saveAward() {
  const f = state.trophyForm;
  if (!f || !f.playerId || !f.date) return;
  const award = { id: uid(), playerId: f.playerId, date: f.date, at: Date.now() };
  store.apply((d) => ({ ...d, trophy: { ...d.trophy, awards: [...d.trophy.awards, award] } }));
  state.trophyForm = null;
  render();
}

function cardHtml(s, showDate) {
  if (state.editingId === s.id) return formHtml(s);

  const answers = state.data.responses[s.id] || {};
  const mine = answerOf(answers[state.meId]);
  const tally = { yes: 0, maybe: 0, no: 0 };
  for (const a of Object.values(answers)) { const v = answerOf(a); if (tally[v] !== undefined) tally[v] += 1; }
  const waiting = COACHES.length - (tally.yes + tally.maybe + tally.no);
  const notes = COACHES.map((c) => ({ c, n: noteOf(answers[c.id]) })).filter((x) => x.n);
  const when = s.time ? `${s.time}${s.endTime ? `–${s.endTime}` : ""}` : "Time TBC";

  return `
  <div class="card" data-cover="${coverOf(s.id)}">
    <div class="cardtop">
      <div>
        <div class="kind" data-k="${esc(s.kind)}">${s.kind === "match" ? "Game" : "Training"}${s.seriesId ? " <em>· weekly</em>" : ""}</div>
        <div class="title">${esc(s.title)}</div>
        <div class="meta">${showDate ? esc(longDate(s.date)) + " · " : ""}${esc(when)}${s.place ? " · " + esc(s.place) : ""}</div>
      </div>
      <div class="cardacts">
        <button class="mini" data-act="edit" data-id="${s.id}">Edit</button>
        <button class="mini" data-danger="true" data-act="remove-open" data-id="${s.id}">Remove</button>
      </div>
    </div>

    ${state.confirmingId === s.id ? `
    <div class="confirm">
      <p>Remove this session? Everyone's answers for it go too.</p>
      <div class="actions">
        <button class="danger" data-act="remove" data-id="${s.id}" data-scope="one">${s.seriesId ? "Just this one" : "Remove"}</button>
        ${s.seriesId ? `<button class="danger" data-act="remove" data-id="${s.id}" data-scope="series">This and all later</button>` : ""}
        <button class="ghost" data-act="remove-cancel">Keep</button>
      </div>
    </div>` : ""}

    <div class="seg">
      ${["yes", "maybe", "no"].map((v) => `
        <button class="segbtn" data-act="answer" data-id="${s.id}" data-v="${v}"
          data-on="${mine === v}" aria-pressed="${mine === v}">${v}</button>`).join("")}
    </div>

    ${mine ? `
    <div class="noteline">
      <input data-note="${s.id}" value="${esc(noteOf(answers[state.meId]))}"
        placeholder="Add a note — e.g. can only do the first half" />
    </div>` : ""}

    <div class="sheet">
      ${COACHES.map((c) => {
        const v = answerOf(answers[c.id]);
        return `<div class="chip"${v ? ` data-v="${v}"` : ""}${c.id === state.meId ? ` data-me="true"` : ""}
          title="${esc(c.name)} — ${v || "no answer yet"}">${esc(c.initial)}</div>`;
      }).join("")}
    </div>

    <div class="tally"><b>${tally.yes} in</b> · ${tally.maybe} maybe · ${tally.no} out${waiting > 0 ? ` · ${waiting} to answer` : ""}</div>

    ${notes.length ? `<div class="notes">${notes.map(({ c, n }) => `<div><b>${esc(c.name)}</b> — ${esc(n)}</div>`).join("")}</div>` : ""}
  </div>`;
}

function formHtml(session) {
  const f = state.form;
  if (!f) return "";
  const editing = Boolean(session);
  const badTimes = Boolean(f.time && f.endTime && f.endTime <= f.time);
  const weekCount = Math.min(Math.max(Number(f.weeks) || 1, 1), 52);
  const blocked = badTimes || !f.date;

  return `
  <div class="form">
    <div class="kindpick">
      <button data-act="kind" data-kind="training" data-on="${f.kind === "training"}">Training</button>
      <button data-act="kind" data-kind="match" data-on="${f.kind === "match"}">Game</button>
    </div>

    <label for="f-title">${f.kind === "match" ? "Opponent" : "What is it"}</label>
    <input id="f-title" data-field="title" value="${esc(f.title)}"
      placeholder="${f.kind === "match" ? "vs Blantyre Soccer Academy" : esc(SQUAD) + " training"}" />

    <label for="f-date">Date</label>
    <input id="f-date" type="date" data-field="date" value="${esc(f.date)}" />

    <div class="row">
      <div>
        <label for="f-start">${f.kind === "match" ? "Kick-off" : "Start"}</label>
        <input id="f-start" type="time" data-field="time" value="${esc(f.time)}" />
      </div>
      <div>
        <label for="f-end">Finish</label>
        <input id="f-end" type="time" data-field="endTime" value="${esc(f.endTime)}" />
      </div>
    </div>
    ${badTimes ? `<div class="hint">The finish time is before the start time.</div>` : ""}

    <label for="f-place">Where</label>
    <input id="f-place" data-field="place" value="${esc(f.place)}" placeholder="Pitch or venue" />

    ${!editing ? `
      <label class="check" style="margin:16px 0 0">
        <input type="checkbox" data-field="repeat" ${f.repeat ? "checked" : ""} />
        <span>Repeat weekly, same day and time</span>
      </label>
      ${f.repeat ? `
      <div class="weeks">
        <input type="number" min="1" max="52" data-field="weeks" value="${esc(f.weeks)}" />
        <span>weeks${f.date ? `, ending ${longDate(addWeeks(f.date, weekCount - 1))}` : ""}</span>
      </div>` : ""}
    ` : ""}

    ${editing && session.seriesId ? `
      <label class="check" style="margin:16px 0 0">
        <input type="checkbox" data-field="applyToSeries" ${f.applyToSeries ? "checked" : ""} />
        <span>Apply the name, time and venue to every later session in this weekly run</span>
      </label>` : ""}

    <div class="actions">
      <button class="primary" data-act="form-save" ${blocked ? "disabled" : ""}>${editing ? "Save changes" : "Add to calendar"}</button>
      <button class="ghost" data-act="form-cancel">Cancel</button>
    </div>
  </div>`;
}

/* ------------------------------------------------- keep typing in one place */

function captureFocus() {
  const el = document.activeElement;
  if (!el || !("value" in el) || !app.contains(el)) return null;
  const key = el.id ? `#${el.id}` : el.dataset.note ? `[data-note="${el.dataset.note}"]` : null;
  return key ? { key, start: el.selectionStart, end: el.selectionEnd } : null;
}

function restoreFocus(f) {
  if (!f) return;
  const el = app.querySelector(f.key);
  if (!el) return;
  el.focus();
  try { el.setSelectionRange(f.start, f.end); } catch { /* date and time inputs don't allow this */ }
}

/* ----------------------------------------------------------------- actions */

const blankForm = (date, session) => ({
  kind: session?.kind || "training",
  title: session?.title || "",
  date: session?.date || date,
  time: session?.time || "18:00",
  endTime: session?.endTime || plusHour(session?.time || "18:00"),
  endTouched: Boolean(session?.endTime),
  place: session?.place || "",
  repeat: false,
  weeks: 8,
  applyToSeries: false,
});

function signIn(typed) {
  const match = COACHES.find((c) => c.name.toLowerCase() === String(typed).trim().toLowerCase());
  if (!match) { state.gateError = "That name isn't on the coach list. Check the spelling and try again."; render(); return; }
  try { localStorage.setItem(ME_KEY, match.id); } catch { /* private mode */ }
  state.meId = match.id;
  state.gateError = "";
  state.entry = "";
  render();
}

const setAnswer = (id, v) => store.apply((d) => {
  const forSession = { ...(d.responses[id] || {}) };
  const current = forSession[state.meId];
  if (answerOf(current) === v) delete forSession[state.meId];
  else forSession[state.meId] = { v, note: noteOf(current) };
  return { ...d, responses: { ...d.responses, [id]: forSession } };
});

const setNote = (id, text) => store.apply((d) => {
  const forSession = { ...(d.responses[id] || {}) };
  const current = forSession[state.meId];
  if (!answerOf(current)) return d;
  forSession[state.meId] = { v: answerOf(current), note: String(text).trim() };
  return { ...d, responses: { ...d.responses, [id]: forSession } };
});

function saveForm() {
  const f = state.form;
  if (!f) return;
  const badTimes = Boolean(f.time && f.endTime && f.endTime <= f.time);
  if (badTimes || !f.date) return;

  const core = {
    kind: f.kind,
    title: f.title.trim() || (f.kind === "match" ? "Game" : "Training"),
    date: f.date, time: f.time, endTime: f.endTime, place: f.place.trim(),
  };

  if (state.editingId) {
    const id = state.editingId;
    const applyAll = f.applyToSeries;
    store.apply((d) => {
      const target = d.sessions.find((s) => s.id === id);
      if (!target) return d;
      const sessions = d.sessions.map((s) => {
        if (s.id === id) return { ...s, ...core };
        if (applyAll && target.seriesId && s.seriesId === target.seriesId && s.date >= target.date) {
          return { ...s, kind: core.kind, title: core.title, time: core.time, endTime: core.endTime, place: core.place };
        }
        return s;
      });
      return { ...d, sessions };
    });
  } else if (f.repeat) {
    const seriesId = uid();
    const count = Math.min(Math.max(Number(f.weeks) || 1, 1), 52);
    const fresh = Array.from({ length: count }, (_, i) => ({ ...core, id: uid(), seriesId, date: addWeeks(core.date, i) }));
    store.apply((d) => ({ ...d, sessions: [...d.sessions, ...fresh] }));
  } else {
    const one = { ...core, id: uid() };
    store.apply((d) => ({ ...d, sessions: [...d.sessions, one] }));
  }

  state.selected = core.date;
  state.adding = false;
  state.editingId = null;
  state.form = null;
  render();
}

const removeSession = (id, scope) => store.apply((d) => {
  const target = d.sessions.find((s) => s.id === id);
  if (!target) return d;
  const doomed = d.sessions.filter((s) =>
    s.id === id || (scope === "series" && target.seriesId && s.seriesId === target.seriesId && s.date >= target.date));
  const ids = new Set(doomed.map((s) => s.id));
  const responses = { ...d.responses };
  for (const key of ids) delete responses[key];
  return { ...d, sessions: d.sessions.filter((s) => !ids.has(s.id)), responses };
});

/* ------------------------------------------------------------------ events */

app.addEventListener("pointerdown", (e) => {
  const chip = e.target.closest("[data-drag]");
  if (chip && e.isPrimary) dragStart(e, chip);
});
app.addEventListener("pointermove", dragMove);
app.addEventListener("pointerup", dragEnd);
app.addEventListener("pointercancel", dragEnd);

app.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const { act, id, v, view, step, date, kind, scope } = btn.dataset;

  if (act === "signin") return signIn(document.getElementById("name")?.value || "");
  if (act === "signout") { try { localStorage.removeItem(ME_KEY); } catch {} state.meId = null; return render(); }
  if (act === "reload") return location.reload();
  if (act === "view") { state.view = view; state.confirmingId = null; return render(); }
  if (act === "month") {
    const d = new Date(state.cursor.y, state.cursor.m + Number(step), 1);
    state.cursor = { y: d.getFullYear(), m: d.getMonth() };
    return render();
  }
  if (act === "day") {
    state.bdayManage = false;
    state.selected = date; state.adding = false; state.editingId = null; state.confirmingId = null; state.form = null;
    return render();
  }
  if (act === "answer") return setAnswer(id, v);
  if (act === "info-edit") {
    state.infoEditing = id;
    state.infoForm = { fullName: coachById(id).name, ...infoFor(id) };
    return render();
  }
  if (act === "info-cancel") { state.infoEditing = null; state.infoForm = null; return render(); }
  if (act === "info-save") return saveInfo();
  if (act === "trophy-award-open") {
    const t = trophyOf();
    const rounds = trophyRounds(t);
    const current = rounds[rounds.length - 1];
    const firstPending = [...t.players].sort(byName).find((p) => !current[p.id]);
    state.trophyForm = { playerId: id || firstPending?.id || t.players[0]?.id || "", date: today };
    return render();
  }
  if (act === "trophy-award-cancel") { state.trophyForm = null; return render(); }
  if (act === "trophy-award-save") return saveAward();
  if (act === "trophy-remove-open") { state.trophyConfirm = id; return render(); }
  if (act === "trophy-remove-cancel") { state.trophyConfirm = null; return render(); }
  if (act === "trophy-remove") {
    state.trophyConfirm = null;
    return store.apply((d) => ({ ...d, trophy: { ...d.trophy, awards: d.trophy.awards.filter((a) => a.id !== id) } }));
  }
  if (act === "trophy-player-add") return addPlayer();
  if (act === "goto-teams") { state.view = "teams"; return render(); }
  if (act === "team-move-open") {
    if (drag.justDropped) return;
    state.teamMoving = id;
    return render();
  }
  if (act === "team-move-cancel") { state.teamMoving = null; return render(); }
  if (act === "team-set") return setTeam(id, btn.dataset.team);
  if (act === "team-history") { state.teamHistory = !state.teamHistory; return render(); }
  if (act === "team-add") return addTeam();
  if (act === "team-delete-open") { state.teamDelete = id; return render(); }
  if (act === "team-delete-cancel") { state.teamDelete = null; return render(); }
  if (act === "team-delete") return deleteTeam(id);
  if (act === "team-player-add") return addTeamPlayer();
  if (act === "team-player-open") { state.teamRemove = id; return render(); }
  if (act === "team-player-cancel") { state.teamRemove = null; return render(); }
  if (act === "team-player-remove") { state.teamRemove = null; return removeTeamPlayer(id); }
  if (act === "bday-open") { state.bdayManage = true; state.adding = false; state.editingId = null; state.bdayMsg = ""; return render(); }
  if (act === "bday-close") { state.bdayManage = false; state.bdayMsg = ""; return render(); }
  if (act === "bday-clear") return setBday(id, null);
  if (act === "bday-add") return addBdayPlayer();
  if (act === "bday-import") return importBdays();
  if (act === "trophy-player-open") { state.trophyPlayerConfirm = id; return render(); }
  if (act === "trophy-player-cancel") { state.trophyPlayerConfirm = null; return render(); }
  if (act === "trophy-player-remove") {
    state.trophyPlayerConfirm = null;
    // Their awards go too, so the rounds recalculate cleanly.
    return store.apply((d) => ({ ...d, trophy: {
      players: d.trophy.players.filter((p) => p.id !== id),
      awards: d.trophy.awards.filter((a) => a.playerId !== id),
    } }));
  }
  if (act === "add-open") {
    state.view = "calendar"; state.editingId = null; state.confirmingId = null;
    state.adding = true; state.form = blankForm(state.selected);
    return render();
  }
  if (act === "edit") {
    const s = state.data.sessions.find((x) => x.id === id);
    state.adding = false; state.confirmingId = null; state.editingId = id; state.form = blankForm(s.date, s);
    return render();
  }
  if (act === "kind") { state.form.kind = kind; return render(); }
  if (act === "form-cancel") { state.adding = false; state.editingId = null; state.form = null; return render(); }
  if (act === "form-save") return saveForm();
  if (act === "remove-open") { state.confirmingId = id; return render(); }
  if (act === "remove-cancel") { state.confirmingId = null; return render(); }
  if (act === "remove") { state.confirmingId = null; return removeSession(id, scope); }
});

// Form fields live in state so a remote update never wipes what's half typed.
app.addEventListener("input", (e) => {
  const el = e.target;
  if (el.id === "name") { state.entry = el.value; state.gateError = ""; return; }
  // Held in state, not re-rendered, so typing is never interrupted.
  if (el.id === "t-newplayer") { state.trophyNew = el.value; return; }
  if (el.id === "team-newplayer") { state.teamNew = el.value; return; }
  if (el.id === "team-newteam") { state.teamNewName = el.value; state.teamMsg = ""; return; }
  if (el.id === "b-name") { state.bdayNew.name = el.value; return; }
  if (el.id === "b-paste") { state.bdayPaste = el.value; return; }
  if (el.dataset.trophy && state.trophyForm) {
    state.trophyForm[el.dataset.trophy] = el.value;
    if (el.dataset.trophy === "date") render();
    return;
  }
  if (el.dataset.info && state.infoForm) {
    state.infoForm[el.dataset.info] = el.type === "checkbox" ? el.checked : el.value;
    return;
  }
  if (el.dataset.field && state.form) {
    const f = state.form;
    const field = el.dataset.field;
    const value = el.type === "checkbox" ? el.checked : el.value;
    f[field] = value;
    if (field === "time" && !f.endTouched) f.endTime = plusHour(value);
    if (field === "endTime") f.endTouched = true;
    // Only these change what the form shows; the rest just hold their value.
    if (["repeat", "date", "weeks", "time", "endTime"].includes(field)) render();
  }
});

app.addEventListener("change", (e) => {
  if (e.target.dataset.note !== undefined) setNote(e.target.dataset.note, e.target.value);
  if (e.target.id === "team-newcolour") state.teamNewColour = e.target.value;
  if (e.target.id === "b-d") state.bdayNew.d = e.target.value;
  if (e.target.id === "b-m") state.bdayNew.m = e.target.value;
  if (e.target.dataset.bday) {
    const row = e.target.closest(".brow");
    const d = row.querySelector('[data-bday="d"]').value;
    const m = row.querySelector('[data-bday="m"]').value;
    if (d && m && Number(d) <= MONTH_DAYS[Number(m) - 1]) setBday(row.dataset.id, `${pad(m)}-${pad(d)}`);
    else if (!d && !m) setBday(row.dataset.id, null);
  }
  if (e.target.dataset.trophy && state.trophyForm) {
    state.trophyForm[e.target.dataset.trophy] = e.target.value;
  }
  if (e.target.dataset.info && state.infoForm) {
    state.infoForm[e.target.dataset.info] = e.target.type === "checkbox" ? e.target.checked : e.target.value;
  }
});

function saveInfo() {
  const id = state.infoEditing;
  const f = state.infoForm || {};
  const row = { fullName: String(f.fullName || "").trim() };
  for (const fd of INFO_FIELDS) {
    const v = f[fd.key];
    if (fd.type === "tick") { if (v) row[fd.key] = true; }
    else if (v !== undefined && String(v).trim() !== "") row[fd.key] = String(v).trim();
  }
  store.apply((d) => ({ ...d, info: { ...d.info, [id]: row } }));
  state.infoEditing = null;
  state.infoForm = null;
  render();
}

app.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (e.target.id === "name") { e.preventDefault(); signIn(e.target.value); }
  if (e.target.id === "t-newplayer") { e.preventDefault(); addPlayer(); }
  if (e.target.id === "team-newplayer") { e.preventDefault(); addTeamPlayer(); }
  if (e.target.id === "team-newteam") { e.preventDefault(); addTeam(); }
  if (e.target.dataset.note !== undefined) { e.preventDefault(); e.target.blur(); }
});

/* -------------------------------------------------------------------- boot */

(async () => {
  try {
    const saved = localStorage.getItem(ME_KEY);
    if (saved && coachById(saved)) state.meId = saved;
  } catch { /* private mode */ }

  let seeded = false;
  await store.start((data) => {
    state.data = data;
    state.ready = true;
    render();
    // First run only: puts the club sheet's starting values in. Once every row
    // has been saved in the app, the SEED block above can be deleted.
    if (seeded) return;
    if (SEED && Object.keys(data.info || {}).length === 0) {
      seeded = true;
      const rows = {};
      for (const c of COACHES) if (SEED[c.id]) rows[c.id] = SEED[c.id];
      if (Object.keys(rows).length) {
        store.apply((d) => ({ ...d, info: { ...rows, ...d.info }, infoVersion: INFO_VERSION }));
      }
    } else if (Number(data.infoVersion || 1) < INFO_VERSION) {
      // Rows saved under the old column names — remap them once.
      seeded = true;
      store.apply((d) => migrateInfo(d) || d);
    }
  });

  state.ready = true;
  render();
})();
