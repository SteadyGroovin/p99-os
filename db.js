/* Pizza 99 OS — database connection (2026-10-21). Sign in by e-mail + password (or an e-mail link), load the UTAK sales history from
   Supabase rocket-os, then start the app. Replaces the generated sales.js.
   The key below is the project's PUBLIC key: on its own it reads and writes nothing (row-level security);
   access comes from a row in os_member (migrations/004). */
const DB_URL = "https://fuvtcwalsmgufbkozxul.supabase.co";
const DB_KEY = "sb_publishable_n_au6M6ZgAC38s85asticA_s5Ux-jkF";
const sb = window.supabase.createClient(DB_URL, DB_KEY, { auth: { persistSession: true, detectSessionInUrl: true, autoRefreshToken: true } });
const bootEl = document.getElementById("app");
const bootEsc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function loadScript(src) {
  return new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("could not load " + src)); document.body.appendChild(s); });
}
function bootScreen(html) {
  bootEl.innerHTML = `<div class="who"><div class="box">
    <div style="text-align:center;margin-bottom:16px"><span class="store-dot"></span><b>Pizza 99 OS</b></div>${html}</div></div>`;
}
function signInForm(msg) {
  bootScreen(`<div class="mut small" style="text-align:center">Sign in with your e-mail and password.</div>
    <form id="si" style="display:grid;gap:12px;margin-top:16px">
      <input class="in" type="email" id="em" required placeholder="you@example.com" autocomplete="username">
      <input class="in" type="password" id="pw" required placeholder="Password" autocomplete="current-password">
      <button class="btn primary full" type="submit">Sign in</button>
    </form>
    <button class="btn ghost full" id="ml" style="margin-top:8px">E-mail me a sign-in link instead</button>
    ${msg ? `<div class="small" style="margin-top:12px">${msg}</div>` : ""}`);
  const em = () => document.getElementById("em").value.trim();
  document.getElementById("si").onsubmit = async e => {
    e.preventDefault();
    const { error } = await sb.auth.signInWithPassword({ email: em(), password: document.getElementById("pw").value });
    if (error) return signInForm(`<span class="band-bad">${bootEsc(error.message)}</span>`);
    start();
  };
  document.getElementById("ml").onclick = async () => {
    if (!em()) return signInForm(`<span class="band-bad">Type your e-mail first.</span>`);
    const { error } = await sb.auth.signInWithOtp({ email: em(), options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: false } });
    signInForm(error ? `<span class="band-bad">${bootEsc(error.message)}</span>` : `Link sent to <b>${bootEsc(em())}</b>. Open it on this device.`);
  };
}
async function signOut() { await sb.auth.signOut(); location.hash = ""; location.reload(); }

async function start() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return signInForm();
  bootScreen(`<div class="mut" style="text-align:center">Loading sales from the database…</div>`);
  const { data: member, error: mErr } = await sb.from("os_member").select("role").maybeSingle();
  if (mErr || !member) return bootScreen(`<div><b>Signed in as ${bootEsc(session.user.email)}</b></div>
    <div class="small mut" style="margin:8px 0 16px">This account is not on the Pizza 99 OS member list yet. Ask Stefan to add it.</div>
    <button class="btn full" onclick="signOut()">Sign out</button>`);
  window.DB_ROLE = member.role; /* master | lead | walk | crew — the database enforces it too (migration 011); this only shapes the screens */
  let data = { source: "", days: {} };
  if (member.role === "master") { /* sales are for the owners only */
    const { data: sh, error } = await sb.rpc("sales_history", { p_store: "P99" });
    if (error) return bootScreen(`<span class="band-bad">Could not load sales: ${bootEsc(error.message)}</span>`);
    data = sh;
  }
  window.SALES_HISTORY = data;
  if (member.role === "lead" || member.role === "crew") { const { data: g } = await sb.rpc("store_sales_glance", { p_store: "P99" }); window.GLANCE = g || null; } /* today so far + yesterday, nothing else (migration 014) */
  if (member.role === "master") try { const { data: wq } = await sb.from("walk_quick_count").select("day,item_key,qty").eq("store", "P99").order("day", { ascending: false }).limit(2000); window.WALK_ROWS = wq || []; } catch (e) { window.WALK_ROWS = []; } /* Cherry's morning counts feed Stock */
  window.DB_USER = session.user.email;
  bootEl.innerHTML = "";
  for (const s of ["data.js", "icons.js", "sales-view.js", "today-v2.js", "stock-v2.js", "clean-v2.js", "finance-v2.js", "walk-v2.js", "app.js"]) await loadScript(s);
}
start().catch(e => bootScreen(`<span class="band-bad">${bootEsc(e.message)}</span>`));
