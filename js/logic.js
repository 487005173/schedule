/* 学习积分日程表 — 核心逻辑：重复任务、积分、连击、等级、统计 */
(function (global) {
  'use strict';
  var U = global.U || (typeof require !== 'undefined' ? require('./util.js') : null);

  var LEVEL_TITLES = ['初醒', '起步', '习惯养成', '小有所成', '稳步前行', '渐入佳境',
    '势不可挡', '学霸雏形', '名副其实', '学神', '卷王', '传说'];
  var WEEK_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

  function n(v) { return Number(v) || 0; }

  /* ------------------------------------------------------------ 重复规则 */
  function isRepeating(task) { return !!(task && task.repeat && task.repeat.type && task.repeat.type !== 'none'); }

  function repeatsOn(task, dateStr) {
    var rep = task.repeat;
    if (!isRepeating(task)) return false;
    var start = task.date;
    if (start && U.diffDays(dateStr, start) < 0) return false;
    if (rep.until && U.diffDays(dateStr, rep.until) > 0) return false;
    var wd = U.weekday(dateStr);
    switch (rep.type) {
      case 'daily': return true;
      case 'weekdays': return wd >= 1 && wd <= 5;
      case 'weekly': return (rep.days || []).indexOf(wd) >= 0;
      case 'monthly': {
        if (!start) return false;
        var sd = U.parse(start), dd = U.parse(dateStr);
        var target = Math.min(sd.getDate(), U.daysInMonth(dateStr));
        return dd.getDate() === target;
      }
      case 'interval': {
        if (!start) return false;
        var step = Math.max(1, n(rep.interval) || 2);
        return U.diffDays(dateStr, start) % step === 0;
      }
      default: return false;
    }
  }

  function occKey(task, dateStr) { return isRepeating(task) ? task.id + '@' + dateStr : task.id; }

  function repeatText(task) {
    var r = task.repeat;
    if (!isRepeating(task)) return '';
    var s;
    switch (r.type) {
      case 'daily': s = '每天'; break;
      case 'weekdays': s = '工作日'; break;
      case 'weekly': s = '每周' + (r.days || []).slice().sort().map(function (d) { return WEEK_NAMES[d]; }).join('、'); break;
      case 'monthly': s = '每月 ' + U.parse(task.date || U.today()).getDate() + ' 日'; break;
      case 'interval': s = '每 ' + (n(r.interval) || 2) + ' 天'; break;
      default: s = '重复';
    }
    if (r.until) s += '（至 ' + U.fmtMD(r.until) + '）';
    return s;
  }

  /* ------------------------------------------------------------ 查询 */
  function taskById(state, id) {
    var arr = state.tasks || [];
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id && !arr[i].deleted) return arr[i];
    return null;
  }
  function categoryOf(state, id) {
    var arr = state.categories || [];
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id && !arr[i].deleted) return arr[i];
    return null;
  }
  function rewardById(state, id) {
    var arr = state.rewards || [];
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id && !arr[i].deleted) return arr[i];
    return null;
  }

  function completionOf(state, task, dateStr) {
    var key = occKey(task, dateStr), arr = state.completions || [];
    for (var i = arr.length - 1; i >= 0; i--) {
      var c = arr[i];
      if (c.deleted) continue;
      if (c.id === key || c.key === key) return c;
    }
    return null;
  }

  function dueOn(task, dateStr) {
    if (!task || task.deleted) return false;
    if (isRepeating(task)) return repeatsOn(task, dateStr);
    return !!task.date && task.date === dateStr;
  }

  function priorityScore(task) {
    var s = 0;
    if (task.important) s += 2;
    if (task.urgent) s += 1;
    return s;
  }
  function sortTasks(a, b) {
    var A = a.task || a, B = b.task || b;
    var ta = U.toMin(A.time), tb = U.toMin(B.time);
    if (ta != null && tb != null) return ta - tb;
    if (ta != null) return -1;
    if (tb != null) return 1;
    var pa = priorityScore(A), pb = priorityScore(B);
    if (pa !== pb) return pb - pa;
    return n(A.order) - n(B.order);
  }

  /* 某天要做的（含逾期未完成的一次性任务，仅今天显示逾期区） */
  function dayItems(state, dateStr, opts) {
    opts = opts || {};
    var items = [], overdue = [], today = U.today();
    (state.tasks || []).forEach(function (t) {
      if (t.deleted) return;
      if (dueOn(t, dateStr)) {
        var c = completionOf(state, t, dateStr);
        items.push({ task: t, key: occKey(t, dateStr), date: dateStr, done: !!c, completion: c });
      }
    });
    if (dateStr === today && opts.withOverdue !== false) {
      (state.tasks || []).forEach(function (t) {
        if (t.deleted || isRepeating(t) || !t.date) return;
        if (U.diffDays(t.date, dateStr) >= 0) return;
        if (completionOf(state, t, t.date)) return;
        overdue.push({ task: t, key: occKey(t, t.date), date: t.date, done: false, completion: null, overdue: true });
      });
    }
    items.sort(sortTasks);
    overdue.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    return { items: items, overdue: overdue };
  }

  /* ------------------------------------------------------------ 积分 */
  function earnedOn(state, dateStr) {
    var sum = 0;
    (state.completions || []).forEach(function (c) { if (!c.deleted && c.date === dateStr) sum += n(c.points); });
    (state.pomodoros || []).forEach(function (p) { if (!p.deleted && p.date === dateStr) sum += n(p.points); });
    return sum;
  }
  function minutesOn(state, dateStr) {
    var sum = 0;
    (state.pomodoros || []).forEach(function (p) { if (!p.deleted && p.date === dateStr && p.type !== 'break') sum += n(p.minutes); });
    (state.completions || []).forEach(function (c) { if (!c.deleted && c.date === dateStr) sum += n(c.minutes); });
    return sum;
  }
  function earnedBetween(state, from, to) {
    var sum = 0;
    (state.completions || []).forEach(function (c) { if (!c.deleted && c.date >= from && c.date <= to) sum += n(c.points); });
    (state.pomodoros || []).forEach(function (p) { if (!p.deleted && p.date >= from && p.date <= to) sum += n(p.points); });
    return sum;
  }
  function earnedTotal(state) {
    var sum = 0;
    (state.completions || []).forEach(function (c) { if (!c.deleted) sum += n(c.points); });
    (state.pomodoros || []).forEach(function (p) { if (!p.deleted) sum += n(p.points); });
    return sum;
  }
  function spentTotal(state) {
    var sum = 0;
    (state.redemptions || []).forEach(function (r) { if (!r.deleted) sum += n(r.cost); });
    return sum;
  }
  function totals(state) {
    var earned = earnedTotal(state), spent = spentTotal(state);
    return { earned: earned, spent: spent, available: earned - spent };
  }

  /* 打卡日集合（当天获得 >= minPoints 分） */
  function activeDates(state, minPoints) {
    minPoints = n(minPoints) || 1;
    var map = {}, perDay = {};
    (state.completions || []).forEach(function (c) {
      if (c.deleted) return;
      perDay[c.date] = (perDay[c.date] || 0) + n(c.points);
    });
    (state.pomodoros || []).forEach(function (p) {
      if (p.deleted) return;
      perDay[p.date] = (perDay[p.date] || 0) + n(p.points);
    });
    Object.keys(perDay).forEach(function (d) { if (perDay[d] >= minPoints) map[d] = true; });
    return map;
  }

  /* 严格早于 dateStr 的连续打卡天数 */
  function streakBefore(state, dateStr, minPoints) {
    var act = activeDates(state, minPoints), days = 0, cur = U.addDays(dateStr, -1);
    while (act[cur]) { days++; cur = U.addDays(cur, -1); }
    return days;
  }
  function streakInfo(state) {
    var min = state.settings && state.settings.streak ? state.settings.streak.minPoints : 1;
    var act = activeDates(state, min), today = U.today();
    var activeToday = !!act[today];
    var days = 0, cur = activeToday ? today : U.addDays(today, -1);
    while (act[cur]) { days++; cur = U.addDays(cur, -1); }
    // 历史最长
    var keys = Object.keys(act).sort(), best = 0, run = 0, prev = null;
    keys.forEach(function (d) {
      run = (prev && U.diffDays(d, prev) === 1) ? run + 1 : 1;
      if (run > best) best = run;
      prev = d;
    });
    return { days: days, activeToday: activeToday, best: Math.max(best, days), activeDates: act };
  }

  function bonusPercent(state, dateStr) {
    var s = (state.settings && state.settings.streak) || {};
    if (!s.enabled) return 0;
    var prev = streakBefore(state, dateStr, s.minPoints);
    return Math.min(n(s.capPercent) || 50, (n(s.perDayPercent) || 0) * prev);
  }
  function previewPoints(state, task, dateStr) {
    var base = n(task.points);
    var pct = bonusPercent(state, dateStr);
    var bonus = Math.round(base * pct / 100);
    return { base: base, bonusPercent: pct, bonus: bonus, total: base + bonus };
  }

  function completeTask(state, task, dateStr, extra) {
    extra = extra || {};
    var key = occKey(task, dateStr), at = U.now();
    var calc = previewPoints(state, task, dateStr);
    var rec = {
      id: key, key: key, taskId: task.id, title: task.title, categoryId: task.categoryId,
      date: dateStr, at: at, base: calc.base, bonusPercent: calc.bonusPercent, bonus: calc.bonus,
      points: calc.total, minutes: n(extra.minutes), type: 'task', updatedAt: at, deleted: false
    };
    var arr = state.completions || (state.completions = []), found = false;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === key) { arr[i] = rec; found = true; break; }
    if (!found) arr.push(rec);
    return rec;
  }
  function uncompleteTask(state, task, dateStr) {
    var key = occKey(task, dateStr), arr = state.completions || [];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === key) { arr[i].deleted = true; arr[i].updatedAt = U.now(); return true; }
    }
    return false;
  }

  function addPomodoro(state, opts) {
    opts = opts || {};
    var set = state.settings.pomodoro || {};
    var at = U.now(), date = opts.date || U.today();
    var pts = opts.type === 'break' ? 0 : (opts.points != null ? n(opts.points) : (set.awardEnabled ? n(set.award) : 0));
    var rec = {
      id: U.uid('pom'), taskId: opts.taskId || null, date: date, at: at,
      minutes: n(opts.minutes) || n(set.focus) || 25, type: opts.type || 'focus',
      points: pts, updatedAt: at, deleted: false
    };
    (state.pomodoros || (state.pomodoros = [])).push(rec);
    return rec;
  }
  function pomodoroOn(state, dateStr) {
    var count = 0, minutes = 0;
    (state.pomodoros || []).forEach(function (p) {
      if (p.deleted || p.date !== dateStr || p.type === 'break') return;
      count++; minutes += n(p.minutes);
    });
    return { count: count, minutes: minutes };
  }

  /* ------------------------------------------------------------ 等级 */
  function levelInfo(total, settings) {
    var base = n(settings.levelBase) || 500, growth = n(settings.levelGrowth) || 0;
    if (base <= 0) base = 1;
    var level = 1, need = base, cum = 0, guard = 0;
    while (total >= cum + need && guard++ < 9999) { cum += need; level++; need += growth; if (need <= 0) need = base; }
    var into = total - cum;
    var title = LEVEL_TITLES[level - 1] || ('传说 Lv.' + level);
    return {
      level: level, title: title, into: into, need: need, levelStartAt: cum,
      nextAt: cum + need, progress: need > 0 ? U.clamp(into / need, 0, 1) : 1
    };
  }

  /* ------------------------------------------------------------ 统计 */
  function dailyGoal(state) {
    var s = state.settings;
    if (n(s.dailyGoal) > 0) return n(s.dailyGoal);
    return Math.round(n(s.weeklyGoal) / 7) || 0;
  }

  function series(state, from, to) {
    var out = [], cur = from, guard = 0;
    while (U.diffDays(cur, to) <= 0 && guard++ < 2000) {
      var d = dayItems(state, cur, { withOverdue: false });
      var done = 0, planned = 0;
      d.items.forEach(function (it) { planned += n(it.task.points); if (it.done) done++; });
      out.push({
        date: cur, points: earnedOn(state, cur), done: done, total: d.items.length,
        planned: planned, minutes: minutesOn(state, cur), pomodoros: pomodoroOn(state, cur).count
      });
      cur = U.addDays(cur, 1);
    }
    return out;
  }

  function weekReport(state, dateStr) {
    var start = U.weekStartOf(dateStr, state.settings.weekStart);
    var end = U.addDays(start, 6);
    var days = series(state, start, end);
    var points = 0, done = 0, planned = 0, minutes = 0, pomo = 0, best = days[0];
    days.forEach(function (d) {
      points += d.points; done += d.done; planned += d.planned; minutes += d.minutes; pomo += d.pomodoros;
      if (d.points > (best ? best.points : -1)) best = d;
    });
    var prevStart = U.addDays(start, -7);
    var prevPoints = earnedBetween(state, prevStart, U.addDays(prevStart, 6));
    var goal = n(state.settings.weeklyGoal);
    return {
      start: start, end: end, days: days, points: points, goal: goal,
      rate: goal > 0 ? points / goal : 0, done: done, planned: planned,
      minutes: minutes, pomodoros: pomo, prevPoints: prevPoints,
      delta: points - prevPoints, best: best && best.points > 0 ? best : null,
      avg: Math.round(points / 7), remain: Math.max(0, goal - points)
    };
  }

  function categoryStats(state, from, to) {
    var map = {}, arr = [];
    function add(id, points, count) {
      var key = id || '__none__';
      if (!map[key]) { map[key] = { categoryId: id || null, points: 0, count: 0 }; arr.push(map[key]); }
      map[key].points += points; map[key].count += count;
    }
    (state.completions || []).forEach(function (c) {
      if (c.deleted || c.date < from || c.date > to) return;
      add(c.categoryId, n(c.points), 1);
    });
    (state.pomodoros || []).forEach(function (p) {
      if (p.deleted || p.date < from || p.date > to || !n(p.points)) return;
      add(null, n(p.points), 0);
    });
    arr.forEach(function (row) {
      var cat = categoryOf(state, row.categoryId);
      row.name = cat ? cat.name : (row.categoryId ? '已删除分类' : '番茄钟 / 其他');
      row.color = cat ? cat.color : '#9aa0b4';
      row.icon = cat ? cat.icon : '⏱️';
    });
    arr.sort(function (a, b) { return b.points - a.points; });
    return arr;
  }

  /* 热力图：返回按周分列的数据（每列 7 天） */
  function heatmap(state, weeks, endDate) {
    weeks = weeks || 12;
    var end = endDate || U.today();
    var lastWeekStart = U.weekStartOf(end, state.settings.weekStart);
    var first = U.addDays(lastWeekStart, -7 * (weeks - 1));
    var cols = [];
    for (var w = 0; w < weeks; w++) {
      var col = [];
      for (var d = 0; d < 7; d++) {
        var date = U.addDays(first, w * 7 + d);
        col.push({ date: date, points: earnedOn(state, date), future: U.diffDays(date, end) > 0 });
      }
      cols.push(col);
    }
    return { cols: cols, start: first, end: end };
  }

  /* 未来若干天的任务实例（导出日历用） */
  function occurrencesBetween(state, from, to, limit) {
    var out = [], cur = from, guard = 0;
    limit = limit || 500;
    while (U.diffDays(cur, to) <= 0 && guard++ < 2000 && out.length < limit) {
      var d = dayItems(state, cur, { withOverdue: false });
      d.items.forEach(function (it) { if (out.length < limit) out.push({ task: it.task, date: cur, key: it.key, done: it.done }); });
      cur = U.addDays(cur, 1);
    }
    return out;
  }

  /* 清单视图用：全部任务 + 各种筛选 */
  function allTasks(state, opts) {
    opts = opts || {};
    var keyword = (opts.keyword || '').trim().toLowerCase();
    return (state.tasks || []).filter(function (t) {
      if (t.deleted) return false;
      if (opts.categoryId && t.categoryId !== opts.categoryId) return false;
      if (opts.onlyRepeat && !isRepeating(t)) return false;
      if (opts.onlyUndated && (t.date || isRepeating(t))) return false;
      if (opts.onlyImportant && !t.important) return false;
      if (keyword) {
        var hay = (t.title + ' ' + (t.note || '') + ' ' + (t.tags || []).join(' ')).toLowerCase();
        if (hay.indexOf(keyword) < 0) return false;
      }
      return true;
    }).sort(function (a, b) {
      if (!!a.date !== !!b.date) return a.date ? -1 : 1;
      if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
      return sortTasks(a, b);
    });
  }

  /* 某任务下一次出现的日期（含今天） */
  function nextDate(state, task, from) {
    if (!isRepeating(task)) return task.date || null;
    var cur = from || U.today(), guard = 0;
    if (task.date && U.diffDays(cur, task.date) < 0) cur = task.date;
    while (guard++ < 400) {
      if (repeatsOn(task, cur) && !completionOf(state, task, cur)) return cur;
      cur = U.addDays(cur, 1);
    }
    return null;
  }

  var Logic = {
    LEVEL_TITLES: LEVEL_TITLES, WEEK_NAMES: WEEK_NAMES,
    isRepeating: isRepeating, repeatsOn: repeatsOn, occKey: occKey, repeatText: repeatText,
    taskById: taskById, categoryOf: categoryOf, rewardById: rewardById,
    completionOf: completionOf, dueOn: dueOn, sortTasks: sortTasks, dayItems: dayItems,
    earnedOn: earnedOn, earnedBetween: earnedBetween, earnedTotal: earnedTotal,
    spentTotal: spentTotal, totals: totals, minutesOn: minutesOn,
    activeDates: activeDates, streakBefore: streakBefore, streakInfo: streakInfo,
    bonusPercent: bonusPercent, previewPoints: previewPoints,
    completeTask: completeTask, uncompleteTask: uncompleteTask,
    addPomodoro: addPomodoro, pomodoroOn: pomodoroOn,
    levelInfo: levelInfo, dailyGoal: dailyGoal,
    series: series, weekReport: weekReport, categoryStats: categoryStats,
    heatmap: heatmap, occurrencesBetween: occurrencesBetween, allTasks: allTasks, nextDate: nextDate
  };

  global.Logic = Logic;
  if (typeof module !== 'undefined' && module.exports) module.exports = Logic;
})(typeof globalThis !== 'undefined' ? globalThis : this);
