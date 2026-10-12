/* 核心逻辑自测：node test/selftest.js */
const path = require('path');
const U = require(path.join(__dirname, '..', 'js', 'util.js'));
const Store = require(path.join(__dirname, '..', 'js', 'store.js'));
const Logic = require(path.join(__dirname, '..', 'js', 'logic.js'));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
function eq(name, a, b) { ok(name + ' (' + JSON.stringify(a) + ' = ' + JSON.stringify(b) + ')', a === b, { got: a, want: b }); }
function section(t) { console.log('\n[' + t + ']'); }

/* ---------------- 1. 日期工具 ---------------- */
section('日期工具');
eq('addDays 跨月', U.addDays('2025-01-31', 1), '2025-02-01');
eq('addDays 跨年', U.addDays('2024-12-31', 1), '2025-01-01');
eq('addDays 闰年', U.addDays('2024-02-28', 1), '2024-02-29');
eq('diffDays 顺序', U.diffDays('2025-03-05', '2025-03-01'), 4);
eq('diffDays 倒序', U.diffDays('2025-03-01', '2025-03-05'), -4);
eq('weekday 周一', U.weekday('2025-10-13'), 1);
eq('weekStartOf 取周一', U.weekStartOf('2025-10-15', 1), '2025-10-13');
eq('weekStartOf 周日归上周一', U.weekStartOf('2025-10-19', 1), '2025-10-13');
eq('daysInMonth 2月', U.daysInMonth('2025-02-10'), 28);
eq('monthGrid 长度', U.monthGrid('2025-10-15', 1).length, 42);
eq('monthGrid 起点为周一', U.weekday(U.monthGrid('2025-10-15', 1)[0]), 1);
eq('num 千分位', U.num(1500), '1,500');
eq('toMin', U.toMin('08:30'), 510);

/* ---------------- 2. 重复规则 ---------------- */
section('重复规则');
const today = U.today();
function mkTask(o) { return Object.assign({ id: U.uid('t'), title: 't', points: 10, tags: [], order: 0, updatedAt: U.now(), deleted: false }, o); }
function dailyTask(points) { return mkTask({ title: '每日任务', points: points, repeat: { type: 'daily' }, date: U.addDays(today, -60) }); }

const daily = dailyTask(10);
ok('每天重复命中', Logic.repeatsOn(daily, today));
const weekdays = mkTask({ title: '上课', repeat: { type: 'weekdays' }, date: U.addDays(today, -30) });
ok('工作日规则', Logic.repeatsOn(weekdays, U.weekStartOf(today, 1)) && !Logic.repeatsOn(weekdays, U.addDays(U.weekStartOf(today, 1), 5)));
const weekly = mkTask({ title: '例会', repeat: { type: 'weekly', days: [1, 3] }, date: U.addDays(today, -30) });
const mon = U.weekStartOf(today, 1);
ok('每周一命中', Logic.repeatsOn(weekly, mon));
ok('每周二不命中', !Logic.repeatsOn(weekly, U.addDays(mon, 1)));
ok('每周三命中', Logic.repeatsOn(weekly, U.addDays(mon, 2)));
const interval = mkTask({ title: '每两天', repeat: { type: 'interval', interval: 2 }, date: '2025-01-01' });
ok('每2天 01-01 命中', Logic.repeatsOn(interval, '2025-01-01'));
ok('每2天 01-03 命中', Logic.repeatsOn(interval, '2025-01-03'));
ok('每2天 01-04 不命中', !Logic.repeatsOn(interval, '2025-01-04'));
const monthly = mkTask({ title: '月末', repeat: { type: 'monthly' }, date: '2025-01-31' });
ok('每月31日 2月落到28日', Logic.repeatsOn(monthly, '2025-02-28'));
ok('每月31日 2月27日不命中', !Logic.repeatsOn(monthly, '2025-02-27'));
ok('每月31日 3月31命中', Logic.repeatsOn(monthly, '2025-03-31'));
const untilTask = mkTask({ title: '限期', repeat: { type: 'daily', until: U.addDays(today, 2) }, date: U.addDays(today, -5) });
ok('until 之前命中', Logic.repeatsOn(untilTask, today));
ok('until 之后不命中', !Logic.repeatsOn(untilTask, U.addDays(today, 3)));
ok('开始日期之前不命中', !Logic.repeatsOn(daily, U.addDays(daily.date, -1)));
eq('重复描述', Logic.repeatText(weekly), '每周一、三');

