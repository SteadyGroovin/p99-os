/* transfer-v2.js — stock between locations (2026-11-03). Head Office → Pizza 99, another store → Pizza 99, the Dragon store freezer that keeps P99's meat.
   Both sides record the same move: the sender posts what was released, the receiver posts what arrived. Equal = matched; a difference = mismatch, shown to the owners.
   One side alone is honest about it: "waiting for the other side". Data: S.transfers (from os_load / sync.js), S.held (what Head Office and other locations hold of P99's items).
   Chats it replaces: "pull out items at the office 2 boxes aluminum foil…" (store side) and "Delivered here in the office, 12 boxes of Aluminum Foils" (office side) — two posts in two groups, never reconciled. */

let tr = null;                                              /* the form in progress */
const LOC_FALLBACK = [{ code: "P99", name: "Pizza 99", kind: "store" }, { code: "HO", name: "Head Office", kind: "office" }, { code: "STO", name: "Storage room", kind: "storage" }, { code: "DC", name: "Dragon Crepe", kind: "store" }, { code: "MCC", name: "My Crepes Cafe", kind: "store" }, { code: "MCBC", name: "My Crepes Beach Club", kind: "store" }, { code: "BK", name: "Burger Kong", kind: "store" }];
const locs = () => (S.locations && S.locations.length) ? S.locations : LOC_FALLBACK;
const locName = c => { const l = locs().find(x => x.code === c); return l ? l.name : c; };
const myLoc = () => role() === "walk" ? "HO" : (typeof curStore === "function" && curStore()) || "P99";   /* where this login stands: the office the Head Office side, a store login its own store (v0.21.0: every store, not only Pizza 99) */
const isStorage = c => { const l = locs().find(x => x.code === c); return !!(l && l.kind === "storage"); };   /* v0.21.0: the storage room has no keeper; a pull-out from it closes itself (migration 033) */
const trSideOpen = t => t.status === "released" ? "receive" : t.status === "received" ? "release" : null; /* which side is still missing */
/* may this login post that side of this transfer? owners both; the office the Head Office side; the store its own side */
function trCan(t, side) { const r = role(); if (r === "master") return true; const loc = side === "release" ? t.from : t.to; return loc === myLoc() && (r === "lead" || r === "walk" || r === "crew"); }
const trAwaitingMe = () => S.transfers.filter(t => { const s = trSideOpen(t); return s && trCan(t, s); });
const trAwaitingOther = () => S.transfers.filter(t => { const s = trSideOpen(t); return s && !trCan(t, s); });
const trStatusChip = t => t.status === "matched" ? chip("ok", "matched") : t.status === "mismatch" ? chip("bad", "difference") : t.status === "released" ? chip("warn", "not yet received") : chip("warn", "not yet confirmed by " + esc(locName(t.from)));
const trQty = (l, side) => side === "release" ? l.released : l.received;
function trLineText(t, side) { return t.lines.map(l => { const it = Store.item(l.item); const q = trQty(l, side); return `${esc(it ? it.name : l.item)} ${q == null ? "—" : fmt(q)}${it ? " " + esc(it.unit) : ""}`; }).join(" · "); }
const trNotSaved = t => t.synced === false || (typeof Sync !== "undefined" && Sync.outbox.some(o => o.kind === "transfer" && o.rec.id === t.id));

