/* tasks-v2.js — the company-wide to-do board (Rocket OS v0.10.0, 2026-11-07).
   One Kanban for every venue: Pizza 99, Burger Kong, Dragon Crepe, My Crepes Cafe, My Crepes Beach Club, Dönerhaus, O KOKO, Steampunk and GROUP.
   Columns Backlog · Next · Doing · Waiting · Done (statuses open · next · in_progress · blocked · done).
   Board (drag on a laptop, long-press drag or the ⇅ button on a phone) and List (by due date or by person); filters venue, owner, area, overdue, mine.
   Who sees what is the database's call (migration 019): master and admin every venue, walk GROUP + her own, lead her store.
   The records are S.tasks; sync.js sends store, area and sort with each one. Loaded after clean-v2.js (it uses c2tabs, fname, daysBetween's place). */

const TK_COLS = [["open", "Backlog"], ["next", "Next"], ["in_progress", "Doing"], ["blocked", "Waiting"], ["done", "Done"]];
const TK_STATUS = Object.fromEntries(TK_COLS);
const TK_AREAS = ["Banking", "Bar", "Bathrooms", "Building", "Corporate", "Decor", "Equipment", "Furniture", "Hiring", "HR", "Lighting", "Marketing", "Menu", "Office", "Operations", "Permits", "POS", "Renovation", "Research", "Security", "Signage", "Sound", "Staff", "Staff area", "Vehicles"];
const TK_FALLBACK_STORES = [{ code: "P99", name: "Pizza 99", color: "#2A78D6" }, { code: "BK", name: "Burger Kong" }, { code: "DC", name: "Dragon Crepe" }, { code: "MCC", name: "My Crepes Cafe" }, { code: "MCBC", name: "My Crepes Beach Club" }, { code: "DH", name: "Dönerhaus", color: "#C8322B" }, { code: "OK", name: "O KOKO", color: "#7A4F2A" }, { code: "SP", name: "Steampunk", color: "#5B6770" }];
const TK = { view: "board", venue: "all", owner: "all", area: "all", show: "active", quick: "", listBy: "due", allDone: false, qa: { title: "", owner: "", due: "", store: "", area: "" }, drag: null, before: null, justDragged: false };
let ntask = null;

/* ---------- small helpers ---------- */
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5);
const tkStores = () => [{ code: "GROUP", name: "Group", color: "#717680" }].concat((S.stores && S.stores.length ? S.stores : TK_FALLBACK_STORES));
const tkVenue = code => tkStores().find(s => s.code === code) || { code, name: code || "?", color: "#A4A7AE" };
const tkStoreOf = t => t.store || "P99";                     /* records from before v0.10 carry no venue: they were Pizza 99's */
const tkPeople = () => (S.people && S.people.length ? S.people : PEOPLE.filter(p => p.id !== "store"));
const tkMe = () => window.DB_ME || S.me;
const tkAllVenues = () => !window.DB_ROLE || ["master", "admin"].includes(window.DB_ROLE);
const tkS = t => +(t && t.sort) || 0;
const tkSortKey = t => [tkS(t), t.due || "9999", t.created || ""];
const tkCmp = (a, b) => { const x = tkSortKey(a), y = tkSortKey(b); return x[0] - y[0] || (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0) || (x[2] < y[2] ? -1 : 1); };
const tkVenueChip = code => { const v = tkVenue(code); return `<span class="tkvenue" style="--c:${esc(v.color || "#A4A7AE")}"><i></i>${esc(v.code === "GROUP" ? "Group" : v.name)}</span>`; };
const tkAreaChip = a => a ? `<span class="tkarea">${esc(a)}</span>` : "";
const tkLog = (t, ev, v) => { t.log = t.log || []; t.log.push({ at: nowISO(), by: tkMe(), ev, v }); };
const tkActive = t => t.status !== "done";
const tkOverdue = (t, d) => tkActive(t) && t.status !== "blocked" && t.due && t.due < d;

