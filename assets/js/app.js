/*
 * app.js — application shell: state, rig interaction, view switching, export.
 */
(function (global) {
  'use strict';

  var MT = global.MT = global.MT || {};
  var store = MT.store;
  var ui = MT.ui;
  var util = MT.util;
  var h = ui.h;

  var state = {
    view: 'rig',
    mode: 'top',            // 'top' | 'iso'
    focus: 'fit',           // 'fit' | 'horse' | 't1' | 't2'
    zoom: 1,
    pan: { x: 0, y: 0 },
    selected: null,
    pulse: null,
    animate: true,
    dashFilters: { from: '', to: '' },
    logFilters: { unit: '', axle: '', position: '', from: '', to: '', text: '' }
  };

  var dom = {};
  var lastRender = null;
  var pulseTimer = null;

  /* ----------------------------------------------------------------- boot */

  function init() {
    dom.stage = document.getElementById('stage');
    dom.svg = document.getElementById('rig-svg');
    dom.side = document.getElementById('side-panel');
    dom.tooltip = document.getElementById('tooltip');
    dom.toast = document.getElementById('toast');
    dom.odo = document.getElementById('odo-input');
    dom.rigTitle = document.getElementById('rig-title');
    dom.legend = document.getElementById('legend');
    dom.views = {
      rig: document.getElementById('view-rig'),
      dashboard: document.getElementById('view-dashboard'),
      log: document.getElementById('view-log'),
      settings: document.getElementById('view-settings')
    };

    store.load();

    buildLegend();
    wireChrome();
    wireStage();

    store.subscribe(function () { renderAll(); });

    renderAll();

    /* Rerun the roll-in animation only on first paint. */
    setTimeout(function () { state.animate = false; }, 1200);

    global.addEventListener('resize', debounce(function () {
      if (state.view === 'rig') renderRig();
    }, 120));

    if ('ResizeObserver' in global) {
      new ResizeObserver(debounce(function () {
        if (state.view === 'rig') renderRig();
      }, 80)).observe(dom.stage);
    }

    registerServiceWorker();
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      clearTimeout(t);
      var args = arguments, self = this;
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  /* --------------------------------------------------------------- chrome */

  function buildLegend() {
    ['green', 'amber', 'red', 'grey'].forEach(function (lvl) {
      dom.legend.appendChild(h('span', { 'class': 'legend-item' }, [
        h('i', { 'class': 'legend-dot legend-' + lvl }),
        h('span', { text: ui.levelName(lvl) })
      ]));
    });
  }

  function wireChrome() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-view]'), function (btn) {
      btn.addEventListener('click', function () { setView(btn.dataset.view); });
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (btn) {
      btn.addEventListener('click', function () {
        state.mode = btn.dataset.mode;
        state.zoom = 1;
        state.pan = { x: 0, y: 0 };
        state.animate = true;
        syncToggles();
        renderRig();
        setTimeout(function () { state.animate = false; }, 900);
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-focus]'), function (btn) {
      btn.addEventListener('click', function () {
        state.focus = btn.dataset.focus;
        state.zoom = 1;
        state.pan = { x: 0, y: 0 };
        syncToggles();
        renderRig();
      });
    });

    document.getElementById('zoom-in').addEventListener('click', function () { zoomBy(1.35); });
    document.getElementById('zoom-out').addEventListener('click', function () { zoomBy(1 / 1.35); });
    document.getElementById('zoom-reset').addEventListener('click', function () {
      state.zoom = 1; state.pan = { x: 0, y: 0 }; renderRig();
    });

    document.getElementById('quick-log').addEventListener('click', function () {
      openForm(state.selected);
    });

    dom.odo.addEventListener('change', function () {
      var v = Number(dom.odo.value);
      if (!isFinite(v) || v < 0) { dom.odo.value = store.settings().odometer; return; }
      store.updateSettings({ odometer: v });
      toast('Odometer updated to ' + util.fmtInt(v) + ' km');
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.target.matches('input, textarea, select')) return;
      if (ev.key === 'Escape' && state.selected != null) { select(null); }
    });
  }

  function syncToggles() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-view]'), function (b) {
      b.classList.toggle('is-active', b.dataset.view === state.view);
      b.setAttribute('aria-selected', b.dataset.view === state.view ? 'true' : 'false');
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (b) {
      b.classList.toggle('is-active', b.dataset.mode === state.mode);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-focus]'), function (b) {
      b.classList.toggle('is-active', b.dataset.focus === state.focus);
    });
  }

  function setView(view) {
    state.view = view;
    Object.keys(dom.views).forEach(function (k) {
      dom.views[k].hidden = k !== view;
    });
    document.body.dataset.view = view;
    syncToggles();
    renderAll();
  }

  /* ---------------------------------------------------------------- stage */

  function wireStage() {
    var dragging = false, moved = false, start = null, startPan = null, downTarget = null;

    dom.svg.addEventListener('pointerdown', function (ev) {
      dragging = true; moved = false;
      start = { x: ev.clientX, y: ev.clientY };
      startPan = { x: state.pan.x, y: state.pan.y };
      /* Pointer capture retargets later events at the SVG, so remember what
         was actually pressed. */
      downTarget = ev.target.closest ? ev.target.closest('[data-pos]') : null;
      dom.svg.setPointerCapture(ev.pointerId);
    });

    dom.svg.addEventListener('pointermove', function (ev) {
      var target = ev.target.closest ? ev.target.closest('[data-pos]') : null;
      if (!dragging) {
        if (target) showTooltip(Number(target.dataset.pos), ev); else hideTooltip();
        return;
      }
      var dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      if (!moved || !lastRender) return;
      hideTooltip();
      state.pan = { x: startPan.x - dx / lastRender.scale, y: startPan.y - dy / lastRender.scale };
      renderRig();
    });

    ['pointerup', 'pointercancel'].forEach(function (name) {
      dom.svg.addEventListener(name, function (ev) {
        if (dragging && !moved) {
          select(downTarget ? Number(downTarget.dataset.pos) : null);
        }
        dragging = false;
        downTarget = null;
        try { dom.svg.releasePointerCapture(ev.pointerId); } catch (err) { /* already released */ }
      });
    });

    dom.svg.addEventListener('pointerleave', hideTooltip);

    dom.svg.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      zoomBy(ev.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });

    dom.svg.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      var target = ev.target.closest ? ev.target.closest('[data-pos]') : null;
      if (!target) return;
      ev.preventDefault();
      select(Number(target.dataset.pos));
    });
  }

  function zoomBy(factor) {
    state.zoom = Math.min(9, Math.max(0.6, state.zoom * factor));
    renderRig();
  }

  function select(n) {
    state.selected = n;
    renderRig();
    renderSide();
    if (n != null && global.matchMedia('(max-width: 900px)').matches) {
      dom.side.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function pulse(n) {
    state.pulse = n;
    clearTimeout(pulseTimer);
    pulseTimer = setTimeout(function () { state.pulse = null; renderRig(); }, 1600);
  }

  /* -------------------------------------------------------------- tooltip */

  function showTooltip(n, ev) {
    var p = MT.positionByNumber(n);
    if (!p) return;
    var st = store.statusFor(n);
    var lines = [
      '#' + n + ' · ' + p.unit,
      p.axle + ' · ' + p.position
    ];
    if (st.latest) {
      lines.push('Fitted ' + ui.fmtDate(st.latest.dateFitted) + (st.latest.brand ? ' · ' + st.latest.brand : ''));
      lines.push(st.kmSince != null ? ui.km(st.kmSince) + ' since fitted' : 'no km recorded');
    } else {
      lines.push('No fitment logged');
    }

    dom.tooltip.innerHTML = '';
    dom.tooltip.appendChild(h('span', { 'class': 'tt-status tt-' + st.level, text: ui.levelName(st.level) }));
    lines.forEach(function (l, i) {
      dom.tooltip.appendChild(h('span', { 'class': i === 0 ? 'tt-title' : 'tt-line', text: l }));
    });

    var rect = dom.stage.getBoundingClientRect();
    var x = ev.clientX - rect.left + 14;
    var y = ev.clientY - rect.top + 14;
    dom.tooltip.hidden = false;
    var tipRect = dom.tooltip.getBoundingClientRect();
    if (x + tipRect.width > rect.width) x = Math.max(6, ev.clientX - rect.left - tipRect.width - 14);
    if (y + tipRect.height > rect.height) y = Math.max(6, ev.clientY - rect.top - tipRect.height - 14);
    dom.tooltip.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  }

  function hideTooltip() { dom.tooltip.hidden = true; }

  /* --------------------------------------------------------------- render */

  function renderAll() {
    hideTooltip();   /* stale hover cards must not survive a data change */
    var s = store.settings();
    dom.odo.value = s.odometer || '';
    dom.rigTitle.textContent = s.rigName + (s.registration ? ' · ' + s.registration : '');

    updateAlertPill();

    if (state.view === 'rig') { renderRig(); renderSide(); }
    if (state.view === 'dashboard') ui.renderDashboard(dom.views.dashboard, handlers());
    if (state.view === 'log') ui.renderLog(dom.views.log, handlers());
    if (state.view === 'settings') ui.renderSettings(dom.views.settings, handlers());

    syncToggles();
  }

  function updateAlertPill() {
    var counts = store.statusCounts();
    var pill = document.getElementById('alert-pill');
    var due = counts.red + counts.amber;
    pill.textContent = due ? due + ' need' + (due === 1 ? 's' : '') + ' attention' : 'All 26 in service';
    pill.className = 'pill ' + (counts.red ? 'pill-red' : counts.amber ? 'pill-amber' : 'pill-green');
  }

  function statusMap() {
    var map = {};
    store.allStatuses().forEach(function (s) { map[s.position] = s; });
    return map;
  }

  function renderRig() {
    hideTooltip();
    var rect = dom.stage.getBoundingClientRect();
    var width = Math.max(280, rect.width);
    var height = Math.max(320, rect.height);

    var ctx = {
      width: width, height: height,
      focus: state.focus, zoom: state.zoom, pan: state.pan,
      statusMap: statusMap(),
      selected: state.selected,
      pulse: state.pulse,
      animate: state.animate
    };

    dom.svg.setAttribute('width', width);
    dom.svg.setAttribute('height', height);
    dom.svg.classList.toggle('is-animating', !!state.animate);

    lastRender = state.mode === 'iso' ? MT.Iso.render(dom.svg, ctx) : MT.TopDown.render(dom.svg, ctx);
  }

  function renderSide() {
    if (state.selected != null) ui.renderTirePanel(dom.side, state.selected, handlers());
    else ui.renderSummaryPanel(dom.side, handlers());
  }

  /* ------------------------------------------------------------- handlers */

  function openForm(position) {
    MT.form.open({
      position: position || 1,
      onSaved: function (n) {
        select(n);
        pulse(n);
        renderRig();
        toast('Logged replacement on tire #' + n);
      }
    });
  }

  function handlers() {
    return {
      close: function () { select(null); },
      select: function (n) { setView('rig'); select(n); },
      logReplacement: function (n) { openForm(n); },
      editEvent: function (id) {
        MT.form.open({
          eventId: id,
          onSaved: function (n) { pulse(n); renderAll(); toast('Entry updated'); }
        });
      },
      deleteEvent: function (id) {
        var e = store.allEvents().filter(function (x) { return x.id === id; })[0];
        if (!e) return;
        MT.form.confirm({
          title: 'Delete this entry?',
          message: 'Tire #' + e.position + ', fitted ' + ui.fmtDate(e.dateFitted) + '. This cannot be undone.',
          confirmText: 'Delete',
          danger: true,
          onConfirm: function () {
            store.deleteEvent(id);
            toast('Entry deleted');
          }
        });
      },
      toggleFlag: function (n) {
        if (store.getFlag(n)) {
          store.setFlag(n, null);
          toast('Flag cleared on tire #' + n);
        } else {
          MT.form.flag(n, function () { pulse(n); toast('Tire #' + n + ' flagged'); });
        }
      },
      filterLevel: function (level) {
        var first = store.allStatuses().filter(function (s) { return s.level === level; })[0];
        if (first) select(first.position);
        else toast('No tires with status “' + ui.levelName(level) + '”');
      },
      getDashFilters: function () { return state.dashFilters; },
      setDashFilters: function (patch) {
        Object.assign(state.dashFilters, patch);
        ui.renderDashboard(dom.views.dashboard, handlers());
      },
      getLogFilters: function () { return state.logFilters; },
      setLogFilters: function (patch, keepFocus) {
        Object.assign(state.logFilters, patch);
        var active = document.activeElement;
        var sel = active && active.selectionStart;
        ui.renderLog(dom.views.log, handlers());
        if (keepFocus) {
          var input = dom.views.log.querySelector('input[type="search"]');
          if (input) { input.focus(); if (sel != null) input.setSelectionRange(sel, sel); }
        }
      },
      updateSettings: function (key, value) {
        var patch = {};
        patch[key] = ['odometer', 'kmLimit', 'monthsLimit', 'warnAt'].indexOf(key) >= 0 ? Number(value) : value;
        store.updateSettings(patch);
        toast('Settings saved');
      },
      exportCSV: doExportCSV,
      exportJSON: doExportJSON,
      importJSON: doImportJSON,
      clearAll: function () {
        MT.form.confirm({
          title: 'Erase all tire data?',
          message: 'Every logged replacement on this device will be deleted. Export a backup first if you might need the record.',
          confirmText: 'Erase everything',
          danger: true,
          onConfirm: function () {
            store.clearAll();
            state.selected = null;
            toast('All data erased');
          }
        });
      }
    };
  }

  /* --------------------------------------------------------------- export */

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  function stamp() { return util.todayISO(); }

  function doExportCSV(events) {
    var csv = store.exportCSV(events);
    download('menzele-tire-log-' + stamp() + '.csv', csv, 'text/csv;charset=utf-8');
    toast('CSV exported');
  }

  function doExportJSON() {
    download('menzele-tire-backup-' + stamp() + '.json', store.exportJSON(), 'application/json');
    toast('Backup exported');
  }

  function doImportJSON() {
    var input = h('input', { type: 'file', accept: 'application/json,.json' });
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        MT.form.confirm({
          title: 'Restore from backup',
          message: 'Merge the backup into what is already here, or replace everything? Merge keeps both and skips duplicates.',
          confirmText: 'Merge',
          cancelText: 'Cancel',
          onConfirm: function () {
            var res = store.importJSON(String(reader.result), 'merge');
            toast(res.ok ? 'Merged ' + res.count + ' entries' : (res.error || 'Restore failed'));
          }
        });
      };
      reader.readAsText(file);
    });
    input.click();
  }

  /* ---------------------------------------------------------------- toast */

  var toastTimer = null;
  function toast(msg) {
    dom.toast.textContent = msg;
    dom.toast.hidden = false;
    dom.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      dom.toast.classList.remove('is-visible');
      setTimeout(function () { dom.toast.hidden = true; }, 300);
    }, 2600);
  }

  /* ------------------------------------------------------- offline shell */

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    navigator.serviceWorker.register('sw.js').catch(function () { /* offline shell is optional */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

}(window));
