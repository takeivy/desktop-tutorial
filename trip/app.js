/* Trip Planner experience – one data model, three audiences (Planner / Family / Public).
   Data comes from trip-data.js or from the Trip Planner feature service (CONFIG.serviceUrl). */
(function () {
"use strict";
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
  const name = D.trip.TripName || "Trip";
  const words = name.split(" "); const k = Math.min(2, words.length - 1);   // one green word, team standard
  $("#title").innerHTML = words.map((w, i) => i === k ? `<em>${esc(w)}</em>` : esc(w)).join(" ") +
    `<small>${fmtDate(D.trip.StartDate)} – ${fmtDate(D.trip.EndDate)} · ${esc(D.trip.Summary || "")}</small>`;
  document.title = "Trip Planner – " + name;
  $("#mode").innerHTML = CFG.allowModes.map((m) => `<calcite-segmented-control-item value="${m}" ${m === mode ? "checked" : ""}>${m}</calcite-segmented-control-item>`).join("");
  if (CFG.allowModes.length < 2) $("#mode").hidden = true;
}
function kpis() {
  const days = D.days.length, miles = D.trip.TotalMiles || D.legs.reduce((s, l) => s + (l.Miles || 0), 0);
  const hrs = D.trip.TotalDriveHours || D.legs.reduce((s, l) => s + (l.DriveHours || 0), 0);
  const med = D.media.filter(visible), got = med.filter((m) => m.MediaStatus !== "Placeholder").length;
  const tiles = [[days, "days"], [Math.round(miles).toLocaleString(), "miles approx."], [Math.round(hrs), "driving hrs"]];
  if (mode === "Public") tiles.push([D.stops.filter((s) => visible(s) && MAIN.includes(s.PlanStatus)).length, "stops"], [`${got}/${med.length}`, "moments captured"], [D.days.filter((d) => !d.Miles).length, "no-long-drive days"]);
  else {
    const total = D.budget.reduce((s, b) => s + (b.Amount || 0), 0), booked = D.budget.filter((b) => ["Booked","Paid"].includes(b.CostStatus)).reduce((s, b) => s + b.Amount, 0);
    const open = D.tasks.filter((t) => t.TaskStatus !== "Done").length;
    tiles.push([money(total), money(booked) + " booked"], [`${got}/${med.length}`, "moments captured"], [open, "tasks open"]);
  }
  $("#kpis").innerHTML = tiles.map(([v, l]) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("");
}
function sections() {
  const list = mode === "Public" ? ["Itinerary","Media","Share"] : ["Itinerary","Media","Budget","Checklist","Share"];
  if (!list.includes(section)) section = "Itinerary";
  $("#sections").innerHTML = list.map((s) => `<calcite-segmented-control-item value="${s}" ${s === section ? "checked" : ""}>${s}</calcite-segmented-control-item>`).join("");
}
function dayChips() {
  return `<div class="daychips">${[0, ...D.days.map((d) => d.DayNumber)].map((n) =>
    `<button data-day="${n}" class="${n === day ? "on" : ""}">${n ? "Day " + n : "Whole trip"}</button>`).join("")}</div>`;
}

/* ---------------- sections ---------------- */
function itinerary() {
  const days = D.days.filter(visible).filter((d) => !day || d.DayNumber === day).sort((a, b) => a.DayNumber - b.DayNumber);
  return dayChips() + days.map((d) => {
    const st = D.stops.filter((s) => s.DayNumber === d.DayNumber && visible(s)).sort((a, b) => a.Sequence - b.Sequence);
    const main = st.filter((s) => MAIN.includes(s.PlanStatus)), other = st.filter((s) => !MAIN.includes(s.PlanStatus));
    const c = DAY_COLORS[(d.DayNumber - 1) % DAY_COLORS.length];
    const mc = (sid) => D.media.filter((m) => m.StopID === sid && visible(m)).length;
    const li = (s) => `<li data-stop="${esc(s.StopID)}"><span class="t">${esc(s.PlannedTime || "")}</span><span class="dot" style="background:${(CAT[s.Category] || ["", "#888"])[1]}"></span>
      <span><b>${esc(s.StopName)}</b>${s.WhyGo ? `<br><span class="meta">${esc(s.WhyGo)}</span>` : ""}${mc(s.StopID) ? ` <span class="mcount">· ${mc(s.StopID)} media</span>` : ""}</span>${chip(s.PlanStatus)}</li>`;
    return `<article class="day" style="--c:${c}">
      <header data-day="${d.DayNumber}"><div class="num">${d.DayNumber}</div><div style="flex:1"><h3>${esc(d.Title)}</h3>
      <div class="meta">${fmtDate(d.TripDate)} · ${esc(d.RouteText || "")}${d.Miles ? ` · ~${d.Miles} mi` : ""}${d.DriveHours ? ` · ${d.DriveHours} hrs driving` : ""}</div></div></header>
      <p>${esc(d.Summary)}</p>
      <ul class="stops">${main.map(li).join("")}</ul>
      <div class="over"><b>Overnight:</b> ${esc(d.Overnight || "")} ${mode !== "Public" ? chip(d.OvernightStatus, d.OvernightStatus === "ToBook" ? "To book" : null) : ""}
        ${mode !== "Public" && d.EstDayCost ? `<br><b>Estimate:</b> ${esc(d.EstDayCost)}` : ""}</div>
      ${other.length || d.Alternates ? `<details><summary>Alternates and ideas (${other.length})</summary>${d.Alternates ? `<p style="margin:6px 0">${esc(d.Alternates)}</p>` : ""}<ul class="stops" style="padding:0">${other.map(li).join("")}</ul></details>` : ""}
    </article>`;
  }).join("") + `<div class="note">Drive times are pure driving estimates. Add 1–2 hours a day for fuel, meals and stops. Route lines are schematic until solved.</div>`;
}
function mediaPane() {
  const items = D.media.filter(visible).filter((m) => !day || m.DayNumber === day || (day && m.DayNumber === 0)).sort((a, b) => a.DayNumber - b.DayNumber);
  const stopName = (sid) => (D.stops.find((s) => s.StopID === sid) || {}).StopName || "Whole trip";
  return dayChips() + `<div class="note">Each tile is a placeholder for a digital artifact. Attach a file, or paste a link to an album, video or document.
    ${CFG.serviceUrl ? "Files are saved as attachments on the Media layer." : "Running from the template file: links and status are kept in this browser; files preview for this session only. Connect the feature service to store files."}</div>
    <div class="grid">${items.map((m) => {
      const p = previews[m.MediaID]; const has = p || m.ExternalURL || m.MediaStatus !== "Placeholder";
      const thumb = p ? (p.type.startsWith("video") ? `<video src="${p.url}" muted></video>` : p.type.startsWith("image") ? `<img src="${p.url}" alt="">` : `<span>📎 ${esc(p.name)}</span>`) : "";
      return `<div class="tile ${has ? "has" : ""}" data-media="${esc(m.MediaID)}">
        ${m.Visibility !== "Public" ? `<span class="lock chip s-Idea">${esc(m.Visibility)}</span>` : ""}
        <calcite-icon icon="${MEDIA_ICON[m.MediaType] || "file"}" scale="s"></calcite-icon>
        <h4>${esc(m.Title)}</h4><span class="meta">Day ${m.DayNumber || "–"} · ${esc(stopName(m.StopID))}</span>
        ${thumb}<span>${esc(m.Caption || m.Prompt)}</span>
        ${m.ExternalURL ? `<a href="${esc(m.ExternalURL)}" target="_blank" rel="noopener">Open link</a>` : ""}
        <div class="acts">${chip(m.MediaStatus)}${mode !== "Public" ? `<button class="btn pri" data-act="attach">Attach</button><button class="btn" data-act="link">Link</button><button class="btn" data-act="caption">Caption</button><button class="btn" data-act="status">Status ›</button>` : ""}</div>
      </div>`; }).join("")}</div>`;
}
function budgetPane() {
  const items = D.budget, total = items.reduce((s, b) => s + (b.Amount || 0), 0);
  const booked = items.filter((b) => ["Booked","Paid"].includes(b.CostStatus)).reduce((s, b) => s + b.Amount, 0);
  const target = D.trip.BudgetTarget || total;
  const cats = {}; items.forEach((b) => cats[b.BudgetCategory] = (cats[b.BudgetCategory] || 0) + b.Amount);
  const pal = ["#152840","#0B5CAB","#00727A","#1E7B34","#A6BF80","#D97706","#787878"];
  return `<h2 class="sec">Budget</h2>
    <p style="font-size:.85rem;margin:0 0 6px"><b>${money(total)}</b> planned against a ${money(target)} target · <b>${money(booked)}</b> already booked.</p>
    <div class="bar" title="Booked vs estimate"><i style="width:${booked / total * 100}%;background:var(--navy)"></i><i style="width:${(total - booked) / total * 100}%;background:var(--sage)"></i></div>
    <div class="meta" style="margin:3px 0 12px">■ booked  ■ still an estimate</div>
    ${Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, v], i) => `<div style="font-size:.78rem;margin:4px 0">${esc(c.replace(/([a-z])([A-Z])/g, "$1 & $2"))} <b style="float:right">${money(v)}</b>
      <div class="bar"><i style="width:${v / total * 100}%;background:${pal[i % pal.length]}"></i></div></div>`).join("")}
    <table style="margin-top:12px"><tr><th>Item</th><th>Status</th><th class="n">Amount</th></tr>
    ${items.map((b) => `<tr><td>${esc(b.Item)}</td><td>${chip(b.CostStatus)}</td><td class="n">${money(b.Amount)}</td></tr>`).join("")}
    <tr><th>Total (approx.)</th><th></th><th class="n">${money(total)}</th></tr></table>
    ${mode === "Planner" ? `<h2 class="sec" style="margin-top:16px">Bookings</h2><table><tr><th>Booking</th><th>Dates</th><th>Status</th></tr>
      ${D.bookings.map((b) => `<tr><td>${esc(b.Vendor)}${b.Confirmation ? `<br><span class="meta">Conf: ${esc(b.Confirmation)}</span>` : ""}${b.CancelBy ? `<br><span class="meta">Free cancellation until ${fmtDate(b.CancelBy)}</span>` : ""}</td>
      <td>${fmtDate(b.StartDate)}${b.EndDate && b.EndDate !== b.StartDate ? "–" + fmtDate(b.EndDate) : ""}</td><td>${chip(b.BookingStatus, b.BookingStatus === "ToBook" ? "To book" : null)}</td></tr>`).join("")}</table>` : ""}`;
}
function checklistPane() {
  const today = new Date().toISOString().slice(0, 10);
  const ts = [...D.tasks].sort((a, b) => (a.TaskStatus === "Done") - (b.TaskStatus === "Done") || String(a.DueDate || "9").localeCompare(String(b.DueDate || "9")));
  return `<h2 class="sec">Checklist · ${D.tasks.filter((t) => t.TaskStatus === "Done").length} of ${D.tasks.length} done</h2>` + ts.map((t) => {
    const done = t.TaskStatus === "Done", late = !done && t.DueDate && t.DueDate < today;
    return `<label class="task ${done ? "done" : ""}"><calcite-checkbox data-task="${esc(t.TaskID)}" ${done ? "checked" : ""}></calcite-checkbox>
      <span style="flex:1"><span class="txt">${esc(t.Task)}</span>${t.DueDate ? `<br><span class="meta">Due ${fmtDate(t.DueDate)}</span>` : ""}</span>${late ? chip("Overdue") : ""}</label>`;
  }).join("") + `<div class="note">Ticks are saved in this browser. In the feature service, the Tasks table is the shared list (edit it in Field Maps, Survey123 or the Experience Builder edit widget).</div>`;
}
function sharePane() {
  const card = (h, p, btns) => `<div class="share-card"><h4>${h}</h4><p>${p}</p>${btns}</div>`;
  return `<h2 class="sec">Share this trip</h2>
   <div class="note">You are sharing the <b>${mode}</b> view${day ? ` for Day ${day}` : ""}. Public hides family-only and private records, bookings, budget and the checklist.</div>
   ${card("Link", "Opens this app on the same view and day. Works in Teams, email, text and social posts.", `<button class="btn pri" data-share="link">Copy link</button> <button class="btn" data-share="native">Share…</button> <button class="btn" data-share="public">Copy public link</button>`)}
   ${card("Trip summary text", "A plain-text day-by-day summary to paste into a Teams chat, a text thread or an email.", `<button class="btn pri" data-share="text">Copy summary</button>`)}
   ${card("Calendar", "One all-day event per day with the route and overnight. Opens in Outlook, Google or Apple Calendar.", `<button class="btn pri" data-share="ics">Download .ics</button>`)}
   ${card("Map data", "Stops, route legs and media placeholders for this view. GeoJSON and CSV load in ArcGIS Online; KML and CSV load in Google My Maps and Google Earth.", `<button class="btn pri" data-share="geojson">GeoJSON</button> <button class="btn" data-share="kml">KML</button> <button class="btn" data-share="csv">CSV</button>`)}
   ${card("Embed", "Drop the app into an ArcGIS StoryMap (Embed block), a Hub page or a website.", `<button class="btn pri" data-share="embed">Copy embed code</button>`)}
   ${D.trip.AlbumURL ? card(esc(CFG.albumLabel), "Where the full-resolution photos live.", `<a class="btn pri" href="${esc(D.trip.AlbumURL)}" target="_blank" rel="noopener">Open album</a>`) : ""}
   ${card("Print or PDF", "Prints the itinerary panel.", `<button class="btn" data-share="print">Print</button>`)}`;
}
function render() {
  kpis(); sections();
  $("#pane").innerHTML = {Itinerary: itinerary, Media: mediaPane, Budget: budgetPane, Checklist: checklistPane, Share: sharePane}[section]();
  drawMap();
  const u = new URL(location.href); u.searchParams.set("view", mode); day ? u.searchParams.set("day", day) : u.searchParams.delete("day");
  history.replaceState(null, "", u);
}

/* ---------------- map ---------------- */
function drawMap() {
  if (!view) return;
  [lyrLegs, lyrStops, lyrMedia].forEach((l) => l.removeAll());
  const inDay = (r) => !day || r.DayNumber === day;
  D.legs.filter(visible).filter(inDay).forEach((l) => lyrLegs.add(new Graphic({
    geometry: {type: "polyline", paths: l.paths, spatialReference: {wkid: 4326}},
    symbol: {type: "simple-line", color: DAY_COLORS[(l.DayNumber - 1) % DAY_COLORS.length], width: 3.5, style: l.RouteMethod === "Schematic" ? "short-dash" : "solid"},
    attributes: l, popupTemplate: {title: `Day ${l.DayNumber}: ${l.LegName}`, content: `About ${l.Miles} miles, ${l.DriveHours} hrs of driving. ${esc(l.Notes || "")}<br><i>${l.RouteMethod === "Schematic" ? "Schematic line – not the road route." : "Solved route."}</i>`}})));
  D.stops.filter(visible).filter(inDay).forEach((s) => {
    const main = MAIN.includes(s.PlanStatus), col = (CAT[s.Category] || ["", "#888"])[1];
    lyrStops.add(new Graphic({geometry: {type: "point", longitude: s.lon, latitude: s.lat},
      symbol: {type: "simple-marker", style: "circle", size: main ? 12 : 8, color: main ? col : [255, 255, 255, 0.9], outline: {color: main ? "#fff" : col, width: main ? 1.5 : 2}},
      attributes: s, popupTemplate: {title: `${esc(s.StopName)}`, content: stopPopup(s)}}));
  });
  D.media.filter(visible).filter(inDay).filter((m) => m.DayNumber).forEach((m, i) => lyrMedia.add(new Graphic({
    geometry: {type: "point", longitude: m.lon + 0.0004 * (i % 3), latitude: m.lat + 0.0004},
    symbol: {type: "simple-marker", style: "square", size: 7, color: m.MediaStatus === "Placeholder" ? [255, 255, 255, 1] : "#A6BF80", outline: {color: "#152840", width: 1.2}},
    attributes: m, popupTemplate: {title: esc(m.Title), content: `${esc(m.MediaType)} · ${esc(m.MediaStatus)}<br>${esc(m.Caption || m.Prompt)}${m.ExternalURL ? `<br><a href="${esc(m.ExternalURL)}" target="_blank">Open</a>` : ""}`}})));
  const g = [...lyrStops.graphics.toArray(), ...lyrLegs.graphics.toArray()];
  if (g.length) view.goTo(g, {duration: 600}).catch(() => {});
}
function stopPopup(s) {
  const row = (k, v) => v || v === 0 ? `<tr><th style="width:34%">${k}</th><td>${esc(v)}</td></tr>` : "";
  return `<table>${row("Day / time", `Day ${s.DayNumber}${s.PlannedTime ? " · " + s.PlannedTime : ""}`)}${row("Status", s.PlanStatus)}${row("Category", (CAT[s.Category] || [s.Category])[0])}
    ${row("Where", s.Address)}${row("Why it fits", s.WhyGo)}${mode !== "Public" ? row("Heads-up", s.HeadsUp) + row("Phone", s.Phone) : ""}${row("Time on site", s.DurationMin ? s.DurationMin + " min" : "")}
    ${row("Source", s.SourceName)}${s.LocConfidence !== "Exact" ? row("Location", s.LocConfidence === "CityLevel" ? "City-level placeholder" : "Approximate – verify") : ""}</table>
    ${s.Website ? `<a href="${esc(s.Website)}" target="_blank" rel="noopener">Website</a>` : ""}`;
}
function legend() {
  const el = document.createElement("div"); el.className = "legend";
  el.innerHTML = `<b>Stops</b>${Object.values(CAT).map(([l, c]) => `<div><span class="dot" style="background:${c}"></span>${l}</div>`).join("")}
    <div><span class="dot" style="background:#fff;box-shadow:0 0 0 2px #5B2C83"></span>Alternate / idea</div><div><span style="width:10px;height:10px;border:1.5px solid #152840;display:inline-block"></span>Media moment</div>`;
  return el;
}

/* ---------------- media actions ---------------- */
let pendingMedia = null;
function setMedia(m, patch) {
  Object.assign(m, patch);
  overlay.media[m.MediaID] = Object.assign(overlay.media[m.MediaID] || {}, patch); save();
  if (mediaLayer && m._oid) mediaLayer.applyEdits({updateFeatures: [new Graphic({attributes: {OBJECTID: m._oid, ...patch}})]}).catch((e) => toast("Saved here only: " + e.message));
}
async function onFile(file) {
  const m = pendingMedia; if (!m || !file) return;
  previews[m.MediaID] = {url: URL.createObjectURL(file), type: file.type || "", name: file.name};
  const patch = {MediaStatus: m.MediaStatus === "Placeholder" ? "Captured" : m.MediaStatus};
  if (mediaLayer && m._oid) {
    try {
      const fd = new FormData(); fd.append("attachment", file, file.name); fd.append("f", "json");
      await mediaLayer.addAttachment(new Graphic({attributes: {OBJECTID: m._oid}}), fd);
      toast("Attached to the Media layer");
    } catch (e) { toast("Could not store the file: " + e.message); }
  } else toast("Preview added (this session only)");
  setMedia(m, patch); render();
}

/* ---------------- sharing helpers ---------------- */
const scoped = (arr) => arr.filter(visible).filter((r) => !day || r.DayNumber === day);
function download(name, text, type) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const slug = () => (D.trip.TripName || "trip").replace(/[^a-z0-9]+/gi, "_").replace(/_+$/, "") + (day ? `_Day${day}` : "") + `_${mode}`;
function summaryText() {
  const lines = [`${D.trip.TripName} (${fmtDate(D.trip.StartDate)} – ${fmtDate(D.trip.EndDate)})`, ""];
  scoped(D.days).sort((a, b) => a.DayNumber - b.DayNumber).forEach((d) => {
    lines.push(`Day ${d.DayNumber} · ${fmtDate(d.TripDate)} · ${d.Title}${d.Miles ? ` (~${d.Miles} mi, ${d.DriveHours} hrs)` : ""}`);
    D.stops.filter((s) => s.DayNumber === d.DayNumber && visible(s) && MAIN.includes(s.PlanStatus)).sort((a, b) => a.Sequence - b.Sequence)
      .forEach((s) => lines.push(`   ${s.PlannedTime ? s.PlannedTime + " – " : "• "}${s.StopName}`));
    lines.push(`   Overnight: ${d.Overnight}`, "");
  });
  lines.push(shareLink()); return lines.join("\n");
}
function shareLink(m) { const u = new URL(location.href); u.searchParams.set("view", m || mode); return u.toString(); }
function geojson() {
  const f = [];
  scoped(D.stops).forEach((s) => { const {lat, lon, _oid, ...p} = s; f.push({type: "Feature", geometry: {type: "Point", coordinates: [lon, lat]}, properties: {layer: "Stops", ...p}}); });
  scoped(D.legs).forEach((l) => { const {paths, _oid, ...p} = l; f.push({type: "Feature", geometry: {type: "MultiLineString", coordinates: paths}, properties: {layer: "Route_Legs", ...p}}); });
  scoped(D.media).forEach((m) => { const {lat, lon, _oid, ...p} = m; f.push({type: "Feature", geometry: {type: "Point", coordinates: [lon, lat]}, properties: {layer: "Media_Moments", ...p}}); });
  if (mode !== "Planner") f.forEach((x) => { delete x.properties.Phone; delete x.properties.HeadsUp; });
  return JSON.stringify({type: "FeatureCollection", name: slug(), features: f}, null, 1);
}
function kml() {
  const pm = (name, desc, geom) => `<Placemark><name>${esc(name)}</name><description>${esc(desc)}</description>${geom}</Placemark>`;
  const pts = scoped(D.stops).map((s) => pm(`D${s.DayNumber} ${s.StopName}`, `${s.PlanStatus}. ${s.WhyGo || ""}`, `<Point><coordinates>${s.lon},${s.lat}</coordinates></Point>`));
  const lns = scoped(D.legs).map((l) => pm(`Day ${l.DayNumber}: ${l.LegName}`, `~${l.Miles} mi`, `<LineString><coordinates>${l.paths[0].map((c) => c.join(",")).join(" ")}</coordinates></LineString>`));
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(D.trip.TripName)}</name>${[...lns, ...pts].join("")}</Document></kml>`;
}
function csv() {
  const cols = ["DayNumber","Sequence","PlannedTime","StopName","Category","PlanStatus","Address","WhyGo","lat","lon"];
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.map((c) => c === "lat" ? "Latitude" : c === "lon" ? "Longitude" : c).join(","), ...scoped(D.stops).map((s) => cols.map((c) => q(s[c])).join(","))].join("\r\n");
}
function ics() {
  const d8 = (iso, add = 0) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + add); return d.toISOString().slice(0, 10).replace(/-/g, ""); };
  const fold = (s) => String(s || "").replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  const ev = scoped(D.days).map((d) => ["BEGIN:VEVENT", `UID:${CFG.tripId}-day${d.DayNumber}@tripplanner`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${d8(d.TripDate)}`, `DTEND;VALUE=DATE:${d8(d.TripDate, 1)}`, `SUMMARY:${fold(`Day ${d.DayNumber}: ${d.Title}`)}`,
    `DESCRIPTION:${fold(`${d.RouteText}\nOvernight: ${d.Overnight}\n\n${d.Summary}\n\n${shareLink()}`)}`, "TRANSP:TRANSPARENT", "END:VEVENT"].join("\r\n"));
  const fold75 = (l) => l.length <= 74 ? l : l.match(/.{1,73}/g).join("\r\n ");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Trip Planner Template//EN", "CALSCALE:GREGORIAN", ...ev, "END:VCALENDAR"].join("\r\n").split("\r\n").map(fold75).join("\r\n");
}
async function copy(t, msg) { try { await navigator.clipboard.writeText(t); toast(msg); } catch { prompt("Copy this:", t); } }
function onShare(k) {
  if (k === "link") return copy(shareLink(), "Link copied");
  if (k === "public") return copy(shareLink("Public"), "Public link copied");
  if (k === "native") return navigator.share ? navigator.share({title: D.trip.TripName, text: "Our trip plan", url: shareLink()}).catch(() => {}) : copy(shareLink(), "Link copied");
  if (k === "text") return copy(summaryText(), "Summary copied – paste into Teams, text or email");
  if (k === "embed") return copy(`<iframe src="${shareLink("Public")}" width="100%" height="720" style="border:0" title="${esc(D.trip.TripName)}" allow="clipboard-write; web-share"></iframe>`, "Embed code copied");
  if (k === "ics") return download(slug() + ".ics", ics(), "text/calendar");
  if (k === "geojson") return download(slug() + ".geojson", geojson(), "application/geo+json");
  if (k === "kml") return download(slug() + ".kml", kml(), "application/vnd.google-earth.kml+xml");
  if (k === "csv") return download(slug() + "_stops.csv", csv(), "text/csv");
  if (k === "print") return window.print();
}

