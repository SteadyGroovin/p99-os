/* clean-v2.js — Clean, Report (tickets), Tasks and Cash, rebuilt 2026-10-28. The old views stay in app.js as *_v1.
   Patterns: shift lists with due windows, "now" and "late" states and name + time on every tick (Jolt, Taqtics, Xenia);
   a completion strip per list with streaks and misses (Xenia/Taqtics store dashboards); a failed check or audit offers a ticket (Xenia corrective
   actions, MeazureUp/Yoobic); tickets with priority, ageing and a status board (UpKeep work orders); a cash-up that counts by denomination, checks
   the float first, then compares to POS and asks for the reason of any over/short, with a variance log reviewed for patterns (Shopify, PlumPOS).
   Data shapes are only added to: tickets gain area/source/log/fixPhoto, tasks gain created/log, cash records keep their fields.
   The business day runs 04:00–04:00 (P99.pos_cutoff), so a closing ticked at 00:40 belongs to the day it closed. */

const C2 = { hygDb: null, hygState: "idle", vals: {}, tkPri: "all", tkView: "board", tsOwner: "all", tsShow: "open", qa: { title: "", owner: "", due: "" }, cc: null };
const bday = () => typeof bizToday === "function" ? bizToday() : today();
const fname = id => { const p = Store.person(id); return p ? p.short : ""; };
const firstWord = s => String(s || "").trim().split(/\s+/)[0] || "";
const bmin = hm => { const [h, m] = String(hm).split(":").map(Number); return ((h * 60 + (m || 0)) - 240 + 1440) % 1440; };
const bnow = () => { const d = new Date(); return ((d.getHours() * 60 + d.getMinutes()) - 240 + 1440) % 1440; };
const durTxt = m => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? " " + (m % 60) + " min" : ""}`;
const lastDays = (n, end) => { const o = []; for (let i = n - 1; i >= 0; i--) o.push(addDays(end, -i)); return o; };
const wd3 = d => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][wd(d)];
const clById = id => CHECKLISTS.find(c => c.id === id);
const clTitle = (t, day) => t.rota != null ? ROTA[wd(day)][t.rota] : t.t;
const c2tabs = (items, cur, fn) => `<div class="rng" role="tablist">${items.map(([k, l]) => `<button class="${cur === k ? "on" : ""}" role="tab" aria-selected="${cur === k}" onclick="${fn}('${k}')">${l}</button>`).join("")}</div>`;
const pesoS = v => (v > 0 ? "+" : v < 0 ? "−" : "") + peso(Math.abs(v));

/* ---------- small bar chart: one blue, optional threshold lines, every bar has a tooltip on hover and tap ---------- */
function c2Bars(pts, { max, min = 0, ticks, lines = [], f = v => fmt(v), cls = () => "", h = 190, aria = "chart" } = {}) {
  const n = pts.length; if (!n) return "";
  const W = 640, H = h, L = 40, R = lines.length ? 74 : 8, T = 10, B = 24, iw = W - L - R, ih = H - T - B, bw = iw / n;
  const vs = pts.map(p => p.v).filter(v => v != null); const hi = max != null ? max : Math.max(1, ...vs); const lo = Math.min(min, ...vs);
  const Y = v => T + (hi - v) / ((hi - lo) || 1) * ih;
  const tk = ticks || (lo < 0 ? [lo, 0, hi] : [0, hi / 2, hi]);
  const grid = tk.map(v => `<line class="grid${v === 0 && lo < 0 ? " zero" : ""}" x1="${L}" x2="${L + iw}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text x="${L - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${esc(f(Math.round(v)))}</text>`).join("");
  const ln = lines.map(([v, lab]) => `<line class="thr" x1="${L}" x2="${L + iw}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="thl" x="${L + iw + 4}" y="${(Y(v) + 4).toFixed(1)}">${esc(lab)}</text>`).join("");
  const bars = pts.map((p, i) => { const hitTip = `data-tt="${esc(p.label)}|${esc(p.tip || (p.v == null ? "no record" : f(p.v)))}"`;
    const hit = `<rect class="hitb" x="${(L + bw * i).toFixed(1)}" y="${T}" width="${bw.toFixed(1)}" height="${ih}" ${hitTip}/>`;
    if (p.v == null) return hit; const y0 = Y(Math.max(0, lo)), y1 = Y(p.v); const top = Math.min(y0, y1), ht = Math.max(1.5, Math.abs(y1 - y0));
    return `<rect class="cb ${cls(p)}" x="${(L + bw * i + Math.max(1, bw * .16)).toFixed(1)}" y="${top.toFixed(1)}" width="${Math.max(2, bw * .68).toFixed(1)}" height="${ht.toFixed(1)}" rx="${bw > 10 ? 3 : 1.5}"/>${hit}`; }).join("");
  const step = Math.max(1, Math.ceil(n / 7));
  const xl = pts.map((p, i) => i % step === 0 || i === n - 1 && (n - 1) % step > step / 2 ? `<text x="${(L + bw * (i + .5)).toFixed(1)}" y="${H - 7}" text-anchor="middle">${esc(p.short || "")}</text>` : "").join("");
  return `<svg class="chart c2ch" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(aria)}">${grid}${ln}${bars}${xl}</svg>`;
}
const c2Table = (head, rows) => `<details class="tbl"><summary>Show as table</summary><table class="t"><thead><tr>${head.map((h, i) => `<th${i ? ' class="n"' : ""}>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${i ? ' class="n num"' : ""}>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></details>`;

/* =====================================================================================================================
   CLEAN
   ===================================================================================================================== */
function c2Stat(cl, day) {
  const r = S.runs[cl.id + ":" + day]; const ds = r && r.done ? cl.tasks.map(t => r.done[t.id]).filter(Boolean) : [];
  const ats = ds.map(x => x.at).filter(Boolean).sort(); const who = [...new Set(ds.map(x => fname(x.by)).filter(x => x && x !== "P99"))];
  const n = ds.length, tot = cl.tasks.length; const lastAt = n >= tot && ats.length ? ats[ats.length - 1] : null;
  return { n, tot, pct: tot ? n / tot * 100 : 0, first: ats[0] || null, last: ats[ats.length - 1] || null, lastAt, late: lastAt ? bmin(timeOf(lastAt)) > bmin(cl.to) : null, who };
}
function c2State(cl, day) {
  const s = c2Stat(cl, day); if (s.n >= s.tot) return { k: "done", s };
  if (day < bday()) return { k: s.n ? "partial" : "missed", s };
  const n = bnow(), a = bmin(cl.from), b = bmin(cl.to);
  return { k: n < a ? "later" : n <= b ? "now" : "late", s, left: b - n, until: a - n, over: n - b };
}
const C2STATE = { done: ["ok", "✓ done"], now: ["info", "now"], later: ["", "later"], late: ["bad", "▲ late"], partial: ["warn", "◐ part done"], missed: ["bad", "✕ missed"] };
const c2StateChip = k => chip(C2STATE[k][0], C2STATE[k][1]);
function c2DueText(cl, st) {
  const s = st.s;
  if (st.k === "done") return `done ${timeOf(s.lastAt)}${s.who.length ? " by " + esc(s.who.join(", ")) : ""} · ${s.late ? '<span class="band-bad">after ' + cl.to + "</span>" : "on time"}`;
  if (st.k === "now") return `due by ${cl.to} · <b>${durTxt(st.left)} left</b>`;
  if (st.k === "later") return `opens ${cl.from} · in ${durTxt(st.until)}`;
  if (st.k === "late") return `<span class="band-bad">was due ${cl.to} · ${durTxt(st.over)} late</span>`;
  return "";
}
function c2FirstDay() { let f = null; Object.keys(S.runs).forEach(k => { const r = S.runs[k]; if (r && r.done && Object.keys(r.done).length) { const d = k.split(":")[1]; if (d && (!f || d < f)) f = d; } }); return f; }
const allDone = d => CHECKLISTS.every(cl => c2Stat(cl, d).n >= cl.tasks.length);
function c2Streak(first) { if (!first) return 0; let d = bday(), n = 0; if (!allDone(d)) d = addDays(d, -1); while (d >= first && allDone(d)) { n++; d = addDays(d, -1); } return n; }
function c2Misses(days, first) { let m = 0; if (!first) return 0; days.forEach(d => { if (d < first) return; CHECKLISTS.forEach(cl => { const st = c2State(cl, d); if (["missed", "partial", "late"].includes(st.k)) m++; }); }); return m; }

function c2Strip(days, first) {
  const head = `<div></div>` + days.map(d => `<div class="ha${d === bday() ? " td" : ""}">${wd3(d)[0]}<br>${+d.slice(8)}</div>`).join("");
  const rows = CHECKLISTS.map(cl => `<div class="hr">${esc(cl.name)}</div>` + days.map(d => {
    const lab = `${cl.name} · ${dayName(d)}`;
    if (!first || d < first) return `<div class="c2c nod" data-tt="${esc(lab)}|no record (before the first tick on this device)"></div>`;
    const st = c2State(cl, d), s = st.s;
    if (st.k === "later" || st.k === "now") return `<div class="c2c open" style="--f:${s.pct.toFixed(0)}%" data-tt="${esc(lab)}|${s.n} of ${s.tot} · still open"></div>`;
    const tip = s.n ? `${s.n} of ${s.tot}${s.lastAt ? " · done " + timeOf(s.lastAt) + (s.late ? " (late)" : "") : ""}${s.who.length ? " · " + s.who.join(", ") : ""}` : "nothing ticked";
    const k = s.n >= s.tot ? (s.late ? "full late" : "full") : s.n ? "part" : "miss";
    return `<div class="c2c ${k}" style="--f:${(15 + s.pct * .45).toFixed(0)}%" data-tt="${esc(lab)}|${esc(tip)}">${s.n >= s.tot ? (s.late ? "!" : "✓") : s.n ? "" : "✕"}</div>`;
  }).join("")).join("");
  return `<div class="c2strip" style="--cols:${days.length}">${head}${rows}</div>`;
}
function c2Skipped(days, first) {
  if (!first) return [];
  const past = days.filter(d => d >= first && d < bday()); const out = [];
  CHECKLISTS.forEach(cl => cl.tasks.forEach(t => { let miss = 0; past.forEach(d => { const r = S.runs[cl.id + ":" + d]; if (!r || !r.done || !r.done[t.id]) miss++; }); if (miss) out.push({ cl, t, miss, of: past.length }); }));
  return out.sort((a, b) => b.miss - a.miss).slice(0, 4);
}
function c2Series(tid, idx, days) { return days.map(d => { for (const cl of CHECKLISTS) { const r = S.runs[cl.id + ":" + d]; const x = r && r.done && r.done[tid]; if (x && x.values && x.values[idx] != null && x.values[idx] !== "" && !isNaN(parseFloat(x.values[idx]))) return parseFloat(x.values[idx]); } return null; }); }
const C2READ = [["Chiller, morning", "o-chiller", 0, "°C", 5], ["Chiller, closing", "c-chiller", 0, "°C", 5], ["Oven, morning", "o-oven", 0, "°C"], ["Dough balls, morning", "o-dough", 0, ""], ["Dough balls left at close", "c-dough", 0, ""], ["Water used per day", "o-meter", 0, "m³", null, true], ["Electricity per day", "o-meter", 1, "kWh", null, true]];
function c2Readings(days) {
  const rows = C2READ.map(([nm, tid, idx, unit, lim, diff]) => {
    let v = c2Series(tid, idx, days); if (diff) v = v.map((x, i) => i && x != null && v[i - 1] != null && x >= v[i - 1] ? Math.round((x - v[i - 1]) * 100) / 100 : null);
    const li = v.length - 1 - [...v].reverse().findIndex(x => x != null); if (li > v.length - 1 || v[li] == null) return "";
    const real = v.filter(x => x != null); const over = lim != null && v[li] > lim;
    return `<div class="c2rd" data-tt="${esc(nm)}|last ${fmt(v[li])} ${unit} (${esc(dayName(days[li]))}) · range ${fmt(Math.min(...real))}–${fmt(Math.max(...real))} ${unit}"><div class="main"><div class="name">${esc(nm)}</div><div class="meta">${real.length} of ${days.length} days · ${esc(dayName(days[li]))}${over ? " " + chip("bad", "▲ above " + lim + " " + unit) : ""}</div></div>${spark(v, 88, 28)}<div class="right"><div class="v num">${fmt(v[li])}</div><div class="l">${unit || "pcs"}</div></div></div>`;
  }).join("");
  return rows || `<div class="mut small">No readings yet. Chiller and oven temperatures, dough balls and the meters come from the Opening and Closing lists once they are ticked here.</div>`;
}

/* ----- hygiene audits (Cherry's 9 areas, /45): Supabase walk_hygiene, read-only, plus runs sent from this device ----- */
function c2LoadHyg() {
  if (C2.hygState !== "idle") return; C2.hygState = "loading";
  const done = rows => { C2.hygDb = Array.isArray(rows) ? rows : []; C2.hygState = "done"; const h = location.hash.replace(/\/$/, ""); if (h === "#/clean") render(); };
  if (typeof sb === "undefined" || !sb || !sb.from) return done([]);
  try { sb.from("walk_hygiene").select("day,scores,total,band,auditor,recorded_by").eq("store", P99.code).gte("day", addDays(bday(), -180)).order("day", { ascending: true }).limit(400).then(r => done(r && !r.error ? r.data : []), () => done([])); }
  catch (e) { done([]); }
}
function c2HygRows() {
  const m = {};
  (S.walks || []).forEach(w => { if (w.hyg && Array.isArray(w.hyg.scores) && w.hyg.scores.length === 9) m[w.day] = { day: w.day, scores: w.hyg.scores.map(Number), total: +w.hyg.total, auditor: fname(w.by), src: "this device" }; });
  (C2.hygDb || []).forEach(r => { if (r && r.day && Array.isArray(r.scores) && r.scores.length === 9) { const sc = r.scores.map(Number); m[r.day] = { day: r.day, scores: sc, total: r.total != null ? +r.total : sum(sc), auditor: firstWord(r.auditor) || fname(r.recorded_by), src: "database" }; } });
  return Object.values(m).sort((a, b) => a.day < b.day ? -1 : 1);
}
const bandChip = total => { const b = hygBand(total); return chip(b[1], (b[1] === "ok" ? "✓ " : "▲ ") + b[0]); };
function c2HygCard(rows) {
  const ttl = `<h2>Hygiene audit <span class="tiny mut">Cherry's 9 areas, scored 1–5, total /45</span></h2>`;
  if (!rows.length) return `<section class="card">${ttl}<div class="mut small">${C2.hygState === "loading" ? "Loading the audits…" : "No audit recorded yet. Audits come from the morning run (Walk); the trend appears after the first one."}</div></section>`;
  const last = rows[rows.length - 1], recent = rows.slice(-30), b = hygBand(last.total);
  const avg = HYG_AREAS.map((_, i) => sum(recent.map(r => r.scores[i] || 0)) / recent.length); const lo = avg.indexOf(Math.min(...avg));
  const chart = c2Bars(recent.map(r => ({ label: dayName(r.day), short: wd3(r.day)[0] + " " + (+r.day.slice(8)), v: r.total, tip: `${r.total}/45 · ${hygBand(r.total)[0]}${r.auditor ? " · " + r.auditor : ""}` })), { max: 45, ticks: [0, 15, 30, 45], lines: [[41, "excellent"], [32, "good"], [23, "acceptable"]], f: v => String(v), aria: "Hygiene totals per audit" });
  const below = recent.filter(r => r.total < 32).length;
  const weak = last.scores.map((s, i) => [s, i]).filter(([s]) => s <= 2);
  const bars = `<div class="hb">${avg.map((v, i) => `<div class="hbr c2area ${i === lo ? "best" : ""}" data-tt="${esc(HYG_AREAS[i])}|${v.toFixed(1)} of 5 on average · last audit ${last.scores[i]}"><span class="nm">${esc(HYG_AREAS[i])}</span><span class="tr"><i style="width:${(v / 5 * 100).toFixed(0)}%"></i></span><span class="vl num">${v.toFixed(1)}</span></div>`).join("")}</div>`;
  const sug = (b[1] !== "ok" || weak.length) ? `<div class="alert ${b[1] === "bad" ? "bad" : "warn"} c2sug"><div>${b[1] !== "ok" ? `Last audit ${last.total}/45 is <b>${b[0]}</b>${b[2] ? ": " + esc(b[2]) : ""}.` : ""} ${weak.length ? `Scored 2 or lower: <b>${weak.map(([s, i]) => esc(HYG_AREAS[i]) + " (" + s + ")").join(", ")}</b>.` : ""}</div><button class="btn" onclick="c2TicketFromAudit()">Make a ticket</button></div>` : "";
  return `<section class="card">${ttl}
    <div class="c2hyg-top"><div><div class="big num">${last.total}<span class="mut">/45</span></div><div class="tiny mut">${esc(dayLong(last.day))}${last.auditor ? " · " + esc(last.auditor) : ""}</div></div>${bandChip(last.total)}</div>${sug}
    ${chart}<div class="legend"><span><b style="background:var(--s1)"></b>Audit total</span><span><b class="dash"></b>Band limits (41 excellent · 32 good · 23 acceptable)</span></div>
    <ul class="ins" style="margin-top:12px"><li><span>▤</span><div>Weakest area over the last ${recent.length} audits: <b>${esc(HYG_AREAS[lo])}</b>, ${avg[lo].toFixed(1)} of 5.</div></li><li><span>◔</span><div>${below ? `<b>${below}</b> of ${recent.length} audits fell below <b>good</b> (32).` : `All ${recent.length} audits were <b>good</b> or better.`}</div></li></ul>
    <h2 style="margin-top:16px">Average per area <span class="tiny mut">last ${recent.length} audits, of 5 · lowest highlighted</span></h2>${bars}
    ${c2Table(["Day", "Total", "Band", "Auditor"], recent.slice().reverse().map(r => [esc(dayName(r.day)), r.total + "/45", hygBand(r.total)[0], esc(r.auditor || "")]))}</section>`;
}
function c2TicketFromAudit() {
  const rows = c2HygRows(); const last = rows[rows.length - 1]; if (!last) return;
  const weak = last.scores.map((s, i) => [s, i]).filter(([s]) => s <= 2).sort((a, b) => a[0] - b[0]);
  const area = weak.length ? HYG_AREAS[weak[0][1]] : HYG_AREAS[last.scores.indexOf(Math.min(...last.scores))];
  nt = { priority: last.total < 23 ? "high" : "medium", title: `Hygiene: ${area} needs attention`, note: `Audit ${dayName(last.day)}: ${last.total}/45 (${hygBand(last.total)[0]}). Low scores: ${weak.map(([s, i]) => HYG_AREAS[i] + " " + s).join(", ") || area}.`, photo: null, area, source: "audit" };
  go("#/report/new");
}

