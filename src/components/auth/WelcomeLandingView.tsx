'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, ArrowRight, Layers, Calculator, Building, Zap } from 'lucide-react';
import Link from 'next/link';
import { useActionBus } from '@/hooks/useActionBus';
import { registry } from '@/core/features/registry';
import { cn } from '@/lib/utils';

interface WelcomeLandingViewProps {
  onLoginClick: () => void;
}

export default function WelcomeLandingView({ onLoginClick }: WelcomeLandingViewProps) {
  const { dispatch } = useActionBus();
  const features = registry.getAllFeatures();

  const handleCTA = (id: string) => {
    dispatch('cta_click', { id });
    onLoginClick();
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative pt-20 pb-32 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
        <div className="max-w-7xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-foreground mb-6 font-headline leading-none uppercase">
              Control <span className="text-primary">Total</span> de tu Rentabilidad.
            </h1>
            <p className="text-xl md:text-2xl text-on-surface-variant max-w-3xl mx-auto mb-12 font-sans">
              La primera plataforma de arquitectura financiera modular para empresas que no permiten errores en sus flujos de caja.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-6">
              <button
                onClick={() => handleCTA('hero_main')}
                className="bg-primary text-on-primary font-bold px-12 py-5 rounded-xl text-lg hover:scale-105 transition-all shadow-xl uppercase tracking-widest flex items-center gap-3 justify-center"
              >
                Comenzar Auditoría <ArrowRight className="w-5 h-5" />
              </button>
              <Link
                href="/ipv"
                className="bg-surface border border-border text-foreground font-bold px-12 py-5 rounded-xl text-lg hover:bg-surface-variant transition-all uppercase tracking-widest flex items-center gap-3 justify-center"
              >
                Explorar Módulos
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="py-24 px-6 bg-surface-variant/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black uppercase tracking-tighter mb-4">Arquitectura de Producto Modular</h2>
            <p className="text-on-surface-variant max-w-2xl mx-auto">Selecciona las capacidades que tu operación requiere hoy. Escala mañana sin fricción.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature) => (
              <div
                key={feature.id}
                className="bg-surface border border-border p-8 rounded-3xl group hover:border-primary/50 transition-all shadow-sm"
              >
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-6 group-hover:scale-110 transition-transform">
                  {feature.id === 'ipv' && <Layers className="w-8 h-8" />}
                  {feature.id === 'costs' && <Calculator className="w-8 h-8" />}
                  {feature.id === 'multistore' && <Building className="w-8 h-8" />}
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <h3 className="text-2xl font-black uppercase tracking-tighter">{feature.name}</h3>
                  {feature.isPro && (
                    <span className="text-[10px] bg-primary/20 text-primary px-2 py-1 rounded font-black uppercase tracking-widest">Pro</span>
                  )}
                </div>
                <p className="text-on-surface-variant mb-8 leading-relaxed">
                  {feature.description}
                </p>
                <Link
                  href={feature.path}
                  className="flex items-center gap-2 text-primary font-black uppercase tracking-widest text-xs group-hover:gap-4 transition-all"
                >
                  {feature.status === 'pro-locked' ? 'Ver Preview Pro' : 'Acceder al Módulo'}
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-32 px-6">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-5xl font-black uppercase tracking-tighter leading-none mb-8">Precisión <span className="text-primary">Quirúrgica</span> en cada Centavo.</h2>
            <ul className="space-y-6">
              {[
                "Conciliación bancaria automatizada al 100%",
                "Trazabilidad inmutable de movimientos de stock",
                "Integración nativa entre ventas y costos reales",
                "Alertas inteligentes de fugas operativas"
              ].map((text, i) => (
                <li key={i} className="flex items-center gap-4">
                  <div className="bg-primary/20 p-1 rounded-full">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                  </div>
                  <span className="font-bold text-lg text-on-surface">{text}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-surface-variant rounded-3xl p-12 border border-border relative overflow-hidden">
             <div className="absolute -right-20 -bottom-20 opacity-10">
               <Zap className="w-80 h-80 text-primary" />
             </div>
             <div className="relative z-10">
               <h3 className="text-2xl font-black uppercase tracking-tighter mb-4">Estado del Sistema</h3>
               <div className="space-y-4">
                  <div className="flex justify-between items-center p-4 bg-background rounded-xl border border-border">
                    <span className="text-xs font-bold uppercase tracking-widest">Motor IPV</span>
                    <span className="text-[10px] bg-green-500/20 text-green-500 px-2 py-1 rounded font-bold">OPERATIVO</span>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-background rounded-xl border border-border opacity-60">
                    <span className="text-xs font-bold uppercase tracking-widest">Cálculo de Costos</span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-500 px-2 py-1 rounded font-bold">PREVIEW</span>
                  </div>
               </div>
             </div>
          </div>
        </div>
      </section>
    </div>
  );
}
