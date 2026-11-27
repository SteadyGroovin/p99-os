/* order-v2.js — Order today (store lead), approve orders (master), bills & expenses (office). v0.12, 2026-11-08, migration 020.
   Plan: ~/.claude/plans/okay-with-the-rocket-linked-goose.md.
   Why: Messenger showed the stock-outs come from reordering with 1–5 units left on 3–10 day suppliers (Nutella, fries, bacon, chicken).
   The list here comes from the database (v_reorder via os_load → REORDER): expected stock against the reorder point
   = usage per day × (lead time + safety days). It is the same rule the reorder-alert push uses, so the phone and the alert agree.
   Rules kept: leads see quantities, never ₱ estimates (the database sends prices only to master/admin);
   payables age is never an alarm, a bill is "open" until the office marks it paid. */

let odEdit = {};          // "supplier|item" -> qty the lead typed (buy units)
let odAll = false;        // also list items that are not due yet
let bpSel = {};           // receipt id -> ticked for "mark paid"
let bpRange = "check";    // check | release | pay | open | 30 | 90 (v0.35: the office opens on "To check"; v0.37: release = Stefan, pay = released, unpaid)

const odQ = v => v == null || isNaN(v) ? "—" : fmt(Math.round(v * 10) / 10);
function odItem(r) { return Store.item(r.item); }
function odLeft(r) { const it = odItem(r); if (!it || r.expected == null) return null; return it.per ? r.expected / it.per : r.expected; }   /* base → count units */
function odKey(sup, item) { return sup + "|" + item; }
function odQty(r) { const k = odKey(r.supplier || "", r.item); if (odEdit[k] != null) return odEdit[k]; const it = odItem(r);
  if (it && it.sizeUnknown) return r.order_now ? 1 : 0;   /* v0.36: the size of one pack is unknown, so the suggestion (in grams) is not a pack count */
  return r.suggest != null ? r.suggest : 0; }
const odStale = r => r.order_now && (r.count_age == null || +r.count_age > 10);   /* v0.36: a level from a count older than 10 days is a guess: count first (same rule as the alerts) */
function odOpenFor(item) { return (S.orders || []).filter(o => (o.status === "approved" || o.status === "requested" || o.status === "draft") && o.lines.some(l => l.item === item)); }

async function odRefresh() { if (typeof Sync !== "undefined" && Sync.reload) { await Sync.reload(); toast("Levels refreshed."); } }

/* ---------- ORDER TODAY (lead, master) ---------- */
/* v0.37 (migration 062, Stefan 28 Nov: "we take care of the ordering"): Hannah (admin officer) and Stefan send orders; the store lead sees
   the same list and taps "Tell Hannah", which puts a task on Hannah's list with the items. Cherry no longer orders; Mike only watches. */
const odCanSend = () => ["master", "officer"].includes(role());
function odHannah() { const ps = typeof tkPeople === "function" ? tkPeople() : []; return (ps.find(p => /hannah/i.test(p.name || "") || /hannah/i.test(p.short || "")) || {}).id || "hannah"; }   /* person.app_key 'hannah' */
function odTell(sup) {
  const rs = REORDER.filter(r => (r.supplier || "") === sup && odItem(r) && (odAll || r.order_now));
  const lines = rs.map(r => { const it = odItem(r); const left = odLeft(r); return `${it.name}: ${left == null ? "not counted" : left < 0 ? "out" : odQ(left) + " " + it.unit + " left"}`; });
  const at = nowISO(); const me = typeof tkMe === "function" ? tkMe() : S.me;
  S.tasks = S.tasks || [];
  S.tasks.unshift({ id: "k-" + Date.now(), title: `${curStore()} needs ${sup ? "from " + sup : "these items"}: ${rs.length} item${rs.length === 1 ? "" : "s"}`, detail: lines.join("\n"), owner: odHannah(), due: today(), status: "open",
    store: curStore(), area: "Inventory", sort: 0, source: (typeof fname === "function" && fname(me)) || "Order", created: at, log: [{ at, by: me, ev: "created" }] });
  save(); toast("Hannah has it in her tasks."); render();
}
function viewOrder() {
  const r0 = role(); if (!["lead", "master", "officer"].includes(r0)) return shell("Order", "", `<div class="alert info">Hannah orders for every store. Tell her what you need.</div>`, { back: "#/stock" });
  bpStyle();
  const rows = REORDER.filter(r => odItem(r) && (odAll || r.order_now));
  const groups = {}; rows.forEach(r => { const g = r.supplier || ""; (groups[g] = groups[g] || []).push(r); });
  const uncounted = REORDER.filter(r => r.status === "not counted yet").length;
  const sups = Object.keys(groups).sort((a, b) => !a ? 1 : !b ? -1 : Math.min(...groups[a].map(r => r.cover == null ? 99 : r.cover)) - Math.min(...groups[b].map(r => r.cover == null ? 99 : r.cover)));
  const card = sup => {
    const info = SUPPLIER_INFO[sup] || {}; const rs = groups[sup].sort((a, b) => (a.cover == null ? 99 : a.cover) - (b.cover == null ? 99 : b.cover));
    const lines = rs.map(r => { const it = odItem(r); const left = odLeft(r); const q = odQty(r); const open = odOpenFor(r.item);
      return `<div class="row"><div class="main"><div class="name">${esc(it.name)}${r.needs_approval ? ` <span class="chip warn">Stefan approves</span>` : ""}</div>
        <div class="meta">${odStale(r) ? `<span class="band-warn">count first${r.count_day ? ` (counted ${esc(dayName(r.count_day))})` : ""}</span> · ` : ""}${left == null ? "not counted yet" : left < 0 ? "below zero: deliveries or a count are missing" : `${odQ(left)} ${esc(it.unit)} left`}${r.cover != null ? ` · ${skCoverChip({ cover: r.cover })}` : ""}${r.lead ? ` · arrives in ${fmt(r.lead)} d` : ""}${open.length ? ` · <span class="band-warn">already ordered ${esc(dayName(open[0].day))}</span>` : ""}${it.sizeUnknown ? ` · <span class="mut">size of one ${esc(it.unit)} unknown: check the quantity</span>` : ""}${r.spare ? `<div class="bpspare">${ic("package", "sm")} <b>${esc(r.spare)}</b> in stock. <a href="#/transfers" onclick="event.stopPropagation()">Transfer it</a> before buying.</div>` : ""}</div></div>
        <div class="right" style="display:flex;align-items:center;gap:6px"><button class="btn ghost" onclick="odEdit['${esc(odKey(sup, r.item))}']=Math.max(0,${q}-1);render()" aria-label="less">−</button>
          <div class="v num" style="min-width:2.5em;text-align:center">${fmt(q)}</div><button class="btn ghost" onclick="odEdit['${esc(odKey(sup, r.item))}']=${q}+1;render()" aria-label="more">+</button>
          <div class="l" style="min-width:3em">${esc(r.buy_unit || it.unit)}</div></div></div>`; }).join("");
    const n = rs.filter(r => odQty(r) > 0).length;
    const btn = !odCanSend() ? `<button class="btn full" ${rs.length ? "" : "disabled"} onclick="odTell(${esc(JSON.stringify(sup))})">Tell Hannah · ${rs.length} item${rs.length === 1 ? "" : "s"}</button>`
      : !sup ? `<div class="alert warn">These items have no supplier yet. Set one on the item card (Stock → Items) to order them here.</div>`
      : `<button class="btn primary full" ${n ? "" : "disabled"} onclick="odSend(${esc(JSON.stringify(sup))})">Send order to ${esc(sup)} · ${n} item${n === 1 ? "" : "s"}${rs.some(r => r.needs_approval) || info.needs_approval ? " · Stefan approves first" : ""}</button>`;
    return `<section class="card"><h2>${esc(sup || "No supplier set")} <span class="tiny mut">${info.lead ? `${fmt(info.lead)} day${+info.lead === 1 ? "" : "s"} to arrive` : ""}${info.order_days ? ` · orders ${esc(info.order_days)}` : ""}</span></h2><div class="list">${lines}</div><div style="margin-top:10px">${btn}</div></section>`;
  };
  const mine = (S.orders || []).filter(o => o.status !== "cancelled" && o.status !== "received").sort((a, b) => a.day < b.day ? 1 : -1);
  return shell("Order", dayLong(today()), `
    ${odCanSend() ? `<div class="alert info">The list shows what drops under its reorder point before the next delivery can arrive. Quantities are in the unit you buy. Change them with − and +, then send per supplier. Check the storage room and head office first.</div>`
      : `<div class="alert info"><b>Hannah orders for every store.</b> This is what the app thinks you need from your counts. Something urgent, or missing here? Tap <b>Tell Hannah</b>.</div>`}
    ${uncounted ? `<div class="tiny mut">${uncounted} item${uncounted === 1 ? "" : "s"} not counted yet: count them once so they can show up here.</div>` : ""}
    <div class="chips" style="margin:8px 0"><button class="chip ${odAll ? "" : "info"}" onclick="odAll=false;render()">Due now (${REORDER.filter(r => r.order_now).length})</button><button class="chip ${odAll ? "info" : ""}" onclick="odAll=true;render()">All items</button><button class="chip" onclick="odRefresh()">Refresh levels</button>${canOpen("minimums") ? `<button class="chip" onclick="go('#/minimums')">Minimums</button>` : ""}</div>
    ${sups.length ? sups.map(card).join("") : `<section class="card"><div class="mut">Nothing is due. Everything counted lasts past its next delivery.</div></section>`}
    ${mine.length ? `<section class="card"><h2>Open orders</h2><div class="list">${mine.map(o => `<div class="row"><div class="main"><div class="name">${esc(o.supplier)} ${chip(o.status === "approved" ? "ok" : "warn", o.status === "draft" ? "sending" : o.status === "requested" ? "waiting for Stefan" : "approved")}</div><div class="meta">${esc(dayName(o.day))} · ${o.lines.map(l => `${fmt(l.qty)} ${esc(l.unit || "")} ${esc((Store.item(l.item) || {}).name || l.item)}`).join(" · ")}${o.decision_note ? ` · “${esc(o.decision_note)}”` : ""}</div></div>${odDelBtn(o)}</div>`).join("")}</div><div class="tiny mut" style="margin-top:6px">Receive the delivery with the order: Stock → Receive, pick the supplier, tap the order.</div></section>` : ""}`, { back: "#/stock" });
}
function odSend(sup) {
  const rs = REORDER.filter(r => (r.supplier || "") === sup && odItem(r) && (odAll || r.order_now) && odQty(r) > 0);
  if (!rs.length) return;
  const info = SUPPLIER_INFO[sup] || {}; const lead = Math.max(...rs.map(r => +r.lead || +info.lead || 1));
  S.orders = S.orders || [];
  S.orders.push({ id: "po-" + Date.now(), day: today(), supplier: sup, by: S.me, status: "draft", expected: addDays(today(), lead), note: null, synced: false,
    lines: rs.map(r => ({ item: r.item, qty: odQty(r), unit: r.buy_unit || odItem(r).unit })) });
  rs.forEach(r => delete odEdit[odKey(sup, r.item)]);
  save(); toast(rs.some(r => r.needs_approval) || info.needs_approval ? "Sent to Stefan for approval." : "Order saved. Place it with " + sup + ".");
  render();
}

