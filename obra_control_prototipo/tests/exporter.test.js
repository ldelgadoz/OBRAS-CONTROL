const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../js/importer.js');
const P = require('../js/planning.js');
const S = require('../js/store.js');
const E = require('../js/exporter.js');
const { XLSX, realisticPlanning } = require('./helpers.js');

function importXlsx(db, buf, name) {
  const wb = I.readWorkbook(buf, name, { XLSX }), g = wb.sheets[0].grid, h = I.detectHeaderRow(g);
  const rows = I.buildRows(g, h.index, I.guessMapping(g[h.index]), {}).rows;
  const diff = P.diffImport(P.projectActs(db, 'o1'), rows);
  return P.applyImport(db, 'o1', rows, diff, {}, { fileName: name }, '2026-11-24T10:00:00.000Z');
}
const mk = () => { const db = S.emptyDb(); db.projects.push({ id: 'o1', name: 'Obra' }); return db; };
const shape = (db) => P.projectActs(db, 'o1').map((a) => [a.code, a.name, a.kind, a.level, a.start, a.end, a.parentId ? P.projectActs(db, 'o1').find((x) => x.id === a.parentId).name : null]);

test('exportar a Excel y volver a importar reproduce el mismo planning (jerarquía, hitos y fechas)', () => {
  const db1 = mk(); importXlsx(db1, realisticPlanning(), 'orig.xlsx');
  const table = E.planningTable(P.projectActs(db1, 'o1'));
  const out = Buffer.from(E.toXlsx(XLSX, table, 'Planning'));
  const db2 = mk(); importXlsx(db2, out, 'export.xlsx');
  assert.deepEqual(shape(db2), shape(db1));
});

test('exportar a CSV (;, BOM, fechas dd/mm/aaaa) y volver a importar reproduce el planning', () => {
  const db1 = mk(); importXlsx(db1, realisticPlanning(), 'orig.xlsx');
  const csv = E.toCSV(E.planningTable(P.projectActs(db1, 'o1')));
  assert.ok(csv.startsWith('﻿Nº;Actividad;'));
  const db2 = mk(); importXlsx(db2, Buffer.from(csv, 'utf8'), 'export.csv');
  assert.deepEqual(shape(db2), shape(db1));
});

test('reimportar el propio export no genera cambios', () => {
  const db = mk(); importXlsx(db, realisticPlanning(), 'orig.xlsx');
  const out = Buffer.from(E.toXlsx(XLSX, E.planningTable(P.projectActs(db, 'o1')), 'Planning'));
  const wb = I.readWorkbook(out, 'x.xlsx', { XLSX }), g = wb.sheets[0].grid, h = I.detectHeaderRow(g);
  const rows = I.buildRows(g, h.index, I.guessMapping(g[h.index]), {}).rows;
  const d = P.diffImport(P.projectActs(db, 'o1'), rows).summary;
  assert.equal(d.new + d.modified + d.removed, 0);
});
