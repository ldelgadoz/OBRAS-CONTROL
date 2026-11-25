const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../js/util.js');
const CSV = require('../js/csv.js');
const I = require('../js/importer.js');
const { XLSX, makeXlsx, dateCell, realisticPlanning } = require('./helpers.js');

/* ---------- Fechas ---------- */
test('parseDate: formatos habituales en España', () => {
  assert.equal(U.parseDate('16/11/2026'), '2026-11-16');
  assert.equal(U.parseDate('16-11-26'), '2026-11-16');
  assert.equal(U.parseDate('16.11.2026'), '2026-11-16');
  assert.equal(U.parseDate('2026-11-16'), '2026-11-16');
  assert.equal(U.parseDate('lun 16/11/26'), '2026-11-16');
  assert.equal(U.parseDate('16-nov-26'), '2026-11-16');
  assert.equal(U.parseDate('16 de noviembre de 2026'), '2026-11-16');
  assert.equal(U.parseDate('1 ene 2027'), '2027-01-01');
  assert.equal(U.parseDate(U.isoToSerial('2026-12-25')), '2026-12-25');
});
test('parseDate: rechaza fechas imposibles en vez de inventarlas', () => {
  assert.equal(U.parseDate('31/02/2026'), '');
  assert.equal(U.parseDate('16/16/2026'), '');
  assert.equal(U.parseDate('texto'), '');
  assert.equal(U.parseDate('16/11/2026', 'mdy'), '');   // mes 16 no existe
  assert.equal(U.parseDate('11/16/2026', 'mdy'), '2026-11-16');
});
test('detectDateOrder: usa las fechas inequívocas de la columna', () => {
  assert.equal(U.detectDateOrder(['16/11/2026', '01/12/2026']).order, 'dmy');
  assert.equal(U.detectDateOrder(['11/16/26', '12/01/26']).order, 'mdy');
  assert.equal(U.detectDateOrder(['01/02/2026']).evidence, false);
});
test('duración: laborables salta fines de semana', () => {
  assert.equal(U.endFromDuration('2026-11-20', 3, 'working'), '2026-11-24'); // vie, lun, mar
  assert.equal(U.endFromDuration('2026-11-20', 3, 'calendar'), '2026-11-22');
  assert.equal(U.endFromDuration('2026-11-20', 1, 'working'), '2026-11-20');
});
test('todayISO usa la fecha local, no UTC', () => {
  assert.equal(U.todayISO(new Date(2026, 10, 24, 23, 59)), '2026-11-24');
});

/* ---------- CSV ---------- */
test('CSV: detecta ; y , y respeta comillas con saltos de línea', () => {
  assert.equal(CSV.detectDelimiter('a;b;c\n1;2,5;3\n4;5,5;6'), ';');
  assert.equal(CSV.detectDelimiter('a,b,c\n1,2,3'), ',');
  const rows = CSV.parse('a;b\n"x;1";"lin1\nlin2"\n', ';');
  assert.deepEqual(rows, [['a', 'b'], ['x;1', 'lin1\nlin2']]);
});
test('CSV: Windows-1252 (Excel español) conserva las tildes', () => {
  const buf = Buffer.from('Código;Actividad\n01;Albañilería\n', 'latin1');
  const dec = CSV.decodeBytes(buf);
  assert.equal(dec.encoding, 'Windows-1252');
  assert.match(dec.text, /Albañilería/);
  const utf = CSV.decodeBytes(Buffer.from('﻿Código;Actividad\n', 'utf8'));
  assert.equal(utf.encoding, 'UTF-8');
  assert.match(utf.text, /^Código/);
});
test('CSV: stringify <-> parse son inversos', () => {
  const rows = [['a;b', 'c"d', 'x\ny'], ['1', '', '3']];
  const back = CSV.parse(CSV.stringify(rows, ';'), ';');
  assert.deepEqual(back, [['a;b', 'c"d', 'x\ny'], ['1', null, '3']]);
});

