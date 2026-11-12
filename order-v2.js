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
let bpRange = "open";     // open | 30 | 90

const odQ = v => v == null || isNaN(v) ? "—" : fmt(Math.round(v * 10) / 10);
function odItem(r) { return Store.item(r.item); }
function odLeft(r) { const it = odItem(r); if (!it || r.expected == null) return null; return it.per ? r.expected / it.per : r.expected; }   /* base → count units */
function odKey(sup, item) { return sup + "|" + item; }
function odQty(r) { const k = odKey(r.supplier || "", r.item); return odEdit[k] != null ? odEdit[k] : (r.suggest != null ? r.suggest : 0); }
function odOpenFor(item) { return (S.orders || []).filter(o => (o.status === "approved" || o.status === "requested" || o.status === "draft") && o.lines.some(l => l.item === item)); }

async function odRefresh() { if (typeof Sync !== "undefined" && Sync.reload) { await Sync.reload(); toast("Levels refreshed."); } }

/* ---------- ORDER TODAY (lead, master) ---------- */
function viewOrder() {
  const r0 = role(); if (!["lead", "master"].includes(r0)) return shell("Order", "", `<div class="alert info">Orders are placed by the store lead.</div>`, { back: "#/stock" });
  const rows = REORDER.filter(r => odItem(r) && (odAll || r.order_now));
  const groups = {}; rows.forEach(r => { const g = r.supplier || ""; (groups[g] = groups[g] || []).push(r); });
  const uncounted = REORDER.filter(r => r.status === "not counted yet").length;
  const sups = Object.keys(groups).sort((a, b) => !a ? 1 : !b ? -1 : Math.min(...groups[a].map(r => r.cover == null ? 99 : r.cover)) - Math.min(...groups[b].map(r => r.cover == null ? 99 : r.cover)));
  const card = sup => {
    const info = SUPPLIER_INFO[sup] || {}; const rs = groups[sup].sort((a, b) => (a.cover == null ? 99 : a.cover) - (b.cover == null ? 99 : b.cover));
    const lines = rs.map(r => { const it = odItem(r); const left = odLeft(r); const q = odQty(r); const open = odOpenFor(r.item);
      return `<div class="row"><div class="main"><div class="name">${esc(it.name)}${r.needs_approval ? ` <span class="chip warn">Mike approves</span>` : ""}</div>
        <div class="meta">${left == null ? "not counted yet" : `${odQ(left)} ${esc(it.unit)} left`}${r.cover != null ? ` · ${skCoverChip({ cover: r.cover })}` : ""}${r.lead ? ` · arrives in ${fmt(r.lead)} d` : ""}${open.length ? ` · <span class="band-warn">already ordered ${esc(dayName(open[0].day))}</span>` : ""}</div></div>
        <div class="right" style="display:flex;align-items:center;gap:6px"><button class="btn ghost" onclick="odEdit['${esc(odKey(sup, r.item))}']=Math.max(0,${q}-1);render()" aria-label="less">−</button>
          <div class="v num" style="min-width:2.5em;text-align:center">${fmt(q)}</div><button class="btn ghost" onclick="odEdit['${esc(odKey(sup, r.item))}']=${q}+1;render()" aria-label="more">+</button>
          <div class="l" style="min-width:3em">${esc(r.buy_unit || it.unit)}</div></div></div>`; }).join("");
    const n = rs.filter(r => odQty(r) > 0).length;
    const btn = !sup ? `<div class="alert warn">These items have no supplier yet. Set one on the item card (Stock → Items) to order them here.</div>`
      : `<button class="btn primary full" ${n ? "" : "disabled"} onclick="odSend(${esc(JSON.stringify(sup))})">Send order to ${esc(sup)} · ${n} item${n === 1 ? "" : "s"}${rs.some(r => r.needs_approval) || info.needs_approval ? " · Mike approves first" : ""}</button>`;
    return `<section class="card"><h2>${esc(sup || "No supplier set")} <span class="tiny mut">${info.lead ? `${fmt(info.lead)} day${+info.lead === 1 ? "" : "s"} to arrive` : ""}${info.order_days ? ` · orders ${esc(info.order_days)}` : ""}</span></h2><div class="list">${lines}</div><div style="margin-top:10px">${btn}</div></section>`;
  };
  const mine = (S.orders || []).filter(o => o.status !== "cancelled" && o.status !== "received").sort((a, b) => a.day < b.day ? 1 : -1);
  return shell("Order today", dayLong(today()), `
    <div class="alert info">The list shows what drops under its reorder point before the next delivery can arrive. Quantities are in the unit you buy. Change them with − and +, then send per supplier.</div>
    ${uncounted ? `<div class="tiny mut">${uncounted} item${uncounted === 1 ? "" : "s"} not counted yet: count them once so they can show up here.</div>` : ""}
    <div class="chips" style="margin:8px 0"><button class="chip ${odAll ? "" : "info"}" onclick="odAll=false;render()">Due now (${REORDER.filter(r => r.order_now).length})</button><button class="chip ${odAll ? "info" : ""}" onclick="odAll=true;render()">All items</button><button class="chip" onclick="odRefresh()">Refresh levels</button></div>
    ${sups.length ? sups.map(card).join("") : `<section class="card"><div class="mut">Nothing is due. Everything counted lasts past its next delivery.</div></section>`}
    ${mine.length ? `<section class="card"><h2>Open orders</h2><div class="list">${mine.map(o => `<div class="row"><div class="main"><div class="name">${esc(o.supplier)} ${chip(o.status === "approved" ? "ok" : "warn", o.status === "draft" ? "sending" : o.status === "requested" ? "waiting for Mike" : "approved")}</div><div class="meta">${esc(dayName(o.day))} · ${o.lines.map(l => `${fmt(l.qty)} ${esc(l.unit || "")} ${esc((Store.item(l.item) || {}).name || l.item)}`).join(" · ")}${o.decision_note ? ` · “${esc(o.decision_note)}”` : ""}</div></div></div>`).join("")}</div><div class="tiny mut" style="margin-top:6px">Receive the delivery with the order: Stock → Receive, pick the supplier, tap the order.</div></section>` : ""}`, { back: "#/stock" });
}
function odSend(sup) {
  const rs = REORDER.filter(r => (r.supplier || "") === sup && odItem(r) && (odAll || r.order_now) && odQty(r) > 0);
  if (!rs.length) return;
  const info = SUPPLIER_INFO[sup] || {}; const lead = Math.max(...rs.map(r => +r.lead || +info.lead || 1));
  S.orders = S.orders || [];
  S.orders.push({ id: "po-" + Date.now(), day: today(), supplier: sup, by: S.me, status: "draft", expected: addDays(today(), lead), note: null, synced: false,
    lines: rs.map(r => ({ item: r.item, qty: odQty(r), unit: r.buy_unit || odItem(r).unit })) });
  rs.forEach(r => delete odEdit[odKey(sup, r.item)]);
  save(); toast(rs.some(r => r.needs_approval) || info.needs_approval ? "Sent to Mike for approval." : "Order saved. Place it with " + sup + ".");
  render();
}