/* ---------------- events ---------------- */
function wire() {
  $("#mode").addEventListener("calciteSegmentedControlChange", (e) => { mode = e.target.value; render(); });
  $("#sections").addEventListener("calciteSegmentedControlChange", (e) => { section = e.target.value; render(); });
  $("#pane").addEventListener("click", (e) => {
    const dEl = e.target.closest("[data-day]"); if (dEl) { day = +dEl.dataset.day === day && dEl.tagName === "HEADER" ? 0 : +dEl.dataset.day; return render(); }
    const sEl = e.target.closest("[data-stop]");
    if (sEl) { const g = lyrStops.graphics.find((x) => x.attributes.StopID === sEl.dataset.stop); if (g) view.goTo({target: g, zoom: 14}).then(() => view.openPopup({features: [g], location: g.geometry})); return; }
    const sh = e.target.closest("[data-share]"); if (sh) return onShare(sh.dataset.share);
    const act = e.target.closest("[data-act]");
    if (act) {
      const m = D.media.find((x) => x.MediaID === act.closest("[data-media]").dataset.media);
      if (act.dataset.act === "attach") { pendingMedia = m; $("#file").value = ""; $("#file").click(); }
      if (act.dataset.act === "link") { const u = prompt("Paste a link (OneDrive, Google Photos, YouTube, iCloud…)", m.ExternalURL || "https://"); if (u && /^https?:\/\//.test(u)) { setMedia(m, {ExternalURL: u, MediaStatus: m.MediaStatus === "Placeholder" ? "Captured" : m.MediaStatus}); render(); } }
      if (act.dataset.act === "caption") { const c = prompt("Caption", m.Caption || ""); if (c !== null) { setMedia(m, {Caption: c}); render(); } }
      if (act.dataset.act === "status") { const seq = ["Placeholder","Captured","Curated","Published"]; setMedia(m, {MediaStatus: seq[(seq.indexOf(m.MediaStatus) + 1) % seq.length]}); render(); }
    }
  });
  $("#pane").addEventListener("calciteCheckboxChange", (e) => {
    const t = D.tasks.find((x) => x.TaskID === e.target.dataset.task); t.TaskStatus = e.target.checked ? "Done" : "Open";
    overlay.tasks[t.TaskID] = t.TaskStatus; save(); render();
  });
  $("#file").addEventListener("change", (e) => onFile(e.target.files[0]));
}

/* ---------------- boot ---------------- */
require(["esri/Map", "esri/views/MapView", "esri/layers/GraphicsLayer", "esri/Graphic", "esri/layers/FeatureLayer", "esri/widgets/Home", "esri/widgets/Expand",
         "esri/identity/OAuthInfo", "esri/identity/IdentityManager"],
  async (Map, MapView, GraphicsLayer, G, FeatureLayer, Home, Expand, OAuthInfo, IdentityManager) => {
  Graphic = G;
  // Sign-in for Planner/Family use against a secured service (ArcGIS or enterprise/SAML logins).
  // Leave CONFIG.appId blank for a public deployment that reads the Public view.
  if (CFG.appId) IdentityManager.registerOAuthInfos([new OAuthInfo({appId: CFG.appId, portalUrl: CFG.portalUrl || "https://www.arcgis.com", popup: false, flowType: "authorization-code"})]);
  const EMPTY = {trip: {TripName: "Trip not available"}, days: [], stops: [], legs: [], media: [], bookings: [], tasks: [], budget: []};
  const local = () => window.TRIP_DATA ? JSON.parse(JSON.stringify(window.TRIP_DATA)) : EMPTY;
  try { D = CFG.serviceUrl ? await loadFromService(FeatureLayer) : local(); }
  catch (e) { console.warn(e); D = local(); }
  if (CFG.serviceUrl && !D.stops.length && !D.days.length) toast("No trip data came back – check the service URL, sharing and tripId.");
  applyOverlay();
  lyrLegs = new GraphicsLayer({title: "Route legs"}); lyrStops = new GraphicsLayer({title: "Stops"}); lyrMedia = new GraphicsLayer({title: "Media moments"});
  view = new MapView({container: "map", map: new Map({basemap: CFG.basemap, layers: [lyrLegs, lyrMedia, lyrStops]}), center: [-96, 37.5], zoom: 4,
    popup: {dockEnabled: true, dockOptions: {position: "bottom-right", breakpoint: false}}});
  view.ui.add(new Home({view}), "top-left");
  view.ui.add(new Expand({view, content: legend(), expandIcon: "legend", expanded: window.innerWidth > 1100, expandTooltip: "Legend"}), "bottom-right");
  header(); wire(); render();
  window.TripPlanner = {get data() { return D; }, summaryText, geojson, kml, csv, ics, render,
    set(m, d, s) { if (m) mode = m; if (d !== undefined) day = d; if (s) section = s; render(); }};
});
})();