/* ---------- the due chip, owner badge and list row (lifted from the v0.9 list) ---------- */
const C2G = [["overdue", "Overdue"], ["today", "Due today"], ["week", "Next 7 days"], ["later", "Later"], ["nodate", "No due date"], ["blocked", "Waiting"], ["done", "Done"]];
function c2Bucket(t, d) { if (t.status === "done") return "done"; if (t.status === "blocked") return "blocked"; if (!t.due) return "nodate"; if (t.due < d) return "overdue"; if (t.due === d) return "today"; if (t.due <= addDays(d, 7)) return "week"; return "later"; }
function c2DueChip(t, d) {
  if (t.status === "done") return chip("ok", "✓ done" + (t.done_at ? " " + dayName(t.done_at.slice(0, 10)) : ""));
  if (!t.due) return `<span class="tiny mut">no due date</span>`;
  if (t.due < d) { const n = daysBetween(t.due, d); return chip("bad", `▲ ${n} d late`); }
  if (t.due === d) return chip("warn", "due today");
  if (t.due === addDays(d, 1)) return chip("", "due tomorrow");
  return chip("", "due " + dayName(t.due));
}
const c2Owner = id => id ? `<span class="c2own"><i>${esc((fname(id) || "?")[0])}</i>${esc(fname(id) || id)}</span>` : `<span class="c2own none"><i>?</i>no owner</span>`;
function c2TaskDone(id) { const t = S.tasks.find(x => x.id === id); if (!t) return; if (t.status === "done") { t.status = "open"; delete t.done_at; tkLog(t, "status", "open"); toast("Reopened."); } else { t.status = "done"; t.done_at = nowISO(); tkLog(t, "status", "done"); toast("Done — " + t.title); } save(); render(); }
const c2TsRow = (t, d) => `<div class="c2ts ${c2Bucket(t, d)}"><button class="c2chk ${t.status === "done" ? "on" : ""}" onclick="c2TaskDone('${t.id}')" aria-label="${t.status === "done" ? "Reopen" : "Mark done"}: ${esc(t.title)}">${ic("check")}</button><button class="b" onclick="go('#/task/${t.id}')"><b>${esc(t.title)}</b><span class="m">${tkVenueChip(tkStoreOf(t))}${tkAreaChip(t.area)}${c2Owner(t.owner)}${c2DueChip(t, d)}${t.status !== "open" && t.status !== "done" ? `<span class="tkst ${t.status}">${TK_STATUS[t.status]}</span>` : ""}</span></button></div>`;

/* ---------- filters ---------- */
function tkFiltered() {
  const d = today(), me = tkMe();
  return (S.tasks || []).filter(t => (TK.venue === "all" || tkStoreOf(t) === TK.venue)
    && (TK.owner === "all" || (TK.owner === "none" ? !t.owner : t.owner === TK.owner))
    && (TK.area === "all" || (t.area || "") === TK.area)
    && (TK.quick !== "overdue" || tkOverdue(t, d))
    && (TK.quick !== "mine" || t.owner === me));
}
function tkSet(k, v) { TK[k] = v; render(); }
function tkQuick(k) { TK.quick = TK.quick === k ? "" : k; render(); }

