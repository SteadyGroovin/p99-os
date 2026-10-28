/* finance-v2.js — Finance (expenses, payables, book, P&L). Masters only. Reads the Supabase mirror tables fin_expense, fin_payable, fin_book_day,
   fin_book_overhead (the Google Sheets stay the source of truth; this only mirrors them). 2026-10-28.
   Patterns: Restaurant365 / MarginEdge (prime cost and food cost % against a band, a daily controllable P&L, price movers with a price graph per item),
   AP dashboards (pending by stage, not by age). Rules from cash-and-payables-process.md: payables count only once paid, `run` is a cutoff label,
   pending is reported as pending (never as lateness), blank is not zero, the book's PAYABLES line is the same money as the payables workbook. */
const FIN = { data: null, loading: false, err: null, month: null,
  bRange: "month", bFrom: null, bTo: null, bRows: "days", bCats: [], cell: null,
  eRange: "month", eFrom: null, eTo: null, eSup: "all", eQ: "", eDays: 10,
  plMonth: null };
const FIN_FROM = "2026-08-01";            /* July is the owner's and is never shown or compared */
const FIN_RELIABLE = "2026-09";           /* first full month on today's basis; August is partly different */
const FIN_STORES = ["P99", "NYPD"];       /* the store is NYPD in the sheets, P99 here */
const FIN_GROUPS = [["Food", "var(--s1)"], ["Beverage", "var(--s2)"], ["Consumables", "var(--s3)"], ["Other", "var(--s4)"], ["Payables", "var(--sother)"]];
const FIN_GC = Object.fromEntries(FIN_GROUPS);
const FIN_CAT_ORDER = ["Chilled", "Dry Food", "Vegetables", "Beverages & Liquor", "Purified water", "Consumables", "GAS", "Transport", "Construction", "CA"];
const finId = s => encodeURIComponent(s).replace(/'/g, "%27");
const finKey = s => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const finEom = m => { const [y, mo] = m.split("-").map(Number); return ymd(new Date(y, mo, 0)); };
const finMonthDays = m => calDays(m + "-01", finEom(m));
const finNextMonth = m => { const [y, mo] = m.split("-").map(Number); return ymd(new Date(y, mo, 1)).slice(0, 7); };
const finPct = v => v == null || !isFinite(v) ? "—" : (v * 100).toFixed(1).replace(/\.0$/, "") + "%";
const finShort = v => kfmt(v).replace("₱", "");

/* category → group (fixed order Food · Beverage · Consumables · Other; the book's PAYABLES line kept apart) */
function finGroup(cat) {
  const c = String(cat || "").toLowerCase();
  if (/payable/.test(c)) return "Payables";
  if (/bev|liquor|water|drink|\bice\b|juice|coffee/.test(c)) return "Beverage";
  if (/consum|packag|clean|suppl|tissue|box/.test(c)) return "Consumables";
  if (/chill|dry|food|veg|meat|pork|chicken|beef|fish|sea|dairy|bread|frozen|spice|fruit|cheese|flour|egg|rice|grocer|market/.test(c)) return "Food";
  return "Other";
}
function finCatSort(cats) {
  const u = [...new Set(cats)];
  return u.sort((a, b) => { const pa = finGroup(a) === "Payables", pb = finGroup(b) === "Payables"; if (pa !== pb) return pa ? 1 : -1;
    const ia = FIN_CAT_ORDER.indexOf(a), ib = FIN_CAT_ORDER.indexOf(b); if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); return a.localeCompare(b); });
}

/* usual due day per overhead line (Stefan, 2026-09-10 — cash-and-payables-process.md). Only these; anything else has no due day. */
const FIN_DUE = [[/^rent\b|kalibo|cable/i, "eom", 0], [/salary\s*0?1\s*[-–]\s*15/i, 17, 0], [/salary\s*16/i, 2, 1], [/^bir\b/i, 8, 1],
  [/sss|philhealth|pag-?ibig|performance|bonus|service charge|management fee|ofex/i, 10, 1], [/electric/i, 2, 0], [/water/i, 12, 0]];
function finDue(line, m) {
  const r = FIN_DUE.find(([re]) => re.test(line || "")); if (!r) return null;
  const mm = r[2] ? finNextMonth(m) : m; return r[1] === "eom" ? finEom(mm) : mm + "-" + pad2(r[1]);
}

/* status chips: icon + label, colour only adds to it */
function finSt(kind) {
  const M = { paid: ["ok", "✓", "Paid"], part: ["info", "◐", "Part paid"], open: ["", "○", "Pending"], actual: ["ok", "✓", "Actual"], estimate: ["info", "≈", "Estimate"],
    missing: ["", "–", "Not entered"], "n/a": ["", "·", "Not applicable"], running: ["", "◔", "Run still open"] };
  const [c, i, l] = M[kind] || ["", "·", kind]; return `<span class="chip fst ${c}"><i aria-hidden="true">${i}</i>${l}</span>`;
}
function finBand(p) {
  if (p == null || !isFinite(p)) return "";
  return p <= .30 ? `<span class="chip fst ok"><i aria-hidden="true">✓</i>at or under 30%</span>` : p <= .34 ? `<span class="chip fst warn"><i aria-hidden="true">◐</i>in the 30–34% band</span>` : `<span class="chip fst bad"><i aria-hidden="true">▲</i>above 34%</span>`;
}
function finMeter(p) {
  if (p == null || !isFinite(p)) return "";
  const X = v => Math.min(100, v / .5 * 100);
  return `<div class="fmeter" role="img" aria-label="Food cost ${finPct(p)} against the 30 to 34 percent band"><div class="tr"><i class="z1" style="width:${X(.30)}%"></i><i class="z2" style="left:${X(.30)}%;width:${X(.34) - X(.30)}%"></i><b style="left:${X(p)}%" data-tt="Food cost|${finPct(p)}"></b></div><div class="ax"><span style="left:0">0</span><span style="left:${X(.30)}%">30%</span><span style="left:${X(.34)}%">34%</span><span style="left:100%">50%</span></div></div>`;
}

/* ---------- data ---------- */
async function finPage(build) { const rows = []; for (let f = 0; ; f += 1000) { const { data, error } = await build().range(f, f + 999); if (error) throw error; rows.push(...(data || [])); if (!data || data.length < 1000) break; } return rows; }
async function finLoad() {
  if (FIN.loading) return; FIN.loading = true; FIN.err = null; render();
  try {
    if (typeof sb === "undefined") throw new Error("This build has no database connection.");
    const [ex, pay, bd, oh] = await Promise.all([
      finPage(() => sb.from("fin_expense").select("*").gte("day", FIN_FROM).order("day").order("seq")),
      finPage(() => sb.from("fin_payable").select("*").gte("run_to", FIN_FROM).order("run_from").order("line_date")),
      finPage(() => sb.from("fin_book_day").select("*").gte("day", FIN_FROM).order("day")),
      finPage(() => sb.from("fin_book_overhead").select("*").gte("month", FIN_FROM.slice(0, 7)).order("month"))]);
    const mine = r => !r.store || FIN_STORES.includes(String(r.store).toUpperCase());
    const num = v => v == null || v === "" ? null : Number(v);
    const D = {
      ex: ex.filter(mine).map(r => ({ ...r, amount: num(r.amount) || 0, k: finKey(r.item) })),
      pay: pay.filter(mine).map(r => ({ ...r, amount: num(r.amount) || 0, paid_amount: num(r.paid_amount), status: String(r.status || "open").toLowerCase() })),
      book: bd.filter(mine).filter(r => r.day).map(r => ({ ...r, amount: num(r.amount), month: r.month || r.day.slice(0, 7) })).filter(r => r.amount != null),
      oh: oh.filter(mine).map(r => ({ ...r, amount: num(r.amount), basis: String(r.basis || (r.amount == null ? "missing" : "actual")).toLowerCase() }))
    };
    D.pay.forEach(r => { r.paid = r.status === "paid" ? (r.paid_amount != null ? r.paid_amount : r.amount) : r.status === "part" ? (r.paid_amount || 0) : 0; r.pending = Math.max(0, r.amount - r.paid); });
    const mx = (a, k) => a.reduce((m, r) => r[k] && r[k] > m ? r[k] : m, "");
    D.last = { ex: mx(D.ex, "day"), book: mx(D.book, "day"), pay: mx(D.pay, "line_date"), oh: mx(D.oh, "month"),
      sync: { ex: mx(D.ex, "synced_at"), pay: mx(D.pay, "synced_at"), book: mx(D.book, "synced_at"), oh: mx(D.oh, "synced_at") } };
    D.lastDay = [D.last.ex, D.last.book].sort().pop() || "";
    const ms = new Set(); D.book.forEach(r => ms.add(r.day.slice(0, 7))); D.ex.forEach(r => ms.add(r.day.slice(0, 7))); D.oh.forEach(r => ms.add(r.month));
    D.months = [...ms].filter(m => m >= FIN_FROM.slice(0, 7)).sort();
    D.spendMonths = [...new Set([...D.book.map(r => r.day.slice(0, 7)), ...D.ex.map(r => r.day.slice(0, 7))])].sort();
    FIN.data = D;
    if (!FIN.month || !D.months.includes(FIN.month)) FIN.month = D.spendMonths[D.spendMonths.length - 1] || D.months[D.months.length - 1] || null;
  } catch (e) { FIN.err = e.message || String(e); }
  FIN.loading = false; render();
}
function finReload() { FIN.data = null; FIN.err = null; finLoad(); }
const finSalesOn = days => sum(days.map(d => SD[d] ? SD[d].total : 0));
const finSalesDays = days => days.filter(d => SD[d]);
function finSyncTxt(t) { if (!t) return ""; try { return new Date(t).toLocaleString("en-PH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Manila" }); } catch (e) { return ""; } }
function finSrc(which) {
  const D = FIN.data, S = { ex: "Cherry's daily expense file (NYPD block)", pay: "the payables workbook (two runs a month)", book: "the accounting book (day × category grid)", oh: "the accounting book's overhead block" };
  const parts = which.map(w => { const l = D.last[w], s = D.last.sync[w]; return `${S[w]}: ${l ? "latest " + (w === "oh" ? monthName(l) : dayName(l)) : "no rows yet"}${s ? " · synced " + finSyncTxt(s) : ""}`; });
  return `<div class="tiny mut fsrc">Source — ${parts.map(esc).join("; ")}. The Google Sheets are the source of truth; this mirrors them. Amounts in ₱.</div>`;
}

