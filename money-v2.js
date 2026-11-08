/* money-v2.js — v0.15 (2026-11-08): money moved between people and funds (migration 023). Office and owners only.
   Stefan: "If I pay something with GCash and Mike gives it back to me … that needs to be recorded."
   One move = from · to · amount · cash / GCash / bank · day · reason · the deliveries it pays back.
   Balance per party = moved in − moved out − deliveries paid now from it (the database's v_party_balance, plus moves not saved yet).
   A person below zero is owed that much by the company. The Google Sheets stay the books; the CSV carries the moves. */
let MOVE_BAL = (window.OS_LOADED && window.OS_LOADED.balances) || [];   /* from os_load: [{party, in, out, spent, net}] */
let mvForm = null;
const MOVE_METHODS = [["cash", "Cash"], ["gcash", "GCash"], ["bank", "Bank"]];
const mvName = k => (Object.fromEntries(PAY_SOURCES)[k] || k);
const mvPerson = k => ["stefan", "mike"].includes(k);

function mvBalances() {   /* server balance + moves typed on this phone and not yet saved */
  const b = {}; PAY_SOURCES.forEach(([k]) => b[k] = { party: k, in: 0, out: 0, spent: 0, net: 0 });
  MOVE_BAL.forEach(r => { if (b[r.party]) b[r.party] = { party: r.party, in: +r.in || 0, out: +r.out || 0, spent: +r.spent || 0, net: +r.net || 0, opening: r.opening, as_of: r.as_of }; });
  (S.moves || []).filter(m => m.synced === false).forEach(m => { const a = +m.amount || 0;
    if (b[m.from]) { b[m.from].out += a; b[m.from].net -= a; } if (b[m.to]) { b[m.to].in += a; b[m.to].net += a; } });
  return PAY_SOURCES.map(([k]) => b[k]);
}
function mvCard(r) {
  const n = Math.round(r.net), name = mvName(r.party);
  const head = mvPerson(r.party)
    ? (n < 0 ? `The company owes ${esc(name)} <b>${peso(-n)}</b>` : n > 0 ? `${esc(name)} holds <b>${peso(n)}</b> of company money` : `${esc(name)}: settled`)
    : `${esc(name)}: <b>${n >= 0 ? "+" : "−"}${peso(Math.abs(n))}</b> <span class="tiny mut">since the app started</span>`;
  const act = mvPerson(r.party) && n < 0 ? `<button class="btn small" onclick="mvStart('${r.party}',${-n})">Pay back</button>` : "";
  return `<div class="row"><div class="main"><div class="name">${head}</div><div class="meta">${r.opening != null ? `opening ${peso(+r.opening)} on ${esc(dayName(r.as_of))} · ` : ""}in ${peso(r.in)} · out ${peso(r.out)} · paid for deliveries ${peso(r.spent)}</div></div>${act}</div>`;
}
function mvStart(to, amount) {
  mvForm = { from: to ? "office_fund" : "", to: to || "", amount: amount || "", method: "cash", day: today(), reason: to ? "Paid back for deliveries" : "", receipts: {} };
  render(); setTimeout(() => { const f = document.getElementById("mvform"); if (f) f.scrollIntoView({ behavior: "smooth" }); }, 50);
}
function mvSettleList() {   /* deliveries the receiving person paid for, not yet paid back by a move */
  if (!mvForm || !mvPerson(mvForm.to)) return [];
  const done = new Set(); (S.moves || []).forEach(m => (m.receipts || []).forEach(id => done.add(id)));
  return MONEY.filter(m => m.mode === "paid_now" && m.source === mvForm.to && !done.has(m.id));
}
function mvFormHtml() {
  if (!mvForm) return `<section class="card"><button class="btn primary full" onclick="mvStart()">+ Record a money move</button><div class="tiny mut" style="margin-top:8px">Money handed or sent from one person or fund to another: Mike pays Stefan back, the office tops up the store cash, cash goes to the bank.</div></section>`;
  const f = mvForm, pick = (field, cur) => `<div class="chips">${PAY_SOURCES.map(([k, l]) => `<button class="chip ${cur === k ? "info" : ""}" onclick="mvForm.${field}='${k}';render()">${esc(l)}</button>`).join("")}</div>`;
  const settle = mvSettleList();
  return `<section class="card" id="mvform"><h2>Record a money move</h2>
    <div class="field"><label>From (who gives the money)</label>${pick("from", f.from)}</div>
    <div class="field"><label>To (who gets it)</label>${pick("to", f.to)}</div>
    <div class="field"><label>Amount ₱</label><input class="in num" inputmode="decimal" placeholder="0" value="${f.amount === "" ? "" : esc(String(f.amount))}" onchange="mvForm.amount=this.value===''?'':parseFloat(this.value);render()"></div>
    <div class="field"><label>How</label><div class="chips">${MOVE_METHODS.map(([k, l]) => `<button class="chip ${f.method === k ? "info" : ""}" onclick="mvForm.method='${k}';render()">${l}</button>`).join("")}</div></div>
    <div class="field"><label>Day</label><input class="in" type="date" value="${esc(f.day)}" max="${today()}" onchange="mvForm.day=this.value"></div>
    <div class="field"><label>What for</label><input class="in" placeholder="e.g. paid back the Minimart GCash payment" value="${esc(f.reason || "")}" oninput="mvForm.reason=this.value"></div>
    ${settle.length ? `<div class="field"><label>Pays back these deliveries (optional)</label><div class="list">${settle.map(m => `<label class="row"><div class="main"><div class="name">${esc(m.supplier)} · ${peso(+m.total)}</div><div class="meta">${esc(dayName(m.day))} · ${esc(m.lines || "")}</div></div><input type="checkbox" ${f.receipts[m.id] ? "checked" : ""} onchange="mvTick('${m.id}',this.checked)" style="width:24px;height:24px"></label>`).join("")}</div></div>` : ""}
    <div style="display:flex;gap:8px"><button class="btn primary" style="flex:1" onclick="mvSave()">Save move</button><button class="btn ghost" onclick="mvForm=null;render()">Cancel</button></div></section>`;
}
function mvTick(id, on) {   /* ticking deliveries fills the amount with their sum */
  mvForm.receipts[id] = on; const ids = Object.keys(mvForm.receipts).filter(k => mvForm.receipts[k]);
  if (ids.length) mvForm.amount = Math.round(MONEY.filter(m => ids.includes(m.id)).reduce((a, m) => a + (+m.total || 0), 0) * 100) / 100;
  render();
}
function mvSave() {
  const f = mvForm; if (!f) return;
  if (!f.from || !f.to) return toast("Pick who gives and who gets the money.");
  if (f.from === f.to) return toast("From and to are the same.");
  if (!(+f.amount > 0)) return toast("Type the amount.");
  if (!f.day || f.day > today()) return toast("Pick the day it happened.");
  S.moves = S.moves || [];
  S.moves.unshift({ id: "mm-" + Date.now(), day: f.day, from: f.from, to: f.to, amount: +f.amount, method: f.method, reason: (f.reason || "").trim() || null,
    receipts: Object.keys(f.receipts).filter(k => f.receipts[k]), by_email: window.DB_ME || null, synced: false });
  mvForm = null; save(); toast("Money move saved."); render();
}
function viewMoney() {
  if (!moneyOK()) return shell("Money", "", `<div class="alert info">For the office and the owners only.</div>`, { back: "#/today" });
  const bal = mvBalances(), people = bal.filter(r => mvPerson(r.party)), funds = bal.filter(r => !mvPerson(r.party));
  const moves = (S.moves || []).slice().sort((a, b) => a.day < b.day ? 1 : a.day > b.day ? -1 : 0);
  const list = moves.slice(0, 60).map(m => `<div class="row"><div class="main"><div class="name">${esc(mvName(m.from))} → ${esc(mvName(m.to))} · ${peso(+m.amount)} ${chip("", esc((Object.fromEntries(MOVE_METHODS)[m.method]) || m.method))}${m.synced === false ? " " + chip("warn", "not saved yet") : ""}</div><div class="meta">${esc(dayName(m.day))}${m.reason ? " · " + esc(m.reason) : ""}${(m.receipts || []).length ? ` · pays back ${m.receipts.length} deliver${m.receipts.length === 1 ? "y" : "ies"}` : ""}</div></div></div>`).join("");
  return shell("Banking", "who holds it, who is owed", `
    <div class="alert info">Every delivery paid now says who paid. Record here when money moves between people and funds, and the app keeps who is owed what. The Google Sheets stay the books.</div>
    <section class="card"><h2>People</h2><div class="list">${people.map(mvCard).join("")}</div></section>
    ${mvFormHtml()}
    <section class="card"><h2>Funds</h2><div class="list">${funds.map(mvCard).join("")}</div><div class="tiny mut" style="margin-top:6px">Without an opening balance a fund shows the change since the app started recording. Set them under Settings → Opening balances & month close.</div></section>
    <section class="card"><h2>Moves <span class="tiny mut">${moves.length}</span></h2><div class="list">${list || `<div class="mut small">No moves recorded yet.</div>`}</div>
      <div style="margin-top:10px"><button class="btn" onclick="mvExport()">Moves CSV</button></div></section>`, { back: "#/more" });
}
function mvExport() {
  const q = v => { const t = v == null ? "" : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const rows = [["Date", "Store", "From", "To", "Amount", "How", "What for", "Pays back (deliveries)", "Recorded by"]];
  (S.moves || []).slice().sort((a, b) => a.day < b.day ? -1 : 1).forEach(m => rows.push([m.day, "P99", mvName(m.from), mvName(m.to), m.amount, (Object.fromEntries(MOVE_METHODS)[m.method]) || m.method, m.reason || "",
    (m.receipts || []).map(id => { const x = MONEY.find(y => y.id === id); return x ? `${x.supplier} ${x.day} ${x.total}` : id; }).join("; "), m.by_email || ""]));
  const blob = new Blob(["﻿" + rows.map(r => r.map(q).join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `p99-money-moves-${today()}.csv`; document.body.appendChild(a); a.click(); a.remove();
  toast(`${rows.length - 1} move${rows.length === 2 ? "" : "s"} downloaded.`);
}
