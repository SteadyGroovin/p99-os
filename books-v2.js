/* books-v2.js — v0.16 (2026-11-08): our own Zoho Books pieces (migration 024).
   Other purchases: what a branch buys that is not stock (staff uniform, a Christmas tree, a repair part): what, where, category, total, who paid, photo.
   Chart of accounts: the expense categories of the accounting book; the office adds and switches off.
   Opening balances & month close: what each fund held on a day; a closed month refuses new or changed money records (the database enforces it).
   Recipes: what each pizza, slice and batch uses, in grams / ml / pieces; the lead types Erica's answers straight in. */
let ACCOUNTS = [], OPENINGS = [], CLOSED = [], RECIPES = [];
function booksRefresh(L) { if (!L) return; ACCOUNTS = L.accounts || ACCOUNTS; OPENINGS = L.openings || OPENINGS; CLOSED = L.closed || CLOSED; RECIPES = L.recipes || RECIPES; if (typeof MEMBERS !== "undefined" && L.members) MEMBERS = L.members; }
booksRefresh(window.OS_LOADED);
const acName = code => (ACCOUNTS.find(a => a.code === code) || {}).name || code || "—";
const isClosed = day => !!day && CLOSED.includes(String(day).slice(0, 7));

/* ---------- Other purchases ---------- */
let pu = null;
function puStart() { pu = { day: today(), supplier: "", description: "", account: "", total: "", pay_mode: "paid_now", pay_source: "store_fund", photo: null }; }
function viewPurchases() {
  if (!pu) puStart();
  const list = MONEY.filter(m => m.kind === "other").concat((S.receipts || []).filter(r => r.kind === "other" && r.synced === false && !MONEY.some(m => m.id === r.id))
    .map(r => ({ id: r.id, day: r.day, supplier: r.supplier, total: r.total, mode: r.pay_mode, source: r.pay_source, account: r.account, lines: r.description, pending: true })))
    .sort((a, b) => a.day < b.day ? 1 : -1);
  const src = Object.fromEntries(PAY_SOURCES);
  const groups = [...new Set(ACCOUNTS.filter(a => a.active !== false).map(a => a.grp))];
  const acOpts = `<option value="">— choose —</option>` + groups.map(g => `<optgroup label="${esc(g)}">${ACCOUNTS.filter(a => a.grp === g && a.active !== false).map(a => `<option value="${esc(a.code)}" ${pu.account === a.code ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</optgroup>`).join("");
  const need = []; if (!pu.description.trim()) need.push("what was bought"); if (!(+pu.total > 0)) need.push("the total"); if (!pu.account) need.push("a category"); if (!pu.photo) need.push("a photo of the receipt");
  if (pu.pay_mode === "bill" && !SUPPLIERS.includes(pu.supplier)) need.push("a known supplier for a bill");
  if (isClosed(pu.day)) need.push("a day in an open month");
  return shell("Purchases", "not stock: uniforms, decor, repairs", `
    <section class="card"><h2>Record a purchase</h2>
      <div class="field"><label>What was bought</label><input class="in" placeholder="e.g. 6 staff shirts, Christmas tree" value="${esc(pu.description)}" oninput="pu.description=this.value"></div>
      <div class="field"><label>Where (shop or supplier)</label><input class="in" list="pu-sups" placeholder="e.g. Gaisano, Lazada" value="${esc(pu.supplier)}" oninput="pu.supplier=this.value"><datalist id="pu-sups">${SUPPLIERS.map(s => `<option value="${esc(s)}">`).join("")}</datalist></div>
      <div class="field"><label>Category</label><select class="in" onchange="pu.account=this.value;render()">${acOpts}</select></div>
      <div class="field"><label>Total ₱</label><input class="in num" inputmode="decimal" placeholder="0" value="${esc(String(pu.total))}" onchange="pu.total=this.value===''?'':parseFloat(this.value);render()"></div>
      <div class="field"><label>Day</label><input class="in" type="date" max="${today()}" value="${esc(pu.day)}" onchange="pu.day=this.value;render()"></div>
      <div class="field"><label>Paid</label><div class="chips">${[["paid_now", "Paid now"], ["bill", "Bill (pay later)"]].map(([k, l]) => `<button class="chip ${pu.pay_mode === k ? "info" : ""}" onclick="pu.pay_mode='${k}';render()">${l}</button>`).join("")}</div></div>
      ${pu.pay_mode === "paid_now" ? `<div class="field"><label>Who paid</label><div class="chips">${PAY_SOURCES.map(([k, l]) => `<button class="chip ${pu.pay_source === k ? "info" : ""}" onclick="pu.pay_source='${k}';render()">${esc(l)}</button>`).join("")}</div></div>` : ""}
      <div class="field">${photoBtn("Photo of the receipt", "pu.photo=id;render()", pu.photo)} ${thumb(pu.photo)}</div>
      <button class="btn primary full" ${need.length ? "disabled" : ""} onclick="puSave()">Save purchase${+pu.total > 0 ? " · " + peso(+pu.total) : ""}</button>
      ${need.length ? `<div class="tiny mut" style="margin-top:6px">Still needed: ${need.join(", ")}.</div>` : ""}</section>
    <section class="card"><h2>Recorded <span class="tiny mut">${list.length}</span></h2>${list.length ? `<div class="itwrap flat"><table class="itbl"><thead><tr><th>Day</th><th>What</th><th class="h1">Where</th><th class="h1">Category</th><th class="h1">Paid</th><th class="n">Total</th></tr></thead><tbody>${list.slice(0, 200).map(m => `<tr style="cursor:default"><td class="mut">${esc(dayName(m.day))}</td><td class="nm wrapc">${esc(m.lines || "—")}${m.pending ? `<span class="tag" style="color:var(--warn)">not saved yet</span>` : ""}<div class="sub2 wrap">${esc(m.supplier || "—")} · ${esc(acName(m.account))} · ${m.mode === "bill" ? "bill" : esc(src[m.source] || m.source || "")}</div></td><td class="h1 mut">${esc(m.supplier || "—")}</td><td class="h1 mut">${esc(acName(m.account))}</td><td class="h1 mut">${m.mode === "bill" ? "bill" : esc(src[m.source] || m.source || "")}</td><td class="n num"><b>${peso(+m.total)}</b></td></tr>`).join("")}</tbody></table></div>${list.length > 200 ? `<div class="tiny mut">Showing the newest 200 of ${list.length}.</div>` : ""}` : `<div class="mut small">Nothing yet.</div>`}</section>`, { back: "#/money" });
}
function puSave() {
  const r = { id: "rc-" + Date.now(), day: pu.day, kind: "other", supplier: pu.supplier.trim() || null, description: pu.description.trim(), account: pu.account, total: +pu.total,
    pay_mode: pu.pay_mode, pay_source: pu.pay_mode === "paid_now" ? pu.pay_source : null, photo: pu.photo, by: S.me, lines: [], synced: false };
  S.receipts.unshift(r); MONEY.unshift({ id: r.id, kind: "other", day: r.day, supplier: r.supplier, total: r.total, mode: r.pay_mode, source: r.pay_source, account: r.account, lines: r.description });
  puStart(); save(); toast("Purchase saved."); render();
}

/* ---------- Chart of accounts ---------- */
let acNew = null;
function viewAccounts() {
  const groups = [...new Set(ACCOUNTS.map(a => a.grp))];
  return shell("Accounts", "expense categories", `
    <div class="alert info">The categories of Mike's accounting book. Every purchase and expense gets one, so the downloads land in the right column. Switch off what you don't use; add what is missing.</div>
    ${groups.map(g => `<section class="card"><h2>${esc(g)}</h2><div class="list">${ACCOUNTS.filter(a => a.grp === g).map(a => `<div class="row"><div class="main"><div class="name">${esc(a.name)}${a.sheet === false ? " " + chip("info", "added here") : ""}</div></div><button class="chip ${a.active !== false ? "ok" : ""}" onclick="acToggle('${esc(a.code)}')">${a.active !== false ? "in use" : "off"}</button></div>`).join("")}</div></section>`).join("")}
    <section class="card">${acNew ? `<h2>New category</h2><div class="field"><label>Name</label><input class="in" value="${esc(acNew.name)}" oninput="acNew.name=this.value" placeholder="e.g. Uniforms"></div>
      <div class="field"><label>Group</label><div class="chips">${["Cost of goods", "Supplies", "Operating", "Staff", "Tax", "Other"].map(g => `<button class="chip ${acNew.grp === g ? "info" : ""}" onclick="acNew.grp='${g}';render()">${g}</button>`).join("")}</div></div>
      <div style="display:flex;gap:8px"><button class="btn primary" style="flex:1" onclick="acSave()">Add category</button><button class="btn ghost" onclick="acNew=null;render()">Cancel</button></div>`
      : `<button class="btn full" onclick="acNew={name:'',grp:'Operating'};render()">+ New category</button>`}</section>`, { back: "#/money" });
}
function acToggle(code) { const a = ACCOUNTS.find(x => x.code === code); if (!a) return; a.active = a.active === false; supQueue("account", { code: a.code, name: a.name, grp: a.grp, active: a.active }); render(); }
function acSave() {
  const n = (acNew.name || "").trim(); if (n.length < 2) return toast("Type a name.");
  if (ACCOUNTS.some(a => a.name.toLowerCase() === n.toLowerCase())) return toast(n + " already exists.");
  const code = n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  ACCOUNTS.push({ code, name: n, grp: acNew.grp, active: true, sheet: false }); supQueue("account", { code, name: n, grp: acNew.grp, active: true }); acNew = null; toast("Category added."); render();
}

/* ---------- Opening balances & month close ---------- */
let bkOpen = {};
function viewBooks() {
  const m = role() === "master", bal = typeof mvBalances === "function" ? mvBalances() : [];
  const months = [0, 1, 2, 3].map(i => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); return ymd(d).slice(0, 7); });
  const op = Object.fromEntries(OPENINGS.map(o => [o.party, o]));
  return shell("Month close", "opening balances, closed months", `
    <section class="card"><h2>Opening balances</h2><div class="tiny mut" style="margin-bottom:8px">What each fund or person held on a day. From that day the app adds what came in and takes off what went out. For a person, money the company owed them is a minus.</div>
      <div class="list">${PAY_SOURCES.map(([k, l]) => { const o = op[k], b = bal.find(x => x.party === k); const e = bkOpen[k];
        return `<div class="row"><div class="main"><div class="name">${esc(l)}: ${o ? peso(+o.amount) + " on " + esc(dayName(o.as_of)) : `<span class="mut">not set</span>`}</div><div class="meta">now ${b ? peso(Math.round(b.net)) : "—"}</div>
          ${e ? `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"><input class="in num" style="width:120px" inputmode="decimal" placeholder="₱" value="${esc(String(e.amount))}" oninput="bkOpen['${k}'].amount=this.value"><input class="in" type="date" style="width:auto" max="${today()}" value="${esc(e.as_of)}" onchange="bkOpen['${k}'].as_of=this.value"><button class="btn primary sm" onclick="bkSave('${k}')">Save</button><button class="btn ghost sm" onclick="delete bkOpen['${k}'];render()">Cancel</button></div>` : ""}</div>
          ${m && !e ? `<button class="btn small" onclick="bkOpen['${k}']={amount:${o ? +o.amount : "''"},as_of:'${o ? o.as_of : today().slice(0, 8) + "01"}'};render()">${o ? "Change" : "Set"}</button>` : ""}</div>`; }).join("")}</div>
      ${m ? "" : `<div class="tiny mut" style="margin-top:6px">Only an owner sets opening balances.</div>`}</section>
    <section class="card"><h2>Month close</h2><div class="tiny mut" style="margin-bottom:8px">A closed month takes no new or changed deliveries, purchases, money moves or cash counts. An owner can reopen it.</div>
      <div class="list">${months.map(mo => { const c = CLOSED.includes(mo); return `<div class="row"><div class="main"><div class="name">${esc(new Date(mo + "-01T00:00").toLocaleDateString("en-PH", { month: "long", year: "numeric" }))}</div><div class="meta">${c ? "closed" : "open"}</div></div>
        ${m ? `<button class="btn small ${c ? "" : "primary"}" onclick="bkClose('${mo}',${c})">${c ? "Reopen" : "Close"}</button>` : chip(c ? "ok" : "", c ? "closed" : "open")}</div>`; }).join("")}</div></section>`, { back: "#/money" });
}
function bkSave(k) {
  const e = bkOpen[k]; const a = parseFloat(e.amount); if (isNaN(a)) return toast("Type the amount (minus if the company owed it).");
  if (!e.as_of) return toast("Pick the day.");
  supQueue("opening", { party: k, amount: a, as_of: e.as_of });
  const o = OPENINGS.find(x => x.party === k); if (o) Object.assign(o, { amount: a, as_of: e.as_of }); else OPENINGS.push({ party: k, amount: a, as_of: e.as_of });
  delete bkOpen[k]; toast("Opening balance saved. Balances update after the next sync."); render();
}
function bkClose(mo, reopen) {
  if (!confirm(reopen ? `Reopen ${mo}? Records dated in it can be changed again.` : `Close ${mo}? Nothing dated in it can be added or changed until it is reopened.`)) return;
  supQueue("close_month", { month: mo + "-01", reopen: !!reopen });
  CLOSED = reopen ? CLOSED.filter(x => x !== mo) : CLOSED.concat(mo); toast(reopen ? "Month reopened." : "Month closed."); render();
}

/* ---------- Recipes ---------- */
let rcQ = "", rcEdit = null;
const rcItem = code => (typeof Store !== "undefined" && Store.item(code)) || ITEMS.find(i => i.id === code) || null;
function rcFlag(r) { if (!r.lines.length) return chip("bad", "no ingredients"); if (!r.confirmed) return chip("warn", "not confirmed"); return chip("ok", "confirmed"); }
/* v0.19.3 (Stefan: same compact table as Items): one line per recipe, sortable, grouped by till category */
let rcSort = "cat", rcDir = 1, rcFlt = "", rcKind = "";
function rcSortBy(k) { if (rcSort === k) rcDir = -rcDir; else { rcSort = k; rcDir = 1; } render(); }
function rcCost(r) {   /* ₱ per whole item from the last delivery prices; null when a line has no price or no pack size yet */
  if (!r.lines.length || r.portion_of) return null; let t = 0;
  for (const l of r.lines) { if (l.part) return null; const it = rcItem(l.item); if (!it) return null; const b = typeof skBasePrice === "function" ? skBasePrice(it) : null; const lp = b == null && typeof Store !== "undefined" ? Store.lastPrice(it.id) : null;
    if (b != null) t += (+l.qty || 0) * b; else if (lp && it.per) t += (+l.qty || 0) / it.per * lp.price; else return null; }
  return t;
}
function viewRecipes() {
  const q = rcQ.trim().toLowerCase(); const stOf = r => !r.lines.length && !r.portion_of ? 0 : !r.confirmed ? 1 : 2;
  let list = RECIPES.map(r => ({ r, n: r.lines.length, st: stOf(r), cost: rcCost(r) })).filter(x => (!q || (x.r.pos + " " + x.r.cat).toLowerCase().includes(q)) && (rcFlt === "" || x.st === +rcFlt) && (!rcKind || x.r.kind === rcKind));
  const key = { cat: x => (x.r.cat || "").toLowerCase(), name: x => x.r.pos.toLowerCase(), kind: x => x.r.kind || "", n: x => x.n, cost: x => x.cost == null ? -1 : x.cost, st: x => x.st }[rcSort];
  const desc = ["n", "cost"].includes(rcSort) ? -1 : 1;
  list = list.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * rcDir * desc || a.r.pos.localeCompare(b.r.pos); });
  const empty = RECIPES.filter(r => stOf(r) === 0).length, open = RECIPES.filter(r => stOf(r) === 1).length; const kinds = [...new Set(RECIPES.map(r => r.kind).filter(Boolean))].sort();
  const cols = [["name", "Recipe", ""], ["cat", "Category", "h1"], ["kind", "Kind", "h1"], ["n", "Ingredients", "n"], ["cost", "Cost", "n h1"], ["st", "Status", "st"]];
  const head = `<tr>${cols.map(([k, l, c]) => `<th class="${c}"><button onclick="rcSortBy('${k}')" class="${rcSort === k ? "on" : ""}">${l}${rcSort === k ? (rcDir * (["n", "cost"].includes(k) ? -1 : 1) > 0 ? " ▲" : " ▼") : ""}</button></th>`).join("")}</tr>`;
  const row = ({ r, n, cost }) => { const of = r.portion_of ? (RECIPES.find(x => x.id === r.portion_of) || {}).pos || "another recipe" : null;
    return `<tr onclick="rcEdit=null;go('#/recipe/${r.id}')" tabindex="0" onkeydown="if(event.key==='Enter'){rcEdit=null;go('#/recipe/${r.id}')}"><td class="nm">${esc(r.pos)}<div class="sub2">${esc(r.cat)}${r.kind !== "menu" ? " · " + esc(r.kind) : ""}</div></td><td class="h1 mut">${esc(r.cat)}</td><td class="h1 mut">${esc(r.kind || "")}</td><td class="n num">${of ? `<span class="mut">portion of ${esc(of)}</span>` : n}</td><td class="n h1 num">${cost != null ? skP(Math.round(cost * 100) / 100) : "—"}</td><td class="st">${r.portion_of && !r.lines.length ? chip("", "portion") : rcFlag(r)}</td></tr>`; };
  const body = rcSort === "cat" ? [...new Set(list.map(x => x.r.cat))].map(c => { const rs = list.filter(x => x.r.cat === c); return `<tr class="gh"><td colspan="${cols.length}">${esc(c)} <span>· ${rs.length}</span></td></tr>${rs.map(row).join("")}`; }).join("") : list.map(row).join("");
  return shell("Recipes", `${list.length} of ${RECIPES.length} recipes · ${empty} without ingredients · ${open} not confirmed`, `
    <div class="ittool rc"><input class="in" type="search" id="rcq" placeholder="Search a pizza, drink or batch" value="${esc(rcQ)}" oninput="rcQ=this.value;clearTimeout(window._rcT);window._rcT=setTimeout(()=>{render();const i=document.getElementById('rcq');if(i){i.focus();i.setSelectionRange(99,99)}},250)">
      <select class="in" onchange="rcKind=this.value;render()" aria-label="Kind"><option value="">All kinds</option>${kinds.map(k => `<option ${rcKind === k ? "selected" : ""}>${esc(k)}</option>`).join("")}</select>
      <select class="in" onchange="rcFlt=this.value;render()" aria-label="Status">${[["", "All statuses"], ["0", `No ingredients (${empty})`], ["1", `Not confirmed (${open})`], ["2", "Confirmed"]].map(([k, l]) => `<option value="${k}" ${rcFlt === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      <button class="btn primary sm" onclick="rcEdit={id:null,pos:'',cat:'Pizza',rkind:'menu',lines:[],notes:'',confirmed:false};go('#/recipe/new')">+ New recipe</button></div>
    ${list.length ? `<div class="itwrap"><table class="itbl"><thead>${head}</thead><tbody>${body}</tbody></table></div><div class="itfoot tiny mut">Cost = ingredients at the last delivery price, per whole item; "—" where a price or pack size is still missing · tap a column to sort</div>` : `<section class="card"><div class="mut">No recipe found.</div></section>`}`, { back: "#/items" });
}
function viewRecipe(id) {
  const r = RECIPES.find(x => x.id === id);
  if (!rcEdit || rcEdit.id !== (r ? r.id : null)) rcEdit = r ? { id: r.id, pos: r.pos, cat: r.cat, rkind: r.kind, lines: r.lines.filter(l => !l.part).map(l => ({ item: l.item, qty: +l.qty, note: l.note || "" })), parts: r.lines.filter(l => l.part), notes: r.notes || "", confirmed: !!r.confirmed, portion_of: r.portion_of, div: r.div } : (rcEdit || { id: null, pos: "", cat: "Pizza", rkind: "menu", lines: [], notes: "", confirmed: false });
  const e = rcEdit;
  const opts = ITEMS.slice().sort((a, b) => a.name.localeCompare(b.name)).map(i => `<option value="${esc(i.id)}">${esc(i.name)} (${esc(i.base || i.unit)})</option>`).join("");
  const lines = e.lines.map((l, i) => { const it = rcItem(l.item); return `<div class="rline"><div class="main"><div class="name">${esc(it ? it.name : l.item)}</div></div>
      <input class="in num" style="width:86px" inputmode="decimal" value="${l.qty || ""}" onchange="rcEdit.lines[${i}].qty=parseFloat(this.value)||0;render()" aria-label="Amount"><span class="tiny mut" style="width:28px">${esc(it ? (it.base || it.unit) : "")}</span>
      <button class="btn ghost danger rx" onclick="rcEdit.lines.splice(${i},1);render()" aria-label="Remove">${ic("x-close")}</button></div>`; }).join("");
  const parts = (e.parts || []).map(l => { const pr = RECIPES.find(x => x.id === l.part); return `<div class="row"><div class="main"><div class="name">uses batch: ${esc(pr ? pr.pos : "a batch")}</div><div class="meta">${fmt(+l.qty)}</div></div></div>`; }).join("");
  return shell(e.id ? esc(e.pos) : "New recipe", e.id ? esc(e.cat) : "", `
    ${e.portion_of ? `<div class="alert info">This is a portion (1/${fmt(+e.div || 1)}) of ${esc((RECIPES.find(x => x.id === e.portion_of) || {}).pos || "another recipe")}; its ingredients come from there.</div>` : ""}
    ${e.id ? "" : `<section class="card"><div class="field"><label>Name as on the till (UTAK)</label><input class="in" value="${esc(e.pos)}" oninput="rcEdit.pos=this.value"></div>
      <div class="field"><label>Category</label><input class="in" value="${esc(e.cat)}" oninput="rcEdit.cat=this.value"></div>
      <div class="field"><label>Kind</label><div class="chips">${[["menu", "Menu item"], ["prep", "Batch (dough, sauce)"], ["combo", "Combo"], ["promo", "Promo"], ["addon", "Add-on"]].map(([k, l]) => `<button class="chip ${e.rkind === k ? "info" : ""}" onclick="rcEdit.rkind='${k}';render()">${l}</button>`).join("")}</div></div></section>`}
    <section class="card"><h2>Ingredients <span class="tiny mut">per one ${e.rkind === "prep" ? "batch" : "whole item"}, in grams / ml / pieces</span></h2>
      ${lines || `<div class="mut small">No ingredients yet.</div>`}${parts}
      <div class="field" style="margin-top:10px"><select class="in" onchange="if(this.value){rcEdit.lines.push({item:this.value,qty:0});render()}"><option value="">+ Add an ingredient</option>${opts}</select></div></section>
    <section class="card"><div class="field"><label>Notes</label><textarea class="in" oninput="rcEdit.notes=this.value" placeholder="e.g. weighed by Erica on 10 Nov">${esc(e.notes)}</textarea></div>
      <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" ${e.confirmed ? "checked" : ""} onchange="rcEdit.confirmed=this.checked" style="width:22px;height:22px"> Confirmed by the store (weighed or checked)</label></section>
    <div class="bottom-act"><button class="btn primary full" onclick="rcpSave()">Save recipe</button></div>`, { back: "#/recipes" });
}
function rcpSave() {
  const e = rcEdit; if (!e.id && (e.pos || "").trim().length < 2) return toast("Type the name as on the till.");
  const bad = e.lines.find(l => !(l.qty > 0)); if (bad) { const it = rcItem(bad.item); return toast("Type the amount for " + (it ? it.name : bad.item) + "."); }
  const rec = { rid: e.id, lines: e.lines.map(l => ({ item: l.item, qty: l.qty, note: l.note || null })), notes: e.notes || null, confirmed: !!e.confirmed };
  if (!e.id) Object.assign(rec, { pos: e.pos.trim(), cat: (e.cat || "Other").trim(), rkind: e.rkind });
  supQueue("recipe", rec);
  const r = RECIPES.find(x => x.id === e.id);
  if (r) Object.assign(r, { lines: rec.lines.map(l => ({ item: l.item, qty: l.qty, note: l.note })).concat(e.parts || []), notes: rec.notes, confirmed: rec.confirmed });
  else RECIPES.push({ id: "new-" + Date.now(), pos: rec.pos, cat: rec.cat, kind: rec.rkind, lines: rec.lines, confirmed: rec.confirmed, notes: rec.notes });
  rcEdit = null; toast("Recipe saved."); go("#/recipes");
}
