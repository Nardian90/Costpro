import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: ['*'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com',
      },
    ],
  },
  experimental: {
    optimizePackageImports: ['lodash', 'd3', 'xlsx'],
  },
};

// Bundle analyzer wrapper — activated via ANALYZE=true env var
const withBundleAnalyzer = (typeof process !== 'undefined' && process.env.ANALYZE === 'true')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ? require('@next/bundle-analyzer')({ enabled: true })
  : (config: NextConfig) => config;

export default withBundleAnalyzer(nextConfig);
