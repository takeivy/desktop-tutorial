/* Trip Planner experience – one data model, three audiences (Planner / Family / Public).
   Data comes from trip-data.js or from the Trip Planner feature service (CONFIG.serviceUrl). */
(function () {
"use strict";
/* ---- start-up diagnostics: any failure is shown on the page, not just the console ---- */
const step = (msg) => console.log("[trip] " + msg);
function showFatal(where, err) {
  console.error("[trip] FAILED at " + where, err);
  const d = document.createElement("div");
  d.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;background:#BF3030;color:#fff;padding:10px 14px;border-radius:6px;font:13px/1.4 system-ui";
  d.textContent = "Trip Planner could not start (" + where + "): " + (err && (err.stack || err.message) || err);
  document.body.appendChild(d);
}
window.addEventListener("error", (e) => showFatal("script error", e.error || e.message));
window.addEventListener("unhandledrejection", (e) => showFatal("promise", e.reason));
step("app.js loaded");
const CFG = window.CONFIG;
const DAY_COLORS = ["#0D1A2B","#0B5CAB","#00727A","#1E7B34","#A6BF80","#D97706","#BF3030","#5B2C83","#152840","#787878"];
const CAT = {StartEnd:["Start / end","#0D1A2B"],Logistics:["Logistics","#152840"],Fuel:["Fuel / rest","#787878"],Meal:["Meal","#D97706"],
  Attraction:["Attraction","#5B2C83"],Park:["Park / outdoors","#1E7B34"],PhotoStop:["Photo stop","#00727A"],Lodging:["Lodging","#0B5CAB"],
  Family:["Family","#BF3030"],Event:["Event","#A6BF80"]};
const MAIN = ["Planned","Booked","Confirmed","Visited"];             // shown on the day timeline
const MEDIA_ICON = {Photo:"camera",Video:"video",Audio:"microphone",Note:"pencil",Receipt:"file",Ticket:"file",Document:"file-text",Link:"link"};
const RANK = {Public:0, Family:1, Private:2};          // record visibility
const LEVEL = {Public:0, Family:1, Planner:2};         // what each view may see
const STORE = "tripplanner:" + CFG.tripId;

let D = null;                 // the trip model
let mode = new URLSearchParams(location.search).get("view") || CFG.defaultMode;
if (!CFG.allowModes.includes(mode)) mode = CFG.allowModes[0];
let day = +(new URLSearchParams(location.search).get("day") || 0);  // 0 = whole trip
let section = "Itinerary";
let view, lyrLegs, lyrStops, lyrMedia, Graphic, mediaLayer = null;
const previews = {};          // MediaID -> object URL (local files, this session only)

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = (n) => "$" + Number(n || 0).toLocaleString("en-US", {maximumFractionDigits: 0});
const visible = (r) => RANK[r.Visibility || "Public"] <= LEVEL[mode];
const fmtDate = (iso) => iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-US", {weekday:"short", month:"short", day:"numeric"}) : "";
const chip = (s, label) => s ? `<span class="chip s-${esc(s)}">${esc(label || s.replace(/([a-z])([A-Z])/g, "$1 $2"))}</span>` : "";
const toast = (m) => { $("#toastMsg").textContent = m; const t = $("#toast"); t.open = false; requestAnimationFrame(() => t.open = true); };

/* ---------------- local overlay: checklist ticks + media status/links persist in this browser ---------------- */
const overlay = JSON.parse(localStorage.getItem(STORE) || '{"tasks":{},"media":{}}');
const save = () => localStorage.setItem(STORE, JSON.stringify(overlay));
function applyOverlay() {
  D.tasks.forEach((t) => { if (overlay.tasks[t.TaskID]) t.TaskStatus = overlay.tasks[t.TaskID]; });
  D.media.forEach((m) => Object.assign(m, overlay.media[m.MediaID] || {}));
}

/* ---------------- data loading ---------------- */
async function loadFromService(FeatureLayer) {
  const ids = {stops:0, media:1, legs:2, trip:3, days:4, bookings:5, tasks:6, budget:7};
  const base = CFG.serviceUrl.replace(/\/$/, "");
  const q = async (key) => {
    try {
      const fl = new FeatureLayer({url: `${base}/${ids[key]}`});
      const r = await fl.queryFeatures({where: `TripID = '${CFG.tripId.replace(/'/g, "''")}'`, outFields: ["*"], returnGeometry: true, outSpatialReference: {wkid: 4326}});
      return r.features.map((f) => {
        const a = {...f.attributes};
        Object.keys(a).forEach((k) => { if (typeof a[k] === "number" && /Date|At$/.test(k) && a[k] > 1e11) a[k] = new Date(a[k]).toISOString().slice(0, 10); });
        if (f.geometry && f.geometry.type === "point") { a.lat = f.geometry.y; a.lon = f.geometry.x; }
        if (f.geometry && f.geometry.type === "polyline") a.paths = f.geometry.paths;
        a._oid = a.OBJECTID; return a;
      });
    } catch (e) { console.warn("Layer not available in this service/view:", key, e.message); return []; }
  };
  const [stops, media, legs, trip, days, bookings, tasks, budget] = await Promise.all(Object.keys(ids).map(q));
  mediaLayer = new FeatureLayer({url: `${base}/${ids.media}`});
  return {trip: trip[0] || {TripName: CFG.tripId}, stops, media, legs, days, bookings, tasks, budget};
}

/* ---------------- header + KPIs ---------------- */
function header() {
  const name = D.trip.TripN
