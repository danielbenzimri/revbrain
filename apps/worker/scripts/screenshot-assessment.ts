#!/usr/bin/env npx tsx
/**
 * Playwright script: log in, navigate to the Assessment page for the project
 * that now has a completed extraction run, and screenshot the new PDF-parity
 * UI sections (At A Glance, Deep Dives, Related Functionality).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = 'http://localhost:5173';
const EMAIL = 'daniel@gaialabs.ai';
const PASSWORD = 'wkiN3jgh!982';
const PROJECT_NAME = 'All Cloud Test 2';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '../output');
mkdirSync(outDir, { recursive: true });

async function main() {
  console.log('=== Playwright: Screenshot Assessment UI ===\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 2400 } });
  const page = await context.newPage();

  page.on('pageerror', (err) => console.log(`[PAGE ERROR] ${err.message}`));

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
  // The workspace sidebar has an "Assessment" item
  const assessmentLink = page.locator('a:has-text("Assessment"), button:has-text("Assessment")').first();
  if ((await assessmentLink.count()) > 0) {
    await assessmentLink.click();
  } else {
    // Fallback: navigate via URL
    const url = page.url();
    const match = url.match(/\/project\/([^/?]+)/);
    if (match) {
      await page.goto(`${BASE_URL}/project/${match[1]}/assessment`);
    }
  }
  await page.waitForTimeout(4000);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

  console.log('Assessment page loaded. Capturing screenshots...');

  // Full page screenshot
  await page.screenshot({
    path: resolve(outDir, 'ui-assessment-full.png'),
    fullPage: true,
  });
  console.log('  → ui-assessment-full.png');

  // Scroll & capture specific sections with section headings
  const headings = [
    'CPQ at a Glance',
    'Product Deep Dive',
    'Bundles & Options Deep Dive',
    'Related Functionality',
    '90-Day Quoting Activity',
    'Installed Packages',
  ];
  for (const h of headings) {
    const loc = page.locator(`text=${h}`).first();
    if ((await loc.count()) > 0) {
      console.log(`  ✓ Found: ${h}`);
    } else {
      console.log(`  ✗ MISSING: ${h}`);
    }
  }

  await browser.close();
  console.log(`\nScreenshots saved to: ${outDir}`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
