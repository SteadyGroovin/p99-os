/* Pizza 99 OS — UI v0.2 (2026-10-17). Plain JS, hash routes, no build step. Icons: Untitled UI sprite in icons.js (ic()). */
const S = Store.load();
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pad2 = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
/* The working day runs from 09:00 to 04:00 the next morning (UTAK cutoff 04:00): today() is the BUSINESS day, so a closing done at 00:40 still belongs to the day that opened at 09:00. nowISO() is the real clock. */
const today = () => ymd(new Date(Date.now() - 4 * 3600e3));
const nowISO = () => { const d = new Date(); return `${ymd(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const addDays = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return ymd(d); };
const wd = s => new Date(s + "T00:00:00").getDay();
const dayName = d => new Date(d + "T00:00:00").toLocaleDateString("en-PH", { weekday: "short", day: "numeric", month: "short" });
const dayLong = d => new Date(d + "T00:00:00").toLocaleDateString("en-PH", { weekday: "long", day: "numeric", month: "long" });
const timeOf = iso => iso ? iso.slice(11, 16) : "";
const ageDays = iso => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000));
const go = h => { location.hash = h; };
const save = () => Store.save();
let toastT = null;
function toast(msg) { let t = $(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); } t.textContent = msg; clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 2400); }
function applyTheme() { document.documentElement.setAttribute("data-theme", S.theme || "light"); }
const me = () => Store.person(S.me);
/* ROLES_ON = false (Stefan, 2026-10-17 via the plugin message): the app runs as a one-person show — whoever is signed in sees and encodes everything.
   The name is kept only for "who did it". Flip to true to restore crew / lead / walk / office views. */
const ROLES_ON = false;
const role = () => window.DB_ROLE ? window.DB_ROLE : (!me() ? "crew" : ROLES_ON ? me().role : "master"); /* signed in: the role comes from the database */
const isOffice = () => ["walk", "admin", "master"].includes(role());
const canManage = () => role() !== "crew";

/* ---------- photos: the device camera, downscaled, kept on this device until the database exists ---------- */
function takePhoto(cb) {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.setAttribute("capture", "environment");
  inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) return; const url = URL.createObjectURL(f); const img = new Image();
    img.onload = () => { const c = document.createElement("canvas"); const s = Math.min(1, 900 / Math.max(img.width, img.height)); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); const id = "ph-" + Date.now(); S.photos[id] = c.toDataURL("image/jpeg", 0.72); save(); cb(id); };
    img.src = url; };
  inp.click();
}
const thumb = (id, cls = "") => id && S.photos[id] ? `<img class="thumb ${cls}" src="${S.photos[id]}" alt="photo" onclick="event.stopPropagation();openPhoto('${id}')">` : "";
function openPhoto(id) { const d = document.createElement("div"); d.className = "sheet-bg"; d.onclick = () => d.remove(); d.innerHTML = `<img src="${S.photos[id]}" style="max-width:96vw;max-height:90vh;border-radius:12px;margin:auto">`; document.body.appendChild(d); }
const photoBtn = (label, onId, has) => `<button class="photo ${has ? "has" : ""}" onclick="takePhoto(id=>{${onId}})">${ic("camera-01")} ${has ? "Retake" : label}</button>`;

/* ---------- roles & tabs ---------- */
const ICON = { home: "home-02", check: "clipboard-check", grid: "grid-01", box: "package", alert: "alert-triangle", cash: "bank-note-01", dots: "dots-horizontal", list: "list", finance: "wallet-02" };
const TABS = {
  crew: [["today", "Today", "home", "#/today"], ["clean", "Clean", "check", "#/clean"], ["count", "Count", "grid", "#/count"], ["receive", "Receive", "box", "#/receive"], ["report", "Report", "alert", "#/report"]],
  lead: [["today", "Today", "home", "#/today"], ["stock", "Stock", "grid", "#/stock"], ["clean", "Clean", "check", "#/clean"], ["more", "More", "dots", "#/more"]],
  walk: [["walk", "Walk", "check", "#/walk"], ["tasks", "Tasks", "list", "#/tasks"], ["report", "Report", "alert", "#/report"], ["more", "More", "dots", "#/more"]], /* Cherry: the morning run, her tasks, problems; no sales, stock levels or finance */
  office: [["today", "Today", "home", "#/today"], ["sales", "Sales", "cash", "#/sales"], ["stock", "Stock", "grid", "#/stock"], ["clean", "Clean", "check", "#/clean"], ["more", "More", "dots", "#/more"]],
};
const tabsFor = () => TABS[role() === "crew" ? "crew" : role() === "lead" ? "lead" : role() === "walk" ? "walk" : "office"];
function tabOf(route) { const seg = route.split("/")[1] || "today"; const ids = tabsFor().map(t => t[0]);
  const map = { count: "stock", item: "stock", items: "stock", receive: "stock", receipts: "stock", variance: "stock", task: "tasks", tasks: "more", cash: "more", walk: "more", report: "more", tickets: "more" };
  if (seg === "finance") return role() === "master" ? "finance" : "more";
  if (ids.includes(seg)) return seg; const m = map[seg]; if (m && ids.includes(m)) return m; return "more"; }

/* ---------- shell ---------- */
function shell(title, sub, body, { back } = {}) {
  const p = me(); const tabs = tabsFor(); const cur = tabOf(location.hash.slice(1) || "/today");
  const openT = S.tickets.filter(t => t.status !== "done").length;
  const tabHTML = tabs.map(([id, label, icon, href]) => `<button class="${cur === id ? "on" : ""}" onclick="go('${href}')" aria-label="${label}">${id === "report" && openT ? `<span class="bdg">${openT}</span>` : ""}${ic(ICON[icon])}${label}</button>`).join("");
  return `
  <nav class="sidebar"><div class="brand"><span class="store-dot"></span>Pizza 99 OS</div>${(role() === "master" ? tabs.flatMap(t => t[0] === "more" ? [["finance", "Finance", "finance", "#/finance"], t] : [t]) : tabs).map(([id, label, icon, href]) => `<button class="${cur === id ? "on" : ""}" onclick="go('${href}')">${ic(ICON[icon], "sm")}${label}</button>`).join("")}</nav>
  <div class="page">
    <header class="top">${back ? `<button class="back" onclick="go('${back}')" aria-label="Back">${ic("chevron-left")}</button>` : ""}
      <div class="ttl"><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}</div>
      <button class="me" onclick="go('#/more')"><span class="av">${p ? esc(p.short[0]) : "?"}</span>${p ? esc(p.short) : "Sign in"}</button>
    </header>
    <main class="wrap">${body}</main>
  </div>
  <nav class="tabbar">${tabHTML}</nav>`;
}
const card = (inner, onclick, cls = "") => `<section class="card ${onclick ? "tap" : ""} ${cls}" ${onclick ? `onclick="${onclick}"` : ""}>${inner}</section>`;
const kpi = (lab, val, trend, cls = "") => `<div class="kpi"><div class="lab">${lab}</div><div class="val num ${cls}">${val}</div>${trend ? `<div class="trend">${trend}</div>` : ""}</div>`;
const ring = (p, ok) => `<div class="ring ${ok ? "ok" : ""}" style="--p:${Math.round(p)}"><b>${Math.round(p)}%</b></div>`;
const chip = (cls, text) => `<span class="chip ${cls}"><i class="dot"></i>${text}</span>`;

/* ---------- WHO ---------- */
let pinBuf = "", pinWho = null;
function viewWho() {
  const names = PEOPLE.filter(p => p.id !== "store").map(p => `<button class="btn ${pinWho === p.id ? "primary" : ""}" onclick="S.me='${p.id}';save();go('#/today')">${esc(p.short)}<span class="tiny" style="margin-left:6px;opacity:.7">${esc(p.position)}</span></button>`).join("");
  const pad = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map(k => k === "" ? "<span></span>" : `<button class="btn" onclick="pinKey('${k}')">${k}</button>`).join("");
  return `<div class="who"><div class="box">
    <div style="text-align:center"><span class="store-dot"></span><b>Pizza 99 OS</b><div class="mut small">Optional: pick your name so entries say who did them</div></div>
    <div class="names">${names}</div>
  </div></div>`;
}
function pinKey(k) { if (k === "⌫") pinBuf = pinBuf.slice(0, -1); else if (pinBuf.length < 4) pinBuf += k; if (pinBuf.length === 4) { S.me = pinWho; save(); pinBuf = ""; go(role() === "walk" ? "#/walk" : "#/today"); } render(); }

/* ---------- sales helpers (real UTAK history) ---------- */
const SD = SALES_HISTORY.days; const SDAYS = Object.keys(SD).sort(); let LAST_DAY = SDAYS[SDAYS.length - 1];
const dayTotal = d => SD[d] ? SD[d].total : null;
function cmpWeek(d) { const p = addDays(d, -7); return SD[p] ? { prev: SD[p].total, pct: SD[d] && SD[p].total ? (SD[d].total - SD[p].total) / SD[p].total : null } : null; }
const pctTxt = p => p == null ? "" : `${p >= 0 ? "▲" : "▼"} ${Math.round(Math.abs(p) * 100)}% vs last ${new Date().toLocaleDateString("en-PH", { weekday: "short" })}`;
function svgBars(vals, labels, { w = 560, h = 150, hi = -1, fmtv = v => fmt(Math.round(v)) } = {}) {
  const max = Math.max(...vals, 1); const pad = { l: 40, r: 6, t: 14, b: 22 }; const bw = (w - pad.l - pad.r) / vals.length;
  const bars = vals.map((v, i) => { const bh = (h - pad.t - pad.b) * v / max; return `<rect class="vb ${i === hi ? "hi" : ""}" x="${pad.l + i * bw + 2}" y="${h - pad.b - bh}" width="${Math.max(2, bw - 4)}" height="${bh}" rx="3"><title>${labels[i]}: ${fmtv(v)}</title></rect>`; }).join("");
  const step = labels.length > 12 ? Math.ceil(labels.length / 8) : 1;
  const lab = labels.map((l, i) => i % step === 0 ? `<text x="${pad.l + i * bw + bw / 2}" y="${h - 6}" text-anchor="middle">${l}</text>` : "").join("");
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" width="100%" role="img">${[0, .5, 1].map(f => `<line class="grid" x1="${pad.l}" x2="${w - pad.r}" y1="${h - pad.b - (h - pad.t - pad.b) * f}" y2="${h - pad.b - (h - pad.t - pad.b) * f}"/><text x="${pad.l - 6}" y="${h - pad.b - (h - pad.t - pad.b) * f + 4}" text-anchor="end">${fmtv(max * f)}</text>`).join("")}${bars}${lab}</svg>`;
}
/* viewSales lives in sales-view.js (v2) */

