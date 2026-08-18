'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Building2, Check, Package, ShoppingCart, Globe,
  TrendingUp, Store,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';

/**
 * MultiStoreVisualSection — Demostración visual del ecosistema multi-tienda.
 *
 * Muestra:
 * 1. Panel de administración CostPro con selector de tienda
 * 2. Múltiples tiendas conectadas (datos de DEMOSTRACIÓN estáticos)
 * 3. Una tienda expandida mostrando su vitrina digital
 *
 * NO es un diagrama genérico: usa los mismos patrones de UI que
 * StoreSelectorSheet, StorefrontPage y el Dashboard real.
 *
 * AUDIT (2026-08-18): Todos los datos son MOCK estáticos definidos en
 * este archivo. No consulta la DB. Los nombres de tiendas, KPIs,
 * productos y URL son de demostración. La URL mostrada usa el dominio
 * real del producto (costpro.onrender.com) con slug genérico.
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
          {/* AUDIT: BadgeDemo — datos de demostración, no de producción */}
          <span className="inline-flex items-center gap-1.5 mt-3 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-[10px] font-bold text-white/40 uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60" />
            Mockup de demostración
          </span>
        </motion.div>

        {/* ── Step 1: Administration Panel ── */}
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
          {/* Mockup: CostPro dashboard with store selector */}
          <div className="rounded-2xl border border-white/[0.06] bg-[#0a0f1a] overflow-hidden shadow-2xl">
            {/* Top bar: store selector (based on real StoreSelectorSheet) */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#22c55e]" />
                <span className="text-xs font-black text-white uppercase tracking-tight">Tienda Central</span>
                <svg className="w-3 h-3 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
              <span className="text-[10px] text-white/30 font-bold">CostPro Admin</span>
            </div>
            {/* Dashboard KPIs (based on real dashboard pattern) */}
            <div className="grid grid-cols-3 gap-2 p-3">
              {[
                { label: 'Productos', value: '34', icon: Package, color: 'text-blue-400' },
                { label: 'Ventas hoy', value: '12', icon: ShoppingCart, color: 'text-emerald-400' },
                { label: 'Stock total', value: '508', icon: TrendingUp, color: 'text-amber-400' },
              ].map(kpi => (
                <div key={kpi.label} className="rounded-lg bg-white/[0.02] p-2.5 border border-white/[0.03]">
                  <kpi.icon className={cn('w-3.5 h-3.5 mb-1', kpi.color)} />
                  <p className="text-lg font-black text-white tabular-nums">{kpi.value}</p>
                  <p className="text-[9px] text-white/40 uppercase tracking-wider">{kpi.label}</p>
                </div>
              ))}
            </div>
            {/* Store list mini (based on real StoreSelectorSheet pattern) */}
            <div className="px-3 pb-3 space-y-1">
              {[
                { name: 'Tienda Central', active: true, products: 34, sales: 12 },
                { name: 'Sucursal Norte', active: false, products: 36, sales: 8 },
                { name: 'Sucursal Centro', active: false, products: 28, sales: 5 },
              ].map(store => (
                <div
                  key={store.name}
                  className={cn(
                    'flex items-center justify-between px-3 py-2 rounded-lg transition-colors',
                    store.active ? 'bg-[#22c55e]/10 border border-[#22c55e]/20' : 'bg-white/[0.01] border border-white/[0.02]'
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {store.active ? (
                      <Check className="w-3.5 h-3.5 text-[#22c55e] shrink-0" />
                    ) : (
                      <Building2 className="w-3.5 h-3.5 text-white/20 shrink-0" />
                    )}
                    <span className={cn('text-xs font-bold truncate', store.active ? 'text-[#22c55e]' : 'text-white/40')}>
                      {store.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[9px] text-white/30 tabular-nums">{store.products} prod</span>
                    <span className="text-[9px] text-white/30 tabular-nums">{store.sales} ventas</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
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
                { name: 'Cemento cola 25kg', price: 8500, stock: 45 },
                { name: 'Pintura 4L Blanca', price: 5500, stock: 16 },
                { name: 'Zinc (3.85x80)', price: 8000, stock: 113 },
                { name: 'Escobas', price: 1800, stock: 6 },
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
          {/* Mockup: Storefront page (based on real StorefrontPage.tsx) */}
          <div className="rounded-2xl border border-white/[0.06] bg-[#0a0f1a] overflow-hidden shadow-2xl">
            {/* Browser URL bar */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.04] bg-white/[0.01]">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/30" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/30" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/30" />
              </div>
              <div className="flex-1 mx-2 px-2 py-0.5 rounded bg-white/[0.03] text-[9px] text-white/30 font-mono truncate">
                costpro.onrender.com/tienda/tienda_central
              </div>
              <Globe className="w-3 h-3 text-white/20" />
            </div>
            {/* Storefront content (based on real StorefrontPage) */}
            <div className="p-3">
              {/* Banner area */}
              <div className="rounded-lg bg-gradient-to-r from-[#22c55e]/10 to-transparent p-4 mb-3 border border-[#22c55e]/10">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded bg-[#22c55e]/20 flex items-center justify-center">
                    <Store className="w-3 h-3 text-[#22c55e]" />
                  </div>
                  <span className="text-sm font-black text-white">Tienda Central</span>
                </div>
                <p className="text-[10px] text-white/40">Materiales de construcción · La Habana, Cuba</p>
              </div>
              {/* Products grid (based on real storefront product card) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { name: 'Cemento cola 25kg', price: 8500, inStock: true },
                  { name: 'Pintura 4L Blanca', price: 5500, inStock: true },
                  { name: 'Zinc (3.85x80)', price: 8000, inStock: true },
                  { name: 'Escobas', price: 1800, inStock: false },
                  { name: 'Araganes', price: 1600, inStock: true },
                  { name: 'Espejos', price: 5500, inStock: true },
                ].map(p => (
                  <div key={p.name} className="rounded-lg bg-white/[0.02] p-2 border border-white/[0.03]">
                    <div className="w-full h-10 rounded bg-white/[0.03] mb-1.5 flex items-center justify-center">
                      <Package className="w-3.5 h-3.5 text-white/10" />
                    </div>
                    <p className="text-[9px] font-bold text-white truncate">{p.name}</p>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[10px] font-black text-[#22c55e] tabular-nums">{formatCurrency(p.price)}</span>
                      {p.inStock ? (
                        <span className="text-[7px] font-bold text-green-400 bg-green-500/10 px-1 py-0.5 rounded">Disponible</span>
                      ) : (
                        <span className="text-[7px] font-bold text-red-400 bg-red-500/10 px-1 py-0.5 rounded">Agotado</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {/* Contact bar (based on real storefront WhatsApp/Telegram) */}
              <div className="flex items-center gap-2 mt-3 pt-2 border-t border-white/[0.04]">
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#22c55e]/10 border border-[#22c55e]/15">
                  <span className="text-[9px] font-bold text-[#22c55e]">WhatsApp</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/15">
                  <span className="text-[9px] font-bold text-blue-400">Telegram</span>
                </div>
                <span className="text-[8px] text-white/20 ml-auto">Los clientes ven tus productos y te contactan</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Caption */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="text-center text-xs text-white/30 mt-4 max-w-md mx-auto"
        >
          Lo que administras en CostPro se muestra en la vitrina digital de cada tienda.
          Los clientes consultan productos, precios y disponibilidad antes de visitarte.
        </motion.p>
      </div>
    </section>
  );
}
