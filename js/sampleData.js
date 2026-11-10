(function (global) {
  'use strict';

  const IST = global.Tracker && global.Tracker.IST ? global.Tracker.IST : require('./ist.js');
  const Routine = global.Tracker && global.Tracker.Routine ? global.Tracker.Routine : require('./routine.js');

  const SAMPLE_NOTES_WEEKDAY = [
    'Pitched 3 dental clinics in Austin; 1 asked for a live mobile mockup.',
    'Good energy on calls. Struggled with gatekeepers on roofing leads.',
    'Shipped hero redesign for plumber demo in 30 min build block.',
    'College lab ran late; squeezed studies in before 9 PM shutdown.',
    '2 positive replies from Ohio HVAC owners—preparing custom demos tonight.',
    'Slightly tired on bus nap, still hit workout PR and kept phone discipline.',
    'Clean 100% execution. Prepped 30 fresh US Google Maps leads for tomorrow.',
    'Missed 4 AM by 14 mins; felt rushed during first 10 calls.',
    'Rewrote cold-call opener: asking about Google Business Profile got more convos.',
    'Built reusable Tailwind/HTML template for local landscaping demo sites.',
  ];

  const SAMPLE_NOTES_WEEKEND = [
    'Deep weekend build: finished 2 full responsive demo sites for US roofers.',
    '4 AM calls went smoothly; spent afternoon polishing portfolio & case studies.',
    'Built interactive quote calculator component for dental & auto-shop demos.',
    'Reviewed semester DBMS notes in the evening after 7h demo-site sprint.',
  ];

  function createSampleState(todayIST = IST.getTodayIST()) {
    const days = {};
    const totalHistoryDays = 35; // Covers ~5 weeks so Month, Prev Month, Last Week & This Week have rich data

    for (let offset = -totalHistoryDays; offset <= 0; offset++) {
      const dateStr = IST.addDaysIST(todayIST, offset);
      const routine = Routine.getRoutineForDate(dateStr);
      const blocks = routine.blocks;
      const isToday = offset === 0;
      const idx = offset + totalHistoryDays; // 0..35

      // Deterministic pseudo-random helper for consistent, natural-looking stats
      const seed = (idx * 37 + 13) % 100;

      // Determine wake time: mostly hitting 4:00 AM target, occasional slip
      let wakeTime = '04:00';
      let hit4AM = true;
      if (!isToday) {
        if (idx === 6 || idx === 17 || idx === 25) {
          wakeTime = idx === 17 ? '04:22' : '04:14';
          hit4AM = false;
        } else if (seed % 4 === 0) {
          wakeTime = '04:02';
        } else if (seed % 5 === 0) {
          wakeTime = '03:58';
        } else if (seed % 3 === 0) {
          wakeTime = '04:04';
        }
      } else {
        wakeTime = '04:00';
      }

      const sleepTime = isToday ? '' : (seed % 7 === 0 ? '21:48' : '21:30');

      // Completion pattern
      const blockStatus = {};
      if (isToday) {
        // Leave evening blocks unchecked so user sees Today in progress and can tick live
        const morningDoneIds = new Set([
          'wake', 'lead_calls', 'workout', 'morning_chill',
          routine.isWeekend ? 'weekend_build_am' : 'bus_sleep',
          routine.isWeekend ? 'lunch_rest' : 'college',
        ]);
        for (const b of blocks) {
          if (morningDoneIds.has(b.id)) {
            const stamp = b.id === 'wake' ? '04:01'
              : b.id === 'lead_calls' ? '05:30'
              : b.id === 'workout' ? '06:15'
              : b.id === 'morning_chill' ? '07:42'
              : b.id === 'bus_sleep' ? '08:58'
              : b.id === 'college' ? '17:55'
              : b.id === 'weekend_build_am' ? '12:28'
              : '13:30';
            blockStatus[b.id] = { done: true, completedAt: stamp };
          }
        }
      } else {
        // Recent week higher completion than earlier weeks so improvement trend is realistic
        const isCurrentOrLastWeek = offset >= -13;
        const targetCompletionRatio = !hit4AM
          ? 0.67
          : idx % 9 === 0
            ? 0.75
            : isCurrentOrLastWeek && idx % 4 !== 0
              ? 1.0
              : 0.84 + (seed % 16) / 100;

        const targetDone = Math.min(blocks.length, Math.max(5, Math.round(blocks.length * targetCompletionRatio)));
        for (let i = 0; i < blocks.length; i++) {
          const b = blocks[i];
          // If partially done, skip 1-2 late evening blocks realistically
          const shouldComplete = i < targetDone;
          if (shouldComplete) {
            const fallbackTime = b.timeLabel.includes('4:00') ? wakeTime
              : b.id === 'lead_calls' ? '05:31'
              : b.id === 'workout' ? '06:14'
              : b.id === 'morning_chill' ? '07:45'
              : b.id === 'bus_sleep' ? '08:57'
              : b.id === 'college' ? '18:05'
              : b.id === 'freshen_up' ? '18:25'
              : b.id === 'weekend_build_am' ? '12:30'
              : b.id === 'lunch_rest' ? '13:28'
              : b.id === 'weekend_build_pm' ? '17:25'
              : b.id === 'dinner' ? '19:26'
              : b.id === 'studies' ? '20:32'
              : b.id === 'build' ? '21:00'
              : b.id === 'shutdown' ? '21:14'
              : '21:30';
            blockStatus[b.id] = { done: true, completedAt: fallbackTime };
          }
        }
      }

      // Scale up calls & focus subtly in the most recent week to show genuine momentum
      const momentumBoost = offset >= -6 ? 1.2 : 1.0;
      const made = isToday
        ? 26
        : Math.round((16 + (seed % 13)) * momentumBoost);
      const conversations = isToday
        ? 8
        : Math.max(2, Math.round(made * (0.24 + (seed % 10) * 0.01)));
      const demosSent = isToday
        ? 3
        : Math.max(1, Math.round(conversations * 0.36));
      const replies = isToday
        ? 2
        : Math.max(0, Math.round(demosSent * 0.6));

      const callsMin = blockStatus.lead_calls ? (hit4AM ? 80 : 65) : 0;
      const workoutMin = blockStatus.workout ? (routine.isWeekend ? 50 : 45) : 0;
      const studiesMin = isToday
        ? 0
        : (blockStatus.studies ? 60 + (seed % 3) * 10 : 25);
      let buildMin = 0;
      if (routine.isWeekend) {
        if (blockStatus.weekend_build_am) buildMin += 240;
        if (blockStatus.weekend_build_pm) buildMin += 180;
        if (isToday && !blockStatus.weekend_build_pm) buildMin = 210;
      } else {
        buildMin = isToday ? 0 : (blockStatus.build ? 30 + (offset >= -6 ? 15 : 0) : 0);
      }

      const notePool = routine.isWeekend ? SAMPLE_NOTES_WEEKEND : SAMPLE_NOTES_WEEKDAY;
      const note = isToday
        ? 'Crushed morning US outreach: 26 calls, 3 demo links sent. Evening study + build left to finish.'
        : (!hit4AM ? 'Woke up late, missed full lead-call rhythm. Need earlier sleep at 9:30 PM.' : notePool[idx % notePool.length]);

      days[dateStr] = Routine.normalizeDayRecord(dateStr, {
        date: dateStr,
        wakeTime,
        sleepTime,
        blocks: blockStatus,
        calls: {
          made,
          conversations,
          demosSent,
          replies,
        },
        minutes: {
          calls: callsMin,
          workout: workoutMin,
          studies: studiesMin,
          build: buildMin,
        },
        note,
      });
    }

    return {
      version: 1,
      isSampleData: true,
      sampleCleared: false,
      days,
    };
  }

  const api = {
    createSampleState,
  };

  global.Tracker = global.Tracker || {};
  global.Tracker.SampleData = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);

