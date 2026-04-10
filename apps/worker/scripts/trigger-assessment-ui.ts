#!/usr/bin/env npx tsx
/**
 * Playwright: log into UI, open the Assessment tab, and click the "Start
 * Assessment" / "Re-Extract" button to kick off a REAL worker extraction
 * through the full server → worker → DB pipeline.
 *
 * The local server (APP_ENV=stg, NODE_ENV=development) will spawn
 * apps/worker/src/index.ts as a child process. Worker writes findings
 * to the staging DB, and the UI polls /assessment/status until it's done.
 */
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5173';
const EMAIL = 'daniel@gaialabs.ai';
const PASSWORD = 'wkiN3jgh!982';
const PROJECT_NAME = 'All Cloud Test 2';

async function main() {
  console.log('=== Trigger Assessment Run via UI ===\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('pageerror', (err) => console.log(`[PAGE ERROR] ${err.message}`));
  page.on('response', (r) => {
    if (r.url().includes('/assessment/') && r.request().method() !== 'OPTIONS') {
      console.log(`[HTTP ${r.status()}] ${r.request().method()} ${r.url().replace(BASE_URL, '').replace('http://localhost:3000', '')}`);
    }
  });

  console.log('Logging in...');
  await page.goto(`${BASE_URL}/login`);
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForFunction(() => !location.pathname.includes('/login'), { timeout: 20000 });

  console.log('Navigating to /projects...');
  await page.goto(`${BASE_URL}/projects`);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

  console.log(`Opening project: ${PROJECT_NAME}...`);
  await page.waitForSelector(`text=${PROJECT_NAME}`, { timeout: 15000 });
  await page.click(`text=${PROJECT_NAME}`);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

  console.log('Navigating to Assessment tab...');
  const assessmentLink = page.locator('a:has-text("Assessment"), button:has-text("Assessment")').first();
  if ((await assessmentLink.count()) > 0) {
    await assessmentLink.click();
  }
  await page.waitForTimeout(2000);

  console.log('Looking for assessment-trigger button...');
  await page.screenshot({ path: 'apps/worker/output/ui-before-click.png', fullPage: false });

  // The empty-state button text is "Go to Overview" (i18n label) but it calls
  // startRun.mutate() — same action as "Re-Extract" on the populated view.
  let btn = page.locator('button:has-text("Re-Extract")').first();
  if ((await btn.count()) === 0) {
    btn = page.locator('button:has-text("Start Assessment")').first();
  }
  if ((await btn.count()) === 0) {
    btn = page.locator('button:has-text("Go to Overview")').first();
  }

  if ((await btn.count()) === 0) {
    console.log('❌ No assessment-trigger button found. Dumping body text...');
    const body = await page.textContent('body');
    console.log(body?.slice(0, 500));
    await browser.close();
    process.exit(1);
  }

  console.log('✓ Found button — clicking...');
  await btn.click();
  console.log('\nAssessment run triggered. Watching for status changes...\n');

  // Watch for status messages in the UI for up to 3 minutes
  const start = Date.now();
  const timeoutMs = 3 * 60 * 1000;
  let lastStatus = '';
  while (Date.now() - start < timeoutMs) {
    const statusEl = page.locator('text=/Extraction .*%/i, text=/completed|failed/i').first();
    if ((await statusEl.count()) > 0) {
      const text = (await statusEl.textContent())?.trim();
      if (text && text !== lastStatus) {
        console.log(`  [${new Date().toLocaleTimeString()}] ${text}`);
        lastStatus = text;
        if (/completed|failed/i.test(text)) break;
      }
    }
    await page.waitForTimeout(3000);
  }

  await page.screenshot({ path: 'apps/worker/output/ui-after-run.png', fullPage: true });
  console.log('\nSaved: apps/worker/output/ui-after-run.png');
  console.log('\nBrowser stays open. Ctrl+C to close.');
  await new Promise(() => {});
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