/* ---------------- 3. 一次性任务：完成与取消 ---------------- */
section('一次性任务完成');
const st = Store.initialState();
const oneOff = mkTask({ title: '写作业', points: 40 });
st.tasks.push(oneOff);
eq('无历史时加成 0%', Logic.bonusPercent(st, today), 0);
eq('预览分值', JSON.stringify(Logic.previewPoints(st, oneOff, today)), JSON.stringify({ base: 40, bonusPercent: 0, bonus: 0, total: 40 }));
const rec = Logic.completeTask(st, oneOff, today);
eq('完成记录分值', rec.points, 40);
eq('当日得分', Logic.earnedOn(st, today), 40);
eq('重复完成不叠加', (Logic.completeTask(st, oneOff, today), Logic.earnedOn(st, today)), 40);
eq('一次性任务只留一条记录', st.completions.filter(c => !c.deleted).length, 1);
Logic.uncompleteTask(st, oneOff, today);
eq('取消完成后得分归零', Logic.earnedOn(st, today), 0);
ok('取消完成是墓碑', st.completions[0].deleted === true);
Logic.completeTask(st, oneOff, today);
/* 一次性任务逾期后补做：记录在实际完成日 */
const overdueTask = mkTask({ title: '前天的作业', points: 20, date: U.addDays(today, -2) });
st.tasks.push(overdueTask);
Logic.completeTask(st, overdueTask, today);
eq('补做记在今天', Logic.earnedOn(st, today), 60);

/* ---------------- 4. 连击加成 ---------------- */
section('连击加成（温和，不清零）');
const st2 = Store.initialState();
const d40 = dailyTask(40);
st2.tasks.push(d40);
[3, 2, 1].forEach(d => Logic.completeTask(st2, d40, U.addDays(today, -d)));
eq('连续天数', Logic.streakInfo(st2).days, 3);
eq('加成百分比 5%/天', Logic.bonusPercent(st2, today), 15);
const rec2 = Logic.completeTask(st2, d40, today);
eq('加成后总分', rec2.points, 46);
eq('加成明细(基础)', rec2.base, 40);
eq('加成明细(加分)', rec2.bonus, 6);
const manualSum = st2.completions.filter(c => !c.deleted).reduce((s, c) => s + c.points, 0);
eq('累计获得=各条之和', Logic.earnedTotal(st2), manualSum);
eq('打卡天数记录', Object.keys(Logic.streakInfo(st2).activeDates).length, 4);
/* 加成上限 */
const st3 = Store.initialState();
const d10 = dailyTask(40);
st3.tasks.push(d10);
for (let i = 1; i <= 30; i++) Logic.completeTask(st3, d10, U.addDays(today, -i));
eq('加成封顶 +50%', Logic.bonusPercent(st3, today), 50);
eq('封顶后总分', Logic.completeTask(st3, d10, today).points, 60);
eq('最长连续记录', Logic.streakInfo(st3).best >= 30, true);
/* 断签：不清零历史，只是连续天数重算 */
const st4 = Store.initialState();
const d41 = dailyTask(40);
st4.tasks.push(d41);
Logic.completeTask(st4, d41, U.addDays(today, -3));
eq('断签后连续天数为 0', Logic.streakInfo(st4).days, 0);
eq('断签后加成归零', Logic.bonusPercent(st4, today), 0);
eq('断签那天仍在最长记录里', Logic.streakInfo(st4).best, 1);
/* 关掉连击 */
const st5b = Store.initialState();
st5b.settings.streak.enabled = false;
eq('可关闭连击加成', Logic.bonusPercent(st5b, today), 0);

