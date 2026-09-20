import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const isVercel = !!process.env.VERCEL;

const nextConfig: NextConfig = {
  // FIX-DEPLOY (2026-07-10): output standalone para Docker/Render.
  // FIX-VERCEL (2026-08-06): NO usar standalone en Vercel — causa
  //   "ENOENT: .next/next-server.js.nft.json" porque Vercel tiene su propio
  //   sistema de deployment y standalone no genera los archivos que Vercel espera.
  //   Solo se activa cuando NO estamos en Vercel (Docker, Render, PM2, etc).
  ...(isVercel ? {} : { output: 'standalone' as const }),
  typescript: {
    ignoreBuildErrors: false, // FIX-INF-017
  },
  reactStrictMode: true, // FIX-INF-018
  // FIX-SPLASH-DEV-ORIGINS (2026-09-20): el matcher de Next.js compara el HOSTNAME
  // (sin protocolo) contra cada patrón (ver csrf-protection.js matchWildcardDomain).
  // Los patrones con prefijo "https://" nunca matchean → todos los chunks /_next/*
  // devolvían 403 al acceder vía el dominio preview → la app quedaba congelada en
  // el splash (el HTML cargaba pero ningún JS se hidrataba).
  // Patrón correcto: hostname puro, wildcard "*.space-z.ai" cubre cualquier sesión.
  allowedDevOrigins: [
    'localhost',
    'space-z.ai',
    '*.space-z.ai', // FIX-PREVIEW: wildcard de subdominios (cualquier preview-chat-*)
  ],
  serverExternalPackages: [
    '@opentelemetry/api',
    '@opentelemetry/sdk-node',
    '@opentelemetry/resources',
    '@opentelemetry/sdk-trace-base',
    '@opentelemetry/semantic-conventions',
    '@google/generative-ai',
    'z-ai-web-dev-sdk',
    '@whiskeysockets/baileys',
    '@hapi/boom',
    'crypto-js', // FIX-TRM (2026-07-05): evitar que Turbopack intente bundlear crypto-js
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
    optimizePackageImports: ['lodash', 'd3', '@e965/xlsx'],
  },
};

// Bundle analyzer wrapper — activated via ANALYZE=true env var
const withBundleAnalyzer = (typeof process !== 'undefined' && process.env.ANALYZE === 'true')
   
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
