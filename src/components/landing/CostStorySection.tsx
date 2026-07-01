'use client';

import React, { useRef, useEffect } from 'react';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import dynamic from 'next/dynamic';
import { TrendingUp, TrendingDown, AlertTriangle, DollarSign, Package, Users, Zap, Shield, ArrowRight, CheckCircle2, Calculator } from 'lucide-react';

/**
 * CostStorySection — Scroll storytelling premium con Three.js WebGL.
 *
 * El edificio 3D se renderiza con Three.js (Building3DCanvas) via canvas WebGL
 * fijo en pantalla. La cámara se mueve según el scroll progress de esta sección.
 *
 * Las 7 escenas son secciones HTML que pasan por encima del canvas 3D.
 */

const Building3DCanvas = dynamic(() => import('./Building3DCanvas'), { ssr: false });

const COST_ELEMENTS = [
  { icon: Package, label: 'Materias primas', color: 'text-orange-400', bg: 'bg-orange-500/10' },
  { icon: Users, label: 'Mano de obra', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { icon: Zap, label: 'Electricidad', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  { icon: Calculator, label: 'Gastos indirectos', color: 'text-purple-400', bg: 'bg-purple-500/10' },
];

const USD_STEPS = [500, 550, 600, 650];
const MARGIN_STEPS = [
  { value: 25, label: 'Saludable', color: 'text-green-400' },
  { value: 18, label: 'Bajando', color: 'text-yellow-400' },
  { value: 10, label: 'Crítico', color: 'text-orange-400' },
  { value: -3, label: 'Pérdidas', color: 'text-red-400' },
];

function Scene({ children, bg = 'bg-transparent' }: { children: React.ReactNode; bg?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: false, margin: '-25% 0px -25% 0px' });
  return (
    <div ref={ref} className={`relative min-h-screen flex items-center justify-center px-6 ${bg} text-white`}>
      <motion.div
        animate={{ opacity: isInView ? 1 : 0, y: isInView ? 0 : 40 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="w-full max-w-4xl relative z-10"
      >
        {children}
      </motion.div>
    </div>
  );
}

export default function CostStorySection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  // Track scroll progress for Three.js
  const [progress, setProgress] = React.useState(0);
  useEffect(() => {
    const unsubscribe = scrollYProgress.on('change', v => {
      setProgress(v);
      // Update global var that Building3DCanvas reads
      if (typeof window !== 'undefined') {
        (window as any).__costStoryProgress = v;
      }
    });
    return () => unsubscribe();
  }, [scrollYProgress]);

  return (
    <>
      {/* Three.js canvas — fixed fullscreen, behind content */}
      <Building3DCanvas scrollProgress={progress} />

      {/* Scroll container — 7 scenes × 130vh */}
      <section ref={containerRef} className="relative z-10" style={{ height: '910vh' }}>
        {/* ═══ ESCENA 1 — EL NEGOCIO ═══ */}
        <Scene>
          <div className="flex flex-col items-center text-center">
            <div className="px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-xs font-black uppercase tracking-widest text-green-400 mb-6">
              CostPro
            </div>
            <h2 className="text-3xl md:text-6xl font-black mb-4 max-w-3xl leading-tight">
              Todo negocio parece rentable a simple vista
            </h2>
            <p className="text-sm md:text-lg text-white/50 max-w-xl">
              Clientes entrando, ventas realizándose, actividad constante. Pero bajo la superficie, la realidad puede ser muy diferente.
            </p>
          </div>
        </Scene>

        {/* ═══ ESCENA 2 — LOS COSTOS OCULTOS ═══ */}
        <Scene>
          <div className="flex flex-col items-center text-center">
            <h2 className="text-2xl md:text-5xl font-black mb-2 max-w-2xl">La rentabilidad real no se ve.</h2>
            <h2 className="text-2xl md:text-5xl font-black text-green-400 mb-6 max-w-2xl">Se calcula.</h2>
            <p className="text-sm md:text-base text-white/50 max-w-xl mb-10">
              Debajo de cada venta existe una red de costos que determina si realmente ganas o pierdes dinero.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl w-full">
              {COST_ELEMENTS.map((el, i) => (
                <motion.div
                  key={el.label}
                  initial={{ scale: 0, opacity: 0 }}
                  whileInView={{ scale: 1, opacity: 1 }}
                  viewport={{ once: false, margin: '-20%' }}
                  transition={{ delay: i * 0.15, type: 'spring' }}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl ${el.bg} border border-white/10 backdrop-blur-xl`}
                >
                  <div className={`w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center ${el.color}`}>
                    <el.icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest text-white/70">{el.label}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </Scene>

        {/* ═══ ESCENA 3 — CONSTRUCCIÓN DE LA FICHA ═══ */}
        <Scene>
          <div className="flex flex-col items-center text-center">
            <div className="px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-xs font-black uppercase tracking-widest text-green-400 mb-4">
              Inteligencia de costos
            </div>
            <h2 className="text-2xl md:text-5xl font-black mb-2 max-w-2xl">CostPro transforma datos dispersos</h2>
            <h2 className="text-2xl md:text-5xl font-black text-green-400 mb-8 max-w-2xl">en decisiones inteligentes.</h2>
            <div className="space-y-2 max-w-md w-full text-left">
              {COST_ELEMENTS.map((el, i) => (
                <motion.div
                  key={el.label}
                  initial={{ x: -50, opacity: 0 }}
                  whileInView={{ x: 0, opacity: 1 }}
                  viewport={{ once: false, margin: '-20%' }}
                  transition={{ delay: i * 0.2 }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md"
                >
                  <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                  <el.icon className={`w-4 h-4 ${el.color}`} />
                  <span className="text-sm font-bold text-white/80">{el.label}</span>
                  <span className="ml-auto text-xs font-mono text-white/40">✓ Integrado</span>
                </motion.div>
              ))}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: false, margin: '-20%' }}
                transition={{ delay: 1 }}
                className="flex items-center justify-between p-4 rounded-xl bg-green-500/10 border border-green-500/30 mt-4 backdrop-blur-md"
              >
                <span className="text-sm font-black uppercase tracking-widest text-green-400">Costo Total</span>
                <span className="text-xl font-black font-mono text-white">847.50 CUP</span>
              </motion.div>
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: false, margin: '-20%' }}
                transition={{ delay: 1.3 }}
                className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-green-500/20 to-emerald-500/10 border border-green-500/40 backdrop-blur-md"
              >
                <span className="text-sm font-black uppercase tracking-widest text-green-400">Precio Recomendado</span>
                <span className="text-2xl font-black font-mono text-green-400">1,123.75 CUP</span>
              </motion.div>
            </div>
          </div>
        </Scene>

        {/* ═══ ESCENA 4 — APARECE EL DÓLAR ═══ */}
        <Scene>
          <div className="flex flex-col items-center text-center">
            <h2 className="text-2xl md:text-5xl font-black mb-8 max-w-xl">
              Pero el dólar <span className="text-amber-400">no se detiene</span>
            </h2>
            <div className="flex items-center gap-4 md:gap-8 mb-6">
              {USD_STEPS.map((rate, i) => (
                <motion.div
                  key={rate}
                  initial={{ scale: 0, opacity: 0 }}
                  whileInView={{ scale: 1, opacity: 1 }}
                  viewport={{ once: false, margin: '-20%' }}
                  transition={{ delay: i * 0.3 }}
                  className={`flex flex-col items-center gap-1 ${i === USD_STEPS.length - 1 ? 'text-red-400' : i === 0 ? 'text-green-400' : 'text-amber-400'}`}
                >
                  <DollarSign className="w-6 h-6" />
                  <span className="text-lg md:text-3xl font-black font-mono">{rate}</span>
                  <span className="text-xs text-white/40">CUP</span>
                </motion.div>
              ))}
            </div>
            <motion.div
              initial={{ width: 0 }}
              whileInView={{ width: '60%' }}
              viewport={{ once: false, margin: '-20%' }}
              transition={{ delay: 1.5, duration: 1 }}
              className="h-1 bg-gradient-to-r from-green-400 via-amber-400 to-red-400 rounded-full max-w-xs"
            />
            <p className="text-sm text-white/40 mt-6 max-w-md">
              El USD sube. Tus costos de reposición suben. Pero sigues vendiendo al precio antiguo.
            </p>
          </div>
        </Scene>

        {/* ═══ ESCENA 5 — EL RIESGO ═══ */}
        <Scene>
          <div className="flex flex-col items-center text-center">
            <h2 className="text-2xl md:text-5xl font-black mb-10 max-w-xl">
              Tu rentabilidad se <span className="text-red-400">desvanece</span>
            </h2>
            <div className="flex items-center gap-3 md:gap-6 mb-8">
              {MARGIN_STEPS.map((step, i) => (
                <div key={i} className="flex items-center gap-3 md:gap-6">
                  <motion.div
                    initial={{ y: 30, opacity: 0 }}
                    whileInView={{ y: 0, opacity: 1 }}
                    viewport={{ once: false, margin: '-20%' }}
                    transition={{ delay: i * 0.3 }}
                    className="flex flex-col items-center gap-1"
                  >
                    <span className={`text-2xl md:text-4xl font-black font-mono ${step.color}`}>
                      {step.value > 0 ? `${step.value}%` : `${step.value}%`}
                    </span>
                    <span className="text-xs text-white/40 uppercase tracking-widest">{step.label}</span>
                  </motion.div>
                  {i < MARGIN_STEPS.length - 1 && <ArrowRight className="w-4 h-4 text-white/20" />}
                </div>
              ))}
            </div>
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: false, margin: '-20%' }}
              transition={{ delay: 1.8 }}
              className="max-w-lg text-center"
            >
              <p className="text-lg md:text-2xl font-bold text-white/80">"El problema no es vender."</p>
              <p className="text-lg md:text-2xl font-black text-red-400 mt-1">"El problema es vender sin saber cuánto ganas realmente."</p>
            </motion.div>
          </div>
        </Scene>

        {/* ═══ ESCENA 6 — COSTPRO INTERVIENE ═══ */}
        <Scene>
          <div className="flex flex-col items-center text-center">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: false, margin: '-20%' }}
              transition={{ duration: 0.6 }}
              className="relative mb-6"
            >
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-2xl shadow-green-500/30">
                <span className="text-2xl font-black text-white">CP</span>
              </div>
              <div className="absolute -inset-4 bg-green-500/20 blur-3xl rounded-full pointer-events-none" />
            </motion.div>
            <h2 className="text-2xl md:text-5xl font-black mb-6 max-w-xl">
              CostPro <span className="text-green-400">interviene</span>
            </h2>
            <div className="space-y-3 max-w-md w-full text-left">
              {[
                { icon: Calculator, text: 'Analiza costos y tasas cambiarias', color: 'text-blue-400' },
                { icon: TrendingUp, text: 'Detecta pérdida de margen', color: 'text-amber-400' },
                { icon: Shield, text: 'Genera precios recomendados', color: 'text-green-400' },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ x: -30, opacity: 0 }}
                  whileInView={{ x: 0, opacity: 1 }}
                  viewport={{ once: false, margin: '-20%' }}
                  transition={{ delay: 0.5 + i * 0.2 }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md"
                >
                  <item.icon className={`w-5 h-5 ${item.color}`} />
                  <span className="text-sm font-bold text-white/80">{item.text}</span>
                  <CheckCircle2 className="w-4 h-4 text-green-400 ml-auto" />
                </motion.div>
              ))}
            </div>
            <motion.div
              initial={{ width: 0 }}
              whileInView={{ width: '70%' }}
              viewport={{ once: false, margin: '-20%' }}
              transition={{ delay: 1.5, duration: 1 }}
              className="h-2 bg-gradient-to-r from-red-400 via-amber-400 to-green-400 rounded-full mt-6 max-w-sm"
            />
            <p className="text-sm text-green-400 mt-3 font-bold">Rentabilidad recuperada ✓</p>
          </div>
        </Scene>

        {/* ═══ ESCENA 7 — MENSAJE FINAL ═══ */}
        <Scene bg="bg-gradient-to-b from-transparent via-[#06060B]/80 to-[#06060B]">
          <div className="flex flex-col items-center text-center">
            <motion.h2
              initial={{ y: 40, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: false, margin: '-20%' }}
              transition={{ duration: 0.8 }}
              className="text-3xl md:text-6xl font-black max-w-3xl leading-tight mb-6"
            >
              Una ficha de costo no es un documento.
              <br />
              <span className="bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
                Es el sistema que protege la rentabilidad de tu negocio.
              </span>
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: false, margin: '-20%' }}
              transition={{ delay: 0.5 }}
              className="text-sm md:text-lg text-white/50 max-w-xl mb-10"
            >
              Cada día que vendes sin controlar tus costos o sin reaccionar a las tasas cambiarias,
              puedes estar perdiendo dinero sin darte cuenta.
            </motion.p>
            <motion.a
              href="#pricing"
              initial={{ scale: 0.8, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: false, margin: '-20%' }}
              transition={{ delay: 1, type: 'spring' }}
              className="px-8 py-4 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-black uppercase tracking-widest text-sm shadow-2xl shadow-green-500/30 hover:scale-105 transition-transform"
            >
              Empieza a decidir con datos
              <ArrowRight className="w-4 h-4 inline ml-2" />
            </motion.a>
          </div>
        </Scene>
      </section>
    </>
  );
}
