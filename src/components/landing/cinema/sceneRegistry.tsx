'use client';

/**
 * sceneRegistry — ADN-LANDING-TRUE-FULLPAGE-EXPERIENCE-006
 * ============================================================================
 * Registro de las 15 escenas / 5 capítulos del escenario cinematográfico.
 *
 * NARRATIVA (misión 006 §7): «Del caos del negocio al control de una empresa
 * conectada». El capítulo 2 (Plataforma) despliega la historia completa del
 * producto en subescenas — TODO el contenido real del landing (los mismos
 * textos y capturas de las secciones de flujo) está coreografiado; nada se
 * recorta y nada se inventa.
 *
 * TRANSICIONES (§6 — cada segmento con identidad propia):
 *   s0→s1  sweep  — la línea ADN barre el escenario; el caos del hero se
 *                   recoge (coreografía interna) y abre el capítulo 2.
 *   s1→s2  push   — cinta vertical: la apertura asciende y llega Administra.
 *   s2→s3  depth  — profundidad: el panel se aleja y el catálogo se acerca.
 *   s3→s4  mask   — cortina: la vitrina se revela como un escaparate.
 *   s4→s5  push   — el inventario entra empujando la vitrina.
 *   s5→s6  depth  — el POS surge hacia la cámara.
 *   s6→s7  sweep  — la línea ADN conecta con la estructura de costos.
 *   s7→s8  mask   — los reportes se descubren como un informe que se abre.
 *   s8→s9  push   — el cierre del capítulo (seguridad + CTA) entra.
 *   s9→s10 typo   — cambio de CAPÍTULO: salida tipográfica hacia la cámara y
 *                   entrada escalonada del índice de funcionalidades.
 *   s10→s11 depth — los planes se acercan.
 *   s11→s12 mask  — la comparativa se despliega como una cortina.
 *   s12→s13 sweep — la línea ADN conduce a la ayuda.
 *   s13→s14 push  — el cierre final entra en el escenario.
 * ============================================================================
 */

import type { CinemaSceneDef } from './CinemaStage';
import {
  SceneOpener,
  SceneStory,
  SceneSecurityCta,
  SceneFeatures,
  ScenePricing,
  SceneComparison,
  SceneCierre,
  StoryVisual,
  IconTileVisual,
  type StorySceneData,
} from './SceneContent';
import { SECTIONS as STORY } from '../ServicesStorySection';
import { DEMO_CATALOG as CATALOG } from '../MultiStoreVisualSection';

/* Índices de las historias reales (SECTIONS de ServicesStorySection):
   0 multi-store · 1 storefront · 2 inventory · 3 pos · 4 costing
   5 reports · 6 security */

interface BuildArgs {
  onSignup: () => void;
  onOpenDemo: () => void;
  onSeeFeatures: () => void;
}

