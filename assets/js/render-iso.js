/*
 * render-iso.js — 3/4 perspective ("showroom") rendering of the same rig.
 *
 * Uses an isometric projection of the identical model geometry, viewed from
 * above and ahead of the driver's side, so the horse, both side-tipper bins
 * and all 26 tires read as one vehicle. Every tire stays individually
 * clickable; far-side tires carry a floating number chip above the body so
 * nothing is hidden behind the trailers.
 */
(function (global) {
  'use strict';

  var MT = global.MT = global.MT || {};
  var S = MT.svg;
  var RIG = MT.RIG;

  var COS30 = Math.cos(Math.PI / 6);

  /* Model point -> screen point. Front of the rig falls to the lower left. */
  function project(x, y, z) {
    return [(y - x) * COS30, -(x + y) * 0.5 - z];
  }

  function pt(p) { return project(p[0], p[1], p[2]); }

  /* Explicit surface colours: top / left flank / front face. */
  var C = {
    cabTop: '#61738c', cabSide: '#425064', cabFront: '#4c5c73',
    binTop: '#2a3542', binSide: '#42536a', binFront: '#4a5c74',
    railTop: '#3f4b5b', railSide: '#28313d', railFront: '#333e4c',
    plateTop: '#55647a', plateSide: '#3a4657', plateFront: '#445163',
    tankTop: '#7d8b9d', tankSide: '#59677a', tankFront: '#6a7889',
    ground: '#141a22', shadow: 'rgba(0,0,0,0.42)',
    line: '#8ea0b6'
  };

  function render(svg, ctx) {
    S.clear(svg);

    /* Work out the drawing extent by projecting the rig's bounding volume. */
    var yRange = focusRange(ctx.focus);
    var corners = [];
    [-1500, 1500].forEach(function (x) {
      [yRange[0], yRange[1]].forEach(function (y) {
        [0, 6100].forEach(function (z) { corners.push(project(x, y, z)); });
      });
    });
    var xs = corners.map(function (c) { return c[0]; });
    var ys = corners.map(function (c) { return c[1]; });
    var pad = 1400;
    var box = {
      x0: Math.min.apply(null, xs) - pad, x1: Math.max.apply(null, xs) + pad,
      y0: Math.min.apply(null, ys) - pad * 1.6, y1: Math.max.apply(null, ys) + pad
    };

    var baseScale = Math.min(ctx.width / (box.x1 - box.x0), ctx.height / (box.y1 - box.y0));
    var scale = baseScale * (ctx.zoom || 1);
    var vbw = ctx.width / scale, vbh = ctx.height / scale;
    var cx = (box.x0 + box.x1) / 2 + (ctx.pan ? ctx.pan.x : 0);
    var cy = (box.y0 + box.y1) / 2 + (ctx.pan ? ctx.pan.y : 0);
    var vb = [cx - vbw / 2, cy - vbh / 2, vbw, vbh];

    svg.setAttribute('viewBox', vb.map(S.round).join(' '));
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    function px(n) { return n / scale; }

    defs(svg);
    var root = S.group({ 'class': 'iso-root' }, svg);

    drawGround(root);

    /* Painter's algorithm: farther (larger x + y) is drawn first. */
    var queue = [];
    function push(depth, fn) { queue.push({ depth: depth, fn: fn }); }

    buildBodies(push);
    MT.TIRE_POSITIONS.forEach(function (p, i) {
      push(p.x + p.y, function (g) { drawTire(g, p, ctx, px, i); });
    });

    queue.sort(function (a, b) { return b.depth - a.depth; });
    var scene = S.group({ 'class': 'iso-scene' }, root);
    queue.forEach(function (item) { item.fn(scene); });

    drawChips(root, ctx, px);
    drawAnnotations(root, ctx, px);

    return { scale: scale, viewBox: vb, px: px };
  }

  function focusRange(focus) {
    switch (focus) {
      case 'horse': return [-900, 8100];
      case 't1': return [3800, 13400];
      case 't2': return [12500, 22100];
      default: return [-900, 22100];
    }
  }

  function defs(svg) {
    var d = S.el('defs', null, svg);
    var g = S.el('linearGradient', { id: 'iso-bin-side', x1: '0', y1: '0', x2: '0', y2: '1' }, d);
    S.el('stop', { offset: '0', 'stop-color': '#54677f' }, g);
    S.el('stop', { offset: '1', 'stop-color': '#33404f' }, g);
    var t = S.el('linearGradient', { id: 'iso-cab-side', x1: '0', y1: '0', x2: '0', y2: '1' }, d);
    S.el('stop', { offset: '0', 'stop-color': '#516280' }, t);
    S.el('stop', { offset: '1', 'stop-color': '#333e4e' }, t);
  }

  function drawGround(root) {
    var g = S.group({ 'class': 'iso-ground' }, root);
    [
      [RIG.horse.nose - 200, RIG.horse.tail],
      [RIG.trailer1.front, RIG.trailer1.rear],
      [RIG.trailer2.front, RIG.trailer2.rear]
    ].forEach(function (span) {
      quad(g, [
        [-1400, span[0], 0], [1400, span[0], 0], [1400, span[1], 0], [-1400, span[1], 0]
      ], C.shadow, { opacity: 0.55 });
    });
  }

  /* ------------------------------------------------------------ primitives */

  function quad(g, pts3, fill, opts) {
    var node = S.el('polygon', {
      points: S.polyPoints(pts3.map(pt)),
      fill: fill,
      stroke: (opts && opts.stroke) || 'rgba(8,11,15,0.55)',
      'stroke-width': (opts && opts.strokeWidth) || 14,
      'stroke-linejoin': 'round'
    }, g);
    if (opts && opts.opacity != null) node.setAttribute('opacity', opts.opacity);
    if (opts && opts.className) node.setAttribute('class', opts.className);
    return node;
  }

  /*
   * A box or tapered prism. Only the three faces that can be seen from this
   * camera are emitted: the top, the left flank and the front end.
   */
  function prism(g, spec) {
    var b = spec.bottom, t = spec.top;
    var z0 = spec.z0, z1 = spec.z1;
    /* left flank (x = min) */
    quad(g, [
      [b.x0, b.y0, z0], [b.x0, b.y1, z0], [t.x0, t.y1, z1], [t.x0, t.y0, z1]
    ], spec.side);
    /* front end (y = min) */
    quad(g, [
      [b.x0, b.y0, z0], [b.x1, b.y0, z0], [t.x1, t.y0, z1], [t.x0, t.y0, z1]
    ], spec.front);
    /* top */
    quad(g, [
      [t.x0, t.y0, z1], [t.x1, t.y0, z1], [t.x1, t.y1, z1], [t.x0, t.y1, z1]
    ], spec.top_);
  }

  function box(g, x0, x1, y0, y1, z0, z1, colours) {
    prism(g, {
      bottom: { x0: x0, x1: x1, y0: y0, y1: y1 },
      top: { x0: x0, x1: x1, y0: y0, y1: y1 },
      z0: z0, z1: z1,
      side: colours.side, front: colours.front, top_: colours.top
    });
  }

  /* --------------------------------------------------------------- bodies */

  function buildBodies(push) {
    var h = RIG.horse;

    /* horse chassis rails */
    [[-510, -380], [380, 510]].forEach(function (r) {
      push((r[0] + r[1]) / 2 + (h.chassis.from + h.chassis.to) / 2, function (g) {
        box(g, r[0], r[1], h.chassis.from, h.chassis.to, h.chassis.bottom, h.chassis.top,
            { top: C.railTop, side: C.railSide, front: C.railFront });
      });
    });

    /* fuel tank on the left flank */
    push(-1000 + (h.tank.from + h.tank.to) / 2, function (g) {
      box(g, -1230, -790, h.tank.from, h.tank.to, 620, 1180,
          { top: C.tankTop, side: C.tankSide, front: C.tankFront });
    });

    /* catwalk deck */
    push(0 + (h.catwalk.from + h.tail) / 2, function (g) {
      box(g, -950, 950, h.catwalk.from, h.tail - 120, 1130, 1190,
          { top: '#37424f', side: '#242c37', front: '#2e3844' });
    });

    /* fifth wheel plate and coupling */
    push(RIG.fifthWheel.y, function (g) {
      box(g, -700, 700, RIG.fifthWheel.y - 640, RIG.fifthWheel.y + 660, 1190, 1300,
          { top: C.plateTop, side: C.plateSide, front: C.plateFront });
    });

    /* cab */
    var cab = h.cab;
    push((cab.from + cab.to) / 2, function (g) {
      /* body */
      box(g, -1240, 1240, cab.from, cab.to, cab.floor, cab.roof,
          { top: C.cabTop, side: 'url(#iso-cab-side)', front: C.cabFront });
      /* windscreen on the front face */
      quad(g, [
        [-1160, cab.from - 10, 2180], [1160, cab.from - 10, 2180],
        [1160, cab.from - 10, 3080], [-1160, cab.from - 10, 3080]
      ], '#22313f', { stroke: '#182029', strokeWidth: 18 });
      quad(g, [
        [-1160, cab.from - 12, 2180], [1160, cab.from - 12, 2180],
        [1160, cab.from - 12, 2620], [-1160, cab.from - 12, 2620]
      ], '#9fc2de', { opacity: 0.35, stroke: 'none' });
      /* side window */
      quad(g, [
        [-1250, cab.from + 900, 2180], [-1250, cab.to - 250, 2180],
        [-1250, cab.to - 250, 3020], [-1250, cab.from + 900, 3020]
      ], '#26333f', { stroke: '#182029', strokeWidth: 16 });
      /* grille and bumper */
      quad(g, [
        [-1180, cab.from - 14, 1350], [1180, cab.from - 14, 1350],
        [1180, cab.from - 14, 2080], [-1180, cab.from - 14, 2080]
      ], '#37424f', { stroke: '#1a212a', strokeWidth: 16 });
      box(g, -1250, 1250, RIG.horse.bumper.from, RIG.horse.bumper.to, 700, 1250,
          { top: '#4d5c72', side: '#33404f', front: '#3f4c5e' });
      /* headlamps */
      quad(g, [
        [-1150, RIG.horse.bumper.from - 12, 1000], [-720, RIG.horse.bumper.from - 12, 1000],
        [-720, RIG.horse.bumper.from - 12, 1230], [-1150, RIG.horse.bumper.from - 12, 1230]
      ], '#e6edf4', { opacity: 0.8, stroke: 'none' });
      quad(g, [
        [720, RIG.horse.bumper.from - 12, 1000], [1150, RIG.horse.bumper.from - 12, 1000],
        [1150, RIG.horse.bumper.from - 12, 1230], [720, RIG.horse.bumper.from - 12, 1230]
      ], '#e6edf4', { opacity: 0.8, stroke: 'none' });
      /* mirror arm on the near side */
      box(g, -1560, -1400, cab.from + 520, cab.from + 940, 2350, 3050,
          { top: '#4d5c72', side: '#2f3a48', front: '#3c4757' });
      /* exhaust stack behind the cab */
      box(g, 780, 1020, cab.to + 140, cab.to + 380, 1180, 3350,
          { top: '#94a2b3', side: '#5d6b7c', front: '#6f7d8e' });
    });

    /* trailers */
    [
      { t: RIG.trailer1, id: 'T1' },
      { t: RIG.trailer2, id: 'T2' }
    ].forEach(function (item) {
      var t = item.t, bin = t.bin;

      [[-570, -430], [430, 570]].forEach(function (r) {
        push((r[0] + r[1]) / 2 + (t.front + t.rear) / 2, function (g) {
          box(g, r[0], r[1], t.front, t.rear, t.chassis.bottom, t.chassis.top,
              { top: C.railTop, side: C.railSide, front: C.railFront });
        });
      });

      push((bin.from + bin.to) / 2, function (g) {
        /* tapered side-tipper body: narrow at the floor, full width at the rail */
        prism(g, {
          bottom: { x0: -bin.bottomWidth / 2, x1: bin.bottomWidth / 2, y0: bin.from + 60, y1: bin.to - 60 },
          top: { x0: -bin.topWidth / 2, x1: bin.topWidth / 2, y0: bin.from, y1: bin.to },
          z0: bin.bottom, z1: bin.top,
          side: 'url(#iso-bin-side)', front: C.binFront, top_: C.binTop
        });
        /* open top: load floor sunk below the rail */
        quad(g, [
          [-bin.topWidth / 2 + 190, bin.from + 190, bin.top - 260],
          [bin.topWidth / 2 - 190, bin.from + 190, bin.top - 260],
          [bin.topWidth / 2 - 190, bin.to - 190, bin.top - 260],
          [-bin.topWidth / 2 + 190, bin.to - 190, bin.top - 260]
        ], '#1b232c', { stroke: '#12181f', strokeWidth: 16 });
        /* flank ribs */
        for (var y = bin.from + 900; y < bin.to - 300; y += 900) {
          quad(g, [
            [-bin.bottomWidth / 2 - 10, y - 45, bin.bottom],
            [-bin.bottomWidth / 2 - 10, y + 45, bin.bottom],
            [-bin.topWidth / 2 - 10, y + 45, bin.top],
            [-bin.topWidth / 2 - 10, y - 45, bin.top]
          ], '#6b7f99', { opacity: 0.75, stroke: 'none' });
        }
      });

      /* bogie beam */
      var axles = MT.AXLES.filter(function (a) { return a.unit === (item.id === 'T1' ? 'Trailer 1' : 'Trailer 2'); });
      if (axles.length) {
        push((axles[0].y + axles[axles.length - 1].y) / 2, function (g) {
          box(g, -1150, 1150, axles[0].y - 200, axles[axles.length - 1].y + 200, 640, 860,
              { top: '#2c3644', side: '#1e2731', front: '#262f3b' });
        });
      }

      if (item.id === 'T1') {
        push(6500, function (g) {
          [[-1060, -900], [900, 1060]].forEach(function (r) {
            box(g, r[0], r[1], 6350, 6510, 0, 990, { top: '#7d8b9d', side: '#4f5d6e', front: '#5d6b7c' });
          });
        });
      }
    });

    /* draw-bar link between the trailers */
    push((RIG.drawbar.from + RIG.drawbar.to) / 2, function (g) {
      box(g, -RIG.drawbar.width / 2, RIG.drawbar.width / 2, RIG.drawbar.from - 150, RIG.drawbar.to + 150,
          RIG.drawbar.bottom, RIG.drawbar.top,
          { top: '#6b7a8c', side: '#44505f', front: '#515e6f' });
    });
  }

  /* ---------------------------------------------------------------- tires */

  function circlePoints(cy, cz, r, steps) {
    var pts = [];
    for (var i = 0; i < steps; i++) {
      var a = (i / steps) * Math.PI * 2;
      pts.push([cy + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
    return pts;
  }

  function drawTire(scene, p, ctx, px, index) {
    var st = ctx.statusMap[p.n] || { level: 'grey' };
    var colour = S.statusColour(st.level);
    var selected = ctx.selected === p.n;

    var g = S.group({
      'class': 'tire' + (selected ? ' is-selected' : '') + (ctx.pulse === p.n ? ' is-pulsing' : ''),
      'data-pos': p.n,
      'data-level': st.level,
      tabindex: '0',
      role: 'button',
      'aria-label': 'Tire ' + p.n + ', ' + p.unit + ' ' + p.axle + ' ' + p.position
    }, scene);

    if (ctx.animate) g.style.animationDelay = (index * 18) + 'ms';

    var r = p.diameter / 2;
    var xNear = p.x - p.width / 2;   /* smaller x is nearer the camera */
    var xFar = p.x + p.width / 2;
    var steps = 30;
    var circle = circlePoints(p.y, r, r, steps);

    var near = circle.map(function (c) { return project(xNear, c[0], c[1]); });
    var far = circle.map(function (c) { return project(xFar, c[0], c[1]); });

    /* far sidewall */
    S.el('polygon', { points: S.polyPoints(far), fill: colour.deep, stroke: '#0b0f14', 'stroke-width': 14 }, g);

    /* tread band, rear segments first so the near silhouette sits on top */
    var segs = [];
    for (var i = 0; i < steps; i++) {
      var j = (i + 1) % steps;
      segs.push({ y: (circle[i][0] + circle[j][0]) / 2, i: i, j: j });
    }
    segs.sort(function (a, b) { return b.y - a.y; });
    segs.forEach(function (s, k) {
      S.el('polygon', {
        points: S.polyPoints([near[s.i], near[s.j], far[s.j], far[s.i]]),
        fill: k % 3 === 0 ? colour.deep : colour.rubber,
        stroke: 'none'
      }, g);
    });

    /* near sidewall + rim */
    S.el('polygon', {
      points: S.polyPoints(near), fill: colour.rubber, stroke: '#0b0f14', 'stroke-width': 16,
      'class': 'tire-body'
    }, g);
    var rimPts = circlePoints(p.y, r, RIG.tire.rimDiameter / 2, steps)
      .map(function (c) { return project(xNear - 12, c[0], c[1]); });
    S.el('polygon', { points: S.polyPoints(rimPts), fill: '#8b98a8', stroke: '#3d4655', 'stroke-width': 14 }, g);
    var hubPts = circlePoints(p.y, r, 150, 16).map(function (c) { return project(xNear - 20, c[0], c[1]); });
    S.el('polygon', { points: S.polyPoints(hubPts), fill: '#5a6675' }, g);

    /* status ring on the sidewall keeps the colour readable head-on */
    var ringPts = circlePoints(p.y, r, r * 0.82, steps)
      .map(function (c) { return project(xNear - 6, c[0], c[1]); });
    S.el('polygon', {
      points: S.polyPoints(ringPts), fill: 'none', stroke: colour.chip,
      'stroke-width': Math.max(30, px(2)), opacity: '0.9'
    }, g);

    /* hit area covering the whole wheel */
    S.el('polygon', { points: S.polyPoints(near.concat(far.slice().reverse())), fill: 'transparent', 'class': 'tire-hit' }, g);
  }

  /* ---------------------------------------------------------------- chips */

  function drawChips(root, ctx, px) {
    var g = S.group({ 'class': 'annotations' }, root);

    MT.AXLES.forEach(function (axle) {
      ['L', 'R'].forEach(function (side) {
        var tires = MT.TIRE_POSITIONS.filter(function (p) { return p.axleId === axle.id && p.side === side; });
        if (!tires.length) return;

        var near = side === 'L';
        /* Height of whatever bodywork sits over this axle, so far-side chips
           clear it without floating away from the rig. */
        var bodyTop = axle.unitId === 'horse' ? RIG.horse.cab.roof : RIG.trailer1.bin.top;

        /* Near-side chips hang below the wheels; far-side chips float above
           the body so no tire is ever hidden behind a trailer. */
        var anchorModel = near
          ? project(tires[0].x, axle.y, -900)
          : project(tires[0].x, axle.y, bodyTop + 1100);
        var ax = anchorModel[0] + (near ? -px(26) : px(4));
        var ay = anchorModel[1] + (near ? px(26) : -px(10));

        var ordered = tires.slice().sort(function (a, b) { return Math.abs(b.x) - Math.abs(a.x); });
        var spacing = px(30);
        var startX = ax - ((ordered.length - 1) * spacing) / 2;

        var tip = project(tires[0].x, axle.y, near ? 0 : bodyTop);
        S.el('line', {
          x1: ax, y1: ay + (near ? -px(11) : px(11)), x2: tip[0], y2: tip[1],
          stroke: C.line, 'stroke-width': px(0.8), opacity: '0.35',
          'stroke-dasharray': px(3) + ' ' + px(3)
        }, g);

        ordered.forEach(function (p, i) {
          chip(g, p, startX + i * spacing, ay, ctx, px);
        });
      });
    });
  }

  function chip(g, p, x, y, ctx, px) {
    var st = ctx.statusMap[p.n] || { level: 'grey' };
    var colour = S.statusColour(st.level);
    var selected = ctx.selected === p.n;
    var w = px(26), h = px(19);

    var node = S.group({
      'class': 'chip' + (selected ? ' is-selected' : '') + (ctx.pulse === p.n ? ' is-pulsing' : ''),
      'data-pos': p.n, tabindex: '0', role: 'button',
      'aria-label': 'Tire ' + p.n + ' ' + p.unit + ' ' + p.position
    }, g);

    S.el('rect', {
      x: x - w / 2, y: y - h / 2, width: w, height: h, rx: px(4),
      fill: colour.chip, stroke: selected ? '#ffffff' : 'rgba(0,0,0,0.45)',
      'stroke-width': selected ? px(2) : px(1), 'class': 'chip-body'
    }, node);
    S.text(String(p.n), {
      x: x, y: y, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-size': px(12), 'font-weight': '700', fill: colour.ink, 'class': 'chip-num'
    }, node);
    S.el('rect', { x: x - px(17), y: y - px(14), width: px(34), height: px(28), fill: 'transparent', 'class': 'chip-hit' }, node);
  }

  function drawAnnotations(root, ctx, px) {
    var g = S.group({ 'class': 'annotations' }, root);

    /* direction of travel: toward the front of the rig (lower left) */
    var a = project(0, -400, 3600);
    var b = project(0, -2200, 3600);
    S.el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: C.line, 'stroke-width': px(2) }, g);
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len, uy = dy / len;
    S.el('polygon', {
      points: S.polyPoints([
        [b[0] + ux * px(9), b[1] + uy * px(9)],
        [b[0] - uy * px(5), b[1] + ux * px(5)],
        [b[0] + uy * px(5), b[1] - ux * px(5)]
      ]),
      fill: C.line
    }, g);
    S.text('Direction of travel', {
      x: b[0] - px(6), y: b[1] - px(14), 'font-size': px(12), fill: C.line,
      'text-anchor': 'middle', 'class': 'anno-text'
    }, g);

    RIG.units.forEach(function (u) {
      /* clear of the far-side number chips, which top out around z = 4400 */
      var c = project(-1500, (u.from + u.to) / 2, 5800);
      S.text(u.label, {
        x: c[0] - px(10), y: c[1], 'font-size': px(12.5), fill: '#a8b8cc',
        'text-anchor': 'end', 'font-weight': '600', 'class': 'anno-text unit-label'
      }, g);
    });
  }

  MT.Iso = { render: render, project: project };

}(window));
