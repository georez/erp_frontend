import { BACKEND_URL } from './src/utils/backend.js';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // `next build` also writes a self-contained server to .next/standalone (server.js plus only the node_modules
  // files the app uses) for the Docker image; see Dockerfile. `npm run dev` is unaffected.
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        // Passes the browser's headers on unchanged, including Apache's X-Forwarded-For.
        // Fixed at build time: BACKEND_URL must be set for `next build` (see src/utils/backend.js).
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
