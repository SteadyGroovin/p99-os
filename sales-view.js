/* Pizza 99 OS — Sales tab v2 (2026-10-28). Reads SD / SDAYS / LAST_DAY from app.js (SALES_HISTORY from Supabase).
   Patterns taken from Square (range presets, comparison to the previous period, hourly view), Lightspeed (hour x weekday heat map),
   Toast (a few decision-ready reports instead of a wall of numbers) and Restaurant365 (what sells). Colours follow the dataviz rules:
   one blue for magnitude, fixed categorical order, status colours only for up/down, every chart has a table behind it. */
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const wdOf = d => (new Date(d + "T00:00:00").getDay() + 6) % 7;
const RANGES = [["day", "Day"], ["7", "7 days"], ["30", "30 days"], ["90", "90 days"], ["365", "12 months"], ["all", "All"]];
let salesRange = "30", salesDay = null, salesItemBy = "gross", salesTable = false, salesTab = "overview", salesYestMiss = false;
const bizToday = () => ymd(new Date(Date.now() - 4 * 3600e3)); const bizYesterday = () => addDays(bizToday(), -1);
const kfmt = v => v >= 1e6 ? "₱" + (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : v >= 1e3 ? "₱" + (v / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "k" : "₱" + Math.round(v);
const monthName = m => new Date(m + "-01T00:00:00").toLocaleDateString("en-PH", { month: "short", year: "numeric" });
const sum = a => a.reduce((s, x) => s + x, 0);
const pct = (a, b) => b ? (a - b) / b : null;

/* ---------- data ---------- */
function calDays(from, to) { const o = []; for (let d = from; d <= to; d = addDays(d, 1)) o.push(d); return o; }
function rangeOf(r, end) {
  const first = SDAYS[0]; let n = r === "all" ? null : +r;
  const start = n ? (addDays(end, -(n - 1)) < first ? first : addDays(end, -(n - 1))) : first;
  const days = calDays(start, end);
  let prev = null;
  if (n) { const pe = addDays(start, -1), ps = addDays(pe, -(days.length - 1)); if (ps >= first) prev = calDays(ps, pe); }
  return { days, prev, n: days.length };
}
function agg(days) {
  const a = { total: 0, tickets: 0, cashbox: 0, cash: 0, gcash: 0, card: 0, slices: 0, wholes: 0, trading: 0, items: {}, cats: {}, daily: [], bestDay: null, worstDay: null };
  days.forEach(d => {
    const x = SD[d]; a.daily.push(x || null); if (!x) return;
    a.trading++; a.total += x.total; a.tickets += x.tickets; a.cashbox += x.cashbox_opens || 0;
    a.cash += x.pay.cash || 0; a.gcash += x.pay.gcash || 0; a.card += x.pay.card || 0;
    if (!a.bestDay || x.total > SD[a.bestDay].total) a.bestDay = d;
    if (!a.worstDay || x.total < SD[a.worstDay].total) a.worstDay = d;
    x.items.forEach(([cat, item, q, g]) => {
      const k = cat + "|" + item; const o = a.items[k] = a.items[k] || { cat, item, qty: 0, gross: 0 }; o.qty += q; o.gross += g;
      const c = a.cats[cat] = a.cats[cat] || { cat, qty: 0, gross: 0 }; c.qty += q; c.gross += g;
      if (cat === "Pizza Slice") a.slices += q; if (cat === "Pizza Whole") a.wholes += q;
    });
  });
  a.avgTicket = a.tickets ? a.total / a.tickets : 0; a.perDay = a.trading ? a.total / a.trading : 0;
  a.gshare = a.total ? a.gcash / (a.cash + a.gcash + a.card || 1) : 0;
  return a;
}
function bucket(days, size) {
  if (size === 1) return days.map(d => ({ key: d, label: dayName(d), v: SD[d] ? SD[d].total : null, day: d }));
  const out = []; let cur = null;
  days.forEach(d => { const k = addDays(d, -wdOf(d)); if (!cur || cur.key !== k) { cur = { key: k, label: "Week of " + dayName(k), v: null, day: null, n: 0 }; out.push(cur); } cur.n++; if (SD[d]) cur.v = (cur.v || 0) + SD[d].total; });
  out.forEach(b => { if (b.n < 7) b.v = null; }); /* a part-week would show as a false dip */
  return out;
}

/* ---------- little pieces ---------- */
function delta(cur, prev, label) {
  const p = pct(cur, prev); if (p == null) return `<span class="mut">${label ? "no earlier data" : ""}</span>`;
  const flat = Math.abs(p) < 0.01; const cls = flat ? "flat" : p > 0 ? "up" : "down"; const arrow = flat ? "▬" : p > 0 ? "▲" : "▼";
  return `<span class="dl ${cls}"><i>${arrow}</i>${Math.round(Math.abs(p) * 100)}%</span>${label ? ` <span class="mut">${esc(label)}</span>` : ""}`;
}
function spark(vals, w = 96, h = 28) {
  const v = vals.map(x => x == null ? null : x); const real = v.filter(x => x != null); if (real.length < 2) return "";
  const mn = Math.min(...real), mx = Math.max(...real), rg = (mx - mn) || 1; const st = (w - 4) / (v.length - 1);
  let d = "", pen = false; v.forEach((x, i) => { if (x == null) { pen = false; return; } d += `${pen ? "L" : "M"}${(2 + i * st).toFixed(1)} ${(h - 3 - (h - 6) * (x - mn) / rg).toFixed(1)}`; pen = true; });
  const li = v.length - 1 - [...v].reverse().findIndex(x => x != null);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="trend"><path d="${d}"/><circle cx="${(2 + li * st).toFixed(1)}" cy="${(h - 3 - (h - 6) * (v[li] - mn) / rg).toFixed(1)}" r="2.5"/></svg>`;
}
const tile = (lab, val, sub, sp) => `<section class="card kt"><div class="lab">${lab}</div><div class="val num">${val}</div><div class="trend">${sub}</div>${sp ? `<div class="sp">${sp}</div>` : ""}</section>`;
function stackBar(parts, fmtv) {
  const tot = sum(parts.map(p => p.v)) || 1;
  return `<div class="stack" role="img">${parts.filter(p => p.v > 0).map(p => `<i style="flex:${p.v};background:${p.c}" data-tt="${esc(p.name)}|${esc(fmtv(p.v))} · ${Math.round(100 * p.v / tot)}%"></i>`).join("")}</div>
  <div class="legend">${parts.filter(p => p.v > 0).map(p => `<span><b style="background:${p.c}"></b>${esc(p.name)} <span class="num">${Math.round(100 * p.v / tot)}%</span> <span class="mut num">${esc(fmtv(p.v))}</span></span>`).join("")}</div>`;
}
const CATC = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"];
function catParts(cats, key) {
  const arr = Object.values(cats).sort((a, b) => b[key] - a[key]); const top = arr.slice(0, 4);
  const parts = top.map((c, i) => ({ name: c.cat, v: c[key], c: CATC[i] })); const rest = sum(arr.slice(4).map(c => c[key]));
  if (rest > 0) parts.push({ name: "Other", v: rest, c: "var(--sother)" }); return parts;
}

/* ---------- trend chart (bars up to 45 points, area above), previous period dashed, hover + tap ---------- */
window.CH = window.CH || {};
function trendChart(id, pts, prevPts, { onDay = true } = {}) {
  const W = 640, H = 230, L = 46, R = 10, T = 12, B = 28; const n = pts.length; if (!n) return "";
  const vals = pts.map(p => p.v || 0).concat((prevPts || []).map(p => p.v || 0)); const mx0 = Math.max(...vals, 1);
  const mag = Math.pow(10, Math.floor(Math.log10(mx0))); const nice = [1, 2, 2.5, 5, 10].map(x => x * mag).find(x => x >= mx0 * 1.02) || mx0; const mx = nice;
  const iw = W - L - R, ih = H - T - B; const bw = iw / n; const X = i => L + bw * (i + .5); const Y = v => T + ih - ih * v / mx;
  const bars = n <= 45;
  let g = [0, .25, .5, .75, 1].map(f => `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(mx * f)}" y2="${Y(mx * f)}"/><text x="${L - 6}" y="${Y(mx * f) + 4}" text-anchor="end">${kfmt(mx * f)}</text>`).join("");
  let marks = "";
  if (bars) marks = pts.map((p, i) => p.v == null ? "" : `<rect class="sbar" data-i="${i}" x="${(L + bw * i + Math.max(1, bw * .14)).toFixed(1)}" y="${Y(p.v).toFixed(1)}" width="${Math.max(2, bw * .72).toFixed(1)}" height="${(T + ih - Y(p.v)).toFixed(1)}" rx="${bw > 9 ? 3 : 1.5}"/>`).join("");
  else {
    let d = "", pen = false, first = null, last = null; pts.forEach((p, i) => { if (p.v == null) { pen = false; return; } d += `${pen ? "L" : "M"}${X(i).toFixed(1)} ${Y(p.v).toFixed(1)}`; if (first == null) first = i; last = i; pen = true; });
    marks = `<path class="area" d="${d}L${X(last).toFixed(1)} ${T + ih}L${X(first).toFixed(1)} ${T + ih}Z"/><path class="line" d="${d}"/>`;
  }
  let pv = ""; if (prevPts && prevPts.length) { let d = "", pen = false; prevPts.forEach((p, i) => { if (i >= n) return; if (p.v == null) { pen = false; return; } d += `${pen ? "L" : "M"}${X(i).toFixed(1)} ${Y(p.v).toFixed(1)}`; pen = true; }); pv = `<path class="prev" d="${d}"/>`; }
  const step = Math.max(1, Math.ceil(n / (bars ? 7 : 6))); const xl = pts.map((p, i) => i % step === 0 ? `<text x="${X(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(p.label.replace("Week of ", "").split(" ").slice(-2).join(" "))}</text>` : "").join("");
  CH[id] = { pts, prevPts, L, bw, W, X, Y, T, ih, last: -1, onDay };
  return `<svg class="chart trend" id="${id}" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Sales over time">${g}${pv}${marks}<line class="xh" x1="0" x2="0" y1="${T}" y2="${T + ih}" style="display:none"/><circle class="xd" r="4.5" style="display:none"/>${xl}<rect class="hit" x="${L}" y="${T}" width="${iw}" height="${ih}" onpointermove="trendMove(event,'${id}')" onpointerdown="trendMove(event,'${id}')" onpointerleave="trendOut('${id}')" onclick="trendTap('${id}')"/></svg>`;
}
function trendMove(ev, id) {
  const c = CH[id], svg = document.getElementById(id); if (!c || !svg) return; const r = svg.getBoundingClientRect(); const x = (ev.clientX - r.left) / r.width * c.W;
  const i = Math.max(0, Math.min(c.pts.length - 1, Math.floor((x - c.L) / c.bw))); c.last = i; const p = c.pts[i], pp = c.prevPts && c.prevPts[i];
  const xh = svg.querySelector(".xh"), xd = svg.querySelector(".xd"); xh.setAttribute("x1", c.X(i)); xh.setAttribute("x2", c.X(i)); xh.style.display = ""; svg.querySelectorAll(".sbar.on").forEach(b => b.classList.remove("on")); const b = svg.querySelector(`.sbar[data-i="${i}"]`); if (b) b.classList.add("on");
  if (p.v != null && !b) { xd.setAttribute("cx", c.X(i)); xd.setAttribute("cy", c.Y(p.v)); xd.style.display = ""; } else xd.style.display = "none";
  const rows = [[p.label, p.v == null ? "no data" : peso(p.v), "var(--s1)"]]; if (pp && pp.v != null) rows.push([pp.label, peso(pp.v) + (p.v != null ? "  " + (p.v >= pp.v ? "▲" : "▼") + Math.round(Math.abs(pct(p.v, pp.v) || 0) * 100) + "%" : ""), "var(--mut)"]);
  showTip(ev, rows, c.onDay && p.day && p.v != null ? "Tap to open the day" : "");
}
function trendOut(id) { const svg = document.getElementById(id); if (svg) { svg.querySelector(".xh").style.display = "none"; svg.querySelector(".xd").style.display = "none"; svg.querySelectorAll(".sbar.on").forEach(b => b.classList.remove("on")); } hideTip(); }
function trendTap(id) { const c = CH[id]; if (!c || c.last < 0) return; const p = c.pts[c.last]; if (c.onDay && p && p.day && p.v != null) { salesDay = p.day; salesRange = "day"; hideTip(); render(); window.scrollTo(0, 0); } }

/* ---------- tooltip (one element, textContent only) ---------- */
function tipEl() { let t = document.getElementById("tt"); if (!t) { t = document.createElement("div"); t.id = "tt"; t.className = "tt"; document.body.appendChild(t); } return t; }
function showTip(ev, rows, foot) {
  const t = tipEl(); t.textContent = ""; rows.forEach(([a, b, c]) => { const r = document.createElement("div"); r.className = "r"; const k = document.createElement("i"); k.style.background = c || "transparent"; const s = document.createElement("span"); s.textContent = a; const v = document.createElement("b"); v.textContent = b; r.append(k, s, v); t.appendChild(r); });
  if (foot) { const f = document.createElement("div"); f.className = "f"; f.textContent = foot; t.appendChild(f); }
  t.style.display = "block"; const w = t.offsetWidth, h = t.offsetHeight; let x = ev.clientX + 14, y = ev.clientY - h - 12; if (x + w > innerWidth - 8) x = ev.clientX - w - 14; if (x < 8) x = 8; if (y < 8) y = ev.clientY + 18; t.style.left = x + "px"; t.style.top = y + "px";
}
function hideTip() { const t = document.getElementById("tt"); if (t) t.style.display = "none"; }
document.addEventListener("pointermove", ev => { const el = ev.target.closest && ev.target.closest("[data-tt]"); if (!el) { if (!ev.target.closest || !ev.target.closest(".hit")) hideTip(); return; } const [a, b] = el.dataset.tt.split("|"); showTip(ev, [[a, b || "", el.dataset.c || null]]); });
document.addEventListener("pointerdown", ev => { const el = ev.target.closest && ev.target.closest("[data-tt]"); if (el) { const [a, b] = el.dataset.tt.split("|"); showTip(ev, [[a, b || "", null]]); } else if (!ev.target.closest(".hit")) hideTip(); });

/* ---------- when we sell: weekday x hour heat map + weekday bars ---------- */
function heat(days) {
  const cnt = Array(7).fill(0), H = Array.from({ length: 7 }, () => Array(24).fill(0)), tot = Array(7).fill(0);
  days.forEach(d => { const x = SD[d]; if (!x) return; const w = wdOf(d); cnt[w]++; tot[w] += x.total; x.hours.forEach((v, h) => { H[w][h] += v; }); });
  const order = []; for (let k = 4; k < 28; k++) order.push(k % 24);
  const hourTot = order.map(h => sum(H.map(r => r[h]))); let a = hourTot.findIndex(v => v > 0), b = hourTot.length - 1 - [...hourTot].reverse().findIndex(v => v > 0); if (a < 0) return { html: "", cnt, tot, H, order };
  const hrs = order.slice(a, b + 1); let mx = 0, best = null; hrs.forEach(h => H.forEach((r, w) => { const v = cnt[w] ? r[h] / cnt[w] : 0; if (v > mx) { mx = v; best = [w, h, v]; } }));
  const lab = h => (h % 12 || 12) + (h < 12 ? "a" : "p");
  const cells = WD.map((nm, w) => `<div class="hr">${nm}</div>` + hrs.map(h => { const v = cnt[w] ? H[w][h] / cnt[w] : 0; const f = mx ? v / mx : 0; return `<div class="hc" tabindex="0" style="--f:${(Math.pow(f, .7) * 100).toFixed(0)}%" data-tt="${nm} ${pad2(h)}:00|${v ? peso(v) + " avg" : "no sales"}${cnt[w] ? " · " + cnt[w] + " days" : ""}" aria-label="${nm} ${pad2(h)}:00 ${peso(v)}"></div>`; }).join("")).join("");
  const axis = `<div></div>` + hrs.map((h, i) => `<div class="ha">${i % 2 === 0 ? lab(h) : ""}</div>`).join("");
  return { html: `<div class="heat" style="--cols:${hrs.length}">${cells}${axis}</div><div class="hl"><span>less</span><i></i><span>more</span><span class="mut">average ₱ per hour of an open day</span></div>`, cnt, tot, H, order, best, hrs };
}
function weekdayBars(h) {
  const avg = WD.map((_, w) => h.cnt[w] ? h.tot[w] / h.cnt[w] : 0); const mx = Math.max(...avg, 1); const best = avg.indexOf(mx);
  return `<div class="hb">${avg.map((v, w) => `<div class="hbr ${w === best ? "best" : ""}" data-tt="${WD[w]}|${peso(v)} avg · ${h.cnt[w]} days"><span class="nm">${WD[w]}</span><span class="tr"><i style="width:${(100 * v / mx).toFixed(1)}%"></i></span><span class="vl num">${kfmt(v)}</span></div>`).join("")}</div>`;
}

/* ---------- what sells ---------- */
function itemBars(a, by) {
  const arr = Object.values(a.items).sort((x, y) => y[by] - x[by]).slice(0, 8); const mx = arr[0] ? arr[0][by] : 1; const tot = sum(Object.values(a.items).map(i => i[by])) || 1;
  return `<div class="hb items">${arr.map(i => `<div class="hbr" data-tt="${esc(i.item)}|${fmt(i.qty)} sold · ${peso(i.gross)}"><span class="nm">${esc(i.item)}<small>${esc(i.cat)}</small></span><span class="tr"><i style="width:${(100 * i[by] / mx).toFixed(1)}%"></i></span><span class="vl num">${by === "gross" ? kfmt(i.gross) : fmt(i.qty)}<small>${Math.round(100 * i[by] / tot)}%</small></span></div>`).join("")}</div>`;
}

/* ---------- insights, in plain words ---------- */
function insights(a, p, h, days) {
  const L = [];
  if (a.bestDay) L.push(["▲", `Best day: <b>${esc(dayName(a.bestDay))}</b>, ${peso(SD[a.bestDay].total)} on ${SD[a.bestDay].tickets} tickets.`]);
  if (h.best) L.push(["◔", `Busiest hour: <b>${WD[h.best[0]]} ${pad2(h.best[1])}:00</b>, about ${peso(h.best[2])} in that hour on an average ${WD[h.best[0]]}.`]);
  const avg = WD.map((_, w) => h.cnt[w] ? h.tot[w] / h.cnt[w] : null); const ok = avg.map((v, w) => v == null ? null : [v, w]).filter(Boolean).sort((x, y) => y[0] - x[0]);
  if (ok.length >= 3) { const hi = ok[0], lo = ok[ok.length - 1]; L.push(["▤", `<b>${WD[hi[1]]}</b> averages ${peso(hi[0])}, <b>${WD[lo[1]]}</b> only ${peso(lo[0])} (${Math.round(100 * (hi[0] / lo[0] - 1))}% more).`]); }
  const pz = a.slices + a.wholes; if (pz) L.push(["◐", `Slices are <b>${Math.round(100 * a.slices / pz)}%</b> of pizzas sold: ${fmt(a.slices)} slices, ${fmt(a.wholes)} whole.`]);
  if (p) { const pa = pct(a.avgTicket, p.avgTicket); if (pa != null && Math.abs(pa) >= 0.02) L.push([pa > 0 ? "▲" : "▼", `Average ticket ${pa > 0 ? "rose" : "fell"} ${Math.round(Math.abs(pa) * 100)}% to ${peso(a.avgTicket)}; tickets are ${delta(a.tickets, p.tickets).replace(/<[^>]+>/g, "")} on the previous period.`]); }
  if (a.trading) { const cbd = a.cashbox / a.trading; L.push(["▣", `Cash box opened <b>${cbd.toFixed(1)}×</b> a day without a sale${p && p.trading ? ` (was ${(p.cashbox / p.trading).toFixed(1)}×)` : ""}.`]); }
  const missing = days.length - a.trading; if (missing > 0) L.push(["○", `${missing} of ${days.length} days have no sales data (closed or not synced yet).`]);
  return `<ul class="ins">${L.map(([i, t]) => `<li><span>${i}</span><div>${t}</div></li>`).join("")}</ul>`;
}

/* ---------- views ---------- */
function rangeBar() {
  const y = bizYesterday();
  const chips = [["yest", "Yesterday", salesRange === "day" && salesDay === y], ["day", "Pick day", salesRange === "day" && salesDay !== y]].concat(RANGES.slice(1).map(([k, l]) => [k, l, salesRange === k]));
  return `<div class="rng" role="tablist">${chips.map(([k, l, on]) => `<button class="${on ? "on" : ""}" role="tab" aria-selected="${on}" onclick="pickRange('${k}')">${l}</button>`).join("")}</div>`;
}
function pickRange(k) {
  const y = bizYesterday(); salesYestMiss = false;
  if (k === "yest") { salesRange = "day"; if (SD[y]) salesDay = y; else { salesDay = LAST_DAY; salesYestMiss = true; } }
  else if (k === "day") { salesRange = "day"; if (salesDay === y || !SD[salesDay]) salesDay = SD[addDays(y, -1)] ? addDays(y, -1) : LAST_DAY; }
  else salesRange = k;
  render(); window.scrollTo(0, 0);
}
function viewSales() {
  if (!salesDay || !SD[salesDay]) salesDay = LAST_DAY;
  const tabs = `<div class="seg tabs2"><button class="btn ${salesTab === "overview" ? "on" : ""}" onclick="salesTab='overview';render()">Overview</button><button class="btn ${salesTab === "txns" ? "on" : ""}" onclick="salesTab='txns';render()">Transactions</button><button class="btn ${salesTab === "run" ? "on" : ""}" onclick="salesTab='run';render()">Morning run</button></div>`;
  if (salesTab === "txns") return viewTxns(tabs);
  if (salesTab === "run") return viewRuns(tabs);
  return salesRange === "day" ? viewSalesDay(tabs) : viewSalesRange(tabs);
}
function viewSalesRange(tabs) {
  const R = rangeOf(salesRange, LAST_DAY); const a = agg(R.days), p = R.prev ? agg(R.prev) : null; const size = R.n > 120 ? 7 : 1;
  const pts = bucket(R.days, size), pp = R.prev ? bucket(R.prev, size) : null; const h = heat(R.days);
  const lab = salesRange === "all" ? "" : `vs previous ${R.n} days`;
  const daily = a.daily.map(x => x ? x.total : null), tk = a.daily.map(x => x ? x.tickets : null), at = a.daily.map(x => x && x.tickets ? x.total / x.tickets : null), gs = a.daily.map(x => { if (!x) return null; const t = (x.pay.cash || 0) + (x.pay.gcash || 0) + (x.pay.card || 0); return t ? (x.pay.gcash || 0) / t : null; });
  const wk = arr => { if (R.n <= 120) return arr; const o = []; for (let i = 0; i < arr.length; i += 7) { const c = arr.slice(i, i + 7).filter(x => x != null); o.push(c.length ? sum(c) / c.length : null); } return o; };
  const from = R.days[0], to = R.days[R.days.length - 1]; const dn = R.n > 200 ? (d => new Date(d + "T00:00:00").toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" })) : dayName;
  const hero = `<section class="card hero2"><div class="lab">Sales · ${esc(dn(from))} – ${esc(dn(to))}</div><div class="big num">${peso(a.total)}</div><div class="trend">${p ? delta(a.total, p.total, lab) : '<span class="mut">no full earlier period to compare yet</span>'}</div>
    <div class="sub num">${peso(a.perDay)} per open day · ${a.trading} open days${p ? ` · previous ${peso(p.total)}` : ""}</div>${spark(wk(daily), 520, 46)}</section>`;
  const tiles = `<div class="grid2">
    ${tile("Tickets", fmt(a.tickets), p ? delta(a.tickets, p.tickets) : "", spark(wk(tk)))}
    ${tile("Average ticket", peso(a.avgTicket), p ? delta(a.avgTicket, p.avgTicket) : "", spark(wk(at)))}
    ${tile("Pizzas", fmt(a.slices + a.wholes), `${fmt(a.slices)} slices · ${fmt(a.wholes)} whole`, "")}
    ${tile("GCash share", Math.round(a.gshare * 100) + "%", p ? `was ${Math.round(p.gshare * 100)}%` : "of takings", spark(wk(gs)))}
  </div>`;
  const chart = `<section class="card"><h2>Sales over time <span class="tiny mut">${size === 7 ? "per full week, Mon–Sun" : "per day"}${pp ? " · dashed = previous period" : ""}</span></h2>${trendChart("tc", pts, pp)}
    <div class="legend"><span><b style="background:var(--s1)"></b>${size === 7 ? "Week" : "Day"}</span>${pp ? `<span><b class="dash"></b>Previous period</span>` : ""}<span class="mut">${size === 1 ? "tap a bar to open the day" : ""}</span></div>
    <details class="tbl" ${salesTable ? "open" : ""} ontoggle="salesTable=this.open"><summary>Show as table</summary><table class="t"><thead><tr><th>${size === 7 ? "Week" : "Day"}</th><th class="n">Sales</th>${pp ? '<th class="n">Previous</th>' : ""}</tr></thead><tbody>${pts.slice().reverse().map((q, i) => `<tr><td>${esc(q.label)}</td><td class="n num">${q.v == null ? '<span class="mut">no data</span>' : peso(q.v)}</td>${pp ? `<td class="n num mut">${pp[pts.length - 1 - i] && pp[pts.length - 1 - i].v != null ? peso(pp[pts.length - 1 - i].v) : ""}</td>` : ""}</tr>`).join("")}</tbody></table></details></section>`;
  const when = h.html ? `<section class="card"><h2>When we sell <span class="tiny mut">weekday × hour</span></h2>${h.html}</section>
    <section class="card"><h2>Average per weekday</h2>${weekdayBars(h)}<div class="tiny mut" style="margin-top:6px">Open days only; the best weekday is highlighted.</div></section>` : "";
  const sells = `<section class="card"><div class="split"><h2>What sells</h2><div class="seg sm"><button class="btn ${salesItemBy === "gross" ? "on" : ""}" onclick="salesItemBy='gross';render()">₱</button><button class="btn ${salesItemBy === "qty" ? "on" : ""}" onclick="salesItemBy='qty';render()">Qty</button></div></div>${itemBars(a, salesItemBy)}</section>
    <section class="card"><h2>Mix <span class="tiny mut">by category, ₱</span></h2>${stackBar(catParts(a.cats, "gross"), peso)}<h2 style="margin-top:18px">Payment <span class="tiny mut">how customers paid</span></h2>${stackBar([{ name: "Cash", v: a.cash, c: CATC[0] }, { name: "GCash", v: a.gcash, c: CATC[1] }, { name: "Card", v: a.card, c: CATC[2] }], peso)}</section>`;
  let months = ""; if (R.n >= 90) {
    const ms = [...new Set(R.days.filter(d => SD[d]).map(d => d.slice(0, 7)))]; const rows = ms.map(m => { const ds = SDAYS.filter(d => d.startsWith(m)); const aa = agg(ds); return { m, ...aa, ds: ds.length }; });
    const mx = Math.max(...rows.map(r => r.total), 1);
    months = `<section class="card"><h2>By month</h2><table class="t mt"><thead><tr><th>Month</th><th class="n">Sales</th><th class="n">vs month before</th><th class="n">Avg ticket</th></tr></thead><tbody>${rows.slice().reverse().map((r, i, arr) => { const prv = arr[i + 1]; return `<tr><td>${monthName(r.m)}<div class="mbar"><i style="width:${(100 * r.total / mx).toFixed(0)}%"></i></div></td><td class="n num">${peso(r.total)}</td><td class="n">${prv ? delta(r.perDay, prv.perDay) : ""}</td><td class="n num">${peso(r.avgTicket)}</td></tr>`; }).join("")}</tbody></table><div class="tiny mut">Month-on-month compares sales per open day, so a short month is not penalised.</div></section>`;
  }
  return shell("Sales", `${esc(dn(from))} – ${esc(dn(to))}`, tabs + syncBar() + rangeBar() + hero + tiles + chart + `<section class="card"><h2>What the numbers say</h2>${insights(a, p, h, R.days)}</section>` + when + sells + months + `<div class="tiny mut">Source: ${esc(SALES_HISTORY.source)}. Tickets exclude cash-box openings.</div>`);
}
function viewSalesDay(tabs) {
  const d = SD[salesDay], i = SDAYS.indexOf(salesDay), prev = SDAYS[i - 1], next = SDAYS[i + 1];
  const nav = `<div class="daynav"><button class="btn" ${prev ? "" : "disabled"} onclick="salesDay='${prev}';render()" aria-label="Previous day">${ic("chevron-left")}</button><input class="in" type="date" value="${salesDay}" min="${SDAYS[0]}" max="${LAST_DAY}" onchange="if(SD[this.value]){salesDay=this.value;render()}"><button class="btn" ${next ? "" : "disabled"} onclick="salesDay='${next}';render()" aria-label="Next day">${ic("chevron-right")}</button></div>`;
  const w = wdOf(salesDay); const same = []; for (let k = 1; same.length < 8 && k <= 80; k++) { const x = addDays(salesDay, -7 * k); if (SD[x]) same.push(x); } const sa = agg(same); const typ = same.length ? sa.total / same.length : null;
  const hrs = []; for (let k = 4; k < 28; k++) hrs.push(k % 24); const first = hrs.findIndex(h => d.hours[h] > 0), lastI = hrs.length - 1 - [...hrs].reverse().findIndex(h => d.hours[h] > 0); const hh = hrs.slice(Math.max(0, first), lastI + 1);
  const typH = hh.map(h => same.length ? sum(same.map(x => SD[x].hours[h])) / same.length : null);
  const W = 640, H = 200, L = 46, R = 10, T = 12, B = 26, iw = W - L - R, ih = H - T - B, bw = iw / hh.length; const mx0 = Math.max(...hh.map(h => d.hours[h]), ...typH.map(v => v || 0), 1); const mag = Math.pow(10, Math.floor(Math.log10(mx0))); const mx = [1, 2, 2.5, 5, 10].map(x => x * mag).find(x => x >= mx0 * 1.02) || mx0; const Y = v => T + ih - ih * v / mx;
  const bars = hh.map((h, k) => `<rect class="sbar" x="${(L + bw * k + bw * .14).toFixed(1)}" y="${Y(d.hours[h]).toFixed(1)}" width="${(bw * .72).toFixed(1)}" height="${(T + ih - Y(d.hours[h])).toFixed(1)}" rx="3" data-tt="${pad2(h)}:00|${peso(d.hours[h])}${typH[k] != null ? " · usual " + peso(typH[k]) : ""}"/>`).join("");
  const ty = typH.every(v => v == null) ? "" : `<path class="prev" d="${typH.map((v, k) => `${k ? "L" : "M"}${(L + bw * (k + .5)).toFixed(1)} ${Y(v || 0).toFixed(1)}`).join("")}"/>`;
  const grid = [0, .5, 1].map(f => `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(mx * f)}" y2="${Y(mx * f)}"/><text x="${L - 6}" y="${Y(mx * f) + 4}" text-anchor="end">${kfmt(mx * f)}</text>`).join("");
  const xl = hh.map((h, k) => k % 2 === 0 ? `<text x="${(L + bw * (k + .5)).toFixed(1)}" y="${H - 7}" text-anchor="middle">${pad2(h)}</text>` : "").join("");
  const cats = {}; d.items.forEach(([cat, item, q, g]) => { const c = cats[cat] = cats[cat] || { cat, qty: 0, gross: 0, rows: [] }; c.qty += q; c.gross += g; c.rows.push([item, q, g]); });
  const co = Object.values(cats).sort((a, b) => b.gross - a.gross); const slices = (cats["Pizza Slice"] || { qty: 0 }).qty, wholes = (cats["Pizza Whole"] || { qty: 0 }).qty;
  const tix = d.tickets;
  return shell("Sales", dayLong(salesDay), tabs + syncBar() + yestBanner() + rangeBar() + nav + `
    <section class="card hero2"><div class="lab">${esc(WD[w])} sales</div><div class="big num">${peso(d.total)}</div><div class="trend">${typ != null ? delta(d.total, typ, `vs a usual ${WD[w]} (${peso(typ)}, last ${same.length})`) : '<span class="mut">no earlier same weekday</span>'}</div></section>
    <div class="grid2">${tile("Tickets", tix, `avg ${peso(d.total / Math.max(1, tix))}`, "")}${tile("Pizzas", `${fmt(slices + wholes)}`, `${fmt(slices)} slices · ${fmt(wholes)} whole`, "")}${tile("Cash box", d.cashbox_opens + "×", "opened without a sale", "")}${tile("Cashiers", d.cashiers.length, d.cashiers.map(([n, k]) => `${esc(n || "—")} ${k}`).join(" · "), "")}</div>
    <section class="card"><h2>By hour <span class="tiny mut">dashed = a usual ${WD[w]}</span></h2><svg class="chart trend" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Sales by hour">${grid}${ty}${bars}${xl}</svg></section>
    <section class="card"><h2>Payment</h2>${stackBar([{ name: "Cash", v: d.pay.cash || 0, c: CATC[0] }, { name: "GCash", v: d.pay.gcash || 0, c: CATC[1] }, { name: "Card", v: d.pay.card || 0, c: CATC[2] }], peso)}</section>
    ${co.map(c => `<section class="card"><h2>${esc(c.cat)} <span class="tiny mut">${fmt(c.qty)} · ${peso(c.gross)}</span></h2><div class="hb items">${c.rows.sort((a, b) => b[2] - a[2]).map(([item, q, g]) => `<div class="hbr" data-tt="${esc(item)}|${fmt(q)} · ${peso(g)}"><span class="nm">${esc(item)}</span><span class="tr"><i style="width:${(100 * g / (c.rows[0][2] || 1)).toFixed(1)}%"></i></span><span class="vl num">${fmt(q)}<small>${kfmt(g)}</small></span></div>`).join("")}</div></section>`).join("")}
    <div class="tiny mut">Source: ${esc(SALES_HISTORY.source)}. Item lines before discount; totals after.</div>`);
}

/* ---------- sync with UTAK (Supabase edge function utak-sync) ---------- */
const SYNC = { busy: false, msg: "", last: null, loaded: false };
async function loadSyncInfo() {
  try { const { data } = await sb.from("sync_log").select("at,trigger,ok,through_day,tickets,detail").order("at", { ascending: false }).limit(1); SYNC.last = data && data[0] || null; } catch (e) { /* the label just says never */ }
  render();
}
function syncBar() {
  if (typeof sb === "undefined") return "";
  if (!SYNC.loaded) { SYNC.loaded = true; loadSyncInfo(); }
  const y = bizYesterday(); const behind = LAST_DAY < y ? Math.round((new Date(y + "T00:00:00") - new Date(LAST_DAY + "T00:00:00")) / 864e5) : 0;
  const l = SYNC.last; const when = l ? new Date(l.at).toLocaleString("en-PH", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Manila" }) + " · " + (l.trigger === "nightly" ? "nightly" : "button") + (l.ok ? "" : " · failed") : "no sync recorded yet";
  return `<div class="syncbar ${behind ? "stale" : ""}"><div class="sb-t"><b>Data to ${esc(dayName(LAST_DAY))}</b> ${behind ? `<span class="dl down"><i>▼</i>${behind} day${behind > 1 ? "s" : ""} behind</span>` : `<span class="dl up"><i>●</i>up to date</span>`}<div class="tiny mut">Last sync: ${esc(when)}${SYNC.msg ? " · " + esc(SYNC.msg) : ""}</div></div><button class="btn ${behind ? "primary" : ""}" ${SYNC.busy ? "disabled" : ""} onclick="syncNow()">${SYNC.busy ? "Syncing…" : "Sync now"}</button></div>`;
}
const yestBanner = () => salesYestMiss ? `<div class="card warnbox">${chip("warn", "Yesterday is not synced yet")}<div class="small" style="margin-top:6px">${esc(dayLong(bizYesterday()))} is not in the database. This shows the last synced day. Press <b>Sync now</b> above.</div></div>` : "";
async function syncNow() {
  if (SYNC.busy) return; SYNC.busy = true; SYNC.msg = "reading UTAK…"; render();
  try {
    let more = true, n = 0, tk = 0;
    while (more && n++ < 8) {
      const { data, error } = await sb.functions.invoke("utak-sync", { body: {} });
      let r = data;
      if (error) { try { r = await error.context.json(); } catch (e) { r = { ok: false, errors: [error.message] }; } }
      if (!r || !r.ok) throw new Error((r && (r.error || (r.errors || []).join("; "))) || "sync failed");
      tk += r.tickets; more = r.more; SYNC.msg = `${tk} tickets read…`; render();
    }
    const { data: sh, error: e2 } = await sb.rpc("sales_history", { p_store: "P99" }); if (e2) throw e2;
    const nd = Object.assign({}, sh.days); window.SALES_HISTORY = sh; Object.keys(SD).forEach(k => delete SD[k]); Object.assign(SD, nd); SDAYS.length = 0; SDAYS.push(...Object.keys(SD).sort()); LAST_DAY = SDAYS[SDAYS.length - 1];
    TX.cache = {}; SYNC.msg = `done, ${tk} tickets checked`;
  } catch (e) { SYNC.msg = "failed: " + (e.message || e); }
  SYNC.busy = false; await loadSyncInfo();
}

/* ---------- Transactions: every ticket, filter + sort; cash box opened without a sale ---------- */
const TX = { range: "7", day: null, kind: "all", pay: "all", cashier: "all", disc: false, q: "", sort: "new", cache: {}, loading: false, err: null, errKey: null, open: {}, limit: 100 };
const payKind = p => { p = String(p || "").toLowerCase(); return p.includes("gcash") ? "gcash" : p.includes("cash") ? "cash" : (p.includes("card") || p.includes("maya")) ? "card" : "other"; };
const MNL = { timeZone: "Asia/Manila" };
const tTime = iso => new Date(iso).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: false, ...MNL });
const tDay = iso => new Date(iso).toLocaleDateString("en-PH", { weekday: "short", day: "numeric", month: "short", ...MNL });
function txRange() { const y = bizYesterday(), t = bizToday(); if (TX.range === "today") return [t, t]; if (TX.range === "yest") return [y, y]; if (TX.range === "day") { const d = TX.day || y; return [d, d]; } const n = +TX.range; return [addDays(t, -(n - 1)), t]; }
async function loadTx() {
  const [a, b] = txRange(), key = a + "|" + b; if (TX.cache[key] || TX.loading) return;
  TX.loading = true; TX.err = null; render();
  try {
    const rows = [];
    for (let f = 0; ; f += 1000) { const { data, error } = await sb.from("pos_ticket").select("txn_key,business_day,rung_at,receipt_no,cashier,payment_type,total,cash_box_open,note").eq("store", "P99").gte("business_day", a).lte("business_day", b).order("rung_at", { ascending: false }).range(f, f + 999); if (error) throw error; rows.push(...data); if (data.length < 1000) break; }
    const by = {};
    for (let f = 0; ; f += 1000) { const { data, error } = await sb.from("pos_ticket_line").select("txn_key,line,category,item,option,qty,price,line_gross,item_discount_pct,item_discount_type,ticket_discount_pct,ticket_discount_type,item_note").eq("store", "P99").gte("business_day", a).lte("business_day", b).order("txn_key").order("line").range(f, f + 999); if (error) throw error; data.forEach(l => (by[l.txn_key] = by[l.txn_key] || []).push(l)); if (data.length < 1000) break; }
    rows.forEach(t => { t.lines = by[t.txn_key] || []; t.disc = t.lines.some(l => (l.item_discount_pct || 0) > 0 || (l.ticket_discount_pct || 0) > 0); t.pk = payKind(t.payment_type); t.ts = new Date(t.rung_at).getTime(); });
    TX.cache[key] = rows;
  } catch (e) { TX.err = e.message || String(e); TX.errKey = key; }
  TX.loading = false; render();
}
const txSet = (k, v) => { TX[k] = v; TX.limit = 100; if (k === "range" && v !== "day") TX.day = null; render(); };
function txFilter(rows) {
  const q = TX.q.trim().toLowerCase();
  const f = rows.filter(t => (TX.kind === "all" || (TX.kind === "box" ? t.cash_box_open : !t.cash_box_open)) && (TX.pay === "all" || t.pk === TX.pay) && (TX.cashier === "all" || t.cashier === TX.cashier) && (!TX.disc || t.disc)
    && (!q || String(t.receipt_no).includes(q) || (t.cashier || "").toLowerCase().includes(q) || (t.note || "").toLowerCase().includes(q) || t.lines.some(l => (l.item || "").toLowerCase().includes(q))));
  const cmp = { new: (a, b) => b.ts - a.ts, old: (a, b) => a.ts - b.ts, high: (a, b) => (b.total || 0) - (a.total || 0), low: (a, b) => (a.total || 0) - (b.total || 0) }[TX.sort];
  return f.sort(cmp);
}
function txRow(t, multi) {
  const open = TX.open[t.txn_key], box = t.cash_box_open;
  const sumLines = t.lines.filter(l => l.category !== "Open Cash Box"); const sm = sumLines.slice(0, 3).map(l => `${fmt(l.qty)}× ${esc(l.item)}`).join(", ") + (sumLines.length > 3 ? ` +${sumLines.length - 3}` : "");
  const pk = { cash: "Cash", gcash: "GCash", card: "Card", other: esc(t.payment_type || "—") }[t.pk];
  return `<div class="txr ${box ? "box" : ""}" onclick="TX.open[${t.txn_key}]=!TX.open[${t.txn_key}];render()" role="button" tabindex="0">
    <div class="a"><b class="num">#${t.receipt_no ?? "—"}</b><span class="mut num">${multi ? esc(tDay(t.rung_at)) + " · " : ""}${tTime(t.rung_at)}</span></div>
    <div class="b">${box ? chip("warn", "Cash box opened, no sale") : `<span>${sm || '<span class="mut">no items</span>'}</span>`}<div class="tiny mut">${esc(t.cashier || "—")} · ${box ? "" : pk}${t.disc ? " · discount" : ""}${t.note ? " · " + esc(t.note) : ""}</div></div>
    <div class="c num">${box ? '<span class="mut">—</span>' : peso(t.total)}</div></div>
    ${open ? `<div class="txd">${t.lines.length ? `<table class="t"><tbody>${t.lines.map(l => `<tr><td>${fmt(l.qty)}× ${esc(l.item)}${l.option ? `<div class="tiny mut">${esc(l.option)}</div>` : ""}${(l.item_discount_pct || l.ticket_discount_pct) ? `<div class="tiny band-warn">${esc(l.item_discount_type || l.ticket_discount_type || "discount")} ${l.item_discount_pct || l.ticket_discount_pct}%</div>` : ""}${l.item_note ? `<div class="tiny mut">${esc(l.item_note)}</div>` : ""}</td><td class="n num">${peso(l.line_gross)}</td></tr>`).join("")}${(() => { const d = (t.total || 0) - sum(t.lines.map(l => l.line_gross || 0)); return Math.abs(d) >= 0.5 ? `<tr><td class="mut">Service charge / discounts</td><td class="n num mut">${d > 0 ? "+" : "−"}${peso(Math.abs(d))}</td></tr>` : ""; })()}</tbody></table>` : '<div class="mut small">No lines.</div>'}<div class="tiny mut">Ticket key ${t.txn_key} · ${esc(tDay(t.rung_at))} ${tTime(t.rung_at)} · ${esc(t.payment_type || "")}</div></div>` : ""}`;
}
function viewTxns(tabs) {
  const [a, b] = txRange(), key = a + "|" + b, rows = TX.cache[key];
  if (!rows && !TX.loading && TX.errKey !== key) setTimeout(loadTx, 0);
  const R = [["today", "Today"], ["yest", "Yesterday"], ["7", "7 days"], ["30", "30 days"], ["90", "90 days"], ["day", "Pick day"]];
  const rng = `<div class="rng">${R.map(([k, l]) => `<button class="${TX.range === k ? "on" : ""}" onclick="txSet('range','${k}')">${l}</button>`).join("")}</div>${TX.range === "day" ? `<input class="in" type="date" value="${TX.day || bizYesterday()}" max="${bizToday()}" onchange="TX.day=this.value;TX.limit=100;render()">` : ""}`;
  const head = tabs + syncBar() + rng;
  if (!rows) return shell("Sales", "Transactions", head + (TX.err && TX.errKey === key ? `<div class="card"><span class="band-bad">Could not load: ${esc(TX.err)}</span><div style="margin-top:8px"><button class="btn" onclick="TX.errKey=null;render()">Try again</button></div></div>` : `<div class="card mut" style="text-align:center">Loading transactions…</div>`));
  const boxN = rows.filter(t => t.cash_box_open).length, saleN = rows.length - boxN;
  const cashiers = [...new Set(rows.map(t => t.cashier).filter(Boolean))].sort();
  const kinds = [["all", `All ${rows.length}`], ["sale", `Sales ${saleN}`], ["box", `Cash box, no sale ${boxN}`]];
  const chips = `<div class="rng">${kinds.map(([k, l]) => `<button class="${TX.kind === k ? "on" : ""}" onclick="txSet('kind','${k}')">${l}</button>`).join("")}<button class="${TX.disc ? "on" : ""}" onclick="txSet('disc',${!TX.disc})">Discounted</button></div>`;
  const sel = (id, opts, cur, fn) => `<select class="in" onchange="${fn}(this.value)" aria-label="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  const ctl = `<div class="txctl">${sel("Payment", [["all", "Any payment"], ["cash", "Cash"], ["gcash", "GCash"], ["card", "Card / Maya"]], TX.pay, "(v=>txSet('pay',v))")}${sel("Cashier", [["all", "Any cashier"], ...cashiers.map(c => [c, c])], TX.cashier, "(v=>txSet('cashier',v))")}${sel("Sort", [["new", "Newest first"], ["old", "Oldest first"], ["high", "Highest total"], ["low", "Lowest total"]], TX.sort, "(v=>txSet('sort',v))")}<input class="in" type="search" placeholder="Receipt #, item, cashier, note" value="${esc(TX.q)}" onchange="TX.q=this.value;TX.limit=100;render()"></div>`;
  const f = txFilter(rows), shown = f.slice(0, TX.limit), multi = a !== b;
  const tot = sum(f.filter(t => !t.cash_box_open).map(t => t.total || 0));
  let extra = "";
  const bx = f.filter(t => t.cash_box_open);
  if (bx.length) {
    const byC = {}, byH = Array(24).fill(0); bx.forEach(t => { byC[t.cashier || "—"] = (byC[t.cashier || "—"] || 0) + 1; byH[+new Date(t.rung_at).toLocaleString("en-GB", { hour: "2-digit", hour12: false, ...MNL })]++; });
    const days = new Set(bx.map(t => t.business_day)).size, hmax = Math.max(...byH), hbest = byH.indexOf(hmax);
    extra = `<section class="card"><h2>Cash box opened without a sale <span class="tiny mut">${bx.length} times in ${days} day${days > 1 ? "s" : ""}</span></h2><div class="hb items">${Object.entries(byC).sort((x, y) => y[1] - x[1]).map(([c, n]) => `<div class="hbr" data-tt="${esc(c)}|${n} openings"><span class="nm">${esc(c)}</span><span class="tr"><i style="width:${(100 * n / bx.length).toFixed(0)}%"></i></span><span class="vl num">${n}</span></div>`).join("")}</div><div class="tiny mut" style="margin-top:8px">About ${(bx.length / days).toFixed(1)} a day; most at ${pad2(hbest)}:00 (${hmax}). Each one is a till opened with no ticket rung: change, a refund, or something to check.</div></section>`;
  }
  const list = shown.map((t, i) => (TX.sort === "new" || TX.sort === "old") && multi && (i === 0 || shown[i - 1].business_day !== t.business_day) ? `<div class="txday">${esc(dayName(t.business_day))} <span class="mut" style="text-transform:none;letter-spacing:0">· business day 9:00 to 4:00 next morning</span></div>` + txRow(t, false) : txRow(t, multi && !(TX.sort === "new" || TX.sort === "old"))).join("");
  const body = `${chips}${ctl}<div class="txsum"><b class="num">${f.length}</b> transaction${f.length === 1 ? "" : "s"} · <b class="num">${peso(tot)}</b> in sales${f.length !== rows.length ? ` <span class="mut">(filtered from ${rows.length})</span>` : ""}</div>${extra}<section class="card txlist">${list || '<div class="mut" style="text-align:center;padding:12px 0">Nothing matches these filters.</div>'}${f.length > shown.length ? `<button class="btn full" style="margin-top:8px" onclick="TX.limit+=200;render()">Show ${Math.min(200, f.length - shown.length)} more (${f.length - shown.length} left)</button>` : ""}</section>`;
  return shell("Sales", `Transactions · ${esc(multi ? dayName(a) + " – " + dayName(b) : dayLong(a))}`, head + body);
}

/* ---------- Morning run: Cherry's Store walk, mirrored from the old Rocket OS (table walk_run) ---------- */
const RUN = { rows: null, loading: false, err: null, open: {} };
async function loadRuns() {
  if (RUN.loading) return; RUN.loading = true; RUN.err = null; render();
  try { const { data, error } = await sb.from("walk_run").select("id,day,fund,endorsed_by,received_by,quick_counts,booklet_no,bir_first5,bir_time,note,recorded_by,created,columnar_sales,cash_breakdown,cash_total,cash_sales").eq("store", "P99").order("day", { ascending: false }).limit(90); if (error) throw error; RUN.rows = data; } catch (e) { RUN.err = e.message || String(e); }
  RUN.loading = false; render();
}
function viewRuns(tabs) {
  if (!RUN.rows && !RUN.loading && !RUN.err) setTimeout(loadRuns, 0);
  const head = tabs + syncBar();
  if (!RUN.rows) return shell("Sales", "Morning run", head + (RUN.err ? `<div class="card"><span class="band-bad">Could not load: ${esc(RUN.err)}</span><div style="margin-top:8px"><button class="btn" onclick="RUN.err=null;render()">Try again</button></div></div>` : `<div class="card mut" style="text-align:center">Loading the morning runs…</div>`));
  const rows = RUN.rows.map(r => { const pos = SD[addDays(r.day, -1)]; const pc = pos ? pos.pay.cash || 0 : null; return { ...r, pos: pc, diff: (r.cash_sales != null && pc != null) ? Math.round((r.cash_sales - pc) * 100) / 100 : null }; });
  const last = rows[0], withD = rows.filter(r => r.diff != null), avgAbs = withD.length ? sum(withD.map(r => Math.abs(r.diff))) / withD.length : null, net = sum(withD.map(r => r.diff));
  const dsp = d => d == null ? '<span class="mut">—</span>' : `<span class="dl ${Math.abs(d) < 1 ? "flat" : d > 0 ? "up" : "down"}"><i>${Math.abs(d) < 1 ? "▬" : d > 0 ? "▲" : "▼"}</i>${peso(Math.abs(d))}</span>`;
  const top = last ? `<div class="grid2">${tile("Last run", esc(dayName(last.day)), `by ${esc(last.recorded_by || "—")} · ${last.created ? tTime(last.created) : ""}`, "")}${tile("Cash fund", peso(last.fund), `${esc(last.endorsed_by || "—")} → ${esc(last.received_by || "—")}`, "")}${tile("Avg cash gap", avgAbs != null ? peso(avgAbs) : "—", `per run, ${withD.length} runs`, "")}${tile("Net gap", `${net >= 0 ? "+" : "−"}${peso(Math.abs(net))}`, "counted − POS, all runs", "")}</div>` : "";
  const list = rows.map(r => { const open = RUN.open[r.id]; const qc = (r.quick_counts || "").split(" · ").filter(Boolean);
    return `<div class="txr" onclick="RUN.open['${r.id}']=!RUN.open['${r.id}'];render()" role="button" tabindex="0"><div class="a"><b>${esc(dayName(r.day).replace(/^\w+, /, ""))}</b><span class="mut">${r.created ? tTime(r.created) : ""}</span></div><div class="b"><span>${r.cash_sales != null ? `Counted ${peso(r.cash_sales)} · POS ${r.pos != null ? peso(r.pos) : "—"}` : '<span class="mut">no cash count</span>'}</span><div class="tiny mut">${esc(r.recorded_by || "—")} · fund ${peso(r.fund)}${r.bir_first5 ? " · first 5: " + esc(r.bir_first5) : ""}</div></div><div class="c num">${dsp(r.diff)}</div></div>
    ${open ? `<div class="txd">${r.cash_total != null ? `<div class="small">Drawer ${peso(r.cash_total)} − fund ${peso(r.fund)} = ${peso(r.cash_sales)} counted for ${esc(dayName(addDays(r.day, -1)))}${r.columnar_sales != null ? ` · columnar ${peso(r.columnar_sales)}` : ""}</div>` : ""}${r.cash_breakdown ? `<div class="tiny mut" style="margin-top:4px">${Object.entries(r.cash_breakdown).sort((a, b) => b[0] - a[0]).map(([d, k]) => `${k}×₱${d}`).join(" · ")}</div>` : ""}${qc.length ? `<table class="t" style="margin-top:6px"><tbody>${qc.map(x => `<tr><td>${esc(x)}</td></tr>`).join("")}</tbody></table>` : ""}<div class="tiny mut">OR booklet ${esc(r.booklet_no || "—")} · BIR time ${esc(r.bir_time || "—")}${r.note ? " · " + esc(r.note) : ""}</div></div>` : ""}`; }).join("");
  return shell("Sales", "Morning run · Cherry's store walk", head + top + `<section class="card txlist">${list || '<div class="mut" style="text-align:center;padding:12px 0">No runs yet.</div>'}</section><div class="tiny mut">Counted cash = the drawer counted in the morning less the fund, for the business day before; POS = UTAK cash for that day. A gap is a prompt to look (timing, cash expenses, a late ticket), not an error by itself. Mirrored from the old Rocket OS (Store walk).</div>`);
}
