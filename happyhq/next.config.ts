import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: false,
  serverExternalPackages: ['@hyzyla/pdfium'],
  // The Agent SDK loads its CLI binary from a platform-specific package whose
  // name is computed at runtime (`@anthropic-ai/claude-agent-sdk-${platform}-${arch}`).
  // Next's static tracer can't follow that, so the package gets stripped from
  // the standalone output. Force-include all platform variants so the deployed
  // image always has the binary that matches the resolved SDK version.
  outputFileTracingIncludes: {
    '*': ['../node_modules/.pnpm/@anthropic-ai+claude-agent-sdk-*/**'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'files.instantdb.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'instant-storage.s3.amazonaws.com',
        pathname: '/**',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
    proxyClientMaxBodySize: '100mb',
  },
}

export default nextConfig
