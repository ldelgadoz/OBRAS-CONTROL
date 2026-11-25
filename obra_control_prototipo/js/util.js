/* OBRA CONTROL · utilidades comunes (fechas, texto, ids).
 * Funciona en el navegador (window.OC.util) y en Node (require) para poder probarlo. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.OC = root.OC || {}; root.OC.util = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function pad2(n) { return String(n).padStart(2, '0'); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function uid() {
    return Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 8);
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- Fechas (siempre texto ISO AAAA-MM-DD, sin zonas horarias) ---------- */
  function isoValid(y, m, d) {
    if (!(y >= 1900 && y <= 2200) || m < 1 || m > 12 || d < 1 || d > 31) return false;
    var dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }
  function toISO(y, m, d) { return isoValid(y, m, d) ? y + '-' + pad2(m) + '-' + pad2(d) : ''; }
  /* "Hoy" según el reloj local del usuario (no UTC). */
  function todayISO(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function dayNum(iso) {
    if (!iso) return NaN;
    var p = String(iso).split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000;
  }
  function diffDays(a, b) { return Math.round(dayNum(b) - dayNum(a)); }
  function addDays(iso, n) {
    var d = new Date((dayNum(iso) + n) * 86400000);
    return toISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  function isWeekend(iso) {
    var w = new Date(dayNum(iso) * 86400000).getUTCDay();
    return w === 0 || w === 6;
  }
  /* Fecha de fin para una duración en días (inclusive). mode: 'working' (L-V) | 'calendar'. */
  function endFromDuration(start, days, mode) {
    if (!start || !(days >= 1)) return start || '';
    if (mode === 'calendar') return addDays(start, days - 1);
    var d = start, left = days - 1;
    while (left > 0) { d = addDays(d, 1); if (!isWeekend(d)) left--; }
    return d;
  }
  function serialToISO(n) {
    var ms = Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000;
    var d = new Date(ms);
    return toISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  function isoToSerial(iso) { return dayNum(iso) + 25569; }
  function fmtDate(iso) {
    if (!iso) return '—';
    var p = String(iso).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso);
  }
  function fmtDateTime(isoDateTime) {
    if (!isoDateTime) return '—';
    var d = new Date(isoDateTime);
    if (isNaN(d)) return String(isoDateTime);
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /* ---------- Texto ---------- */
  function normText(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9%º°ª\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  var MONTHS = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12 };

  /* Convierte casi cualquier fecha habitual en una hoja de planning a ISO.
   * order: 'dmy' (por defecto, España) o 'mdy' para fechas numéricas ambiguas. */
  function parseDate(value, order) {
    order = order === 'mdy' ? 'mdy' : 'dmy';
    if (value === null || value === undefined || value === '') return '';
    if (value instanceof Date) return isNaN(value) ? '' : toISO(value.getFullYear(), value.getMonth() + 1, value.getDate());
    if (typeof value === 'number') return (value > 20000 && value < 80000) ? serialToISO(value) : '';
    var s = String(value).trim();
    if (!s) return '';
    var m = s.match(/(?:^|[^\d])(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?!\d)/);
    if (m) return toISO(+m[1], +m[2], +m[3]);
    m = s.match(/(?:^|[^\d])(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2}|\d{4})(?!\d)/);
    if (m) {
      var y = +m[3]; if (m[3].length === 2) y += 2000;
      var a = +m[1], b = +m[2];
      return toISO(y, order === 'mdy' ? a : b, order === 'mdy' ? b : a);
    }
    m = s.match(/(\d{1,2})[\s\-\/.]*(?:de\s+)?([a-záéíóúñ]{3,10})\.?[\s\-\/.,]*(?:de\s+|del\s+)?(\d{2}|\d{4})(?!\d)/i);
    if (m) {
      var mo = MONTHS[normText(m[2]).slice(0, 3)];
      if (mo) { var yy = +m[3]; if (m[3].length === 2) yy += 2000; return toISO(yy, mo, +m[1]); }
    }
    if (/^\d{5}$/.test(s)) { var n = +s; if (n > 20000 && n < 80000) return serialToISO(n); }
    return '';
  }

  /* Mira las fechas numéricas de una columna para decidir día/mes o mes/día. */
  function detectDateOrder(values) {
    var dmy = 0, mdy = 0;
    (values || []).forEach(function (v) {
      if (typeof v !== 'string') return;
      var m = v.match(/(?:^|[^\d])(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2}|\d{4})(?!\d)/);
      if (!m) return;
      var a = +m[1], b = +m[2];
      if (a > 12 && b <= 12) dmy++;
      else if (b > 12 && a <= 12) mdy++;
    });
    return { order: mdy > dmy ? 'mdy' : 'dmy', evidence: dmy + mdy > 0, conflicting: dmy > 0 && mdy > 0 };
  }

  return {
    pad2: pad2, esc: esc, uid: uid, clamp: clamp, clone: clone,
    isoValid: isoValid, toISO: toISO, todayISO: todayISO, dayNum: dayNum, diffDays: diffDays, addDays: addDays,
    isWeekend: isWeekend, endFromDuration: endFromDuration, serialToISO: serialToISO, isoToSerial: isoToSerial,
    fmtDate: fmtDate, fmtDateTime: fmtDateTime, normText: normText, parseDate: parseDate, detectDateOrder: detectDateOrder
  };
});