/* ---------- shared pieces ---------- */
function finNav(cur) {
  const T = [["", "Overview"], ["book", "Book"], ["expenses", "Expenses"], ["payables", "Payables"], ["pl", "P&L"]];
  return `<div class="rng fnav" role="tablist">${T.map(([k, l]) => `<button class="${cur === k ? "on" : ""}" role="tab" aria-selected="${cur === k}" onclick="go('#/finance${k ? "/" + k : ""}')">${l}</button>`).join("")}</div>`;
}
function finMonthChips(sel, list, fn) {
  return `<div class="rng">${list.map(m => `<button class="${m === sel ? "on" : ""}" onclick="${fn}('${m}')">${esc(monthName(m))}${m < FIN_RELIABLE ? " *" : ""}</button>`).join("")}</div>`;
}
const finAugNote = m => m < FIN_RELIABLE ? `<div class="tiny mut">* ${esc(monthName(m))} is partly on a different basis; September 2026 is the first reliable full month.</div>` : "";
function finRangeChips(pre) {
  const r = FIN[pre + "Range"]; const R = [["7", "7 days"], ["30", "30 days"], ["month", "Month"], ["custom", "Custom"]];
  const D = FIN.data; const last = D.lastDay || bizYesterday();
  return `<div class="rng">${R.map(([k, l]) => `<button class="${r === k ? "on" : ""}" onclick="finSetRange('${pre}','${k}')">${l}</button>`).join("")}</div>
    ${r === "month" ? finMonthChips(FIN.month, D.spendMonths.length ? D.spendMonths : D.months, "finPickMonth") : ""}
    ${r === "custom" ? `<div class="fdates"><label class="small">From <input class="in" type="date" value="${FIN[pre + "From"] || addDays(last, -13)}" min="${FIN_FROM}" onchange="FIN['${pre}From']=this.value;render()"></label><label class="small">To <input class="in" type="date" value="${FIN[pre + "To"] || last}" min="${FIN_FROM}" onchange="FIN['${pre}To']=this.value;render()"></label></div>` : ""}`;
}
function finSetRange(pre, k) { FIN[pre + "Range"] = k; if (k === "custom") { const last = FIN.data.lastDay || bizYesterday(); FIN[pre + "From"] = FIN[pre + "From"] || addDays(last, -13); FIN[pre + "To"] = FIN[pre + "To"] || last; } FIN.eDays = 10; render(); }
function finPickMonth(m) { FIN.month = m; FIN.eDays = 10; render(); }
function finDays(pre) {
  const r = FIN[pre + "Range"], last = FIN.data.lastDay || bizYesterday();
  if (r === "month" && FIN.month) return finMonthDays(FIN.month);
  if (r === "custom") { let a = FIN[pre + "From"] || addDays(last, -13), b = FIN[pre + "To"] || last; if (a < FIN_FROM) a = FIN_FROM; if (b < a) [a, b] = [b, a]; return calDays(a, b).slice(0, 400); }
  const n = +r; let a = addDays(last, -(n - 1)); if (a < FIN_FROM) a = FIN_FROM; return calDays(a, last);
}
const finSpan = days => days.length ? (days.length === 1 ? dayName(days[0]) : `${dayName(days[0])} – ${dayName(days[days.length - 1])}`) : "";
function finRuns(days) { /* collapse consecutive ISO days into "3–9 Oct" style ranges */
  const out = []; days.forEach(d => { const l = out[out.length - 1]; if (l && addDays(l[1], 1) === d) l[1] = d; else out.push([d, d]); });
  const f = d => new Date(d + "T00:00:00").toLocaleDateString("en-PH", { day: "numeric", month: "short" });
  return out.map(([a, b]) => a === b ? f(a) : `${f(a)} – ${f(b)}`);
}
const finComing = (lab, why) => `<section class="card kt fcoming"><div class="lab">${lab}</div><div class="val mut">Coming</div><div class="trend tiny mut">${why}</div></section>`;
function finTable(head, rows, open) { return `<details class="tbl" ${open ? "open" : ""}><summary>Show as table</summary><div class="fscroll"><table class="t"><thead><tr>${head.map(([h, n]) => `<th class="${n ? "n" : ""}">${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div></details>`; }

/* ---------- month figures shared by Overview and P&L ---------- */
function finMonth(m) {
  const D = FIN.data, book = D.book.filter(r => r.day.startsWith(m));
  const bookDays = [...new Set(book.map(r => r.day))].sort(); const lastBook = bookDays[bookDays.length - 1] || null;
  const cover = lastBook ? calDays(m + "-01", lastBook) : [];       /* the days the book covers so far */
  const g = {}; FIN_GROUPS.forEach(([k]) => g[k] = 0); const cats = {};
  book.forEach(r => { g[finGroup(r.category)] += r.amount; cats[r.category] = (cats[r.category] || 0) + r.amount; });
  const spend = sum(Object.values(g)), spendNoPay = spend - g.Payables;
  const sales = finSalesOn(cover), salesAll = finSalesOn(finMonthDays(m)), salesDays = finSalesDays(finMonthDays(m));
  const oh = D.oh.filter(r => r.month === m);
  return { m, book, bookDays, lastBook, cover, g, cats, spend, spendNoPay, sales, salesAll, salesDays, oh,
    food: sales && cover.length >= 7 ? g.Food / sales : null, bev: sales && cover.length >= 7 ? g.Beverage / sales : null, ratio: sales ? spend / sales : null };
}

/* ---------- entry ---------- */
function viewFinance(sub, id) {
  if (role() !== "master") return shell("Finance", "", `<section class="card"><h2>Finance is for the owners</h2><div class="small mut">Expenses, payables, the book and the P&L are visible to Stefan and Mike only. Ask one of them if you need a figure.</div><div style="margin-top:12px"><button class="btn" onclick="go('#/more')">Back to More</button></div></section>`, { back: "#/more" });
  const sb2 = ["", "book", "expenses", "payables", "pl"].includes(sub || "") ? (sub || "") : "";
  if (!FIN.data) {
    if (!FIN.loading && !FIN.err) setTimeout(finLoad, 0);
    const body = FIN.err ? `<section class="card"><h2>Could not load the finance data</h2><div class="small"><span class="band-bad">${esc(FIN.err)}</span></div><div class="tiny mut" style="margin-top:6px">The sheets are untouched; the OS could not read its copy of them. Check the connection and try again.</div><div style="margin-top:10px"><button class="btn primary" onclick="finReload()">Try again</button></div></section>`
      : `<section class="card mut" style="text-align:center">Loading the expense file, payables, the book and overhead…</section>`;
    return shell("Finance", "", finNav(sb2) + body, { back: "#/more" });
  }
  const dec = s => { try { return decodeURIComponent(s); } catch (e) { return s; } };
  if (sub === "book") return viewFinBook();
  if (sub === "expenses") return id ? viewFinItem(dec(id)) : viewFinExpenses();
  if (sub === "payables") return id ? viewFinSupplier(dec(id)) : viewFinPayables();
  if (sub === "pl") return viewFinPL();
  return viewFinOverview();
}

/* ---------- 1. Overview ---------- */
function finDayChart(id, days, rows) {
  const by = {}; rows.forEach(r => { const o = by[r.day] = by[r.day] || {}; const g = finGroup(r.category); o[g] = (o[g] || 0) + r.amount; });
  const tots = days.map(d => by[d] ? sum(Object.values(by[d])) : 0); const mx0 = Math.max(...tots, 1);
  const mag = Math.pow(10, Math.floor(Math.log10(mx0))); const mx = [1, 2, 2.5, 5, 10].map(x => x * mag).find(x => x >= mx0 * 1.02) || mx0;
  const W = 640, H = 210, L = 46, R = 8, T = 10, B = 26, iw = W - L - R, ih = H - T - B, bw = iw / days.length, Y = v => ih * v / mx;
  const grid = [0, .5, 1].map(f => `<line class="grid" x1="${L}" x2="${W - R}" y1="${(T + ih - Y(mx * f)).toFixed(1)}" y2="${(T + ih - Y(mx * f)).toFixed(1)}"/><text x="${L - 6}" y="${(T + ih - Y(mx * f) + 4).toFixed(1)}" text-anchor="end">${kfmt(mx * f)}</text>`).join("");
  let bars = ""; days.forEach((d, i) => { if (!by[d]) return; let y0 = T + ih; FIN_GROUPS.forEach(([g, c]) => { const v = by[d][g]; if (!v) return; const h = Math.max(1, Y(v)); y0 -= h;
    bars += `<rect class="fseg" x="${(L + bw * i + bw * .14).toFixed(1)}" y="${y0.toFixed(1)}" width="${Math.max(2, bw * .72).toFixed(1)}" height="${h.toFixed(1)}" fill="${c}" data-c="${c}" data-tt="${esc(dayName(d))} · ${g}|${esc(peso(v))} of ${esc(peso(tots[i]))}"/>`; }); });
  const step = Math.max(1, Math.ceil(days.length / 7));
  const xl = days.map((d, i) => i % step === 0 ? `<text x="${(L + bw * (i + .5)).toFixed(1)}" y="${H - 7}" text-anchor="middle">${esc(dayName(d).split(" ").slice(-2).join(" "))}</text>` : "").join("");
  return `<svg class="chart trend fchart" id="${id}" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Spend per day by group">${grid}${bars}${xl}</svg>`;
}
function viewFinOverview() {
  const D = FIN.data, m = FIN.month;
  if (!m) return shell("Finance", "", finNav("") + `<section class="card"><h2>No finance rows yet</h2><div class="small mut">The mirror of the expense file, payables and the book is empty. Once the loader has run, this fills itself.</div><div style="margin-top:10px"><button class="btn" onclick="finReload()">Reload</button></div></section>`, { back: "#/more" });
  const A = finMonth(m), today0 = bizToday();
  const coverTxt = A.lastBook ? `1 – ${new Date(A.lastBook + "T00:00:00").toLocaleDateString("en-PH", { day: "numeric", month: "short" })}` : "no book days yet";
  const parts = FIN_GROUPS.map(([k, c]) => ({ name: k === "Payables" ? "Payables (book line)" : k, v: A.g[k], c }));
  const hero = `<section class="card hero2"><div class="lab">Spend in the book · ${esc(monthName(m))} · ${esc(coverTxt)}</div><div class="big num">${peso(A.spend)}</div>
    <div class="trend">${A.cover.length && A.cover.length < 7 ? `<span class="chip fst"><i aria-hidden="true">◔</i>only ${A.cover.length} day${A.cover.length === 1 ? "" : "s"} in the book so far — too few to judge</span><br>` : ""}${A.sales ? `<b>${finPct(A.ratio)}</b> of UTAK sales <span class="mut">(${peso(A.sales)} on the same days)</span>` : '<span class="mut">no UTAK sales on these days to compare</span>'}</div>
    <div style="margin-top:12px">${A.spend ? stackBar(parts, peso) : '<div class="small mut">No book rows for this month yet.</div>'}</div></section>`;
  /* payables */
  const pend = D.pay.filter(r => r.pending > 0.5); const pendTot = sum(pend.map(r => r.pending));
  const closed = D.pay.filter(r => r.run_to && r.run_to < today0); const lastRunTo = closed.reduce((a, r) => r.run_to > a ? r.run_to : a, "");
  const lastRun = D.pay.filter(r => r.run_to === lastRunTo); const lrPend = lastRun.filter(r => r.pending > 0.5);
  const afterClose = sum(pend.filter(r => r.run_to < today0).map(r => r.pending));
  /* overhead */
  const ohIn = A.oh.filter(r => r.basis === "actual" || r.basis === "estimate"), ohMiss = A.oh.filter(r => r.basis === "missing"), ohNa = A.oh.filter(r => r.basis === "n/a");
  const tiles = `<div class="grid2">
    ${tile("Payables pending", peso(pendTot), `${pend.length} line${pend.length === 1 ? "" : "s"} · ${new Set(pend.map(r => r.supplier)).size} suppliers<br><span class="mut">${peso(afterClose)} after its run closed</span>`, "")}
    ${tile("Overhead entered", A.oh.length ? `${ohIn.length}<span class="mut fof">/${A.oh.length - ohNa.length}</span>` : "—", A.oh.length ? (ohMiss.length ? `${finSt("missing")} ${ohMiss.length} line${ohMiss.length === 1 ? "" : "s"}` : finSt("actual")) : '<span class="mut">no overhead block yet</span>', "")}
    ${tile("Food cost", finPct(A.food), A.food != null ? `${finBand(A.food)}<br><span class="mut">food purchases ÷ UTAK sales</span>` : `<span class="mut">${A.cover.length && A.cover.length < 7 ? "too few book days to judge" : "needs book + sales"}</span>`, "")}
    ${tile("Beverage cost", finPct(A.bev), A.bev != null ? `<span class="mut">beverage purchases ÷ sales</span>` : "", "")}
    ${finComing("Left in the vault", "No table for the vault count yet — shown once Stefan's vault log is mirrored. Never estimated.")}
    ${finComing("Stefan's GCash", "No GCash balance feed yet. Shown once the statement is mirrored. Never estimated.")}
  </div>`;
  /* chart */
  const days = finMonthDays(m); const cats = finCatSort(Object.keys(A.cats)); const cmx = Math.max(...cats.map(c => A.cats[c]), 1);
  const chart = `<section class="card"><h2>Spend per day <span class="tiny mut">the book, by group</span></h2>${A.spend ? finDayChart("fdc", days, A.book.filter(r => finGroup(r.category) !== "Payables")) : '<div class="small mut">No book rows yet.</div>'}
    <div class="legend">${FIN_GROUPS.filter(([k]) => A.g[k] && k !== "Payables").map(([k, c]) => `<span><b style="background:${c}"></b>${k}</span>`).join("")}${A.g.Payables ? `<span class="mut">PAYABLES line (${peso(A.g.Payables)}) left out of the daily chart so it does not flatten the days; it is in the totals</span>` : ""}</div>
    <h2 style="margin-top:18px">By category</h2><div class="hb items">${cats.map(c => `<div class="hbr" data-tt="${esc(c)}|${esc(peso(A.cats[c]))} · ${A.spend ? Math.round(100 * A.cats[c] / A.spend) : 0}%"><span class="nm">${esc(c)}<small>${finGroup(c)}</small></span><span class="tr"><i style="width:${(100 * A.cats[c] / cmx).toFixed(1)}%"></i></span><span class="vl num">${finShort(A.cats[c])}<small>${A.spend ? Math.round(100 * A.cats[c] / A.spend) : 0}%</small></span></div>`).join("")}</div>
    ${finTable([["Category"], ["Group"], ["₱", 1], ["Share", 1]], cats.map(c => `<tr><td>${esc(c)}</td><td class="mut">${finGroup(c)}</td><td class="n num">${peso(A.cats[c])}</td><td class="n num">${A.spend ? Math.round(100 * A.cats[c] / A.spend) : 0}%</td></tr>`).concat([`<tr><td><b>Total</b></td><td></td><td class="n num"><b>${peso(A.spend)}</b></td><td></td></tr>`]))}
    ${A.g.Payables ? `<div class="tiny mut" style="margin-top:8px">The book's PAYABLES line is the same money as the payables workbook; it is shown once and never added to the Payables screen.</div>` : ""}</section>`;
  /* needs attention: what is pending, never how late */
  const exDays = new Set(D.ex.filter(r => r.day.startsWith(m)).map(r => r.day));
  const noEx = A.salesDays.filter(d => !exDays.has(d));
  const att = [];
  if (ohMiss.length) att.push(["–", `<b>${ohMiss.length} overhead line${ohMiss.length === 1 ? "" : "s"} not entered</b> for ${esc(monthName(m))}: ${ohMiss.map(r => esc(r.line)).join(", ")}.`]);
  if (lastRunTo) att.push(["○", lrPend.length ? `<b>${peso(sum(lrPend.map(r => r.pending)))} still pending</b> in the run that closed ${esc(dayName(lastRunTo))} (${esc(lastRun[0].run_label || "")}): ${[...new Set(lrPend.map(r => r.supplier))].map(esc).join(", ")}.` : `The run that closed ${esc(dayName(lastRunTo))} is fully paid.`]);
  if (noEx.length) att.push(["◇", `<b>${noEx.length} day${noEx.length === 1 ? "" : "s"} with UTAK sales but no expense lines</b>: ${finRuns(noEx).map(esc).join(", ")}.`]);
  if (A.oh.length === 0) att.push(["–", `No overhead block for ${esc(monthName(m))} in the book yet.`]);
  const attention = `<section class="card"><h2>Needs attention</h2>${att.length ? `<ul class="ins">${att.map(([i, t]) => `<li><span>${i}</span><div>${t}</div></li>`).join("")}</ul>` : '<div class="small mut">Nothing open for this month.</div>'}</section>`;
  const links = `<section class="card flinks">${[["book", "Book", "day × category, like the accounting sheet"], ["expenses", "Expenses", "every line, what was bought, price history"], ["payables", "Payables", "by run, what is pending"], ["pl", "Month P&L", "estimate, food cost vs 30–34%"]].map(([k, t, s]) => `<button class="row tap" onclick="go('#/finance/${k}')"><div class="main"><div class="name">${t}</div><div class="meta">${s}</div></div><span class="chev">${ic("chevron-right")}</span></button>`).join("")}</section>`;
  return shell("Finance", esc(monthName(m)), finNav("") + finMonthChips(m, D.months, "finPickMonth") + finAugNote(m) + hero + tiles + attention + chart + links + finSrc(["book", "ex", "pay", "oh"]) + `<div class="tiny mut">UTAK sales: ${esc(SALES_HISTORY.source)}. Management view, not the accounts.</div>`, { back: "#/more" });
}

/* ---------- 2. Book: day × category ---------- */
function finCell(d, ci) { FIN.cell = { d, c: ci === -1 ? null : FIN.bCats[ci] }; render(); }
function finCellSheet() {
  const c = FIN.cell; if (!c) return ""; const D = FIN.data;
  const cellRows = D.book.filter(r => r.day === c.d && (c.c == null || r.category === c.c)); const v = sum(cellRows.map(r => r.amount));
  const hasCat = D.ex.some(r => r.category != null);
  const lines = D.ex.filter(r => r.day === c.d && (!hasCat || c.c == null || r.category === c.c)).sort((a, b) => (a.seq || 0) - (b.seq || 0));
  const lt = sum(lines.map(r => r.amount));
  return `<div class="sheet-bg" onclick="if(event.target===this){FIN.cell=null;render()}"><div class="sheet fsheet" role="dialog" aria-label="Book cell">
    <div class="split"><h2>${esc(dayLong(c.d))}${c.c ? " · " + esc(c.c) : ""}</h2><button class="btn ghost" onclick="FIN.cell=null;render()" aria-label="Close">${ic("x-close")}</button></div>
    <div class="kpi"><div class="lab">In the book</div><div class="val num">${cellRows.length ? peso(v) : '<span class="mut">blank</span>'}</div>${cellRows.length > 1 ? `<div class="trend">${cellRows.map(r => `${esc(r.category)} ${peso(r.amount)}`).join(" · ")}</div>` : ""}</div>
    <h3 style="margin-top:14px">${hasCat || c.c == null ? "Expense-file lines" : "All expense-file lines that day"} <span class="mut">${lines.length} · ${peso(lt)}</span></h3>
    ${!hasCat && c.c ? `<div class="tiny mut" style="margin-bottom:6px">Cherry's expense file has no category column, so these are all of the day's lines; the book's category split is Cherry's.</div>` : ""}
    <div class="fsheet-list">${lines.length ? lines.map(r => `<div class="frow"><span class="mut num">${esc(r.time_text || "")}</span><div><b>${esc(r.item || "—")}</b><div class="tiny mut">${[r.qty_text, r.supplier, r.si_no ? "SI " + r.si_no : ""].filter(Boolean).map(esc).join(" · ")}</div></div><span class="num">${peso(r.amount)}</span></div>`).join("") : '<div class="small mut">No lines in the expense file for this day (paid from the vault, a payables run, or not encoded yet).</div>'}</div>
  </div></div>`;
}
function viewFinBook() {
  const D = FIN.data, days = finDays("b"), a = days[0], b = days[days.length - 1];
  const rows = D.book.filter(r => r.day >= a && r.day <= b); const cats = finCatSort(rows.map(r => r.category)); FIN.bCats = cats;
  const M = {}; rows.forEach(r => { const o = M[r.day] = M[r.day] || {}; o[r.category] = (o[r.category] || 0) + r.amount; });
  const dayTot = d => M[d] ? sum(Object.values(M[d])) : null, catTot = c => sum(rows.filter(r => r.category === c).map(r => r.amount));
  const all = sum(rows.map(r => r.amount));
  const mx = Math.max(1, ...rows.filter(r => finGroup(r.category) !== "Payables").map(r => M[r.day][r.category]));
  /* fixed overhead on its usual due day (schedule, not in the day total) */
  const ms = [...new Set(days.map(d => d.slice(0, 7)))]; ms.unshift(ms[0] ? (() => { const [y, mo] = ms[0].split("-").map(Number); return ymd(new Date(y, mo - 2, 1)).slice(0, 7); })() : "");
  const due = {}; D.oh.filter(r => ms.includes(r.month)).forEach(r => { const dd = finDue(r.line, r.month); if (dd && dd >= a && dd <= b) (due[dd] = due[dd] || []).push(r); });
  const dueCell = d => { const L = due[d]; if (!L) return `<td class="fdue"></td>`; const known = sum(L.filter(r => r.amount != null).map(r => r.amount)); const tt = L.map(r => `${r.line} (${monthName(r.month)}) ${r.amount == null ? "not entered" : peso(r.amount)}`).join(", ");
    return `<td class="fdue num" data-tt="Usual due day|${esc(tt)}">${L.length > 1 ? L.length + "× " : ""}${known ? finShort(known) : "–"}</td>`; };
  const cell = (d, c, ci) => { const v = M[d] && M[d][c]; if (v == null) return `<td class="hx0" aria-label="blank"></td>`; const f = Math.min(1, v / mx);
    return `<td class="hx ${f > .55 ? "hi" : ""}" style="--f:${(Math.pow(f, .7) * 100).toFixed(0)}%" tabindex="0" data-tt="${esc(dayName(d))} · ${esc(c)}|${esc(peso(v))}" onclick="finCell('${d}',${ci})">${finShort(v)}</td>`; };
  const dshort = d => { const x = new Date(d + "T00:00:00"); return `${WD[wdOf(d)].slice(0, 2)} ${x.getDate()}`; };
  let grid;
  if (FIN.bRows === "days") {
    grid = `<table class="fg"><thead><tr><th class="st">Day</th>${cats.map(c => `<th title="${esc(c)}">${esc(c)}</th>`).join("")}<th class="tot">Total</th><th class="fdue" title="Overhead on its usual due day — not in the total">Due</th></tr></thead><tbody>
      ${days.map(d => `<tr class="${wdOf(d) === 6 ? "sun" : ""}"><th class="st">${esc(dshort(d))}</th>${cats.map((c, ci) => cell(d, c, ci)).join("")}<td class="tot num">${dayTot(d) != null ? `<button class="flink" onclick="finCell('${d}',-1)">${finShort(dayTot(d))}</button>` : ""}</td>${dueCell(d)}</tr>`).join("")}
      <tr class="ftot"><th class="st">Total</th>${cats.map(c => `<td class="num">${finShort(catTot(c))}</td>`).join("")}<td class="num tot">${finShort(all)}</td><td></td></tr></tbody></table>`;
  } else {
    grid = `<table class="fg"><thead><tr><th class="st">Category</th>${days.map(d => `<th>${esc(dshort(d))}</th>`).join("")}<th class="tot">Total</th></tr></thead><tbody>
      ${cats.map((c, ci) => `<tr><th class="st">${esc(c)}</th>${days.map(d => cell(d, c, ci)).join("")}<td class="tot num">${finShort(catTot(c))}</td></tr>`).join("")}
      <tr class="ftot"><th class="st">Total</th>${days.map(d => `<td class="num">${dayTot(d) != null ? finShort(dayTot(d)) : ""}</td>`).join("")}<td class="num tot">${finShort(all)}</td></tr>
      <tr class="fduer"><th class="st">Due <span class="tiny mut">not in total</span></th>${days.map(d => dueCell(d)).join("")}<td></td></tr></tbody></table>`;
  }
  const ohMonths = [...new Set(days.map(d => d.slice(0, 7)))]; const oh = D.oh.filter(r => ohMonths.includes(r.month));
  const ohBlock = `<section class="card"><h2>Overhead <span class="tiny mut">${ohMonths.map(monthName).join(", ")} · the book's block</span></h2>${oh.length ? `<div class="fscroll"><table class="t"><thead><tr><th>Line</th>${ohMonths.length > 1 ? "<th>Month</th>" : ""}<th class="n">₱</th><th>Basis</th><th>Usual due day</th></tr></thead><tbody>${oh.sort((x, y) => (finDue(x.line, x.month) || "9") < (finDue(y.line, y.month) || "9") ? -1 : 1).map(r => { const dd = finDue(r.line, r.month);
      return `<tr><td>${esc(r.line)}${r.note ? `<div class="tiny mut">${esc(r.note)}</div>` : ""}</td>${ohMonths.length > 1 ? `<td class="mut">${esc(monthName(r.month))}</td>` : ""}<td class="n num">${r.amount == null ? '<span class="mut">not entered</span>' : peso(r.amount)}</td><td>${finSt(r.basis)}</td><td class="mut">${dd ? esc(dayName(dd)) : "—"}</td></tr>`; }).join("")}</tbody></table></div>
      <div class="tiny mut" style="margin-top:6px">Usual due days are Stefan's schedule (rent and cable end of month; salary 1–15 on the 17th, 16–end on the 2nd; BIR the 8th; SSS, PhilHealth, Pag-IBIG, bonus, service charge, management fee, Ofex the 10th of the next month; electricity the 2nd; water the 12th). Blank lines show "not entered", never ₱0.</div>` : '<div class="small mut">No overhead block for these months yet.</div>'}</section>`;
  const tog = `<div class="split"><h2>Day × category <span class="tiny mut">${esc(finSpan(days))}</span></h2><div class="seg sm"><button class="btn ${FIN.bRows === "days" ? "on" : ""}" onclick="FIN.bRows='days';render()">Days</button><button class="btn ${FIN.bRows === "cats" ? "on" : ""}" onclick="FIN.bRows='cats';render()">Categories</button></div></div>`;
  const tbl = finTable([["Category"], ["₱", 1], ["Share", 1]], cats.map(c => `<tr><td>${esc(c)}</td><td class="n num">${peso(catTot(c))}</td><td class="n num">${all ? Math.round(100 * catTot(c) / all) : 0}%</td></tr>`).concat([`<tr><td><b>Total</b></td><td class="n num"><b>${peso(all)}</b></td><td></td></tr>`]));
  const body = `<section class="card fbook">${tog}${rows.length ? `<div class="fgw">${grid}</div><div class="hl"><span>less</span><i></i><span>more</span><span class="mut">tap a cell for its lines · "Due" = fixed overhead on its usual due day, not in the total</span></div>${tbl}` : '<div class="small mut">No book rows in this range.</div>'}</section>`;
  return shell("Finance", "Book · " + esc(finSpan(days)), finNav("book") + finRangeChips("b") + (FIN.bRange === "month" ? finAugNote(FIN.month) : "") + `<div class="txsum"><b class="num">${peso(all)}</b> in the book · ${[...new Set(rows.map(r => r.day))].length} of ${days.length} days with entries</div>` + body + ohBlock + finSrc(["book", "oh", "ex"]) + finCellSheet(), { back: "#/finance" });
}

/* ---------- 3. Expenses ---------- */
const FIN_UNIT = { kls: "kg", kl: "kg", kilo: "kg", kilos: "kg", kgs: "kg", k: "kg", pcs: "pc", piece: "pc", pieces: "pc", btls: "btl", bottle: "btl", bottles: "btl", packs: "pack", pck: "pack", sacks: "sack", cans: "can", cases: "case", cs: "case", tanks: "tank", gals: "gal", gallon: "gal", gallons: "gal", trips: "trip", boxes: "box", bxs: "box", trays: "tray", liters: "l", ltr: "l", ltrs: "l" };
function finQty(t) {
  const m = String(t || "").trim().toLowerCase().match(/^(\d+(?:[.,]\d+)?)\s*([a-z.]+)?/); if (!m) return null;
  const q = parseFloat(m[1].replace(",", ".")); if (!q) return null; let u = (m[2] || "pc").replace(/\./g, ""); u = FIN_UNIT[u] || u; return { q, u };
}
function viewFinExpenses() {
  const D = FIN.data, days = finDays("e"), a = days[0], b = days[days.length - 1];
  const inR = D.ex.filter(r => r.day >= a && r.day <= b);
  const supName = r => r.supplier || "(no supplier)";
  const sups = {}; inR.forEach(r => { const s = supName(r); sups[s] = (sups[s] || 0) + r.amount; });
  const supList = Object.entries(sups).sort((x, y) => y[1] - x[1]);
  const q = FIN.eQ.trim().toLowerCase();
  const f = inR.filter(r => (FIN.eSup === "all" || supName(r) === FIN.eSup) && (!q || [r.item, r.supplier, r.si_no, r.qty_text, r.tab].some(x => String(x || "").toLowerCase().includes(q))));
  const tot = sum(f.map(r => r.amount)), dset = [...new Set(f.map(r => r.day))].sort().reverse();
  const ctl = `<div class="txctl"><select class="in" aria-label="Supplier" onchange="FIN.eSup=this.value;FIN.eDays=10;render()"><option value="all">Every supplier</option>${supList.map(([s]) => `<option value="${esc(s)}" ${s === FIN.eSup ? "selected" : ""}>${esc(s)}</option>`).join("")}</select><input class="in" type="search" placeholder="Item, supplier, SI #" value="${esc(FIN.eQ)}" onchange="FIN.eQ=this.value;FIN.eDays=10;render()"></div>`;
  FIN.eSups = supList.map(x => x[0]);
  const smx = supList.length ? supList[0][1] : 1, stot = sum(supList.map(x => x[1])) || 1;
  const supChart = `<section class="card"><h2>By supplier <span class="tiny mut">tap to filter</span></h2><div class="hb items">${supList.slice(0, 8).map(([s, v]) => `<div class="hbr tap ${FIN.eSup === s ? "best" : ""}" onclick="finSup(${supList.findIndex(x => x[0] === s)})" data-tt="${esc(s)}|${esc(peso(v))} · ${Math.round(100 * v / stot)}%"><span class="nm">${esc(s)}</span><span class="tr"><i style="width:${(100 * v / smx).toFixed(1)}%"></i></span><span class="vl num">${finShort(v)}<small>${Math.round(100 * v / stot)}%</small></span></div>`).join("") || '<div class="small mut">No lines.</div>'}</div>
    ${finTable([["Supplier"], ["Lines", 1], ["₱", 1]], supList.map(([s, v]) => `<tr><td>${esc(s)}</td><td class="n num">${inR.filter(r => supName(r) === s).length}</td><td class="n num">${peso(v)}</td></tr>`))}</section>`;
  const items = {}; f.forEach(r => { const o = items[r.k] = items[r.k] || { k: r.k, name: r.item || "—", v: 0, n: 0 }; o.v += r.amount; o.n++; });
  const il = Object.values(items).sort((x, y) => y.v - x.v); const imx = il.length ? il[0].v : 1;
  const itemChart = `<section class="card"><h2>What was bought <span class="tiny mut">top items · tap for price history</span></h2><div class="hb items">${il.slice(0, 8).map(i => `<div class="hbr tap" onclick="go('#/finance/expenses/${finId(i.k)}')" data-tt="${esc(i.name)}|${esc(peso(i.v))} · ${i.n} lines"><span class="nm">${esc(i.name)}</span><span class="tr"><i style="width:${(100 * i.v / imx).toFixed(1)}%"></i></span><span class="vl num">${finShort(i.v)}<small>${i.n}×</small></span></div>`).join("") || '<div class="small mut">No lines.</div>'}</div></section>`;
  const shown = dset.slice(0, FIN.eDays);
  const list = shown.map(d => { const L = f.filter(r => r.day === d).sort((x, y) => (x.seq || 0) - (y.seq || 0)); const dt = sum(L.map(r => r.amount)); const s = SD[d] ? SD[d].total : null;
    return `<div class="fday"><div class="fdh"><b>${esc(dayLong(d))}</b><span class="num"><b>${peso(dt)}</b>${s ? ` <span class="mut">· ${finPct(dt / s)} of sales</span>` : ""}</span></div>${L.map(r => `<div class="frow tap" onclick="go('#/finance/expenses/${finId(r.k)}')" role="button" tabindex="0"><span class="mut num">${esc(r.time_text || "")}</span><div><b>${esc(r.item || "—")}</b><div class="tiny mut">${[r.qty_text, r.supplier, r.si_no ? "SI " + r.si_no : ""].filter(Boolean).map(esc).join(" · ")}</div></div><span class="num">${peso(r.amount)}</span></div>`).join("")}</div>`; }).join("");
  const more = dset.length > shown.length ? `<button class="btn full" style="margin-top:8px" onclick="FIN.eDays+=15;render()">Show ${Math.min(15, dset.length - shown.length)} more days (${dset.length - shown.length} left)</button>` : "";
  const noLines = days.filter(d => SD[d] && !inR.some(r => r.day === d));
  return shell("Finance", "Expenses · " + esc(finSpan(days)), finNav("expenses") + finRangeChips("e") + ctl +
    `<div class="txsum"><b class="num">${f.length}</b> line${f.length === 1 ? "" : "s"} · <b class="num">${peso(tot)}</b> · ${dset.length} day${dset.length === 1 ? "" : "s"}${f.length !== inR.length ? ` <span class="mut">(filtered from ${inR.length})</span>` : ""}</div>` +
    (noLines.length && FIN.eSup === "all" && !q ? `<div class="tiny mut">No expense lines on ${noLines.length} day${noLines.length === 1 ? "" : "s"} with sales: ${finRuns(noLines).map(esc).join(", ")}.</div>` : "") +
    supChart + itemChart + `<section class="card txlist">${list || '<div class="mut" style="text-align:center;padding:12px 0">Nothing in this range matches.</div>'}${more}</section>` + finSrc(["ex"]) + `<div class="tiny mut">Every line is paid on the spot from Cherry's expense fund. Payables runs are on the Payables screen.</div>`, { back: "#/finance" });
}
function viewFinItem(k) {
  const D = FIN.data, L = D.ex.filter(r => r.k === k).sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : (a.seq || 0) - (b.seq || 0));
  if (!L.length) return shell("Finance", "Item", finNav("expenses") + `<section class="card"><div class="small mut">No lines for this item.</div></section>`, { back: "#/finance/expenses" });
  const name = L[L.length - 1].item;
  const P = L.map(r => ({ ...r, qq: finQty(r.qty_text) }));
  const units = {}; P.forEach(r => { if (r.qq) units[r.qq.u] = (units[r.qq.u] || 0) + 1; });
  const unit = Object.entries(units).sort((a, b) => b[1] - a[1])[0]; const u = unit && unit[1] >= 2 ? unit[0] : null;
  const pts = P.map(r => ({ r, v: u && r.qq && r.qq.u === u ? r.amount / r.qq.q : null })); const usable = u ? pts.filter(p => p.v != null) : pts.map(p => ({ r: p.r, v: p.r.amount }));
  const vals = usable.map(p => p.v); const first = vals[0], last = vals[vals.length - 1];
  const lab = u ? `₱ per ${u}` : "₱ per line";
  /* chart */
  const W = 640, H = 200, Lp = 50, R = 12, T = 12, B = 26, iw = W - Lp - R, ih = H - T - B; const mn = Math.min(...vals), mx = Math.max(...vals); const lo = mn === mx ? mn * .9 : mn - (mx - mn) * .15, hi = mn === mx ? mx * 1.1 || 1 : mx + (mx - mn) * .15;
  const X = i => Lp + (usable.length > 1 ? iw * i / (usable.length - 1) : iw / 2), Y = v => T + ih - ih * (v - lo) / (hi - lo || 1);
  const grid = [0, .5, 1].map(f => { const v = lo + (hi - lo) * f; return `<line class="grid" x1="${Lp}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text x="${Lp - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${peso(v)}</text>`; }).join("");
  const path = usable.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(p.v).toFixed(1)}`).join("");
  const dots = usable.map((p, i) => `<circle class="fpt" cx="${X(i).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="5" tabindex="0" data-tt="${esc(dayName(p.r.day))}|${esc(peso(p.v))}${u ? " / " + u : ""} · ${esc(p.r.qty_text || "")} ${esc(p.r.supplier || "")}"/>`).join("");
  const step = Math.max(1, Math.ceil(usable.length / 6)); const xl = usable.map((p, i) => i % step === 0 || i === usable.length - 1 ? `<text x="${X(i).toFixed(1)}" y="${H - 7}" text-anchor="${i === usable.length - 1 && usable.length > 1 ? "end" : i === 0 && usable.length > 1 ? "start" : "middle"}">${esc(dayName(p.r.day).split(" ").slice(-2).join(" "))}</text>` : "").join("");
  const chart = `<svg class="chart trend fchart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Price over time">${grid}<path class="line" d="${path}"/>${dots}${xl}</svg>`;
  const bySup = {}; P.forEach(r => { const s = r.supplier || "(no supplier)"; const o = bySup[s] = bySup[s] || { n: 0, v: 0, q: 0 }; o.n++; o.v += r.amount; if (u && r.qq && r.qq.u === u) o.q += r.qq.q; });
  const totQ = u ? sum(P.filter(r => r.qq && r.qq.u === u).map(r => r.qq.q)) : null;
  const tiles = `<div class="grid2">${tile("Last price", peso(last), `${esc(lab)} · ${esc(dayName(usable[usable.length - 1].r.day))}`, "")}${tile("Since first", usable.length > 1 ? delta(last, first) : "—", usable.length > 1 ? `first ${peso(first)} on ${esc(dayName(usable[0].r.day))}` : "one line so far", "")}${tile("Range", `${finShort(mn)}–${finShort(mx)}`, esc(lab), "")}${tile("Bought", peso(sum(L.map(r => r.amount))), `${L.length} lines${totQ ? ` · ${fmt(totQ)} ${u}` : ""}`, "")}</div>`;
  return shell("Finance", esc(name), finNav("expenses") + tiles + `<section class="card"><h2>Price history <span class="tiny mut">${esc(lab)}${u && usable.length < L.length ? ` · ${L.length - usable.length} line(s) without a usable quantity left out` : ""}${!u ? " · quantities not parseable, so whole-line amounts" : ""}</span></h2>${usable.length ? chart : '<div class="small mut">No line with a usable quantity.</div>'}
    ${finTable([["Day"], ["Qty"], ["Supplier"], ["₱", 1], [u ? "₱/" + u : "", 1]], P.slice().reverse().map(r => `<tr><td>${esc(dayName(r.day))}</td><td>${esc(r.qty_text || "—")}</td><td>${esc(r.supplier || "—")}</td><td class="n num">${peso(r.amount)}</td><td class="n num">${u && r.qq && r.qq.u === u ? peso(r.amount / r.qq.q) : '<span class="mut">—</span>'}</td></tr>`), false)}</section>
    <section class="card"><h2>Who sold it</h2><div class="fscroll"><table class="t"><thead><tr><th>Supplier</th><th class="n">Lines</th><th class="n">₱</th>${u ? `<th class="n">Avg ₱/${u}</th>` : ""}</tr></thead><tbody>${Object.entries(bySup).sort((a, b) => b[1].v - a[1].v).map(([s, o]) => `<tr><td>${esc(s)}</td><td class="n num">${o.n}</td><td class="n num">${peso(o.v)}</td>${u ? `<td class="n num">${o.q ? peso(P.filter(r => (r.supplier || "(no supplier)") === s && r.qq && r.qq.u === u).reduce((a, r) => a + r.amount, 0) / o.q) : "—"}</td>` : ""}</tr>`).join("")}</tbody></table></div></section>` + finSrc(["ex"]), { back: "#/finance/expenses" });
}

