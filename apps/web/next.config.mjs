/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Consume the local workspace contract package from source (no pre-build needed).
  transpilePackages: ['@agent-builder/shared-contracts'],
  // Proxy API, SSE, and health requests to the NestJS backend during dev.
  async rewrites() {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';
    return [
      { source: '/api/:path*', destination: `${apiBase}/api/:path*` },
      { source: '/health/:path*', destination: `${apiBase}/health/:path*` },
    ];
  },
};

export default nextConfig;
