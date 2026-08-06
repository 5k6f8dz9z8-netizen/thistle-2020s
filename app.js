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
  return { sessions: sessions.filter(Boolean), responses: d.responses || {} };
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
    </div>
    ${state.view === "calendar" ? calendarHtml() + dayPanelHtml() : listHtml()}
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
        return `<button class="cell" data-act="day" data-date="${day}"
          data-sel="${day === state.selected}" data-today="${day === today}">${Number(day.slice(-2))}
          <div class="bars">${bars}</div></button>`;
      }).join("")}
    </div>
    <div class="legend">
      <span><i style="background:var(--green)"></i>${COVERED_AT}+ coaches in</span>
      <span><i style="background:var(--ink)"></i>1 coach in</span>
      <span><i style="background:var(--red)"></i>nobody yet</span>
    </div>
  </div>`;
}

function dayPanelHtml() {
  const list = sessionsOn(state.selected);
  return `
  <div class="panel">
    <div class="panelhead">
      <div class="daytitle">${longDate(state.selected)}</div>
      <button class="add" data-act="add-open">+ Session</button>
    </div>
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
    ${upcoming.map((s) => cardHtml(s, true)).join("")}
    ${upcoming.length === 0 ? `<div class="empty">Nothing in the diary yet. Add your next training session or game.</div>` : ""}
  </div>`;
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
    state.selected = date; state.adding = false; state.editingId = null; state.confirmingId = null; state.form = null;
    return render();
  }
  if (act === "answer") return setAnswer(id, v);
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
});

app.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (e.target.id === "name") { e.preventDefault(); signIn(e.target.value); }
  if (e.target.dataset.note !== undefined) { e.preventDefault(); e.target.blur(); }
});

/* -------------------------------------------------------------------- boot */

(async () => {
  try {
    const saved = localStorage.getItem(ME_KEY);
    if (saved && coachById(saved)) state.meId = saved;
  } catch { /* private mode */ }

  await store.start((data) => {
    state.data = data;
    state.ready = true;
    render();
  });

  state.ready = true;
  render();
})();
