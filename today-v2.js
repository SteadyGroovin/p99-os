/* today-v2.js — Today (a morning briefing) and More (grouped, with data health). 2026-10-28.
   Patterns: Square's dashboard summary (one headline number, change vs a comparable day), Toast's advice of a few decision-ready reports,
   Lightspeed-style attention lists. Everything shown is computed from data that exists; nothing is invented, and a missing source says so.
   The old crew view stays in app.js as viewToday_v1 (one-person mode means every name gets this briefing). */

const usualWeekday = (day, n = 8) => { const same = []; for (let k = 1; same.length < n && k <= 80; k++) { const x = addDays(day, -7 * k); if (SD[x]) same.push(x); } return same.length ? { avg: sum(same.map(x => SD[x].total)) / same.length, n: same.length, tk: sum(same.map(x => SD[x].tickets)) / same.length, box: sum(same.map(x => SD[x].cashbox_opens || 0)) / same.length } : null; };
const boxUsual = (day, n = 14) => { const ds = []; for (let k = 1; ds.length < n && k <= 60; k++) { const x = addDays(day, -k); if (SD[x]) ds.push(x); } return ds.length ? sum(ds.map(x => SD[x].cashbox_opens || 0)) / ds.length : null; };
const greet = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };

function attnItem(icon, tone, title, detail, onclick) {
  return `<button class="attn ${tone}" ${onclick ? `onclick="${onclick}"` : ""}><span class="ai">${icon}</span><span class="at"><b>${title}</b>${detail ? `<span class="tiny mut">${detail}</span>` : ""}</span>${onclick ? `<span class="chev">${ic("chevron-right")}</span>` : ""}</button>`;
}

