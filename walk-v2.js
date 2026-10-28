/* walk-v2.js — the morning run (Cherry's store walk) for all five stores, written to Supabase through two RPCs (2026-10-29).
   #/walk            the day's board: five stores in walking order, status, fund and hygiene chips, the offline queue; owners: fund standards, yesterday
   #/walk/<STORE>    the form, one scroll: cash · who · quick counts · OR booklet · first 5 · columnar · hygienics · note · review and send
   #/walk/<STORE>/<YYYY-MM-DD>  the same form for an earlier business day (only for a run kept on this device)
   #/walk/<STORE>/sent           the result card after a send (or "waiting to send" when it went into the offline queue)
   #/walk/yesterday              owners: yesterday's runs, all stores
   Reliability: a draft per store+day in localStorage (never lose typed data), an offline queue that keeps the original day and client_id,
   the setup cached for offline use. The server decides the business day, the fund state, the gap and the hygiene band.
   Role walk sees no POS figures and no gaps. The old device-only version stays in app.js as viewWalk_v1 / viewWalkForm_v1. */

const MR = { setup: null, setupAt: 0, cached: false, loading: false, err: null, form: null, formKey: null, restored: false, sending: false, sendErr: null, showReq: false,
  result: null, flushing: false, autoFlushAt: 0, fundBusy: {}, fundMsg: {}, yest: null, yestLoading: false, yestErr: null };
const MR_SETUP = "p99_walk_setup", MR_QUEUE = "p99_walk_queue", MR_DEN = [1000, 500, 200, 100, 50, 20, 10, 5, 1];
const mrDraftKey = (s, d) => `p99_walk_draft_${s}_${d}`;
function mrGet(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function mrPut(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
function mrDel(k) { try { localStorage.removeItem(k); } catch (e) { } }
const mrUUID = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); });
const mrHM = (d = new Date()) => String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
const mrTime = iso => { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? "" : mrHM(d); };
const mrOwner = () => ((MR.setup && MR.setup.role) || window.DB_ROLE || role()) === "master";
const mrInt = v => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };
const mrBlank = v => v === "" || v == null;

/* ---------- network: one wrapper; a network failure is told apart from a server answer ---------- */
const mrIsNet = (e, status) => !!e && (e instanceof TypeError || /failed to fetch|networkerror|network request failed|load failed|fetcherror|timed out|err_internet|offline/i.test(String(e.message || e)) || (status === 0 && !e.code));
async function mrRpc(name, args, ms = 25000) {
  if (navigator.onLine === false) return { net: true, data: null, error: { message: "offline" } };
  let timer; try {
    const r = await Promise.race([args === undefined ? sb.rpc(name) : sb.rpc(name, args), new Promise((_, no) => { timer = setTimeout(() => no(new TypeError("request timed out")), ms); })]);
    clearTimeout(timer);
    if (!r) return { data: null, error: { message: "empty answer from the server" } };
    if (r.error && mrIsNet(r.error, r.status)) return { net: true, data: null, error: r.error };
    return r;
  } catch (e) { clearTimeout(timer); return mrIsNet(e) ? { net: true, data: null, error: { message: String(e.message || e) } } : { data: null, error: { message: String(e.message || e) } }; }
}
function mrFriendly(m, p) {
  m = String(m || "");
  if (/^GAP_REASON_REQUIRED/.test(m)) return "The counted cash does not match the till's record. Open the run and write a short reason.";
  if (/cash fund required/i.test(m)) return "Type the cash fund that stays in the drawer.";
  if (/cash count required/i.test(m)) return "Count the drawer: at least one note or coin.";
  if (/first 5 sales check required/i.test(m)) return "Choose the result of the first 5 sales check.";
  if (/hygiene needs all 9 areas/i.test(m)) return "Hygienics: score all 9 areas, or clear them.";
  if (/outside the last 2 business days/i.test(m)) return `This run is for ${p && p.day ? dayName(p.day) : "an old day"}, more than 2 business days ago, so the server no longer takes it. The numbers stay on this device: tell Stefan.`;
  if (/not allowed/i.test(m)) return "This sign-in may not send morning runs. Ask Stefan.";
  return "The server did not take the run: " + m;
}

/* ---------- setup (stores, items, people), cached for offline ---------- */
async function mrLoad() {
  if (MR.loading) return; MR.loading = true; MR.lastTry = Date.now(); MR.err = null; mrRerender(true);
  const r = await mrRpc("get_walk_setup", undefined, 20000);
  if (!r.error && r.data && Array.isArray(r.data.stores)) {
    MR.setup = r.data; MR.setupAt = Date.now(); MR.cached = false; MR.err = null; mrPut(MR_SETUP, { at: new Date().toISOString(), data: r.data });
  } else {
    MR.err = r.net ? "No internet connection." : (r.error ? r.error.message : "The setup came back empty.");
    if (!MR.setup || MR.cached) { const c = mrGet(MR_SETUP); if (c && c.data) { MR.setup = c.data; MR.setupAt = Date.parse(c.at) || 0; MR.cached = true; } }
  }
  MR.loading = false; mrRerender(true);
}
function mrRerender(fromLoad) { /* never rebuild a form the user is typing in; the board and empty states may refresh */
  const seg = (location.hash || "").slice(1).split("/").filter(Boolean);
  if (seg[0] !== "walk") return;
  if (!seg[1] || seg[2] === "sent" || seg[1] === "yesterday" || !MR.form || (fromLoad && !MR.formKey)) render();
}
const mrDay = () => MR.cached ? today() : MR.setup.day; /* an offline copy from an earlier day must not file today's run under that day */
const mrStores = () => (MR.setup && MR.setup.stores) || [];
const mrStore = code => mrStores().find(s => s.code === code);
const mrToday = st => (st && st.today && (!MR.cached || MR.setup.day === today())) ? st.today : null;
const mrAreas = () => (MR.setup && MR.setup.hygiene_areas && MR.setup.hygiene_areas.length === 9) ? MR.setup.hygiene_areas : HYG_AREAS;
const mrFirst5 = () => (MR.setup && MR.setup.first5_options && MR.setup.first5_options.length) ? MR.setup.first5_options : FIRST5;
const mrPerson = id => ((MR.setup && MR.setup.people) || []).find(p => p.id === id);
const mrName = (id, txt) => id ? (mrPerson(id) ? mrPerson(id).name : "someone") : (txt || "");
function mrAuto() { if (!MR.loading && Date.now() - (MR.lastTry || 0) > 30e3) setTimeout(mrLoad, 0); } /* automatic reloads at most every 30 s, so a dead network never loops */
function mrEnsure() { /* true when a setup is usable now; kicks a (re)load when missing, old, or an offline copy */
  const old = !!MR.setup && !MR.cached && (Date.now() - MR.setupAt > 10 * 60e3 || MR.setup.day !== today());
  if (!MR.setup || old || MR.cached) mrAuto();
  return !!MR.setup && !(old && MR.setup.day !== today() && (MR.loading || !MR.err));
}

