/*
 * render-topdown.js — top-down rendering of the rig.
 *
 * Draws the Volvo FMX horse and both side-tipper trailers to scale, with all
 * 26 tires individually rendered, numbered and colour-coded by live status.
 * Layout mirrors the paper numbering diagram: front at the top, direction of
 * travel upward, LEFT on the left, number chips in columns down both sides.
 */
(function (global) {
  'use strict';

  var MT = global.MT = global.MT || {};
  var S = MT.svg;
  var RIG = MT.RIG;

  /* Content box per focus, in model millimetres. */
  var FOCUS_BOX = {
    fit:   { x0: -4600, x1: 4600, y0: -2100, y1: 22600 },
    horse: { x0: -4600, x1: 4600, y0: -2100, y1: 8100 },
    t1:    { x0: -4600, x1: 4600, y0: 3600,  y1: 13400 },
    t2:    { x0: -4600, x1: 4600, y0: 12500, y1: 22200 }
  };

  var BODY = {
    steelDark: '#2b3442',
    steel: '#3b4757',
    steelLight: '#4d5b6e',
    deck: '#323c4a',
    glass: '#1b2634',
    rail: '#59697d',
    accent: '#7d8ea4',
    line: '#8ea0b6'
  };

  function render(svg, ctx) {
    S.clear(svg);

    var box = FOCUS_BOX[ctx.focus] || FOCUS_BOX.fit;
    var bw = box.x1 - box.x0;
    var bh = box.y1 - box.y0;
    var baseScale = Math.min(ctx.width / bw, ctx.height / bh);
    var scale = baseScale * (ctx.zoom || 1);
    var vbw = ctx.width / scale;
    var vbh = ctx.height / scale;
    var cx = (box.x0 + box.x1) / 2 + (ctx.pan ? ctx.pan.x : 0);
    var cy = (box.y0 + box.y1) / 2 + (ctx.pan ? ctx.pan.y : 0);
    var vb = [cx - vbw / 2, cy - vbh / 2, vbw, vbh];

    svg.setAttribute('viewBox', vb.map(S.round).join(' '));
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    /* Model units for a given number of screen pixels. */
    function px(n) { return n / scale; }

    defs(svg);

    var root = S.group({ 'class': 'td-root' }, svg);

    /* Painted back to front: each unit's nose sits on top of the one ahead
       of it, the way the bins actually overhang the coupling. */
    drawShadows(root);
    drawHorse(root, px);
    drawTrailer(root, RIG.trailer1, 'T1', px);
    drawLink(root, px);
    drawTrailer(root, RIG.trailer2, 'T2', px);

    var tireLayer = S.group({ 'class': 'tire-layer' }, root);
    MT.TIRE_POSITIONS.forEach(function (p, i) {
      drawTire(tireLayer, p, ctx, px, i);
    });

    drawAnnotations(root, ctx, px, scale);

    return { scale: scale, viewBox: vb, px: px };
  }

  /* ------------------------------------------------------------------ defs */

  function defs(svg) {
    var d = S.el('defs', null, svg);

    var cab = S.el('linearGradient', { id: 'td-cab', x1: '0', y1: '0', x2: '1', y2: '0' }, d);
    S.el('stop', { offset: '0', 'stop-color': '#39465a' }, cab);
    S.el('stop', { offset: '0.42', 'stop-color': '#55667e' }, cab);
    S.el('stop', { offset: '0.62', 'stop-color': '#4a5a70' }, cab);
    S.el('stop', { offset: '1', 'stop-color': '#2f3a49' }, cab);

    var bin = S.el('linearGradient', { id: 'td-bin', x1: '0', y1: '0', x2: '1', y2: '0' }, d);
    S.el('stop', { offset: '0', 'stop-color': '#33404f' }, bin);
    S.el('stop', { offset: '0.5', 'stop-color': '#4a5a6d' }, bin);
    S.el('stop', { offset: '1', 'stop-color': '#2c3745' }, bin);

    var floor = S.el('linearGradient', { id: 'td-floor', x1: '0', y1: '0', x2: '1', y2: '0' }, d);
    S.el('stop', { offset: '0', 'stop-color': '#1c242e' }, floor);
    S.el('stop', { offset: '0.5', 'stop-color': '#28323e' }, floor);
    S.el('stop', { offset: '1', 'stop-color': '#1a2129' }, floor);

    var glass = S.el('linearGradient', { id: 'td-glass', x1: '0', y1: '0', x2: '0.3', y2: '1' }, d);
    S.el('stop', { offset: '0', 'stop-color': '#8fb6d8', 'stop-opacity': '0.55' }, glass);
    S.el('stop', { offset: '1', 'stop-color': '#1b2634', 'stop-opacity': '0.9' }, glass);
  }

  function drawShadows(root) {
    var g = S.group({ 'class': 'td-shadow', opacity: '0.28' }, root);
    [
      [RIG.horse.nose, RIG.horse.tail],
      [RIG.trailer1.front, RIG.trailer1.rear],
      [RIG.trailer2.front, RIG.trailer2.rear]
    ].forEach(function (span) {
      S.el('rect', {
        x: -RIG.width / 2 + 120, y: span[0] + 120,
        width: RIG.width, height: span[1] - span[0],
        rx: 160, fill: '#000'
      }, g);
    });
  }

  /* ----------------------------------------------------------------- horse */

  function drawHorse(root, px) {
    var h = RIG.horse;
    var g = S.group({ 'class': 'unit-horse' }, root);

    /* chassis rails */
    [-1, 1].forEach(function (s) {
      S.el('rect', {
        x: s * 445 - 65, y: h.chassis.from,
        width: 130, height: h.chassis.to - h.chassis.from,
        fill: BODY.steelDark, stroke: '#151b24', 'stroke-width': 10
      }, g);
    });
    /* cross members */
    for (var y = 3000; y < h.tail; y += 900) {
      S.el('rect', { x: -400, y: y, width: 800, height: 60, fill: '#222a35' }, g);
    }

    /* catwalk deck behind the cab */
    var walk = S.el('rect', {
      x: -940, y: h.catwalk.from, width: 1880, height: h.tail - h.catwalk.from - 120,
      rx: 40, fill: BODY.deck, stroke: '#1d2530', 'stroke-width': 14
    }, g);
    walk.setAttribute('class', 'catwalk');
    for (var w = h.catwalk.from + 140; w < h.tail - 200; w += 190) {
      S.el('line', { x1: -880, y1: w, x2: 880, y2: w, stroke: '#1f2833', 'stroke-width': 26, opacity: '0.8' }, g);
    }

    /* fuel tank (left) and battery box (right) */
    S.el('rect', { x: -1250, y: h.tank.from, width: 470, height: h.tank.to - h.tank.from, rx: 200, fill: '#6d7b8d', stroke: '#222a35', 'stroke-width': 14 }, g);
    S.el('rect', { x: 790, y: h.tank.from + 120, width: 440, height: 820, rx: 60, fill: '#3f4b5b', stroke: '#222a35', 'stroke-width': 14 }, g);

    /* fifth wheel plate + coupling */
    var fw = RIG.fifthWheel;
    S.el('polygon', {
      points: S.polyPoints([
        [-fw.radius - 130, fw.y - 620], [fw.radius + 130, fw.y - 620],
        [fw.radius + 320, fw.y + 640], [-fw.radius - 320, fw.y + 640]
      ]),
      fill: '#4a5768', stroke: '#1d2530', 'stroke-width': 16
    }, g);
    S.el('circle', { cx: 0, cy: fw.y, r: fw.radius, fill: '#5b6a7d', stroke: '#232c38', 'stroke-width': 20 }, g);
    /* kingpin throat, opening rearward */
    S.el('path', {
      d: 'M -150 ' + (fw.y + fw.radius) + ' L -70 ' + fw.y + ' L 70 ' + fw.y + ' L 150 ' + (fw.y + fw.radius) + ' Z',
      fill: '#161c25'
    }, g);
    S.el('circle', { cx: 0, cy: fw.y, r: 120, fill: '#20272f', stroke: '#7d8ea4', 'stroke-width': 16 }, g);

    /* cab */
    var cab = h.cab;
    S.el('rect', {
      x: -cab.width / 2, y: cab.from, width: cab.width, height: cab.to - cab.from,
      rx: 190, fill: 'url(#td-cab)', stroke: '#151b24', 'stroke-width': 18
    }, g);
    /* roof panel */
    S.el('rect', {
      x: -1080, y: cab.from + 230, width: 2160, height: (cab.to - cab.from) - 560,
      rx: 130, fill: '#5d6e86', opacity: '0.85'
    }, g);
    /* roof deflector seam */
    S.el('line', { x1: -1080, y1: cab.from + 620, x2: 1080, y2: cab.from + 620, stroke: '#39455a', 'stroke-width': 24 }, g);
    /* windscreen */
    S.el('polygon', {
      points: S.polyPoints([[-1010, cab.from + 250], [1010, cab.from + 250], [1120, cab.from + 700], [-1120, cab.from + 700]]),
      fill: 'url(#td-glass)', stroke: '#20293a', 'stroke-width': 14
    }, g);
    /* sun visor */
    S.el('rect', { x: -1150, y: cab.from + 120, width: 2300, height: 150, rx: 60, fill: '#39455a' }, g);
    /* grille + lights */
    S.el('rect', { x: -1120, y: cab.from - 190, width: 2240, height: 260, rx: 70, fill: '#2c3646', stroke: '#151b24', 'stroke-width': 14 }, g);
    [[-980, '#e8edf3'], [980, '#e8edf3']].forEach(function (l) {
      S.el('rect', { x: l[0] - 190, y: cab.from - 170, width: 380, height: 200, rx: 50, fill: l[1], opacity: '0.75' }, g);
    });
    /* front bumper */
    S.el('rect', { x: -1240, y: h.bumper.from - 40, width: 2480, height: 200, rx: 70, fill: '#39455a', stroke: '#151b24', 'stroke-width': 14 }, g);

    /* mirrors */
    [-1, 1].forEach(function (s) {
      S.el('rect', { x: s * 1240 - (s < 0 ? 330 : 0), y: cab.from + 620, width: 330, height: 90, fill: '#2c3646' }, g);
      S.el('rect', { x: s * 1560 - (s < 0 ? 150 : 0), y: cab.from + 520, width: 150, height: 420, rx: 50, fill: '#4a5768', stroke: '#151b24', 'stroke-width': 12 }, g);
    });

    /* exhaust stack + air intake behind the cab */
    S.el('circle', { cx: 900, cy: cab.to + 260, r: 130, fill: '#8a97a8', stroke: '#1d2530', 'stroke-width': 14 }, g);
    S.el('rect', { x: -1080, y: cab.to + 120, width: 380, height: 620, rx: 70, fill: '#465364', stroke: '#1d2530', 'stroke-width': 12 }, g);
  }

  /* -------------------------------------------------------------- trailers */

  function drawTrailer(root, t, id, px) {
    var g = S.group({ 'class': 'unit-' + id }, root);

    /* chassis rails run the full length of the unit */
    [-1, 1].forEach(function (s) {
      S.el('rect', {
        x: s * 500 - 70, y: t.front, width: 140, height: t.rear - t.front,
        fill: BODY.steelDark, stroke: '#151b24', 'stroke-width': 10
      }, g);
    });

    var bin = t.bin;
    /* outer body / top rail */
    S.el('rect', {
      x: -bin.topWidth / 2, y: bin.from, width: bin.topWidth, height: bin.to - bin.from,
      rx: 90, fill: 'url(#td-bin)', stroke: '#141a22', 'stroke-width': 18
    }, g);
    /* load floor seen through the open top */
    S.el('rect', {
      x: -bin.topWidth / 2 + 200, y: bin.from + 200, width: bin.topWidth - 400, height: (bin.to - bin.from) - 400,
      rx: 50, fill: 'url(#td-floor)', stroke: '#0f141b', 'stroke-width': 12
    }, g);
    /* body ribs across the top rail */
    var ribStep = 900;
    for (var y = bin.from + ribStep; y < bin.to - 200; y += ribStep) {
      S.el('line', { x1: -bin.topWidth / 2 + 20, y1: y, x2: bin.topWidth / 2 - 20, y2: y, stroke: BODY.rail, 'stroke-width': 55, opacity: '0.55' }, g);
    }
    /* tipper hinge along the left rail, rams on the right */
    S.el('line', {
      x1: -bin.topWidth / 2 + 60, y1: bin.from + 260, x2: -bin.topWidth / 2 + 60, y2: bin.to - 260,
      stroke: '#8ea0b6', 'stroke-width': 70, opacity: '0.6'
    }, g);
    [0.32, 0.68].forEach(function (f) {
      var yy = bin.from + (bin.to - bin.from) * f;
      S.el('rect', { x: bin.topWidth / 2 - 250, y: yy - 130, width: 190, height: 260, rx: 60, fill: '#6d7b8d', opacity: '0.85' }, g);
    });

    /* running gear: bogie beam under the axles */
    var axles = MT.AXLES.filter(function (a) { return a.unit === (id === 'T1' ? 'Trailer 1' : 'Trailer 2'); });
    if (axles.length) {
      S.el('rect', {
        x: -1150, y: axles[0].y - 260, width: 2300, height: (axles[axles.length - 1].y - axles[0].y) + 520,
        rx: 90, fill: '#232c38', opacity: '0.9'
      }, g);
      axles.forEach(function (a) {
        S.el('rect', { x: -1180, y: a.y - 90, width: 2360, height: 180, fill: '#3d4857' }, g);
      });
    }

    if (id === 'T1') {
      /* kingpin plate mating with the horse fifth wheel */
      S.el('circle', { cx: 0, cy: RIG.fifthWheel.y, r: 300, fill: '#4a5768', stroke: '#1d2530', 'stroke-width': 16 }, g);
      S.el('circle', { cx: 0, cy: RIG.fifthWheel.y, r: 110, fill: '#0f141b' }, g);
      /* landing legs */
      [-1, 1].forEach(function (s) {
        S.el('rect', { x: s * 980 - 80, y: 6350, width: 160, height: 420, rx: 30, fill: '#6d7b8d', stroke: '#1d2530', 'stroke-width': 12 }, g);
      });
    }
  }

  function drawLink(root, px) {
    var d = RIG.drawbar;
    var g = S.group({ 'class': 'unit-link' }, root);
    S.el('rect', { x: -d.width / 2, y: d.from - 150, width: d.width, height: (d.to - d.from) + 300, rx: 60, fill: '#5b6a7d', stroke: '#1d2530', 'stroke-width': 16 }, g);
    [d.from - 60, d.to + 60].forEach(function (y) {
      S.el('circle', { cx: 0, cy: y, r: 190, fill: '#465364', stroke: '#1d2530', 'stroke-width': 16 }, g);
      S.el('circle', { cx: 0, cy: y, r: 80, fill: '#0f141b' }, g);
    });
  }

  /* ----------------------------------------------------------------- tires */

  function drawTire(layer, p, ctx, px, index) {
    var st = ctx.statusMap[p.n] || { level: 'grey' };
    var colour = S.statusColour(st.level);
    var selected = ctx.selected === p.n;

    var g = S.group({
      'class': 'tire' + (selected ? ' is-selected' : '') + (ctx.pulse === p.n ? ' is-pulsing' : ''),
      'data-pos': p.n,
      'data-level': st.level,
      tabindex: '0',
      role: 'button',
      'aria-label': tireLabel(p, st)
    }, layer);

    if (ctx.animate) g.style.animationDelay = (index * 18) + 'ms';

    var w = p.width, hgt = p.diameter;
    var x = p.x - w / 2, y = p.y - hgt / 2;
    var rx = w * 0.3;

    /* wheel arch, so the tire reads as seated in the body rather than on it */
    S.el('rect', {
      x: p.x - w * 0.78, y: p.y - hgt * 0.58, width: w * 1.56, height: hgt * 1.16,
      rx: w * 0.4, fill: 'rgba(6,9,13,0.5)'
    }, g);

    /* halo behind the selected tire */
    if (selected) {
      S.el('rect', {
        x: x - px(6), y: y - px(6), width: w + px(12), height: hgt + px(12),
        rx: rx + px(6), fill: 'none', stroke: '#ffffff', 'stroke-width': px(2.5), opacity: '0.95'
      }, g);
    }

    /* rubber */
    S.el('rect', {
      x: x, y: y, width: w, height: hgt, rx: rx,
      fill: colour.rubber, stroke: '#0d1117', 'stroke-width': Math.max(12, px(0.8)),
      'class': 'tire-body'
    }, g);

    /* circumferential grooves */
    [-0.28, 0, 0.28].forEach(function (f) {
      S.el('line', {
        x1: p.x + w * f, y1: y + hgt * 0.08, x2: p.x + w * f, y2: y + hgt * 0.92,
        stroke: colour.deep, 'stroke-width': Math.max(14, w * 0.09), opacity: '0.85'
      }, g);
    });
    /* lateral sipes */
    for (var i = 1; i < 9; i++) {
      var yy = y + (hgt * i) / 9;
      S.el('line', { x1: x + w * 0.06, y1: yy, x2: x + w * 0.94, y2: yy, stroke: colour.deep, 'stroke-width': 22, opacity: '0.45' }, g);
    }
    /* shoulder highlight */
    S.el('rect', {
      x: x + w * 0.08, y: y + hgt * 0.03, width: w * 0.84, height: hgt * 0.94, rx: rx * 0.7,
      fill: 'none', stroke: '#ffffff', 'stroke-width': 12, opacity: '0.12'
    }, g);

    /* number printed on the tire once it would render at a legible size */
    var numSize = Math.min(w * 0.62, hgt * 0.22);
    if (numSize / px(1) >= 8) {
      S.text(String(p.n), {
        x: p.x, y: p.y, 'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-size': numSize, fill: colour.ink,
        'font-weight': '700', 'class': 'tire-num', 'paint-order': 'stroke',
        stroke: 'rgba(255,255,255,0.55)', 'stroke-width': w * 0.05
      }, g);
    }

    /* hit area */
    S.el('rect', {
      x: x - px(3), y: y - px(3), width: w + px(6), height: hgt + px(6), rx: rx,
      fill: 'transparent', 'class': 'tire-hit'
    }, g);
  }

  function tireLabel(p, st) {
    return 'Tire ' + p.n + ', ' + p.unit + ' ' + p.axle + ' ' + p.position + ', status ' + S.statusColour(st.level).name;
  }

  /* ----------------------------------------------------- chips and labels */

  function drawAnnotations(root, ctx, px, scale) {
    var g = S.group({ 'class': 'annotations' }, root);

    var edge = RIG.width / 2;
    var innerCol = edge + px(34);
    var outerCol = edge + px(76);
    var labelCol = outerCol + px(34);

    /*
     * Side text has to live in whatever screen space is left beside the rig.
     * On a phone that is only a few characters wide, so labels step down to
     * their short forms rather than running off the edge.
     */
    var freePx = ctx.width / 2 - (labelCol * scale);
    var charPx = 11 * 0.55;
    var maxChars = Math.max(0, Math.floor(freePx / charPx) - 1);

    function fit(variants) {
      for (var i = 0; i < variants.length; i++) {
        if (variants[i].length <= maxChars) return variants[i];
      }
      return null;
    }

    /* direction of travel */
    var arrow = S.group({ 'class': 'travel' }, g);
    var ax = 0, ay0 = -300, ay1 = -1250;
    S.el('line', { x1: ax, y1: ay0, x2: ax, y2: ay1, stroke: BODY.line, 'stroke-width': px(2) }, arrow);
    S.el('polygon', {
      points: S.polyPoints([[ax, ay1 - px(9)], [ax - px(6), ay1 + px(3)], [ax + px(6), ay1 + px(3)]]),
      fill: BODY.line
    }, arrow);
    S.text('Direction of travel', {
      x: ax, y: ay1 - px(10), 'text-anchor': 'middle',
      'font-size': px(12), fill: BODY.line, 'class': 'anno-text'
    }, arrow);

    /* LEFT / RIGHT */
    S.text('LEFT', { x: -edge - px(12), y: -420, 'text-anchor': 'end', 'font-size': px(12), fill: BODY.line, 'letter-spacing': px(1), 'class': 'anno-text' }, g);
    S.text('RIGHT', { x: edge + px(12), y: -420, 'font-size': px(12), fill: BODY.line, 'letter-spacing': px(1), 'class': 'anno-text' }, g);

    /* per-axle chip pairs, axle labels and unit brackets */
    MT.AXLES.forEach(function (axle) {
      var members = MT.TIRE_POSITIONS.filter(function (p) { return p.axleId === axle.id; });

      ['L', 'R'].forEach(function (side) {
        var sideTires = members.filter(function (p) { return p.side === side; });
        var dir = side === 'L' ? -1 : 1;
        var outerTire = sideTires.reduce(function (a, b) { return Math.abs(b.x) > Math.abs(a.x) ? b : a; });

        /* leader line from the rig edge out to the chip pair */
        S.el('line', {
          x1: dir * (Math.abs(outerTire.x) + outerTire.width / 2), y1: axle.y,
          x2: dir * (innerCol - px(4)), y2: axle.y,
          stroke: BODY.line, 'stroke-width': px(0.8), opacity: '0.35', 'stroke-dasharray': px(3) + ' ' + px(3)
        }, g);

        sideTires.forEach(function (p) {
          var col = p.ring === 'outer' ? outerCol : innerCol;
          drawChip(g, p, dir * col, axle.y, ctx, px);
        });
      });

      /* axle label on the left */
      var axleText = fit([
        axle.unit + ' · ' + axle.label + (axle.dual ? ' (dual)' : ' (single)'),
        axle.unit + ' · ' + axle.label,
        axle.shortLabel,
        axle.label
      ]);
      if (axleText) {
        S.text(axleText, {
          x: -labelCol, y: axle.y + px(4), 'text-anchor': 'end',
          'font-size': px(11), fill: '#8ea0b6', 'class': 'anno-text axle-label'
        }, g);
      }
    });

    /* coupling callouts */
    var fifthText = fit(['5th wheel coupling', '5th wheel']);
    if (fifthText) couplingLabel(g, RIG.fifthWheel.y, fifthText, labelCol, px, 1);
    var linkText = fit(['draw-bar link', 'link']);
    if (linkText) couplingLabel(g, (RIG.drawbar.from + RIG.drawbar.to) / 2, linkText, labelCol, px, 1);

    /* unit brackets down the right-hand side, when there is room for them */
    if (freePx < 110) return;
    RIG.units.forEach(function (u) {
      var bx = labelCol + px(120);
      S.el('path', {
        d: 'M ' + (bx - px(8)) + ' ' + (u.from + 200) + ' L ' + bx + ' ' + (u.from + 200) +
           ' L ' + bx + ' ' + (u.to - 200) + ' L ' + (bx - px(8)) + ' ' + (u.to - 200),
        fill: 'none', stroke: '#5c6b80', 'stroke-width': px(1.2)
      }, g);
      var label = S.text(u.label, {
        x: bx + px(16), y: (u.from + u.to) / 2, 'font-size': px(12.5), fill: '#a8b8cc',
        'text-anchor': 'middle', 'class': 'anno-text unit-label', 'font-weight': '600'
      }, g);
      label.setAttribute('transform', 'rotate(90 ' + S.round(bx + px(16)) + ' ' + S.round((u.from + u.to) / 2) + ')');
    });
  }

  function couplingLabel(g, y, str, labelCol, px, dir) {
    S.el('line', {
      x1: dir * (RIG.width / 2 + px(4)), y1: y, x2: dir * (labelCol - px(6)), y2: y,
      stroke: '#5c6b80', 'stroke-width': px(0.8), opacity: '0.5'
    }, g);
    S.text(str, {
      x: dir * labelCol, y: y + px(4), 'font-size': px(10.5), fill: '#7f8fa5',
      'text-anchor': dir < 0 ? 'end' : 'start', 'class': 'anno-text coupling-label'
    }, g);
  }

  function drawChip(g, p, x, y, ctx, px) {
    var st = ctx.statusMap[p.n] || { level: 'grey' };
    var colour = S.statusColour(st.level);
    var selected = ctx.selected === p.n;

    var w = px(26), h = px(19);
    var chip = S.group({
      'class': 'chip' + (selected ? ' is-selected' : '') + (ctx.pulse === p.n ? ' is-pulsing' : ''),
      'data-pos': p.n,
      tabindex: '0',
      role: 'button',
      'aria-label': tireLabel(p, st)
    }, g);

    S.el('rect', {
      x: x - w / 2, y: y - h / 2, width: w, height: h, rx: px(4),
      fill: colour.chip, stroke: selected ? '#ffffff' : 'rgba(0,0,0,0.45)',
      'stroke-width': selected ? px(2) : px(1), 'class': 'chip-body'
    }, chip);

    S.text(String(p.n), {
      x: x, y: y, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-size': px(12), 'font-weight': '700', fill: colour.ink, 'class': 'chip-num'
    }, chip);

    /* generous invisible tap target for phone use */
    S.el('rect', {
      x: x - px(19), y: y - px(15), width: px(38), height: px(30),
      fill: 'transparent', 'class': 'chip-hit'
    }, chip);
  }

  MT.TopDown = { render: render, FOCUS_BOX: FOCUS_BOX };

}(window));
