/* stock-v2.js — Stock section v2 (2026-10-28). Replaces the *_v1 views in app.js; the v1 code stays there and the shared helpers
   (stockNow, itemsIn, startDraft, openPad, padKey, padTotal, qtyText, submitCount, rcSave, Store, band) are reused, never redefined.
   Patterns: count by place in shelf order with per-place progress and a kept "skipped" state (Restaurant365 mobile counts, Oracle cycle
   counts); blind count, compare in the review; order-to-par "to be ordered" (xtraCHEF depleting inventory); price alert past a tolerance
   on receiving (MarginEdge); variance per item ranked by size, table behind every chart (Crunchtime / Compeat A-vs-T).
   Data rules: nothing invented. Days of cover only where UTAK sells the item 1:1; the recipe estimate is shown separately and labelled a guess.
   Adds to the data shape only: S.draft.skip = { itemId: true } (kept on the sent count as .skip). */

const SK_PRICE_TOL = 0.02;                 // flag a price change of 2 % or more on receiving
let skBoard = "all", skItemQ = "", skItemPlace = "", skItemSup = "", skItemFlt = "", skItemSort = "place", skItemSrc = "store";
let skCountFlt = "todo", skVarSel = 0, skRx = { range: "90", sup: "", kind: "" };

/* ---------- numbers ---------- */
const skSum = a => a.reduce((s, x) => s + x, 0);
const skP = n => n == null || isNaN(n) ? "—" : "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: Number.isInteger(+n) ? 0 : 2, maximumFractionDigits: 2 });   // unit prices keep centavos
function skWeeks(it, n = 8) {                       // units sold per week (UTAK, 1:1 items), oldest first, weeks end on LAST_DAY
  if (!it || !it.pos) return null; const out = [];
  for (let w = n - 1; w >= 0; w--) { let s = 0; for (let i = 0; i < 7; i++) { const d = addDays(LAST_DAY, -(w * 7 + i)); const x = SD[d]; if (x) { const r = x.items.find(y => y[1] === it.pos); if (r) s += r[2]; } } out.push(s); }
  return out;
}
function skPerDay(it) { const w = skWeeks(it, 4); return w ? skSum(w) / 28 : null; }
function skLevel(it) {
  const ex = Store.expected(it.id); const s = stockNow(it); const pd = skPerDay(it);
  const st = s == null ? { k: "none", cls: "", label: "not counted" } : s <= 0 ? { k: "out", cls: "bad", label: "out" } : it.par && s < it.par ? { k: "low", cls: "warn", label: "below par" } : { k: "ok", cls: "ok", label: "ok" };
  return { it, ex, s, par: it.par, perDay: pd, cover: pd && s != null ? Math.max(0, s) / pd : null, st, seed: !!(ex && ex.base.seed), deducted: !!(ex && ex.value != null) };
}
function skToPar(L) {
  const it = L.it; if (L.s == null || !it.par || L.s >= it.par) return null; const need = it.par - Math.max(0, L.s);
  if (it.pack) { const n = Math.ceil(need / it.pack); return { qty: n * it.pack, txt: `${n} ${it.packUnit}${n > 1 ? "s" : ""}` }; }
  const q = Math.ceil(need * 10) / 10; return { qty: q, txt: `${fmt(q)} ${it.unit}` };
}
const skCoverChip = L => L.cover == null ? "" : L.cover < 2 ? chip("bad", `${L.cover.toFixed(1)} d left`) : L.cover < 4 ? chip("warn", `${L.cover.toFixed(1)} d left`) : `<span class="chip">${L.cover >= 30 ? "30+" : L.cover.toFixed(0)} d left</span>`;
const skPlace = id => (PLACES.find(p => p.id === id) || { name: id }).name;
function skLastSent() {
  const loc = S.counts.filter(c => c.submitted).sort((a, b) => a.submitted < b.submitted ? 1 : -1)[0] || null;
  const rows = window.WALK_ROWS || []; if (!rows.length) return loc;
  const wd = rows.reduce((m, r) => r.day > m ? r.day : m, ""); /* Cherry's newest morning count, taken about 10:00 that day */
  if (loc && loc.day >= wd) return loc;
  return { day: wd, submitted: wd + "T10:00", src: "walk", seed: false };
}
function skAge(c) { if (!c) return chip("bad", "never"); const d = ageDays(c.submitted); const t = d === 0 ? "today" : d === 1 ? "1 day ago" : d + " days ago"; return chip(d <= 1 ? "ok" : d <= 7 ? "warn" : "bad", t); }
const skSeed = on => on ? ` <span class="sample" data-tt="Seed count|14 Oct seed, not a real count — replace with the first real closing count">seed</span>` : "";
const skVerify = it => it.verify ? ` <span class="sample" data-tt="Pack size|${esc(it.pack + " " + it.unit + " per " + it.packUnit)} not confirmed by the store yet">verify</span>` : "";

/* level bar: stock against par, par marked; one blue for magnitude, the status is the chip next to it */
function skLvl(L) {
  if (L.s == null || !L.par) return `<span class="lvl none" aria-hidden="true"></span>`;
  const w = Math.max(0, Math.min(1, L.s / (L.par * 2))) * 100;
  return `<span class="lvl" data-tt="${esc(L.it.name)}|${fmt(L.s)} of par ${fmt(L.par)} ${esc(L.it.unit)}" role="img" aria-label="${fmt(L.s)} of par ${fmt(L.par)}"><i style="width:${w.toFixed(1)}%"></i><b></b></span>`;
}

const skW = () => (window.innerWidth || 640) < 600 ? 360 : 640;   // viewBox width: on a phone the 12 px labels stay readable
/* ---------- small charts (hover and tap through the global data-tt listener in sales-view.js) ---------- */
function skBarChart(vals, labels, { unit = "", hi = -1, fmtv = v => fmt(v), tips = labels } = {}) {
  const W = skW(), H = W < 500 ? 170 : 190, L = 44, R = 8, T = 12, B = 26, iw = W - L - R, ih = H - T - B; const n = vals.length; if (!n) return "";
  const mx0 = Math.max(...vals, 1); const mag = Math.pow(10, Math.floor(Math.log10(mx0))); const mx = [1, 2, 2.5, 5, 10].map(x => x * mag).find(x => x >= mx0 * 1.02) || mx0;
  const bw = iw / n, Y = v => T + ih - ih * v / mx;
  const g = [0, .5, 1].map(f => `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(mx * f)}" y2="${Y(mx * f)}"/><text x="${L - 6}" y="${Y(mx * f) + 4}" text-anchor="end">${fmtv(mx * f)}</text>`).join("");
  const bars = vals.map((v, i) => `<rect class="sbar ${i === hi ? "on" : ""}" x="${(L + bw * i + bw * .16).toFixed(1)}" y="${Y(v).toFixed(1)}" width="${(bw * .68).toFixed(1)}" height="${Math.max(0, T + ih - Y(v)).toFixed(1)}" rx="3" data-tt="${esc(tips[i])}|${fmtv(v)} ${esc(unit)}"/>`).join("");
  const xl = labels.map((l, i) => `<text x="${(L + bw * (i + .5)).toFixed(1)}" y="${H - 7}" text-anchor="middle">${esc(l)}</text>`).join("");
  return `<svg class="chart trend" viewBox="0 0 ${W} ${H}" width="100%" role="img">${g}${bars}${xl}</svg>`;
}
function skLineChart(pts, unit) {   // pts [{x: day, y, sup}]
  if (pts.length < 2) return "";
  const W = skW(), H = W < 500 ? 160 : 170, L = 56, R = 14, T = 14, B = 26, iw = W - L - R, ih = H - T - B; const ys = pts.map(p => p.y);
  const mn = Math.min(...ys) * .96, mx = Math.max(...ys) * 1.04; const X = i => L + iw * i / (pts.length - 1), Y = v => T + ih * (1 - (v - mn) / ((mx - mn) || 1));
  const g = [0, .5, 1].map(f => { const v = mn + (mx - mn) * f; return `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${skP(v)}</text>`; }).join("");
  const d = pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(p.y).toFixed(1)}`).join("");
  const dots = pts.map((p, i) => `<circle class="xd" style="display:block" cx="${X(i).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="5" data-tt="${esc(dayName(p.x))}|${skP(p.y)} per ${esc(unit)} · ${esc(p.sup || "")}"/>`).join("");
  return `<svg class="chart trend" viewBox="0 0 ${W} ${H}" width="100%" role="img"><path class="line" d="${d}"/>${g}${dots}<text x="${X(0)}" y="${H - 7}" text-anchor="start">${esc(dayName(pts[0].x))}</text><text x="${X(pts.length - 1)}" y="${H - 7}" text-anchor="end">${esc(dayName(pts[pts.length - 1].x))}</text></svg>`;
}
const skTable = (head, rows, open) => `<details class="tbl" ${open ? "open" : ""}><summary>Show as table</summary><table class="t"><thead><tr>${head.map((h, i) => `<th class="${i ? "n" : ""}">${h}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${i ? "n num" : ""}">${c}</td>`).join("")}</tr>`).join("")}</tbody></table></details>`;