/* ---------- offline queue ---------- */
const mrQueue = () => { const q = mrGet(MR_QUEUE); return Array.isArray(q) ? q : []; };
const mrQueueSet = q => mrPut(MR_QUEUE, q);
function mrEnqueue(payload) {
  const q = mrQueue().filter(e => !(e.payload && e.payload.store === payload.store && e.payload.day === payload.day)); /* the newer run for the same store and day replaces the older one */
  q.push({ client_id: payload.client_id, payload, queued_at: new Date().toISOString() }); mrQueueSet(q);
}
function mrSent(payload) { /* after any successful send: drop older queued runs for that store+day; drop the draft only if nobody typed since */
  mrQueueSet(mrQueue().filter(e => !(e.payload.store === payload.store && e.payload.day === payload.day && e.client_id !== payload.client_id) && e.client_id !== payload.client_id));
  const k = mrDraftKey(payload.store, payload.day), d = mrGet(k);
  if (d && (d.client_id === payload.client_id || !d.saved)) { mrDel(k); if (MR.formKey === payload.store + "|" + payload.day) { MR.form = null; MR.formKey = null; } }
}
async function mrFlush(manual) {
  if (MR.flushing) return; const q = mrQueue(); if (!q.length) return;
  MR.flushing = true; MR.autoFlushAt = Date.now(); mrRerender();
  const sent = [], errs = {}; let down = false;
  for (const e of q) {
    if (down) break;
    const r = await mrRpc("submit_walk_run", { p: e.payload });
    if (r.net) { down = true; break; }
    if (r.error) { errs[e.client_id] = mrFriendly(r.error.message, e.payload); continue; }
    sent.push(e); mrSent(e.payload);
  }
  const ids = new Set(sent.map(e => e.client_id));
  mrQueueSet(mrQueue().filter(e => !ids.has(e.client_id)).map(e => errs[e.client_id] ? Object.assign({}, e, { error: errs[e.client_id] }) : e));
  MR.flushing = false;
  if (sent.length) { toast(sent.length === 1 ? "The waiting run was sent." : `${sent.length} waiting runs were sent.`); MR.setupAt = 0; setTimeout(mrLoad, 0); }
  else if (manual && down) toast("Still no internet. The runs stay on this device.");
  mrRerender();
}
function mrQueueDrop(cid) {
  const e = mrQueue().find(x => x.client_id === cid); if (!e) return;
  if (!confirm(`Remove the waiting run for ${e.payload.store} (${dayName(e.payload.day)}) from this device? It will not be sent.`)) return;
  mrQueueSet(mrQueue().filter(x => x.client_id !== cid)); render();
}
window.addEventListener("online", () => { setTimeout(() => mrFlush(false), 800); });
setTimeout(() => { if (mrQueue().length) mrFlush(false); }, 1500); /* app open */
(function mrSweep() { /* drafts older than 3 days are dead weight */ try { const lim = (() => { const d = new Date(Date.now() - 4 * 3600e3 - 3 * 864e5); return d.toISOString().slice(0, 10); })();
  for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); const m = /^p99_walk_draft_[A-Z0-9]+_(\d{4}-\d{2}-\d{2})$/.exec(k || ""); if (m && m[1] < lim) localStorage.removeItem(k); } } catch (e) { } })();

function mrQueueBar() {
  const q = mrQueue(); if (!q.length) return "";
  const bad = q.filter(e => e.error);
  return `<section class="card mr-q"><div class="mr-qh"><div>${chip("warn", `${q.length} ${q.length === 1 ? "run" : "runs"} waiting to send`)}<div class="small" style="margin-top:6px">Saved on this device. ${MR.flushing ? "Sending…" : "They send by themselves when the internet is back."}</div></div>
    <button class="btn" ${MR.flushing ? "disabled" : ""} onclick="mrFlush(true)">${MR.flushing ? "Sending…" : "Send now"}</button></div>
    ${bad.map(e => `<div class="mr-qe"><div class="small"><b>${esc(e.payload.store)} · ${esc(dayName(e.payload.day))}</b> — <span class="band-bad">${esc(e.error)}</span></div><div class="mr-qa"><button class="btn sm" onclick="go('#/walk/${esc(e.payload.store)}/${esc(e.payload.day)}')">Open the run</button><button class="btn sm ghost danger" onclick="mrQueueDrop('${esc(e.client_id)}')">Remove</button></div></div>`).join("")}</section>`;
}
function mrBanner() {
  if (MR.cached) return `<div class="card warnbox small">${chip("warn", "Offline copy")}<div style="margin-top:6px">Could not reach the server (${esc(MR.err || "no connection")}). Showing the store list saved ${MR.setupAt ? esc(dayName(new Date(MR.setupAt).toISOString().slice(0, 10)) + " " + mrHM(new Date(MR.setupAt))) : "earlier"}. You can fill runs; they wait on this device and send later.</div><div style="margin-top:8px"><button class="btn sm" ${MR.loading ? "disabled" : ""} onclick="mrLoad()">${MR.loading ? "Trying…" : "Try again"}</button></div></div>`;
  return "";
}

/* ---------- chips ---------- */
function mrFundChip(fund, std) {
  if (fund == null || fund === "") return "";
  if (std == null) return chip("", "no fund standard set");
  return +fund === +std ? chip("ok", `fund ${peso(fund)} ✓`) : chip("warn", `fund ${peso(fund)} · differs from ${peso(std)}`);
}
function mrBandChip(h) { if (!h || h.total == null) return ""; const b = hygBand(h.total); return chip(b[1], `hygiene ${h.total}/45 ${esc(h.band || b[0])}`); }