/* v0.23.5 (Stefan, 16 Nov: "I should also be able to delete orders"; migration 044): owners delete an order outright.
   A delivery recorded against it stays; only the link goes. An order still in the outbox is dropped before it is sent. */
function odDelBtn(o) { return role() === "master" ? `<div class="right"><button class="btn ghost danger sm" onclick="odDelete('${esc(o.id)}')" aria-label="Delete this order">Delete</button></div>` : ""; }
async function odDelete(id) {
  const o = (S.orders || []).find(x => x.id === id); if (!o) return;
  if (!confirm(`Delete the order to ${o.supplier} from ${dayName(o.day)}? This cannot be undone.`)) return;
  if (typeof Sync !== "undefined" && Sync.outbox) { Sync.outbox = Sync.outbox.filter(x => !(["po", "po_approve"].includes(x.kind) && x.rec && x.rec.id === id)); try { Sync.put(Sync.K.outbox, Sync.outbox); } catch (e) { } }
  if (!(window.OS_LOADED && window.OS_LOADED.dev) && typeof sb !== "undefined") {
    const r = await sb.rpc("os_delete_order", { p_id: id }); if (r.error) return toast("Not deleted: " + r.error.message);
  }
  S.orders = S.orders.filter(x => x.id !== id); S.approvals = (S.approvals || []).filter(a => a.id !== id);
  if (typeof Sync !== "undefined" && Sync.snap) { delete Sync.snap["po:" + id]; try { Sync.put(Sync.K.snap, Sync.snap); } catch (e) { } }
  save(); toast("Order deleted."); render();
}

/* ---------- APPROVE (master) ---------- */
function viewApprove() {
  if (role() !== "master") return shell("Approve", "", `<div class="alert info">Only Stefan approves orders.</div>`, { back: "#/today" });
  const open = (S.orders || []).filter(o => o.status === "requested" && o.approval_needed);
  const list = open.map(o => { const est = o.lines.reduce((a, l) => a + (l.price != null ? l.price * l.qty : 0), 0);
    return `<section class="card"><h2>${esc(o.supplier)} <span class="tiny mut">${esc(dayName(o.day))}${o.by_email ? " · " + esc(o.by_email) : ""}</span></h2>
      <div class="list">${o.lines.map(l => { const it = Store.item(l.item) || { name: l.item }; const rr = REORDER.find(r => r.item === l.item); const left = rr ? odLeft(rr) : null;
        return `<div class="row"><div class="main"><div class="name">${fmt(l.qty)} ${esc(l.unit || "")} ${esc(it.name)}</div><div class="meta">${left != null ? `${odQ(left)} ${esc(it.unit)} left` : "no count"}${rr && rr.cover != null ? ` · ${odQ(rr.cover)} days of cover` : ""}${l.price != null ? ` · about ${peso(l.price * l.qty)}` : ""}</div></div></div>`; }).join("")}</div>
      ${est ? `<div class="small" style="margin-top:6px">Estimate <b>${peso(est)}</b> from the last prices.</div>` : ""}
      <div style="display:flex;gap:8px;margin-top:10px"><button class="btn primary" style="flex:1" onclick="apDecide('${o.id}','approve')">Approve</button><button class="btn ghost danger" onclick="apDecide('${o.id}','reject')">Reject</button><button class="btn ghost danger" onclick="odDelete('${o.id}')">Delete</button></div></section>`; }).join("");
  return shell("Approve", open.length ? `${open.length} waiting` : "nothing waiting", list || `<section class="card"><div class="mut">No order is waiting for approval.</div></section>`, { back: "#/today" });
}
function apDecide(id, decision) {
  const o = (S.orders || []).find(x => x.id === id); if (!o) return;
  const note = decision === "reject" ? prompt("Why not? (the store sees this)", "") : "";
  if (decision === "reject" && note === null) return;
  S.approvals = S.approvals || []; S.approvals.push({ id, decision, note: note || null, synced: false });
  o.status = decision === "approve" ? "approved" : "cancelled"; o.decision_note = note || null;
  save(); toast(decision === "approve" ? "Approved. The store can place it." : "Rejected."); render();
}

