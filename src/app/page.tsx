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
  title: 'CostPro — Software de Gestión, Fichas de Costo e Inventario para MIPYMES en Cuba',
  description: 'CostPro: sistema integral de gestión para MIPYMES cubanas. Fichas de costo Res. 148/2023, inventario en tiempo real, POS, vitrina online, inteligencia cambiaria y más. Prueba gratis.',
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
          <h1>CostPro — Software de Gestión para MIPYMES Cubanas</h1>
          <p>
            CostPro es un sistema integral de gestión empresarial diseñado para MIPYMES en Cuba.
            Cumple con la Resolución 148/2023 del MFP para la elaboración de fichas de costos y gastos.
          </p>
          <h2>Características principales</h2>
          <ul>
            <li><strong>Fichas de costo Res. 148/2023</strong> — Genera fichas de costo y gastos cumpliendo la metodología oficial del MFP cubano.</li>
            <li><strong>Gestión de inventario en tiempo real</strong> — Controla stock, recepciones, transferencias y ajustes de inventario con trazabilidad completa.</li>
            <li><strong>Punto de venta (POS)</strong> — Terminal de venta rápida con escáner de código de barras, carrito, atajos de teclado y pago mixto.</li>
            <li><strong>Vitrina online pública</strong> — Crea tu tienda online con banner personalizable, carrusel promocional, servicios y canales de WhatsApp/Telegram.</li>
            <li><strong>Inteligencia cambiaria</strong> — Tasas del BCC (Banco Central de Cuba), elToque y solucionescuba.com con carry-forward y simulador de escenarios.</li>
            <li><strong>Gestión multi-tienda</strong> — Administra múltiples sucursales con aislamiento de datos por tienda.</li>
            <li><strong>Centro de análisis dinámico</strong> — Tabla dinámica tipo Excel PivotTable con drag & drop, filtros, gráficos y exportación a Excel.</li>
            <li><strong>Bot de WhatsApp con IA</strong> — Responde consultas de clientes automáticamente con inteligencia artificial.</li>
            <li><strong>Bot de Telegram con IA</strong> — Canal serverless-native compatible con Vercel.</li>
            <li><strong>Exportación a Excel y PDF</strong> — Genera reportes profesionales en múltiples formatos.</li>
          </ul>
          <h2>¿Para quién es CostPro?</h2>
          <p>
            CostPro está diseñado para MIPYMES, empresas estatales, cooperativas y trabajadores
            por cuenta propia en Cuba que necesitan cumplir con la Resolución 148/2023 del MFP
            y gestionar su inventario, ventas y costos de forma eficiente.
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