/* ---------- moving a card: column and position ---------- */
function tkMove(id, status, beforeId) {
  const t = S.tasks.find(x => x.id === id); if (!t) return;
  const col = tkFiltered().filter(x => x.status === status && x.id !== id).sort(tkCmp);
  let i = beforeId ? col.findIndex(x => x.id === beforeId) : col.length; if (i < 0) i = col.length;
  const prev = col[i - 1], next = col[i];
  let s = prev && next ? (tkS(prev) + tkS(next)) / 2 : prev ? tkS(prev) + 10 : next ? tkS(next) - 10 : 0;
  if (prev && next && Math.abs(tkS(next) - tkS(prev)) < 0.001) { col.forEach((x, j) => { x.sort = (j + 1) * 10; }); s = i ? tkS(col[i - 1]) + 5 : 5; }  /* two cards on the same spot: number the column again */
  const moved = t.status !== status, from = t.status;
  t.sort = Math.round(s * 1000) / 1000;
  if (moved) { t.status = status; if (status === "done") t.done_at = nowISO(); else if (from === "done") delete t.done_at; tkLog(t, "status", status); }
  save(); render();
  if (moved) toast(`${t.title} → ${TK_STATUS[status]}`);
}
function tkMoveTo(id, status) { const top = tkFiltered().filter(x => x.status === status && x.id !== id).sort(tkCmp)[0]; tkCloseSheet(); tkMove(id, status, top ? top.id : null); }
function tkMoveSheet(id) {
  const t = S.tasks.find(x => x.id === id); if (!t) return; tkCloseSheet();
  const d = document.createElement("div"); d.className = "sheet-bg tksheet"; d.onclick = e => { if (e.target === d) tkCloseSheet(); };
  d.innerHTML = `<div class="sheet"><div class="head"><span class="nm">Move “${esc(t.title)}”</span><button class="btn" onclick="tkCloseSheet()">Close</button></div>
    <div class="tkmovegrid">${TK_COLS.map(([s, l]) => `<button class="btn ${t.status === s ? "on" : ""}" onclick="tkMoveTo('${t.id}','${s}')">${l}</button>`).join("")}</div>
    <button class="btn full" style="margin-top:10px" onclick="tkCloseSheet();go('#/task/${t.id}')">Open the task</button></div>`;
  document.body.appendChild(d);
}
function tkCloseSheet() { document.querySelectorAll(".tksheet").forEach(x => x.remove()); }

/* drag and drop — mouse and trackpad: HTML5 drag events; touch: hold 350 ms, then drag (pointer events) */
function tkPlace(zone, y) {
  let ph = document.querySelector(".tkph"); if (!ph) { ph = document.createElement("div"); ph.className = "tkph"; }
  const cards = [...zone.querySelectorAll(".tkcard:not(.dragging)")]; const nxt = cards.find(c => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; });
  TK.before = nxt ? nxt.dataset.id : null; if (nxt) zone.insertBefore(ph, nxt); else zone.appendChild(ph);
  document.querySelectorAll(".tkcards.over").forEach(z => { if (z !== zone) z.classList.remove("over"); }); zone.classList.add("over");
}
function tkClearDrag() { document.querySelectorAll(".tkph").forEach(x => x.remove()); document.querySelectorAll(".tkcards.over").forEach(z => z.classList.remove("over")); document.querySelectorAll(".tkcard.dragging").forEach(c => c.classList.remove("dragging")); }
function tkDS(e, id) { TK.drag = id; TK.before = null; try { e.dataTransfer.setData("text/plain", id); e.dataTransfer.effectAllowed = "move"; } catch (x) { } setTimeout(() => { const c = document.querySelector(`.tkcard[data-id="${id}"]`); if (c) c.classList.add("dragging"); }, 0); }
function tkDO(e) { if (!TK.drag) return; e.preventDefault(); tkPlace(e.currentTarget, e.clientY); }
function tkDL(e) { if (e.currentTarget.contains(e.relatedTarget)) return; e.currentTarget.classList.remove("over"); }
function tkDrop(e, status) { e.preventDefault(); const id = TK.drag; TK.drag = null; tkClearDrag(); if (id) tkMove(id, status, TK.before); }
function tkDE() { TK.drag = null; tkClearDrag(); }

