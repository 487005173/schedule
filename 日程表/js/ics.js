/* 学习积分日程表 — 导出 .ics 日历（带时间的任务 + 每日两次固定提醒） */
(function (global) {
  'use strict';
  var U = global.U;
  var ICS = {};

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }
  function byteLen(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      n += c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
    }
    return n;
  }
  /* RFC5545：单行不超过 75 字节，超出折行（续行以空格开头） */
  function fold(line) {
    if (byteLen(line) <= 73) return line;
    var out = '', cur = '', size = 0;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i], c = line.charCodeAt(i);
      var w = c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
      if (size + w > 73) { out += cur + '\r\n '; cur = ''; size = 1; }
      cur += ch; size += w;
    }
    return out + cur;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hhmm(t) {
    var p = String(t || '09:00').split(':');
    return { h: Number(p[0]) || 0, m: Number(p[1]) || 0 };
  }
  /* 本地浮动时间戳：YYYYMMDDTHHMMSS（不加 Z，日历按本地时区解释） */
  function stamp(dateStr, time, addMinutes) {
    var d = U.parse(dateStr), t = hhmm(time);
    var dt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), t.h, t.m + (addMinutes || 0));
    return dt.getFullYear() + pad(dt.getMonth() + 1) + pad(dt.getDate()) + 'T' + pad(dt.getHours()) + pad(dt.getMinutes()) + '00';
  }
  function dtstamp() { return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }

  function guessTZ() {
    try {
      var m = String(new Date()).match(/\(([^)]+)\)/);
      if (m) return m[1];
    } catch (e) { }
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'; } catch (e) { return 'Asia/Shanghai'; }
  }
  function vevent(o) {
    var lines = ['BEGIN:VEVENT', 'UID:' + esc(o.uid), 'DTSTAMP:' + dtstamp(), 'DTSTART:' + o.start];
    if (o.end) lines.push('DTEND:' + o.end);
    if (o.rrule) lines.push('RRULE:' + o.rrule);
    lines.push('SUMMARY:' + esc(o.summary));
    if (o.description) lines.push('DESCRIPTION:' + esc(o.description));
    if (o.priority) lines.push('PRIORITY:' + o.priority);
    if (o.alarm != null) {
      lines.push('BEGIN:VALARM', 'TRIGGER:' + (o.alarm === 0 ? 'PT0M' : '-PT' + o.alarm + 'M'),
        'ACTION:DISPLAY', 'DESCRIPTION:' + esc(o.summary), 'END:VALARM');
    }
    lines.push('END:VEVENT');
    return lines;
  }

  /* 生成未来 N 天的日历；只导出「带具体时间」的任务 + 每日两次固定提醒 */
  ICS.build = function (state, opts) {
    opts = opts || {};
    var days = opts.days || 60;
    var from = opts.from || U.today();
    var to = U.addDays(from, days);
    var settings = state.settings || {};
    var appName = settings.appName || '学习积分日程表';
    var lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//study-points-schedule//CN', 'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH', 'X-WR-CALNAME:' + esc(appName), 'X-WR-TIMEZONE:' + esc(guessTZ()),
      'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'
    ];

    var occ = global.Logic.occurrencesBetween(state, from, to, 400);
    var used = 0;
    occ.forEach(function (item) {
      var t = item.task;
      if (used >= 300 || !t.time || item.done) return;
      var cat = global.Logic.categoryOf(state, t.categoryId);
      var mins = Number(t.estimateMin) || 30;
      var pts = Number(t.points) || 0;
      var desc = [];
      if (t.note) desc.push(t.note);
      if (t.link) desc.push(t.link);
      desc.push('完成后可得 ' + pts + ' 积分');
      lines = lines.concat(vevent({
        uid: global.Logic.occKey(t, item.date) + '@study-points-schedule',
        start: stamp(item.date, t.time, 0),
        end: stamp(item.date, t.time, mins),
        summary: '[' + pts + '分] ' + t.title + (cat ? ' · ' + cat.name : ''),
        description: desc.join('\n'),
        priority: t.urgent ? 1 : (t.important ? 5 : 0),
        alarm: 10
      }));
      used++;
    });

    var rem = settings.reminders || {};
    if (rem.enabled !== false) {
      [{ time: rem.morning || '08:00', summary: '☀️ 今日计划 · ' + appName, desc: '看看今天要做什么，先拿下最容易的一项。' },
      { time: rem.evening || '21:00', summary: '🌙 今日复盘 · ' + appName, desc: '今天还剩哪些没完成？完成后记得去奖励商店兑换。' }]
        .forEach(function (r, i) {
          lines = lines.concat(vevent({
            uid: 'daily-reminder-' + i + '@study-points-schedule',
            start: stamp(from, r.time, 0),
            end: stamp(from, r.time, 15),
            rrule: 'FREQ=DAILY',
            summary: r.summary,
            description: r.desc,
            alarm: 0
          }));
        });
    }

    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  };

  ICS.count = function (state, opts) {
    opts = opts || {};
    var from = opts.from || U.today();
    var occ = global.Logic.occurrencesBetween(state, from, U.addDays(from, opts.days || 60), 400);
    return occ.filter(function (o) { return !!o.task.time && !o.done; }).length;
  };
  ICS.download = function (state, opts) {
    var text = ICS.build(state, opts);
    U.download('学习积分日程表-' + U.today() + '.ics', text, 'text/calendar');
    return text;
  };

  ICS.esc = esc; ICS.fold = fold; ICS.byteLen = byteLen; ICS.stamp = stamp; ICS.guessTZ = guessTZ;

  global.ICS = ICS;
  if (typeof module !== 'undefined' && module.exports) module.exports = ICS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
