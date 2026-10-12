/* 学习积分日程表 — 图表：进度环、柱状图、分类条、热力图（纯 HTML/SVG，无外部依赖） */
(function (global) {
  'use strict';
  var U = global.U;
  var Charts = {};

  /* 进度环：返回 HTML（SVG + 居中文字） */
  Charts.ring = function (o) {
    o = o || {};
    var size = o.size || 168, stroke = o.stroke || 13;
    var r = (size - stroke) / 2, c = 2 * Math.PI * r;
    var p = U.clamp(o.progress || 0, 0, 1);
    var color = o.color || 'var(--accent)';
    var svg = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" class="ring-svg">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="var(--ring-track)" stroke-width="' + stroke + '"/>' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="' + stroke +
      '" stroke-linecap="round" stroke-dasharray="' + U.round(c, 2) + '" stroke-dashoffset="' + U.round(c * (1 - p), 2) +
      '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')" class="ring-fill"/>' +
      '</svg>';
    var center = '<div class="ring-center">' +
      '<div class="ring-main">' + (o.center != null ? o.center : Math.round(p * 100) + '%') + '</div>' +
      (o.sub ? '<div class="ring-sub">' + o.sub + '</div>' : '') + '</div>';
    return '<div class="ring" style="width:' + size + 'px;height:' + size + 'px">' + svg + center + '</div>';
  };

  /* 柱状图：data = [{label, value, sub, today}] */
  Charts.bars = function (o) {
    o = o || {};
    var data = o.data || [];
    var height = o.height || 150;
    var max = o.max || Math.max.apply(null, data.map(function (d) { return d.value; }).concat([o.goal || 0, 1])) * 1.12;
    var html = '<div class="bars" style="height:' + height + 'px">';
    data.forEach(function (d) {
      var h = max > 0 ? U.clamp(d.value / max, 0, 1) * 100 : 0;
      var cls = 'bar-fill' + (d.today ? ' is-today' : '') + (o.goal && d.value >= o.goal ? ' is-hit' : '');
      html += '<div class="bar-col" title="' + U.escape(d.title || (d.label + '：' + U.num(d.value) + ' 分')) + '">' +
        '<div class="bar-val">' + (d.value ? U.num(d.value) : '') + '</div>' +
        '<div class="bar-track"><div class="' + cls + '" style="height:' + U.round(h, 2) + '%"></div></div>' +
        '<div class="bar-lab">' + U.escape(d.label) + '</div></div>';
    });
    if (o.goal) {
      var gp = max > 0 ? U.clamp(o.goal / max, 0, 1) * 100 : 0;
      html += '<div class="goal-line" style="bottom:' + U.round(gp, 2) + '%">' +
        '<span>目标 ' + U.num(o.goal) + '</span></div>';
    }
    html += '</div>';
    return html;
  };

  /* 分类横向条 */
  Charts.hbars = function (o) {
    o = o || {};
    var items = o.items || [];
    if (!items.length) return '<div class="empty-hint">' + U.escape(o.empty || '暂无数据') + '</div>';
    var max = Math.max.apply(null, items.map(function (i) { return i.points; }).concat([1]));
    return '<div class="hbars">' + items.map(function (i) {
      var w = U.clamp(i.points / max, 0, 1) * 100;
      return '<div class="hrow">' +
        '<div class="hname"><span class="hicon">' + U.escape(i.icon || '') + '</span>' + U.escape(i.name) + '</div>' +
        '<div class="htrack"><div class="hfill" style="width:' + U.round(w, 2) + '%;background:' + (i.color || 'var(--accent)') + '"></div></div>' +
        '<div class="hval"><b>' + U.num(i.points) + '</b>' + (i.count ? '<span class="hcount">' + i.count + ' 项</span>' : '') + '</div>' +
        '</div>';
    }).join('') + '</div>';
  };

  /* 热力图等级（相对每日目标） */
  Charts.level = function (points, dailyGoal) {
    if (!points) return 0;
    var goal = dailyGoal > 0 ? dailyGoal : 200;
    var ratio = points / goal;
    if (ratio < 0.34) return 1;
    if (ratio < 0.67) return 2;
    if (ratio < 1) return 3;
    return 4;
  };

  /* 打卡热力图：payload = Logic.heatmap(...) */
  Charts.heat = function (payload, dailyGoal, monthLabels) {
    var cols = payload.cols || [];
    var html = '<div class="heat-wrap"><div class="heat">';
    cols.forEach(function (col, ci) {
      var showMonth = false;
      if (monthLabels && ci > 0) {
        var prev = cols[ci - 1][0].date, cur = col[0].date;
        if (U.parse(cur).getMonth() !== U.parse(prev).getMonth()) showMonth = true;
      }
      html += '<div class="heat-col">';
      if (showMonth) html += '<div class="heat-month">' + (U.parse(col[0].date).getMonth() + 1) + '月</div>';
      col.forEach(function (cell) {
        var lv = Charts.level(cell.points, dailyGoal);
        html += '<div class="heat-cell lv' + lv + (cell.future ? ' future' : '') + (cell.date === U.today() ? ' today' : '') +
          '" data-action="day" data-date="' + cell.date + '" title="' + U.fmtMD(cell.date) + ' · ' + U.num(cell.points) + ' 分"></div>';
      });
      html += '</div>';
    });
    html += '</div>';
    html += '<div class="heat-legend"><span>少</span>' +
      [0, 1, 2, 3, 4].map(function (l) { return '<i class="heat-cell lv' + l + '"></i>'; }).join('') +
      '<span>多</span></div></div>';
    return html;
  };

  global.Charts = Charts;
  if (typeof module !== 'undefined' && module.exports) module.exports = Charts;
})(typeof globalThis !== 'undefined' ? globalThis : this);
