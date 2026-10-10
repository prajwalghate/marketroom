import { defineConfig } from 'drizzle-kit';

/**
 * `pnpm --filter @marketroom/db generate` diffs `src/schema.ts` against the
 * last migration, writes the next SQL migration into `drizzle/`, then embeds
 * every migration into `src/migrations.ts` — which is what the app runs, so a
 * deployment never depends on reading SQL files from disk.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
});
