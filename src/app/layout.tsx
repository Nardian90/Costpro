import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono, Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { GlobalSessionManager } from "@/components/GlobalSessionManager";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import QueryProvider from "@/components/providers/QueryProvider";
import { SyncProvider } from "@/components/providers/SyncProvider";
import IntelligentThemeHandler from "@/components/IntelligentThemeHandler";
import { CookieConsent } from '@/components/CookieConsent';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getLocale } from 'next-intl/server';
import { LocaleProvider } from '@/components/providers/LocaleProvider';
import { MotionPreferencesProvider } from '@/lib/motion-config';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: 'swap',
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Costpro - Sistema de Gestión Integral",
  metadataBase: new URL("https://costpro.onrender.com"),
  description: "Plataforma completa para gestión de inventario, ventas y administración de tiendas.",
  other: {
    google: "notranslate",
    category: 'business',
    classification: 'business management',
  },
  keywords: ["POS", "Inventario", "Ventas", "Gestión", "Supabase", "Costpro"],
  authors: [{ name: "Costpro Team" }],
  manifest: "/manifest.json",
  icons: {
    icon: '/logo.svg',
    apple: '/logo.svg',
  },
  openGraph: {
    title: "Costpro Enterprise",
    description: "Sistema de Gestión Integral",
    type: "website",
    images: ["/logo.svg"],
  },
  robots: {
    index: true,
    follow: true,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Costpro Enterprise',
    description: 'Sistema de Gestión Integral — Inventario, Ventas y Costos',
    images: ["/logo.svg"],
  },
};

export const viewport = {
  themeColor: "#16a34a",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  // FIX-CSP: Read the nonce injected by middleware.ts so inline scripts pass CSP
  const headersList = await headers();
  const nonce = headersList.get('x-csp-nonce') || '';

  return (
    <html lang={locale} suppressHydrationWarning className="h-full" style={{ minHeight: '100vh' }}>
      <head>
        {/* ── Theme flash prevention: inline style block (NOT inline style attributes) ──
             This ensures CSS vars are controlled by class selectors, so next-themes
             can toggle them by adding/removing 'dark' class. Inline style attributes
             would override CSS rules and prevent theme switching. */}
        {/* safe: static CSS variables — nonce handled by preview proxy */}
        <style
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
          __html: `:root{--background:#f8fafc;--foreground:#0f172a;color-scheme:light}.dark{--background:#121212;--foreground:#e4e4e7;color-scheme:dark}`,
        }} />
        {/* safe: static theme-detection script — nonce from middleware */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'){document.documentElement.classList.add('dark')}}catch(e){document.documentElement.classList.add('dark')}})()`,
          }}
        />
        {/* FIX-INF-005: Supabase preconnect — only render when URL is defined */}
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />
        )}
        {/* PWA: declarative service worker hint (W3C spec).
            Lets PWABuilder & crawlers discover /sw.js via HTML parsing,
            without waiting for the async Workbox registration in ServiceWorkerRegister. */}
        <link rel="serviceworker" href="/sw.js" scope="/" />
        {/* DIAG: Client-side splash timing diagnostic */}
        {process.env.NODE_ENV === 'development' && (
          <script
            nonce={nonce}
            suppressHydrationWarning
            dangerouslySetInnerHTML={{
              __html: `
window.__DIAG = { t0: performance.now(), phases: [] };
window.__DIAG_LOG = function(phase) {
  var e = { phase: phase, ms: Math.round(performance.now() - window.__DIAG.t0) };
  window.__DIAG.phases.push(e);
  console.log('[DIAG] ' + e.phase + ' @ ' + e.ms + 'ms');
};
window.__DIAG_LOG('script_exec');
window.addEventListener('DOMContentLoaded', function() { window.__DIAG_LOG('DOMContentLoaded'); });
window.addEventListener('load', function() { window.__DIAG_LOG('window_load'); });
setTimeout(function() {
  console.log('[DIAG] SUMMARY:', JSON.stringify(window.__DIAG.phases));
}, 15000);
`
            }}
          />
        )}
        {/* safe: static structured data — nonce from middleware */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              "name": "CostPro",
              "description": "Sistema de Gestión Integral para empresas",
              "url": "https://costpro.onrender.com",
            }),
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} ${inter.variable} font-sans antialiased bg-background text-foreground min-h-screen`}
        suppressHydrationWarning
        translate="no"
      >
        <NextIntlClientProvider messages={messages}>
          <LocaleProvider>
            <a href="#main-content" className="skip-to-content">
              {locale === 'es' ? 'Saltar al contenido principal' : 'Skip to main content'}
            </a>
            <ErrorBoundary>
              <ThemeProvider
                attribute="class" enableSystem
                defaultTheme="dark"
                disableTransitionOnChange
                themes={['light', 'dark', 'auto']}
              >
                <IntelligentThemeHandler />
                <QueryProvider>
                  <MotionPreferencesProvider>
                    <SyncProvider>
                      <GlobalSessionManager />
                      <div id="root" suppressHydrationWarning>{children}</div>
                      <Toaster position="top-right" richColors />
                      <ServiceWorkerRegister />
                      <CookieConsent />
                    </SyncProvider>
                  </MotionPreferencesProvider>
                </QueryProvider>
              </ThemeProvider>
            </ErrorBoundary>
          </LocaleProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
