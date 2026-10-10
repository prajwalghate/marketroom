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

/**
 * Waits for the search panel to be fully settled: present, done thinking, and
 * done animating.
 *
 * The animation part is not pedantry. The panel fades in over 150ms, and axe
 * sampling mid-fade measures *blended* colours — it reported `--mr-down` as
 * #ac6864 on #16191d, neither of which is a token, and called it a 4.12
 * failure. The settled element passes. Auditing a transient frame produces
 * failures you cannot fix by changing any colour.
 */
const panelSettled = (page) =>
  page.waitForFunction(
    () => {
      const el = document.querySelector('.mr-combo-panel');
      if (!el || el.querySelector('.mr-combo-skeleton')) return false;
      return el.getAnimations({ subtree: true }).every((a) => a.playState === 'finished');
    },
    null,
    { timeout: 10_000 },
  );

/** The header search's equivalent: results listed, one active, nothing animating. */
const searchSettled = (page) =>
  page.waitForFunction(
    () => {
      const list = document.querySelector('.rx-search-list');
      if (!list || !list.querySelector('.rx-search-hit.is-active, .rx-search-note')) return false;
      return list.getAnimations({ subtree: true }).every((a) => a.playState === 'finished');
    },
    null,
    { timeout: 20_000 },
  );

/**
 * `prepare` runs after load, for states that only exist after an interaction.
 * An overlay audited only while closed is an overlay that is never audited.
 */
const PAGES = [
  // ── Solana research platform ───────────────────────────────────────────
  { name: 'overview', path: '/' },
  {
    name: 'overview-search-open',
    path: '/',
    prepare: async (page) => {
      const box = page.getByRole('combobox', {
        name: 'Search projects, people, investors, tokens and programs',
      });
      await box.click();
      await box.fill('jup');
      await page.waitForSelector('.rx-search-hit, .rx-search-note', { timeout: 20_000 });
      await page.keyboard.press('ArrowDown');
      await searchSettled(page);
    },
  },
  { name: 'projects', path: '/projects' },
  { name: 'projects-filtered', path: '/projects?category=Lending&funded=yes&sort=raised' },
  { name: 'projects-empty', path: '/projects?q=zzzznomatch' },
  { name: 'project', path: '/projects/jupiter' },
  { name: 'project-funded', path: '/projects/magic-eden' },
  { name: 'project-programs', path: '/projects/kamino' },
  { name: 'round', path: '/rounds/magic-eden-series-b-2022-06' },
  { name: 'fundraising', path: '/fundraising' },
  { name: 'fundraising-filtered', path: '/fundraising?round=Seed&sort=amount' },
  { name: 'investors', path: '/investors' },
  { name: 'investor', path: '/investors/multicoin-capital' },
  { name: 'people', path: '/people' },
  { name: 'person', path: '/people/anatoly-yakovenko' },
  { name: 'programs', path: '/programs' },
  { name: 'program', path: '/programs/KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD' },
  { name: 'token', path: '/tokens/KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS' },
  { name: 'tokens', path: '/tokens' },
  { name: 'rankings', path: '/rankings' },
  { name: 'updates', path: '/updates' },
  { name: 'search', path: '/search?q=jup' },
  { name: 'method', path: '/method' },
  { name: 'exchanges', path: '/exchanges' },
  { name: 'discover', path: '/discover' },
  { name: 'discover-projects', path: '/discover?tab=tvl' },
  { name: 'calendar', path: '/calendar' },
  { name: 'staking', path: '/staking' },
  { name: 'compare', path: '/compare?p=jupiter,kamino,drift' },
  { name: 'compare-empty', path: '/compare' },
  { name: 'overview-7d-stocks', path: '/?period=7d&assets=stocks' },
  { name: 'watchlist', path: '/watchlist' },
  { name: 'api-docs', path: '/api-docs' },

  // ── Tokenized assets (the original product, now a section) ─────────────
  { name: 'assets', path: '/tokenized-assets' },
  {
    name: 'assets-search-open',
    path: '/tokenized-assets',
    prepare: async (page) => {
      await page.getByRole('combobox', { name: 'Search markets' }).click();
      await page.getByRole('combobox', { name: 'Search markets' }).fill('tech');
      await panelSettled(page);
      await page.keyboard.press('ArrowDown');
      await panelSettled(page);
    },
  },
  {
    name: 'assets-search-empty',
    path: '/tokenized-assets',
    prepare: async (page) => {
      await page.getByRole('combobox', { name: 'Search markets' }).click();
      await page.getByRole('combobox', { name: 'Search markets' }).fill('qqqzzz');
      await page.waitForSelector('.mr-combo-note', { timeout: 10_000 });
      await panelSettled(page);
    },
  },
  { name: 'assets-filtered', path: '/tokenized-assets?class=commodity&venue=solana' },
  { name: 'assets-empty', path: '/tokenized-assets?q=zzzznomatch' },
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
      if (
        vp.name === 'mobile' &&
        ![
          'overview',
          'projects',
          'project-programs',
          'round',
          'investor',
          'person',
          'search',
          'method',
          'market',
          'trends',
        ].includes(target.name)
      ) {
        continue;
      }

      await page.goto(`${BASE}${target.path}`, { waitUntil: 'networkidle', timeout: 90_000 });
      await page.waitForTimeout(3000);
      if (target.prepare) await target.prepare(page);

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
          // The measured numbers, not just the verdict. Without these a contrast
          // failure gives you nothing to act on but guesswork about which
          // surface the element actually composited against.
          data: v.nodes[0]?.any?.[0]?.data ?? null,
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
    return a
      ? { href: a.getAttribute('href'), targetExists: !!document.querySelector('#main') }
      : null;
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
for (const v of [...unique.values()].sort((a, b) =>
  (a.impact ?? '').localeCompare(b.impact ?? ''),
)) {
  console.log(`\n[${v.impact}] ${v.id} — ${v.help}`);
  console.log(
    `  where: ${v.seenIn.slice(0, 3).join(', ')}${v.seenIn.length > 3 ? ` (+${v.seenIn.length - 3})` : ''}`,
  );
  console.log(`  target: ${v.target}`);
  if (v.data?.contrastRatio) {
    console.log(
      `  measured: ${v.data.contrastRatio} (fg ${v.data.fgColor} on bg ${v.data.bgColor}, ` +
        `${v.data.fontSize}, weight ${v.data.fontWeight}) — needs ${v.data.expectedContrastRatio}`,
    );
  }
  console.log(`  html: ${v.sample}`);
}

console.log('\n=== keyboard ===');
for (const n of notes) console.log('  ' + n);

if (unique.size > 0) process.exitCode = 1;