/* ---------- A. the board ---------- */
function viewWalk() {
  const seg = (location.hash || "").slice(1).split("/").filter(Boolean);
  if (seg[1] === "yesterday") return mrViewYesterday();
  if (!MR.setup || Date.now() - MR.setupAt > 60e3) mrAuto();
  if (mrQueue().length && !MR.flushing && navigator.onLine !== false && Date.now() - MR.autoFlushAt > 30e3) setTimeout(() => mrFlush(false), 0);
  if (!MR.setup) return shell("Morning run", today() ? dayLong(today()) : "", mrQueueBar() + (MR.err ? mrErrCard() : `<div class="card mut" style="text-align:center">Loading the stores…</div>`));
  const d = mrDay(), q = mrQueue(), stores = mrStores();
  const done = stores.filter(s => mrToday(s)).length;
  const rows = stores.map(s => {
    const t = mrToday(s), qd = q.find(e => e.payload.store === s.code && e.payload.day === d), dr = mrGet(mrDraftKey(s.code, d));
    let meta, right;
    if (t) {
      const who = mrName(t.received_person, t.received_by);
      meta = `Done ${esc(mrTime(t.created))}${who ? ` · received by ${esc(who)}` : ""} · drawer ${peso(t.cash_total)}`;
      right = chip("ok", "done");
    } else if (qd) { meta = `Saved on this device ${esc(mrTime(qd.queued_at))}${qd.error ? ` · <span class="band-bad">${esc(qd.error)}</span>` : ""}`; right = chip("warn", "waiting to send"); }
    else { meta = dr && dr.saved ? `Draft on this device, last change ${esc(mrTime(dr.saved))}` : "Not yet"; right = dr && dr.saved ? chip("info", "draft") : chip("", "not yet"); }
    const chips = [t ? mrFundChip(t.fund, s.fund_standard) : "", t && t.hygiene ? mrBandChip(t.hygiene) : (t ? chip("", "no hygiene") : ""), t && dr && dr.saved ? chip("info", "edit draft") : ""].filter(Boolean).join("");
    return `<button class="row tap mr-row" onclick="go('#/walk/${s.code}')"><div class="main"><div class="name">${esc(s.name)} <span class="mut tiny">${esc(s.code)}</span></div><div class="meta">${meta}</div>${chips ? `<div class="mr-chips">${chips}</div>` : ""}</div>${right}<span class="chev">${ic("chevron-right")}</span></button>`;
  }).join("");
  const prog = `<section class="card"><div class="split"><h2>${done} of ${stores.length} stores done</h2><span class="tiny mut">${MR.loading ? "refreshing…" : `checked ${mrHM(new Date(MR.setupAt || Date.now()))}`}</span></div><div class="bar ${done >= stores.length ? "ok" : ""}"><i style="width:${stores.length ? done / stores.length * 100 : 0}%"></i></div>${done >= stores.length ? `<div class="small band-ok" style="margin-top:8px">The round is done.</div>` : ""}</section>`;
  const owner = mrOwner() ? mrFundCard() + `<button class="row tap" onclick="go('#/walk/yesterday')"><div class="main"><div class="name">Yesterday's runs</div><div class="meta">${esc(dayName(addDays(d, -1)))} · all five stores</div></div><span class="chev">${ic("chevron-right")}</span></button>` : "";
  return shell("Morning run", dayLong(d) + (MR.cached ? " · offline copy" : ""), mrQueueBar() + mrBanner() + (MR.err && !MR.cached ? `<div class="card small">${chip("warn", "Could not refresh")} <span class="mut">${esc(MR.err)}</span> <button class="btn sm" onclick="mrLoad()">Retry</button></div>` : "") + prog + `<div class="list">${rows}</div>` + owner);
}
function mrErrCard() {
  return `<section class="card"><div>${chip("bad", "Could not load the morning run")}</div><div class="small" style="margin-top:8px">${esc(MR.err)}</div><div class="small mut" style="margin-top:4px">${/internet|fetch|offline|timed out/i.test(MR.err || "") ? "There is no saved copy on this device yet, so the form cannot open offline. Find a signal and try again." : "If this repeats, tell Stefan with the message above."}</div><div style="margin-top:12px"><button class="btn primary" ${MR.loading ? "disabled" : ""} onclick="mrLoad()">${MR.loading ? "Trying…" : "Retry"}</button></div></section>`;
}

/* owners: fund standard per store, dated */
function mrFundCard() {
  const rows = mrStores().map(s => { const c = s.code, m = MR.fundMsg[c];
    return `<div class="mr-fs"><div class="mr-fsh"><div><b>${esc(s.name)}</b><div class="tiny mut">${s.fund_standard == null ? "no standard set" : "standard " + peso(s.fund_standard)}</div></div></div>
      <div class="mr-fsf"><input class="in num" id="mr-fs-a-${c}" inputmode="numeric" placeholder="₱ amount" oninput="this.value=this.value.replace(/[^0-9]/g,'')"><input class="in" id="mr-fs-d-${c}" type="date" value="${esc(mrDay())}" aria-label="from"><input class="in" id="mr-fs-n-${c}" placeholder="note (why)"><button class="btn" ${MR.fundBusy[c] ? "disabled" : ""} onclick="mrFundSave('${c}')">${MR.fundBusy[c] ? "Saving…" : "Set"}</button></div>
      ${m ? `<div class="tiny ${m.ok ? "band-ok" : "band-bad"}">${esc(m.t)}</div>` : ""}</div>`; }).join("");
  return `<section class="card"><details class="tbl" ${MR.fundOpen ? "open" : ""} ontoggle="MR.fundOpen=this.open"><summary>Fund standards (owners)</summary><div class="small mut" style="margin:4px 0 10px">The fund each store keeps in the drawer, from a date. Runs compare the counted fund with the standard of their day.</div><div class="mr-fsl">${rows}</div></details></section>`;
}
async function mrFundSave(c) {
  const a = (document.getElementById("mr-fs-a-" + c) || {}).value, dd = (document.getElementById("mr-fs-d-" + c) || {}).value, n = (document.getElementById("mr-fs-n-" + c) || {}).value;
  if (mrBlank(a)) { MR.fundMsg[c] = { ok: false, t: "Type the amount first." }; return render(); }
  MR.fundBusy[c] = true; MR.fundMsg[c] = null; render();
  const r = await mrRpc("set_fund_standard", { p_store: c, p_amount: +a, p_from: dd || null, p_note: (n || "").trim() || null });
  MR.fundBusy[c] = false;
  MR.fundMsg[c] = r.error ? { ok: false, t: r.net ? "No internet — not saved." : "Not saved: " + r.error.message } : { ok: true, t: `Saved: ${peso(+a)} from ${dayName(dd || mrDay())}.` };
  if (!r.error) { MR.setupAt = 0; setTimeout(mrLoad, 0); }
  MR.fundOpen = true; render();
}

/* owners: yesterday, all stores (reads the walk tables directly; row-level security lets owners read them) */
async function mrLoadYest(day) {
  if (MR.yestLoading) return; MR.yestLoading = true; MR.yestErr = null;
  try {
    const [a, b] = await Promise.all([sb.from("walk_run").select("*").eq("day", day), sb.from("walk_hygiene").select("*").eq("day", day)]);
    if (a.error) throw a.error; MR.yest = { day, runs: a.data || [], hyg: (b && !b.error && b.data) || [] };
  } catch (e) { MR.yestErr = e.message || String(e); }
  MR.yestLoading = false; render();
}
function mrViewYesterday() {
  if (!mrOwner()) { setTimeout(() => go("#/walk"), 0); return shell("Morning run", "", ""); }
  if (!MR.setup) { mrAuto(); return shell("Yesterday's runs", "", `<div class="card mut">Loading…</div>`, { back: "#/walk" }); }
  const y = addDays(mrDay(), -1);
  if ((!MR.yest || MR.yest.day !== y) && !MR.yestLoading && !MR.yestErr) setTimeout(() => mrLoadYest(y), 0);
  let body;
  if (MR.yestErr) body = `<div class="card"><span class="band-bad">Could not load: ${esc(MR.yestErr)}</span><div style="margin-top:8px"><button class="btn" onclick="MR.yestErr=null;render()">Try again</button></div></div>`;
  else if (!MR.yest || MR.yest.day !== y) body = `<div class="card mut" style="text-align:center">Loading yesterday's runs…</div>`;
  else body = `<div class="list">${mrStores().map(s => { const r = MR.yest.runs.find(x => x.store === s.code), h = MR.yest.hyg.find(x => x.store === s.code);
      if (!r) return `<div class="row"><div class="main"><div class="name">${esc(s.name)}</div><div class="meta band-bad">No run</div></div>${chip("bad", "missing")}</div>`;
      return `<div class="row"><div class="main"><div class="name">${esc(s.name)}</div><div class="meta">${esc(mrTime(r.created))} · drawer ${peso(r.cash_total)} − fund ${peso(r.fund)} = <b>${peso(r.cash_sales)}</b> · first 5: ${esc(r.bir_first5 || "—")}</div><div class="meta">${esc(mrName(r.endorsed_person, r.endorsed_by) || "—")} → ${esc(mrName(r.received_person, r.received_by) || "—")}${r.note ? " · " + esc(r.note) : ""}</div><div class="mr-chips">${mrFundChip(r.fund, s.fund_standard)}${h ? mrBandChip(h) : chip("", "no hygiene")}</div></div></div>`; }).join("")}</div>
      <div class="tiny mut">Cash gap against UTAK for Pizza 99: <a href="#/sales" onclick="salesTab='run'">Sales → Morning run</a>.</div>`;
  return shell("Yesterday's runs", dayLong(y), body, { back: "#/walk" });
}