const TKT = { timer: null, id: null, x: 0, y: 0, on: false, ghost: null };
function tkPD(e, id) {
  if (e.pointerType === "mouse" || e.target.closest(".tkmove")) return;
  TKT.id = id; TKT.x = e.clientX; TKT.y = e.clientY; TKT.on = false; clearTimeout(TKT.timer);
  const card = e.currentTarget;
  TKT.timer = setTimeout(() => {
    TKT.on = true; TK.drag = id; card.classList.add("dragging"); if (navigator.vibrate) navigator.vibrate(15);
    const r = card.getBoundingClientRect(); const g = card.cloneNode(true); g.className = "tkcard tkghost"; g.style.width = r.width + "px"; g.style.left = r.left + "px"; g.style.top = r.top + "px";
    document.body.appendChild(g); TKT.ghost = g; TKT.dx = TKT.x - r.left; TKT.dy = TKT.y - r.top;
  }, 350);
}
function tkPM(e) {
  if (!TKT.id) return;
  if (!TKT.on) { if (Math.abs(e.clientX - TKT.x) > 8 || Math.abs(e.clientY - TKT.y) > 8) { clearTimeout(TKT.timer); TKT.id = null; } return; }
  TKT.ghost.style.left = (e.clientX - TKT.dx) + "px"; TKT.ghost.style.top = (e.clientY - TKT.dy) + "px";
  TKT.ghost.style.display = "none"; const el = document.elementFromPoint(e.clientX, e.clientY); TKT.ghost.style.display = "";
  const zone = el && el.closest(".tkcards"); if (zone) tkPlace(zone, e.clientY);
  const b = document.querySelector(".tkboard"); if (b) { const r = b.getBoundingClientRect(); if (e.clientX > r.right - 40) b.scrollLeft += 12; else if (e.clientX < r.left + 40) b.scrollLeft -= 12; }
}
function tkPU() {
  clearTimeout(TKT.timer); if (!TKT.id) return; const id = TKT.id; TKT.id = null;
  if (!TKT.on) return;
  TKT.on = false; if (TKT.ghost) TKT.ghost.remove(); TKT.ghost = null; TK.justDragged = true; setTimeout(() => { TK.justDragged = false; }, 400);
  const zone = document.querySelector(".tkcards.over"); const status = zone && zone.dataset.status; const before = TK.before; TK.drag = null; tkClearDrag();
  if (status) tkMove(id, status, before);
}
document.addEventListener("pointermove", tkPM, { passive: true });
document.addEventListener("pointerup", tkPU); document.addEventListener("pointercancel", tkPU);
document.addEventListener("touchmove", e => { if (TKT.on) e.preventDefault(); }, { passive: false });   /* while a card is held the page must not scroll */
function tkOpen(id) { if (TK.justDragged || TKT.on) return; go("#/task/" + id); }

/* ---------- the board ---------- */
function tkCard(t, d) {
  return `<article class="tkcard ${c2Bucket(t, d)}" data-id="${t.id}" draggable="true" ondragstart="tkDS(event,'${t.id}')" ondragend="tkDE()" onpointerdown="tkPD(event,'${t.id}')" onclick="tkOpen('${t.id}')">
    <div class="tkt"><b>${esc(t.title)}</b><button class="tkmove" onclick="event.stopPropagation();tkMoveSheet('${t.id}')" aria-label="Move ${esc(t.title)}">${ic("dots-horizontal", "sm")}</button></div>
    <div class="m">${TK.venue === "all" ? tkVenueChip(tkStoreOf(t)) : ""}${tkAreaChip(t.area)}</div>
    <div class="m">${c2Owner(t.owner)}${t.status === "done" || t.due ? c2DueChip(t, d) : ""}</div></article>`;
}
function tkBoard(ts, d) {
  const since = addDays(d, -14);
  return `<div class="tkboard">${TK_COLS.map(([s, l]) => {
    let cs = ts.filter(t => t.status === s); let hidden = 0;
    if (s === "done") { cs.sort((a, b) => (b.done_at || "") < (a.done_at || "") ? -1 : 1); if (!TK.allDone) { const keep = cs.filter(t => (t.done_at || "").slice(0, 10) >= since); hidden = cs.length - keep.length; cs = keep; } }
    else cs.sort(tkCmp);
    return `<section class="tkcol ${s}"><h3>${l} <span class="num">${cs.length}</span></h3>
      <div class="tkcards" data-status="${s}" ondragover="tkDO(event)" ondragleave="tkDL(event)" ondrop="tkDrop(event,'${s}')">${cs.map(t => tkCard(t, d)).join("") || `<div class="tkempty">Drop a card here</div>`}</div>
      ${hidden ? `<button class="btn full tkmore" onclick="tkSet('allDone',true)">Show ${hidden} older</button>` : s === "done" && TK.allDone ? `<button class="btn full tkmore" onclick="tkSet('allDone',false)">Last 14 days only</button>` : ""}</section>`;
  }).join("")}</div>`;
}

