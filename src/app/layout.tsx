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
import { ProductHeader } from "@/components/layout/ProductHeader";

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
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://wthkddeleylijmonclxg.supabase.co" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem('theme') || 'fast-light';
                document.documentElement.classList.add(theme);
                document.documentElement.setAttribute('data-theme', theme);

                const ui = JSON.parse(localStorage.getItem('costpro-ui-storage') || '{}');
                if (ui.state && ui.state.accessibilityMode === 'high-contrast') {
                  document.documentElement.setAttribute('data-accessibility', 'high-contrast');
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} ${inter.variable} font-sans antialiased bg-background text-foreground`}
        translate="no"
      >
        <ThemeProvider
          attribute="class" enableSystem
          defaultTheme="fast-light"
          disableTransitionOnChange
          themes={['light', 'dark', 'fast-light', 'fast-dark', 'auto']}
        >
          <IntelligentThemeHandler />
          <QueryProvider>
            <SyncProvider>
              <GlobalSessionManager />
              <div className="flex flex-col min-h-screen">
                <ProductHeader />
                <main className="flex-1">
                  {children}
                </main>
              </div>
              <Toaster position="top-right" richColors />
              <ServiceWorkerRegister />
            </SyncProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
