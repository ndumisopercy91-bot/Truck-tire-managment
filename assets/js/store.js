/*
 * store.js — persistence and derived statistics.
 *
 * Everything lives in localStorage under a single key so the whole record
 * can be exported/restored as one JSON file. No network access required.
 */
(function (global) {
  'use strict';

  var MT = global.MT = global.MT || {};

  var STORAGE_KEY = 'menzele.tiretracker.v1';
  var SCHEMA_VERSION = 1;
  var DAY_MS = 86400000;
  var AVG_MONTH_DAYS = 30.44;

  var DEFAULT_SETTINGS = {
    rigName: 'Menzele Trading — Volvo FMX + 2 side-tippers',
    registration: '',
    odometer: 0,            // current rig odometer, km
    kmLimit: 60000,         // km a tire is expected to run before replacement
    monthsLimit: 36,        // calendar life ceiling, months
    warnAt: 80,             // % of limit at which a tire turns amber
    currency: 'R'
  };

  var REASONS = ['Wear', 'Puncture', 'Damage', 'Other'];

  var listeners = [];
  var data = null;

  /* --------------------------------------------------------------- helpers */

  function todayISO() {
    var d = new Date();
    return toISO(d);
  }

  function toISO(d) {
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function parseISO(s) {
    if (!s) return null;
    var parts = String(s).split('-');
    if (parts.length !== 3) return null;
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return isNaN(d.getTime()) ? null : d;
  }

  function daysBetween(isoA, isoB) {
    var a = parseISO(isoA), b = parseISO(isoB);
    if (!a || !b) return null;
    return Math.round((b - a) / DAY_MS);
  }

  function uid() {
    return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function num(v, fallback) {
    var n = Number(v);
    return isFinite(n) ? n : (fallback === undefined ? null : fallback);
  }

  /* ------------------------------------------------------------ load/save */

  function blank() {
    return {
      version: SCHEMA_VERSION,
      settings: Object.assign({}, DEFAULT_SETTINGS),
      events: [],
      flags: {},          // position number -> { level:'watch'|'issue', note, at }
      updatedAt: new Date().toISOString()
    };
  }

  function normalise(raw) {
    var out = blank();
    if (!raw || typeof raw !== 'object') return out;
    out.settings = Object.assign({}, DEFAULT_SETTINGS, raw.settings || {});
    out.settings.odometer = num(out.settings.odometer, 0) || 0;
    out.settings.kmLimit = num(out.settings.kmLimit, DEFAULT_SETTINGS.kmLimit) || 0;
    out.settings.monthsLimit = num(out.settings.monthsLimit, DEFAULT_SETTINGS.monthsLimit) || 0;
    out.settings.warnAt = Math.min(100, Math.max(1, num(out.settings.warnAt, 80) || 80));
    out.events = (Array.isArray(raw.events) ? raw.events : [])
      .map(normaliseEvent)
      .filter(Boolean);
    out.flags = {};
    if (raw.flags && typeof raw.flags === 'object') {
      Object.keys(raw.flags).forEach(function (k) {
        var n = Number(k);
        if (MT.positionByNumber(n) && raw.flags[k] && raw.flags[k].level) {
          out.flags[n] = {
            level: raw.flags[k].level === 'issue' ? 'issue' : 'watch',
            note: String(raw.flags[k].note || ''),
            at: raw.flags[k].at || new Date().toISOString()
          };
        }
      });
    }
    return out;
  }

  function normaliseEvent(e) {
    if (!e || typeof e !== 'object') return null;
    var pos = Number(e.position);
    if (!MT.positionByNumber(pos)) return null;
    return {
      id: e.id || uid(),
      position: pos,
      dateFitted: e.dateFitted || todayISO(),
      brand: String(e.brand || '').trim(),
      odometer: num(e.odometer, null),
      reasonType: REASONS.indexOf(e.reasonType) >= 0 ? e.reasonType : 'Other',
      reason: String(e.reason || '').trim(),
      fittedBy: String(e.fittedBy || '').trim(),
      cost: num(e.cost, null),
      notes: String(e.notes || '').trim(),
      photo: typeof e.photo === 'string' && e.photo.indexOf('data:image') === 0 ? e.photo : null,
      createdAt: e.createdAt || new Date().toISOString()
    };
  }

  function load() {
    var raw = null;
    try {
      var text = global.localStorage.getItem(STORAGE_KEY);
      if (text) raw = JSON.parse(text);
    } catch (err) {
      console.warn('Could not read saved data:', err);
    }
    data = normalise(raw);
    return data;
  }

  function save() {
    data.updatedAt = new Date().toISOString();
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return { ok: true };
    } catch (err) {
      console.error('Save failed:', err);
      return {
        ok: false,
        error: err && err.name === 'QuotaExceededError'
          ? 'Device storage is full. Export a backup, then remove some tire photos.'
          : 'Could not save to this device.'
      };
    }
  }

  function emit() {
    listeners.forEach(function (fn) {
      try { fn(data); } catch (err) { console.error(err); }
    });
  }

  function commit() {
    var res = save();
    emit();
    return res;
  }

  /* ------------------------------------------------------------- accessors */

  function settings() { return data.settings; }

  function updateSettings(patch) {
    Object.assign(data.settings, patch);
    data.settings.odometer = num(data.settings.odometer, 0) || 0;
    return commit();
  }

  function allEvents() { return data.events.slice(); }

  /* Newest first: primary key date fitted, tie-broken by odometer then entry time. */
  function sortDesc(a, b) {
    if (a.dateFitted !== b.dateFitted) return a.dateFitted < b.dateFitted ? 1 : -1;
    if ((a.odometer || 0) !== (b.odometer || 0)) return (b.odometer || 0) - (a.odometer || 0);
    return a.createdAt < b.createdAt ? 1 : -1;
  }

  function eventsFor(position) {
    return data.events.filter(function (e) { return e.position === Number(position); }).sort(sortDesc);
  }

  function latestFor(position) {
    var list = eventsFor(position);
    return list.length ? list[0] : null;
  }

  function addEvent(input) {
    var e = normaliseEvent(Object.assign({}, input, { id: uid(), createdAt: new Date().toISOString() }));
    if (!e) return { ok: false, error: 'Invalid tire position.' };
    data.events.push(e);
    var res = commit();
    res.event = e;
    return res;
  }

  function updateEvent(id, patch) {
    var idx = data.events.findIndex(function (e) { return e.id === id; });
    if (idx < 0) return { ok: false, error: 'Entry not found.' };
    var merged = normaliseEvent(Object.assign({}, data.events[idx], patch, { id: id }));
    if (!merged) return { ok: false, error: 'Invalid tire position.' };
    data.events[idx] = merged;
    var res = commit();
    res.event = merged;
    return res;
  }

  function deleteEvent(id) {
    var before = data.events.length;
    data.events = data.events.filter(function (e) { return e.id !== id; });
    if (data.events.length === before) return { ok: false, error: 'Entry not found.' };
    return commit();
  }

  function getFlag(position) { return data.flags[Number(position)] || null; }

  function setFlag(position, level, note) {
    var n = Number(position);
    if (!level) delete data.flags[n];
    else data.flags[n] = { level: level, note: String(note || ''), at: new Date().toISOString() };
    return commit();
  }

  /* Values already typed by the user, for form autocomplete. */
  function suggestions() {
    var brands = {}, fitters = {};
    data.events.forEach(function (e) {
      if (e.brand) brands[e.brand] = true;
      if (e.fittedBy) fitters[e.fittedBy] = true;
    });
    return { brands: Object.keys(brands).sort(), fitters: Object.keys(fitters).sort() };
  }

  /* ---------------------------------------------------------------- status */

  /*
   * Status of one position, from its most recent fitment.
   *   grey  — nothing logged yet
   *   green — inside the service window
   *   amber — past the warning threshold, replacement approaching
   *   red   — at or past the limit, or manually flagged as an issue
   */
  function statusFor(position) {
    var s = data.settings;
    var pos = MT.positionByNumber(position);
    var flag = getFlag(position);
    var ev = latestFor(position);

    var out = {
      position: Number(position),
      meta: pos,
      level: 'grey',
      latest: ev,
      flag: flag,
      kmSince: null,
      daysSince: null,
      kmPct: null,
      timePct: null,
      pct: null,
      kmRemaining: null,
      daysRemaining: null,
      reasons: []
    };

    if (!ev) {
      out.reasons.push('No fitment logged yet');
      if (flag) out.level = flag.level === 'issue' ? 'red' : 'amber';
      return out;
    }

    out.level = 'green';

    if (ev.odometer != null && s.odometer > 0) {
      out.kmSince = Math.max(0, s.odometer - ev.odometer);
      if (s.kmLimit > 0) {
        out.kmPct = out.kmSince / s.kmLimit;
        out.kmRemaining = s.kmLimit - out.kmSince;
      }
    }

    out.daysSince = daysBetween(ev.dateFitted, todayISO());
    if (out.daysSince != null && s.monthsLimit > 0) {
      var dayLimit = s.monthsLimit * AVG_MONTH_DAYS;
      out.timePct = out.daysSince / dayLimit;
      out.daysRemaining = Math.round(dayLimit - out.daysSince);
    }

    var pcts = [out.kmPct, out.timePct].filter(function (v) { return v != null; });
    out.pct = pcts.length ? Math.max.apply(null, pcts) : null;

    var warn = s.warnAt / 100;
    if (out.pct != null) {
      if (out.pct >= 1) {
        out.level = 'red';
        if (out.kmPct != null && out.kmPct >= 1) out.reasons.push('Past the ' + fmtInt(s.kmLimit) + ' km service limit');
        if (out.timePct != null && out.timePct >= 1) out.reasons.push('Older than ' + s.monthsLimit + ' months');
      } else if (out.pct >= warn) {
        out.level = 'amber';
        if (out.kmRemaining != null && out.kmRemaining <= s.kmLimit * (1 - warn)) {
          out.reasons.push(fmtInt(out.kmRemaining) + ' km left of the service window');
        }
        if (out.daysRemaining != null && out.timePct >= warn) {
          out.reasons.push(fmtInt(out.daysRemaining) + ' days left of the age limit');
        }
      }
    } else {
      out.reasons.push('Set the rig odometer to track km on this tire');
    }

    if (flag) {
      if (flag.level === 'issue') {
        out.level = 'red';
        out.reasons.unshift('Flagged: ' + (flag.note || 'issue reported'));
      } else if (out.level === 'green') {
        out.level = 'amber';
        out.reasons.unshift('Watching: ' + (flag.note || 'marked for attention'));
      }
    }

    return out;
  }

  function allStatuses() {
    return MT.TIRE_POSITIONS.map(function (p) { return statusFor(p.n); });
  }

  function statusCounts() {
    var counts = { green: 0, amber: 0, red: 0, grey: 0 };
    allStatuses().forEach(function (s) { counts[s.level]++; });
    return counts;
  }

  /* ------------------------------------------------------------- lifespan */

  /*
   * A "run" is one tire's service life: from the event that fitted it to the
   * event that replaced it. The newest event on each position is still running.
   */
  function runsFor(position) {
    var list = eventsFor(position).slice().reverse(); // oldest first
    var s = data.settings;
    var runs = [];
    list.forEach(function (ev, i) {
      var next = list[i + 1] || null;
      var km = null, days = null;
      if (next) {
        if (ev.odometer != null && next.odometer != null) km = Math.max(0, next.odometer - ev.odometer);
        days = daysBetween(ev.dateFitted, next.dateFitted);
      } else {
        if (ev.odometer != null && s.odometer > 0) km = Math.max(0, s.odometer - ev.odometer);
        days = daysBetween(ev.dateFitted, todayISO());
      }
      runs.push({
        position: Number(position),
        event: ev,
        replacedBy: next,
        complete: !!next,
        km: km,
        days: days,
        cost: ev.cost
      });
    });
    return runs;
  }

  function average(values) {
    var v = values.filter(function (n) { return n != null && isFinite(n); });
    if (!v.length) return null;
    return v.reduce(function (a, b) { return a + b; }, 0) / v.length;
  }

  /* Completed-run averages per position, plus a fleet baseline for comparison. */
  function lifespanReport() {
    var perPosition = MT.TIRE_POSITIONS.map(function (p) {
      var runs = runsFor(p.n);
      var done = runs.filter(function (r) { return r.complete; });
      return {
        meta: p,
        completedRuns: done.length,
        avgKm: average(done.map(function (r) { return r.km; })),
        avgDays: average(done.map(function (r) { return r.days; })),
        currentRun: runs.length ? runs[runs.length - 1] : null
      };
    });

    var fleetAvgKm = average(perPosition.map(function (r) { return r.avgKm; }));

    var perAxle = MT.AXLES.map(function (axle) {
      var rows = perPosition.filter(function (r) { return r.meta.axleId === axle.id; });
      return {
        axle: axle,
        completedRuns: rows.reduce(function (a, r) { return a + r.completedRuns; }, 0),
        avgKm: average(rows.map(function (r) { return r.avgKm; })),
        avgDays: average(rows.map(function (r) { return r.avgDays; }))
      };
    });

    /* Positions wearing meaningfully faster than the rig average. */
    var outliers = perPosition.filter(function (r) {
      return r.avgKm != null && fleetAvgKm && r.completedRuns > 0 && r.avgKm < fleetAvgKm * 0.75;
    }).sort(function (a, b) { return a.avgKm - b.avgKm; });

    return { perPosition: perPosition, perAxle: perAxle, fleetAvgKm: fleetAvgKm, outliers: outliers };
  }

  function spendBetween(fromISO, toISO_) {
    var total = 0, count = 0;
    data.events.forEach(function (e) {
      if (fromISO && e.dateFitted < fromISO) return;
      if (toISO_ && e.dateFitted > toISO_) return;
      count++;
      if (e.cost != null) total += e.cost;
    });
    return { total: total, count: count };
  }

  /* --------------------------------------------------------- import/export */

  function exportJSON() {
    return JSON.stringify(data, null, 2);
  }

  function importJSON(text, mode) {
    var raw;
    try { raw = JSON.parse(text); } catch (err) { return { ok: false, error: 'That file is not valid JSON.' }; }
    var incoming = normalise(raw);
    if (mode === 'merge') {
      var seen = {};
      data.events.forEach(function (e) { seen[eventKey(e)] = true; });
      incoming.events.forEach(function (e) {
        if (!seen[eventKey(e)]) { data.events.push(e); seen[eventKey(e)] = true; }
      });
      Object.assign(data.flags, incoming.flags);
    } else {
      data = incoming;
    }
    var res = commit();
    res.count = incoming.events.length;
    return res;
  }

  function eventKey(e) {
    return [e.position, e.dateFitted, e.odometer, e.brand, e.fittedBy].join('|');
  }

  var CSV_COLUMNS = [
    '#', 'Unit', 'Axle', 'Position', 'Date fitted', 'Brand / type',
    'Odometer (km)', 'Reason', 'Detail', 'Fitted by', 'Cost', 'Notes'
  ];

  function csvCell(v) {
    if (v == null) return '';
    var s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCSV(events) {
    var rows = (events || data.events).slice().sort(function (a, b) {
      if (a.position !== b.position) return a.position - b.position;
      return a.dateFitted < b.dateFitted ? -1 : 1;
    });
    var lines = [CSV_COLUMNS.join(',')];
    rows.forEach(function (e) {
      var p = MT.positionByNumber(e.position);
      lines.push([
        e.position, p.unit, p.axle, p.position, e.dateFitted, e.brand,
        e.odometer, e.reasonType, e.reason, e.fittedBy, e.cost, e.notes
      ].map(csvCell).join(','));
    });
    return lines.join('\r\n');
  }

  function fmtInt(n) {
    if (n == null || !isFinite(n)) return '—';
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function clearAll() {
    data = blank();
    return commit();
  }

  /* ----------------------------------------------------------------- wire */

  MT.store = {
    STORAGE_KEY: STORAGE_KEY,
    REASONS: REASONS,
    CSV_COLUMNS: CSV_COLUMNS,
    load: load,
    save: save,
    subscribe: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
    settings: settings,
    updateSettings: updateSettings,
    allEvents: allEvents,
    eventsFor: eventsFor,
    latestFor: latestFor,
    addEvent: addEvent,
    updateEvent: updateEvent,
    deleteEvent: deleteEvent,
    getFlag: getFlag,
    setFlag: setFlag,
    suggestions: suggestions,
    statusFor: statusFor,
    allStatuses: allStatuses,
    statusCounts: statusCounts,
    runsFor: runsFor,
    lifespanReport: lifespanReport,
    spendBetween: spendBetween,
    exportJSON: exportJSON,
    importJSON: importJSON,
    exportCSV: exportCSV,
    clearAll: clearAll,
    raw: function () { return data; }
  };

  MT.util = {
    todayISO: todayISO,
    toISO: toISO,
    parseISO: parseISO,
    daysBetween: daysBetween,
    fmtInt: fmtInt,
    uid: uid
  };

}(window));