/* ---------- APPROVE (master) ---------- */
function viewApprove() {
  if (role() !== "master") return shell("Approve orders", "", `<div class="alert info">Only Mike or Stefan approve orders.</div>`, { back: "#/today" });
  const open = (S.orders || []).filter(o => o.status === "requested" && o.approval_needed);
  const list = open.map(o => { const est = o.lines.reduce((a, l) => a + (l.price != null ? l.price * l.qty : 0), 0);
    return `<section class="card"><h2>${esc(o.supplier)} <span class="tiny mut">${esc(dayName(o.day))}${o.by_email ? " · " + esc(o.by_email) : ""}</span></h2>
      <div class="list">${o.lines.map(l => { const it = Store.item(l.item) || { name: l.item }; const rr = REORDER.find(r => r.item === l.item); const left = rr ? odLeft(rr) : null;
        return `<div class="row"><div class="main"><div class="name">${fmt(l.qty)} ${esc(l.unit || "")} ${esc(it.name)}</div><div class="meta">${left != null ? `${odQ(left)} ${esc(it.unit)} left` : "no count"}${rr && rr.cover != null ? ` · ${odQ(rr.cover)} days of cover` : ""}${l.price != null ? ` · about ${peso(l.price * l.qty)}` : ""}</div></div></div>`; }).join("")}</div>
      ${est ? `<div class="small" style="margin-top:6px">Estimate <b>${peso(est)}</b> from the last prices.</div>` : ""}
      <div style="display:flex;gap:8px;margin-top:10px"><button class="btn primary" style="flex:1" onclick="apDecide('${o.id}','approve')">Approve</button><button class="btn ghost danger" onclick="apDecide('${o.id}','reject')">Reject</button></div></section>`; }).join("");
  return shell("Approve orders", open.length ? `${open.length} waiting` : "nothing waiting", list || `<section class="card"><div class="mut">No order is waiting for approval.</div></section>`, { back: "#/today" });
}
function apDecide(id, decision) {
  const o = (S.orders || []).find(x => x.id === id); if (!o) return;
  const note = decision === "reject" ? prompt("Why not? (the store sees this)", "") : "";
  if (decision === "reject" && note === null) return;
  S.approvals = S.approvals || []; S.approvals.push({ id, decision, note: note || null, synced: false });
  o.status = decision === "approve" ? "approved" : "cancelled"; o.decision_note = note || null;
  save(); toast(decision === "approve" ? "Approved. The store can place it." : "Rejected."); render();
}

