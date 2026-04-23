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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning className="h-full" style={{ minHeight: '100vh' }}>
      <head>
        {/* ── Theme flash prevention: inline style block (NOT inline style attributes) ──
             This ensures CSS vars are controlled by class selectors, so next-themes
             can toggle them by adding/removing 'dark' class. Inline style attributes
             would override CSS rules and prevent theme switching. */}
        <style dangerouslySetInnerHTML={{
          __html: `:root{--background:#f8fafc;--foreground:#0f172a;color-scheme:light}.dark{--background:#000000;--foreground:#ffffff;color-scheme:dark}`,
        }} />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'){document.documentElement.classList.add('dark')}}catch(e){document.documentElement.classList.add('dark')}})()`,
          }}
        />
        {/* FIX #012: Supabase preconnect uses environment variable */}
        <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wthkddeleylijmonclxg.supabase.co'} />
        <script
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
        <a href="#main-content" className="skip-to-content">
          Saltar al contenido principal
        </a>
        <ThemeProvider
          attribute="class" enableSystem
          defaultTheme="dark"
          disableTransitionOnChange
          themes={['light', 'dark', 'auto']}
        >
          <IntelligentThemeHandler />
          <QueryProvider>
            <SyncProvider>
              <GlobalSessionManager />
              {children}
              <Toaster position="top-right" richColors />
              <ServiceWorkerRegister />
            </SyncProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
