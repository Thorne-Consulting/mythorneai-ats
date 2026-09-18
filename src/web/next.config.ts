import type { NextConfig } from 'next';

const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:5080';

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
      { source: '/auth/:path*', destination: `${apiOrigin}/auth/:path*` },
      { source: '/signin-oidc', destination: `${apiOrigin}/signin-oidc` },
      { source: '/signout-callback-oidc', destination: `${apiOrigin}/signout-callback-oidc` },
      { source: '/health', destination: `${apiOrigin}/health` },
    ];
  },
};

export default nextConfig;
