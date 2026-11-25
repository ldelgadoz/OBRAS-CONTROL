const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../js/util.js');
const I = require('../js/importer.js');
const P = require('../js/planning.js');
const S = require('../js/store.js');
const { XLSX, makeXlsx, dateCell, realisticPlanning } = require('./helpers.js');

const T0 = '2026-11-24T10:00:00.000Z', T1 = '2026-12-01T10:00:00.000Z', T2 = '2026-12-10T10:00:00.000Z';

function newDb() { const db = S.emptyDb(); db.projects.push({ id: 'o1', name: 'Obra test', status: 'En ejecución' }); return db; }
function parse(buf, name, opts) {
  const wb = I.readWorkbook(buf, name || 'x.xlsx', { XLSX });
  const g = wb.sheets[0].grid, h = I.detectHeaderRow(g);
  return I.buildRows(g, h.index, I.guessMapping(g[h.index]), opts || {}).rows;
}
function importInto(db, rows, selection, now) {
  const diff = P.diffImport(P.projectActs(db, 'o1'), rows);
  return { diff, version: P.applyImport(db, 'o1', rows, diff, selection, { fileName: 'plan.xlsx' }, now || T0) };
}
const find = (db, name) => db.activities.find((a) => a.name === name);

/* Planning v2: cambia fechas de Demoliciones, quita Climatización, añade Fontanería, renombra Remates. */
function planningV2() {
  return makeXlsx([{ name: 'Planning', rows: [
    ['Nº', 'Actividad', 'Inicio', 'Fin'],
    ['1', 'DEMOLICIONES Y ALBAÑILERÍA'],
    ['1.1', 'Implantación y protecciones', dateCell('2026-11-16'), dateCell('2026-11-18')],
    ['1.2', 'Demoliciones y desescombro', dateCell('2026-11-19'), dateCell('2026-11-30')],
    ['1.3', 'Tabiquería', dateCell('2026-12-01'), dateCell('2026-12-09')],
    ['2', 'INSTALACIONES'],
    ['2.1', 'Instalación eléctrica', dateCell('2026-12-02'), dateCell('2026-12-15')],
    ['2.2', 'Fontanería', dateCell('2026-12-03'), dateCell('2026-12-10')],
    ['2.3', 'HITO: Boletín eléctrico presentado', dateCell('2026-12-18'), dateCell('2026-12-18')],
    ['3', 'ACABADOS'],
    ['3.1', 'Pavimentos y revestimientos', dateCell('2026-12-16'), dateCell('2026-12-29')],
    ['3.2', 'Remates, limpieza y entrega', dateCell('2027-01-25'), dateCell('2027-01-30')]
  ] }]);
}

test('primera importación: crea la línea base (versión 1) con jerarquía', () => {
  const db = newDb();
  const { version } = importInto(db, parse(realisticPlanning()));
  assert.equal(version.number, 1);
  assert.equal(db.activities.length, 11);
  const tab = find(db, 'Tabiquería');
  assert.equal(tab.baseStart, tab.start); assert.equal(tab.baseEnd, '2026-12-04');
  assert.equal(db.activities.find((a) => a.id === tab.parentId).name, 'DEMOLICIONES Y ALBAÑILERÍA');
  assert.equal(version.snapshot.length, 11);
  assert.equal(find(db, 'Demoliciones y desescombro').progress, 70);   // en actividades NUEVAS el avance del archivo sí se usa como valor inicial
});

test('primera importación con avance: lo trae el archivo; en la reimportación NUNCA se pisa', () => {
  const db = newDb();
  const rows = parse(realisticPlanning());
  const impl = rows.find((r) => r.name === 'Implantación y protecciones');
  assert.equal(impl.progress, 100);
  importInto(db, rows);
  assert.equal(find(db, 'Implantación y protecciones').progress, 100);
  assert.equal(find(db, 'Implantación y protecciones').status, 'Finalizado');
});

