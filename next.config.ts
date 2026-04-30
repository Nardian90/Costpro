import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  serverExternalPackages: ["jspdf", "fflate", "pdf-parse", "d3", "chart.js", "react-chartjs-2"],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'wthkddeleylijmonclxg.supabase.co', port: '', pathname: '/storage/v1/object/public/**' },
      { protocol: 'https', hostname: '*.googleusercontent.com' }
    ],
  },
};

export default nextConfig;
