/* papers-v2.js — Papers: every place's facts and its permits checklist (v0.23.0, 2026-11-16, migration 036).
   Stefan, 15 Nov: "we want the operating system to … exactly know how much the rent is, the square meters, the address, the renewal date,
   if the fire permit is uploaded … pretty much a checklist." One page per place (the five stores, Head Office, D'Mall Storage).
   Data: location, site_fact (address, m², landlord, lease, renewal), site_rent (rent, deposit; not for the officer, 042), paper_type (the checklist), paper (one row per
   uploaded paper, with issue and expiry date; "many" types hold one row per staff member or extinguisher). Files: bucket 'papers', private.
   Who: owners, the office (admin, finance) and the admin officer. Online only: every save goes straight to the database. */

const PAP = { state: "idle", locs: [], facts: {}, rent: {}, types: [], papers: [], err: "" };
let papSheet = null, papBusy = false;
const papDev = () => typeof sb === "undefined" || (window.OS_LOADED && window.OS_LOADED.dev);
const papOK = () => ["master", "admin", "finance", "officer"].includes(window.DB_ROLE) || !window.DB_ROLE;
const papRentOK = () => !window.DB_ROLE || ["master", "admin", "finance"].includes(window.DB_ROLE);   /* v0.23.3 (migration 042, Stefan: rent not for Hannah): rent, deposit and rent notes live in site_rent, which the officer cannot read */
const papRent = loc => PAP.rent[loc] || {};

