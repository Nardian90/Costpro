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
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
  openGraph: {
    title: "Costpro Enterprise",
    description: "Sistema de Gestión Integral",
    type: "website",
    images: ["/icon-512.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Costpro Enterprise',
    description: 'Sistema de Gestión Integral — Inventario, Ventas y Costos',
    images: ["/icon-512.png"],
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
        <link rel="preconnect" href="https://wthkddeleylijmonclxg.supabase.co" />
        {/* Inline splash: injects a black overlay BEFORE React hydrates.
            page.tsx calls dismissSplash() once the app is ready. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
              var d=document,s=d.createElement('style'),el=d.createElement('div');
              s.textContent='#app-splash{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#020617;transition:opacity .4s ease,visibility .4s ease}#app-splash.hide{opacity:0;visibility:hidden}.sp-inner{display:flex;flex-direction:column;align-items:center;gap:1.25rem}.sp-logo{display:flex;align-items:center;gap:.625rem}.sp-icon{width:2.25rem;height:2.25rem;border-radius:.5rem;background:#22c55e;display:flex;align-items:center;justify-content:center}.sp-icon svg{width:1.25rem;height:1.25rem;color:#fff}.sp-brand{font-size:1.375rem;font-weight:800;color:#fff;letter-spacing:-.02em;font-family:system-ui,-apple-system,sans-serif}.sp-brand em{font-style:normal;color:#22c55e}.sp-bar{width:3rem;height:2px;border-radius:1px;background:#22c55e;opacity:.6;animation:sp-pulse 1.2s ease-in-out infinite}@keyframes sp-pulse{0%,100%{opacity:.3;transform:scaleX(.7)}50%{opacity:.8;transform:scaleX(1)}}';
              d.head.appendChild(s);
              el.id='app-splash';
              el.innerHTML='<div class="sp-inner"><div class="sp-logo"><div class="sp-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg></div><div class="sp-brand">Cost<em>Pro</em></div></div><div class="sp-bar"></div></div>';
              d.body?d.body.prepend(el):d.addEventListener('DOMContentLoaded',function(){d.body.prepend(el)});
              window.__dismissSplash=function(){var e=d.getElementById('app-splash');if(!e||e.dataset.dismissed)return;e.dataset.dismissed='1';e.classList.add('hide');setTimeout(function(){e.remove()},500)};
              setTimeout(function(){window.__dismissSplash()},6000);
            })();`,
          }}
        />
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
        translate="no"
      >
        <a href="#main-content" className="skip-to-content">
          Saltar al contenido principal
        </a>
        <ThemeProvider
          attribute="class" enableSystem
          defaultTheme="light"
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
