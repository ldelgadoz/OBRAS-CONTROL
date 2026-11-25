/* OBRA CONTROL · panel general y gestión de obras. */
(function () {
  'use strict';
  var U = OC.util, P = OC.planning, ui = OC.ui, esc = ui.esc, fmt = ui.fmt;

  var PROJECT_TYPES = ['Reforma de local comercial', 'Reforma de vivienda', 'Acondicionamiento de local', 'Rehabilitación', 'Otro'];
  var PROJECT_STATUS = ['Planificada', 'En ejecución', 'Finalizada', 'Suspendida'];

  /* ---------- Alertas (se calculan al abrir; sin notificaciones en segundo plano) ---------- */
  ui.alerts = function () {
    var db = ui.db, t = ui.today(), a = [], in7 = U.addDays(t, 7), in14 = U.addDays(t, 14);
    var live = {}; db.projects.forEach(function (p) { if (p.status !== 'Finalizada' && p.status !== 'Suspendida') live[p.id] = p; });
    db.projects.forEach(function (p) {
      if (!live[p.id]) return;
      P.leaves(P.projectActs(db, p.id)).forEach(function (act) {
        var m = P.activityMetrics(act, t);
        if (m.late) a.push({ kind: 'Planning', title: act.name, detail: p.name + ' · Fin previsto ' + fmt(act.end) + ' · ' + m.delay + ' d de retraso', level: 'red', rank: 0 });
        else if (m.startDelay > 0) a.push({ kind: 'Planning', title: 'Debería haber empezado: ' + act.name, detail: p.name + ' · Inicio previsto ' + fmt(act.start), level: 'amber', rank: 2 });
        else if (!m.finished && !(act.progress > 0) && act.start && act.start >= t && act.start <= in7) a.push({ kind: 'Planning', title: 'Empieza pronto: ' + act.name, detail: p.name + ' · Inicio ' + fmt(act.start), level: 'blue', rank: 4 });
      });
    });
    db.orders.forEach(function (o) {
      if (!live[o.projectId]) return;
      if (o.status === 'Pendiente de solicitar' && o.orderBy && o.orderBy <= in7) a.push({ kind: 'Pedido', title: 'Solicitar ' + o.material, detail: ui.projectName(o.projectId) + ' · Fecha límite ' + fmt(o.orderBy), level: o.orderBy < t ? 'red' : 'amber', rank: o.orderBy < t ? 1 : 3 });
      if (o.status !== 'Recibido' && !o.delivered && o.needed && o.needed < t) a.push({ kind: 'Material', title: 'No ha llegado: ' + o.material, detail: ui.projectName(o.projectId) + ' · Necesario el ' + fmt(o.needed), level: 'red', rank: 1 });
    });
    db.subs.forEach(function (s) {
      if (!live[s.projectId]) return;
      if (s.status !== 'Contratada' && s.status !== 'Finalizada' && s.start && s.start <= in14) a.push({ kind: 'Contratación', title: 'Contratar ' + s.trade, detail: ui.projectName(s.projectId) + ' · Inicio ' + fmt(s.start), level: s.start < t ? 'red' : 'amber', rank: s.start < t ? 1 : 3 });
    });
    db.minutes.forEach(function (m) {
      if (m.status !== 'Completado' && m.due && m.due < t) a.push({ kind: 'Compromiso', title: m.actions, detail: ui.projectName(m.projectId) + ' · Vencido ' + fmt(m.due), level: 'red', rank: 1 });
    });
    return a.sort(function (x, y) { return x.rank - y.rank; });
  };
  var LEVEL_LABEL = { red: 'Urgente', amber: 'Pendiente', blue: 'Próximo' };

  function greeting() { var h = new Date().getHours(); return h < 13 ? 'Buenos días' : (h < 21 ? 'Buenas tardes' : 'Buenas noches'); }

  function progressBar(m) {
    return '<div class="progress" title="Real ' + m.progress + '% · Previsto hoy ' + m.expected + '%"><span style="width:' + m.progress + '%"></span>' + (m.count ? '<i style="left:' + m.expected + '%"></i>' : '') + '</div>';
  }

  ui.pages.dashboard = {
    title: 'Panel general',
    render: function () {
      var db = ui.db, t = ui.today(), al = ui.alerts();
      var active = db.projects.filter(function (p) { return p.status === 'En ejecución'; });
      var planned = db.projects.filter(function (p) { return p.status === 'Planificada'; }).length;
      var late = 0;
      active.forEach(function (p) { late += P.projectMetrics(P.projectActs(db, p.id), t).late; });
      var orders = db.orders.filter(function (o) { return o.status === 'Pendiente de solicitar'; }).length;
      var subs = db.subs.filter(function (s) { return s.status !== 'Contratada' && s.status !== 'Finalizada'; }).length;
      var recent = [].concat(
        db.diary.map(function (x) { return { date: x.date, title: 'Diario: ' + x.works, projectId: x.projectId, demo: x.demo }; }),
        db.minutes.map(function (x) { return { date: x.date, title: 'Acta: ' + x.title, projectId: x.projectId, demo: x.demo }; }),
        db.planVersions.filter(function (v) { return !v.demo; }).map(function (v) { return { date: v.createdAt.slice(0, 10), title: 'Planning v' + v.number + ': ' + (v.source.fileName || 'cambio de planning'), projectId: v.projectId }; })
      ).sort(function (a, b) { return b.date.localeCompare(a.date); }).slice(0, 6);

      return ui.header('VISTA GENERAL', greeting() + '. Este es el estado de tus obras.', 'Un resumen operativo de actividad, planificación y próximos compromisos.', '<button class="btn primary" data-act="project-new">＋ Nueva obra</button>') +
        '<div class="cards">' +
        '<div class="card metric"><div class="label">Obras activas</div><div class="num">' + active.length + '</div><div class="hint">En ejecución' + (planned ? ' · ' + planned + ' planificada' + (planned > 1 ? 's' : '') : '') + '</div></div>' +
        '<div class="card metric"><div class="label">Actividades retrasadas</div><div class="num" style="color:' + (late ? 'var(--red)' : 'inherit') + '">' + late + '</div><div class="hint">Fin previsto pasado y sin terminar</div></div>' +
        '<div class="card metric"><div class="label">Pedidos por solicitar</div><div class="num">' + orders + '</div><div class="hint">Pendientes de gestión</div></div>' +
        '<div class="card metric"><div class="label">Contrataciones pendientes</div><div class="num">' + subs + '</div><div class="hint">Gremios sin adjudicar</div></div></div>' +
        '<div class="grid2"><div class="panel"><div class="panelhead"><div class="paneltitle">Obras en curso</div><button class="btn small" data-act="go" data-page="obras">Ver todas</button></div><div class="list">' +
        (active.length ? active.map(function (p) {
          var m = P.projectMetrics(P.projectActs(db, p.id), t);
          var dev = m.deviation, devTxt = m.count ? (dev < 0 ? '<span style="color:var(--red)">' + dev + ' pts vs. plan</span>' : (dev > 0 ? '<span style="color:#24734a">+' + dev + ' pts vs. plan</span>' : 'según plan')) : 'sin planning';
          return '<div class="listrow"><div style="flex:1"><div class="name">' + esc(p.name) + ui.demoPill(p) + '</div><div class="meta">' + esc(p.address || '') + ' · Fin previsto ' + fmt(p.end) + ' · ' + devTxt + '</div>' + progressBar(m) + '</div>' +
            '<div style="text-align:right"><b>' + m.progress + '%</b><div class="meta">real · ' + m.expected + '% previsto</div><button class="btn small" data-act="project-open" data-id="' + esc(p.id) + '">Abrir</button></div></div>';
        }).join('') : '<div class="empty">No hay obras en ejecución. Crea una obra o cambia el estado de una existente.</div>') +
        '</div></div>' +
        '<div class="panel"><div class="panelhead"><div class="paneltitle">Alertas y próximos pasos</div>' + ui.pill(al.length + ' avisos', al.length ? 'amber' : 'green') + '</div><div class="list">' +
        (al.slice(0, 7).map(function (x) {
          return '<div class="listrow"><div><div class="name">' + esc(x.title) + '</div><div class="meta">' + esc(x.kind) + ' · ' + esc(x.detail) + '</div></div>' + ui.pill(LEVEL_LABEL[x.level], x.level) + '</div>';
        }).join('') || '<div class="empty">No hay alertas pendientes.</div>') +
        (al.length > 7 ? '<div class="listrow"><button class="btn small" data-act="go" data-page="agenda">Ver las ' + al.length + ' alertas</button></div>' : '') + '</div></div></div>' +
        '<div class="panel"><div class="panelhead"><div class="paneltitle">Actividad reciente</div><span class="muted smalltxt">Últimos registros</span></div><div class="list">' +
        (recent.map(function (x) {
          return '<div class="listrow"><div><div class="name">' + esc(x.title) + ui.demoPill(x) + '</div><div class="meta">' + esc(ui.projectName(x.projectId)) + '</div></div><span class="muted smalltxt">' + fmt(x.date) + '</span></div>';
        }).join('') || '<div class="empty">La actividad registrada aparecerá aquí.</div>') + '</div></div>';
    }
  };

  /* ---------- Mis obras ---------- */
  ui.pages.obras = {
    title: 'Mis obras',
    render: function () {
      return ui.header('CARTERA', 'Mis obras', 'Crea y consulta tus obras. Cada obra agrupa planning, subcontratas, pedidos, diario y actas.', '<button class="btn primary" data-act="project-new">＋ Nueva obra</button>') +
        '<div class="panel"><div class="toolbar"><input id="projectSearch" data-input="project-filter" placeholder="Buscar obra…"><select id="projectFilter" data-change="project-filter"><option value="">Todos los estados</option>' +
        PROJECT_STATUS.map(function (s) { return '<option>' + s + '</option>'; }).join('') + '</select></div>' + projectTable() + '</div>';
    }
  };
  function projectTable() {
    var db = ui.db, t = ui.today();
    if (!db.projects.length) return '<div class="empty">No hay obras creadas. Pulsa «Nueva obra» para empezar.</div>';
    return '<div class="tablewrap"><table id="projectTable"><thead><tr><th>Obra</th><th>Cliente / ubicación</th><th>Tipo</th><th>Fechas</th><th>Avance real / previsto</th><th>Estado</th><th></th></tr></thead><tbody>' +
      db.projects.map(function (p) {
        var m = P.projectMetrics(P.projectActs(db, p.id), t);
        return '<tr data-name="' + esc(p.name.toLowerCase()) + '" data-status="' + esc(p.status) + '"><td><b>' + esc(p.name) + '</b>' + ui.demoPill(p) + '</td>' +
          '<td>' + esc(p.client || '—') + '<div class="meta">' + esc(p.address || '') + '</div></td><td>' + esc(p.type || '—') + '</td>' +
          '<td>' + fmt(p.start) + '<div class="meta">hasta ' + fmt(p.end) + '</div></td>' +
          '<td><b>' + m.progress + '%</b> <span class="muted">/ ' + m.expected + '%</span>' + progressBar(m) + '</td><td>' + ui.statusPill(p.status) + '</td>' +
          '<td><div class="table-actions"><button class="btn small" data-act="project-open" data-id="' + esc(p.id) + '">Abrir</button><button class="btn small" data-act="project-edit" data-id="' + esc(p.id) + '">Editar</button></div></td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function applyProjectFilter() {
    var s = document.getElementById('projectSearch'), f = document.getElementById('projectFilter');
    if (!s || !f) return;
    document.querySelectorAll('#projectTable tbody tr').forEach(function (r) {
      r.classList.toggle('hidden', !(r.dataset.name.indexOf(s.value.toLowerCase()) >= 0 && (!f.value || r.dataset.status === f.value)));
    });
  }
  ui.inputs['project-filter'] = applyProjectFilter;
  ui.changes['project-filter'] = applyProjectFilter;

  ui.actions['project-new'] = function () { openProject(''); };
  ui.actions['project-edit'] = function (el) { openProject(el.dataset.id); };
  ui.actions['project-open'] = function (el) { ui.go('planning', { projectId: el.dataset.id }); };

  function openProject(id) {
    var p = ui.db.projects.filter(function (x) { return x.id === id; })[0] || {};
    var opt = function (list, cur) { return list.map(function (s) { return '<option' + (cur === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join(''); };
    ui.modal(id ? 'Editar obra' : 'Nueva obra',
      '<form data-form="project"><input type="hidden" name="id" value="' + esc(id) + '"><div class="formgrid">' +
      '<div class="field span2"><label>Nombre de la obra *</label><input name="name" required value="' + esc(p.name || '') + '"></div>' +
      '<div class="field"><label>Cliente</label><input name="client" value="' + esc(p.client || '') + '"></div>' +
      '<div class="field"><label>Dirección / localidad</label><input name="address" value="' + esc(p.address || '') + '"></div>' +
      '<div class="field"><label>Tipo de obra</label><select name="type"><option value="">—</option>' + opt(PROJECT_TYPES, p.type) + '</select></div>' +
      '<div class="field"><label>Estado</label><select name="status">' + opt(PROJECT_STATUS, p.status || 'Planificada') + '</select></div>' +
      '<div class="field"><label>Fecha de inicio</label><input type="date" name="start" value="' + esc(p.start || ui.today()) + '"></div>' +
      '<div class="field"><label>Fin previsto</label><input type="date" name="end" value="' + esc(p.end || '') + '"></div>' +
      '<div class="field span2"><label>Observaciones</label><textarea name="notes">' + esc(p.notes || '') + '</textarea></div></div>' +
      '<div class="notice">La ficha de obra agrupa toda la información del proyecto. La documentación asociada llegará en una fase posterior.</div>' +
      '<div class="table-actions"><button class="btn primary">Guardar obra</button>' + (id ? '<button type="button" class="btn danger" data-act="project-delete" data-id="' + esc(id) + '">Eliminar obra…</button>' : '') + '</div></form>');
  }
  ui.forms['project'] = function (form, fd) {
    var v = {}; fd.forEach(function (val, k) { v[k] = val; });
    var id = v.id; delete v.id;
    if (id) { var p = ui.db.projects.filter(function (x) { return x.id === id; })[0]; Object.assign(p, v); }
    else { var np = Object.assign({ id: U.uid() }, v); ui.db.projects.push(np); ui.state.projectId = np.id; }
    ui.persist(); ui.closeModal(); ui.render();
  };
  ui.actions['project-delete'] = function (el) {
    var db = ui.db, id = el.dataset.id;
    var counts = ['activities', 'planVersions', 'subs', 'orders', 'diary', 'minutes'].map(function (k) { return db[k].filter(function (x) { return x.projectId === id; }).length; });
    if (!confirm('Vas a eliminar la obra «' + ui.projectName(id) + '» y TODO lo que contiene: ' + counts[0] + ' actividades, ' + counts[1] + ' versiones de planning, ' + counts[2] + ' subcontratas, ' + counts[3] + ' pedidos, ' + counts[4] + ' partes de diario y ' + counts[5] + ' actas.\n\nEsta acción no se puede deshacer. Si no tienes una copia de seguridad, cancela y descárgala antes en «Datos y copias».')) return;
    db.projects = db.projects.filter(function (x) { return x.id !== id; });
    ['activities', 'planVersions', 'subs', 'orders', 'diary', 'minutes'].forEach(function (k) { db[k] = db[k].filter(function (x) { return x.projectId !== id; }); });
    ui.state.projectId = ''; ui.persist(); ui.closeModal(); ui.render();
  };
})();
