import type { Metadata } from "next";
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
import { headers } from 'next/headers';
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
  const nonce = (await headers()).get('x-nonce') ?? '';
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning className="h-full" style={{ minHeight: '100vh' }}>
      <head>
        {/* ── Theme flash prevention: inline style block (NOT inline style attributes) ──
             This ensures CSS vars are controlled by class selectors, so next-themes
             can toggle them by adding/removing 'dark' class. Inline style attributes
             would override CSS rules and prevent theme switching. */}
        {/* safe: static CSS variables, no user input */}
        <style
          nonce={nonce}
          dangerouslySetInnerHTML={{
          __html: `:root{--background:#f8fafc;--foreground:#0f172a;color-scheme:light}.dark{--background:#000000;--foreground:#ffffff;color-scheme:dark}`,
        }} />
        {/* safe: static theme-detection script, no user input */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'){document.documentElement.classList.add('dark')}}catch(e){document.documentElement.classList.add('dark')}})()`,
          }}
        />
        {/* FIX-INF-005: Supabase preconnect — no hardcoded fallback */}
        <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL || ''} />
        {/* safe: static structured data, no user input */}
        <script
          nonce={nonce}
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
                      <main id="main-content">{children}</main>
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
