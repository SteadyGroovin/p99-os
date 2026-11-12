/* nav-v2.js — v0.16 (2026-11-08): the app in areas, like our own Zoho (Stefan: "most of the relevant fields under More is not practical").
   Bottom bar = the areas a login may open: Today · Sales · Stock · Money · Ops. Each area has a row of sub-tabs at the top.
   Settings sit behind the name badge (top right). A "+" button records the common things from any screen.
   Stores: tick which stores are included; one of them is where new records go ("Record into"). Changing it reloads the app.
   Loaded before app.js; app.js's shell() and router use these helpers. */
const STORE_KEY = "rocketos_stores";
function storeCfg() { let c = null; try { c = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) { } return c && c.rec ? c : { on: ["P99"], rec: "P99" }; }
const curStore = () => storeCfg().rec;
const storesOn = () => storeCfg().on;
const officeLogin = () => ["admin", "finance"].includes(window.DB_ROLE);   /* role() maps admin and finance to walk (the morning-run screens); money screens need the raw role */
const financeLogin = () => window.DB_ROLE === "finance";   /* v0.18 (migration 025): Cherry. The office screens plus ordering, receiving at any place and the cash count; no recipes, no month close */
const moneyOK = () => role() === "master" || officeLogin();

/* v0.17 (Stefan: "the way Zoho Inventory has its menu navigation is probably better"): Home + three pinned modules + More.
   More lists every module in groups (like Zoho's More Modules); "Customize" picks the three on the bottom bar. Inside a group a row of sibling shortcuts stays. */
const MODULES = [
  ["items", "Items", "#/items", "box", "Items"], ["recipes", "Recipes", "#/recipes", "list", "Items"], ["sizes", "Pack sizes", "#/sizes", "box", "Items"],
  ["stock", "Stock", "#/stock", "grid", "Inventory"], ["count", "Count", "#/count", "grid", "Inventory"], ["receive", "Receive", "#/receive", "box", "Inventory"], ["transfers", "Transfers", "#/transfers", "box", "Inventory"], ["variance", "Variance", "#/variance", "grid", "Inventory"],
  ["suppliers", "Suppliers", "#/suppliers", "coins", "Purchases"], ["order", "Order", "#/order", "coins", "Purchases"], ["approve", "Approve", "#/approve", "check", "Purchases"], ["bills", "Bills", "#/bills", "coins", "Purchases"], ["purchases", "Purchases", "#/purchases", "coins", "Purchases"],
  ["sales", "Sales", "#/sales", "cash", "Sales"], ["cash", "Cash count", "#/cash", "cash", "Sales"], ["walk", "Morning run", "#/walk", "sun", "Sales"],
  ["money", "Funds", "#/money", "finance", "Money"], ["finance", "P&L", "#/finance", "finance", "Money"], ["accounts", "Accounts", "#/accounts", "finance", "Money"], ["books", "Month close", "#/books", "finance", "Money"],
  ["tasks", "Tasks", "#/tasks", "list", "Operations"], ["report", "Tickets", "#/report", "alert", "Operations"], ["clean", "Clean", "#/clean", "check", "Operations"],
  ["users", "Users", "#/users", "dots", "Settings"], ["stores", "Stores", "#/stores", "dots", "Settings"], ["rules", "Rules", "#/rules", "dots", "Settings"], ["more", "Device", "#/more", "dots", "Settings"],
];
const GROUPS = [...new Set(MODULES.map(m => m[4]))];
const SEG_MODULE = { item: "items", recipe: "recipes", receipts: "receive", transfer: "transfers", task: "tasks", supplier: "suppliers" };
const moduleOf = seg => SEG_MODULE[seg] || seg;
const modsFor = () => MODULES.filter(m => canOpen(m[0]));
const SETUP = MODULES.filter(m => ["users", "stores", "suppliers", "recipes", "sizes", "accounts", "books", "rules"].includes(m[0])).map(m => [m[1], m[2], ({ users: "who has which login and what they see", stores: "where stock is sent and received", suppliers: "terms, delivery days, what we buy, prices", recipes: "what each pizza, slice and batch uses", sizes: "how much is inside a can, pack or box", accounts: "expense categories, as in the accounting book", books: "what each fund held, lock a finished month", rules: "₱ limit for Mike's approval, safety days" })[m[0]]]);
const PIN_KEY = "rocketos_pins";
const PIN_DEFAULT = { master: ["sales", "stock", "money"], finance: ["receive", "bills", "money"], admin: ["bills", "money", "tasks"], lead: ["receive", "count", "order"], walk: ["tasks", "report", "receive"], crew: ["count", "receive", "clean"] };
function pins() {
  let p = null; try { p = JSON.parse(localStorage.getItem(PIN_KEY) || "null"); } catch (e) { }
  const r = financeLogin() ? "finance" : officeLogin() ? "admin" : role(); const ok = modsFor().map(m => m[0]);
  const list = (Array.isArray(p) && p.length ? p : PIN_DEFAULT[r] || PIN_DEFAULT.crew).filter(id => ok.includes(id));
  for (const id of ok) { if (list.length >= 3) break; if (!list.includes(id)) list.push(id); }
  return list.slice(0, 3);
}
const homeHref = () => role() === "walk" && !officeLogin() ? "#/walk" : "#/today";
const modIcon = id => (MODULES.find(m => m[0] === id) || [])[3] || "dots";
const modLabel = id => (MODULES.find(m => m[0] === id) || [])[1] || id;
const modShort = id => modLabel(id);   /* Stefan: short names everywhere */