export function buildCinemaScenes({ onSignup, onOpenDemo, onSeeFeatures }: BuildArgs): CinemaSceneDef[] {
  const s = STORY;
  const multistore: StorySceneData = {
    stepBadge: 'PASO 1',
    index: '01',
    total: '07',
    icon: s[0].icon,
    title: s[0].title,
    subtitle: s[0].subtitle,
    description: s[0].description,
    visual: (
      <StoryVisual
        src="/landing/capturas/selector-tiendas.webp"
        srcMobile="/landing/capturas/selector-tiendas-movil.webp"
        alt="Selector de sucursales de ADNegocio abierto sobre el panel principal, mostrando las tiendas del negocio con búsqueda y cambio de tienda en un clic."
        caption="Panel real de ADNegocio — selector de sucursales (datos de demostración)"
        frameLabel="adnegocio.app · cambiar sucursal"
      />
    ),
  };

  const catalogo: StorySceneData = {
    stepBadge: 'PASO 2',
    index: '02',
    total: '07',
    icon: s[2].icon,
    title: 'Organiza tu catálogo y tu inventario',
    subtitle: s[2].subtitle,
    description: s[2].description,
    visual: (
      <div
        className="mx-auto w-full max-w-[820px] rounded-2xl border border-white/[0.06] bg-[#0a0f1a] p-4 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.75)]"
        role="img"
        aria-label="Catálogo de demostración de ADNegocio con cuatro productos reales: nombre, precio y stock"
      >
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {CATALOG.map((p) => (
            <div key={p.name} className="rounded-lg border border-white/[0.03] bg-white/[0.02] p-2.5">
              <div className="relative mb-2 aspect-square w-full overflow-hidden rounded-md bg-white/[0.06]">
                {/* img crudo intencional: carga ansiosa + ocultado elegante si
                    la miniatura falla (paridad con DemoProductThumb). */}
                <img
                  src={p.img}
                  alt={p.alt}
                  loading="eager"
                  decoding="async"
                  className="object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
              <p className="truncate text-[11px] font-bold text-white">{p.name}</p>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[11px] font-black tabular-nums text-[#22c55e]">${p.price}</span>
                <span className="text-[9px] tabular-nums text-white/30">st: {p.stock}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  };

  const vitrina: StorySceneData = {
    stepBadge: 'PASO 3',
    index: '02',
    total: '07',
    icon: s[1].icon,
    title: s[1].title,
    subtitle: s[1].subtitle,
    description: s[1].description,
    flip: true,
    visual: (
      <StoryVisual
        src="/landing/capturas/tienda-publica-productos.webp"
        srcMobile="/landing/capturas/tienda-publica-movil.webp"
        alt="Vitrina digital pública de una tienda de ADNegocio: catálogo con fotos de productos, precios en CUP y badge de disponibilidad, que los clientes consultan sin instalar nada."
        caption="Vitrina pública real — la grilla de productos que ve tu cliente"
        frameLabel="tienda.adnegocio.app"
      />
    ),
  };

  const inventario: StorySceneData = {
    index: '03',
    total: '07',
    icon: s[2].icon,
    title: s[2].title,
    subtitle: s[2].subtitle,
    description: s[2].description,
    visual: (
      <StoryVisual
        src={s[2].image!}
        srcMobile={s[2].srcMobile}
        alt={s[2].imageAlt!}
        caption={s[2].caption}
        frameLabel={s[2].frameLabel}
      />
    ),
  };

  const pos: StorySceneData = {
    index: '04',
    total: '07',
    icon: s[3].icon,
    title: s[3].title,
    subtitle: s[3].subtitle,
    description: s[3].description,
    flip: true,
    visual: (
      <StoryVisual
        src={s[3].image!}
        srcMobile={s[3].srcMobile}
        alt={s[3].imageAlt!}
        caption={s[3].caption}
        frameLabel={s[3].frameLabel}
      />
    ),
  };

  const costos: StorySceneData = {
    index: '05',
    total: '07',
    icon: s[4].icon,
    title: s[4].title,
    subtitle: s[4].subtitle,
    description: s[4].description,
    visual: (
      <StoryVisual
        src={s[4].image!}
        srcMobile={s[4].srcMobile}
        alt={s[4].imageAlt!}
        caption={s[4].caption}
        frameLabel={s[4].frameLabel}
      />
    ),
  };

  const reportes: StorySceneData = {
    index: '06',
    total: '07',
    icon: s[5].icon,
    title: s[5].title,
    subtitle: s[5].subtitle,
    description: s[5].description,
    flip: true,
    visual: (
      <StoryVisual
        src={s[5].image!}
        srcMobile={s[5].srcMobile}
        alt={s[5].imageAlt!}
        caption={s[5].caption}
        frameLabel={s[5].frameLabel}
      />
    ),
  };

  const seguridad: StorySceneData = {
    index: '07',
    total: '07',
    icon: s[6].icon,
    title: s[6].title,
    subtitle: s[6].subtitle,
    description: s[6].description,
  };

  /* Áreas funcionales — EXACTAMENTE las 9 áreas reales de FeaturesSection. */
  const AREAS: { n: string; title: string; desc: string }[] = [
    {
      n: '01',
      title: 'Gestión financiera y estados financieros',
      desc: 'Estados financieros con partida doble, caja con modelo físico de efectivo e ingresos/egresos documentados.',
    },
    {
      n: '02',
      title: 'Ventas y operaciones',
      desc: 'Terminal de venta multi-moneda, listado de precios, reporte de entrega e ingresos por ventas.',
    },
    {
      n: '03',
      title: 'Inventario y almacén',
      desc: 'Stock en tiempo real, inventario físico, ajustes documentales, vales de salida y etiquetas con códigos.',
    },
    {
      n: '04',
      title: 'Compras y recepciones',
      desc: 'Recepciones con autoridad de nombre, órdenes de compra, servicios recibidos y transferencias entre tiendas.',
    },
    {
      n: '05',
      title: 'Proveedores y clientes',
      desc: 'Terceros organizados con cuentas por pagar, cobros y antigüedad de saldos siempre visibles.',
    },
    {
      n: '06',
      title: 'Fichas de costo — Res. 148/2023',
      desc: 'Estructura de costo calculada, no estimada: transporte, salarios, depreciaciones e impuestos distribuidos según la metodología oficial.',
    },
    {
      n: '07',
      title: 'Gestión de tiendas y multitienda',
      desc: 'Cada tienda con su catálogo, inventario y operaciones aisladas — y una vitrina digital propia para tus clientes.',
    },
    {
      n: '08',
      title: 'Reportes y análisis',
      desc: 'Reportes configurables con vista previa, análisis ABC por producto y análisis de datos del negocio completo.',
    },
    {
      n: '09',
      title: 'Auditoría y control documental',
      desc: 'Cada acción queda registrada: auditoría de eventos, ajustes documentales y trazabilidad completa de operaciones.',
    },
  ];

  return [
    /* ── CAPÍTULO 1 · INICIO ─────────────────────────────────────────── */
    {
      id: 'hero',
      chapter: 0,
      content: null, // lo inyecta LandingPage (HeroSection con props vivas)
    },
    /* ── CAPÍTULO 2 · PLATAFORMA (9 subescenas) ──────────────────────── */
    {
      id: 'como-funciona',
      chapter: 1,
      inKind: 'sweep',
      content: <SceneOpener />,
    },
    { chapter: 1, inKind: 'push', content: <SceneStory data={multistore} /> },
    { chapter: 1, inKind: 'depth', content: <SceneStory data={catalogo} /> },
    { chapter: 1, inKind: 'mask', content: <SceneStory data={vitrina} /> },
    { chapter: 1, inKind: 'push', content: <SceneStory data={inventario} /> },
    { chapter: 1, inKind: 'depth', content: <SceneStory data={pos} /> },
    { chapter: 1, inKind: 'sweep', content: <SceneStory data={costos} /> },
    { chapter: 1, inKind: 'mask', content: <SceneStory data={reportes} /> },
    {
      chapter: 1,
      inKind: 'push',
      content: <SceneSecurityCta data={seguridad} onSeeFeatures={onSeeFeatures} />,
    },
    /* ── CAPÍTULO 3 · FUNCIONALIDADES ────────────────────────────────── */
    {
      id: 'features',
      chapter: 2,
      inKind: 'typo',
      content: <SceneFeatures areas={AREAS} />,
    },
    /* ── CAPÍTULO 4 · PRECIOS (2 subescenas) ─────────────────────────── */
    {
      id: 'pricing',
      chapter: 3,
      inKind: 'depth',
      content: <ScenePricing onSignup={onSignup} />,
    },
    { chapter: 3, inKind: 'mask', content: <SceneComparison /> },
    /* ── CAPÍTULO 5 · AYUDA + CIERRE (2 subescenas) ──────────────────── */
    {
      id: 'faq',
      chapter: 4,
      inKind: 'sweep',
      content: null, // lo inyecta LandingPage (FAQSection con estado vivo)
    },
    {
      chapter: 4,
      inKind: 'push',
      content: <SceneCierre onSignup={onSignup} onOpenDemo={onOpenDemo} />,
    },
  ];
}
