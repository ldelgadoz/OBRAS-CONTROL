/* OBRA CONTROL · subcontratas, compras, diario, actas y agenda.
 * En esta fase solo se han unificado y se les ha añadido la edición; su ampliación llega en las fases 4 y 5. */
(function () {
  'use strict';
  var U = OC.util, ui = OC.ui, esc = ui.esc, fmt = ui.fmt;

  var MODS = {
    subs: {
      page: 'subcontratas', title: 'Subcontratas', kicker: 'GESTIÓN DE GREMIOS', sub: 'Controla las empresas, gremios y estados de contratación.', add: 'Añadir subcontrata',
      cols: [['trade', 'Gremio'], ['company', 'Empresa'], ['status', 'Estado', 'status'], ['start', 'Inicio previsto', 'date'], ['end', 'Fin previsto', 'date']],
      form: [['trade', 'Gremio'], ['company', 'Empresa'], ['status', 'Estado', 'select', ['Por solicitar', 'Pendiente', 'Contratada']], ['start', 'Inicio previsto', 'date'], ['end', 'Fin previsto', 'date']]
    },
    orders: {
      page: 'compras', title: 'Compras y materiales', kicker: 'SUMINISTROS', sub: 'Controla qué hay que pedir, cuándo debe llegar y si se ha recibido.', add: 'Añadir pedido',
      cols: [['material', 'Material'], ['supplier', 'Proveedor'], ['orderBy', 'Pedir antes de', 'date'], ['needed', 'Necesario en obra', 'date'], ['status', 'Estado', 'status']],
      form: [['material', 'Material'], ['supplier', 'Proveedor'], ['orderBy', 'Fecha límite de pedido', 'date'], ['needed', 'Fecha necesaria en obra', 'date'], ['delivered', 'Fecha de recepción', 'date'], ['status', 'Estado', 'select', ['Pendiente de solicitar', 'Solicitado', 'Confirmado', 'Recibido parcialmente', 'Recibido']]]
    },
    diary: {
      page: 'diario', title: 'Diario de obra', kicker: 'PRODUCCIÓN', sub: 'Registra visitas, trabajos ejecutados, incidencias y observaciones.', add: 'Nuevo parte',
      cols: [['date', 'Fecha', 'date'], ['works', 'Trabajos realizados'], ['companies', 'Empresas presentes'], ['issues', 'Incidencias']],
      form: [['date', 'Fecha', 'date'], ['companies', 'Empresas presentes'], ['works', 'Trabajos realizados', 'textarea'], ['issues', 'Incidencias / pendientes', 'textarea'], ['photos', 'Referencia a fotografías / archivos']]
    },
    minutes: {
      page: 'actas', title: 'Actas y compromisos', kicker: 'REUNIONES', sub: 'Registra reuniones y convierte los acuerdos en acciones con fecha límite.', add: 'Nueva acta',
      cols: [['date', 'Fecha', 'date'], ['title', 'Reunión'], ['actions', 'Compromiso / acuerdo'], ['due', 'Fecha límite', 'date'], ['status', 'Estado', 'status']],
      form: [['date', 'Fecha', 'date'], ['title', 'Título de reunión'], ['attendees', 'Asistentes'], ['topics', 'Temas tratados', 'textarea'], ['actions', 'Acuerdos y compromisos', 'textarea'], ['due', 'Fecha límite principal', 'date'], ['status', 'Estado', 'select', ['Pendiente', 'En curso', 'Completado']]]
    }
  };

  function cell(x, c) {
    var v = x[c[0]];
    if (c[2] === 'status') return ui.statusPill(v);
    if (c[2] === 'date') return fmt(v);
    return esc(v || '—');
  }

  Object.keys(MODS).forEach(function (coll) {
    var m = MODS[coll];
    ui.pages[m.page] = {
      title: m.title,
      render: function () {
        var p = ui.activeProject();
        var head = ui.header(m.kicker, m.title, m.sub, p ? '<button class="btn primary" data-act="gen-add" data-coll="' + coll + '">＋ ' + m.add + '</button>' : '');
        if (!p) return head + '<div class="panel empty">Crea una obra para empezar a registrar información.</div>';
        var list = ui.db[coll].filter(function (x) { return x.projectId === p.id; });
        if (coll === 'diary' || coll === 'minutes') list = list.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
        return head + '<div class="toolbar">' + ui.projectSelect() + '</div><div class="panel"><div class="tablewrap"><table><thead><tr>' + m.cols.map(function (c) { return '<th>' + c[1] + '</th>'; }).join('') + '<th></th></tr></thead><tbody>' +
          (list.map(function (x) {
            return '<tr>' + m.cols.map(function (c, i) { return '<td>' + cell(x, c) + (i === 0 ? ui.demoPill(x) : '') + '</td>'; }).join('') +
              '<td><div class="table-actions"><button class="btn small" data-act="gen-edit" data-coll="' + coll + '" data-id="' + esc(x.id) + '">Editar</button><button class="btn small danger" data-act="gen-del" data-coll="' + coll + '" data-id="' + esc(x.id) + '">Eliminar</button></div></td></tr>';
          }).join('') || '<tr><td colspan="' + (m.cols.length + 1) + '" class="empty">Todavía no hay registros. Añade el primero.</td></tr>') + '</tbody></table></div></div>';
      }
    };
  });

  function openGeneric(coll, id) {
    var m = MODS[coll], x = ui.db[coll].filter(function (r) { return r.id === id; })[0] || {};
    var form = m.form.map(function (f) {
      var k = f[0], type = f[2], val = x[k] !== undefined ? x[k] : (type === 'date' && k === 'date' ? ui.today() : ''), input;
      if (type === 'select') input = '<select name="' + k + '">' + f[3].map(function (o) { return '<option' + (val === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>';
      else if (type === 'textarea') input = '<textarea name="' + k + '">' + esc(val) + '</textarea>';
      else input = '<input name="' + k + '"' + (type === 'date' ? ' type="date"' : '') + ' value="' + esc(val) + '">';
      return '<div class="field ' + (type === 'textarea' ? 'span2' : '') + '"><label>' + f[1] + '</label>' + input + '</div>';
    }).join('');
    ui.modal((id ? 'Editar · ' : 'Nuevo · ') + m.title, '<form data-form="generic"><input type="hidden" name="__coll" value="' + coll + '"><input type="hidden" name="__id" value="' + esc(id || '') + '"><div class="formgrid">' + form + '</div><button class="btn primary">Guardar</button></form>');
  }
  ui.actions['gen-add'] = function (el) { openGeneric(el.dataset.coll, ''); };
  ui.actions['gen-edit'] = function (el) { openGeneric(el.dataset.coll, el.dataset.id); };
  ui.actions['gen-del'] = function (el) {
    if (!confirm('¿Eliminar este registro?')) return;
    var coll = el.dataset.coll;
    ui.db[coll] = ui.db[coll].filter(function (x) { return x.id !== el.dataset.id; });
    ui.persist(); ui.render({ keepScroll: true });
  };
  ui.forms['generic'] = function (form, fd) {
    var v = {}; fd.forEach(function (val, k) { v[k] = val; });
    var coll = v.__coll, id = v.__id; delete v.__coll; delete v.__id;
    if (id) Object.assign(ui.db[coll].filter(function (x) { return x.id === id; })[0], v);
    else ui.db[coll].push(Object.assign({ id: U.uid(), projectId: ui.activeProject().id }, v));
    ui.persist(); ui.closeModal(); ui.render({ keepScroll: true });
  };

  /* ---------- Agenda y alertas ---------- */
  var LEVEL_LABEL = { red: 'Urgente', amber: 'Revisar', blue: 'Próximo' };
  ui.pages.agenda = {
    title: 'Agenda y alertas',
    render: function () {
      var a = ui.alerts();
      return ui.header('ORGANIZACIÓN', 'Agenda y alertas', 'Avisos derivados de fechas de planning, pedidos, contrataciones y compromisos.') +
        '<div class="panel"><div class="panelhead"><div class="paneltitle">Alertas activas</div>' + ui.pill(a.length + ' avisos', a.length ? 'amber' : 'green') + '</div>' +
        (a.map(function (x) {
          return '<div class="listrow"><div><div class="name">' + esc(x.title) + '</div><div class="meta">' + esc(x.kind) + ' · ' + esc(x.detail) + '</div></div>' + ui.pill(LEVEL_LABEL[x.level], x.level) + '</div>';
        }).join('') || '<div class="empty">No hay alertas pendientes.</div>') + '</div>' +
        '<div class="notice">En esta versión las alertas se calculan al abrir la aplicación y se muestran dentro de ella. No hay notificaciones push ni correos automáticos.</div>';
    }
  };
})();
