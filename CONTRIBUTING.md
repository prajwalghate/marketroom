# Contributing

Two people work on this repo in parallel. Everything below exists to keep merges boring.

---

## Branching

Trunk-based. `main` is always deployable.

```
main                      protected · squash-merge only · linear history
└── feat/<scope>          short-lived, < 2 days
    fix/<scope>
    chore/<scope>
    docs/<scope>
```

Scope is the package or area you're touching:

```
feat/adapters-funding-rate
fix/ui-sparkline-clipping
chore/deps-next-15-2
docs/adr-venue-abstraction
```

**Keep branches short.** A branch alive for a week is the single most reliable way to
create a painful merge. If a piece of work won't land in two days, split it.

---

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), scoped by package:

```
feat(adapters): add Solana holder counts to Quote
fix(core): treat Jupiter priceChange as a percentage
chore(web): bump Next to 15.1.6
docs(research): add data-source study
test(core): cover venueSpread null cases
```

Scoping by package means `git log --oneline` reads as a map of the repo, and
`git log -- packages/adapters` gives one person's working history.

---

## Pull requests

- One concern per PR. If the title needs an "and", split it.
- Self-review the diff first — it catches most of what review would.
- CI must be green: typecheck → lint → test → build → catalog coverage.
- Vercel posts a preview URL on every PR.
- With two people, review is a ~5-minute sanity pass, not a gate. Don't let a PR sit.

---

## Avoiding merge conflicts

The repo layout is the strategy. These are the rules that make it work.

### 1. One file per asset in the catalog

```
packages/catalog/src/assets/nvda.ts
packages/catalog/src/assets/gold.ts
```

Adding NVDA and GOLD touches two different files. **Never consolidate these into one
array** — that reintroduces exactly the conflict this layout prevents.

The one shared file is `assets/index.ts` (the barrel). It is append-only and sorted, so
conflicts there are trivial: keep both lines.

### 2. Respect package boundaries

| Package    | Owns                                                              |
| ---------- | ----------------------------------------------------------------- |
| `core`     | Entities, derivations, formatting, search. **Zero dependencies.** |
| `adapters` | All network I/O. Nothing else may call `fetch`.                   |
| `catalog`  | Curated data only. No logic.                                      |
| `ui`       | Presentational. No I/O, no data fetching.                         |
| `web`      | Composition. Routes are thin shells.                              |

Dependencies point inward: `web → ui → core`, `web → adapters → core`. ESLint enforces it.

If you find yourself editing a package that isn't yours to make your change work, that's a
signal the boundary is wrong — raise it rather than reaching across.

### 3. Lockfile changes go in their own PR

`pnpm-lock.yaml` conflicts are the most common silent merge pain in a JS monorepo. Add a
dependency in a small PR, merge it fast, then build on top.

### 4. `core` is append-mostly

Add fields to `Quote` or `Listing`; avoid reshaping existing ones. A rename in `core`
touches every package simultaneously.

### 5. Rebase, don't merge

```bash
git fetch origin && git rebase origin/main
```

Keeps history linear and conflicts small and local.

---

## Suggested split

Not binding — just the lowest-friction seam.

|              |                                                      |
| ------------ | ---------------------------------------------------- |
| **Person A** | `adapters/` · `core/` · caching & the snapshot route |
| **Person B** | `ui/` · `web/app/` routes · charts · trends          |
| **Shared**   | `catalog/` — one file each, never collides           |

---

## Adding a market

1. Create `packages/catalog/src/assets/<id>.ts` (copy a neighbour).
2. Add the two lines to `assets/index.ts`.
3. `pnpm catalog:check` — confirms the venue symbol resolves.

The coverage check fails CI when the live venue lists a market the catalog doesn't know
about. This is deliberate: the reference we started from had drifted to covering only 48%
of its venue, and nothing told anyone.

---

## Adding a venue

1. Implement `VenueAdapter` in `packages/adapters/src/<venue>/`.
2. Declare `capabilities` honestly — the UI renders from it.
3. Register it in `createAdapters()`.
4. Add venue symbols to catalog entries.

`core` and `ui` should not need to change. If they do, the abstraction is leaking.

---

## Before you push

```bash
pnpm typecheck && pnpm test && pnpm lint
```

Husky runs lint-staged on commit, but CI runs the full suite.
