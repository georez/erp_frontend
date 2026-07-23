/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  async rewrites() {
    return [
      {
        source: '/api/login/:path*',
        destination: 'http://localhost:4000/api/login/:path*',
      },
    ];
  },
};

export default nextConfig;