/* ---------- TODAY ---------- */
function runFor(cl, day = today()) { const k = cl.id + ":" + day; return S.runs[k] || (S.runs[k] = { done: {} }); }
function taskTitle(cl, t) { return t.rota != null ? ROTA[wd(today())][t.rota] : t.t; }
function clProgress(cl) { const r = runFor(cl); const d = cl.tasks.filter(t => r.done[t.id]).length; return { done: d, total: cl.tasks.length, pct: cl.tasks.length ? d / cl.tasks.length * 100 : 0 }; }
function viewToday_v1() {
  const p = me(); const d = today(); const yd = addDays(d, -1); const y = SD[yd]; const cy = cmpWeek(yd);
  const nightly = ITEMS.filter(i => i.nightly); const openT = S.tickets.filter(t => t.status !== "done"); const high = openT.filter(t => t.priority === "high").length;
  const dueTasks = S.tasks.filter(t => t.status !== "done"); const recToday = S.receipts.filter(r => r.day === d); const draft = S.draft; const counted = draft ? Object.keys(draft.lines).length : 0;
  const hour = new Date().getHours(); const dueNow = (hour >= 4 && hour < 15) ? CHECKLISTS[0] : CHECKLISTS[1];
  const cls = CHECKLISTS.map(cl => { const pr = clProgress(cl); return `<button class="row tap" onclick="go('#/clean/${cl.id}')">${ring(pr.pct, pr.pct >= 100)}<div class="main"><div class="name">${cl.name}${cl === dueNow && pr.pct < 100 ? ` ${chip("info", "now")}` : ""}</div><div class="meta">${cl.from}–${cl.to} · ${pr.done} of ${pr.total} · ${esc(ROTA[wd(d)][cl.id === "open" ? 0 : 1])}</div></div><span class="chev">${ic("chevron-right")}</span></button>`; }).join("");
  const salesCard = card(kpi(`Yesterday, ${dayName(yd)}`, y ? peso(y.total) : "<span class='mut small'>not synced</span>", y ? `${y.tickets} tickets · ${cy && cy.pct != null ? pctTxt(cy.pct) : ""}` : `latest in the feed: ${dayName(LAST_DAY)}`, y && cy && cy.pct != null ? (cy.pct >= 0 ? "band-ok" : "band-bad") : ""), canManage() ? `salesDay='${y ? yd : LAST_DAY}';salesView='day';go('#/sales')` : null);
  const grid = role() === "crew" ? `<div class="grid2">${card(kpi("Count tonight", counted ? `${counted} / ${nightly.length}` : nightly.length, counted ? "in progress — continue" : "short list at closing"), "go('#/count')")}${card(kpi("Tickets open", openT.length, high ? chip("bad", high + " high") : "none urgent", high ? "band-bad" : ""), "go('#/report')")}</div>`
    : `<div class="grid2">${salesCard}${card(kpi("Count", counted ? `${counted} / ${nightly.length}` : (Store.lastCount("coke-zero") ? "last " + dayName(Store.lastCount("coke-zero").day) : "none"), counted ? "in progress" : "short list nightly"), "go('#/count')")}${card(kpi("Tickets open", openT.length, high ? chip("bad", high + " high") : "none urgent", high ? "band-bad" : ""), "go('#/report')")}${card(kpi("To-dos open", dueTasks.length, `${dueTasks.filter(t => t.status === "blocked").length} blocked · ${dueTasks.filter(t => t.due && t.due < d).length} overdue`), "go('#/tasks')")}</div>`;
  return shell(isOffice() ? "Pizza 99 — today" : `Hi ${esc(p.short)}`, dayLong(d), `${grid}
    <section class="card"><h2>Checklists</h2><div class="list">${cls}</div></section>
    <section class="card"><h2>Deliveries today</h2>${recToday.length ? `<div class="list">${recToday.map(r => `<div class="row"><div class="main"><div class="name">${esc(r.supplier)}</div><div class="meta">${r.lines.map(l => `${esc(Store.item(l.item).name)} × ${fmt(l.qty)}`).join(" · ")}</div></div>${thumb(r.photo)}</div>`).join("")}</div>` : `<div class="mut small">None yet. <a href="#/receive">Receive a delivery ›</a></div>`}</section>`);
}

