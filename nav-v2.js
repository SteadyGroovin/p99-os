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
const officerLogin = () => window.DB_ROLE === "officer";   /* v0.23 (migration 036): Hannah, Admin Officer. Inventory, buying and the team for every store and D'Mall Storage; Papers; no money, no sales */

/* v0.17 (Stefan: "the way Zoho Inventory has its menu navigation is probably better"): Home + three pinned modules + More.
   More lists every module in groups (like Zoho's More Modules); "Customize" picks the three on the bottom bar. Inside a group a row of sibling shortcuts stays. */
/* v0.19.6 (Stefan: "consider improving the list order"): groups follow the day and the flow of money — what comes in (Till), what is on the shelf,
   what is bought (order → approve → bills), the money, the team; the catalogue is set up once and sits last. Settings are behind the account button only. */
const MODULES = [
  ["sales", "Sales", "#/sales", "cash", "Till"], ["cash", "Cash count", "#/cash", "cash", "Till"], ["walk", "Morning run", "#/walk", "sun", "Till"],
  ["stock", "Stock", "#/stock", "grid", "Inventory"], ["count", "Count", "#/count", "grid", "Inventory"], ["receive", "Receive", "#/receive", "box", "Inventory"], ["transfers", "Transfers", "#/transfers", "box", "Inventory"], ["variance", "Variance", "#/variance", "grid", "Inventory"], ["minimums", "Minimums", "#/minimums", "grid", "Inventory"],
  ["order", "Order", "#/order", "coins", "Buying"], ["approve", "Approve", "#/approve", "check", "Buying"], ["bills", "Bills", "#/bills", "coins", "Buying"], ["purchases", "Purchases", "#/purchases", "coins", "Buying"], ["suppliers", "Suppliers", "#/suppliers", "coins", "Buying"],
  ["overview", "Overview", "#/overview", "finance", "Money"], ["money", "Funds", "#/money", "finance", "Money"], ["finance", "P&L", "#/finance", "finance", "Money"], ["books", "Month close", "#/books", "finance", "Money"], ["accounts", "Accounts", "#/accounts", "finance", "Money"],
  ["tasks", "Tasks", "#/tasks", "list", "Team"], ["questions", "Questions", "#/questions", "list", "Team"], ["report", "Tickets", "#/report", "alert", "Team"], ["clean", "Clean", "#/clean", "check", "Team"], ["logins", "Logins", "#/logins", "dots", "Team"],
  ["papers", "Papers", "#/papers", "list", "Office"],
  ["items", "Items", "#/items", "box", "Catalogue"], ["recipes", "Recipes", "#/recipes", "list", "Catalogue"], ["sizes", "Pack sizes", "#/sizes", "box", "Catalogue"],
  ["users", "Users", "#/users", "dots", "Settings"], ["stores", "Stores", "#/stores", "dots", "Settings"], ["rules", "Rules", "#/rules", "dots", "Settings"], ["more", "Device", "#/more", "dots", "Settings"],
];
const GROUPS = [...new Set(MODULES.map(m => m[4]))];
const MENU_GROUPS = GROUPS.filter(g => g !== "Settings");   /* the menu and More; Settings open from the account button (top right) */
const SEG_MODULE = { item: "items", recipe: "recipes", receipts: "receive", transfer: "transfers", task: "tasks", supplier: "suppliers" };
const moduleOf = seg => SEG_MODULE[seg] || seg;
const modsFor = () => MODULES.filter(m => canOpen(m[0]));
const SETUP = MODULES.filter(m => ["users", "stores", "rules"].includes(m[0]))   /* v0.19.6: nothing that is already in the menu (Stefan: "that also shouldn't be double") */.map(m => [m[1], m[2], ({ users: "who has which login and what they see", stores: "where stock is sent and received", suppliers: "terms, delivery days, what we buy, prices", recipes: "what each pizza, slice and batch uses", sizes: "how much is inside a can, pack or box", accounts: "expense categories, as in the accounting book", books: "what each fund held, lock a finished month", rules: "₱ limit for Mike's approval, safety days" })[m[0]]]);
const PIN_KEY = "rocketos_pins";
const PIN_DEFAULT = { owner: ["overview"], master: ["sales", "stock", "money"], finance: ["receive", "bills", "money"], admin: ["bills", "money", "tasks"], officer: ["walk", "stock", "tasks"], lead: ["tasks", "count", "order"], walk: ["tasks", "report", "receive"], crew: ["count", "receive", "clean"] };
function pins() {
  let p = null; try { p = JSON.parse(localStorage.getItem(PIN_KEY) || "null"); } catch (e) { }
  const r = financeLogin() ? "finance" : officeLogin() ? "admin" : officerLogin() ? "officer" : role(); const ok = modsFor().map(m => m[0]);
  const list = (Array.isArray(p) && p.length ? p : PIN_DEFAULT[r] || PIN_DEFAULT.crew).filter(id => ok.includes(id));
  for (const id of ok) { if (list.length >= 3) break; if (!list.includes(id)) list.push(id); }
  return list.slice(0, 3);
}
const homeHref = () => role() === "owner" ? "#/overview" : role() === "walk" && !officeLogin() ? "#/walk" : "#/today";   /* v0.37: Mike opens on his overview */
const modIcon = id => (MODULES.find(m => m[0] === id) || [])[3] || "dots";
const modLabel = id => (MODULES.find(m => m[0] === id) || [])[1] || id;
const modShort = id => modLabel(id);   /* Stefan: short names everywhere */

