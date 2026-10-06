'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import {
  Package, Truck, Users, Calculator, Shield, TrendingUp,
  FileText, Store, Smartphone, Cloud, Lock, Zap, Globe, ShoppingCart,
} from 'lucide-react';
import { enterFichaDeCosto } from '@/lib/fcEntry';
import FeatureVisual from './FeatureVisual';

/**
 * ServicesStorySection — Reemplaza "EL DIFERENCIADOR" (AhaMomentSection)
 *
 * LANDING VISUAL EVIDENCE (FASE 1/3): cada historia muestra la CAPTURA REAL
 * de CostPro (public/landing/capturas/*.webp — estado demo controlado, sin
 * PII) como evidencia visual principal. El icono queda como badge de
 * contexto, no como visual principal (regla 6 del mandato).
 *
 * El landing SIEMPRE es dark + enhanced — no depende de theme.
 */

interface StorySection {
  id: string;
  icon: typeof Package;
  title: string;
  subtitle: string;
  description: string;
  gradient: string;
  /** Captura real de CostPro — evidencia visual (FASE 3) */
  image?: string;
  /** Variante móvil de la misma pantalla (FASE 10 — art direction) */
  srcMobile?: string;
  imageAlt?: string;
  caption?: string;
  frameLabel?: string;
}

const SECTIONS: StorySection[] = [
  {
    id: 'multi-store',
    icon: Store,
    title: 'Administra varias tiendas desde un solo panel',
    subtitle: 'Sin multiplicar sistemas de gestión.',
    description: 'Gestiona cada tienda por separado con su propio catálogo, inventario y ventas. Mira el negocio completo desde un dashboard central. Cambia de sucursal en 1 clic con aislamiento de datos por tienda.',
    gradient: 'from-emerald-500/10 to-transparent',
    image: '/landing/capturas/dashboard.webp',
    srcMobile: '/landing/capturas/dashboard-movil.webp',
    imageAlt: 'Panel central de CostPro con el anillo de KPIs de la tienda activa: ventas, costos y utilidad del día con su comparación histórica, y el selector de sucursal arriba.',
    caption: 'Dashboard real de CostPro — datos de demostración',
    frameLabel: 'costpro.app · panel',
  },
  {
    id: 'storefront',
    icon: Globe,
    title: 'Cada tienda con su propia vitrina digital',
    subtitle: 'Tu tienda física tiene presencia online.',
    description: 'Cada tienda tiene su propia web donde tus clientes ven productos, precios y disponibilidad. Catálogo público, banner personalizable, carrusel promocional y canales de WhatsApp y Telegram integrados.',
    gradient: 'from-blue-500/10 to-transparent',
    image: '/landing/capturas/tienda-publica.webp',
    srcMobile: '/landing/capturas/tienda-publica-movil.webp',
    imageAlt: 'Vitrina digital pública de una tienda: catálogo con fotos de productos, precios en CUP y badge de disponibilidad, accesible sin instalar nada.',
    caption: 'Vitrina pública de la tienda — lo que ve tu cliente',
    frameLabel: 'tienda.costpro.app',
  },
  {
    id: 'inventory',
    icon: Package,
    title: 'Controla las existencias de todas tus tiendas',
    subtitle: 'Cada producto, cada movimiento, siempre.',
    description: 'Control total de tu almacén en tiempo real. Recepciones, transferencias entre tiendas, ajustes documentados y trazabilidad completa. Sabes qué tienes, dónde lo tienes y cuánto vale.',
    gradient: 'from-cyan-500/10 to-transparent',
    image: '/landing/capturas/inventario-stock.webp',
    srcMobile: '/landing/capturas/inventario-stock-movil.webp',
    imageAlt: 'Vista de inventario de CostPro: tabla de stock actual por producto con SKU, existencias, costo unitario y valor total.',
    caption: 'Inventario por tienda — stock, costos y valor',
    frameLabel: 'costpro.app · inventario',
  },
  {
    id: 'pos',
    icon: ShoppingCart,
    title: 'Vende rápido con un POS diseñado para cajeros',
    subtitle: 'Pago mixto multi-moneda sin fricción.',
    description: 'Terminal de venta intuitiva con escáner de código de barras, pago mixto (efectivo + transferencia + Zelle), desglose por denominaciones de billetes y ventas históricas con fecha personalizada.',
    gradient: 'from-purple-500/10 to-transparent',
    image: '/landing/capturas/pos-terminal.webp',
    srcMobile: '/landing/capturas/pos-terminal-movil.webp',
    imageAlt: 'Terminal de venta de CostPro: grilla de productos, carrito abierto con 4 artículos, cantidades, total a cobrar y botón COBRAR.',
    caption: 'POS real — carrito, total y cobro en una pantalla',
    frameLabel: 'costpro.app · vender',
  },
  {
    id: 'costing',
    icon: Calculator,
    title: 'Fichas de costo integradas',
    subtitle: 'Resolución 148/2023 MFP, herramienta adicional.',
    description: 'Además de gestionar tu negocio, CostPro incorpora herramientas para conocer y controlar tus costos. Transporte, arrendamiento, salarios e impuestos correctamente distribuidos según la metodología oficial.',
    gradient: 'from-orange-500/10 to-transparent',
    image: '/landing/capturas/estructura-costo.webp',
    srcMobile: '/landing/capturas/estructura-costo-movil.webp',
    imageAlt: 'Estructura de costo de CostPro: tabla por producto con existencias, costo unitario y totales calculados según la metodología oficial.',
    caption: 'Estructura de costo — calculada, no estimada',
    frameLabel: 'costpro.app · costos',
  },
  {
    id: 'reports',
    icon: TrendingUp,
    title: 'Ve cómo evoluciona tu negocio en cada tienda',
    subtitle: 'Decisiones con datos, no con intuición.',
    description: 'Dashboard en tiempo real, reportes de ventas, inventario y costos. KPIs automáticos, márgenes por producto, rentabilidad por tienda. Todo exportable a PDF y Excel.',
    gradient: 'from-pink-500/10 to-transparent',
    image: '/landing/capturas/reportes.webp',
    srcMobile: '/landing/capturas/reportes-movil.webp',
    imageAlt: 'Generador de reportes de CostPro: configuración del informe y vista previa con transacciones, montos y totales del período.',
    caption: 'Reportes configurables — con vista previa en vivo',
    frameLabel: 'costpro.app · reportes',
  },
  {
    id: 'security',
    icon: Shield,
    title: 'Seguridad y control por roles',
    subtitle: 'Cada acción queda registrada.',
    description: 'Control de usuarios por roles, permisos granulares por tienda, auditoría completa de cada cambio. Cada usuario solo ve lo que le corresponde.',
    gradient: 'from-red-500/10 to-transparent',
  },
];