test('reimportación: detecta nuevas, modificadas, eliminadas y sin cambios, y muestra diferencias', () => {
  const db = newDb();
  importInto(db, parse(realisticPlanning()));
  const diff = P.diffImport(P.projectActs(db, 'o1'), parse(planningV2()));
  const by = (t) => diff.items.filter((i) => i.type === t);
  assert.equal(by('new').map((i) => i.row.name).sort().join('|'), 'Fontanería');
  assert.deepEqual(by('removed').map((i) => i.activity.name), ['Climatización']);
  const dem = diff.items.find((i) => i.row && i.row.name === 'Demoliciones y desescombro');
  assert.equal(dem.type, 'modified');
  assert.deepEqual(dem.changes, [{ field: 'end', from: '2026-11-25', to: '2026-11-30' }]);
  // "Remates y limpieza" -> "Remates, limpieza y entrega": mismo código 3.2, se empareja por código y se marca renombrada
  const rem = diff.items.find((i) => i.row && i.row.name === 'Remates, limpieza y entrega');
  assert.equal(rem.type, 'modified');
  assert.ok(rem.changes.some((c) => c.field === 'name'));
  assert.equal(by('removed')[0].defaultSelected, false, 'las eliminadas no se marcan solas');
  assert.ok(diff.summary.unchanged >= 5);
});

test('REQUISITO CRÍTICO: reimportar no toca el seguimiento real y conserva la línea base', () => {
  const db = newDb();
  importInto(db, parse(realisticPlanning()), {}, T0);
  const dem = find(db, 'Demoliciones y desescombro');
  P.applyActivityEdit(dem, { actualStart: '2026-11-19', progress: 60, notes: 'Falta retirar escombro', status: 'En curso' }, '2026-11-24');
  const before = JSON.stringify(['actualStart', 'actualEnd', 'progress', 'notes', 'status'].map((f) => dem[f]));
  const baseEnd = dem.baseEnd;
  importInto(db, parse(planningV2()), {}, T1);
  const after = find(db, 'Demoliciones y desescombro');
  assert.equal(JSON.stringify(['actualStart', 'actualEnd', 'progress', 'notes', 'status'].map((f) => after[f])), before);
  assert.equal(after.end, '2026-11-30');         // plan actual cambia (confirmado)
  assert.equal(after.baseEnd, baseEnd);          // la línea base no
  assert.equal(after.baseEnd, '2026-11-25');
  assert.equal(P.activityMetrics(after, '2026-11-27').planShiftEnd, 5);
  assert.ok(after.history.some((h) => h.field === 'end' && h.from === '2026-11-25' && h.to === '2026-11-30' && h.v === 2));
});

test('reimportar el mismo archivo no cambia nada pero deja constancia (versión sin cambios)', () => {
  const db = newDb();
  importInto(db, parse(realisticPlanning()));
  const diff = P.diffImport(P.projectActs(db, 'o1'), parse(realisticPlanning()));
  assert.equal(diff.summary.new + diff.summary.modified + diff.summary.removed, 0);
  assert.equal(diff.summary.unchanged, 11);
});

test('eliminadas: solo se marcan si el usuario lo confirma, y conservan su seguimiento', () => {
  const db = newDb();
  importInto(db, parse(realisticPlanning()), {}, T0);
  P.setProgress(find(db, 'Climatización'), 30, '2026-11-24');
  // por defecto no se marca como eliminada
  importInto(db, parse(planningV2()), {}, T1);
  assert.equal(find(db, 'Climatización').removedFromPlan, false);
  // confirmando explícitamente (reimportación posterior)
  const diff = P.diffImport(P.projectActs(db, 'o1'), parse(planningV2()));
  const rem = diff.items.find((i) => i.type === 'removed');
  P.applyImport(db, 'o1', parse(planningV2()), diff, { [rem.key]: true }, { fileName: 'plan2.xlsx' }, T2);
  const cl = find(db, 'Climatización');
  assert.equal(cl.removedFromPlan, true);
  assert.equal(cl.progress, 30);
  assert.equal(P.leaves(P.projectActs(db, 'o1')).some((a) => a.name === 'Climatización'), false);
});

