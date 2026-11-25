/* OBRA CONTROL · capa de datos.
 * Toda la persistencia pasa por aquí (hoy localStorage; mañana se sustituirá por Supabase sin tocar la interfaz).
 * - Versión de esquema + migración desde el prototipo v1 (los datos antiguos no se borran).
 * - Si los datos guardados están dañados, se conserva una copia aparte y NO se pierde nada.
 * - Copia de seguridad completa (JSON) y restauración validada. */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = factory(isNode ? require('./util.js') : root.OC.util, isNode ? require('./planning.js') : root.OC.planning);
  if (isNode) module.exports = api;
  else { root.OC = root.OC || {}; root.OC.store = api; }
})(typeof self !== 'undefined' ? self : this, function (U, P) {
  'use strict';

  var KEY = 'obra-control-v2', OLD_KEY = 'obra-control-v1', SCHEMA = 2;
  var COLLECTIONS = ['projects', 'activities', 'planVersions', 'subs', 'orders', 'diary', 'minutes'];

  function emptyDb() {
    return { schema: SCHEMA, projects: [], activities: [], planVersions: [], subs: [], orders: [], diary: [], minutes: [], meta: { createdAt: new Date().toISOString(), lastBackupAt: '' } };
  }

  /* Datos de demostración (todos marcados demo:true). */
  function sampleDb() {
    var db = emptyDb();
    db.projects.push({ id: 'o1', name: 'Reforma local comercial · Demo', client: 'Cliente de ejemplo', address: 'Madrid', type: 'Reforma de local comercial', start: '2026-11-16', end: '2027-01-30', status: 'En ejecución', notes: '', demo: true });
    var T = [
      ['01', 'Implantación y protecciones', '2026-11-16', '2026-11-18', '2026-11-16', '2026-11-18', 100, 'Finalizado'],
      ['02', 'Demoliciones y desescombro', '2026-11-19', '2026-11-25', '2026-11-19', '', 70, 'En curso'],
      ['03', 'Albañilería y tabiquería', '2026-11-26', '2026-12-04', '', '', 0, 'Pendiente'],
      ['04', 'Instalación eléctrica', '2026-12-02', '2026-12-15', '', '', 0, 'Pendiente'],
      ['05', 'Climatización', '2026-12-05', '2026-12-17', '', '', 0, 'Pendiente'],
      ['06', 'Pavimentos y revestimientos', '2026-12-16', '2026-12-29', '', '', 0, 'Pendiente'],
      ['07', 'Remates y limpieza', '2027-01-25', '2027-01-30', '', '', 0, 'Pendiente']
    ];
    T.forEach(function (t, i) {
      db.activities.push({
        id: 't' + (i + 1), projectId: 'o1', code: t[0], name: t[1], kind: 'activity', level: 0, parentId: null, order: i,
        baseStart: t[2], baseEnd: t[3], start: t[2], end: t[3], actualStart: t[4], actualEnd: t[5], progress: t[6], status: t[7],
        notes: 'Dato ficticio', removedFromPlan: false, addedInVersion: 1, history: [], demo: true
      });
    });
    db.planVersions.push({
      id: 'v1', projectId: 'o1', number: 1, createdAt: '2026-11-10T09:00:00.000Z', source: { fileName: 'Datos de ejemplo', sheet: '' }, mapping: null,
      note: 'Línea base inicial (ejemplo)', summary: { new: 7, modified: 0, unchanged: 0, removed: 0, restored: 0 },
      changes: [], orderBefore: [], orderAfter: db.activities.map(function (a) { return a.id; }), snapshot: P.snapshotOf(db.activities), demo: true
    });
    db.subs.push({ id: 's1', projectId: 'o1', trade: 'Demoliciones', company: 'Empresa de ejemplo A', status: 'Contratada', start: '2026-11-19', end: '2026-11-25', demo: true },
      { id: 's2', projectId: 'o1', trade: 'Electricidad', company: 'Por asignar', status: 'Pendiente', start: '2026-12-02', end: '2026-12-15', demo: true });
    db.orders.push({ id: 'p1', projectId: 'o1', material: 'Pavimento porcelánico', supplier: 'Proveedor de ejemplo', orderBy: '2026-11-30', needed: '2026-12-15', delivered: '', status: 'Pendiente de solicitar', demo: true });
    db.diary.push({ id: 'd1', projectId: 'o1', date: '2026-11-24', companies: 'Empresa de ejemplo A', works: 'Avance de demoliciones en zona de sala.', issues: 'Pendiente confirmar retirada de escombros.', photos: '', demo: true });
    db.minutes.push({ id: 'm1', projectId: 'o1', date: '2026-11-24', title: 'Reunión de coordinación inicial', attendees: 'Dirección de obra; subcontrata', topics: 'Secuencia de demoliciones y replanteo.', actions: 'Confirmar mediciones y fechas de suministro', due: '2026-11-27', status: 'Pendiente', demo: true });
    return db;
  }

  /* v1 (prototipo inicial: projects/tasks/subs/orders/diary/minutes) -> v2. */
  function migrateV1(old) {
    var db = emptyDb();
    ['projects', 'subs', 'orders', 'diary', 'minutes'].forEach(function (k) { db[k] = (old[k] || []).slice(); });
    db.projects.forEach(function (p) { if (p.type === undefined) p.type = ''; if (p.notes === undefined) p.notes = ''; });
    var perProject = {};
    (old.tasks || []).forEach(function (t, i) {
      var n = perProject[t.projectId] = (perProject[t.projectId] || 0) + 1;
      db.activities.push({
        id: t.id || U.uid(), projectId: t.projectId, code: t.code || '', name: t.name || '', kind: 'activity', level: 0, parentId: null, order: n - 1,
        baseStart: t.start || '', baseEnd: t.end || '', start: t.start || '', end: t.end || '',
        actualStart: t.actualStart || '', actualEnd: t.actualEnd || '', progress: Number(t.progress) || 0, status: t.status || 'Pendiente',
        notes: t.notes || '', removedFromPlan: false, addedInVersion: 1, history: [], demo: t.notes === 'Dato ficticio' ? true : undefined
      });
    });
    Object.keys(perProject).forEach(function (pid) {
      var acts = P.projectActs(db, pid);
      db.planVersions.push({
        id: U.uid(), projectId: pid, number: 1, createdAt: new Date().toISOString(), source: { fileName: 'Migración desde el prototipo v1', sheet: '' }, mapping: null,
        note: 'Línea base creada al migrar los datos del prototipo anterior.', summary: { new: acts.length, modified: 0, unchanged: 0, removed: 0, restored: 0 },
        changes: [], orderBefore: [], orderAfter: acts.map(function (a) { return a.id; }), snapshot: P.snapshotOf(acts)
      });
    });
    /* Marca como demo lo que ya lo era por su proyecto de ejemplo. */
    var demoProjects = {}; db.projects.forEach(function (p) { if (p.demo) demoProjects[p.id] = true; });
    ['subs', 'orders'].forEach(function (k) { db[k].forEach(function (x) { if (demoProjects[x.projectId] && x.demo === undefined) x.demo = true; }); });
    db.planVersions.forEach(function (v) { if (demoProjects[v.projectId]) v.demo = true; });
    return db;
  }

  function validate(db) {
    if (!db || typeof db !== 'object') return 'No es un objeto de datos.';
    for (var i = 0; i < COLLECTIONS.length; i++) if (!Array.isArray(db[COLLECTIONS[i]])) return 'Falta la colección "' + COLLECTIONS[i] + '".';
    if (db.schema !== SCHEMA) return 'Versión de esquema no soportada (' + db.schema + ').';
    return '';
  }

  /* Acepta una copia de seguridad (con envoltorio) o los datos en bruto, v1 o v2. Devuelve {db} o {error}. */
  function parseBackup(text) {
    var parsed;
    try { parsed = JSON.parse(text); } catch (e) { return { error: 'El archivo no es un JSON válido.' }; }
    var data = parsed && parsed.app === 'obra-control' && parsed.data ? parsed.data : parsed;
    if (data && data.schema === undefined && Array.isArray(data.projects) && Array.isArray(data.tasks)) data = migrateV1(data);
    var err = validate(data);
    return err ? { error: err } : { db: data };
  }

  function exportBackup(db) {
    return JSON.stringify({ app: 'obra-control', schema: SCHEMA, exportedAt: new Date().toISOString(), data: db }, null, 1);
  }

  function createStore(storage) {
    var st = { status: 'new', notice: '', corruptKey: '', db: null };

    function init() {
      var raw = null;
      try { raw = storage.getItem(KEY); } catch (e) { raw = null; }
      if (raw) {
        var parsed = null;
        try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
        if (parsed && !validate(parsed)) { st.db = parsed; st.status = 'ok'; return; }
        /* Datos dañados: se conservan aparte antes de seguir. */
        st.corruptKey = 'obra-control-corrupto-' + Date.now();
        try { storage.setItem(st.corruptKey, raw); } catch (e) { /* sin espacio: se avisa igualmente */ }
        st.db = sampleDb(); st.status = 'corrupt';
        st.notice = 'No se han podido leer los datos guardados. Se ha conservado una copia sin tocar y se han cargado los datos de ejemplo.';
        return;
      }
      var oldRaw = null;
      try { oldRaw = storage.getItem(OLD_KEY); } catch (e) { oldRaw = null; }
      if (oldRaw) {
        try {
          st.db = migrateV1(JSON.parse(oldRaw)); st.status = 'migrated';
          st.notice = 'Se han migrado los datos del prototipo anterior (la copia original sigue guardada sin cambios).';
          st.save(); return;
        } catch (e) { /* pasa a datos de ejemplo */ }
      }
      st.db = sampleDb(); st.status = 'new';
    }

    st.save = function () {
      try { storage.setItem(KEY, JSON.stringify(st.db)); return { ok: true }; }
      catch (e) { return { ok: false, error: 'No se pudo guardar en el navegador (¿almacenamiento lleno o bloqueado?). Descarga una copia de seguridad.' }; }
    };
    st.replace = function (db) {
      try { storage.setItem('obra-control-antes-de-restaurar', JSON.stringify(st.db)); } catch (e) { /* ignorar */ }
      st.db = db; return st.save();
    };
    st.markBackup = function () { st.db.meta = st.db.meta || {}; st.db.meta.lastBackupAt = new Date().toISOString(); return st.save(); };
    st.listCorrupt = function () {
      var out = [];
      try { for (var i = 0; i < storage.length; i++) { var k = storage.key(i); if (k && k.indexOf('obra-control-corrupto-') === 0) out.push(k); } } catch (e) { /* ignorar */ }
      return out;
    };
    st.readRaw = function (key) { try { return storage.getItem(key); } catch (e) { return null; } };
    st.removeRaw = function (key) { try { storage.removeItem(key); } catch (e) { /* ignorar */ } };
    st.removeDemo = function () {
      var db = st.db, demoProjects = {};
      db.projects.forEach(function (p) { if (p.demo) demoProjects[p.id] = true; });
      db.projects = db.projects.filter(function (p) { return !p.demo; });
      COLLECTIONS.slice(1).forEach(function (k) { db[k] = db[k].filter(function (x) { return !x.demo && !demoProjects[x.projectId]; }); });
      return st.save();
    };
    st.hasDemo = function () {
      var db = st.db;
      return COLLECTIONS.some(function (k) { return db[k].some(function (x) { return x.demo; }); });
    };
    init();
    return st;
  }

  return { KEY: KEY, SCHEMA: SCHEMA, COLLECTIONS: COLLECTIONS, emptyDb: emptyDb, sampleDb: sampleDb, migrateV1: migrateV1, validate: validate, parseBackup: parseBackup, exportBackup: exportBackup, createStore: createStore };
});
