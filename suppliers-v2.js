/* suppliers-v2.js — suppliers, stores and prices per kg / L (v0.14, 2026-11-08, migration 022).
   Stefan: "encode a new supplier or new store … a data bank of the suppliers … per-kilogram price, per-liter price, and how it changed".
   Who: the office and the owners add and edit suppliers and stores; the store and the morning run may add a new supplier from Receive
   (name, phone), which stays "to complete" until the office fills in terms and delivery days. Prices and money are for the office and owners. */

const supMoney = () => moneyOK();
const supOffice = () => moneyOK();
const supEnc = s => encodeURIComponent(s);
let supNew = null, supEdit = null, locNew = null;

/* ---------- one-shot edits, sent through the outbox (sync.js: collection "edits") ---------- */
function supQueue(kind, rec) { S.edits = S.edits || []; S.edits.push({ id: kind + "-" + Date.now(), kind, rec, synced: false }); save(); }
function supAddLocal(name, phone, offers) {
  if (!SUPPLIERS.includes(name)) SUPPLIERS.push(name);
  SUPPLIER_INFO[name] = Object.assign({ name, confirmed: false }, SUPPLIER_INFO[name] || {}, phone ? { phone } : {}, offers ? { offers } : {});
}
function supSaveNew(fromReceive) {
  const n = (supNew && supNew.name || "").trim(); if (n.length < 2) return toast("Type the supplier's name.");
  const ex = SUPPLIERS.find(s => s.toLowerCase() === n.toLowerCase());
  if (ex) { supNew = null; if (fromReceive) skPickSupplier(ex); else go("#/supplier/" + supEnc(ex)); return toast(`${ex} is already in the list.`); }
  supQueue("supplier", { name: n, phone: (supNew.phone || "").trim() || null, offers: (supNew.offers || "").trim() || null });
  supAddLocal(n, supNew.phone, supNew.offers); supNew = null;
  toast(supOffice() ? "Supplier added." : "Supplier added. The office completes the details.");
  if (fromReceive) skPickSupplier(n); else go("#/supplier/" + supEnc(n));
}
function supNewForm(fromReceive) {
  const f = supNew || {};
  return `<div class="card" style="display:grid;gap:8px;margin-top:8px;background:var(--surf2)"><b>New supplier</b>
    <input class="in" id="supn-name" placeholder="Name, as on the receipt" value="${esc(f.name || "")}" oninput="supNew.name=this.value">
    <input class="in" id="supn-phone" inputmode="tel" placeholder="Phone (optional)" value="${esc(f.phone || "")}" oninput="supNew.phone=this.value">
    <input class="in" id="supn-offers" placeholder="What they sell (optional)" value="${esc(f.offers || "")}" oninput="supNew.offers=this.value">
    <div style="display:flex;gap:8px"><button class="btn primary" style="flex:1" onclick="supSaveNew(${fromReceive ? "true" : "false"})">Save supplier</button><button class="btn ghost" onclick="supNew=null;render()">Cancel</button></div></div>`;
}

/* ---------- facts per supplier, from what the app already holds ---------- */
function supStats(name) {
  const lc = name.toLowerCase(), since = d => addDays(today(), -d);
  const recs = (S.receipts || []).filter(r => (r.supplier || "").toLowerCase() === lc).sort((a, b) => a.day < b.day ? 1 : -1);
  const money = (MONEY || []).filter(m => (m.supplier || "").toLowerCase() === lc);
  const orders = (S.orders || []).filter(o => (o.supplier || "").toLowerCase() === lc);
  const received = orders.filter(o => o.status === "received");
  const short = received.filter(o => { const r = recs.find(x => x.po === o.id); if (!r) return false;
    return o.lines.some(l => { const it = Store.item(l.item); if (!it) return false; const want = typeof skOrdToCount === "function" ? skOrdToCount(it, l.qty, l.unit) : l.qty; const got = r.lines.filter(x => x.item === l.item).reduce((a, x) => a + x.qty, 0); return want != null && got < want; }); });
  const items = {}; recs.forEach(r => r.lines.forEach(l => { const k = l.item; items[k] = items[k] || { n: 0, last: null, qty: 0 }; items[k].n++; items[k].qty += l.qty; if (!items[k].last || r.day > items[k].last) items[k].last = r.day; }));
  ITEMS.filter(i => (i.supplier || "").toLowerCase() === lc).forEach(i => { items[i.id] = items[i.id] || { n: 0, last: null, qty: 0 }; });
  const byMonth = {}; money.forEach(m => { const k = String(m.day).slice(0, 7); byMonth[k] = (byMonth[k] || 0) + (+m.total || 0); });
  return { recs, last: recs[0] ? recs[0].day : null, n90: recs.filter(r => r.day >= since(90)).length, orders, received, short,
    spend30: money.filter(m => m.day >= since(30)).reduce((a, m) => a + (+m.total || 0), 0),
    open: money.filter(m => m.mode === "bill" && !m.paid_on), items, byMonth };
}
const supPay = i => i && i.pay_mode === "terms" ? chip("info", "terms · bill") : i && i.pay_mode === "paid_now" ? chip("", "paid now") : chip("warn", "terms not set");