test('selección parcial: lo desmarcado no se aplica', () => {
  const db = newDb();
  importInto(db, parse(realisticPlanning()), {}, T0);
  const rows = parse(planningV2());
  const diff = P.diffImport(P.projectActs(db, 'o1'), rows);
  const dem = diff.items.find((i) => i.row && i.row.name === 'Demoliciones y desescombro');
  const fon = diff.items.find((i) => i.type === 'new');
  const v = P.applyImport(db, 'o1', rows, diff, { [dem.key]: false, [fon.key]: false }, {}, T1);
  assert.equal(find(db, 'Demoliciones y desescombro').end, '2026-11-25');
  assert.equal(find(db, 'Fontanería'), undefined);
  assert.equal(v.summary.new, 0);
});

test('actividades nuevas tras la v1: su línea base es la fecha con la que entran; se cuelgan del capítulo correcto', () => {
  const db = newDb();
  importInto(db, parse(realisticPlanning()), {}, T0);
  importInto(db, parse(planningV2()), {}, T1);
  const f = find(db, 'Fontanería');
  assert.equal(f.baseStart, '2026-12-03'); assert.equal(f.addedInVersion, 2);
  assert.equal(db.activities.find((a) => a.id === f.parentId).name, 'INSTALACIONES');
});

test('historial y comparación entre versiones', () => {
  const db = newDb();
  importInto(db, parse(realisticPlanning()), {}, T0);
  importInto(db, parse(planningV2()), {}, T1);
  assert.equal(db.planVersions.length, 2);
  const cmp = P.compareVersions(db, 'o1', 1, 2);
  const row = (n) => cmp.rows.find((r) => r.name === n);
  assert.equal(row('Demoliciones y desescombro').type, 'changed');
  assert.equal(row('Demoliciones y desescombro').dEnd, 5);
  assert.equal(row('Fontanería').type, 'added');
  assert.equal(row('Tabiquería').type, 'changed');
  assert.equal(row('Implantación y protecciones').type, 'same');
  assert.equal(row('Remates, limpieza y entrega').renamed, true);
});

test('deshacer la última versión restaura plan, orden y elimina lo creado, sin tocar el seguimiento', () => {
  const db = newDb();
  importInto(db, parse(realisticPlanning()), {}, T0);
  P.applyActivityEdit(find(db, 'Tabiquería'), { progress: 40 }, '2026-11-27');
  const snapBefore = JSON.stringify(P.projectActs(db, 'o1').map((a) => [a.id, a.name, a.start, a.end, a.order, a.parentId, a.progress]));
  const { version } = importInto(db, parse(planningV2()), {}, T1);
  const chk = P.canRevert(db, version.id);
  assert.equal(chk.ok, true);
  assert.equal(P.revertVersion(db, version.id).ok, true);
  assert.equal(JSON.stringify(P.projectActs(db, 'o1').map((a) => [a.id, a.name, a.start, a.end, a.order, a.parentId, a.progress])), snapBefore);
  assert.equal(db.planVersions.length, 1);
  assert.equal(find(db, 'Demoliciones y desescombro').history.length, 0);
});

test('solo se puede deshacer la última versión', () => {
  const db = newDb();
  const v1 = importInto(db, parse(realisticPlanning()), {}, T0).version;
  importInto(db, parse(planningV2()), {}, T1);
  assert.equal(P.canRevert(db, v1.id).ok, false);
});

test('el orden del archivo se respeta y las eliminadas quedan junto a su antecesora', () => {
  const db = newDb();
  importInto(db, parse(realisticPlanning()), {}, T0);
  importInto(db, parse(planningV2()), {}, T1);
  const names = P.projectActs(db, 'o1').map((a) => a.name);
  assert.ok(names.indexOf('Climatización') > names.indexOf('Instalación eléctrica'));
  assert.ok(names.indexOf('Climatización') < names.indexOf('Pavimentos y revestimientos'));
  assert.ok(names.indexOf('Fontanería') > names.indexOf('Instalación eléctrica'));
});

