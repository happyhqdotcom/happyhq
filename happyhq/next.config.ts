import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: false,
  serverExternalPackages: ['@hyzyla/pdfium'],
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
    middlewareClientMaxBodySize: '100mb',
  },
}

export default nextConfig