/* ---------- the list ---------- */
function tkList(ts, d) {
  const show = ts.filter(t => TK.show === "all" || (TK.show === "done" ? t.status === "done" : tkActive(t)));
  const byDue = (a, b) => (a.due || "9") < (b.due || "9") ? -1 : (a.due || "9") > (b.due || "9") ? 1 : tkCmp(a, b);
  if (TK.listBy === "person") {
    const keys = [...new Set(show.map(t => t.owner || ""))].sort((a, b) => !a ? 1 : !b ? -1 : fname(a).localeCompare(fname(b)));
    return keys.map(k => { const g = show.filter(t => (t.owner || "") === k).sort(byDue);
      return `<section class="c2grp"><h3>${k ? esc(fname(k) || k) : "No owner"} <span class="num">${g.length}</span></h3><div class="list">${g.map(t => c2TsRow(t, d)).join("")}</div></section>`; }).join("");
  }
  return C2G.map(([k, l]) => { const g = show.filter(t => c2Bucket(t, d) === k).sort(byDue); if (k === "done") g.sort((a, b) => (b.done_at || "") < (a.done_at || "") ? -1 : 1);
    return g.length ? `<section class="c2grp ${k}"><h3>${l} <span class="num">${g.length}</span></h3><div class="list">${g.map(t => c2TsRow(t, d)).join("")}</div></section>` : ""; }).join("");
}

/* ---------- the page ---------- */
function tkQuickDue(k) { const d = today(); TK.qa.due = k === "today" ? d : k === "tomorrow" ? addDays(d, 1) : k === "week" ? addDays(d, 7) : ""; render(); }
function tkQuickAdd() {
  const el = $("#qat"); const title = (el ? el.value : TK.qa.title).trim(); if (!title) { toast("Type the task first."); if (el) el.focus(); return; }
  const store = TK.qa.store || (TK.venue !== "all" ? TK.venue : "GROUP");
  const first = (S.tasks || []).filter(x => x.status === "open").sort(tkCmp)[0];
  const at = nowISO(); S.tasks.unshift({ id: "k-" + Date.now(), title, detail: "", owner: TK.qa.owner || null, due: TK.qa.due || null, status: "open", store, area: (TK.qa.area || "").trim() || null, sort: first ? tkS(first) - 10 : 0, source: fname(tkMe()) || "Rocket OS", created: at, log: [{ at, by: tkMe(), ev: "created" }] });
  TK.qa.title = ""; save(); toast(`Task added to ${tkVenue(store).name}.`); render();
}
const tkPersonOpts = (cur, blank) => (blank ? `<option value="">${blank}</option>` : "") + tkPeople().map(p => `<option value="${p.id}" ${cur === p.id ? "selected" : ""}>${esc(p.short || p.name)}</option>`).join("");
const tkVenueOpts = cur => tkStores().map(s => `<option value="${s.code}" ${cur === s.code ? "selected" : ""}>${esc(s.code === "GROUP" ? "Group (all venues)" : s.name)}</option>`).join("");
const tkAreaList = () => `<datalist id="tkareas">${[...new Set(TK_AREAS.concat((S.tasks || []).map(t => t.area).filter(Boolean)))].sort().map(a => `<option value="${esc(a)}">`).join("")}</datalist>`;