function viewClean() {
  if (C2.hygState === "idle") setTimeout(c2LoadHyg, 0);
  const day = bday(), days = lastDays(14, day), first = c2FirstDay();
  const sts = CHECKLISTS.map(cl => ({ cl, st: c2State(cl, day) }));
  const nDone = sum(sts.map(x => x.st.s.n)), nTot = sum(sts.map(x => x.st.s.tot));
  const streak = c2Streak(first), misses = c2Misses(days, first); const hyg = c2HygRows(); const hl = hyg[hyg.length - 1];
  const nowOne = sts.find(x => x.st.k === "now" || x.st.k === "late");
  const tiles = `<div class="grid2">
    ${tile("Today", `${nDone}<span class="mut">/${nTot}</span>`, nowOne ? `${c2StateChip(nowOne.st.k)} ${esc(nowOne.cl.name)}` : nDone >= nTot ? chip("ok", "✓ all lists done") : `<span class="mut">tasks ticked</span>`, "")}
    ${tile("Streak", first ? `${streak} <span class="mut small">day${streak === 1 ? "" : "s"}</span>` : "—", first ? "both lists complete, in a row" : `<span class="mut">starts with the first full day</span>`, "")}
    ${tile("Missed · 14 days", first ? String(misses) : "—", first ? (misses ? `${chip("warn", "▲ late or unfinished")}` : chip("ok", "✓ none")) : `<span class="mut">no history yet</span>`, "")}
    ${tile("Hygiene", hl ? `${hl.total}<span class="mut">/45</span>` : "—", hl ? bandChip(hl.total) : `<span class="mut">${C2.hygState === "loading" ? "loading…" : "no audit yet"}</span>`, hyg.length > 1 ? spark(hyg.slice(-14).map(r => r.total)) : "")}
  </div>`;
  const shifts = `<div class="c2shifts">${sts.map(({ cl, st }) => { const s = st.s; const rota = ROTA[wd(day)][cl.id === "open" ? 0 : 1];
    const cta = st.k === "done" ? "View" : s.n ? "Continue" : "Start";
    return `<section class="card tap c2shift ${st.k}" onclick="go('#/clean/${cl.id}')"><div class="c2sh-h">${ring(s.pct, s.pct >= 100)}<div class="main"><div class="name">${esc(cl.name)} <span class="mut small num">${cl.from}–${cl.to}</span></div><div class="meta">${s.n} of ${s.tot} · today's cleaning: ${esc(rota)}</div></div>${c2StateChip(st.k)}</div>
      <div class="bar ${s.pct >= 100 ? "ok" : ""}"><i style="width:${s.pct}%"></i></div>
      <div class="c2sh-f"><span class="small">${c2DueText(cl, st)}</span><span class="btn ${st.k === "now" || st.k === "late" ? "primary" : ""} c2cta">${cta} ${ic("chevron-right", "sm")}</span></div></section>`; }).join("")}</div>`;
  const skipped = c2Skipped(days, first);
  const hist = `<section class="card"><h2>Last 14 days <span class="tiny mut">per list · hover or tap a square</span></h2>
    ${first ? c2Strip(days, first) : `<div class="mut small">Nothing ticked on this device yet, so there is no history. The strip fills one day at a time from the first tick.</div>`}
    ${first ? `<div class="legend"><span><b style="background:var(--s1)"></b>✓ complete on time</span><span><b style="background:var(--s1)"></b>! complete, late</span><span><b style="background:color-mix(in srgb,var(--s1) 45%,var(--surf2))"></b>part done (lighter = less)</span><span><b class="c2lg-miss"></b>✕ nothing ticked</span><span><b class="c2lg-nod"></b>no record</span></div>
    ${skipped.length ? `<h2 style="margin-top:16px">Skipped most <span class="tiny mut">days not ticked, since ${esc(dayName(first > days[0] ? first : days[0]))}</span></h2><div class="hb items">${skipped.map(x => `<div class="hbr" data-tt="${esc(clTitle(x.t, day))}|not ticked on ${x.miss} of ${x.of} days"><span class="nm">${esc(x.t.rota != null ? x.t.t : x.t.t)}<small>${esc(x.cl.name)}</small></span><span class="tr"><i style="width:${(100 * x.miss / Math.max(1, x.of)).toFixed(0)}%"></i></span><span class="vl num">${x.miss}<small>of ${x.of}</small></span></div>`).join("")}</div>` : ""}
    ${c2Table(["Day"].concat(CHECKLISTS.map(c => c.name)), days.slice().reverse().filter(d => d >= first).map(d => [esc(dayName(d))].concat(CHECKLISTS.map(cl => { const st = c2State(cl, d); return `${st.s.n}/${st.s.tot} ${C2STATE[st.k][1]}${st.s.lastAt ? " " + timeOf(st.s.lastAt) : ""}`; }))))}` : ""}</section>`;
  const readings = `<section class="card"><h2>Readings <span class="tiny mut">typed in the lists · last 14 days</span></h2><div class="c2rds">${c2Readings(days)}</div></section>`;
  const rota = [1, 2, 3, 4, 5, 6, 0].map(k => `<tr class="${k === wd(day) ? "hi" : ""}"><td>${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][k]}</td><td>${esc(ROTA[k][0])}</td><td>${esc(ROTA[k][1])}</td></tr>`).join("");
  return shell("Clean", `${dayLong(day)}${day !== today() ? " · business day until 04:00" : ""}`, `${tiles}${shifts}${hist}<div class="c2two">${readings}${c2HygCard(hyg)}</div>
    <section class="card"><h2>Weekly cleaning rota <span class="tiny mut">from the crew's own reports, Aug–Sep · today highlighted</span></h2><table class="t"><thead><tr><th>Day</th><th>Morning shift</th><th>Closing shift</th></tr></thead><tbody>${rota}</tbody></table></section>`);
}