async function papLoad(force) {
  if (PAP.state === "loading" || (["ok", "fail"].includes(PAP.state) && !force)) return;   /* a failed load waits for "Try again", never loops */
  PAP.state = "loading";
  try {
    if (papDev()) { const d = await fetch("dev-papers.json").then(r => r.json()); Object.assign(PAP, { locs: d.location, types: d.paper_type, papers: d.paper || [] }); PAP.facts = {}; (d.site_fact || []).forEach(f => PAP.facts[f.location] = f); PAP.rent = {}; if (papRentOK()) (d.site_rent || []).forEach(x => PAP.rent[x.location] = x); }
    else {
      const [a, b, c, e] = await Promise.all([sb.from("location").select("code,name,kind,active,sort").eq("active", true).order("sort"), sb.from("site_fact").select("*"),
        sb.from("paper_type").select("*").eq("active", true).order("sort"), sb.from("paper").select("*").order("created", { ascending: false })]);
      const bad = [a, b, c, e].find(x => x.error); if (bad) throw bad.error;
      PAP.locs = a.data; PAP.facts = {}; b.data.forEach(f => PAP.facts[f.location] = f); PAP.types = c.data; PAP.papers = e.data;
      PAP.rent = {}; if (papRentOK()) { const rr = await sb.from("site_rent").select("*"); if (!rr.error) rr.data.forEach(x => PAP.rent[x.location] = x); }
    }
    PAP.state = "ok";
  } catch (x) { PAP.state = "fail"; PAP.err = x.message || String(x); }
  if (/^#\/papers/.test(location.hash)) render();
}

/* ---------- status ---------- */
const PAP_ORDER = ["P99", "MCC", "DC", "STO", "MCBC", "BK", "DH", "HO", "OK", "SP"];   /* places in one building sit together (037) */
const papLocs = () => PAP.locs.filter(l => ["store", "office", "storage"].includes(l.kind)).sort((a, b) => (PAP_ORDER.indexOf(a.code) + 99) % 99 - (PAP_ORDER.indexOf(b.code) + 99) % 99);
const papLocName = c => ((PAP.locs.find(l => l.code === c) || {}).name) || c;
const papDays = d => d ? Math.round((new Date(d + "T00:00:00") - new Date(today() + "T00:00:00")) / 864e5) : null;
const papDate = d => d ? new Date(d + "T00:00:00").toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" }) : "";
function papRowState(p) {   /* one uploaded paper */
  if (!p.file_path) return "missing";
  const n = papDays(p.expires); if (n == null) return "ok";
  return n < 0 ? "expired" : n <= 30 ? "d30" : n <= 60 ? "d60" : "ok";
}
const PAP_RANK = { expired: 0, missing: 1, d30: 2, d60: 3, ok: 4, skip: 5 };
function papState(loc, t) {   /* one line of a place's checklist */
  const rows = PAP.papers.filter(p => p.location === loc && p.type === t.code);
  if (rows.some(p => p.not_needed)) return { s: "skip", rows: [] };
  const live = rows.filter(p => !p.not_needed);
  const kind = (PAP.locs.find(l => l.code === loc) || {}).kind;
  if (!live.length) return { s: t.stores_only && kind !== "store" ? "skip" : "missing", rows: [], auto: t.stores_only && kind !== "store" };
  if (t.many) { const s = live.map(papRowState).sort((a, b) => PAP_RANK[a] - PAP_RANK[b])[0]; return { s, rows: live, next: live.map(p => p.expires).filter(Boolean).sort()[0] }; }
  const cur = live.slice().sort((a, b) => String(b.issued || b.created).localeCompare(String(a.issued || a.created)))[0];
  return { s: papRowState(cur), rows: [cur], next: cur.expires };
}
const papChip = s => ({ expired: chip("bad", "Expired"), missing: chip("bad", "Missing"), d30: chip("warn", "Within 30 days"), d60: chip("warn", "Within 60 days"), ok: chip("ok", "Uploaded"), skip: `<span class="tiny mut">Not needed</span>` })[s];
function papSummary(loc) {
  const out = { missing: 0, soon: 0, expired: 0, total: 0, next: null };
  PAP.types.forEach(t => { const x = papState(loc, t); if (x.s === "skip") return; out.total++;
    if (x.s === "missing") out.missing++; else if (x.s === "expired") out.expired++; else if (x.s === "d30" || x.s === "d60") out.soon++;
    if (x.next && (!out.next || x.next < out.next)) out.next = x.next; });
  const f = PAP.facts[loc] || {}; [f.lease_end, f.renewal_day].filter(Boolean).forEach(d => { if (!out.next || d < out.next) out.next = d; });
  return out;
}
const papMates = loc => { const b = (PAP.facts[loc] || {}).building; const m = b ? Object.values(PAP.facts).filter(f => f.building === b && f.location !== loc).map(f => papLocName(f.location)) : []; return m.length ? `<div class="tiny mut">with ${m.map(esc).join(", ")} · rent kept apart</div>` : ""; };
const papPeso = v => v == null || v === "" ? "—" : peso(+v);

/* ---------- the overview ---------- */
function viewPapers(loc) {
  if (!papOK()) return shell("Papers", "", `<div class="alert info">For the office and the owners.</div>`, { back: "#/today" });
  papLoad();
  if (PAP.state !== "ok") return shell("Papers", "permits, lease and rent per place", PAP.state === "fail" ? `<div class="alert bad">Could not load: ${esc(PAP.err)} <button class="btn sm" onclick="papLoad(true)">Try again</button></div>` : `<section class="card mut small">Loading…</section>`);
  if (loc) return viewPaperPlace(loc);
  const locs = papLocs(), sums = locs.map(l => [l, papSummary(l.code), PAP.facts[l.code] || {}]);
  const tot = sums.reduce((a, [, s]) => ({ missing: a.missing + s.missing, soon: a.soon + s.soon, expired: a.expired + s.expired }), { missing: 0, soon: 0, expired: 0 });
  const rentOK = papRentOK(), rents = locs.filter(l => papRent(l.code).rent_month != null), rentSum = rents.reduce((a, l) => a + +papRent(l.code).rent_month, 0);
  const leases = sums.filter(([, , f]) => f.lease_end && papDays(f.lease_end) <= 90).length;
  const tile = (lab, val, sub, cls = "") => `<div class="card kt"><div class="lab">${lab}</div><div class="val num ${cls}">${val}</div><div class="trend">${sub}</div></div>`;
  /* what needs doing: expired and due first, by date; then the missing ones per place */
  const due = [];
  locs.forEach(l => PAP.types.forEach(t => { const x = papState(l.code, t);
    if (["expired", "d30", "d60"].includes(x.s)) x.rows.filter(p => ["expired", "d30", "d60"].includes(papRowState(p))).forEach(p => due.push([p.expires, l, t, p])); }));
  locs.forEach(l => { const f = PAP.facts[l.code] || {}; [["Lease ends", f.lease_end], ["Lease renewal", f.renewal_day]].forEach(([lab, d]) => { const n = papDays(d); if (d && n <= 90) due.push([d, l, { name: lab, code: "_fact" }, null]); }); });
  due.sort((a, b) => a[0].localeCompare(b[0]));
  const dueRows = due.map(([d, l, t, p]) => { const n = papDays(d);
    return `<tr onclick="go('#/papers/${l.code}')"><td class="nm">${esc(t.name)}${p && p.label ? ` <small>${esc(p.label)}</small>` : ""}<div class="sub2" style="white-space:normal;max-width:none">${esc(l.name)} · ${papDate(d)}</div></td><td class="h1">${esc(l.name)}</td><td class="h1">${papDate(d)}</td><td class="n">${n < 0 ? chip("bad", `${-n} d ago`) : chip("warn", `in ${n} d`)}</td></tr>`; }).join("");
  const rows = sums.map(([l, s, f]) => `<tr onclick="go('#/papers/${l.code}')" tabindex="0" onkeydown="if(event.key==='Enter')go('#/papers/${l.code}')">
      <td class="nm">${esc(l.name)}<div class="sub2" style="white-space:normal;max-width:none">${esc(f.building || f.address || "no address yet")}</div></td><td class="h1 mut wrapc">${esc(f.address || "—")}${f.building ? `<div class="tiny">${esc(f.building)}</div>` : ""}</td>
      ${rentOK ? `<td class="n num">${papPeso(papRent(l.code).rent_month)}</td>` : ""}<td class="n num h1">${f.floor_m2 ? fmt(+f.floor_m2) + " m²" : "—"}</td>
      <td class="n">${s.missing ? chip("bad", s.missing) : chip("ok", 0)}</td><td class="n">${s.expired ? chip("bad", s.expired) : ""}${s.soon ? chip("warn", s.soon) : ""}${!s.expired && !s.soon ? `<span class="tiny mut">—</span>` : ""}</td>
      <td class="n h1">${s.next ? papDate(s.next) : "—"}</td><td class="n mut" style="width:24px">›</td></tr>`).join("");
  return shell("Papers", "permits, lease and rent per place", `
    <div class="grid2">${tile("Missing", tot.missing, `papers in ${sums.filter(([, s]) => s.missing).length} places`, tot.missing ? "band-bad" : "")}
      ${tile("Expiring", tot.soon + tot.expired, tot.expired ? `${tot.expired} already expired` : "within 60 days", tot.expired ? "band-bad" : "")}
      ${rentOK ? tile("Rent per month", peso(rentSum), `${rents.length} of ${locs.length} places known`) : tile("Leases", leases, "ending within 90 days")}
      ${tile("Places", locs.length, `${new Set(sums.map(([, , f]) => f.building).filter(Boolean)).size} shared buildings`)}</div>
    ${dueRows ? `<section class="card"><h2>Coming up</h2><div class="itwrap"><table class="itbl"><thead><tr><th>Paper</th><th class="h1">Place</th><th class="h1">Date</th><th class="n">When</th></tr></thead><tbody>${dueRows}</tbody></table></div></section>` : ""}
    <section class="card"><h2>Places</h2><div class="itwrap"><table class="itbl"><thead><tr><th>Place</th><th class="h1">Address</th>${rentOK ? `<th class="n">Rent / month</th>` : ""}<th class="n h1">Area</th><th class="n">Missing</th><th class="n">Expiring</th><th class="n h1">Next date</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="tiny mut" style="margin-top:8px">Rent from the books where the lease is not in yet. Open a place to upload papers and fill in its facts.</div></section>`);
}

/* ---------- one place ---------- */
function viewPaperPlace(loc) {
  const l = PAP.locs.find(x => x.code === loc); if (!l) return shell("Papers", "", `<div class="alert info">No such place.</div>`, { back: "#/papers" });
  const f = PAP.facts[loc] || {}, s = papSummary(loc);
  const fact = (lab, val) => `<tr><td style="font-weight:500;color:var(--mut);width:34%">${lab}</td><td style="white-space:normal">${val}</td></tr>`;
  const leaseN = papDays(f.lease_end);
  const facts = `<table class="itbl"><tbody>
    ${fact("Address", esc(f.address || "—"))}${f.building ? fact("Building", esc(f.building) + papMates(loc)) : ""}${fact("Floor area", f.floor_m2 ? fmt(+f.floor_m2) + " m²" : "—")}${fact("Landlord", esc(f.landlord || "—"))}
    ${papRentOK() ? fact("Rent / month", `<b class="num">${papPeso(papRent(loc).rent_month)}</b>${papRent(loc).rent_note ? `<div class="tiny mut" style="white-space:normal">${esc(papRent(loc).rent_note)}</div>` : ""}`) + fact("Deposit", `<span class="num">${papPeso(papRent(loc).deposit)}</span>`) : ""}
    ${fact("Lease", f.lease_start || f.lease_end ? `${papDate(f.lease_start) || "?"} – ${papDate(f.lease_end) || "?"}${leaseN != null && leaseN <= 90 ? " " + (leaseN < 0 ? chip("bad", "ended") : chip("warn", `ends in ${leaseN} d`)) : ""}` : "—")}
    ${fact("Renewal", f.renewal_day ? papDate(f.renewal_day) : "—")}${f.note ? fact("Note", esc(f.note)) : ""}</tbody></table>`;
  const rows = PAP.types.map(t => { const x = papState(loc, t);
    const det = t.many ? (x.rows.length ? `${x.rows.length} on file` : "") : x.rows[0] ? [x.rows[0].label, x.rows[0].file_name ? "file uploaded" : "no file yet"].filter(Boolean).join(" · ") : "";
    return `<tr onclick="papOpen('${loc}','${t.code}')" tabindex="0" onkeydown="if(event.key==='Enter')papOpen('${loc}','${t.code}')" class="${x.s === "skip" ? "mut" : ""}">
      <td class="nm">${esc(t.name)}<div class="sub2" style="white-space:normal;max-width:none">${esc(det || t.sub || "")}</div></td><td class="h1 mut wrapc">${esc(t.sub || "")}</td>
      <td>${papChip(x.s)}</td><td class="n">${x.next ? papDate(x.next) : "—"}</td><td class="n mut" style="width:24px">›</td></tr>`; }).join("");
  return shell(esc(l.name), `${s.total - s.missing - s.expired} of ${s.total} papers in${s.soon ? ` · ${s.soon} expiring` : ""}`, `
    <section class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h2 style="margin:0">Place</h2><button class="btn sm" onclick="papFacts('${loc}')">Edit</button></div><div class="itwrap" style="margin-top:8px">${facts}</div></section>
    <section class="card"><h2>Checklist</h2><div class="itwrap"><table class="itbl"><thead><tr><th>Paper</th><th class="h1">What it is</th><th>Status</th><th class="n">Expires</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></section>
    ${papSheetHTML()}`, { back: "#/papers" });
}

/* ---------- sheets: place facts, one paper ---------- */
function papFacts(loc) { papSheet = { kind: "facts", loc }; render(); }
function papOpen(loc, type) { papSheet = { kind: "paper", loc, type, edit: null }; render(); }
function papEdit(id) { papSheet.edit = id; render(); }
function papSheetHTML() {
  if (!papSheet) return "";
  const close = `<button class="btn ghost" onclick="papSheet=null;render()">Close</button>`;
  const inp = (id, lab, val, type = "text", extra = "") => `<div class="field"><label for="${id}">${lab}</label><input class="in" id="${id}" type="${type}" value="${esc(val == null ? "" : val)}" ${extra}></div>`;
  let body;
  if (papSheet.kind === "facts") {
    const f = PAP.facts[papSheet.loc] || {};
    body = `<h2>${esc(papLocName(papSheet.loc))}</h2>
      ${inp("pf-ad", "Address", f.address)}${inp("pf-bld", "Building (places that share one get the same name)", f.building)}<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 10px">${inp("pf-m2", "Floor area (m²)", f.floor_m2, "text", 'inputmode="decimal"')}${inp("pf-ll", "Landlord", f.landlord)}
      ${papRentOK() ? inp("pf-rent", "Rent per month (₱)", papRent(papSheet.loc).rent_month, "text", 'inputmode="decimal"') + inp("pf-dep", "Deposit (₱)", papRent(papSheet.loc).deposit, "text", 'inputmode="decimal"') : ""}
      ${inp("pf-ls", "Lease start", f.lease_start, "date")}${inp("pf-le", "Lease end", f.lease_end, "date")}${inp("pf-rn", "Renewal date", f.renewal_day, "date")}</div>
      ${papRentOK() ? inp("pf-rnote", "Rent note", papRent(papSheet.loc).rent_note) : ""}${inp("pf-note", "Note", f.note)}
      <div style="display:flex;gap:8px;margin-top:12px"><button class="btn primary" style="flex:1" onclick="papSaveFacts()" ${papBusy ? "disabled" : ""}>${papBusy ? "Saving…" : "Save"}</button>${close}</div>`;
  } else {
    const t = PAP.types.find(x => x.code === papSheet.type) || {}, loc = papSheet.loc;
    const rows = PAP.papers.filter(p => p.location === loc && p.type === t.code && !p.not_needed);
    const skip = PAP.papers.find(p => p.location === loc && p.type === t.code && p.not_needed);
    const p = papSheet.edit === "new" ? {} : rows.find(r => r.id === papSheet.edit) || (t.many ? null : rows[0] || {});
    const list = t.many ? `<div class="list" style="margin-bottom:8px">${rows.map(r => `<button class="row tap" onclick="papEdit('${r.id}')"><div class="main"><div class="name">${esc(r.label || "—")}</div><div class="meta">${r.expires ? "expires " + papDate(r.expires) : "no expiry date"}${r.file_name ? " · file" : " · no file"}</div></div>${papChip(papRowState(r))}</button>`).join("") || `<div class="mut small">None yet.</div>`}</div>
      ${!p ? `<button class="btn full" onclick="papEdit('new')">Add ${t.code === "health" ? "a staff member" : "one"}</button>` : ""}` : "";
    const form = p ? `${inp("pp-lab", t.code === "health" ? "Staff member" : t.code === "extinguisher" ? "Unit (where it hangs)" : "Number on the paper", p.label)}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 10px">${inp("pp-iss", "Issued", p.issued, "date")}${inp("pp-exp", "Expires", p.expires, "date")}</div>
      <div class="field"><label for="pp-file">File (photo or PDF)</label>${p.file_name ? `<div class="small" style="margin-bottom:6px"><button class="btn sm" onclick="papView('${p.id}')">Open ${esc(p.file_name)}</button></div>` : ""}<input class="in" id="pp-file" type="file" accept="image/*,application/pdf"></div>
      ${inp("pp-note", "Note", p.note)}
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn primary" style="flex:1" onclick="papSavePaper('${p.id || ""}')" ${papBusy ? "disabled" : ""}>${papBusy ? "Saving…" : "Save"}</button>${p.id && t.many ? `<button class="btn ghost" onclick="papDelete('${p.id}')">Remove</button>` : ""}${close}</div>` : `<div style="display:flex;gap:8px;margin-top:12px">${close}</div>`;
    body = `<h2>${esc(t.name)}</h2><div class="tiny mut" style="margin-bottom:10px">${esc(papLocName(loc))} · ${esc(t.sub || "")}</div>
      ${skip ? `<div class="alert info">Marked not needed here. <button class="btn sm" onclick="papSkip(false)">Needed after all</button></div>` : `${list}${form}
      <div style="margin-top:10px"><button class="btn ghost sm" onclick="papSkip(true)">Not needed at this place</button></div>`}`;
  }
  return `<div class="sheet-bg" onclick="if(event.target===this){papSheet=null;render()}"><div class="sheet" style="max-height:90vh;overflow:auto">${body}</div></div>`;
}
const papV = id => { const e = document.getElementById(id); return e ? e.value.trim() : ""; };
const papNum = id => { const v = papV(id).replace(/[₱,\s]/g, ""); return v === "" ? null : +v; };

async function papWrite(table, rec, id) {   /* one row straight to the database (dev page: in memory) */
  if (papDev()) return { data: Object.assign({ id: id || "dev-" + Date.now(), created: new Date().toISOString() }, rec) };
  const q = table === "site_fact" || table === "site_rent" ? sb.from(table).upsert(rec).select().single() : id ? sb.from(table).update(rec).eq("id", id).select().single() : sb.from(table).insert(rec).select().single();
  return await q;
}
async function papSaveFacts() {
  const loc = papSheet.loc, rec = { location: loc, address: papV("pf-ad") || null, building: papV("pf-bld") || null, floor_m2: papNum("pf-m2"), landlord: papV("pf-ll") || null,
    lease_start: papV("pf-ls") || null, lease_end: papV("pf-le") || null, renewal_day: papV("pf-rn") || null, note: papV("pf-note") || null,
    updated: new Date().toISOString(), by_email: window.DB_USER || null };
  const rent = papRentOK() ? { location: loc, rent_month: papNum("pf-rent"), deposit: papNum("pf-dep"), rent_note: papV("pf-rnote") || null, updated: rec.updated, by_email: rec.by_email } : null;
  if ([rec.floor_m2, rent && rent.rent_month, rent && rent.deposit].some(v => v != null && !(v >= 0))) return toast("Numbers only for area, rent and deposit.");
  papBusy = true; render(); const r = await papWrite("site_fact", rec);
  const r2 = rent && !r.error ? await papWrite("site_rent", rent) : null; papBusy = false;
  if (r.error || (r2 && r2.error)) { toast("Not saved: " + (r.error || r2.error).message); return render(); }
  PAP.facts[loc] = r.data; if (r2) PAP.rent[loc] = r2.data; papSheet = null; toast("Saved."); render();
}
async function papSavePaper(id) {
  const { loc, type } = papSheet, el = document.getElementById("pp-file"), file = el && el.files && el.files[0];
  const rec = { location: loc, type, label: papV("pp-lab") || null, issued: papV("pp-iss") || null, expires: papV("pp-exp") || null, note: papV("pp-note") || null, updated: new Date().toISOString(), by_email: window.DB_USER || null };
  if (rec.issued && rec.expires && rec.expires < rec.issued) return toast("The expiry date is before the issue date.");
  if (file && file.size > 15e6) return toast("The file is too big (15 MB at most).");
  papBusy = true; render();
  if (file) {
    const path = `${loc}/${type}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
    if (!papDev()) { const up = await sb.storage.from("papers").upload(path, file, { contentType: file.type || undefined }); if (up.error) { papBusy = false; toast("Upload failed: " + up.error.message); return render(); } }
    rec.file_path = path; rec.file_name = file.name;
  }
  const r = await papWrite("paper", rec, id || null); papBusy = false;
  if (r.error) { toast("Not saved: " + r.error.message); return render(); }
  PAP.papers = [r.data].concat(PAP.papers.filter(p => p.id !== r.data.id));
  const t = PAP.types.find(x => x.code === type) || {}; if (t.many) papSheet.edit = null; else papSheet = null;
  toast(file ? "Saved with the file." : "Saved."); render();
}
async function papSkip(on) {
  const { loc, type } = papSheet;
  if (on) { const r = await papWrite("paper", { location: loc, type, not_needed: true, by_email: window.DB_USER || null }); if (r.error) return toast("Not saved: " + r.error.message); PAP.papers.unshift(r.data); }
  else { const ids = PAP.papers.filter(p => p.location === loc && p.type === type && p.not_needed).map(p => p.id);
    if (!papDev()) { const r = await sb.from("paper").delete().in("id", ids); if (r.error) return toast("Not saved: " + r.error.message); }
    PAP.papers = PAP.papers.filter(p => !ids.includes(p.id)); }
  papSheet = null; render();
}
async function papDelete(id) {
  if (!confirm("Remove this entry? The uploaded file stays in storage.")) return;
  if (!papDev()) { const r = await sb.from("paper").delete().eq("id", id); if (r.error) return toast("Not removed: " + r.error.message); }
  PAP.papers = PAP.papers.filter(p => p.id !== id); papSheet.edit = null; render();
}
async function papView(id) {
  const p = PAP.papers.find(x => x.id === id); if (!p || !p.file_path) return;
  if (papDev()) return toast("Files open on the live app only.");
  const w = window.open("", "_blank");   /* open the tab inside the tap, or the phone blocks it */
  const r = await sb.storage.from("papers").createSignedUrl(p.file_path, 300);
  if (r.error) { if (w) w.close(); return toast("Could not open: " + r.error.message); }
  if (w) w.location = r.data.signedUrl; else location.href = r.data.signedUrl;
}