/* the one place that says who may open what (the database refuses the data anyway) */
function canOpen(s0) {
  const r = role(), adm = officeLogin(), fin = financeLogin(), m = r === "master";
  /* v0.22 (Stefan, 15 Nov, Burger Kong access for Cath): the store lead sees tasks, inventory (stock, count, receive) and ordering for her own store */
  /* v0.23 (Stefan, 15 Nov: Hannah gets inventory, buying and the team): every store and D'Mall Storage, the all-stores stock, Papers. v0.23.2 (16 Nov): plus the morning run and the cash count (migration 040). Not sales, funds, bills, approving or roles. v0.23.3 (16 Nov, migration 043): plus recipes */
  if (r === "owner") return ["", "overview", "more", "settings", "who", "password", "modules"].includes(s0);   /* v0.37 (migration 062): Mike watches, one read-only page */
  if (s0 === "overview") return m;
  if (s0 === "logins") return m || r === "officer";   /* v0.30: Hannah creates and resets the store logins (edge function store-login) */
  if (r === "officer") return ["", "today", "walk", "cash", "stock", "stock-all", "count", "receive", "receipts", "transfers", "transfer", "variance", "minimums", "items", "item", "sizes", "order", "suppliers", "supplier", "recipes", "recipe", "tasks", "task", "report", "clean", "papers", "questions", "more", "settings", "who", "password", "modules"].includes(s0);
  if (s0 === "questions") return m || adm;   /* v0.28 (migration 052): open questions for the officer, the office and the owners */
  if (s0 === "papers") return m || adm;   /* the office (admin, finance) and the owners */
  if (r === "lead") return ["", "today", "tasks", "task", "stock", "count", "receive", "receipts", "items", "item", "order", "minimums", "sizes", "suppliers", "supplier", "more", "settings", "who", "password", "modules"].includes(s0);
  if (s0 === "minimums") return m;   /* v0.36 (migration 061): the lead, the admin officer and the owners set "order below" / "fill up to" */
  if (["sales", "finance", "approve", "users", "rules"].includes(s0)) return m;
  if (s0 === "books") return m || (adm && !fin);                 /* month close and opening balances: not Finance (Stefan, 2026-11-08) */
  if (["bills", "money", "stores", "accounts"].includes(s0)) return m || adm;
  if (s0 === "purchases") return m || adm || r === "lead";
  if (s0 === "order") return m || r === "lead";                  /* v0.37: Hannah (officer list above) and Stefan send; the lead sees the list and tells Hannah. Not Cherry */
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
    MENU_GROUPS.map(g => { const ms = mods.filter(x => x[4] === g); if (!ms.length) return ""; return `<div class="sgroup">${esc(g)}</div>` + ms.map(x => `<button class="${m === x[0] ? "on" : ""}" onclick="go('${x[2]}')">${ic(ICON[x[3]] || ICON.dots, "sm")}<span class="sl">${esc(x[1])}</span></button>`).join(""); }).join("");
}
function subnavHTML(seg) {   /* sibling shortcuts inside a group. Not shown since v0.19.2 (Stefan, 2026-11-13: "remove the top part completely"); kept in case it comes back */
  const m = moduleOf(seg), me1 = MODULES.find(x => x[0] === m); if (!me1) return "";
  const sibs = modsFor().filter(x => x[4] === me1[4]); if (sibs.length < 2) return "";
  return `<nav class="subnav" aria-label="${esc(me1[4])}">${sibs.map(x => `<button class="${x[0] === m ? "on" : ""}" onclick="go('${x[2]}')">${esc(modShort(x[0]))}</button>`).join("")}</nav>`;
}
let modCustom = false;
function viewModules() {
  const ps = pins(), mods = modsFor();
  const groups = MENU_GROUPS.map(g => { const ms = mods.filter(x => x[4] === g); if (!ms.length) return "";
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
  if (canOpen("order")) cards.push(["Items to order", REORDER.filter(r => r.order_now && !odStale(r)).length + (REORDER.some(r => r.order_now && odStale(r)) ? `<div class="tiny mut">+ ${REORDER.filter(r => r.order_now && odStale(r)).length} to count first</div>` : ""), "#/order"]);
  if (canOpen("receive") && typeof skDesk === "function" && skDesk()) cards.push(["Receipts to itemise", skToItemise().length, "#/receive"]);   /* v0.29 quick receipt */
  if (canOpen("bills")) cards.push(["Bills open", (typeof bpRows === "function" ? bpRows() : MONEY.filter(m => m.mode === "bill")).filter(m => !m.paid_on).length, "#/bills"]);   /* v0.35: every store once os_bills_office has loaded */
  if (role() === "master" && typeof bpToRelease === "function") { const tr = bpToRelease(); cards.push(["Bills to release", `${tr.length}<div class="tiny mut">${peso(bpSum(tr))}</div>`, "#/bills"]); }   /* v0.37 */
  if (financeLogin() && typeof bpToPay === "function") { const tp = bpToPay(); cards.push(["Bills to pay", `${tp.length}<div class="tiny mut">${peso(bpSum(tp))}</div>`, "#/bills"]); }
  if (canOpen("bills") && typeof bpToCheck === "function") { if (typeof bpLoad === "function" && !BP.all) setTimeout(() => bpLoad(), 0); const tc = bpToCheck(); cards.push(["Bills to check", `${tc.length}<div class="tiny mut">${peso(tc.reduce((a, m) => a + (+m.total || 0), 0))}</div>`, "#/bills"]); }   /* v0.34 (migration 059) */
  if (canOpen("sizes")) cards.push(["Pack sizes missing", szMissing(), "#/sizes"]);
  if (canOpen("recipes")) cards.push(["Recipes not confirmed", (typeof RECIPES !== "undefined" ? RECIPES : []).filter(r => !r.confirmed).length, "#/recipes"]);
  if (canOpen("questions") && typeof qLoad === "function") { qLoad(); cards.push(["Questions to answer", QQ.state === "ok" ? qOpenN() : "…", "#/questions"]); }   /* v0.28 */
  if (canOpen("report")) cards.push(["Tickets open", S.tickets.filter(t => t.status !== "done").length, "#/report"]);
  return `${typeof pushNudge === "function" ? pushNudge() : ""}<section class="card qa"><h3>Quick actions</h3><div class="qa-row">${acts.map(a => `<button onclick="${a[2]}"><span class="qa-ic">${ic(ICON[modIcon(a[1])] || ICON.dots)}</span><span>${esc(a[0])}</span></button>`).join("")}</div></section>
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
  /* v0.23.6 (migration 046): D'Mall Storage and Head Office have their own stock lists; the owners, the office and the Admin officer can record into them */
  const all = (S.locations || []).filter(l => l.active !== false && (l.kind === "store" || (role() !== "lead" && ["storage", "office"].includes(l.kind))));
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
function viewSettings() {   /* v0.19.6: the whole settings section, reached from the account button; one line per entry */
  const p = me(); const rows = SETUP.filter(s => canOpen(subHref(s))).map(s => [s[0], s[2], `go('${s[1]}')`])
    .concat([["Stores shown", `${storesOn().join(", ")} · recording into ${curStore()}`, "stSheet=JSON.parse(JSON.stringify(storeCfg()));render()"], ["Device", "theme, order alerts, sync state, sign out", "go('#/more')"], ["Password", "change the password of this login", "go('#/password')"]]);
  /* v0.27.1 (Stefan, 16 Nov: "the UI looks very small … very, very tiny"): big tappable rows instead of the compact item table */
  return shell("Settings", p ? esc(p.name || p.short) : "", `<section class="card flinks">${rows.map(([n, m, h]) => `<button class="row tap" onclick="${h}"><div class="main"><div class="name">${esc(n)}</div><div class="meta">${esc(m)}</div></div><span class="chev">${ic("chevron-right")}</span></button>`).join("")}</section>`, { back: "#/today" });
}

/* ---------- Users & roles (owners) ---------- */
let MEMBERS = (window.OS_LOADED && window.OS_LOADED.members) || [];
const ROLE_INFO = [["master", "Owner", "everything"], ["finance", "Finance", "morning run, receiving, purchases, bills, funds, ordering, suppliers, cash count, papers"], ["admin", "Office", "money, bills, stores, suppliers, recipes, tasks, papers"], ["officer", "Admin officer", "morning run, cash count, stock, counts, transfers, receiving, ordering, items, suppliers and recipes (edit), own tasks, papers, every store"], ["walk", "Morning run / HR", "the morning run, tasks, tickets, receiving at Head Office"],
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
      <div class="field"><label>Orders above ₱ go to Stefan for approval</label><input class="in num" id="r-ap" inputmode="decimal" placeholder="no limit set" value="${esc(v("approval_peso"))}"></div>
      <div class="field"><label>Safety days (extra days of stock on top of delivery time)</label><input class="in num" id="r-sd" inputmode="numeric" value="${esc(v("default_safety_days"))}"></div>
      <div class="field"><label>Days one order should cover</label><input class="in num" id="r-oc" inputmode="numeric" value="${esc(v("order_cover_days"))}"></div>
      <button class="btn primary full" onclick="ruSave()">Save rules</button>
      <div class="tiny mut" style="margin-top:8px">Suppliers marked "Stefan approves" always wait for him, whatever the amount. Empty limit: orders go straight out. Hannah and Stefan place the orders.</div></section>`, { back: "#/settings" });
}
function ruSave() {
  const g = id => { const t = (document.getElementById(id).value || "").trim(); return t === "" ? null : +t; };
  const rec = { approval_peso: g("r-ap"), default_safety_days: g("r-sd"), order_cover_days: g("r-oc") };
  if (Object.values(rec).some(x => x != null && !(x >= 0))) return toast("Numbers only.");
  supQueue("setting", rec); Object.assign(OS_SETTINGS, rec); toast("Rules saved."); render();
}

/* ---------- Logins (v0.30, 2026-11-23): the Admin officer and the owners create and reset STORE logins ----------
   Stefan: "Hannah is setting up the accounts and the app with the stores." The browser never creates users: the edge
   function store-login does (service role), refuses anything but store logins, and returns a password shown once. */
const LG = { state: "idle", rows: [], stores: {}, err: null, busy: false, form: { email: "", store: "", name: "" }, shown: null };
const LG_STORES = { P99: "Pizza 99", BK: "Burger Kong", DC: "Dragon Crepe", MCC: "My Crepes Cafe", MCBC: "MyCrepes Beach Club" };
async function lgCall(body) {
  const { data, error } = await sb.functions.invoke("store-login", { body });
  if (error) { let m = error.message; try { const j = await error.context.json(); if (j && j.error) m = j.error; } catch (e) { } return { ok: false, error: m }; }
  return data || { ok: false, error: "no answer" };
}
async function lgLoad() { LG.state = "loading"; const r = await lgCall({ action: "list" }); if (r.ok) { LG.rows = r.logins || []; LG.state = "ok"; } else { LG.state = "err"; LG.err = r.error; } if (location.hash.startsWith("#/logins")) render(); }
async function lgCreate() {
  const f = LG.form; if (LG.busy) return; if (!f.email || !f.store) { toast("E-mail and store first."); return; }
  LG.busy = true; render(); const r = await lgCall({ action: "create", email: f.email, store: f.store, name: f.name }); LG.busy = false;
  if (r.ok) { LG.shown = { email: r.email, store: r.store, password: r.password, kind: "new" }; LG.form = { email: "", store: "", name: "" }; lgLoad(); } else toast(r.error || "Could not create the login.");
  render(); }
async function lgReset(email) {
  if (!confirm("Make a new password for " + email + "? The old one stops working.")) return;
  const r = await lgCall({ action: "reset", email }); if (r.ok) { LG.shown = { email, password: r.password, kind: "reset" }; render(); } else toast(r.error || "Could not reset."); }
function viewLogins() {
  if (!(role() === "master" || (typeof officerLogin === "function" && officerLogin()))) return shell("Logins", "", `<div class="alert info">For the Admin officer and the owners.</div>`, { back: "#/today" });
  if (LG.state === "idle") lgLoad();
  const link = location.origin + location.pathname.replace(/index\.html$/, "") + "?pw";
  const shown = LG.shown ? `<section class="card"><h2>${LG.shown.kind === "new" ? "Login created" : "New password"}</h2>
      <div class="list"><div class="row"><div class="main"><div class="meta">E-mail</div><div class="name">${esc(LG.shown.email)}</div></div></div>
      <div class="row"><div class="main"><div class="meta">Password</div><div class="name num" style="font-size:22px;letter-spacing:.04em">${esc(LG.shown.password)}</div></div></div></div>
      <div class="tiny mut" style="margin-top:8px">Shown only once. Give it to the store now, in person or by message. The store opens <b>${esc(link)}</b>, signs in with this e-mail and password, then adds the app to the home screen.</div>
      <button class="btn" style="margin-top:8px" onclick="LG.shown=null;render()">Done</button></section>` : "";
  const st = LG.stores && Object.keys(LG.stores).length ? LG.stores : LG_STORES;
  const form = `<section class="card"><h2>New store login</h2>
      <div class="field"><label>Store</label><select class="in" onchange="LG.form.store=this.value"><option value="">— choose —</option>${Object.entries(st).map(([c, n]) => `<option value="${c}" ${LG.form.store === c ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
      <div class="field"><label>E-mail the store uses</label><input class="in" type="email" placeholder="store e-mail" value="${esc(LG.form.email)}" oninput="LG.form.email=this.value.trim()"></div>
      <div class="field"><label>Name on the login (optional)</label><input class="in" placeholder="e.g. MCC store" value="${esc(LG.form.name)}" oninput="LG.form.name=this.value"></div>
      <button class="btn primary full" ${LG.busy ? "disabled" : ""} onclick="lgCreate()">${LG.busy ? "Creating…" : "Create login"}</button>
      <div class="tiny mut" style="margin-top:6px">A store login sees only its own store: tasks, stock, count, receive and ordering. No sales, no money.</div></section>`;
  const byStore = {}; LG.rows.forEach(r => { (byStore[r.store || "?"] = byStore[r.store || "?"] || []).push(r); });
  const list = LG.state === "loading" ? `<div class="mut small">Loading…</div>` : LG.state === "err" ? `<div class="alert bad">${esc(LG.err || "Could not load the logins.")}</div>`
    : Object.keys(st).map(c => { const rs = byStore[c] || []; return `<div class="row"><div class="main"><div class="name">${esc(st[c])}</div><div class="meta">${rs.length ? rs.map(r => `${esc(r.email)} · ${r.last_sign_in ? "last in " + esc(dayName(String(r.last_sign_in).slice(0, 10))) : "never signed in"}`).join("<br>") : `<span class="band-warn">no login yet</span>`}</div></div>${rs.map(r => `<button class="btn ghost" onclick="lgReset(${esc(JSON.stringify(r.email))})">New password</button>`).join("")}</div>`; }).join("");
  const missing = Object.keys(st).filter(c => !(byStore[c] || []).length).length;
  return shell("Logins", LG.state === "ok" ? (missing ? `${missing} store${missing === 1 ? "" : "s"} without a login` : "every store has a login") : "store logins", `${shown}
    <section class="card"><h2>Stores</h2><div class="list">${list}</div></section>${form}`, { back: "#/today" });
}
