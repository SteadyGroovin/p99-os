/* Pizza 99 OS — database connection (2026-10-21). Sign in by e-mail + password (or an e-mail link), load the UTAK sales history from
   Supabase rocket-os, then start the app. Replaces the generated sales.js.
   The key below is the project's PUBLIC key: on its own it reads and writes nothing (row-level security);
   access comes from a row in os_member (migrations/004). */
const DB_URL = "https://fuvtcwalsmgufbkozxul.supabase.co";
const DB_KEY = "sb_publishable_n_au6M6ZgAC38s85asticA_s5Ux-jkF";
const sb = window.supabase.createClient(DB_URL, DB_KEY, { auth: { persistSession: true, detectSessionInUrl: true, autoRefreshToken: true } });
const bootEl = document.getElementById("app");
const bootEsc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* every release loads as one matching set: GitHub Pages caches files for 10 minutes, and a stale db.js next to a new app.js left Tasks blank (v0.10.0, 2026-11-07) */
const APP_V = "0.16.0";
function loadScript(src) {
  return new Promise((ok, no) => { const s = document.createElement("script"); s.src = src + (src.includes("?") ? "&" : "?") + "v=" + APP_V; s.onload = ok; s.onerror = () => no(new Error("could not load " + src)); document.body.appendChild(s); });
}
function bootScreen(html) {
  bootEl.innerHTML = `<div class="who"><div class="box">
    <div style="text-align:center;margin-bottom:16px"><span class="store-dot"></span><b>Rocket OS</b></div>${html}</div></div>`;
}
/* Sign-in (v0.11.4, Stefan 2026-11-08: "make login easier"). Default: e-mail → a code by mail → type it. No password to remember,
   and a virus scanner opening the mail cannot use up a code the way it used up the one-time links ("Email link is invalid or has expired").
   The mail still carries the link too, so it works before the code is added to the Supabase template. Password stays as an option;
   "forgot it" = sign in with a code, then More → Change password. */
const SI = { step: "email", email: "", mode: "code", busy: false };
try { SI.email = localStorage.getItem("p99os_last_email") || ""; } catch (e) { }
function signInForm(msg) {
  const note = msg ? `<div class="small" style="margin-top:4px">${msg}</div>` : "";
  if (SI.step === "code") {
    bootScreen(`<div class="small" style="text-align:center">We sent a sign-in code to<br><b>${bootEsc(SI.email)}</b></div>
      <form id="sc" style="display:grid;gap:12px">
        <input class="in sicode" id="cd" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="10" placeholder="Code from the e-mail" required>
        <button class="btn primary full" type="submit">Sign in</button>
      </form>${note}
      <div class="small mut" style="text-align:center">The e-mail also has a link: opening it on this device signs you in too.</div>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn ghost" id="again">Send a new code</button><button class="btn ghost" id="other">Use another e-mail</button></div>`);
    const cd = document.getElementById("cd"); cd.focus();
    cd.oninput = () => { cd.value = cd.value.replace(/\D/g, ""); };
    document.getElementById("sc").onsubmit = async e => { e.preventDefault(); if (SI.busy) return; SI.busy = true;
      const { error } = await sb.auth.verifyOtp({ email: SI.email, token: cd.value.trim(), type: "email" }); SI.busy = false;
      if (error) return signInForm(`<span class="band-bad">${/expired|invalid/i.test(error.message) ? "That code is wrong or has expired. Send a new code." : bootEsc(error.message)}</span>`);
      SI.step = "email"; start(); };
    document.getElementById("again").onclick = () => siSend();
    document.getElementById("other").onclick = () => { SI.step = "email"; signInForm(); };
    return;
  }
  const pw = SI.mode === "password";
  bootScreen(`<div class="mut small" style="text-align:center">${pw ? "Sign in with your e-mail and password." : "Type your e-mail. We send you a code to sign in, no password needed."}</div>
    <form id="si" style="display:grid;gap:12px">
      <input class="in" type="email" id="em" required placeholder="you@example.com" autocomplete="username" value="${bootEsc(SI.email)}">
      ${pw ? `<input class="in" type="password" id="pw" required placeholder="Password" autocomplete="current-password">` : ""}
      <button class="btn primary full" type="submit">${pw ? "Sign in" : "Send me a code"}</button>
    </form>${note}
    <div style="text-align:center"><button class="btn ghost" id="sw">${pw ? "Sign in with a code instead" : "Use my password instead"}</button></div>
    ${pw ? `<div class="small mut" style="text-align:center">Forgot it? Sign in with a code, then change it under <b>More → Change password</b>.</div>` : ""}`);
  const em = () => document.getElementById("em").value.trim();
  document.getElementById("sw").onclick = () => { SI.email = em(); SI.mode = pw ? "code" : "password"; signInForm(); };
  document.getElementById("si").onsubmit = async e => {
    e.preventDefault(); SI.email = em(); try { localStorage.setItem("p99os_last_email", SI.email); } catch (x) { }
    if (!pw) return siSend();
    const { error } = await sb.auth.signInWithPassword({ email: SI.email, password: document.getElementById("pw").value });
    if (error) return signInForm(`<span class="band-bad">${/invalid login/i.test(error.message) ? "E-mail or password is wrong. You can sign in with a code instead." : bootEsc(error.message)}</span>`);
    start();
  };
}
async function siSend() {
  if (!SI.email) return signInForm(`<span class="band-bad">Type your e-mail first.</span>`);
  if (SI.busy) return; SI.busy = true;
  const { error } = await sb.auth.signInWithOtp({ email: SI.email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: false } });
  SI.busy = false;
  if (error) { SI.step = "email"; return signInForm(`<span class="band-bad">${/signups not allowed|not found|not allowed/i.test(error.message) ? "This e-mail has no Rocket OS login. Ask Stefan to add it." : /rate|seconds/i.test(error.message) ? "Please wait a minute before asking for another code." : bootEsc(error.message)}</span>`); }
  SI.step = "code"; signInForm();
}
async function signOut() { await sb.auth.signOut(); location.hash = ""; location.reload(); }