/* ---------- B. the form ---------- */
function mrBlankForm(store, day) {
  return { v: 1, store, day, cash: {}, fund: "", endorsed: "", endorsedText: "", received: "", receivedText: "", quick: {}, booklet: "", first5: "", time: mrHM(), colSales: "", colDate: addDays(day, -1),
    scores: [0, 0, 0, 0, 0, 0, 0, 0, 0], hygNote: "", note: "", gapReason: "", gapAsked: null, client_id: null, saved: null, editOf: null };
}
function mrFromRun(t, st, day) {
  const f = mrBlankForm(st.code, day);
  MR_DEN.forEach(d => { const v = t.cash_breakdown && t.cash_breakdown[String(d)]; if (v) f.cash[d] = String(v); });
  f.fund = t.fund != null ? String(t.fund) : "";
  const who = (id, txt) => id ? [id, ""] : (txt ? ["__other", txt] : ["", ""]);
  [f.endorsed, f.endorsedText] = who(t.endorsed_person, t.endorsed_by); [f.received, f.receivedText] = who(t.received_person, t.received_by);
  (t.quick || []).forEach(q => { const it = st.items.find(i => i.key === q.key); if (!it) return; f.quick[q.key] = it.unit_kind === "pcs" ? { l: String(q.loose != null ? q.loose : (q.qty != null ? q.qty : "")) } : (q.cases == null && q.loose == null && q.qty != null) ? { c: "", l: String(q.qty) } /* a run saved by the old app holds pieces only: keep the total as loose pieces, never blank it */ : { c: q.cases != null ? String(q.cases) : "", l: q.loose != null ? String(q.loose) : "" }; });
  f.booklet = t.booklet_no || ""; f.first5 = t.bir_first5 || ""; f.time = t.bir_time ? String(t.bir_time).slice(0, 5) : f.time;
  f.colSales = t.columnar_sales != null ? String(t.columnar_sales) : ""; f.colDate = t.columnar_date || f.colDate; f.note = t.note || "";
  if (t.hygiene && Array.isArray(t.hygiene.scores) && t.hygiene.scores.length === 9) { f.scores = t.hygiene.scores.map(Number); f.hygNote = t.hygiene.note || ""; }
  f.editOf = t.created || "";
  return f;
}
function mrSaveDraft() { const f = MR.form; if (!f) return; f.saved = new Date().toISOString(); if (!mrPut(mrDraftKey(f.store, f.day), f)) toast("This device is full: the draft could not be saved."); }
function mrTouch() { if (!MR.form) return; MR.form.client_id = null; MR.sendErr = null; mrSaveDraft(); mrLive(); } /* any change after a send attempt = a new run attempt, new client_id */
function mrDiscard() {
  if (!MR.form || !confirm("Throw away the changes on this device and start again?")) return;
  mrDel(mrDraftKey(MR.form.store, MR.form.day)); MR.form = null; MR.formKey = null; MR.sendErr = null; MR.showReq = false; render(); window.scrollTo(0, 0);
}

function mrParse() { const seg = (location.hash || "").slice(1).split("/").filter(Boolean); return { code: (seg[1] || "").toUpperCase(), extra: seg[2] || "" }; }
function viewWalkForm() {
  const { code, extra } = mrParse();
  if (code === "YESTERDAY") return mrViewYesterday();
  if (!MR.form || !MR.formKey || MR.formKey.split("|")[0] !== code) { if (!mrEnsure()) return shell("Morning run", "", MR.err && !MR.setup ? mrErrCard() : `<div class="card mut" style="text-align:center">Loading the store…</div>`, { back: "#/walk" }); }
  const st = mrStore(code);
  if (!st) return shell("Morning run", "", `<div class="card">Unknown store <b>${esc(code)}</b>. <a href="#/walk">Back to the board</a></div>`, { back: "#/walk" });
  if (extra === "sent") return mrViewResult(st);
  const base = mrDay();
  let day = base;
  if (/^\d{4}-\d{2}-\d{2}$/.test(extra)) { if (extra !== base && extra !== addDays(base, -1)) return shell(st.name, "", `<div class="card">Runs can only be sent for today or yesterday. <a href="#/walk">Back to the board</a></div>`, { back: "#/walk" }); day = extra; }
  const key = st.code + "|" + day;
  if (MR.formKey !== key || !MR.form) {
    const dr = mrGet(mrDraftKey(st.code, day)), t = day === base ? mrToday(st) : null;
    MR.restored = !!(dr && dr.saved); MR.form = MR.restored ? Object.assign(mrBlankForm(st.code, day), dr) : t ? mrFromRun(t, st, day) : mrBlankForm(st.code, day);
    if (t && !MR.form.editOf) MR.form.editOf = t.created || "";
    MR.formKey = key; MR.sendErr = null; MR.showReq = false;
  }
  return mrFormHTML(st);
}

