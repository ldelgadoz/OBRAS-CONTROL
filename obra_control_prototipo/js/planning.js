/* OBRA CONTROL · lógica de planning.
 *
 * Modelo (cada actividad lleva tres capas separadas):
 *   - LÍNEA BASE:  baseStart / baseEnd  -> la fecha con la que la actividad entró en el plan. No se modifica nunca.
 *   - PLAN ACTUAL: start / end          -> cambia solo al confirmar una reimportación o al editar a mano (queda en history).
 *   - SEGUIMIENTO: actualStart / actualEnd / progress / status / notes -> solo lo modifica el usuario. Una importación NUNCA lo toca.
 * Cada importación confirmada crea una versión (planVersions) con foto del plan y la lista de cambios aplicados. */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = factory(isNode ? require('./util.js') : root.OC.util);
  if (isNode) module.exports = api;
  else { root.OC = root.OC || {}; root.OC.planning = api; }
})(typeof self !== 'undefined' ? self : this, function (U) {
  'use strict';

  function byOrder(a, b) { return (a.order || 0) - (b.order || 0); }
  function projectActs(db, projectId) { return db.activities.filter(function (a) { return a.projectId === projectId; }).sort(byOrder); }
  function isChapter(a) { return a.kind === 'chapter'; }
  function leaves(acts) { return acts.filter(function (a) { return a.kind !== 'chapter' && !a.removedFromPlan; }); }
  function actById(acts) { var m = {}; acts.forEach(function (a) { m[a.id] = a; }); return m; }
  function nn(s) { return U.normText(s); }

  function tokens(s) { return nn(s).split(' ').filter(function (t) { return t.length >= 3; }); }
  /* Parecido entre dos descripciones (0..1): palabras en común sobre palabras totales. */
  function similarity(a, b) {
    var A = tokens(a), B = tokens(b);
    if (!A.length || !B.length) return 0;
    var setB = {}; B.forEach(function (t) { setB[t] = true; });
    var inter = 0, union = {}; A.forEach(function (t) { union[t] = true; if (setB[t]) inter++; }); B.forEach(function (t) { union[t] = true; });
    return inter / Object.keys(union).length;
  }

  function normCode(c) {
    var s = String(c == null ? '' : c).trim().toLowerCase().replace(/\.$/, '');
    if (!s) return '';
    return s.split('.').map(function (p) { return /^\d+$/.test(p) ? String(Number(p)) : p; }).join('.').replace(/\.0+$/, '');
  }

  /* ---------- Métricas ---------- */
  function weight(a) {
    var d = a.start && a.end ? U.diffDays(a.start, a.end) + 1 : 1;
    return Math.max(1, d);
  }
  /* % que debería llevar hoy según el plan actual (reparto lineal entre inicio y fin). */
  function expectedProgress(a, iso) {
    if (!a.start || !a.end) return 0;
    if (iso < a.start) return 0;
    if (iso >= a.end) return 100;
    return Math.round(((U.diffDays(a.start, iso) + 1) / (U.diffDays(a.start, a.end) + 1)) * 100);
  }
  function weighted(list, fn) {
    var tw = 0, sum = 0;
    list.forEach(function (a) { var w = weight(a); tw += w; sum += w * fn(a); });
    return tw ? Math.round(sum / tw) : 0;
  }
  function descendants(acts, chapterId) {
    var kids = {};
    acts.forEach(function (a) { if (a.parentId) (kids[a.parentId] = kids[a.parentId] || []).push(a); });
    var out = [], stack = (kids[chapterId] || []).slice();
    while (stack.length) { var x = stack.pop(); out.push(x); (kids[x.id] || []).forEach(function (k) { stack.push(k); }); }
    return out;
  }
  /* Resumen de un capítulo: fechas y avance derivados de sus actividades. */
  function chapterRollup(acts, chapter, iso) {
    var ls = leaves(descendants(acts, chapter.id));
    var starts = ls.map(function (a) { return a.start; }).filter(Boolean).sort();
    var ends = ls.map(function (a) { return a.end; }).filter(Boolean).sort();
    var bs = ls.map(function (a) { return a.baseStart; }).filter(Boolean).sort();
    var be = ls.map(function (a) { return a.baseEnd; }).filter(Boolean).sort();
    return {
      count: ls.length, start: starts[0] || '', end: ends[ends.length - 1] || '', baseStart: bs[0] || '', baseEnd: be[be.length - 1] || '',
      progress: weighted(ls, function (a) { return a.progress || 0; }),
      expected: weighted(ls, function (a) { return expectedProgress(a, iso); })
    };
  }
  function activityMetrics(a, iso) {
    var finished = (a.progress || 0) >= 100;
    var delay = 0, startDelay = 0;
    if (finished) { if (a.actualEnd && a.end) delay = Math.max(0, U.diffDays(a.end, a.actualEnd)); }
    else {
      if (a.end && a.end < iso) delay = U.diffDays(a.end, iso);
      if (a.start && a.start < iso && !(a.progress > 0) && !a.actualStart) startDelay = U.diffDays(a.start, iso);
    }
    var expected = expectedProgress(a, iso);
    return {
      finished: finished, late: !finished && delay > 0, delay: delay, startDelay: startDelay, expected: expected,
      deviation: (a.progress || 0) - expected,
      planShiftEnd: a.baseEnd && a.end ? U.diffDays(a.baseEnd, a.end) : 0,
      planShiftStart: a.baseStart && a.start ? U.diffDays(a.baseStart, a.start) : 0
    };
  }
  function projectMetrics(acts, iso) {
    var ls = leaves(acts);
    var m = { count: ls.length, finished: 0, late: 0, startLate: 0, inProgress: 0, pending: 0, start: '', end: '', progress: weighted(ls, function (a) { return a.progress || 0; }), expected: weighted(ls, function (a) { return expectedProgress(a, iso); }) };
    m.deviation = m.progress - m.expected;
    ls.forEach(function (a) {
      var am = activityMetrics(a, iso);
      if (am.finished) m.finished++; else if (a.progress > 0) m.inProgress++; else m.pending++;
      if (am.late) m.late++;
      if (am.startDelay > 0) m.startLate++;
      if (a.start && (!m.start || a.start < m.start)) m.start = a.start;
      if (a.end && (!m.end || a.end > m.end)) m.end = a.end;
    });
    return m;
  }

  /* ---------- Seguimiento (lo único que escribe el usuario) ---------- */
  function setProgress(a, value, today) {
    var prev = a.progress || 0;
    value = U.clamp(Math.round(Number(value) || 0), 0, 100);
    a.progress = value;
    if (value >= 100) {
      a.status = 'Finalizado';
      if (!a.actualStart) a.actualStart = today;
      if (!a.actualEnd) a.actualEnd = today;
    } else {
      if (prev >= 100) { if (a.status === 'Finalizado') a.status = value > 0 ? 'En curso' : 'Pendiente'; a.actualEnd = ''; }
      if (value > 0) { if (!a.actualStart) a.actualStart = today; if (a.status === 'Pendiente') a.status = 'En curso'; }
    }
  }

  function logHistory(a, field, from, to, src, at, version) {
    (a.history = a.history || []).push({ at: at, v: version == null ? null : version, field: field, from: from, to: to, src: src });
  }

  /* Edición manual de una actividad. Los cambios de fecha prevista quedan en el historial; la línea base no cambia. */
  function applyActivityEdit(a, v, today) {
    ['code', 'name', 'kind'].forEach(function (f) { if (v[f] !== undefined) a[f] = v[f]; });
    ['start', 'end'].forEach(function (f) {
      if (v[f] !== undefined && v[f] !== a[f]) { logHistory(a, f, a[f], v[f], 'manual', today, null); a[f] = v[f]; }
    });
    if (v.parentId !== undefined) a.parentId = v.parentId || null;
    ['actualStart', 'actualEnd', 'notes', 'status'].forEach(function (f) { if (v[f] !== undefined) a[f] = v[f]; });
    if (v.progress !== undefined) {
      var explicitStatus = v.status, explicitEnd = v.actualEnd;
      setProgress(a, v.progress, today);
      if (explicitStatus && explicitStatus !== 'Finalizado' && a.progress < 100) a.status = explicitStatus;
      if (explicitEnd !== undefined && a.progress >= 100) a.actualEnd = explicitEnd || a.actualEnd;
    }
    return a;
  }

  /* ---------- Reimportación: coincidencias y diferencias ---------- */
  function parentNameOfRow(rows, i) { var p = rows[i].parentIndex; return p === null || p === undefined ? '' : rows[p].name; }

  function diffImport(existing, rows) {
    var acts = existing.slice().sort(byOrder), byId = actById(acts);
    var used = {}, matchOf = new Array(rows.length).fill(null);
    var orderIdx = {}; acts.forEach(function (a, i) { orderIdx[a.id] = i; });
    function actParentName(a) { return a.parentId && byId[a.parentId] ? byId[a.parentId].name : ''; }

    function pass(pred) {
      rows.forEach(function (r, i) {
        if (matchOf[i]) return;
        var cands = acts.filter(function (a) { return !used[a.id] && pred(r, a); });
        if (!cands.length) return;
        var pn = nn(parentNameOfRow(rows, i));
        cands.sort(function (x, y) {
          var px = nn(actParentName(x)) === pn ? 0 : 1, py = nn(actParentName(y)) === pn ? 0 : 1;
          return px - py || Math.abs(orderIdx[x.id] - i) - Math.abs(orderIdx[y.id] - i);
        });
        matchOf[i] = cands[0]; used[cands[0].id] = true;
      });
    }
    pass(function (r, a) { return normCode(r.code) && normCode(r.code) === normCode(a.code) && nn(r.name) === nn(a.name); });
    pass(function (r, a) { return nn(r.name) === nn(a.name); });
    /* Mismo código y descripción parecida = actividad renombrada. Si la descripción no se parece en nada,
     * NO se empareja: así nunca se traspasa el seguimiento de una actividad a otra distinta. */
    pass(function (r, a) { return normCode(r.code) && normCode(r.code) === normCode(a.code) && similarity(r.name, a.name) >= 0.4; });

    var items = [], summary = { new: 0, modified: 0, unchanged: 0, removed: 0, restored: 0 };
    rows.forEach(function (r, i) {
      var a = matchOf[i];
      if (!a) { items.push({ key: 'r' + i, type: 'new', rowIndex: i, row: r, activity: null, changes: [], defaultSelected: true }); summary.new++; return; }
      var ch = [];
      if (r.code && normCode(r.code) !== normCode(a.code)) ch.push({ field: 'code', from: a.code || '', to: r.code });
      if (nn(r.name) !== nn(a.name)) ch.push({ field: 'name', from: a.name, to: r.name });
      if (r.start && r.start !== a.start) ch.push({ field: 'start', from: a.start || '', to: r.start });
      if (r.end && r.end !== a.end) ch.push({ field: 'end', from: a.end || '', to: r.end });
      if (r.kind !== a.kind) ch.push({ field: 'kind', from: a.kind, to: r.kind });
      var newParent = parentNameOfRow(rows, i), oldParent = actParentName(a);
      if (nn(newParent) !== nn(oldParent)) ch.push({ field: 'parent', from: oldParent, to: newParent });
      var type = a.removedFromPlan ? 'restored' : (ch.length ? 'modified' : 'unchanged');
      summary[type]++;
      items.push({ key: 'r' + i, type: type, rowIndex: i, row: r, activity: a, changes: ch, defaultSelected: true });
    });
    acts.forEach(function (a) {
      if (!used[a.id] && !a.removedFromPlan) {
        items.push({ key: 'x' + a.id, type: 'removed', rowIndex: -1, row: null, activity: a, changes: [], defaultSelected: false });
        summary.removed++;
      }
    });
    return { items: items, summary: summary };
  }

  function nextVersionNumber(db, projectId) {
    var n = 0;
    db.planVersions.forEach(function (v) { if (v.projectId === projectId) n = Math.max(n, v.number); });
    return n + 1;
  }
  function snapshotOf(acts) {
    return acts.slice().sort(byOrder).map(function (a) {
      return { activityId: a.id, code: a.code || '', name: a.name, kind: a.kind, level: a.level || 0, parentId: a.parentId || null, start: a.start || '', end: a.end || '', removed: !!a.removedFromPlan };
    });
  }

  /* Aplica una importación confirmada. selection: {clave: true/false}; lo no indicado usa defaultSelected.
   * NUNCA modifica progress, actualStart, actualEnd, notes ni status de actividades existentes. */
  function applyImport(db, projectId, rows, diff, selection, meta, now) {
    selection = selection || {}; meta = meta || {}; now = now || new Date().toISOString();
    var today = now.slice(0, 10);
    var acts = projectActs(db, projectId), number = nextVersionNumber(db, projectId);
    var orderBefore = acts.map(function (a) { return a.id; });
    var changesLog = [], actOfRow = {}, created = [], relink = [];
    var counts = { new: 0, modified: 0, unchanged: 0, removed: 0, restored: 0 };
    var isSel = function (it) { return selection[it.key] === undefined ? it.defaultSelected : !!selection[it.key]; };

    diff.items.forEach(function (it) {
      var sel = isSel(it);
      if (it.type === 'new') {
        if (!sel) return;
        var r = it.row;
        var a = {
          id: U.uid(), projectId: projectId, code: r.code || '', name: r.name, kind: r.kind, level: r.level || 0, parentId: null, order: 0,
          baseStart: r.start || '', baseEnd: r.end || '', start: r.start || '', end: r.end || '',
          actualStart: '', actualEnd: '', progress: 0, status: 'Pendiente', notes: '', removedFromPlan: false, addedInVersion: number, history: []
        };
        if (r.progress !== null && r.progress !== undefined && r.kind !== 'chapter') setProgress(a, r.progress, today);
        created.push(a); actOfRow[it.rowIndex] = a; relink.push({ act: a, rowIndex: it.rowIndex });
        changesLog.push({ type: 'new', activityId: a.id, name: a.name, code: a.code, start: a.start, end: a.end });
        counts.new++;
      } else if (it.type === 'removed') {
        if (!sel) return;
        it.activity.removedFromPlan = true;
        logHistory(it.activity, 'plan', 'en plan', 'eliminada del plan', 'importación v' + number, today, number);
        changesLog.push({ type: 'removed', activityId: it.activity.id, name: it.activity.name });
        counts.removed++;
      } else {
        actOfRow[it.rowIndex] = it.activity;
        if (!sel) return;
        var rec = { type: it.type, activityId: it.activity.id, name: it.activity.name, changes: [] };
        if (it.type === 'restored') { it.activity.removedFromPlan = false; logHistory(it.activity, 'plan', 'eliminada del plan', 'restaurada', 'importación v' + number, today, number); counts.restored++; }
        else if (it.type === 'modified') counts.modified++; else counts.unchanged++;
        it.changes.forEach(function (c) {
          if (c.field === 'parent') {
            rec.changes.push({ field: 'parent', from: c.from, to: c.to, parentIdFrom: it.activity.parentId || null });
            relink.push({ act: it.activity, rowIndex: it.rowIndex });
          } else {
            rec.changes.push({ field: c.field, from: it.activity[c.field] === undefined ? c.from : it.activity[c.field], to: c.to });
            logHistory(it.activity, c.field, it.activity[c.field], c.to, 'importación v' + number, today, number);
            it.activity[c.field] = c.to;
          }
        });
        if (it.type !== 'unchanged') changesLog.push(rec);
      }
    });

    created.forEach(function (a) { db.activities.push(a); });
    /* Padres: se busca el antecedente más cercano que exista como actividad. */
    relink.forEach(function (rl) {
      var p = rows[rl.rowIndex].parentIndex, pid = null;
      while (p !== null && p !== undefined) {
        if (actOfRow[p]) { pid = actOfRow[p].id; break; }
        p = rows[p].parentIndex;
      }
      rl.act.parentId = pid;
      var row = rows[rl.rowIndex]; if (row) rl.act.level = row.level || 0;
    });

    /* Orden: el del archivo; las eliminadas se quedan detrás de su antecesora anterior. */
    var out = [], seen = {};
    rows.forEach(function (r, i) { var a = actOfRow[i]; if (a && !seen[a.id]) { out.push(a.id); seen[a.id] = true; } });
    var oldOrder = orderBefore;
    oldOrder.forEach(function (id, idx) {
      if (seen[id]) return;
      var pos = -1;
      for (var k = idx - 1; k >= 0; k--) { var at = out.indexOf(oldOrder[k]); if (at >= 0) { pos = at; break; } }
      out.splice(pos + 1, 0, id); seen[id] = true;
    });
    var all = actById(projectActs(db, projectId));
    out.forEach(function (id, i) { if (all[id]) all[id].order = i; });

    var version = {
      id: U.uid(), projectId: projectId, number: number, createdAt: now,
      source: { fileName: meta.fileName || '', sheet: meta.sheet || '' }, mapping: meta.mapping || null, note: meta.note || '',
      summary: counts, changes: changesLog, orderBefore: orderBefore, orderAfter: out.slice(),
      snapshot: snapshotOf(projectActs(db, projectId))
    };
    db.planVersions.push(version);
    return version;
  }

  /* ---------- Deshacer la última versión ---------- */
  function latestVersion(db, projectId) {
    var best = null;
    db.planVersions.forEach(function (v) { if (v.projectId === projectId && (!best || v.number > best.number)) best = v; });
    return best;
  }
  function canRevert(db, versionId) {
    var v = db.planVersions.filter(function (x) { return x.id === versionId; })[0];
    if (!v) return { ok: false, reason: 'No se encuentra la versión.' };
    if (latestVersion(db, v.projectId).id !== v.id) return { ok: false, reason: 'Solo se puede deshacer la última versión.' };
    var byId = actById(db.activities), tracked = 0, later = 0;
    v.changes.forEach(function (c) {
      var a = byId[c.activityId]; if (!a) return;
      if (c.type === 'new' && (a.progress > 0 || a.actualStart || a.actualEnd || a.notes)) tracked++;
      (a.history || []).forEach(function (h) { if (h.src === 'manual' && h.at >= v.createdAt.slice(0, 10)) later++; });
    });
    return { ok: true, trackedNew: tracked, laterManualEdits: later };
  }
  function revertVersion(db, versionId) {
    var chk = canRevert(db, versionId);
    if (!chk.ok) return chk;
    var v = db.planVersions.filter(function (x) { return x.id === versionId; })[0];
    var byId = actById(db.activities);
    v.changes.slice().reverse().forEach(function (c) {
      var a = byId[c.activityId]; if (!a) return;
      if (c.type === 'new') { db.activities = db.activities.filter(function (x) { return x.id !== a.id; }); return; }
      if (c.type === 'removed') a.removedFromPlan = false;
      if (c.type === 'restored') a.removedFromPlan = true;
      (c.changes || []).forEach(function (ch) { if (ch.field === 'parent') a.parentId = ch.parentIdFrom || null; else a[ch.field] = ch.from; });
      a.history = (a.history || []).filter(function (h) { return h.v !== v.number; });
    });
    var rest = actById(projectActs(db, v.projectId));
    v.orderBefore.forEach(function (id, i) { if (rest[id]) rest[id].order = i; });
    db.planVersions = db.planVersions.filter(function (x) { return x.id !== v.id; });
    return { ok: true };
  }

  /* ---------- Comparar versiones ---------- */
  function versionByNumber(db, projectId, n) {
    return db.planVersions.filter(function (v) { return v.projectId === projectId && v.number === n; })[0];
  }
  function compareVersions(db, projectId, aNum, bNum) {
    var va = versionByNumber(db, projectId, aNum), vb = versionByNumber(db, projectId, bNum);
    if (!va || !vb) return null;
    var A = {}, B = {}; va.snapshot.forEach(function (s) { A[s.activityId] = s; }); vb.snapshot.forEach(function (s) { B[s.activityId] = s; });
    var rows = [], seen = {}, sum = { added: 0, removed: 0, changed: 0, same: 0 };
    function push(a, b) {
      var type;
      var aGone = !a || a.removed, bGone = !b || b.removed;
      if (aGone && !bGone) type = 'added'; else if (!aGone && bGone) type = 'removed';
      else if (aGone && bGone) return;
      else type = (a.start !== b.start || a.end !== b.end || a.name !== b.name || a.code !== b.code) ? 'changed' : 'same';
      sum[type]++;
      rows.push({
        type: type, name: (b || a).name, code: (b || a).code, kind: (b || a).kind, level: (b || a).level,
        aStart: a ? a.start : '', aEnd: a ? a.end : '', bStart: b ? b.start : '', bEnd: b ? b.end : '',
        dStart: a && b && a.start && b.start ? U.diffDays(a.start, b.start) : 0,
        dEnd: a && b && a.end && b.end ? U.diffDays(a.end, b.end) : 0,
        renamed: !!(a && b && a.name !== b.name), aName: a ? a.name : ''
      });
    }
    vb.snapshot.forEach(function (s) { seen[s.activityId] = true; push(A[s.activityId], s); });
    va.snapshot.forEach(function (s) { if (!seen[s.activityId]) push(s, null); });
    return { a: va, b: vb, rows: rows, summary: sum };
  }

  return {
    byOrder: byOrder, projectActs: projectActs, isChapter: isChapter, leaves: leaves, descendants: descendants, normCode: normCode,
    expectedProgress: expectedProgress, chapterRollup: chapterRollup, activityMetrics: activityMetrics, projectMetrics: projectMetrics,
    setProgress: setProgress, logHistory: logHistory, applyActivityEdit: applyActivityEdit,
    diffImport: diffImport, similarity: similarity, applyImport: applyImport, nextVersionNumber: nextVersionNumber, latestVersion: latestVersion,
    canRevert: canRevert, revertVersion: revertVersion, compareVersions: compareVersions, versionByNumber: versionByNumber, snapshotOf: snapshotOf
  };
});
