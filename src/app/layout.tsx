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
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} ${inter.variable} font-sans antialiased bg-background text-foreground`}
        translate="no"
      >
        <a href="#main-content" className="skip-to-content">
          Saltar al contenido principal
        </a>
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
