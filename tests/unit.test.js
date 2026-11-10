const test = require('node:test');
const assert = require('node:assert/strict');

const IST = require('../js/ist.js');
const Routine = require('../js/routine.js');
const Metrics = require('../js/metrics.js');
const SampleData = require('../js/sampleData.js');
const Storage = require('../js/storage.js');

test('IST date and time conversions handle UTC midnight boundaries accurately', () => {
  // 2026-11-10 20:00:00 UTC is 2026-11-11 01:30:00 IST
  const utcEvening = new Date('2026-11-10T20:00:00Z');
  assert.equal(IST.getTodayIST(utcEvening), '2026-11-11');
  assert.equal(IST.getNowTimeIST(utcEvening), '01:30');

  // 2026-11-10 18:29:00 UTC is 2026-11-10 23:59:00 IST
  const justBeforeMidnightIST = new Date('2026-11-10T18:29:00Z');
  assert.equal(IST.getTodayIST(justBeforeMidnightIST), '2026-11-10');
  assert.equal(IST.getNowTimeIST(justBeforeMidnightIST), '23:59');
});

test('IST week and month calendar utilities compute Mon-Sun ranges properly', () => {
  // 2026-11-10 is Tuesday
  assert.equal(IST.getDayOfWeekIST('2026-11-10'), 2);
  assert.equal(IST.isWeekendIST('2026-11-10'), false);
  assert.equal(IST.isWeekendIST('2026-11-14'), true); // Sat
  assert.equal(IST.isWeekendIST('2026-11-15'), true); // Sun

  const mon = IST.getWeekStartMonIST('2026-11-15'); // Sunday -> Monday of same week
  assert.equal(mon, '2026-11-09');
  const weekDates = IST.getWeekDatesIST(mon);
  assert.deepEqual(weekDates, [
    '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12',
    '2026-11-13', '2026-11-14', '2026-11-15',
  ]);

  const nov2026 = IST.getMonthRangeIST(2026, 11);
  assert.equal(nov2026.daysInMonth, 30);
  // Nov 1, 2026 is Sunday -> Mon-indexed 6
  assert.equal(nov2026.firstDayMonIndex, 6);
});

test('Routine templates & daily score calculate weekday vs weekend correctly', () => {
  const weekday = Routine.getRoutineForDate('2026-11-10'); // Tue
  const weekend = Routine.getRoutineForDate('2026-11-14'); // Sat
  assert.equal(weekday.isWeekend, false);
  assert.equal(weekday.blocks.length, 12);
  assert.equal(weekend.isWeekend, true);
  assert.equal(weekend.blocks.length, 11);

  assert.equal(Routine.is4AMTargetHit('04:00'), true);
  assert.equal(Routine.is4AMTargetHit('04:05'), true);
  assert.equal(Routine.is4AMTargetHit('03:55'), true);
  assert.equal(Routine.is4AMTargetHit('04:06'), false);
  assert.equal(Routine.is4AMTargetHit(''), false);

  const day = Routine.createEmptyDay('2026-11-10');
  day.blocks.wake = { done: true, completedAt: '04:00' };
  day.blocks.lead_calls = { done: true, completedAt: '05:30' };
  day.blocks.workout = { done: true, completedAt: '06:15' };
  day.wakeTime = '04:02';
  const summary = Routine.computeDaySummary('2026-11-10', day);
  assert.equal(summary.completedBlocks, 3);
  assert.equal(summary.missedBlocks, 9);
  assert.equal(summary.dailyScore, 25);
  assert.equal(summary.hit4AM, true);
  assert.equal(summary.hasWorkout, true);
});

test('Metrics compute streaks, period aggregates, and comparison deltas accurately', () => {
  const today = '2026-11-10'; // Tue
  const days = {};

  // Build Last Week Mon-Wed (Nov 2,3,4) and This Week Mon-Tue (Nov 9,10)
  const makeFullDay = (dateStr, wakeTime, callsMade, buildMin) => {
    const routine = Routine.getRoutineForDate(dateStr);
    const blocks = {};
    for (const b of routine.blocks) {
      blocks[b.id] = { done: true, completedAt: '21:30' };
    }
    return {
      date: dateStr,
      wakeTime,
      sleepTime: '21:30',
      blocks,
      calls: { made: callsMade, conversations: 5, demosSent: 2, replies: 1 },
      minutes: { calls: 80, workout: 45, studies: 60, build: buildMin },
      note: 'Tracked day',
    };
  };

  days['2026-11-02'] = makeFullDay('2026-11-02', '04:00', 10, 30);
  days['2026-11-03'] = makeFullDay('2026-11-03', '04:00', 10, 30);
  days['2026-11-04'] = makeFullDay('2026-11-04', '04:20', 10, 30); // missed 4AM
  days['2026-11-09'] = makeFullDay('2026-11-09', '04:00', 25, 60);
  days['2026-11-10'] = makeFullDay('2026-11-10', '04:01', 25, 60);

  const streaks = Metrics.computeStreaks(days, today);
  assert.equal(streaks.wake4AM.current, 2);
  assert.equal(streaks.wake4AM.best, 2);
  assert.equal(streaks.allBlocks.current, 2);
  assert.equal(streaks.allBlocks.best, 3);

  const thisWeekDates = IST.getWeekDatesIST('2026-11-09');
  const lastWeekDates = IST.getWeekDatesIST('2026-11-02');
  const cmp = Metrics.computeComparison(days, thisWeekDates, lastWeekDates, today);

  const callsMetric = cmp.metrics.find((m) => m.key === 'calls');
  assert.equal(callsMetric.prev, 30);
  assert.equal(callsMetric.curr, 50);
  assert.equal(callsMetric.delta, 20);
  assert.equal(callsMetric.direction, 'up');

  const avgScoreMetric = cmp.metrics.find((m) => m.key === 'avgDailyScore');
  assert.equal(avgScoreMetric.curr, 100);
  assert.ok(cmp.improvementScore > 0);
});

test('Sample data and JSON export/import round-trip safely', () => {
  const sample = SampleData.createSampleState('2026-11-10');
  assert.equal(sample.isSampleData, true);
  assert.equal(Object.keys(sample.days).length, 36);

  const payload = Storage.buildExportPayload(sample, new Date('2026-11-10T10:00:00Z'));
  const jsonText = JSON.stringify(payload);
  const parsed = Storage.parseImportJson(jsonText);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.importedCount, 36);
  assert.equal(parsed.state.isSampleData, false);

  const badResult = Storage.parseImportJson('{ invalid json');
  assert.equal(badResult.ok, false);

  const emptyResult = Storage.parseImportJson('{}');
  assert.equal(emptyResult.ok, false);
});

