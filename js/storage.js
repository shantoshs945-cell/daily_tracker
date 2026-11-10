(function (global) {
  'use strict';

  const IST = global.Tracker && global.Tracker.IST ? global.Tracker.IST : require('./ist.js');
  const Routine = global.Tracker && global.Tracker.Routine ? global.Tracker.Routine : require('./routine.js');

  const STORAGE_KEY = 'ist_routine_tracker_v1';

  function createEmptyState() {
    return {
      version: 1,
      days: {},
    };
  }

  function sanitizeState(raw) {
    const clean = createEmptyState();

    if (raw && raw.days && typeof raw.days === 'object' && !Array.isArray(raw.days)) {
      for (const [dateStr, dayData] of Object.entries(raw.days)) {
        if (IST.isValidDateStr(dateStr)) {
          clean.days[dateStr] = Routine.normalizeDayRecord(dateStr, dayData);
        }
      }
    }
    return clean;
  }

  function loadState(storageObj = typeof localStorage !== 'undefined' ? localStorage : null) {
    if (!storageObj) {
      return createEmptyState();
    }

    try {
      const rawText = storageObj.getItem(STORAGE_KEY);
      if (!rawText) {
        return createEmptyState();
      }
      const parsed = JSON.parse(rawText);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid state payload');
      }
      // Clear legacy pre-seeded sample data if present from an earlier visit
      if (parsed.isSampleData) {
        const empty = createEmptyState();
        saveState(empty, storageObj);
        return empty;
      }
      return sanitizeState(parsed);
    } catch (_err) {
      return createEmptyState();
    }
  }

  function saveState(state, storageObj = typeof localStorage !== 'undefined' ? localStorage : null) {
    if (!storageObj) return false;
    try {
      storageObj.setItem(STORAGE_KEY, JSON.stringify(sanitizeState(state)));
      return true;
    } catch (_err) {
      return false;
    }
  }

  function clearAllToEmpty(storageObj = typeof localStorage !== 'undefined' ? localStorage : null) {
    const empty = createEmptyState();
    saveState(empty, storageObj);
    return empty;
  }

  function buildExportPayload(state, now = new Date()) {
    const clean = sanitizeState(state);
    const clock = IST.getLiveClockIST(now);
    return {
      app: '4am-ist-daily-tracker',
      version: 1,
      timezone: IST.IST_TIMEZONE,
      exportedAtIST: `${clock.dateStr} ${clock.time24} IST`,
      days: clean.days,
    };
  }

  function parseImportJson(jsonText) {
    if (typeof jsonText !== 'string' || !jsonText.trim()) {
      return { ok: false, error: 'Selected file is empty.' };
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (_err) {
      return { ok: false, error: 'Invalid JSON syntax. Please choose a valid backup file.' };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Backup file format is invalid.' };
    }

    const rawDays = parsed.days && typeof parsed.days === 'object' && !Array.isArray(parsed.days)
      ? parsed.days
      : parsed;

    const importedDays = {};
    let count = 0;

    for (const [dateStr, dayVal] of Object.entries(rawDays)) {
      if (IST.isValidDateStr(dateStr) && dayVal && typeof dayVal === 'object') {
        importedDays[dateStr] = Routine.normalizeDayRecord(dateStr, dayVal);
        count += 1;
      }
    }

    if (count === 0) {
      return { ok: false, error: 'No valid IST date entries (YYYY-MM-DD) were found in this file.' };
    }

    return {
      ok: true,
      importedCount: count,
      state: {
        version: 1,
        days: importedDays,
      },
    };
  }

  const api = {
    STORAGE_KEY,
    createEmptyState,
    sanitizeState,
    loadState,
    saveState,
    clearAllToEmpty,
    buildExportPayload,
    parseImportJson,
  };

  global.Tracker = global.Tracker || {};
  global.Tracker.Storage = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