/* ----- one checklist run ----- */
function c2Photo(clId, tId, which, phId) { const r = runFor(clById(clId), bday()); r.ph = r.ph || {}; r.ph[tId + ":" + which] = phId; save(); render(); }
function c2Tick(clId, tId) {
  const cl = clById(clId), t = cl.tasks.find(x => x.id === tId), day = bday(), r = runFor(cl, day);
  if (r.done[tId]) { if (confirm("Undo this tick?")) { delete r.done[tId]; save(); render(); } return; }
  let values = null;
  if (t.values) { values = t.values.map((_, i) => String(C2.vals[tId + ":" + i] == null ? "" : C2.vals[tId + ":" + i]).trim()); const gap = values.findIndex(v => v === "" || isNaN(parseFloat(v)));
    if (gap >= 0) { toast("Type the " + t.values[gap] + " first."); const el = $("#v-" + tId + "-" + gap); if (el) el.focus(); return; } }
  r.done[tId] = { by: S.me, at: nowISO(), values };
  if (t.countItem && values) { startDraft(); S.draft.lines[t.countItem] = parseFloat(values[0]); S.draft.text[t.countItem] = values[0] + " pc"; }
  if (values) t.values.forEach((_, i) => delete C2.vals[tId + ":" + i]);
  save(); const s = c2Stat(cl, day); toast(s.n >= s.tot ? `${cl.name} complete — thank you.` : `Ticked · ${s.n} of ${s.tot}`); render();
}
function c2TicketFrom(clId, tId, why, pri) {
  const cl = clById(clId), t = cl.tasks.find(x => x.id === tId);
  nt = { priority: pri || "", title: clTitle(t, bday()) + (why ? " — " + why : ""), note: `From the ${cl.name} list, ${dayName(bday())}.`, photo: null, area: "", source: "checklist" };
  go("#/report/new");
}
function c2TaskRow(cl, t, r, day) {
  const d = r.done[t.id], vals = t.values || [], ph = r.ph || {};
  const need = t.photo === "before/after" ? ["before", "after"] : t.photo ? ["photo"] : []; const have = need.filter(k => ph[t.id + ":" + k]);
  const canDone = have.length === need.length; const title = clTitle(t, day);
  const chill = d && d.values && /chiller/i.test(vals[0] || "") && parseFloat(d.values[0]) > 5;
  const linkDone = t.link === "#/cash" ? (S.cash || []).find(c => c.day === day) : t.link === "#/count" ? (S.counts || []).find(c => c.submitted && (c.day === day || c.day === today()) && c.kind !== "morning") : null;
  const hint = [t.rota != null ? esc(t.t) : "", need.length === 2 ? "before + after photo" : need.length ? "photo needed" : ""].filter(Boolean).join(" · ");
  const photos = need.length ? `<div class="pair">${need.map(k => `${d ? "" : photoBtn(k === "photo" ? "Photo" : k[0].toUpperCase() + k.slice(1), `c2Photo('${cl.id}','${t.id}','${k}',id)`, ph[t.id + ":" + k])}${thumb(ph[t.id + ":" + k])}`).join("")}</div>` : "";
  const inputs = !d && vals.length ? `<div class="pair">${vals.map((v, i) => `<label class="c2val"><span>${esc(v)}</span><input class="in num" inputmode="decimal" id="v-${t.id}-${i}" value="${esc(C2.vals[t.id + ":" + i] || "")}" oninput="C2.vals['${t.id}:${i}']=this.value" onkeydown="if(event.key==='Enter')c2Tick('${cl.id}','${t.id}')"></label>`).join("")}</div>` : "";
  const meta = d ? `<span class="band-ok">✓</span> ${esc(fname(d.by) || "—")} · ${timeOf(d.at)}${d.values ? " · " + d.values.map((v, i) => `${esc((vals[i] || "").replace(/ .*/, ""))} <b>${esc(v)}</b> ${esc((vals[i] || "").split(" ").slice(1).join(" "))}`).join(", ") : ""}` : hint;
  const link = t.link && !d ? `<div class="pair"><a class="btn" href="${t.link}">${t.link === "#/cash" ? "Open the cash count" : "Open the stock count"} ${ic("chevron-right", "sm")}</a>${linkDone ? chip("ok", "✓ sent " + timeOf(linkDone.at || linkDone.submitted)) : ""}</div>` : "";
  const tapRow = !d && !vals.length && !need.length && !t.link;
  return `<div class="c2task ${d ? "done" : ""} ${tapRow ? "tapr" : ""}" ${tapRow ? `onclick="if(!event.target.closest('button,a,input'))c2Tick('${cl.id}','${t.id}')"` : ""}>
    <button class="c2tick ${d ? "on" : ""}" ${!d && !canDone ? "disabled" : ""} onclick="c2Tick('${cl.id}','${t.id}')" aria-label="${d ? "Undo" : "Mark done"}: ${esc(title)}">${ic("check")}</button>
    <div class="main"><div class="name">${esc(title)}</div><div class="meta">${meta}</div>${inputs}${photos}${link}
      ${chill ? `<div class="alert bad c2sug"><div>▲ Chiller at <b>${esc(d.values[0])} °C</b>, above 5 °C. Food above 5 °C for hours is a risk.</div><button class="btn" onclick="c2TicketFrom('${cl.id}','${t.id}','chiller at ${parseFloat(d.values[0])} °C','high')">Make a ticket</button></div>` : ""}
      ${!d && !canDone ? `<div class="tiny mut c2need">${need.length - have.length} photo${need.length - have.length > 1 ? "s" : ""} still needed before the tick</div>` : ""}</div>
    <button class="c2prob" onclick="c2TicketFrom('${cl.id}','${t.id}')" aria-label="Report a problem with ${esc(title)}">${ic("alert-triangle", "sm")}</button></div>`;
}
function viewChecklist(id) {
  const cl = clById(id); if (!cl) return viewClean();
  const day = bday(), r = runFor(cl, day), st = c2State(cl, day), s = st.s;
  const nPh = Object.keys(r.ph || {}).filter(k => r.ph[k]).length;
  const top = `<section class="card c2top"><div class="c2top-h"><div><div class="big num">${s.n}<span class="mut"> of ${s.tot}</span></div><div class="small">${c2DueText(cl, st)}</div></div>${c2StateChip(st.k)}</div>
    <div class="bar ${s.pct >= 100 ? "ok" : ""}"><i style="width:${s.pct}%"></i></div>${s.first ? `<div class="tiny mut" style="margin-top:6px">started ${timeOf(s.first)}${s.who.length ? " · " + esc(s.who.join(", ")) : ""}${nPh ? " · " + nPh + " photo" + (nPh > 1 ? "s" : "") : ""}</div>` : `<div class="tiny mut" style="margin-top:6px">Tap the circle when a task is done. Tasks with a photo or a number need those first.</div>`}</section>`;
  const sumCard = s.n >= s.tot ? (() => { const dur = s.first && s.lastAt ? Math.max(0, bmin(timeOf(s.lastAt)) - bmin(timeOf(s.first))) : null;
    return `<section class="card c2done"><h2>${ic("check", "sm ok")} ${esc(cl.name)} complete</h2><div class="c2kv"><div><span>Finished</span><b class="num">${timeOf(s.lastAt)}</b></div><div><span>Took</span><b>${dur != null ? durTxt(dur) : "—"}</b></div><div><span>Window</span><b>${s.late ? '<span class="band-bad">▲ late</span>' : '<span class="band-ok">✓ on time</span>'}</b></div><div><span>Photos</span><b class="num">${nPh}</b></div></div>${s.who.length ? `<div class="tiny mut" style="margin-top:8px">By ${esc(s.who.join(", "))}</div>` : ""}</section>`; })() : "";
  return shell(cl.name, `${cl.from}–${cl.to} · ${dayName(day)}`, `${top}<div class="c2tasks">${cl.tasks.map(t => c2TaskRow(cl, t, r, day)).join("")}</div>${sumCard}`, { back: "#/clean" });
}

