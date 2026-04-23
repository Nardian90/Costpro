'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { howItWorksSteps } from './data';
import dynamic from 'next/dynamic';

const InteractiveDemo = dynamic(() => import('./demo/InteractiveDemo'), { ssr: false });

export interface HowItWorksSectionProps {
  howItWorksInView: boolean;
  activeStep: number;
  howItWorksRef: React.RefObject<HTMLDivElement | null>;
}

export default function HowItWorksSection({
  howItWorksInView,
  activeStep,
  howItWorksRef,
}: HowItWorksSectionProps) {
  return (
    <div ref={howItWorksRef} id="how-it-works">
      <motion.div className="max-w-4xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={howItWorksInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-6"
        >
          <h2 className="text-xl sm:text-2xl font-bold text-white font-[family-name:var(--font-space-grotesk)] section-heading-accent">
            ¿Cómo funciona?
          </h2>
          <p className="mt-2 text-sm text-white/50">
            Comienza en minutos, no en días
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative">
          {/* SVG Connecting line for lg screens (animated dashed) */}
          <div className="hidden lg:block absolute top-[2.8rem] left-[12.5%] right-[12.5%] h-0.5 pointer-events-none z-0">
            <svg className="w-full h-full" viewBox="0 0 600 8" preserveAspectRatio="none" fill="none">
              {howItWorksSteps.map((_, i) => (
                <line key={i} x1={i * 200} y1="4" x2={(i + 1) * 200} y2="4" className={
                  howItWorksInView && activeStep > i
                    ? 'step-connector-line-completed'
                    : howItWorksInView && activeStep === i
                      ? 'step-connector-line-active'
                      : 'step-connector-line'
                } />
              ))}
            </svg>
          </div>
          {/* SVG Connecting line for sm screens (between row 1 and row 2) */}
          <div className="hidden sm:block lg:hidden absolute top-[calc(50%+0.5rem)] left-1/2 -translate-x-1/2 w-0.5 h-8 pointer-events-none z-0">
            <svg className="w-full h-full" viewBox="0 0 8 40" preserveAspectRatio="none" fill="none">
              <line x1="4" y1="0" x2="4" y2="40" className={howItWorksInView ? 'step-connector-line-active' : 'step-connector-line'} />
            </svg>
          </div>
          {howItWorksSteps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 20 }}
              animate={howItWorksInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="relative group"
            >
              <div className={`flex flex-col items-center text-center p-5 rounded-xl bg-white/[0.04] border border-white/[0.06] backdrop-blur-sm hover:bg-white/[0.08] hover:border-[#22c55e]/20 transition-all duration-300 ${howItWorksInView && activeStep >= i ? 'step-active-glow' : ''}`}>
                {/* Prominent step number circle */}
                <div className="relative mb-3">
                  <motion.div
                    animate={howItWorksInView && activeStep >= i ? { rotate: [0, 360] } : {}}
                    transition={{ duration: 0.6, delay: 0.15, ease: 'easeOut' }}
                    className={`absolute -inset-2 rounded-full border border-dashed pointer-events-none transition-all duration-500 ${
                      howItWorksInView && activeStep >= i
                        ? 'border-[#22c55e]/40'
                        : 'border-[#22c55e]/15'
                    }`}
                  />
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all duration-300 group-hover:scale-110 ${
                    howItWorksInView && activeStep >= i
                      ? 'bg-gradient-to-br from-[#22c55e] to-emerald-500 border-[#22c55e] shadow-lg shadow-[#22c55e]/40 ring-4 ring-[#22c55e]/10'
                      : 'bg-[#22c55e]/10 border-[#22c55e]/30'
                  }`}>
                    <span className={`text-base font-extrabold transition-colors duration-300 ${
                      howItWorksInView && activeStep >= i ? 'text-white' : 'text-[#22c55e]/70'
                    }`}>{i + 1}</span>
                    {/* Checkmark when step is active/scroll into view */}
                    {howItWorksInView && activeStep >= i && (
                      <motion.div
                        initial={{ scale: 0, rotate: -90 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ delay: 0.4, type: 'spring', stiffness: 400, damping: 15 }}
                        className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#22c55e] flex items-center justify-center shadow-lg shadow-[#22c55e]/40"
                      >
                        <Check className="w-3 h-3 text-white" strokeWidth={3} />
                      </motion.div>
                    )}
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-[#22c55e]/10 border border-[#22c55e]/20 flex items-center justify-center mb-3 group-hover:bg-[#22c55e]/20 transition-all duration-300">
                  <step.icon className="w-5 h-5 text-[#22c55e]" />
                </div>
                <h3 className="text-sm font-bold text-white/90 mb-1">{step.title}</h3>
                <p className="text-[11px] text-white/40 leading-relaxed">{step.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ── Interactive Demo Player ── */}
        <InteractiveDemo />
      </motion.div>
    </div>
  );
}
