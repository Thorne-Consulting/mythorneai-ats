import type { NextConfig } from 'next';

const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:5080';

const nextConfig: NextConfig = {
  output: 'standalone',
  async redirects() {
    return [
      { source: '/requisitions/:path*', destination: '/jobs/:path*', permanent: true },
      // The sidebar's Pipeline shortcut is gone; a job's Pipeline tab is the board.
      { source: '/pipeline', destination: '/jobs', permanent: true },
    ];
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
      { source: '/public/:path*', destination: `${apiOrigin}/public/:path*` },
      { source: '/auth/:path*', destination: `${apiOrigin}/auth/:path*` },
      { source: '/signin-oidc', destination: `${apiOrigin}/signin-oidc` },
      { source: '/signout-callback-oidc', destination: `${apiOrigin}/signout-callback-oidc` },
      { source: '/health', destination: `${apiOrigin}/health` },
      // The public API's docs (Scalar) and OpenAPI documents.
      { source: '/docs', destination: `${apiOrigin}/docs` },
      { source: '/docs/:path*', destination: `${apiOrigin}/docs/:path*` },
      { source: '/openapi/:path*', destination: `${apiOrigin}/openapi/:path*` },
    ];
  },
};

export default nextConfig;
