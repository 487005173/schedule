/* 学习积分日程表 — 界面主程序 */
(function () {
  'use strict';
  var U = window.U, Store = window.Store, Logic = window.Logic,
    Charts = window.Charts, ICS = window.ICS, Gist = window.Gist;

  var state = Store.load();
  var ui = {
    view: 'today',
    date: U.today(),
    month: U.today(),
    list: { keyword: '', categoryId: '', filter: 'all' },
    collapsed: {},
    statRange: 14,
    pomo: { running: false, mode: 'focus', remain: 0, rounds: 0, taskId: '', timer: null, inited: false },
    syncing: false,
    lastLevel: 1,
    deferredPrompt: null,
    fired: {}
  };
  var ACCENTS = ['#6d5efc', '#4c6ef5', '#7048e8', '#d6336c', '#e8590c', '#f59f00', '#0ca678', '#1098ad'];
  var VIEWS = [
    { id: 'today', name: '今日', icon: '☀️' },
    { id: 'week', name: '周', icon: '🗓️' },
    { id: 'month', name: '月历', icon: '📅' },
    { id: 'list', name: '清单', icon: '📋' },
    { id: 'stats', name: '统计', icon: '📈' },
    { id: 'shop', name: '商店', icon: '🎁' },
    { id: 'settings', name: '设置', icon: '⚙️' }
  ];

  /* ============================================================ 小工具 */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  var toastTimer = null;
  function toast(msg, ms) {
    var el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, ms || 2000);
  }
  function confetti(n) {
    if (!state.settings.confetti) return;
    var layer = $('#confetti');
    var colors = ['#6d5efc', '#a78bfa', '#12b886', '#ffd43b', '#ff8787', '#4dabf7'];
    n = n || 26;
    for (var i = 0; i < n; i++) {
      var p = document.createElement('div');
      p.className = 'confetti-piece';
      p.style.left = (Math.random() * 100) + 'vw';
      p.style.top = '-14px';
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      p.style.animationDuration = (1 + Math.random() * 0.9) + 's';
      p.style.animationDelay = (Math.random() * 0.2) + 's';
      p.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)';
      layer.appendChild(p);
      (function (node) { setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 2200); })(p);
    }
  }
  function beep(times) {
    if (!state.settings.pomodoro.sound) return;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = beep._ctx || (beep._ctx = new Ctx());
      var count = times || 1;
      for (var i = 0; i < count; i++) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = i ? 660 : 880;
        g.gain.value = 0.0001;
        o.connect(g); g.connect(ctx.destination);
        var t0 = ctx.currentTime + i * 0.28;
        g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
        o.start(t0); o.stop(t0 + 0.26);
      }
    } catch (e) { }
  }
  function getPath(path) {
    return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, state);
  }
  function setPath(path, val) {
    var parts = path.split('.'), o = state;
    for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = val;
    if (path.indexOf('settings.') === 0) state.settings.updatedAt = U.now();
    Store.touch();
  }
  function notifyPermission() {
    return (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported';
  }
  function sendNotify(title, body) {
    try {
      if (notifyPermission() === 'granted') {
        if (navigator.serviceWorker && navigator.serviceWorker.ready) {
          navigator.serviceWorker.ready.then(function (reg) {
            reg.showNotification(title, { body: body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'sps-reminder' });
          }).catch(function () { new Notification(title, { body: body, icon: 'icons/icon-192.png' }); });
        } else {
          new Notification(title, { body: body, icon: 'icons/icon-192.png' });
        }
        return true;
      }
    } catch (e) { }
    return false;
  }
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.settings.theme || 'auto');
    document.documentElement.style.setProperty('--accent', state.settings.accent || '#6d5efc');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', state.settings.accent || '#6d5efc');
  }

  /* ============================================================ 顶栏 / 导航 */
  function renderTop() {
    var tot = Logic.totals(state);
    var lv = Logic.levelInfo(tot.earned, state.settings);
    var st = Logic.streakInfo(state);
    var syncCfg = state.settings.sync || {};
    var syncOn = !!(syncCfg.token && syncCfg.gistId);
    var status = syncCfg.lastStatus || (syncOn ? '等待同步' : '未开启同步');
    var el = $('#topStats');
    el.innerHTML =
      '<span class="chip level" title="累计 ' + U.num(tot.earned) + ' 分 · ' + lv.title + ' · 距下一级还差 ' + U.num(lv.need - lv.into) + ' 分">Lv.' + lv.level + ' <span class="lv-title">' + U.escape(lv.title) + '</span></span>' +
      '<span class="chip" title="可用积分（累计 ' + U.num(tot.earned) + ' − 已兑换 ' + U.num(tot.spent) + '）">💰 <b>' + U.num(tot.available) + '</b></span>' +
      '<span class="chip" title="连续打卡 ' + st.days + ' 天（历史最长 ' + st.best + ' 天）' + (st.activeToday ? ' · 今天已打卡' : ' · 今天还没打卡') + '">🔥 ' + st.days + ' 天</span>' +
      '<span class="chip" id="syncDot" title="' + U.escape(status) + '">' + (syncOn ? (syncCfg.lastSyncAt ? '✅' : '⏳') : '○') + '</span>';
    $('#brandName').textContent = state.settings.appName || '学习积分日程表';
    var sb = $('#syncBtn');
    sb.classList.toggle('syncing', ui.syncing);
    sb.title = status;
  }
  function renderTabs() {
    $('#tabbar').innerHTML = VIEWS.map(function (v) {
      return '<button class="tab' + (ui.view === v.id ? ' active' : '') + '" data-action="tab" data-view="' + v.id + '">' +
        '<span class="tab-icon">' + v.icon + '</span><span>' + v.name + '</span></button>';
    }).join('');
  }

  /* ============================================================ 任务行 */
  function taskRow(item, opts) {
    opts = opts || {};
    var t = item.task, done = !!item.done;
    var cat = Logic.categoryOf(state, t.categoryId);
    var pv = Logic.previewPoints(state, t, item.date);
    var meta = [];
    if (cat) meta.push('<span class="cat" style="color:' + cat.color + '">' + U.escape(cat.icon || '') + ' ' + U.escape(cat.name) + '</span>');
    if (t.time) meta.push('<span>🕐 ' + U.escape(t.time) + '</span>');
    if (Logic.isRepeating(t)) meta.push('<span>🔁 ' + U.escape(Logic.repeatText(t)) + '</span>');
    if (t.urgent) meta.push('<span class="prio-u">紧急</span>');
    if (t.important) meta.push('<span class="prio-i">重要</span>');
    if (t.estimateMin) meta.push('<span>预计 ' + t.estimateMin + ' 分钟</span>');
    if (t.note) meta.push('<span title="' + U.escape(t.note) + '">📝 备注</span>');
    if (t.link) meta.push('<a href="' + U.escape(t.link) + '" target="_blank" rel="noopener">🔗 链接</a>');
    if (item.overdue) meta.unshift('<span class="prio-u">逾期 ' + U.escape(U.fmtDue(item.date)) + '</span>');
    if (item.completion && item.completion.skipped) meta.push('<span>已跳过</span>');
    var earned = item.completion ? item.completion.points : 0;
    var side = done
      ? '<div class="task-side"><span class="pts">+' + U.num(earned) + '</span></div>'
      : '<div class="task-side"><span class="pts">+' + U.num(pv.total) + '</span>' +
      (pv.bonusPercent ? '<span class="bonus">连击+' + pv.bonusPercent + '%</span>' : '') + '</div>';
    return '<div class="task' + (done ? ' done' : '') + (item.overdue ? ' overdue' : '') + '" data-action="edit-task" data-id="' + t.id + '" data-date="' + item.date + '">' +
      '<button class="check" data-action="toggle" data-id="' + t.id + '" data-date="' + item.date + '" title="' + (done ? '取消完成' : '标记完成') + '">✓</button>' +
      '<div class="task-main"><div class="task-title">' + U.escape(t.title) + '</div>' +
      '<div class="task-meta">' + meta.join('') + '</div></div>' + side + '</div>';
  }
  function templateChips(date) {
    var tpls = Store.alive('templates');
    if (!tpls.length) return '';
    return '<div class="quick-add">' + tpls.slice(0, 8).map(function (t) {
      return '<button class="chip chip-btn" data-action="quick-add" data-tpl="' + t.id + '" data-date="' + (date || '') + '">' +
        U.escape(t.icon || '⏱️') + ' ' + U.escape(t.name) + ' <b class="pts">+' + U.num(t.points) + '</b></button>';
    }).join('') + '</div>';
  }

  /* ============================================================ 今日视图 */
  function viewToday() {
    var date = ui.date || U.today();
    var isToday = date === U.today();
    var data = Logic.dayItems(state, date);
    var earned = Logic.earnedOn(state, date);
    var goal = Logic.dailyGoal(state);
    var planned = 0, planMin = 0, leftPts = 0;
    data.items.forEach(function (it) {
      planned += Number(it.task.points) || 0;
      planMin += Number(it.task.estimateMin) || 0;
      if (!it.done) leftPts += Logic.previewPoints(state, it.task, date).total;
    });
    var tot = Logic.totals(state);
    var lv = Logic.levelInfo(tot.earned, state.settings);
    var st = Logic.streakInfo(state);
    var doneCount = data.items.filter(function (i) { return i.done; }).length;
    var pomoInfo = Logic.pomodoroOn(state, date);
    var pct = goal > 0 ? earned / goal : 0;

    var html = '';
    /* 顶部：进度环 */
    html += '<section class="card hero">' +
      '<div class="hero-ring">' + Charts.ring({
        progress: pct, size: 158, stroke: 13,
        center: U.num(earned), sub: goal ? '/ ' + U.num(goal) + ' 分' : '今日得分'
      }) + '</div>' +
      '<div class="hero-info">' +
      '<div class="hero-num">' + U.num(earned) + '<small>分 · ' + U.escape(U.fmtLong(date)) + '</small></div>' +
      '<div class="hero-line">' + (goal
        ? (earned >= goal ? '🎉 今日目标已达成，继续保持！' : '再拿 <b class="pts">' + U.num(goal - earned) + '</b> 分就达标（今天还剩 ' + data.items.filter(function (i) { return !i.done; }).length + ' 项，预计可得 ' + U.num(leftPts) + ' 分）')
        : '今天完成 ' + doneCount + '/' + data.items.length + ' 项') + '</div>' +
      '<div class="hero-line">' +
      '<span class="badge">完成 ' + doneCount + '/' + data.items.length + '</span> ' +
      '<span class="badge">计划 ' + U.num(planned) + ' 分</span> ' +
      (planMin ? '<span class="badge">预计 ' + U.minToHM(planMin) + '</span> ' : '') +
      '<span class="badge">专注 ' + U.minToHM(Logic.minutesOn(state, date)) + '</span>' +
      '</div>' +
      '<div class="level-line">' +
      '<span class="chip level">Lv.' + lv.level + ' ' + U.escape(lv.title) + '</span>' +
      '<div class="progress" title="距离 Lv.' + (lv.level + 1) + ' 还需 ' + U.num(lv.need - lv.into) + ' 分"><i style="width:' + Math.round(lv.progress * 100) + '%"></i></div>' +
      '<span class="tiny muted nowrap">' + U.num(lv.into) + '/' + U.num(lv.need) + '</span>' +
      '</div>' +
      '</div></section>';

    /* 日期切换 */
    html += '<div class="row-wrap">' +
      '<button class="btn small ghost" data-action="shift-day" data-delta="-1">‹ 前一天</button>' +
      '<button class="btn small' + (isToday ? '' : ' primary') + '" data-action="shift-day" data-delta="0">' + (isToday ? '今天' : '回到今天') + '</button>' +
      '<button class="btn small ghost" data-action="shift-day" data-delta="1">后一天 ›</button>' +
      '<span class="grow"></span>' +
      '<span class="chip">🔥 连续 ' + st.days + ' 天' + (st.activeToday ? '（今天已打卡）' : '') + '</span>' +
      '</div>';

    /* 番茄钟 */
    html += renderPomo();

    /* 任务列表 */
    html += '<section class="card"><div class="card-head">' +
      '<span class="card-title">' + (isToday ? '今天要做的事' : U.fmtMD(date) + ' 的计划') + '</span>' +
      '<span class="card-sub">' + data.items.length + ' 项 · 剩余 ' + data.items.filter(function (i) { return !i.done; }).length + ' 项</span>' +
      '</div>';
    if (!data.items.length) {
      html += '<div class="empty">这一天还没有安排任务<br><span class="tiny">点下面的模板快速添加，或按右下角 ＋ 新建</span></div>';
    } else {
      html += data.items.map(function (it) { return taskRow(it); }).join('');
    }
    html += '<div class="divider"></div><div class="tiny muted" style="margin-bottom:6px">常用模板（点一下直接加进这一天）</div>' +
      templateChips(date) + '</section>';

    /* 逾期 */
    if (data.overdue.length) {
      html += '<section class="card"><div class="card-head"><span class="card-title bad">逾期未完成</span>' +
        '<span class="card-sub">' + data.overdue.length + ' 项</span></div>' +
        data.overdue.map(function (it) { return taskRow(it); }).join('') + '</section>';
    }

    /* 侧栏信息 */
    html += '<div class="grid-2">' +
      '<section class="card"><div class="card-head"><span class="card-title">今日明细</span></div>' +
      '<div class="stat-grid">' +
      stat('今日得分', U.num(earned)) + stat('完成任务', doneCount + ' 项') +
      stat('专注时长', U.minToHM(Logic.minutesOn(state, date))) + stat('番茄钟', pomoInfo.count + ' 个') +
      stat('可用积分', U.num(tot.available)) + stat('累计获得', U.num(tot.earned)) +
      '</div></section>' +
      '<section class="card"><div class="card-head"><span class="card-title">本周进度</span>' +
      '<span class="card-sub"><span data-action="tab" data-view="stats" class="chip chip-btn">看统计 ›</span></span></div>' +
      weekProgressHtml() + '</section>' +
      '</div>';
    return html;
  }
  function stat(label, num) {
    return '<div class="stat"><div class="stat-num">' + num + '</div><div class="stat-label">' + label + '</div></div>';
  }
  function weekProgressHtml() {
    var wr = Logic.weekReport(state, U.today());
    var pct = wr.goal > 0 ? U.clamp(wr.points / wr.goal, 0, 1) : 0;
    return '<div class="row-between"><span class="tiny muted">' + U.fmtMD(wr.start) + ' – ' + U.fmtMD(wr.end) + '</span>' +
      '<span class="tiny">' + U.num(wr.points) + ' / ' + U.num(wr.goal) + ' 分</span></div>' +
      '<div class="progress" style="margin:8px 0 10px"><i style="width:' + Math.round(pct * 100) + '%"></i></div>' +
      '<div class="stat-grid">' +
      stat('完成', wr.done + ' 项') + stat('日均', U.num(wr.avg)) +
      stat('专注', U.minToHM(wr.minutes)) + stat('环比', (wr.delta >= 0 ? '+' : '') + U.num(wr.delta)) +
      '</div>' +
      (wr.best ? '<div class="tiny muted" style="margin-top:8px">本周最佳：' + U.fmtMD(wr.best.date) + ' · ' + U.num(wr.best.points) + ' 分</div>' : '');
  }

  /* ============================================================ 番茄钟 */
  function pomoDurations() {
    var p = state.settings.pomodoro;
    return { focus: Number(p.focus) || 25, brk: Number(p.brk) || 5, longBrk: Number(p.longBrk) || 15, longEvery: Number(p.longEvery) || 4 };
  }
  function renderPomo() {
    var d = pomoDurations();
    var p = state.settings.pomodoro;
    if (!ui.pomo.inited) {
      ui.pomo.remain = d.focus * 60;
      ui.pomo.mode = 'focus';
      ui.pomo.inited = true;
    }
    var total = (ui.pomo.mode === 'focus' ? d.focus : (ui.pomo.rounds > 0 && ui.pomo.rounds % d.longEvery === 0 ? d.longBrk : d.brk)) * 60;
    var tasks = [];
    var todayItems = Logic.dayItems(state, U.today()).items;
    todayItems.forEach(function (it) {
      if (!it.done) tasks.push({ id: it.task.id, title: it.task.title, points: it.task.points });
    });
    var options = '<option value="">（不关联任务）</option>' + tasks.map(function (t) {
      return '<option value="' + t.id + '"' + (ui.pomo.taskId === t.id ? ' selected' : '') + '>' + U.escape(t.title) + '（+' + U.num(t.points) + '）</option>';
    }).join('');
    var dots = '';
    var rounds = ui.pomo.rounds;
    for (var i = 0; i < d.longEvery; i++) dots += '<i class="' + (i < (rounds % d.longEvery || (rounds && rounds % d.longEvery === 0 ? d.longEvery : 0)) ? 'on' : '') + '"></i>';
    var label = ui.pomo.mode === 'focus' ? (ui.pomo.running ? '专注中…' : '准备专注') : (ui.pomo.running ? '休息中…' : '休息一下');
    var todayPomo = Logic.pomodoroOn(state, U.today());
    return '<section class="card pomo"><div class="card-head"><span class="card-title">🍅 番茄钟</span>' +
      '<span class="card-sub">' + label + ' · 每段 +' + (p.awardEnabled ? U.num(p.award) : 0) + ' 分</span></div>' +
      '<div class="pomo-top">' +
      '<div class="pomo-clock' + (ui.pomo.mode === 'break' ? ' break' : '') + '" id="pomoClock">' + U.minToClock(ui.pomo.remain) + '</div>' +
      '<div class="pomo-meta">' +
      '<div>本轮已完成 <b>' + rounds + '</b> 个番茄</div>' +
      '<div>今日 ' + todayPomo.count + ' 个 · ' + U.minToHM(todayPomo.minutes) + '</div>' +
      '<div class="pomo-dots">' + dots + '</div>' +
      '</div>' +
      '<div class="row" style="margin-left:auto">' +
      (ui.pomo.running
        ? '<button class="btn" data-action="pomo-pause">暂停</button>'
        : '<button class="btn primary" data-action="pomo-start">' + (ui.pomo.remain < total ? '继续' : '开始') + '</button>') +
      '<button class="btn ghost" data-action="pomo-reset">重置</button>' +
      '</div></div>' +
      '<div class="row-wrap">' +
      '<span class="tiny muted">时长：</span>' +
      '<button class="chip chip-btn' + (p.preset === '25/5' ? ' active' : '') + '" data-action="pomo-preset" data-preset="25/5">25 + 5</button>' +
      '<button class="chip chip-btn' + (p.preset === '50/10' ? ' active' : '') + '" data-action="pomo-preset" data-preset="50/10">50 + 10</button>' +
      '<span class="pomo-task grow"><select class="select" data-action="pomo-task">' + options + '</select></span>' +
      '</div></section>';
  }
  function pomoTotalSeconds() {
    var d = pomoDurations();
    if (ui.pomo.mode === 'focus') return d.focus * 60;
    var isLong = ui.pomo.rounds > 0 && ui.pomo.rounds % d.longEvery === 0;
    return (isLong ? d.longBrk : d.brk) * 60;
  }
  function pomoStart() {
    if (ui.pomo.running) return;
    if (!ui.pomo.remain) ui.pomo.remain = pomoTotalSeconds();
    ui.pomo.running = true;
    beep._ctx && beep._ctx.resume && beep._ctx.resume();
    clearInterval(ui.pomo.timer);
    ui.pomo.timer = setInterval(pomoTick, 1000);
    renderView();
  }
  function pomoPause() {
    ui.pomo.running = false;
    clearInterval(ui.pomo.timer);
    renderView();
  }
  function pomoReset() {
    ui.pomo.running = false;
    clearInterval(ui.pomo.timer);
    ui.pomo.remain = pomoTotalSeconds();
    renderView();
  }
  function pomoTick() {
    ui.pomo.remain--;
    var el = $('#pomoClock');
    if (el) el.textContent = U.minToClock(Math.max(0, ui.pomo.remain));
    if (ui.pomo.remain <= 0) pomoFinish();
  }
  function pomoFinish() {
    clearInterval(ui.pomo.timer);
    ui.pomo.running = false;
    var p = state.settings.pomodoro;
    if (ui.pomo.mode === 'focus') {
      var rec = Logic.addPomodoro(state, { taskId: ui.pomo.taskId || null, minutes: pomoDurations().focus, type: 'focus' });
      Store.touch();
      ui.pomo.rounds++;
      ui.pomo.mode = 'break';
      ui.pomo.remain = pomoTotalSeconds();
      beep(2);
      confetti(16);
      toast('🍅 专注完成，+' + U.num(rec.points) + ' 分！休息一下');
      checkLevelUp();
    } else {
      ui.pomo.mode = 'focus';
      ui.pomo.remain = pomoTotalSeconds();
      beep(2);
      toast('休息结束，开始下一个番茄吧');
    }
    if (p.autoNext) { pomoStart(); } else { render(); }
  }

  /* ============================================================ 周视图 */
  function viewWeek() {
    var today = U.today();
    var anchor = ui.date || today;
    var days = U.weekDates(anchor, state.settings.weekStart);
    var wr = Logic.weekReport(state, anchor);
    var pct = wr.goal > 0 ? U.clamp(wr.points / wr.goal, 0, 1) : 0;
    var names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    var html = '<section class="card"><div class="card-head">' +
      '<span class="card-title">' + U.fmtMD(wr.start) + ' – ' + U.fmtMD(wr.end) + '</span>' +
      '<span class="card-sub">' + (wr.points >= wr.goal ? '🎉 已达成周目标' : '还差 ' + U.num(wr.remain) + ' 分达成目标') + '</span></div>' +
      '<div class="row-between"><b class="pts" style="font-size:19px">' + U.num(wr.points) + '</b>' +
      '<span class="tiny muted">目标 ' + U.num(wr.goal) + ' 分 · 完成 ' + wr.done + ' 项 · 专注 ' + U.minToHM(wr.minutes) + '</span></div>' +
      '<div class="progress" style="margin:9px 0 4px"><i style="width:' + Math.round(pct * 100) + '%"></i></div>' +
      '<div class="row-wrap" style="margin-top:8px">' +
      '<button class="btn small ghost" data-action="shift-week" data-delta="-7">‹ 上一周</button>' +
      '<button class="btn small" data-action="shift-week" data-delta="0">本周</button>' +
      '<button class="btn small ghost" data-action="shift-week" data-delta="7">下一周 ›</button>' +
      '<span class="grow"></span>' +
      '<span class="chip">环比 ' + (wr.delta >= 0 ? '+' : '') + U.num(wr.delta) + ' 分</span>' +
      '</div></section>';

    days.forEach(function (d) {
      var data = Logic.dayItems(state, d, { withOverdue: d === today });
      var earned = Logic.earnedOn(state, d);
      var doneCount = data.items.filter(function (i) { return i.done; }).length;
      var isToday = d === today;
      var collapsed = ui.collapsed['d' + d];
      var dayGoal = Logic.dailyGoal(state);
      var dp = dayGoal ? U.clamp(earned / dayGoal, 0, 1) : 0;
      html += '<section class="card day-card"><div class="day-head" data-action="toggle-day" data-date="' + d + '">' +
        '<span class="day-name' + (isToday ? ' today' : '') + '">' + names[U.weekday(d)] + '</span>' +
        '<span class="day-date">' + U.fmtMDShort(d) + (isToday ? ' · 今天' : '') + '</span>' +
        '<span class="day-progress"><span class="progress"><i style="width:' + Math.round(dp * 100) + '%"></i></span></span>' +
        '<span class="day-score">' + (earned ? '<b class="pts">' + U.num(earned) + '</b> 分 · ' : '') + doneCount + '/' + data.items.length + ' 项 ' + (collapsed ? '▸' : '▾') + '</span>' +
        '</div><div class="day-body' + (collapsed ? ' collapsed' : '') + '">' +
        (data.items.length || data.overdue.length
          ? data.overdue.map(function (it) { return taskRow(it); }).join('') + data.items.map(function (it) { return taskRow(it); }).join('')
          : '<div class="empty tiny">暂无安排</div>') +
        '<div class="add-inline" data-action="new-task" data-date="' + d + '">＋ 给这一天加任务</div>' +
        '</div></section>';
    });
    return html;
  }

  /* ============================================================ 月历 */
  function viewMonth() {
    var today = U.today();
    var anchor = ui.month || today;
    var grid = U.monthGrid(anchor, state.settings.weekStart);
    var anchorMonth = U.parse(anchor).getMonth();
    var dailyGoal = Logic.dailyGoal(state);
    var names = state.settings.weekStart === 0 ? ['日', '一', '二', '三', '四', '五', '六'] : ['一', '二', '三', '四', '五', '六', '日'];
    var monthPoints = 0, monthDone = 0;
    grid.forEach(function (d) {
      if (U.parse(d).getMonth() !== anchorMonth) return;
      monthPoints += Logic.earnedOn(state, d);
      monthDone += Logic.dayItems(state, d, { withOverdue: false }).items.filter(function (i) { return i.done; }).length;
    });
    var html = '<section class="card"><div class="cal-head">' +
      '<button class="icon-btn" data-action="shift-month" data-delta="-1">‹</button>' +
      '<span class="cal-title">' + U.parse(anchor).getFullYear() + ' 年 ' + (anchorMonth + 1) + ' 月</span>' +
      '<button class="icon-btn" data-action="shift-month" data-delta="1">›</button>' +
      '<span class="grow"></span>' +
      '<button class="btn small" data-action="shift-month" data-delta="0">回到本月</button>' +
      '</div><div class="row-wrap" style="margin:10px 0">' +
      '<span class="chip">本月得分 <b class="pts">' + U.num(monthPoints) + '</b></span>' +
      '<span class="chip">完成 ' + monthDone + ' 项</span>' +
      '<span class="chip">点任意一天看当天任务</span>' +
      '</div>' +
      '<div class="cal-week-head">' + names.map(function (n) { return '<div>' + n + '</div>'; }).join('') + '</div>' +
      '<div class="cal-grid">' + grid.map(function (d) {
        var out = U.parse(d).getMonth() !== anchorMonth;
        var pts = Logic.earnedOn(state, d);
        var items = Logic.dayItems(state, d, { withOverdue: false }).items;
        var lv = Charts.level(pts, dailyGoal);
        return '<div class="cal-cell' + (out ? ' out' : '') + (d === today ? ' today' : '') + ' lv' + lv + '" data-action="day" data-date="' + d + '">' +
          '<div class="cal-num">' + U.parse(d).getDate() + '</div>' +
          (pts ? '<div class="cal-pts">' + U.num(pts) + '</div>' : '') +
          '<div class="cal-dots">' + items.slice(0, 6).map(function (i) {
            var cat = Logic.categoryOf(state, i.task.categoryId);
            return '<span class="cal-dot" style="background:' + (i.done ? 'var(--good)' : (cat ? cat.color : 'var(--accent)')) + '"></i></span>';
          }).join('') + '</div></div>';
      }).join('') + '</div>' +
      '<div class="tiny muted" style="margin-top:9px">颜色越深＝当天得分越高（相对每日目标 ' + U.num(dailyGoal) + ' 分）· 圆点＝当天任务，绿点表示已完成</div>' +
      '</section>';
    return html;
  }

  /* ============================================================ 清单 */
  function viewList() {
    var f = ui.list;
    var tasks = Logic.allTasks(state, {
      keyword: f.keyword,
      categoryId: f.categoryId,
      onlyRepeat: f.filter === 'repeat',
      onlyUndated: f.filter === 'undated',
      onlyImportant: f.filter === 'important'
    });
    var cats = Store.alive('categories');
    var groups = {};
    tasks.forEach(function (t) {
      var key = t.categoryId || '__none__';
      (groups[key] = groups[key] || []).push(t);
    });
    var undated = tasks.filter(function (t) { return !t.date && !Logic.isRepeating(t); });
    var totalPts = tasks.reduce(function (s, t) { return s + (Number(t.points) || 0); }, 0);
    var html = '<section class="card"><div class="card-head"><span class="card-title">全部任务</span>' +
      '<span class="card-sub">' + tasks.length + ' 项 · 共 ' + U.num(totalPts) + ' 分</span></div>' +
      '<input class="input" id="listSearch" placeholder="搜索任务 / 备注 / 标签…" value="' + U.escape(f.keyword) + '">' +
      '<div class="row-wrap" style="margin:10px 0 4px">' +
      [['all', '全部'], ['repeat', '🔁 重复任务'], ['undated', '📥 未安排日期'], ['important', '⭐ 重要']].map(function (p) {
        return '<button class="chip chip-btn' + (f.filter === p[0] ? ' active' : '') + '" data-action="list-filter" data-filter="' + p[0] + '">' + p[1] + '</button>';
      }).join('') +
      '</div>' +
      '<div class="row-wrap">' +
      '<button class="chip chip-btn' + (!f.categoryId ? ' active' : '') + '" data-action="list-cat" data-cat="">全部分类</button>' +
      cats.map(function (c) {
        return '<button class="chip chip-btn' + (f.categoryId === c.id ? ' active' : '') + '" data-action="list-cat" data-cat="' + c.id + '" style="' + (f.categoryId === c.id ? '' : 'color:' + c.color) + '">' + U.escape(c.icon || '') + ' ' + U.escape(c.name) + '</button>';
      }).join('') +
      '</div></section>';

    if (!tasks.length) {
      html += '<section class="card"><div class="empty">没有符合条件的任务</div></section>';
      return html;
    }
    cats.forEach(function (c) {
      var list = groups[c.id];
      if (!list) return;
      html += listGroup(c.icon + ' ' + c.name, c.color, list);
    });
    if (groups['__none__']) html += listGroup('📦 未分类', 'var(--muted)', groups['__none__']);
    if (undated.length) html += '<section class="card"><div class="tiny muted">提示：' + undated.length + ' 项没有日期，不会出现在「今日」，需要时再安排。</div></section>';
    return html;
  }
  function listGroup(title, color, list) {
    var pts = list.reduce(function (s, t) { return s + (Number(t.points) || 0); }, 0);
    return '<section class="card"><div class="card-head"><span class="card-title" style="color:' + color + '">' + U.escape(title) + '</span>' +
      '<span class="card-sub">' + list.length + ' 项 · ' + U.num(pts) + ' 分</span></div>' +
      list.map(function (t) {
        var item = { task: t, key: t.id, date: t.date || U.today(), done: false, completion: null };
        if (Logic.isRepeating(t)) {
          var nx = Logic.nextDate(state, t, U.today());
          if (nx) item.date = nx;
          item.done = !!Logic.completionOf(state, t, item.date);
        } else if (t.date) {
          item.done = !!Logic.completionOf(state, t, t.date);
        }
        var row = taskRow(item);
        if (Logic.isRepeating(t) && item.date) {
          row = row.replace('</div><div class="task-side">', '<span>下次 ' + U.escape(U.fmtDue(item.date)) + '</span></div><div class="task-side">');
        }
        return row;
      }).join('') + '</section>';
  }

  /* ============================================================ 统计 */
  function viewStats() {
    var today = U.today();
    var wr = Logic.weekReport(state, today);
    var tot = Logic.totals(state);
    var lv = Logic.levelInfo(tot.earned, state.settings);
    var st = Logic.streakInfo(state);
    var dailyGoal = Logic.dailyGoal(state);
    var from = U.addDays(today, -(ui.statRange - 1));
    var days = Logic.series(state, from, today);
    var barsData = days.map(function (d) {
      return {
        label: U.parse(d.date).getDate() + '', value: d.points, today: d.date === today,
        title: U.fmtMD(d.date) + '：' + U.num(d.points) + ' 分' + (d.total ? '（' + d.done + '/' + d.total + ' 项）' : '')
      };
    });
    var rangePoints = days.reduce(function (s, d) { return s + d.points; }, 0);
    var rangeDone = days.reduce(function (s, d) { return s + d.done; }, 0);
    var rangeMin = days.reduce(function (s, d) { return s + d.minutes; }, 0);
    var cats = Logic.categoryStats(state, wr.start, wr.end);
    var heat = Logic.heatmap(state, 12, today);
    var activeCount = 0;
    days.forEach(function (d) { if (d.points > 0) activeCount++; });

    var html = '';
    html += '<section class="card"><div class="card-head"><span class="card-title">本周结算报告</span>' +
      '<span class="card-sub">' + U.fmtMD(wr.start) + ' – ' + U.fmtMD(wr.end) + '</span></div>' +
      '<div class="hero" style="gap:16px">' +
      '<div class="hero-ring">' + Charts.ring({
        progress: wr.goal ? wr.points / wr.goal : 0, size: 142, stroke: 12,
        center: U.num(wr.points), sub: '/ ' + U.num(wr.goal) + ' 分',
        color: wr.points >= wr.goal ? 'var(--good)' : null
      }) + '</div>' +
      '<div class="hero-info"><div class="hero-line">' + (wr.points >= wr.goal
        ? '🎉 本周目标已达成，超额 <b class="pts">' + U.num(wr.points - wr.goal) + '</b> 分'
        : '还差 <b class="pts">' + U.num(wr.remain) + '</b> 分达成本周目标（日均还需 ' + U.num(Math.max(0, Math.ceil(wr.remain / 7))) + ' 分）') + '</div>' +
      '<div class="stat-grid">' +
      stat('完成任务', wr.done + ' 项') + stat('专注时长', U.minToHM(wr.minutes)) +
      stat('番茄钟', wr.pomodoros + ' 个') + stat('日均', U.num(wr.avg)) +
      stat('环比上周', (wr.delta >= 0 ? '+' : '') + U.num(wr.delta)) + stat('连续打卡', st.days + ' 天') +
      '</div></div></div>' +
      (wr.best ? '<div class="tiny muted" style="margin-top:9px">本周最佳：' + U.fmtLong(wr.best.date) + ' · ' + U.num(wr.best.points) + ' 分</div>' : '') +
      '</section>';

    html += '<section class="card"><div class="card-head"><span class="card-title">近 ' + ui.statRange + ' 天得分</span>' +
      '<span class="card-sub">合计 ' + U.num(rangePoints) + ' 分 · 完成 ' + rangeDone + ' 项 · 有记录 ' + activeCount + ' 天</span></div>' +
      Charts.bars({ data: barsData, goal: dailyGoal, height: 156 }) +
      '<div class="row-wrap" style="margin-top:10px">' +
      [7, 14, 30].map(function (r) {
        return '<button class="chip chip-btn' + (ui.statRange === r ? ' active' : '') + '" data-action="stat-range" data-range="' + r + '">近 ' + r + ' 天</button>';
      }).join('') +
      '<span class="grow"></span><span class="chip">专注 ' + U.minToHM(rangeMin) + '</span></div></section>';

    html += '<div class="grid-2">' +
      '<section class="card"><div class="card-head"><span class="card-title">本周分类投入</span></div>' +
      Charts.hbars({ items: cats, empty: '本周还没有得分记录' }) + '</section>' +
      '<section class="card"><div class="card-head"><span class="card-title">等级与积累</span></div>' +
      '<div class="row-between"><span class="chip level">Lv.' + lv.level + ' ' + U.escape(lv.title) + '</span>' +
      '<span class="tiny muted">再得 ' + U.num(lv.need - lv.into) + ' 分升到 Lv.' + (lv.level + 1) + '</span></div>' +
      '<div class="progress" style="margin:9px 0 12px"><i style="width:' + Math.round(lv.progress * 100) + '%"></i></div>' +
      '<div class="stat-grid">' +
      stat('累计获得', U.num(tot.earned)) + stat('已兑换', U.num(tot.spent)) +
      stat('可用积分', U.num(tot.available)) + stat('最长连续', st.best + ' 天') +
      '</div></section>' +
      '</div>';

    html += '<section class="card"><div class="card-head"><span class="card-title">打卡热力图</span>' +
      '<span class="card-sub">最近 12 周 · 点格子看当天</span></div>' +
      Charts.heat(heat, dailyGoal) + '</section>';

    /* 明细表 */
    var recent = (state.completions || []).filter(function (c) { return !c.deleted; })
      .sort(function (a, b) { return (b.at || '').localeCompare(a.at || ''); }).slice(0, 12);
    if (recent.length) {
      html += '<section class="card"><div class="card-head"><span class="card-title">最近完成记录</span></div>' +
        recent.map(function (c) {
          var cat = Logic.categoryOf(state, c.categoryId);
          return '<div class="history-row">' +
            '<span style="color:' + (cat ? cat.color : 'var(--muted)') + '">' + U.escape(cat ? (cat.icon || '') : '⏱️') + '</span>' +
            '<span class="grow">' + U.escape(c.title || '') + '</span>' +
            '<span class="tiny muted">' + U.escape(U.fmtMD(c.date)) + '</span>' +
            '<b class="pts">+' + U.num(c.points) + '</b>' +
            (c.bonus ? '<span class="bonus">含连击 +' + U.num(c.bonus) + '</span>' : '') +
            '</div>';
        }).join('') + '</section>';
    }
    return html;
  }

  /* ============================================================ 奖励商店 */
  function viewShop() {
    var tot = Logic.totals(state);
    var rewards = Store.alive('rewards');
    var redemptions = (state.redemptions || []).filter(function (r) { return !r.deleted; })
      .sort(function (a, b) { return (b.at || '').localeCompare(a.at || ''); }).slice(0, 12);
    var html = '<section class="card"><div class="card-head"><span class="card-title">积分余额</span>' +
      '<span class="card-sub">' + (tot.available < 0 ? '⚠️ 已透支，先赚回来' : '可以兑换下面的奖励') + '</span></div>' +
      '<div class="row-between"><span class="pts" style="font-size:30px">' + U.num(tot.available) + ' <small class="tiny muted">分可用</small></span>' +
      '<div class="tiny muted" style="text-align:right">累计获得 ' + U.num(tot.earned) + '<br>已兑换 ' + U.num(tot.spent) + '</div></div>' +
      '<div class="progress" style="margin-top:10px"><i style="width:' + Math.round(U.clamp(tot.earned ? tot.available / tot.earned : 0, 0, 1) * 100) + '%"></i></div>' +
      '</section>';

    html += '<section class="card"><div class="card-head"><span class="card-title">奖励商店</span>' +
      '<span class="card-sub"><button class="btn small ghost" data-action="new-reward">＋ 新增奖励</button></span></div>' +
      '<div class="shop-grid">' + rewards.map(function (r) {
        var ok = tot.available >= r.cost;
        return '<div class="shop-item">' +
          '<div class="row-between"><span class="shop-icon">' + U.escape(r.icon || '🎁') + '</span>' +
          '<button class="icon-btn" data-action="edit-reward" data-id="' + r.id + '" title="编辑">✎</button></div>' +
          '<div class="shop-name">' + U.escape(r.name) + '</div>' +
          '<div class="shop-foot"><b class="pts">' + U.num(r.cost) + ' 分</b>' +
          '<button class="btn small ' + (ok ? 'primary' : '') + '" data-action="redeem" data-id="' + r.id + '"' + (ok ? '' : ' disabled') + '>' + (ok ? '兑换' : '还差 ' + U.num(r.cost - tot.available)) + '</button>' +
          '</div></div>';
      }).join('') + '</div>' +
      (rewards.length ? '' : '<div class="empty">还没有奖励，点右上角加一个（比如：一杯奶茶 200 分）</div>') +
      '</section>';

    if (redemptions.length) {
      html += '<section class="card"><div class="card-head"><span class="card-title">兑换记录</span>' +
        '<span class="card-sub">点撤销可退回积分</span></div>' +
        redemptions.map(function (r) {
          return '<div class="history-row">' +
            '<span class="grow">' + U.escape(r.name || '奖励') + '</span>' +
            '<span class="tiny muted">' + U.escape(U.fmtMD(r.date || (r.at || '').slice(0, 10))) + '</span>' +
            '<b class="bad">−' + U.num(r.cost) + '</b>' +
            '<button class="btn small ghost" data-action="undo-redeem" data-id="' + r.id + '">撤销</button>' +
            '</div>';
        }).join('') + '</section>';
    }
    return html;
  }

  /* ============================================================ 设置 */
  function viewSettings() {
    var s = state.settings, p = s.pomodoro, rem = s.reminders, sync = s.sync;
    var tot = Logic.totals(state);
    var bytes = 0;
    try { bytes = (localStorage.getItem(Store.KEY) || '').length; } catch (e) { }
    var html = '';

    /* 目标与积分 */
    html += '<section class="card set-section"><div class="card-head"><span class="card-title">🎯 目标与积分</span></div>' +
      setRowNum('每周目标积分', 'settings.weeklyGoal', s.weeklyGoal, '按你的设定：1500 分/周') +
      setRowNum('每日目标积分（0 = 自动按周目标÷7）', 'settings.dailyGoal', s.dailyGoal, '当前生效：' + U.num(Logic.dailyGoal(state)) + ' 分/天') +
      setRowNum('升到 2 级需要的经验', 'settings.levelBase', s.levelBase, '默认 500') +
      setRowNum('每升一级递增', 'settings.levelGrowth', s.levelGrowth, '默认 100') +
      '<div class="divider"></div>' +
      '<div class="set-row"><span class="set-label">连击加成</span>' +
      '<label class="switch"><input type="checkbox" data-path="settings.streak.enabled"' + (s.streak.enabled ? ' checked' : '') + '>开启</label></div>' +
      setRowNum('连续打卡每天加成 %', 'settings.streak.perDayPercent', s.streak.perDayPercent, '默认 5%') +
      setRowNum('加成上限 %', 'settings.streak.capPercent', s.streak.capPercent, '默认 50%，断签不清零，只是重新累计') +
      '<div class="set-hint">例：连续打卡 3 天，今天每项任务的积分多 15%。</div>' +
      '</section>';

    /* 番茄钟 */
    html += '<section class="card set-section"><div class="card-head"><span class="card-title">🍅 番茄钟</span></div>' +
      '<div class="set-row wrap"><span class="set-label">时长方案</span>' +
      '<div class="row-wrap">' + [['25/5', '25 + 5'], ['50/10', '50 + 10'], ['custom', '自定义']].map(function (o) {
        return '<button class="chip chip-btn' + (p.preset === o[0] ? ' active' : '') + '" data-action="pomo-preset" data-preset="' + o[0] + '">' + o[1] + '</button>';
      }).join('') + '</div></div>' +
      setRowNum('专注分钟', 'settings.pomodoro.focus', p.focus) +
      setRowNum('短休息分钟', 'settings.pomodoro.brk', p.brk) +
      setRowNum('长休息分钟', 'settings.pomodoro.longBrk', p.longBrk) +
      setRowNum('几个番茄后长休息', 'settings.pomodoro.longEvery', p.longEvery) +
      '<div class="set-row"><span class="set-label">每段专注自动加分</span>' +
      '<label class="switch"><input type="checkbox" data-path="settings.pomodoro.awardEnabled"' + (p.awardEnabled ? ' checked' : '') + '>开启</label></div>' +
      setRowNum('每段加几分', 'settings.pomodoro.award', p.award, '默认 5 分') +
      '<div class="set-row"><span class="set-label">结束提示音</span>' +
      '<label class="switch"><input type="checkbox" data-path="settings.pomodoro.sound"' + (p.sound ? ' checked' : '') + '>开启</label></div>' +
      '<div class="set-row"><span class="set-label">一段结束自动开始下一段</span>' +
      '<label class="switch"><input type="checkbox" data-path="settings.pomodoro.autoNext"' + (p.autoNext ? ' checked' : '') + '>开启</label></div>' +
      '</section>';

    /* 提醒 */
    html += '<section class="card set-section"><div class="card-head"><span class="card-title">🔔 每日提醒</span>' +
      '<span class="card-sub">' + (notifyPermission() === 'granted' ? '系统通知已授权' : notifyPermission() === 'denied' ? '通知被拒绝' : '未授权通知') + '</span></div>' +
      '<div class="set-row"><span class="set-label">开启每日提醒</span>' +
      '<label class="switch"><input type="checkbox" data-path="settings.reminders.enabled"' + (rem.enabled ? ' checked' : '') + '>开启</label></div>' +
      '<div class="set-row wrap"><span class="set-label">早上提醒时间</span>' +
      '<input class="input time" type="time" data-path="settings.reminders.morning" value="' + U.escape(rem.morning) + '"></div>' +
      '<div class="set-row wrap"><span class="set-label">晚上复盘时间</span>' +
      '<input class="input time" type="time" data-path="settings.reminders.evening" value="' + U.escape(rem.evening) + '"></div>' +
      '<div class="row-wrap"><button class="btn small" data-action="notify-permission">申请通知权限</button>' +
      '<button class="btn small ghost" data-action="notify-test">发送测试通知</button></div>' +
      '<div class="set-hint">网页通知只在程序打开（或刚打开过）时可靠；想要绝对准时的提醒，请到下面「导出日历」把 .ics 导入手机自带日历。</div>' +
      '</section>';

    /* 分类 */
    html += '<section class="card set-section"><div class="card-head"><span class="card-title">🏷️ 分类标签</span>' +
      '<span class="card-sub"><button class="btn small ghost" data-action="new-category">＋ 新增</button></span></div>' +
      Store.alive('categories').map(function (c) {
        return '<div class="list-item"><span style="font-size:17px">' + U.escape(c.icon || '') + '</span>' +
          '<b style="color:' + c.color + '">' + U.escape(c.name) + '</b>' +
          '<div class="list-actions"><button class="btn small ghost" data-action="edit-category" data-id="' + c.id + '">编辑</button></div></div>';
      }).join('') + '</section>';

    /* 模板 */
    html += '<section class="card set-section"><div class="card-head"><span class="card-title">⚡ 常用任务模板</span>' +
      '<span class="card-sub"><button class="btn small ghost" data-action="new-template">＋ 新增</button></span></div>' +
      '<div class="set-hint">在「今日」页点模板即可一键添加，自动带上分值、分类和预计时长。</div>' +
      Store.alive('templates').map(function (t) {
        var cat = Logic.categoryOf(state, t.categoryId);
        return '<div class="list-item"><span style="font-size:17px">' + U.escape(t.icon || '⏱️') + '</span>' +
          '<span class="grow">' + U.escape(t.name) + (cat ? ' <span class="tiny muted">' + U.escape(cat.name) + '</span>' : '') + '</span>' +
          '<b class="pts">+' + U.num(t.points) + '</b>' +
          '<div class="list-actions"><button class="btn small ghost" data-action="edit-template" data-id="' + t.id + '">编辑</button></div></div>';
      }).join('') + '</section>';

    /* 同步 */
    html += '<section class="card set-section"><div class="card-head"><span class="card-title">☁️ 多设备同步（GitHub Gist）</span>' +
      '<span class="card-sub">' + (sync.token && sync.gistId ? '已配置' : '未配置') + '</span></div>' +
      '<div class="field"><span class="field-label">GitHub Token（只需 gist 权限，仅保存在本机浏览器）</span>' +
      '<input class="input" type="password" data-path="settings.sync.token" value="' + U.escape(sync.token) + '" placeholder="ghp_... 或 github_pat_..."></div>' +
      '<div class="field"><span class="field-label">Gist ID（创建后自动填好）</span>' +
      '<input class="input" data-path="settings.sync.gistId" value="' + U.escape(sync.gistId) + '" placeholder="例如 8f3c1a9e..."></div>' +
      '<div class="set-row"><span class="set-label">自动同步（改动后与打开程序时）</span>' +
      '<label class="switch"><input type="checkbox" data-path="settings.sync.auto"' + (sync.auto ? ' checked' : '') + '>开启</label></div>' +
      '<div class="row-wrap"><button class="btn small" data-action="test-token">测试 Token</button>' +
      '<button class="btn small" data-action="sync-create">创建新 Gist 并上传</button>' +
      '<button class="btn small primary" data-action="sync" data-mode="both">立即同步</button>' +
      '<button class="btn small ghost" data-action="sync" data-mode="push">仅上传（覆盖云端）</button>' +
      '<button class="btn small ghost" data-action="sync" data-mode="pull">仅下载（覆盖本机）</button></div>' +
      (ui.syncMsg ? '<div class="status-line ' + (ui.syncOk ? 'ok' : 'err') + '">' + U.escape(ui.syncMsg) + '</div>' : '') +
      '<div class="status-line">最近同步：' + U.escape(sync.lastSyncAt ? U.fmtLong(sync.lastSyncAt.slice(0, 10)) + ' ' + (sync.lastSyncAt.slice(11, 16)) : '从未') + ' · 状态：' + U.escape(sync.lastStatus || '—') + '</div>' +
      '<div class="set-hint">同步是「双向合并」：两边的任务和积分都会保留，删除也会同步。第一次用请先「创建新 Gist 并上传」，然后在手机上填同一个 Gist ID + Token 即可。</div>' +
      '</section>';

    /* 数据 */
    html += '<section class="card set-section"><div class="card-head"><span class="card-title">💾 数据与备份</span></div>' +
      '<div class="stat-grid">' +
      stat('任务', Store.alive('tasks').length + ' 项') + stat('完成记录', (state.completions || []).filter(function (c) { return !c.deleted; }).length + ' 条') +
      stat('累计积分', U.num(tot.earned)) + stat('本地占用', U.round(bytes / 1024, 1) + ' KB') +
      '</div>' +
      '<div class="row-wrap" style="margin-top:11px">' +
      '<button class="btn small" data-action="export-json">导出数据备份（JSON）</button>' +
      '<button class="btn small" data-action="import-json">导入数据备份</button>' +
      '<button class="btn small" data-action="export-ics">导出日历 .ics（' + ICS.count(state, { days: 60 }) + ' 个带时间的任务）</button>' +
      '<button class="btn small ghost" data-action="export-csv">导出积分记录（CSV）</button>' +
      '</div>' +
      '<div class="set-hint">.ics 导入手机自带日历后，即使不打开本程序也能收到提醒（含每天 8:00 / 21:00 的固定提醒）。</div>' +
      '<div class="divider"></div>' +
      '<div class="row-wrap"><button class="btn small danger" data-action="reset-all">清空本机全部数据</button></div>' +
      '<div class="set-hint">清空只影响这台设备；如果已开启同步，下次同步会把云端数据合并回来。</div>' +
      '</section>';

    /* 外观 */
    html += '<section class="card set-section"><div class="card-head"><span class="card-title">🎨 外观</span></div>' +
      '<div class="set-row wrap"><span class="set-label">主题</span>' +
      '<select class="select" style="width:auto" data-path="settings.theme">' +
      [['auto', '跟随系统'], ['light', '浅色'], ['dark', '深色']].map(function (o) {
        return '<option value="' + o[0] + '"' + (s.theme === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></div>' +
      '<div class="set-row wrap"><span class="set-label">主色调</span>' +
      '<div class="color-dots">' + ACCENTS.map(function (c) {
        return '<span class="color-dot' + (s.accent === c ? ' active' : '') + '" data-action="set-accent" data-color="' + c + '" style="background:' + c + '"></span>';
      }).join('') + '</div></div>' +
      '<div class="set-row wrap"><span class="set-label">应用名称</span>' +
      '<input class="input" style="max-width:220px" data-path="settings.appName" value="' + U.escape(s.appName) + '"></div>' +
      '<div class="set-row"><span class="set-label">完成/升级时的撒花动效</span>' +
      '<label class="switch"><input type="checkbox" data-path="settings.confetti"' + (s.confetti ? ' checked' : '') + '>开启</label></div>' +
      '<div class="set-row wrap"><span class="set-label">每周从哪天开始</span>' +
      '<select class="select" style="width:auto" data-path="settings.weekStart" data-type="number">' +
      '<option value="1"' + (Number(s.weekStart) === 1 ? ' selected' : '') + '>周一</option>' +
      '<option value="0"' + (Number(s.weekStart) === 0 ? ' selected' : '') + '>周日</option>' +
      '</select></div>' +
      (ui.deferredPrompt ? '<div class="row-wrap"><button class="btn small primary" data-action="install">把程序装到桌面</button></div>' : '') +
      '</section>';

    /* 关于 */
    html += '<section class="card set-section"><div class="card-head"><span class="card-title">ℹ️ 关于</span></div>' +
      '<div class="set-hint">' +
      '数据默认存在这台设备的浏览器里，开启 Gist 同步后会在电脑与手机之间自动合并。<br>' +
      '快捷键：N 新建任务 · Esc 关闭弹层 · 1~7 切换页面。<br>' +
      '部署方式：把整个文件夹放到 GitHub Pages 仓库，手机浏览器「添加到主屏幕」即像一个 App。' +
      '</div></section>';
    return html;
  }
  function setRowNum(label, path, value, hint) {
    return '<div class="set-row wrap"><span class="set-label">' + U.escape(label) + (hint ? '<br><span class="set-hint">' + U.escape(hint) + '</span>' : '') + '</span>' +
      '<input class="input num" type="number" inputmode="numeric" data-type="number" data-path="' + path + '" value="' + Number(value || 0) + '"></div>';
  }

  /* ============================================================ 渲染入口 */
  function render() {
    applyTheme();
    renderTop();
    renderTabs();
    var el = $('#view');
    var html = '';
    switch (ui.view) {
      case 'today': html = viewToday(); break;
      case 'week': html = viewWeek(); break;
      case 'month': html = viewMonth(); break;
      case 'list': html = viewList(); break;
      case 'stats': html = viewStats(); break;
      case 'shop': html = viewShop(); break;
      case 'settings': html = viewSettings(); break;
    }
    el.innerHTML = html;
    var fab = $('#fab');
    fab.classList.toggle('hidden', ui.view === 'settings');
    renderReminderBar();
  }
  function renderView() {
    var el = $('#view');
    var scroll = el.scrollTop;
    switch (ui.view) {
      case 'today': el.innerHTML = viewToday(); break;
      case 'week': el.innerHTML = viewWeek(); break;
      case 'month': el.innerHTML = viewMonth(); break;
      case 'list': el.innerHTML = viewList(); break;
      case 'stats': el.innerHTML = viewStats(); break;
      case 'shop': el.innerHTML = viewShop(); break;
      case 'settings': el.innerHTML = viewSettings(); break;
    }
    renderTop();
    el.scrollTop = scroll;
  }

  /* ============================================================ 任务完成切换 */
  function toggleTask(id, dateStr) {
    var task = Logic.taskById(state, id);
    if (!task) return;
    var date = dateStr || U.today();
    if (!Logic.isRepeating(task) && task.date) date = dateStr || task.date;
    var existing = Logic.completionOf(state, task, date);
    if (existing) {
      Logic.uncompleteTask(state, task, date);
      Store.touch({ immediate: true });
      toast('已取消完成');
    } else {
      var rec = Logic.completeTask(state, task, date);
      Store.touch({ immediate: true });
      var earned = rec.points;
      toast('+' + U.num(earned) + ' 分' + (rec.bonus ? '（含连击 +' + U.num(rec.bonus) + '）' : '') + ' ✓');
      confetti(12);
      beep(1);
      checkGoal(rec);
      checkLevelUp();
    }
    render();
  }
  function checkGoal() {
    var today = U.today();
    var goal = Logic.dailyGoal(state);
    if (!goal) return;
    var earned = Logic.earnedOn(state, today);
    if (earned >= goal && ui.lastGoalDay !== today) {
      ui.lastGoalDay = today;
      confetti(40);
      toast('🎉 今日目标 ' + U.num(goal) + ' 分达成！', 2600);
    }
  }
  function checkLevelUp() {
    var tot = Logic.totals(state);
    var lv = Logic.levelInfo(tot.earned, state.settings);
    if (lv.level > ui.lastLevel) {
      ui.lastLevel = lv.level;
      confetti(50);
      toast('🎊 升级！Lv.' + lv.level + ' ' + lv.title, 2800);
    } else {
      ui.lastLevel = lv.level;
    }
  }

  /* ============================================================ 弹层 */
  function openSheet(html) {
    $('#sheetInner').innerHTML = html;
    $('#sheet').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeSheet() {
    $('#sheet').hidden = true;
    $('#sheetInner').innerHTML = '';
    document.body.style.overflow = '';
  }
  function catOptions(sel) {
    return Store.alive('categories').map(function (c) {
      return '<option value="' + c.id + '"' + (sel === c.id ? ' selected' : '') + '>' + U.escape(c.icon + ' ' + c.name) + '</option>';
    }).join('');
  }
  function taskSheet(opts) {
    opts = opts || {};
    var t = opts.id ? Logic.taskById(state, opts.id) : null;
    var isNew = !t;
    var occDate = opts.date || U.today();
    if (!t) {
      t = {
        title: '', points: opts.points != null ? opts.points : 30, categoryId: opts.categoryId || '',
        date: opts.date || U.today(), time: '', repeat: null, important: false, urgent: false,
        estimateMin: opts.estimateMin || 30, note: '', link: '', tags: [], order: 0
      };
    }
    var rep = t.repeat || { type: 'none' };
    var quickPts = [10, 15, 20, 30, 40, 60, 80, 100];
    var html = '<div class="sheet-head"><span class="sheet-title">' + (isNew ? '新建任务' : '编辑任务') + '</span>' +
      '<span class="grow"></span><button class="icon-btn" data-action="close-sheet">✕</button></div>';
    if (!isNew && Logic.isRepeating(t)) {
      html += '<div class="set-hint" style="margin-bottom:9px">🔁 这是重复任务（' + U.escape(Logic.repeatText(t)) + '），改动会影响之后所有日期。已完成的历史记录不会被改动。</div>';
    }
    if (isNew) {
      html += '<div class="field"><span class="field-label">从模板快速填写</span><div class="quick-add">' +
        Store.alive('templates').map(function (tp) {
          return '<button class="chip chip-btn" data-action="use-tpl" data-tpl="' + tp.id + '">' + U.escape(tp.icon || '') + ' ' + U.escape(tp.name) + ' <b class="pts">+' + U.num(tp.points) + '</b></button>';
        }).join('') + '</div></div>';
    }
    html += '<div class="form-grid">' +
      '<div class="field"><span class="field-label">任务名称</span>' +
      '<input class="input" id="f-title" value="' + U.escape(t.title) + '" placeholder="例如：复习数据结构第三章"></div>' +
      '<div class="field"><span class="field-label">完成可得积分</span><div class="quick-pts">' +
      quickPts.map(function (p) {
        return '<button class="chip chip-btn' + (Number(t.points) === p ? ' active' : '') + '" data-action="set-pts" data-pts="' + p + '">' + p + '</button>';
      }).join('') +
      '<input class="input num" type="number" inputmode="numeric" id="f-points" value="' + Number(t.points || 0) + '"></div>' +
      '<div class="set-hint">参考：背单词 15 · 网课一节 30 · 作业 40 · 写代码 40 · 推进项目 80（每周目标 1500 分）</div></div>' +
      '<div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      '<div class="field"><span class="field-label">分类</span><select class="select" id="f-cat"><option value="">（不分类）</option>' + catOptions(t.categoryId) + '</select></div>' +
      '<div class="field"><span class="field-label">预计时长（分钟）</span><input class="input" type="number" inputmode="numeric" id="f-estimate" value="' + Number(t.estimateMin || 0) + '"></div>' +
      '</div>' +
      '<div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      '<div class="field"><span class="field-label">' + (rep.type && rep.type !== 'none' ? '开始日期' : '日期（留空＝未安排）') + '</span>' +
      '<input class="input" type="date" id="f-date" value="' + U.escape(t.date || '') + '"></div>' +
      '<div class="field"><span class="field-label">具体时间（填了才能导出到系统日历）</span>' +
      '<input class="input" type="time" id="f-time" value="' + U.escape(t.time || '') + '"></div>' +
      '</div>' +
      '<div class="field"><span class="field-label">重复</span>' +
      '<select class="select" id="f-repeat">' +
      [['none', '不重复'], ['daily', '每天'], ['weekdays', '每个工作日（周一~周五）'], ['weekly', '每周指定几天'], ['monthly', '每月同一天'], ['interval', '每隔 N 天']].map(function (o) {
        return '<option value="' + o[0] + '"' + ((rep.type || 'none') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field' + (rep.type === 'weekly' ? '' : ' hidden') + '" id="row-days"><span class="field-label">每周哪几天</span>' +
      '<div class="weekday-picker">' + [1, 2, 3, 4, 5, 6, 0].map(function (d) {
        var on = (rep.days || []).indexOf(d) >= 0;
        return '<button class="chip chip-btn' + (on ? ' active' : '') + '" data-action="toggle-day-pick" data-day="' + d + '">周' + U.weekdayName('2025-01-0' + (d === 0 ? '5' : d + 4)) + '</button>';
      }).join('') + '</div></div>' +
      '<div class="field' + (rep.type === 'interval' ? '' : ' hidden') + '" id="row-interval"><span class="field-label">每隔几天</span>' +
      '<input class="input num" type="number" inputmode="numeric" id="f-interval" value="' + Number(rep.interval || 2) + '"></div>' +
      '<div class="field' + (rep.type && rep.type !== 'none' ? '' : ' hidden') + '" id="row-until"><span class="field-label">重复到哪天为止（可留空）</span>' +
      '<input class="input" type="date" id="f-until" value="' + U.escape(rep.until || '') + '"></div>' +
      '<div class="field"><span class="field-label">四象限优先级</span><div class="prio-picker">' +
      '<button class="chip chip-btn' + (t.important ? ' active' : '') + '" data-action="toggle-important" id="btn-important">' + (t.important ? '☑' : '☐') + ' 重要</button>' +
      '<button class="chip chip-btn' + (t.urgent ? ' active' : '') + '" data-action="toggle-urgent" id="btn-urgent">' + (t.urgent ? '☑' : '☐') + ' 紧急</button>' +
      '<span class="chip">' + quadText(t.important, t.urgent) + '</span>' +
      '</div></div>' +
      '<div class="field"><span class="field-label">备注 / 学习资料链接</span>' +
      '<textarea class="textarea" id="f-note" placeholder="页码、章节、要点…">' + U.escape(t.note || '') + '</textarea>' +
      '<input class="input" id="f-link" placeholder="https://… （可选）" value="' + U.escape(t.link || '') + '"></div>' +
      '</div>' +
      '<div class="sheet-foot">' +
      (!isNew ? '<button class="btn danger" data-action="del-task" data-id="' + t.id + '">删除</button>' : '') +
      (!isNew && Logic.isRepeating(t) ? '<button class="btn ghost" data-action="skip" data-id="' + t.id + '" data-date="' + occDate + '">今天跳过</button>' : '') +
      '<button class="btn primary" data-action="save-task" data-id="' + (isNew ? '' : t.id) + '" data-date="' + occDate + '">保存</button>' +
      '</div>';
    openSheet(html);
    ui.pick = {
      important: !!t.important, urgent: !!t.urgent, days: (rep.days || []).slice(),
      id: isNew ? '' : t.id, isRepeat: Logic.isRepeating(t)
    };
  }
  function quadText(imp, urg) {
    if (imp && urg) return '立即做';
    if (imp) return '计划做';
    if (urg) return '尽快做';
    return '有空做';
  }
  function daySheet(date) {
    var data = Logic.dayItems(state, date);
    var earned = Logic.earnedOn(state, date);
    var planned = data.items.reduce(function (s, i) { return s + (Number(i.task.points) || 0); }, 0);
    var html = '<div class="sheet-head"><span class="sheet-title">' + U.escape(U.fmtLong(date)) + '</span>' +
      '<span class="grow"></span><button class="icon-btn" data-action="close-sheet">✕</button></div>' +
      '<div class="row-wrap"><span class="chip">得分 <b class="pts">' + U.num(earned) + '</b></span>' +
      '<span class="chip">计划 ' + U.num(planned) + ' 分</span>' +
      '<span class="chip">专注 ' + U.minToHM(Logic.minutesOn(state, date)) + '</span>' +
      '<span class="chip">完成 ' + data.items.filter(function (i) { return i.done; }).length + '/' + data.items.length + '</span></div>' +
      '<div class="divider"></div>' +
      (data.items.length || data.overdue.length
        ? data.overdue.map(function (it) { return taskRow(it); }).join('') + data.items.map(function (it) { return taskRow(it); }).join('')
        : '<div class="empty">这一天还没有任务</div>') +
      '<div class="sheet-foot"><button class="btn primary" data-action="new-task" data-date="' + date + '">＋ 给这一天加任务</button></div>';
    openSheet(html);
  }
  function rewardSheet(id) {
    var r = id ? Logic.rewardById(state, id) : null;
    var isNew = !r;
    if (!r) r = { icon: '🎁', name: '', cost: 200 };
    openSheet('<div class="sheet-head"><span class="sheet-title">' + (isNew ? '新增奖励' : '编辑奖励') + '</span>' +
      '<span class="grow"></span><button class="icon-btn" data-action="close-sheet">✕</button></div>' +
      '<div class="form-grid">' +
      '<div class="field"><span class="field-label">图标（一个 emoji）</span><input class="input" id="r-icon" value="' + U.escape(r.icon) + '" style="max-width:110px"></div>' +
      '<div class="field"><span class="field-label">奖励名称</span><input class="input" id="r-name" value="' + U.escape(r.name) + '" placeholder="例如：一杯奶茶"></div>' +
      '<div class="field"><span class="field-label">需要积分</span><input class="input num" type="number" inputmode="numeric" id="r-cost" value="' + Number(r.cost || 0) + '"></div>' +
      '</div><div class="sheet-foot">' +
      (!isNew ? '<button class="btn danger" data-action="del-reward" data-id="' + r.id + '">删除</button>' : '') +
      '<button class="btn primary" data-action="save-reward" data-id="' + (isNew ? '' : r.id) + '">保存</button></div>');
  }
  function categorySheet(id) {
    var c = id ? Logic.categoryOf(state, id) : null;
    var isNew = !c;
    if (!c) c = { icon: '📘', name: '', color: ACCENTS[0] };
    openSheet('<div class="sheet-head"><span class="sheet-title">' + (isNew ? '新增分类' : '编辑分类') + '</span>' +
      '<span class="grow"></span><button class="icon-btn" data-action="close-sheet">✕</button></div>' +
      '<div class="form-grid">' +
      '<div class="field"><span class="field-label">图标（一个 emoji）</span><input class="input" id="c-icon" value="' + U.escape(c.icon) + '" style="max-width:110px"></div>' +
      '<div class="field"><span class="field-label">分类名称</span><input class="input" id="c-name" value="' + U.escape(c.name) + '" placeholder="例如：大学课程"></div>' +
      '<div class="field"><span class="field-label">颜色</span><div class="color-dots" id="c-colors">' + ACCENTS.map(function (col) {
        return '<span class="color-dot' + (c.color === col ? ' active' : '') + '" data-action="pick-color" data-color="' + col + '" style="background:' + col + '"></span>';
      }).join('') + '</div></div>' +
      '</div><div class="sheet-foot">' +
      (!isNew ? '<button class="btn danger" data-action="del-category" data-id="' + c.id + '">删除</button>' : '') +
      '<button class="btn primary" data-action="save-category" data-id="' + (isNew ? '' : c.id) + '">保存</button></div>');
    ui.pickColor = c.color;
  }
  function templateSheet(id) {
    var t = id ? Store.find('templates', id) : null;
    var isNew = !t || t.deleted;
    if (isNew) t = { icon: '⏱️', name: '', points: 30, categoryId: '', estimateMin: 30, important: false, urgent: false };
    openSheet('<div class="sheet-head"><span class="sheet-title">' + (isNew ? '新增模板' : '编辑模板') + '</span>' +
      '<span class="grow"></span><button class="icon-btn" data-action="close-sheet">✕</button></div>' +
      '<div class="form-grid">' +
      '<div class="field"><span class="field-label">图标</span><input class="input" id="t-icon" value="' + U.escape(t.icon) + '" style="max-width:110px"></div>' +
      '<div class="field"><span class="field-label">模板名称</span><input class="input" id="t-name" value="' + U.escape(t.name) + '" placeholder="例如：背单词"></div>' +
      '<div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      '<div class="field"><span class="field-label">积分</span><input class="input num" type="number" inputmode="numeric" id="t-points" value="' + Number(t.points || 0) + '"></div>' +
      '<div class="field"><span class="field-label">预计时长（分钟）</span><input class="input num" type="number" inputmode="numeric" id="t-estimate" value="' + Number(t.estimateMin || 0) + '"></div>' +
      '</div>' +
      '<div class="field"><span class="field-label">分类</span><select class="select" id="t-cat"><option value="">（不分类）</option>' + catOptions(t.categoryId) + '</select></div>' +
      '</div><div class="sheet-foot">' +
      (!isNew ? '<button class="btn danger" data-action="del-template" data-id="' + t.id + '">删除</button>' : '') +
      '<button class="btn primary" data-action="save-template" data-id="' + (isNew ? '' : t.id) + '">保存</button></div>');
  }

  /* ============================================================ 事件处理 */
  document.addEventListener('click', function (e) {
    var target = e.target.closest('[data-action]');
    if (e.target.closest('a')) return;
    if (!target) {
      if (e.target.id === 'sheet') closeSheet();
      return;
    }
    var a = target.getAttribute('data-action');
    var id = target.getAttribute('data-id');
    var date = target.getAttribute('data-date');
    switch (a) {
      case 'tab': ui.view = target.getAttribute('data-view'); ui.date = U.today(); ui.month = U.today();
        if (location.hash !== '#' + ui.view) { try { history.replaceState(null, '', '#' + ui.view); } catch (err) { } }
        render(); window.scrollTo({ top: 0, behavior: 'smooth' }); break;
      case 'toggle': e.stopPropagation(); toggleTask(id, date); break;
      case 'toggle-day': ui.collapsed['d' + date] = !ui.collapsed['d' + date]; renderView(); break;
      case 'edit-task': taskSheet({ id: id, date: date }); break;
      case 'new-task': closeSheet(); taskSheet({ date: date || ui.date }); break;
      case 'day': daySheet(date); break;
      case 'shift-day': {
        var d = Number(target.getAttribute('data-delta'));
        ui.date = d === 0 ? U.today() : U.addDays(ui.date || U.today(), d);
        renderView(); break;
      }
      case 'shift-week': {
        var w = Number(target.getAttribute('data-delta'));
        ui.date = w === 0 ? U.today() : U.addDays(ui.date || U.today(), w);
        renderView(); break;
      }
      case 'shift-month': {
        var m = Number(target.getAttribute('data-delta'));
        ui.month = m === 0 ? U.today() : U.addMonths(ui.month || U.today(), m);
        renderView(); break;
      }
      case 'stat-range': ui.statRange = Number(target.getAttribute('data-range')); renderView(); break;
      case 'list-filter': ui.list.filter = target.getAttribute('data-filter'); renderView(); break;
      case 'list-cat': ui.list.categoryId = target.getAttribute('data-cat'); renderView(); break;
      /* 番茄钟 */
      case 'pomo-start': pomoStart(); break;
      case 'pomo-pause': pomoPause(); break;
      case 'pomo-reset': pomoReset(); break;
      case 'pomo-preset': {
        var preset = target.getAttribute('data-preset');
        state.settings.pomodoro.preset = preset;
        if (preset === '25/5') { state.settings.pomodoro.focus = 25; state.settings.pomodoro.brk = 5; }
        if (preset === '50/10') { state.settings.pomodoro.focus = 50; state.settings.pomodoro.brk = 10; }
        state.settings.updatedAt = U.now();
        ui.pomo.running = false; clearInterval(ui.pomo.timer);
        ui.pomo.remain = pomoTotalSeconds();
        Store.touch(); renderView();
        break;
      }
      /* 商店 */
      case 'redeem': {
        var r = Logic.rewardById(state, id);
        if (!r) break;
        var tot = Logic.totals(state);
        if (tot.available < r.cost) { toast('积分不够，还差 ' + U.num(r.cost - tot.available) + ' 分'); break; }
        if (!confirm('兑换「' + r.name + '」，花费 ' + r.cost + ' 分？')) break;
        Store.put('redemptions', {
          id: U.uid('rd'), rewardId: r.id, name: r.name, cost: Number(r.cost) || 0,
          at: U.now(), date: U.today(), deleted: false
        });
        confetti(30);
        toast('🎁 已兑换：' + r.name + '（−' + U.num(r.cost) + ' 分）', 2600);
        render();
        break;
      }
      case 'undo-redeem': {
        var rd = Store.find('redemptions', id);
        if (rd && confirm('撤销这次兑换？积分会退回。')) {
          Store.remove('redemptions', id);
          toast('已撤销，退回 ' + U.num(rd.cost) + ' 分');
          render();
        }
        break;
      }
      case 'new-reward': rewardSheet(''); break;
      case 'edit-reward': rewardSheet(id); break;
      case 'save-reward': {
        var name = $('#r-name').value.trim();
        if (!name) { toast('请填写奖励名称'); break; }
        Store.put('rewards', {
          id: id || U.uid('rw'), icon: $('#r-icon').value.trim() || '🎁', name: name,
          cost: Number($('#r-cost').value) || 0, deleted: false
        });
        closeSheet(); render(); toast('已保存');
        break;
      }
      case 'del-reward': if (confirm('删除这个奖励？')) { Store.remove('rewards', id); closeSheet(); render(); } break;
      /* 分类 */
      case 'new-category': categorySheet(''); break;
      case 'edit-category': categorySheet(id); break;
      case 'pick-color': ui.pickColor = target.getAttribute('data-color');
        $$('#c-colors .color-dot').forEach(function (d) { d.classList.toggle('active', d === target); });
        break;
      case 'save-category': {
        var cn = $('#c-name').value.trim();
        if (!cn) { toast('请填写分类名称'); break; }
        Store.put('categories', {
          id: id || U.uid('cat'), icon: $('#c-icon').value.trim() || '📘', name: cn,
          color: ui.pickColor || ACCENTS[0], deleted: false
        });
        closeSheet(); render(); toast('已保存');
        break;
      }
      case 'del-category': if (confirm('删除这个分类？已有任务会变成未分类。')) { Store.remove('categories', id); closeSheet(); render(); } break;
      /* 模板 */
      case 'new-template': templateSheet(''); break;
      case 'edit-template': templateSheet(id); break;
      case 'save-template': {
        var tn = $('#t-name').value.trim();
        if (!tn) { toast('请填写模板名称'); break; }
        Store.put('templates', {
          id: id || U.uid('tpl'), icon: $('#t-icon').value.trim() || '⏱️', name: tn,
          points: Number($('#t-points').value) || 0, categoryId: $('#t-cat').value || null,
          estimateMin: Number($('#t-estimate').value) || 0, deleted: false
        });
        closeSheet(); render(); toast('已保存');
        break;
      }
      case 'del-template': if (confirm('删除这个模板？')) { Store.remove('templates', id); closeSheet(); render(); } break;
      /* 任务表单内 */
      case 'use-tpl': {
        var tp = Store.find('templates', target.getAttribute('data-tpl'));
        if (!tp) break;
        $('#f-title').value = tp.name;
        $('#f-points').value = tp.points;
        $('#f-cat').value = tp.categoryId || '';
        $('#f-estimate').value = tp.estimateMin || 30;
        ui.pick.important = !!tp.important; ui.pick.urgent = !!tp.urgent;
        refreshPrioBtns();
        toast('已套用模板：' + tp.name);
        break;
      }
      case 'set-pts': $('#f-points').value = target.getAttribute('data-pts');
        $$('.quick-pts .chip').forEach(function (c) { c.classList.toggle('active', c === target); });
        break;
      case 'toggle-day-pick': {
        var day = Number(target.getAttribute('data-day'));
        var idx = ui.pick.days.indexOf(day);
        if (idx >= 0) ui.pick.days.splice(idx, 1); else ui.pick.days.push(day);
        target.classList.toggle('active', idx < 0);
        break;
      }
      case 'toggle-important': ui.pick.important = !ui.pick.important; refreshPrioBtns(); break;
      case 'toggle-urgent': ui.pick.urgent = !ui.pick.urgent; refreshPrioBtns(); break;
      case 'save-task': saveTask(id || '', date); break;
      case 'del-task': {
        if (!confirm('删除这个任务？已完成的历史积分会保留。')) break;
        Store.remove('tasks', id);
        closeSheet(); render(); toast('任务已删除');
        break;
      }
      case 'skip': {
        var task = Logic.taskById(state, id);
        if (!task) break;
        var rec = Logic.completeTask(state, task, date || U.today());
        rec.points = 0; rec.base = 0; rec.bonus = 0; rec.bonusPercent = 0; rec.skipped = true;
        Store.touch();
        closeSheet(); render(); toast('今天已跳过（不加分）');
        break;
      }
      case 'quick-add': {
        var tpl = Store.find('templates', target.getAttribute('data-tpl'));
        if (!tpl) break;
        var when = target.getAttribute('data-date') || ui.date || U.today();
        var task = {
          id: U.uid('task'), title: tpl.name, points: Number(tpl.points) || 0,
          categoryId: tpl.categoryId || null, date: when, time: '', repeat: null,
          important: !!tpl.important, urgent: !!tpl.urgent, estimateMin: Number(tpl.estimateMin) || 0,
          note: '', link: '', tags: [], order: 0, createdAt: U.now(), deleted: false
        };
        Store.put('tasks', task);
        toast('已添加：' + tpl.name + '（+' + U.num(task.points) + ' 分）');
        render();
        break;
      }
      /* 设置 */
      case 'set-accent': setPath('settings.accent', target.getAttribute('data-color')); applyTheme(); render(); break;
      case 'toggle-theme': {
        var cur = state.settings.theme || 'auto';
        var isDark = cur === 'dark' || (cur === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
        setPath('settings.theme', isDark ? 'light' : 'dark');
        applyTheme();
        render();
        toast(isDark ? '已切到浅色' : '已切到深色');
        break;
      }
      case 'notify-permission': requestNotify(); break;
      case 'notify-test': sendNotify('学习积分日程表', '这是一条测试通知，收到说明提醒可用 ✅'); toast('已发送测试通知（若没看到请检查系统通知权限）'); break;
      case 'export-json': U.download('学习积分日程表-备份-' + U.today() + '.json', JSON.stringify(Store.toPayload(), null, 2), 'application/json'); toast('已导出备份'); break;
      case 'import-json': importJson(); break;
      case 'export-ics': {
        var n = ICS.count(state, { days: 60 });
        ICS.download(state, { days: 60 });
        toast('已导出日历：' + n + ' 个带时间的任务 + 每日提醒', 3000);
        break;
      }
      case 'export-csv': exportCsv(); break;
      case 'reset-all': if (confirm('确定清空本机所有数据？此操作不可撤销（建议先导出备份）')) {
        if (confirm('再确认一次：清空后任务、积分记录、兑换记录都会消失。')) {
          Store.reset(); state = Store.state; ui.lastLevel = 1; render(); toast('已清空');
        }
        break;
      }
      case 'sync': doSync(target.getAttribute('data-mode') || 'both'); break;
      case 'sync-create': createGist(); break;
      case 'test-token': testToken(); break;
      case 'install': if (ui.deferredPrompt) { ui.deferredPrompt.prompt(); ui.deferredPrompt = null; } break;
      case 'close-sheet': closeSheet(); break;
      case 'dismiss-reminder': $('#reminderBar').hidden = true; break;
    }
  });
  function refreshPrioBtns() {
    var bi = $('#btn-important'), bu = $('#btn-urgent');
    if (bi) { bi.classList.toggle('active', ui.pick.important); bi.textContent = (ui.pick.important ? '☑' : '☐') + ' 重要'; }
    if (bu) { bu.classList.toggle('active', ui.pick.urgent); bu.textContent = (ui.pick.urgent ? '☑' : '☐') + ' 紧急'; }
  }
  function saveTask(id, occDate) {
    var title = $('#f-title').value.trim();
    if (!title) { toast('请填写任务名称'); return; }
    var repType = $('#f-repeat').value;
    var repeat = null;
    if (repType !== 'none') {
      repeat = { type: repType };
      if (repType === 'weekly') {
        if (!ui.pick.days.length) { toast('请选择每周哪几天'); return; }
        repeat.days = ui.pick.days.slice().sort();
      }
      if (repType === 'interval') repeat.interval = Math.max(1, Number($('#f-interval').value) || 2);
      var until = $('#f-until').value;
      if (until) repeat.until = until;
    }
    var task = {
      id: id || U.uid('task'),
      title: title,
      points: Number($('#f-points').value) || 0,
      categoryId: $('#f-cat').value || null,
      date: $('#f-date').value || '',
      time: $('#f-time').value || '',
      repeat: repeat,
      important: !!ui.pick.important,
      urgent: !!ui.pick.urgent,
      estimateMin: Number($('#f-estimate').value) || 0,
      note: $('#f-note').value.trim(),
      link: $('#f-link').value.trim(),
      tags: [],
      order: 0,
      deleted: false
    };
    if (repeat && !task.date) task.date = U.today();
    if (!id) task.createdAt = U.now();
    Store.put('tasks', task);
    closeSheet();
    render();
    toast(id ? '已保存' : '已添加 ' + title + '（+' + U.num(task.points) + ' 分）');
  }
  function importJson() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = Store.fromPayload(JSON.parse(String(reader.result)));
          if (!data) { toast('文件格式不对，应该是本程序导出的 JSON'); return; }
          if (!confirm('导入会与当前数据合并（同一条以较新的为准），继续？')) return;
          var merged = Store.mergeStates(Store.state, Store.normalize(data));
          Store.replaceState(merged);
          state = Store.state;
          ui.lastLevel = Logic.levelInfo(Logic.totals(state).earned, state.settings).level;
          render();
          toast('导入完成');
        } catch (err) { toast('读取失败：' + err.message); }
      };
      reader.readAsText(file);
    };
    input.click();
  }
  function exportCsv() {
    var rows = [['日期', '类型', '标题', '分类', '基础分', '连击加分', '总积分', '用时(分钟)']];
    (state.completions || []).filter(function (c) { return !c.deleted; }).forEach(function (c) {
      var cat = Logic.categoryOf(state, c.categoryId);
      rows.push([c.date, c.skipped ? '跳过' : '任务', c.title || '', cat ? cat.name : '', c.base || 0, c.bonus || 0, c.points || 0, c.minutes || 0]);
    });
    (state.pomodoros || []).filter(function (p) { return !p.deleted; }).forEach(function (p) {
      rows.push([p.date, '番茄钟', '专注 ' + p.minutes + ' 分钟', '', '', '', p.points || 0, p.minutes || 0]);
    });
    var csv = '\ufeff' + rows.map(function (r) {
      return r.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
    U.download('学习积分记录-' + U.today() + '.csv', csv, 'text/csv');
    toast('已导出 CSV');
  }

  /* 输入类控件 */
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.id === 'listSearch') return;
    if (el.getAttribute && el.getAttribute('data-action') === 'pomo-task') {
      ui.pomo.taskId = el.value;
      return;
    }
    if (el.id === 'f-repeat') {
      var v = el.value;
      $('#row-days').classList.toggle('hidden', v !== 'weekly');
      $('#row-interval').classList.toggle('hidden', v !== 'interval');
      $('#row-until').classList.toggle('hidden', v === 'none');
      if (v !== 'none' && !$('#f-date').value) $('#f-date').value = U.today();
      return;
    }
    var path = el.getAttribute && el.getAttribute('data-path');
    if (!path) return;
    var val;
    if (el.type === 'checkbox') val = el.checked;
    else if (el.getAttribute('data-type') === 'number') val = Number(el.value) || 0;
    else val = el.value;
    setPath(path, val);
    if (path === 'settings.theme' || path === 'settings.accent' || path === 'settings.confetti') applyTheme();
    renderView();
  });
  document.addEventListener('input', U.debounce(function (e) {
    if (e.target && e.target.id === 'listSearch') {
      ui.list.keyword = e.target.value;
      var keep = document.activeElement === e.target;
      renderView();
      if (keep) {
        var el = $('#listSearch');
        if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
      }
    }
  }, 220));
  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    if (e.key === 'Escape' && !$('#sheet').hidden) { closeSheet(); return; }
    if (typing) return;
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); taskSheet({ date: ui.date }); }
    var idx = '1234567'.indexOf(e.key);
    if (idx >= 0 && VIEWS[idx]) { ui.view = VIEWS[idx].id; render(); }
  });

  /* ============================================================ 提醒 */
  function loadFired() {
    try { ui.fired = JSON.parse(localStorage.getItem('sps.fired') || '{}'); } catch (e) { ui.fired = {}; }
  }
  function saveFired() {
    try { localStorage.setItem('sps.fired', JSON.stringify(ui.fired)); } catch (e) { }
  }
  function checkReminders(force) {
    var rem = state.settings.reminders || {};
    if (!rem.enabled) return;
    var today = U.today();
    var now = new Date();
    var mins = now.getHours() * 60 + now.getMinutes();
    var slots = [
      { key: 'morning', time: rem.morning, title: '☀️ 今日计划', build: morningText },
      { key: 'evening', time: rem.evening, title: '🌙 今日复盘', build: eveningText }
    ];
    var firedNow = false;
    slots.forEach(function (s) {
      if (!s.time) return;
      if (mins < U.toMin(s.time)) return;
      var stamp = today + ' ' + s.time;
      if (ui.fired[s.key] === stamp) return;
      var body = s.build();
      if (!body) { ui.fired[s.key] = stamp; return; }
      var sent = force ? sendNotify(s.title, body) : sendNotify(s.title, body);
      showReminderBar(s.title + '：' + body);
      ui.fired[s.key] = stamp;
      firedNow = true;
    });
    if (firedNow) saveFired();
  }
  function morningText() {
    var d = Logic.dayItems(state, U.today());
    if (!d.items.length && !d.overdue.length) return '';
    var left = d.items.filter(function (i) { return !i.done; });
    var pts = left.reduce(function (s, i) { return s + Logic.previewPoints(state, i.task, U.today()).total; }, 0);
    return '今天有 ' + d.items.length + ' 项任务，共 ' + U.num(pts) + ' 分可拿' +
      (d.overdue.length ? '，另有 ' + d.overdue.length + ' 项逾期' : '') + '。先挑最容易的一项开始吧！';
  }
  function eveningText() {
    var d = Logic.dayItems(state, U.today());
    var left = d.items.filter(function (i) { return !i.done; });
    var earned = Logic.earnedOn(state, U.today());
    var goal = Logic.dailyGoal(state);
    if (!d.items.length) return '';
    if (!left.length) return '今天 ' + d.items.length + ' 项全部完成，得了 ' + U.num(earned) + ' 分，辛苦了！';
    return '今天还剩 ' + left.length + ' 项没完成（已得 ' + U.num(earned) + (goal ? '/' + U.num(goal) : '') + ' 分），睡前再拿下 ' + U.num(left.reduce(function (s, i) { return s + Logic.previewPoints(state, i.task, U.today()).total; }, 0)) + ' 分？';
  }
  function showReminderBar(text) {
    var bar = $('#reminderBar');
    bar.innerHTML = '<span class="grow">' + U.escape(text) + '</span>' +
      '<button class="btn small" data-action="dismiss-reminder">知道了</button>';
    bar.hidden = false;
    setTimeout(function () { bar.hidden = true; }, 20000);
  }
  function renderReminderBar() { /* 由 checkReminders 控制显示 */ }
  function requestNotify() {
    if (typeof Notification === 'undefined') { toast('这个浏览器不支持系统通知，建议用 .ics 导入手机日历'); return; }
    Notification.requestPermission().then(function (p) {
      toast(p === 'granted' ? '通知已开启' : '未授权通知');
      renderView();
    });
  }

  /* ============================================================ 同步 */
  function setSyncMsg(msg, ok) { ui.syncMsg = msg; ui.syncOk = ok; }
  function persistSync(status) {
    state.settings.sync.lastSyncAt = U.now();
    state.settings.sync.lastStatus = status;
    state.settings.updatedAt = U.now();
    Store.save();
  }
  function doSync(mode) {
    if (ui.syncing) return;
    var cfg = state.settings.sync || {};
    if (!cfg.token || !cfg.gistId) { toast('请先填写 Token 和 Gist ID'); ui.view = 'settings'; render(); return; }
    if (mode === 'push' && !confirm('用本机数据覆盖云端？')) return;
    if (mode === 'pull' && !confirm('用云端数据覆盖本机？本机未同步的改动会丢失。')) return;
    ui.syncing = true;
    setSyncMsg('正在同步…', true);
    renderTop();
    Gist.sync(state, { mode: mode }).then(function (res) {
      state = Store.state;
      ui.lastLevel = Logic.levelInfo(Logic.totals(state).earned, state.settings).level;
      ui.syncing = false;
      var parts = [];
      if (res.pushed) parts.push('已上传本机改动');
      if (res.replaced) parts.push('已合并云端改动');
      if (!parts.length) parts.push('两边已一致');
      setSyncMsg('同步成功：' + parts.join('，') + '（' + new Date().toLocaleTimeString().slice(0, 5) + '）', true);
      persistSync('同步成功');
      toast('☁️ ' + parts.join('，'));
      render();
    }).catch(function (err) {
      ui.syncing = false;
      setSyncMsg('同步失败：' + err.message, false);
      persistSync('同步失败：' + err.message);
      toast('同步失败：' + err.message, 3200);
      render();
    });
  }
  function createGist() {
    var cfg = state.settings.sync || {};
    if (!cfg.token) { toast('请先填写 Token'); return; }
    if (cfg.gistId && !confirm('已经填了 Gist ID，仍要创建一个新的 Gist 吗？')) return;
    ui.syncing = true; renderTop();
    Gist.create(cfg.token, cfg.filename || 'study-schedule-data.json', JSON.stringify(Store.toPayload()))
      .then(function (res) {
        ui.syncing = false;
        state.settings.sync.gistId = res.id;
        state.settings.sync.lastSyncAt = U.now();
        state.settings.sync.lastStatus = '已创建并上传';
        state.settings.updatedAt = U.now();
        Store.save();
        setSyncMsg('已创建 Gist：' + res.id + '（手机上填同一个 ID + Token 即可）', true);
        toast('Gist 创建成功，ID 已自动填好');
        render();
      }).catch(function (err) {
        ui.syncing = false;
        setSyncMsg('创建失败：' + err.message, false);
        toast('创建失败：' + err.message, 3200);
        render();
      });
  }
  function testToken() {
    var cfg = state.settings.sync || {};
    if (!cfg.token) { toast('请先填写 Token'); return; }
    toast('正在验证 Token…');
    Gist.test(cfg.token).then(function (r) {
      setSyncMsg('Token 有效，登录账号：' + r.login, true);
      toast('Token 有效 ✅ ' + r.login);
      render();
    }).catch(function (err) {
      setSyncMsg('Token 无效：' + err.message, false);
      toast('Token 无效：' + err.message, 3200);
      render();
    });
  }
  var autoSync = U.debounce(function () {
    var cfg = state.settings.sync || {};
    if (ui.syncing || !cfg.auto || !cfg.token || !cfg.gistId) return;
    doSync('both');
  }, 4000);

  /* ============================================================ 启动 */
  /* 样式表没加载成功时（多半是浏览器/Service Worker 缓存坏了）给出可自救的提示 */
  function checkAssets() {
    try {
      var accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      var cardEl = document.querySelector('.card');
      var cardOk = cardEl ? getComputedStyle(cardEl).borderRadius !== '0px' : true;
      if (accent && cardOk) return;
      showRepairBar();
    } catch (e) { }
  }
  function showRepairBar() {
    if (document.getElementById('repairBar')) return;
    var bar = document.createElement('div');
    bar.id = 'repairBar';
    bar.setAttribute('style', 'position:fixed;left:0;right:0;top:0;z-index:99999;background:#fff5e0;color:#1d2033;' +
      'font:14px/1.6 system-ui,-apple-system,"Microsoft YaHei",sans-serif;padding:12px 14px;' +
      'box-shadow:0 6px 20px rgba(0,0,0,.25);display:flex;gap:10px;align-items:center;flex-wrap:wrap');
    var text = document.createElement('span');
    text.innerHTML = '<b>样式表没有加载成功</b> —— 页面能打开但排版是乱的。通常是浏览器缓存了旧文件，点右边按钮即可自动修复。';
    var btn = document.createElement('button');
    btn.textContent = '一键修复并重新加载';
    btn.setAttribute('style', 'padding:8px 14px;border:0;border-radius:10px;background:#6d5efc;color:#fff;font-weight:700;cursor:pointer');
    btn.onclick = function () {
      btn.textContent = '正在修复…';
      var jobs = [];
      try {
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
          jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
            return Promise.all(rs.map(function (r) { return r.unregister(); }));
          }));
        }
      } catch (e) { }
      try {
        if (window.caches && caches.keys) {
          jobs.push(caches.keys().then(function (ks) {
            return Promise.all(ks.map(function (k) { return caches.delete(k); }));
          }));
        }
      } catch (e) { }
      Promise.all(jobs).catch(function () { }).then(function () {
        var u = location.href.split('#')[0];
        u += (u.indexOf('?') >= 0 ? '&' : '?') + 'nocache=' + Date.now();
        location.replace(u);
      });
    };
    bar.appendChild(text);
    bar.appendChild(btn);
    document.body.appendChild(bar);
  }

  function boot() {
    ui.date = U.today();
    ui.month = U.today();
    var hashView = (location.hash || '').replace('#', '');
    if (VIEWS.some(function (v) { return v.id === hashView; })) ui.view = hashView;
    ui.lastLevel = Logic.levelInfo(Logic.totals(state).earned, state.settings).level;
    loadFired();
    applyTheme();
    render();
    checkReminders();
    setInterval(checkReminders, 45000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        state = Store.state;
        render();
        checkReminders();
        var cfg = state.settings.sync || {};
        if (cfg.auto && cfg.token && cfg.gistId) autoSync();
      }
    });
    Store.on(function () {
      /* 导入备份 / 云端合并 / 清空数据都会换掉状态对象，这里始终跟上最新引用 */
      if (Store.state !== state) { state = Store.state; ui.lastLevel = Logic.levelInfo(Logic.totals(state).earned, state.settings).level; }
      autoSync();
    });
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').catch(function () { });
    }
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      ui.deferredPrompt = e;
    });
    window.addEventListener('hashchange', function () {
      var v = (location.hash || '').replace('#', '');
      if (VIEWS.some(function (x) { return x.id === v; }) && v !== ui.view) { ui.view = v; render(); }
    });
    /* 离开页面前把待写入的数据落盘（手机切后台很容易被系统回收） */
    window.addEventListener('pagehide', function () { Store.save(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) Store.save(); });
    if (!Store.hasStorage) toast('浏览器禁止了本地存储，数据不会保存', 4000);
    var cfg = state.settings.sync || {};
    if (cfg.auto && cfg.token && cfg.gistId) setTimeout(function () { autoSync(); }, 2000);
    setTimeout(checkAssets, 400);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
