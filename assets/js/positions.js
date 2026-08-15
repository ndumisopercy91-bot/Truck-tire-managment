/*
 * positions.js — Source data for the Menzele Trading rig.
 *
 * Defines the 26 tire positions and the physical geometry of a
 * 2017 Volvo FMX horse (34-ton GVM class) coupled to a 2-unit
 * side-tipper link combination.
 *
 * Numbering convention (per the Tire Numbering Diagram):
 *   - runs front to back
 *   - on every dual axle: left outer -> left inner -> right inner -> right outer
 *   - positions 1 & 2 are the single front (steer) tires on the horse
 *
 * All dimensions are in millimetres. The model coordinate system is:
 *   x : lateral, negative = LEFT, positive = RIGHT
 *   y : longitudinal, 0 = front bumper of the horse, increasing rearward
 *   z : vertical, 0 = ground
 */
(function (global) {
  'use strict';

  /* ---------------------------------------------------------------- tires */

  var TIRE = {
    driveDiameter: 1076,   // 315/80R22.5 rolling diameter
    driveWidth: 315,
    steerDiameter: 1076,   // 385/65R22.5 on the steer axle
    steerWidth: 385,
    dualSpacing: 375,      // centre-to-centre on a dual fitment
    rimDiameter: 572       // 22.5"
  };

  /* Lateral tire centres */
  var STEER_CENTRE = 1020;
  var DUAL_OUTER = 1075;
  var DUAL_INNER = DUAL_OUTER - TIRE.dualSpacing; // 700

  /* ---------------------------------------------------------------- axles */

  var AXLES = [
    { id: 'H-A1',  unit: 'Horse',     unitId: 'horse', label: 'Front (steer)', shortLabel: 'Steer',   dual: false, y: 1450 },
    { id: 'H-A2',  unit: 'Horse',     unitId: 'horse', label: 'Rear axle 1',   shortLabel: 'Drive 1', dual: true,  y: 5250 },
    { id: 'H-A3',  unit: 'Horse',     unitId: 'horse', label: 'Rear axle 2',   shortLabel: 'Drive 2', dual: true,  y: 6620 },
    { id: 'T1-A1', unit: 'Trailer 1', unitId: 't1',    label: 'Axle 1',        shortLabel: 'T1 A1',   dual: true,  y: 10650 },
    { id: 'T1-A2', unit: 'Trailer 1', unitId: 't1',    label: 'Axle 2',        shortLabel: 'T1 A2',   dual: true,  y: 11960 },
    { id: 'T2-A1', unit: 'Trailer 2', unitId: 't2',    label: 'Axle 1',        shortLabel: 'T2 A1',   dual: true,  y: 19650 },
    { id: 'T2-A2', unit: 'Trailer 2', unitId: 't2',    label: 'Axle 2',        shortLabel: 'T2 A2',   dual: true,  y: 20960 }
  ];

  /* Slot layout per axle type, in numbering order. */
  var SINGLE_SLOTS = [
    { position: 'Left',  side: 'L', dual: false, x: -STEER_CENTRE, ring: 'single' },
    { position: 'Right', side: 'R', dual: false, x:  STEER_CENTRE, ring: 'single' }
  ];

  var DUAL_SLOTS = [
    { position: 'Left outer',  side: 'L', dual: true, x: -DUAL_OUTER, ring: 'outer' },
    { position: 'Left inner',  side: 'L', dual: true, x: -DUAL_INNER, ring: 'inner' },
    { position: 'Right inner', side: 'R', dual: true, x:  DUAL_INNER, ring: 'inner' },
    { position: 'Right outer', side: 'R', dual: true, x:  DUAL_OUTER, ring: 'outer' }
  ];

  /* ------------------------------------------------------- 26 tire records */

  var TIRE_POSITIONS = [];
  (function build() {
    var n = 1;
    AXLES.forEach(function (axle) {
      var slots = axle.dual ? DUAL_SLOTS : SINGLE_SLOTS;
      slots.forEach(function (slot) {
        TIRE_POSITIONS.push({
          n: n++,
          unit: axle.unit,
          unitId: axle.unitId,
          axleId: axle.id,
          axle: axle.label,
          axleShort: axle.shortLabel,
          position: slot.position,
          side: slot.side,
          ring: slot.ring,
          dual: slot.dual,
          x: slot.x,
          y: axle.y,
          diameter: axle.dual ? TIRE.driveDiameter : TIRE.steerDiameter,
          width: axle.dual ? TIRE.driveWidth : TIRE.steerWidth
        });
      });
    });
  }());

  var BY_NUMBER = {};
  TIRE_POSITIONS.forEach(function (p) { BY_NUMBER[p.n] = p; });

  /* --------------------------------------------------------- rig geometry */

  var RIG = {
    tire: TIRE,
    overallLength: 21500,
    width: 2500,

    horse: {
      nose: 0,
      tail: 7350,
      width: 2500,
      cab: { from: 200, to: 2650, width: 2480, roof: 3320, floor: 1080 },
      bumper: { from: 0, to: 220 },
      chassis: { from: 400, to: 7350, width: 900, top: 1130, bottom: 940 },
      tank: { from: 3100, to: 4500 },
      catwalk: { from: 4300, to: 7350 }
    },

    fifthWheel: { y: 5060, radius: 560 },

    trailer1: {
      front: 4200,
      rear: 12650,
      bin: { from: 4350, to: 12100, bottom: 1180, top: 3180, bottomWidth: 2150, topWidth: 2500 },
      chassis: { top: 1180, bottom: 990, width: 1000 }
    },

    drawbar: { from: 12650, to: 13250, width: 260, top: 1010, bottom: 900 },

    trailer2: {
      front: 13250,
      rear: 21500,
      bin: { from: 13400, to: 20950, bottom: 1180, top: 3180, bottomWidth: 2150, topWidth: 2500 },
      chassis: { top: 1180, bottom: 990, width: 1000 }
    },

    units: [
      { id: 'horse', label: 'Horse — Volvo FMX', from: -600, to: 7600 },
      { id: 't1',    label: 'Trailer 1',         from: 4200, to: 12900 },
      { id: 't2',    label: 'Trailer 2',         from: 12900, to: 21900 }
    ]
  };

  /* Number-chip columns used by the top-down view (mirrors the paper diagram). */
  RIG.chipColumns = {
    outer: 3350,
    inner: 2350,
    single: 2350
  };

  global.MT = global.MT || {};
  global.MT.RIG = RIG;
  global.MT.AXLES = AXLES;
  global.MT.TIRE_POSITIONS = TIRE_POSITIONS;
  global.MT.positionByNumber = function (n) { return BY_NUMBER[Number(n)] || null; };
  global.MT.UNIT_IDS = { horse: 'Horse', t1: 'Trailer 1', t2: 'Trailer 2' };

}(window));