/* ---------- COUNT ---------- */
let countScope = "nightly";
function itemsIn(placeId) { return ITEMS.filter(i => i.place === placeId && (countScope === "all" || i.nightly)); }
function startDraft() { if (!S.draft) { S.draft = { kind: countScope === "nightly" ? "closing" : "full", started: nowISO(), by: S.me, lines: {}, text: {} }; save(); } }
function viewCount_v1() {
  startDraft(); const draft = S.draft; const scoped = ITEMS.filter(i => countScope === "all" || i.nightly); const done = scoped.filter(i => draft.lines[i.id] != null).length;
  const rows = PLACES.map(pl => { const its = itemsIn(pl.id); if (!its.length) return ""; const c = its.filter(i => draft.lines[i.id] != null).length; const pct = c / its.length * 100; return `<button class="row tap" onclick="go('#/count/${pl.id}')">${ring(pct, pct >= 100)}<div class="main"><div class="name">${pl.name}</div><div class="meta">${c} of ${its.length} counted</div></div><span class="chev">${ic("chevron-right")}</span></button>`; }).join("");
  return shell("Count", `${dayName(today())} · started ${timeOf(draft.started)} by ${esc(Store.person(draft.by).short)}`, `
    <div class="seg"><button class="btn ${countScope === "nightly" ? "on" : ""}" onclick="countScope='nightly';render()">Short list (nightly)</button><button class="btn ${countScope === "all" ? "on" : ""}" onclick="countScope='all';render()">Everything (Sunday)</button></div>
    <div class="list">${rows}</div>
    <div class="bottom-act"><button class="btn primary full" ${done ? "" : "disabled"} onclick="go('#/count/summary')">Review and send · ${done} of ${scoped.length}</button></div>
    <button class="btn ghost full danger" onclick="if(confirm('Throw away this count?')){S.draft=null;save();render()}">Discard count</button>`, { back: canManage() ? "#/stock" : "#/today" });
}
function qtyText(it, packs, loose) { const parts = []; if (packs) parts.push(`${fmt(packs)} ${it.packUnit}`); if (loose || !packs) parts.push(`${fmt(loose || 0)} ${it.unit}`); return parts.join(" + "); }
function viewCountPlace_v1(placeId) {
  startDraft(); const pl = PLACES.find(p => p.id === placeId); if (!pl) return viewCount(); const its = itemsIn(placeId); const draft = S.draft;
  const withItems = PLACES.filter(p => itemsIn(p.id).length); const nextPl = withItems[withItems.findIndex(p => p.id === placeId) + 1];
  const rows = its.map(it => { const q = draft.lines[it.id]; const ex = Store.expected(it.id);
    const hint = ex ? `last ${fmt(ex.base.qty)} ${it.unit} (${dayName(ex.base.day)})${ex.value != null ? ` · expected ${fmt(ex.value)}` : ""}${ex.base.seed ? " · seed" : ""}` : "no count yet";
    return `<button class="row tap ${q != null ? "done" : ""}" onclick="openPad('${it.id}')"><div class="main"><div class="name">${esc(it.name)}</div><div class="meta">${hint}</div></div><div class="right">${q != null ? `<div class="v num">${fmt(q)}</div><div class="l">${esc(draft.text[it.id] || it.unit)}</div>` : `<div class="l">${it.pack ? it.packUnit + "s + " + it.unit : it.unit}</div>`}</div></button>`; }).join("");
  const c = its.filter(i => draft.lines[i.id] != null).length;
  return shell(pl.name, `${c} of ${its.length} counted · shelf order`, `<div class="bar ${c >= its.length ? "ok" : ""}"><i style="width:${its.length ? c / its.length * 100 : 0}%"></i></div><div class="list">${rows}</div>
    <div class="bottom-act">${nextPl ? `<button class="btn primary full" onclick="go('#/count/${nextPl.id}')">Next: ${nextPl.name} ›</button>` : `<button class="btn primary full" onclick="go('#/count/summary')">Review and send ›</button>`}</div>${padHTML()}`, { back: "#/count" });
}
let pad = null;
function openPad(itemId, mode = "count", onDone) { const it = Store.item(itemId); pad = { itemId, mode, onDone, field: it.pack ? "packs" : "loose", packs: "", loose: "" }; render(); }
function padKey(k) { if (!pad) return; const f = pad.field; if (k === "⌫") pad[f] = pad[f].slice(0, -1); else if (k === ".") { if (!pad[f].includes(".")) pad[f] = (pad[f] || "0") + "."; } else if (pad[f].length < 6) pad[f] = (pad[f] === "0" ? "" : pad[f]) + k; render(); }
function padTotal() { const it = Store.item(pad.itemId); const p = parseFloat(pad.packs) || 0, l = parseFloat(pad.loose) || 0; return it.pack ? p * it.pack + l : l; }
function padEnter() {
  const it = Store.item(pad.itemId); const total = padTotal(); const txt = qtyText(it, parseFloat(pad.packs) || 0, parseFloat(pad.loose) || 0);
  if (pad.mode === "receive") { const cb = pad.onDone; pad = null; cb(total, txt); render(); return; }
  S.draft.lines[it.id] = total; S.draft.text[it.id] = txt; save();
  const its = itemsIn(it.place); const i = its.findIndex(x => x.id === it.id); const next = its.slice(i + 1).find(x => S.draft.lines[x.id] == null) || its.find(x => S.draft.lines[x.id] == null);
  if (next) openPad(next.id); else { pad = null; render(); }
}
function padHTML() {
  if (!pad) return ""; const it = Store.item(pad.itemId); const ex = pad.mode === "count" ? Store.expected(it.id) : null; const total = padTotal();
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map(k => `<button class="${k === "." || k === "⌫" ? "fn" : ""}" onclick="padKey('${k}')">${k}</button>`).join("");
  return `<div class="sheet-bg" onclick="if(event.target===this){pad=null;render()}"><div class="sheet" role="dialog">
    <div class="head"><div><div class="nm">${esc(it.name)}</div><div class="tiny mut">${ex ? `last ${fmt(ex.base.qty)} ${it.unit}${ex.value != null ? ` · expected ${fmt(ex.value)}` : ""}` : (pad.mode === "receive" ? "how much arrived" : "first count")}</div></div><button class="btn ghost" onclick="pad=null;render()">${ic("x-close")}</button></div>
    ${it.pack ? `<div class="units"><button class="btn ${pad.field === "packs" ? "on" : ""}" onclick="pad.field='packs';render()">${esc(it.packUnit)}s <span class="tiny">×${it.pack}${it.verify ? " ?" : ""}</span></button><button class="btn ${pad.field === "loose" ? "on" : ""}" onclick="pad.field='loose';render()">loose ${esc(it.unit)}</button></div>` : ""}
    <div class="disp"><div><span class="big num">${pad[pad.field] || "0"}</span> <span class="unit">${pad.field === "packs" ? it.packUnit : it.unit}</span></div><div class="eq num">${it.pack ? `= ${fmt(total)} ${it.unit}` : ""}</div></div>
    <div class="pad">${keys}</div>
    <button class="btn primary full" style="margin-top:10px" onclick="padEnter()">${pad.mode === "receive" ? "Add" : "Save and next"}</button></div></div>`;
}
function viewCountSummary_v1() {
  const draft = S.draft; if (!draft) return viewCount(); const ids = Object.keys(draft.lines);
  const cls = id => { const ex = Store.expected(id); return band(draft.lines[id], ex ? ex.value : null).cls; };
  const bad = ids.filter(id => cls(id) === "bad").length, warn = ids.filter(id => cls(id) === "warn").length;
  const rows = ids.map(id => { const it = Store.item(id); const ex = Store.expected(id); const b = band(draft.lines[id], ex ? ex.value : null);
    return `<tr><td><b>${esc(it.name)}</b><div class="tiny mut">${esc(draft.text[id] || "")}</div></td><td class="n num">${fmt(draft.lines[id])}</td><td class="n num mut">${ex && ex.value != null ? fmt(ex.value) : "—"}</td><td class="n">${b.cls ? chip(b.cls, b.label) : `<span class="chip">no base</span>`}</td></tr>`; }).join("");
  const missing = ITEMS.filter(i => (countScope === "all" || i.nightly) && draft.lines[i.id] == null);
  return shell("Review the count", `${ids.length} items · sales to ${dayName(Store.salesThrough())}`, `
    ${bad ? `<div class="alert bad">${bad} item${bad > 1 ? "s" : ""} far from expected — recount or explain in the note.</div>` : warn ? `<div class="alert warn">${warn} item${warn > 1 ? "s" : ""} a little off — say why in the note if you know.</div>` : `<div class="alert ok">Counted items match what was expected.</div>`}
    <section class="card"><table class="t"><thead><tr><th>Item</th><th class="n">Counted</th><th class="n">Expected</th><th class="n">Variance</th></tr></thead><tbody>${rows}</tbody></table></section>
    ${missing.length ? `<section class="card"><h3>Not counted (${missing.length})</h3><div class="small mut">${missing.map(i => esc(i.name)).join(" · ")}</div></section>` : ""}
    <div class="field"><label>Note</label><textarea class="in" id="cnote" placeholder="e.g. 2 Coke Zero given to guests">${esc(draft.note || "")}</textarea></div>
    <div class="bottom-act"><button class="btn primary full" onclick="submitCount()">Send the count</button></div>`, { back: "#/count" });
}
function submitCount() { const d = S.draft; d.note = $("#cnote").value; d.id = "c-" + Date.now(); d.day = today(); d.submitted = nowISO(); d.var = {}; Object.keys(d.lines).forEach(id => { const ex = Store.expected(id); d.var[id] = { expected: ex ? ex.value : null, counted: d.lines[id] }; }); S.counts.push(d); S.draft = null; save(); toast("Count sent."); go(canManage() ? "#/variance" : "#/today"); }

/* ---------- STOCK hub ---------- */
function stockNow(it) { const ex = Store.expected(it.id); if (!ex) return null; return ex.value != null ? ex.value : ex.base.qty; }
function viewStock_v1() {
  const below = ITEMS.filter(i => { const v = stockNow(i); return v != null && i.par && v < i.par; });
  const row = (name, meta, href, extra = "") => `<button class="row tap" onclick="go('${href}')"><div class="main"><div class="name">${name}</div><div class="meta">${meta}</div></div>${extra}<span class="chev">${ic("chevron-right")}</span></button>`;
  return shell("Stock", "Pizza 99", `<div class="list">${row("Count", S.draft ? "a count is in progress" : "short list nightly, everything on Sunday", "#/count")}${row("Receive", "delivery, cash purchase or pull-out", "#/receive")}${row("Items", `${ITEMS.length} items · ${below.length} below par`, "#/items", below.length ? chip("warn", below.length) : "")}${row("Variance", "last count vs expected", "#/variance")}${row("Deliveries log", `${S.receipts.length} receipts since ${dayName(S.receipts[0].day)}`, "#/receipts")}</div>`);
}
function viewReceipts_v1() {
  const rs = S.receipts.slice().sort((a, b) => a.day < b.day ? 1 : -1);
  return shell("Deliveries log", "as posted by the crew (chat, 18 Aug–9 Sep) and in this app", `<div class="list">${rs.map(r => `<div class="row"><div class="main"><div class="name">${esc(r.supplier)} ${chip("", RECEIPT_KINDS.find(k => k[0] === r.kind)[1])}</div><div class="meta">${dayName(r.day)} · ${esc(Store.person(r.by) ? Store.person(r.by).short : "")} · ${r.lines.map(l => `${esc(Store.item(l.item).name)} ${fmt(l.qty)} ${esc(Store.item(l.item).unit)}${l.text ? " (" + esc(l.text) + ")" : ""}`).join(" · ")}</div></div>${thumb(r.photo)}</div>`).join("")}</div>`, { back: "#/stock" });
}

