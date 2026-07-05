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
import { PWAUpdateBanner } from '@/components/ui/PWAUpdateBanner';

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
  title: {
    default: "CostPro — Software de Gestión, Fichas de Costo e Inventario para MIPYMES en Cuba",
    template: "%s | CostPro",
  },
  metadataBase: new URL("https://costpro4.vercel.app"),
  description: "CostPro: sistema integral de gestión para MIPYMES cubanas. Fichas de costo Res. 148/2023, inventario en tiempo real, POS, vitrina online, inteligencia cambiaria y más. Prueba gratis.",
  other: {
    google: "notranslate",
    category: 'business',
    classification: 'business management',
  },
  keywords: [
    "ficha de costo Cuba",
    "ficha de costo Resolución 148",
    "software MIPYMES Cuba",
    "sistema de inventario Cuba",
    "POS Cuba",
    "punto de venta Cuba",
    "gestión empresarial Cuba",
    "CostPro",
    "ficha de costos y gastos",
    "software contable Cuba",
    "inventario en tiempo real",
    "vitrina online Cuba",
    "inteligencia cambiaria",
    "gestión multi-tienda",
  ],
  authors: [{ name: "CostPro Team" }],
  creator: "CostPro",
  publisher: "CostPro",
  manifest: "/manifest.json",
  icons: {
    icon: '/logo.svg',
    apple: '/icons/icon-192.png',
  },
  openGraph: {
    title: "CostPro — Software de Gestión para MIPYMES Cubanas",
    description: "Fichas de costo Res. 148/2023, inventario, POS, vitrina online e inteligencia cambiaria en una sola plataforma. Prueba gratis.",
    type: "website",
    locale: "es_ES",
    siteName: "CostPro",
    url: "https://costpro4.vercel.app",
    images: [
      {
        url: "/logo.svg",
        width: 512,
        height: 512,
        alt: "CostPro — Software de Gestión Integral",
      },
    ],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CostPro — Software de Gestión para MIPYMES Cubanas',
    description: 'Fichas de costo Res. 148/2023, inventario, POS, vitrina online e inteligencia cambiaria.',
    images: ["/logo.svg"],
  },
  alternates: {
    canonical: "https://costpro4.vercel.app",
  },
  category: 'business',
};

export const viewport = {
  themeColor: "#16a34a",
  width: "device-width",
  initialScale: 1,
  // FIX-AUDIT-MOBILE-C2: viewport-fit=cover es REQUIRED para que env(safe-area-inset-*)
  // funcione en iOS notch y Android gesture bar. Sin esto, las safe areas del
  // MobileTabBar, Header, POSCart y StickyCartSummary devuelven 0 y el contenido
  // queda bajo la barra del sistema.
  viewportFit: 'cover' as const,
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
        {/* ── FIX-AUDIT-MOBILE-C3: PWA meta tags para iOS ──
             apple-mobile-web-app-capable=yes → iOS Safari abre fullscreen al añadir a home
             apple-mobile-web-app-status-bar-style=black-translucent → status bar integrada
             mobile-web-app-capable=yes → Android Chrome standalone */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* FIX-AUDIT-MOBILE-B2: eliminar flash gris al tap en Android */}
        <meta name="theme-color" content="#16a34a" />

        {/* ── SEO: JSON-LD Structured Data (schema.org SoftwareApplication) ──
             Google usa esto para rich snippets en resultados de búsqueda.
             Tipo: SoftwareApplication con subtipo WebApplication.
             Incluye: nombre, descripción, precio, categoría, oferta, ratings.
             FIX-HYDRATION (2026-07-05): suppressHydrationWarning para evitar
             mismatch del nonce (server lo genera vacío, cliente lo tiene real). */}
        <script
          type="application/ld+json"
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "CostPro",
              "description": "Sistema integral de gestión para MIPYMES cubanas. Fichas de costo Res. 148/2023, inventario en tiempo real, POS, vitrina online, inteligencia cambiaria y más.",
              "url": "https://costpro4.vercel.app",
              "applicationCategory": "BusinessApplication",
              "applicationSubCategory": "Inventory & Cost Management",
              "operatingSystem": "Web (any browser)",
              "browserRequirements": "Requires JavaScript",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD",
                "description": "Prueba gratuita disponible",
              },
              "featureList": [
                "Fichas de costo Resolución 148/2023",
                "Gestión de inventario en tiempo real",
                "Punto de venta (POS)",
                "Vitrina online pública configurable",
                "Inteligencia cambiaria (BCC, elToque, solucionescuba.com)",
                "Gestión multi-tienda",
                "Tabla dinámica de análisis (pivot table)",
                "Exportación a Excel y PDF",
                "Bot de WhatsApp con IA",
                "Bot de Telegram con IA",
                "Centro de análisis dinámico de costos",
                "Gestión de trabajadores y comisiones",
              ],
              "audience": {
                "@type": "Audience",
                "audienceType": "MIPYMES, empresas cubanas, cooperativas",
              },
              "areaServed": {
                "@type": "Country",
                "name": "Cuba",
              },
              "inLanguage": "es-CU",
              "publisher": {
                "@type": "Organization",
                "name": "CostPro",
                "url": "https://costpro4.vercel.app",
              },
            }).replace(/<\/script/gi, '<\\/script'),
          }}
        />
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
        {/* PWA: explicit vanilla JS service worker registration.
            Lets PWABuilder & crawlers discover /sw.js immediately via HTML parsing or early execution,
            without waiting for the async Workbox registration in the client component. */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js'); }`
          }}
        />
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
                      <Toaster position="top-center" richColors />
                      <ServiceWorkerRegister />
                      <PWAUpdateBanner />
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
