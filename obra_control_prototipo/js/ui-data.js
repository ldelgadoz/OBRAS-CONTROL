/* OBRA CONTROL · datos y copias de seguridad. */
(function () {
  'use strict';
  var U = OC.util, S = OC.store, ui = OC.ui, esc = ui.esc;

  ui.pages.datos = {
    title: 'Datos y copias',
    render: function () {
      var db = ui.db, size = Math.round(JSON.stringify(db).length / 1024), last = db.meta && db.meta.lastBackupAt;
      var corrupt = ui.store.listCorrupt();
      return ui.header('SEGURIDAD', 'Datos y copias de seguridad', 'Tus datos se guardan solo en este navegador y este dispositivo. Descarga copias con regularidad.') +
        '<div class="panel"><div class="panelhead"><div class="paneltitle">Copia de seguridad completa</div></div>' +
        '<p class="muted">Un archivo JSON con todas tus obras, planning, versiones, subcontratas, pedidos, diario y actas. Úsalo para guardar una copia, o para pasar tus datos a otro navegador u ordenador.</p>' +
        '<div class="toolbar"><button class="btn primary" data-act="download-backup">↓ Descargar copia (JSON)</button>' +
        '<button class="btn" data-act="restore-pick">↑ Restaurar desde una copia…</button><input class="hidden" type="file" id="restoreFile" accept=".json,application/json" data-change="restore-file"></div>' +
        '<dl class="kv"><dt>Última copia</dt><dd>' + (last ? U.fmtDateTime(last) : 'Nunca') + '</dd><dt>Tamaño de los datos</dt><dd>' + size + ' KB (el navegador permite unos 5.000 KB)</dd>' +
        '<dt>Obras / actividades</dt><dd>' + db.projects.length + ' / ' + db.activities.length + '</dd><dt>Versiones de planning</dt><dd>' + db.planVersions.length + '</dd></dl></div>' +
        (corrupt.length ? '<div class="panel"><div class="panelhead"><div class="paneltitle">Copias de datos dañados conservadas</div></div><p class="muted">Se detectaron datos ilegibles y se guardaron aparte sin modificarlos. Descárgalos por si se pueden recuperar.</p>' +
          corrupt.map(function (k) { return '<div class="listrow"><span class="smalltxt">' + esc(k) + '</span><div class="table-actions"><button class="btn small" data-act="download-corrupt" data-key="' + esc(k) + '">Descargar</button><button class="btn small danger" data-act="delete-corrupt" data-key="' + esc(k) + '">Borrar</button></div></div>'; }).join('') + '</div>' : '') +
        '<div class="notice warn">Privacidad: no hay servidor, cuentas ni sincronización entre dispositivos. Borrar los datos del navegador borra la aplicación. Evita introducir datos personales o confidenciales hasta que exista la versión con acceso privado y base de datos.</div>';
    }
  };

  function stamp() { return U.todayISO(); }
  ui.actions['download-backup'] = function () {
    ui.download(S.exportBackup(ui.db), 'obra-control-copia-' + stamp() + '.json', 'application/json');
    ui.store.markBackup(); ui.render({ keepScroll: true });
  };
  ui.actions['restore-pick'] = function () { var f = document.getElementById('restoreFile'); f.value = ''; f.click(); };
  ui.changes['restore-file'] = function (el) {
    var file = el.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var r = S.parseBackup(String(reader.result));
      if (r.error) { ui.toast('No se puede restaurar: ' + r.error, 'err'); return; }
      var n = r.db.projects.length, a = r.db.activities.length;
      if (!confirm('Se van a REEMPLAZAR todos los datos actuales por los de la copia (' + n + ' obras, ' + a + ' actividades).\n\nLos datos actuales se guardan antes en una copia interna de seguridad, pero te recomiendo descargar una copia ahora si tienes dudas. ¿Restaurar?')) return;
      var res = ui.store.replace(r.db);
      if (!res.ok) ui.toast(res.error, 'err');
      ui.state.projectId = ''; ui.toast('Copia restaurada.'); ui.render();
    };
    reader.readAsText(file);
  };
  ui.actions['download-corrupt'] = function (el) { ui.download(ui.store.readRaw(el.dataset.key) || '', el.dataset.key + '.json', 'application/json'); };
  ui.actions['delete-corrupt'] = function (el) {
    if (!confirm('¿Borrar definitivamente esta copia de datos dañados?')) return;
    ui.store.removeRaw(el.dataset.key); ui.render({ keepScroll: true });
  };
})();