/* ---------- BILLS & EXPENSES (master, admin) ---------- */
function viewBills() {
  if (!moneyOK()) return shell("Bills", "", `<div class="alert info">For the office only.</div>`, { back: "#/today" });
  const since = bpRange === "open" ? null : addDays(today(), -parseInt(bpRange, 10));
  const bills = MONEY.filter(m => m.mode === "bill" && (bpRange === "open" ? !m.paid_on : m.day >= since));
  const exps = MONEY.filter(m => m.mode === "paid_now" && (since ? m.day >= since : m.day >= addDays(today(), -7)));
  const bySup = {}; bills.forEach(b => { const k = b.supplier + "|" + b.run; (bySup[k] = bySup[k] || []).push(b); });
  const ticked = Object.keys(bpSel).filter(k => bpSel[k]);
  const billCards = Object.keys(bySup).sort().map(k => { const [sup, run] = k.split("|"); const bs = bySup[k]; const tot = bs.reduce((a, b) => a + (+b.total || 0), 0);
    return `<section class="card"><h2>${esc(sup)} <span class="tiny mut">run ${esc(run || "—")} · paid around ${esc(bs[0].due ? dayName(bs[0].due) : "—")} · ${peso(tot)}</span></h2><div class="list">${bs.map(b => `<label class="row"><div class="main"><div class="name">${esc(dayName(b.day))} · ${peso(+b.total)}${b.invoice ? ` · ${esc(b.invoice)}` : ""} ${b.paid_on ? chip("ok", "paid " + esc(dayName(b.paid_on))) : chip("", "open")}</div><div class="meta">${esc(b.lines || "")}</div></div>${b.paid_on ? "" : `<input type="checkbox" ${bpSel[b.id] ? "checked" : ""} onchange="bpSel['${b.id}']=this.checked;render()" style="width:24px;height:24px">`}</label>`).join("")}</div></section>`; }).join("");
  const expTot = exps.reduce((a, b) => a + (+b.total || 0), 0);
  const src = Object.fromEntries(PAY_SOURCES);
  return shell("Bills", "deliveries, expenses, bills", `
    <div class="alert info">Every delivery recorded in the app lands here. Bills wait for their run (1–15 paid on the 15th, 16–end paid at month end). The Google Sheets stay the books: download and paste, or tick bills once they are paid.</div>
    <div class="chips" style="margin:8px 0">${[["open", "Open bills"], ["30", "30 days"], ["90", "90 days"]].map(([k, l]) => `<button class="chip ${bpRange === k ? "info" : ""}" onclick="bpRange='${k}';render()">${l}</button>`).join("")}</div>
    ${billCards || `<section class="card"><div class="mut">No ${bpRange === "open" ? "open " : ""}bills.</div></section>`}
    ${ticked.length ? `<div class="bottom-act"><button class="btn primary full" onclick="bpMarkPaid()">Mark ${ticked.length} bill${ticked.length === 1 ? "" : "s"} paid</button></div>` : ""}
    <section class="card"><h2>Paid now <span class="tiny mut">${since ? "since " + esc(dayName(since)) : "last 7 days"} · ${peso(expTot)}</span></h2><div class="list">${exps.map(e => `<div class="row"><div class="main"><div class="name">${esc(e.supplier)} · ${peso(+e.total)} ${chip("", esc(src[e.source] || e.source || ""))}</div><div class="meta">${esc(dayName(e.day))} · ${esc(e.lines || "")}</div></div></div>`).join("") || `<div class="mut small">None.</div>`}</div></section>
    <section class="card"><h2>Download for the sheets</h2><div class="tiny mut" style="margin-bottom:8px">One line per item, the columns of the expense ledger: date, store, item, qty, unit, unit price, amount, supplier, SI, paid now or bill, who paid, run.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" onclick="bpExport('paid_now')">Expenses CSV</button><button class="btn" onclick="bpExport('bill')">Bills CSV</button><button class="btn" onclick="go('#/money')">Funds</button><button class="btn" onclick="go('#/purchases')">Other purchases</button></div></section>`, { back: "#/finance" });
}
function bpMarkPaid() {
  const ids = Object.keys(bpSel).filter(k => bpSel[k]); if (!ids.length) return;
  const note = prompt("Paid how? (e.g. bank transfer 15 Nov, check no.)", ""); if (note === null) return;
  S.billPaid = S.billPaid || []; S.billPaid.push({ id: "pay-" + Date.now(), receipts: ids, paid_on: today(), note: note || null, synced: false });
  MONEY.forEach(m => { if (ids.includes(m.id)) m.paid_on = today(); }); bpSel = {};
  save(); toast(`${ids.length} marked paid.`); render();
}
function bpExport(mode) {
  const since = bpRange === "open" ? addDays(today(), -120) : addDays(today(), -parseInt(bpRange, 10));
  const src = Object.fromEntries(PAY_SOURCES); const q = v => { const t = v == null ? "" : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const rows = [["Date", "Store", "Item", "Qty", "Unit", "Unit price", "Amount", "Supplier", "SI / invoice", "Paid now or bill", "Paid by", "Run", "Receipt total", "Category"]];
  (S.receipts || []).filter(r => r.pay_mode === mode && r.day >= since && (mode !== "bill" || bpRange !== "open" || !(MONEY.find(m => m.id === r.id) || {}).paid_on)).sort((a, b) => a.day < b.day ? -1 : 1)
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
    const j = sub.toJSON(); const { error } = await sb.rpc("os_submit", { p: { kind: "push_sub", store: "P99", rec: { id: "push", endpoint: j.endpoint, keys: j.keys } } });
    if (error) throw error; try { localStorage.setItem("p99os_push", "on"); } catch (e) { } toast("Order alerts are on for this phone."); render();
  } catch (e) { toast("Could not switch alerts on: " + (e.message || e)); }
}
function pushState() { try { return localStorage.getItem("p99os_push") === "on"; } catch (e) { return false; } }