/* ---------- SUPPLIERS ---------- */
function viewSuppliers() {
  if (!canOpen("suppliers")) return shell("Suppliers", "", `<div class="alert info">For the store lead, the office and the owners.</div>`, { back: "#/more" });
  const names = Object.keys(SUPPLIER_INFO).filter(n => n !== "Made here");
  const rows = names.map(n => ({ n, i: SUPPLIER_INFO[n], st: supStats(n) })).sort((a, b) => (b.st.last || "") < (a.st.last || "") ? -1 : (b.st.last || "") > (a.st.last || "") ? 1 : a.n.localeCompare(b.n));
  const todo = rows.filter(r => r.i && r.i.confirmed === false && supOffice());
  const list = rows.map(({ n, i, st }) => `<button class="row tap" onclick="go('#/supplier/${supEnc(n)}')"><div class="main"><div class="name">${esc(n)} ${supPay(i)}${i && i.confirmed === false ? ` <span class="chip warn"><i class="dot"></i>to complete</span>` : ""}</div>
    <div class="meta">${i && i.lead != null ? `${fmt(i.lead)} day${+i.lead === 1 ? "" : "s"} to arrive · ` : ""}${st.last ? `last delivery ${esc(dayName(st.last))} · ${st.n90} in 90 days` : "no delivery in the app yet"}${supMoney() && st.spend30 ? ` · ${peso(st.spend30)} in 30 days` : ""}${supMoney() && st.open.length ? ` · ${st.open.length} open bill${st.open.length === 1 ? "" : "s"}` : ""}</div></div><span class="chev">${ic("chevron-right")}</span></button>`).join("");
  return shell("Suppliers", `${names.length} suppliers`, `
    ${todo.length ? `<div class="alert warn">${todo.length} supplier${todo.length === 1 ? " was" : "s were"} added at Receive and need${todo.length === 1 ? "s" : ""} terms and delivery days: ${todo.map(r => esc(r.n)).join(", ")}.</div>` : ""}
    ${supNew ? supNewForm(false) : `<button class="btn" onclick="supNew={};render()">+ New supplier</button>`}
    <section class="card"><div class="list">${list}</div></section>`, { back: "#/more" });
}