function mrCalc(f) { const total = MR_DEN.reduce((s, d) => s + d * mrInt(f.cash[d]), 0); const fund = mrBlank(f.fund) ? null : +f.fund; return { total, fund, sales: fund == null ? null : total - fund }; }
function mrPieces(it, q) {
  q = q || {}; const c = q.c, l = q.l;
  if (it.unit_kind === "pcs") return mrBlank(l) ? "" : `${fmt(+l)} pcs`;
  if (mrBlank(c) && mrBlank(l)) return "";
  if (it.pack_size) return `= ${fmt(mrInt(c) * it.pack_size + mrInt(l))} pcs`;
  return `${mrInt(c)} ${it.unit_kind === "box_loose" ? "box" : "case"} + ${mrInt(l)} loose`;
}
function mrCheck(f, st) {
  const req = [], soft = [], c = mrCalc(f), n = f.scores.filter(x => x > 0).length;
  if (!c.total) req.push(["cash", "Cash count: type how many of at least one note or coin"]);
  if (c.fund == null) req.push(["fund", "Cash fund: type what stays in the drawer"]);
  if (!f.first5) req.push(["first5", "First 5 sales: choose the result"]);
  if (n > 0 && n < 9) req.push(["hyg", `Hygienics: ${n} of 9 areas scored — score all 9, or clear them`]);
  if (f.endorsed === "__other" && !f.endorsedText.trim()) req.push(["who", "Endorsed by: type the name, or pick one from the list"]);
  if (f.received === "__other" && !f.receivedText.trim()) req.push(["who", "Received by: type the name, or pick one from the list"]);
  if (f.gapAsked != null && !f.gapReason.trim()) req.push(["gap", "Cash difference: write a short reason"]);
  if (c.total && c.sales != null && c.sales < 0) soft.push(["cash", "The drawer holds less than the fund — count again, then tell the office"]);
  if (c.fund != null && st.fund_standard != null && c.fund !== +st.fund_standard) soft.push(["fund", `Fund ${peso(c.fund)} differs from the standard ${peso(st.fund_standard)}`]);
  if (!f.endorsed) soft.push(["who", "Endorsed by: nobody chosen"]);
  if (!f.received) soft.push(["who", "Received by: nobody chosen"]);
  if (f.endorsed === "__other" && f.endorsedText.trim()) soft.push(["who", `"${f.endorsedText.trim()}" is typed, not on the list`]);
  if (f.received === "__other" && f.receivedText.trim()) soft.push(["who", `"${f.receivedText.trim()}" is typed, not on the list`]);
  if (st.items.length && !st.items.some(it => mrPieces(it, f.quick[it.key]))) soft.push(["quick", "Quick counts: nothing counted"]);
  if (!f.booklet.trim()) soft.push(["or", "OR booklet no.: empty"]);
  if (n === 0) soft.push(["hyg", "Hygienics: not done (it can be added later with an edit)"]);
  if (n === 9 && f.scores.some(x => x <= 2) && !f.hygNote.trim()) soft.push(["hyg", "A hygiene score of 2 or less: add a note what is wrong"]);
  return { req, soft, c, n };
}
const mrReqTag = `<span class="mr-req">required</span>`;
function mrSel(which, f, st) {
  const v = f[which], ppl = (MR.setup.people || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const mine = ppl.filter(p => p.store === st.code), rest = ppl.filter(p => p.store !== st.code);
  const o = p => `<option value="${esc(p.id)}" ${v === p.id ? "selected" : ""}>${esc(p.name)}${p.position ? " · " + esc(p.position) : ""}${p.store && p.store !== st.code ? " (" + esc(p.store) + ")" : ""}</option>`;
  const known = !v || v === "__other" || ppl.some(p => p.id === v);
  return `<select class="in" id="mr-${which}" onchange="mrWho('${which}',this)"><option value="" ${!v ? "selected" : ""}>— choose —</option>${mine.length ? `<optgroup label="${esc(st.name)} staff">${mine.map(o).join("")}</optgroup>` : ""}<optgroup label="Everyone else">${rest.map(o).join("")}</optgroup>${known ? "" : `<option value="${esc(v)}" selected>(no longer on the list)</option>`}<option value="__other" ${v === "__other" ? "selected" : ""}>Someone else — type the name</option></select>
    <div class="mr-other" id="mr-${which}-o" ${v === "__other" ? "" : "hidden"}><input class="in" placeholder="Full name" value="${esc(f[which + "Text"])}" oninput="MR.form.${which}Text=this.value;mrTouch()"><div class="tiny mut">Typed names are marked for HR to check.</div></div>`;
}
function mrFormHTML(st) {
  const f = MR.form, base = mrDay(), t = f.day === base ? mrToday(st) : null, chk = mrCheck(f, st), q = mrQueue().find(e => e.payload.store === st.code && e.payload.day === f.day);
  const notes = [];
  if (f.day !== base) notes.push(`<div class="card warnbox small">${chip("warn", "Earlier day")} This run is for <b>${esc(dayLong(f.day))}</b>, not today.</div>`);
  if (t || f.editOf) notes.push(`<div class="card mr-edit small">${chip("info", "Edit")} Editing today's run (saved ${esc(mrTime(t ? t.created : f.editOf))}) — the first version is kept.</div>`);
  if (MR.restored) notes.push(`<div class="card small">${chip("info", "Draft restored")} Your typing from this device, last change ${esc(mrTime(f.saved))}. <button class="btn sm ghost danger" onclick="mrDiscard()">Discard draft</button></div>`);
  if (q) notes.push(`<div class="card warnbox small">${chip("warn", "Waiting to send")} A run for this store is saved on this device since ${esc(mrTime(q.queued_at))}${q.error ? ` — <span class="band-bad">${esc(q.error)}</span>` : ""}. Sending again replaces it.</div>`);
  const den = MR_DEN.map(d => `<div class="mr-den"><div class="mr-dl num">₱${fmt(d)}</div><div class="mr-step"><button type="button" aria-label="one less ₱${d}" onclick="mrStep(${d},-1)">−</button><input class="in num" id="mr-c-${d}" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="0" value="${esc(f.cash[d] || "")}" oninput="mrCash(${d},this)" aria-label="pieces of ₱${d}"><button type="button" aria-label="one more ₱${d}" onclick="mrStep(${d},1)">+</button></div><div class="mr-ds num" id="mr-cs-${d}">${mrInt(f.cash[d]) ? peso(d * mrInt(f.cash[d])) : ""}</div></div>`).join("");
  const qc = st.items.length ? st.items.map(it => { const v = f.quick[it.key] || {}; const two = it.unit_kind !== "pcs"; const u1 = it.unit_kind === "box_loose" ? "boxes" : "cases";
    return `<div class="mr-qc"><div class="mr-qn"><div class="name">${esc(it.label)}</div><div class="tiny mut" id="mr-qt-${esc(it.key)}">${esc(mrPieces(it, v)) || (two ? (it.pack_size ? `${it.pack_size} per ${u1 === "boxes" ? "box" : "case"}` : "") : "pieces")}</div></div>
      <div class="mr-qi">${two ? `<label><input class="in num" inputmode="numeric" pattern="[0-9]*" placeholder="–" value="${esc(v.c != null ? v.c : "")}" oninput="mrQuick('${esc(it.key)}','c',this)"><span>${u1}</span></label>` : ""}<label><input class="in num" inputmode="numeric" pattern="[0-9]*" placeholder="–" value="${esc(v.l != null ? v.l : "")}" oninput="mrQuick('${esc(it.key)}','l',this)"><span>${two ? "loose" : "pcs"}</span></label></div></div>`; }).join("")
    : `<div class="mut small">No items are set for this store. Tell Stefan.</div>`;
  const areas = mrAreas();
  const hyg = areas.map((a, i) => { const g = HYG_GUIDE[HYG_AREAS.indexOf(a)] || []; const s = f.scores[i];
    return `<div class="mr-area" id="mr-a-${i}"><div class="name">${i + 1}. ${esc(a)}</div>${g.length ? `<ul class="mr-guide">${g.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}<div class="mr-sc" role="group" aria-label="${esc(a)} score">${[1, 2, 3, 4, 5].map(n => `<button type="button" class="${s === n ? "on s" + n : ""}" aria-pressed="${s === n}" onclick="mrScore(${i},${n})">${n}</button>`).join("")}</div><div class="tiny mr-low" ${s && s <= 2 ? "" : "hidden"}>Score ${s || ""}: add a note below what is wrong.</div></div>`; }).join("");
  const first5 = mrFirst5().map(o => `<option ${f.first5 === o ? "selected" : ""}>${esc(o)}</option>`).join("");
  const body = notes.join("") + `
  <section class="card mr-sec" id="mr-s-cash"><h2>1 · Cash count ${mrReqTag}</h2><div class="small mut">All the money in the drawer: yesterday's sales and the fund together. Pieces per note.</div>
    <div class="mr-sum"><div><span>Drawer total</span><b class="num" id="mr-tot">${peso(chk.c.total)}</b></div><div><span>Cash fund</span><b class="num" id="mr-fv">${chk.c.fund == null ? "—" : peso(chk.c.fund)}</b></div><div><span>Cash sales</span><b class="num" id="mr-sales">—</b></div></div>
    <div class="small" id="mr-salesl"></div>
    <div class="mr-dens">${den}</div>
    <div class="field" id="mr-s-fund" style="margin-top:14px"><label for="mr-fund">Cash fund kept in the drawer (₱) ${mrReqTag}</label>
      <div class="mr-fundrow"><input class="in num" id="mr-fund" inputmode="numeric" pattern="[0-9]*" placeholder="₱" value="${esc(f.fund)}" oninput="mrFund(this)">${st.fund_standard != null ? `<button type="button" class="btn" onclick="mrFundFill(${+st.fund_standard})">= ${peso(st.fund_standard)}</button>` : ""}</div>
      <div id="mr-fundchip" class="tiny"></div></div></section>
  <section class="card mr-sec" id="mr-s-who"><h2>2 · Who</h2><div class="small mut">Like the two signatures on paper: who hands the cash over, who takes it.</div>
    <div class="mr-two"><div class="field"><label for="mr-endorsed">Endorsed by</label>${mrSel("endorsed", f, st)}</div><div class="field"><label for="mr-received">Received by</label>${mrSel("received", f, st)}</div></div></section>
  <section class="card mr-sec" id="mr-s-quick"><h2>3 · Quick counts</h2><div class="small mut">Count what is there. Leave empty what you did not count.</div><div class="mr-qcs">${qc}</div></section>
  <section class="card mr-sec" id="mr-s-or"><h2>4 · OR booklet no.</h2><input class="in" id="mr-or" autocomplete="off" value="${esc(f.booklet)}" placeholder="${st.last_booklet ? "last sent: " + esc(st.last_booklet) : "booklet number"}" oninput="MR.form.booklet=this.value;mrTouch()">${st.last_booklet ? `<div class="tiny mut" style="margin-top:6px">Last sent for this store: <b>${esc(st.last_booklet)}</b></div>` : ""}</section>
  <section class="card mr-sec" id="mr-s-first5"><h2>5 · First 5 sales (BIR) ${mrReqTag}</h2><div class="mr-two"><div class="field"><label for="mr-f5">Result</label><select class="in" id="mr-f5" onchange="MR.form.first5=this.value;mrTouch()"><option value="" ${!f.first5 ? "selected" : ""}>— choose —</option>${first5}</select></div><div class="field"><label for="mr-time">Time checked</label><input class="in" id="mr-time" type="time" value="${esc(f.time)}" onchange="MR.form.time=this.value;mrTouch()"></div></div></section>
  <section class="card mr-sec" id="mr-s-col"><h2>6 · Columnar book <span class="tiny mut">optional</span></h2><div class="mr-two"><div class="field"><label for="mr-cols">Sales written in it (₱)</label><input class="in num" id="mr-cols" inputmode="decimal" placeholder="₱" value="${esc(f.colSales)}" oninput="this.value=this.value.replace(/[^0-9.]/g,'').replace(/(\\..*)\\./g,'$1');MR.form.colSales=this.value;mrTouch()"></div><div class="field"><label for="mr-cold">Date of the last entry</label><input class="in" id="mr-cold" type="date" value="${esc(f.colDate)}" onchange="MR.form.colDate=this.value;mrTouch()"></div></div></section>
  <section class="card mr-sec" id="mr-s-hyg"><div class="split"><h2>7 · Hygienics</h2><button type="button" class="btn sm ghost" onclick="mrHygClear()">Clear</button></div><div class="small mut">One score per area, 1 (bad) to 5 (very good). All 9 areas, or none. Tap a score again to take it back.</div>
    <div class="mr-htot" id="mr-htot"></div><div class="mr-areas">${hyg}</div>
    <div class="field" style="margin-top:12px"><label for="mr-hnote">Hygiene note</label><div class="tiny band-warn" id="mr-hlow" hidden>A score of 2 or less: write what is wrong, so it can be fixed.</div><textarea class="in" id="mr-hnote" placeholder="What is wrong, where" oninput="MR.form.hygNote=this.value;mrTouch()">${esc(f.hygNote)}</textarea></div></section>
  <section class="card mr-sec" id="mr-s-note"><h2>8 · Note</h2><textarea class="in" id="mr-note" placeholder="Anything the office should know" oninput="MR.form.note=this.value;mrTouch()">${esc(f.note)}</textarea></section>
  <section class="card mr-sec" id="mr-s-review"><h2>Review and send</h2><div id="mr-review"></div>
    <div id="mr-s-gap" ${f.gapAsked != null ? "" : "hidden"} class="mr-gap"><div class="field"><label for="mr-gapr" class="band-warn" id="mr-gapl">${mrGapText(f)}</label><textarea class="in" id="mr-gapr" placeholder="e.g. cash paid out for ice, a late ticket" oninput="MR.form.gapReason=this.value;mrTouch()">${esc(f.gapReason)}</textarea></div></div>
    <div id="mr-senderr"></div>
    <button class="btn primary full mr-send" id="mr-send" onclick="mrSend()">Send the morning run</button>
    <button class="btn ghost full" style="margin-top:6px" onclick="go('#/walk')">Back to the board (the draft stays)</button></section>
  <div class="bottom-act mr-bar" id="mr-bar"></div>`;
  setTimeout(mrLive, 0);
  return shell(esc(st.name), `${esc(dayLong(f.day))} · morning run`, body, { back: "#/walk" });
}

/* live parts: recomputed in place so typing never loses focus */
function mrLive() {
  const f = MR.form; if (!f) return; const st = mrStore(f.store); if (!st || !document.getElementById("mr-tot")) return;
  const chk = mrCheck(f, st), c = chk.c, $i = id => document.getElementById(id);
  $i("mr-tot").textContent = peso(c.total); $i("mr-fv").textContent = c.fund == null ? "—" : peso(c.fund);
  const se = $i("mr-sales"); se.textContent = c.sales == null || !c.total ? "—" : (c.sales < 0 ? "−" : "") + peso(Math.abs(c.sales)); se.className = "num" + (c.total && c.sales != null && c.sales < 0 ? " band-bad" : "");
  $i("mr-salesl").innerHTML = c.total && c.sales != null && c.sales < 0 ? `<span class="band-bad">Short: the drawer holds less than the fund. Count again, then tell the office.</span>` : c.fund == null && c.total ? `<span class="mut">Type the fund below to see the cash sales.</span>` : "";
  MR_DEN.forEach(d => { const e = $i("mr-cs-" + d); if (e) e.textContent = mrInt(f.cash[d]) ? peso(d * mrInt(f.cash[d])) : ""; });
  $i("mr-fundchip").innerHTML = c.fund == null ? (st.fund_standard != null ? `<span class="mut">Standard for this store: ${peso(st.fund_standard)}</span>` : `<span class="mut">No fund standard set for this store yet.</span>`) : mrFundChip(c.fund, st.fund_standard);
  st.items.forEach(it => { const e = $i("mr-qt-" + it.key); if (e) { const p = mrPieces(it, f.quick[it.key]); e.textContent = p || (it.unit_kind === "pcs" ? "pieces" : ""); } });
  const n = chk.n, tot = f.scores.reduce((a, b) => a + (b || 0), 0), hb = n === 9 ? hygBand(tot) : null;
  $i("mr-htot").innerHTML = n === 0 ? `<span class="mut">Not scored yet.</span>` : n < 9 ? `<b class="num">${tot}</b> <span class="mut">so far · ${n} of 9 areas</span>` : `<div><b class="num mr-hbig">${tot}</b><span class="mut">/45</span> ${chip(hb[1], hb[0])}</div>${hb[2] ? `<div class="small band-${hb[1]}" style="margin-top:4px">What follows: ${esc(hb[2])}</div>` : ""}`;
  document.querySelectorAll(".mr-area").forEach((el, i) => { const s = f.scores[i]; el.querySelectorAll(".mr-sc button").forEach((b, j) => { const on = s === j + 1; b.className = on ? "on s" + (j + 1) : ""; b.setAttribute("aria-pressed", on); }); const lw = el.querySelector(".mr-low"); lw.hidden = !(s && s <= 2); lw.textContent = `Score ${s}: add a note below what is wrong.`; });
  $i("mr-hlow").hidden = !(f.scores.some(x => x > 0 && x <= 2) && !f.hygNote.trim());
  /* review */
  const who = (sel, txt) => sel === "__other" ? (txt.trim() ? `${esc(txt.trim())} <span class="tiny band-warn">typed</span>` : "—") : sel ? esc(mrName(sel)) : `<span class="mut">—</span>`;
  const counted = st.items.filter(it => mrPieces(it, f.quick[it.key])).length;
  const kv = [["Drawer total", peso(c.total)], ["Cash fund", c.fund == null ? "—" : peso(c.fund) + " " + mrFundChip(c.fund, st.fund_standard)], ["Cash sales", c.sales == null || !c.total ? "—" : `<span class="${c.sales < 0 ? "band-bad" : ""}">${c.sales < 0 ? "−" : ""}${peso(Math.abs(c.sales))}</span>`],
    ["Endorsed → received", `${who(f.endorsed, f.endorsedText)} → ${who(f.received, f.receivedText)}`], ["Quick counts", `${counted} of ${st.items.length}`], ["OR booklet", esc(f.booklet.trim()) || "—"],
    ["First 5 sales", f.first5 ? `${esc(f.first5)}${f.time ? " · " + esc(f.time) : ""}` : `<span class="band-bad">—</span>`], ["Columnar", f.colSales ? `${peso(+f.colSales)}${f.colDate ? " · " + esc(dayName(f.colDate)) : ""}` : "—"],
    ["Hygienics", n === 9 ? `${tot}/45 ${chip(hb[1], hb[0])}` : n ? `<span class="band-bad">${n} of 9</span>` : "not done"], ["Note", esc(f.note.trim()) || "—"]];
  const li = (arr, cls) => arr.map(([sec, t]) => `<li><button type="button" class="${cls}" onclick="mrGoto('${sec}')">${esc(t)}</button></li>`).join("");
  $i("mr-review").innerHTML = `<dl class="mr-kv">${kv.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
    ${chk.req.length ? `<div class="mr-chk bad"><b>Missing — needed to send</b><ul>${li(chk.req, "")}</ul></div>` : `<div class="mr-chk ok"><b>${ic("check", "sm")} Ready to send</b></div>`}
    ${chk.soft.length ? `<div class="mr-chk warn"><b>Worth a look (can still send)</b><ul>${li(chk.soft, "")}</ul></div>` : ""}`;
  $i("mr-s-gap").hidden = f.gapAsked == null; $i("mr-gapl").textContent = mrGapText(f);
  $i("mr-senderr").innerHTML = MR.sendErr ? `<div class="alert bad" style="margin-bottom:10px">${esc(MR.sendErr)}</div>` : "";
  const sb2 = $i("mr-send"); sb2.disabled = MR.sending; sb2.textContent = MR.sending ? "Sending…" : (f.editOf ? "Send the corrected run" : "Send the morning run");
  $i("mr-bar").innerHTML = `<div class="mr-barin"><div class="mr-bt"><span class="num"><b>${peso(c.total)}</b> drawer</span><span class="tiny ${chk.req.length ? "band-bad" : "band-ok"}">${chk.req.length ? chk.req.length + " missing" : "ready"}</span></div><button class="btn primary" ${MR.sending ? "disabled" : ""} onclick="mrGoto('review')">Review &amp; send</button></div>`;
}
const mrGapText = f => (mrOwner() && f.gapAsked ? `Counted cash sales differ from UTAK cash by ${f.gapAsked > 0 ? "+" : "−"}${peso(Math.abs(f.gapAsked))}.` : "The counted cash does not match the till's record for yesterday.") + " Write a short reason, then send again."; /* role walk never sees the POS figure */
function mrGoto(sec) { const e = document.getElementById("mr-s-" + sec); if (e) { e.scrollIntoView({ behavior: "smooth", block: "start" }); e.classList.remove("mr-flash"); void e.offsetWidth; e.classList.add("mr-flash"); } }
function mrCash(d, el) { el.value = el.value.replace(/[^0-9]/g, "").slice(0, 5); MR.form.cash[d] = el.value; mrTouch(); }
function mrStep(d, by) { const v = Math.max(0, mrInt(MR.form.cash[d]) + by); MR.form.cash[d] = v ? String(v) : ""; const el = document.getElementById("mr-c-" + d); if (el) el.value = MR.form.cash[d]; mrTouch(); }
function mrFund(el) { el.value = el.value.replace(/[^0-9]/g, "").slice(0, 7); MR.form.fund = el.value; mrTouch(); }
function mrFundFill(v) { MR.form.fund = String(v); const el = document.getElementById("mr-fund"); if (el) el.value = MR.form.fund; mrTouch(); }
function mrWho(which, el) { MR.form[which] = el.value; const o = document.getElementById(`mr-${which}-o`); if (o) { o.hidden = el.value !== "__other"; if (el.value === "__other") { const i = o.querySelector("input"); if (i) i.focus(); } } mrTouch(); }
function mrQuick(key, part, el) { el.value = el.value.replace(/[^0-9]/g, "").slice(0, 5); const q = MR.form.quick[key] || (MR.form.quick[key] = {}); q[part] = el.value; mrTouch(); }
function mrScore(i, n) { MR.form.scores[i] = MR.form.scores[i] === n ? 0 : n; mrTouch(); }
function mrHygClear() { if (MR.form.scores.some(x => x) && !confirm("Clear all 9 hygiene scores?")) return; MR.form.scores = [0, 0, 0, 0, 0, 0, 0, 0, 0]; mrTouch(); }

function mrPayload(f, st) {
  const cash = {}; [1, 5, 10, 20, 50, 100, 200, 500, 1000].forEach(d => { cash[String(d)] = mrInt(f.cash[d]); });
  const who = (sel, txt) => sel === "__other" ? [null, txt.trim() || null] : sel ? [sel, null] : [null, null];
  const [ep, eb] = who(f.endorsed, f.endorsedText), [rp, rb] = who(f.received, f.receivedText);
  const quick = st.items.map(it => { const q = f.quick[it.key] || {};
    if (it.unit_kind === "pcs") return mrBlank(q.l) ? null : { key: it.key, loose: mrInt(q.l) };
    if (mrBlank(q.c) && mrBlank(q.l)) return null; return { key: it.key, cases: mrInt(q.c), loose: mrInt(q.l) }; }).filter(Boolean);
  const n = f.scores.filter(x => x > 0).length;
  return { store: f.store, day: f.day, client_id: f.client_id, fund: +f.fund, cash, endorsed_person: ep, received_person: rp, endorsed_by: eb, received_by: rb, quick,
    booklet_no: f.booklet.trim(), bir_first5: f.first5, bir_time: f.time || null, columnar_sales: mrBlank(f.colSales) || isNaN(+f.colSales) ? null : +f.colSales, columnar_date: mrBlank(f.colSales) ? null : (f.colDate || null),
    note: f.note.trim(), gap_reason: f.gapReason.trim() || null, hygiene: n === 9 ? { scores: f.scores.map(Number), note: f.hygNote.trim() } : null };
}
async function mrSend() {
  if (MR.sending || !MR.form) return; /* double-tap guard */
  const f = MR.form, st = mrStore(f.store), chk = mrCheck(f, st);
  if (chk.req.length) { MR.showReq = true; mrLive(); mrGoto(chk.req[0][0]); return; }
  MR.sending = true; MR.sendErr = null;
  if (!f.client_id) { f.client_id = mrUUID(); } mrPut(mrDraftKey(f.store, f.day), Object.assign({}, f, { saved: f.saved || new Date().toISOString() }));
  mrLive();
  const payload = mrPayload(f, st);
  const r = await mrRpc("submit_walk_run", { p: payload });
  MR.sending = false;
  if (r.net) { mrEnqueue(payload); MR.result = { store: f.store, day: f.day, queued: true, payload }; go(`#/walk/${f.store}/sent`); return; }
  if (r.error) {
    const g = /GAP_REASON_REQUIRED\s*(-?[\d.]+)?/.exec(r.error.message || "");
    if (g) { f.gapAsked = g[1] != null ? +g[1] : 0; mrSaveDraft(); mrLive(); setTimeout(() => { mrGoto("gap"); const t = document.getElementById("mr-gapr"); if (t) t.focus({ preventScroll: true }); }, 50); return; }
    MR.sendErr = mrFriendly(r.error.message, payload); mrLive(); mrGoto("review"); return;
  }
  mrSent(payload); /* drops the draft unless something was typed while it was sending */
  MR.result = { store: f.store, day: f.day, data: r.data || {}, payload }; MR.form = null; MR.formKey = null; MR.restored = false;
  /* mark the store done at once, then refresh from the server */
  const sto = mrStore(f.store); if (sto && f.day === MR.setup.day && r.data) sto.today = Object.assign({}, sto.today || {}, { created: new Date().toISOString(), fund: payload.fund, cash_total: r.data.cash_total, cash_sales: r.data.cash_sales, endorsed_person: payload.endorsed_person, received_person: payload.received_person, endorsed_by: payload.endorsed_by, received_by: payload.received_by, hygiene: r.data.hygiene ? { total: r.data.hygiene.total, band: r.data.hygiene.band } : (sto.today && sto.today.hygiene) || null });
  MR.setupAt = 0; setTimeout(mrLoad, 300);
  go(`#/walk/${f.store}/sent`);
}

/* result card */
function mrNext(code) { const ss = mrStores(), i = ss.findIndex(s => s.code === code), q = mrQueue(), d = mrDay();
  for (let k = 1; k <= ss.length; k++) { const s = ss[(i + k) % ss.length]; if (s.code === code) break; if (!mrToday(s) && !q.some(e => e.payload.store === s.code && e.payload.day === d)) return s; } return null; }
function mrViewResult(st) {
  const R = MR.result;
  if (!R || R.store !== st.code) { setTimeout(() => go(`#/walk/${st.code}`), 0); return shell(esc(st.name), "", ""); }
  const nx = mrNext(st.code);
  const btns = `<div class="mr-btns">${nx ? `<button class="btn primary full" onclick="MR.result=null;go('#/walk/${nx.code}')">Next store: ${esc(nx.name)} ›</button>` : ""}<button class="btn ${nx ? "" : "primary"} full" onclick="MR.result=null;go('#/walk')">Back to the board</button></div>`;
  if (R.queued) return shell(esc(st.name), dayLong(R.day), `<section class="card mr-res warnbox"><div>${chip("warn", "Saved on this device")}</div><h2 style="margin-top:10px">No internet — the run waits here</h2><div class="small">It sends by itself when the internet is back, for <b>${esc(dayLong(R.day))}</b> as typed. Walk on. You can also tap <b>Send now</b> on the board later.</div></section>${btns}`, { back: "#/walk" });
  const d = R.data, p = R.payload, owner = mrOwner();
  const fs = d.fund_state === "ok" ? chip("ok", "fund matches the standard") : d.fund_state === "differs" ? chip("warn", `fund ${peso(p.fund)} differs from the standard ${peso(d.fund_standard)}`) : chip("", "no fund standard set yet");
  const h = d.hygiene, hb = h ? hygBand(h.total) : null;
  return shell(esc(st.name), dayLong(R.day), `<section class="card mr-res"><div>${chip("ok", d.duplicate ? "Already received" : d.edited ? "Correction saved" : "Sent")}</div>
    <h2 style="margin-top:10px">${d.duplicate ? "The server already had this run — nothing changed." : d.edited ? "Saved as a correction. The first version is kept." : "Morning run sent."}</h2>
    <div class="mr-sum"><div><span>Drawer</span><b class="num">${peso(d.cash_total)}</b></div><div><span>Fund</span><b class="num">${peso(p.fund)}</b></div><div><span>Cash sales</span><b class="num ${d.cash_sales < 0 ? "band-bad" : ""}">${d.cash_sales < 0 ? "−" : ""}${peso(Math.abs(d.cash_sales))}</b></div></div>
    <div class="mr-chips">${fs}</div>
    ${owner && d.gap != null ? `<div class="small" style="margin-top:8px">Against UTAK cash: <b class="${Math.abs(d.gap) > ((MR.setup.settings || {}).cash_gap_threshold || 0) ? "band-warn" : ""}">${d.gap > 0 ? "+" : d.gap < 0 ? "−" : ""}${peso(Math.abs(d.gap))}</b>${p.gap_reason ? ` · reason: ${esc(p.gap_reason)}` : ""}</div>` : ""}
    <div class="mr-hres">${h ? `<div><b class="num mr-hbig">${h.total}</b><span class="mut">/45</span> ${chip(hb[1], esc(h.band))}</div>${h.consequence ? `<div class="small band-${hb[1]}" style="margin-top:4px">What follows: ${esc(h.consequence)}</div>` : `<div class="small mut" style="margin-top:4px">Nothing follows.</div>`}` : `<div class="small mut">No hygienics in this run. Add them later: open the store and send a correction.</div>`}</div></section>${btns}`, { back: "#/walk" });
}