/* the one place that says who may open what (the database refuses the data anyway) */
function canOpen(s0) {
  const r = role(), adm = officeLogin(), fin = financeLogin(), m = r === "master";
  if (["sales", "finance", "approve", "users", "rules"].includes(s0)) return m;
  if (s0 === "books") return m || (adm && !fin);                 /* month close and opening balances: not Finance (Stefan, 2026-11-08) */
  if (["bills", "money", "stores", "accounts"].includes(s0)) return m || adm;
  if (s0 === "purchases") return m || adm || r === "lead";
  if (s0 === "order") return m || r === "lead" || fin;           /* Cherry and the store lead order; Mike approves above the limit */
  if (s0 === "sizes") return m || r === "lead";
  if (["recipes", "recipe"].includes(s0)) return m || (adm && !fin) || r === "lead";
  if (["suppliers", "supplier"].includes(s0)) return m || adm || r === "lead";
  if (s0 === "walk") return m || r === "walk";               /* the morning run: Cherry, the office, the owners */
  if (r === "walk") return adm ? true : ["walk", "tasks", "task", "report", "more", "settings", "who", "password", "receive", "transfers", "transfer", "modules", ""].includes(s0);
  return true;
}
function tabbarHTML(seg) {
  const ps = pins(), m = moduleOf(seg), isHome = homeHref() === "#/" + seg || (seg === "today") || (!seg);
  const grp = (MODULES.find(z => z[0] === m) || [])[4]; const sameGrp = ps.find(id => (MODULES.find(z => z[0] === id) || [])[4] === grp);
  const cur = isHome ? "home" : ps.includes(m) ? m : sameGrp || "more";   /* a module of the same group as a pin lights that pin */
  const openT = S.tickets.filter(t => t.status !== "done").length;
  const btn = (id, label, icon, href) => `<button class="${cur === id ? "on" : ""}" onclick="go('${href}')" aria-label="${label}">${id === "report" && openT ? `<span class="bdg">${openT}</span>` : ""}${ic(ICON[icon] || ICON.dots)}${label}</button>`;
  return btn("home", "Home", "home", homeHref()) + ps.map(id => btn(id, modShort(id), modIcon(id), "#/" + id)).join("") + btn("more", "More", "dots", "#/modules");
}
function sidebarHTML(seg) {   /* tablet and laptop: the whole menu, like Zoho's left navigation */
  const m = moduleOf(seg), mods = modsFor();
  return `<button class="${seg === "today" || !seg ? "on" : ""}" onclick="go('${homeHref()}')">${ic(ICON.home, "sm")}<span class="sl">Home</span></button>` +
    GROUPS.map(g => { const ms = mods.filter(x => x[4] === g); if (!ms.length) return ""; return `<div class="sgroup">${esc(g)}</div>` + ms.map(x => `<button class="${m === x[0] ? "on" : ""}" onclick="go('${x[2]}')">${ic(ICON[x[3]] || ICON.dots, "sm")}<span class="sl">${esc(x[1])}</span></button>`).join(""); }).join("");
}
function subnavHTML(seg) {   /* sibling shortcuts inside a group. Not shown since v0.19.2 (Stefan, 2026-11-13: "remove the top part completely"); kept in case it comes back */
  const m = moduleOf(seg), me1 = MODULES.find(x => x[0] === m); if (!me1) return "";
  const sibs = modsFor().filter(x => x[4] === me1[4]); if (sibs.length < 2) return "";
  return `<nav class="subnav" aria-label="${esc(me1[4])}">${sibs.map(x => `<button class="${x[0] === m ? "on" : ""}" onclick="go('${x[2]}')">${esc(modShort(x[0]))}</button>`).join("")}</nav>`;
}
let modCustom = false;
function viewModules() {
  const ps = pins(), mods = modsFor();
  const groups = GROUPS.map(g => { const ms = mods.filter(x => x[4] === g); if (!ms.length) return "";
    return `<section class="card mg"><h3>${esc(g)}</h3><div class="list">${ms.map(x => modCustom
      ? `<button class="row tap" onclick="pinToggle('${x[0]}')"><div class="main"><div class="name">${esc(x[1])}</div></div>${ps.includes(x[0]) ? chip("info", "on the bar") : `<span class="tiny mut">add</span>`}</button>`
      : `<button class="row tap" onclick="go('${x[2]}')"><div class="main"><div class="name">${esc(x[1])}</div></div><span class="chev">${ic("chevron-right")}</span></button>`).join("")}</div></section>`; }).join("");
  return shell("More", modCustom ? "tap three modules for the bottom bar" : "", `
    <div style="display:flex;justify-content:flex-end;margin-bottom:8px"><button class="btn ${modCustom ? "primary" : ""} sm" onclick="modCustom=!modCustom;render()">${modCustom ? "Done" : "Customize"}</button></div>
    ${modCustom ? `<div class="alert info">On the bar now: ${ps.map(modLabel).map(esc).join(", ")}. Tap a module to put it on the bar; the oldest one makes room.</div>` : ""}
    ${groups}`);
}
function pinToggle(id) {
  let ps = pins(); if (ps.includes(id)) { if (ps.length <= 1) return; ps = ps.filter(x => x !== id); } else { ps = ps.concat(id); if (ps.length > 3) ps = ps.slice(-3); }
  try { localStorage.setItem(PIN_KEY, JSON.stringify(ps)); } catch (e) { } render();
}