function viewTasks() {
  const d = today(), all = S.tasks || [], wk = addDays(d, -6);
  /* venue pills: everything for the owners and admin, otherwise only the venues this login has tasks in */
  const seen = new Set(all.map(tkStoreOf)); const venues = tkStores().filter(s => tkAllVenues() || seen.has(s.code));
  if (TK.venue !== "all" && !venues.some(v => v.code === TK.venue)) TK.venue = "all";
  const inVenue = all.filter(t => TK.venue === "all" || tkStoreOf(t) === TK.venue);
  const act = inVenue.filter(tkActive), od = act.filter(t => tkOverdue(t, d)), wt = act.filter(t => t.status === "blocked"), dw = inVenue.filter(t => t.status === "done" && (t.done_at || "").slice(0, 10) >= wk);
  /* v0.10.2 (Stefan: "see more of the actual board"): no tiles, one toolbar — filters left, the add box right; its extra fields open in a small panel only while you type */
  const openIn = code => all.filter(t => tkActive(t) && tkStoreOf(t) === code).length;
  const pills = `<div class="rng tkvenues" role="tablist"><button class="${TK.venue === "all" ? "on" : ""}" onclick="tkSet('venue','all')">All venues <span class="n">${all.filter(tkActive).length}</span></button>${venues.map(v => `<button class="${TK.venue === v.code ? "on" : ""}" style="--c:${esc(v.color || "#A4A7AE")}" onclick="tkSet('venue','${v.code}')"><i></i>${esc(v.code === "GROUP" ? "Group" : v.name)} <span class="n">${openIn(v.code)}</span></button>`).join("")}</div>`;
  const owners = [...new Set(all.map(t => t.owner).filter(Boolean))].sort((a, b) => fname(a).localeCompare(fname(b)));
  const areas = [...new Set(inVenue.map(t => t.area).filter(Boolean))].sort();
  const qStore = TK.qa.store || (TK.venue !== "all" ? TK.venue : "GROUP");
  const dueOpts = [["", "No date"], [d, "Today"], [addDays(d, 1), "Tomorrow"], [addDays(d, 7), "In a week"]];
  const add = `<div class="tkadd ${TK.qa.title ? "has" : ""}"><div class="tkadd-r"><input class="in" id="qat" placeholder="Add a task…" value="${esc(TK.qa.title)}" oninput="TK.qa.title=this.value;this.closest('.tkadd').classList.toggle('has',!!this.value)" onkeydown="if(event.key==='Enter')tkQuickAdd();if(event.key==='Escape')this.blur()"><button class="btn primary" onclick="tkQuickAdd()">Add</button></div>
    <div class="tkadd-p"><select class="in" aria-label="Venue" onchange="TK.qa.store=this.value">${tkVenueOpts(qStore)}</select><select class="in" aria-label="Owner" onchange="TK.qa.owner=this.value">${tkPersonOpts(TK.qa.owner, "No owner yet")}</select>
      <input class="in" list="tkareas" placeholder="Area" value="${esc(TK.qa.area)}" oninput="TK.qa.area=this.value" aria-label="Area">${tkAreaList()}
      <select class="in" aria-label="Due" onchange="TK.qa.due=this.value">${dueOpts.map(([v, l]) => `<option value="${v}" ${(TK.qa.due || "") === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      <a class="tiny" href="#/task/new" onclick="ntask={title:TK.qa.title,detail:'',owner:TK.qa.owner||'',due:TK.qa.due,store:TK.qa.store||(TK.venue!=='all'?TK.venue:'GROUP'),area:TK.qa.area,status:'open'}">More detail ›</a></div></div>`;
  const bar = `<div class="tkbar">${c2tabs([["board", "Board"], ["list", "List"]], TK.view, "tkView")}
    <select class="in" aria-label="Owner" onchange="tkSet('owner',this.value)"><option value="all">Everyone</option>${owners.map(o => `<option value="${o}" ${TK.owner === o ? "selected" : ""}>${esc(fname(o) || o)}</option>`).join("")}<option value="none" ${TK.owner === "none" ? "selected" : ""}>No owner</option></select>
    <select class="in" aria-label="Area" onchange="tkSet('area',this.value)"><option value="all">All areas</option>${areas.map(a => `<option ${TK.area === a ? "selected" : ""}>${esc(a)}</option>`).join("")}</select>
    <div class="tkq"><button class="${TK.quick === "overdue" ? "on" : ""} ${od.length ? "bad" : ""}" onclick="tkQuick('overdue')">Overdue <span class="n">${od.length}</span></button><button class="${TK.quick === "mine" ? "on" : ""}" onclick="tkQuick('mine')">Mine</button></div>
    ${TK.view === "list" ? `${c2tabs([["due", "By due date"], ["person", "By person"]], TK.listBy, "tkListBy")}${c2tabs([["active", "To do"], ["done", "Done"], ["all", "All"]], TK.show, "tkShow")}` : ""}
    ${add}</div>`;
  const ts = tkFiltered();
  const body = TK.view === "board" ? tkBoard(ts, d) : (tkList(ts, d) || `<div class="card mut small">Nothing in this view.</div>`);
  const sub = `${act.length} open · ${od.length ? `<span class="band-bad">${od.length} overdue</span> · ` : ""}${wt.length} waiting · ${dw.length} done this week · ${TK.venue === "all" ? "every venue" : esc(tkVenue(TK.venue).name)}`;
  return shell("Tasks", sub, `<div class="tkpage ${TK.view}">${pills}${bar}${body}</div>`);
}
function tkView(k) { TK.view = k; render(); }
function tkListBy(k) { TK.listBy = k; render(); }
function tkShow(k) { TK.show = k; render(); }

/* ---------- one task ---------- */
function c2TSet(id, f, v) {
  const t = S.tasks.find(x => x.id === id); if (!t) return; if (f === "area") v = (v || "").trim() || null; if ((t[f] || null) === (v || null)) return;
  const from = t.status; t[f] = v;
  if (f === "status") { if (v === "done") t.done_at = nowISO(); else if (from === "done") delete t.done_at; const top = (S.tasks || []).filter(x => x.status === v && x.id !== id).sort(tkCmp)[0]; t.sort = top ? tkS(top) - 10 : 0; }
  if (["status", "owner", "due", "store", "area"].includes(f)) tkLog(t, f, v);
  save(); render();
}
function viewTask(id) {
  const d = today();
  const dueChips = (cur, fn) => `<div class="c2picks sm">${[["Today", d], ["Tomorrow", addDays(d, 1)], ["In a week", addDays(d, 7)], ["No date", ""]].map(([l, v]) => `<button class="${(cur || "") === v ? "on" : ""}" onclick="${fn}('${v}')">${l}</button>`).join("")}</div>`;
  if (id === "new") {
    if (!ntask) ntask = { title: "", detail: "", owner: "", due: "", store: TK.venue !== "all" ? TK.venue : "GROUP", area: "", status: "open" };
    window._ntDue = v => { ntask.due = v; render(); };
    window._ntAdd = () => { if (!ntask.title.trim()) { toast("Type the task first."); return; } const at = nowISO(); const first = (S.tasks || []).filter(x => x.status === ntask.status).sort(tkCmp)[0];
      S.tasks.unshift({ id: "k-" + Date.now(), title: ntask.title.trim(), detail: ntask.detail, owner: ntask.owner || null, due: ntask.due || null, status: ntask.status, store: ntask.store || "GROUP", area: (ntask.area || "").trim() || null, sort: first ? tkS(first) - 10 : 0, source: fname(tkMe()) || "Rocket OS", created: at, log: [{ at, by: tkMe(), ev: "created" }] });
      ntask = null; TK.qa.title = ""; save(); toast("Task added."); go("#/tasks"); };
    return shell("New task", "what · where · who · by when", `<section class="card"><div class="field"><label for="ntt2">Task</label><input class="in" id="ntt2" value="${esc(ntask.title)}" oninput="ntask.title=this.value"></div><div class="field" style="margin-top:10px"><label>Detail</label><textarea class="in" oninput="ntask.detail=this.value">${esc(ntask.detail)}</textarea></div></section>
      <section class="card"><div class="field"><label>Venue</label><select class="in" onchange="ntask.store=this.value">${tkVenueOpts(ntask.store)}</select></div>
        <div class="field" style="margin-top:10px"><label>Area</label><input class="in" list="tkareas" value="${esc(ntask.area || "")}" oninput="ntask.area=this.value" placeholder="e.g. Banking, Hiring">${tkAreaList()}</div>
        <div class="field" style="margin-top:10px"><label>Column</label><div class="seg">${TK_COLS.slice(0, 4).map(([s, l]) => `<button class="btn ${ntask.status === s ? "on" : ""}" onclick="ntask.status='${s}';render()">${l}</button>`).join("")}</div></div></section>
      <section class="card"><div class="field"><label>Owner</label><select class="in" onchange="ntask.owner=this.value">${tkPersonOpts(ntask.owner, "No owner yet")}</select></div><div class="field" style="margin-top:10px"><label>Due</label>${dueChips(ntask.due, "_ntDue")}<input class="in" type="date" value="${ntask.due || ""}" onchange="ntask.due=this.value"></div></section>
      <div class="bottom-act"><button class="btn primary full" onclick="_ntAdd()">Add task</button></div>`, { back: "#/tasks" });
  }
  const t = S.tasks.find(x => x.id === id); if (!t) return viewTasks();
  window._tDue = v => c2TSet(t.id, "due", v || null);
  const log = (t.log || []).slice().reverse();
  const evT = e => e.ev === "status" ? `moved it to <b>${esc(TK_STATUS[e.v] || String(e.v).replace("_", " "))}</b>` : e.ev === "owner" ? (e.v ? `gave it to <b>${esc(fname(e.v) || e.v)}</b>` : "took the owner off") : e.ev === "due" ? `set due to <b>${e.v ? esc(dayName(e.v)) : "no date"}</b>`
    : e.ev === "store" ? `moved it to <b>${esc(tkVenue(e.v).name)}</b>` : e.ev === "area" ? (e.v ? `tagged it <b>${esc(e.v)}</b>` : "took the area off") : e.ev === "created" ? "added it" : esc(e.v || "");
  return shell(t.title, `${esc(tkVenue(tkStoreOf(t)).name)} · ${esc(fname(t.owner) || "no owner")}${t.due ? " · due " + dayName(t.due) : ""}`, `
    <section class="card"><div class="c2tkh">${tkVenueChip(tkStoreOf(t))}${tkAreaChip(t.area)}${c2Owner(t.owner)}${c2DueChip(t, d)}${t.source ? chip("", esc(t.source)) : ""}</div>
      <div class="field" style="margin-top:10px"><label>Task</label><input class="in" value="${esc(t.title)}" onchange="if(this.value.trim())c2TSet('${t.id}','title',this.value.trim())"></div>
      <div class="field" style="margin-top:10px"><label>Detail</label><textarea class="in" onchange="c2TSet('${t.id}','detail',this.value)">${esc(t.detail || "")}</textarea></div></section>
    <section class="card"><h3>Column</h3><div class="seg tkseg">${TK_COLS.map(([s, l]) => `<button class="btn ${t.status === s ? "on" : ""}" onclick="c2TSet('${t.id}','status','${s}')">${l}</button>`).join("")}</div></section>
    <section class="card"><div class="field"><label>Venue</label><select class="in" onchange="c2TSet('${t.id}','store',this.value)">${tkVenueOpts(tkStoreOf(t))}</select></div>
      <div class="field" style="margin-top:10px"><label>Area</label><input class="in" list="tkareas" value="${esc(t.area || "")}" onchange="c2TSet('${t.id}','area',this.value)" placeholder="e.g. Banking, Hiring">${tkAreaList()}</div></section>
    <section class="card"><h3>Owner</h3><select class="in" onchange="c2TSet('${t.id}','owner',this.value||null)">${tkPersonOpts(t.owner, "No owner yet")}</select><h3 style="margin-top:14px">Due</h3>${dueChips(t.due, "_tDue")}<input class="in" type="date" value="${t.due || ""}" onchange="_tDue(this.value)"></section>
    ${log.length || t.created ? `<section class="card"><h3>History</h3><ol class="c2log">${log.map(e => `<li><span class="tiny mut num">${esc(dayName(String(e.at).slice(0, 10)))} ${timeOf(e.at)}</span><div><b>${esc(fname(e.by) || "—")}</b> ${evT(e)}</div></li>`).join("")}${!log.some(e => e.ev === "created") && t.created ? `<li><span class="tiny mut num">${esc(dayName(t.created.slice(0, 10)))}</span><div>added</div></li>` : ""}</ol></section>` : ""}`, { back: "#/tasks" });
}
