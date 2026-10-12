/* 学习积分日程表 — 数据层：默认值、本地持久化、合并（同步用） */
(function (global) {
  'use strict';
  var U = global.U || (typeof require !== 'undefined' ? require('./util.js') : null);

  var KEY = 'study-points-schedule.v1';
  var VERSION = 1;
  var COLLECTIONS = ['categories', 'templates', 'rewards', 'tasks', 'completions', 'pomodoros', 'redemptions'];

  /* ------------------------------------------------------------------ 默认值 */
  function defaultSettings() {
    return {
      appName: '学习积分日程表',
      theme: 'auto',                 // light | dark | auto
      accent: '#6d5efc',
      confetti: true,
      weekStart: 1,                  // 1 = 周一
      weeklyGoal: 1500,
      dailyGoal: 0,                  // 0 = 自动取 weeklyGoal/7
      levelBase: 500,                // 升到 2 级需要的经验
      levelGrowth: 100,              // 每升一级递增
      streak: { enabled: true, perDayPercent: 5, capPercent: 50, minPoints: 1 },
      pomodoro: {
        preset: '25/5', focus: 25, brk: 5, longBrk: 15, longEvery: 4,
        awardEnabled: true, award: 5, autoNext: false, sound: true
      },
      reminders: { enabled: true, morning: '08:00', evening: '21:00' },
      sync: { token: '', gistId: '', filename: 'study-schedule-data.json', auto: true, lastSyncAt: '', lastStatus: '' },
      updatedAt: ''
    };
  }

  function defaultCategories() {
    var t = U.now();
    return [
      { id: 'cat-course', name: '大学课程', color: '#6d5efc', icon: '📘', updatedAt: t, deleted: false },
      { id: 'cat-code', name: '编程与技术', color: '#22b8cf', icon: '💻', updatedAt: t, deleted: false },
      { id: 'cat-lang', name: '语言学习', color: '#f59f00', icon: '🗣️', updatedAt: t, deleted: false },
      { id: 'cat-vol', name: '青协事务', color: '#f06595', icon: '🤝', updatedAt: t, deleted: false },
      { id: 'cat-other', name: '其他', color: '#868e96', icon: '✨', updatedAt: t, deleted: false }
    ];
  }

  function defaultTemplates() {
    var t = U.now();
    function mk(id, name, points, categoryId, estimateMin, imp, urg, icon) {
      return { id: id, name: name, points: points, categoryId: categoryId, estimateMin: estimateMin, important: !!imp, urgent: !!urg, icon: icon || '⏱️', updatedAt: t, deleted: false };
    }
    return [
      mk('tpl-word', '背单词', 15, 'cat-lang', 20, false, false, '🔤'),
      mk('tpl-oral', '口语 / 听力练习', 20, 'cat-lang', 25, false, false, '🎧'),
      mk('tpl-video', '看网课一节', 30, 'cat-course', 60, true, false, '🎬'),
      mk('tpl-hw', '写课后作业', 40, 'cat-course', 60, true, true, '📝'),
      mk('tpl-review', '复习一章', 35, 'cat-course', 45, true, false, '📖'),
      mk('tpl-problems', '刷题 20 道', 30, 'cat-course', 45, true, false, '🧮'),
      mk('tpl-lecture', '整理课堂笔记', 25, 'cat-course', 40, false, false, '🗒️'),
      mk('tpl-algo', '写代码 / 刷算法题', 40, 'cat-code', 60, true, false, '⌨️'),
      mk('tpl-doc', '看技术文档 / 教程', 25, 'cat-code', 40, false, false, '📚'),
      mk('tpl-project', '推进项目 / 毕设', 80, 'cat-code', 120, true, true, '🚀'),
      mk('tpl-vol-duty', '青协值班 / 会议', 50, 'cat-vol', 90, false, true, '📋'),
      mk('tpl-vol-plan', '青协活动筹备', 40, 'cat-vol', 60, true, false, '🎯'),
      mk('tpl-sport', '锻炼身体', 20, 'cat-other', 30, false, false, '🏃')
    ];
  }

  function defaultRewards() {
    var t = U.now();
    function mk(id, name, cost, icon) { return { id: id, name: name, cost: cost, icon: icon, updatedAt: t, deleted: false }; }
    return [
      mk('rw-milktea', '一杯奶茶', 200, '🧋'),
      mk('rw-snack', '一份小吃 / 夜宵', 150, '🍗'),
      mk('rw-show', '看一集剧 / 一部电影', 250, '🎬'),
      mk('rw-meal', '出门吃一顿好的', 400, '🍜'),
      mk('rw-lying', '半天彻底放飞', 350, '🛋️'),
      mk('rw-gift', '买一件想要的小东西', 500, '🎁')
    ];
  }

  function initialState() {
    var t = U.now();
    var s = {
      version: VERSION,
      settings: defaultSettings(),
      categories: defaultCategories(),
      templates: defaultTemplates(),
      rewards: defaultRewards(),
      tasks: [],
      completions: [],
      pomodoros: [],
      redemptions: [],
      meta: { createdAt: t, updatedAt: t, device: U.uid('dev'), revision: 0 }
    };
    s.settings.updatedAt = t;
    return s;
  }

  /* ------------------------------------------------------------- 读写与状态 */
  var state = null;
  var listeners = [];
  var storage = (function () {
    try {
      if (typeof localStorage === 'undefined') return null;
      localStorage.setItem('__t', '1'); localStorage.removeItem('__t');
      return localStorage;
    } catch (e) { return null; }
  })();

  function pruneTombstones(s) {
    var limit = U.addDays(U.today(), -120);
    COLLECTIONS.forEach(function (c) {
      if (!Array.isArray(s[c])) { s[c] = []; return; }
      s[c] = s[c].filter(function (r) {
        if (!r || !r.deleted) return true;
        var day = (r.updatedAt || '').slice(0, 10);
        return !day || U.diffDays(day, limit) >= 0;
      });
    });
  }

  function normalize(s) {
    var base = initialState();
    if (!s || typeof s !== 'object') s = base;
    s.version = VERSION;
    s.settings = Object.assign(base.settings, s.settings || {});
    s.settings.streak = Object.assign(base.settings.streak, (s.settings || {}).streak || {});
    s.settings.pomodoro = Object.assign(base.settings.pomodoro, (s.settings || {}).pomodoro || {});
    s.settings.reminders = Object.assign(base.settings.reminders, (s.settings || {}).reminders || {});
    s.settings.sync = Object.assign(base.settings.sync, (s.settings || {}).sync || {});
    COLLECTIONS.forEach(function (c) { if (!Array.isArray(s[c])) s[c] = []; });
    s.meta = Object.assign(base.meta, s.meta || {});
    // 数组内部字段补全
    s.tasks.forEach(function (t) {
      if (t.points == null) t.points = 0;
      if (!t.tags) t.tags = [];
      if (t.order == null) t.order = 0;
      t.deleted = !!t.deleted;
    });
    s.completions.forEach(function (c) { c.deleted = !!c.deleted; if (c.points == null) c.points = 0; });
    s.pomodoros.forEach(function (p) { p.deleted = !!p.deleted; if (p.points == null) p.points = 0; });
    s.redemptions.forEach(function (r) { r.deleted = !!r.deleted; });
    pruneTombstones(s);
    return s;
  }

  function load() {
    var raw = null;
    try { raw = storage ? storage.getItem(KEY) : null; } catch (e) { raw = null; }
    var parsed = null;
    if (raw) { try { parsed = JSON.parse(raw); } catch (e) { parsed = null; } }
    state = normalize(parsed);
    return state;
  }

  var saveSoon = U.debounce(function () { saveNow(); }, 250);
  function saveNow() {
    if (!storage || !state) return;
    try { storage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.warn('保存失败', e); }
  }
  function touch(opts) {
    if (!state) return;
    state.meta.updatedAt = U.now();
    state.meta.revision = (state.meta.revision || 0) + 1;
    if (opts && opts.immediate) saveNow(); else saveSoon();
    listeners.forEach(function (fn) { try { fn(state); } catch (e) { console.error(e); } });
  }

  /* --------------------------------------------------- 记录级增删改（同步友好） */
  function listOf(coll) { if (!state[coll]) state[coll] = []; return state[coll]; }
  function find(coll, id) {
    var arr = listOf(coll);
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }
  function put(coll, obj) {
    var arr = listOf(coll), t = U.now();
    var idx = -1;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === obj.id) { idx = i; break; }
    var rec;
    if (idx >= 0) { rec = Object.assign(arr[idx], obj); arr[idx] = rec; }
    else { rec = Object.assign({ deleted: false }, obj); arr.push(rec); }
    rec.updatedAt = t;
    rec.deleted = !!rec.deleted;
    touch();
    return rec;
  }
  function remove(coll, id) {
    var rec = find(coll, id);
    if (!rec) return false;
    rec.deleted = true;
    rec.updatedAt = U.now();
    touch();
    return true;
  }
  function alive(coll) { return listOf(coll).filter(function (r) { return !r.deleted; }); }

  /* ------------------------------------------------------------------- 合并 */
  function mergeList(a, b) {
    var map = new Map();
    (a || []).concat(b || []).forEach(function (r) {
      if (!r || !r.id) return;
      var old = map.get(r.id);
      if (!old) { map.set(r.id, r); return; }
      var ta = r.updatedAt || '', tb = old.updatedAt || '';
      if (ta > tb) map.set(r.id, r);
    });
    return Array.from(map.values());
  }

  /* 合并两份数据（后写覆盖，删除用墓碑传播） */
  function mergeStates(local, remote) {
    if (!remote) return normalize(U.clone(local));
    var out = U.clone(local);
    COLLECTIONS.forEach(function (c) { out[c] = mergeList(local[c], remote[c]); });
    var ls = (local.settings && local.settings.updatedAt) || '';
    var rs = (remote.settings && remote.settings.updatedAt) || '';
    out.settings = U.clone(rs > ls ? remote.settings : local.settings);
    var lm = (local.meta && local.meta.updatedAt) || '', rm = (remote.meta && remote.meta.updatedAt) || '';
    out.meta = U.clone(rm > lm ? remote.meta : local.meta);
    out.meta.device = (local.meta && local.meta.device) || out.meta.device;
    out.meta.revision = Math.max((local.meta && local.meta.revision) || 0, (remote.meta && remote.meta.revision) || 0);
    return normalize(out);
  }

  function toPayload() {
    return { app: 'study-points-schedule', version: VERSION, exportedAt: U.now(), state: state || initialState() };
  }
  function fromPayload(payload) {
    if (!payload) return null;
    if (payload.app && payload.state) return payload.state;
    if (payload.settings && payload.tasks) return payload; // 兼容裸数据
    return null;
  }

  function replaceState(next) {
    state = normalize(next);
    saveNow();
    listeners.forEach(function (fn) { try { fn(state); } catch (e) { console.error(e); } });
    return state;
  }

  function reset() {
    var dev = state && state.meta ? state.meta.device : null;
    var fresh = initialState();
    if (dev) fresh.meta.device = dev;
    return replaceState(fresh);
  }

  /* -------------------------------------------------------------------- 导出 */
  var Store = {
    KEY: KEY, VERSION: VERSION, COLLECTIONS: COLLECTIONS,
    get state() { return state; },
    load: load, save: saveNow, saveSoon: saveSoon, touch: touch,
    put: put, remove: remove, find: find, alive: alive, list: listOf,
    mergeStates: mergeStates, toPayload: toPayload, fromPayload: fromPayload,
    replaceState: replaceState, normalize: normalize, reset: reset,
    initialState: initialState,
    defaultSettings: defaultSettings, defaultCategories: defaultCategories,
    defaultTemplates: defaultTemplates, defaultRewards: defaultRewards,
    on: function (fn) { listeners.push(fn); },
    hasStorage: !!storage
  };

  global.Store = Store;
  if (typeof module !== 'undefined' && module.exports) module.exports = Store;
})(typeof globalThis !== 'undefined' ? globalThis : this);
