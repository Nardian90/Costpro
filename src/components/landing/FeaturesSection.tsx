'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { fadeUp } from './animations';

/**
 * FeaturesSection (ADN-BRAND-REBUILD-001) — índice editorial de áreas
 * funcionales REALES de ADNegocio, confirmadas contra la navegación canónica
 * (src/config/navigation/navigation-definition.ts):
 *
 *   01 Finanzas — Estados Financieros · Caja · Ingresos/Egresos
 *   02 Ventas — POS · Listado de precios · IPV · Reporte Entrega
 *   03 Inventario y almacén — Stock · Inventario físico · Ajustes · Vales
 *   04 Compras y recepciones — Recepciones · Órdenes de compra · Transferencias
 *   05 Proveedores y clientes — Gestión documentada de terceros
 *   06 Fichas de costo — Res. 148/2023 · Estructura · Costeo dinámico
 *   07 Multitienda — Gestión de tiendas · vitrina digital por tienda
 *   08 Reportes y análisis — Reportes · Análisis ABC · Análisis de datos
 *   09 Auditoría y control documental — Ajustes documentales · trazabilidad
 *
 * Composición editorial: numeración grande, tipografía protagonista y filas
 * con borde — no una cuadrícula genérica de tarjetas. Sin estadísticas,
 * clientes ni premios inventados (mandato §5). El contrato e2e exige
 * `#features` con elementos h3.
 *
 * GEOMETRÍA (ADN-LANDING-FINAL-POLISH-003 §6):
 *   - Retícula ÚNICA para encabezado e índice: mismo contenedor centrado
 *     `max-w-[1360px] mx-auto` y los MISMOS márgenes laterales por breakpoint
 *     que el hero (px-6 sm:px-10 lg:px-16 xl:px-20) — nada pegado al borde.
 *   - Encabezado a 12 columnas: título a la izquierda (7) y descripción a la
 *     derecha (5) con hairline vertical — el espacio que antes quedaba vacío
 *     ahora participa de la composición.
 *   - Índice a 2 columnas en escritorio (gutter idéntico al del encabezado):
 *     aprovecha el ancho disponible y mantiene la numeración legible.
 *   - Móvil: una sola columna con márgenes laterales constantes.
 *   - Contenido comercial intacto: mismas 9 áreas, mismos textos.
 */

const AREAS = [
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

interface FeaturesSectionProps {
  featuresInView: boolean;
  featuresRef: React.RefObject<HTMLDivElement | null>;
}

export default function FeaturesSection({
  featuresInView,
  featuresRef,
}: FeaturesSectionProps) {
  return (
    <div
      ref={featuresRef}
      className="px-6 sm:px-10 lg:px-16 xl:px-20"
    >
      <div className="w-full max-w-[1360px] mx-auto">

        {/* Encabezado editorial — título y descripción comparten retícula 12-col */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={featuresInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="mb-12 sm:mb-16 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-end"
        >
          <div className="lg:col-span-7">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#22c55e] mb-4">
              Funcionalidades
            </p>
            <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight leading-tight max-w-2xl font-[family-name:var(--font-space-grotesk)]">
              Un universo completo de operaciones empresariales
            </h2>
          </div>
          <div className="lg:col-span-5 lg:pb-1.5">
            <p className="text-sm sm:text-base text-white/50 leading-relaxed max-w-md lg:border-l lg:border-white/[0.09] lg:pl-8">
              Lo que empezó como una herramienta de fichas de costo evolucionó en una plataforma integral: finanzas, ventas, inventario, compras, costo y control — operando sobre la misma base, sin duplicar sistemas.
            </p>
          </div>
        </motion.div>

        {/* Índice editorial de áreas — filas con borde, número grande.
            Dos columnas en ≥lg con el MISMO gutter del encabezado (gap-10/14). */}
        <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-x-10 xl:gap-x-14">
          {AREAS.map((area, i) => (
            <motion.div
              key={area.n}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="group grid grid-cols-[auto_1fr] gap-4 sm:gap-8 py-5 sm:py-6 border-b border-white/[0.06] last:border-b-0 items-baseline hover:bg-white/[0.02] transition-colors duration-300 rounded-lg px-2 -mx-2"
            >
              <span
                className="text-sm sm:text-base font-bold font-mono text-white/20 group-hover:text-[#22c55e] transition-colors duration-300 tabular-nums w-8"
                aria-hidden="true"
              >
                {area.n}
              </span>
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-white/90 tracking-tight group-hover:text-white transition-colors duration-300">
                  {area.title}
                </h3>
                <p className="text-[13px] sm:text-sm text-white/45 leading-relaxed mt-1.5">
                  {area.desc}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

      </div>
    </div>
  );
}