/* ---------- Excel real ---------- */
test('Excel: la cabecera se detecta aunque haya filas de título arriba', () => {
  const wb = I.readWorkbook(realisticPlanning(), 'plan.xlsx', { XLSX });
  const g = wb.sheets[0].grid;
  const h = I.detectHeaderRow(g);
  assert.equal(h.index, 4);
  assert.equal(h.confident, true);
  const map = I.guessMapping(g[h.index]);
  assert.equal(map.code, 0); assert.equal(map.name, 1); assert.equal(map.start, 2); assert.equal(map.end, 3);
  assert.equal(map.duration, 4); assert.equal(map.progress, 5);
});
test('Excel: fechas reales en cualquier formato de celda (incl. m/d/yy) salen bien', () => {
  const wb = I.readWorkbook(realisticPlanning(), 'plan.xlsx', { XLSX });
  const g = wb.sheets[0].grid;
  assert.equal(g[6][2], '2026-11-16');   // dd/mm/yyyy
  assert.equal(g[7][2], '2026-11-19');   // m/d/yy: se lee del número, no del texto mostrado
  assert.equal(g[7][3], '2026-11-25');
  assert.equal(g[8][2], '26-nov-26');    // texto
  assert.equal(g[6][5], '100%');         // porcentaje con formato %
});
test('Excel: jerarquía por código, capítulos, hito, duración y avance', () => {
  const wb = I.readWorkbook(realisticPlanning(), 'plan.xlsx', { XLSX });
  const g = wb.sheets[0].grid;
  const h = I.detectHeaderRow(g), map = I.guessMapping(g[h.index]);
  const res = I.buildRows(g, h.index, map, { dateOrder: 'dmy', durationMode: 'working' });
  const byName = {}; res.rows.forEach((r) => { byName[r.name] = r; });
  assert.equal(res.rows.length, 11);
  assert.equal(byName['DEMOLICIONES Y ALBAÑILERÍA'].kind, 'chapter');
  assert.equal(byName['Tabiquería'].start, '2026-11-26');   // "26-nov-26"
  assert.equal(byName['Tabiquería'].end, '2026-12-04');     // "04/12/2026"
  assert.equal(byName['Tabiquería'].parentIndex, 0);
  assert.equal(res.rows[byName['Climatización'].parentIndex].name, 'INSTALACIONES');
  assert.equal(byName['Instalación eléctrica'].end, '2026-12-15');   // inicio + 10 laborables
  assert.equal(byName['HITO: Boletín eléctrico presentado'].kind, 'milestone');
  assert.equal(byName['Demoliciones y desescombro'].progress, 70);
  assert.equal(byName['Implantación y protecciones'].progress, 100);
  assert.equal(res.warnings.length, 0, JSON.stringify(res.warnings));
  assert.equal(res.stats.minDate, '2026-11-16'); assert.equal(res.stats.maxDate, '2027-01-30');
});
test('Excel: celdas combinadas en vertical y varias hojas', () => {
  const buf = makeXlsx([
    { name: 'Resumen', rows: [['solo texto']] },
    {
      name: 'Obra',
      rows: [['Fase', 'Actividad', 'Inicio', 'Fin'], ['Demolición', 'Picado', dateCell('2026-11-16'), dateCell('2026-11-18')], [null, 'Desescombro', dateCell('2026-11-19'), dateCell('2026-11-20')], ['Albañilería', 'Tabiques', dateCell('2026-11-23'), dateCell('2026-11-27')]],
      merges: [{ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }]
    }
  ]);
  const wb = I.readWorkbook(buf, 'x.xlsx', { XLSX });
  assert.equal(wb.sheets.length, 2);
  const g = wb.sheets[1].grid;
  assert.equal(g[2][0], 'Demolición');   // rellenado hacia abajo
  const map = I.guessMapping(g[0]);
  assert.equal(map.chapter, 0);
  const res = I.buildRows(g, 0, map, {});
  assert.deepEqual(res.rows.map((r) => [r.kind, r.name, r.level]), [
    ['chapter', 'Demolición', 0], ['activity', 'Picado', 1], ['activity', 'Desescombro', 1], ['chapter', 'Albañilería', 0], ['activity', 'Tabiques', 1]
  ]);
});
test('Texto de fecha inválido genera aviso con número de fila, sin inventar fecha', () => {
  const g = [['Actividad', 'Inicio', 'Fin'], ['Pintura', '31/02/2026', '05/03/2026'], ['Suelo', '10/03/2026', '08/03/2026']];
  const res = I.buildRows(g, 0, I.guessMapping(g[0]), {});
  assert.equal(res.rows[0].start, '');
  assert.ok(res.warnings.some((w) => w.rowNo === 2 && /no válida/.test(w.text)));
  assert.ok(res.warnings.some((w) => w.rowNo === 3 && /anterior al inicio/.test(w.text)));
});
test('Columnas "real"/"base" no se confunden con fechas previstas', () => {
  const m = I.guessMapping(['Actividad', 'Inicio base', 'Inicio previsto', 'Inicio real', 'Fin previsto', 'Fin real']);
  assert.equal(m.start, 2); assert.equal(m.end, 4);
});
test('Avance en fracción (0,5) o en porcentaje (50)', () => {
  const frac = [['Actividad', 'Avance'], ['A', 0.5], ['B', 1]];
  assert.deepEqual(I.buildRows(frac, 0, I.guessMapping(frac[0]), {}).rows.map((r) => r.progress), [50, 100]);
  const pct = [['Actividad', 'Avance'], ['A', 50], ['B', 100]];
  assert.deepEqual(I.buildRows(pct, 0, I.guessMapping(pct[0]), {}).rows.map((r) => r.progress), [50, 100]);
});
test('CSV de ejemplo del prototipo se importa tal cual', () => {
  const fs = require('fs');
  const buf = fs.readFileSync(require('path').join(__dirname, '..', 'ejemplo_planning.csv'));
  const wb = I.readWorkbook(buf, 'ejemplo_planning.csv', {});
  const g = wb.sheets[0].grid, h = I.detectHeaderRow(g);
  const res = I.buildRows(g, h.index, I.guessMapping(g[h.index]), {});
  assert.equal(res.rows.length, 7);
  assert.equal(res.rows[0].code, '01');
  assert.equal(res.rows[1].progress, 70);
  assert.equal(res.warnings.length, 0);
});