function viewSupplier(enc) {
  const name = decodeURIComponent(enc || ""); const i = SUPPLIER_INFO[name]; if (!i) return viewSuppliers();
  const st = supStats(name);
  const edit = supEdit && supEdit.old_name === name;
  const facts = `<section class="card"><h2>Details ${i.confirmed === false ? `<span class="chip warn"><i class="dot"></i>to complete</span>` : ""}</h2><table class="t"><tbody>
    <tr><td>Pay</td><td class="n">${supPay(i)}</td></tr>
    <tr><td>Days from order to delivery</td><td class="n">${i.lead != null ? fmt(i.lead) : "—"}</td></tr>
    <tr><td>Order days</td><td class="n">${esc(i.order_days || "—")}</td></tr>
    <tr><td>Owner approves every order</td><td class="n">${i.needs_approval ? "yes" : "no"}</td></tr>
    <tr><td>Phone</td><td class="n">${i.phone ? `<span class="num">${esc(i.phone)}</span>` : "—"}</td></tr>
    <tr><td>Sells</td><td class="n">${esc(i.offers || "—")}</td></tr>
    ${i.notes ? `<tr><td>Notes</td><td class="n">${esc(i.notes)}</td></tr>` : ""}
    ${i.added_by ? `<tr><td>Added by</td><td class="n">${esc(i.added_by)}</td></tr>` : ""}</tbody></table>
    ${supOffice() && !edit ? `<button class="btn" style="margin-top:10px" onclick="supEdit=Object.assign({old_name:${esc(JSON.stringify(name))}},{name:${esc(JSON.stringify(name))},phone:${esc(JSON.stringify(i.phone || ""))},offers:${esc(JSON.stringify(i.offers || ""))},notes:${esc(JSON.stringify(i.notes || ""))},pay_mode:${esc(JSON.stringify(i.pay_mode || ""))},lead:${i.lead == null ? "''" : +i.lead},order_days:${esc(JSON.stringify(i.order_days || ""))},needs_approval:${!!i.needs_approval},confirmed:true});render()">Edit details</button>` : ""}</section>`;
  const form = edit ? `<section class="card" style="display:grid;gap:8px"><h2>Edit ${esc(name)}</h2>
    <label class="field"><span>Name</span><input class="in" id="supe-name" value="${esc(supEdit.name)}" oninput="supEdit.name=this.value"></label>
    <label class="field"><span>Phone</span><input class="in" id="supe-phone" inputmode="tel" value="${esc(supEdit.phone)}" oninput="supEdit.phone=this.value"></label>
    <label class="field"><span>What they sell</span><input class="in" id="supe-offers" value="${esc(supEdit.offers)}" oninput="supEdit.offers=this.value"></label>
    <div class="field"><span>Pay</span><div class="seg"><button class="btn ${supEdit.pay_mode === "terms" ? "on" : ""}" onclick="supEdit.pay_mode='terms';render()">Terms (bill)</button><button class="btn ${supEdit.pay_mode === "paid_now" ? "on" : ""}" onclick="supEdit.pay_mode='paid_now';render()">Paid now</button></div></div>
    <label class="field"><span>Days from order to delivery</span><input class="in num" id="supe-lead" inputmode="decimal" value="${esc(supEdit.lead)}" oninput="supEdit.lead=this.value"></label>
    <label class="field"><span>Order days (e.g. daily, or Mon and Thu)</span><input class="in" id="supe-days" value="${esc(supEdit.order_days)}" oninput="supEdit.order_days=this.value"></label>
    ${role() === "master" ? `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="supe-appr" ${supEdit.needs_approval ? "checked" : ""} onchange="supEdit.needs_approval=this.checked"> Owner approves every order</label>` : ""}
    <label class="field"><span>Notes</span><input class="in" id="supe-notes" value="${esc(supEdit.notes)}" oninput="supEdit.notes=this.value"></label>
    <div style="display:flex;gap:8px"><button class="btn primary" style="flex:1" onclick="supSaveEdit()">Save</button><button class="btn ghost" onclick="supEdit=null;render()">Cancel</button></div></section>` : "";
  const itemRows = Object.keys(st.items).map(id => { const it = Store.item(id); if (!it) return ""; const x = st.items[id]; const pl = supMoney() ? supLatestPrice(id, name) : null;
    return `<button class="row tap" onclick="go('#/item/${id}')"><div class="main"><div class="name">${esc(it.name)}</div><div class="meta">${x.n ? `${x.n} deliver${x.n === 1 ? "y" : "ies"} · last ${esc(dayName(x.last))}` : "no delivery in the app yet"}${pl ? ` · ${esc(pl.txt)}` : ""}</div></div><span class="chev">${ic("chevron-right")}</span></button>`; }).join("");
  const months = Object.keys(st.byMonth).sort().reverse();
  const money = supMoney() ? `<section class="card"><h2>Money</h2><div class="grid2">${tile("Spent, 30 days", peso(st.spend30), "", "")}${tile("Open bills", st.open.length ? peso(st.open.reduce((a, m) => a + (+m.total || 0), 0)) : "none", st.open.length ? `${st.open.length} waiting for their run` : "", "")}</div>
    ${months.length ? skTable(["Month", "Spent"], months.map(m => [esc(m), peso(st.byMonth[m])]), true) : `<div class="mut small" style="margin-top:6px">Nothing recorded in the app yet.</div>`}</section>` : "";
  const deliveries = `<section class="card"><h2>Deliveries <span class="tiny mut">${st.recs.length} in the app</span></h2>
    <div class="small">${st.received.length} order${st.received.length === 1 ? "" : "s"} received${st.received.length ? `, ${st.short.length} came short` : ""}.</div>
    ${st.recs.length ? `<div class="list" style="margin-top:8px">${st.recs.slice(0, 8).map(r => `<div class="row"><div class="main"><div class="name">${esc(dayName(r.day))}${r.invoice ? ` · ${esc(r.invoice)}` : ""}</div><div class="meta">${r.lines.map(l => `${fmt(l.qty)} ${esc((Store.item(l.item) || {}).unit || "")} ${esc((Store.item(l.item) || { name: l.item }).name)}`).join(" · ")}</div></div></div>`).join("")}</div>` : ""}</section>`;
  return shell(name, i.offers || "supplier", `${facts}${form}${money}<section class="card"><h2>What we buy <span class="tiny mut">${Object.keys(st.items).length}</span></h2>${itemRows ? `<div class="list">${itemRows}</div>` : `<div class="mut small">No items linked yet.</div>`}</section>${deliveries}`, { back: "#/suppliers" });
}
function supSaveEdit() {
  const e = supEdit; if (!e || (e.name || "").trim().length < 2) return toast("Name required.");
  const lead = e.lead === "" || e.lead == null ? null : parseFloat(e.lead);
  supQueue("supplier", { old_name: e.old_name, name: e.name.trim(), phone: e.phone || null, offers: e.offers || null, notes: e.notes || null, pay_mode: e.pay_mode || null, lead, order_days: e.order_days || null, needs_approval: !!e.needs_approval, confirmed: true });
  const info = Object.assign({}, SUPPLIER_INFO[e.old_name], { name: e.name.trim(), phone: e.phone, offers: e.offers, notes: e.notes, pay_mode: e.pay_mode || null, lead, order_days: e.order_days, needs_approval: !!e.needs_approval, confirmed: true });
  if (e.name.trim() !== e.old_name) { delete SUPPLIER_INFO[e.old_name]; const k = SUPPLIERS.indexOf(e.old_name); if (k >= 0) SUPPLIERS[k] = e.name.trim(); }
  SUPPLIER_INFO[e.name.trim()] = info; supEdit = null; toast("Saved."); go("#/supplier/" + supEnc(e.name.trim()));
}

