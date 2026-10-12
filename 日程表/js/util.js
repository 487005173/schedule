/* 学习积分日程表 — 通用工具（window.U / node require 均可） */
(function (global) {
  'use strict';
  var U = {};

  /* ---------- id / 时间戳 ---------- */
  U.uid = function (prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };
  U.now = function () { return new Date().toISOString(); };

  /* ---------- 日期：统一用本地日期字符串 YYYY-MM-DD ---------- */
  U.dstr = function (d) {
    var y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  };
  U.today = function () { return U.dstr(new Date()); };
  U.parse = function (s) {
    if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate());
    if (!s) return new Date();
    var p = String(s).slice(0, 10).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  };
  U.addDays = function (s, n) { var d = U.parse(s); d.setDate(d.getDate() + n); return U.dstr(d); };
  U.addMonths = function (s, n) { var d = U.parse(s); d.setMonth(d.getMonth() + n); return U.dstr(d); };
  U.diffDays = function (a, b) { return Math.round((U.parse(a) - U.parse(b)) / 86400000); };
  U.weekday = function (s) { return U.parse(s).getDay(); };          // 0=周日 … 6=周六
  U.weekdayName = function (s) { return '日一二三四五六'.charAt(U.weekday(s)); };
  U.daysInMonth = function (s) {
    var d = U.parse(s);
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  };
  /* 一周的第一天：start=1 表示周一开头 */
  U.weekStartOf = function (s, start) {
    start = start === 0 ? 0 : 1;
    var back = (U.weekday(s) - start + 7) % 7;
    return U.addDays(s, -back);
  };
  U.weekDates = function (s, start) {
    var first = U.weekStartOf(s, start), out = [];
    for (var i = 0; i < 7; i++) out.push(U.addDays(first, i));
    return out;
  };
  /* 月历网格（含前后补白），返回 42 天 */
  U.monthGrid = function (s, start) {
    var first = U.dstr(new Date(U.parse(s).getFullYear(), U.parse(s).getMonth(), 1));
    var gridStart = U.weekStartOf(first, start), out = [];
    for (var i = 0; i < 42; i++) out.push(U.addDays(gridStart, i));
    return out;
  };

  /* ---------- 日期显示 ---------- */
  U.fmtMD = function (s) { var d = U.parse(s); return (d.getMonth() + 1) + '月' + d.getDate() + '日'; };
  U.fmtMDShort = function (s) { var d = U.parse(s); return (d.getMonth() + 1) + '/' + d.getDate(); };
  U.fmtLong = function (s) { var d = U.parse(s); return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + U.weekdayName(s); };
  U.fmtRel = function (s) {
    var n = U.diffDays(s, U.today());
    if (n === 0) return '今天';
    if (n === 1) return '明天';
    if (n === 2) return '后天';
    if (n === -1) return '昨天';
    return '周' + U.weekdayName(s);
  };
  U.fmtDue = function (s) {
    if (!s) return '';
    var n = U.diffDays(s, U.today());
    if (n === 0) return '今天';
    if (n === 1) return '明天';
    if (n === -1) return '昨天';
    if (n < 0) return '逾期' + (-n) + '天';
    if (n < 7) return '周' + U.weekdayName(s);
    return U.fmtMD(s);
  };

  /* ---------- 数字 ---------- */
  U.num = function (n) {
    n = Math.round(Number(n) || 0);
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };
  U.clamp = function (n, a, b) { return Math.min(b, Math.max(a, n)); };
  U.round = function (n, digits) { var p = Math.pow(10, digits || 0); return Math.round(n * p) / p; };
  U.toMin = function (hhmm) {
    if (!hhmm) return null;
    var p = String(hhmm).split(':');
    return Number(p[0]) * 60 + Number(p[1] || 0);
  };
  U.minToHM = function (m) {
    m = Math.max(0, Math.round(m || 0));
    var h = Math.floor(m / 60), mm = m % 60;
    if (h && mm) return h + '小时' + mm + '分';
    if (h) return h + '小时';
    return mm + '分钟';
  };
  U.minToClock = function (m) {
    m = Math.max(0, Math.round(m || 0));
    return Math.floor(m / 60) + ':' + ('0' + (m % 60)).slice(-2);
  };

  /* ---------- 其它 ---------- */
  U.clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  U.escape = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  U.debounce = function (fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  };
  U.download = function (filename, text, mime) {
    var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
  };
  U.range = function (n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; };
  U.unique = function (a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); };

  global.U = U;
  if (typeof module !== 'undefined' && module.exports) module.exports = U;
})(typeof globalThis !== 'undefined' ? globalThis : this);