/* ---------- RECEIVE ---------- */
let rc = null;
function viewReceive_v1() {
  if (!rc) rc = { kind: "delivery", supplier: "", lines: [], photo: null, amount: "" };
  const lines = rc.lines.map((l, i) => { const it = Store.item(l.item); const lp = Store.lastPrice(l.item); const d = lp && l.price ? (l.price - lp.price) / lp.price : null;
    return `<div class="row"><div class="main"><div class="name">${esc(it.name)}</div><div class="meta">${esc(l.text)}${l.price ? ` · ${peso(l.price)} per ${it.unit}` : ""}${d != null && Math.abs(d) >= 0.005 ? ` · <span class="${d > 0 ? "band-bad" : "band-ok"}">${d > 0 ? "▲" : "▼"} ${Math.round(Math.abs(d) * 100)}% vs ${dayName(lp.day)}</span>` : ""}</div></div><button class="btn ghost danger" onclick="rc.lines.splice(${i},1);render()">${ic("x-close")}</button></div>`; }).join("");
  const itemOpts = ITEMS.filter(i => !rc.supplier || !i.supplier || i.supplier === rc.supplier || rc.kind !== "delivery").map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join("");
  const srcOpts = (rc.kind === "pullout" ? ["Office", "MCC", "Dragon store", "MCBC", "Burger Kong"] : SUPPLIERS).map(s => `<option ${rc.supplier === s ? "selected" : ""}>${esc(s)}</option>`).join("");
  const ok = rc.lines.length && rc.supplier && (rc.kind === "pullout" || rc.photo);
  return shell("Receive", dayName(today()), `
    <div class="seg">${RECEIPT_KINDS.map(([k, l]) => `<button class="btn ${rc.kind === k ? "on" : ""}" onclick="rc.kind='${k}';rc.supplier='';render()">${l}</button>`).join("")}</div>
    <div class="field"><label>${rc.kind === "pullout" ? "From" : "Supplier / store"}</label><select class="in" onchange="rc.supplier=this.value;render()"><option value="">— choose —</option>${srcOpts}</select></div>
    <div class="field"><label>Add an item</label><div style="display:flex;gap:8px"><select class="in" id="rcitem">${itemOpts}</select><button class="btn primary" onclick="rcAdd()">Qty</button></div></div>
    ${lines ? `<div class="list">${lines}</div>` : `<div class="mut small">No lines yet.</div>`}
    ${rc.kind === "purchase" ? `<div class="field"><label>Amount paid (₱)</label><input class="in num" inputmode="decimal" value="${esc(rc.amount)}" oninput="rc.amount=this.value"></div>` : ""}
    ${rc.kind !== "pullout" ? `<div>${photoBtn(rc.kind === "purchase" ? "Photo of the receipt (required)" : "Photo of the invoice or goods (required)", "rc.photo=id;render()", rc.photo)}${thumb(rc.photo, "big")}</div>` : ""}
    <div class="bottom-act"><button class="btn primary full" ${ok ? "" : "disabled"} onclick="rcSave()">Save · ${rc.lines.length} line${rc.lines.length === 1 ? "" : "s"}</button></div>${padHTML()}`, { back: role() === "crew" ? "#/today" : "#/stock" });
}
function rcAdd() { const id = $("#rcitem").value; openPad(id, "receive", (qty, text) => { if (!qty) return; let price = null; if (rc.kind !== "pullout") { const p = prompt("Price per " + Store.item(id).unit + " (₱) — leave empty if not on the invoice", Store.lastPrice(id) ? Store.lastPrice(id).price : ""); price = p ? parseFloat(p) : null; } rc.lines.push({ item: id, qty, text, price }); }); }
function rcSave() { S.receipts.push({ id: "r-" + Date.now(), day: today(), kind: rc.kind, supplier: rc.supplier, by: S.me, photo: rc.photo, amount: rc.amount ? parseFloat(rc.amount) : null, lines: rc.lines.map(l => ({ item: l.item, qty: l.qty, text: l.text, price: l.price })) }); rc = null; save(); toast("Saved — stock updated."); go(role() === "crew" ? "#/today" : "#/stock"); }

