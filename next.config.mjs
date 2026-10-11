// Same variable and default as src/utils/backend.js. Read here directly: importing that file from this config
// makes Node warn that it's an ES module in a package without "type": "module".
const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:4000';

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
