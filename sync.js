/* sync.js — the store's own records live in the database (migration 016, 2026-11-03). Loaded after data.js, before the views.
   S (Store) stays the in-memory working copy every screen already uses. This file makes it a cache of the database instead of the record:
     boot    → os_load() replaces receipts, counts, tickets, tasks, cash, checklist runs and transfers with the database's rows (every phone sees the same store)
     save()  → every changed or new record is queued in an outbox (localStorage, survives a closed app) and sent with os_submit(); a retry is safe (client_id)
     photos  → the camera capture is uploaded to the private 'photos' bucket; records carry the path, the phone keeps a thumbnail; other phones fetch a signed link
   Without a database (dev.html, or a login that is not a member) nothing here runs and the app behaves as before, on this device only.
   What is NOT synced: the count draft (S.draft) until it is sent, the theme, the chosen name. */

const Sync = {
  on: false, outbox: [], snap: {}, photos: {}, busy: false, err: null, lastOk: null, lastLoad: null, failed: {},
  K: { outbox: "p99os_outbox", snap: "p99os_synced", photos: "p99os_photo_paths" },
  get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } },
  put(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },

  /* ---------- boot: the database is the record ---------- */
  init(L) {
    this.outbox = this.get(this.K.outbox) || []; this.snap = this.get(this.K.snap) || {}; this.photos = this.get(this.K.photos) || {};
    this.on = true;
    if (L && !L.dev) {
      const st = Store.load();
      const pending = {}; this.outbox.forEach(o => pending[o.kind + ":" + o.rec.id] = o.rec); /* a record typed here and not yet sent beats the server copy */
      const photoId = path => path ? String(path).split("/").pop().replace(/\.jpg$/, "") : null;
      const regPhoto = path => { const id = photoId(path); if (id) this.photos[id] = path; return id; };
      const arr = (kind, rows, fix) => (rows || []).map(r => { fix && fix(r); return pending[kind + ":" + r.id] || r; });
      st.receipts = arr("receipt", L.receipts, r => { r.photo = regPhoto(r.photo_path); r.amount = r.amount == null ? null : +r.amount; r.lines.forEach(l => { l.qty = +l.qty; if (l.price != null) l.price = +l.price; }); });
      st.counts = arr("count", L.counts, r => { for (const k in r.lines) r.lines[k] = +r.lines[k]; r.submitted = r.submitted ? this.local(r.submitted) : r.submitted; r.started = r.started ? this.local(r.started) : r.started; });
      st.tickets = arr("ticket", L.tickets, r => { r.photo = regPhoto(r.photo_path); r.fixPhoto = regPhoto(r.fix_photo_path); r.created = this.local(r.created); if (r.closed) r.closed = this.local(r.closed); });
      st.tasks = arr("task", L.tasks, r => { r.created = this.local(r.created); if (r.done_at) r.done_at = this.local(r.done_at); });
      st.cash = arr("cash", L.cash, r => { r.photo = regPhoto(r.photo_path); r.total = +r.total; ["fund", "pos", "pos_gcash", "gcash", "variance"].forEach(k => { if (r[k] != null) r[k] = +r[k]; }); r.at = this.local(r.at); for (const k in r.d) r.d[k] = +r.d[k]; });
      st.runs = {}; Object.keys(L.runs || {}).forEach(k => { const r = L.runs[k]; const ph = {}; Object.keys(r.ph || {}).forEach(pk => { const id = regPhoto(r.ph[pk]); if (id) ph[pk] = id; }); Object.values(r.done || {}).forEach(d => { if (d.at) d.at = this.local(d.at); }); st.runs[k] = pending["checklist_run:" + k] || { done: r.done || {}, ph }; });
      st.transfers = arr("transfer", L.transfers, r => { r.photo = regPhoto(r.photo_path); r.lines.forEach(l => { if (l.released != null) l.released = +l.released; if (l.received != null) l.received = +l.received; }); });
      st.locations = L.locations || []; st.held = (L.held || []).map(h => ({ location: h.location, item: h.item, on_hand: +h.on_hand, count_units: h.count_units == null ? null : +h.count_units }));
      /* the HR to-do list seeded in data.js becomes real to-dos once, the first time an owner or lead opens the app with an empty task table */
      if (!st.tasks.length && typeof SEED_TASKS !== "undefined" && ["master", "lead"].includes(window.DB_ROLE)) st.tasks = SEED_TASKS.map(t => Object.assign({}, t, { created: t.created || Sync.local(new Date().toISOString()) }));
      const seeded = st.tasks.filter(t => !t.synced && /^k-\d{1,2}$/.test(t.id)).map(t => "task:" + t.id);
      this.snapAll(); seeded.forEach(k => delete this.snap[k]); this.lastLoad = new Date(); Store.save();
      this.fetchPhotos();
    } else { const st = Store.load(); st.transfers = st.transfers || []; st.locations = st.locations || [{ code: "P99", name: "Pizza 99", kind: "store" }, { code: "HO", name: "Head Office", kind: "office" }, { code: "DC", name: "Dragon Crepe", kind: "store" }, { code: "MCC", name: "My Crepes Cafe", kind: "store" }, { code: "MCBC", name: "My Crepes Beach Club", kind: "store" }, { code: "BK", name: "Burger Kong", kind: "store" }]; st.held = st.held || []; }
    const orig = Store.save.bind(Store); Store.save = () => { orig(); if (Sync.on) Sync.collect(); };
    window.addEventListener("online", () => this.flush());
    setInterval(() => { if (this.outbox.length && !this.busy) this.flush(); }, 45000);
    this.collect();
  },
  local(iso) { if (!iso) return iso; const d = new Date(iso); if (isNaN(d)) return iso; const p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; },

  /* ---------- what gets sent: the record in the server's shape ---------- */
  /* app clocks are local "YYYY-MM-DDTHH:MM" (nowISO); the database keeps instants, so the zone goes with them */
  ts(s) { if (!s || typeof s !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(s) || /(Z|[+-]\d\d:?\d\d)$/.test(s)) return s || null; const d = new Date(s); return isNaN(d) ? s : d.toISOString(); },
  payload(kind, r) {
    const ph = id => id ? (this.photos[id] || null) : null; const ts = s => this.ts(s); const log = l => (l || []).map(e => Object.assign({}, e, { at: ts(e.at) })); const unit = id => { const it = typeof Store !== "undefined" && Store.item(id); return it ? it.unit : null; };
    if (kind === "receipt") return { id: r.id, day: r.day, kind: r.kind, supplier: r.supplier, by: r.by, photo_path: ph(r.photo), amount: r.amount, location: r.location || null, invoice: r.invoice || null, lines: r.lines.map(l => ({ item: l.item, qty: l.qty, unit: unit(l.item), text: l.text || null, price: l.price == null ? null : l.price })) };
    if (kind === "count") { const units = {}; Object.keys(r.lines).forEach(k => units[k] = unit(k)); return { id: r.id, day: r.day, kind: r.kind, by: r.by, started: ts(r.started), submitted: ts(r.submitted), note: r.note || null, lines: r.lines, text: r.text || {}, units, var: r.var || null }; }
    if (kind === "ticket") return { id: r.id, title: r.title, note: r.note || null, priority: r.priority, status: r.status, by: r.by, created: ts(r.created), photo_path: ph(r.photo), fix_photo_path: ph(r.fixPhoto), assigned: r.assigned || null, scheduled: r.scheduled || null, closed: ts(r.closed), closed_note: r.closed_note || null, log: log(r.log) };
    if (kind === "task") return { id: r.id, title: r.title, detail: r.detail || null, owner: r.owner || null, due: r.due || null, status: r.status, source: r.source || null, created: ts(r.created), done_at: ts(r.done_at), log: log(r.log) };
    if (kind === "cash") return { id: r.id, day: r.day, kind: r.kind, d: r.d, total: r.total, fund: r.fund, pos: r.pos, pos_gcash: r.pos_gcash, gcash: r.gcash, ref: r.ref || null, photo_path: ph(r.photo), variance: r.variance, reason: r.reason || null, by: r.by, at: ts(r.at) };
    if (kind === "checklist_run") { const phs = {}; Object.keys(r.ph || {}).forEach(k => { const p = ph(r.ph[k]); if (p) phs[k] = p; }); const done = {}; Object.keys(r.done || {}).forEach(k => done[k] = Object.assign({}, r.done[k], { at: ts(r.done[k].at) })); return { id: r.id, done, ph: phs }; }
    if (kind === "transfer") { const side = r._side || (r.received_at ? "receive" : "release"); return { id: r.id, from: r.from, to: r.to, day: r.day, side, by: side === "release" ? r.released_by : r.received_by, at: ts(side === "release" ? r.released_at : r.received_at), note: side === "release" ? r.released_note : r.received_note, photo_path: ph(r.photo), lines: r.lines.map(l => ({ item: l.item, qty: side === "release" ? l.released : l.received, unit: unit(l.item), text: l.text || null })).filter(l => l.qty != null) }; }
    return null;
  },
  each(fn) {
    const st = Store.load();
    (st.receipts || []).forEach(r => { if (!/^r-0[89]\d\d[a-z]?$/.test(r.id)) fn("receipt", r); });            /* seed rows from the chat stay out of the database */
    (st.counts || []).forEach(r => { if (r.submitted && !r.seed) fn("count", r); });
    (st.tickets || []).forEach(r => fn("ticket", r));
    (st.tasks || []).forEach(r => fn("task", r));
    (st.cash || []).forEach(r => { if (!r.id) r.id = "cash-" + r.day + "-" + String(r.at || "").replace(/\D/g, ""); fn("cash", r); });
    Object.keys(st.runs || {}).forEach(k => { const r = st.runs[k]; if (r && r.done && Object.keys(r.done).length) fn("checklist_run", Object.assign({ id: k }, r)); });
    (st.transfers || []).forEach(r => { if (r._side) fn("transfer", r); });
  },
  snapAll() { this.snap = {}; this.each((k, r) => { if (r.synced !== false) this.snap[k + ":" + r.id] = JSON.stringify(this.payload(k, r)); }); this.put(this.K.snap, this.snap); },
  /* after every save: anything whose server shape differs from the last synced shape goes to the outbox */
  collect() {
    let n = 0;
    this.each((kind, r) => { const key = kind + ":" + r.id, j = JSON.stringify(this.payload(kind, r)); if (this.snap[key] === j) return;
      const i = this.outbox.findIndex(o => o.kind === kind && o.rec.id === r.id); const entry = { kind, rec: JSON.parse(j), at: Date.now() };
      if (i >= 0) this.outbox[i] = entry; else this.outbox.push(entry); n++; });
    if (n) { this.put(this.K.outbox, this.outbox); this.flush(); }
  },
  async flush() {
    if (!this.on || this.busy || !this.outbox.length || typeof sb === "undefined" || !sb.rpc) return; this.busy = true; this.err = null;
    try {
      while (this.outbox.length) {
        const o = this.outbox[0]; let res;
        try { res = await sb.rpc("os_submit", { p: { kind: o.kind, rec: o.rec, store: "P99" } }); } catch (e) { res = { error: e }; }
        if (res.error) { const msg = res.error.message || String(res.error); const net = /fetch|network|timed? ?out|load failed/i.test(msg);
          this.err = msg; if (net) break;                                             /* offline: keep everything, try again later */
          this.failed[o.kind + ":" + o.rec.id] = msg; this.outbox.shift(); continue; /* the server refused this one: drop it from the queue, keep the reason */
        }
        this.snap[o.kind + ":" + o.rec.id] = JSON.stringify(o.rec); delete this.failed[o.kind + ":" + o.rec.id]; this.outbox.shift(); this.lastOk = new Date();
        const st = Store.load(); const col = { receipt: "receipts", count: "counts", ticket: "tickets", task: "tasks", cash: "cash", transfer: "transfers" }[o.kind];
        if (col) { const rec = (st[col] || []).find(x => x.id === o.rec.id); if (rec) { rec.synced = true; if (o.kind === "transfer") { if (res.data && res.data.status) rec.status = res.data.status; delete rec._side; } } }
      }
      this.put(this.K.outbox, this.outbox); this.put(this.K.snap, this.snap);
    } finally { this.busy = false; if (typeof render === "function" && /#\/(more|today|transfers?)/.test(location.hash || "#/today")) render(); }
  },
  pending() { return this.outbox.length; },
  state() { const n = this.pending(), f = Object.keys(this.failed).length; return { n, f, err: this.err, label: n ? `${n} waiting to save${this.err ? " · " + (navigator.onLine ? "retrying" : "offline") : ""}` : f ? `${f} refused by the database` : "all saved", cls: n ? "warn" : f ? "bad" : "ok" }; },

  /* ---------- photos ---------- */
  async upload(id) {
    if (!this.on || typeof sb === "undefined" || !sb.storage) return; const data = Store.load().photos[id]; if (!data || !data.startsWith("data:")) return;
    try { const blob = await (await fetch(data)).blob(); const path = `P99/${id}.jpg`;
      const { error } = await sb.storage.from("photos").upload(path, blob, { contentType: "image/jpeg", upsert: true }); if (error) throw error;
      this.photos[id] = path; this.put(this.K.photos, this.photos); this.collect();                /* records that carry this photo now get their path */
    } catch (e) { this.err = "photo not uploaded: " + (e.message || e); setTimeout(() => this.upload(id), 30000); }
  },
  async fetchPhotos() {
    if (typeof sb === "undefined" || !sb.storage) return; const st = Store.load(); st.photos = st.photos || {};
    const need = Object.keys(this.photos).filter(id => !st.photos[id] || /^https?:/.test(st.photos[id])); if (!need.length) return;
    try { const { data } = await sb.storage.from("photos").createSignedUrls(need.map(id => this.photos[id]), 3600);
      (data || []).forEach((d, i) => { if (d && d.signedUrl) st.photos[need[i]] = d.signedUrl; });
      if (typeof render === "function") render();
    } catch (e) { /* thumbnails stay empty; the record is still there */ }
  },
  /* a fresh read of the database (More → Refresh); local unsent records are kept */
  async reload() { if (typeof sb === "undefined" || !sb.rpc) return; const { data, error } = await sb.rpc("os_load", { p_store: "P99", p_days: 120 }); if (error) { this.err = error.message; return; } const ob = this.outbox; this.init(data); this.outbox = ob; this.put(this.K.outbox, ob); if (typeof render === "function") render(); },
};
/* the camera capture goes to the bucket as soon as it is taken; app.js (loaded after this file) calls hookPhoto() once takePhoto exists */
Sync.hookPhoto = function () { if (typeof takePhoto !== "function" || takePhoto._synced) return; const _takePhoto = takePhoto; takePhoto = function (cb) { _takePhoto(id => { Sync.upload(id); cb(id); }); }; takePhoto._synced = true; };
Sync.hookPhoto();
if (window.OS_LOADED) Sync.init(window.OS_LOADED);