test('duplicados: dos actividades con el mismo nombre en capítulos distintos no se mezclan', () => {
  const mk = (a, b) => makeXlsx([{ name: 'P', rows: [['Fase', 'Actividad', 'Inicio', 'Fin'],
    ['Local', 'Pintura', dateCell(a[0]), dateCell(a[1])], ['Vivienda', 'Pintura', dateCell(b[0]), dateCell(b[1])]] }]);
  const db = newDb();
  importInto(db, parse(mk(['2026-11-16', '2026-11-18'], ['2026-12-01', '2026-12-03'])), {}, T0);
  const diff = P.diffImport(P.projectActs(db, 'o1'), parse(mk(['2026-11-16', '2026-11-20'], ['2026-12-01', '2026-12-03'])));
  const pint = diff.items.filter((i) => i.row && i.row.name === 'Pintura');
  assert.equal(pint.length, 2);
  assert.deepEqual(pint.map((i) => i.type), ['modified', 'unchanged']);
  assert.equal(new Set(pint.map((i) => i.activity.id)).size, 2);
});

test('renumeración: si se inserta una actividad y cambian los códigos, se empareja por descripción', () => {
  const mk = (rows) => makeXlsx([{ name: 'P', rows: [['Código', 'Actividad', 'Inicio', 'Fin'], ...rows.map((r) => [r[0], r[1], dateCell(r[2]), dateCell(r[3])])] }]);
  const db = newDb();
  importInto(db, parse(mk([['1', 'Albañilería', '2026-11-16', '2026-11-20'], ['2', 'Fontanería', '2026-11-23', '2026-11-27']])), {}, T0);
  const diff = P.diffImport(P.projectActs(db, 'o1'), parse(mk([['1', 'Albañilería', '2026-11-16', '2026-11-20'], ['2', 'Electricidad', '2026-11-23', '2026-11-25'], ['3', 'Fontanería', '2026-11-23', '2026-11-27']])));
  const f = diff.items.find((i) => i.row && i.row.name === 'Fontanería');
  assert.equal(f.type, 'modified');                        // solo cambia el código 2 -> 3
  assert.deepEqual(f.changes.map((c) => c.field), ['code']);
  assert.equal(diff.items.find((i) => i.row && i.row.name === 'Electricidad').type, 'new');
});

test('seguimiento: progreso, fechas reales y métricas de retraso', () => {
  const a = { progress: 0, status: 'Pendiente', actualStart: '', actualEnd: '', start: '2026-11-16', end: '2026-11-25', baseStart: '2026-11-16', baseEnd: '2026-11-20' };
  P.setProgress(a, 50, '2026-11-20');
  assert.equal(a.status, 'En curso'); assert.equal(a.actualStart, '2026-11-20');
  P.setProgress(a, 100, '2026-11-27');
  assert.equal(a.status, 'Finalizado'); assert.equal(a.actualEnd, '2026-11-27');
  assert.equal(P.activityMetrics(a, '2026-12-01').delay, 2);
  P.setProgress(a, 80, '2026-11-28');
  assert.equal(a.status, 'En curso'); assert.equal(a.actualEnd, '');
  const m = P.activityMetrics(a, '2026-12-01');
  assert.equal(m.late, true); assert.equal(m.delay, 6); assert.equal(m.planShiftEnd, 5);
  assert.equal(P.expectedProgress(a, '2026-11-20'), 50);
});

test('editar a mano una fecha prevista deja historial y no toca la línea base', () => {
  const a = { name: 'X', kind: 'activity', start: '2026-11-16', end: '2026-11-20', baseStart: '2026-11-16', baseEnd: '2026-11-20', progress: 0, status: 'Pendiente', history: [] };
  P.applyActivityEdit(a, { end: '2026-11-27' }, '2026-11-24');
  assert.equal(a.baseEnd, '2026-11-20'); assert.equal(a.end, '2026-11-27');
  assert.deepEqual(a.history.map((h) => [h.field, h.from, h.to, h.src]), [['end', '2026-11-20', '2026-11-27', 'manual']]);
});

