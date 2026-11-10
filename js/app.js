(function (global) {
  'use strict';

  const IST = global.Tracker.IST;
  const Routine = global.Tracker.Routine;
  const Metrics = global.Tracker.Metrics;
  const Storage = global.Tracker.Storage;
  const Charts = global.Tracker.Charts;

  let todayIST = IST.getTodayIST();
  let state = Storage.loadState(localStorage, todayIST);

  const ui = {
    activeTab: 'today',
    selectedDate: todayIST,
    selectedWeekStart: IST.getWeekStartMonIST(todayIST),
    selectedMonth: (() => {
      const p = IST.parseDateParts(todayIST);
      return { year: p.year, month: p.month };
    })(),
    selectedHeatmapDate: null,
    compareMode: 'week', // 'week' | 'month'
    comparePace: 'pace', // 'pace' | 'full'
    barScale: 'normalized', // 'normalized' | 'raw'
    toastTimer: null,
    noteTimer: null,
  };

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getOrInitDay(dateStr) {
    if (!state.days[dateStr]) {
      return Routine.createEmptyDay(dateStr);
    }
    return Routine.normalizeDayRecord(dateStr, state.days[dateStr]);
  }

  function mutateDay(dateStr, mutatorFn) {
    const day = getOrInitDay(dateStr);
    mutatorFn(day);
    state.days[dateStr] = Routine.normalizeDayRecord(dateStr, day);
    Storage.saveState(state, localStorage);
  }

  function showToast(message) {
    const toast = document.getElementById('toastEl');
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 3000);
  }

  function updateClockIST() {
    const clockEl = document.getElementById('liveClockIST');
    const clock = IST.getLiveClockIST(new Date());
    if (clockEl) {
      clockEl.textContent = clock.headerLabel;
    }
    if (clock.dateStr !== todayIST) {
      const wasViewingToday = ui.selectedDate === todayIST;
      todayIST = clock.dateStr;
      if (wasViewingToday) {
        ui.selectedDate = todayIST;
        ui.selectedWeekStart = IST.getWeekStartMonIST(todayIST);
        const p = IST.parseDateParts(todayIST);
        ui.selectedMonth = { year: p.year, month: p.month };
        renderActivePanel();
      }
    }
  }

  function syncSampleBanner() {
    const banner = document.getElementById('sampleBanner');
    if (!banner) return;
    banner.hidden = !state.isSampleData;
  }

  const TAB_CHARTS = {
    today: ['dayTimeChart', 'dayBlocksChart'],
    week: ['weekTimeChart', 'weekBlocksChart'],
    month: ['monthTimeChart', 'monthBlocksChart'],
    compare: ['improvementDonutChart', 'compareBarChart'],
  };

  function switchTab(tabName) {
    if (ui.activeTab !== tabName) {
      Charts.destroyCharts(TAB_CHARTS[ui.activeTab] || []);
    }
    ui.activeTab = tabName;
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      const isMatch = btn.dataset.tab === tabName;
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-selected', String(isMatch));
    });

    document.querySelectorAll('.tab-panel').forEach((panel) => {
      const isMatch = panel.id === `panel-${tabName}`;
      panel.hidden = !isMatch;
      panel.classList.toggle('active', isMatch);
    });

    renderActivePanel();
  }

  function renderActivePanel() {
    syncSampleBanner();
    if (ui.activeTab === 'today') renderTodayPanel();
    else if (ui.activeTab === 'week') renderWeekPanel();
    else if (ui.activeTab === 'month') renderMonthPanel();
    else if (ui.activeTab === 'compare') renderComparePanel();
  }

  // ==================== TODAY PANEL ====================
  function renderTodayPanel() {
    const dateStr = ui.selectedDate;
    const day = getOrInitDay(dateStr);
    const routine = Routine.getRoutineForDate(dateStr);
    const summary = Routine.computeDaySummary(dateStr, day);

    // Date controls
    const dateLabel = document.getElementById('selectedDateLabel');
    const dateInput = document.getElementById('selectedDateInput');
    const jumpTodayBtn = document.getElementById('jumpTodayBtn');
    const scheduleBadge = document.getElementById('scheduleBadge');

    if (dateLabel) {
      const short = IST.formatDateShort(dateStr);
      const wd = IST.formatWeekdayShort(dateStr);
      dateLabel.textContent = dateStr === todayIST ? `Today · ${short}` : `${wd}, ${short}`;
    }
    if (dateInput) dateInput.value = dateStr;
    if (jumpTodayBtn) jumpTodayBtn.hidden = dateStr === todayIST;
    if (scheduleBadge) {
      scheduleBadge.textContent = routine.scheduleLabel;
      scheduleBadge.classList.toggle('weekend', routine.isWeekend);
    }

    // Hero Score Ring
    const ringEl = document.getElementById('dailyScoreRing');
    const scoreValEl = document.getElementById('dailyScoreValue');
    const headlineEl = document.getElementById('dailyProgressHeadline');
    const wakeBadgeEl = document.getElementById('wakeTargetBadge');
    const focusBadgeEl = document.getElementById('dailyFocusBadge');

    const circumference = 314.16;
    if (ringEl) {
      const offset = circumference * (1 - summary.dailyScore / 100);
      ringEl.style.strokeDashoffset = String(offset);
      ringEl.style.stroke = summary.dailyScore >= 85 ? '#10b981'
        : summary.dailyScore >= 50 ? '#22d3ee'
          : '#818cf8';
    }
    if (scoreValEl) scoreValEl.textContent = String(summary.dailyScore);
    if (headlineEl) {
      headlineEl.textContent = `${summary.completedBlocks} of ${summary.totalBlocks} routine blocks`;
    }

    if (wakeBadgeEl) {
      wakeBadgeEl.classList.remove('hit', 'late');
      if (!day.wakeTime) {
        wakeBadgeEl.textContent = 'Wake time not logged';
      } else if (summary.hit4AM) {
        wakeBadgeEl.textContent = `Hit 4 AM (${IST.formatTime12h(day.wakeTime)})`;
        wakeBadgeEl.classList.add('hit');
      } else {
        const diff = (summary.wakeMinutes || 0) - 240;
        const deltaStr = diff > 0 ? `+${diff}m` : '';
        wakeBadgeEl.textContent = `Woke ${IST.formatTime12h(day.wakeTime)} ${deltaStr}`.trim();
        wakeBadgeEl.classList.add('late');
      }
    }

    const totalDayMins = day.minutes.calls + day.minutes.workout + day.minutes.studies + day.minutes.build;
    if (focusBadgeEl) {
      focusBadgeEl.textContent = totalDayMins >= 60
        ? `${(totalDayMins / 60).toFixed(1)}h focused`
        : `${totalDayMins}m focused`;
    }

    // Wake & Sleep Inputs
    const wakeInput = document.getElementById('actualWakeInput');
    const sleepInput = document.getElementById('actualSleepInput');
    if (wakeInput && document.activeElement !== wakeInput) wakeInput.value = day.wakeTime || '';
    if (sleepInput && document.activeElement !== sleepInput) sleepInput.value = day.sleepTime || '';

    // Checklist
    const checklistCounter = document.getElementById('checklistCounter');
    if (checklistCounter) checklistCounter.textContent = `${summary.completedBlocks}/${summary.totalBlocks}`;

    const checklistContainer = document.getElementById('routineChecklist');
    if (checklistContainer) {
      checklistContainer.innerHTML = routine.blocks.map((block) => {
        const stateEntry = day.blocks[block.id];
        const isDone = Boolean(stateEntry && stateEntry.done);
        const completedAt = stateEntry && stateEntry.completedAt ? stateEntry.completedAt : '';
        const catLabel = block.category === 'wake' ? 'Anchor'
          : block.category === 'calls' ? 'Calls'
            : block.category === 'workout' ? 'Fitness'
              : block.category === 'college' ? 'College'
                : block.category === 'studies' ? 'Study'
                  : block.category === 'build' ? 'Build'
                    : 'Routine';

        const stampHtml = isDone
          ? `<div class="routine-stamp-wrap">
               <label class="stamp-pill" title="Edit IST completion time">
                 <span>✓ ${escapeHtml(completedAt ? IST.formatTime12h(completedAt) : 'Done')}</span>
                 <input type="time" class="stamp-time-input" data-block-stamp="${escapeHtml(block.id)}" value="${escapeHtml(completedAt)}" aria-label="Completion time for ${escapeHtml(block.title)}" />
               </label>
             </div>`
          : '';

        return `
          <div class="routine-item ${isDone ? 'done' : ''}" role="checkbox" aria-checked="${isDone}" tabindex="0" data-block-id="${escapeHtml(block.id)}">
            <div class="routine-checkbox" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div class="routine-info">
              <div class="routine-top">
                <span class="routine-time-slot">${escapeHtml(block.timeLabel)}</span>
                <span class="routine-cat">${escapeHtml(catLabel)}</span>
              </div>
              <p class="routine-title">${escapeHtml(block.title)}</p>
              <p class="routine-detail">${escapeHtml(block.detail)}</p>
            </div>
            ${stampHtml}
          </div>
        `;
      }).join('');
    }

    // Lead Calls
    const setInputVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && document.activeElement !== el) el.value = String(val);
    };
    setInputVal('callsMadeInput', day.calls.made);
    setInputVal('callsConvoInput', day.calls.conversations);
    setInputVal('callsDemosInput', day.calls.demosSent);
    setInputVal('callsRepliesInput', day.calls.replies);

    const ratePill = document.getElementById('callRatePill');
    if (ratePill) {
      const convPct = day.calls.made > 0 ? Math.round((day.calls.conversations / day.calls.made) * 100) : 0;
      ratePill.textContent = `${convPct}% conv`;
    }

    // Focus minutes
    setInputVal('minCallsInput', day.minutes.calls);
    setInputVal('minWorkoutInput', day.minutes.workout);
    setInputVal('minStudiesInput', day.minutes.studies);
    setInputVal('minBuildInput', day.minutes.build);

    const buildPreset = document.getElementById('buildPresetChip');
    if (buildPreset) {
      const presetVal = routine.isWeekend ? 240 : 30;
      buildPreset.dataset.val = String(presetVal);
      buildPreset.textContent = routine.isWeekend ? '4h' : '30m';
    }

    // Note
    const noteEl = document.getElementById('dailyNoteInput');
    if (noteEl && document.activeElement !== noteEl) {
      noteEl.value = day.note || '';
    }

    // Daily Pie Charts
    const dayAgg = Metrics.aggregatePeriod(state.days, [dateStr], todayIST, { singleDayMode: true });
    Charts.renderTimeSplitPie('dayTimeChart', 'dayTimeEmpty', dayAgg);
    Charts.renderBlocksPie('dayBlocksChart', 'dayBlocksEmpty', summary.completedBlocks, summary.missedBlocks);
  }

  function toggleRoutineBlock(blockId) {
    const dateStr = ui.selectedDate;
    const routine = Routine.getRoutineForDate(dateStr);
    const blockDef = routine.blocks.find((b) => b.id === blockId);
    if (!blockDef) return;

    mutateDay(dateStr, (day) => {
      const currentlyDone = Boolean(day.blocks[blockId] && day.blocks[blockId].done);
      if (currentlyDone) {
        delete day.blocks[blockId];
      } else {
        day.blocks[blockId] = {
          done: true,
          completedAt: IST.getNowTimeIST(),
        };
        if (blockDef.minuteField && day.minutes[blockDef.minuteField] === 0 && blockDef.defaultMinutes > 0) {
          day.minutes[blockDef.minuteField] = blockDef.defaultMinutes;
        }
      }
    });

    renderTodayPanel();
  }

  // ==================== WEEK PANEL ====================
  function renderWeekPanel() {
    const weekDates = IST.getWeekDatesIST(ui.selectedWeekStart);
    const currentWeekStart = IST.getWeekStartMonIST(todayIST);
    const isCurrentWeek = ui.selectedWeekStart === currentWeekStart;

    const titleEl = document.getElementById('weekRangeTitle');
    const subEl = document.getElementById('weekRangeSub');
    const thisWeekBtn = document.getElementById('thisWeekBtn');

    if (titleEl) {
      titleEl.textContent = `${IST.formatDateShort(weekDates[0])} – ${IST.formatDateShort(weekDates[6])}`;
    }
    if (subEl) {
      subEl.textContent = isCurrentWeek ? 'Current Week (Mon–Sun IST)' : 'Mon–Sun (IST)';
    }
    if (thisWeekBtn) {
      thisWeekBtn.hidden = isCurrentWeek;
    }

    const agg = Metrics.aggregatePeriod(state.days, weekDates, todayIST);
    const avgPill = document.getElementById('weekAvgScorePill');
    if (avgPill) avgPill.textContent = `Avg: ${agg.avgDailyScore}%`;

    // Mon - Sun strip
    const stripEl = document.getElementById('weekStrip');
    if (stripEl) {
      stripEl.innerHTML = agg.perDay.map((d) => {
        const wd = IST.formatWeekdayShort(d.date);
        const dayNum = IST.parseDateParts(d.date).day;
        const wakeClass = d.hit4AM ? 'hit' : d.wakeTime ? 'miss' : '';
        const barColor = d.dailyScore >= 85 ? 'linear-gradient(180deg, #10b981, #22d3ee)'
          : d.dailyScore >= 50 ? 'linear-gradient(180deg, #22d3ee, #818cf8)'
            : 'linear-gradient(180deg, #64748b, #475569)';

        return `
          <button type="button" class="week-day-col ${d.date === todayIST ? 'is-today' : ''} ${d.isFuture ? 'is-future' : ''}" data-jump-date="${d.date}" title="Open ${d.date} in Today">
            <span class="week-day-name">${wd}</span>
            <span class="week-day-num">${dayNum}</span>
            <div class="week-bar-track">
              <div class="week-bar-fill" style="height: ${d.isFuture ? 0 : d.dailyScore}%; background: ${barColor};"></div>
            </div>
            <span class="week-day-score">${d.isFuture ? '—' : `${d.dailyScore}%`}</span>
            <span class="wake-dot ${wakeClass}" title="${d.hit4AM ? '4 AM target hit' : d.wakeTime ? `Woke ${IST.formatTime12h(d.wakeTime)}` : 'Wake not logged'}"></span>
          </button>
        `;
      }).join('');
    }

    // Weekly KPI cards
    const kpiGrid = document.getElementById('weekKpiGrid');
    if (kpiGrid) {
      const denom = agg.activeDaysCount > 0 ? agg.activeDaysCount : 7;
      const kpis = [
        { label: 'Calls Made', val: agg.totalCalls, sub: `${agg.totalConversations} conversations` },
        { label: 'Demos Sent', val: agg.totalDemosSent, sub: `${agg.totalReplies} replies / follow-ups` },
        { label: 'Hours Built', val: `${agg.hoursBuilt}h`, sub: `${agg.buildMinutes} mins total` },
        { label: 'Hours Studied', val: `${agg.hoursStudied}h`, sub: `${agg.studiesMinutes} mins total` },
        { label: 'Workouts Done', val: agg.workoutsDone, sub: `${agg.workoutMinutes} mins trained` },
        { label: 'Avg Wake-Up Time', val: agg.avgWakeLabel, sub: `${agg.wakeLoggedCount} days logged` },
        { label: '4:00 AM Target Hit', val: `${agg.daysHit4AM} / ${denom}`, sub: `${agg.wakeConsistencyPct}% consistency` },
        { label: 'Avg Daily Score', val: `${agg.avgDailyScore}`, sub: `${agg.completedBlocks}/${agg.totalBlocks} blocks` },
      ];
      kpiGrid.innerHTML = kpis.map((k) => `
        <div class="kpi-card">
          <span class="kpi-label">${escapeHtml(k.label)}</span>
          <span class="kpi-val">${escapeHtml(k.val)}</span>
          <span class="kpi-sub">${escapeHtml(k.sub)}</span>
        </div>
      `).join('');
    }

    Charts.renderTimeSplitPie('weekTimeChart', 'weekTimeEmpty', agg);
    Charts.renderBlocksPie('weekBlocksChart', 'weekBlocksEmpty', agg.completedBlocks, agg.missedBlocks);
  }

  // ==================== MONTH PANEL ====================
  function renderMonthPanel() {
    const { year, month } = ui.selectedMonth;
    const todayParts = IST.parseDateParts(todayIST);
    const isCurrentMonth = year === todayParts.year && month === todayParts.month;

    const titleEl = document.getElementById('monthTitle');
    const thisMonthBtn = document.getElementById('thisMonthBtn');
    if (titleEl) titleEl.textContent = IST.formatMonthTitle(year, month);
    if (thisMonthBtn) thisMonthBtn.hidden = isCurrentMonth;

    // Streaks (overall up to todayIST)
    const streaks = Metrics.computeStreaks(state.days, todayIST);
    const setElText = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(txt);
    };
    setElText('streak4AMCurrent', streaks.wake4AM.current);
    setElText('streak4AMBest', streaks.wake4AM.best);
    setElText('streakAllCurrent', streaks.allBlocks.current);
    setElText('streakAllBest', streaks.allBlocks.best);

    const monthInfo = IST.getMonthRangeIST(year, month);
    const agg = Metrics.aggregatePeriod(state.days, monthInfo.dates, todayIST);

    // Heatmap Grid
    const heatmapEl = document.getElementById('monthHeatmap');
    if (heatmapEl) {
      const cells = [];
      for (let pad = 0; pad < monthInfo.firstDayMonIndex; pad++) {
        cells.push('<div class="heat-cell heat-cell-empty" aria-hidden="true"></div>');
      }

      for (const d of agg.perDay) {
        const dayNum = IST.parseDateParts(d.date).day;
        const heatLevel = d.isFuture || (!d.hasAnyActivity && d.dailyScore === 0) ? 0
          : d.dailyScore >= 90 ? 4
            : d.dailyScore >= 70 ? 3
              : d.dailyScore >= 40 ? 2
                : d.dailyScore > 0 ? 1
                  : 0;
        const isSelected = ui.selectedHeatmapDate === d.date;
        const dotHtml = d.hit4AM ? '<span class="heat-4am-dot" title="4 AM hit"></span>' : '';

        cells.push(`
          <button type="button"
            class="heat-cell heat-${heatLevel} ${d.date === todayIST ? 'is-today' : ''} ${d.isFuture ? 'is-future' : ''} ${isSelected ? 'selected' : ''}"
            data-heat-date="${d.date}"
            title="${IST.formatDateShort(d.date)}: Score ${d.dailyScore}/100">
            <span class="heat-day-num">${dayNum}</span>
            <span class="heat-day-meta">
              <span>${d.isFuture || !d.hasAnyActivity ? '' : `${d.dailyScore}`}</span>
              ${dotHtml}
            </span>
          </button>
        `);
      }
      heatmapEl.innerHTML = cells.join('');
    }

    renderHeatmapInspector();

    // Monthly Totals & Averages
    const monthKpiGrid = document.getElementById('monthKpiGrid');
    if (monthKpiGrid) {
      const activeDivisor = agg.activeDaysCount > 0 ? agg.activeDaysCount : 1;
      const avgCalls = agg.activeDaysCount > 0 ? (agg.totalCalls / activeDivisor).toFixed(1) : '0.0';
      const avgBuild = agg.activeDaysCount > 0 ? (agg.hoursBuilt / activeDivisor).toFixed(1) : '0.0';
      const kpis = [
        { label: 'Monthly Calls', val: agg.totalCalls, sub: `Avg ${avgCalls}/day · ${agg.totalConversations} convos` },
        { label: 'Demos Sent', val: agg.totalDemosSent, sub: `${agg.totalReplies} replies received` },
        { label: 'Hours Built', val: `${agg.hoursBuilt}h`, sub: `Avg ${avgBuild}h/day` },
        { label: 'Hours Studied', val: `${agg.hoursStudied}h`, sub: `${agg.studiesMinutes} mins total` },
        { label: 'Workouts Done', val: agg.workoutsDone, sub: `${agg.workoutMinutes} mins total` },
        { label: 'Avg Daily Score', val: `${agg.avgDailyScore}`, sub: `${agg.completedBlocks}/${agg.totalBlocks} blocks` },
        { label: 'Avg Wake-Up', val: agg.avgWakeLabel, sub: `${agg.wakeLoggedCount} days logged` },
        { label: '4:00 AM Days', val: `${agg.daysHit4AM} / ${agg.activeDaysCount}`, sub: `${agg.wakeConsistencyPct}% consistency` },
      ];
      monthKpiGrid.innerHTML = kpis.map((k) => `
        <div class="kpi-card">
          <span class="kpi-label">${escapeHtml(k.label)}</span>
          <span class="kpi-val">${escapeHtml(k.val)}</span>
          <span class="kpi-sub">${escapeHtml(k.sub)}</span>
        </div>
      `).join('');
    }

    Charts.renderTimeSplitPie('monthTimeChart', 'monthTimeEmpty', agg);
    Charts.renderBlocksPie('monthBlocksChart', 'monthBlocksEmpty', agg.completedBlocks, agg.missedBlocks);
  }

  function renderHeatmapInspector() {
    const inspector = document.getElementById('heatmapInspector');
    if (!inspector) return;
    const targetDate = ui.selectedHeatmapDate || todayIST;
    const monthPrefix = `${ui.selectedMonth.year}-${String(ui.selectedMonth.month).padStart(2, '0')}`;

    if (!targetDate.startsWith(monthPrefix)) {
      inspector.innerHTML = '<span class="inspector-placeholder">Tap any day on the calendar to inspect or edit in Today.</span>';
      return;
    }

    const summary = Routine.computeDaySummary(targetDate, state.days[targetDate]);
    const wakeText = summary.wakeTime ? IST.formatTime12h(summary.wakeTime) : '—';
    inspector.innerHTML = `
      <div>
        <strong>${escapeHtml(IST.formatDateHeader(targetDate))}</strong> ·
        Score <strong>${summary.dailyScore}/100</strong> ·
        Wake: <strong>${escapeHtml(wakeText)}</strong> ·
        Calls: <strong>${summary.calls.made}</strong> ·
        Demos: <strong>${summary.calls.demosSent}</strong> ·
        Build: <strong>${(summary.minutes.build / 60).toFixed(1)}h</strong>
      </div>
      <button type="button" class="btn btn-outline btn-xs" data-jump-date="${targetDate}">Open in Today</button>
    `;
  }

  // ==================== COMPARE PANEL ====================
  function renderComparePanel() {
    const isWeek = ui.compareMode === 'week';
    const paceGroup = document.getElementById('comparePaceGroup');
    if (paceGroup) paceGroup.hidden = !isWeek;

    let currentDates;
    let prevDates;
    let prevLabel;
    let currLabel;
    let subtitleText;

    if (isWeek) {
      const thisMon = IST.getWeekStartMonIST(todayIST);
      const lastMon = IST.addDaysIST(thisMon, -7);
      const allThisWeek = IST.getWeekDatesIST(thisMon);
      const allLastWeek = IST.getWeekDatesIST(lastMon);

      if (ui.comparePace === 'pace') {
        const elapsedCount = Math.min(7, IST.diffDaysIST(thisMon, todayIST) + 1);
        currentDates = allThisWeek.slice(0, elapsedCount);
        prevDates = allLastWeek.slice(0, elapsedCount);
        prevLabel = `Last Week (First ${elapsedCount}d)`;
        currLabel = `This Week (${elapsedCount}d)`;
        subtitleText = `Same-day pace: ${IST.formatDateShort(prevDates[0])}–${IST.formatDateShort(prevDates[elapsedCount - 1])} vs ${IST.formatDateShort(currentDates[0])}–${IST.formatDateShort(currentDates[elapsedCount - 1])}`;
      } else {
        currentDates = allThisWeek;
        prevDates = allLastWeek;
        prevLabel = 'Last Week';
        currLabel = 'This Week';
        subtitleText = `${IST.formatDateShort(prevDates[0])}–${IST.formatDateShort(prevDates[6])} vs ${IST.formatDateShort(currentDates[0])}–${IST.formatDateShort(currentDates[6])}`;
      }
    } else {
      const p = IST.parseDateParts(todayIST);
      const prevM = IST.addMonths(p.year, p.month, -1);
      currentDates = IST.getMonthRangeIST(p.year, p.month).dates;
      prevDates = IST.getMonthRangeIST(prevM.year, prevM.month).dates;
      prevLabel = IST.formatMonthTitle(prevM.year, prevM.month);
      currLabel = IST.formatMonthTitle(p.year, p.month);
      subtitleText = `${prevLabel} vs ${currLabel}`;
    }

    const comparison = Metrics.computeComparison(state.days, currentDates, prevDates, todayIST);

    const barTitleEl = document.getElementById('compareBarTitle');
    const impSubEl = document.getElementById('improvementSubtitle');
    const rangeLabelEl = document.getElementById('compareRangeLabel');
    if (barTitleEl) barTitleEl.textContent = `${prevLabel} vs ${currLabel}`;
    if (impSubEl) impSubEl.textContent = `Composite delta vs ${prevLabel.toLowerCase()}`;
    if (rangeLabelEl) rangeLabelEl.textContent = subtitleText;

    // Improvement Score Center Readout
    const pctEl = document.getElementById('improvementPctValue');
    const dirEl = document.getElementById('improvementDirLabel');
    const breakdownEl = document.getElementById('improvementBreakdown');
    const score = comparison.improvementScore;

    if (pctEl) {
      const sign = score > 0 ? '+' : '';
      pctEl.textContent = `${sign}${score}%`;
      pctEl.classList.remove('up', 'down', 'flat');
      pctEl.classList.add(score > 0 ? 'up' : score < 0 ? 'down' : 'flat');
    }
    if (dirEl) {
      dirEl.textContent = score > 0 ? 'Improving' : score < 0 ? 'Needs Push' : 'Steady';
    }
    if (breakdownEl) {
      breakdownEl.innerHTML = `
        <span class="mini-stat-pill up">${comparison.improvedCount} up</span>
        <span class="mini-stat-pill">${comparison.flatCount} flat</span>
        <span class="mini-stat-pill down">${comparison.declinedCount} down</span>
      `;
    }

    Charts.renderImprovementDonut('improvementDonutChart', comparison);
    Charts.renderComparisonBar('compareBarChart', comparison, {
      scaleMode: ui.barScale,
      prevLabel,
      currLabel,
    });

    // Delta Cards
    const deltaGrid = document.getElementById('compareDeltaGrid');
    if (deltaGrid) {
      deltaGrid.innerHTML = comparison.metrics.map((m) => {
        const diffSign = m.delta > 0 ? '+' : '';
        const pctSign = m.pctChange > 0 ? '+' : '';
        const badgeText = `${diffSign}${m.delta}${m.unit} (${pctSign}${m.pctChange}%)`;
        return `
          <div class="delta-card">
            <div class="delta-meta">
              <span class="delta-name">${escapeHtml(m.label)}</span>
              <span class="delta-values">${escapeHtml(prevLabel)}: ${m.prev}${m.unit} → ${escapeHtml(currLabel)}: <strong>${m.curr}${m.unit}</strong></span>
            </div>
            <span class="delta-badge ${m.direction}">${escapeHtml(badgeText)}</span>
          </div>
        `;
      }).join('');
    }
  }

  // ==================== EXPORT / IMPORT / MODAL ====================
  function exportBackupFile() {
    const payload = Storage.buildExportPayload(state, new Date());
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `4am-tracker-backup-${todayIST}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`Exported backup (${Object.keys(payload.days).length} days)`);
  }

  function openDataModal() {
    const modal = document.getElementById('dataModal');
    const status = document.getElementById('modalStatusMsg');
    if (status) {
      status.textContent = '';
      status.classList.remove('error');
    }
    if (modal) modal.hidden = false;
  }

  function closeDataModal() {
    const modal = document.getElementById('dataModal');
    if (modal) modal.hidden = true;
  }

  // ==================== EVENT BINDINGS ====================
  function bindEvents() {
    // Tabs
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Clear Sample Data (One Click)
    document.getElementById('clearSampleBtn')?.addEventListener('click', () => {
      state = Storage.clearAllToEmpty(localStorage);
      renderActivePanel();
      showToast('Sample data cleared. Ready for your real routine!');
    });

    // Quick Export & Modal
    document.getElementById('quickExportBtn')?.addEventListener('click', exportBackupFile);
    document.getElementById('openDataModalBtn')?.addEventListener('click', openDataModal);
    document.getElementById('closeDataModalBtn')?.addEventListener('click', closeDataModal);
    document.getElementById('dataModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'dataModal') closeDataModal();
    });

    document.getElementById('modalExportBtn')?.addEventListener('click', exportBackupFile);

    document.getElementById('modalLoadSampleBtn')?.addEventListener('click', () => {
      state = Storage.resetToSample(localStorage, todayIST);
      closeDataModal();
      renderActivePanel();
      showToast('Loaded 36-day sample dataset.');
    });

    document.getElementById('modalClearAllBtn')?.addEventListener('click', () => {
      state = Storage.clearAllToEmpty(localStorage);
      closeDataModal();
      renderActivePanel();
      showToast('All data cleared.');
    });

    document.getElementById('importFileInput')?.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      const statusEl = document.getElementById('modalStatusMsg');
      if (!file) return;
      try {
        const text = await file.text();
        const result = Storage.parseImportJson(text);
        if (!result.ok) {
          if (statusEl) {
            statusEl.textContent = result.error;
            statusEl.classList.add('error');
          }
          e.target.value = '';
          return;
        }
        state = result.state;
        Storage.saveState(state, localStorage);
        closeDataModal();
        renderActivePanel();
        showToast(`Imported ${result.importedCount} day(s) successfully!`);
      } catch (_err) {
        if (statusEl) {
          statusEl.textContent = 'Could not read the selected file.';
          statusEl.classList.add('error');
        }
      }
      e.target.value = '';
    });

    // Today Date Navigation
    document.getElementById('prevDayBtn')?.addEventListener('click', () => {
      ui.selectedDate = IST.addDaysIST(ui.selectedDate, -1);
      renderTodayPanel();
    });
    document.getElementById('nextDayBtn')?.addEventListener('click', () => {
      ui.selectedDate = IST.addDaysIST(ui.selectedDate, 1);
      renderTodayPanel();
    });
    document.getElementById('jumpTodayBtn')?.addEventListener('click', () => {
      ui.selectedDate = todayIST;
      renderTodayPanel();
    });
    document.getElementById('selectedDateInput')?.addEventListener('change', (e) => {
      if (IST.isValidDateStr(e.target.value)) {
        ui.selectedDate = e.target.value;
        renderTodayPanel();
      }
    });

    // Wake & Sleep Inputs + Presets
    document.getElementById('actualWakeInput')?.addEventListener('change', (e) => {
      mutateDay(ui.selectedDate, (day) => {
        day.wakeTime = e.target.value;
      });
      renderTodayPanel();
    });
    document.getElementById('actualSleepInput')?.addEventListener('change', (e) => {
      mutateDay(ui.selectedDate, (day) => {
        day.sleepTime = e.target.value;
      });
      renderTodayPanel();
    });

    document.querySelectorAll('[data-wake-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        mutateDay(ui.selectedDate, (day) => {
          day.wakeTime = btn.dataset.wakePreset;
        });
        renderTodayPanel();
      });
    });

    document.querySelectorAll('[data-sleep-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        mutateDay(ui.selectedDate, (day) => {
          day.sleepTime = btn.dataset.sleepPreset;
        });
        renderTodayPanel();
      });
    });

    // Routine Checklist Delegation
    const checklistEl = document.getElementById('routineChecklist');
    if (checklistEl) {
      checklistEl.addEventListener('click', (e) => {
        if (e.target.closest('.stamp-pill')) {
          return;
        }
        const item = e.target.closest('[data-block-id]');
        if (item) {
          toggleRoutineBlock(item.dataset.blockId);
        }
      });

      checklistEl.addEventListener('keydown', (e) => {
        if (e.target.classList.contains('routine-item') && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          toggleRoutineBlock(e.target.dataset.blockId);
        }
      });

      checklistEl.addEventListener('change', (e) => {
        const stampInput = e.target.closest('[data-block-stamp]');
        if (stampInput) {
          const blockId = stampInput.dataset.blockStamp;
          mutateDay(ui.selectedDate, (day) => {
            if (day.blocks[blockId]) {
              day.blocks[blockId].completedAt = stampInput.value;
            }
          });
          renderTodayPanel();
        }
      });
    }

    // Call Steppers & Inputs
    document.querySelectorAll('[data-call-step]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const field = btn.dataset.callStep;
        const delta = Number(btn.dataset.delta);
        mutateDay(ui.selectedDate, (day) => {
          day.calls[field] = Math.max(0, (day.calls[field] || 0) + delta);
        });
        renderTodayPanel();
      });
    });

    const callInputMap = {
      callsMadeInput: 'made',
      callsConvoInput: 'conversations',
      callsDemosInput: 'demosSent',
      callsRepliesInput: 'replies',
    };
    for (const [elId, field] of Object.entries(callInputMap)) {
      const el = document.getElementById(elId);
      el?.addEventListener('input', (e) => {
        const val = Math.max(0, Math.round(Number(e.target.value) || 0));
        mutateDay(ui.selectedDate, (day) => {
          day.calls[field] = val;
        });
        const ratePill = document.getElementById('callRatePill');
        const d = getOrInitDay(ui.selectedDate);
        if (ratePill) {
          const pct = d.calls.made > 0 ? Math.round((d.calls.conversations / d.calls.made) * 100) : 0;
          ratePill.textContent = `${pct}% conv`;
        }
      });
      el?.addEventListener('blur', (e) => {
        const d = getOrInitDay(ui.selectedDate);
        e.target.value = String(d.calls[field]);
      });
    }

    // Focus Minutes Inputs & Presets
    const minInputMap = {
      minCallsInput: 'calls',
      minWorkoutInput: 'workout',
      minStudiesInput: 'studies',
      minBuildInput: 'build',
    };
    for (const [elId, field] of Object.entries(minInputMap)) {
      const el = document.getElementById(elId);
      el?.addEventListener('input', (e) => {
        const val = Math.min(1440, Math.max(0, Math.round(Number(e.target.value) || 0)));
        mutateDay(ui.selectedDate, (day) => {
          day.minutes[field] = val;
        });
        const dateStr = ui.selectedDate;
        const dayAgg = Metrics.aggregatePeriod(state.days, [dateStr], todayIST, { singleDayMode: true });
        Charts.renderTimeSplitPie('dayTimeChart', 'dayTimeEmpty', dayAgg);
        const focusBadgeEl = document.getElementById('dailyFocusBadge');
        if (focusBadgeEl) {
          const m = dayAgg.totalFocusMinutes;
          focusBadgeEl.textContent = m >= 60 ? `${(m / 60).toFixed(1)}h focused` : `${m}m focused`;
        }
      });
      el?.addEventListener('blur', (e) => {
        const d = getOrInitDay(ui.selectedDate);
        e.target.value = String(d.minutes[field]);
      });
    }

    document.querySelectorAll('[data-min-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const field = btn.dataset.minAdd;
        const addVal = Number(btn.dataset.val);
        mutateDay(ui.selectedDate, (day) => {
          day.minutes[field] = Math.min(1440, (day.minutes[field] || 0) + addVal);
        });
        renderTodayPanel();
      });
    });

    document.querySelectorAll('[data-min-set]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const field = btn.dataset.minSet;
        const setVal = Number(btn.dataset.val);
        mutateDay(ui.selectedDate, (day) => {
          day.minutes[field] = setVal;
        });
        renderTodayPanel();
      });
    });

    // Daily Note Auto-Save
    document.getElementById('dailyNoteInput')?.addEventListener('input', (e) => {
      const text = e.target.value;
      mutateDay(ui.selectedDate, (day) => {
        day.note = text;
      });
      const ind = document.getElementById('noteSavedIndicator');
      if (ind) {
        ind.textContent = 'Saving…';
        clearTimeout(ui.noteTimer);
        ui.noteTimer = setTimeout(() => {
          ind.textContent = 'Auto-saved';
        }, 250);
      }
    });

    // Week Navigation & Day Jump
    document.getElementById('prevWeekBtn')?.addEventListener('click', () => {
      ui.selectedWeekStart = IST.addDaysIST(ui.selectedWeekStart, -7);
      renderWeekPanel();
    });
    document.getElementById('nextWeekBtn')?.addEventListener('click', () => {
      ui.selectedWeekStart = IST.addDaysIST(ui.selectedWeekStart, 7);
      renderWeekPanel();
    });
    document.getElementById('thisWeekBtn')?.addEventListener('click', () => {
      ui.selectedWeekStart = IST.getWeekStartMonIST(todayIST);
      renderWeekPanel();
    });

    // Month Navigation & Heatmap Selection
    document.getElementById('prevMonthBtn')?.addEventListener('click', () => {
      ui.selectedMonth = IST.addMonths(ui.selectedMonth.year, ui.selectedMonth.month, -1);
      ui.selectedHeatmapDate = null;
      renderMonthPanel();
    });
    document.getElementById('nextMonthBtn')?.addEventListener('click', () => {
      ui.selectedMonth = IST.addMonths(ui.selectedMonth.year, ui.selectedMonth.month, 1);
      ui.selectedHeatmapDate = null;
      renderMonthPanel();
    });
    document.getElementById('thisMonthBtn')?.addEventListener('click', () => {
      const p = IST.parseDateParts(todayIST);
      ui.selectedMonth = { year: p.year, month: p.month };
      ui.selectedHeatmapDate = null;
      renderMonthPanel();
    });

    document.getElementById('monthHeatmap')?.addEventListener('click', (e) => {
      const cell = e.target.closest('[data-heat-date]');
      if (!cell) return;
      ui.selectedHeatmapDate = cell.dataset.heatDate;
      document.querySelectorAll('.heat-cell.selected').forEach((c) => c.classList.remove('selected'));
      cell.classList.add('selected');
      renderHeatmapInspector();
    });

    // Delegated Jump-to-Date buttons (Week Strip & Month Inspector)
    document.addEventListener('click', (e) => {
      const jumpEl = e.target.closest('[data-jump-date]');
      if (!jumpEl) return;
      const target = jumpEl.dataset.jumpDate;
      if (IST.isValidDateStr(target)) {
        ui.selectedDate = target;
        switchTab('today');
      }
    });

    // Compare Toggles
    document.querySelectorAll('[data-compare-period]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui.compareMode = btn.dataset.comparePeriod;
        document.querySelectorAll('[data-compare-period]').forEach((b) =>
          b.classList.toggle('active', b === btn)
        );
        renderComparePanel();
      });
    });

    document.querySelectorAll('[data-compare-pace]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui.comparePace = btn.dataset.comparePace;
        document.querySelectorAll('[data-compare-pace]').forEach((b) =>
          b.classList.toggle('active', b === btn)
        );
        renderComparePanel();
      });
    });

    document.querySelectorAll('[data-bar-scale]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui.barScale = btn.dataset.barScale;
        document.querySelectorAll('[data-bar-scale]').forEach((b) =>
          b.classList.toggle('active', b === btn)
        );
        renderComparePanel();
      });
    });
  }

  function init() {
    updateClockIST();
    setInterval(updateClockIST, 1000);
    bindEvents();
    renderActivePanel();
  }

  document.addEventListener('DOMContentLoaded', init);

  // Expose lightweight hooks for inspection/testing
  global.Tracker.App = {
    getState: () => state,
    switchTab,
    renderActivePanel,
  };
})(window);

