/* OBRA CONTROL · núcleo de la interfaz: estado, render, modales, eventos y avisos globales. */
(function () {
  'use strict';
  var U = OC.util, P = OC.planning, S = OC.store;

  var store = S.createStore(window.localStorage);
  var ui = OC.ui = {
    store: store, pages: {}, actions: {}, changes: {}, inputs: {}, forms: {},
    state: { page: 'dashboard', projectId: '', planningTab: 'gantt', zoom: 'week', noticeDismissed: false },
    NAV: [['dashboard', '▦', 'Panel general'], ['obras', '▤', 'Mis obras'], ['planning', '▥', 'Planning'], ['subcontratas', '⌂', 'Subcontratas'],
      ['compras', '▣', 'Compras y materiales'], ['diario', '☷', 'Diario de obra'], ['actas', '▤', 'Actas y compromisos'], ['agenda', '◷', 'Agenda y alertas'], ['datos', '⛁', 'Datos y copias']],
    esc: U.esc, fmt: U.fmtDate
  };
  Object.defineProperty(ui, 'db', { get: function () { return store.db; } });
  var esc = ui.esc;

  ui.today = function () { return U.todayISO(); };
  ui.persist = function () {
    var r = store.save();
    if (!r.ok) ui.toast(r.error, 'err');
    return r.ok;
  };
  ui.projectName = function (id) {
    var p = ui.db.projects.filter(function (x) { return x.id === id; })[0];
    return p ? p.name : '—';
  };
  ui.activeProject = function () {
    var db = ui.db;
    var p = db.projects.filter(function (x) { return x.id === ui.state.projectId; })[0];
    if (!p && db.projects.length) { p = db.projects[0]; ui.state.projectId = p.id; }
    return p || null;
  };
  ui.pill = function (text, cls) { return '<span class="pill ' + (cls || '') + '">' + esc(text) + '</span>'; };
  ui.demoPill = function (x) { return x && x.demo ? ' <span class="pill demo">Ejemplo</span>' : ''; };
  var STATUS_CLS = { 'Finalizado': 'green', 'Finalizada': 'green', 'Contratada': 'green', 'Recibido': 'green', 'Completado': 'green', 'En curso': 'blue', 'En ejecución': 'blue', 'Solicitado': 'blue', 'Confirmado': 'blue',
    'Retrasado': 'red', 'Bloqueado': 'amber', 'Pendiente': 'amber', 'Pendiente de solicitar': 'amber', 'Por solicitar': 'amber', 'Recibido parcialmente': 'amber', 'Suspendida': 'amber' };
  ui.statusPill = function (s) { return ui.pill(s || 'Sin estado', STATUS_CLS[s] || ''); };
  ui.header = function (k, title, sub, action) {
    return '<div class="pagehead"><div><div class="eyebrow">' + esc(k) + '</div><div class="h1">' + esc(title) + '</div><div class="sub">' + esc(sub) + '</div></div>' + (action || '') + '</div>';
  };
  ui.projectSelect = function () {
    var cur = ui.activeProject();
    return '<select data-change="project-select" aria-label="Seleccionar obra">' + ui.db.projects.map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (cur && p.id === cur.id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }).join('') + '</select>';
  };
  ui.download = function (data, name, type) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: type });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };

  /* ---------- Avisos globales ---------- */
  ui.banners = function () {
    var out = '', db = ui.db;
    if (store.notice && !ui.state.noticeDismissed) {
      out += '<div class="notice ' + (store.status === 'corrupt' ? 'err' : '') + '"><span>' + esc(store.notice) + '</span><button class="btn small" data-act="dismiss-notice">Entendido</button></div>';
    }
    if (store.hasDemo()) {
      out += '<div class="notice"><span>Hay <b>datos de ejemplo</b> (marcados «Ejemplo»). Puedes editarlos o quitarlos todos cuando quieras empezar con tus obras.</span><button class="btn small" data-act="remove-demo">Eliminar datos de ejemplo</button></div>';
    }
    var real = db.projects.some(function (p) { return !p.demo; });
    var last = db.meta && db.meta.lastBackupAt;
    if (real) {
      var days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null;
      if (days === null || days >= 7) {
        out += '<div class="notice warn"><span>' + (days === null ? 'Todavía no has descargado ninguna copia de seguridad.' : 'Tu última copia de seguridad es de hace ' + days + ' días.') +
          ' Los datos solo están en este navegador.</span><button class="btn small" data-act="download-backup">Descargar copia</button></div>';
      }
    }
    return out;
  };

  /* ---------- Render ---------- */
  ui.render = function (opts) {
    var s = ui.state, page = ui.pages[s.page], y = window.scrollY;
    document.getElementById('crumb').textContent = page.title;
    document.querySelectorAll('#nav button').forEach(function (b) { b.classList.toggle('active', b.dataset.page === s.page); });
    document.getElementById('banners').innerHTML = ui.banners();
    document.getElementById('view').innerHTML = page.render();
    if (page.after) page.after();
    if (opts && opts.keepScroll) window.scrollTo(0, y);
  };
  ui.go = function (p, extra) {
    ui.state.page = p;
    if (extra) Object.keys(extra).forEach(function (k) { ui.state[k] = extra[k]; });
    ui.render();
    window.scrollTo(0, 0);
  };

  /* ---------- Modal y avisos ---------- */
  ui.modal = function (title, html, opts) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('modalbox').classList.toggle('wide', !!(opts && opts.wide));
    document.getElementById('modalback').classList.add('show');
  };
  ui.closeModal = function () { document.getElementById('modalback').classList.remove('show'); document.getElementById('modalBody').innerHTML = ''; };
  var toastTimer;
  ui.toast = function (msg, type) {
    var t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.className = 'toast' + (type === 'err' ? ' err' : ''); t.textContent = msg; t.style.display = 'block';
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.style.display = 'none'; }, type === 'err' ? 7000 : 3500);
  };

  /* ---------- Eventos (delegación: sin onclick incrustados) ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) { if (e.target.id === 'modalback') ui.closeModal(); return; }
    var fn = ui.actions[el.dataset.act];
    if (fn) fn(el, e);
  });
  document.addEventListener('change', function (e) {
    var el = e.target.closest('[data-change]');
    if (el && ui.changes[el.dataset.change]) ui.changes[el.dataset.change](el, e);
  });
  document.addEventListener('input', function (e) {
    var el = e.target.closest('[data-input]');
    if (el && ui.inputs[el.dataset.input]) ui.inputs[el.dataset.input](el, e);
  });
  document.addEventListener('submit', function (e) {
    var f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    if (ui.forms[f.dataset.form]) ui.forms[f.dataset.form](f, new FormData(f));
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') ui.closeModal(); });

  ui.actions['close-modal'] = ui.closeModal;
  ui.actions['go'] = function (el) { ui.go(el.dataset.page); };
  ui.actions['dismiss-notice'] = function () { ui.state.noticeDismissed = true; ui.render({ keepScroll: true }); };
  ui.actions['remove-demo'] = function () {
    if (!confirm('Se eliminarán todos los datos marcados como «Ejemplo» (obra demo, actividades, subcontratas, pedidos, diario y actas de ejemplo). Tus propios datos no se tocan. ¿Continuar?')) return;
    var r = store.removeDemo();
    if (!r.ok) ui.toast(r.error, 'err');
    ui.state.projectId = ''; ui.render();
  };
  ui.changes['project-select'] = function (el) { ui.state.projectId = el.value; ui.render(); };
})();
