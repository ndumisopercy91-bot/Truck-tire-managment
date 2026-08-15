/*
 * svgutil.js — small helpers shared by the two rig renderers.
 */
(function (global) {
  'use strict';

  var MT = global.MT = global.MT || {};
  var NS = 'http://www.w3.org/2000/svg';

  function el(name, attrs, parent) {
    var node = document.createElementNS(NS, name);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (attrs[k] == null) return;
        node.setAttribute(k, attrs[k]);
      });
    }
    if (parent) parent.appendChild(node);
    return node;
  }

  function group(attrs, parent) { return el('g', attrs, parent); }

  function text(str, attrs, parent) {
    var node = el('text', attrs, parent);
    node.textContent = str;
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function round(n) { return Math.round(n * 100) / 100; }

  function polyPoints(pts) {
    return pts.map(function (p) { return round(p[0]) + ',' + round(p[1]); }).join(' ');
  }

  /*
   * Status palette. Chosen to stay clear of the vehicle's own steel-blue /
   * graphite colouring so the four states read unambiguously at any zoom.
   */
  var STATUS = {
    green: { name: 'Good',              chip: '#22c55e', rubber: '#1f8f63', deep: '#12563c', ink: '#04160e' },
    amber: { name: 'Due soon',          chip: '#f59e0b', rubber: '#c8891a', deep: '#7d550c', ink: '#1c1204' },
    red:   { name: 'Overdue / flagged', chip: '#ef4444', rubber: '#c23b3b', deep: '#7a2323', ink: '#1c0808' },
    grey:  { name: 'No data',           chip: '#94a3b8', rubber: '#59616e', deep: '#3a4049', ink: '#0d1015' }
  };

  function statusColour(level) { return STATUS[level] || STATUS.grey; }

  MT.svg = {
    NS: NS,
    el: el,
    group: group,
    text: text,
    clear: clear,
    round: round,
    polyPoints: polyPoints,
    STATUS: STATUS,
    statusColour: statusColour
  };

}(window));