/* ---------- BILLS & EXPENSES (master, admin, finance) ---------- */
/* v0.35 (migration 060, Stefan 27 Nov after the process review: "Yes, build it"): the office sees every store's bills in one list,
   with the invoice photo the store took, a "To check" list and check mode (one bill at a time: photo left, lines and total right,
   Checked / Amount differs / Skip, then the next). os_load carries one store's money only, so the list comes from os_bills_office.
   Dev page and offline: falls back to the selected store's bills from os_load (MONEY). */
const BP = { all: null, at: 0, loading: false, err: null, store: "all", photos: {}, queue: null, pos: 0, differ: false };
const BP_STORE = { P99: "Pizza 99", BK: "Burger Kong", DC: "Dragon Crepe", MCC: "My Crepes Cafe", MCBC: "Beach Club", HO: "Head office", STO: "Storage" };
const bpLive = () => typeof sb !== "undefined" && sb.rpc && !(window.OS_LOADED && window.OS_LOADED.dev);
const bpItemsText = b => (b.items || []).map(i => `${i.qty} ${i.unit} ${i.name}`).join("; ") || b.lines || b.note || "";
function bpRows() {                       /* every bill this login may see, in one shape */
  if (BP.all) return BP.all;
  return MONEY.filter(m => m.mode === "bill").map(m => Object.assign({ store: curStore(), items: null, photo: null }, m));
}
async function bpLoad(force) {
  if (!bpLive() || BP.loading || (!force && BP.all && Date.now() - BP.at < 120e3)) return;
  BP.loading = true;
  const r = await sb.rpc("os_bills_office", { p_days: 120 });
  BP.loading = false;
  if (r.error) { BP.err = r.error.message; render(); return; }
  BP.err = null; BP.at = Date.now();
  BP.all = (r.data || []).map(b => Object.assign(b, { total: +b.total || 0, lines: bpItemsText(b) }));
  const need = [...new Set(BP.all.map(b => b.photo).filter(p => p && !BP.photos[p]))];
  if (need.length && sb.storage) {
    try { const { data } = await sb.storage.from("photos").createSignedUrls(need, 3600); (data || []).forEach((d, i) => { if (d && d.signedUrl) BP.photos[need[i]] = d.signedUrl; }); } catch (e) { /* the list works without thumbnails */ }
  }
  if (/^(#\/(bills|today|home))?$/.test(location.hash || "")) render();
}
const bpToCheck = () => bpRows().filter(m => !m.paid_on && !m.checked_on);
/* v0.37 (migration 062): Stefan releases checked bills before the 15th and month end; Cherry pays only released bills */
const bpToRelease = () => bpRows().filter(m => !m.paid_on && m.checked_on && !m.released_on);
const bpToPay = () => bpRows().filter(m => !m.paid_on && m.released_on);
const bpSum = l => l.reduce((a, b) => a + (+b.total || 0), 0);
function bpList() {
  const since = ["30", "90"].includes(bpRange) ? addDays(today(), -parseInt(bpRange, 10)) : null;
  const gk = b => bpRange === "check" ? b.store || "" : (b.supplier || "") + "|" + (b.run || "");   /* the order the table shows */
  return bpRows().filter(b => (BP.store === "all" || b.store === BP.store) &&
    (bpRange === "check" ? !b.paid_on && !b.checked_on : bpRange === "release" ? !b.paid_on && b.checked_on && !b.released_on : bpRange === "pay" ? !b.paid_on && b.released_on : bpRange === "open" ? !b.paid_on : b.day >= since))
    .map((b, i) => [b, i]).sort((x, y) => gk(x[0]) < gk(y[0]) ? -1 : gk(x[0]) > gk(y[0]) ? 1 : x[1] - y[1]).map(x => x[0]);
}
const bpPhoto = b => b.photo && BP.photos[b.photo];
const bpStoreChip = s => `<span class="bpst">${esc(s || "—")}</span>`;
function bpStatus(b) {
  if (b.paid_on) return chip("ok", "paid " + esc(dayName(b.paid_on)));
  if (b.released_on) return chip("ok", "released") + `<div class="tiny mut">checked ${esc(bpWho(b.checked_by))}</div>`;
  if (b.checked_on) return chip("", "checked") + `<div class="tiny mut">${esc(bpWho(b.checked_by))} · waiting for release</div>`;
  if (b.check_note) return chip("warn", "differs");
  return chip("", "to check");
}

function viewBills() {
  if (!moneyOK()) return shell("Bills", "", `<div class="alert info">For the office only.</div>`, { back: "#/today" });
  if (bpLive() && !BP.loading && (!BP.all || Date.now() - BP.at > 120e3)) setTimeout(() => bpLoad(), 0);
  const rows = bpRows(), list = bpList(), toCheck = bpToCheck();
  const shownCheck = list.filter(b => !b.paid_on && !b.checked_on);
  const since = ["30", "90"].includes(bpRange) ? addDays(today(), -parseInt(bpRange, 10)) : null;
  const exps = MONEY.filter(m => m.mode === "paid_now" && (since ? m.day >= since : m.day >= addDays(today(), -7)));
  const ticked = Object.keys(bpSel).filter(k => bpSel[k]);
  const sl = n => typeof skSupLink === "function" ? skSupLink(n) || "—" : esc(n || "—");
  /* grouping: checking goes store by store (the invoices come back per store); paying goes supplier by supplier within a run */
  const byStore = bpRange === "check";
  const groups = {}; list.forEach(b => { const k = byStore ? b.store : b.supplier + "|" + b.run; (groups[k] = groups[k] || []).push(b); });
  const keys = Object.keys(groups).sort();
  const head = k => { const bs = groups[k]; const tot = bs.reduce((a, b) => a + (+b.total || 0), 0);
    if (byStore) return `${esc(BP_STORE[k] || k)} <span>· ${bs.length} bill${bs.length === 1 ? "" : "s"} · <b>${peso(tot)}</b></span>`;
    const [sup, run] = k.split("|"); return `${sl(sup)} <span>· run ${esc(run || "—")} · paid around ${esc(bs[0].due ? dayName(bs[0].due) : "—")} · ${bs.length} bill${bs.length === 1 ? "" : "s"} · <b>${peso(tot)}</b></span>`; };
  const row = b => `<tr onclick="bpOpen('${b.id}')" title="Open the bill">
      <td onclick="event.stopPropagation()">${b.paid_on || !b.checked_on || (!b.released_on && role() !== "master") ? "" : `<input type="checkbox" aria-label="${b.released_on ? "Tick to mark paid" : "Tick to release"}" ${bpSel[b.id] ? "checked" : ""} onchange="bpSel['${b.id}']=this.checked;render()" style="width:18px;height:18px">`}</td>
      <td>${bpStoreChip(b.store)}</td>
      <td class="mut">${esc(dayName(b.day))}</td>
      <td class="nm" style="font-weight:400"><b>${esc(b.supplier || "—")}</b>${b.invoice ? ` <span class="mut">· ${esc(b.invoice)}</span>` : ""}<div class="sub2 wrap mut">${esc(b.lines || "")}</div></td>
      <td>${bpPhoto(b) ? `<img class="thumb" src="${bpPhoto(b)}" alt="invoice photo">` : b.photo ? `<span class="tiny mut">photo</span>` : `<span class="tiny mut">no photo</span>`}</td>
      <td class="n num"><b>${peso(+b.total)}</b></td>
      <td class="st">${bpStatus(b)}</td></tr>`;
  const table = list.length ? `<div class="itwrap"><table class="itbl bptbl"><thead><tr><th style="width:30px"></th><th>Store</th><th>Day</th><th>Supplier · invoice</th><th>Photo</th><th class="n">Total</th><th class="st">Status</th></tr></thead><tbody>${keys.map(k => `<tr class="gh"><td colspan="7">${head(k)}</td></tr>` + groups[k].map(row).join("")).join("")}</tbody></table></div><div class="itfoot tiny mut">${list.length} bill${list.length === 1 ? "" : "s"} · ${peso(list.reduce((a, b) => a + (+b.total || 0), 0))}${BP.all ? " · all stores" : " · " + esc(curStore()) + " only"}</div>`
    : `<section class="card"><div class="mut">${BP.loading && !BP.all ? "Loading the bills of every store…" : bpRange === "check" ? "Nothing to check. Every bill in this list is checked." : "No bills here."}</div></section>`;
  const stores = [...new Set(rows.map(b => b.store))].sort();
  const storeChips = BP.all && stores.length > 1 ? `<div class="chips" style="margin:0 0 8px">${[["all", "All stores"]].concat(stores.map(s => [s, BP_STORE[s] || s])).map(([k, l]) => { const n = (k === "all" ? toCheck : toCheck.filter(b => b.store === k)).length;
      return `<button class="chip ${BP.store === k ? "info" : ""}" onclick="BP.store='${k}';bpSel={};render()">${esc(l)}${n ? ` · ${n}` : ""}</button>`; }).join("")}</div>` : "";
  const src = Object.fromEntries(PAY_SOURCES); const expTot = exps.reduce((a, b) => a + (+b.total || 0), 0);
  bpStyle();
  return shell("Bills", "check, then pay", `
    ${role() === "master" && bpToRelease().length ? `<section class="card bphero"><div><div class="big num">${bpToRelease().length} to release</div><div class="mut">${peso(bpSum(bpToRelease()))} checked by the office, waiting for you. Released bills are what Cherry pays.</div></div><button class="btn primary" onclick="bpRange='release';bpSel={};render()">Show them</button></section>` : ""}
    ${financeLogin() && bpToPay().length ? `<section class="card bphero"><div><div class="big num">${bpToPay().length} to pay</div><div class="mut">${peso(bpSum(bpToPay()))} released by Stefan</div></div><button class="btn" onclick="bpRange='pay';bpSel={};render()">Show them</button></section>` : ""}
    ${toCheck.length ? `<section class="card bphero"><div><div class="big num">${toCheck.length} to check</div><div class="mut">${peso(toCheck.reduce((a, b) => a + (+b.total || 0), 0))} · hold the paper invoice, compare it with the store's photo and lines</div></div>
      ${shownCheck.length ? `<button class="btn primary" onclick="bpStart()">Start checking${BP.store !== "all" ? " " + esc(BP_STORE[BP.store] || BP.store) : ""}</button>` : ""}</section>` : rows.length ? `<div class="alert ok">Every open bill is checked.</div>` : ""}
    ${BP.err ? `<div class="alert bad">Could not load every store's bills: ${esc(BP.err)}. Showing ${esc(curStore())} only.</div>` : ""}
    <div class="chips" style="margin:8px 0">${[["check", `To check (${toCheck.length})`], ["release", `To release (${bpToRelease().length})`], ["pay", `To pay (${bpToPay().length})`], ["open", "Open bills"], ["30", "30 days"], ["90", "90 days"]].map(([k, l]) => `<button class="chip ${bpRange === k ? "info" : ""}" onclick="bpRange='${k}';render()">${l}</button>`).join("")}</div>
    ${storeChips}
    ${table}
    ${bpActBar(ticked)}
    <div class="tiny mut" style="margin:8px 2px">Tap a bill to open it. <b>Checked</b>: the office holds the original invoice and it matches the order and the delivery. <b>Released</b>: Stefan lets it be paid. Only released bills can be ticked and marked paid, on the 15th and at month end.</div>
    <section class="card"><h2>Paid now <span class="tiny mut">${esc(curStore())} · ${since ? "since " + esc(dayName(since)) : "last 7 days"} · ${peso(expTot)}</span></h2>${exps.length ? `<div class="itwrap flat"><table class="itbl"><thead><tr><th>Day</th><th>Supplier</th><th class="h1">What</th><th class="h1">Paid from</th><th class="n">Total</th></tr></thead><tbody>${exps.map(e => `<tr style="cursor:default"><td class="mut">${esc(dayName(e.day))}</td><td class="nm">${sl(e.supplier)}<div class="sub2 wrap">${esc(e.lines || "")} · ${esc(src[e.source] || e.source || "")}</div></td><td class="h1 wrapc mut">${esc(e.lines || "")}</td><td class="h1 mut">${esc(src[e.source] || e.source || "")}</td><td class="n num">${peso(+e.total)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="mut">Nothing paid now in this period.</div>`}</section>
    <section class="card"><h2>Download for the sheets</h2><div class="tiny mut" style="margin-bottom:8px">One line per item, the columns of the expense ledger: date, store, item, qty, unit, unit price, amount, supplier, SI, paid now or bill, who paid, run.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" onclick="bpExport('paid_now')">Expenses CSV</button><button class="btn" onclick="bpExport('bill')">Bills CSV</button><button class="btn" onclick="go('#/money')">Funds</button><button class="btn" onclick="go('#/purchases')">Other purchases</button></div></section>
    ${bpSheet()}`, { back: "#/finance" });
}

/* ---- check mode: one bill at a time ---- */
function bpStart() { const q = bpList().filter(b => !b.paid_on && !b.checked_on).map(b => b.id); if (!q.length) return toast("Nothing to check here"); BP.queue = q; BP.pos = 0; BP.differ = false; render(); }
function bpOpen(id) { const q = bpList().map(b => b.id); BP.queue = q; BP.pos = Math.max(0, q.indexOf(id)); BP.differ = false; render(); }
function bpClose() { BP.queue = null; BP.differ = false; render(); }
function bpNext(step = 1) {
  if (!BP.queue) return; BP.differ = false;
  for (let i = BP.pos + step; i >= 0 && i < BP.queue.length; i += step) { const b = bpRows().find(x => x.id === BP.queue[i]); if (b && (bpRange !== "check" || (!b.checked_on && !b.paid_on))) { BP.pos = i; render(); return; } }
  if (step > 0) { const left = bpToCheck().length; BP.queue = null; toast(left ? `End of this list · ${left} still to check` : "All bills checked."); render(); }
}
function bpSheet() {
  if (!BP.queue) return "";
  const b = bpRows().find(x => x.id === BP.queue[BP.pos]); if (!b) { BP.queue = null; return ""; }
  const ph = bpPhoto(b), sum = (b.items || []).reduce((a, i) => a + (+i.total || 0), 0);
  const itemsTbl = b.items && b.items.length ? `<table class="itbl bpitems"><thead><tr><th class="n">Qty</th><th>Item</th><th class="n">Amount</th></tr></thead><tbody>${b.items.map(i => `<tr style="cursor:default"><td class="n num">${esc(i.qty)} <span class="mut">${esc(i.unit)}</span></td><td style="white-space:normal">${esc(i.name)}</td><td class="n num">${i.total == null ? `<span class="mut">no price</span>` : peso(+i.total)}</td></tr>`).join("")}</tbody></table>
      ${Math.abs(sum - b.total) > 1 ? `<div class="alert warn" style="margin-top:6px">The lines add up to ${peso(sum)}, the bill says ${peso(b.total)}.</div>` : ""}` : `<div class="mut">${esc(b.lines || "No lines: the store saved the photo and the total.")}</div>`;
  const acts = b.paid_on ? `<div class="mut">Paid ${esc(dayName(b.paid_on))}.</div><button class="btn" onclick="bpNext(1)">Next ›</button>`
    : b.checked_on ? `<div>${chip("ok", "checked")}${b.released_on ? " " + chip("ok", "released") : ""} <span class="tiny mut">by ${esc(bpWho(b.checked_by))}, ${esc(dayName(String(b.checked_on).slice(0, 10)))}</span></div><div class="bpbtns"><button class="btn ghost" onclick="bpCheck('${b.id}',null)">Undo</button><button class="btn" onclick="bpNext(1)">Next ›</button></div>`
    : BP.differ ? `<div class="bpdiff"><label class="tiny mut">Amount on the paper invoice</label><input id="bpAmt" type="number" inputmode="decimal" step="0.01" placeholder="${esc(String(b.total))}">
        <label class="tiny mut">What is different</label><input id="bpWhy" type="text" placeholder="e.g. 2 kg less mango, price ₱140 not ₱150" value="${esc(b.check_note || "")}">
        <div class="bpbtns"><button class="btn primary" onclick="bpDiffSave('${b.id}')">Save: amount differs</button><button class="btn ghost" onclick="BP.differ=false;render()">Cancel</button></div></div>`
    : `${b.check_note ? `<div class="alert warn">Marked as different: ${esc(b.check_note)}</div>` : ""}<div class="bpbtns"><button class="btn primary bpok" onclick="bpCheck('${b.id}',true)">${ic("check", "sm")}Checked, matches</button><button class="btn" onclick="BP.differ=true;render();setTimeout(()=>{const e=document.getElementById('bpAmt');e&&e.focus()},50)">Amount differs</button><button class="btn ghost" onclick="bpNext(1)">Skip ›</button></div>
      <div class="tiny mut bpkeys">Keys: Enter = checked · → skip · ← back · Esc close</div>`;
  return `<div class="sheet-bg bpbg" onclick="if(event.target===this)bpClose()"><div class="sheet bpsheet" role="dialog" aria-label="Check the bill">
    <div class="bphead"><div><b>Bill ${BP.pos + 1} of ${BP.queue.length}</b> <span class="mut">· ${esc(BP_STORE[b.store] || b.store)}</span></div><div style="display:flex;gap:6px"><button class="btn ghost sm" ${BP.pos ? "" : "disabled"} onclick="bpNext(-1)">‹ Back</button><button class="btn ghost sm" onclick="bpClose()">${ic("x-close", "sm")}</button></div></div>
    <div class="bpgrid">
      <div class="bpph">${ph ? `<a href="${ph}" target="_blank" rel="noopener" title="Open the photo full size"><img src="${ph}" alt="invoice photo"></a><div class="tiny mut">Tap the photo to open it full size.</div>` : `<div class="bpnoph">${b.photo ? "Loading the photo…" : "No invoice photo. The store saved this bill without one."}</div>`}</div>
      <div class="bpinfo">
        <div class="tiny mut">${bpStoreChip(b.store)} ${esc(dayName(b.day))}${b.by ? ` · received by ${esc(bpWho(b.by))}` : ""}</div>
        <h2 style="margin:6px 0 2px">${esc(b.supplier || "—")}</h2>
        <div class="mut">Invoice ${esc(b.invoice || "—")} · run ${esc(b.run || "—")}${b.due ? ` · paid around ${esc(dayName(b.due))}` : ""}</div>
        <div class="bptotal num">${peso(+b.total)}</div>
        ${itemsTbl}
        ${b.note && b.items && b.items.length ? `<div class="tiny mut" style="margin-top:6px">${esc(b.note)}</div>` : ""}
        <div class="bpact">${acts}</div>
      </div>
    </div></div></div>`;
}
function bpDiffSave(id) {
  const b = bpRows().find(x => x.id === id); if (!b) return;
  const amt = parseFloat((document.getElementById("bpAmt") || {}).value), why = ((document.getElementById("bpWhy") || {}).value || "").trim();
  if (isNaN(amt) && !why) return toast("Write the invoice amount or what is different");
  const d = isNaN(amt) ? null : Math.round((amt - b.total) * 100) / 100;
  const note = [isNaN(amt) ? null : `Invoice ${peso(amt)}, app ${peso(b.total)}${d ? ` (${d > 0 ? "₱" + d.toLocaleString("en-PH") + " more" : "₱" + (-d).toLocaleString("en-PH") + " less"})` : ""}`, why || null].filter(Boolean).join(". ");
  bpCheck(id, false, note);
}
/* keyboard for check mode (laptop) */
if (!window.bpKeys) { window.bpKeys = true; document.addEventListener("keydown", e => {
  if (!BP.queue || !/#\/bills/.test(location.hash)) return;
  const typing = /input|textarea|select/i.test((e.target || {}).tagName || "");
  if (e.key === "Escape") { if (BP.differ) { BP.differ = false; render(); } else bpClose(); return; }
  if (typing) { if (e.key === "Enter" && BP.differ) { e.preventDefault(); bpDiffSave(BP.queue[BP.pos]); } return; }
  const b = bpRows().find(x => x.id === BP.queue[BP.pos]); if (!b) return;
  if (e.key === "Enter" && !b.checked_on && !b.paid_on && !BP.differ) { e.preventDefault(); bpCheck(b.id, true); }
  else if (e.key === "ArrowRight") bpNext(1); else if (e.key === "ArrowLeft") bpNext(-1);
}); }
function bpStyle() {
  if (document.getElementById("bpcss")) return; const s = document.createElement("style"); s.id = "bpcss";
  s.textContent = `.bpst{display:inline-block;font-size:11px;font-weight:700;line-height:18px;padding:0 6px;border-radius:5px;background:var(--surf2);color:var(--ink);letter-spacing:.02em}
.bptbl td.nm{min-width:200px}.bptbl .thumb{width:40px;height:40px}
.bphero{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.bphero .big{font-size:22px;font-weight:700}
.bpbg{align-items:center}.bpsheet{max-width:1100px;width:96vw;max-height:94vh;overflow:auto;border-radius:16px}
.bphead{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px}
.bpgrid{display:grid;grid-template-columns:1fr;gap:14px}@media (min-width:860px){.bpgrid{grid-template-columns:minmax(0,1.1fr) minmax(0,1fr)}}
.bpph img{width:100%;max-height:70vh;object-fit:contain;border-radius:10px;border:1px solid var(--line);background:var(--surf2);cursor:zoom-in}
.bpnoph{min-height:180px;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;border:1px dashed var(--line2);border-radius:10px;color:var(--mut)}
.bptotal{font-size:28px;font-weight:700;margin:10px 0}
.bpitems td,.bpitems th{height:auto}.bpact{margin-top:14px;display:grid;gap:8px}.bpbtns{display:flex;gap:8px;flex-wrap:wrap}.bpok{min-width:180px}
.bpdiff{display:grid;gap:6px}.bpdiff input{font:inherit;padding:10px;border:1px solid var(--line2);border-radius:10px;background:var(--surf);color:var(--ink)}
.bpspare{margin-top:4px;font-size:13px;color:var(--ink);background:var(--surf2);border-radius:8px;padding:4px 8px;display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap}
.bpnudge{display:flex;align-items:center;justify-content:space-between;gap:12px;grid-column:1/-1;width:100%;max-width:none;box-sizing:border-box;border-left:4px solid var(--warn,#c80)}.wrap.two > section.card.bpnudge.bpnudge.bpnudge{column-span:all;display:flex}
.mntool{display:grid;gap:8px;margin:8px 0}.mntool input[type=search]{font:inherit;padding:10px;border:1px solid var(--line2);border-radius:10px;background:var(--surf);color:var(--ink)}
.mninp{width:84px;font:inherit;text-align:right;padding:6px 8px;border:1px solid var(--line2);border-radius:8px;background:var(--surf);color:var(--ink)}.mntbl td{white-space:normal}
@media (max-width:640px){.bpkeys{display:none}.bpsheet{width:100vw;max-height:100vh;border-radius:0}.bpph img{max-height:42vh}.bpact{position:sticky;bottom:0;background:var(--surf);padding:8px 0 calc(4px + env(safe-area-inset-bottom));box-shadow:0 -10px 12px var(--surf)}}`;
  document.head.appendChild(s);
}

const bpWho = k => { const p = k && typeof Store !== "undefined" && Store.person ? Store.person(k) : null; return p ? (p.short || p.name) : (k || ""); };
async function bpCheck(id, ok, note = null) {
  const set = v => { [bpRows().find(m => m.id === id), MONEY.find(m => m.id === id)].forEach(b => b && Object.assign(b, v)); };
  const b = bpRows().find(m => m.id === id) || MONEY.find(m => m.id === id); if (!b || bpCheck.busy) return;
  if (ok === false && !(note || "").trim()) return toast("Write what the invoice says first");
  if (!bpLive()) set({ checked_on: ok ? new Date().toISOString() : null, checked_by: ok === null ? null : (window.DB_ME || "cherry"), check_note: ok === null ? null : note });
  else {
    bpCheck.busy = true; const r = await sb.rpc("os_bill_check", { p_receipt: id, p_ok: ok, p_note: note }); bpCheck.busy = false;
    if (r.error) return toast("Not saved: " + r.error.message);
    set({ checked_on: r.data.checked_on, checked_by: r.data.checked_by, check_note: r.data.check_note });
  }
  if (!ok) delete bpSel[id];
  toast(ok ? "Checked." : ok === false ? "Saved: amount differs. The bill stays unchecked." : "Check undone.");
  if (BP.queue && ok !== null) bpNext(1); else render();
}
function bpActBar(ticked) {
  const L = ticked.map(k => bpRows().find(b => b.id === k)).filter(Boolean), rel = L.filter(b => b.checked_on && !b.released_on && !b.paid_on), pay = L.filter(b => b.released_on && !b.paid_on);
  const bs = [];
  if (role() === "master" && rel.length) bs.push(`<button class="btn primary full" onclick="bpRelease(true)">Release ${rel.length} bill${rel.length === 1 ? "" : "s"} · ${peso(bpSum(rel))}</button>`);
  if (pay.length) bs.push(`<button class="btn ${bs.length ? "" : "primary"} full" onclick="bpMarkPaid()">Mark ${pay.length} paid · ${peso(bpSum(pay))}</button>`);
  if (role() === "master" && pay.length && !rel.length) bs.push(`<button class="btn ghost full" onclick="bpRelease(false)">Take back the release</button>`);
  return bs.length ? `<div class="bottom-act" style="display:flex;flex-direction:column;gap:6px">${bs.join("")}</div>` : "";
}
async function bpRelease(on) {
  const ids = Object.keys(bpSel).filter(k => { const b = bpRows().find(m => m.id === k); return bpSel[k] && b && !b.paid_on && (on ? b.checked_on && !b.released_on : b.released_on); });
  if (!ids.length || bpRelease.busy) return;
  const set = v => bpRows().concat(MONEY).forEach(m => { if (ids.includes(m.id)) Object.assign(m, v); });
  if (!bpLive()) set(on ? { released_on: new Date().toISOString(), released_by: window.DB_ME || "stefan" } : { released_on: null, released_by: null });
  else {
    bpRelease.busy = true; const r = await sb.rpc("os_bill_release", { p_ids: ids, p_on: on }); bpRelease.busy = false;
    if (r.error) return toast("Not saved: " + r.error.message);
    set(on ? { released_on: r.data.released_on, released_by: r.data.released_by } : { released_on: null, released_by: null });
  }
  bpSel = {}; toast(on ? `${ids.length} released. Cherry can pay them.` : `Release taken back on ${ids.length}.`); render();
}
function bpMarkPaid() {
  const ids = Object.keys(bpSel).filter(k => { const b = bpRows().find(m => m.id === k) || {}; return bpSel[k] && b.checked_on && b.released_on; }); if (!ids.length) return toast("Only bills Stefan released can be marked paid");
  const note = prompt("Paid how? (e.g. bank transfer 15 Nov, check no.)", ""); if (note === null) return;
  S.billPaid = S.billPaid || []; S.billPaid.push({ id: "pay-" + Date.now(), receipts: ids, paid_on: today(), note: note || null, synced: false });
  bpRows().concat(MONEY).forEach(m => { if (ids.includes(m.id)) m.paid_on = today(); }); bpSel = {};
  save(); toast(`${ids.length} marked paid.`); render();
}

function bpExport(mode) {
  const openish = bpRange === "open" || bpRange === "check";
  const since = openish ? addDays(today(), -120) : addDays(today(), -parseInt(bpRange, 10));
  const src = Object.fromEntries(PAY_SOURCES); const q = v => { const t = v == null ? "" : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const rows = [["Date", "Store", "Item", "Qty", "Unit", "Unit price", "Amount", "Supplier", "SI / invoice", "Paid now or bill", "Paid by", "Run", "Receipt total", "Category"]];
  (S.receipts || []).filter(r => r.pay_mode === mode && r.day >= since && (mode !== "bill" || !openish || !(MONEY.find(m => m.id === r.id) || {}).paid_on)).sort((a, b) => a.day < b.day ? -1 : 1)
    .forEach(r => (r.kind === "other" ? [{ other: true }] : r.lines).forEach((l, i) => { if (l.other) { rows.push([r.day, curStore(), r.description || "", 1, "", r.total, r.total, r.supplier || "", r.invoice || "", mode === "bill" ? "bill" : "paid now", mode === "bill" ? "" : (src[r.pay_source] || r.pay_source || ""), mode === "bill" ? skRunLabel(r.day) : "", r.total, acName(r.account)]); return; } const it = Store.item(l.item) || { name: l.item, unit: "" };
      rows.push([r.day, curStore(), it.name, l.qty, it.unit, l.price == null ? "" : l.price, l.price == null ? "" : Math.round(l.price * l.qty * 100) / 100, r.supplier, r.invoice || "", mode === "bill" ? "bill" : "paid now", mode === "bill" ? "" : (src[r.pay_source] || r.pay_source || ""), mode === "bill" ? skRunLabel(r.day) : "", i === 0 ? r.total : "", ""]); }));
  const blob = new Blob(["﻿" + rows.map(r => r.map(q).join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `p99-${mode === "bill" ? "bills" : "expenses"}-${today()}.csv`; document.body.appendChild(a); a.click(); a.remove();
  toast(`${rows.length - 1} line${rows.length === 2 ? "" : "s"} downloaded.`);
}

/* ---------- ORDER ALERTS (web push) ---------- */
/* The public key sits in os_setting 'vapid_public' (not a secret); the private key is the edge function's secret.
   sync/reorder-alert sends "order today" in the evening and "under the reorder point" after the 05:30 sales sync. */
function pushReady() { return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; }
function pushKey() { const k = OS_SETTINGS && OS_SETTINGS.vapid_public; return typeof k === "string" && k.length > 20 ? k : null; }
function b64uToBytes(s) { const p = "=".repeat((4 - s.length % 4) % 4); const b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(b, c => c.charCodeAt(0)); }
async function pushOn() {
  if (!pushReady()) return toast("This phone's browser cannot show alerts. Install the app to the home screen first.");
  const key = pushKey(); if (!key) return toast("Alerts are not switched on in the database yet.");
  const perm = await Notification.requestPermission(); if (perm !== "granted") return toast("Alerts were not allowed on this phone.");
  try { const reg = await navigator.serviceWorker.ready; const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(key) });
    const j = sub.toJSON(); const { error } = await sb.rpc("os_submit", { p: { kind: "push_sub", store: role() === "lead" ? storesOn().join(",") : curStore(), rec: { id: "push", endpoint: j.endpoint, keys: j.keys } } });   /* v0.36: the stores this phone shows, not always P99 */
    if (error) throw error; try { localStorage.setItem("p99os_push", "on"); } catch (e) { } toast("Order alerts are on for this phone."); render();
  } catch (e) { toast("Could not switch alerts on: " + (e.message || e)); }
}
/* v0.36: who gets order alerts — store leads (their stores), the admin officer and the office (all stores), the owners (mornings)
   v0.37 (migration 062): Hannah (every run) and Stefan (mornings) get the order list; store leads only "count first"; Cherry and Mike none */
const pushWho = () => ["lead", "master", "officer"].includes(role());
function pushNudge() {
  if (!window.DB_USER || !pushWho() || typeof pushReady !== "function" || pushState()) return "";
  bpStyle();
  return `<section class="card bpnudge"><div><b>Turn on order alerts</b><div class="tiny mut">${role() === "lead" ? "A message on this phone at 6 am when items at your store need a count, so Hannah orders the right amount." : "A message on this phone when a store must order, with stock in the storage room or head office."}${pushReady() ? "" : " Install the app on the home screen first (Share → Add to Home Screen)."}</div></div><button class="btn primary" onclick="pushOn()">Turn on</button></section>`;
}
function pushState() { try { return localStorage.getItem("p99os_push") === "on"; } catch (e) { return false; } }

/* ---------- PACK SIZES (v0.13, migration 021; v0.23.5; v0.24, migration 047) ---------- */
/* v0.24 (Stefan, 16 Nov: "We need to be able to measure everything"): every item is measured in g, ml or pc and counted in its container.
   One size per item: "1 jar holds ___ g". The unit can still be changed here while the size is open (a guess from migration 047).
   Saved through os_set_item_size: owners and the Admin officer fill every store with the same item and container; a lead the own store.
   What was already counted or received in the container is converted once (os_item_size_apply). */
const SZ_NAME = { btl: "bottle", gal: "gallon", pc: "piece" };
const szUnitName = u => SZ_NAME[u] || u;
function szNeeds(it) { return !!it && !!it.sizeUnknown; }
function szMissing() { return ITEMS.filter(szNeeds).length; }
const szOK = () => ["lead", "master", "officer"].includes(role());
let szEdit = {}, szUnit = {}, szBusy = false;
function viewSizes() {
  if (!szOK()) return shell("Pack sizes", "", `<div class="alert info">For the store lead, the Admin officer and the owners.</div>`, { back: "#/stock" });
  const list = ITEMS.filter(szNeeds).sort((a, b) => (typeof skCatKey === "function" ? skCatKey(a) - skCatKey(b) : 0) || a.name.localeCompare(b.name));
  const all = role() !== "lead";
  const rows = list.map((it, i) => { const u = szUnit[it.id] || it.base;
    return `<tr><td class="nm">${esc(it.name)}<div class="sub2">${esc(it.supplier || "no supplier")}</div></td><td class="h1 mut">${typeof skGrp === "function" ? esc(skGrp(it)) : ""}</td><td class="mut">1 ${esc(szUnitName(it.unit))} holds</td>
    <td class="n szc" style="white-space:nowrap"><input class="in num szin" style="width:6em" inputmode="decimal" data-i="${i}" placeholder="${u === "ml" ? "750" : u === "pc" ? "100" : "500"}" aria-label="what one ${esc(szUnitName(it.unit))} of ${esc(it.name)} holds" value="${szEdit[it.id] != null ? szEdit[it.id] : ""}" oninput="szEdit['${it.id}']=this.value===''?null:parseFloat(this.value.replace(',','.'));szCount()" onkeydown="if(event.key==='Enter'){const n=document.querySelector('.szin[data-i=&quot;${i + 1}&quot;]');if(n)n.focus();else szSaveAll()}"> <select class="in szu" style="width:4.6em;display:inline-block;padding-left:6px;padding-right:4px" aria-label="unit for ${esc(it.name)}" onchange="szUnit['${it.id}']=this.value">${["g", "ml", "pc"].map(x => `<option ${x === u ? "selected" : ""}>${x}</option>`).join("")}</select></td></tr>`; }).join("");
  const n = Object.values(szEdit).filter(v => v > 0).length;
  return shell("Pack sizes", list.length ? `${list.length} without a size` : "all done", `
    <section class="card"><h2>What goes here</h2><div class="small">For each item, write what <b>one</b> of it holds, as printed on the label:</div>
      <div class="tiny mut" style="margin:6px 0">1 jar of peanut butter = <b>340 g</b> · 1 bottle of syrup = <b>750 ml</b> · 1 gallon of bleach = <b>3,785 ml</b> · 1 pack of cheese = <b>10 pc</b> (slices)</div>
      <div class="tiny mut">Recipes and usage work in g, ml or pieces; the shelf is counted in jars, packs and bottles. This number joins the two. No label: weigh it once. Change g / ml / pc if it is measured differently. Enter jumps to the next line.${all ? " What you save fills every store that uses the same item." : ""}</div></section>
    ${list.length ? `<div class="itwrap"><table class="itbl sz"><thead><tr><th>Item</th><th class="h1">Category</th><th>One</th><th class="n">Holds</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="bottom-act"><button class="btn primary full" id="szall" onclick="szSaveAll()" ${n && !szBusy ? "" : "disabled"}>${szBusy ? "Saving…" : `Save ${n || ""} size${n === 1 ? "" : "s"}`}</button></div>` : `<section class="card"><div class="mut">Every item has a size.</div></section>`}`, { back: "#/stock" });
}
function szCount() { const n = Object.values(szEdit).filter(v => v > 0).length; const b = document.getElementById("szall"); if (b) { b.disabled = !n; b.textContent = `Save ${n || ""} size${n === 1 ? "" : "s"}`; } }
async function szSaveAll() {
  const ids = Object.keys(szEdit).filter(k => szEdit[k] > 0); if (!ids.length) return toast("Type a size first.");
  const items = ids.map(code => ({ code, qty: szEdit[code], unit: szUnit[code] || (Store.item(code) || {}).base || "g" }));
  if (!(window.OS_LOADED && window.OS_LOADED.dev) && typeof sb !== "undefined") {
    szBusy = true; render();
    const r = await sb.rpc("os_set_item_size", { p: { store: curStore(), items } }); szBusy = false;
    if (r.error) { render(); return toast("Not saved: " + r.error.message); }
    const L = await loadRecords(); if (!L.error) { window.OS_LOADED = L.data; dbCatalogue(L.data); }
  } else items.forEach(x => { const it = Store.item(x.code); if (it) { it.per = x.qty; it.base = x.unit; it.sizeUnknown = false; } });
  ids.forEach(c => { delete szEdit[c]; delete szUnit[c]; });
  toast(ids.length + (ids.length === 1 ? " size saved." : " sizes saved.")); render();
}

/* ---------- MINIMUMS (v0.36, migration 061) ----------
   Stefan, 27 Nov: "fix the low-stock alerts and counting". No store but Pizza 99 had a level set, and the crepe shops have no item
   sales, so nothing could ever be "order now" there. Per store and item: "Order below" (item.reorder_point) and "Fill up to" (item.par),
   in the unit the store counts. Where the app knows the usage it proposes both (grey), and the order alerts use them from the next run. */
let MN = { edit: {}, q: "", show: "all", busy: false, skipped: [] };
function mnRows() {
  return REORDER.map(r => ({ r, it: odItem(r) })).filter(x => x.it).map(x => {
    const per = x.it.sizeUnknown ? null : (x.it.per || 1), c = v => v == null || per == null ? null : Math.round(v / per * 10) / 10;
    return Object.assign(x, { per, now: c(x.r.expected), perDay: c(x.r.per_day), min: c(x.r.min), par: c(x.r.par_set),
      sugMin: x.r.per_day ? c(x.r.rop) : null, sugPar: x.r.per_day ? c(x.r.target) : null });
  });
}
function viewMinimums() {
  if (!canOpen("minimums")) return shell("Minimums", "", `<div class="alert info">For the store lead, the admin officer and the owners.</div>`, { back: "#/stock" });
  bpStyle();
  const all = mnRows(), q = MN.q.trim().toLowerCase();
  const rows = all.filter(x => (!q || x.it.name.toLowerCase().includes(q)) && (MN.show === "all" || (MN.show === "unset" ? x.min == null : x.r.order_now)))
    .sort((a, b) => (a.it.cat || "").localeCompare(b.it.cat || "") || a.it.name.localeCompare(b.it.name));
  const nSet = all.filter(x => x.min != null).length, changed = Object.keys(MN.edit);
  const val = (x, k) => MN.edit[x.r.item] && MN.edit[x.r.item][k] !== undefined ? MN.edit[x.r.item][k] : (x[k] == null ? "" : x[k]);
  const inp = (x, k, sug) => x.per == null ? "" : `<input class="mninp" type="number" inputmode="decimal" min="0" step="any" value="${esc(String(val(x, k)))}" placeholder="${sug == null ? "" : esc(String(sug))}" onchange="mnSet('${esc(x.r.item)}','${k}',this.value)">`;
  let cat = null;
  const body = rows.map(x => { const head = x.it.cat !== cat ? `<tr class="gh"><td colspan="5">${esc(x.it.cat || "Other")}</td></tr>` : ""; cat = x.it.cat;
    return head + `<tr style="cursor:default"><td class="nm">${esc(x.it.name)}<div class="tiny mut" style="font-weight:400">${x.per == null ? `size of one ${esc(x.it.unit)} unknown: answer the pack size first` : `in ${esc(x.it.unit)}${x.r.spare ? ` · ${esc(x.r.spare)} in stock` : ""}`}</div></td>
      <td class="n num">${x.now == null ? `<span class="mut">${x.r.expected == null ? "not counted" : "?"}</span>` : x.now < 0 ? `<span class="band-bad">below 0</span>` : fmt(x.now)}</td>
      <td class="n num mut h1">${x.perDay == null ? "—" : fmt(x.perDay)}</td>
      <td class="n">${inp(x, "min", x.sugMin)}</td><td class="n">${inp(x, "par", x.sugPar)}</td></tr>`; }).join("");
  return shell("Minimums", `${esc(curStore())} · ${nSet} of ${all.length} items set`, `
    <div class="alert info"><b>Order below</b>: when the stock drops to this, the item goes on the order list and the alert goes out. <b>Fill up to</b>: how much there should be after the delivery; the order quantity is the difference. Both in the unit you count. Grey numbers are what the app proposes from the usage; leave the field empty to keep them.</div>
    ${MN.skipped.length ? `<div class="alert warn">Not saved: ${MN.skipped.map(k => esc(k.name) + " (" + esc(k.why) + ")").join(", ")}.</div>` : ""}
    <div class="mntool"><input type="search" placeholder="Search items" value="${esc(MN.q)}" oninput="MN.q=this.value;clearTimeout(MN.t);MN.t=setTimeout(render,250)">
      <div class="chips">${[["all", `All (${all.length})`], ["unset", `Not set (${all.length - nSet})`], ["due", `Due now (${all.filter(x => x.r.order_now).length})`]].map(([k, l]) => `<button class="chip ${MN.show === k ? "info" : ""}" onclick="MN.show='${k}';render()">${l}</button>`).join("")}</div></div>
    ${rows.length ? `<div class="itwrap"><table class="itbl mntbl"><thead><tr><th>Item</th><th class="n">Now</th><th class="n h1">Uses a day</th><th class="n">Order below</th><th class="n">Fill up to</th></tr></thead><tbody>${body}</tbody></table></div>` : `<section class="card"><div class="mut">No items here.</div></section>`}
    ${changed.length ? `<div class="bottom-act"><button class="btn primary full" ${MN.busy ? "disabled" : ""} onclick="mnSave()">Save ${changed.length} item${changed.length === 1 ? "" : "s"}</button></div>` : ""}`, { back: "#/stock" });
}
function mnSet(code, k, v) {
  const x = mnRows().find(y => y.r.item === code); if (!x) return;
  const n = v === "" ? null : +v; if (n != null && (isNaN(n) || n < 0)) return toast("A number, 0 or more");
  const e = MN.edit[code] = MN.edit[code] || {}; e[k] = n;
  if (Object.keys(e).every(f => e[f] === (x[f] == null ? null : x[f]))) delete MN.edit[code];   /* back to what is saved: nothing to save */
  render();
}
async function mnSave() {
  const rows = Object.keys(MN.edit).map(code => { const x = mnRows().find(y => y.r.item === code) || {}; const e = MN.edit[code];
    return { code, min: e.min !== undefined ? e.min : (x.min == null ? null : x.min), par: e.par !== undefined ? e.par : (x.par == null ? null : x.par) }; });
  const bad = rows.find(r => r.min != null && r.par != null && r.par < r.min);
  if (bad) return toast(`${(Store.item(bad.code) || {}).name || bad.code}: "fill up to" must be at least "order below"`);
  if (typeof sb === "undefined" || (window.OS_LOADED && window.OS_LOADED.dev)) {   /* dev page: keep it in memory */
    rows.forEach(r => { const ro = REORDER.find(x => x.item === r.code), it = Store.item(r.code), per = it && it.per || 1; if (ro) Object.assign(ro, { min: r.min == null ? null : r.min * per, par_set: r.par == null ? null : r.par * per }); });
    MN.edit = {}; MN.skipped = []; toast(`${rows.length} saved (dev).`); return render();
  }
  MN.busy = true; render();
  const res = await sb.rpc("os_set_minimums", { p_store: curStore(), p_rows: rows }); MN.busy = false;
  if (res.error) { toast("Not saved: " + res.error.message); return render(); }
  MN.skipped = res.data.skipped || []; MN.edit = {};
  toast(`${res.data.saved} saved. The order list and alerts use them now.`);
  if (typeof Sync !== "undefined" && Sync.reload) await Sync.reload(); render();
}
