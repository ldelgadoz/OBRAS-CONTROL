/* OBRA CONTROL · importador de planning (Excel .xlsx/.xls y CSV).
 * Pasos: readWorkbook -> detectHeaderRow -> guessMapping -> buildRows.
 * No toca datos de la aplicación: solo transforma un archivo en filas normalizadas. */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = factory(isNode ? require('./util.js') : root.OC.util, isNode ? require('./csv.js') : root.OC.csv);
  if (isNode) module.exports = api;
  else { root.OC = root.OC || {}; root.OC.importer = api; }
})(typeof self !== 'undefined' ? self : this, function (U, CSV) {
  'use strict';

  var FIELDS = ['code', 'name', 'start', 'end', 'duration', 'progress', 'status', 'chapter', 'milestone', 'level'];
  var FIELD_LABELS = {
    code: 'Código', name: 'Actividad / descripción', start: 'Inicio previsto', end: 'Fin previsto',
    duration: 'Duración (días)', progress: 'Avance (%)', status: 'Estado', chapter: 'Capítulo (columna)',
    milestone: 'Hito (sí/no)', level: 'Nivel jerárquico'
  };
  /* Sinónimos ya normalizados (sin tildes, minúsculas). */
  var SYN = {
    code: ['codigo', 'cod', 'id', 'n', 'nº', 'n°', 'no', 'num', 'numero', 'ref', 'referencia', 'wbs', 'item', 'partida n', 'n partida'],
    name: ['actividad', 'actividades', 'tarea', 'tareas', 'descripcion', 'concepto', 'trabajo', 'trabajos', 'nombre', 'partida', 'unidad de obra', 'denominacion'],
    start: ['inicio', 'fecha inicio', 'f inicio', 'comienzo', 'fecha comienzo', 'start', 'desde', 'inicio previsto', 'fecha de inicio', 'inicio prev'],
    end: ['fin', 'final', 'fecha fin', 'f fin', 'terminacion', 'finalizacion', 'fecha final', 'end', 'hasta', 'fin previsto', 'fecha de fin', 'fin prev'],
    duration: ['duracion', 'dias', 'dur', 'plazo', 'dias naturales', 'dias laborables'],
    progress: ['avance', '% avance', 'progreso', '% completado', 'ejecutado', '% ejecucion', '%', 'completado', 'avance real'],
    status: ['estado', 'situacion'],
    chapter: ['capitulo', 'fase', 'zona', 'area'],
    milestone: ['hito', 'hitos'],
    level: ['nivel']
  };

  function normHeader(s) { return U.normText(s); }

  function hasTokens(hTokens, sTokens) {
    for (var i = 0; i + sTokens.length <= hTokens.length; i++) {
      var ok = true;
      for (var j = 0; j < sTokens.length; j++) if (hTokens[i + j] !== sTokens[j]) { ok = false; break; }
      if (ok) return true;
    }
    return false;
  }

  /* 3 = coincidencia exacta, 2 = contiene el sinónimo como palabra(s), 0 = nada. */
  function scoreHeader(text, field) {
    var h = normHeader(text);
    if (!h) return 0;
    var tokens = h.split(' ');
    if ((field === 'start' || field === 'end') && (tokens.indexOf('real') >= 0 || tokens.indexOf('base') >= 0 || tokens.indexOf('reales') >= 0)) return 0;
    if (field === 'progress' && tokens.indexOf('previsto') >= 0) return 0;
    var best = 0;
    SYN[field].forEach(function (syn) {
      if (h === syn) best = Math.max(best, 3);
      else if (syn.length >= 3 && hasTokens(tokens, syn.split(' '))) best = Math.max(best, 2);
    });
    return best;
  }

  function classifyHeader(text) {
    var best = null;
    FIELDS.forEach(function (f) {
      var s = scoreHeader(text, f);
      if (s > 0 && (!best || s > best.score)) best = { field: f, score: s };
    });
    return best;
  }

  /* ---------- Lectura de archivos ---------- */
  function roundTo(n, d) { var p = Math.pow(10, d); return Math.round(n * p) / p; }

  function cellValue(X, cell) {
    if (!cell || cell.v === undefined || cell.v === null) return null;
    switch (cell.t) {
      case 'n': {
        var z = cell.z;
        if (z && X.SSF && X.SSF.is_date(z)) {
          var d = X.SSF.parse_date_code(cell.v);
          if (d && d.y >= 1950) return U.toISO(d.y, d.m, d.d) || null;
        }
        if (z && String(z).indexOf('%') >= 0) return roundTo(cell.v * 100, 4) + '%';
        return cell.v;
      }
      case 'd':
        return cell.v instanceof Date ? (U.toISO(cell.v.getFullYear(), cell.v.getMonth() + 1, cell.v.getDate()) || null) : null;
      case 'b': return !!cell.v;
      case 's': case 'str': { var s = String(cell.v).trim(); return s === '' ? null : s; }
      default: return null;
    }
  }

  function sheetToGrid(X, ws) {
    var ref = ws['!ref'];
    if (!ref) return [];
    var range = X.utils.decode_range(ref);
    var maxR = Math.min(range.e.r, 19999), maxC = Math.min(range.e.c, 80);
    var grid = [], r, c;
    for (r = 0; r <= maxR; r++) {
      var row = [];
      for (c = 0; c <= maxC; c++) row.push(cellValue(X, ws[X.utils.encode_cell({ r: r, c: c })]));
      grid.push(row);
    }
    /* Celdas combinadas en vertical (p. ej. un capítulo que ocupa varias filas): se rellena hacia abajo. */
    (ws['!merges'] || []).forEach(function (m) {
      if (m.s.c === m.e.c && m.e.r > m.s.r && grid[m.s.r]) {
        var v = grid[m.s.r][m.s.c];
        for (var rr = m.s.r + 1; rr <= Math.min(m.e.r, maxR); rr++) if (grid[rr] && grid[rr][m.s.c] === null) grid[rr][m.s.c] = v;
      }
    });
    while (grid.length && grid[grid.length - 1].every(function (v) { return v === null; })) grid.pop();
    return grid;
  }

  function nonEmptyRows(grid) {
    return grid.filter(function (r) { return r.some(function (v) { return v !== null; }); }).length;
  }

  /* Devuelve {kind, sheets:[{name, grid, rows}], meta}. opts.XLSX = biblioteca SheetJS (en el navegador, window.XLSX). */
  function readWorkbook(buffer, fileName, opts) {
    var lower = String(fileName || '').toLowerCase();
    var u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (/\.(csv|txt|tsv)$/.test(lower)) {
      var dec = CSV.decodeBytes(u8);
      var delim = CSV.detectDelimiter(dec.text);
      var grid = CSV.parse(dec.text, delim);
      return { kind: 'csv', sheets: [{ name: 'CSV', grid: grid, rows: nonEmptyRows(grid) }], meta: { encoding: dec.encoding, delimiter: delim } };
    }
    var X = (opts && opts.XLSX) || (typeof window !== 'undefined' ? window.XLSX : null);
    if (!X) throw new Error('No se ha cargado el lector de Excel (vendor/xlsx.full.min.js).');
    var wb = X.read(u8, { type: 'array', cellNF: true, cellFormula: false, cellStyles: false });
    var sheets = wb.SheetNames.map(function (name) {
      var g = sheetToGrid(X, wb.Sheets[name]);
      return { name: name, grid: g, rows: nonEmptyRows(g) };
    }).filter(function (s) { return s.rows > 0; });
    if (!sheets.length) throw new Error('El archivo no contiene ninguna hoja con datos.');
    return { kind: 'xlsx', sheets: sheets, meta: {} };
  }

  /* ---------- Cabeceras y mapeo ---------- */
  function detectHeaderRow(grid) {
    var best = { index: 0, score: 0 }, limit = Math.min(grid.length, 40);
    for (var i = 0; i < limit; i++) {
      var score = 0, fields = {};
      grid[i].forEach(function (cell) {
        if (typeof cell !== 'string') return;
        var f = classifyHeader(cell);
        if (f && !fields[f.field]) { fields[f.field] = 1; score += f.score >= 3 ? 2 : 1; }
      });
      if (score > best.score) best = { index: i, score: score };
    }
    if (best.score < 2) {
      for (var j = 0; j < limit; j++) {
        var strings = grid[j].filter(function (v) { return typeof v === 'string'; }).length;
        if (strings >= 2) return { index: j, score: 0, confident: false };
      }
      return { index: 0, score: 0, confident: false };
    }
    best.confident = true;
    return best;
  }

  /* headers: array de textos de la fila de cabecera. Devuelve {campo: índiceDeColumna | null}. */
  function guessMapping(headers) {
    var pairs = [];
    headers.forEach(function (h, col) {
      if (typeof h !== 'string') return;
      FIELDS.forEach(function (f) { var s = scoreHeader(h, f); if (s > 0) pairs.push({ col: col, field: f, score: s }); });
    });
    pairs.sort(function (a, b) { return b.score - a.score || a.col - b.col; });
    var mapping = {}, usedCols = {};
    FIELDS.forEach(function (f) { mapping[f] = null; });
    pairs.forEach(function (p) {
      if (mapping[p.field] === null && !usedCols[p.col]) { mapping[p.field] = p.col; usedCols[p.col] = true; }
    });
    return mapping;
  }

  /* ---------- Normalización de filas ---------- */
  function truthy(v) {
    if (v === true) return true;
    if (typeof v === 'number') return v === 1;
    if (typeof v !== 'string') return false;
    return ['si', 'x', '1', 'true', 'yes', 's', 'hito'].indexOf(U.normText(v)) >= 0;
  }

  function parseNumber(v) {
    if (typeof v === 'number') return v;
    if (typeof v !== 'string') return NaN;
    var s = v.replace('%', '').replace(',', '.').trim();
    return /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN;
  }

  function codeDepth(code) {
    var c = String(code || '').trim().replace(/\.$/, '');
    return /^\d+(\.\d+)+$/.test(c) ? c.split('.').length : (/^\d+$/.test(c) ? 1 : 0);
  }

  /* opts: {dateOrder:'dmy'|'mdy', durationMode:'working'|'calendar'|'none'} */
  function buildRows(grid, headerRow, mapping, opts) {
    opts = opts || {};
    var order = opts.dateOrder === 'mdy' ? 'mdy' : 'dmy';
    var durMode = opts.durationMode || 'working';
    var warnings = [], rows = [];
    var col = function (row, f) { return mapping[f] === null || mapping[f] === undefined ? null : row[mapping[f]]; };

    /* Avance: ¿la columna usa fracciones (0,7) o porcentajes (70)? */
    var nums = [];
    if (mapping.progress !== null && mapping.progress !== undefined) {
      for (var i = headerRow + 1; i < grid.length; i++) {
        var pv = grid[i][mapping.progress];
        if (typeof pv === 'number') nums.push(pv);
        else if (typeof pv === 'string' && pv.indexOf('%') < 0) { var pn = parseNumber(pv); if (!isNaN(pn)) nums.push(pn); }
      }
    }
    var fractionMode = nums.length > 0 && nums.every(function (n) { return n <= 1; }) && nums.some(function (n) { return n > 0 && n < 1; });

    var lastChapterName = null;
    for (var r = headerRow + 1; r < grid.length; r++) {
      var g = grid[r];
      if (!g || g.every(function (v) { return v === null; })) continue;
      var rowNo = r + 1, warn = [];
      var name = col(g, 'name'); name = name === null || name === undefined ? '' : String(name).trim();
      var codeRaw = col(g, 'code'); var code = codeRaw === null || codeRaw === undefined ? '' : String(codeRaw).trim();
      if (!name) {
        if (code || col(g, 'start') !== null || col(g, 'end') !== null) warnings.push({ rowNo: rowNo, text: 'Fila ' + rowNo + ' ignorada: tiene datos pero no descripción.' });
        continue;
      }

      var start = '', end = '', startRaw = col(g, 'start'), endRaw = col(g, 'end');
      if (startRaw !== null && startRaw !== undefined) { start = U.parseDate(startRaw, order); if (!start) warn.push('Fecha de inicio no válida: "' + startRaw + '"'); }
      if (endRaw !== null && endRaw !== undefined) { end = U.parseDate(endRaw, order); if (!end) warn.push('Fecha de fin no válida: "' + endRaw + '"'); }
      var durRaw = col(g, 'duration'), dur = durRaw === null ? NaN : Math.round(parseNumber(durRaw));
      if (start && !end && dur >= 1 && durMode !== 'none') end = U.endFromDuration(start, dur, durMode);
      if (start && !end && dur === 0) end = start;
      if (!start && end && dur >= 1 && durMode !== 'none') {
        /* solo fin y duración: se deja sin inicio y se avisa */
        warn.push('Tiene fin y duración pero no inicio');
      }
      if (start && end && end < start) warn.push('El fin es anterior al inicio');

      var progress = null;
      var progRaw = col(g, 'progress');
      if (progRaw !== null && progRaw !== undefined) {
        var pn2 = parseNumber(progRaw);
        if (!isNaN(pn2)) {
          var hasPct = typeof progRaw === 'string' && progRaw.indexOf('%') >= 0;
          progress = U.clamp(Math.round(fractionMode && !hasPct ? pn2 * 100 : pn2), 0, 100);
        } else warn.push('Avance no válido: "' + progRaw + '"');
      }

      var chapterVal = col(g, 'chapter');
      if (chapterVal !== null && chapterVal !== undefined && String(chapterVal).trim() !== '' && U.normText(chapterVal) !== U.normText(lastChapterName)) {
        lastChapterName = String(chapterVal).trim();
        rows.push({ rowNo: rowNo, code: '', name: lastChapterName, kind: 'chapter', level: 0, parentIndex: null, start: '', end: '', duration: 0, progress: null, synthetic: true, explicitLevel: true, warnings: [] });
      }
      var hasChapterCol = mapping.chapter !== null && mapping.chapter !== undefined;

      var lvlRaw = col(g, 'level'), lvlNum = lvlRaw === null ? NaN : parseNumber(lvlRaw);
      var depth = codeDepth(code);
      var duration = start && end ? U.diffDays(start, end) + 1 : 0;
      var isMilestone = truthy(col(g, 'milestone')) || dur === 0 || /^hito\b/i.test(U.normText(name));
      var headingOnly = !start && !end && !(dur >= 1) && !isMilestone;

      rows.push({
        rowNo: rowNo, code: code, name: name, kind: headingOnly ? 'chapter' : (isMilestone ? 'milestone' : 'activity'),
        level: !isNaN(lvlNum) && lvlNum >= 1 ? Math.round(lvlNum) - 1 : null, depth: depth, hasChapterCol: hasChapterCol,
        parentIndex: null, start: start, end: end, duration: duration, progress: progress, warnings: warn
      });
    }

    /* Niveles: por código jerárquico (1, 1.1, 1.1.1), por columna Nivel, o por estructura (títulos sin fechas). */
    var dotted = rows.some(function (x) { return /\./.test(String(x.code || '').replace(/\.$/, '')); });
    var chapterLevel = -1;
    rows.forEach(function (x) {
      if (x.synthetic) { chapterLevel = 0; return; }
      var lvl;
      if (x.level !== null) lvl = x.level;
      else if (dotted && x.depth > 0) lvl = x.depth - 1;
      else if (x.kind === 'chapter') lvl = 0;
      else lvl = chapterLevel >= 0 ? chapterLevel + 1 : 0;
      if (x.hasChapterCol && x.level === null && !(dotted && x.depth > 0) && x.kind !== 'chapter') lvl = 1;
      x.level = lvl;
      if (x.kind === 'chapter') chapterLevel = lvl;
    });
    /* Una fila con hijos de nivel más profundo es un capítulo (aunque tenga fechas: fila resumen). */
    for (var k = 0; k < rows.length - 1; k++) if (rows[k + 1].level > rows[k].level) rows[k].kind = 'chapter';
    var stack = [];
    rows.forEach(function (x, idx) {
      while (stack.length && rows[stack[stack.length - 1]].level >= x.level) stack.pop();
      x.parentIndex = stack.length ? stack[stack.length - 1] : null;
      if (x.kind === 'chapter') stack.push(idx);
      delete x.depth; delete x.hasChapterCol; delete x.explicitLevel;
    });

    /* Avisos de calidad. */
    var seenCodes = {}, seenNames = {};
    rows.forEach(function (x) {
      if (x.kind !== 'chapter' && !x.start && !x.end) x.warnings.push('Sin fechas previstas');
      var ck = x.code && x.code.replace(/\.0+$/, '').toLowerCase();
      if (ck) { if (seenCodes[ck]) x.warnings.push('Código repetido en el archivo (también en la fila ' + seenCodes[ck] + ')'); else seenCodes[ck] = x.rowNo; }
      var nk = U.normText(x.name) + '|' + (x.parentIndex === null ? '' : rows[x.parentIndex].name);
      if (x.kind !== 'chapter') { if (seenNames[nk]) x.warnings.push('Descripción repetida dentro del mismo capítulo'); else seenNames[nk] = x.rowNo; }
      x.warnings.forEach(function (w) { warnings.push({ rowNo: x.rowNo, text: 'Fila ' + x.rowNo + ': ' + w + '.' }); });
    });

    var stats = { total: rows.length, chapters: 0, activities: 0, milestones: 0, withWarnings: 0, minDate: '', maxDate: '' };
    rows.forEach(function (x) {
      stats[x.kind === 'chapter' ? 'chapters' : (x.kind === 'milestone' ? 'milestones' : 'activities')]++;
      if (x.warnings.length) stats.withWarnings++;
      [x.start, x.end].forEach(function (d) {
        if (d && (!stats.minDate || d < stats.minDate)) stats.minDate = d;
        if (d && (!stats.maxDate || d > stats.maxDate)) stats.maxDate = d;
      });
    });
    return { rows: rows, warnings: warnings, stats: stats, fractionMode: fractionMode };
  }

  /* Valores de una columna (para detectar día/mes). */
  function columnValues(grid, headerRow, colIdx) {
    var out = [];
    if (colIdx === null || colIdx === undefined) return out;
    for (var i = headerRow + 1; i < grid.length; i++) out.push(grid[i][colIdx]);
    return out;
  }

  return {
    FIELDS: FIELDS, FIELD_LABELS: FIELD_LABELS, readWorkbook: readWorkbook, detectHeaderRow: detectHeaderRow,
    guessMapping: guessMapping, buildRows: buildRows, columnValues: columnValues, scoreHeader: scoreHeader
  };
});