/* ---------------- 5. 重复任务逐日完成 ---------------- */
section('重复任务逐日完成');
const st5 = Store.initialState();
const rep = mkTask({ title: '背单词', points: 15, repeat: { type: 'daily' }, date: U.addDays(today, -10) });
st5.tasks.push(rep);
const r1 = Logic.completeTask(st5, rep, U.addDays(today, -1));
const r2 = Logic.completeTask(st5, rep, today);
eq('两天各一条记录', st5.completions.length, 2);
eq('昨天 15 分', r1.points, 15);
eq('今天带 5% 连击 = 16 分', r2.points, 16);
eq('两天得分', Logic.earnedBetween(st5, U.addDays(today, -1), today), 31);
ok('昨天已完成', !!Logic.completionOf(st5, rep, U.addDays(today, -1)));
ok('重复任务 key 含日期', Logic.completionOf(st5, rep, today).id === rep.id + '@' + today);
eq('明天的重复实例独立未完成', !!Logic.completionOf(st5, rep, U.addDays(today, 1)), false);
/* until 之后不再产生实例 */
const repUntil = mkTask({ title: '短期', points: 10, repeat: { type: 'daily', until: today }, date: U.addDays(today, -3) });
st5.tasks.push(repUntil);
eq('until 后无实例', Logic.dayItems(st5, U.addDays(today, 1)).items.filter(i => i.task.id === repUntil.id).length, 0);

/* ---------------- 6. 番茄钟 ---------------- */
section('番茄钟积分');
const st6 = Store.initialState();
const p1 = Logic.addPomodoro(st6, { minutes: 25, type: 'focus' });
eq('专注段 +5 分', p1.points, 5);
eq('番茄钟计入当日', Logic.earnedOn(st6, today), 5);
eq('番茄钟不产生打卡日以外的分', Logic.earnedOn(st6, U.addDays(today, -1)), 0);
eq('番茄计数', Logic.pomodoroOn(st6, today).count, 1);
Logic.addPomodoro(st6, { minutes: 5, type: 'break' });
eq('休息段不给分', Logic.earnedOn(st6, today), 5);
eq('休息段不计时长', Logic.minutesOn(st6, today), 25);
st6.settings.pomodoro.awardEnabled = false;
eq('关闭奖励后 0 分', Logic.addPomodoro(st6, { minutes: 25 }).points, 0);
const st6b = Store.initialState();
st6b.settings.pomodoro.award = 12;
eq('奖励分值可自定义', Logic.addPomodoro(st6b, { minutes: 25 }).points, 12);

/* ---------------- 7. 等级 ---------------- */
section('等级与经验');
const set = Store.defaultSettings();
eq('0 分是 1 级', Logic.levelInfo(0, set).level, 1);
eq('差 1 分还是 1 级', Logic.levelInfo(499, set).level, 1);
eq('500 分升 2 级', Logic.levelInfo(500, set).level, 2);
eq('2 级标题', Logic.levelInfo(500, set).title, '起步');
eq('500 分时本级进度 0', Logic.levelInfo(500, set).progress, 0);
eq('2 级升 3 级需 600', Logic.levelInfo(500, set).need, 600);
eq('1100 分升 3 级', Logic.levelInfo(1100, set).level, 3);
eq('3 级升 4 级需 700', Logic.levelInfo(1100, set).need, 700);
eq('1400 分进度 300/700', U.round(Logic.levelInfo(1400, set).progress, 4), U.round(300 / 700, 4));
eq('下一级门槛 1800', Logic.levelInfo(1400, set).nextAt, 1800);
eq('99999 分仍是传说前缀标题', Logic.levelInfo(99999, set).title.indexOf('传说') === 0, true);
const custom = Object.assign({}, set, { levelBase: 100, levelGrowth: 0 });
eq('自定义升级门槛', Logic.levelInfo(100, custom).level, 2);
eq('自定义后每级固定 100', Logic.levelInfo(100, custom).need, 100);

/* ---------------- 8. 收支与奖励商店 ---------------- */
section('积分收支与商店');
const st7 = Store.initialState();
const t40 = mkTask({ title: '写作业', points: 40 });
st7.tasks.push(t40);
Logic.completeTask(st7, t40, today);
st7.redemptions.push({ id: 'r1', rewardId: 'rw-milktea', name: '一杯奶茶', cost: 200, at: U.now(), date: today, updatedAt: U.now(), deleted: false });
const tot = Logic.totals(st7);
eq('累计获得', tot.earned, 40);
eq('已花费', tot.spent, 200);
eq('可用（可为负）', tot.available, -160);
st7.redemptions[0].deleted = true;
eq('撤销兑换后可用恢复', Logic.totals(st7).available, 40);