/* ---------- STORES & PLACES ---------- */
function viewStores() {
  if (!supOffice()) return shell("Stores", "", `<div class="alert info">For the office and the owners.</div>`, { back: "#/more" });
  const locs = S.locations || [];
  const f = locNew || {};
  const form = locNew ? `<section class="card" style="display:grid;gap:8px"><h2>New store or place</h2>
    <label class="field"><span>Short code (2 to 8 letters, e.g. SP)</span><input class="in" id="loc-code" value="${esc(f.code || "")}" oninput="locNew.code=this.value.toUpperCase()"></label>
    <label class="field"><span>Name</span><input class="in" id="loc-name" value="${esc(f.name || "")}" oninput="locNew.name=this.value"></label>
    <div class="seg">${[["store", "Store"], ["office", "Office"], ["other", "Other place"]].map(([k, l]) => `<button class="btn ${(f.kind || "store") === k ? "on" : ""}" onclick="locNew.kind='${k}';render()">${l}</button>`).join("")}</div>
    <div style="display:flex;gap:8px"><button class="btn primary" style="flex:1" onclick="locSave()">Save</button><button class="btn ghost" onclick="locNew=null;render()">Cancel</button></div></section>` : `<button class="btn" onclick="locNew={kind:'store'};render()">+ New store or place</button>`;
  return shell("Stores & places", `${locs.length} places`, `<div class="alert info">Places that send or receive stock: stores, the office, a freezer kept somewhere else.</div>${form}
    <section class="card"><div class="list">${locs.map(l => `<div class="row"><div class="main"><div class="name">${esc(l.name)}</div><div class="meta">${esc(l.code)} · ${esc(l.kind)}</div></div></div>`).join("")}</div></section>`, { back: "#/more" });
}
function locSave() {
  const c = (locNew.code || "").trim().toUpperCase(), n = (locNew.name || "").trim();
  if (!/^[A-Z0-9]{2,8}$/.test(c)) return toast("Code: 2 to 8 letters or digits.");
  if (n.length < 2) return toast("Name required.");
  supQueue("location", { code: c, name: n, kind: locNew.kind || "store" });
  S.locations = (S.locations || []).filter(l => l.code !== c).concat([{ code: c, name: n, kind: locNew.kind || "store" }]); locNew = null; save(); toast("Saved."); render();
}

