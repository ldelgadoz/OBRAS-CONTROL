/* OBRA CONTROL · planning: Gantt, tabla, versiones y asistente de importación. */
(function () {
  'use strict';
  var U = OC.util, P = OC.planning, I = OC.importer, X = OC.exporter, ui = OC.ui, esc = ui.esc, fmt = ui.fmt;

  var KIND_LABEL = { activity: 'Actividad', milestone: 'Hito', chapter: 'Capítulo' };
  var FIELD_LABEL = { code: 'Código', name: 'Descripción', start: 'Inicio previsto', end: 'Fin previsto', kind: 'Tipo', parent: 'Capítulo' };
  var STATUSES = ['Pendiente', 'En curso', 'Finalizado', 'Bloqueado', 'Retrasado'];

  function fieldValue(field, v) {
    if (field === 'start' || field === 'end') return fmt(v);
    if (field === 'kind') return KIND_LABEL[v] || v;
    return v === '' || v === null || v === undefined ? '—' : String(v);
  }
  function changeHtml(c) {
    return '<div><span class="muted">' + esc(FIELD_LABEL[c.field] || c.field) + ':</span> <s class="muted">' + esc(fieldValue(c.field, c.from)) + '</s> → <b>' + esc(fieldValue(c.field, c.to)) + '</b></div>';
  }
  function signed(n) { return n > 0 ? '+' + n : String(n); }
  function indent(level) { return '<span class="indent" style="width:' + (Math.max(0, level || 0) * 16) + 'px"></span>'; }

  /* ---------- Página ---------- */
  ui.pages.planning = {
    title: 'Planning',
    render: function () {
      var p = ui.activeProject(), s = ui.state;
      var head = ui.header('PRODUCCIÓN', 'Planning y seguimiento', 'Importa el Excel de planning, revisa las actividades y registra el avance real. El plan base y el seguimiento real se guardan por separado.',
        p ? '<button class="btn primary" data-act="task-new">＋ Nueva actividad</button>' : '');
      if (!p) return head + '<div class="panel empty">Crea una obra para incorporar su planning.</div>';
      var acts = P.projectActs(ui.db, p.id), versions = ui.db.planVersions.filter(function (v) { return v.projectId === p.id; });
      var tool = '<div class="toolbar">' + ui.projectSelect() +
        '<button class="btn" data-act="import-pick">↑ Importar Excel / CSV</button><input class="hidden" id="importFile" type="file" accept=".xlsx,.xls,.csv,.txt" data-change="import-file">' +
        '<button class="btn" data-act="export-xlsx"' + (acts.length ? '' : ' disabled') + '>↓ Exportar Excel</button>' +
        '<button class="btn" data-act="export-csv"' + (acts.length ? '' : ' disabled') + '>↓ Exportar CSV</button>' +
        '<button class="btn soft" data-act="download-template">Descargar plantilla CSV</button>' +
        (s.planningTab === 'gantt' ? '<select data-change="zoom" aria-label="Escala del Gantt">' + [['day', 'Escala: días'], ['week', 'Escala: semanas'], ['month', 'Escala: meses']].map(function (z) { return '<option value="' + z[0] + '"' + (s.zoom === z[0] ? ' selected' : '') + '>' + z[1] + '</option>'; }).join('') + '</select>' : '') + '</div>';
      var tabs = '<div class="tabs">' + [['gantt', 'Diagrama Gantt'], ['table', 'Tabla de actividades'], ['versions', 'Versiones del planning (' + versions.length + ')']].map(function (t) {
        return '<button class="' + (s.planningTab === t[0] ? 'active' : '') + '" data-act="planning-tab" data-tab="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>';
      var m = P.projectMetrics(acts, ui.today());
      var summary = acts.length ? '<span class="pill blue">' + m.count + ' actividades</span> <span class="pill">' + m.progress + '% real · ' + m.expected + '% previsto</span>' : '<span class="pill">Sin actividades</span>';
      var body = s.planningTab === 'gantt' ? gantt(p, acts) : (s.planningTab === 'table' ? taskTable(acts) : versionsTab(p, versions));
      return head + tool + tabs + '<div class="panel"><div class="panelhead"><div><div class="paneltitle">' + esc(p.name) + ui.demoPill(p) + '</div><div class="meta">Plan base · plan actual · seguimiento real</div></div><div>' + summary + '</div></div>' + body + '</div>';
    }
  };
  ui.actions['planning-tab'] = function (el) { ui.state.planningTab = el.dataset.tab; ui.render({ keepScroll: true }); };
  ui.changes['zoom'] = function (el) { ui.state.zoom = el.value; ui.render({ keepScroll: true }); };

  /* ---------- Gantt ---------- */
  function gantt(p, acts) {
    var t = ui.today(), rows = acts.filter(function (a) { return !a.removedFromPlan; });
    var dates = [];
    rows.forEach(function (a) { [a.start, a.end, a.baseStart, a.baseEnd, a.actualStart, a.actualEnd].forEach(function (d) { if (d) dates.push(d); }); });
    if (!rows.length) return '<div class="empty">No hay actividades todavía. Importa un Excel/CSV o crea una actividad.</div>';
    if (!dates.length) return '<div class="empty">Las actividades no tienen fechas previstas: completa fechas para ver el Gantt.</div>';
    dates.sort();
    var min = dates[0], max = dates[dates.length - 1];
    var showToday = t >= U.addDays(min, -30) && t <= U.addDays(max, 30);
    if (showToday) { if (t < min) min = t; if (t > max) max = t; }
    min = U.addDays(min, -1); max = U.addDays(max, 2);
    var ppd = { day: 28, week: 12, month: 4 }[ui.state.zoom] || 12, span = U.diffDays(min, max) + 1, W = span * ppd;
    var X0 = function (d) { return U.diffDays(min, d) * ppd; };

    var scale = '', cur = min, MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    for (var i = 0; i < span; i++) {
      var d = U.addDays(min, i), day = +d.slice(8);
      if (day === 1 || i === 0) scale += '<div class="gmonth" style="left:' + (i * ppd) + 'px">' + MONTHS[+d.slice(5, 7) - 1] + ' ' + d.slice(0, 4) + '</div>';
      var dow = new Date(U.dayNum(d) * 86400000).getUTCDay();
      if ((ui.state.zoom === 'day') || (ui.state.zoom === 'week' && dow === 1)) scale += '<div class="gtick" style="left:' + (i * ppd) + 'px">' + day + '</div>';
    }
    var todayLine = showToday ? '<div class="gtoday" style="left:' + (X0(t) + ppd / 2) + 'px" title="Hoy"></div>' : '';
    var bg = 'background-image:repeating-linear-gradient(90deg,transparent 0,transparent ' + (ppd * 7 - 1) + 'px,#eef2f0 ' + (ppd * 7 - 1) + 'px,#eef2f0 ' + (ppd * 7) + 'px)';

    var body = rows.map(function (a) {
      var ch = a.kind === 'chapter', roll = ch ? P.chapterRollup(acts, a, t) : null, m = ch ? null : P.activityMetrics(a, t), bars = '';
      var start = ch ? roll.start : a.start, end = ch ? roll.end : a.end;
      if (ch) {
        if (start && end) bars += '<div class="gchap" style="left:' + X0(start) + 'px;width:' + ((U.diffDays(start, end) + 1) * ppd) + 'px"></div>';
      } else if (a.kind === 'milestone') {
        var md = a.start || a.end;
        if (md) bars += '<div class="gmile" style="left:' + (X0(md) + ppd / 2 - 7) + 'px" title="Hito ' + fmt(md) + '"></div>';
        if (a.baseStart && a.baseStart !== md) bars += '<div class="gmile base" style="left:' + (X0(a.baseStart) + ppd / 2 - 7) + 'px" title="Hito en la línea base ' + fmt(a.baseStart) + '"></div>';
      } else {
        if (a.baseStart && a.baseEnd) bars += '<div class="gbase" style="left:' + X0(a.baseStart) + 'px;width:' + ((U.diffDays(a.baseStart, a.baseEnd) + 1) * ppd) + 'px" title="Línea base ' + fmt(a.baseStart) + ' → ' + fmt(a.baseEnd) + '"></div>';
        if (start && end) bars += '<div class="gbar ' + (m.finished ? 'done' : (m.late ? 'late' : '')) + '" style="left:' + X0(start) + 'px;width:' + ((U.diffDays(start, end) + 1) * ppd) + 'px"><div class="gfill" style="width:' + (a.progress || 0) + '%"></div></div>';
        if (a.actualStart) { var ae = a.actualEnd || (a.progress < 100 ? (t >= a.actualStart ? t : a.actualStart) : a.actualStart); bars += '<div class="gactual" style="left:' + X0(a.actualStart) + 'px;width:' + ((U.diffDays(a.actualStart, ae) + 1) * ppd) + 'px" title="Real ' + fmt(a.actualStart) + ' → ' + (a.actualEnd ? fmt(a.actualEnd) : 'en curso') + '"></div>'; }
      }
      var meta = ch ? (start ? fmt(start) + ' → ' + fmt(end) + ' · ' + roll.progress + '% (prev. ' + roll.expected + '%)' : 'Sin fechas') :
        (a.start ? fmt(a.start) + (a.kind === 'milestone' ? '' : ' → ' + fmt(a.end)) : 'Sin fechas') + ' · ' + (a.progress || 0) + '%' +
        (m.late ? ' · <span style="color:var(--red)">' + m.delay + ' d de retraso</span>' : '') + (m.planShiftEnd ? ' · plan ' + signed(m.planShiftEnd) + ' d vs base' : '');
      return '<tr class="' + (ch ? 'gchapter' : '') + '"><td class="gname">' + indent(a.level) + '<b>' + (a.code ? esc(a.code) + ' · ' : '') + esc(a.name) + '</b><div class="meta">' + indent(a.level) + meta + '</div></td>' +
        '<td><div class="grow" style="width:' + W + 'px;' + bg + '">' + todayLine + bars + '</div></td></tr>';
    }).join('');

    return '<div class="gantt"><table><thead><tr><th class="gname">Actividad</th><th><div class="gscale" style="width:' + W + 'px">' + scale + '</div></th></tr></thead><tbody>' + body + '</tbody></table></div>' +
      '<div class="glegend"><span><b style="background:#2d7a62"></b>Previsto (relleno = avance real)</span><span><b style="background:#aeb8b4;height:5px"></b>Línea base original</span><span><b style="background:#c98a1b;height:4px"></b>Ejecución real</span>' +
      '<span><b style="background:#b94b45"></b>Retrasada</span><span><b style="background:#e0503f;width:2px;height:12px"></b>Hoy</span></div>';
  }

  /* ---------- Tabla ---------- */
  function taskTable(acts) {
    var t = ui.today();
    if (!acts.length) return '<div class="empty">No hay actividades. Importa un Excel/CSV o crea una actividad.</div>';
    return '<div class="tablewrap"><table><thead><tr><th>Código</th><th>Actividad</th><th>Inicio prev.</th><th>Fin prev.</th><th>Fin base</th><th>Desv. plan</th><th>Avance real</th><th>Previsto hoy</th><th>Estado</th><th>Retraso</th><th></th></tr></thead><tbody>' +
      acts.map(function (a) {
        if (a.kind === 'chapter') {
          var r = P.chapterRollup(acts, a, t);
          return '<tr class="chapter' + (a.removedFromPlan ? ' removed' : '') + '"><td>' + esc(a.code || '') + '</td><td>' + indent(a.level) + esc(a.name) + '</td><td>' + fmt(r.start) + '</td><td>' + fmt(r.end) + '</td><td>' + fmt(r.baseEnd) + '</td><td></td><td>' + r.progress + '%</td><td>' + r.expected + '%</td><td>' + ui.pill('Capítulo') + '</td><td></td><td><button class="btn small" data-act="task-edit" data-id="' + esc(a.id) + '">Editar</button></td></tr>';
        }
        var m = P.activityMetrics(a, t), delay = '—';
        if (a.removedFromPlan) delay = '—';
        else if (m.late) delay = '<span class="delta-pos">' + m.delay + ' d</span>';
        else if (m.startDelay > 0) delay = '<span style="color:var(--amber)">debía empezar hace ' + m.startDelay + ' d</span>';
        else if (m.finished && m.delay > 0) delay = '+' + m.delay + ' d (terminada)';
        var shift = m.planShiftEnd ? '<span class="' + (m.planShiftEnd > 0 ? 'delta-pos' : 'delta-neg') + '">' + signed(m.planShiftEnd) + ' d</span>' : '—';
        return '<tr class="' + (a.removedFromPlan ? 'removed' : '') + '"><td>' + esc(a.code || '') + '</td><td>' + indent(a.level) + '<b>' + esc(a.name) + '</b>' + (a.kind === 'milestone' ? ' ' + ui.pill('Hito', 'blue') : '') + (a.demo ? ui.demoPill(a) : '') + '</td>' +
          '<td>' + fmt(a.start) + '</td><td>' + fmt(a.end) + '</td><td>' + fmt(a.baseEnd) + '</td><td>' + shift + '</td>' +
          '<td><input type="number" min="0" max="100" class="inline-input" style="width:68px" value="' + (a.progress || 0) + '" data-change="progress" data-id="' + esc(a.id) + '"' + (a.removedFromPlan ? ' disabled' : '') + '> %</td>' +
          '<td>' + m.expected + '%</td><td>' + (a.removedFromPlan ? ui.pill('Eliminada del plan', 'amber') : ui.statusPill(a.status) + (m.late ? ' ' + ui.pill('Retrasada', 'red') : '')) + '</td><td>' + delay + '</td>' +
          '<td><button class="btn small" data-act="task-edit" data-id="' + esc(a.id) + '">Editar</button></td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="footer-note">«Fin base» es la fecha original con la que la actividad entró en el plan y no cambia. «Desv. plan» = cuánto se ha movido el fin previsto actual respecto a la base. «Previsto hoy» = avance que debería llevar hoy según el plan actual.</div>';
  }
  ui.changes['progress'] = function (el) {
    var a = ui.db.activities.filter(function (x) { return x.id === el.dataset.id; })[0];
    if (!a) return;
    P.setProgress(a, el.value, ui.today());
    ui.persist(); ui.render({ keepScroll: true });
  };

  /* ---------- Actividades: alta y edición ---------- */
  ui.actions['task-new'] = function () { openTask(''); };
  ui.actions['task-edit'] = function (el) { openTask(el.dataset.id); };
  function openTask(id) {
    var db = ui.db, p = ui.activeProject(), a = db.activities.filter(function (x) { return x.id === id; })[0] || { kind: 'activity', status: 'Pendiente', progress: 0 };
    var chapters = P.projectActs(db, p.id).filter(function (x) { return x.kind === 'chapter' && x.id !== id; });
    var hist = (a.history || []).slice().reverse().map(function (h) {
      return '<div class="meta">' + fmt(h.at) + ' · ' + esc(h.src) + ' · ' + esc(FIELD_LABEL[h.field] || h.field) + ': ' + esc(h.field === 'start' || h.field === 'end' ? fmt(h.from) : h.from) + ' → ' + esc(h.field === 'start' || h.field === 'end' ? fmt(h.to) : h.to) + '</div>';
    }).join('');
    ui.modal(id ? 'Editar actividad' : 'Nueva actividad',
      '<form data-form="task"><input type="hidden" name="id" value="' + esc(id) + '"><div class="formgrid">' +
      '<div class="field"><label>Código</label><input name="code" value="' + esc(a.code || '') + '"></div>' +
      '<div class="field"><label>Tipo</label><select name="kind">' + ['activity', 'milestone', 'chapter'].map(function (k) { return '<option value="' + k + '"' + (a.kind === k ? ' selected' : '') + '>' + KIND_LABEL[k] + '</option>'; }).join('') + '</select></div>' +
      '<div class="field span2"><label>Descripción *</label><input name="name" required value="' + esc(a.name || '') + '"></div>' +
      '<div class="field span2"><label>Capítulo al que pertenece</label><select name="parentId"><option value="">— Ninguno —</option>' + chapters.map(function (c) { return '<option value="' + esc(c.id) + '"' + (a.parentId === c.id ? ' selected' : '') + '>' + esc((c.code ? c.code + ' · ' : '') + c.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>Inicio previsto</label><input type="date" name="start" value="' + esc(a.start || '') + '"></div>' +
      '<div class="field"><label>Fin previsto</label><input type="date" name="end" value="' + esc(a.end || '') + '"></div>' +
      (id ? '<div class="span2 meta" style="margin:-6px 0 10px">Línea base original: ' + fmt(a.baseStart) + ' → ' + fmt(a.baseEnd) + '. Si cambias las fechas previstas, la línea base no se modifica y el cambio queda en el historial.</div>' : '') +
      '<div class="field"><label>Inicio real</label><input type="date" name="actualStart" value="' + esc(a.actualStart || '') + '"></div>' +
      '<div class="field"><label>Fin real</label><input type="date" name="actualEnd" value="' + esc(a.actualEnd || '') + '"></div>' +
      '<div class="field"><label>Avance (%)</label><input type="number" min="0" max="100" name="progress" value="' + (Number(a.progress) || 0) + '"></div>' +
      '<div class="field"><label>Estado</label><select name="status">' + STATUSES.map(function (s) { return '<option' + (a.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' +
      '<div class="field span2"><label>Observaciones</label><textarea name="notes">' + esc(a.notes || '') + '</textarea></div></div>' +
      (hist ? '<div class="notice"><b>Historial de cambios de fechas previstas</b>' + hist + '</div>' : '') +
      '<div class="table-actions"><button class="btn primary">Guardar actividad</button>' + (id ? '<button type="button" class="btn danger" data-act="task-delete" data-id="' + esc(id) + '">Eliminar…</button>' : '') + '</div></form>');
  }
  ui.forms['task'] = function (form, fd) {
    var db = ui.db, p = ui.activeProject(), v = {}; fd.forEach(function (val, k) { v[k] = val; });
    var id = v.id; delete v.id;
    var parent = v.parentId ? db.activities.filter(function (x) { return x.id === v.parentId; })[0] : null;
    v.level = parent ? (parent.level || 0) + 1 : 0;
    if (v.start && v.end && v.end < v.start) { ui.toast('El fin previsto no puede ser anterior al inicio.', 'err'); return; }
    if (id) {
      var a = db.activities.filter(function (x) { return x.id === id; })[0];
      P.applyActivityEdit(a, v, ui.today());
    } else {
      var acts = P.projectActs(db, p.id), last = acts.length ? acts[acts.length - 1].order + 1 : 0;
      var n = { id: U.uid(), projectId: p.id, code: v.code, name: v.name, kind: v.kind, level: v.level, parentId: v.parentId || null, order: last,
        baseStart: v.start, baseEnd: v.end, start: v.start, end: v.end, actualStart: v.actualStart, actualEnd: v.actualEnd, progress: 0, status: v.status, notes: v.notes,
        removedFromPlan: false, addedInVersion: null, history: [] };
      P.setProgress(n, v.progress, ui.today());
      if (v.status !== 'Pendiente' && n.progress < 100) n.status = v.status;
      db.activities.push(n);
    }
    ui.persist(); ui.closeModal(); ui.render({ keepScroll: true });
  };
  ui.actions['task-delete'] = function (el) {
    var db = ui.db, a = db.activities.filter(function (x) { return x.id === el.dataset.id; })[0];
    if (!a) return;
    var kids = P.descendants(db.activities, a.id).length;
    if (!confirm('Eliminar «' + a.name + '» borra también su seguimiento y su historial' + (kids ? ' y deja sin capítulo a ' + kids + ' actividad(es) hijas' : '') + '. No se puede deshacer.\n\nSi solo quieres sacarla del plan, es mejor no eliminarla: se marca como «eliminada del plan» al reimportar. ¿Eliminar de todas formas?')) return;
    db.activities.forEach(function (x) { if (x.parentId === a.id) x.parentId = null; });
    db.activities = db.activities.filter(function (x) { return x.id !== a.id; });
    ui.persist(); ui.closeModal(); ui.render({ keepScroll: true });
  };

  /* ---------- Exportar ---------- */
  function exportName(ext) { return 'planning_' + ui.projectName(ui.activeProject().id).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_' + ui.today() + '.' + ext; }
  ui.actions['export-xlsx'] = function () {
    var p = ui.activeProject(), table = X.planningTable(P.projectActs(ui.db, p.id));
    ui.download(new Blob([X.toXlsx(window.XLSX, table, 'Planning')], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), exportName('xlsx'));
  };
  ui.actions['export-csv'] = function () {
    var p = ui.activeProject();
    ui.download(X.toCSV(X.planningTable(P.projectActs(ui.db, p.id))), exportName('csv'), 'text/csv;charset=utf-8');
  };
  ui.actions['download-template'] = function () {
    var csv = '﻿Nº;Actividad;Inicio;Fin;Duración;% Avance\r\n1;DEMOLICIONES;;;;\r\n1.1;Implantación y protecciones;16/11/2026;18/11/2026;;\r\n1.2;Demoliciones y desescombro;19/11/2026;;5;\r\n2;INSTALACIONES;;;;\r\n2.1;Instalación eléctrica;02/12/2026;15/12/2026;;\r\n2.2;HITO: Boletín presentado;18/12/2026;18/12/2026;0;\r\n';
    ui.download(csv, 'plantilla_planning.csv', 'text/csv;charset=utf-8');
  };

  /* ---------- Versiones ---------- */
  function versionsTab(p, versions) {
    if (!versions.length) return '<div class="empty">Todavía no hay versiones. Se crea una cada vez que confirmas una importación de Excel/CSV (la primera es la línea base).</div>';
    var sorted = versions.slice().sort(function (a, b) { return b.number - a.number; });
    var latest = sorted[0].number, cmpA = ui.state.cmpA || 1, cmpB = ui.state.cmpB || latest;
    if (!P.versionByNumber(ui.db, p.id, cmpA)) cmpA = 1;
    if (!P.versionByNumber(ui.db, p.id, cmpB)) cmpB = latest;
    var opts = function (cur) { return sorted.slice().reverse().map(function (v) { return '<option value="' + v.number + '"' + (v.number === cur ? ' selected' : '') + '>v' + v.number + (v.number === 1 ? ' (línea base)' : '') + ' · ' + fmt(v.createdAt.slice(0, 10)) + '</option>'; }).join(''); };
    var list = '<div class="tablewrap"><table><thead><tr><th>Versión</th><th>Fecha</th><th>Archivo</th><th>Cambios aplicados</th><th>Nota</th><th></th></tr></thead><tbody>' + sorted.map(function (v) {
      var s = v.summary;
      return '<tr><td><b>v' + v.number + '</b>' + (v.number === 1 ? ' ' + ui.pill('Línea base', 'green') : '') + (v.demo ? ui.demoPill(v) : '') + '</td><td>' + U.fmtDateTime(v.createdAt) + '</td><td>' + esc(v.source.fileName || '—') + (v.source.sheet && v.source.sheet !== 'CSV' ? '<div class="meta">Hoja: ' + esc(v.source.sheet) + '</div>' : '') + '</td>' +
        '<td>' + ([s.new ? ui.pill(s.new + ' nuevas', 'green') : '', s.modified ? ui.pill(s.modified + ' modificadas', 'amber') : '', s.removed ? ui.pill(s.removed + ' eliminadas', 'red') : '', s.restored ? ui.pill(s.restored + ' restauradas', 'blue') : ''].filter(Boolean).join(' ') || '<span class="muted">sin cambios</span>') + '</td>' +
        '<td>' + esc(v.note || '') + '</td><td><div class="table-actions"><button class="btn small" data-act="version-view" data-id="' + esc(v.id) + '">Ver cambios</button>' +
        (v.number === latest && !v.demo ? '<button class="btn small danger" data-act="version-revert" data-id="' + esc(v.id) + '">Deshacer</button>' : '') + '</div></td></tr>';
    }).join('') + '</tbody></table></div>';
    var cmp = P.compareVersions(ui.db, p.id, cmpA, cmpB);
    var cmpHtml = '';
    if (cmp) {
      var cs = cmp.summary;
      cmpHtml = '<div class="toolbar" style="margin-top:20px"><b>Comparar</b><select data-change="cmpA">' + opts(cmpA) + '</select> con <select data-change="cmpB">' + opts(cmpB) + '</select>' +
        ui.pill(cs.changed + ' cambiadas', cs.changed ? 'amber' : '') + ui.pill(cs.added + ' añadidas', cs.added ? 'green' : '') + ui.pill(cs.removed + ' eliminadas', cs.removed ? 'red' : '') + ui.pill(cs.same + ' iguales') + '</div>' +
        '<div class="tablewrap"><table><thead><tr><th>Actividad</th><th>Inicio (A)</th><th>Inicio (B)</th><th>Δ inicio</th><th>Fin (A)</th><th>Fin (B)</th><th>Δ fin</th><th>Resultado</th></tr></thead><tbody>' +
        cmp.rows.filter(function (r) { return r.type !== 'same'; }).map(function (r) {
          var d = function (n) { return n ? '<span class="' + (n > 0 ? 'delta-pos' : 'delta-neg') + '">' + signed(n) + ' d</span>' : '—'; };
          return '<tr class="' + (r.kind === 'chapter' ? 'chapter' : '') + '"><td>' + indent(r.level) + esc(r.name) + (r.renamed ? '<div class="meta">antes: ' + esc(r.aName) + '</div>' : '') + '</td><td>' + fmt(r.aStart) + '</td><td>' + fmt(r.bStart) + '</td><td>' + d(r.dStart) + '</td><td>' + fmt(r.aEnd) + '</td><td>' + fmt(r.bEnd) + '</td><td>' + d(r.dEnd) + '</td><td>' +
            ui.pill({ added: 'Añadida', removed: 'Eliminada', changed: 'Modificada' }[r.type], { added: 'green', removed: 'red', changed: 'amber' }[r.type]) + '</td></tr>';
        }).join('') + (cs.changed + cs.added + cs.removed === 0 ? '<tr><td colspan="8" class="empty">No hay diferencias entre estas dos versiones.</td></tr>' : '') + '</tbody></table></div>';
    }
    return list + cmpHtml;
  }
  ui.changes['cmpA'] = function (el) { ui.state.cmpA = +el.value; ui.render({ keepScroll: true }); };
  ui.changes['cmpB'] = function (el) { ui.state.cmpB = +el.value; ui.render({ keepScroll: true }); };
  ui.actions['version-view'] = function (el) {
    var v = ui.db.planVersions.filter(function (x) { return x.id === el.dataset.id; })[0];
    if (!v) return;
    var rows = v.changes.map(function (c) {
      var pill = { new: ui.pill('Nueva', 'green'), modified: ui.pill('Modificada', 'amber'), removed: ui.pill('Eliminada del plan', 'red'), restored: ui.pill('Restaurada', 'blue') }[c.type];
      var detail = c.type === 'new' ? '<span class="muted">' + fmt(c.start) + ' → ' + fmt(c.end) + '</span>' : (c.changes || []).map(changeHtml).join('');
      return '<tr><td>' + pill + '</td><td><b>' + esc(c.name) + '</b></td><td>' + detail + '</td></tr>';
    }).join('');
    ui.modal('Versión ' + v.number + ' · ' + U.fmtDateTime(v.createdAt),
      '<dl class="kv"><dt>Archivo</dt><dd>' + esc(v.source.fileName || '—') + '</dd><dt>Nota</dt><dd>' + esc(v.note || '—') + '</dd></dl>' +
      (rows ? '<div class="tablewrap" style="margin-top:12px"><table><thead><tr><th>Resultado</th><th>Actividad</th><th>Detalle</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="notice">Esta versión no aplicó cambios.</div>'), { wide: true });
  };
  ui.actions['version-revert'] = function (el) {
    var chk = P.canRevert(ui.db, el.dataset.id);
    if (!chk.ok) { ui.toast(chk.reason, 'err'); return; }
    var msg = 'Se deshará esta importación: se restauran las fechas y el orden anteriores y se quitan las actividades que creó. El seguimiento real (avance, fechas reales, observaciones) no se toca.';
    if (chk.trackedNew) msg += '\n\nOJO: ' + chk.trackedNew + ' actividad(es) creada(s) por esta importación ya tienen seguimiento y se perderá.';
    if (chk.laterManualEdits) msg += '\n\nAviso: hay ' + chk.laterManualEdits + ' cambio(s) manual(es) de fechas posteriores en actividades afectadas; se sobrescribirán.';
    if (!confirm(msg + '\n\n¿Deshacer la importación?')) return;
    P.revertVersion(ui.db, el.dataset.id); ui.persist(); ui.toast('Importación deshecha.'); ui.render({ keepScroll: true });
  };

  /* ---------- Asistente de importación ---------- */
  var wz = null;
  function colLetter(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function sheet() { return wz.wb.sheets[wz.sheetIdx]; }

  function autoSetup() {
    var g = sheet().grid, h = I.detectHeaderRow(g);
    wz.headerRow = h.index; wz.headerConfident = h.confident;
    wz.mapping = I.guessMapping(g[h.index] || []);
    var vals = I.columnValues(g, h.index, wz.mapping.start).concat(I.columnValues(g, h.index, wz.mapping.end));
    wz.dateInfo = U.detectDateOrder(vals); wz.dateOrder = wz.dateInfo.order;
  }
  function readMappingFromDom() {
    document.querySelectorAll('[data-change="wz-map"]').forEach(function (s) { wz.mapping[s.dataset.field] = s.value === '' ? null : +s.value; });
  }

  ui.actions['import-pick'] = function () { var f = document.getElementById('importFile'); f.value = ''; f.click(); };
  ui.changes['import-file'] = function (el) {
    var file = el.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onerror = function () { ui.toast('No se pudo leer el archivo.', 'err'); };
    reader.onload = function () {
      try {
        var wb = I.readWorkbook(reader.result, file.name, { XLSX: window.XLSX });
        var best = 0; wb.sheets.forEach(function (s, i) { if (s.rows > wb.sheets[best].rows) best = i; });
        wz = { fileName: file.name, wb: wb, sheetIdx: best, step: 1, rows: null, diff: null, selection: {}, note: '', durMode: 'working', showUnchanged: false };
        autoSetup(); renderWizard();
      } catch (err) { ui.toast('No se pudo leer el archivo: ' + err.message, 'err'); }
    };
    reader.readAsArrayBuffer(file);
  };

  function stepsBar(n) {
    return '<div class="steps">' + ['1 · Archivo y columnas', '2 · Revisar datos', '3 · Comparar y confirmar'].map(function (t, i) { return '<span class="' + (i + 1 === n ? 'on' : '') + '">' + t + '</span>'; }).join('') + '</div>';
  }
  function renderWizard() {
    var body = wz.step === 1 ? step1() : (wz.step === 2 ? step2() : step3());
    ui.modal('Importar planning · ' + ui.projectName(ui.activeProject().id), stepsBar(wz.step) + body, { wide: true });
  }

  function step1() {
    var sh = sheet(), g = sh.grid, hdr = g[wz.headerRow] || [];
    var cols = []; var maxC = 0; g.forEach(function (r) { maxC = Math.max(maxC, r.length); });
    for (var c = 0; c < maxC; c++) {
      var any = hdr[c] !== null && hdr[c] !== undefined;
      for (var r = wz.headerRow + 1; r < Math.min(g.length, wz.headerRow + 25) && !any; r++) if (g[r][c] !== null && g[r][c] !== undefined) any = true;
      if (any) cols.push(c);
    }
    var optsFor = function (field) {
      return '<option value="">— No importar —</option>' + cols.map(function (c) {
        var label = colLetter(c) + (hdr[c] !== null && hdr[c] !== undefined ? ' · ' + String(hdr[c]).slice(0, 34) : ' · (sin título)');
        return '<option value="' + c + '"' + (wz.mapping[field] === c ? ' selected' : '') + '>' + esc(label) + '</option>';
      }).join('');
    };
    var info = 'Archivo: <b>' + esc(wz.fileName) + '</b>' + (wz.wb.kind === 'csv' ? ' · CSV (' + esc(wz.wb.meta.encoding) + ', separador «' + (wz.wb.meta.delimiter === '\t' ? 'tabulador' : esc(wz.wb.meta.delimiter)) + '»)' : '') + ' · ' + sh.rows + ' filas con datos.';
    var from = Math.max(0, wz.headerRow - 2), prev = g.slice(from, from + 14);
    var pc = cols.slice(0, 12);
    var dateWarn = wz.dateInfo && wz.dateInfo.conflicting ? '<div class="notice warn">Las fechas de la hoja mezclan formatos día/mes y mes/día. Revisa la columna de fechas.</div>' : '';
    return '<div class="notice">' + info + '</div>' +
      (wz.headerConfident ? '' : '<div class="notice warn">No he reconocido claramente la fila de encabezados. Indica en qué fila están los títulos de las columnas.</div>') + dateWarn +
      '<div class="toolbar">' +
      (wz.wb.sheets.length > 1 ? '<label class="smalltxt muted">Hoja <select data-change="wz-sheet">' + wz.wb.sheets.map(function (s, i) { return '<option value="' + i + '"' + (i === wz.sheetIdx ? ' selected' : '') + '>' + esc(s.name) + ' (' + s.rows + ' filas)</option>'; }).join('') + '</select></label>' : '') +
      '<label class="smalltxt muted">Fila de encabezados <input type="number" min="1" max="' + g.length + '" style="min-width:70px;width:80px" value="' + (wz.headerRow + 1) + '" data-change="wz-header"></label>' +
      '<label class="smalltxt muted">Fechas ambiguas <select data-change="wz-date"><option value="dmy"' + (wz.dateOrder === 'dmy' ? ' selected' : '') + '>día/mes/año (España)</option><option value="mdy"' + (wz.dateOrder === 'mdy' ? ' selected' : '') + '>mes/día/año</option></select></label>' +
      '<label class="smalltxt muted">Si falta el fin, usar duración en <select data-change="wz-dur"><option value="working"' + (wz.durMode === 'working' ? ' selected' : '') + '>días laborables (L-V)</option><option value="calendar"' + (wz.durMode === 'calendar' ? ' selected' : '') + '>días naturales</option><option value="none"' + (wz.durMode === 'none' ? ' selected' : '') + '>no calcular</option></select></label></div>' +
      '<div class="paneltitle" style="margin:6px 0">Correspondencia de columnas</div><div class="mapping">' +
      I.FIELDS.map(function (f) { return '<div class="field"><label>' + esc(I.FIELD_LABELS[f]) + (f === 'name' ? ' *' : '') + '</label><select data-change="wz-map" data-field="' + f + '">' + optsFor(f) + '</select></div>'; }).join('') + '</div>' +
      '<div class="smalltxt muted" style="margin-bottom:6px">Las columnas «real», «base» o «previsto» de avance se ignoran automáticamente. El avance del archivo solo se usa como valor inicial de actividades NUEVAS; nunca pisa el seguimiento existente.</div>' +
      '<div class="paneltitle" style="margin:10px 0 6px">Vista previa del archivo</div><div class="tablewrap"><table class="gridprev"><thead><tr><th>Fila</th>' + pc.map(function (c) { return '<th>' + colLetter(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      prev.map(function (row, i) {
        var rn = from + i;
        return '<tr class="' + (rn === wz.headerRow ? 'hdr' : '') + '"><td class="rn">' + (rn + 1) + '</td>' + pc.map(function (c) { return '<td>' + esc(row[c] === null || row[c] === undefined ? '' : row[c]) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="table-actions" style="margin-top:16px"><button class="btn primary" data-act="wz-next1">Siguiente: revisar datos</button><button class="btn" data-act="close-modal">Cancelar</button></div>';
  }
  ui.changes['wz-sheet'] = function (el) { wz.sheetIdx = +el.value; autoSetup(); renderWizard(); };
  ui.changes['wz-header'] = function (el) {
    var g = sheet().grid, n = U.clamp((+el.value || 1) - 1, 0, g.length - 1);
    wz.headerRow = n; wz.headerConfident = true; wz.mapping = I.guessMapping(g[n] || []); renderWizard();
  };
  ui.changes['wz-date'] = function (el) { readMappingFromDom(); wz.dateOrder = el.value; };
  ui.changes['wz-dur'] = function (el) { readMappingFromDom(); wz.durMode = el.value; };
  ui.changes['wz-map'] = function () { readMappingFromDom(); };

  ui.actions['wz-next1'] = function () {
    readMappingFromDom();
    if (wz.mapping.name === null || wz.mapping.name === undefined) { ui.toast('Tienes que indicar qué columna contiene la actividad / descripción.', 'err'); return; }
    wz.parsed = I.buildRows(sheet().grid, wz.headerRow, wz.mapping, { dateOrder: wz.dateOrder, durationMode: wz.durMode });
    wz.rows = wz.parsed.rows; wz.step = 2; renderWizard();
  };
  ui.actions['wz-back'] = function () { wz.step = wz.step - 1; renderWizard(); };

  function step2() {
    var res = wz.parsed, st = res.stats, rows = res.rows;
    var head = '<div class="notice"><b>' + st.total + '</b> filas leídas: ' + st.chapters + ' capítulos, ' + st.activities + ' actividades, ' + st.milestones + ' hitos' + (st.minDate ? ' · del ' + fmt(st.minDate) + ' al ' + fmt(st.maxDate) : '') + '.</div>';
    var warn = res.warnings.length ? '<div class="notice warn"><b>' + res.warnings.length + ' aviso(s)</b> (puedes continuar; revisa las filas marcadas):<br>' + res.warnings.slice(0, 8).map(function (w) { return esc(w.text); }).join('<br>') + (res.warnings.length > 8 ? '<br>… y ' + (res.warnings.length - 8) + ' más.' : '') + '</div>' : '';
    var none = st.activities + st.milestones === 0 ? '<div class="notice err">No se ha encontrado ninguna actividad. Vuelve atrás y revisa la fila de encabezados y las columnas.</div>' : '';
    return head + warn + none + '<div class="tablewrap" style="max-height:48vh"><table><thead><tr><th>Fila</th><th>Tipo</th><th>Código</th><th>Descripción</th><th>Inicio</th><th>Fin</th><th>Días</th><th>Avance</th><th>Avisos</th></tr></thead><tbody>' +
      rows.slice(0, 500).map(function (r) {
        return '<tr class="' + (r.kind === 'chapter' ? 'chapter ' : '') + (r.warnings.length ? 'warnrow' : '') + '"><td>' + r.rowNo + '</td><td>' + esc(KIND_LABEL[r.kind]) + '</td><td>' + esc(r.code) + '</td><td>' + indent(r.level) + esc(r.name) + '</td><td>' + fmt(r.start) + '</td><td>' + fmt(r.end) + '</td><td>' + (r.duration || '') + '</td><td>' + (r.progress === null ? '' : r.progress + '%') + '</td><td>' + esc(r.warnings.join('; ')) + '</td></tr>';
      }).join('') + '</tbody></table></div>' + (rows.length > 500 ? '<div class="meta">Mostrando las primeras 500 de ' + rows.length + ' filas.</div>' : '') +
      '<div class="table-actions" style="margin-top:16px"><button class="btn" data-act="wz-back">Atrás</button><button class="btn primary" data-act="wz-next2"' + (none ? ' disabled' : '') + '>Siguiente: comparar con el planning actual</button><button class="btn" data-act="close-modal">Cancelar</button></div>';
  }
  ui.actions['wz-next2'] = function () {
    var p = ui.activeProject();
    wz.diff = P.diffImport(P.projectActs(ui.db, p.id), wz.rows);
    wz.selection = {}; wz.diff.items.forEach(function (it) { wz.selection[it.key] = it.defaultSelected; });
    wz.step = 3; renderWizard();
  };

  var TYPE_PILL = { new: ['Nueva', 'green'], modified: ['Modificada', 'amber'], unchanged: ['Sin cambios', ''], removed: ['No está en el archivo', 'red'], restored: ['Reaparece', 'blue'] };
  function step3() {
    var p = ui.activeProject(), existing = P.projectActs(ui.db, p.id), d = wz.diff, s = d.summary, first = existing.length === 0;
    var visible = d.items.filter(function (it) { return wz.showUnchanged || it.type !== 'unchanged'; });
    var intro = first ? '<div class="notice"><b>Primera importación de esta obra.</b> Se creará la <b>versión 1 (línea base)</b> con ' + s.new + ' filas. Las fechas se guardan como planning base y no se modificarán nunca; los cambios posteriores quedarán como versiones.</div>' :
      '<div class="notice"><b>Reimportación.</b> Esto es lo que cambiaría respecto al planning actual. <b>El avance real, las fechas reales y las observaciones no se tocan.</b> La línea base original tampoco. Desmarca lo que no quieras aplicar.</div>';
    var chips = ui.pill(s.new + ' nuevas', s.new ? 'green' : '') + ' ' + ui.pill(s.modified + ' modificadas', s.modified ? 'amber' : '') + ' ' + ui.pill(s.removed + ' no están en el archivo', s.removed ? 'red' : '') + ' ' + ui.pill(s.restored + ' reaparecen', s.restored ? 'blue' : '') + ' ' + ui.pill(s.unchanged + ' sin cambios');
    var removedNote = s.removed ? '<div class="notice warn">Las <b>' + s.removed + '</b> actividades que no aparecen en el archivo NO se marcan como eliminadas por defecto (por si el archivo es parcial). Si quieres sacarlas del plan, márcalas: conservarán todo su seguimiento.</div>' : '';
    var rows = visible.map(function (it) {
      var tp = TYPE_PILL[it.type], name = it.row ? it.row.name : it.activity.name, kind = it.row ? it.row.kind : it.activity.kind, detail = '';
      if (it.type === 'new') detail = '<span class="muted">' + fmt(it.row.start) + ' → ' + fmt(it.row.end) + (it.row.progress ? ' · avance inicial ' + it.row.progress + '%' : '') + '</span>';
      else if (it.type === 'removed') detail = '<span class="muted">Tiene ' + (it.activity.progress || 0) + '% de avance' + (it.activity.notes ? ' y observaciones' : '') + ' que se conservan.</span>';
      else detail = it.changes.map(changeHtml).join('') + (it.type === 'restored' ? '<div class="muted">Estaba marcada como eliminada del plan.</div>' : '');
      return '<tr class="' + (kind === 'chapter' ? 'chapter' : '') + '"><td><input type="checkbox" data-change="wz-sel" data-key="' + esc(it.key) + '"' + (wz.selection[it.key] ? ' checked' : '') + '></td><td>' + ui.pill(tp[0], tp[1]) + '</td><td>' + indent(it.row ? it.row.level : it.activity.level) + esc(name) + '</td><td>' + detail + '</td></tr>';
    }).join('');
    return intro + '<div class="toolbar">' + chips + '</div>' + removedNote +
      '<div class="toolbar"><label class="smalltxt"><input type="checkbox" data-change="wz-unchanged"' + (wz.showUnchanged ? ' checked' : '') + '> Mostrar también las que no cambian</label>' +
      '<button class="btn small" data-act="wz-bulk" data-val="1">Marcar todo</button><button class="btn small" data-act="wz-bulk" data-val="0">Desmarcar todo</button>' +
      (s.removed ? '<button class="btn small" data-act="wz-bulk-removed">Marcar las que no están en el archivo</button>' : '') + '</div>' +
      '<div class="tablewrap" style="max-height:42vh"><table><thead><tr><th></th><th>Resultado</th><th>Actividad</th><th>Detalle</th></tr></thead><tbody>' + (rows || '<tr><td colspan="4" class="empty">No hay diferencias con el planning actual.</td></tr>') + '</tbody></table></div>' +
      '<div class="field" style="margin-top:14px"><label>Nota de la versión (opcional)</label><input class="inline-input" id="wzNote" placeholder="Ej.: planning revisado tras reunión del 24/11" value="' + esc(wz.note) + '"></div>' +
      '<div class="notice">Se creará la <b>versión ' + P.nextVersionNumber(ui.db, p.id) + '</b>. Podrás verla y compararla en «Versiones del planning», y deshacerla mientras sea la última.</div>' +
      '<div class="table-actions"><button class="btn" data-act="wz-back">Atrás</button><button class="btn primary" data-act="wz-confirm">Confirmar y crear versión ' + P.nextVersionNumber(ui.db, p.id) + '</button><button class="btn" data-act="close-modal">Cancelar</button></div>';
  }
  ui.changes['wz-sel'] = function (el) { wz.selection[el.dataset.key] = el.checked; };
  ui.changes['wz-unchanged'] = function (el) { wz.note = (document.getElementById('wzNote') || {}).value || ''; wz.showUnchanged = el.checked; renderWizard(); };
  ui.actions['wz-bulk'] = function (el) {
    wz.note = (document.getElementById('wzNote') || {}).value || '';
    wz.diff.items.forEach(function (it) { if (it.type !== 'removed' || el.dataset.val === '0') wz.selection[it.key] = el.dataset.val === '1'; }); renderWizard();
  };
  ui.actions['wz-bulk-removed'] = function () {
    wz.note = (document.getElementById('wzNote') || {}).value || '';
    wz.diff.items.forEach(function (it) { if (it.type === 'removed') wz.selection[it.key] = true; }); renderWizard();
  };
  ui.actions['wz-confirm'] = function () {
    var p = ui.activeProject(), hdr = sheet().grid[wz.headerRow] || [], mapNames = {};
    Object.keys(wz.mapping).forEach(function (f) { mapNames[f] = wz.mapping[f] === null ? null : String(hdr[wz.mapping[f]] || colLetter(wz.mapping[f])); });
    var first = P.projectActs(ui.db, p.id).length === 0;
    var v = P.applyImport(ui.db, p.id, wz.rows, wz.diff, wz.selection, { fileName: wz.fileName, sheet: sheet().name, mapping: mapNames, note: (document.getElementById('wzNote') || {}).value || '' }, new Date().toISOString());
    ui.persist(); ui.closeModal();
    ui.state.planningTab = first ? 'gantt' : 'versions'; ui.state.cmpA = null; ui.state.cmpB = null;
    ui.toast('Versión ' + v.number + ' creada: ' + v.summary.new + ' nuevas, ' + v.summary.modified + ' modificadas, ' + v.summary.removed + ' eliminadas del plan. El seguimiento real no se ha tocado.');
    wz = null; ui.render();
  };
})();
