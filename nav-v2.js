/* nav-v2.js — v0.16 (2026-11-08): the app in areas, like our own Zoho (Stefan: "most of the relevant fields under More is not practical").
   Bottom bar = the areas a login may open: Today · Sales · Stock · Money · Ops. Each area has a row of sub-tabs at the top.
   Settings sit behind the name badge (top right). A "+" button records the common things from any screen.
   Stores: tick which stores are included; one of them is where new records go ("Record into"). Changing it reloads the app.
   Loaded before app.js; app.js's shell() and router use these helpers. */
const STORE_KEY = "rocketos_stores";
function storeCfg() { let c = null; try { c = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) { } return c && c.rec ? c : { on: ["P99"], rec: "P99" }; }
const curStore = () => storeCfg().rec;
const storesOn = () => storeCfg().on;
const officeLogin = () => window.DB_ROLE === "admin";               /* role() maps admin to walk (the morning-run screens); money screens need the raw role */
const moneyOK = () => role() === "master" || officeLogin();

const AREAS = [
  { id: "today", label: "Today", icon: "home", subs: [["Today", "#/today"]] },
  { id: "sales", label: "Sales", icon: "cash", subs: [["Overview", "#/sales"], ["Cash counts", "#/cash"]] },
  { id: "stock", label: "Stock", icon: "grid", subs: [["Overview", "#/stock"], ["Count", "#/count"], ["Receive", "#/receive"], ["Order", "#/order"], ["Transfers", "#/transfers"], ["Items", "#/items"], ["Variance", "#/variance"]] },
  { id: "money", label: "Money", icon: "finance", subs: [["Banking", "#/money"], ["Bills & expenses", "#/bills"], ["Other purchases", "#/purchases"], ["Approve orders", "#/approve"], ["Finance", "#/finance"]] },
  { id: "ops", label: "Ops", icon: "list", subs: [["Tasks", "#/tasks"], ["Tickets", "#/report"], ["Clean", "#/clean"], ["Morning run", "#/walk"]] },
];
const SETUP = [
  ["Users & roles", "#/users", "who has which login and what they see"],
  ["Stores & places", "#/stores", "where stock is sent and received"],
  ["Suppliers", "#/suppliers", "terms, delivery days, what we buy, prices"],
  ["Recipes", "#/recipes", "what each pizza, slice and batch uses"],
  ["Pack sizes", "#/sizes", "how much is inside a can, pack or box"],
  ["Chart of accounts", "#/accounts", "expense categories, as in the accounting book"],
  ["Opening balances & month close", "#/books", "what each fund held, lock a finished month"],
  ["Order rules", "#/rules", "₱ limit for Mike's approval, safety days"],
];
const AREA_OF = { today: "today", sales: "sales", cash: "sales", stock: "stock", count: "stock", receive: "stock", receipts: "stock", order: "stock", transfers: "stock", transfer: "stock", items: "stock", item: "stock", variance: "stock",
  money: "money", bills: "money", purchases: "money", approve: "money", finance: "money", tasks: "ops", task: "ops", report: "ops", clean: "ops", walk: "ops",
  settings: "settings", users: "settings", stores: "settings", suppliers: "settings", supplier: "settings", recipes: "settings", recipe: "settings", sizes: "settings", accounts: "settings", books: "settings", rules: "settings", more: "settings", password: "settings", who: "settings" };
const SUB_OF = { item: "items", receipts: "receive", transfer: "transfers", task: "tasks", supplier: "suppliers", recipe: "recipes" };
const areaOf = seg => AREA_OF[seg || "today"] || "today";

/* the one place that says who may open what (the database refuses the data anyway) */
function canOpen(s0) {
  const r = role(), adm = officeLogin(), m = r === "master";
  if (["sales", "finance", "approve", "users", "rules"].includes(s0)) return m;
  if (["bills", "money", "stores", "accounts", "books"].includes(s0)) return m || adm;
  if (s0 === "purchases") return m || adm || r === "lead";
  if (["order", "sizes"].includes(s0)) return m || r === "lead";
  if (["recipes", "recipe", "suppliers", "supplier"].includes(s0)) return m || adm || r === "lead";
  if (s0 === "walk") return m || r === "walk";               /* the morning run: Cherry, the office, the owners */
  if (r === "walk") return adm ? true : ["walk", "tasks", "task", "report", "more", "settings", "who", "password", "receive", "transfers", "transfer", ""].includes(s0);
  return true;
}
const subHref = s => s[1].split("/")[1];
function areasFor() { return AREAS.filter(a => a.subs.some(s => canOpen(subHref(s)))).filter(a => !(a.id === "today" && role() === "walk")); }

