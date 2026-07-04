import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: false, // FIX-INF-017
  },
  reactStrictMode: true, // FIX-INF-018
  allowedDevOrigins: ['http://localhost:3000'], // FIX-INF-009
  serverExternalPackages: [
    '@opentelemetry/api',
    '@opentelemetry/sdk-node',
    '@opentelemetry/auto-instrumentations-node',
    '@opentelemetry/exporter-trace-otlp-http',
    '@google/generative-ai',
    'z-ai-web-dev-sdk',
    '@whiskeysockets/baileys',
    '@hapi/boom',
  ],
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

// Sentry wrapper — https://docs.sentry.io/platforms/javascript/guides/nextjs/
const withSentry = withSentryConfig(nextConfig, {
  org: "costpro",
  project: "costpro-enterprise",

  // Only print logs for uploading source maps in production builds
  silent: true,

  // Upload source maps for better stack traces (disabled in dev)
  sourcemaps: {
    disable: process.env.NODE_ENV === 'development',
  },

  // Wider patterns for source maps
  widenClientFileUpload: true,

  // Disable automatic tunnel route creation (we handle it manually via /api/monitoring)
  tunnelRoute: undefined,

  // FIX-DEPRECATION (2026-07-04): automaticVercelMonitors moved to webpack config
  // and is not supported with Turbopack. Disable completely to remove warning.
  // When we switch to webpack, use: webpack: { automaticVercelMonitors: false }
  // For now with Turbopack, we omit it entirely.
});

export default withBundleAnalyzer(withNextIntl(withSentry));
