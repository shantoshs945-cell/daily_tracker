(function (global) {
  'use strict';

  const IST_TIMEZONE = 'Asia/Kolkata';

  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const time24Formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const time12Formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: IST_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const weekdayShortFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: IST_TIMEZONE,
    weekday: 'short',
  });

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const MONTH_SHORT = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  const WEEKDAY_NAMES_SUN0 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WEEKDAY_FULL_SUN0 = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function getTodayIST(now = new Date()) {
    const parts = dateFormatter.formatToParts(now);
    const y = parts.find((p) => p.type === 'year').value;
    const m = parts.find((p) => p.type === 'month').value;
    const d = parts.find((p) => p.type === 'day').value;
    return `${y}-${m}-${d}`;
  }

  function getNowTimeIST(now = new Date()) {
    const parts = time24Formatter.formatToParts(now);
    const h = parts.find((p) => p.type === 'hour').value;
    const m = parts.find((p) => p.type === 'minute').value;
    return `${h === '24' ? '00' : h}:${m}`;
  }

  function getLiveClockIST(now = new Date()) {
    const dateStr = getTodayIST(now);
    const time24 = getNowTimeIST(now);
    const time12 = time12Formatter.format(now);
    const weekdayShort = weekdayShortFormatter.format(now);
    return {
      dateStr,
      time24,
      time12,
      weekdayShort,
      headerLabel: `${formatDateHeader(dateStr)} · ${time12} IST`,
    };
  }

  function isValidDateStr(dateStr) {
    if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return false;
    }
    const [y, m, d] = dateStr.split('-').map(Number);
    const utc = new Date(Date.UTC(y, m - 1, d));
    return (
      utc.getUTCFullYear() === y &&
      utc.getUTCMonth() === m - 1 &&
      utc.getUTCDate() === d
    );
  }

  function parseDateParts(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return { year, month, day };
  }

  function formatDateParts(year, month, day) {
    const y = String(year).padStart(4, '0');
    const m = String(month).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function addDaysIST(dateStr, deltaDays) {
    const { year, month, day } = parseDateParts(dateStr);
    const utc = new Date(Date.UTC(year, month - 1, day + deltaDays));
    return formatDateParts(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
  }

  function diffDaysIST(startStr, endStr) {
    const a = parseDateParts(startStr);
    const b = parseDateParts(endStr);
    const utcA = Date.UTC(a.year, a.month - 1, a.day);
    const utcB = Date.UTC(b.year, b.month - 1, b.day);
    return Math.round((utcB - utcA) / 86400000);
  }

  function getDayOfWeekIST(dateStr) {
    const { year, month, day } = parseDateParts(dateStr);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun..6=Sat
  }

  function isWeekendIST(dateStr) {
    const dow = getDayOfWeekIST(dateStr);
    return dow === 0 || dow === 6;
  }

  function getWeekStartMonIST(dateStr) {
    const dow = getDayOfWeekIST(dateStr); // 0=Sun, 1=Mon...6=Sat
    const offset = dow === 0 ? -6 : 1 - dow;
    return addDaysIST(dateStr, offset);
  }

  function getWeekDatesIST(weekStartStr) {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      dates.push(addDaysIST(weekStartStr, i));
    }
    return dates;
  }

  function getMonthRangeIST(year, month) {
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const startStr = formatDateParts(year, month, 1);
    const endStr = formatDateParts(year, month, daysInMonth);
    const dow = getDayOfWeekIST(startStr); // 0=Sun..6=Sat
    const firstDayMonIndex = dow === 0 ? 6 : dow - 1; // 0=Mon..6=Sun
    const dates = [];
    for (let d = 1; d <= daysInMonth; d++) {
      dates.push(formatDateParts(year, month, d));
    }
    return {
      year,
      month,
      startStr,
      endStr,
      daysInMonth,
      firstDayMonIndex,
      dates,
    };
  }

  function addMonths(year, month, delta) {
    const totalMonths = year * 12 + (month - 1) + delta;
    const newYear = Math.floor(totalMonths / 12);
    const newMonth = ((totalMonths % 12) + 12) % 12 + 1;
    return { year: newYear, month: newMonth };
  }

  function timeToMinutes(hhmm) {
    if (typeof hhmm !== 'string') return null;
    const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
    if (!match) return null;
    const hours = Number(match[1]);
    const mins = Number(match[2]);
    if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return null;
    return hours * 60 + mins;
  }

  function minutesToTime24(totalMinutes) {
    if (totalMinutes === null || totalMinutes === undefined || Number.isNaN(totalMinutes)) return '';
    const clamped = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
    const h = String(Math.floor(clamped / 60)).padStart(2, '0');
    const m = String(clamped % 60).padStart(2, '0');
    return `${h}:${m}`;
  }

  function formatTime12h(hhmm) {
    const mins = timeToMinutes(hhmm);
    if (mins === null) return '—';
    return minutesToTime12(mins);
  }

  function minutesToTime12(totalMinutes) {
    if (totalMinutes === null || totalMinutes === undefined || Number.isNaN(totalMinutes)) return '—';
    const clamped = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
    const h24 = Math.floor(clamped / 60);
    const m = clamped % 60;
    const suffix = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
  }

  function formatDateShort(dateStr) {
    const { month, day } = parseDateParts(dateStr);
    return `${day} ${MONTH_SHORT[month - 1]}`;
  }

  function formatDateHeader(dateStr) {
    const { year, month, day } = parseDateParts(dateStr);
    const dow = getDayOfWeekIST(dateStr);
    return `${WEEKDAY_NAMES_SUN0[dow]}, ${day} ${MONTH_SHORT[month - 1]} ${year}`;
  }

  function formatWeekdayFull(dateStr) {
    return WEEKDAY_FULL_SUN0[getDayOfWeekIST(dateStr)];
  }

  function formatWeekdayShort(dateStr) {
    return WEEKDAY_NAMES_SUN0[getDayOfWeekIST(dateStr)];
  }

  function formatMonthTitle(year, month) {
    return `${MONTH_NAMES[month - 1]} ${year}`;
  }

  const api = {
    IST_TIMEZONE,
    getTodayIST,
    getNowTimeIST,
    getLiveClockIST,
    isValidDateStr,
    parseDateParts,
    formatDateParts,
    addDaysIST,
    diffDaysIST,
    getDayOfWeekIST,
    isWeekendIST,
    getWeekStartMonIST,
    getWeekDatesIST,
    getMonthRangeIST,
    addMonths,
    timeToMinutes,
    minutesToTime24,
    formatTime12h,
    minutesToTime12,
    formatDateShort,
    formatDateHeader,
    formatWeekdayFull,
    formatWeekdayShort,
    formatMonthTitle,
  };

  global.Tracker = global.Tracker || {};
  global.Tracker.IST = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);

