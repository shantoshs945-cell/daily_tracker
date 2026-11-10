(function (global) {
  'use strict';

  const IST = global.Tracker && global.Tracker.IST ? global.Tracker.IST : require('./ist.js');
  const Routine = global.Tracker && global.Tracker.Routine ? global.Tracker.Routine : require('./routine.js');

  function getEarliestActiveDate(daysMap) {
    if (!daysMap || typeof daysMap !== 'object') return null;
    const keys = Object.keys(daysMap).filter((k) => IST.isValidDateStr(k)).sort();
    for (const dateStr of keys) {
      const summary = Routine.computeDaySummary(dateStr, daysMap[dateStr]);
      if (summary.hasAnyActivity) {
        return dateStr;
      }
    }
    return null;
  }

  function aggregatePeriod(daysMap, dateList, todayIST, options = {}) {
    const earliestActive = options.earliestActive !== undefined
      ? options.earliestActive
      : getEarliestActiveDate(daysMap);
    const singleDayMode = Boolean(options.singleDayMode);

    let totalCalls = 0;
    let totalConversations = 0;
    let totalDemosSent = 0;
    let totalReplies = 0;
    let callsMinutes = 0;
    let workoutMinutes = 0;
    let studiesMinutes = 0;
    let buildMinutes = 0;
    let workoutsDone = 0;

    let completedBlocks = 0;
    let missedBlocks = 0;
    let totalBlocks = 0;

    let wakeMinutesSum = 0;
    let wakeLoggedCount = 0;
    let daysHit4AM = 0;

    let activeDayScoreSum = 0;
    let activeDaysCount = 0;
    let loggedDaysCount = 0;

    const perDay = [];

    for (const dateStr of dateList) {
      const summary = Routine.computeDaySummary(dateStr, daysMap ? daysMap[dateStr] : null);
      const isFuture = dateStr > todayIST;
      const isBeforeStart = !earliestActive || dateStr < earliestActive;
      const isElapsedActive = singleDayMode || (!isFuture && !isBeforeStart);

      if (summary.hasAnyActivity) {
        loggedDaysCount += 1;
      }

      // Accumulate explicit metrics regardless (future days are empty anyway)
      totalCalls += summary.calls.made;
      totalConversations += summary.calls.conversations;
      totalDemosSent += summary.calls.demosSent;
      totalReplies += summary.calls.replies;

      callsMinutes += summary.minutes.calls;
      workoutMinutes += summary.minutes.workout;
      studiesMinutes += summary.minutes.studies;
      buildMinutes += summary.minutes.build;

      if (summary.hasWorkout) workoutsDone += 1;

      if (summary.wakeMinutes !== null) {
        wakeMinutesSum += summary.wakeMinutes;
        wakeLoggedCount += 1;
      }
      if (summary.hit4AM) {
        daysHit4AM += 1;
      }

      if (isElapsedActive) {
        completedBlocks += summary.completedBlocks;
        missedBlocks += summary.missedBlocks;
        totalBlocks += summary.totalBlocks;
        activeDayScoreSum += summary.dailyScore;
        activeDaysCount += 1;
      }

      perDay.push({
        ...summary,
        isFuture,
        isElapsedActive,
      });
    }

    const hoursBuilt = Number((buildMinutes / 60).toFixed(1));
    const hoursStudied = Number((studiesMinutes / 60).toFixed(1));
    const hoursCalls = Number((callsMinutes / 60).toFixed(1));
    const hoursWorkout = Number((workoutMinutes / 60).toFixed(1));
    const totalFocusMinutes = callsMinutes + workoutMinutes + studiesMinutes + buildMinutes;

    const avgWakeMinutes = wakeLoggedCount > 0 ? Math.round(wakeMinutesSum / wakeLoggedCount) : null;
    const avgWakeLabel = avgWakeMinutes !== null ? IST.minutesToTime12(avgWakeMinutes) : '—';

    const avgDailyScore = activeDaysCount > 0 ? Math.round(activeDayScoreSum / activeDaysCount) : 0;
    const wakeConsistencyPct = activeDaysCount > 0 ? Math.round((daysHit4AM / activeDaysCount) * 100) : 0;

    return {
      totalCalls,
      totalConversations,
      totalDemosSent,
      totalReplies,
      callsMinutes,
      workoutMinutes,
      studiesMinutes,
      buildMinutes,
      totalFocusMinutes,
      hoursBuilt,
      hoursStudied,
      hoursCalls,
      hoursWorkout,
      workoutsDone,
      completedBlocks,
      missedBlocks,
      totalBlocks,
      wakeLoggedCount,
      daysHit4AM,
      avgWakeMinutes,
      avgWakeLabel,
      avgDailyScore,
      wakeConsistencyPct,
      activeDaysCount,
      loggedDaysCount,
      periodLength: dateList.length,
      perDay,
    };
  }

  function computeStreaks(daysMap, todayIST) {
    const earliest = getEarliestActiveDate(daysMap);
    if (!earliest || earliest > todayIST) {
      return {
        wake4AM: { current: 0, best: 0 },
        allBlocks: { current: 0, best: 0 },
      };
    }

    let best4AM = 0;
    let run4AM = 0;
    let bestAll = 0;
    let runAll = 0;

    const totalDays = IST.diffDaysIST(earliest, todayIST) + 1;
    const summariesByDate = new Map();

    for (let i = 0; i < totalDays; i++) {
      const dateStr = IST.addDaysIST(earliest, i);
      const summary = Routine.computeDaySummary(dateStr, daysMap[dateStr]);
      summariesByDate.set(dateStr, summary);

      if (summary.hit4AM) {
        run4AM += 1;
        if (run4AM > best4AM) best4AM = run4AM;
      } else {
        run4AM = 0;
      }

      if (summary.dailyScore === 100 && summary.totalBlocks > 0) {
        runAll += 1;
        if (runAll > bestAll) bestAll = runAll;
      } else {
        runAll = 0;
      }
    }

    // Current 4 AM streak:
    // If today hits 4 AM, count backwards from today.
    // If today has NO wakeTime logged yet, preserve streak ending yesterday.
    // If today HAS a late wakeTime logged, current streak is 0.
    const todaySummary = summariesByDate.get(todayIST);
    let current4AM = 0;
    let cursor4AM = null;
    if (todaySummary && todaySummary.hit4AM) {
      cursor4AM = todayIST;
    } else if (todaySummary && !todaySummary.wakeTime) {
      cursor4AM = IST.addDaysIST(todayIST, -1);
    }

    while (cursor4AM && cursor4AM >= earliest) {
      const s = summariesByDate.get(cursor4AM);
      if (s && s.hit4AM) {
        current4AM += 1;
        cursor4AM = IST.addDaysIST(cursor4AM, -1);
      } else {
        break;
      }
    }

    // Current All-Blocks (100%) streak:
    // If today is 100%, count backwards from today.
    // Otherwise (today still in progress before sleep), preserve streak ending yesterday.
    let currentAll = 0;
    let cursorAll = todaySummary && todaySummary.dailyScore === 100
      ? todayIST
      : IST.addDaysIST(todayIST, -1);

    while (cursorAll && cursorAll >= earliest) {
      const s = summariesByDate.get(cursorAll);
      if (s && s.dailyScore === 100 && s.totalBlocks > 0) {
        currentAll += 1;
        cursorAll = IST.addDaysIST(cursorAll, -1);
      } else {
        break;
      }
    }

    return {
      wake4AM: { current: current4AM, best: best4AM },
      allBlocks: { current: currentAll, best: bestAll },
    };
  }

  function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
  }

  function computeComparison(daysMap, currentDates, prevDates, todayIST) {
    const earliestActive = getEarliestActiveDate(daysMap);
    const currAgg = aggregatePeriod(daysMap, currentDates, todayIST, { earliestActive });
    const prevAgg = aggregatePeriod(daysMap, prevDates, todayIST, { earliestActive });

    const metricDefs = [
      { key: 'calls', label: 'Calls Made', shortLabel: 'Calls', unit: '', decimals: 0, get: (a) => a.totalCalls },
      { key: 'conversations', label: 'Conversations', shortLabel: 'Convos', unit: '', decimals: 0, get: (a) => a.totalConversations },
      { key: 'demosSent', label: 'Demos Sent', shortLabel: 'Demos', unit: '', decimals: 0, get: (a) => a.totalDemosSent },
      { key: 'hoursBuilt', label: 'Hours Built', shortLabel: 'Build (h)', unit: 'h', decimals: 1, get: (a) => a.hoursBuilt },
      { key: 'hoursStudied', label: 'Hours Studied', shortLabel: 'Study (h)', unit: 'h', decimals: 1, get: (a) => a.hoursStudied },
      { key: 'workouts', label: 'Workouts', shortLabel: 'Workouts', unit: '', decimals: 0, get: (a) => a.workoutsDone },
      { key: 'wakeConsistency', label: '4 AM Consistency', shortLabel: '4 AM %', unit: '%', decimals: 0, get: (a) => a.wakeConsistencyPct },
      { key: 'avgDailyScore', label: 'Avg Daily Score', shortLabel: 'Avg Score', unit: '%', decimals: 0, get: (a) => a.avgDailyScore },
    ];

    let sumClampedPct = 0;
    let activeMetricsCount = 0;
    let improvedCount = 0;
    let flatCount = 0;
    let declinedCount = 0;
    let positiveMagnitude = 0;
    let negativeMagnitude = 0;

    const metrics = metricDefs.map((def) => {
      const prev = def.get(prevAgg);
      const curr = def.get(currAgg);
      const rawDelta = curr - prev;
      const delta = def.decimals > 0 ? Number(rawDelta.toFixed(def.decimals)) : Math.round(rawDelta);

      let pctChange = 0;
      if (prev > 0) {
        pctChange = Number((((curr - prev) / prev) * 100).toFixed(1));
      } else if (curr > 0) {
        pctChange = 100;
      }

      const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';

      if (prev > 0 || curr > 0) {
        const clamped = clamp(pctChange, -100, 100);
        sumClampedPct += clamped;
        activeMetricsCount += 1;
        if (clamped > 0) positiveMagnitude += clamped;
        if (clamped < 0) negativeMagnitude += Math.abs(clamped);
      }

      if (direction === 'up') improvedCount += 1;
      else if (direction === 'down') declinedCount += 1;
      else flatCount += 1;

      const pairMax = Math.max(prev, curr, 0);
      const normalizedPrev = pairMax > 0 ? Math.round((prev / pairMax) * 100) : 0;
      const normalizedCurr = pairMax > 0 ? Math.round((curr / pairMax) * 100) : 0;

      return {
        key: def.key,
        label: def.label,
        shortLabel: def.shortLabel,
        unit: def.unit,
        decimals: def.decimals,
        prev,
        curr,
        delta,
        pctChange,
        direction,
        normalizedPrev,
        normalizedCurr,
      };
    });

    const improvementScore = activeMetricsCount > 0
      ? Number((sumClampedPct / activeMetricsCount).toFixed(1))
      : 0;

    return {
      currAgg,
      prevAgg,
      metrics,
      improvementScore,
      improvedCount,
      flatCount,
      declinedCount,
      positiveMagnitude: Number(positiveMagnitude.toFixed(1)),
      negativeMagnitude: Number(negativeMagnitude.toFixed(1)),
      activeMetricsCount,
    };
  }

  const api = {
    getEarliestActiveDate,
    aggregatePeriod,
    computeStreaks,
    computeComparison,
  };

  global.Tracker = global.Tracker || {};
  global.Tracker.Metrics = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);