/* ---------- 4. Payables ---------- */
function finRunList() {
  const D = FIN.data, runs = {};
  D.pay.forEach(r => { const k = (r.run_from || "") + "|" + (r.run_to || "") + "|" + (r.run_label || ""); const o = runs[k] = runs[k] || { k, label: r.run_label || "", from: r.run_from, to: r.run_to, rows: [] }; o.rows.push(r); });
  return Object.values(runs).sort((a, b) => (b.to || "") < (a.to || "") ? -1 : 1).map(o => ({ ...o, billed: sum(o.rows.map(r => r.amount)), paid: sum(o.rows.map(r => r.paid)), pending: sum(o.rows.map(r => r.pending)) }));
}
function finRunState(o, t0) { if (o.to && o.to >= t0) return "running"; return o.pending < 0.5 ? "paid" : o.paid > 0.5 ? "part" : "open"; }
function finUsualPay(o) { if (!o.to) return null; const d = +o.to.slice(8); return d <= 16 ? o.to.slice(0, 8) + "15" : finEom(o.to.slice(0, 7)); }
function viewFinPayables() {
  const D = FIN.data, t0 = bizToday(), runs = finRunList();
  if (!runs.length) return shell("Finance", "Payables", finNav("payables") + `<section class="card"><div class="small mut">No payables rows in the mirror yet.</div></section>` + finSrc(["pay"]), { back: "#/finance" });
  const pend = sum(runs.map(o => o.pending)), after = sum(runs.filter(o => o.to < t0).map(o => o.pending)), npend = D.pay.filter(r => r.pending > .5).length;
  const lastClosed = runs.find(o => o.to < t0);
  const tiles = `<div class="grid2">${tile("Pending, all runs", peso(pend), `${npend} line${npend === 1 ? "" : "s"}`, "")}${tile("Pending after its run closed", peso(after), `${runs.filter(o => o.to < t0 && o.pending > .5).length} closed run(s) not fully paid`, "")}${lastClosed ? tile("Last closed run", esc(lastClosed.label || finSpan([lastClosed.from, lastClosed.to])), `${peso(lastClosed.paid)} paid of ${peso(lastClosed.billed)}`, "") : ""}${tile("Billed in the mirror", peso(sum(runs.map(o => o.billed))), `${runs.length} runs since ${esc(monthName(FIN_FROM.slice(0, 7)))}`, "")}</div>`;
  const cards = runs.map(o => { const st = finRunState(o, t0); const pay = finUsualPay(o);
    const sups = {}; o.rows.forEach(r => { const s = sups[r.supplier || "—"] = sups[r.supplier || "—"] || { s: r.supplier || "—", billed: 0, paid: 0, pending: 0, n: 0, st: {} }; s.billed += r.amount; s.paid += r.paid; s.pending += r.pending; s.n++; s.st[r.status] = 1; });
    const sl = Object.values(sups).sort((a, b) => b.pending - a.pending || b.billed - a.billed);
    const pp = o.billed ? o.paid / o.billed : 0;
    return `<section class="card frun"><div class="split"><div><h2>${esc(o.label || "Run")} <span class="tiny mut">${esc(finSpan([o.from, o.to]))}</span></h2><div class="tiny mut">Usual pay day ${pay ? esc(dayName(pay)) : "—"}</div></div>${finSt(st)}</div>
      <div class="fprog" data-tt="${esc(o.label)}|${esc(peso(o.paid))} paid · ${esc(peso(o.pending))} pending"><i style="width:${(pp * 100).toFixed(1)}%"></i></div>
      <div class="fnums num"><span>Billed <b>${peso(o.billed)}</b></span><span>Paid <b>${peso(o.paid)}</b></span><span>Pending <b>${peso(o.pending)}</b></span></div>
      <div class="fsup">${sl.map(s => { const k = s.pending < .5 ? "paid" : s.paid > .5 ? "part" : "open";
        return `<button class="frow tap" onclick="go('#/finance/payables/${finId(s.s)}')"><div><b>${esc(s.s)}</b><div class="tiny mut">${s.n} line${s.n === 1 ? "" : "s"} · billed ${peso(s.billed)}${s.paid > .5 && s.pending > .5 ? " · paid " + peso(s.paid) : ""}</div></div>${finSt(k)}<span class="num">${s.pending > .5 ? peso(s.pending) : '<span class="mut">—</span>'}</span></button>`; }).join("")}</div></section>`; }).join("");
  const tbl = `<section class="card"><h2>All runs</h2>${finTable([["Run"], ["Billed", 1], ["Paid", 1], ["Pending", 1]], runs.map(o => `<tr><td>${esc(o.label)}<div class="tiny mut">${esc(finSpan([o.from, o.to]))}</div></td><td class="n num">${peso(o.billed)}</td><td class="n num">${peso(o.paid)}</td><td class="n num">${peso(o.pending)}</td></tr>`), false)}</section>`;
  return shell("Finance", "Payables", finNav("payables") + tiles + `<div class="tiny mut">Payables count as spend only once paid. Pending is what is still waiting for Stefan's release; a run being a little behind is the normal state of this cycle. The run label is a cutoff, not a due date; the usual pay day is the 15th for 1–15 and month end for 16–end, a few days after is normal.</div>` + cards + tbl + finSrc(["pay"]), { back: "#/finance" });
}
function viewFinSupplier(s) {
  const D = FIN.data, L = D.pay.filter(r => (r.supplier || "—") === s).sort((a, b) => (b.line_date || "") < (a.line_date || "") ? -1 : 1);
  if (!L.length) return shell("Finance", esc(s), finNav("payables") + `<section class="card"><div class="small mut">No payables lines for this supplier.</div></section>`, { back: "#/finance/payables" });
  const billed = sum(L.map(r => r.amount)), paid = sum(L.map(r => r.paid)), pending = sum(L.map(r => r.pending));
  const runs = [...new Set(L.map(r => r.run_label))];
  const tiles = `<div class="grid2">${tile("Pending", peso(pending), `${L.filter(r => r.pending > .5).length} lines`, "")}${tile("Paid", peso(paid), `of ${peso(billed)} billed`, "")}</div>`;
  const body = runs.map(rl => { const R = L.filter(r => r.run_label === rl); return `<section class="card"><h2>${esc(rl)} <span class="tiny mut">${esc(finSpan([R[0].run_from, R[0].run_to]))}</span></h2><div class="fscroll"><table class="t"><thead><tr><th>Date</th><th>SI · particulars</th><th class="n">₱</th><th>Status</th></tr></thead><tbody>${R.map(r => `<tr><td class="mut">${esc(r.line_date ? dayName(r.line_date) : "—")}</td><td>${esc(r.si_no || "—")}<div class="tiny mut">${esc(r.particulars || "")}</div></td><td class="n num">${peso(r.amount)}${r.status === "part" ? `<div class="tiny mut">paid ${peso(r.paid)}</div>` : ""}</td><td>${finSt(r.status === "paid" ? "paid" : r.status === "part" ? "part" : "open")}</td></tr>`).join("")}</tbody></table></div></section>`; }).join("");
  return shell("Finance", esc(s), finNav("payables") + tiles + body + finSrc(["pay"]), { back: "#/finance/payables" });
}