function subnavHTML(seg) {
  const a = AREAS.find(x => x.id === areaOf(seg)); if (!a) return "";
  const subs = a.subs.filter(s => canOpen(subHref(s))); if (subs.length < 2) return "";
  const cur = SUB_OF[seg] || seg;
  return `<nav class="subnav" aria-label="${esc(a.label)}">${subs.map(s => `<button class="${subHref(s) === cur ? "on" : ""}" onclick="go('${s[1]}')">${esc(s[0])}</button>`).join("")}</nav>`;
}

/* ---------- stores: tick the stores included, pick where new records go ---------- */
let stSheet = null;
function storeChip() {
  const c = storeCfg(), n = c.on.length;
  return `<button class="storechip" onclick="stSheet=JSON.parse(JSON.stringify(storeCfg()));render()" aria-label="Stores">${esc(c.rec)}${n > 1 ? ` <small>+${n - 1}</small>` : ""}</button>`;
}
function storeSheetHTML() {
  if (!stSheet) return "";
  const all = (S.locations || []).filter(l => l.kind === "store" && l.active !== false);
  return `<div class="sheet-bg" onclick="if(event.target===this){stSheet=null;render()}"><div class="sheet stsheet"><h2>Stores</h2>
    <div class="tiny mut" style="margin-bottom:8px">Tick the stores to include. Pick one to record into.</div>
    <div class="list">${all.map(l => { const on = stSheet.on.includes(l.code); return `<div class="row"><label style="display:flex;gap:10px;align-items:center;flex:1"><input type="checkbox" ${on ? "checked" : ""} onchange="stTick('${l.code}',this.checked)" style="width:22px;height:22px"><span class="main"><span class="name">${esc(l.name)}</span><span class="meta"> ${esc(l.code)}</span></span></label>
      ${on ? `<button class="chip ${stSheet.rec === l.code ? "info" : ""}" onclick="stSheet.rec='${l.code}';render()">${stSheet.rec === l.code ? "recording here" : "record here"}</button>` : ""}</div>`; }).join("")}</div>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn primary" style="flex:1" onclick="stSave()">Done</button><button class="btn ghost" onclick="stSheet=null;render()">Cancel</button></div></div></div>`;
}
function stTick(code, on) { const s = stSheet; s.on = on ? [...new Set(s.on.concat(code))] : s.on.filter(c => c !== code); if (!s.on.length) s.on = [code]; if (!s.on.includes(s.rec)) s.rec = s.on[0]; render(); }
function stSave() {
  const before = curStore(); try { localStorage.setItem(STORE_KEY, JSON.stringify(stSheet)); } catch (e) { }
  stSheet = null;
  if (before !== curStore()) { toast("Switching to " + curStore() + "…"); setTimeout(() => location.reload(), 300); } else render();
}

/* ---------- "+" : record something from any screen ---------- */
let plusOpen = false;
function plusActions() {
  return [["Receive a delivery", "receive", "go('#/receive')"], ["Other purchase", "purchases", "puStart();go('#/purchases')"], ["Money move", "money", "go('#/money');setTimeout(()=>mvStart(),60)"],
    ["Cash count", "cash", "go('#/cash')"], ["Ticket (problem)", "report", "go('#/report/new')"], ["Task", "tasks", "go('#/task/new')"]].filter(a => canOpen(a[1]));
}
function plusHTML() {
  const acts = plusActions(); if (!acts.length) return "";
  return `<button class="fab" onclick="plusOpen=true;render()" aria-label="Record something">+</button>${plusOpen ? `<div class="sheet-bg" onclick="if(event.target===this){plusOpen=false;render()}"><div class="sheet"><h2>Record</h2><div class="list">${acts.map(a => `<button class="row tap" onclick="plusOpen=false;${a[2]}"><div class="main"><div class="name">${esc(a[0])}</div></div><span class="chev">${ic("chevron-right")}</span></button>`).join("")}</div></div></div>` : ""}`;
}

