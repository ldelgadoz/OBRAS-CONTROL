/* OBRA CONTROL · lectura y escritura de CSV (delimitador y codificación automáticos). */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.OC = root.OC || {}; root.OC.csv = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Los CSV de Excel en español suelen venir en Windows-1252, no en UTF-8. */
  function decodeBytes(bytes) {
    var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u8.length >= 3 && u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) u8 = u8.subarray(3);
    try {
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(u8), encoding: 'UTF-8' };
    } catch (e) {
      return { text: new TextDecoder('windows-1252').decode(u8), encoding: 'Windows-1252' };
    }
  }

  /* Cuenta separadores fuera de comillas, línea a línea, y elige el más consistente. */
  function detectDelimiter(text) {
    var cands = [';', ',', '\t', '|'];
    var lines = [], counts = {}, inQ = false;
    cands.forEach(function (c) { counts[c] = 0; });
    var limit = Math.min(text.length, 6000);
    for (var i = 0; i < limit; i++) {
      var ch = text[i];
      if (ch === '"') inQ = !inQ;
      else if (!inQ && (ch === '\n' || ch === '\r')) {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        lines.push(counts); counts = {}; cands.forEach(function (c) { counts[c] = 0; });
        if (lines.length >= 25) break;
      } else if (!inQ && counts[ch] !== undefined) counts[ch]++;
    }
    var best = ',', bestScore = 0;
    cands.forEach(function (c) {
      var freq = {};
      lines.forEach(function (l) { if (l[c] > 0) freq[l[c]] = (freq[l[c]] || 0) + 1; });
      var score = 0;
      Object.keys(freq).forEach(function (k) { score = Math.max(score, freq[k] * (+k)); });
      if (score > bestScore) { bestScore = score; best = c; }
    });
    return best;
  }

  function parse(text, delimiter) {
    delimiter = delimiter || detectDelimiter(text);
    var rows = [], row = [], field = '', inQ = false, n = text.length;
    for (var i = 0; i < n; i++) {
      var c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += c;
      } else if (c === '"' && field === '') inQ = true;
      else if (c === delimiter) { row.push(field); field = ''; }
      else if (c === '\r' || c === '\n') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    rows = rows.map(function (r) {
      return r.map(function (f) { f = f.trim(); return f === '' ? null : f; });
    });
    while (rows.length && rows[rows.length - 1].every(function (f) { return f === null; })) rows.pop();
    return rows;
  }

  function stringify(rows, delimiter) {
    delimiter = delimiter || ';';
    return rows.map(function (r) {
      return r.map(function (v) {
        var s = v === null || v === undefined ? '' : String(v);
        return /["\n\r]/.test(s) || s.indexOf(delimiter) >= 0 ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(delimiter);
    }).join('\r\n');
  }

  return { decodeBytes: decodeBytes, detectDelimiter: detectDelimiter, parse: parse, stringify: stringify };
});
