import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  reactStrictMode: true,
  serverExternalPackages: ["jspdf", "fflate", "pdf-parse", "d3", "chart.js", "react-chartjs-2"],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live https://vercel.com https://storage.googleapis.com https://apis.google.com",
              "worker-src 'self' blob:",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' blob: data: https://wthkddeleylijmonclxg.supabase.co https://vercel.com https://vercel.live https://*.googleusercontent.com",
              "font-src 'self' data:",
              "connect-src 'self' https://wthkddeleylijmonclxg.supabase.co wss://wthkddeleylijmonclxg.supabase.co https://vercel.live https://vercel.com https://storage.googleapis.com https://accounts.google.com",
              "frame-src 'self' blob: data: https://vercel.live https://vercel.com https://accounts.google.com",
              "frame-ancestors 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'wthkddeleylijmonclxg.supabase.co', port: '', pathname: '/storage/v1/object/public/**' },
      { protocol: 'https', hostname: '*.googleusercontent.com' }
    ],
  },
};

export default nextConfig;