/* ---------- PACK SIZES (v0.13, migration 021) ---------- */
/* Stefan, 2026-11-08: no photo reading; the team writes the size down. Receive asks for it when an item without a size arrives;
   here the lead or a master types the rest. The first size converts what was recorded in counted units, once (os_set_pack_size). */
let szEdit = {};
function viewSizes() {
  if (!["lead", "master"].includes(role())) return shell("Pack sizes", "", `<div class="alert info">For the store lead and the owners.</div>`, { back: "#/stock" });
  const unknown = ITEMS.filter(i => i.sizeUnknown).sort((a, b) => (typeof skCatKey === "function" ? skCatKey(a) - skCatKey(b) : 0) || a.name.localeCompare(b.name));
  /* v0.19.3: a fill-in table, one line per item, Tab or Enter moves down, one button saves everything typed */
  const rows = unknown.map((it, i) => `<tr><td class="nm">${esc(it.name)}<div class="sub2">${esc(it.supplier || "no supplier")}</div></td><td class="h1 mut">${typeof skGrp === "function" ? esc(skGrp(it)) : ""}</td><td class="h1 mut">${typeof skSupLink === "function" ? skSupLink(it.supplier) || "—" : esc(it.supplier || "—")}</td><td class="mut">1 ${esc(it.unit)} =</td>
    <td class="n szc"><input class="in num szin" inputmode="decimal" data-i="${i}" placeholder="${esc(it.base)}" aria-label="${esc(it.base)} in one ${esc(it.unit)} of ${esc(it.name)}" value="${szEdit[it.id] != null ? szEdit[it.id] : ""}" oninput="szEdit['${it.id}']=this.value===''?null:parseFloat(this.value);szCount()" onkeydown="if(event.key==='Enter'){const n=document.querySelector('.szin[data-i=&quot;${i + 1}&quot;]');if(n)n.focus();else szSaveAll()}"> <small>${esc(it.base)}</small></td></tr>`).join("");
  const n = Object.values(szEdit).filter(v => v > 0).length;
  return shell("Pack sizes", `${unknown.length} without a size`, `
    <div class="tiny mut">Write how much ONE counted unit holds, as printed on the label (one can of tuna = ? g). Receive also asks for it when one of these arrives. Weigh it once if the label does not say. Enter jumps to the next line.</div>
    ${unknown.length ? `<div class="itwrap"><table class="itbl sz"><thead><tr><th>Item</th><th class="h1">Category</th><th class="h1">Supplier</th><th>Counted as</th><th class="n">Holds</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="bottom-act"><button class="btn primary full" id="szall" onclick="szSaveAll()" ${n ? "" : "disabled"}>Save ${n || ""} size${n === 1 ? "" : "s"}</button></div>` : `<section class="card"><div class="mut">Every item has a size.</div></section>`}`, { back: "#/stock" });
}
function szCount() { const n = Object.values(szEdit).filter(v => v > 0).length; const b = document.getElementById("szall"); if (b) { b.disabled = !n; b.textContent = `Save ${n || ""} size${n === 1 ? "" : "s"}`; } }
function szSaveAll() {
  const ids = Object.keys(szEdit).filter(k => szEdit[k] > 0); if (!ids.length) return toast("Type a size first.");
  S.sizeDecisions = S.sizeDecisions || [];
  ids.forEach(code => { S.sizeDecisions.push({ id: "sz-" + code + "-" + Date.now(), item: code, qty: szEdit[code], synced: false }); const it = Store.item(code); if (it) { it.per = szEdit[code]; it.sizeUnknown = false; } delete szEdit[code]; });
  save(); toast(ids.length + (ids.length === 1 ? " size saved." : " sizes saved.")); render();
}
function szSave(code) {
  const qty = szEdit[code]; if (!(qty > 0)) return toast("Type the size first.");
  S.sizeDecisions = S.sizeDecisions || []; S.sizeDecisions.push({ id: "sz-" + code + "-" + Date.now(), item: code, qty, synced: false });
  const it = Store.item(code); if (it) { it.per = qty; it.sizeUnknown = false; }
  delete szEdit[code]; save(); toast("Size saved."); render();
}
