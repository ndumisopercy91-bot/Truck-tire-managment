/*
 * form.js — the replacement-logging dialog.
 *
 * Built for speed: everything except the position is optional and the fields
 * that matter are pre-filled, so a driver can log a fitment in a few taps.
 */
(function (global) {
  'use strict';

  var MT = global.MT = global.MT || {};
  var store = MT.store;
  var util = MT.util;
  var h = MT.ui.h;

  var MAX_PHOTO_EDGE = 900;
  var PHOTO_QUALITY = 0.72;

  var root = null;
  var onClose = null;

  function ensureRoot() {
    if (!root) root = document.getElementById('modal-root');
    return root;
  }

  function close() {
    var node = ensureRoot();
    node.innerHTML = '';
    node.classList.remove('is-open');
    document.body.classList.remove('modal-open');
    if (onClose) { var fn = onClose; onClose = null; fn(); }
  }

  function open(opts) {
    var node = ensureRoot();
    node.innerHTML = '';
    node.classList.add('is-open');
    document.body.classList.add('modal-open');
    node.appendChild(opts.dialog);
    onClose = opts.onClose || null;

    var first = opts.dialog.querySelector('[data-autofocus]') || opts.dialog.querySelector('input,select,textarea,button');
    if (first) setTimeout(function () { first.focus(); }, 30);
  }

  function backdropDialog(title, subtitle, bodyNodes, footerNodes) {
    var dialog = h('div', { 'class': 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
      h('div', { 'class': 'modal-head' }, [
        h('div', {}, [
          h('h2', { text: title }),
          subtitle ? h('p', { 'class': 'muted', text: subtitle }) : null
        ]),
        h('button', { 'class': 'icon-btn', 'aria-label': 'Close', text: '✕', onclick: close })
      ]),
      h('div', { 'class': 'modal-body' }, bodyNodes),
      h('div', { 'class': 'modal-foot' }, footerNodes)
    ]);
    var backdrop = h('div', { 'class': 'modal-backdrop', onclick: function (ev) { if (ev.target === backdrop) close(); } }, [dialog]);
    return { backdrop: backdrop, dialog: dialog };
  }

  /* ---------------------------------------------------------------- form */

  /*
   * opts: { position, eventId, onSaved }
   * With an eventId the dialog edits that entry; otherwise it creates one.
   */
  function openReplacementForm(opts) {
    opts = opts || {};
    var editing = opts.eventId ? store.allEvents().filter(function (e) { return e.id === opts.eventId; })[0] : null;
    var position = editing ? editing.position : opts.position;
    var settings = store.settings();
    var sugg = store.suggestions();
    var lastEvent = store.allEvents().sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; })[0];

    var photoData = editing ? editing.photo : null;

    /* --- position ------------------------------------------------------ */
    var posSelect = h('select', { id: 'f-position', required: 'required' },
      MT.TIRE_POSITIONS.map(function (p) {
        return h('option', {
          value: String(p.n),
          text: '#' + p.n + ' — ' + p.unit + ' · ' + p.axle + ' · ' + p.position,
          selected: Number(position) === p.n ? 'selected' : null
        });
      })
    );

    /* --- other fields --------------------------------------------------- */
    var dateInput = h('input', {
      type: 'date', id: 'f-date', required: 'required',
      value: editing ? editing.dateFitted : util.todayISO(),
      max: util.todayISO()
    });

    var brandInput = h('input', {
      type: 'text', id: 'f-brand', list: 'brand-list', placeholder: 'e.g. Bridgestone R150',
      value: editing ? editing.brand : (lastEvent ? lastEvent.brand : '')
    });

    var odoInput = h('input', {
      type: 'number', id: 'f-odo', min: '0', step: '1', inputmode: 'numeric',
      placeholder: 'km on the rig',
      value: editing ? (editing.odometer != null ? editing.odometer : '') : (settings.odometer || '')
    });

    var reasonSelect = h('select', { id: 'f-reason-type' }, store.REASONS.map(function (r) {
      return h('option', { value: r, text: r, selected: editing && editing.reasonType === r ? 'selected' : null });
    }));

    var reasonInput = h('input', {
      type: 'text', id: 'f-reason', placeholder: 'optional detail',
      value: editing ? editing.reason : ''
    });

    var fitterInput = h('input', {
      type: 'text', id: 'f-fitter', list: 'fitter-list', placeholder: 'driver or mechanic',
      value: editing ? editing.fittedBy : (lastEvent ? lastEvent.fittedBy : '')
    });

    var costInput = h('input', {
      type: 'number', id: 'f-cost', min: '0', step: '0.01', inputmode: 'decimal',
      placeholder: 'optional', value: editing && editing.cost != null ? editing.cost : ''
    });

    var notesInput = h('textarea', { id: 'f-notes', rows: '2', placeholder: 'optional' });
    notesInput.value = editing ? editing.notes : '';

    var photoInput = h('input', { type: 'file', id: 'f-photo', accept: 'image/*', capture: 'environment' });
    var photoPreview = h('div', { 'class': 'photo-preview' });

    function paintPhoto() {
      photoPreview.innerHTML = '';
      if (!photoData) return;
      photoPreview.appendChild(h('img', { src: photoData, alt: 'Selected tire photo' }));
      photoPreview.appendChild(h('button', {
        type: 'button', 'class': 'link-btn link-danger', text: 'Remove photo',
        onclick: function () { photoData = null; photoInput.value = ''; paintPhoto(); }
      }));
    }

    photoInput.addEventListener('change', function () {
      var file = photoInput.files && photoInput.files[0];
      if (!file) return;
      downscale(file, function (err, dataUrl) {
        if (err) { setError('Could not read that image.'); return; }
        photoData = dataUrl;
        paintPhoto();
      });
    });
    paintPhoto();

    var errorBox = h('p', { 'class': 'form-error', hidden: 'hidden' });
    function setError(msg) {
      errorBox.textContent = msg || '';
      if (msg) errorBox.removeAttribute('hidden'); else errorBox.setAttribute('hidden', 'hidden');
    }

    var odoHint = h('small', { text: settings.odometer ? 'Rig odometer is ' + util.fmtInt(settings.odometer) + ' km' : 'Tip: set the rig odometer in Settings' });

    var body = [
      h('datalist', { id: 'brand-list' }, sugg.brands.map(function (b) { return h('option', { value: b }); })),
      h('datalist', { id: 'fitter-list' }, sugg.fitters.map(function (b) { return h('option', { value: b }); })),
      errorBox,
      h('label', { 'class': 'field' }, [h('span', { text: 'Tire position' }), posSelect]),
      h('div', { 'class': 'field-grid two' }, [
        h('label', { 'class': 'field' }, [h('span', { text: 'Date fitted' }), dateInput]),
        h('label', { 'class': 'field' }, [h('span', { text: 'Odometer (km)' }), odoInput, odoHint])
      ]),
      h('label', { 'class': 'field' }, [h('span', { text: 'Brand / tire type' }), brandInput]),
      h('div', { 'class': 'field-grid two' }, [
        h('label', { 'class': 'field' }, [h('span', { text: 'Reason' }), reasonSelect]),
        h('label', { 'class': 'field' }, [h('span', { text: 'Detail' }), reasonInput])
      ]),
      h('div', { 'class': 'field-grid two' }, [
        h('label', { 'class': 'field' }, [h('span', { text: 'Fitted by' }), fitterInput]),
        h('label', { 'class': 'field' }, [h('span', { text: 'Cost' }), costInput])
      ]),
      h('label', { 'class': 'field' }, [h('span', { text: 'Notes' }), notesInput]),
      h('details', { 'class': 'photo-block' }, [
        h('summary', { text: 'Add a photo (optional)' }),
        photoInput,
        photoPreview,
        h('small', { text: 'Photos are shrunk before saving, but they still use device storage. Keep them for damage claims.' })
      ])
    ];

    var saveBtn = h('button', { 'class': 'btn btn-primary', text: editing ? 'Save changes' : 'Save replacement' });
    var footer = [
      h('button', { 'class': 'btn btn-ghost', text: 'Cancel', onclick: close }),
      saveBtn
    ];

    var built = backdropDialog(
      editing ? 'Edit log entry' : 'Log a tire replacement',
      editing ? null : 'Fill in what you know — only the position and date are required.',
      body, footer
    );

    function submit() {
      setError('');
      var payload = {
        position: Number(posSelect.value),
        dateFitted: dateInput.value,
        brand: brandInput.value.trim(),
        odometer: odoInput.value === '' ? null : Number(odoInput.value),
        reasonType: reasonSelect.value,
        reason: reasonInput.value.trim(),
        fittedBy: fitterInput.value.trim(),
        cost: costInput.value === '' ? null : Number(costInput.value),
        notes: notesInput.value.trim(),
        photo: photoData
      };
      if (!payload.dateFitted) { setError('Pick the date the tire was fitted.'); dateInput.focus(); return; }
      if (payload.dateFitted > util.todayISO()) { setError('The fitting date cannot be in the future.'); dateInput.focus(); return; }
      if (payload.odometer != null && (!isFinite(payload.odometer) || payload.odometer < 0)) {
        setError('Odometer must be a positive number of kilometres.'); odoInput.focus(); return;
      }

      var res = editing ? store.updateEvent(editing.id, payload) : store.addEvent(payload);
      if (!res.ok) { setError(res.error || 'Could not save.'); return; }

      /* Keep the rig odometer honest: a fitment at a higher reading moves it. */
      if (payload.odometer != null && payload.odometer > store.settings().odometer) {
        store.updateSettings({ odometer: payload.odometer });
      }

      var saved = payload.position;
      close();
      if (opts.onSaved) opts.onSaved(saved);
    }

    saveBtn.addEventListener('click', submit);
    built.dialog.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && ev.target.tagName !== 'TEXTAREA') { ev.preventDefault(); submit(); }
      if (ev.key === 'Escape') close();
    });
    posSelect.setAttribute('data-autofocus', 'true');

    open({ dialog: built.backdrop });
  }

  /* ------------------------------------------------------------ confirm */

  function confirmDialog(opts) {
    var built = backdropDialog(opts.title, opts.message, [], [
      h('button', { 'class': 'btn btn-ghost', text: opts.cancelText || 'Cancel', onclick: close }),
      h('button', {
        'class': 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary'),
        text: opts.confirmText || 'Confirm',
        onclick: function () { close(); if (opts.onConfirm) opts.onConfirm(); }
      })
    ]);
    built.dialog.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') close(); });
    open({ dialog: built.backdrop });
  }

  /* --------------------------------------------------------- flag dialog */

  function flagDialog(position, onDone) {
    var current = store.getFlag(position);
    var levelSel = h('select', {}, [
      h('option', { value: 'watch', text: 'Watch — keep an eye on it', selected: current && current.level === 'watch' ? 'selected' : null }),
      h('option', { value: 'issue', text: 'Issue — needs attention now', selected: !current || current.level === 'issue' ? 'selected' : null })
    ]);
    var noteInput = h('input', { type: 'text', placeholder: 'e.g. sidewall cut on the inner wall', value: current ? current.note : '' });

    var built = backdropDialog('Flag tire #' + position, 'A flagged tire shows red (issue) or amber (watch) on the rig until it is cleared.', [
      h('label', { 'class': 'field' }, [h('span', { text: 'Level' }), levelSel]),
      h('label', { 'class': 'field' }, [h('span', { text: 'Note' }), noteInput])
    ], [
      h('button', { 'class': 'btn btn-ghost', text: 'Cancel', onclick: close }),
      h('button', {
        'class': 'btn btn-primary', text: 'Flag tire',
        onclick: function () {
          store.setFlag(position, levelSel.value, noteInput.value.trim());
          close();
          if (onDone) onDone();
        }
      })
    ]);
    built.dialog.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') close(); });
    open({ dialog: built.backdrop });
  }

  /* ------------------------------------------------------------- photos */

  function downscale(file, cb) {
    var reader = new FileReader();
    reader.onerror = function () { cb(new Error('read')); };
    reader.onload = function () {
      var img = new Image();
      img.onerror = function () { cb(new Error('decode')); };
      img.onload = function () {
        var scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(img.width, img.height));
        var w = Math.round(img.width * scale), hh = Math.round(img.height * scale);
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = hh;
        canvas.getContext('2d').drawImage(img, 0, 0, w, hh);
        try {
          cb(null, canvas.toDataURL('image/jpeg', PHOTO_QUALITY));
        } catch (err) {
          cb(err);
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  MT.form = {
    open: openReplacementForm,
    confirm: confirmDialog,
    flag: flagDialog,
    close: close
  };

}(window));
