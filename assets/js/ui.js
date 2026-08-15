/*
 * ui.js — panels, forms, dashboard and log rendering.
 */
(function (global) {
  'use strict';

  var MT = global.MT = global.MT || {};
  var store = MT.store;
  var util = MT.util;

  /* ---------------------------------------------------------------- utils */

  function h(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (attrs[k] == null) return;
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') node.addEventListener(k.slice(2), attrs[k]);
        else if (k === 'dataset') Object.keys(attrs[k]).forEach(function (d) { node.dataset[d] = attrs[k][d]; });
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function money(n) {
    var s = store.settings();
    if (n == null || !isFinite(n)) return '—';
    return s.currency + ' ' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ').replace(' .', '.');
  }

  function km(n) {
    return n == null ? '—' : util.fmtInt(n) + ' km';
  }

  function fmtDate(iso) {
    var d = util.parseISO(iso);
    if (!d) return '—';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function relative(days) {
    if (days == null) return '—';
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 31) return days + ' days ago';
    var months = Math.round(days / 30.44);
    if (months < 24) return months + ' month' + (months === 1 ? '' : 's') + ' ago';
    return (days / 365.25).toFixed(1) + ' years ago';
  }

  function levelName(level) { return MT.svg.statusColour(level).name; }

  function statusDot(level) {
    return h('span', { 'class': 'dot dot-' + level, title: levelName(level) });
  }

  function pctBar(pct, level) {
    var width = pct == null ? 0 : Math.min(100, Math.round(pct * 100));
    return h('div', { 'class': 'bar' }, [
      h('div', { 'class': 'bar-fill bar-' + level, style: 'width:' + width + '%' })
    ]);
  }

  /* ---------------------------------------------------------- tire panel */

  /*
   * The detail drawer for one tire position: current status, quick actions
   * and the full replacement history for that position.
   */
  function renderTirePanel(root, n, handlers) {
    clear(root);
    var p = MT.positionByNumber(n);
    if (!p) return;
    var st = store.statusFor(n);
    var events = store.eventsFor(n);
    var runs = store.runsFor(n).filter(function (r) { return r.complete; });

    root.appendChild(h('div', { 'class': 'panel-head' }, [
      h('div', { 'class': 'panel-head-main' }, [
        h('div', { 'class': 'tire-badge tire-badge-' + st.level, text: String(n) }),
        h('div', {}, [
          h('h2', { text: p.unit + ' · ' + p.axle }),
          h('p', { 'class': 'muted', text: p.position + (p.dual ? ' (dual fitment)' : ' (single)') })
        ])
      ]),
      h('button', { 'class': 'icon-btn', 'aria-label': 'Close panel', onclick: handlers.close, text: '✕' })
    ]));

    var statusCard = h('div', { 'class': 'status-card status-' + st.level }, [
      h('div', { 'class': 'status-row' }, [
        statusDot(st.level),
        h('strong', { text: levelName(st.level) })
      ]),
      pctBar(st.pct, st.level),
      h('ul', { 'class': 'reasons' }, st.reasons.map(function (r) { return h('li', { text: r }); }))
    ]);
    root.appendChild(statusCard);

    var latest = st.latest;
    root.appendChild(h('div', { 'class': 'kv-grid' }, [
      kv('Fitted', latest ? fmtDate(latest.dateFitted) : 'never logged'),
      kv('In service', latest ? relative(st.daysSince) : '—'),
      kv('Run since fitted', km(st.kmSince)),
      kv('Brand / type', latest && latest.brand ? latest.brand : '—'),
      kv('Fitted at', latest && latest.odometer != null ? km(latest.odometer) : '—'),
      kv('Fitted by', latest && latest.fittedBy ? latest.fittedBy : '—')
    ]));

    root.appendChild(h('div', { 'class': 'panel-actions' }, [
      h('button', { 'class': 'btn btn-primary btn-block', onclick: function () { handlers.logReplacement(n); } }, [
        h('span', { text: '＋ Log replacement' })
      ]),
      h('button', {
        'class': 'btn btn-ghost',
        onclick: function () { handlers.toggleFlag(n); },
        text: st.flag ? 'Clear flag' : 'Flag for attention'
      })
    ]));

    if (st.flag) {
      root.appendChild(h('div', { 'class': 'flag-note' }, [
        h('strong', { text: st.flag.level === 'issue' ? 'Issue flagged: ' : 'Watching: ' }),
        h('span', { text: st.flag.note || '—' })
      ]));
    }

    if (runs.length) {
      var avgKm = runs.reduce(function (a, r) { return a + (r.km || 0); }, 0) / runs.length;
      var avgDays = runs.reduce(function (a, r) { return a + (r.days || 0); }, 0) / runs.length;
      root.appendChild(h('div', { 'class': 'mini-stats' }, [
        miniStat('Completed runs', String(runs.length)),
        miniStat('Avg life', avgKm ? km(avgKm) : '—'),
        miniStat('Avg time', avgDays ? Math.round(avgDays / 30.44) + ' months' : '—')
      ]));
    }

    root.appendChild(h('h3', { 'class': 'section-title', text: 'History (' + events.length + ')' }));

    if (!events.length) {
      root.appendChild(h('p', { 'class': 'empty', text: 'Nothing logged for this position yet. Tap “Log replacement” to start the record.' }));
    } else {
      var list = h('ol', { 'class': 'history' });
      events.forEach(function (e, i) {
        list.appendChild(historyItem(e, i === 0, handlers));
      });
      root.appendChild(list);
    }
  }

  function kv(label, value) {
    return h('div', { 'class': 'kv' }, [
      h('span', { 'class': 'kv-label', text: label }),
      h('span', { 'class': 'kv-value', text: value })
    ]);
  }

  function miniStat(label, value) {
    return h('div', { 'class': 'mini-stat' }, [
      h('span', { 'class': 'mini-stat-value', text: value }),
      h('span', { 'class': 'mini-stat-label', text: label })
    ]);
  }

  function historyItem(e, isCurrent, handlers) {
    var body = [
      h('div', { 'class': 'hist-head' }, [
        h('strong', { text: fmtDate(e.dateFitted) }),
        isCurrent ? h('span', { 'class': 'tag tag-current', text: 'on the rig' }) : null,
        h('span', { 'class': 'tag', text: e.reasonType })
      ]),
      h('div', { 'class': 'hist-meta', text: [e.brand || 'brand not recorded', e.odometer != null ? km(e.odometer) : null].filter(Boolean).join(' · ') })
    ];
    if (e.reason) body.push(h('div', { 'class': 'hist-note', text: e.reason }));
    if (e.notes) body.push(h('div', { 'class': 'hist-note', text: e.notes }));
    var footer = [];
    if (e.fittedBy) footer.push(h('span', { text: 'Fitted by ' + e.fittedBy }));
    if (e.cost != null) footer.push(h('span', { text: money(e.cost) }));
    if (footer.length) body.push(h('div', { 'class': 'hist-foot' }, footer));
    if (e.photo) {
      body.push(h('img', { 'class': 'hist-photo', src: e.photo, alt: 'Tire photo logged on ' + fmtDate(e.dateFitted), loading: 'lazy' }));
    }
    body.push(h('div', { 'class': 'hist-actions' }, [
      h('button', { 'class': 'link-btn', text: 'Edit', onclick: function () { handlers.editEvent(e.id); } }),
      h('button', { 'class': 'link-btn link-danger', text: 'Delete', onclick: function () { handlers.deleteEvent(e.id); } })
    ]));
    return h('li', { 'class': 'hist-item' + (isCurrent ? ' is-current' : '') }, body);
  }

  /* ------------------------------------------------------- summary panel */

  function renderSummaryPanel(root, handlers) {
    clear(root);
    var counts = store.statusCounts();
    var statuses = store.allStatuses();
    var attention = statuses.filter(function (s) { return s.level === 'red' || s.level === 'amber'; })
      .sort(function (a, b) { return (b.pct || 0) - (a.pct || 0); });

    root.appendChild(h('div', { 'class': 'panel-head' }, [
      h('div', { 'class': 'panel-head-main' }, [
        h('div', {}, [
          h('h2', { text: 'Rig status' }),
          h('p', { 'class': 'muted', text: '26 tires · tap any tire or number to open its record' })
        ])
      ])
    ]));

    root.appendChild(h('div', { 'class': 'count-grid' }, ['red', 'amber', 'green', 'grey'].map(function (lvl) {
      return h('button', {
        'class': 'count-card count-' + lvl,
        onclick: function () { handlers.filterLevel(lvl); }
      }, [
        h('span', { 'class': 'count-value', text: String(counts[lvl]) }),
        h('span', { 'class': 'count-label', text: levelName(lvl) })
      ]);
    })));

    root.appendChild(h('h3', { 'class': 'section-title', text: 'Needs attention' }));
    if (!attention.length) {
      root.appendChild(h('p', { 'class': 'empty', text: 'No tire is near its service limit. Keep the odometer up to date so km-based warnings stay accurate.' }));
    } else {
      var list = h('ul', { 'class': 'attention-list' });
      attention.slice(0, 12).forEach(function (s) {
        list.appendChild(h('li', {}, [
          h('button', { 'class': 'attention-row', onclick: function () { handlers.select(s.position); } }, [
            h('span', { 'class': 'tire-badge tire-badge-sm tire-badge-' + s.level, text: String(s.position) }),
            h('span', { 'class': 'attention-main' }, [
              h('span', { 'class': 'attention-title', text: s.meta.unit + ' · ' + s.meta.axleShort + ' · ' + s.meta.position }),
              h('span', { 'class': 'attention-sub', text: s.reasons[0] || levelName(s.level) })
            ]),
            h('span', { 'class': 'attention-pct', text: s.pct != null ? Math.round(s.pct * 100) + '%' : '' })
          ])
        ]));
      });
      root.appendChild(list);
    }
  }

  /* ----------------------------------------------------------- dashboard */

  function renderDashboard(root, handlers) {
    clear(root);
    var s = store.settings();
    var counts = store.statusCounts();
    var statuses = store.allStatuses();
    var report = store.lifespanReport();

    var filters = handlers.getDashFilters();
    var spend = store.spendBetween(filters.from, filters.to);

    /* headline tiles */
    root.appendChild(h('section', { 'class': 'tiles' }, [
      tile(String(counts.red), 'Overdue / flagged', 'red'),
      tile(String(counts.amber), 'Due soon', 'amber'),
      tile(String(counts.green), 'In service', 'green'),
      tile(String(counts.grey), 'No data', 'grey'),
      tile(money(spend.total), 'Spend in period', null, spend.count + ' fitment' + (spend.count === 1 ? '' : 's')),
      tile(report.fleetAvgKm ? km(report.fleetAvgKm) : '—', 'Avg tire life', null, 'across completed runs')
    ]));

    /* period filter */
    var fromInput = h('input', { type: 'date', value: filters.from || '', id: 'dash-from' });
    var toInput = h('input', { type: 'date', value: filters.to || '', id: 'dash-to' });
    fromInput.addEventListener('change', function () { handlers.setDashFilters({ from: fromInput.value }); });
    toInput.addEventListener('change', function () { handlers.setDashFilters({ to: toInput.value }); });

    root.appendChild(h('section', { 'class': 'card' }, [
      h('div', { 'class': 'card-head' }, [h('h3', { text: 'Period' })]),
      h('div', { 'class': 'field-row' }, [
        h('label', { 'class': 'field' }, [h('span', { text: 'From' }), fromInput]),
        h('label', { 'class': 'field' }, [h('span', { text: 'To' }), toInput]),
        h('button', { 'class': 'btn btn-ghost', text: 'Clear', onclick: function () { handlers.setDashFilters({ from: '', to: '' }); } })
      ])
    ]));

    /* attention table */
    var due = statuses.filter(function (x) { return x.level === 'red' || x.level === 'amber'; })
      .sort(function (a, b) { return (b.pct || 0) - (a.pct || 0); });

    root.appendChild(h('section', { 'class': 'card' }, [
      h('div', { 'class': 'card-head' }, [
        h('h3', { text: 'Nearing or past replacement' }),
        h('span', { 'class': 'muted', text: due.length + ' of 26' })
      ]),
      due.length ? tableOf(
        ['#', 'Position', 'Fitted', 'Km run', 'Used', 'Status'],
        due.map(function (x) {
          return [
            badgeCell(x),
            x.meta.unit + ' · ' + x.meta.axleShort + ' · ' + x.meta.position,
            x.latest ? fmtDate(x.latest.dateFitted) : '—',
            km(x.kmSince),
            x.pct != null ? Math.round(x.pct * 100) + '%' : '—',
            levelName(x.level)
          ];
        }),
        handlers
      ) : h('p', { 'class': 'empty', text: 'Nothing is due. ' + (s.odometer ? '' : 'Set the rig odometer to enable km-based warnings.') })
    ]));

    /* lifespan per axle */
    root.appendChild(h('section', { 'class': 'card' }, [
      h('div', { 'class': 'card-head' }, [h('h3', { text: 'Average life by axle' })]),
      tableOf(
        ['Axle', 'Completed runs', 'Avg km', 'Avg months'],
        report.perAxle.map(function (r) {
          return [
            r.axle.unit + ' · ' + r.axle.label,
            String(r.completedRuns),
            r.avgKm ? km(r.avgKm) : '—',
            r.avgDays ? (r.avgDays / 30.44).toFixed(1) : '—'
          ];
        }),
        handlers
      )
    ]));

    /* fast-wearing positions */
    root.appendChild(h('section', { 'class': 'card' }, [
      h('div', { 'class': 'card-head' }, [
        h('h3', { text: 'Wearing faster than the rig average' }),
        h('span', { 'class': 'muted', text: 'possible alignment or load issue' })
      ]),
      report.outliers.length ? tableOf(
        ['#', 'Position', 'Avg km', 'Rig average', 'Runs'],
        report.outliers.map(function (r) {
          return [
            String(r.meta.n),
            r.meta.unit + ' · ' + r.meta.axleShort + ' · ' + r.meta.position,
            km(r.avgKm),
            km(report.fleetAvgKm),
            String(r.completedRuns)
          ];
        }),
        handlers
      ) : h('p', { 'class': 'empty', text: 'Not enough completed runs yet. Once a position has been replaced twice, its average life shows up here.' })
    ]));
  }

  function tile(value, label, level, sub) {
    return h('div', { 'class': 'tile' + (level ? ' tile-' + level : '') }, [
      h('span', { 'class': 'tile-value', text: value }),
      h('span', { 'class': 'tile-label', text: label }),
      sub ? h('span', { 'class': 'tile-sub', text: sub }) : null
    ]);
  }

  function badgeCell(x) {
    return h('span', { 'class': 'tire-badge tire-badge-sm tire-badge-' + x.level, text: String(x.position) });
  }

  function tableOf(headers, rows) {
    var table = h('table', { 'class': 'table' });
    var thead = h('thead', {}, [h('tr', {}, headers.map(function (x) { return h('th', { text: x }); }))]);
    var tbody = h('tbody');
    rows.forEach(function (r) {
      tbody.appendChild(h('tr', {}, r.map(function (cell) {
        return h('td', {}, [typeof cell === 'string' ? document.createTextNode(cell) : cell]);
      })));
    });
    table.appendChild(thead);
    table.appendChild(tbody);
    return h('div', { 'class': 'table-wrap' }, [table]);
  }

  /* ----------------------------------------------------------- log view */

  function renderLog(root, handlers) {
    clear(root);
    var f = handlers.getLogFilters();
    var events = store.allEvents().filter(function (e) {
      var p = MT.positionByNumber(e.position);
      if (f.unit && p.unitId !== f.unit) return false;
      if (f.axle && p.axleId !== f.axle) return false;
      if (f.position && Number(f.position) !== e.position) return false;
      if (f.from && e.dateFitted < f.from) return false;
      if (f.to && e.dateFitted > f.to) return false;
      if (f.text) {
        var hay = [e.brand, e.reason, e.reasonType, e.fittedBy, e.notes].join(' ').toLowerCase();
        if (hay.indexOf(f.text.toLowerCase()) < 0) return false;
      }
      return true;
    }).sort(function (a, b) {
      if (a.dateFitted !== b.dateFitted) return a.dateFitted < b.dateFitted ? 1 : -1;
      return a.position - b.position;
    });

    var totalCost = events.reduce(function (a, e) { return a + (e.cost || 0); }, 0);

    /* filter bar */
    var unitSel = h('select', {}, [h('option', { value: '', text: 'All units' })].concat(
      Object.keys(MT.UNIT_IDS).map(function (k) {
        return h('option', { value: k, text: MT.UNIT_IDS[k], selected: f.unit === k ? 'selected' : null });
      })
    ));
    var axleSel = h('select', {}, [h('option', { value: '', text: 'All axles' })].concat(
      MT.AXLES.map(function (a) {
        return h('option', { value: a.id, text: a.unit + ' · ' + a.label, selected: f.axle === a.id ? 'selected' : null });
      })
    ));
    var posSel = h('select', {}, [h('option', { value: '', text: 'All positions' })].concat(
      MT.TIRE_POSITIONS.map(function (p) {
        return h('option', { value: String(p.n), text: '#' + p.n + ' — ' + p.unit + ' ' + p.position, selected: String(f.position) === String(p.n) ? 'selected' : null });
      })
    ));
    var fromI = h('input', { type: 'date', value: f.from || '' });
    var toI = h('input', { type: 'date', value: f.to || '' });
    var textI = h('input', { type: 'search', placeholder: 'Search brand, reason, fitter…', value: f.text || '' });

    unitSel.addEventListener('change', function () { handlers.setLogFilters({ unit: unitSel.value }); });
    axleSel.addEventListener('change', function () { handlers.setLogFilters({ axle: axleSel.value }); });
    posSel.addEventListener('change', function () { handlers.setLogFilters({ position: posSel.value }); });
    fromI.addEventListener('change', function () { handlers.setLogFilters({ from: fromI.value }); });
    toI.addEventListener('change', function () { handlers.setLogFilters({ to: toI.value }); });
    textI.addEventListener('input', function () { handlers.setLogFilters({ text: textI.value }, true); });

    root.appendChild(h('section', { 'class': 'card no-print' }, [
      h('div', { 'class': 'card-head' }, [
        h('h3', { text: 'Tire replacement log' }),
        h('span', { 'class': 'muted', text: events.length + ' entr' + (events.length === 1 ? 'y' : 'ies') + ' · ' + money(totalCost) })
      ]),
      h('div', { 'class': 'filter-bar' }, [
        h('label', { 'class': 'field' }, [h('span', { text: 'Unit' }), unitSel]),
        h('label', { 'class': 'field' }, [h('span', { text: 'Axle' }), axleSel]),
        h('label', { 'class': 'field' }, [h('span', { text: 'Position' }), posSel]),
        h('label', { 'class': 'field' }, [h('span', { text: 'From' }), fromI]),
        h('label', { 'class': 'field' }, [h('span', { text: 'To' }), toI]),
        h('label', { 'class': 'field field-grow' }, [h('span', { text: 'Search' }), textI])
      ]),
      h('div', { 'class': 'btn-row' }, [
        h('button', { 'class': 'btn btn-ghost', text: 'Clear filters', onclick: function () { handlers.setLogFilters({ unit: '', axle: '', position: '', from: '', to: '', text: '' }); } }),
        h('button', { 'class': 'btn btn-ghost', text: 'Export CSV', onclick: function () { handlers.exportCSV(events); } }),
        h('button', { 'class': 'btn btn-ghost', text: 'Print / PDF', onclick: function () { global.print(); } }),
        h('button', { 'class': 'btn btn-primary', text: '＋ New entry', onclick: function () { handlers.logReplacement(null); } })
      ])
    ]));

    var printHead = h('div', { 'class': 'print-only print-head' }, [
      h('h2', { text: 'Tire Replacement Log — Volvo FMX Horse + 2 Trailers' }),
      h('p', { text: store.settings().rigName + ' · printed ' + fmtDate(util.todayISO()) })
    ]);
    root.appendChild(printHead);

    if (!events.length) {
      root.appendChild(h('p', { 'class': 'empty', text: 'No entries match. Log a replacement from the rig view, or clear the filters.' }));
      return;
    }

    var table = h('table', { 'class': 'table log-table' });
    table.appendChild(h('thead', {}, [h('tr', {}, [
      '#', 'Unit', 'Axle', 'Position', 'Date fitted', 'Brand / type', 'Odometer',
      'Reason', 'Fitted by', 'Cost', 'Notes', ''
    ].map(function (t) { return h('th', { text: t }); }))]));

    var tbody = h('tbody');
    events.forEach(function (e) {
      var p = MT.positionByNumber(e.position);
      tbody.appendChild(h('tr', {}, [
        h('td', {}, [h('button', { 'class': 'link-btn', text: '#' + e.position, onclick: function () { handlers.select(e.position); } })]),
        h('td', { text: p.unit }),
        h('td', { text: p.axle }),
        h('td', { text: p.position }),
        h('td', { text: fmtDate(e.dateFitted) }),
        h('td', { text: e.brand || '—' }),
        h('td', { text: e.odometer != null ? util.fmtInt(e.odometer) : '—' }),
        h('td', { text: e.reasonType + (e.reason ? ' — ' + e.reason : '') }),
        h('td', { text: e.fittedBy || '—' }),
        h('td', { text: e.cost != null ? money(e.cost) : '—' }),
        h('td', { text: e.notes || '' }),
        h('td', { 'class': 'no-print' }, [
          h('button', { 'class': 'link-btn', text: 'Edit', onclick: function () { handlers.editEvent(e.id); } }),
          h('button', { 'class': 'link-btn link-danger', text: 'Delete', onclick: function () { handlers.deleteEvent(e.id); } })
        ])
      ]));
    });
    table.appendChild(tbody);
    root.appendChild(h('div', { 'class': 'table-wrap' }, [table]));
  }

  /* ----------------------------------------------------------- settings */

  function renderSettings(root, handlers) {
    clear(root);
    var s = store.settings();

    function numberField(key, label, hint, attrs) {
      var input = h('input', Object.assign({ type: 'number', value: s[key], id: 'set-' + key }, attrs || {}));
      input.addEventListener('change', function () { handlers.updateSettings(key, input.value); });
      return h('label', { 'class': 'field' }, [h('span', { text: label }), input, hint ? h('small', { text: hint }) : null]);
    }
    function textField(key, label) {
      var input = h('input', { type: 'text', value: s[key], id: 'set-' + key });
      input.addEventListener('change', function () { handlers.updateSettings(key, input.value); });
      return h('label', { 'class': 'field' }, [h('span', { text: label }), input]);
    }

    root.appendChild(h('section', { 'class': 'card' }, [
      h('div', { 'class': 'card-head' }, [h('h3', { text: 'Rig' })]),
      h('div', { 'class': 'field-grid' }, [
        textField('rigName', 'Rig name'),
        textField('registration', 'Registration'),
        numberField('odometer', 'Current odometer (km)', 'Drives every km-based warning — update it when you fill up.', { min: 0, step: 100 })
      ])
    ]));

    root.appendChild(h('section', { 'class': 'card' }, [
      h('div', { 'class': 'card-head' }, [
        h('h3', { text: 'Replacement thresholds' }),
        h('span', { 'class': 'muted', text: 'a tire turns amber at the warning point and red at the limit' })
      ]),
      h('div', { 'class': 'field-grid' }, [
        numberField('kmLimit', 'Service life (km)', 'Set 0 to ignore km.', { min: 0, step: 1000 }),
        numberField('monthsLimit', 'Age limit (months)', 'Set 0 to ignore age.', { min: 0, step: 1 }),
        numberField('warnAt', 'Warn at (% of limit)', 'e.g. 80 turns a tire amber at 80% used.', { min: 1, max: 99, step: 1 }),
        textField('currency', 'Currency symbol')
      ])
    ]));

    root.appendChild(h('section', { 'class': 'card' }, [
      h('div', { 'class': 'card-head' }, [h('h3', { text: 'Backup and export' })]),
      h('p', { 'class': 'muted', text: 'Everything is stored on this device only. Export regularly so the record survives a lost or wiped phone.' }),
      h('div', { 'class': 'btn-row' }, [
        h('button', { 'class': 'btn btn-ghost', text: 'Export CSV log', onclick: function () { handlers.exportCSV(null); } }),
        h('button', { 'class': 'btn btn-ghost', text: 'Export JSON backup', onclick: handlers.exportJSON }),
        h('button', { 'class': 'btn btn-ghost', text: 'Restore from backup', onclick: handlers.importJSON }),
        h('button', { 'class': 'btn btn-ghost', text: 'Print positions sheet', onclick: function () { global.print(); } })
      ]),
      h('p', { 'class': 'muted small', text: 'Last saved: ' + (store.raw().updatedAt ? new Date(store.raw().updatedAt).toLocaleString() : '—') })
    ]));

    root.appendChild(h('section', { 'class': 'card card-danger' }, [
      h('div', { 'class': 'card-head' }, [h('h3', { text: 'Danger zone' })]),
      h('p', { 'class': 'muted', text: 'Deletes every logged replacement on this device. Export a backup first.' }),
      h('button', { 'class': 'btn btn-danger', text: 'Erase all data', onclick: handlers.clearAll })
    ]));

    root.appendChild(h('section', { 'class': 'card' }, [
      h('div', { 'class': 'card-head' }, [h('h3', { text: 'Position reference' })]),
      tableOf(['#', 'Unit', 'Axle', 'Position'], MT.TIRE_POSITIONS.map(function (p) {
        return [String(p.n), p.unit, p.axle, p.position];
      }))
    ]));
  }

  MT.ui = {
    h: h,
    clear: clear,
    money: money,
    km: km,
    fmtDate: fmtDate,
    relative: relative,
    levelName: levelName,
    renderTirePanel: renderTirePanel,
    renderSummaryPanel: renderSummaryPanel,
    renderDashboard: renderDashboard,
    renderLog: renderLog,
    renderSettings: renderSettings
  };

}(window));