test('métricas de obra y capítulo: avance real vs previsto', () => {
  const db = newDb();
  importInto(db, parse(realisticPlanning()), {}, T0);
  const acts = P.projectActs(db, 'o1');
  const m = P.projectMetrics(acts, '2026-11-25');
  assert.ok(m.expected > 0 && m.progress > 0);
  const ch = acts.find((a) => a.name === 'DEMOLICIONES Y ALBAÑILERÍA');
  const r = P.chapterRollup(acts, ch, '2026-11-25');
  assert.equal(r.start, '2026-11-16'); assert.equal(r.end, '2026-12-04'); assert.equal(r.count, 3);
});

/* ---------- Almacén de datos ---------- */
function fakeStorage(init) {
  const m = Object.assign({}, init || {});
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, key: (i) => Object.keys(m)[i], get length() { return Object.keys(m).length; }, _m: m };
}
test('store: arranque limpio carga datos de ejemplo marcados como demo', () => {
  const st = S.createStore(fakeStorage());
  assert.equal(st.status, 'new');
  assert.ok(st.hasDemo());
  const demo = ['projects', 'activities', 'subs', 'orders', 'diary', 'minutes'].every((k) => st.db[k].every((x) => x.demo));
  assert.equal(demo, true);
});
test('store: migra los datos del prototipo v1 sin tocar la copia original', () => {
  const v1 = { projects: [{ id: 'a', name: 'Mi obra', status: 'En ejecución', start: '2026-01-01', end: '2026-03-01' }],
    tasks: [{ id: 't1', projectId: 'a', code: '01', name: 'Albañilería', start: '2026-01-05', end: '2026-01-20', progress: 40, status: 'En curso', actualStart: '2026-01-05', actualEnd: '', notes: 'ojo' }],
    subs: [], orders: [], diary: [], minutes: [] };
  const raw = JSON.stringify(v1), ls = fakeStorage({ 'obra-control-v1': raw });
  const st = S.createStore(ls);
  assert.equal(st.status, 'migrated');
  assert.equal(st.db.activities[0].progress, 40);
  assert.equal(st.db.activities[0].baseEnd, '2026-01-20');
  assert.equal(st.db.planVersions.length, 1);
  assert.equal(ls.getItem('obra-control-v1'), raw);
  assert.ok(ls.getItem('obra-control-v2'));
});
test('store: datos dañados se conservan aparte y no se pierden', () => {
  const ls = fakeStorage({ 'obra-control-v2': '{"schema":2,"projects":[' });
  const st = S.createStore(ls);
  assert.equal(st.status, 'corrupt');
  assert.equal(ls.getItem(st.corruptKey), '{"schema":2,"projects":[');
  assert.equal(st.listCorrupt().length, 1);
});
test('store: copia de seguridad -> restaurar es idéntica; archivos inválidos se rechazan', () => {
  const st = S.createStore(fakeStorage());
  const txt = S.exportBackup(st.db);
  const back = S.parseBackup(txt);
  assert.deepEqual(back.db, st.db);
  assert.ok(S.parseBackup('no json').error);
  assert.ok(S.parseBackup('{"a":1}').error);
  const st2 = S.createStore(fakeStorage());
  st2.replace(back.db);
  assert.deepEqual(st2.db, st.db);
});
test('store: eliminar datos de ejemplo no toca los datos reales', () => {
  const st = S.createStore(fakeStorage());
  st.db.projects.push({ id: 'real', name: 'Obra real', status: 'En ejecución' });
  st.db.activities.push({ id: 'ra', projectId: 'real', name: 'Real', kind: 'activity', order: 0 });
  st.removeDemo();
  assert.equal(st.db.projects.length, 1); assert.equal(st.db.activities.length, 1);
  assert.equal(st.hasDemo(), false);
});
