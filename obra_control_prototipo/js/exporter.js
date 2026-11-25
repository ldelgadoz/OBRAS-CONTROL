/* OBRA CONTROL · exportación del planning (CSV y Excel). El archivo exportado se puede volver a importar. */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = factory(isNode ? require('./util.js') : root.OC.util, isNode ? require('./csv.js') : root.OC.csv, isNode ? require('./planning.js') : root.OC.planning);
  if (isNode) module.exports = api;
  else { root.OC = root.OC || {}; root.OC.exporter = api; }
})(typeof self !== 'undefined' ? self : this, function (U, CSV, P) {
  'use strict';

  var HEADERS = ['Nº', 'Actividad', 'Tipo', 'Nivel', 'Hito', 'Inicio previsto', 'Fin previsto', 'Inicio base', 'Fin base', 'Avance (%)', 'Estado', 'Inicio real', 'Fin real', 'Observaciones'];
  var DATE_COLS = [5, 6, 7, 8, 11, 12];
  var KIND = { activity: 'Actividad', milestone: 'Hito', chapter: 'Capítulo' };

  /* Los capítulos se exportan sin fechas (se derivan de sus actividades): así se reimportan como capítulos. */
  function planningTable(acts) {
    var rows = acts.filter(function (a) { return !a.removedFromPlan; }).map(function (a) {
      var ch = a.kind === 'chapter';
      return [a.code || '', a.name, KIND[a.kind] || 'Actividad', (a.level || 0) + 1, a.kind === 'milestone' ? 'Sí' : '',
        ch ? '' : a.start || '', ch ? '' : a.end || '', ch ? '' : a.baseStart || '', ch ? '' : a.baseEnd || '',
        ch ? '' : (a.progress || 0), ch ? '' : a.status || '', ch ? '' : a.actualStart || '', ch ? '' : a.actualEnd || '', ch ? '' : a.notes || ''];
    });
    return { headers: HEADERS, rows: rows, dateCols: DATE_COLS };
  }

  /* CSV con ; y BOM UTF-8: se abre bien con doble clic en Excel en español. */
  function toCSV(table) {
    var rows = [table.headers].concat(table.rows.map(function (r) {
      return r.map(function (v, c) { return table.dateCols.indexOf(c) >= 0 && v ? U.fmtDate(v) : v; });
    }));
    return '﻿' + CSV.stringify(rows, ';');
  }

  /* Excel: las fechas se escriben como fechas reales de Excel (número de serie + formato dd/mm/aaaa). */
  function toXlsx(X, table, sheetName) {
    var ws = {}, all = [table.headers].concat(table.rows);
    all.forEach(function (row, r) {
      row.forEach(function (v, c) {
        if (v === '' || v === null || v === undefined) return;
        var addr = X.utils.encode_cell({ r: r, c: c });
        if (r > 0 && table.dateCols.indexOf(c) >= 0) ws[addr] = { t: 'n', v: U.isoToSerial(v), z: 'dd/mm/yyyy' };
        else if (typeof v === 'number') ws[addr] = { t: 'n', v: v };
        else ws[addr] = { t: 's', v: String(v) };
      });
    });
    ws['!ref'] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: all.length - 1, c: table.headers.length - 1 } });
    ws['!cols'] = table.headers.map(function (h, i) { return { wch: i === 1 ? 44 : (i === 13 ? 30 : 14) }; });
    var wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, (sheetName || 'Planning').slice(0, 31));
    return X.write(wb, { type: 'array', bookType: 'xlsx' });
  }

  return { HEADERS: HEADERS, planningTable: planningTable, toCSV: toCSV, toXlsx: toXlsx };
});