/* ---------- list ---------- */
function viewTransfers() {
  const mine = trAwaitingMe(), other = trAwaitingOther(), diff = S.transfers.filter(t => t.status === "mismatch"), done = S.transfers.filter(t => t.status === "matched").slice(0, 20);
  const row = t => { const s = trSideOpen(t); return `<button class="row tap" onclick="go('#/transfer/${t.id}')"><div class="main"><div class="name">${esc(locName(t.from))} → ${esc(locName(t.to))} ${trStatusChip(t)}${trNotSaved(t) ? ' <span class="chip warn"><i class="dot"></i>not saved yet</span>' : ""}</div><div class="meta">${esc(dayName(t.day))} · ${trLineText(t, s === "receive" ? "release" : s === "release" ? "receive" : "received")}</div></div><span class="chev">${ic("chevron-right")}</span></button>`; };
  const sec = (title, rows, empty) => `<section class="card"><h2>${title}${rows.length ? ` <span class="tiny mut">${rows.length}</span>` : ""}</h2>${rows.length ? `<div class="list">${rows.map(row).join("")}</div>` : `<div class="mut small">${empty}</div>`}</section>`;
  const byLoc = {}; (S.held || []).forEach(h => (byLoc[h.location] = byLoc[h.location] || []).push(h));
  const held = Object.keys(byLoc).length ? `<section class="card"><h2>Held for Pizza 99 elsewhere <span class="tiny mut">from deliveries and transfers recorded here</span></h2>${Object.keys(byLoc).map(code => `<div class="txday">${esc(locName(code))}</div><div class="list">${byLoc[code].sort((a, b) => b.on_hand - a.on_hand).map(h => { const it = Store.item(h.item); const q = h.count_units != null ? h.count_units : h.on_hand; return `<div class="row"><div class="main"><div class="name">${esc(it ? it.name : h.item)}</div></div><div class="right"><div class="v num ${q < 0 ? "band-bad" : ""}">${fmt(q)}</div><div class="l">${esc(it ? it.unit : "")}${q < 0 ? " · more released than delivered" : ""}</div></div></div>`; }).join("")}</div>`).join("")}</section>` : "";
  const r = role();
  const acts = `<div class="skact">${r === "walk" || r === "master" ? `<button class="btn primary" onclick="trStart('release','HO','P99')">${ic("package", "sm")}Release from Head Office</button>` : ""}${r !== "walk" ? `<button class="btn primary" onclick="trStart('receive','STO',myLoc() === 'HO' ? 'P99' : myLoc())">${ic("package", "sm")}Take from storage room</button><button class="btn" onclick="trStart('receive','HO',myLoc() === 'HO' ? 'P99' : myLoc())">${ic("package", "sm")}Pull-out arrived</button>` : ""}</div>`;
  return shell("Stock in / out", "storage room, Head Office and the stores", acts
    + sec("Waiting for you", mine, "Nothing to confirm.")
    + sec("Waiting for the other side", other, "Nothing open.")
    + (diff.length ? sec("Differences", diff, "") : "")
    + held
    + sec("Matched, recent", done, "No matched transfers yet."), { back: r === "walk" ? "#/more" : "#/stock" });
}