/* =====================================================================================================================
   REPORT (tickets)
   ===================================================================================================================== */
const C2PRI = { high: ["bad", "▲ high"], medium: ["warn", "medium"], low: ["", "low"] };
const C2TS = { open: "open", scheduled: "scheduled", in_progress: "in progress", done: "done" };
const C2PICK = [["Chiller or freezer not cold", "high"], ["Oven problem", "high"], ["Gas smell or leak", "high"], ["Water leak", "medium"], ["Light out", "low"], ["Door, lock or window", "medium"], ["POS, printer or internet", "high"], ["Pests seen", "high"], ["Broken chair or table", "low"], ["Sink or drain blocked", "medium"]];
const C2AREAS = ["Kitchen", "Counter", "Dining", "Chiller / storage", "Toilet", "Outside", "Other"];
const tkAge = t => ageDays(t.created);
const fixDays = t => t.closed ? Math.max(0, Math.round((new Date(t.closed) - new Date(t.created)) / 864e5)) : null;
function c2AgeChip(t) {
  if (t.status === "done") { const f = fixDays(t); return chip("ok", f == null ? "✓ done" : `✓ fixed in ${f ? f + " d" : "a day"}`); }
  const a = tkAge(t), lim = t.priority === "high" ? [1, 3] : [3, 7]; const cls = a >= lim[1] ? "bad" : a >= lim[0] ? "warn" : "";
  return chip(cls, `${cls ? "⏱ " : ""}${a ? a + " d" : "today"}${a ? " old" : ""}`);
}
const tkOrder = (a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]) || (a.created < b.created ? -1 : 1);
const c2TkCard = t => `<button class="c2tk ${t.status} p-${t.priority}" onclick="go('#/report/${t.id}')">${t.photo && S.photos[t.photo] ? `<img src="${S.photos[t.photo]}" alt="">` : `<span class="noph">${ic("camera-01", "sm")}</span>`}<span class="b"><b>${esc(t.title)}</b><span class="m">${chip(...(C2PRI[t.priority] || ["", t.priority]))}${c2AgeChip(t)}${t.status === "scheduled" ? chip("info", t.scheduled ? "for " + dayName(t.scheduled) : "scheduled") : t.status === "in_progress" ? chip("info", "in progress") : ""}</span><span class="tiny mut">${t.area ? esc(t.area) + " · " : ""}${esc(fname(t.by))}${fname(t.by) ? " · " : ""}${esc(dayName(t.created.slice(0, 10)))}${t.source === "audit" ? " · from audit" : t.source === "checklist" ? " · from checklist" : ""}</span></span></button>`;
function c2TkPri(k) { C2.tkPri = k; render(); }
function c2TkView(k) { C2.tkView = k; render(); }
function viewReport() {
  const all = S.tickets || [], d = today(); const wk = addDays(d, -6);
  const pf = t => C2.tkPri === "all" || t.priority === C2.tkPri;
  const open = all.filter(t => t.status === "open").filter(pf).sort(tkOrder), sched = all.filter(t => t.status === "scheduled" || t.status === "in_progress").filter(pf).sort(tkOrder);
  const done = all.filter(t => t.status === "done").filter(pf).sort((a, b) => (b.closed || "") < (a.closed || "") ? -1 : 1);
  const active = all.filter(t => t.status !== "done"); const high = active.filter(t => t.priority === "high");
  const oldest = active.slice().sort((a, b) => a.created < b.created ? -1 : 1)[0];
  const closedWk = all.filter(t => t.status === "done" && t.closed && t.closed.slice(0, 10) >= wk); const fx = all.map(fixDays).filter(x => x != null).sort((a, b) => a - b); const med = fx.length ? fx[Math.floor(fx.length / 2)] : null;
  const tiles = `<div class="grid2">
    ${tile("Open", String(active.length), active.length ? `${sched.length} scheduled or in progress` : chip("ok", "✓ nothing open"), "")}
    ${tile("High priority", String(high.length), high.length ? chip("bad", "▲ fix today") : `<span class="mut">none</span>`, "")}
    ${tile("Oldest open", oldest ? `${tkAge(oldest)} <span class="mut small">days</span>` : "—", oldest ? esc(oldest.title) : `<span class="mut">no open ticket</span>`, "")}
    ${tile("Closed · 7 days", String(closedWk.length), med != null ? `median fix ${med} d (all time)` : `<span class="mut">none closed yet</span>`, "")}
  </div>`;
  const col = (ttl, arr, empty, cls = "") => `<section class="c2col ${cls}"><h3>${ttl} <span class="num">${arr.length}</span></h3>${arr.length ? `<div class="list">${arr.map(c2TkCard).join("")}</div>` : `<div class="mut small c2empty">${empty}</div>`}</section>`;
  const doneShown = C2.tkView === "done" ? done : done.filter(t => (t.closed || "").slice(0, 10) >= addDays(d, -13));
  const board = C2.tkView === "done" ? col("Done", doneShown, "Nothing closed yet.")
    : `<div class="c2board">${col("Open", open, all.length ? "Nothing open." : "Nothing reported yet. Broken, leaking, not working: take a photo and send it here.")}${col("Scheduled · in progress", sched, "Nothing scheduled.")}${col("Done · last 14 days", doneShown, "Nothing closed in the last 14 days.", "donec")}</div>`;
  const buckets = [["0–2 days", 0, 2], ["3–6 days", 3, 6], ["7–13 days", 7, 13], ["14 days +", 14, 1e9]].map(([l, a, b]) => ({ l, n: active.filter(t => tkAge(t) >= a && tkAge(t) <= b).length, hi: active.filter(t => tkAge(t) >= a && tkAge(t) <= b && t.priority === "high").length }));
  const bmx = Math.max(1, ...buckets.map(x => x.n));
  const ageing = active.length ? `<section class="card"><h2>Open tickets by age <span class="tiny mut">older bars need a decision</span></h2><div class="hb">${buckets.map((x, i) => `<div class="hbr c2age" data-tt="${x.l}|${x.n} open · ${x.hi} high"><span class="nm">${x.l}</span><span class="tr"><i style="width:${(100 * x.n / bmx).toFixed(0)}%"></i></span><span class="vl num">${x.n}</span></div>`).join("")}</div>${c2Table(["Age", "Open", "High"], buckets.map(x => [x.l, x.n, x.hi]))}</section>` : "";
  return shell("Tickets", `${active.length} open · maintenance and repairs`, `
    <button class="btn primary full c2big" onclick="nt={priority:'',title:'',note:'',photo:null,area:'',source:''};go('#/report/new')">${ic("camera-01")} Report a problem</button>
    ${tiles}
    <div class="c2filt">${c2tabs([["board", "Board"], ["done", "All done"]], C2.tkView, "c2TkView")}${c2tabs([["all", "Any priority"], ["high", "High"], ["medium", "Medium"], ["low", "Low"]], C2.tkPri, "c2TkPri")}</div>
    ${board}${ageing}`);
}
function c2Pick(i) { const [t, p] = C2PICK[i]; nt.title = t; if (!nt.priority) nt.priority = p; render(); }
function viewNewTicket() {
  if (!nt) nt = { priority: "", title: "", note: "", photo: null, area: "", source: "" };
  const ok = nt.photo && nt.title.trim() && nt.priority;
  const pri = [["high", "High", "stops sales or food safety — today"], ["medium", "Medium", "this week"], ["low", "Low", "when there is time"]];
  const miss = [!nt.photo && "a photo", !nt.title.trim() && "what is wrong", !nt.priority && "how urgent"].filter(Boolean);
  return shell("Report a problem", "photo · what · how urgent", `
    <section class="card"><div class="c2ph">${nt.photo ? thumb(nt.photo, "big") : ""}${photoBtn(nt.photo ? "Retake" : "Take a photo", "nt.photo=id;render()", nt.photo)}</div></section>
    <section class="card"><div class="field"><label for="ntt">What is wrong</label><input class="in" id="ntt" value="${esc(nt.title)}" oninput="nt.title=this.value" placeholder="e.g. Chiller door does not close"></div>
      <div class="c2picks">${C2PICK.map(([t], i) => `<button class="${nt.title === t ? "on" : ""}" onclick="c2Pick(${i})">${esc(t)}</button>`).join("")}</div></section>
    <section class="card"><div class="field"><label>Where</label><div class="c2picks">${C2AREAS.map(a => `<button class="${nt.area === a ? "on" : ""}" onclick="nt.area=nt.area==='${a}'?'':'${a}';render()">${esc(a)}</button>`).join("")}</div></div></section>
    <section class="card"><div class="field"><label>How urgent</label><div class="c2pri">${pri.map(([k, l, s]) => `<button class="${k} ${nt.priority === k ? "on" : ""}" onclick="nt.priority='${k}';render()"><b>${l}</b><span>${s}</span></button>`).join("")}</div></div>
      <div class="field" style="margin-top:12px"><label for="ntn">Details <span class="mut">(optional)</span></label><textarea class="in" id="ntn" oninput="nt.note=this.value">${esc(nt.note)}</textarea></div></section>
    <div class="bottom-act"><button class="btn primary full" ${ok ? "" : "disabled"} onclick="c2SendTicket()">Send ticket</button>${miss.length ? `<div class="tiny mut" style="text-align:center;margin-top:4px">Still needed: ${miss.join(", ")}.</div>` : ""}</div>`, { back: "#/report" });
}
function c2SendTicket() {
  const at = nowISO(); S.tickets.unshift({ id: "t-" + Date.now(), title: nt.title.trim(), note: nt.note, priority: nt.priority, status: "open", by: S.me, created: at, photo: nt.photo, area: nt.area || "", source: nt.source || "", log: [{ at, by: S.me, ev: "opened" }] });
  nt = null; save(); toast("Ticket sent."); go("#/report");
}
function c2TkSet(id, f, v) {
  const t = S.tickets.find(x => x.id === id); if (!t || t[f] === v) return; const at = nowISO(); t.log = t.log || [];
  if (f === "status") { t.log.push({ at, by: S.me, ev: "status", v }); if (v === "done") t.closed = at; else delete t.closed; }
  if (f === "priority") t.log.push({ at, by: S.me, ev: "priority", v });
  if (f === "scheduled") t.log.push({ at, by: S.me, ev: "scheduled", v });
  t[f] = v; save(); render();
}
function c2TkNote(id) { const el = $("#tkn"); const v = el && el.value.trim(); if (!v) return; const t = S.tickets.find(x => x.id === id); t.log = t.log || []; t.log.push({ at: nowISO(), by: S.me, ev: "note", v }); save(); render(); }
function viewTicket(id) {
  const t = S.tickets.find(x => x.id === id); if (!t) return viewReport();
  const log = [{ at: t.created, by: t.by, ev: "opened" }].concat((t.log || []).filter(e => e.ev !== "opened"));
  const evTxt = e => e.ev === "opened" ? "reported it" : e.ev === "status" ? `set status to <b>${esc(C2TS[e.v] || e.v)}</b>` : e.ev === "priority" ? `set priority to <b>${esc(e.v)}</b>` : e.ev === "scheduled" ? `scheduled it for <b>${esc(e.v ? dayName(e.v) : "—")}</b>` : esc(e.v);
  const manage = canManage() ? `<section class="card"><h3>Status</h3><div class="seg">${Object.keys(C2TS).map(s => `<button class="btn ${t.status === s ? "on" : ""}" onclick="c2TkSet('${t.id}','status','${s}')">${C2TS[s]}</button>`).join("")}</div>
      ${t.status === "scheduled" ? `<div class="field" style="margin-top:10px"><label>Scheduled day</label><input class="in" type="date" value="${t.scheduled || ""}" onchange="c2TkSet('${t.id}','scheduled',this.value)"></div>` : ""}
      ${t.status === "done" ? `<div style="margin-top:10px">${photoBtn("Photo of the fix", `c2TkFix('${t.id}',id)`, t.fixPhoto)}${thumb(t.fixPhoto)}</div>` : ""}
      <h3 style="margin-top:14px">Priority</h3><div class="seg">${["low", "medium", "high"].map(p => `<button class="btn ${t.priority === p ? "on " + p : ""}" onclick="c2TkSet('${t.id}','priority','${p}')">${p}</button>`).join("")}</div></section>` : `<div class="mut small">Maintenance updates the status; you see it change here.</div>`;
  return shell(t.title, `${C2TS[t.status] || t.status} · ${dayName(t.created.slice(0, 10))}`, `
    <section class="card"><div class="c2tkh">${chip(...(C2PRI[t.priority] || ["", t.priority]))}${c2AgeChip(t)}${t.area ? chip("", esc(t.area)) : ""}</div>${t.photo ? thumb(t.photo, "big") : `<div class="mut small">No photo.</div>`}${t.note ? `<p class="c2note">${esc(t.note)}</p>` : ""}</section>
    ${manage}
    <section class="card"><h3>History</h3><ol class="c2log">${log.map(e => `<li><span class="tiny mut num">${esc(dayName(String(e.at).slice(0, 10)))} ${timeOf(e.at)}</span><div><b>${esc(fname(e.by) || "—")}</b> ${evTxt(e)}</div></li>`).join("")}</ol>
      <div class="field" style="margin-top:10px"><label for="tkn">Add an update</label><textarea class="in" id="tkn" placeholder="e.g. Technician comes Thursday"></textarea></div><button class="btn full" style="margin-top:8px" onclick="c2TkNote('${t.id}')">Add update</button></section>`, { back: "#/report" });
}
function c2TkFix(id, ph) { const t = S.tickets.find(x => x.id === id); t.fixPhoto = ph; t.log = t.log || []; t.log.push({ at: nowISO(), by: S.me, ev: "note", v: "photo of the fix added" }); save(); render(); }

