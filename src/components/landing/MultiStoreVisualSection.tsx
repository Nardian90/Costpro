'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Package,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import FeatureVisual from './FeatureVisual';

/**
 * MultiStoreVisualSection — Demostración visual del ecosistema multi-tienda.
 *
 * LANDING VISUAL EVIDENCE (FASE 1/3): los pasos 1 y 3 usan CAPTURAS REALES de
 * CostPro (public/landing/capturas/*.webp — estado demo controlado, sin PII:
 * tiendas ficticias «Sucursal Habana / Vedado / Playa»). El paso 2 conserva
 * una mini-composición compacta como pegamento narrativo (FASE 7 — densidad:
 * no toda sección necesita una imagen gigante).
 *
 * AUDIT (2026-08-18): Todos los datos son MOCK estáticos definidos en
 * este archivo. No consulta la DB.
 */
export function MultiStoreVisualSection() {
  return (
    <section id="plataforma" className="relative py-20 sm:py-28 px-4 sm:px-6 overflow-hidden">
      <div className="max-w-5xl mx-auto">
        {/* Section title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-3">
            Una plataforma, todas tus tiendas
          </h2>
          <p className="text-base text-white/50 max-w-xl mx-auto">
            Administra cada tienda por separado y mira el negocio completo desde un solo panel.
            Lo que gestionas aquí alimenta la vitrina digital de cada tienda.
          </p>
          {/* AUDIT: BadgeDemo — capturas reales del producto con datos de demostración */}
          <span className="inline-flex items-center gap-1.5 mt-3 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-[10px] font-bold text-white/40 uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]/60" />
            Capturas reales · datos de demostración
          </span>
        </motion.div>

        {/* ── Step 1: Administration Panel — CAPTURA REAL ── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="mb-8"
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-[#22c55e] text-white text-xs font-black flex items-center justify-center">1</span>
            <span className="text-sm font-black text-white/70 uppercase tracking-widest">Administra</span>
          </div>
          {/* Captura REAL: selector de sucursales de CostPro (demo controlado).
              FIX CALIDAD: sizes = ancho real del frame dentro de max-w-5xl. */}
          <FeatureVisual
            src="/landing/capturas/selector-tiendas.webp"
            srcMobile="/landing/capturas/selector-tiendas-movil.webp"
            alt="Selector de sucursales de CostPro abierto sobre el panel principal, mostrando las tiendas del negocio con búsqueda y cambio de tienda en un clic."
            caption="Panel real de CostPro — selector de sucursales (datos de demostración)"
            frameLabel="costpro.app · cambiar sucursal"
            sizes="(max-width: 640px) 100vw, (max-width: 1056px) calc(100vw - 3rem), 976px"
          />
        </motion.div>

        {/* Arrow connecting admin → stores */}
        <div className="flex justify-center mb-6">
          <div className="flex flex-col items-center gap-1">
            <div className="w-px h-6 bg-gradient-to-b from-[#22c55e]/40 to-white/[0.06]" />
            <span className="text-[9px] text-white/30 uppercase tracking-widest font-bold">gestiona ↓</span>
          </div>
        </div>

        {/* ── Step 2: Products & Inventory ── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="mb-8"
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-[#22c55e] text-white text-xs font-black flex items-center justify-center">2</span>
            <span className="text-sm font-black text-white/70 uppercase tracking-widest">Organiza tu catálogo</span>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-[#0a0f1a] overflow-hidden p-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { name: 'Arroz Grano Largo 5kg', price: 320, stock: 120 },
                { name: 'Aceite Girasol 1L', price: 480, stock: 64 },
                { name: 'Café Tostado 250g', price: 350, stock: 55 },
                { name: 'Detergente 900g', price: 300, stock: 47 },
              ].map(p => (
                <div key={p.name} className="rounded-lg bg-white/[0.02] p-2.5 border border-white/[0.03]">
                  <div className="w-full h-12 rounded bg-white/[0.03] mb-2 flex items-center justify-center">
                    <Package className="w-4 h-4 text-white/10" />
                  </div>
                  <p className="text-[10px] font-bold text-white truncate">{p.name}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] font-black text-[#22c55e] tabular-nums">{formatCurrency(p.price)}</span>
                    <span className="text-[8px] text-white/30 tabular-nums">st: {p.stock}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Arrow connecting catalog → storefront */}
        <div className="flex justify-center mb-6">
          <div className="flex flex-col items-center gap-1">
            <div className="w-px h-6 bg-gradient-to-b from-[#22c55e]/40 to-white/[0.06]" />
            <span className="text-[9px] text-white/30 uppercase tracking-widest font-bold">muestra públicamente ↓</span>
          </div>
        </div>

        {/* ── Step 3: Vitrina Digital ── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="mb-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-[#22c55e] text-white text-xs font-black flex items-center justify-center">3</span>
            <span className="text-sm font-black text-white/70 uppercase tracking-widest">Muéstralo públicamente</span>
          </div>
          {/* Captura REAL: vitrina pública de la tienda (demo controlado) */}
          <FeatureVisual
            src="/landing/capturas/tienda-publica-productos.webp"
            srcMobile="/landing/capturas/tienda-publica-movil.webp"
            alt="Vitrina digital pública de una tienda de CostPro: catálogo con fotos de productos, precios en CUP y badge de disponibilidad, que los clientes consultan sin instalar nada."
            caption="Vitrina pública real — la grilla de productos que ve tu cliente"
            frameLabel="tienda.costpro.app"
            sizes="(max-width: 640px) 100vw, (max-width: 1056px) calc(100vw - 3rem), 976px"
          />
        </motion.div>

        {/* Caption */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="text-center text-xs text-white/30 mt-4 max-w-md mx-auto"
        >
          Publica en tu vitrina los productos que habilites para cada tienda.
          Los clientes consultan precios y disponibilidad antes de visitarte.
        </motion.p>
      </div>
    </section>
  );
}
