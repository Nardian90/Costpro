import { Suspense } from 'react';
import type { Metadata } from 'next';
import HomePageClient from './HomePageClient';

/**
 * Server Component — SEO-friendly landing page.
 *
 * FIX-SEO (2026-07-04): Antes esta página era 'use client' con ssr: false,
 * lo que hacía que Next.js añadiese <meta name="robots" content="noindex"/>
 * automáticamente. Google no podía indexar nada.
 *
 * Ahora esta página es un Server Component que renderiza contenido SEO
 * en el servidor, y carga el componente cliente (HomePageClient) para
 * la interactividad. Esto permite que Google vea:
 * 1. El <h1> y contenido SEO
 * 2. Meta tags correctas (index, follow)
 * 3. JSON-LD structured data
 * 4. Sitemap y robots.txt
 */

export const metadata: Metadata = {
  title: 'CostPro — Plataforma Multi-Tienda: Gestión, Inventario y Vitrina Digital',
  description: 'CostPro: administra todas tus tiendas desde un solo lugar. Inventario, ventas, recepciones y vitrina digital propia para cada tienda. Fichas de costo Res. 148/2023 integradas. Escala tu negocio sin multiplicar sistemas. Prueba gratis.',
  robots: {
    index: true,
    follow: true,
  },
};

export default function Page() {
  return (
    <>
      {/* ── SEO noscript fallback — Google y buscadores ven esto ──
          Si JavaScript está deshabilitado (o Google bot hace renderizado
          sin JS), este contenido sirve como fallback SEO con las
          keywords principales. */}
      <noscript>
        <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
          <h1>CostPro — Plataforma Multi-Tienda con Vitrina Digital</h1>
          <p>
            CostPro es una plataforma integral para gestionar negocios con múltiples tiendas y presencia digital propia.
            Administra inventario, ventas, recepciones y operaciones desde una única plataforma, mientras cada tienda
            tiene su propia vitrina web con catálogo de productos. Incluye fichas de costo según Res. 148/2023 del MFP.
          </p>
          <h2>¿Qué puedes hacer con CostPro?</h2>
          <ul>
            <li><strong>Gestión multi-tienda</strong> — Administra varias tiendas desde un solo panel sin multiplicar sistemas.</li>
            <li><strong>Vitrina digital propia</strong> — Cada tienda tiene su propia web con catálogo, precios y disponibilidad.</li>
            <li><strong>Inventario en tiempo real</strong> — Controla existencias de todas tus tiendas desde un mismo lugar.</li>
            <li><strong>Punto de venta (POS)</strong> — Terminal de venta rápida con múltiples métodos de pago.</li>
            <li><strong>Gestión de recepciones</strong> — Registra mercancía recibida con control de costos y proveedores.</li>
            <li><strong>Fichas de costo Res. 148/2023</strong> — Herramienta integrada para analizar y controlar costos.</li>
            <li><strong>Escalabilidad</strong> — Crece desde 1 tienda hasta múltiples establecimientos sin cambiar de sistema.</li>
            <li><strong>Exportación a Excel y PDF</strong> — Genera reportes profesionales en múltiples formatos.</li>
          </ul>
          <h2>¿Para quién es CostPro?</h2>
          <p>
            Dueños de pequeños y medianos negocios con varias tiendas, comercios que quieren digitalizar
            sus catálogos, y empresas que necesitan controlar inventario y ventas de diferentes establecimientos.
          </p>
          <h2>Prueba gratis</h2>
          <p>
            Accede a una prueba gratuita en{' '}
            <a href="https://costpro4.vercel.app">costpro4.vercel.app</a>
          </p>
        </div>
      </noscript>

      {/* ── Client component — app interactiva ── */}
      <Suspense
        fallback={
          <div className="min-h-screen w-full flex items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-muted-foreground">Cargando CostPro…</p>
            </div>
          </div>
        }
      >
        <HomePageClient />
      </Suspense>
    </>
  );
}