/* ---------- Home: quick actions and what needs attention (like Zoho's dashboard) ---------- */
function homeStripHTML() {
  const acts = plusActions();
  const cards = [];
  if (canOpen("approve")) { const n = (S.orders || []).filter(o => o.status === "requested" && o.approval_needed).length; cards.push(["Orders to approve", n, "#/approve"]); }
  if (canOpen("order")) cards.push(["Items to order", REORDER.filter(r => r.order_now).length, "#/order"]);
  if (canOpen("bills")) cards.push(["Bills open", MONEY.filter(m => m.mode === "bill" && !m.paid_on).length, "#/bills"]);
  if (canOpen("sizes")) cards.push(["Pack sizes missing", ITEMS.filter(i => i.sizeUnknown).length, "#/sizes"]);
  if (canOpen("recipes")) cards.push(["Recipes not confirmed", (typeof RECIPES !== "undefined" ? RECIPES : []).filter(r => !r.confirmed).length, "#/recipes"]);
  cards.push(["Tickets open", S.tickets.filter(t => t.status !== "done").length, "#/report"]);
  return `<section class="card qa"><h3>Quick actions</h3><div class="qa-row">${acts.map(a => `<button onclick="${a[2]}"><span class="qa-ic">${ic(ICON[modIcon(a[1])] || ICON.dots)}</span><span>${esc(a[0])}</span></button>`).join("")}</div></section>
    <div class="grid2 hcards">${cards.map(c => `<button class="card tap hcard" onclick="go('${c[2]}')"><div class="lab">${esc(c[0])}</div><div class="val num">${c[1]}</div></button>`).join("")}</div>`;
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
const subHref = s => s[1].split("/")[1];
function plusActions() {
  return [["Receive", "receive", "go('#/receive')"], ["Purchase", "purchases", "puStart();go('#/purchases')"], ["Money move", "money", "go('#/money');setTimeout(()=>mvStart(),60)"],
    ["Cash count", "cash", "go('#/cash')"], ["Ticket", "report", "go('#/report/new')"], ["Task", "tasks", "go('#/task/new')"]].filter(a => canOpen(a[1]));
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
const ROLE_INFO = [["master", "Owner", "everything"], ["finance", "Finance", "morning run, receiving, purchases, bills, funds, ordering, suppliers, cash count"], ["admin", "Office", "money, bills, stores, suppliers, recipes, tasks"], ["walk", "Morning run / HR", "the morning run, tasks, tickets, receiving at Head Office"],
  ["lead", "Store lead", "stock, ordering, recipes, cash count, tasks"], ["crew", "Crew", "count, receive, clean, tickets"], ["maint", "Maintenance", "tickets"]];
function viewUsers() {
  if (role() !== "master") return shell("Users & roles", "", `<div class="alert info">For the owners only.</div>`, { back: "#/settings" });
  const mine = (window.DB_USER || "").toLowerCase();
  const rows = MEMBERS.map(m => `<div class="row"><div class="main"><div class="name">${esc(m.email)}</div><div class="meta">${esc((ROLE_INFO.find(r => r[0] === m.role) || [0, m.role])[1])}${m.person ? " · " + esc(m.person) : ""}</div></div>
    ${m.email.toLowerCase() === mine ? `<span class="tiny mut">you</span>` : `<select class="in" style="width:auto" onchange="usRole('${esc(m.email)}',this.value)">${ROLE_INFO.map(r => `<option value="${r[0]}" ${m.role === r[0] ? "selected" : ""}>${r[1]}</option>`).join("")}</select>`}</div>`).join("");
  return shell("Users", "who has which login", `
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
  return shell("Rules", "how the Order today list and approvals work", `
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
