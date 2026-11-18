import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono, Space_Grotesk, Inter, Archivo, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
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

/* ADN-BRAND-HERO-REFINEMENT-002 — voces tipográficas del hero editorial:
   - Archivo (variable, eje wdth): sans monumental expandida para el titular.
   - Instrument Serif: voz editorial de acento (una palabra del titular).
   Fallbacks: Space Grotesk / Geist — si la descarga de la fuente falla el
   hero se degrada con elegancia (misma jerarquía, menor expresividad). */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  display: 'swap',
  axes: ["wdth"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: "ADNegocio — Plataforma Empresarial Integral: Finanzas, Ventas, Inventario y Vitrina Digital",
    template: "%s | ADNegocio",
  },
  metadataBase: new URL("https://costpro4.vercel.app"), // dominio técnico sin cambio (misión §14)
  description: "ADNegocio: plataforma empresarial integral para administrar, controlar y comprender las operaciones de tu empresa. Finanzas con estados financieros, ventas multi-tienda, inventario, compras, fichas de costo Res. 148/2023 y vitrina digital.",
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
    "ADNegocio",
    "estados financieros",
    "ficha de costos y gastos",
    "software contable Cuba",
    "inventario en tiempo real",
    "vitrina online Cuba",
    "inteligencia cambiaria",
    "gestión multi-tienda",
  ],
  authors: [{ name: "ADNegocio" }],
  creator: "ADNegocio",
  publisher: "ADNegocio",
  manifest: "/manifest.json",
  /* ADN-LANDING-FINAL-POLISH-003 §7: favicon N geométrica original — todas
     las variantes (SVG, ICO, PNG de manifest, apple-touch y PWA) apuntan al
     MISMO símbolo aprobado. Antes: isotipo ADN cuyas letras se recortaban. */
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: '48x48', type: 'image/x-icon' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: "ADNegocio — Plataforma Empresarial Integral",
    description: "Administra, controla y comprende las operaciones de tu empresa: finanzas, ventas, inventario, compras y vitrina digital en una sola plataforma.",
    type: "website",
    locale: "es_ES",
    siteName: "ADNegocio",
    url: "https://costpro4.vercel.app",
    images: [
      {
        url: "/logo.svg",
        width: 512,
        height: 512,
        alt: "ADNegocio — Plataforma Empresarial Integral",
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
    title: 'ADNegocio — Plataforma Empresarial Integral',
    description: 'Administra, controla y comprende las operaciones de tu empresa desde una experiencia integrada.',
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
              "name": "ADNegocio",
              "alternateName": "CostPro",
              "description": "Plataforma empresarial integral para administrar, controlar y comprender las operaciones de tu empresa. Finanzas, ventas multi-tienda, inventario, compras, fichas de costo Res. 148/2023 y vitrina digital.",
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
                "Estados financieros con partida doble",
                "Fichas de costo Resolución 148/2023",
                "Gestión de inventario en tiempo real",
                "Punto de venta (POS) multi-moneda",
                "Vitrina online pública configurable",
                "Inteligencia cambiaria (BCC, Diviza)",
                "Gestión multi-tienda",
                "Tabla dinámica de análisis (pivot table)",
                "Exportación a Excel y PDF",
                "Bot de WhatsApp con IA",
                "Bot de Telegram con IA",
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
                "name": "ADNegocio",
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
            without waiting for the async Workbox registration in the client component.
            FIX-ENTRY (2026-09-20): registro SOLO en producción — en dev el SW
            (CacheFirst sobre /_next/static) servía chunks turbopack viejos tras
            cada edición (stale HMR). Offline/PWA permanece intacto en producción. */}
        {process.env.NODE_ENV === 'production' && (
          <script
            nonce={nonce}
            suppressHydrationWarning
            dangerouslySetInnerHTML={{
              __html: `if('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(function(){}); }`
            }}
          />
        )}
        {/* FIX-CSP (2026-07-13): DIAG debug script removed — was causing CSP
            violation in dev mode. The inline script had nonce={nonce} but the
            nonce wasn't always propagated from proxy.ts to server component
            headers() in Next.js 16, causing 'unsafe-inline' to be ignored
            (nonce is present in CSP) and the script to be blocked. The diagnostic
            was only used during initial splash timing analysis and is no longer
            needed. */}
        {/* safe: static structured data — nonce from middleware */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              "name": "ADNegocio",
              "alternateName": "CostPro",
              "description": "Plataforma empresarial integral",
              "url": "https://costpro4.vercel.app",
            }),
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} ${inter.variable} ${archivo.variable} ${instrumentSerif.variable} font-sans antialiased bg-background text-foreground min-h-screen`}
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
                nonce={nonce}
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
