# Menzele Trading — Tire Tracker

Interactive tire tracking and fleet visualisation for a **2017 Volvo FMX horse (34-ton GVM class)
coupled to a 2-unit side-tipper link combination** — 26 tire positions, numbered exactly as in the
*Tire Numbering Diagram* the yard already uses on paper.

The animation is the interface: tap a tire on the rig, log the replacement, and the rig's colour
reflects the real state of every tire from then on. It replaces the paper "Tire Replacement Log"
sheet with a searchable, permanent record.

---

## Running it

No build step, no server, no accounts, no internet needed.

**On a computer:** open `index.html` in any modern browser.

**On a phone (recommended for the yard):** host the folder anywhere that serves static files and
open it once with signal. It installs as a home-screen app and works offline afterwards.

```bash
# any static server works, e.g.
python3 -m http.server 8000
# then open http://localhost:8000
```

> Data is saved in the browser's local storage, tied to the device and the address it was opened
> from. Opening `index.html` directly from disk on one device and from a web address on another
> gives you two separate records — pick one and stick with it. Use **Settings → Export JSON backup**
> to move the record between devices or keep it safe.

---

## The 26 positions

Numbering runs front to back; on every dual axle it runs **left outer → left inner → right inner →
right outer**. Positions 1 and 2 are the single front (steer) tires; the other 24 are dual-fitment.

| # | Unit | Axle | Position |
|---|---|---|---|
| 1–2 | Horse | Front (steer) | Left, Right |
| 3–6 | Horse | Rear axle 1 | L outer, L inner, R inner, R outer |
| 7–10 | Horse | Rear axle 2 | L outer, L inner, R inner, R outer |
| 11–14 | Trailer 1 | Axle 1 | L outer, L inner, R inner, R outer |
| 15–18 | Trailer 1 | Axle 2 | L outer, L inner, R inner, R outer |
| 19–22 | Trailer 2 | Axle 1 | L outer, L inner, R inner, R outer |
| 23–26 | Trailer 2 | Axle 2 | L outer, L inner, R inner, R outer |

The full row-by-row reference also ships as [`data/tire-positions.csv`](data/tire-positions.csv) and
is shown at the bottom of the Settings tab.

---

## What it does

### Rig view
- Scale rendering of the horse and both side-tipper bins — cab, chassis, fuel tank, catwalk,
  5th wheel, draw-bar link, tipper bodies and running gear — with all 26 tires drawn individually.
- **Top-down** (matches the paper diagram: front at the top, direction of travel upward, LEFT on the
  left, numbers in columns down both sides) and a **3/4 perspective** view of the same rig.
- Every tire is colour-coded live:
  - 🟢 **Good** — inside the service window
  - 🟡 **Due soon** — past the warning threshold
  - 🔴 **Overdue / flagged** — at or past the limit, or manually flagged
  - ⚪ **No data** — nothing logged for that position yet
- Hover or tap for a quick card (position, last replacement, km since fitted); click to open the
  full record. Both the tire and its number chip are clickable, so it stays usable with a thumb.
- Zoom to the whole rig, the horse, Trailer 1 or Trailer 2; drag to pan, scroll to zoom.
- Wheels roll in on load, and a tire you have just edited pulses so you can see the change land.

### Logging a replacement
One dialog, pre-filled so it takes seconds: position (from the tire you tapped), date fitted
(today), brand (last one used), odometer (current rig reading), reason (wear / puncture / damage /
other, plus free text), fitted by, cost, notes and an optional photo. Only the position and date
are required. Logging a fitment at a higher odometer reading moves the rig odometer with it.

### History
Every position keeps its **full** history, not just the latest fitment — the same record the paper
log builds, but searchable and permanent. The Log tab shows one row per event across the whole rig,
filterable by unit, axle, position, date range or free text.

### Dashboard
Counts by status, tire spend over a chosen period, average tire life overall and per axle, and a
list of positions wearing meaningfully faster than the rig average — the ones worth checking for
alignment or load problems.

### Alerts
Set a km limit, an age limit in months, and the percentage at which a tire turns amber
(Settings → Replacement thresholds). Whichever limit is hit first drives the colour. Any position
can also be flagged by hand — *watch* (amber) or *issue* (red) — with a note, until it is cleared.

### Export and backup
- **CSV** of the log, in the same column order as the paper sheet.
- **JSON** full backup, restorable by merge (duplicates skipped).
- **Print / PDF** of the filtered log, and of the position reference sheet.

---

## Keeping the data honest

Two habits make everything else work:

1. **Update the odometer** on the top bar when you fill up. Every km-based warning depends on it.
2. **Export a backup now and then.** Local storage lives on that one device; a wiped phone takes the
   record with it.

---

## Layout

```
index.html                    app shell
manifest.webmanifest, sw.js   installable / offline shell
assets/css/styles.css
assets/js/positions.js        the 26 positions + rig geometry (source data)
assets/js/svgutil.js          SVG helpers and the status palette
assets/js/store.js            persistence, status rules, lifespan stats, import/export
assets/js/render-topdown.js   top-down rig renderer
assets/js/render-iso.js       3/4 perspective renderer
assets/js/ui.js               panels, dashboard, log, settings
assets/js/form.js             replacement dialog, confirmations, photo handling
assets/js/app.js              state, interaction, view switching
data/tire-positions.csv       position reference table
```

Plain ES5-style JavaScript with no dependencies or build tooling, so the whole thing stays openable
and editable years from now.

## Dimensions used

Drawn to a real interlink footprint: 2 500 mm overall width, ~21.5 m overall length, 315/80R22.5
drives and trailer tires (1 076 mm rolling diameter, 375 mm dual spacing), 385/65R22.5 steer tires,
5th wheel at 5 060 mm behind the front bumper. Adjust in `assets/js/positions.js` if the rig differs.
