/* Utilidades de prueba: construye libros Excel reales con SheetJS (el mismo que usa la aplicación). */
const path = require('path');
const XLSX = require(path.join(__dirname, '..', 'vendor', 'xlsx.full.min.js'));
const U = require('../js/util.js');

function dateCell(iso, fmt) { return { t: 'n', v: U.isoToSerial(iso), z: fmt || 'dd/mm/yyyy' }; }
function pctCell(frac) { return { t: 'n', v: frac, z: '0%' }; }

/* rows: matriz; las celdas pueden ser valores simples u objetos de celda de SheetJS. Devuelve un Buffer .xlsx */
function makeXlsx(sheets) {
  const wb = XLSX.utils.book_new();
  sheets.forEach((sh) => {
    const ws = {};
    let maxC = 0;
    sh.rows.forEach((row, r) => row.forEach((v, c) => {
      if (v === null || v === undefined || v === '') return;
      const addr = XLSX.utils.encode_cell({ r, c });
      ws[addr] = (typeof v === 'object') ? v : (typeof v === 'number' ? { t: 'n', v } : { t: 's', v: String(v) });
      maxC = Math.max(maxC, c);
    }));
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: sh.rows.length - 1, c: maxC } });
    if (sh.merges) ws['!merges'] = sh.merges;
    XLSX.utils.book_append_sheet(wb, ws, sh.name);
  });
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

/* Planning "realista": filas de título, cabecera en la fila 5, capítulos con código jerárquico, hito y fechas de varios tipos. */
function realisticPlanning() {
  return makeXlsx([{
    name: 'Planning',
    rows: [
      ['REFORMA LOCAL CALLE MAYOR 12'],
      ['Cliente: Ejemplo S.L.'],
      [],
      [],
      ['Nº', 'Capítulo / Actividad', 'Inicio', 'Fin', 'Duración', '% Avance', 'Observaciones'],
      ['1', 'DEMOLICIONES Y ALBAÑILERÍA'],
      ['1.1', 'Implantación y protecciones', dateCell('2026-11-16'), dateCell('2026-11-18'), 3, pctCell(1)],
      ['1.2', 'Demoliciones y desescombro', dateCell('2026-11-19', 'm/d/yy'), dateCell('2026-11-25', 'm/d/yy'), 5, pctCell(0.7)],
      ['1.3', 'Tabiquería', '26-nov-26', '04/12/2026', 7, pctCell(0)],
      ['2', 'INSTALACIONES'],
      ['2.1', 'Instalación eléctrica', dateCell('2026-12-02'), null, 10, pctCell(0)],
      ['2.2', 'Climatización', dateCell('2026-12-05'), dateCell('2026-12-17'), 9],
      ['2.3', 'HITO: Boletín eléctrico presentado', dateCell('2026-12-18'), dateCell('2026-12-18'), 0],
      ['3', 'ACABADOS'],
      ['3.1', 'Pavimentos y revestimientos', dateCell('2026-12-16'), dateCell('2026-12-29'), 10],
      ['3.2', 'Remates y limpieza', dateCell('2027-01-25'), dateCell('2027-01-30'), 5]
    ]
  }]);
}

module.exports = { XLSX, makeXlsx, dateCell, pctCell, realisticPlanning };