function viewToday() {
  if (role() === "crew") return viewToday_v1();
  const d = today(), yd = bizYesterday(), y = SD[yd], p = me();
  if (typeof sb !== "undefined" && !RUN.rows && !RUN.loading && !RUN.err) setTimeout(loadRuns, 0); /* Cherry's runs, for the run + cash cards */
  const behind = LAST_DAY < yd ? Math.round((new Date(yd + "T00:00:00") - new Date(LAST_DAY + "T00:00:00")) / 864e5) : 0;
  const u = y ? usualWeekday(yd) : null;
  const last14 = calDays(addDays(LAST_DAY, -13), LAST_DAY).map(x => SD[x] ? SD[x].total : null);
  /* hero: yesterday */
  const hero = y
    ? `<section class="card hero2 tapc" onclick="salesRange='day';salesDay='${yd}';salesTab='overview';go('#/sales')"><div class="lab">Yesterday · ${esc(dayLong(yd))}</div><div class="big num">${peso(y.total)}</div>
        <div class="trend">${u ? delta(y.total, u.avg, `vs a usual ${WD[wdOf(yd)]} (${peso(u.avg)})`) : '<span class="mut">no earlier same weekday to compare</span>'}</div>
        <div class="sub num">${y.tickets} tickets · avg ${peso(y.total / Math.max(1, y.tickets))}${u ? ` · usual ${Math.round(u.tk)} tickets` : ""}</div>${spark(last14, 520, 46)}<div class="tiny mut">last 14 days · tap for the day</div></section>`
    : `<section class="card hero2"><div class="lab">Yesterday · ${esc(dayLong(yd))}</div><div class="big num mut">—</div><div class="trend"><span class="dl down"><i>▼</i>not in the database yet</span></div><div class="sub">The newest day we have is ${esc(dayLong(LAST_DAY))}. Press <b>Sync now</b> above.</div></section>`;
  /* morning run + cash */
  const runs = RUN.rows || [], todayRun = runs.find(r => r.day === d), lastRun = runs[0];
  const hour = new Date().getHours();
  const gapOf = r => { const pos = r && SD[addDays(r.day, -1)]; return r && r.cash_sales != null && pos ? Math.round((r.cash_sales - (pos.pay.cash || 0)) * 100) / 100 : null; };
  const gap = gapOf(lastRun);
  const runTile = !RUN.rows ? tile("Morning run", '<span class="mut">…</span>', RUN.err ? "could not load" : "loading", "")
    : lastRun ? tile("Morning run", esc(dayName(lastRun.day).replace(/^\w+, /, "")), todayRun ? `today by ${esc(lastRun.recorded_by || "—")}` : (hour >= 11 ? '<span class="dl down"><i>▼</i>none today yet</span>' : "not due yet"), "") : tile("Morning run", "—", "no runs yet", "");
  const gapTile = lastRun && lastRun.cash_sales != null ? tile("Cash gap", gap == null ? "—" : `<span class="dl ${Math.abs(gap) < 1 ? "flat" : gap > 0 ? "up" : "down"}" style="font-size:inherit"><i>${Math.abs(gap) < 1 ? "▬" : gap > 0 ? "▲" : "▼"}</i>${peso(Math.abs(gap))}</span>`, gap == null ? "no POS day to compare" : `counted ${peso(lastRun.cash_sales)} vs POS ${peso((SD[addDays(lastRun.day, -1)] || { pay: {} }).pay.cash || 0)}`, "") : tile("Cash gap", "—", "needs a cash count", "");
  const bu = y ? boxUsual(yd) : null;
  const boxTile = y ? tile("Cash box, no sale", `${y.cashbox_opens || 0}×`, bu != null ? delta(y.cashbox_opens || 0, bu, `usual ${bu.toFixed(1)}×`) : "yesterday", "") : tile("Cash box, no sale", "—", "no data", "");
  const nightly = ITEMS.filter(i => i.nightly), lc = Store.lastCount("coke-zero"), draft = S.draft, counted = draft ? Object.keys(draft.lines).length : 0;
  const countTile = tile("Count", counted ? `${counted}/${nightly.length}` : lc ? esc(dayName(lc.day).replace(/^\w+, /, "")) : "none", counted ? "in progress, continue" : lc ? (lc.src === "walk" ? "Cherry's morning count" : "last closing count") : "nothing counted yet", "");
  const tiles = `<div class="grid2">${runTile}${gapTile}${boxTile}${countTile}</div>`;
  /* needs attention */
  const openT = S.tickets.filter(t => t.status !== "done"), high = openT.filter(t => t.priority === "high");
  const tasks = S.tasks.filter(t => t.status !== "done"), over = tasks.filter(t => t.due && t.due < d), blocked = tasks.filter(t => t.status === "blocked");
  const A = [];
  if (behind) A.push(attnItem("▼", "bad", `UTAK data is ${behind} day${behind > 1 ? "s" : ""} behind`, `newest day in the database: ${esc(dayName(LAST_DAY))}`, "syncNow()"));
  if (RUN.rows && !todayRun && hour >= 11) A.push(attnItem("○", "warn", "No morning run recorded today", "Cherry's store walk usually lands by 10:30", "salesTab='run';go('#/sales')"));
  if (high.length) A.push(attnItem("!", "bad", `${high.length} high-priority ticket${high.length > 1 ? "s" : ""} open`, esc(high.slice(0, 2).map(t => t.title).join(" · ")), "go('#/report')"));
  if (over.length) A.push(attnItem("◔", "warn", `${over.length} to-do${over.length > 1 ? "s" : ""} overdue`, esc(over.slice(0, 2).map(t => t.title).join(" · ")), "go('#/tasks')"));
  if (blocked.length) A.push(attnItem("▣", "warn", `${blocked.length} to-do${blocked.length > 1 ? "s" : ""} blocked`, esc(blocked.slice(0, 2).map(t => t.title).join(" · ")), "go('#/tasks')"));
  const dueNow = (hour >= 4 && hour < 15) ? CHECKLISTS[0] : CHECKLISTS[1], dn = clProgress(dueNow); /* opening 09:00-11:00; closing 23:00-01:30, still the same business day after midnight */
  if (dn.pct < 100) A.push(attnItem("✓", "info", `${dueNow.name} checklist ${dn.done} of ${dn.total}`, `${dueNow.from}–${dueNow.to} · ${esc(ROTA[wd(d)][dueNow.id === "open" ? 0 : 1])}`, `go('#/clean/${dueNow.id}')`));
  const attn = `<section class="card"><h2>Needs attention ${A.length ? `<span class="tiny mut">${A.length}</span>` : ""}</h2>${A.length ? `<div class="attnlist">${A.join("")}</div>` : `<div class="okline"><span class="dl up"><i>●</i>All clear</span> <span class="mut small">data current, checklists on track, nothing overdue.</span></div>`}</section>`;
  /* what sold yesterday */
  let sold = "";
  if (y) { const top = y.items.filter(r => r[0] !== "Open Cash Box").slice().sort((a, b) => b[3] - a[3]).slice(0, 5), mx = top[0] ? top[0][3] : 1;
    sold = `<section class="card"><h2>What sold yesterday <span class="tiny mut">by ₱</span></h2><div class="hb items">${top.map(([c, i, q, g]) => `<div class="hbr" data-tt="${esc(i)}|${fmt(q)} sold · ${peso(g)}"><span class="nm">${esc(i)}<small>${esc(c)}</small></span><span class="tr"><i style="width:${(100 * g / mx).toFixed(0)}%"></i></span><span class="vl num">${kfmt(g)}<small>${fmt(q)}×</small></span></div>`).join("")}</div><button class="btn full" style="margin-top:10px" onclick="salesRange='day';salesDay='${yd}';salesTab='overview';go('#/sales')">Open the day</button></section>`; }
  /* checklists + deliveries (kept from v1, restyled) */
  const cls = CHECKLISTS.map(cl => { const pr = clProgress(cl); return `<button class="row tap" onclick="go('#/clean/${cl.id}')">${ring(pr.pct, pr.pct >= 100)}<div class="main"><div class="name">${esc(cl.name)}${cl === dueNow && pr.pct < 100 ? ` ${chip("info", "now")}` : ""}</div><div class="meta">${cl.from}–${cl.to} · ${pr.done} of ${pr.total} · ${esc(ROTA[wd(d)][cl.id === "open" ? 0 : 1])}</div></div><span class="chev">${ic("chevron-right")}</span></button>`; }).join("");
  const recToday = S.receipts.filter(r => r.day === d);
  const deliveries = `<section class="card"><h2>Deliveries today</h2>${recToday.length ? `<div class="list">${recToday.map(r => `<div class="row"><div class="main"><div class="name">${esc(r.supplier)}</div><div class="meta">${r.lines.map(l => `${esc(Store.item(l.item).name)} × ${fmt(l.qty)}`).join(" · ")}</div></div>${thumb(r.photo)}</div>`).join("")}</div>` : `<div class="mut small">None yet. <a href="#/receive">Receive a delivery ›</a></div>`}</section>`;
  return shell(`${greet()}${p && p.short && p.id !== "store" ? ", " + esc(p.short) : ""}`, dayLong(d), syncBar() + hero + tiles + attn + sold + `<section class="card"><h2>Checklists</h2><div class="list">${cls}</div></section>` + deliveries);
}

