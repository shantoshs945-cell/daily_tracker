import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const ROOT = process.cwd();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function startStaticServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const reqPath = (req.url || '/').split('?')[0];
      const safePath = reqPath === '/' ? '/index.html' : reqPath;
      const fullPath = path.join(ROOT, safePath);
      if (!fullPath.startsWith(ROOT) || !fs.existsSync(fullPath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(fullPath);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      fs.createReadStream(fullPath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

function findBrowserExecutable() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No Chrome or Edge executable found for E2E tests.');
}

async function run() {
  const { server, url } = await startStaticServer();
  const executablePath = findBrowserExecutable();
  const browser = await chromium.launch({ executablePath, headless: true });

  const errors = [];
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    acceptDownloads: true,
  });
  const page = await context.newPage();

  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle' });

    // 1. Verify IST clock & clean empty initial state (no sample banner or sample buttons)
    const clockText = await page.textContent('#liveClockIST');
    assert.match(clockText, /IST$/);
    assert.equal(await page.locator('#sampleBanner').count(), 0);
    assert.equal(await page.locator('#clearSampleBtn').count(), 0);
    assert.equal(await page.locator('#modalLoadSampleBtn').count(), 0);
    assert.equal(await page.textContent('#dailyScoreValue'), '0');

    // Verify mobile layout has zero horizontal overflow
    const mobileOverflow = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
    }));
    assert.ok(
      mobileOverflow.scrollW <= mobileOverflow.innerW,
      `Mobile horizontal overflow detected: ${JSON.stringify(mobileOverflow)}`
    );

    // 2. Verify initial empty charts start at zero
    const initialDayTime = await page.evaluate(() => window.Tracker.Charts.getChartSnapshot('dayTimeChart'));
    assert.deepEqual(initialDayTime.datasets[0].data, [0, 0, 0, 0]);

    // Switch through Week, Month, Compare on empty state cleanly
    await page.click('#tabBtnWeek');
    const emptyWeekTime = await page.evaluate(() => window.Tracker.Charts.getChartSnapshot('weekTimeChart'));
    assert.deepEqual(emptyWeekTime.datasets[0].data, [0, 0, 0, 0]);

    await page.click('#tabBtnMonth');
    const emptyMonthTime = await page.evaluate(() => window.Tracker.Charts.getChartSnapshot('monthTimeChart'));
    assert.deepEqual(emptyMonthTime.datasets[0].data, [0, 0, 0, 0]);

    await page.click('#tabBtnCompare');
    const emptyCompareBar = await page.evaluate(() => window.Tracker.Charts.getChartSnapshot('compareBarChart'));
    assert.equal(emptyCompareBar.datasets[0].data.length, 8);
    assert.equal(emptyCompareBar.datasets[1].data.length, 8);

    await page.click('#tabBtnToday');

    // 3. Add real data on Today & verify charts update dynamically
    await page.click('[data-wake-preset="04:00"]');
    await page.click('[data-sleep-preset="21:30"]');

    // Check 4 routine blocks: wake, lead_calls, workout, studies
    await page.click('[data-block-id="wake"]');
    await page.click('[data-block-id="lead_calls"]');
    await page.click('[data-block-id="workout"]');
    await page.click('[data-block-id="studies"]');

    // Verify timestamp badge rendered on checked block
    const stampCount = await page.locator('.routine-item.done .stamp-pill').count();
    assert.equal(stampCount, 4, 'Each checked block should record an IST timestamp');

    // Verify daily score updated
    const scoreAfter4 = Number(await page.textContent('#dailyScoreValue'));
    assert.ok(scoreAfter4 > 0, `Expected positive daily score, got ${scoreAfter4}`);

    // Verify dayTimeChart auto-filled [80, 45, 60, 0] and updates when build minutes added
    const afterBlocksTime = await page.evaluate(() => window.Tracker.Charts.getChartSnapshot('dayTimeChart'));
    assert.deepEqual(afterBlocksTime.datasets[0].data, [80, 45, 60, 0]);

    await page.fill('#minBuildInput', '45');
    await page.dispatchEvent('#minBuildInput', 'input');
    const afterBuildTime = await page.evaluate(() => window.Tracker.Charts.getChartSnapshot('dayTimeChart'));
    assert.deepEqual(afterBuildTime.datasets[0].data, [80, 45, 60, 45]);

    // Update lead calls via steppers + input
    await page.fill('#callsMadeInput', '20');
    await page.dispatchEvent('#callsMadeInput', 'input');
    await page.click('[data-call-step="made"][data-delta="1"]'); // 21
    await page.fill('#callsConvoInput', '6');
    await page.dispatchEvent('#callsConvoInput', 'input');
    await page.fill('#callsDemosInput', '3');
    await page.dispatchEvent('#callsDemosInput', 'input');
    await page.fill('#callsRepliesInput', '2');
    await page.dispatchEvent('#callsRepliesInput', 'input');
    await page.fill('#dailyNoteInput', 'Called 21 Texas HVAC businesses, sent 3 live demos.');
    await page.dispatchEvent('#dailyNoteInput', 'input');

    // 5. Switch to Week tab and verify Week charts & KPIs updated
    await page.click('#tabBtnWeek');
    const weekTime = await page.evaluate(() => window.Tracker.Charts.getChartSnapshot('weekTimeChart'));
    assert.deepEqual(weekTime.datasets[0].data, [80, 45, 60, 45]);
    const weekBlocks = await page.evaluate(() => window.Tracker.Charts.getChartSnapshot('weekBlocksChart'));
    assert.equal(weekBlocks.datasets[0].data[0], 4);
    const weekKpisText = await page.textContent('#weekKpiGrid');
    assert.match(weekKpisText, /21/);
    assert.match(weekKpisText, /4:00 AM/);

    // 6. Switch to Month tab and verify Month charts & streaks updated
    await page.click('#tabBtnMonth');
    assert.equal(await page.textContent('#streak4AMCurrent'), '1');
    const monthTime = await page.evaluate(() => window.Tracker.Charts.getChartSnapshot('monthTimeChart'));
    assert.deepEqual(monthTime.datasets[0].data, [80, 45, 60, 45]);

    // 7. Switch to Compare tab and verify Improvement Donut + Side-by-Side Bar Chart updated
    await page.click('#tabBtnCompare');
    const impText = await page.textContent('#improvementPctValue');
    assert.equal(impText, '+100%');
    const impDonut = await page.evaluate(() => window.Tracker.Charts.getChartSnapshot('improvementDonutChart'));
    assert.ok(impDonut.datasets[0].data[0] > 0, 'Improvement donut positive slice should be > 0');

    // Toggle to Raw Values and verify exact bar values match our newly entered data
    await page.click('#barScaleRawBtn');
    const rawCompareBar = await page.evaluate(() => window.Tracker.Charts.getChartSnapshot('compareBarChart'));
    // [calls, conversations, demosSent, hoursBuilt(0.8), hoursStudied(1), workouts(1), wakeConsistency(100), avgDailyScore]
    assert.equal(rawCompareBar.datasets[1].data[0], 21);
    assert.equal(rawCompareBar.datasets[1].data[1], 6);
    assert.equal(rawCompareBar.datasets[1].data[2], 3);
    assert.equal(rawCompareBar.datasets[1].data[5], 1);
    assert.equal(rawCompareBar.datasets[1].data[6], 100);

    // Check Compare Pace & Month toggles work cleanly
    await page.click('#cmpPaceSameBtn');
    await page.click('#cmpMonthBtn');
    await page.click('#cmpWeekBtn');
    await page.click('#cmpPaceFullBtn');

    // Add more data on Today and verify Compare chart updates again!
    await page.click('#tabBtnToday');
    await page.click('[data-call-step="made"][data-delta="1"]'); // 22
    await page.click('[data-min-add="build"][data-val="30"]'); // 75 mins -> 1.3h
    await page.click('#tabBtnCompare');
    const updatedRawBar = await page.evaluate(() => window.Tracker.Charts.getChartSnapshot('compareBarChart'));
    assert.equal(updatedRawBar.datasets[1].data[0], 22);
    assert.equal(updatedRawBar.datasets[1].data[3], 1.3);

    // 8. Check Desktop viewport overflow & layout
    await page.setViewportSize({ width: 1280, height: 800 });
    const desktopOverflow = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
    }));
    assert.ok(
      desktopOverflow.scrollW <= desktopOverflow.innerW,
      `Desktop horizontal overflow detected: ${JSON.stringify(desktopOverflow)}`
    );

    // 9. Test Export -> Clear All -> Import -> Reload localStorage persistence
    await page.click('#openDataModalBtn');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#modalExportBtn'),
    ]);
    const tempBackupPath = path.join(ROOT, 'tests', '.tmp-backup.json');
    await download.saveAs(tempBackupPath);

    await page.click('#modalClearAllBtn');
    await page.click('#tabBtnToday');
    assert.equal(await page.textContent('#dailyScoreValue'), '0');

    await page.click('#openDataModalBtn');
    await page.setInputFiles('#importFileInput', tempBackupPath);
    await page.waitForSelector('#dataModal', { state: 'hidden' });

    // Reload page and confirm persistence
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.textContent('#dailyScoreValue'), String(scoreAfter4));
    assert.equal(await page.inputValue('#callsMadeInput'), '22');
    assert.equal(await page.inputValue('#minBuildInput'), '75');
    assert.equal(await page.inputValue('#dailyNoteInput'), 'Called 21 Texas HVAC businesses, sent 3 live demos.');

    if (fs.existsSync(tempBackupPath)) fs.unlinkSync(tempBackupPath);

    // 10. Verify direct file:// open also works with zero CORS/runtime errors
    const fileUrl = pathToFileURL(path.join(ROOT, 'index.html')).href;
    const filePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const fileErrors = [];
    filePage.on('pageerror', (err) => fileErrors.push(err.message));
    filePage.on('console', (msg) => {
      if (msg.type() === 'error') fileErrors.push(msg.text());
    });
    await filePage.goto(fileUrl, { waitUntil: 'load' });
    await filePage.waitForSelector('#dailyScoreValue');
    const fileChart = await filePage.evaluate(() => window.Tracker.Charts.getChartSnapshot('dayTimeChart'));
    assert.ok(fileChart && fileChart.datasets[0].data.length === 4, 'file:// mode must load Chart.js cleanly');
    assert.deepEqual(fileErrors, [], `file:// mode errors: ${fileErrors.join('; ')}`);
    await filePage.close();

    assert.deepEqual(errors, [], `Console/page errors occurred: ${errors.join('; ')}`);
    console.log('ALL E2E CHECKS PASSED (mobile + desktop, empty start, live chart updates, export/import, reload persistence, file:// mode).');
  } finally {
    await browser.close();
    server.closeAllConnections?.();
    server.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
