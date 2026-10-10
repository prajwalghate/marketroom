import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source rather than a build step — one
  // less thing to run, and it keeps hot reload instant across package edits.
  transpilePackages: [
    '@marketroom/core',
    '@marketroom/ui',
    '@marketroom/adapters',
    '@marketroom/catalog',
    '@marketroom/db',
  ],
  // Database drivers load native-adjacent assets (PGlite's WebAssembly build,
  // postgres.js's socket code) that must be required from node_modules at
  // runtime rather than bundled.
  serverExternalPackages: ['@electric-sql/pglite', 'postgres'],
  // The embedded development database under .data/ is reached through a path
  // the tracer can follow; it must never ship inside a deployment. Keyed to
  // app routes only: a bare '*' also reaches Next's own server trace, where
  // the pattern is matched unanchored and would drop PGlite's `pglite.data`.
  outputFileTracingExcludes: { '/**': ['.data/pglite/**'] },
  experimental: {
    // Prefetch aggressively: navigation should never show a loading state.
    optimisticClientCache: true,
  },
};

export default config;