/* ---------- More: grouped, with the state of every data source ---------- */
function viewMore() {
  const p = me(), y = bizYesterday(), behind = LAST_DAY < y ? Math.round((new Date(y + "T00:00:00") - new Date(LAST_DAY + "T00:00:00")) / 864e5) : 0, l = SYNC.last;
  const row = (label, meta, href, extra = "") => `<button class="row tap" onclick="${href}"><div class="main"><div class="name">${label}</div>${meta ? `<div class="meta">${meta}</div>` : ""}</div>${extra}<span class="chev">${ic("chevron-right")}</span></button>`;
  const when = l ? new Date(l.at).toLocaleString("en-PH", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Manila" }) + (l.trigger === "nightly" ? " · nightly" : " · button") + (l.ok ? "" : " · failed") : "none recorded";
  const src = (name, state, cls, note) => `<div class="hrow"><div class="hn"><b>${name}</b><span class="chip ${cls}"><i class="dot"></i>${state}</span></div><div class="tiny mut">${note}</div></div>`;
  const health = `<section class="card"><h2>Data health</h2><div class="health">
    ${src("UTAK sales", behind ? `${behind} day${behind > 1 ? "s" : ""} behind` : "current", behind ? "bad" : "ok", `to ${esc(dayName(LAST_DAY))} · last sync ${esc(when)}`)}
    ${src("Morning runs", RUN.rows ? (RUN.rows.length ? "linked" : "empty") : RUN.err ? "error" : "not loaded", RUN.rows && RUN.rows.length ? "ok" : "warn", RUN.rows && RUN.rows[0] ? `latest ${esc(dayName(RUN.rows[0].day))} · mirrored from the old OS` : "mirrored from the old OS by hand")}
    ${src("Counts, receipts, tickets, photos", "this device only", "warn", "not yet in the database")}
  </div><div class="tiny mut" style="margin-top:8px">Until the nightly sync is switched on, sales update only when someone presses Sync now.</div><div style="margin-top:10px"><button class="btn ${behind ? "primary" : ""}" ${SYNC.busy ? "disabled" : ""} onclick="syncNow()">${SYNC.busy ? "Syncing…" : "Sync now"}</button></div></section>`;
  const group = (title, rows) => `<section class="card mg"><h3>${title}</h3><div class="list">${rows.join("")}</div></section>`;
  const daily = group("Every day", [row("Store walk", "Cherry's morning run, the old form", "go('#/walk')"), row("Morning run results", "from the database, with the cash gap", "salesTab='run';go('#/sales')"), row("Cash, closing count", "drawer by denomination", "go('#/cash')"), row("Receive a delivery", "", "go('#/receive')")]);
  const review = group("Review", [row("Transactions", "every ticket, cash box without a sale", "salesTab='txns';go('#/sales')"), ...(role() === "master" ? [row("Finance", "expenses, payables, the book", "go('#/finance')")] : []), row("Variance", "counted against expected", "go('#/variance')"), row("Tickets", "problems and repairs", "go('#/report')"), row("To-do list", "", "go('#/tasks')")]);
  const me2 = group("This device", [
    `<button class="row tap" onclick="S.theme=S.theme==='dark'?'light':'dark';save();applyTheme();render()"><div class="main"><div class="name">Dark theme</div><div class="meta">easier in a dim kitchen</div></div><span class="sw ${S.theme === "dark" ? "on" : ""}"><i></i></span></button>`,
    row("Put a name on my entries", `optional · ${esc(me().name)} now`, "go('#/who')"),
    ...(window.DB_USER ? [`<button class="row tap" onclick="signOut()"><div class="main"><div class="name">Sign out</div><div class="meta">signed in as ${esc(window.DB_USER)}</div></div></button>`] : []),
    `<button class="row tap" onclick="if(confirm('Reset everything typed on this device?')){Store.reset();location.hash='#/who';location.reload()}"><div class="main"><div class="name band-bad">Reset this device</div><div class="meta">clears counts, receipts, tickets and photos typed here</div></div></button>`]);
  const owner = role() === "master";
  return shell("More", `${esc(p.name)} · ${esc(p.position)}`, (owner ? health : "") + (owner ? daily : group("Every day", [row("Store walk", "the morning run", "go('#/walk')")])) + (owner ? review : "") + me2 + `<div class="tiny mut">Pizza 99 OS v0.6 · one-person mode: every name sees everything; roles come before anyone else logs in.</div>`);
}
