(function (global) {
  'use strict';

  const instances = new Map();

  const PALETTE = {
    calls: '#22D3EE',     // Electric cyan
    workout: '#10B981',   // Emerald
    studies: '#818CF8',   // Indigo
    build: '#F59E0B',     // Amber
    completed: '#10B981', // Emerald
    missed: '#334155',    // Muted slate
    prevBar: 'rgba(148, 163, 184, 0.38)',
    prevBorder: 'rgba(148, 163, 184, 0.72)',
    up: '#10B981',
    down: '#F43F5E',
    flat: '#22D3EE',
    neutralTrack: 'rgba(51, 65, 85, 0.45)',
    grid: 'rgba(148, 163, 184, 0.1)',
    tick: '#94A3B8',
    tooltipBg: '#0F172A',
    tooltipBorder: 'rgba(148, 163, 184, 0.25)',
  };

  function getChartConstructor() {
    return typeof global.Chart === 'function' ? global.Chart : null;
  }

  function applyChartDefaults() {
    const ChartLib = getChartConstructor();
    if (!ChartLib) return;
    ChartLib.defaults.color = '#94A3B8';
    ChartLib.defaults.font.family = "'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, sans-serif";
    ChartLib.defaults.plugins.legend.labels.usePointStyle = true;
    ChartLib.defaults.plugins.legend.labels.pointStyle = 'circle';
    ChartLib.defaults.plugins.legend.labels.boxWidth = 8;
    ChartLib.defaults.plugins.legend.labels.boxHeight = 8;
    ChartLib.defaults.plugins.legend.labels.padding = 14;
  }

  function getOrCreateChart(canvasId, configFactory) {
    const ChartLib = getChartConstructor();
    const canvas = typeof document !== 'undefined' ? document.getElementById(canvasId) : null;
    if (!ChartLib || !canvas) return null;

    const existing = instances.get(canvasId);
    if (existing) {
      return { chart: existing, isNew: false };
    }

    // Ensure parent container layout is committed before Chart.js measures dimensions
    if (canvas.parentElement) {
      void canvas.parentElement.offsetWidth;
    }

    applyChartDefaults();
    const chart = new ChartLib(canvas.getContext('2d'), configFactory());
    instances.set(canvasId, chart);
    return { chart, isNew: true };
  }

  function destroyCharts(canvasIds) {
    for (const id of canvasIds) {
      const existing = instances.get(id);
      if (existing) {
        existing.destroy();
        instances.delete(id);
      }
    }
  }

  function toggleEmptyNotice(noticeId, isEmpty) {
    if (typeof document === 'undefined') return;
    const el = document.getElementById(noticeId);
    if (!el) return;
    el.hidden = !isEmpty;
  }

  function formatMinutesHuman(mins) {
    const m = Math.round(mins);
    if (m < 60) return `${m} min`;
    const h = (m / 60).toFixed(1);
    return `${m} min (${h} h)`;
  }

  function renderTimeSplitPie(canvasId, noticeId, agg) {
    const values = [
      agg.callsMinutes || 0,
      agg.workoutMinutes || 0,
      agg.studiesMinutes || 0,
      agg.buildMinutes || 0,
    ];
    const total = values.reduce((s, v) => s + v, 0);
    toggleEmptyNotice(noticeId, total === 0);

    const chartData = total > 0 ? values : [0, 0, 0, 0];
    const entry = getOrCreateChart(canvasId, () => ({
      type: 'doughnut',
      data: {
        labels: ['Lead Calls', 'Workout', 'Studies', 'Build / Learn'],
        datasets: [
          {
            data: chartData,
            backgroundColor: [PALETTE.calls, PALETTE.workout, PALETTE.studies, PALETTE.build],
            borderColor: '#0F1522',
            borderWidth: 2,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        animation: { duration: 420 },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#CBD5E1',
              font: { size: 11, weight: '600' },
            },
          },
          tooltip: {
            backgroundColor: PALETTE.tooltipBg,
            borderColor: PALETTE.tooltipBorder,
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label(ctx) {
                const v = ctx.parsed || 0;
                const sum = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = sum > 0 ? Math.round((v / sum) * 100) : 0;
                return ` ${ctx.label}: ${formatMinutesHuman(v)} (${pct}%)`;
              },
            },
          },
        },
      },
    }));

    if (!entry) return;
    if (!entry.isNew) {
      entry.chart.data.datasets[0].data = chartData;
      entry.chart.update();
    }
  }

  function renderBlocksPie(canvasId, noticeId, completed, missed) {
    const comp = Math.max(0, completed || 0);
    const miss = Math.max(0, missed || 0);
    const total = comp + miss;
    toggleEmptyNotice(noticeId, total === 0);

    const entry = getOrCreateChart(canvasId, () => ({
      type: 'doughnut',
      data: {
        labels: ['Completed', 'Missed / Remaining'],
        datasets: [
          {
            data: [comp, miss],
            backgroundColor: [PALETTE.completed, PALETTE.missed],
            borderColor: '#0F1522',
            borderWidth: 2,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        animation: { duration: 420 },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#CBD5E1',
              font: { size: 11, weight: '600' },
            },
          },
          tooltip: {
            backgroundColor: PALETTE.tooltipBg,
            borderColor: PALETTE.tooltipBorder,
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label(ctx) {
                const v = ctx.parsed || 0;
                const sum = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = sum > 0 ? Math.round((v / sum) * 100) : 0;
                return ` ${ctx.label}: ${v} blocks (${pct}%)`;
              },
            },
          },
        },
      },
    }));

    if (!entry) return;
    if (!entry.isNew) {
      entry.chart.data.datasets[0].data = [comp, miss];
      entry.chart.update();
    }
  }

  function renderImprovementDonut(canvasId, comparison) {
    const pos = comparison.positiveMagnitude || 0;
    const neg = comparison.negativeMagnitude || 0;
    const hasChanges = pos > 0 || neg > 0;

    // Show positive vs negative weighted momentum; if flat/empty, render neutral track
    const data = hasChanges
      ? [pos, neg, Math.max(0, comparison.flatCount * 15)]
      : [0, 0, 100];

    const entry = getOrCreateChart(canvasId, () => ({
      type: 'doughnut',
      data: {
        labels: ['Positive Gains', 'Declines', 'Steady / Baseline'],
        datasets: [
          {
            data,
            backgroundColor: [PALETTE.up, PALETTE.down, PALETTE.neutralTrack],
            borderColor: '#0F1522',
            borderWidth: 2,
            hoverOffset: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        animation: { duration: 450 },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#CBD5E1',
              font: { size: 11, weight: '600' },
            },
          },
          tooltip: {
            backgroundColor: PALETTE.tooltipBg,
            borderColor: PALETTE.tooltipBorder,
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label(ctx) {
                if (!hasChanges) {
                  return ' No period change recorded yet';
                }
                const label = ctx.label;
                if (label === 'Positive Gains') {
                  return ` Metrics up: ${comparison.improvedCount} (score +${pos.toFixed(0)} pts)`;
                }
                if (label === 'Declines') {
                  return ` Metrics down: ${comparison.declinedCount} (score -${neg.toFixed(0)} pts)`;
                }
                return ` Unchanged metrics: ${comparison.flatCount}`;
              },
            },
          },
        },
      },
    }));

    if (!entry) return;
    if (!entry.isNew) {
      entry.chart.data.datasets[0].data = data;
      entry.chart.update();
    }
  }

  function renderComparisonBar(canvasId, comparison, options = {}) {
    const mode = options.scaleMode === 'raw' ? 'raw' : 'normalized';
    const prevLabel = options.prevLabel || 'Previous Period';
    const currLabel = options.currLabel || 'Current Period';

    const labels = comparison.metrics.map((m) => m.shortLabel);
    const prevValues = comparison.metrics.map((m) => (mode === 'raw' ? m.prev : m.normalizedPrev));
    const currValues = comparison.metrics.map((m) => (mode === 'raw' ? m.curr : m.normalizedCurr));
    const currColors = comparison.metrics.map((m) =>
      m.direction === 'up' ? 'rgba(16, 185, 129, 0.85)'
        : m.direction === 'down' ? 'rgba(244, 63, 94, 0.85)'
          : 'rgba(34, 211, 238, 0.8)'
    );
    const currBorders = comparison.metrics.map((m) =>
      m.direction === 'up' ? PALETTE.up
        : m.direction === 'down' ? PALETTE.down
          : PALETTE.flat
    );

    const entry = getOrCreateChart(canvasId, () => ({
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: prevLabel,
            data: prevValues,
            backgroundColor: PALETTE.prevBar,
            borderColor: PALETTE.prevBorder,
            borderWidth: 1.5,
            borderRadius: 6,
            barPercentage: 0.78,
            categoryPercentage: 0.72,
          },
          {
            label: currLabel,
            data: currValues,
            backgroundColor: currColors,
            borderColor: currBorders,
            borderWidth: 1.5,
            borderRadius: 6,
            barPercentage: 0.78,
            categoryPercentage: 0.72,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 420 },
        interaction: {
          mode: 'index',
          intersect: false,
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: '#CBD5E1',
              font: { size: 11, weight: '600' },
            },
          },
          y: {
            beginAtZero: true,
            suggestedMax: mode === 'normalized' ? 105 : undefined,
            grid: { color: PALETTE.grid },
            ticks: {
              color: PALETTE.tick,
              font: { size: 11 },
              callback(value) {
                return mode === 'normalized' ? `${value}%` : value;
              },
            },
          },
        },
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: {
              color: '#CBD5E1',
              font: { size: 11, weight: '600' },
              generateLabels(chart) {
                const ChartLib = getChartConstructor();
                const items = ChartLib.defaults.plugins.legend.labels.generateLabels(chart);
                if (items[1]) {
                  items[1].fillStyle = PALETTE.flat;
                  items[1].strokeStyle = PALETTE.flat;
                }
                return items;
              },
            },
          },
          tooltip: {
            backgroundColor: PALETTE.tooltipBg,
            borderColor: PALETTE.tooltipBorder,
            borderWidth: 1,
            padding: 12,
            callbacks: {
              title(items) {
                if (!items.length) return '';
                const idx = items[0].dataIndex;
                return comparison.metrics[idx].label;
              },
              label(ctx) {
                const m = comparison.metrics[ctx.dataIndex];
                const rawVal = ctx.datasetIndex === 0 ? m.prev : m.curr;
                return ` ${ctx.dataset.label}: ${rawVal}${m.unit}`;
              },
              afterBody(items) {
                if (!items.length) return '';
                const m = comparison.metrics[items[0].dataIndex];
                const sign = m.delta > 0 ? '+' : '';
                const pctSign = m.pctChange > 0 ? '+' : '';
                return `\n Change: ${sign}${m.delta}${m.unit} (${pctSign}${m.pctChange}%)`;
              },
            },
          },
        },
      },
    }));

    if (!entry) return;
    if (!entry.isNew) {
      const { chart } = entry;
      chart.data.labels = labels;
      chart.data.datasets[0].label = prevLabel;
      chart.data.datasets[0].data = prevValues;
      chart.data.datasets[1].label = currLabel;
      chart.data.datasets[1].data = currValues;
      chart.data.datasets[1].backgroundColor = currColors;
      chart.data.datasets[1].borderColor = currBorders;
      chart.options.scales.y.suggestedMax = mode === 'normalized' ? 105 : undefined;
      chart.options.scales.y.ticks.callback = (v) => (mode === 'normalized' ? `${v}%` : v);
      chart.update();
    }
  }

  function getChartSnapshot(canvasId) {
    const chart = instances.get(canvasId);
    if (!chart) return null;
    return {
      labels: chart.data.labels ? [...chart.data.labels] : [],
      datasets: chart.data.datasets.map((d) => ({
        label: d.label,
        data: [...d.data],
      })),
    };
  }

  const api = {
    renderTimeSplitPie,
    renderBlocksPie,
    renderImprovementDonut,
    renderComparisonBar,
    destroyCharts,
    getChartSnapshot,
  };

  global.Tracker = global.Tracker || {};
  global.Tracker.Charts = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);

