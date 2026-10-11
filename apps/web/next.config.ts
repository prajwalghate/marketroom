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
  // The site is public and its source is too. No other site may frame it
  // (clickjacking an editor), browsers may not guess content types, and
  // referrers stop at the origin when leaving.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        // The editors' dashboard never belongs in a search index.
        source: '/admin/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ];
  },
};

export default config;
