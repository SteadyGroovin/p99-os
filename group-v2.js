/* group-v2.js — the group view across stores (v0.20.0, 2026-11-15).
   Stefan: "how much water do we have right now in all the stores together? … if we go into the item, how much water is where", and
   "see in the supplier which shops they deliver to … when they delivered last time". Items stay per store with the same code in every
   store; suppliers are one list. Data (migration 031): os_stock_all() = per store and item code the newest count (closing count or
   morning run) plus what came in and went out since; os_supplier_stores() = per supplier and store the last delivery, the number of
   deliveries and the ₱, from the app's receipts plus the expense files and payables runs (Aug–Nov 2026).
   Read only. Nothing here writes. */

const GRP = { state: "idle", stock: [], sup: [] };
let grpQ = "", grpOnlyMulti = false;
async function grpLoad() {
  if (typeof sb === "undefined" || GRP.state !== "idle") return; GRP.state = "loading";
  try {
    const [a, b] = await Promise.all([sb.rpc("os_stock_all"), sb.rpc("os_supplier_stores")]);
    if (a.error) throw a.error; GRP.stock = a.data || []; GRP.sup = (b && !b.error && b.data) || []; GRP.state = "ok";
  } catch (e) { GRP.state = "fail"; }
  if (/^#\/(item\/|supplier\/|stock-all)/.test(location.hash) && typeof render === "function") render();
}
const grpStoreName = c => c === "HO" ? "Head Office" : (typeof locName === "function" ? locName(c) : c) || c;
const grpStoreOrder = ["P99", "MCC", "DC", "MCBC", "BK", "DH", "OK", "SP", "HO"];
const grpSortStores = (a, b) => (grpStoreOrder.indexOf(a.store) + 99) % 99 - (grpStoreOrder.indexOf(b.store) + 99) % 99;
function grpQty(r) {   /* in the item's own unit: grams as kg, ml as L, pieces as they are */
  if (r.on_hand == null) return null; const v = +r.on_hand;
  if (r.unit === "g") return { v: v / 1000, u: "kg" }; if (r.unit === "ml") return { v: v / 1000, u: "L" }; return { v, u: r.unit === "pc" ? "pcs" : r.unit };   /* a bottle or a cup is a piece in every store */
}
const grpFmt = q => q == null ? "—" : `${fmt(Math.round(q.v * 100) / 100)} <small>${esc(q.u)}</small>`;
function grpTotal(rows) {   /* only when every store counts it the same way */
  const qs = rows.map(grpQty).filter(Boolean); if (!qs.length) return null; const u = qs[0].u;
  if (qs.some(q => q.u !== u)) return { mixed: true }; return { v: qs.reduce((s, q) => s + q.v, 0), u, n: qs.length };
}
const grpSrc = r => r.src === "morning run" ? "morning run" : r.src === "count" ? "count" : "";

/* item page: In all stores */
function grpWhereCard(code) {
  grpLoad();
  if (GRP.state === "loading" || GRP.state === "idle") return `<section class="card mut small">Reading the other stores…</section>`;
  if (GRP.state !== "ok") return "";
  const rows = GRP.stock.filter(r => r.code === code).sort(grpSortStores); if (rows.length < 2 && !rows.some(r => r.store !== skStore())) return "";
  const tot = grpTotal(rows);
  return `<section class="card"><h2>In all stores <span class="tiny mut">${rows.length} store${rows.length === 1 ? "" : "s"}</span></h2>
    <div class="tscroll"><table class="t"><thead><tr><th>Store</th><th class="n">Now</th><th class="n h1">Last count</th><th class="n h1">In / out since</th></tr></thead><tbody>
    ${rows.map(r => { const q = grpQty(r); const me = r.store === skStore();
      return `<tr><td>${me ? "<b>" : ""}${esc(grpStoreName(r.store))}${me ? "</b>" : ""}<div class="tiny mut">${esc(r.name || "")}</div></td><td class="n num">${q ? `<b>${grpFmt(q)}</b>` : `<span class="mut">not counted</span>`}</td><td class="n h1 mut">${r.day ? `${esc(dayName(r.day))}<div class="tiny">${esc(grpSrc(r))}</div>` : "—"}</td><td class="n h1 num mut">${r.since == null || +r.since === 0 ? "—" : (+r.since > 0 ? "+" : "") + fmt(Math.round(+r.since * 100) / 100)}</td></tr>`; }).join("")}
    </tbody>${tot && !tot.mixed ? `<tfoot><tr><td><b>All stores</b></td><td class="n num"><b>${fmt(Math.round(tot.v * 100) / 100)} <small>${esc(tot.u)}</small></b></td><td class="h1"></td><td class="h1"></td></tr></tfoot>` : ""}</table></div>
    ${tot && tot.mixed ? `<div class="tiny mut" style="margin-top:6px">The stores count this in different units, so there is no total.</div>` : ""}
    <div class="tiny mut" style="margin-top:6px">Now = the newest count (closing count or morning run) plus deliveries and transfers since, minus what the recipes say was sold.</div></section>`;
}

/* supplier page: Delivers to */
function grpDeliversCard(name) {
  grpLoad();
  if (GRP.state !== "ok") return GRP.state === "fail" ? "" : `<section class="card mut small">Reading deliveries per store…</section>`;
  const rows = GRP.sup.filter(r => r.supplier === name).sort((a, b) => (a.last_day < b.last_day ? 1 : -1));
  if (!rows.length) return `<section class="card"><h2>Delivers to</h2><div class="mut small">No delivery to any store recorded yet.</div></section>`;
  const money = typeof supMoney === "function" ? supMoney() : true;
  return `<section class="card"><h2>Delivers to <span class="tiny mut">${rows.length} store${rows.length === 1 ? "" : "s"} · since Aug 2026</span></h2>
    <div class="tscroll"><table class="t"><thead><tr><th>Store</th><th class="n">Last delivery</th><th class="n">Deliveries</th>${money ? `<th class="n">Spent</th>` : ""}</tr></thead><tbody>
    ${rows.map(r => `<tr><td>${esc(grpStoreName(r.store))}<div class="tiny mut">${r.src === "sheets" ? "from the expense and payables sheets" : r.src === "app" ? "recorded in the app" : "app and sheets"}</div></td><td class="n">${r.last_day ? esc(dayName(r.last_day)) : "—"}</td><td class="n num">${fmt(+r.deliveries)}</td>${money ? `<td class="n num">${peso(+r.amount)}</td>` : ""}</tr>`).join("")}
    </tbody></table></div><div class="tiny mut" style="margin-top:6px">Deliveries = lines on the bills and expense sheets. My Crepe Cafe and Dragon Crepe come from their sheets until they record deliveries in the app.</div></section>`;
}

/* Stock › All stores: one line per item code, the stores beside it */
function viewStockAll() {
  grpLoad();
  if (GRP.state !== "ok") return shell("All stores", "stock in every store", `<section class="card mut small">${GRP.state === "fail" ? "Could not read the other stores." : "Reading the other stores…"}</section>`, { back: "#/stock" });
  const by = {}; GRP.stock.forEach(r => (by[r.code] = by[r.code] || []).push(r));
  const stores = [...new Set(GRP.stock.map(r => r.store))].sort((a, b) => grpSortStores({ store: a }, { store: b }));
  const q = grpQ.trim().toLowerCase();
  let codes = Object.keys(by).filter(c => !q || c.includes(q) || by[c].some(r => (r.name || "").toLowerCase().includes(q)));
  if (grpOnlyMulti) codes = codes.filter(c => by[c].length > 1);
  const nm = c => (by[c].find(r => r.store === skStore()) || by[c][0]).name || c;
  codes.sort((a, b) => by[b].length - by[a].length || nm(a).localeCompare(nm(b)));
  const counted = codes.filter(c => by[c].some(r => r.on_hand != null)).length;
  const head = `<tr><th>Item</th>${stores.map(s => `<th class="n h1">${esc(s)}</th>`).join("")}<th class="n">All stores</th></tr>`;
  const body = codes.map(c => { const rs = by[c]; const tot = grpTotal(rs); const mine = rs.find(r => r.store === skStore());
    const cells = stores.map(s => { const r = rs.find(x => x.store === s); if (!r) return `<td class="n h1 mut">·</td>`; const qq = grpQty(r); return `<td class="n h1 num">${qq ? fmt(Math.round(qq.v * 100) / 100) : `<span class="mut">–</span>`}</td>`; }).join("");
    const sub = rs.map(r => { const qq = grpQty(r); return `${esc(r.store)} ${qq ? fmt(Math.round(qq.v * 100) / 100) : "–"}`; }).join(" · ");
    return `<tr${mine ? ` class="tap" onclick="go('#/item/${esc(c)}')"` : ""}><td class="nm">${mine ? `<a href="#/item/${esc(c)}" onclick="event.stopPropagation()">${esc(nm(c))}</a>` : esc(nm(c))}<div class="sub2">${sub}</div></td>${cells}<td class="n num">${tot && !tot.mixed ? `<b>${fmt(Math.round(tot.v * 100) / 100)}</b> <small>${esc(tot.u)}</small>` : tot && tot.mixed ? `<span class="mut small">mixed units</span>` : `<span class="mut">not counted</span>`}</td></tr>`; }).join("");
  const bar = `<div class="skact lite" style="align-items:center"><input class="in" style="max-width:260px" placeholder="Search item" value="${esc(grpQ)}" oninput="grpQ=this.value;render();const i=document.querySelector('main input');i.focus();i.setSelectionRange(99,99)"><button class="btn ${grpOnlyMulti ? "on" : ""}" onclick="grpOnlyMulti=!grpOnlyMulti;render()">In 2+ stores</button></div>`;
  return shell("All stores", `${codes.length} items · ${counted} with a count · ${stores.length} stores`, `${bar}<section class="card"><div class="itwrap flat"><table class="itbl">${head}${body ? `<tbody>${body}</tbody>` : ""}</table></div>
    ${body ? "" : `<div class="mut small">No item matches.</div>`}<div class="tiny mut" style="margin-top:8px">Same item = same code in every store. Kilos for things weighed in grams, liters for milliliters, otherwise as counted. Tap an item of this store for its page.</div></section>`, { back: "#/stock" });
}