/* ---------- new transfer: one side posts ---------- */
function trStart(side, from, to) { tr = { side, from, to, lines: [], note: "", photo: null }; go("#/transfer/new"); }
function trPad(id) { openPad(id, "receive", (qty, text) => { if (!qty) return; const i = tr.lines.findIndex(l => l.item === id); if (i >= 0) { tr.lines[i].qty = qty; tr.lines[i].text = text; } else tr.lines.push({ item: id, qty, text }); }); }
function viewTransferNew() {
  if (!tr) return viewTransfers();
  const r = role(); const fromOpts = locs().filter(l => l.code !== tr.to), toOpts = locs().filter(l => l.code !== tr.from);
  const lockFrom = r === "walk" && tr.side === "release", lockTo = r !== "master" && r !== "walk" && tr.side === "receive";
  const usual = {}; S.transfers.filter(t => t.from === tr.from && t.to === tr.to).forEach(t => t.lines.forEach(l => usual[l.item] = (usual[l.item] || 0) + 1));
  const chips = Object.keys(usual).sort((a, b) => usual[b] - usual[a]).filter(id => Store.item(id) && !tr.lines.some(l => l.item === id)).slice(0, 8);
  const lastT = S.transfers.filter(t => t.from === tr.from && t.to === tr.to && t.id !== tr.id).sort((a, b) => (a.day < b.day ? 1 : -1))[0];
  window._trCopy = () => { if (!lastT) return; tr.lines = lastT.lines.map(l => ({ item: l.item, qty: l.released != null ? l.released : l.received, text: l.text || null })).filter(l => l.qty != null && Store.item(l.item)); render(); };   /* v0.16: daily supplies */
  const itemOpts = ITEMS.map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join("");
  const lines = tr.lines.map((l, i) => { const it = Store.item(l.item); return `<div class="rline"><div class="main"><div class="name">${esc(it.name)}</div><div class="meta">${esc(l.text || fmt(l.qty) + " " + it.unit)} = ${fmt(l.qty)} ${esc(it.unit)}</div></div><button class="btn ghost danger rx" onclick="tr.lines.splice(${i},1);render()" aria-label="Remove">${ic("x-close")}</button></div>`; }).join("");
  const need = []; if (!tr.from || !tr.to) need.push("from and to"); if (!tr.lines.length) need.push("at least one item");
  const title = isStorage(tr.from) && tr.side === "receive" ? "Take from storage room" : tr.side === "release" ? "Release stock" : "Pull-out arrived";
  const sel = (lab, key, opts, lock) => `<div class="field"><label>${lab}</label>${lock ? `<div class="in" style="display:flex;align-items:center">${esc(locName(tr[key]))}</div>` : `<select class="in" onchange="tr.${key}=this.value;render()">${opts.map(l => `<option value="${l.code}" ${tr[key] === l.code ? "selected" : ""}>${esc(l.name)}</option>`).join("")}</select>`}</div>`;
  return shell(title, dayLong(today()), `
    <div class="alert info">${isStorage(tr.from) && tr.side === "receive" ? "Write down everything you take from the storage room. Nobody confirms it there: what you record here is what left the room." : tr.side === "release" ? "You record what left. The store confirms what arrived; a difference is flagged." : "You record what arrived. The sender confirms what left; a difference is flagged."}</div>
    <section class="card"><div class="grid2">${sel("From", "from", fromOpts, lockFrom)}${sel("To", "to", toOpts, lockTo)}</div></section>
    <section class="card"><h2>Items <span class="tiny mut">${tr.lines.length} line${tr.lines.length === 1 ? "" : "s"}</span></h2>
      ${lastT && !tr.lines.length ? `<button class="btn full" style="margin-bottom:10px" onclick="_trCopy()">Same as last time · ${esc(dayName(lastT.day))} (${lastT.lines.length} item${lastT.lines.length === 1 ? "" : "s"})</button>` : ""}
      ${chips.length ? `<div class="tiny mut" style="margin-bottom:6px">Usual between these two — tap to add</div><div class="chips">${chips.map(id => `<button class="chip" onclick="trPad('${id}')">+ ${esc(Store.item(id).name)}</button>`).join("")}</div>` : ""}
      <div class="field" style="margin-top:10px"><label>Any item</label><div style="display:flex;gap:8px"><select class="in" id="tritem">${itemOpts}</select><button class="btn primary" onclick="trPad(document.getElementById('tritem').value)">Qty</button></div></div>
      ${lines ? `<div class="list" style="margin-top:10px">${lines}</div>` : `<div class="mut small" style="margin-top:8px">No lines yet.</div>`}</section>
    <section class="card"><div class="field"><label>Note <span class="tiny mut">optional — who picked it up, which van</span></label><input class="in" value="${esc(tr.note)}" oninput="tr.note=this.value"></div>
      <div style="margin-top:8px">${photoBtn("Photo of the goods (optional)", "tr.photo=id;render()", tr.photo)}${thumb(tr.photo, "big")}</div></section>
    <div class="bottom-act"><button class="btn primary full" ${need.length ? "disabled" : ""} onclick="trSave()">${isStorage(tr.from) && tr.side === "receive" ? "Record what I took" : tr.side === "release" ? "Record the release" : "Record what arrived"} · ${tr.lines.length} line${tr.lines.length === 1 ? "" : "s"}</button></div>
    ${need.length ? `<div class="tiny mut" style="text-align:center">Needed: ${need.join(", ")}.</div>` : ""}${padHTML()}`, { back: "#/transfers" });
}
function trSave() {
  const at = nowISO(), rel = tr.side === "release";
  const sto = !rel && isStorage(tr.from);   /* taken from the storage room: released = taken, closed at once (the server does the same, 033) */
  const rec = { id: "tr-" + Date.now(), from: tr.from, to: tr.to, day: today(), status: sto ? "matched" : rel ? "released" : "received", photo: tr.photo, _side: tr.side, synced: false,
    lines: tr.lines.map(l => ({ item: l.item, text: l.text, released: rel || sto ? l.qty : null, received: rel ? null : l.qty })),
    released_at: rel ? at : null, released_by: rel ? S.me : null, released_note: rel ? tr.note : null, received_at: rel ? null : at, received_by: rel ? null : S.me, received_note: rel ? null : tr.note };
  if (sto) { rec.released_at = at; rec.released_by = S.me; }
  S.transfers.unshift(rec); tr = null; save(); toast(sto ? "Recorded — taken from the storage room." : rel ? "Release recorded." : "Pull-out recorded."); go("#/transfers");
}

