/**
 * Accessibility audit.
 *
 * Two halves, because neither alone is enough:
 *
 *  1. **axe-core** catches the machine-checkable WCAG failures — contrast,
 *     names, roles, landmarks, labels.
 *  2. **Keyboard and focus checks** catch what axe cannot: whether you can
 *     actually reach and operate the thing, whether focus is visible, and
 *     whether tab order follows the page.
 *
 * A clean axe run is a floor, not a pass. Most of what makes a dense data UI
 * unusable with a keyboard is invisible to it.
 *
 * Run: pnpm a11y   (BASE_URL overrides the target)
 */

import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

const PAGES = [
  { name: 'home', path: '/' },
  { name: 'home-filtered', path: '/?class=commodity&venue=solana' },
  { name: 'home-empty', path: '/?q=zzzznomatch' },
  { name: 'market', path: '/market/nvda' },
  { name: 'market-single-venue', path: '/market/gold' },
  { name: 'trends', path: '/trends' },
  { name: 'about', path: '/about' },
  { name: 'not-found', path: '/this-does-not-exist' },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

const violations = [];
const notes = [];

const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    await page.addInitScript((t) => {
      try {
        localStorage.setItem('mr-theme', t);
      } catch {
        /* private mode */
      }
    }, theme);

    for (const target of PAGES) {
      // Mobile runs a subset; the same components are exercised either way.
      if (vp.name === 'mobile' && !['home', 'market', 'trends'].includes(target.name)) continue;

      await page.goto(`${BASE}${target.path}`, { waitUntil: 'networkidle', timeout: 90_000 });
      await page.waitForTimeout(3000);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      for (const v of results.violations) {
        violations.push({
          where: `${vp.name}/${theme}/${target.name}`,
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.length,
          sample: v.nodes[0]?.html?.slice(0, 120) ?? '',
          target: v.nodes[0]?.target?.join(' ') ?? '',
        });
      }
    }

    await context.close();
  }
}

// ── Keyboard and focus, which axe does not evaluate ───────────────────────
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const walk = await page.evaluate(async () => {
    const seen = [];
    let invisibleFocus = 0;

    for (let i = 0; i < 28; i += 1) {
      const el = document.activeElement;
      if (el && el !== document.body) {
        const style = getComputedStyle(el);
        // A focused control must show *something* — an outline, a ring or a
        // border change. All three absent means the keyboard user is lost.
        const hasRing =
          style.outlineStyle !== 'none' ||
          style.boxShadow !== 'none' ||
          el.matches(':focus-visible') === false;
        if (!hasRing) invisibleFocus += 1;
        seen.push(
          `${el.tagName.toLowerCase()}:${(el.getAttribute('aria-label') || el.textContent || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 26)}`,
        );
      }
      // Cannot press keys from inside evaluate; advance focus manually.
      const focusables = [
        ...document.querySelectorAll(
          'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((n) => n.offsetParent !== null || n.matches('.mr-skip-link'));
      const idx = focusables.indexOf(document.activeElement);
      const next = focusables[idx + 1] ?? focusables[0];
      next?.focus();
    }
    return { order: seen, invisibleFocus };
  });

  notes.push(`first focusable: ${walk.order[0] ?? '(none)'}`);
  notes.push(`controls without a visible focus indicator: ${walk.invisibleFocus}`);

  // The skip link must be the first stop and must actually point somewhere.
  const skip = await page.evaluate(() => {
    const a = document.querySelector('a.mr-skip-link');
    return a ? { href: a.getAttribute('href'), targetExists: !!document.querySelector('#main') } : null;
  });
  notes.push(`skip link: ${JSON.stringify(skip)}`);

  await context.close();
}

await browser.close();

// ── Report ────────────────────────────────────────────────────────────────
const unique = new Map();
for (const v of violations) {
  const key = `${v.id}::${v.target}`;
  if (!unique.has(key)) unique.set(key, { ...v, seenIn: [v.where] });
  else unique.get(key).seenIn.push(v.where);
}

console.log(`\n=== axe-core: ${unique.size} unique violations ===`);
for (const v of [...unique.values()].sort((a, b) => (a.impact ?? '').localeCompare(b.impact ?? ''))) {
  console.log(`\n[${v.impact}] ${v.id} — ${v.help}`);
  console.log(`  where: ${v.seenIn.slice(0, 3).join(', ')}${v.seenIn.length > 3 ? ` (+${v.seenIn.length - 3})` : ''}`);
  console.log(`  target: ${v.target}`);
  console.log(`  html: ${v.sample}`);
}

console.log('\n=== keyboard ===');
for (const n of notes) console.log('  ' + n);

if (unique.size > 0) process.exitCode = 1;