/* ---------- database catalogue (read only) ---------- */
const SKDB = { state: "idle", items: [], places: {}, sups: {}, recipes: [], lines: [], flat: null };
async function skLoadDB() {
  if (typeof sb === "undefined" || SKDB.state !== "idle") return; SKDB.state = "loading";
  try {
    const [a, b, c, d, e] = await Promise.all([sb.from("item").select("*").eq("store", "P99").order("shelf_sort"), sb.from("place").select("*").eq("store", "P99"), sb.from("supplier").select("id,name"), sb.from("recipe").select("*").eq("store", "P99"), sb.from("recipe_line").select("*")]);
    if (a.error || !a.data) throw a.error || new Error("no rows");
    SKDB.items = a.data.filter(x => x.active !== false); (b.data || []).forEach(p => SKDB.places[p.id] = p); (c.data || []).forEach(s => SKDB.sups[s.id] = s.name);
    SKDB.recipes = (d && d.data) || []; SKDB.lines = (e && e.data) || []; SKDB.state = "ok";
  } catch (err) { SKDB.state = "fail"; }
  if (/^#\/(items|item\/|stock)/.test(location.hash)) render();
}
const skDbItem = id => SKDB.items.find(x => x.code === id) || null;
function skFlat() {   // every recipe flattened to items (base units per portion): slice = whole ÷ portion_div, combo parts expanded
  if (SKDB.flat) return SKDB.flat; const byId = {}, lines = {}; SKDB.recipes.forEach(r => byId[r.id] = r); SKDB.lines.forEach(l => (lines[l.recipe_id] = lines[l.recipe_id] || []).push(l));
  const flat = (rid, depth) => { const out = {}; const r = byId[rid]; if (!r || depth > 4) return out; const add = (k, v) => out[k] = (out[k] || 0) + v;
    (lines[rid] || []).forEach(l => { if (l.item_id) add(l.item_id, +l.qty || 0); else if (l.part_recipe_id) { const s = flat(l.part_recipe_id, depth + 1); for (const k in s) add(k, s[k] * (+l.qty || 1)); } });
    if (r.portion_of && +r.portion_div > 0) { const s = flat(r.portion_of, depth + 1); for (const k in s) add(k, s[k] / r.portion_div); } return out; };
  SKDB.flat = {}; SKDB.recipes.filter(r => r.active !== false).forEach(r => SKDB.flat[r.pos_category + "|" + r.pos_item] = { r, use: flat(r.id, 0) }); return SKDB.flat;
}
function skRecipeInfo(it) {   // which menu items use this item, and what the sales × recipes would take per day (estimate)
  const db = skDbItem(it.id); if (SKDB.state !== "ok" || !db) return null; const F = skFlat();
  const feeds = Object.values(F).filter(f => f.use[db.id]).map(f => ({ cat: f.r.pos_category, item: f.r.pos_item, kind: f.r.kind, qty: f.use[db.id], confirmed: f.r.confirmed }));
  let tot = 0; for (let i = 0; i < 28; i++) { const x = SD[addDays(LAST_DAY, -i)]; if (!x) continue; x.items.forEach(([cat, item, q]) => { const f = F[cat + "|" + item]; if (f && f.use[db.id]) tot += f.use[db.id] * q; }); }
  const conv = db.pack_qty && db.pack_unit === it.unit ? +db.pack_qty : (db.base_unit === it.unit ? 1 : null);
  return { db, feeds, perDayBase: tot / 28, perDay: conv ? tot / 28 / conv : null, conv };
}

/* ---------- STOCK home: levels board ---------- */
function viewStock() {
  const Ls = ITEMS.map(skLevel); const counted = Ls.filter(L => L.s != null); const below = counted.filter(L => L.st.k === "low" || L.st.k === "out");
  const last = skLastSent(); const wkFrom = addDays(today(), -6); const recWk = S.receipts.filter(r => r.day >= wkFrom); const lastRec = S.receipts.slice().sort((a, b) => a.day < b.day ? 1 : -1)[0];
  const lv = S.counts.filter(c => c.var).sort((a, b) => a.submitted < b.submitted ? 1 : -1)[0]; const vb = lv ? Object.values(lv.var).map(v => band(v.counted, v.expected).cls) : [];
  const draft = S.draft; const scoped = ITEMS.filter(i => i.nightly); const dn = draft ? scoped.filter(i => draft.lines[i.id] != null).length : 0;
  const wkRec = []; for (let w = 7; w >= 0; w--) { const a = addDays(today(), -(w * 7 + 6)), b = addDays(today(), -w * 7); wkRec.push(S.receipts.filter(r => r.day >= a && r.day <= b).length); }

  const actions = `<div class="skact">
    <button class="btn primary" onclick="go('#/count')">${ic("grid-01", "sm")}${draft && dn ? `Continue count · ${dn}/${scoped.length}` : "Count tonight"}</button>
    <button class="btn" onclick="go('#/receive')">${ic("package", "sm")}Receive</button></div>`;
  const tiles = `<div class="grid2">
    ${tile("Below par", `${below.length}<span class="small mut"> / ${counted.length}</span>`, below.length ? (below.some(L => L.st.k === "out") ? chip("bad", `${below.filter(L => L.st.k === "out").length} out`) : chip("warn", "reorder")) + ` <span class="mut">of counted</span>` : counted.length ? chip("ok", "all at par") : `<span class="mut">nothing counted yet</span>`, "")}
    ${tile("Last count", last ? esc(dayName(last.day)) : "—", `${skAge(last)}${last && last.seed ? skSeed(true) : ""}${last && last.src === "walk" ? ' <span class="chip info">Cherry\'s morning count</span>' : ""}`, "")}
    ${tile("Deliveries, 7 days", recWk.length, recWk.length ? `${skSum(recWk.map(r => r.lines.length))} lines` : `<span class="mut">last ${lastRec ? esc(dayName(lastRec.day)) : "never"}</span>`, spark(wkRec))}
    ${tile("Last variance", lv ? `${vb.filter(c => c === "ok").length}<span class="small mut"> / ${vb.length} ok</span>` : "—", lv ? (vb.some(c => c === "bad") ? chip("bad", vb.filter(c => c === "bad").length + " off") : vb.some(c => c === "warn") ? chip("warn", vb.filter(c => c === "warn").length + " a little off") : chip("ok", "on target")) : `<span class="mut">no count sent from the app</span>`, "")}
  </div>`;

  const rank = L => L.st.k === "out" ? -1 : L.cover != null && L.cover < 4 ? L.cover / 4 : 1 + L.s / (L.par || 1);   // out, then under 4 days, then lowest vs par
  const soonAll = counted.filter(L => L.st.k !== "ok" || (L.cover != null && L.cover < 4)).sort((a, b) => rank(a) - rank(b)); const soon = soonAll.slice(0, 6);
  const soonHTML = soon.length ? `<div class="list soon">${soon.map(L => { const tp = skToPar(L); return `<button class="row tap skrow" onclick="go('#/item/${L.it.id}')"><div class="main"><div class="name">${esc(L.it.name)}${skSeed(L.seed)}</div><div class="meta">${esc(L.it.supplier || "no supplier")}${tp ? ` · order <b class="ink2">${esc(tp.txt)}</b> to reach par` : ""}</div>${skLvl(L)}</div><div class="right"><div class="v num">${fmt(L.s)}</div><div class="l">${esc(L.it.unit)} · par ${fmt(L.par)}</div><div style="margin-top:4px">${L.cover != null ? skCoverChip(L) : chip(L.st.cls, L.st.label)}</div></div></button>`; }).join("")}</div>${soonAll.length > soon.length ? `<button class="btn ghost full" onclick="skBoard='low';render();document.getElementById('sklv').scrollIntoView({behavior:'smooth'})">All ${soonAll.length} to reorder ›</button>` : ""}`
    : `<div class="mut small">${counted.length ? "Every counted item is at or above par, with more than four days of sales in stock." : "Nothing counted yet — the first closing count fills this list."}</div>`;

  const flt = [["all", "All"], ["low", "Below par"], ["none", "Not counted"], ["nightly", "Short list"]];
  const pick = L => skBoard === "all" ? true : skBoard === "low" ? (L.st.k === "low" || L.st.k === "out") : skBoard === "none" ? L.st.k === "none" : L.it.nightly;
  const groups = PLACES.map(pl => { const rows = Ls.filter(L => L.it.place === pl.id && pick(L)); if (!rows.length) return "";
    return `<div class="txday">${esc(pl.name)} <span class="mut">· ${rows.length}</span></div>${rows.map(L => `<button class="lvr" onclick="go('#/item/${L.it.id}')"><span class="nm">${esc(L.it.name)}<span class="st">${L.s == null ? `<span class="mut tiny">not counted</span>` : chip(L.st.cls, L.st.label)}${L.seed ? `<span class="tiny mut" data-tt="Seed count|14 Oct placeholder, not real">seed</span>` : ""}</span></span>${skLvl(L)}<span class="vl num">${L.s != null ? fmt(L.s) : "—"}<small>${esc(L.it.unit)}${L.par ? " · par " + fmt(L.par) : ""}</small></span></button>`).join("")}`; }).join("");
  const tbl = skTable(["Item", "Stock", "Par", "Days left", "Status"], Ls.filter(pick).map(L => [esc(L.it.name) + (L.seed ? " (seed)" : ""), L.s != null ? fmt(L.s) + " " + esc(L.it.unit) : "—", fmt(L.par), L.cover != null ? L.cover.toFixed(1) : "—", esc(L.st.label)]));
  const board = `<section class="card" id="sklv"><div class="split"><h2>Levels <span class="tiny mut">stock now vs par</span></h2></div>
    <div class="rng">${flt.map(([k, l]) => `<button class="${skBoard === k ? "on" : ""}" onclick="skBoard='${k}';render()">${l}</button>`).join("")}</div>
    <div class="legend"><span><b style="background:var(--s1)"></b>Stock now</span><span><b class="tick"></b>Par (middle of the bar)</span></div>
    <div class="lvls">${groups || `<div class="mut small" style="padding:12px 0">Nothing in this filter.</div>`}</div>${tbl}</section>`;

  const links = `<div class="list">${[["Items", `${ITEMS.length} items · search, filter, par and price`, "#/items"], ["Variance", lv ? `last count ${dayName(lv.day)}` : "counted vs expected", "#/variance"], ["Deliveries log", `${S.receipts.length} receipts`, "#/receipts"]].map(([n, m, h]) => `<button class="row tap" onclick="go('${h}')"><div class="main"><div class="name">${n}</div><div class="meta">${m}</div></div><span class="chev">${ic("chevron-right")}</span></button>`).join("")}</div>`;
  const how = `<div class="tiny mut">Stock now = last count + received since − sold since (UTAK, only items sold 1:1 such as drinks; food items show the last count until recipes are weighed). Days left = stock ÷ average sold per day over the last 4 weeks to ${esc(dayName(LAST_DAY))}. <b>seed</b> = the 14 Oct placeholder count, not real.</div>`;
  return shell("Stock", `Pizza 99 · sales to ${dayName(LAST_DAY)}`, actions + tiles + `<section class="card"><h2>Order soon <span class="tiny mut">fewest days left first</span></h2>${soonHTML}</section>` + board + links + how);
}

/* ---------- COUNT ---------- */
function skPlaceProg(pl) { const its = itemsIn(pl.id); const d = S.draft; const sk = (d && d.skip) || {}; const c = its.filter(i => d && d.lines[i.id] != null).length; const s = its.filter(i => d && d.lines[i.id] == null && sk[i.id]).length; return { its, c, s, left: its.length - c - s, pct: its.length ? (c + s) / its.length * 100 : 0 }; }
function viewCount() {
  startDraft(); const d = S.draft; const pls = PLACES.filter(p => itemsIn(p.id).length); const P = pls.map(p => ({ p, ...skPlaceProg(p) }));
  const tot = skSum(P.map(x => x.its.length)), c = skSum(P.map(x => x.c)), s = skSum(P.map(x => x.s)); const pct = tot ? (c + s) / tot * 100 : 0; const nextP = P.find(x => x.left > 0);
  const who = Store.person(d.by); const last = skLastSent();
  const head = `<section class="card skhead"><div class="ring big ${pct >= 100 ? "ok" : ""}" style="--p:${Math.round(pct)}"><b>${Math.round(pct)}%</b></div><div><div class="kt"><div class="lab">${d.kind === "full" ? "Full count" : "Closing count"} · started ${esc(timeOf(d.started))}${who ? " by " + esc(who.short) : ""}</div><div class="val num">${c} <span class="small mut">counted</span>${s ? ` · ${s} <span class="small mut">skipped</span>` : ""}</div><div class="trend mut">${tot - c - s} of ${tot} left · last sent ${last ? esc(dayName(last.day)) : "never"}</div></div></div></section>`;
  const seg = `<div class="seg"><button class="btn ${countScope === "nightly" ? "on" : ""}" onclick="countScope='nightly';render()">Short list (nightly)</button><button class="btn ${countScope === "all" ? "on" : ""}" onclick="countScope='all';render()">Everything (Sunday)</button></div>`;
  const steps = `<ol class="steps">${P.map((x, i) => `<li><button class="row tap ${x.left === 0 ? "done" : ""}" onclick="go('#/count/${x.p.id}')">${ring(x.pct, x.left === 0)}<div class="main"><div class="name"><span class="mut">${i + 1}.</span> ${esc(x.p.name)}</div><div class="meta">${x.c} counted${x.s ? ` · ${x.s} skipped` : ""} · ${x.left ? x.left + " left" : "done"}</div></div>${x.left === 0 ? `<span class="ic ok">${ic("check", "sm")}</span>` : ""}<span class="chev">${ic("chevron-right")}</span></button></li>`).join("")}</ol>`;
  return shell("Count", dayLong(today()), `${head}${seg}${steps}
    <div class="bottom-act two">${nextP ? `<button class="btn ${c ? "" : "primary"} full" onclick="go('#/count/${nextP.p.id}')">${c ? "Continue" : "Start"}: ${esc(nextP.p.name)} ›</button>` : ""}<button class="btn primary full" ${c ? "" : "disabled"} onclick="go('#/count/summary')">Review and send · ${c}</button></div>
    <div class="tiny mut">Count what is on the shelf, place by place. Expected stock is hidden while you count and shown in the review, so the number is what you see, not what the app thinks. Your entries stay on this device until you send.</div>
    <button class="btn ghost full danger" onclick="if(confirm('Throw away this count?')){S.draft=null;save();render()}">Discard count</button>`, { back: canManage() ? "#/stock" : "#/today" });
}
function skSkip(id) { const d = S.draft; d.skip = d.skip || {}; if (d.skip[id]) delete d.skip[id]; else { d.skip[id] = true; delete d.lines[id]; delete d.text[id]; } save(); }
function viewCountPlace(placeId) {
  startDraft(); const pl = PLACES.find(p => p.id === placeId); if (!pl) return viewCount(); const d = S.draft; const sk = d.skip || {};
  const pr = skPlaceProg(pl); const withItems = PLACES.filter(p => itemsIn(p.id).length); const ix = withItems.findIndex(p => p.id === placeId); const nextPl = withItems[ix + 1];
  const shown = pr.its.filter(it => skCountFlt === "all" ? true : skCountFlt === "done" ? d.lines[it.id] != null || sk[it.id] : d.lines[it.id] == null && !sk[it.id]);
  const rows = shown.map(it => { const q = d.lines[it.id]; const lc = Store.lastCount(it.id); const skipped = q == null && sk[it.id];
    return `<div class="crow ${q != null ? "done" : ""} ${skipped ? "skipped" : ""}"><button class="cmain" onclick="openPad('${it.id}')"><div class="name">${esc(it.name)}${skVerify(it)}</div><div class="meta">${it.pack ? `${esc(it.packUnit)} ×${it.pack} + ${esc(it.unit)}` : esc(it.unit)}${lc ? ` · last ${esc(dayName(lc.day).replace(/^\w+, /, ""))}${lc.seed ? " (seed)" : ""}` : " · first count"}</div></button>
      <div class="cval">${q != null ? `<button class="cv" onclick="openPad('${it.id}')"><b class="num">${fmt(q)}</b><small>${esc(d.text[it.id] || it.unit)}</small></button>` : skipped ? `<button class="chip" onclick="skSkip('${it.id}');render()" data-tt="Skipped|tap to put it back on the list">skipped ↺</button>` : `<button class="btn sm" onclick="skSkip('${it.id}');render()" aria-label="Skip ${esc(it.name)}">Skip</button>`}</div></div>`; }).join("");
  const tabs = [["todo", `To count · ${pr.left}`], ["done", `Done · ${pr.c + pr.s}`], ["all", "All"]];
  return shell(pl.name, `Place ${ix + 1} of ${withItems.length} · shelf order`, `
    <div class="cprog"><div class="bar ${pr.left === 0 ? "ok" : ""}"><i style="width:${pr.pct}%"></i></div><span class="num small">${pr.c + pr.s}/${pr.its.length}</span></div>
    <div class="rng">${tabs.map(([k, l]) => `<button class="${skCountFlt === k ? "on" : ""}" onclick="skCountFlt='${k}';render()">${l}</button>`).join("")}</div>
    <div class="list">${rows || `<div class="card mut small">${skCountFlt === "todo" ? `${esc(pl.name)} is done.` : "Nothing here yet."}</div>`}</div>
    <div class="bottom-act">${pr.left && skCountFlt !== "done" ? `<button class="btn primary full" onclick="openPad('${(pr.its.find(i => d.lines[i.id] == null && !sk[i.id]) || pr.its[0]).id}')">Count the next item</button>` : nextPl ? `<button class="btn primary full" onclick="skCountFlt='todo';go('#/count/${nextPl.id}')">Next: ${esc(nextPl.name)} ›</button>` : `<button class="btn primary full" onclick="go('#/count/summary')">Review and send ›</button>`}</div>${skPadHTML()}`, { back: "#/count" });
}
/* the keypad sheet for counting: bigger keys, place progress, skip; the receive keypad stays the v1 one */
function skPadHTML() {
  if (!pad) return ""; if (pad.mode !== "count") return padHTML();
  const it = Store.item(pad.itemId); const total = padTotal(); const pr = skPlaceProg({ id: it.place }); const i = pr.its.findIndex(x => x.id === it.id); const cur = S.draft.lines[it.id];
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map(k => `<button class="${k === "." || k === "⌫" ? "fn" : ""}" onclick="padKey('${k}')" aria-label="${k === "⌫" ? "delete" : k}">${k}</button>`).join("");
  return `<div class="sheet-bg" onclick="if(event.target===this){pad=null;render()}"><div class="sheet skpad" role="dialog" aria-label="Count ${esc(it.name)}">
    <div class="head"><div><div class="tiny mut">${esc(skPlace(it.place))} · item ${i + 1} of ${pr.its.length}</div><div class="nm">${esc(it.name)}</div>${cur != null ? `<div class="tiny mut">now ${fmt(cur)} ${esc(it.unit)} — typing replaces it</div>` : ""}</div><button class="btn ghost" onclick="pad=null;render()" aria-label="Close">${ic("x-close")}</button></div>
    ${it.pack ? `<div class="units"><button class="btn ${pad.field === "packs" ? "on" : ""}" onclick="pad.field='packs';render()"><span>${esc(it.packUnit)}s</span> <b class="num">${pad.packs || "0"}</b> <span class="tiny mut">×${it.pack}${it.verify ? "?" : ""}</span></button><button class="btn ${pad.field === "loose" ? "on" : ""}" onclick="pad.field='loose';render()"><span>loose ${esc(it.unit)}</span> <b class="num">${pad.loose || "0"}</b></button></div>` : ""}
    <div class="disp"><div><span class="big num">${pad[pad.field] || "0"}</span> <span class="unit">${esc(pad.field === "packs" ? it.packUnit + "s" : it.unit)}</span></div><div class="eq num">${it.pack ? `= <b>${fmt(total)}</b> ${esc(it.unit)}` : ""}</div></div>
    <div class="pad">${keys}</div>
    <div class="padact"><button class="btn" onclick="skPadSkip()">Skip</button><button class="btn primary" onclick="skPadEnter()">Save and next</button></div></div></div>`;
}
function skNextPad(it) { const its = itemsIn(it.place); const sk = S.draft.skip || {}; const open = x => S.draft.lines[x.id] == null && !sk[x.id]; const i = its.findIndex(x => x.id === it.id); const nx = its.slice(i + 1).find(open) || its.find(open);
  if (nx) openPad(nx.id); else { pad = null; toast(skPlace(it.place) + " done."); render(); } }
function skPadEnter() { const it = Store.item(pad.itemId); const p = parseFloat(pad.packs) || 0, l = parseFloat(pad.loose) || 0; S.draft.lines[it.id] = padTotal(); S.draft.text[it.id] = qtyText(it, p, l); if (S.draft.skip) delete S.draft.skip[it.id]; save(); skNextPad(it); }
function skPadSkip() { const it = Store.item(pad.itemId); S.draft.skip = S.draft.skip || {}; S.draft.skip[it.id] = true; delete S.draft.lines[it.id]; delete S.draft.text[it.id]; save(); skNextPad(it); }

function skVarRows(lines, getExp) {   // [{id, it, counted, expected, b, price, imp}]
  return Object.keys(lines).map(id => { const it = Store.item(id); if (!it) return null; const e = getExp(id); const b = band(lines[id], e); const lp = Store.lastPrice(id); const price = lp ? lp.price : null;
    return { id, it, counted: lines[id], expected: e, b, price, imp: b.v != null && price != null ? b.v * price : null }; }).filter(Boolean);
}
const SK_ORDER = { bad: 0, warn: 1, ok: 2, "": 3 };
function skDiverge(rows) {   // ranked variance bars: short to the left, over to the right; length = % off expected
  const R = rows.filter(r => r.b.v != null).sort((a, b) => SK_ORDER[a.b.cls] - SK_ORDER[b.b.cls] || Math.abs(b.b.pct) - Math.abs(a.b.pct)); if (!R.length) return "";
  const mx = Math.max(.05, ...R.map(r => Math.min(1, Math.abs(r.b.pct))));
  return `<div class="dv">${R.map(r => { const w = Math.min(1, Math.abs(r.b.pct)) / mx * 50; const neg = r.b.v < 0;
    return `<div class="dvr" data-tt="${esc(r.it.name)}|counted ${fmt(r.counted)} · expected ${fmt(r.expected)} ${esc(r.it.unit)} · ${r.b.v > 0 ? "+" : ""}${fmt(r.b.v)} (${Math.round(r.b.pct * 100)}%)${r.imp != null ? " · " + (r.imp < 0 ? "−" : "+") + peso(Math.abs(r.imp)) : ""}"><span class="nm">${esc(r.it.name)}</span><span class="tr"><i class="${neg ? "neg" : "pos"}" style="${neg ? "right:50%" : "left:50%"};width:${w.toFixed(1)}%"></i><b></b></span><span class="vl num">${r.b.v > 0 ? "+" : r.b.v < 0 ? "−" : ""}${fmt(Math.abs(r.b.v))}<small>${r.imp != null ? (r.imp < 0 ? "−" : "+") + peso(Math.abs(r.imp)) : esc(r.it.unit)}</small></span><span class="st">${chip(r.b.cls, r.b.cls === "ok" ? "ok" : r.b.cls === "warn" ? "check" : "recount")}</span></div>`; }).join("")}</div>
    <div class="legend"><span>◀ short</span><span>over ▶</span><span class="mut">bar = % off expected · chip = band</span></div>${rows.length > R.length ? `<div class="tiny mut" style="margin-top:6px">${rows.length - R.length} counted item${rows.length - R.length > 1 ? "s have" : " has"} no expected figure yet (not sold 1:1 on UTAK) — see the table.</div>` : ""}`;
}
function viewCountSummary() {
  const d = S.draft; if (!d) return viewCount(); const sk = d.skip || {};
  const rows = skVarRows(d.lines, id => { const ex = Store.expected(id); return ex ? ex.value : null; });
  const bad = rows.filter(r => r.b.cls === "bad"), warn = rows.filter(r => r.b.cls === "warn"), ok = rows.filter(r => r.b.cls === "ok"), nob = rows.filter(r => !r.b.cls);
  const scoped = ITEMS.filter(i => countScope === "all" || i.nightly); const skipped = scoped.filter(i => d.lines[i.id] == null && sk[i.id]); const missing = scoped.filter(i => d.lines[i.id] == null && !sk[i.id]);
  const imp = rows.filter(r => r.imp != null); const impTot = skSum(imp.map(r => r.imp));
  const val = skSum(rows.filter(r => r.price != null).map(r => r.counted * r.price));
  const tiles = `<div class="grid2">${tile("Counted", rows.length, `of ${scoped.length} on the list`, "")}${tile("On target", ok.length, ok.length ? chip("ok", "within band") : "", "")}${tile("To check", bad.length + warn.length, bad.length ? chip("bad", bad.length + " recount") : warn.length ? chip("warn", warn.length + " a little off") : `<span class="mut">none</span>`, "")}${tile("₱ impact", imp.length ? (impTot < 0 ? "−" : "") + peso(Math.abs(impTot)) : "—", imp.length ? `${imp.length} items with a price · stock value ${peso(val)}` : `<span class="mut">no delivery prices yet</span>`, "")}</div>`;
  const tbl = rows.slice().sort((a, b) => SK_ORDER[a.b.cls] - SK_ORDER[b.b.cls]).map(r => `<tr><td><b>${esc(r.it.name)}</b><div class="tiny mut">${esc(d.text[r.id] || "")}</div></td><td class="n num">${fmt(r.counted)}</td><td class="n num mut">${r.expected != null ? fmt(r.expected) : "—"}</td><td class="n">${r.b.cls ? chip(r.b.cls, r.b.label) : `<span class="chip">no base</span>`}</td></tr>`).join("");
  return shell("Review the count", `${rows.length} items · sales to ${dayName(Store.salesThrough())}`, `
    ${bad.length ? `<div class="alert bad">▲ ${bad.length} item${bad.length > 1 ? "s" : ""} far from expected — recount them or say why in the note.</div>` : warn.length ? `<div class="alert warn">▲ ${warn.length} item${warn.length > 1 ? "s" : ""} a little off — say why in the note if you know.</div>` : rows.length && !nob.length ? `<div class="alert ok">✓ Counted items match what was expected.</div>` : ""}
    ${missing.length ? `<div class="alert warn">○ ${missing.length} item${missing.length > 1 ? "s" : ""} on the list not counted yet.</div>` : ""}
    ${tiles}
    ${rows.some(r => r.b.v != null) ? `<section class="card"><h2>Counted vs expected <span class="tiny mut">biggest gaps first</span></h2>${skDiverge(rows)}</section>` : ""}
    <section class="card"><h2>All counted items</h2><div class="tscroll"><table class="t"><thead><tr><th>Item</th><th class="n">Counted</th><th class="n">Expected</th><th class="n">Variance</th></tr></thead><tbody>${tbl}</tbody></table></div></section>
    ${bad.length || warn.length ? `<section class="card"><h3>Recount</h3><div class="chips">${bad.concat(warn).map(r => `<button class="chip ${r.b.cls}" onclick="go('#/count/${r.it.place}');setTimeout(()=>openPad('${r.id}'),0)"><i class="dot"></i>${esc(r.it.name)}</button>`).join("")}</div></section>` : ""}
    ${missing.length ? `<section class="card"><h3>Not counted (${missing.length})</h3><div class="chips">${missing.map(i => `<button class="chip" onclick="go('#/count/${i.place}');setTimeout(()=>openPad('${i.id}'),0)">${esc(i.name)}</button>`).join("")}</div></section>` : ""}
    ${skipped.length ? `<section class="card"><h3>Skipped (${skipped.length})</h3><div class="small mut">${skipped.map(i => esc(i.name)).join(" · ")} — sent as not counted.</div></section>` : ""}
    <div class="field"><label>Note</label><textarea class="in" id="cnote" oninput="S.draft.note=this.value" placeholder="e.g. 2 Coke Zero given to guests">${esc(d.note || "")}</textarea></div>
    <div class="bottom-act"><button class="btn primary full" ${rows.length ? "" : "disabled"} onclick="submitCount()">Send the count</button></div>
    <div class="tiny mut">Expected = last count + received − sold (UTAK, items sold 1:1). Green within 1 unit or 2 %, amber within 2 units or 3 %, red beyond.</div>`, { back: "#/count" });
}

/* ---------- RECEIVE ---------- */
function skPriceFlag(id, price, base) {
  if (price == null) return ""; const hist = Store.prices(id); const lp = base || hist[hist.length - 1]; if (!lp) return `<span class="tiny mut">first price</span>`;
  const p = (price - lp.price) / lp.price; const tt = `Price per ${Store.item(id).unit}|` + hist.slice(-4).map(h => `${dayName(h.day)} ${skP(h.price)}`).join(" · ") + ` → now ${skP(price)}`;
  if (Math.abs(p) < SK_PRICE_TOL) return `<span class="pf flat" data-tt="${esc(tt)}"><i>▬</i>same as ${esc(dayName(lp.day))}</span>`;
  return `<span class="pf ${p > 0 ? "up" : "down"} ${Math.abs(p) >= .1 ? "big" : ""}" data-tt="${esc(tt)}"><i>${p > 0 ? "▲" : "▼"}</i>${Math.round(Math.abs(p) * 100)}% vs ${esc(dayName(lp.day))} (${skP(lp.price)})</span>`;
}
function skRcPad(id) { openPad(id, "receive", (qty, text) => { if (!qty) return; const lp = Store.lastPrice(id); rc.lines.push({ item: id, qty, text, price: null, _last: lp ? lp.price : null }); }); }
function viewReceive() {
  if (!rc) rc = { kind: "delivery", supplier: "", lines: [], photo: null, amount: "" };
  const srcs = rc.kind === "pullout" ? ["Office", "MCC", "Dragon store", "MCBC", "Burger Kong"] : SUPPLIERS;
  const recent = [...new Set(S.receipts.filter(r => r.kind === rc.kind).sort((a, b) => a.day < b.day ? 1 : -1).map(r => r.supplier))].filter(s => srcs.includes(s)).slice(0, 6);
  const freq = {}; S.receipts.filter(r => r.supplier === rc.supplier).forEach(r => r.lines.forEach(l => freq[l.item] = (freq[l.item] || 0) + 1));
  const usual = Object.keys(freq).sort((a, b) => freq[b] - freq[a]).filter(id => Store.item(id) && !rc.lines.some(l => l.item === id)).slice(0, 8);
  const itemOpts = ITEMS.filter(i => !rc.supplier || !i.supplier || i.supplier === rc.supplier || rc.kind !== "delivery").map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join("");
  const lines = rc.lines.map((l, i) => { const it = Store.item(l.item); const lp = Store.lastPrice(l.item);
    return `<div class="rline"><div class="main"><div class="name">${esc(it.name)}</div><div class="meta">${esc(l.text || fmt(l.qty) + " " + it.unit)} = ${fmt(l.qty)} ${esc(it.unit)}${l.price != null ? ` · <b class="ink2">${peso(l.price * l.qty)}</b>` : ""}</div></div>
      <button class="btn ghost danger rx" onclick="rc.lines.splice(${i},1);render()" aria-label="Remove ${esc(it.name)}">${ic("x-close")}</button>
      ${rc.kind !== "pullout" ? `<div class="rprice"><label class="rpin"><span>₱</span><input class="in num" inputmode="decimal" aria-label="Price per ${esc(it.unit)}" placeholder="${lp ? fmt(lp.price) : "price"}" value="${l.price != null ? l.price : ""}" onchange="rc.lines[${i}].price=this.value===''?null:parseFloat(this.value);render()"><span class="tiny mut">per ${esc(it.unit)}</span></label><div class="pflag">${l.price != null ? skPriceFlag(l.item, l.price) : lp ? `<span class="tiny mut">last ${skP(lp.price)} on ${esc(dayName(lp.day))}</span>` : `<span class="tiny mut">no earlier price</span>`}</div></div>` : ""}</div>`; }).join("");
  const priced = rc.lines.filter(l => l.price != null); const tot = skSum(priced.map(l => l.price * l.qty)); const flags = priced.filter(l => { const lp = Store.lastPrice(l.item); return lp && Math.abs((l.price - lp.price) / lp.price) >= SK_PRICE_TOL; });
  const need = []; if (!rc.supplier) need.push(rc.kind === "pullout" ? "where from" : "supplier"); if (!rc.lines.length) need.push("at least one item"); if (rc.kind !== "pullout" && !rc.photo) need.push("photo");
  const steps = [[!!rc.supplier, rc.kind === "pullout" ? "From" : "Supplier"], [rc.lines.length > 0, "Items"], [rc.kind === "pullout" || !!rc.photo, "Photo"]];
  return shell("Receive", dayLong(today()), `
    <ol class="rsteps">${steps.map(([ok, l], i) => `<li class="${ok ? "ok" : ""}"><span>${ok ? "✓" : i + 1}</span>${l}</li>`).join("")}</ol>
    <div class="seg">${RECEIPT_KINDS.map(([k, l]) => `<button class="btn ${rc.kind === k ? "on" : ""}" onclick="rc.kind='${k}';rc.supplier='';render()">${esc(l.split(" (")[0])}</button>`).join("")}</div>
    <section class="card"><div class="field"><label>${rc.kind === "pullout" ? "From" : "Supplier / store"}</label><select class="in" onchange="rc.supplier=this.value;render()"><option value="">— choose —</option>${srcs.map(s => `<option ${rc.supplier === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div>
      ${recent.length ? `<div class="chips" style="margin-top:8px">${recent.map(s => `<button class="chip ${rc.supplier === s ? "info" : ""}" onclick="rc.supplier=${esc(JSON.stringify(s))};render()">${esc(s)}</button>`).join("")}</div>` : ""}</section>
    <section class="card"><h2>Items <span class="tiny mut">${rc.lines.length} line${rc.lines.length === 1 ? "" : "s"}${priced.length ? ` · ${peso(tot)}` : ""}</span></h2>
      ${usual.length ? `<div class="tiny mut" style="margin-bottom:6px">Usually from ${esc(rc.supplier)} — tap to add</div><div class="chips">${usual.map(id => `<button class="chip" onclick="skRcPad('${id}')">+ ${esc(Store.item(id).name)}</button>`).join("")}</div>` : ""}
      <div class="field" style="margin-top:10px"><label>Any item</label><div style="display:flex;gap:8px"><select class="in" id="rcitem">${itemOpts}</select><button class="btn primary" onclick="skRcPad(document.getElementById('rcitem').value)">Qty</button></div></div>
      ${lines ? `<div class="list" style="margin-top:10px">${lines}</div>` : `<div class="mut small" style="margin-top:8px">No lines yet.</div>`}
      ${flags.length ? `<div class="alert warn" style="margin-top:10px">▲ ${flags.length} price${flags.length > 1 ? "s" : ""} changed by ${Math.round(SK_PRICE_TOL * 100)} % or more since the last delivery — check the invoice.</div>` : ""}</section>
    ${rc.kind === "purchase" ? `<div class="field"><label>Amount paid (₱)</label><input class="in num" inputmode="decimal" value="${esc(rc.amount)}" placeholder="${priced.length ? fmt(Math.round(tot)) : ""}" oninput="rc.amount=this.value"></div>` : ""}
    ${rc.kind !== "pullout" ? `<div>${photoBtn(rc.kind === "purchase" ? "Photo of the receipt (required)" : "Photo of the invoice or goods (required)", "rc.photo=id;render()", rc.photo)}${thumb(rc.photo, "big")}</div>` : ""}
    <div class="bottom-act"><button class="btn primary full" ${need.length ? "disabled" : ""} onclick="rcSave()">Save · ${rc.lines.length} line${rc.lines.length === 1 ? "" : "s"}${priced.length ? " · " + peso(tot) : ""}</button></div>
    ${need.length ? `<div class="tiny mut" style="text-align:center">Needed: ${need.join(", ")}.</div>` : ""}${padHTML()}`, { back: role() === "crew" ? "#/today" : "#/stock" });
}

/* ---------- RECEIPTS (deliveries log) ---------- */
function viewReceipts() {
  const from = skRx.range === "all" ? "0000" : addDays(today(), -(+skRx.range - 1));
  const rs = S.receipts.filter(r => r.day >= from && (!skRx.sup || r.supplier === skRx.sup) && (!skRx.kind || r.kind === skRx.kind)).sort((a, b) => a.day < b.day ? 1 : a.day > b.day ? -1 : 0);
  const lineVal = l => l.price != null ? l.price * l.qty : null; const rVal = r => { const v = r.lines.map(lineVal).filter(x => x != null); return r.amount != null ? r.amount : v.length ? skSum(v) : null; };
  const nL = skSum(rs.map(r => r.lines.length)), nP = skSum(rs.map(r => r.lines.filter(l => l.price != null).length)); const val = skSum(rs.map(rVal).filter(x => x != null));
  const bySup = {}; rs.forEach(r => { const o = bySup[r.supplier] = bySup[r.supplier] || { n: 0, lines: 0, val: 0 }; o.n++; o.lines += r.lines.length; o.val += rVal(r) || 0; }); const sups = Object.entries(bySup).sort((a, b) => b[1].n - a[1].n); const mx = sups.length ? sups[0][1].n : 1;
  const tiles = `<div class="grid2">${tile("Receipts", rs.length, rs.length ? `${nL} lines` : `<span class="mut">none in this range</span>`, "")}${tile("Suppliers", sups.length, sups[0] ? `most: ${esc(sups[0][0])}` : "", "")}${tile("Value", nP ? peso(val) : "—", nP ? `${nP} of ${nL} lines priced` : `<span class="mut">no prices — the chat carried none</span>`, "")}${tile("With photo", rs.filter(r => r.photo).length, `of ${rs.length}`, "")}</div>`;
  const chart = sups.length ? `<section class="card"><h2>By supplier <span class="tiny mut">receipts in range</span></h2><div class="hb items">${sups.slice(0, 8).map(([s, o]) => `<button class="hbr hbtn" data-tt="${esc(s)}|${o.n} receipts · ${o.lines} lines${o.val ? " · " + peso(o.val) : ""}" onclick="skRx.sup=${esc(JSON.stringify(skRx.sup === s ? "" : s))};render()"><span class="nm">${esc(s)}</span><span class="tr"><i style="width:${(100 * o.n / mx).toFixed(1)}%"></i></span><span class="vl num">${o.n}<small>${o.lines} lines</small></span></button>`).join("")}</div>${skTable(["Supplier", "Receipts", "Lines", "Value"], sups.map(([s, o]) => [esc(s), o.n, o.lines, o.val ? peso(o.val) : "—"]))}</section>` : "";
  const days = [...new Set(rs.map(r => r.day))];
  const list = days.map(d => { const dr = rs.filter(r => r.day === d); const dv = dr.map(rVal).filter(x => x != null);
    return `<div class="txday">${esc(dayName(d))} <span class="mut">· ${dr.length} receipt${dr.length > 1 ? "s" : ""}${dv.length ? " · " + peso(skSum(dv)) : ""}</span></div>${dr.map(r => { const k = RECEIPT_KINDS.find(x => x[0] === r.kind); const v = rVal(r); const who = Store.person(r.by);
      return `<div class="rrow">${r.photo ? thumb(r.photo) : `<span class="nophoto" data-tt="No photo|seed rows come from the crew chat">—</span>`}<div class="main"><div class="name">${esc(r.supplier)} ${r.kind !== "delivery" ? chip("", k ? k[1].split(" (")[0] : r.kind) : ""}</div><div class="meta">${r.lines.map(l => { const it = Store.item(l.item); return `<a href="#/item/${l.item}">${esc(it ? it.name : l.item)}</a> ${fmt(l.qty)} ${esc(it ? it.unit : "")}${l.text ? " (" + esc(l.text) + ")" : ""}`; }).join(" · ")}${who ? " · " + esc(who.short) : ""}</div></div><div class="right"><div class="v num">${v != null ? peso(v) : ""}</div><div class="l">${r.lines.length} line${r.lines.length > 1 ? "s" : ""}</div></div></div>`; }).join("")}`; }).join("");
  const supOpts = [...new Set(S.receipts.map(r => r.supplier))].sort();
  return shell("Deliveries log", "crew chat 18 Aug–9 Sep, then this app", `
    <div class="rng">${[["7", "7 days"], ["30", "30 days"], ["90", "90 days"], ["all", "All"]].map(([k, l]) => `<button class="${skRx.range === k ? "on" : ""}" onclick="skRx.range='${k}';render()">${l}</button>`).join("")}</div>
    <div class="txctl"><select class="in" onchange="skRx.sup=this.value;render()"><option value="">All suppliers</option>${supOpts.map(s => `<option ${skRx.sup === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select><select class="in" onchange="skRx.kind=this.value;render()"><option value="">All kinds</option>${RECEIPT_KINDS.map(([k, l]) => `<option value="${k}" ${skRx.kind === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>
    ${tiles}${chart}
    <section class="card txlist">${list || `<div class="mut small" style="padding:12px 0">No receipts in this range.${skRx.range !== "all" ? ` <a href="javascript:void(0)" onclick="skRx.range='all';render()">Show all ›</a>` : ""}</div>`}</section>
    <button class="btn primary full" onclick="go('#/receive')">${ic("package", "sm")}Receive a delivery</button>`, { back: "#/stock" });
}

/* ---------- ITEMS ---------- */
function viewItems() {
  skLoadDB(); const q = skItemQ.toLowerCase().trim();
  const src = `<div class="seg tabs2"><button class="btn ${skItemSrc === "store" ? "on" : ""}" onclick="skItemSrc='store';render()">Stock (${ITEMS.length})</button><button class="btn ${skItemSrc === "db" ? "on" : ""}" ${typeof sb === "undefined" ? "disabled" : ""} onclick="skItemSrc='db';render()">Chef sheet${SKDB.state === "ok" ? ` (${SKDB.items.length})` : ""}</button></div>`;
  const search = `<input class="in" type="search" id="skq" placeholder="Search items or suppliers" value="${esc(skItemQ)}" oninput="skItemQ=this.value;render();const i=document.getElementById('skq');i.focus();i.setSelectionRange(99,99)">`;
  if (skItemSrc === "db") return shell("Items", "ingredients list from the chef sheet (read only)", src + search + skDbList(q), { back: "#/stock" });
  let Ls = ITEMS.map(skLevel).filter(L => (!q || (L.it.name + " " + (L.it.supplier || "")).toLowerCase().includes(q)) && (!skItemPlace || L.it.place === skItemPlace) && (!skItemSup || L.it.supplier === skItemSup)
    && (skItemFlt === "" ? true : skItemFlt === "low" ? (L.st.k === "low" || L.st.k === "out") : skItemFlt === "none" ? L.st.k === "none" : skItemFlt === "nightly" ? L.it.nightly : skItemFlt === "verify" ? L.it.verify : true));
  const srt = { place: (a, b) => PLACES.findIndex(p => p.id === a.it.place) - PLACES.findIndex(p => p.id === b.it.place), name: (a, b) => a.it.name.localeCompare(b.it.name), cover: (a, b) => (a.cover == null ? 1e9 : a.cover) - (b.cover == null ? 1e9 : b.cover), par: (a, b) => ((a.s == null ? 9 : a.s / (a.par || 1)) - (b.s == null ? 9 : b.s / (b.par || 1))) };
  Ls = Ls.slice().sort(srt[skItemSort] || srt.place);
  const sups = [...new Set(ITEMS.map(i => i.supplier).filter(Boolean))].sort();
  const ctl = `<div class="txctl"><select class="in" onchange="skItemPlace=this.value;render()" aria-label="Place"><option value="">All places</option>${PLACES.map(p => `<option value="${p.id}" ${skItemPlace === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select><select class="in" onchange="skItemSup=this.value;render()" aria-label="Supplier"><option value="">All suppliers</option>${sups.map(s => `<option ${skItemSup === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select><select class="in" onchange="skItemSort=this.value;render()" aria-label="Sort"><option value="place" ${skItemSort === "place" ? "selected" : ""}>Sort: shelf place</option><option value="par" ${skItemSort === "par" ? "selected" : ""}>Sort: lowest vs par</option><option value="cover" ${skItemSort === "cover" ? "selected" : ""}>Sort: fewest days left</option><option value="name" ${skItemSort === "name" ? "selected" : ""}>Sort: A–Z</option></select></div>`;
  const flt = `<div class="rng">${[["", "All"], ["low", "Below par"], ["none", "Not counted"], ["nightly", "Short list"], ["verify", "Pack to verify"]].map(([k, l]) => `<button class="${skItemFlt === k ? "on" : ""}" onclick="skItemFlt='${k}';render()">${l}</button>`).join("")}</div>`;
  const row = L => { const lp = Store.lastPrice(L.it.id);
    return `<button class="row tap skrow" onclick="go('#/item/${L.it.id}')"><div class="main"><div class="name">${esc(L.it.name)}${skSeed(L.seed)}${skVerify(L.it)}</div><div class="meta">${skItemSort === "place" ? "" : esc(skPlace(L.it.place)) + " · "}${L.it.supplier ? esc(L.it.supplier) + " · " : ""}par ${fmt(L.par)} ${esc(L.it.unit)}${lp ? ` · ${skP(lp.price)}/${esc(L.it.unit)}` : ""}${L.it.nightly ? " · nightly" : ""}${L.cover != null && L.st.k !== "ok" ? ` · ${L.cover >= 30 ? "30+" : L.cover.toFixed(1)} days left` : ""}</div>${skLvl(L)}</div>
      <div class="right">${L.s != null ? `<div class="v num">${fmt(L.s)}</div><div class="l">${esc(L.it.unit)}</div>` : `<div class="l">no count</div>`}<div style="margin-top:4px">${L.s == null ? "" : L.st.k !== "ok" ? chip(L.st.cls, L.st.label) : L.cover != null ? skCoverChip(L) : chip("ok", "ok")}</div></div></button>`; };
  const body = skItemSort === "place" ? PLACES.map(pl => { const r = Ls.filter(L => L.it.place === pl.id); return r.length ? `<div class="txday">${esc(pl.name)} <span class="mut">· ${r.length}</span></div><div class="list">${r.map(row).join("")}</div>` : ""; }).join("") : `<div class="list">${Ls.map(row).join("")}</div>`;
  return shell("Items", `${Ls.length} of ${ITEMS.length} items`, src + search + ctl + flt + (Ls.length ? body : `<div class="card mut small">No item matches.</div>`) +
    skTable(["Item", "Stock", "Par", "Days left", "Last price"], Ls.map(L => { const lp = Store.lastPrice(L.it.id); return [esc(L.it.name), L.s != null ? fmt(L.s) : "—", fmt(L.par), L.cover != null ? L.cover.toFixed(1) : "—", lp ? skP(lp.price) : "—"]; })), { back: "#/stock" });
}
function skDbList(q) {
  if (SKDB.state === "loading" || SKDB.state === "idle") return `<div class="card mut small">Loading the ingredients list…</div>`;
  if (SKDB.state === "fail" || !SKDB.items.length) return `<div class="card mut small">The ingredients list could not be read from the database. The stock list above still works.</div>`;
  const its = SKDB.items.filter(x => !q || (x.name + " " + (x.code || "") + " " + (SKDB.sups[x.supplier_id] || "")).toLowerCase().includes(q));
  const places = Object.values(SKDB.places).sort((a, b) => (a.sort || 0) - (b.sort || 0)); const conf = SKDB.items.filter(x => x.confirmed).length;
  const parTxt = x => x.par == null ? "—" : x.pack_qty && +x.pack_qty > 1 ? `${fmt(x.par / x.pack_qty)} ${esc(x.pack_unit || "")}` : `${fmt(x.par)} ${esc(x.pack_unit || x.base_unit)}`;
  const packTxt = x => [x.pack_unit ? `${esc(x.pack_unit)}${x.pack_qty ? " = " + fmt(x.pack_qty) + " " + esc(x.base_unit) : ""}` : esc(x.base_unit), x.case_unit ? `${esc(x.case_unit)}${x.case_qty ? " of " + fmt(x.case_qty) : ""}` : ""].filter(Boolean).join(" · ");
  const row = x => { const local = Store.item(x.code);
    return `<${local ? `button class="row tap"` : `div class="row"`} ${local ? `onclick="go('#/item/${local.id}')"` : ""}><div class="main"><div class="name">${esc(x.name)} ${x.confirmed ? chip("ok", "confirmed") : `<span class="sample">to check</span>`}</div><div class="meta">${esc(x.category || "")} · ${packTxt(x)}${SKDB.sups[x.supplier_id] ? " · " + esc(SKDB.sups[x.supplier_id]) : ""}${x.pos_item ? " · UTAK: " + esc(x.pos_item) : ""}${x.count_nightly ? " · nightly" : ""}</div></div><div class="right"><div class="v num small">${parTxt(x)}</div><div class="l">par${x.ref_price != null ? " · " + peso(x.ref_price) : ""}</div></div>${local ? `<span class="chev">${ic("chevron-right")}</span>` : ""}</${local ? "button" : "div"}>`; };
  const groups = places.map(p => { const r = its.filter(x => x.place_id === p.id); return r.length ? `<div class="txday">${esc(p.name)} <span class="mut">· ${r.length}</span></div><div class="list">${r.map(row).join("")}</div>` : ""; }).join("");
  const loose = its.filter(x => !SKDB.places[x.place_id]);
  return `<div class="alert ${conf === SKDB.items.length ? "ok" : "warn"}">${conf} of ${SKDB.items.length} rows confirmed by the store; the rest are still "to check". Prices: ${SKDB.items.filter(x => x.ref_price != null).length} filled.</div>${groups}${loose.length ? `<div class="txday">No place</div><div class="list">${loose.map(row).join("")}</div>` : ""}
    ${skTable(["Code", "Par", "Pack", "Supplier", "Status"], its.map(x => [esc(x.code || x.name), parTxt(x), packTxt(x), esc(SKDB.sups[x.supplier_id] || "—"), x.confirmed ? "confirmed" : "to check"]))}`;
}

/* ---------- ITEM card ---------- */
function viewItem(id) {
  const it = Store.item(id); if (!it) return viewItems(); skLoadDB(); const L = skLevel(it); const ex = L.ex; const prices = Store.prices(id); const lp = prices[prices.length - 1], pp = prices[prices.length - 2];
  const weeks = skWeeks(it, 8); const RI = skRecipeInfo(it);
  const recs = S.receipts.filter(r => r.lines.some(l => l.item === id)).sort((a, b) => a.day < b.day ? 1 : -1);
  const counts = S.counts.filter(c => c.submitted && c.lines[id] != null).sort((a, b) => a.submitted < b.submitted ? 1 : -1);
  const tiles = `<div class="grid2">
    ${tile("Stock now", L.s != null ? `${fmt(L.s)} <span class="small mut">${esc(it.unit)}</span>` : "—", L.s == null ? `<span class="mut">never counted</span>` : `${chip(L.st.cls, L.st.label)}${skSeed(L.seed)}`, "")}
    ${tile("Par", `${fmt(it.par)} <span class="small mut">${esc(it.unit)}</span>`, (() => { const tp = skToPar(L); return tp ? `order ${esc(tp.txt)}` : L.s != null ? `<span class="mut">at or above par</span>` : ""; })(), "")}
    ${tile("Days left", L.cover != null ? L.cover.toFixed(1) : RI && RI.perDay && L.s != null ? `≈${(Math.max(0, L.s) / RI.perDay).toFixed(1)} <span class="sample">guess</span>` : "—", L.perDay ? `${fmt(Math.round(L.perDay * 10) / 10)} ${esc(it.unit)}/day sold · 4 weeks` : it.pos ? `<span class="mut">no sales in 4 weeks</span>` : RI && RI.perDay ? `<span class="mut">recipe guess ${fmt(Math.round(RI.perDay * 100) / 100)} ${esc(it.unit)}/day</span>` : `<span class="mut">needs weighed recipes</span>`, weeks ? spark(weeks) : "")}
    ${tile("Last price", lp ? skP(lp.price) : "—", lp ? `per ${esc(it.unit)} · ${esc(dayName(lp.day))}${pp ? " " + skPriceFlag(id, lp.price, pp) : ""}`  : `<span class="mut">no delivery with a price yet</span>`, "")}
  </div>`;
  const math = ex ? `<section class="card"><h2>How stock now is worked out</h2><table class="t"><tbody>
    <tr><td>Last count · ${esc(dayName(ex.base.day))}${ex.base.seed ? " " + skSeed(true) : ""}</td><td class="n num">${fmt(ex.base.qty)}</td></tr>
    <tr><td>+ received since</td><td class="n num">${fmt(ex.received)}</td></tr>
    <tr><td>− sold since (UTAK to ${esc(dayName(LAST_DAY))})</td><td class="n num">${ex.sold == null ? `<span class="mut">not deducted</span>` : fmt(ex.sold)}</td></tr>
    <tr><td><b>= ${ex.value != null ? "expected now" : "stock shown"}</b></td><td class="n num"><b>${fmt(L.s)} ${esc(it.unit)}</b></td></tr></tbody></table>
    ${ex.value == null ? `<div class="tiny mut" style="margin-top:6px">Not sold 1:1 on UTAK, so sales are not deducted yet; received since the count (${fmt(ex.received)}) is not added either until recipes exist.</div>` : ""}</section>` : "";
  const wl = weeks ? weeks.map((v, i) => i === weeks.length - 1 ? "now" : `−${weeks.length - 1 - i}w`) : [];
  const wlabel = i => `Week to ${dayName(addDays(LAST_DAY, -7 * (weeks.length - 1 - i)))}`;
  const usage = weeks ? `<section class="card"><h2>Sold per week <span class="tiny mut">UTAK “${esc(it.pos)}”, 8 weeks to ${esc(dayName(LAST_DAY))}</span></h2>${skBarChart(weeks, wl, { unit: it.unit, hi: weeks.length - 1, tips: weeks.map((_, i) => wlabel(i)) })}${skTable(["Week", "Sold"], weeks.map((v, i) => [esc(wlabel(i)), fmt(v) + " " + esc(it.unit)]).reverse())}</section>` : "";
  const price = `<section class="card"><h2>Price per ${esc(it.unit)}</h2>${prices.length >= 2 ? skLineChart(prices.map(p => ({ x: p.day, y: p.price, sup: p.supplier })), it.unit) + skTable(["Day", "Price", "Supplier"], prices.slice().reverse().map(p => [esc(dayName(p.day)), skP(p.price), esc(p.supplier)])) : `<div class="mut small">${prices.length ? `One price so far: ${skP(prices[0].price)} on ${esc(dayName(prices[0].day))}.` : "No delivery with a price yet. Type the price on the invoice when you receive; the history and change alerts start from there."}</div>`}</section>`;
  let recipe = "";
  if (RI && RI.feeds.length) { const F = RI.feeds.sort((a, b) => b.qty - a.qty); const bu = RI.db.base_unit;
    recipe = `<section class="card"><h2>Goes into <span class="tiny mut">${F.length} menu items · from the chef sheet</span></h2>${F.some(f => !f.confirmed) ? `<div class="alert warn">Recipes not weighed yet — quantities are the template's guesses.</div>` : ""}
      <div class="hb items">${F.slice(0, 12).map(f => `<div class="hbr" data-tt="${esc(f.cat)} · ${esc(f.item)}|${fmt(Math.round(f.qty * 10) / 10)} ${esc(bu)} per portion${f.confirmed ? "" : " (guess)"}"><span class="nm">${esc(f.item)}<small>${esc(f.cat)}</small></span><span class="tr"><i style="width:${(100 * f.qty / F[0].qty).toFixed(1)}%"></i></span><span class="vl num">${fmt(Math.round(f.qty * 10) / 10)}<small>${esc(bu)}</small></span></div>`).join("")}</div>
      ${RI.perDayBase ? `<div class="small" style="margin-top:10px">UTAK sales × these recipes ≈ <b>${fmt(Math.round(RI.perDayBase))} ${esc(bu)}/day</b>${RI.perDay ? ` (${fmt(Math.round(RI.perDay * 100) / 100)} ${esc(it.unit)})` : ""} over the last 4 weeks. <span class="sample">estimate</span></div>` : ""}
      ${skTable(["Menu item", "Per portion"], F.map(f => [esc(f.cat + " · " + f.item), fmt(Math.round(f.qty * 10) / 10) + " " + esc(bu)]))}</section>`; }
  else if (!it.pos && typeof sb !== "undefined" && SKDB.state === "loading") recipe = `<section class="card mut small">Reading recipes…</section>`;
  const ch = counts.map(c => { const v = c.var && c.var[id]; const b = v ? band(v.counted, v.expected) : null; return `<tr><td>${esc(dayName(c.day))}<div class="tiny mut">${esc(c.kind || "")}${c.seed ? " · seed" : ""}${Store.person(c.by) ? " · " + esc(Store.person(c.by).short) : ""}</div></td><td class="n num">${fmt(c.lines[id])}</td><td class="n num mut">${v && v.expected != null ? fmt(v.expected) : "—"}</td><td class="n">${b && b.cls ? chip(b.cls, b.label) : `<span class="mut tiny">—</span>`}</td></tr>`; }).join("");
  const countsHTML = `<section class="card"><h2>Count history</h2>${counts.length ? `<div class="tscroll"><table class="t"><thead><tr><th>Day</th><th class="n">Counted</th><th class="n">Expected</th><th class="n">Variance</th></tr></thead><tbody>${ch}</tbody></table></div>` : `<div class="mut small">Nothing counted yet.</div>`}</section>`;
  const recHTML = `<section class="card"><h2>Deliveries <span class="tiny mut">${recs.length}</span></h2>${recs.length ? `<div class="list">${recs.slice(0, 10).map(r => { const l = r.lines.find(x => x.item === id); return `<div class="row"><div class="main"><div class="name">${fmt(l.qty)} ${esc(it.unit)}${l.text ? ` <span class="small mut">${esc(l.text)}</span>` : ""}</div><div class="meta">${esc(dayName(r.day))} · ${esc(r.supplier)}${Store.person(r.by) ? " · " + esc(Store.person(r.by).short) : ""}</div></div><div class="right"><div class="v num">${l.price != null ? skP(l.price) : ""}</div></div>${thumb(r.photo)}</div>`; }).join("")}</div>${recs.length > 10 ? `<a href="#/receipts" class="small">All in the deliveries log ›</a>` : ""}` : `<div class="mut small">None recorded.</div>`}</section>`;
  const db = RI ? RI.db : skDbItem(id);
  const settings = `<section class="card"><h2>Settings</h2><table class="t"><tbody>
    <tr><td>Place</td><td class="n">${esc(skPlace(it.place))}</td></tr><tr><td>Supplier</td><td class="n">${esc(it.supplier || "—")}</td></tr>
    <tr><td>Counted as</td><td class="n">${it.pack ? `${esc(it.packUnit)} of ${it.pack} ${esc(it.unit)}${it.verify ? " " + chip("warn", "verify") : ""}` : esc(it.unit)}</td></tr>
    <tr><td>Nightly short list</td><td class="n">${it.nightly ? "yes" : "no"}</td></tr><tr><td>Sold as-is on UTAK</td><td class="n">${it.pos ? esc(it.pos) : "via recipes"}</td></tr>
    ${db ? `<tr><td>Chef sheet</td><td class="n">${db.confirmed ? chip("ok", "confirmed") : `<span class="sample">to check</span>`} · ${esc(db.base_unit)}${db.pack_unit ? " · " + esc(db.pack_unit) + (db.pack_qty ? " = " + fmt(db.pack_qty) + " " + esc(db.base_unit) : "") : ""}</td></tr>` : ""}</tbody></table></section>`;
  return shell(it.name, `${esc(skPlace(it.place))}${it.supplier ? " · " + esc(it.supplier) : ""}`, `${tiles}<div class="skact"><button class="btn" onclick="startDraft();go('#/count/${it.place}');setTimeout(()=>openPad('${id}'),0)">${ic("grid-01", "sm")}Count it</button><button class="btn" onclick="rc=rc||{kind:'delivery',supplier:${esc(JSON.stringify(it.supplier || ""))},lines:[],photo:null,amount:''};go('#/receive');setTimeout(()=>skRcPad('${id}'),0)">${ic("package", "sm")}Receive it</button></div>${math}${usage}${price}${recipe}${countsHTML}${recHTML}${settings}`, { back: "#/items" });
}

/* ---------- VARIANCE ---------- */
function viewVariance() {
  const cs = S.counts.filter(c => c.var).sort((a, b) => a.submitted < b.submitted ? 1 : -1);
  if (!cs.length) return shell("Variance", "counted vs expected", `<section class="card"><h2>Nothing counted yet</h2><div class="mut small">No count has been sent from this app. The first closing count shows here against the seed count of 14 Oct, with the real UTAK sales in between.</div><button class="btn primary full" style="margin-top:12px" onclick="go('#/count')">Start a count</button></section>${skVarHow()}`, { back: "#/stock" });
  if (skVarSel >= cs.length) skVarSel = 0; const c = cs[skVarSel]; const rows = skVarRows(c.lines, id => c.var[id] ? c.var[id].expected : null);
  const n = k => rows.filter(r => r.b.cls === k).length; const imp = rows.filter(r => r.imp != null); const impTot = skSum(imp.map(r => r.imp));
  const pick = cs.length > 1 ? `<div class="rng">${cs.slice(0, 8).map((x, i) => { const bad = Object.values(x.var).filter(v => band(v.counted, v.expected).cls === "bad").length; return `<button class="${i === skVarSel ? "on" : ""}" onclick="skVarSel=${i};render()">${esc(dayName(x.day))}${bad ? ` · ${bad}▲` : ""}</button>`; }).join("")}</div>` : "";
  const tiles = `<div class="grid2">${tile("On target", `${n("ok")}<span class="small mut"> / ${rows.length}</span>`, n("ok") === rows.length ? chip("ok", "all within band") : "", "")}${tile("A little off", n("warn"), n("warn") ? chip("warn", "check") : `<span class="mut">none</span>`, "")}${tile("Far off", n("bad"), n("bad") ? chip("bad", "recount / explain") : `<span class="mut">none</span>`, "")}${tile("₱ impact", imp.length ? (impTot < 0 ? "−" : "+") + peso(Math.abs(impTot)) : "—", imp.length ? `${imp.length} of ${rows.length} items priced` : `<span class="mut">needs delivery prices</span>`, "")}</div>`;
  const sorted = rows.slice().sort((a, b) => SK_ORDER[a.b.cls] - SK_ORDER[b.b.cls] || Math.abs(b.imp || 0) - Math.abs(a.imp || 0) || Math.abs(b.b.pct || 0) - Math.abs(a.b.pct || 0));
  const tbl = `<div class="tscroll"><table class="t"><thead><tr><th>Item</th><th class="n">Counted</th><th class="n">Expected</th><th class="n">±</th><th class="n">₱</th><th class="n">Band</th></tr></thead><tbody>${sorted.map(r => `<tr class="tap" onclick="go('#/item/${r.id}')"><td><b>${esc(r.it.name)}</b><div class="tiny mut">${esc((c.text && c.text[r.id]) || r.it.unit)}</div></td><td class="n num">${fmt(r.counted)}</td><td class="n num mut">${r.expected != null ? fmt(r.expected) : "—"}</td><td class="n num">${r.b.v != null ? (r.b.v > 0 ? "+" : "") + fmt(r.b.v) : "—"}</td><td class="n num">${r.imp != null ? (r.imp < 0 ? "−" : "+") + peso(Math.abs(r.imp)) : "—"}</td><td class="n">${r.b.cls ? chip(r.b.cls, r.b.cls === "ok" ? "ok" : r.b.cls === "warn" ? "check" : "recount") : `<span class="chip">no base</span>`}</td></tr>`).join("")}</tbody></table></div>`;
  const sk = c.skip ? Object.keys(c.skip).filter(id => Store.item(id)) : [];
  return shell("Variance", `${dayName(c.day)} · ${timeOf(c.submitted)}${Store.person(c.by) ? " by " + esc(Store.person(c.by).short) : ""}`, `${pick}${tiles}
    ${rows.some(r => r.b.v != null) ? `<section class="card"><h2>Counted vs expected <span class="tiny mut">far off first</span></h2>${skDiverge(rows)}<details class="tbl"><summary>Show as table</summary>${tbl}</details></section>` : `<section class="card"><h2>Counted</h2>${tbl}</section>`}
    ${c.note ? `<section class="card"><h3>Note</h3><div class="small">${esc(c.note)}</div></section>` : ""}
    ${sk.length ? `<section class="card"><h3>Skipped (${sk.length})</h3><div class="small mut">${sk.map(id => esc(Store.item(id).name)).join(" · ")}</div></section>` : ""}
    ${skVarHow()}`, { back: "#/stock" });
}
const skVarHow = () => `<section class="card"><h2>How expected is worked out</h2><ul class="ins">
  <li><span>1</span><div>Start from the <b>last count</b> of the item (the 14 Oct seed count until a real one is sent).</div></li>
  <li><span>2</span><div><b>Add</b> everything received since: deliveries, cash buys and pull-outs typed in Receive.</div></li>
  <li><span>3</span><div><b>Take off</b> what UTAK sold since — today only items sold 1:1 (drinks, water). Food comes in once the recipes are weighed.</div></li>
  <li><span>●</span><div><b>Bands:</b> ${chip("ok", "ok")} within 1 unit or 2 % · ${chip("warn", "check")} within 2 units or 3 % · ${chip("bad", "recount")} beyond. ₱ uses the last delivery price per unit, where one exists.</div></li></ul></section>`;

/* a tooltip must not hang on after the page moves under it */
window.addEventListener("scroll", () => { if (typeof hideTip === "function") hideTip(); }, { passive: true });
window.addEventListener("hashchange", () => { if (typeof hideTip === "function") hideTip(); });