/* ---------- Settings (behind the name badge) ---------- */
function viewSettings() {
  const rows = SETUP.filter(s => canOpen(subHref(s))).map(s => `<button class="row tap" onclick="go('${s[1]}')"><div class="main"><div class="name">${esc(s[0])}</div><div class="meta">${esc(s[2])}</div></div><span class="chev">${ic("chevron-right")}</span></button>`).join("");
  const p = me();
  return shell("Settings", p ? esc(p.name || p.short) : "", `
    ${rows ? `<section class="card mg"><h3>Setup</h3><div class="list">${rows}</div></section>` : ""}
    <section class="card mg"><h3>This device</h3><div class="list">
      <button class="row tap" onclick="go('#/more')"><div class="main"><div class="name">Device, alerts & data health</div><div class="meta">theme, order alerts, sync state, sign out</div></div><span class="chev">${ic("chevron-right")}</span></button>
      <button class="row tap" onclick="stSheet=JSON.parse(JSON.stringify(storeCfg()));render()"><div class="main"><div class="name">Stores</div><div class="meta">${esc(storesOn().join(", "))} · recording into ${esc(curStore())}</div></div><span class="chev">${ic("chevron-right")}</span></button>
    </div></section>`, { back: "#/today" });
}

/* ---------- Users & roles (owners) ---------- */
let MEMBERS = (window.OS_LOADED && window.OS_LOADED.members) || [];
const ROLE_INFO = [["master", "Owner", "everything"], ["admin", "Office", "money, bills, stores, suppliers, recipes, tasks"], ["walk", "Morning run / HR", "the morning run, tasks, tickets, receiving at Head Office"],
  ["lead", "Store lead", "stock, ordering, recipes, cash count, tasks"], ["crew", "Crew", "count, receive, clean, tickets"], ["maint", "Maintenance", "tickets"]];
function viewUsers() {
  if (role() !== "master") return shell("Users & roles", "", `<div class="alert info">For the owners only.</div>`, { back: "#/settings" });
  const mine = (window.DB_USER || "").toLowerCase();
  const rows = MEMBERS.map(m => `<div class="row"><div class="main"><div class="name">${esc(m.email)}</div><div class="meta">${esc((ROLE_INFO.find(r => r[0] === m.role) || [0, m.role])[1])}${m.person ? " · " + esc(m.person) : ""}</div></div>
    ${m.email.toLowerCase() === mine ? `<span class="tiny mut">you</span>` : `<select class="in" style="width:auto" onchange="usRole('${esc(m.email)}',this.value)">${ROLE_INFO.map(r => `<option value="${r[0]}" ${m.role === r[0] ? "selected" : ""}>${r[1]}</option>`).join("")}</select>`}</div>`).join("");
  return shell("Users & roles", "who has which login", `
    <section class="card"><div class="list">${rows || `<div class="mut small">No members loaded.</div>`}</div></section>
    <section class="card"><h2>What each role sees</h2><div class="list">${ROLE_INFO.map(r => `<div class="row"><div class="main"><div class="name">${r[1]}</div><div class="meta">${r[2]}</div></div></div>`).join("")}</div>
      <div class="tiny mut" style="margin-top:8px">A new login is created by Stefan with Claude (it needs an email invite). Roles change here at once.</div></section>`, { back: "#/settings" });
}
function usRole(email, r) {
  if (!confirm(`Change ${email} to ${(ROLE_INFO.find(x => x[0] === r) || [0, r])[1]}?`)) { render(); return; }
  supQueue("member_role", { email, role: r }); const m = MEMBERS.find(x => x.email === email); if (m) m.role = r; toast("Role changed."); render();
}

/* ---------- Order rules (owners) ---------- */
function viewRules() {
  const v = k => { const x = OS_SETTINGS[k]; return x == null ? "" : String(x).replace(/"/g, ""); };
  return shell("Order rules", "how the Order today list and approvals work", `
    <section class="card">
      <div class="field"><label>Orders above ₱ go to Mike for approval</label><input class="in num" id="r-ap" inputmode="decimal" placeholder="no limit set" value="${esc(v("approval_peso"))}"></div>
      <div class="field"><label>Safety days (extra days of stock on top of delivery time)</label><input class="in num" id="r-sd" inputmode="numeric" value="${esc(v("default_safety_days"))}"></div>
      <div class="field"><label>Days one order should cover</label><input class="in num" id="r-oc" inputmode="numeric" value="${esc(v("order_cover_days"))}"></div>
      <button class="btn primary full" onclick="ruSave()">Save rules</button>
      <div class="tiny mut" style="margin-top:8px">Imported and Manila suppliers marked "Mike approves" always wait for him, whatever the amount.</div></section>`, { back: "#/settings" });
}
function ruSave() {
  const g = id => { const t = (document.getElementById(id).value || "").trim(); return t === "" ? null : +t; };
  const rec = { approval_peso: g("r-ap"), default_safety_days: g("r-sd"), order_cover_days: g("r-oc") };
  if (Object.values(rec).some(x => x != null && !(x >= 0))) return toast("Numbers only.");
  supQueue("setting", rec); Object.assign(OS_SETTINGS, rec); toast("Rules saved."); render();
}
