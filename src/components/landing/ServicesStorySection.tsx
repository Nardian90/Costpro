'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import {
  Package, Truck, Users, Calculator, Shield, TrendingUp,
  FileText, Store, Smartphone, Cloud, Lock, Zap,
} from 'lucide-react';

/**
 * ServicesStorySection — Reemplaza "EL DIFERENCIADOR" (AhaMomentSection)
 *
 * Scroll storytelling con efecto parallax estilo Apple.
 * Cada sección se revela al hacer scroll, con:
 * - Texto que aparece con fade + slide
 * - Icono con parallax (se mueve a diferente velocidad que el texto)
 * - Fondo con gradiente sutil que cambia entre secciones
 * - Sticky positioning para efecto "pinned"
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
}

const SECTIONS: StorySection[] = [
  {
    id: 'inventory',
    icon: Package,
    title: 'Inventario preciso',
    subtitle: 'Cada producto, cada movimiento, siempre.',
    description: 'Control total de tu almacén en tiempo real. Recepciones, transferencias entre tiendas, ajustes documentados y trazabilidad completa. Sabes qué tienes, dónde lo tienes y cuánto vale.',
    gradient: 'from-blue-500/10 to-transparent',
  },
  {
    id: 'costing',
    icon: Calculator,
    title: 'Fichas de costo automáticas',
    subtitle: 'Resolución 148/2023 MFP, sin que calcules nada.',
    description: 'Escribes el producto y la ficha oficial aparece sola. Transporte, arrendamiento, salarios, seguridad social e impuestos correctamente distribuidos. Sin hojas de cálculo. Sin errores.',
    gradient: 'from-emerald-500/10 to-transparent',
  },
  {
    id: 'pos',
    icon: Store,
    title: 'Punto de venta inteligente',
    subtitle: 'Vende en CUP, USD, EUR o MLC. Sin fricción.',
    description: 'Terminal de venta rápida con pago mixto multi-moneda, escáner de código de barras, descuentos y promociones. Cada venta descuenta inventario y genera el comprobante fiscal al instante.',
    gradient: 'from-purple-500/10 to-transparent',
  },
  {
    id: 'production',
    icon: Zap,
    title: 'Órdenes de producción',
    subtitle: 'Del material al producto terminado.',
    description: 'Crea órdenes de producción, servicio o trabajo con presupuestos, anticipos y liquidaciones. Los materiales salen del inventario automáticamente y el producto terminado entra con su costo real calculado.',
    gradient: 'from-orange-500/10 to-transparent',
  },
  {
    id: 'commissions',
    icon: Users,
    title: 'Comisiones por producto',
    subtitle: 'Cada producto, su comisión. Cada venta, su pago.',
    description: 'Configura comisiones por unidad o por porcentaje, por producto o por escala de precio. El motor calcula todo: reglas, pro-rateo por cambio de regla, conversión de moneda. Tú solo confirmas el pago.',
    gradient: 'from-pink-500/10 to-transparent',
  },
  {
    id: 'reports',
    icon: TrendingUp,
    title: 'Reportes y análisis',
    subtitle: 'Decisiones con datos, no con intuición.',
    description: 'Dashboard en tiempo real, reportes de ventas, inventario y costos. KPIs automáticos, márgenes por producto, rentabilidad por tienda. Todo exportable a PDF y Excel.',
    gradient: 'from-cyan-500/10 to-transparent',
  },
  {
    id: 'security',
    icon: Shield,
    title: 'Seguridad y auditoría',
    subtitle: 'Cada acción queda registrada.',
    description: 'Control de usuarios por roles, permisos granulares por tienda, auditoría completa de cada cambio. Row Level Security en Supabase: cada usuario solo ve lo que le corresponde.',
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
        {/* Icono con parallax */}
        <motion.div
          style={{ y: iconY }}
          className="shrink-0"
        >
          <div className="relative">
            {/* Glow detrás del icono */}
            <div className="absolute inset-0 blur-3xl opacity-30 bg-white rounded-full" />
            <div className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-3xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-xl flex items-center justify-center">
              <Icon className="w-10 h-10 sm:w-14 sm:h-14 text-white" strokeWidth={1.2} />
            </div>
          </div>
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
          Desde el inventario hasta la ficha de costo. Desde el punto de venta hasta el pago de comisiones.
          Una sola plataforma para gestionar todo el ciclo de tu negocio.
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
            Crea tu cuenta gratis y configura tu primera tienda en menos de 5 minutos.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('open-login')); }}
              className="px-8 py-3.5 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
            >
              Comenzar Gratis
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