/* ---------- 5. Month P&L (management estimate) ---------- */
function viewFinPL() {
  const D = FIN.data; const months = D.months.filter(m => m >= FIN_RELIABLE);
  if (!months.length) return shell("Finance", "Month P&L", finNav("pl") + `<section class="card"><div class="small mut">No month from September 2026 on has book rows yet.</div></section>`, { back: "#/finance" });
  if (!FIN.plMonth || !months.includes(FIN.plMonth)) FIN.plMonth = months.includes(FIN.month) ? FIN.month : months[months.length - 1];
  const m = FIN.plMonth, A = finMonth(m), pm = months[months.indexOf(m) - 1], P = pm ? finMonth(pm) : null;
  const full = A.lastBook === finEom(m);
  const salesBasis = A.lastBook ? A.sales : 0;
  /* overhead with the rent share estimate */
  const ohRows = A.oh.map(r => {
    if (/^share\b/i.test(r.line) && (r.amount == null || r.basis === "missing")) return { ...r, amount: Math.round(A.salesAll * .10), basis: "estimate", note: "10% of UTAK sales — the lease uses Cherry's counted sales, which the OS does not have yet" };
    return r; });
  if (!A.oh.some(r => /^share\b/i.test(r.line)) && A.salesAll) ohRows.push({ line: "Share (landlord 10%)", amount: Math.round(A.salesAll * .10), basis: "estimate", note: "10% of UTAK sales; not a line in the book yet" });
  const ohKnown = ohRows.filter(r => r.amount != null && (r.basis === "actual" || r.basis === "estimate")), ohMiss = ohRows.filter(r => r.basis === "missing"), ohNa = ohRows.filter(r => r.basis === "n/a");
  const ohTot = sum(ohKnown.map(r => r.amount));
  const sales = A.salesAll;  /* the whole month's UTAK sales against the whole month's book; flagged when the book is not complete */
  const purch = A.spend, result = sales - purch - ohTot;
  /* ratios on the days the book covers, so a half-encoded month does not look cheap */
  const few = A.cover.length < 7, food = A.sales && !few ? A.g.Food / A.sales : null, foodInclPay = A.sales && !few && A.g.Payables ? (A.g.Food + A.g.Payables) / A.sales : null;
  const perDay = x => x.salesDays.length ? x.salesAll / x.salesDays.length : null;
  const prev = P ? { sales: P.salesAll, purch: P.spend, oh: sum(P.oh.filter(r => r.amount != null && r.basis !== "missing" && r.basis !== "n/a").map(r => r.amount)) } : null;
  const pc = (v, base) => base ? `<span class="mut">${finPct(v / base)}</span>` : "";
  const line = (lab, v, opts = {}) => `<tr class="${opts.cls || ""}"><td>${lab}${opts.chip ? `<div class="fchip">${opts.chip}</div>` : ""}</td><td class="n num">${v == null ? `<span class="mut">${opts.na ? "n/a" : "not entered"}</span>` : `<span class="nw">${opts.neg ? "−" : ""}${peso(v)}</span>`}</td><td class="n">${v != null && opts.pct !== false ? pc(v, sales) : ""}</td>${prev ? `<td class="n num mut">${opts.pv != null ? peso(opts.pv) : ""}</td>` : ""}</tr>`;
  const cats = finCatSort(Object.keys(A.cats));
  const rows = [
    line("<b>Sales</b> <span class='tiny mut'>UTAK POS</span>", sales, { cls: "fsec", pct: false, pv: prev && prev.sales }),
    `<tr class="fhd"><td colspan="${prev ? 4 : 3}">Purchases <span class="tiny mut">the book, by category</span></td></tr>`,
    ...cats.map(c => line(`${esc(c)} <span class="tiny mut">${finGroup(c)}</span>`, A.cats[c], { neg: true, pv: P ? P.cats[c] : null })),
    line("<b>Purchases total</b>", purch, { cls: "fsub", neg: true, pv: prev && prev.purch }),
    `<tr class="fhd"><td colspan="${prev ? 4 : 3}">Overhead <span class="tiny mut">the book's block</span></td></tr>`,
    ...ohRows.map(r => line(`${esc(r.line)}${r.note ? `<div class="tiny mut">${esc(r.note)}</div>` : ""}`, r.basis === "missing" ? null : r.amount, { neg: true, na: r.basis === "n/a", chip: finSt(r.basis), pv: P ? (P.oh.find(x => x.line === r.line) || {}).amount : null })),
    line("<b>Overhead entered</b>", ohTot, { cls: "fsub", neg: true, pv: prev && prev.oh }),
    line(`<b>Result</b> <span class="tiny mut">${ohMiss.length ? `before ${ohMiss.length} line${ohMiss.length === 1 ? "" : "s"} not entered` : "management estimate"}</span>`, result, { cls: "fres", pct: true, pv: prev ? prev.sales - prev.purch - prev.oh : null })
  ];
  const head = `<tr><th>Line</th><th class="n">${esc(monthName(m))}</th><th class="n">% sales</th>${prev ? `<th class="n">${esc(monthName(pm))}</th>` : ""}</tr>`;
  const tiles = `<div class="grid2">${tile("Sales (UTAK)", peso(sales), `${A.salesDays.length} days${P ? " · per day " + delta(perDay(A), perDay(P), "vs " + monthName(pm)) : ""}`, "")}${tile("Result", `<span class="nw">${result < 0 ? "−" : ""}${kfmt(Math.abs(result))}</span>`, !full ? `<span class="chip fst"><i aria-hidden="true">◔</i>incomplete</span> book only to ${A.lastBook ? esc(dayName(A.lastBook)) : "—"}` : sales ? `${finPct(result / sales)} of sales${ohMiss.length ? " · before missing lines" : ""}` : "", "")}${tile("Food cost", finPct(food), food != null ? finBand(food) : `<span class="mut">${few ? `only ${A.cover.length} book day${A.cover.length === 1 ? "" : "s"} — too few` : "needs sales"}</span>`, "")}${tile("Purchases", peso(purch), A.sales ? `${finPct(purch / A.sales)} of sales on the book's days` : "", "")}</div>`;
  const fc = `<section class="card"><h2>Food cost <span class="tiny mut">food purchases ÷ UTAK sales on the days the book covers · band 30% / 34%</span></h2>${food != null ? `${finMeter(food)}<div class="small" style="margin-top:8px">${finPct(food)} ${finBand(food)} <span class="mut">· ${A.cover.length} days, ${peso(A.g.Food)} ÷ ${peso(A.sales)}</span></div>` : `<div class="small mut">Not shown: the book has only ${A.cover.length} day${A.cover.length === 1 ? "" : "s"} for this month.</div>`}${foodInclPay != null ? `<div class="tiny mut" style="margin-top:6px">With the book's paid PAYABLES line counted as food: ${finPct(foodInclPay)}. Supplier runs are mostly food, but the book does not split them.</div>` : ""}<div class="tiny mut" style="margin-top:6px">Purchases, not consumption: there is no opening/closing stock value in this yet, so a big delivery near month end moves the figure.</div></section>`;
  const pendPay = sum(D.pay.filter(r => r.run_from && r.run_from.startsWith(m)).map(r => r.pending));
  const notes = [];
  if (!full) notes.push(`The book for ${monthName(m)} runs only to ${A.lastBook ? dayName(A.lastBook) : "—"}, while sales cover the whole month — purchases are understated until the book is complete.`);
  if (pendPay > .5) notes.push(`${peso(pendPay)} of ${monthName(m)} payables is still pending and is not in this P&L (paid-only rule); it enters through the book's PAYABLES line once paid.`);
  if (ohNa.length) notes.push(`${ohNa.length} line${ohNa.length === 1 ? "" : "s"} marked not applicable this month.`);
  return shell("Finance", "Month P&L · " + esc(monthName(m)), finNav("pl") + finMonthChips(m, months, "finPickPL") + `<div class="card fwarnline"><span class="chip fst info"><i aria-hidden="true">≈</i>Management view</span> <span class="small">An estimate from UTAK sales and the book, not the accounts. Months before September 2026 are not compared.</span></div>` + tiles + fc +
    `<section class="card"><h2>Statement</h2><div class="fscroll"><table class="t fpl"><thead>${head}</thead><tbody>${rows.join("")}</tbody></table></div>${notes.length ? `<ul class="ins" style="margin-top:12px">${notes.map(n => `<li><span>○</span><div>${esc(n)}</div></li>`).join("")}</ul>` : ""}</section>` + finSrc(["book", "oh", "pay"]) + `<div class="tiny mut">UTAK sales: ${esc(SALES_HISTORY.source)}.</div>`, { back: "#/finance" });
}
function finPickPL(m) { FIN.plMonth = m; render(); }
function finSup(i) { const s = FIN.eSups[i]; FIN.eSup = FIN.eSup === s ? "all" : s; FIN.eDays = 10; render(); }