function StoryCard({ section, index }: { section: StorySection; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  // Parallax: icono se mueve más lento que el texto
  const iconY = useTransform(scrollYProgress, [0, 1], [80, -80]);
  const textY = useTransform(scrollYProgress, [0, 1], [40, -40]);
  const opacity = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [0, 1, 1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [0.95, 1, 1, 0.95]);

  const Icon = section.icon;
  const isEven = index % 2 === 0;

  return (
    <div
      ref={ref}
      className={`min-h-[80vh] flex items-center justify-center relative overflow-hidden ${isEven ? '' : ''}`}
    >
      {/* Fondo con gradiente sutil */}
      <div className={`absolute inset-0 bg-gradient-to-b ${section.gradient} pointer-events-none`} />

      {/* Línea decorativa */}
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/[0.06] to-transparent pointer-events-none" />

      <motion.div
        style={{ opacity, scale }}
        className={`relative z-10 max-w-5xl mx-auto px-6 py-16 flex flex-col ${isEven ? 'sm:flex-row' : 'sm:flex-row-reverse'} items-center gap-8 sm:gap-16`}
      >
        {/* Visual: captura REAL de CostPro (FASE 1) o icono (sección sin captura) */}
        <motion.div
          style={{ y: iconY }}
          className="shrink-0 w-full sm:w-[58%]"
        >
          {section.image && section.imageAlt ? (
            <FeatureVisual
              src={section.image}
              alt={section.imageAlt}
              srcMobile={section.srcMobile}
              altMobile={section.imageAlt}
              caption={section.caption}
              frameLabel={section.frameLabel}
            />
          ) : (
            <div className="relative mx-auto w-fit">
              {/* Glow detrás del icono */}
              <div className="absolute inset-0 blur-3xl opacity-30 bg-white rounded-full" />
              <div className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-3xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-xl flex items-center justify-center">
                <Icon className="w-10 h-10 sm:w-14 sm:h-14 text-white" strokeWidth={1.2} />
              </div>
            </div>
          )}
        </motion.div>

        {/* Texto con parallax */}
        <motion.div
          style={{ y: textY }}
          className="flex-1 text-center sm:text-left"
        >
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-xs sm:text-sm font-bold uppercase tracking-[0.2em] text-white/40 mb-3"
          >
            {String(index + 1).padStart(2, '0')} / {String(SECTIONS.length).padStart(2, '0')}
          </motion.p>

          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="text-3xl sm:text-5xl font-black text-white mb-2 tracking-tight"
          >
            {section.title}
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="text-base sm:text-lg font-medium text-emerald-400/90 mb-4"
          >
            {section.subtitle}
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="text-sm sm:text-base text-white/60 leading-relaxed max-w-xl"
          >
            {section.description}
          </motion.p>
        </motion.div>
      </motion.div>
    </div>
  );
}

export default function ServicesStorySection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  // Barra de progreso del scroll
  const progressWidth = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);

  return (
    <section
      id="como-funciona"
      ref={containerRef}
      className="relative bg-[#020617]"
    >
      {/* Barra de progreso superior */}
      <div className="sticky top-0 z-20 h-0.5 bg-white/[0.04]">
        <motion.div
          style={{ width: progressWidth }}
          className="h-full bg-gradient-to-r from-emerald-500 via-green-400 to-emerald-500"
        />
      </div>

      {/* Header */}
      <div className="max-w-5xl mx-auto px-6 pt-24 pb-8 text-center">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-xs sm:text-sm font-bold uppercase tracking-[0.25em] text-emerald-400/60 mb-4"
        >
          CostPro · Plataforma integral
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="text-4xl sm:text-6xl font-black text-white tracking-tight mb-4"
        >
          Todo lo que tu negocio necesita.
          <br />
          <span className="text-white/40">Nada que no necesite.</span>
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-base sm:text-lg text-white/50 max-w-2xl mx-auto"
        >
          Desde la gestión multi-tienda hasta la vitrina digital. Desde el inventario hasta el punto de venta.
          Una sola plataforma para gestionar todo tu negocio y darle presencia online a cada tienda.
        </motion.p>
      </div>

      {/* Secciones de storytelling con parallax */}
      <div className="relative">
        {SECTIONS.map((section, index) => (
          <StoryCard key={section.id} section={section} index={index} />
        ))}
      </div>

      {/* CTA al final */}
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          <h3 className="text-3xl sm:text-4xl font-black text-white mb-4 tracking-tight">
            ¿Listo para empezar?
          </h3>
          <p className="text-base text-white/50 mb-8 max-w-xl mx-auto">
            Crea tu primera ficha de costo gratis — con tu cuenta de Google o como invitado — en menos de 5 minutos.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {/* FIX-ENTRY (2026-09-20): CTA intermedio alineado al camino B (Ficha de
                Costo) — única conversión intermedia; «Entrar a COSTPRO» vive solo en
                el selector del hero (cada CTA con una función distinta). */}
            <a
              href="/fc/"
              onClick={(e) => {
                e.preventDefault();
                enterFichaDeCosto(() => window.dispatchEvent(new CustomEvent('open-login')));
              }}
              className="px-8 py-3.5 rounded-xl bg-[#004d40] text-white text-sm font-bold hover:bg-[#00695c] transition-all shadow-lg shadow-[#004d40]/25"
            >
              Crear ficha de costo gratis
            </a>
            <a
              href="#features"
              className="px-8 py-3.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-white text-sm font-bold hover:bg-white/[0.06] transition-all"
            >
              Ver funciones
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
