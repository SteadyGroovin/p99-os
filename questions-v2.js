/* questions-v2.js — Questions: what the office still needs to know, answered in the app (v0.28.0, 2026-11-20, migration 052).
   Stefan, 20 Nov: "a constant working web page … everything still open, we keep it there." First list: the 52 recipe questions
   from the recipe review (Burger Kong, My Crepes, Pizza 99). Claude adds rows to os_question; the Admin officer (and the office,
   the owners) answer here; Claude enters each answer in Rocket OS and closes the row with a note ("done").
   Status: open → answered (or later = "ask the kitchen") → done. Online only: every save goes straight to the database. */

const QQ = { state: "idle", rows: [], err: "", tab: "open", sec: "all", draft: {}, edit: {}, busy: false };
const qDev = () => typeof sb === "undefined" || (window.OS_LOADED && window.OS_LOADED.dev);

async function qLoad(force) {
  if (QQ.state === "loading" || (["ok", "fail"].includes(QQ.state) && !force)) return;   /* a failed load waits for "Try again", never loops */
  QQ.state = "loading";
  try {
    if (qDev()) QQ.rows = await fetch("dev-questions.json").then(r => r.json());
    else { const r = await sb.from("os_question").select("*").order("sort"); if (r.error) throw r.error; QQ.rows = r.data || []; }
    QQ.state = "ok";
  } catch (x) { QQ.state = "fail"; QQ.err = x.message || String(x); }
  if (/^#\/questions/.test(location.hash) || /^#?\/?(today)?$/.test(location.hash.replace(/^#\//, ""))) render();
}
const qOpenN = () => QQ.rows.filter(q => q.status === "open" || q.status === "later").length;
const qTabOf = q => q.status === "done" ? "done" : q.status === "answered" ? "answered" : "open";

function qDraft(q) {
  if (!QQ.draft[q.id]) QQ.draft[q.id] = { values: Object.assign({}, q.answer || {}), note: q.note || "" };
  return QQ.draft[q.id];
}
function qPick(id, k, v) { const q = QQ.rows.find(x => x.id === id); const d = qDraft(q); d.values[k] = d.values[k] === v ? undefined : v; render(); }
function qSetVal(id, k, v, num) { const q = QQ.rows.find(x => x.id === id); const d = qDraft(q); d.values[k] = v === "" ? undefined : num ? Number(v) : v; }
function qSetNote(id, v) { const q = QQ.rows.find(x => x.id === id); qDraft(q).note = v; }

async function qSave(id, later) {
  if (QQ.busy) return;
  const q = QQ.rows.find(x => x.id === id), d = qDraft(q);
  const values = {}; Object.keys(d.values).forEach(k => { if (d.values[k] !== undefined && d.values[k] !== "") values[k] = d.values[k]; });
  if (!later && !Object.keys(values).length && !d.note.trim()) return toast("Pick an answer or write a note first");
  QQ.busy = true;
  if (qDev()) Object.assign(q, { answer: values, note: d.note.trim() || null, status: later ? "later" : "answered", answered_by: window.DB_ME || "dev", answered_at: new Date().toISOString() });
  else {
    const r = await sb.rpc("os_answer_question", { p_id: id, p_answer: values, p_note: d.note, p_later: !!later });
    if (r.error) { QQ.busy = false; return toast("Not saved: " + r.error.message); }
    Object.assign(q, r.data);
  }
  QQ.busy = false; delete QQ.draft[id]; delete QQ.edit[id];
  toast(later ? "Marked: ask the kitchen" : "Answer saved"); render();
}

function qAnswerText(q) {
  const a = q.answer || {};
  const parts = (q.fields || []).filter(f => a[f.k] !== undefined && a[f.k] !== null && a[f.k] !== "").map(f => (f.label ? f.label + ": " : "") + a[f.k] + (f.unit ? " " + f.unit : ""));
  return parts.join(" · ");
}
const qWhen = t => t ? new Date(t).toLocaleString("en-PH", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
const qWho = k => { const p = typeof Store !== "undefined" && Store.person ? Store.person(k) : null; return p ? (p.short || p.name) : (k || ""); };
const qChip = q => ({ open: chip("bad", "Open"), later: chip("warn", "Ask the kitchen"), answered: chip("ok", "Answered"), done: `<span class="tiny mut">Done</span>` })[q.status] || "";

function qFieldHTML(q, f, d) {
  const v = d.values[f.k], lab = f.label ? `<label>${esc(f.label)}</label>` : "";
  if (f.options) return `<div class="field">${lab}<div class="seg">${f.options.map(o => `<button class="btn ${v === o ? "on" : ""}" onclick="qPick('${q.id}','${f.k}',${esc(JSON.stringify(o))})">${esc(o)}</button>`).join("")}</div></div>`;
  const id = "q-" + q.id + "-" + f.k;
  if (f.type === "text") return `<div class="field"><label for="${id}">${esc(f.label || "")}</label><input class="in" id="${id}" value="${esc(v == null ? "" : v)}" oninput="qSetVal('${q.id}','${f.k}',this.value)"></div>`;
  return `<div class="field"><label for="${id}">${esc(f.label || "")}</label><div style="display:flex;align-items:center;gap:8px"><input class="in num" id="${id}" type="number" inputmode="decimal" min="0" step="any" style="max-width:160px" value="${v == null ? "" : esc(v)}" oninput="qSetVal('${q.id}','${f.k}',this.value,true)">${f.unit ? `<span class="mut">${esc(f.unit)}</span>` : ""}</div></div>`;
}
function qCard(q) {
  const editing = q.status === "open" || q.status === "later" || QQ.edit[q.id];
  const head = `<div class="split"><h3 style="margin:0">${esc(q.title)}</h3>${qChip(q)}</div>`;
  const now = q.now_text ? `<div class="small" style="background:var(--n50);border-radius:8px;padding:10px 12px;margin:8px 0"><div class="tiny mut" style="letter-spacing:.12em;text-transform:uppercase">Now in Rocket OS</div>${esc(q.now_text)}</div>` : "";
  if (!editing) {
    const ans = qAnswerText(q);
    return `<section class="card" id="qc-${q.id}">${head}${now}<div class="small"><b>${esc(q.ask)}</b></div>
      <div style="margin-top:6px">${ans ? esc(ans) : `<span class="mut">No answer fields filled</span>`}</div>${q.note ? `<div class="small" style="margin-top:4px">Note: ${esc(q.note)}</div>` : ""}
      <div class="tiny mut" style="margin-top:6px">${q.answered_at ? "Answered by " + esc(qWho(q.answered_by)) + ", " + qWhen(q.answered_at) : ""}${q.status === "done" && q.done_note ? ` · Entered: ${esc(q.done_note)}` : ""}</div>
      ${q.status === "answered" ? `<button class="btn ghost sm" style="margin-top:8px" onclick="QQ.edit['${q.id}']=true;render()">Change answer</button>` : ""}</section>`;
  }
  const d = qDraft(q);
  return `<section class="card" id="qc-${q.id}">${head}${now}<p style="margin:4px 0 10px"><b>${esc(q.ask)}</b></p>
    <div style="display:grid;gap:12px">${(q.fields || []).map(f => qFieldHTML(q, f, d)).join("")}
      <div class="field"><label for="q-${q.id}-note">Note <span class="mut">(optional)</span></label><textarea class="in" id="q-${q.id}-note" placeholder="${esc(q.placeholder || "Anything different? Write it here.")}" oninput="qSetNote('${q.id}',this.value)">${esc(d.note)}</textarea></div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn primary" onclick="qSave('${q.id}',false)">Save answer</button><button class="btn" onclick="qSave('${q.id}',true)">Ask the kitchen</button>${QQ.edit[q.id] ? `<button class="btn ghost" onclick="delete QQ.edit['${q.id}'];delete QQ.draft['${q.id}'];render()">Cancel</button>` : ""}</div>
    ${q.status === "later" && q.answered_at ? `<div class="tiny mut" style="margin-top:6px">Marked for the kitchen by ${esc(qWho(q.answered_by))}, ${qWhen(q.answered_at)}</div>` : ""}</section>`;
}

function viewQuestions() {
  qLoad();
  const sub = "what the office still needs to know";
  if (QQ.state !== "ok") return shell("Questions", sub, QQ.state === "fail" ? `<div class="alert bad">Could not load: ${esc(QQ.err)} <button class="btn sm" onclick="qLoad(true)">Try again</button></div>` : `<section class="card mut small">Loading…</section>`);
  const n = { open: 0, answered: 0, done: 0 }; QQ.rows.forEach(q => n[qTabOf(q)]++);
  const later = QQ.rows.filter(q => q.status === "later").length;
  const tile = (lab, val, sub2, cls = "") => `<div class="card kt"><div class="lab">${lab}</div><div class="val num ${cls}">${val}</div><div class="trend">${sub2}</div></div>`;
  const secs = [...new Set(QQ.rows.map(q => q.section))];
  const rows = QQ.rows.filter(q => qTabOf(q) === QQ.tab && (QQ.sec === "all" || q.section === QQ.sec));
  const groups = secs.map(s => [s, rows.filter(q => q.section === s)]).filter(([, r]) => r.length);
  const tabs = [["open", "To answer"], ["answered", "Answered"], ["done", "Done"]];
  const empty = { open: "Nothing open here. Thank you!", answered: "No answers waiting. Saved answers show here until the office enters them.", done: "Nothing entered yet. Answers move here once they are in Rocket OS." }[QQ.tab];
  return shell("Questions", sub, `
    <div class="grid2">${tile("To answer", n.open, later ? later + " for the kitchen" : "open questions", n.open ? "band-bad" : "")}${tile("Answered", n.answered, "waiting to be entered")}</div>
    <section class="card"><div class="small mut" style="margin-bottom:10px">Answer what you know and tap <b>Save answer</b>. Not sure? Tap <b>Ask the kitchen</b>, check with the cooks, and come back. The office enters every answer in Rocket OS and moves it to Done.</div>
      <div class="seg sm">${tabs.map(([k, l]) => `<button class="btn ${QQ.tab === k ? "on" : ""}" onclick="QQ.tab='${k}';render()">${l} <span class="mut">${n[k]}</span></button>`).join("")}</div>
      <div class="seg sm" style="margin-top:8px">${[["all", "All"]].concat(secs.map(s => [s, s])).map(([k, l]) => `<button class="btn ${QQ.sec === k ? "on" : ""}" onclick="QQ.sec=${esc(JSON.stringify(k))};render()">${esc(l)}</button>`).join("")}</div></section>
    ${groups.length ? groups.map(([s, r]) => `<h2 style="margin:18px 0 8px">${esc(s)} <span class="tiny mut">${r.length}</span></h2><div style="display:grid;gap:12px">${r.map(qCard).join("")}</div>`).join("") : `<section class="card mut small">${empty}</section>`}`);
}