/* ---------------- 9. 周报 ---------------- */
section('周报与统计');
const st8 = Store.initialState();
const d40b = dailyTask(40);
st8.tasks.push(d40b);
const ws = U.weekStartOf(today, 1);
[0, 1, 2, 3].forEach(i => Logic.completeTask(st8, d40b, U.addDays(ws, i)));
const friday = U.addDays(ws, 4);
const wr = Logic.weekReport(st8, friday);
const weekSum = st8.completions.filter(c => !c.deleted).reduce((s, c) => s + c.points, 0);
eq('周起点为周一', wr.start, ws);
eq('周终点为周日', wr.end, U.addDays(ws, 6));
eq('本周得分=各条之和', wr.points, weekSum);
eq('周目标 1500', wr.goal, 1500);
eq('完成率', U.round(wr.rate, 4), U.round(weekSum / 1500, 4));
eq('剩余目标', wr.remain, 1500 - weekSum);
eq('日均', wr.avg, Math.round(weekSum / 7));
eq('每日序列 7 天', wr.days.length, 7);
eq('每日序列之和=周总分', wr.days.reduce((s, d) => s + d.points, 0), weekSum);
eq('最佳日是最后完成那天', wr.best.date, U.addDays(ws, 3));
eq('与上周对比', wr.prevPoints, 0);
eq('环比差值', wr.delta, weekSum);
/* 上周有分时的环比 */
const wr2 = Logic.weekReport(st8, friday);
ok('周报可重复调用', wr2.points === wr.points);
const dg = Logic.dailyGoal(st8);
eq('每日目标自动 = 1500/7', dg, 214);
st8.settings.dailyGoal = 300;
eq('每日目标可手填', Logic.dailyGoal(st8), 300);

/* ---------------- 10. 视图数据 ---------------- */
section('视图数据');
const st9 = Store.initialState();
const timed = mkTask({ title: '早课', points: 30, date: today, time: '08:00' });
const late = mkTask({ title: '晚自习', points: 30, date: today, time: '19:30' });
const undated = mkTask({ title: '想做的事' });
const overdueT = mkTask({ title: '昨天的作业', points: 20, date: U.addDays(today, -2) });
const daily2 = mkTask({ title: '每日单词', points: 15, repeat: { type: 'daily' }, date: U.addDays(today, -5) });
st9.tasks.push(timed, late, undated, overdueT, daily2);
const di = Logic.dayItems(st9, today);
eq('今日任务数（含重复、不含无日期）', di.items.length, 3);
eq('逾期单独列出', di.overdue.length, 1);
eq('今日按时间排序', di.items[0].task.title, '早课');
eq('无日期任务不进今日', di.items.some(i => i.task.title === '想做的事'), false);
eq('明天的今日列表只含重复任务', Logic.dayItems(st9, U.addDays(today, 1)).items.length, 1);
eq('今日计划总分', di.items.reduce((s, i) => s + i.task.points, 0), 75);
const heat = Logic.heatmap(st9, 12, today);
eq('热力图 12 列', heat.cols.length, 12);
eq('热力图每列 7 天', heat.cols[0].length, 7);
eq('热力图起点是周一', U.weekday(heat.start), 1);
const cats = Logic.categoryStats(st9, U.addDays(today, -30), today);
eq('分类统计可算出', Array.isArray(cats), true);
const all = Logic.allTasks(st9, {});
eq('清单含全部任务', all.length, 5);
eq('清单筛选重复任务', Logic.allTasks(st9, { onlyRepeat: true }).length, 1);
eq('清单筛选无日期', Logic.allTasks(st9, { onlyUndated: true }).length, 1);
eq('清单按关键字', Logic.allTasks(st9, { keyword: '单词' }).length, 1);
eq('下次出现日期', Logic.nextDate(st9, daily2, today), today);
const occ = Logic.occurrencesBetween(st9, today, U.addDays(today, 6));
ok('未来 7 天实例数 >= 8', occ.length >= 8, occ.length);
eq('分类统计字段', Logic.categoryStats(st9, U.addDays(today, -30), today).every(c => c.name && c.color), true);

