# Field Notes for State Government · Digital Magazine

A page-turning digital magazine of **Field Notes for State Government** by Phillip Julian, Solution Engineer, State & Local Government, Esri. Each monthly issue covers changes, deadlines, questions and free training across six areas of state government GIS:

| Area | Covers |
|---|---|
| GIS Administration & IT | Portal, servers, licensing, security |
| Emergency Management | Preparedness, response and recovery |
| Parks & Natural Resources | Parks, public lands, forestry, wildlife |
| Transportation & Infrastructure | State DOTs, traffic safety, infrastructure |
| Public Safety & 911 | NG911, state police, corrections, fire marshal |
| Environment, Water & Agriculture | Environmental protection, water quality, agriculture |

**Current issue:** October 2026 (coverage 1 Sep to 19 Oct 2026; links and facts checked 19 Oct 2026)

**Live magazine:** https://takeivy.github.io/desktop-tutorial/

---

## How to read it

| Action | Mouse / keyboard | Touch |
|---|---|---|
| Next page | Drag the page left, click the right edge or arrow, or press **→** / **Page Down** | Swipe left |
| Previous page | Drag the page right, click the left edge or arrow, or press **←** / **Page Up** | Swipe right |
| First / last page | **Home** / **End** | Page menu |
| Jump to a section | **Contents** button, or the page menu at the bottom | Same |
| Show fact-check notes | **Review marks** button | Same |

Click inside the magazine once so the arrow keys work. Long pages scroll inside the page.

### Jump to a section with the address

Add `?section=<name>` to the end of the address:

| Name | Opens |
|---|---|
| `contents` | Contents |
| `across` | Across every agency |
| `calendar` | Next on the calendar |
| `admin` | GIS Administration & IT |
| `emergency` | Emergency Management |
| `parks` | Parks & Natural Resources |
| `transportation` | Transportation & Infrastructure |
| `public-safety` | Public Safety & 911 |
| `water` | Environment, Water & Agriculture |
| `dates` | Every date, every area |
| `about` | About |

To open a single page inside an area, add one of these endings to the area name: `-30-seconds`, `-story-1`, `-story-2`, `-story-3`, `-heads-up`, `-se-take`, `-try-this`, `-questions`, `-dates`, `-learn` or `-reading`. For example, `?section=parks-try-this`.

### Other URL settings

| Setting | Effect |
|---|---|
| `?page=24` | Opens at page 24 |
| `?marks=on` | Opens with the fact-check review marks showing (they're off by default) |
| `?view=auto` | Phones and narrow screens switch to one page at a time (the default is always two pages side by side) |

Combine settings with `&`, for example `https://takeivy.github.io/desktop-tutorial/?section=water&view=auto`. These settings also work inside an Experience Builder embed. As a reader turns pages, the address updates to the section they're on.

---

## Embed in ArcGIS Experience Builder

1. In ArcGIS Online, select **Create app > Experience Builder**, then choose a **Full screen** page template.
2. Add an **Embed** widget and size it to 100% width and height.
3. Set **Embed by: URL** and paste the live magazine address above. HTTPS is required.
4. Save, publish and test with a mouse and on a touch device.

To embed it with code instead, set **Embed by: Code** and paste the following. It is well under the widget's 8 KB code limit.

```html
<iframe src="https://takeivy.github.io/desktop-tutorial/" title="Field Notes for State Government, October 2026 digital magazine" width="100%" height="100%" style="border:0;width:100%;height:100%;min-height:600px" allow="fullscreen" allowfullscreen></iframe>
```

Reference: [Embed widget, ArcGIS Experience Builder documentation](https://doc.arcgis.com/en/experience-builder/latest/configure-widgets/embed-widget.htm)

---

## Repository contents

| File | Purpose |
|---|---|
| `index.html` | The complete magazine: one self-contained file (about 400 KB) with no external libraries, fonts or images |
| `README.md` | This file |
| `archive/` (optional) | Past issues, for example `archive/2026-10.html` |

## Publish or update an issue

1. Rename the new issue file to `index.html`.
2. Optional: move the previous `index.html` into `archive/` as `YYYY-MM.html`.
3. Upload it: **Add file > Upload files**, then commit to `main`.
4. GitHub Pages republishes within a few minutes. Refresh the live address to check.

First-time setup: go to **Settings > Pages > Build and deployment**, set **Source** to **Deploy from a branch**, and choose **Branch** `main`, folder `/ (root)`, then **Save**.

---

## Sources and accuracy

- Every link goes to a public page on an official Esri site. A few dates come from EPA, NOAA or the Federal Register, and those are labelled.
- Each statement in the October 2026 issue was checked against Esri documentation, the ArcGIS Blog, Esri Support, Learn ArcGIS, the Esri Trust Center, or Esri event and training pages. Turn on **Review marks** to see each item's status and evidence link.
- Esri Community is not cited.
- Dates, times and product details can change after the check date. Confirm them on the linked official page before you act on them.

## Accessibility

- Text and color pairings meet WCAG 2.1 AA contrast.
- It works with keyboard only. Pages that aren't showing can't be reached with Tab, and page changes are announced to screen readers.
- Page-turn animation is turned off when the device's reduced-motion setting is on.
- If scripts are blocked, the pages show as one scrolling column.

## Contact

Phillip Julian · Solution Engineer, State & Local Government, Esri · [pjulian@esri.com](mailto:pjulian@esri.com)

For licensing and purchasing, contact your Esri account manager.

---

*Esri, ArcGIS and the products named here are trademarks of Esri. This is an informational summary. Esri's official documentation governs.*