/* ---------- ITEMS ---------- */
let itemQ = "";
function viewItems_v1() {
  const q = itemQ.toLowerCase();
  const groups = PLACES.map(pl => { const its = ITEMS.filter(i => i.place === pl.id && (!q || i.name.toLowerCase().includes(q))); if (!its.length) return ""; return `<section class="card"><h3>${pl.name}</h3><div class="list">${its.map(it => { const s = stockNow(it); const low = s != null && it.par && s < it.par; return `<button class="row tap" onclick="go('#/item/${it.id}')"><div class="main"><div class="name">${esc(it.name)}</div><div class="meta">${it.supplier ? esc(it.supplier) + " · " : ""}par ${fmt(it.par)} ${it.unit}${it.nightly ? " · nightly" : ""}</div></div><div class="right">${s != null ? `<div class="v num ${low ? "band-warn" : ""}">${fmt(s)}</div><div class="l">${it.unit}</div>` : `<div class="l">no count</div>`}</div></button>`; }).join("")}</div></section>`; }).join("");
  return shell("Items", `${ITEMS.length} items`, `<input class="in" placeholder="Search" value="${esc(itemQ)}" oninput="itemQ=this.value;render();const i=document.querySelector('main input');i.focus();i.setSelectionRange(99,99)">${groups}`, { back: "#/stock" });
}
function svgLine(pts, w = 560, h = 150) {
  if (pts.length < 2) return `<div class="mut small">Needs two deliveries with a price.</div>`;
  const ys = pts.map(p => p.y); const min = Math.min(...ys) * 0.97, max = Math.max(...ys) * 1.03; const pad = { l: 44, r: 12, t: 12, b: 24 };
  const X = i => pad.l + i * (w - pad.l - pad.r) / (pts.length - 1), Y = v => pad.t + (h - pad.t - pad.b) * (1 - (v - min) / (max - min || 1));
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" width="100%">${[0, .5, 1].map(f => { const v = min + (max - min) * f; return `<line class="grid" x1="${pad.l}" x2="${w - pad.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${pad.l - 6}" y="${Y(v) + 4}" text-anchor="end">${fmt(Math.round(v))}</text>`; }).join("")}<path class="ln" d="${pts.map((p, i) => `${i ? "L" : "M"}${X(i)},${Y(p.y)}`).join(" ")}"/>${pts.map((p, i) => `<circle class="pt" cx="${X(i)}" cy="${Y(p.y)}" r="4"><title>${p.x}: ${peso(p.y)}</title></circle>`).join("")}${pts.map((p, i) => (i === 0 || i === pts.length - 1) ? `<text x="${X(i)}" y="${h - 6}" text-anchor="middle">${p.x.slice(5)}</text>` : "").join("")}</svg>`;
}
function viewItem_v1(id) {
  const it = Store.item(id); if (!it) return viewItems(); const s = stockNow(it); const ex = Store.expected(id); const prices = Store.prices(id); const use = Store.usageWeeks(id);
  const perDay = use ? use.slice(-4).reduce((a, b) => a + b, 0) / 28 : null; const cover = perDay && s != null ? s / perDay : null;
  const recs = S.receipts.filter(r => r.lines.some(l => l.item === id)).sort((a, b) => a.day < b.day ? 1 : -1).slice(0, 8); const low = s != null && it.par && s < it.par;
  return shell(it.name, `${PLACES.find(p => p.id === it.place).name}${it.supplier ? " · " + esc(it.supplier) : ""}`, `
    <div class="grid2">
      ${card(kpi("Stock now", s != null ? `${fmt(s)} <span class="small mut">${it.unit}</span>` : "—", ex ? (ex.value != null ? `count ${fmt(ex.base.qty)} + in ${fmt(ex.received)} − sold ${fmt(ex.sold)}${ex.base.seed ? " · seed count" : ""}` : `last count ${dayName(ex.base.day)}${ex.base.seed ? " (seed)" : ""}`) : "never counted", low ? "band-warn" : ""))}
      ${card(kpi("Par", fmt(it.par), low ? chip("warn", "below par") : "ok"))}
      ${card(kpi("Days of cover", cover != null ? cover.toFixed(1) : "—", perDay ? `${perDay.toFixed(1)} ${it.unit}/day sold (UTAK, 4 weeks)` : it.pos ? "no sales yet" : "needs recipes"))}
      ${card(kpi("Last price", prices.length ? peso(prices[prices.length - 1].price) : "—", prices.length ? `per ${it.unit} · ${dayName(prices[prices.length - 1].day)}` : "no delivery with a price yet"))}
    </div>
    ${use ? `<section class="card"><h2>Sold per week <span class="tiny mut">UTAK, 8 weeks to ${dayName(LAST_DAY)}</span></h2>${svgBars(use, use.map((v, i) => i === use.length - 1 ? "this" : "−" + (use.length - 1 - i)), { hi: use.length - 1 })}</section>` : ""}
    <section class="card"><h2>Price per ${esc(it.unit)}</h2>${svgLine(prices.map(p => ({ x: p.day, y: p.price })))}</section>
    <section class="card"><h2>Deliveries</h2>${recs.length ? `<div class="list">${recs.map(r => { const l = r.lines.find(x => x.item === id); return `<div class="row"><div class="main"><div class="name">${fmt(l.qty)} ${esc(it.unit)}${l.text ? ` <span class="small mut">${esc(l.text)}</span>` : ""}</div><div class="meta">${dayName(r.day)} · ${esc(r.supplier)} · ${esc(Store.person(r.by) ? Store.person(r.by).short : "")}</div></div><div class="right"><div class="v num">${l.price ? peso(l.price) : ""}</div></div></div>`; }).join("")}</div>` : `<div class="mut small">None recorded.</div>`}</section>
    <section class="card"><h2>Settings</h2><table class="t"><tr><td>Counted as</td><td class="n">${it.pack ? `${it.packUnit} of ${it.pack} ${it.unit} ${it.verify ? chip("warn", "verify") : ""}` : it.unit}</td></tr><tr><td>Nightly short list</td><td class="n">${it.nightly ? "yes" : "no"}</td></tr><tr><td>Sold as-is on the POS</td><td class="n">${it.pos ? esc(it.pos) : "via recipes (not yet)"}</td></tr></table></section>`, { back: "#/items" });
}
function viewVariance_v1() {
  const cs = S.counts.filter(c => c.var).sort((a, b) => a.submitted < b.submitted ? 1 : -1); const c = cs[0];
  if (!c) return shell("Variance", "", `<div class="card mut">No count sent from this app yet. The first closing count shows here against the seed count of 14 Oct, with the real UTAK sales in between.</div>`, { back: "#/stock" });
  const order = { bad: 0, warn: 1, ok: 2, "": 3 };
  const rows = Object.entries(c.var).map(([id, v]) => { const b = band(v.counted, v.expected); return [b, `<tr><td><b>${esc(Store.item(id).name)}</b></td><td class="n num">${fmt(v.counted)}</td><td class="n num mut">${v.expected != null ? fmt(v.expected) : "—"}</td><td class="n">${b.cls ? chip(b.cls, b.label) : `<span class="chip">no base</span>`}</td></tr>`]; }).sort((a, b) => order[a[0].cls] - order[b[0].cls]);
  return shell("Variance", `${dayName(c.day)} · ${timeOf(c.submitted)} by ${esc(Store.person(c.by).short)}`, `<section class="card"><table class="t"><thead><tr><th>Item</th><th class="n">Counted</th><th class="n">Expected</th><th class="n">Variance</th></tr></thead><tbody>${rows.map(r => r[1]).join("")}</tbody></table>${c.note ? `<div class="small mut" style="margin-top:8px">Note: ${esc(c.note)}</div>` : ""}</section><div class="tiny mut">Expected = last count + received − sold (UTAK, 1:1 items only until recipes exist). Green within 1 or 2 %, amber within 2 or 3 %, red beyond.</div>`, { back: "#/stock" });
}

/* ---------- CLEAN ---------- */
function viewClean_v1() {
  const d = today(); const rows = CHECKLISTS.map(cl => { const pr = clProgress(cl); return `<button class="row tap" onclick="go('#/clean/${cl.id}')">${ring(pr.pct, pr.pct >= 100)}<div class="main"><div class="name">${cl.name}</div><div class="meta">${cl.from}–${cl.to} · ${pr.done} of ${pr.total} · ${esc(ROTA[wd(d)][cl.id === "open" ? 0 : 1])}</div></div><span class="chev">${ic("chevron-right")}</span></button>`; }).join("");
  const rota = [1, 2, 3, 4, 5, 6, 0].map(k => `<tr class="${k === wd(d) ? "hi" : ""}"><td>${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][k]}</td><td>${esc(ROTA[k][0])}</td><td>${esc(ROTA[k][1])}</td></tr>`).join("");
  return shell("Clean", dayLong(d), `<div class="list">${rows}</div><section class="card"><h2>Weekly rota <span class="tiny mut">from the crew's own reports, Aug–Sep</span></h2><table class="t"><thead><tr><th>Day</th><th>Morning shift</th><th>Closing shift</th></tr></thead><tbody>${rota}</tbody></table></section>`);
}
function viewChecklist_v1(id) {
  const cl = CHECKLISTS.find(c => c.id === id); if (!cl) return viewClean(); const r = runFor(cl); const pr = clProgress(cl);
  const rows = cl.tasks.map(t => { const d = r.done[t.id]; const title = taskTitle(cl, t); const vals = t.values || [];
    const valueInputs = vals.map((v, i) => `<input class="in num" style="flex:1;min-width:90px" inputmode="decimal" placeholder="${esc(v)}" id="v-${t.id}-${i}" value="${d && d.values ? d.values[i] : ""}">`).join("");
    const photos = t.photo === "before/after" ? `<div class="pair">${photoBtn("Before", `setPhoto('${cl.id}','${t.id}','before',id)`, r.ph && r.ph[t.id + ":before"])}${thumb(r.ph && r.ph[t.id + ":before"])}${photoBtn("After", `setPhoto('${cl.id}','${t.id}','after',id)`, r.ph && r.ph[t.id + ":after"])}${thumb(r.ph && r.ph[t.id + ":after"])}</div>` : t.photo ? `<div class="pair">${photoBtn("Photo", `setPhoto('${cl.id}','${t.id}','photo',id)`, r.ph && r.ph[t.id + ":photo"])}${thumb(r.ph && r.ph[t.id + ":photo"])}</div>` : "";
    const canDone = (!t.photo || (t.photo === "before/after" ? (r.ph && r.ph[t.id + ":before"] && r.ph[t.id + ":after"]) : (r.ph && r.ph[t.id + ":photo"])));
    return `<div class="task ${d ? "done" : ""}"><div class="main"><div class="name">${esc(title)}</div><div class="meta">${d ? `✓ ${esc(Store.person(d.by).short)} · ${timeOf(d.at)}${d.values ? " · " + d.values.map((v, i) => `${vals[i].split(" ")[0]} ${v}`).join(", ") : ""}` : (t.photo === "before/after" ? "before and after photo" : t.photo ? "photo required" : t.link ? `<a href="${t.link}">open ›</a>` : "")}</div>
      ${!d ? `<div class="pair">${valueInputs}</div>${photos}` : ""}</div>
      ${d ? `<button class="btn ghost" onclick="delete runFor(CHECKLISTS.find(c=>c.id==='${cl.id}')).done['${t.id}'];save();render()">Undo</button>` : `<button class="btn primary" ${canDone ? "" : "disabled"} onclick="tick('${cl.id}','${t.id}')">${ic("check")}</button>`}</div>`; }).join("");
  return shell(cl.name, `${cl.from}–${cl.to} · ${pr.done} of ${pr.total}`, `<div class="bar ${pr.pct >= 100 ? "ok" : ""}"><i style="width:${pr.pct}%"></i></div><div class="list">${rows}</div>${pr.pct >= 100 ? `<div class="alert ok">All done.</div>` : ""}`, { back: "#/clean" });
}
function setPhoto(clId, tId, which, phId) { const r = runFor(CHECKLISTS.find(c => c.id === clId)); r.ph = r.ph || {}; r.ph[tId + ":" + which] = phId; save(); render(); }
function tick(clId, tId) { const cl = CHECKLISTS.find(c => c.id === clId); const t = cl.tasks.find(x => x.id === tId); const r = runFor(cl);
  let values = null; if (t.values) { values = t.values.map((v, i) => $("#v-" + tId + "-" + i).value.trim()); if (values.some(v => v === "")) { toast("Type the number first."); return; } }
  r.done[tId] = { by: S.me, at: nowISO(), values }; 
  if (t.countItem && values) { startDraft(); S.draft.lines[t.countItem] = parseFloat(values[0]); S.draft.text[t.countItem] = values[0] + " pc"; }
  save(); render(); }

/* ---------- REPORT (tickets) ---------- */
let nt = null;
function viewReport_v1() {
  const order = { high: 0, medium: 1, low: 2 }; const open = S.tickets.filter(t => t.status !== "done").sort((a, b) => order[a.priority] - order[b.priority]); const done = S.tickets.filter(t => t.status === "done");
  const row = t => `<button class="row tap" onclick="go('#/report/${t.id}')">${thumb(t.photo)}<div class="main"><div class="name">${esc(t.title)}</div><div class="meta">${chip(t.priority === "high" ? "bad" : t.priority === "medium" ? "warn" : "", t.priority)} ${t.status.replace("_", " ")}${t.scheduled ? " · " + dayName(t.scheduled) : ""} · ${ageDays(t.created)} d · ${esc(Store.person(t.by) ? Store.person(t.by).short : "")}</div></div><span class="chev">${ic("chevron-right")}</span></button>`;
  return shell("Report a problem", `${open.length} open`, `<button class="btn primary full" onclick="nt={priority:'',title:'',note:'',photo:null};go('#/report/new')">New ticket</button>${open.length ? `<div class="list">${open.map(row).join("")}</div>` : `<div class="mut small">Nothing open. Broken, leaking, not working: take a photo and send it here, it goes to maintenance.</div>`}${done.length ? `<h3 style="margin-top:8px">Done</h3><div class="list">${done.map(row).join("")}</div>` : ""}`);
}
function viewNewTicket_v1() {
  if (!nt) nt = { priority: "", title: "", note: "", photo: null };
  return shell("New ticket", "photo, what, how urgent", `
    <div>${photoBtn("Take a photo (required)", "nt.photo=id;render()", nt.photo)}${thumb(nt.photo, "big")}</div>
    <div class="field"><label>What is wrong</label><input class="in" value="${esc(nt.title)}" oninput="nt.title=this.value" placeholder="e.g. Chiller door does not close"></div>
    <div class="field"><label>How urgent</label><div class="seg">${["low", "medium", "high"].map(p => `<button class="btn ${nt.priority === p ? "on " + p : ""}" onclick="nt.priority='${p}';render()">${p}</button>`).join("")}</div></div>
    <div class="field"><label>Details</label><textarea class="in" oninput="nt.note=this.value">${esc(nt.note)}</textarea></div>
    <div class="bottom-act"><button class="btn primary full" ${nt.photo && nt.title.trim() && nt.priority ? "" : "disabled"} onclick="S.tickets.unshift({id:'t-'+Date.now(),title:nt.title.trim(),note:nt.note,priority:nt.priority,status:'open',by:S.me,created:nowISO(),photo:nt.photo});nt=null;save();toast('Ticket sent.');go('#/report')">Send ticket</button></div>`, { back: "#/report" });
}
function viewTicket_v1(id) {
  const t = S.tickets.find(x => x.id === id); if (!t) return viewReport(); window._set = (f, v) => { t[f] = v; if (f === "status" && v === "done") t.closed = nowISO(); save(); render(); };
  return shell(t.title, `${t.priority} · ${t.status.replace("_", " ")} · ${dayName(t.created.slice(0, 10))} · ${esc(Store.person(t.by) ? Store.person(t.by).short : "")}`, `${thumb(t.photo, "big")}${t.note ? `<section class="card">${esc(t.note)}</section>` : ""}
    ${canManage() ? `<section class="card"><h3>Status</h3><div class="seg">${["open", "scheduled", "in_progress", "done"].map(s => `<button class="btn ${t.status === s ? "on" : ""}" onclick="_set('status','${s}')">${s.replace("_", " ")}</button>`).join("")}</div>${t.status === "scheduled" ? `<div class="field" style="margin-top:10px"><label>Scheduled day</label><input class="in" type="date" value="${t.scheduled || ""}" onchange="_set('scheduled',this.value)"></div>` : ""}</section>` : `<div class="mut small">Maintenance updates the status; you see it change here.</div>`}`, { back: "#/report" });
}

/* ---------- TASKS ---------- */
let ntask = null;
function viewTasks_v1() {
  const groups = [["in_progress", "In progress"], ["open", "Open"], ["blocked", "Blocked"], ["done", "Done"]];
  const row = t => `<button class="row tap" onclick="go('#/task/${t.id}')"><div class="main"><div class="name">${esc(t.title)}</div><div class="meta">${t.owner ? esc(Store.person(t.owner).short) : "no owner"}${t.due ? ` · due ${dayName(t.due)}` : ""}${t.due && t.due < today() && t.status !== "done" ? ` · <span class="band-bad">overdue</span>` : ""} · ${esc(t.source || "")}</div></div>${chip(t.status === "blocked" ? "bad" : t.status === "in_progress" ? "info" : t.status === "done" ? "ok" : "", t.status.replace("_", " "))}</button>`;
  return shell("Tasks", "Pizza 99 to-do list", `<button class="btn primary full" onclick="ntask={title:'',detail:'',owner:S.me,due:'',status:'open'};go('#/task/new')">New task</button>${groups.map(([s, l]) => { const ts = S.tasks.filter(t => t.status === s); return ts.length ? `<section class="card"><h3>${l} (${ts.length})</h3><div class="list">${ts.map(row).join("")}</div></section>` : ""; }).join("")}`);
}
function viewTask_v1(id) {
  const owners = cur => PEOPLE.map(p => `<option value="${p.id}" ${cur === p.id ? "selected" : ""}>${esc(p.short)}</option>`).join("");
  if (id === "new") { if (!ntask) ntask = { title: "", detail: "", owner: S.me, due: "", status: "open" };
    return shell("New task", "", `<div class="field"><label>Task</label><input class="in" value="${esc(ntask.title)}" oninput="ntask.title=this.value"></div><div class="field"><label>Detail</label><textarea class="in" oninput="ntask.detail=this.value">${esc(ntask.detail)}</textarea></div><div class="field"><label>Owner</label><select class="in" onchange="ntask.owner=this.value">${owners(ntask.owner)}</select></div><div class="field"><label>Due</label><input class="in" type="date" value="${ntask.due}" onchange="ntask.due=this.value"></div>
      <div class="bottom-act"><button class="btn primary full" ${ntask.title.trim() ? "" : "disabled"} onclick="S.tasks.unshift({id:'k-'+Date.now(),title:ntask.title.trim(),detail:ntask.detail,owner:ntask.owner,due:ntask.due||null,status:'open',source:Store.person(S.me).short});ntask=null;save();go('#/tasks')">Add task</button></div>`, { back: "#/tasks" }); }
  const t = S.tasks.find(x => x.id === id); if (!t) return viewTasks(); window._tset = (f, v) => { t[f] = v; if (f === "status" && v === "done") t.done_at = nowISO(); save(); render(); };
  return shell(t.title, `${t.owner ? esc(Store.person(t.owner).short) : "no owner"}${t.due ? " · due " + dayName(t.due) : ""} · ${esc(t.source || "")}`, `${t.detail ? `<section class="card">${esc(t.detail)}</section>` : ""}
    <section class="card"><h3>Status</h3><div class="seg">${["open", "in_progress", "blocked", "done"].map(s => `<button class="btn ${t.status === s ? "on" : ""}" onclick="_tset('status','${s}')">${s.replace("_", " ")}</button>`).join("")}</div></section>
    <section class="card"><h3>Owner · due</h3><div class="pair"><select class="in" onchange="_tset('owner',this.value)">${owners(t.owner)}</select><input class="in" type="date" value="${t.due || ""}" onchange="_tset('due',this.value)"></div></section>`, { back: "#/tasks" });
}

/* ---------- denomination keypad (cash + walk) ---------- */
let cpad = null; let cpadTarget = null;
function openCashPad(target, d) { cpadTarget = target; cpad = { d, v: String(target.d[d] || "") }; render(); }
function cpadKey(k) { if (k === "⌫") cpad.v = cpad.v.slice(0, -1); else if (cpad.v.length < 4) cpad.v = (cpad.v === "0" ? "" : cpad.v) + k; render(); }
function cpadEnter() { cpadTarget.d[cpad.d] = parseInt(cpad.v || "0", 10); const i = DENOMS.indexOf(cpad.d); cpad = i < DENOMS.length - 1 ? { d: DENOMS[i + 1], v: String(cpadTarget.d[DENOMS[i + 1]] || "") } : null; render(); }
function cashPadHTML() { if (!cpad) return ""; const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map(k => k ? `<button class="${k === "⌫" ? "fn" : ""}" onclick="cpadKey('${k}')">${k}</button>` : "<span></span>").join("");
  return `<div class="sheet-bg" onclick="if(event.target===this){cpad=null;render()}"><div class="sheet"><div class="head"><div class="nm">₱${fmt(cpad.d)}</div><button class="btn ghost" onclick="cpad=null;render()">${ic("x-close")}</button></div><div class="disp"><div><span class="big num">${cpad.v || "0"}</span> <span class="unit">pieces</span></div><div class="eq num">= ${peso(cpad.d * (parseInt(cpad.v || "0", 10)))}</div></div><div class="pad">${keys}</div><button class="btn primary full" style="margin-top:10px" onclick="cpadEnter()">Save and next</button></div></div>`; }
const denomRows = (target, fn) => DENOMS.map(d => `<button class="row tap" onclick="${fn}(${d})"><div class="main"><div class="name">₱${fmt(d)}</div></div><div class="right"><div class="v num">${target.d[d] || 0}</div><div class="l">${peso(d * (target.d[d] || 0))}</div></div></button>`).join("");
const sumDenoms = t => DENOMS.reduce((s, d) => s + d * (t.d[d] || 0), 0);

/* ---------- CASH (closing) ---------- */
let cash = null;
function viewCash_v1() {
  if (!cash) cash = { d: {}, fund: FUND, gcash: "", ref: "", photo: null, reason: "" };
  const total = sumDenoms(cash); const sales = total - cash.fund; const pos = SD[today()] ? SD[today()].pay.cash || 0 : null; const varc = pos != null ? sales - pos : null; const short = total > 0 && varc != null && varc < -5;
  window.openCashPad1 = d => openCashPad(cash, d);
  return shell("Cash — closing", dayName(today()), `
    <div class="grid2">
      ${card(kpi("Counted", total ? peso(total) : "—", `fund ${peso(cash.fund)} stays`))}
      ${card(kpi("Cash sales", total ? peso(sales) : "—", pos != null ? `POS cash ${peso(pos)}` : "POS not synced for today yet"))}
      ${card(kpi("Difference", total && varc != null ? (varc > 0 ? "+" : "") + peso(varc) : "—", !total ? "count the drawer first" : varc == null ? "needs the POS figure" : varc === 0 ? "exact" : varc < 0 ? "short" : "over", !total || varc == null ? "" : varc === 0 ? "band-ok" : varc < 0 ? "band-bad" : "band-warn"))}
      ${card(kpi("GCash remitted", cash.gcash ? peso(cash.gcash) : "—", cash.ref ? "ref " + esc(cash.ref) : "amount, reference, screenshot"))}
    </div>
    <section class="card"><h3>Pieces per note</h3><div class="list">${denomRows(cash, "openCashPad1")}</div></section>
    <section class="card"><div class="pair"><div class="field"><label>GCash remitted (₱)</label><input class="in num" inputmode="decimal" value="${esc(cash.gcash)}" oninput="cash.gcash=this.value"></div><div class="field"><label>Reference no.</label><input class="in" value="${esc(cash.ref)}" oninput="cash.ref=this.value"></div></div><div style="margin-top:8px">${photoBtn("Screenshot of the remittance", "cash.photo=id;render()", cash.photo)}${thumb(cash.photo)}</div></section>
    ${short ? `<div class="field"><label class="band-bad">Short by ${peso(-varc)} — reason required</label><textarea class="in" oninput="cash.reason=this.value">${esc(cash.reason)}</textarea></div>` : ""}
    <div class="bottom-act"><button class="btn primary full" ${total && (!short || cash.reason.trim()) ? "" : "disabled"} onclick="S.cash.push({day:today(),kind:'closing',d:cash.d,total:${total},fund:cash.fund,pos:${pos},gcash:cash.gcash,ref:cash.ref,photo:cash.photo,variance:${varc},reason:cash.reason,by:S.me,at:nowISO()});cash=null;save();toast('Cash count sent.');go('#/today')">Send the cash count</button></div>${cashPadHTML()}`, { back: canManage() ? "#/more" : "#/today" });
}

/* ---------- WALK (Cherry's morning run, as in Rocket OS v1: Store Cash Fund sheet + hygienics) ---------- */
let walk = null;
function viewWalk_v1() {
  const d = today(); const done = S.walks.find(w => w.day === d);
  const others = ["MCC", "Dragoncrepe", "MCBC", "Burger Kong"].map(n => `<div class="row" style="opacity:.55"><div class="main"><div class="name">${n}</div><div class="meta">still in Rocket OS v1 (Store walk app)</div></div></div>`).join("");
  return shell("Store walk", dayLong(d), `<div class="list"><button class="row tap" onclick="walk=null;go('#/walk/p99')"><div class="main"><div class="name">Pizza 99</div><div class="meta">${done ? `done ${timeOf(done.at)} · fund ${peso(done.fund)} · sales ${peso(done.sales)}${done.hyg ? " · hygienics " + done.hyg.total + "/45 " + done.hyg.band : ""}` : "not yet"}</div></div>${done ? chip("ok", "done") : chip("", "not yet")}<span class="chev">${ic("chevron-right")}</span></button>${others}</div>
    ${S.walks.length ? `<section class="card"><h3>Earlier runs</h3><table class="t"><thead><tr><th>Day</th><th class="n">Drawer</th><th class="n">Sales</th><th class="n">Hygienics</th></tr></thead><tbody>${S.walks.slice().reverse().map(w => `<tr><td>${dayName(w.day)}</td><td class="n num">${peso(w.total)}</td><td class="n num">${peso(w.sales)}</td><td class="n">${w.hyg ? `${w.hyg.total}/45 ${chip(w.hyg.cls, w.hyg.band)}` : "—"}</td></tr>`).join("")}</tbody></table></section>` : ""}`);
}
function viewWalkForm_v1() {
  if (!walk) { const prev = S.walks.find(w => w.day === today()); walk = prev ? JSON.parse(JSON.stringify(prev)) : { d: {}, fund: FUND, endorsed: "", received: S.me, qc: {}, booklet: "", first5: "", first5At: "", columnar: "", columnarDate: "", scores: [], photo: null, note: "" }; }
  const total = sumDenoms(walk); const sales = total - walk.fund; const low = total < walk.fund;
  window.openCashPad2 = d => openCashPad(walk, d);
  const people = cur => `<option value="">— choose —</option>` + PEOPLE.map(p => `<option value="${p.id}" ${cur === p.id ? "selected" : ""}>${esc(p.short)}</option>`).join("");
  const qcItems = ITEMS.filter(i => i.cat === "drink" && i.pack); const qcRows = qcItems.map(it => { const q = walk.qc[it.id] || {}; return `<div class="row"><div class="main"><div class="name">${esc(it.name)}</div></div><div class="pair" style="width:220px"><input class="in num" inputmode="numeric" placeholder="${esc(it.packUnit)}s" value="${q.p || ""}" oninput="walk.qc['${it.id}']=Object.assign(walk.qc['${it.id}']||{},{p:this.value})"><input class="in num" inputmode="numeric" placeholder="loose" value="${q.l || ""}" oninput="walk.qc['${it.id}']=Object.assign(walk.qc['${it.id}']||{},{l:this.value})"></div></div>`; }).join("");
  const scoresTotal = walk.scores.filter(s => s).reduce((a, b) => a + b, 0); const scored = walk.scores.filter(s => s).length; const hb = scored === 9 ? hygBand(scoresTotal) : null;
  const hyg = HYG_AREAS.map((a, i) => `<div class="task"><div class="main"><div class="name">${i + 1}. ${a}</div><div class="meta">${HYG_GUIDE[i].join(" · ")}</div><div class="seg" style="margin-top:6px">${[1, 2, 3, 4, 5].map(s => `<button class="btn score ${walk.scores[i] === s ? "on" : ""}" onclick="walk.scores[${i}]=${s};render()">${s}</button>`).join("")}</div></div></div>`).join("");
  return shell("Pizza 99 — morning run", `${dayName(today())} · ${timeOf(nowISO())}`, `
    <section class="card"><h2>Cash count <span class="tiny mut">all the money in the drawer</span></h2><div class="grid2">${kpi("Drawer total", peso(total), "")}${kpi("Sales", total ? peso(sales) : "—", low && total ? `<span class="band-bad">short — drawer below the fund</span>` : `fund ${peso(walk.fund)} stays`, low && total ? "band-bad" : "")}</div><div class="list" style="margin-top:10px">${denomRows(walk, "openCashPad2")}</div>
      <div class="pair" style="margin-top:10px"><div class="field"><label>Cash fund kept (₱)</label><input class="in num" inputmode="numeric" value="${walk.fund}" oninput="walk.fund=parseFloat(this.value)||0"></div><div class="field"><label>Endorsed by</label><select class="in" onchange="walk.endorsed=this.value">${people(walk.endorsed)}</select></div><div class="field"><label>Received by</label><select class="in" onchange="walk.received=this.value">${people(walk.received)}</select></div></div></section>
    <section class="card"><h2>Quick counts <span class="tiny mut">leave empty what you did not count</span></h2><div class="list">${qcRows}</div></section>
    <section class="card"><h2>BIR and columnar book</h2><div class="pair"><div class="field"><label>OR booklet no.</label><input class="in" value="${esc(walk.booklet)}" oninput="walk.booklet=this.value"></div><div class="field"><label>First 5 invoices</label><select class="in" onchange="walk.first5=this.value"><option value="">— choose —</option>${FIRST5.map(o => `<option ${walk.first5 === o ? "selected" : ""}>${o}</option>`).join("")}</select></div><div class="field"><label>Checked at</label><input class="in" type="time" value="${walk.first5At}" onchange="walk.first5At=this.value"></div></div>
      <div class="pair" style="margin-top:8px"><div class="field"><label>Columnar sales (₱)</label><input class="in num" inputmode="decimal" value="${esc(walk.columnar)}" oninput="walk.columnar=this.value"></div><div class="field"><label>Columnar book date</label><input class="in" type="date" value="${walk.columnarDate}" onchange="walk.columnarDate=this.value"></div></div></section>
    <section class="card"><h2>Hygienics <span class="tiny mut">score each area 1–5</span></h2>${hb ? `<div class="alert ${hb[1] || "ok"}">${scoresTotal}/45 — ${hb[0]}${hb[2] ? " · " + hb[2] : ""}</div>` : `<div class="tiny mut">${scored} of 9 scored</div>`}<div class="list">${hyg}</div></section>
    <section class="card">${photoBtn("Photo of the drawer or the slip", "walk.photo=id;render()", walk.photo)}${thumb(walk.photo)}<div class="field" style="margin-top:8px"><label>Note</label><textarea class="in" oninput="walk.note=this.value">${esc(walk.note)}</textarea></div></section>
    <div class="bottom-act"><button class="btn primary full" ${total && walk.endorsed && walk.received && walk.first5 ? "" : "disabled"} onclick="walkSubmit()">Send the morning run</button></div>
    ${!(total && walk.endorsed && walk.received && walk.first5) ? `<div class="tiny mut" style="text-align:center">Needed: drawer count, endorsed by, received by, first 5 invoices.</div>` : ""}${cashPadHTML()}`, { back: "#/walk" });
}
function walkSubmit() { const total = sumDenoms(walk); const scored = walk.scores.filter(s => s).length; const tot = walk.scores.filter(s => s).reduce((a, b) => a + b, 0); const hb = scored === 9 ? hygBand(tot) : null;
  const rec = Object.assign({}, walk, { day: today(), at: nowISO(), by: S.me, total, sales: total - walk.fund, hyg: hb ? { total: tot, band: hb[0], cls: hb[1], consequence: hb[2], scores: walk.scores } : null });
  const i = S.walks.findIndex(w => w.day === rec.day); if (i >= 0) S.walks[i] = rec; else S.walks.push(rec);
  // quick counts land in the count log as a morning spot check
  const lines = {}, text = {}; Object.entries(walk.qc).forEach(([id, q]) => { const it = Store.item(id); const p = parseFloat(q.p) || 0, l = parseFloat(q.l) || 0; if (p || l) { lines[id] = p * (it.pack || 0) + l; text[id] = qtyText(it, p, l); } });
  if (Object.keys(lines).length) S.counts.push({ id: "m-" + Date.now(), day: today(), kind: "morning", by: S.me, submitted: nowISO(), lines, text });
  walk = null; save(); toast("Morning run sent."); go("#/walk"); }

/* ---------- MORE ---------- */
function viewMore_v1() {
  const p = me(); const links = [];
  if (role() === "lead") links.push(["Cash — closing count", "#/cash"], ["Tickets", "#/report"], ["Tasks", "#/tasks"], ["Variance", "#/variance"]);
  if (isOffice()) links.push(["Store walk (morning run)", "#/walk"], ["Tasks (to-do list)", "#/tasks"], ["Tickets", "#/report"], ["Cash — closing count", "#/cash"], ["Variance", "#/variance"], ["Receive", "#/receive"]);
  if (role() === "crew") links.push(["Cash — closing count", "#/cash"]);
  return shell("More", `${esc(p.name)} · ${esc(p.position)}`, `<div class="list">${links.map(([l, h]) => `<button class="row tap" onclick="go('${h}')"><div class="main"><div class="name">${l}</div></div><span class="chev">${ic("chevron-right")}</span></button>`).join("")}
    <button class="row tap" onclick="S.theme=S.theme==='dark'?'light':'dark';save();applyTheme();render()"><div class="main"><div class="name">Theme: ${S.theme === "dark" ? "dark" : "light"}</div></div></button>
    <button class="row tap" onclick="signOut()"><div class="main"><div class="name">Sign out</div><div class="meta">signed in as ${esc(window.DB_USER || "")}</div></div></button>
    <button class="row tap" onclick="go('#/who')"><div class="main"><div class="name">Put a name on my entries</div><div class="meta">optional — ${esc(me().name)} now</div></div></button>
    <button class="row tap" onclick="if(confirm('Reset everything typed on this device?')){Store.reset();location.hash='#/who';location.reload()}"><div class="main"><div class="name band-bad">Reset this device</div><div class="meta">prototype: counts, photos and tickets live only on this device until the database exists</div></div></button>
  </div><div class="tiny mut">Pizza 99 OS v0.3 · sales from the database (UTAK history to ${dayName(LAST_DAY)}) · counts, receipts, tickets and photos still live on this device only. One-person mode: every name sees everything; roles come later.</div>`);
}

/* ---------- router ---------- */
function render() {
  applyTheme();
  const h = (location.hash || "#/today").slice(1); const seg = h.split("/").filter(Boolean);
  const qs = new URLSearchParams(location.search); if (qs.get("who") && !S.me) { const p = PEOPLE.find(x => x.id === qs.get("who") || x.role === qs.get("who")); if (p) { S.me = p.id; save(); } }
  let html;
  { /* route guard: the screens mirror the database rules (the database refuses the data anyway) */
    const r = role(), s0 = seg[0] || "", ownerOnly = ["sales", "finance"], walkOk = ["walk", "tasks", "task", "report", "more", "who", ""];
    if ((r !== "master" && ownerOnly.includes(s0)) || (r === "walk" && !walkOk.includes(s0))) { location.hash = r === "walk" ? "#/walk" : "#/today"; return; }
  }
  if (!S.me) { S.me = "store"; save(); } // no sign-in (Stefan, 2026-10-18): the app opens straight in; a name is optional, under More
  if (seg[0] === "who") html = viewWho();
  else switch (seg[0]) {
    case "sales": html = viewSales(); break;
    case "count": html = seg[1] === "summary" ? viewCountSummary() : seg[1] ? viewCountPlace(seg[1]) : viewCount(); break;
    case "stock": html = viewStock(); break;
    case "receipts": html = viewReceipts(); break;
    case "receive": html = viewReceive(); break;
    case "items": html = viewItems(); break;
    case "item": html = viewItem(seg[1]); break;
    case "variance": html = viewVariance(); break;
    case "clean": html = seg[1] ? viewChecklist(seg[1]) : viewClean(); break;
    case "report": html = seg[1] === "new" ? viewNewTicket() : seg[1] ? viewTicket(seg[1]) : viewReport(); break;
    case "tasks": html = viewTasks(); break;
    case "task": html = viewTask(seg[1]); break;
    case "cash": html = viewCash(); break;
    case "walk": html = seg[1] ? viewWalkForm() : viewWalk(); break;
    case "finance": html = viewFinance(seg[1], seg[2]); break;
    case "more": html = viewMore(); break;
    default: html = role() === "walk" ? viewWalk() : viewToday();
  }
  $("#app").innerHTML = html;
  if (render._h !== location.hash) { render._h = location.hash; window.scrollTo(0, 0); } /* a new page opens at the top; a re-render of the same page keeps its place */
  if (pad || cpad) { const s = $(".sheet"); if (s) s.scrollIntoView({ block: "end" }); }
}
window.addEventListener("hashchange", render);
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
render();