/* ---------------- 11. 同步合并（Gist） ---------------- */
section('同步合并（Gist）');
const recent = new Date(Date.now() - 3600e3).toISOString();
const newer = new Date().toISOString();
const local = Store.initialState();
const remote = Store.initialState();
const ta = mkTask({ id: 'task-a', title: '本地版', points: 10, updatedAt: recent });
const ta2 = Object.assign({}, ta, { title: '云端版', points: 99, updatedAt: newer });
const tb = mkTask({ id: 'task-b', title: '只在云端', points: 20, updatedAt: newer });
const tc = mkTask({ id: 'task-c', title: '本地已删除', points: 5, updatedAt: newer, deleted: true });
local.tasks.push(ta, tc);
remote.tasks.push(ta2, tb);
local.settings.weeklyGoal = 1000; local.settings.updatedAt = recent;
remote.settings.weeklyGoal = 2000; remote.settings.updatedAt = newer;
const merged = Store.mergeStates(local, remote);
eq('任务取并集', JSON.stringify(merged.tasks.map(t => t.id).sort()), JSON.stringify(['task-a', 'task-b', 'task-c']));
eq('同 id 取较新标题', merged.tasks.find(t => t.id === 'task-a').title, '云端版');
eq('同 id 取较新分值', merged.tasks.find(t => t.id === 'task-a').points, 99);
eq('删除墓碑保留', merged.tasks.find(t => t.id === 'task-c').deleted, true);
eq('设置取较新', merged.settings.weeklyGoal, 2000);
eq('合并保留本地设备号', merged.meta.device, local.meta.device);
const again = Store.mergeStates(merged, remote);
eq('合并幂等', JSON.stringify(again.tasks.map(t => t.id).sort()), JSON.stringify(['task-a', 'task-b', 'task-c']));
const payload = Store.toPayload();
eq('序列化标识', payload.app, 'study-points-schedule');
ok('反序列化', !!Store.fromPayload(JSON.parse(JSON.stringify(payload))));
eq('反序列化取到 state', !!Store.fromPayload(payload).settings, true);
eq('裸数据也能导入', !!Store.fromPayload({ settings: {}, tasks: [] }), true);
const old = Store.initialState();
old.tasks.push(mkTask({ id: 'old-del', deleted: true, updatedAt: '2020-01-01T00:00:00.000Z' }));
eq('过期墓碑被清理', Store.normalize(old).tasks.filter(t => t.id === 'old-del').length, 0);
const keepDel = Store.initialState();
keepDel.tasks.push(mkTask({ id: 'new-del', deleted: true, updatedAt: newer }));
eq('近期墓碑保留', Store.normalize(keepDel).tasks.filter(t => t.id === 'new-del').length, 1);

/* ---------------- 12. 默认数据 ---------------- */
section('默认数据');
const def = Store.initialState();
eq('默认周目标', def.settings.weeklyGoal, 1500);
eq('默认分类数', def.categories.length, 5);
ok('分类含青协', def.categories.some(c => c.name === '青协事务'));
ok('分类含编程', def.categories.some(c => c.name === '编程与技术'));
ok('模板含背单词', def.templates.some(t => t.name === '背单词'));
ok('模板带分值', def.templates.every(t => t.points > 0));
ok('奖励含奶茶 200 分', def.rewards.some(r => r.name === '一杯奶茶' && r.cost === 200));
eq('初始无任务（不留假数据）', def.tasks.length, 0);
eq('番茄默认 25/5', def.settings.pomodoro.focus + '/' + def.settings.pomodoro.brk, '25/5');
eq('番茄默认 +5 分', def.settings.pomodoro.award, 5);
eq('提醒默认 8:00 / 21:00', def.settings.reminders.morning + ' / ' + def.settings.reminders.evening, '08:00 / 21:00');
eq('连击默认 +5%/天 上限 50%', def.settings.streak.perDayPercent + ' / ' + def.settings.streak.capPercent, '5 / 50');

console.log('\n———————————————————————');
console.log(fail === 0 ? `全部通过：${pass} 项` : `通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail === 0 ? 0 : 1);