/* =====================================================================================================================
   TASKS
   ===================================================================================================================== */
const C2G = [["overdue", "Overdue"], ["today", "Due today"], ["week", "Next 7 days"], ["later", "Later"], ["nodate", "No due date"], ["blocked", "Blocked"], ["done", "Done"]];
function c2Bucket(t, d) { if (t.status === "done") return "done"; if (t.status === "blocked") return "blocked"; if (!t.due) return "nodate"; if (t.due < d) return "overdue"; if (t.due === d) return "today"; if (t.due <= addDays(d, 7)) return "week"; return "later"; }
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5);
function c2DueChip(t, d) {
  if (t.status === "done") return chip("ok", "✓ done" + (t.done_at ? " " + dayName(t.done_at.slice(0, 10)) : ""));
  if (!t.due) return `<span class="tiny mut">no due date</span>`;
  if (t.due < d) { const n = daysBetween(t.due, d); return chip("bad", `▲ ${n} d late`); }
  if (t.due === d) return chip("warn", "due today");
  if (t.due === addDays(d, 1)) return chip("", "due tomorrow");
  return chip("", "due " + dayName(t.due));
}
const c2Owner = id => id ? `<span class="c2own"><i>${esc((fname(id) || "?")[0])}</i>${esc(fname(id))}</span>` : `<span class="c2own none"><i>?</i>no owner</span>`;
function c2TaskDone(id) { const t = S.tasks.find(x => x.id === id); if (!t) return; t.log = t.log || []; if (t.status === "done") { t.status = "open"; delete t.done_at; t.log.push({ at: nowISO(), by: S.me, ev: "status", v: "open" }); toast("Reopened."); } else { t.status = "done"; t.done_at = nowISO(); t.log.push({ at: t.done_at, by: S.me, ev: "status", v: "done" }); toast("Done — " + t.title); } save(); render(); }
const c2TsRow = (t, d) => `<div class="c2ts ${c2Bucket(t, d)}"><button class="c2chk ${t.status === "done" ? "on" : ""}" onclick="c2TaskDone('${t.id}')" aria-label="${t.status === "done" ? "Reopen" : "Mark done"}: ${esc(t.title)}">${ic("check")}</button><button class="b" onclick="go('#/task/${t.id}')"><b>${esc(t.title)}</b><span class="m">${c2Owner(t.owner)}${c2DueChip(t, d)}${t.status === "in_progress" ? chip("info", "in progress") : t.status === "blocked" ? chip("bad", "■ blocked") : ""}</span>${t.source ? `<span class="tiny mut">${esc(t.source)}</span>` : ""}</button></div>`;
function c2TsOwner(k) { C2.tsOwner = k; render(); }
function c2TsShow(k) { C2.tsShow = k; render(); }
function c2QuickDue(k) { const d = today(); C2.qa.due = k === "today" ? d : k === "tomorrow" ? addDays(d, 1) : k === "week" ? addDays(d, 7) : ""; render(); }
function c2QuickAdd() {
  const el = $("#qat"); const title = (el ? el.value : C2.qa.title).trim(); if (!title) { toast("Type the task first."); if (el) el.focus(); return; }
  const at = nowISO(); S.tasks.unshift({ id: "k-" + Date.now(), title, detail: "", owner: C2.qa.owner || S.me, due: C2.qa.due || null, status: "open", source: fname(S.me) || "P99 OS", created: at, log: [{ at, by: S.me, ev: "created" }] });
  C2.qa.title = ""; save(); toast("Task added."); render();
}
function viewTasks() {
  const d = today(), all = S.tasks || [], wk = addDays(d, -6);
  const owners = [...new Set(all.map(t => t.owner).filter(Boolean))].sort((a, b) => fname(a).localeCompare(fname(b)));
  const of = t => C2.tsOwner === "all" || t.owner === C2.tsOwner;
  const act = all.filter(t => t.status !== "done"); const od = act.filter(t => t.due && t.due < d && t.status !== "blocked"); const bl = act.filter(t => t.status === "blocked"); const dw = all.filter(t => t.status === "done" && t.done_at && t.done_at.slice(0, 10) >= wk);
  const tiles = `<div class="grid2">
    ${tile("Open", String(act.length), `${act.filter(t => t.status === "in_progress").length} in progress`, "")}
    ${tile("Overdue", String(od.length), od.length ? chip("bad", "▲ past due date") : chip("ok", "✓ none"), "")}
    ${tile("Blocked", String(bl.length), bl.length ? esc(bl[0].title) : `<span class="mut">none</span>`, "")}
    ${tile("Done · 7 days", String(dw.length), `<span class="mut">${all.filter(t => t.status === "done").length} done in total</span>`, "")}
  </div>`;
  const ownerSel = `<select class="in" onchange="C2.qa.owner=this.value" aria-label="Owner">${PEOPLE.map(p => `<option value="${p.id}" ${(C2.qa.owner || S.me) === p.id ? "selected" : ""}>${esc(p.short)}</option>`).join("")}</select>`;
  const quick = `<section class="card c2qa"><div class="c2qa-r"><input class="in" id="qat" placeholder="Add a task…" value="${esc(C2.qa.title)}" oninput="C2.qa.title=this.value" onkeydown="if(event.key==='Enter')c2QuickAdd()"><button class="btn primary" onclick="c2QuickAdd()">Add</button></div>
    <div class="c2qa-r2">${ownerSel}<div class="c2picks sm">${[["today", "Today"], ["tomorrow", "Tomorrow"], ["week", "In a week"], ["none", "No date"]].map(([k, l]) => { const v = k === "today" ? d : k === "tomorrow" ? addDays(d, 1) : k === "week" ? addDays(d, 7) : ""; return `<button class="${(C2.qa.due || "") === v ? "on" : ""}" onclick="c2QuickDue('${k}')">${l}</button>`; }).join("")}</div></div>
    <a class="tiny" href="#/task/new" onclick="ntask={title:C2.qa.title,detail:'',owner:C2.qa.owner||S.me,due:C2.qa.due,status:'open'}">More detail ›</a></section>`;
  const filt = `<div class="c2filt">${c2tabs([["all", "Everyone"]].concat(owners.map(o => [o, `${esc(fname(o))} ${all.filter(t => t.owner === o && t.status !== "done").length}`])), C2.tsOwner, "c2TsOwner")}${c2tabs([["open", "To do"], ["done", "Done"], ["all", "All"]], C2.tsShow, "c2TsShow")}</div>`;
  const show = all.filter(of).filter(t => C2.tsShow === "all" || (C2.tsShow === "done" ? t.status === "done" : t.status !== "done"));
  const groups = C2G.map(([k, l]) => { const ts = show.filter(t => c2Bucket(t, d) === k).sort((a, b) => (a.due || "9") < (b.due || "9") ? -1 : (a.due || "9") > (b.due || "9") ? 1 : 0); if (k === "done") ts.sort((a, b) => (b.done_at || "") < (a.done_at || "") ? -1 : 1);
    return ts.length ? `<section class="c2grp ${k}"><h3>${l} <span class="num">${ts.length}</span></h3><div class="list">${ts.map(t => c2TsRow(t, d)).join("")}</div></section>` : ""; }).join("");
  const load = owners.map(o => ({ o, n: act.filter(t => t.owner === o).length, od: od.filter(t => t.owner === o).length })).filter(x => x.n).sort((a, b) => b.n - a.n); const lmx = Math.max(1, ...load.map(x => x.n));
  const loadCard = load.length ? `<section class="card"><h2>Open per person <span class="tiny mut">overdue in the tooltip</span></h2><div class="hb">${load.map(x => `<div class="hbr c2load" data-tt="${esc(fname(x.o))}|${x.n} open · ${x.od} overdue"><span class="nm">${esc(fname(x.o))}</span><span class="tr"><i style="width:${(100 * x.n / lmx).toFixed(0)}%"></i></span><span class="vl num">${x.n}${x.od ? `<small class="band-bad">${x.od} late</small>` : ""}</span></div>`).join("")}</div></section>` : "";
  return shell("Tasks", "Pizza 99 to-do list", `${tiles}${quick}${filt}${groups || `<div class="card mut small">${C2.tsShow === "done" ? "Nothing done yet in this view." : "Nothing to do in this view."}</div>`}${loadCard}`);
}
function c2TSet(id, f, v) { const t = S.tasks.find(x => x.id === id); if (!t || t[f] === v) return; t.log = t.log || []; t[f] = v; if (f === "status") { if (v === "done") t.done_at = nowISO(); else delete t.done_at; t.log.push({ at: nowISO(), by: S.me, ev: "status", v }); } if (f === "owner" || f === "due") t.log.push({ at: nowISO(), by: S.me, ev: f, v }); save(); render(); }
function viewTask(id) {
  const d = today(); const owners = cur => PEOPLE.map(p => `<option value="${p.id}" ${cur === p.id ? "selected" : ""}>${esc(p.short)}</option>`).join("");
  const dueChips = (cur, fn) => `<div class="c2picks sm">${[["Today", d], ["Tomorrow", addDays(d, 1)], ["In a week", addDays(d, 7)], ["No date", ""]].map(([l, v]) => `<button class="${(cur || "") === v ? "on" : ""}" onclick="${fn}('${v}')">${l}</button>`).join("")}</div>`;
  if (id === "new") {
    if (!ntask) ntask = { title: "", detail: "", owner: S.me, due: "", status: "open" };
    window._ntDue = v => { ntask.due = v; render(); };
    return shell("New task", "what · who · by when", `<section class="card"><div class="field"><label for="ntt2">Task</label><input class="in" id="ntt2" value="${esc(ntask.title)}" oninput="ntask.title=this.value"></div><div class="field" style="margin-top:10px"><label>Detail</label><textarea class="in" oninput="ntask.detail=this.value">${esc(ntask.detail)}</textarea></div></section>
      <section class="card"><div class="field"><label>Owner</label><select class="in" onchange="ntask.owner=this.value">${owners(ntask.owner)}</select></div><div class="field" style="margin-top:10px"><label>Due</label>${dueChips(ntask.due, "_ntDue")}<input class="in" type="date" value="${ntask.due || ""}" onchange="ntask.due=this.value"></div></section>
      <div class="bottom-act"><button class="btn primary full" onclick="if(!ntask.title.trim()){toast('Type the task first.');return}const at=nowISO();S.tasks.unshift({id:'k-'+Date.now(),title:ntask.title.trim(),detail:ntask.detail,owner:ntask.owner,due:ntask.due||null,status:'open',source:fname(S.me)||'P99 OS',created:at,log:[{at,by:S.me,ev:'created'}]});ntask=null;C2.qa.title='';save();toast('Task added.');go('#/tasks')">Add task</button></div>`, { back: "#/tasks" });
  }
  const t = S.tasks.find(x => x.id === id); if (!t) return viewTasks();
  window._tDue = v => c2TSet(t.id, "due", v || null);
  const log = (t.log || []).slice().reverse();
  const evT = e => e.ev === "status" ? `set status to <b>${esc(String(e.v).replace("_", " "))}</b>` : e.ev === "owner" ? `gave it to <b>${esc(fname(e.v))}</b>` : e.ev === "due" ? `set due to <b>${e.v ? esc(dayName(e.v)) : "no date"}</b>` : e.ev === "created" ? "added it" : esc(e.v || "");
  return shell(t.title, `${esc(fname(t.owner) || "no owner")}${t.due ? " · due " + dayName(t.due) : ""}`, `
    <section class="card"><div class="c2tkh">${c2Owner(t.owner)}${c2DueChip(t, d)}${t.source ? chip("", esc(t.source)) : ""}</div>
      <div class="field" style="margin-top:10px"><label>Detail</label><textarea class="in" onchange="c2TSet('${t.id}','detail',this.value)">${esc(t.detail || "")}</textarea></div></section>
    <section class="card"><h3>Status</h3><div class="seg">${["open", "in_progress", "blocked", "done"].map(s => `<button class="btn ${t.status === s ? "on" : ""}" onclick="c2TSet('${t.id}','status','${s}')">${s.replace("_", " ")}</button>`).join("")}</div></section>
    <section class="card"><h3>Owner</h3><select class="in" onchange="c2TSet('${t.id}','owner',this.value)">${owners(t.owner)}</select><h3 style="margin-top:14px">Due</h3>${dueChips(t.due, "_tDue")}<input class="in" type="date" value="${t.due || ""}" onchange="_tDue(this.value)"></section>
    ${log.length || t.created ? `<section class="card"><h3>History</h3><ol class="c2log">${log.map(e => `<li><span class="tiny mut num">${esc(dayName(String(e.at).slice(0, 10)))} ${timeOf(e.at)}</span><div><b>${esc(fname(e.by) || "—")}</b> ${evT(e)}</div></li>`).join("")}${!log.some(e => e.ev === "created") && t.created ? `<li><span class="tiny mut num">${esc(dayName(t.created.slice(0, 10)))}</span><div>added</div></li>` : ""}</ol></section>` : ""}`, { back: "#/tasks" });
}