/* ---------- one transfer: the other side confirms ---------- */
function viewTransfer(id) {
  const t = S.transfers.find(x => x.id === id); if (!t) return viewTransfers();
  const open = trSideOpen(t), can = open && trCan(t, open);
  if (can && (!tr || tr.id !== id)) tr = { id, side: open, lines: t.lines.map(l => ({ item: l.item, qty: trQty(l, open === "release" ? "receive" : "release"), text: l.text })), note: "", photo: null }; /* prefilled with the other side's figures: confirming equal is one tap */
  const who = (k, e) => { const p = Store.person(k); return p ? p.short : (e ? e.split("@")[0] : "—"); };
  const posted = s => s === "release" ? (t.released_at ? `${esc(who(t.released_by, t.released_by_email))} · ${esc(timeOf(t.released_at))}${t.released_note ? " · " + esc(t.released_note) : ""}` : '<span class="mut">not yet posted</span>') : (t.received_at ? `${esc(who(t.received_by, t.received_by_email))} · ${esc(timeOf(t.received_at))}${t.received_note ? " · " + esc(t.received_note) : ""}` : '<span class="mut">not yet posted</span>');
  const rows = t.lines.map((l, i) => { const it = Store.item(l.item); const a = l.released, b = l.received; const ed = can && tr.lines[i]; const d = a != null && b != null && a !== b;
    return `<tr class="${d ? "bad" : ""}"><td>${esc(it ? it.name : l.item)}<div class="tiny mut">${esc(it ? it.unit : "")}</div></td><td class="n num">${a == null ? (ed && open === "release" ? `<button class="btn" onclick="trEditLine(${i})">${fmt(ed.qty)} ✎</button>` : "—") : fmt(a)}</td><td class="n num">${b == null ? (ed && open === "receive" ? `<button class="btn" onclick="trEditLine(${i})">${fmt(ed.qty)} ✎</button>` : "—") : fmt(b)}</td><td class="n num">${d ? `<span class="band-bad">${b - a > 0 ? "+" : ""}${fmt(b - a)}</span>` : a != null && b != null ? "✓" : ""}</td></tr>`; }).join("");
  const tbl = `<table class="t"><thead><tr><th>Item</th><th class="n">Released</th><th class="n">Received</th><th class="n">Diff</th></tr></thead><tbody>${rows}</tbody></table>`;
  const confirm = can ? `<section class="card"><h2>${open === "release" ? "Confirm what left " + esc(locName(t.from)) : "Confirm what arrived at " + esc(locName(t.to))}</h2>
      <div class="tiny mut" style="margin-bottom:8px">The figures are prefilled from the other side. Tap a number to change it if you counted something else.</div>
      <div class="field"><label>Note <span class="tiny mut">optional</span></label><input class="in" value="${esc(tr.note)}" oninput="tr.note=this.value"></div>
      <div style="margin-top:8px">${photoBtn("Photo (optional)", "tr.photo=id;render()", tr.photo)}${thumb(tr.photo, "big")}</div>
      <div class="bottom-act"><button class="btn primary full" onclick="trConfirm('${id}')">${open === "release" ? "Confirm the release" : "Confirm what arrived"}</button></div></section>` : "";
  return shell(`${esc(locName(t.from))} → ${esc(locName(t.to))}`, `${esc(dayName(t.day))} · ${trStatusChip(t)}${trNotSaved(t) ? ' <span class="chip warn"><i class="dot"></i>not saved yet</span>' : ""}`, `
    <section class="card"><div class="grid2"><div><div class="lab">Released by ${esc(locName(t.from))}</div><div class="small">${posted("release")}</div></div><div><div class="lab">Received by ${esc(locName(t.to))}</div><div class="small">${posted("receive")}</div></div></div></section>
    <section class="card">${tbl}${t.status === "mismatch" ? `<div class="alert warn" style="margin-top:10px">▲ The two sides differ. Owners see this on Today; the store's stock counts what arrived, the sender's what left.</div>` : ""}${t.photo ? thumb(t.photo, "big") : ""}</section>
    ${confirm}${padHTML()}`, { back: "#/transfers" });
}
function trEditLine(i) { const l = tr.lines[i]; openPad(l.item, "receive", (qty, text) => { if (!qty) return; l.qty = qty; l.text = text; }); }
function trConfirm(id) {
  const t = S.transfers.find(x => x.id === id); if (!t || !tr || tr.id !== id) return; const rel = tr.side === "release", at = nowISO();
  tr.lines.forEach((l, i) => { if (rel) t.lines[i].released = l.qty; else t.lines[i].received = l.qty; if (!t.lines[i].text) t.lines[i].text = l.text; });
  if (rel) { t.released_at = at; t.released_by = S.me; t.released_note = tr.note || null; } else { t.received_at = at; t.received_by = S.me; t.received_note = tr.note || null; }
  if (tr.photo) t.photo = tr.photo; t._side = tr.side; t.synced = false;
  t.status = t.lines.some(l => l.released != null && l.received != null && l.released !== l.received) ? "mismatch" : "matched";
  tr = null; save(); toast(t.status === "matched" ? "Matched — both sides agree." : "Recorded — the two sides differ."); go("#/transfers");
}
/* for Today and Stock: what waits on this login */
function trAttention() { const m = trAwaitingMe(), d = S.transfers.filter(t => t.status === "mismatch"); const out = [];
  if (m.length) out.push(attnItem("⇄", "warn", `${m.length} transfer${m.length > 1 ? "s" : ""} to confirm`, esc(m.slice(0, 2).map(t => `${locName(t.from)} → ${locName(t.to)}, ${dayName(t.day)}`).join(" · ")), "go('#/transfers')"));
  if (d.length && role() === "master") out.push(attnItem("≠", "bad", `${d.length} transfer${d.length > 1 ? "s" : ""} with a difference`, esc(d.slice(0, 2).map(t => `${locName(t.from)} → ${locName(t.to)}, ${dayName(t.day)}`).join(" · ")), "go('#/transfers')"));
  return out; }