/* ---------- PRICES PER KG / L (item card, office and owners) ---------- */
function supUnit(it) { const b = it && it.base; return b === "g" ? { f: 1000, u: "kg" } : b === "ml" ? { f: 1000, u: "L" } : { f: 1, u: b || "pc" }; }
function supPrices(id) { return (PRICES || []).filter(p => p.item === id).map(p => ({ day: p.day, sup: p.supplier, p: +p.p, q: p.q == null ? null : +p.q, src: p.src })).sort((a, b) => a.day < b.day ? -1 : 1); }
function supLatestPrice(id, supplier) {
  const it = Store.item(id); const U = supUnit(it); const ps = supPrices(id).filter(p => !supplier || (p.sup || "").toLowerCase().startsWith(supplier.toLowerCase().split(" ")[0]));
  const l = ps[ps.length - 1]; return l ? { v: l.p * U.f, txt: `${skP(l.p * U.f)} per ${U.u} on ${dayName(l.day)}` } : null;
}
function skPriceUnitSection(it) {
  if (!supMoney()) return "";
  const U = supUnit(it); const ps = supPrices(it.id); if (!ps.length) return `<section class="card"><h2>Price per ${esc(U.u)}</h2><div class="mut small">No price with a weight or volume yet. It fills in as deliveries are received with a price.</div></section>`;
  const avg = d => { const s = ps.filter(p => p.day >= addDays(today(), -d)); if (!s.length) return null; const w = s.reduce((a, p) => a + (p.q || 1), 0); return s.reduce((a, p) => a + p.p * (p.q || 1), 0) / w * U.f; };
  const last = ps[ps.length - 1], first = ps[0]; const ch = first.p ? (last.p - first.p) / first.p : 0;
  const a30 = avg(30), a90 = avg(90);
  const bySup = {}; ps.forEach(p => { (bySup[p.sup || "—"] = bySup[p.sup || "—"] || []).push(p.p * U.f); });
  return `<section class="card"><h2>Price per ${esc(U.u)} <span class="tiny mut">${ps.length} price${ps.length === 1 ? "" : "s"} since ${esc(dayName(first.day))}</span></h2>
    <div class="grid2">${tile("Latest", skP(last.p * U.f), `${esc(dayName(last.day))} · ${esc(last.sup || "")}`, "")}${tile("Since the first price", `${ch >= 0 ? "+" : "−"}${Math.round(Math.abs(ch) * 100)}%`, `${skP(first.p * U.f)} → ${skP(last.p * U.f)}`, "")}
      ${tile("Average, 30 days", a30 != null ? skP(a30) : "—", "weighted by quantity", "")}${tile("Average, 90 days", a90 != null ? skP(a90) : "—", "weighted by quantity", "")}</div>
    ${ps.length >= 2 ? skLineChart(ps.map(p => ({ x: p.day, y: p.p * U.f, sup: p.sup })), U.u) : ""}
    ${Object.keys(bySup).length > 1 ? `<div class="small" style="margin-top:6px">By supplier: ${Object.keys(bySup).map(s => `${esc(s)} ${skP(bySup[s].reduce((a, v) => a + v, 0) / bySup[s].length)}`).join(" · ")}</div>` : ""}
    ${skTable(["Day", `Price per ${U.u}`, "Supplier", "From"], ps.slice().reverse().map(p => [esc(dayName(p.day)), skP(p.p * U.f), esc(p.sup || ""), p.src === "app" ? "app" : "September books"]))}</section>`;
}