/* the store's records (os_load, Pizza 99) plus the company-wide to-do board (tasks_load, every venue the login may see; migration 019) */
async function loadRecords() {
  const OS_STORE = (() => { try { const c = JSON.parse(localStorage.getItem("rocketos_stores") || "null"); return c && c.rec ? c.rec : "P99"; } catch (e) { return "P99"; } })();   /* v0.16: the store picked under Stores */
  const [a, b] = await Promise.all([sb.rpc("os_load", { p_store: OS_STORE, p_days: 120 }), sb.rpc("tasks_load")]);
  if (a.error) return { error: a.error }; if (b.error) return { error: b.error };
  const L = a.data, T = b.data || {};
  L.tasks = T.tasks || []; L.people = T.people || []; L.stores = T.stores || []; L.me = T.me || null;
  window.DB_ME = T.me && T.me.key || null;
  return { data: L };
}
window.loadRecords = loadRecords;

async function start() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return signInForm();
  bootScreen(`<div class="mut" style="text-align:center">Loading sales from the database…</div>`);
  const { data: member, error: mErr } = await sb.from("os_member").select("role").maybeSingle();
  if (mErr || !member) return bootScreen(`<div><b>Signed in as ${bootEsc(session.user.email)}</b></div>
    <div class="small mut" style="margin:8px 0 16px">This account is not on the Rocket OS member list yet. Ask Stefan to add it.</div>
    <button class="btn full" onclick="signOut()">Sign out</button>`);
  window.DB_ROLE = member.role; /* master | lead | walk | crew — the database enforces it too (migration 011); this only shapes the screens */
  let data = { source: "", days: {} };
  if (member.role === "master") { /* sales are for the owners only */
    const { data: sh, error } = await sb.rpc("sales_history", { p_store: OS_STORE });
    if (error) return bootScreen(`<span class="band-bad">Could not load sales: ${bootEsc(error.message)}</span>`);
    data = sh;
  }
  window.SALES_HISTORY = data;
  if (member.role === "lead" || member.role === "crew") { const { data: g } = await sb.rpc("store_sales_glance", { p_store: OS_STORE }); window.GLANCE = g || null; } /* today so far + yesterday, nothing else (migration 014) */
  if (member.role === "master") try { const { data: wq } = await sb.from("walk_quick_count").select("day,item_key,qty").eq("store", OS_STORE).order("day", { ascending: false }).limit(2000); window.WALK_ROWS = wq || []; } catch (e) { window.WALK_ROWS = []; } /* Cherry's morning counts feed Stock */
  window.DB_USER = session.user.email;
  { /* the store's own records: receipts, counts, checklist ticks, tickets, tasks, cash counts, transfers (migration 016; sync.js keeps them in step) */
    const { data: L, error: lErr } = await loadRecords();
    if (lErr) return bootScreen(`<span class="band-bad">Could not load the store's records: ${bootEsc(lErr.message)}</span><div class="small mut" style="margin-top:8px">Nothing was changed. Check the connection and open the app again.</div>`);
    window.OS_LOADED = L;
  }
  bootEl.innerHTML = "";
  for (const s of ["data.js", "icons.js", "sync.js", "sales-view.js", "today-v2.js", "stock-v2.js", "clean-v2.js", "tasks-v2.js", "finance-v2.js", "walk-v2.js", "transfer-v2.js", "order-v2.js", "suppliers-v2.js", "money-v2.js", "nav-v2.js", "books-v2.js", "app.js"]) await loadScript(s);
}
start().catch(e => bootScreen(`<span class="band-bad">${bootEsc(e.message)}</span>`));
