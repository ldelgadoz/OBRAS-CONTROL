/* Genera los Excel de ejemplo de la carpeta ejemplos/ (planning v1 y una revisión v2 para probar la reimportación). */
const fs = require('fs'), path = require('path');
const { makeXlsx, dateCell, pctCell } = require('./helpers.js');
const out = path.join(__dirname, '..', 'ejemplos');
fs.mkdirSync(out, { recursive: true });

const head = [['REFORMA LOCAL COMERCIAL · EJEMPLO'], ['Cliente: Cliente de ejemplo S.L. (datos ficticios)'], [], ['Nº', 'Capítulo / Actividad', 'Inicio', 'Fin', 'Duración', '% Avance', 'Observaciones']];
const v1 = makeXlsx([{ name: 'Planning', rows: head.concat([
  ['1', 'DEMOLICIONES Y ALBAÑILERÍA'],
  ['1.1', 'Implantación y protecciones', dateCell('2026-11-16'), dateCell('2026-11-18'), 3, pctCell(1)],
  ['1.2', 'Demoliciones y desescombro', dateCell('2026-11-19'), dateCell('2026-11-25'), 5, pctCell(0.7)],
  ['1.3', 'Albañilería y tabiquería', dateCell('2026-11-26'), dateCell('2026-12-04'), 7, pctCell(0)],
  ['2', 'INSTALACIONES'],
  ['2.1', 'Instalación eléctrica', dateCell('2026-12-02'), dateCell('2026-12-15'), 10, pctCell(0)],
  ['2.2', 'Climatización', dateCell('2026-12-05'), dateCell('2026-12-17'), 9, pctCell(0)],
  ['2.3', 'HITO: Boletín eléctrico presentado', dateCell('2026-12-18'), dateCell('2026-12-18'), 0],
  ['3', 'ACABADOS'],
  ['3.1', 'Pavimentos y revestimientos', dateCell('2026-12-16'), dateCell('2026-12-29'), 10, pctCell(0)],
  ['3.2', 'Remates y limpieza', dateCell('2027-01-25'), dateCell('2027-01-30'), 5, pctCell(0)]
]) }]);
/* v2: las demoliciones se alargan, se añade Fontanería, se quita Climatización y se renombra la última partida. */
const v2 = makeXlsx([{ name: 'Planning', rows: head.concat([
  ['1', 'DEMOLICIONES Y ALBAÑILERÍA'],
  ['1.1', 'Implantación y protecciones', dateCell('2026-11-16'), dateCell('2026-11-18'), 3, pctCell(0)],
  ['1.2', 'Demoliciones y desescombro', dateCell('2026-11-19'), dateCell('2026-11-30'), 8, pctCell(0)],
  ['1.3', 'Albañilería y tabiquería', dateCell('2026-12-01'), dateCell('2026-12-09'), 7, pctCell(0)],
  ['2', 'INSTALACIONES'],
  ['2.1', 'Instalación eléctrica', dateCell('2026-12-07'), dateCell('2026-12-18'), 10, pctCell(0)],
  ['2.2', 'Fontanería', dateCell('2026-12-07'), dateCell('2026-12-14'), 6, pctCell(0)],
  ['2.3', 'HITO: Boletín eléctrico presentado', dateCell('2026-12-21'), dateCell('2026-12-21'), 0],
  ['3', 'ACABADOS'],
  ['3.1', 'Pavimentos y revestimientos', dateCell('2026-12-22'), dateCell('2027-01-08'), 10, pctCell(0)],
  ['3.2', 'Remates, limpieza y entrega', dateCell('2027-01-25'), dateCell('2027-01-30'), 5, pctCell(0)]
]) }]);
fs.writeFileSync(path.join(out, 'planning_ejemplo_v1.xlsx'), v1);
fs.writeFileSync(path.join(out, 'planning_ejemplo_v2_revision.xlsx'), v2);
console.log('Ejemplos generados en', out);
