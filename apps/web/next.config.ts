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
  ],
  experimental: {
    // Prefetch aggressively: navigation should never show a loading state.
    optimisticClientCache: true,
  },
};

export default config;
