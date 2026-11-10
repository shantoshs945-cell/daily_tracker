(function (global) {
  'use strict';

  const IST = global.Tracker && global.Tracker.IST ? global.Tracker.IST : require('./ist.js');

  const WEEKDAY_BLOCKS = [
    {
      id: 'wake',
      timeLabel: '4:00 AM',
      title: 'Wake up',
      detail: '4:00 AM target · hydrate & boot up',
      category: 'wake',
      minuteField: null,
      defaultMinutes: 0,
    },
    {
      id: 'lead_calls',
      timeLabel: '4:10 – 5:30 AM',
      title: 'Lead calls (US afternoon)',
      detail: 'Cold calls & pitch demo websites to local businesses',
      category: 'calls',
      minuteField: 'calls',
      defaultMinutes: 80,
    },
    {
      id: 'workout',
      timeLabel: '5:30 – 6:15 AM',
      title: 'Workout',
      detail: 'Morning training & mobility',
      category: 'workout',
      minuteField: 'workout',
      defaultMinutes: 45,
    },
    {
      id: 'morning_chill',
      timeLabel: '6:15 – 7:45 AM',
      title: 'Relaxed time, breakfast, get ready',
      detail: 'Unwind, eat well & pack up for college',
      category: 'personal',
      minuteField: null,
      defaultMinutes: 0,
    },
    {
      id: 'bus_sleep',
      timeLabel: '8:00 – 9:00 AM',
      title: 'Bus (sleep)',
      detail: 'Commute power nap on the bus',
      category: 'personal',
      minuteField: null,
      defaultMinutes: 0,
    },
    {
      id: 'college',
      timeLabel: '9:00 AM – Evening',
      title: 'College',
      detail: 'CSE diploma classes & labs',
      category: 'college',
      minuteField: null,
      defaultMinutes: 0,
    },
    {
      id: 'freshen_up',
      timeLabel: '6:20 PM',
      title: 'Home, freshen up',
      detail: 'Reset after commute',
      category: 'personal',
      minuteField: null,
      defaultMinutes: 0,
    },
    {
      id: 'dinner',
      timeLabel: '6:50 – 7:30 PM',
      title: 'Dinner',
      detail: 'Evening meal away from screens',
      category: 'personal',
      minuteField: null,
      defaultMinutes: 0,
    },
    {
      id: 'studies',
      timeLabel: '7:30 – 8:30 PM',
      title: 'College studies',
      detail: 'Assignments, coursework & exam prep',
      category: 'studies',
      minuteField: 'studies',
      defaultMinutes: 60,
    },
    {
      id: 'build',
      timeLabel: '8:30 – 9:00 PM',
      title: 'Build or learn (30 min)',
      detail: 'Demo sites, web dev skills & client polish',
      category: 'build',
      minuteField: 'build',
      defaultMinutes: 30,
    },
    {
      id: 'shutdown',
      timeLabel: '9:00 – 9:15 PM',
      title: 'Night shutdown',
      detail: 'Tomorrow’s call list, bag, gym clothes',
      category: 'personal',
      minuteField: null,
      defaultMinutes: 0,
    },
    {
      id: 'sleep',
      timeLabel: '9:30 PM',
      title: 'Sleep',
      detail: 'Lights out for 4:00 AM recovery',
      category: 'wake',
      minuteField: null,
      defaultMinutes: 0,
    },
  ];

  const WEEKEND_BLOCKS = [
    {
      id: 'wake',
      timeLabel: '4:00 AM',
      title: 'Wake up',
      detail: 'Same 4:00 AM standard on weekends',
      category: 'wake',
      minuteField: null,
      defaultMinutes: 0,
    },
    {
      id: 'lead_calls',
      timeLabel: '4:10 – 5:30 AM',
      title: 'Lead calls (US afternoon)',
      detail: 'Follow-ups & outreach to US local businesses',
      category: 'calls',
      minuteField: 'calls',
      defaultMinutes: 80,
    },
    {
      id: 'workout',
      timeLabel: '5:30 – 6:15 AM',
      title: 'Workout',
      detail: 'Morning training & mobility',
      category: 'workout',
      minuteField: 'workout',
      defaultMinutes: 45,
    },
    {
      id: 'morning_chill',
      timeLabel: '6:15 – 7:45 AM',
      title: 'Relaxed time, breakfast, get ready',
      detail: 'Refuel before deep weekend build sessions',
      category: 'personal',
      minuteField: null,
      defaultMinutes: 0,
    },
    {
      id: 'weekend_build_am',
      timeLabel: '8:00 AM – 12:30 PM',
      title: 'Long build block 1',
      detail: 'Demo websites & client deliverables',
      category: 'build',
      minuteField: 'build',
      defaultMinutes: 240,
    },
    {
      id: 'lunch_rest',
      timeLabel: '12:30 – 1:30 PM',
      title: 'Lunch & recharge',
      detail: 'Step away & reset energy',
      category: 'personal',
      minuteField: null,
      defaultMinutes: 0,
    },
    {
      id: 'weekend_build_pm',
      timeLabel: '1:30 – 5:30 PM',
      title: 'Long build block 2',
      detail: 'Projects, portfolio & pitching assets',
      category: 'build',
      minuteField: 'build',
      defaultMinutes: 210,
    },
    {
      id: 'dinner',
      timeLabel: '6:50 – 7:30 PM',
      title: 'Dinner',
      detail: 'Evening meal & break',
      category: 'personal',
      minuteField: null,
      defaultMinutes: 0,
    },
    {
      id: 'studies',
      timeLabel: '7:30 – 8:30 PM',
      title: 'College studies / revision',
      detail: 'Stay ahead on diploma subjects',
      category: 'studies',
      minuteField: 'studies',
      defaultMinutes: 60,
    },
    {
      id: 'shutdown',
      timeLabel: '9:00 – 9:15 PM',
      title: 'Night shutdown',
      detail: 'Tomorrow’s call list, bag, gym clothes',
      category: 'personal',
      minuteField: null,
      defaultMinutes: 0,
    },
    {
      id: 'sleep',
      timeLabel: '9:30 PM',
      title: 'Sleep',
      detail: 'Lights out for 4:00 AM recovery',
      category: 'wake',
      minuteField: null,
      defaultMinutes: 0,
    },
  ];

  const WAKE_MIN_MINUTES = 180; // 3:00 AM
  const WAKE_TARGET_MAX_MINUTES = 245; // 4:05 AM (5-min window for 4:00 AM target)

  function getRoutineForDate(dateStr) {
    const weekend = IST.isWeekendIST(dateStr);
    return {
      isWeekend: weekend,
      scheduleLabel: weekend ? 'Weekend Build Schedule' : 'Weekday College Schedule',
      blocks: weekend ? WEEKEND_BLOCKS : WEEKDAY_BLOCKS,
    };
  }

  function createEmptyDay(dateStr) {
    return {
      date: dateStr,
      wakeTime: '',
      sleepTime: '',
      blocks: {},
      calls: {
        made: 0,
        conversations: 0,
        demosSent: 0,
        replies: 0,
      },
      minutes: {
        calls: 0,
        workout: 0,
        studies: 0,
        build: 0,
      },
      note: '',
    };
  }

  function toNonNegativeInt(val, max = 100000) {
    const n = Number(val);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(Math.round(n), max);
  }

  function sanitizeTimeStr(val) {
    if (typeof val !== 'string') return '';
    const trimmed = val.trim();
    const mins = IST.timeToMinutes(trimmed);
    if (mins === null) return '';
    return IST.minutesToTime24(mins);
  }

  function normalizeDayRecord(dateStr, raw) {
    const base = createEmptyDay(dateStr);
    if (!raw || typeof raw !== 'object') return base;

    base.wakeTime = sanitizeTimeStr(raw.wakeTime);
    base.sleepTime = sanitizeTimeStr(raw.sleepTime);

    if (raw.blocks && typeof raw.blocks === 'object') {
      for (const [blockId, entry] of Object.entries(raw.blocks)) {
        if (entry && typeof entry === 'object' && entry.done) {
          base.blocks[blockId] = {
            done: true,
            completedAt: sanitizeTimeStr(entry.completedAt),
          };
        }
      }
    }

    if (raw.calls && typeof raw.calls === 'object') {
      base.calls.made = toNonNegativeInt(raw.calls.made, 5000);
      base.calls.conversations = toNonNegativeInt(raw.calls.conversations, 5000);
      base.calls.demosSent = toNonNegativeInt(raw.calls.demosSent, 5000);
      base.calls.replies = toNonNegativeInt(raw.calls.replies, 5000);
    }

    if (raw.minutes && typeof raw.minutes === 'object') {
      base.minutes.calls = toNonNegativeInt(raw.minutes.calls, 1440);
      base.minutes.workout = toNonNegativeInt(raw.minutes.workout, 1440);
      base.minutes.studies = toNonNegativeInt(raw.minutes.studies, 1440);
      base.minutes.build = toNonNegativeInt(raw.minutes.build, 1440);
    }

    if (typeof raw.note === 'string') {
      base.note = raw.note.slice(0, 2000);
    }

    return base;
  }

  function is4AMTargetHit(wakeTime) {
    const mins = IST.timeToMinutes(wakeTime);
    if (mins === null) return false;
    return mins >= WAKE_MIN_MINUTES && mins <= WAKE_TARGET_MAX_MINUTES;
  }

  function computeDaySummary(dateStr, dayRecord) {
    const day = normalizeDayRecord(dateStr, dayRecord);
    const routine = getRoutineForDate(dateStr);
    const totalBlocks = routine.blocks.length;
    let completedBlocks = 0;

    for (const block of routine.blocks) {
      if (day.blocks[block.id] && day.blocks[block.id].done) {
        completedBlocks += 1;
      }
    }

    const missedBlocks = Math.max(0, totalBlocks - completedBlocks);
    const dailyScore = totalBlocks > 0 ? Math.round((completedBlocks / totalBlocks) * 100) : 0;
    const wakeMinutes = IST.timeToMinutes(day.wakeTime);
    const sleepMinutes = IST.timeToMinutes(day.sleepTime);
    const hit4AM = is4AMTargetHit(day.wakeTime);
    const hasWorkout = Boolean(day.blocks.workout && day.blocks.workout.done) || day.minutes.workout > 0;
    const hasAnyActivity =
      completedBlocks > 0 ||
      Boolean(day.wakeTime) ||
      Boolean(day.sleepTime) ||
      day.calls.made > 0 ||
      day.calls.conversations > 0 ||
      day.calls.demosSent > 0 ||
      day.calls.replies > 0 ||
      day.minutes.calls > 0 ||
      day.minutes.workout > 0 ||
      day.minutes.studies > 0 ||
      day.minutes.build > 0 ||
      day.note.trim().length > 0;

    return {
      date: dateStr,
      isWeekend: routine.isWeekend,
      scheduleLabel: routine.scheduleLabel,
      totalBlocks,
      completedBlocks,
      missedBlocks,
      dailyScore,
      wakeTime: day.wakeTime,
      wakeMinutes,
      sleepTime: day.sleepTime,
      sleepMinutes,
      hit4AM,
      hasWorkout,
      hasAnyActivity,
      calls: day.calls,
      minutes: day.minutes,
      note: day.note,
    };
  }

  const api = {
    WEEKDAY_BLOCKS,
    WEEKEND_BLOCKS,
    WAKE_TARGET_MAX_MINUTES,
    getRoutineForDate,
    createEmptyDay,
    normalizeDayRecord,
    is4AMTargetHit,
    computeDaySummary,
  };

  global.Tracker = global.Tracker || {};
  global.Tracker.Routine = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);

