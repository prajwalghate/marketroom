/**
 * Render every page at every breakpoint in a real browser and save PNGs.
 *
 * The in-app preview pane never composites in this environment
 * (`document.hidden` is permanently true), so nothing visual could be checked
 * — only DOM structure. Headless Chromium actually paints, which is the only
 * way to see whether the layout is right rather than merely present.
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = process.env.SHOT_DIR ?? '.screenshots';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 820, height: 1100 },
  { name: 'mobile', width: 390, height: 844 },
];

const PAGES = [
  { name: 'home', path: '/' },
  { name: 'home-filtered', path: '/?class=commodity' },
  { name: 'market-nvda', path: '/market/nvda' },
  { name: 'market-gold', path: '/market/gold' },
  { name: 'trends', path: '/trends' },
  { name: 'about', path: '/about' },
];

const browser = await chromium.launch();
const problems = [];

for (const vp of VIEWPORTS) {
  for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    // Theme is stored per-origin and read by an inline script before paint.
    await page.addInitScript((t) => {
      try {
        localStorage.setItem('mr-theme', t);
      } catch {
        /* private mode */
      }
    }, theme);

    const consoleErrors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160));
    });
    page.on('pageerror', (e) => consoleErrors.push(`PAGEERROR ${String(e).slice(0, 160)}`));

    for (const target of PAGES) {
      // Mobile/tablet only need the key pages; shooting everything triples the
      // run for little extra signal.
      if (vp.name !== 'desktop' && !['home', 'market-nvda', 'trends'].includes(target.name)) {
        continue;
      }

      await page.goto(`${BASE}${target.path}`, { waitUntil: 'networkidle', timeout: 90_000 });
      // Let streamed panels and the virtualizer settle.
      await page.waitForTimeout(3500);

      const file = `${OUT}/${vp.name}-${theme}-${target.name}.png`;
      await page.screenshot({ path: file, fullPage: vp.name === 'desktop' });

      // Objective layout checks the eye would have to catch otherwise.
      const metrics = await page.evaluate(() => {
        const d = document.documentElement;
        const overflowing = [...document.querySelectorAll('*')]
          .filter((e) => e.getBoundingClientRect().right > d.clientWidth + 1)
          .map((e) => (typeof e.className === 'string' ? e.className : e.tagName).slice(0, 40));
        return {
          scrollWidth: d.scrollWidth,
          clientWidth: d.clientWidth,
          horizontalOverflow: d.scrollWidth > d.clientWidth + 1,
          overflowingCount: overflowing.length,
          overflowingSample: [...new Set(overflowing)].slice(0, 4),
        };
      });

      if (metrics.horizontalOverflow) {
        problems.push(
          `${vp.name}/${theme}/${target.name}: horizontal overflow ` +
            `${metrics.scrollWidth} > ${metrics.clientWidth} — ${metrics.overflowingSample.join(', ')}`,
        );
      }
      if (consoleErrors.length) {
        problems.push(`${vp.name}/${theme}/${target.name}: console ${consoleErrors[0]}`);
        consoleErrors.length = 0;
      }
    }

    await context.close();
  }
}

await browser.close();

console.log(problems.length ? 'PROBLEMS:' : 'No layout/console problems detected.');
for (const p of problems) console.log('  ✗ ' + p);

if (problems.length > 0) process.exitCode = 1;