/* =====================================================================================================================
   CASH (closing count)
   ===================================================================================================================== */
const C2REASONS = ["Change given wrong", "Refund or void not in the POS", "Paid an expense from the drawer", "GCash rung up as cash", "Not sure — will check"];
function c2VarOf(r) { if (r.variance != null) return { v: r.variance, late: false }; const x = SD[r.day]; if (x && r.total) return { v: Math.round(r.total - (r.fund || 0) - (x.pay.cash || 0)), late: true }; return { v: null, late: false }; }
function c2VarChip(v) { if (v == null) return chip("", "no POS figure"); if (Math.abs(v) <= 5) return chip("ok", "✓ balanced"); if (v < 0) return chip(v < -100 ? "bad" : "warn", "▼ short " + peso(-v)); return chip("warn", "▲ over " + peso(v)); }
function c2Reason(i) { const c = C2.cc; c.reason = (c.reason ? c.reason.replace(/\s*$/, "") + "; " : "") + C2REASONS[i]; render(); }
function c2CashSend(total, pos, varc) {
  const c = C2.cc; const rec = { day: bday(), kind: "closing", d: Object.assign({}, c.d), total, fund: c.fund, pos, gcash: c.gcash, ref: c.ref, photo: c.photo, variance: varc, reason: c.reason, by: S.me, at: nowISO() };
  S.cash.push(rec); C2.cc = null; save(); toast("Cash count sent."); render(); window.scrollTo(0, 0);
}
function viewCash() {
  const day = bday(); if (!C2.cc) C2.cc = { d: {}, fund: FUND, gcash: "", ref: "", photo: null, reason: "" }; const c = C2.cc;
  window.openCashPad1 = dn => openCashPad(c, dn);
  const total = sumDenoms(c), sales = total - c.fund, px = SD[day], pos = px ? (px.pay.cash || 0) : null;
  const varc = total && pos != null ? Math.round(sales - pos) : null; const needReason = varc != null && Math.abs(varc) > 5; const entered = DENOMS.filter(dn => c.d[dn] != null).length;
  const below = total > 0 && total < c.fund;
  const hist = (S.cash || []).filter(r => r.kind !== "walk").slice().sort((a, b) => (a.at || a.day) < (b.at || b.day) ? 1 : -1); const already = hist.find(r => r.day === day);
  const hero = `<section class="card c2cash"><div class="lab">Counted in the drawer</div><div class="big num">${total ? peso(total) : "₱0"}</div>
    <div class="c2kv">
      <div><span>Fund that stays</span><b class="num">${peso(c.fund)}</b></div>
      <div><span>Cash sales counted</span><b class="num">${total ? peso(sales) : "—"}</b></div>
      <div><span>POS cash, ${esc(dayName(day))}</span><b class="num">${pos != null ? peso(pos) : '<span class="mut">not synced yet</span>'}</b></div>
      <div><span>Difference</span><b class="num">${varc != null ? pesoS(varc) : "—"}</b></div></div>
    <div class="c2cash-st">${!total ? `<span class="mut small">Tap each note and coin and type how many pieces.</span>` : varc != null ? c2VarChip(varc) : `<span class="small mut">The POS cash for ${esc(dayName(day))} arrives with the nightly sync; the difference is worked out then.</span>`}${below ? " " + chip("bad", "▼ drawer below the fund") : ""}</div></section>`;
  const grid = `<section class="card"><div class="split"><h2>Notes and coins <span class="tiny mut">${entered} of ${DENOMS.length} entered</span></h2>${entered ? `<button class="btn ghost sm" onclick="if(confirm('Clear the count?')){C2.cc.d={};render()}">Clear</button>` : ""}</div>
    <div class="c2den">${DENOMS.map(dn => { const n = c.d[dn]; return `<button class="${n != null ? "has" : ""}" onclick="openCashPad1(${dn})"><span class="dn">₱${fmt(dn)}</span><span class="pc num">${n != null ? n + " pcs" : "—"}</span><span class="sv num">${n ? peso(dn * n) : ""}</span></button>`; }).join("")}</div></section>`;
  const gc = `<section class="card"><h2>GCash remitted</h2><div class="pair"><div class="field"><label for="gca">Amount (₱)</label><input class="in num" id="gca" inputmode="decimal" value="${esc(c.gcash)}" oninput="C2.cc.gcash=this.value"></div><div class="field"><label for="gcr">Reference no.</label><input class="in num" id="gcr" value="${esc(c.ref)}" oninput="C2.cc.ref=this.value"></div></div>
    <div style="margin-top:10px" class="c2ph">${photoBtn("Screenshot of the remittance", "C2.cc.photo=id;render()", c.photo)}${thumb(c.photo)}</div></section>`;
  const reason = needReason ? `<section class="card c2reason ${varc < 0 ? "short" : "over"}"><div class="field"><label for="cr">${varc < 0 ? "Short" : "Over"} by ${peso(Math.abs(varc))} — why? (required)</label><div class="c2picks sm">${C2REASONS.map((r, i) => `<button onclick="c2Reason(${i})">${esc(r)}</button>`).join("")}</div><textarea class="in" id="cr" oninput="C2.cc.reason=this.value">${esc(c.reason)}</textarea></div></section>` : "";
  const can = total && (!needReason || c.reason.trim());
  const send = `<div class="bottom-act"><button class="btn primary full" ${can ? "" : "disabled"} onclick="c2CashSend(${total},${pos == null ? "null" : pos},${varc == null ? "null" : varc})">Send the cash count${total ? " · " + peso(total) : ""}</button>${!can && total && needReason ? `<div class="tiny mut" style="text-align:center;margin-top:4px">Give the reason for the difference first.</div>` : ""}</div>`;
  /* history */
  const last30 = lastDays(30, day); const perDay = {}; hist.forEach(r => { if (!perDay[r.day]) perDay[r.day] = r; });
  const pts = last30.map(d => { const r = perDay[d]; const vv = r ? c2VarOf(r) : { v: null }; return { label: dayName(d), short: wd3(d)[0] + " " + (+d.slice(8)), v: vv.v, tip: !r ? "no count" : vv.v == null ? `counted ${peso(r.total)} · no POS figure yet` : `${vv.v === 0 ? "exact" : vv.v < 0 ? "short " + peso(-vv.v) : "over " + peso(vv.v)} · counted ${peso(r.total)}${vv.late ? " · worked out after sync" : ""}` }; });
  const vals14 = lastDays(14, day).map(d => perDay[d] ? c2VarOf(perDay[d]).v : null).filter(v => v != null);
  const counted14 = lastDays(14, day).filter(d => perDay[d]).length;
  const hTiles = `<div class="grid2">${tile("Counts · 14 days", String(counted14), `<span class="mut">of 14 closing days</span>`, "")}${tile("Net difference", vals14.length ? pesoS(sum(vals14)) : "—", vals14.length ? `${vals14.length} day${vals14.length === 1 ? "" : "s"} compared with POS` : `<span class="mut">no compared day yet</span>`, "")}${tile("Days short", String(vals14.filter(v => v < -5).length), vals14.some(v => v < -5) ? `worst ${peso(-Math.min(...vals14))}` : `<span class="mut">none short</span>`, "")}${tile("Balanced", String(vals14.filter(v => Math.abs(v) <= 5).length), `<span class="mut">within ₱5</span>`, "")}</div>`;
  const chart = pts.some(p => p.v != null) ? `${c2Bars(pts, { f: v => v === 0 ? "₱0" : (v > 0 ? "+" : "−") + kfmt(Math.abs(v)), cls: p => p.v < -5 ? "neg" : p.v > 5 ? "pos" : "zero", aria: "Cash difference per day" })}<div class="legend"><span><b style="background:var(--bad-dot)"></b>▼ short</span><span><b style="background:var(--warn-dot)"></b>▲ over</span><span><b style="background:var(--sother)"></b>within ₱5</span></div>` : `<div class="mut small">No day can be compared yet: a count needs the POS cash of the same business day, which arrives with the nightly sync.</div>`;
  const list = hist.length ? `<div class="c2cx">${hist.slice(0, 40).map(r => { const vv = c2VarOf(r); return `<details><summary><span class="a"><b>${esc(dayName(r.day))}</b><span class="tiny mut">${timeOf(r.at)} · ${esc(fname(r.by) || "—")}</span></span><span class="c num">${peso(r.total)}</span>${c2VarChip(vv.v)}</summary>
      <div class="c2cxd"><table class="t"><tbody>${DENOMS.filter(dn => r.d && r.d[dn]).map(dn => `<tr><td>₱${fmt(dn)} × ${r.d[dn]}</td><td class="n num">${peso(dn * r.d[dn])}</td></tr>`).join("")}<tr><td>Fund kept</td><td class="n num">${peso(r.fund)}</td></tr><tr><td>POS cash</td><td class="n num">${r.pos != null ? peso(r.pos) : SD[r.day] ? peso(SD[r.day].pay.cash || 0) + " (after sync)" : "—"}</td></tr>${r.gcash ? `<tr><td>GCash remitted${r.ref ? " · ref " + esc(r.ref) : ""}</td><td class="n num">${peso(parseFloat(r.gcash) || 0)}</td></tr>` : ""}</tbody></table>${r.reason ? `<div class="small"><b>Reason:</b> ${esc(r.reason)}</div>` : ""}${r.photo ? thumb(r.photo) : ""}</div></details>`; }).join("")}</div>` : `<div class="mut small">No cash count sent from this device yet.</div>`;
  const histCard = `<section class="card"><h2>History <span class="tiny mut">counted cash sales minus POS cash, per business day</span></h2>${hTiles}<div style="margin-top:12px">${chart}</div>${pts.some(p => p.v != null) ? c2Table(["Day", "Counted", "Difference"], last30.slice().reverse().filter(d => perDay[d]).map(d => [esc(dayName(d)), peso(perDay[d].total), c2VarOf(perDay[d]).v == null ? "—" : pesoS(c2VarOf(perDay[d]).v)])) : ""}<h3 style="margin-top:14px">Counts</h3>${list}</section>`;
  return shell("Cash — closing", `${dayLong(day)} · business day`, `${already ? `<div class="alert ok">✓ Counted ${timeOf(already.at)} by ${esc(fname(already.by) || "—")}: ${peso(already.total)}. A new count adds a second record.</div>` : ""}${hero}${grid}${gc}${reason}${send}${histCard}${cashPadHTML()}`, { back: canManage() ? "#/more" : "#/today" });
}
