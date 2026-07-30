'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ArrowUp, MessageCircle, Send, X, Zap, Plus, CreditCard, Play, Phone, Keyboard,
} from 'lucide-react';
import { ConfettiBurst } from './animations';

export interface FloatingElementsProps {
  showScrollTop: boolean;
  scrollProgress: number;
  showChat: boolean;
  chatInput: string;
  setChatInput: (v: string) => void;
  showBackToFeatures: boolean;
  showFab: boolean;
  showConfetti: boolean;
  mounted: boolean;
  smoothScrollToTop: () => void;
  setShowChat: (v: boolean) => void;
  setShowShortcutsModal: (v: boolean) => void;
  setShowContactModal: (v: boolean) => void;
  setShowFab: (v: boolean) => void;
  handleChatSend: () => void;
  scrollToSection: (idx: number) => void;
  featuresRef: React.RefObject<HTMLDivElement | null>;
}

export default function FloatingElements({
  showScrollTop,
  scrollProgress,
  showChat,
  chatInput,
  setChatInput,
  showBackToFeatures,
  showFab,
  showConfetti,
  mounted,
  smoothScrollToTop,
  setShowChat,
  setShowShortcutsModal,
  setShowContactModal,
  setShowFab,
  handleChatSend,
  scrollToSection,
  featuresRef,
}: FloatingElementsProps) {
  return (
    <>
      {/* ─── Floating Back to Top button with Progress Ring & Percentage ─── */}
      <ConfettiBurst active={showConfetti} />
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.6, y: 20 }}
            animate={{ opacity: 1, scale: [0.6, 1.15, 1], y: 0 }}
            exit={{ opacity: 0, scale: 0.6, y: 20 }}
            transition={{ duration: 0.5, ease: 'easeOut', times: [0, 0.5, 1] }}
            onClick={() => {
              smoothScrollToTop();
              if (scrollProgress > 90) {
                setTimeout(() => { toast.success('🎉 ¡Bienvenido de nuevo!'); }, 500);
              }
            }}
            className="fixed bottom-6 right-6 z-[60] w-12 h-12 rounded-full bg-primary/90 text-white shadow-lg shadow-primary/20 hover:bg-primary hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 flex flex-col items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring group"
            aria-label={`Volver arriba - ${Math.round(scrollProgress)}%`}
          >
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="21" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5" />
              <circle
                cx="24" cy="24" r="21" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 21}`}
                strokeDashoffset={`${2 * Math.PI * 21 * (1 - scrollProgress / 100)}`}
                className="transition-[stroke-dashoffset] duration-150 ease-out"
              />
            </svg>
            <ArrowUp className="w-4 h-4 relative z-10 mb-px" strokeWidth={2.5} />
            <span className="relative z-10 text-[9px] font-bold leading-none tabular-nums">{Math.round(scrollProgress)}%</span>
            {/* Enhanced Tooltip */}
            <span className="absolute bottom-full right-0 mb-3 px-3 py-1.5 rounded-lg bg-white dark:bg-[#111827] text-foreground text-[11px] font-medium shadow-xl border border-border whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none flex items-center gap-1.5">
              <ArrowUp className="w-3 h-3 text-[#22c55e]" />
              <span>Volver arriba</span>
              <span className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-white dark:border-t-[#111827]" />
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ─── Floating Chat Widget ─── */}
      <div className="fixed bottom-6 right-[4.5rem] z-[60] flex flex-col items-end gap-2">
        <AnimatePresence>
          {showChat && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="w-80 max-w-[calc(100vw-3rem)] rounded-xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-white/[0.06] shadow-2xl shadow-black/10 overflow-hidden"
            >
              <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-[#22c55e] to-[#10b981]">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <MessageCircle className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">CostPro Assistant</p>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    <span className="text-[10px] text-white/80">En línea</span>
                  </div>
                </div>
                <button
                  onClick={() => setShowChat(false)}
                  className="w-6 h-6 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                  aria-label="Cerrar chat"
                >
                  <X className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
              <div className="p-4 space-y-3 max-h-60 overflow-y-auto">
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#22c55e]/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Zap className="w-3 h-3 text-[#22c55e]" />
                  </div>
                  <div className="bg-[#22c55e]/5 border border-[#22c55e]/10 rounded-lg rounded-tl-none px-3 py-2 max-w-[85%]">
                    <p className="text-xs text-foreground leading-relaxed">¡Hola! 👋 ¿En qué puedo ayudarte?</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#22c55e]/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Zap className="w-3 h-3 text-[#22c55e]" />
                  </div>
                  <div className="bg-[#22c55e]/5 border border-[#22c55e]/10 rounded-lg rounded-tl-none px-3 py-2 max-w-[85%]">
                    <p className="text-xs text-foreground leading-relaxed">Puedo ayudarte con configuración, reportes o cualquier duda.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#22c55e]/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Zap className="w-3 h-3 text-[#22c55e]" />
                  </div>
                  <div className="bg-[#22c55e]/5 border border-[#22c55e]/10 rounded-lg rounded-tl-none px-3 py-2 max-w-[85%]">
                    <p className="text-xs text-foreground leading-relaxed">Escribe tu mensaje o usa las opciones rápidas:</p>
                  </div>
                </div>
              </div>
              <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                <button onClick={() => setShowContactModal(true)} className="px-3 py-1.5 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/20 text-[10px] font-semibold text-[#22c55e] hover:bg-[#22c55e]/20 transition-colors">Solicitar Demo</button>
                <button onClick={() => toast.info('Soporte técnico disponible en Pro y Enterprise')} className="px-3 py-1.5 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/20 text-[10px] font-semibold text-[#22c55e] hover:bg-[#22c55e]/20 transition-colors">Soporte Técnico</button>
                <button onClick={() => scrollToSection(3)} className="px-3 py-1.5 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/20 text-[10px] font-semibold text-[#22c55e] hover:bg-[#22c55e]/20 transition-colors">Planes y Precios</button>
              </div>
              <div className="px-4 pb-4">
                <div className="flex items-center gap-2 p-1 rounded-lg bg-muted border border-border">
                  <input
                    type="text"
                    placeholder="Escribe tu mensaje..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
                    className="flex-1 px-2 py-1.5 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                    aria-label="Escribir mensaje"
                  />
                  <button
                    onClick={handleChatSend}
                    className="w-7 h-7 rounded-md bg-[#22c55e] hover:bg-[#16a34a] flex items-center justify-center transition-colors shrink-0"
                    aria-label="Enviar mensaje"
                  >
                    <Send className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* F5: WhatsApp directo — link a wa.me/5353183215 en vez de modal de chat.
          El usuario pedía que al hacer clic abra WhatsApp directamente, no un modal. */}
      <motion.a
        href="https://wa.me/5353183215"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-[4.5rem] right-6 z-[60] w-12 h-12 rounded-full bg-[#22c55e] text-white shadow-lg shadow-[#22c55e]/30 hover:bg-[#16a34a] hover:shadow-xl hover:shadow-[#22c55e]/40 transition-all duration-300 flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring group"
        aria-label="Chatear por WhatsApp +53 53183215"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {/* WhatsApp SVG icon */}
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-500 border-2 border-white dark:border-[#0a0f1a] animate-pulse" />
      </motion.a>

      {/* ─── Back to Features FAB ─── */}
      <AnimatePresence>
        {showBackToFeatures && (
          <motion.button
            initial={{ opacity: 0, x: -20, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -20, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            onClick={() => featuresRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="fixed bottom-6 left-6 z-40 w-11 h-11 rounded-full bg-white/[0.08] backdrop-blur-xl border border-white/[0.12] text-[#22c55e] shadow-lg shadow-black/20 hover:bg-[#22c55e]/15 hover:border-[#22c55e]/30 hover:shadow-xl hover:shadow-[#22c55e]/10 transition-all duration-300 flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-[#22c55e]/40 group"
            aria-label="Volver a Funciones"
          >
            <Zap className="w-4.5 h-4.5" />
            {/* Tooltip */}
            <span className="absolute left-full ml-3 px-2.5 py-1 rounded-lg bg-[#111827]/95 backdrop-blur-xl border border-white/15 text-[10px] font-medium text-white/80 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none shadow-xl">
              Funciones
              <span className="absolute right-full top-1/2 -translate-y-1/2 w-2 h-2 rotate-45 bg-[#111827]/95 border-r border-b border-white/15" />
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ─── Quick Actions FAB (desktop only) ─── */}
      <div className="fixed bottom-24 left-6 z-40 hidden lg:flex flex-col items-end gap-2">
        <AnimatePresence>
          {showFab && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="flex flex-col items-end gap-2 mb-2"
            >
              {[
                { icon: CreditCard, label: 'Plan Free', action: () => { const el = document.querySelector('#pricing'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); setShowFab(false); } },
                { icon: Play, label: 'Ver Demo', action: () => { const el = document.querySelector('[aria-label="Ver demo de CostPro"]'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); setShowFab(false); } },
                { icon: Phone, label: 'Contactar', action: () => { setShowContactModal(true); setShowFab(false); } },
              ].map((item, idx) => (
                <motion.button
                  key={item.label}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05, duration: 0.2 }}
                  onClick={item.action}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/95 dark:bg-[#111827]/95 border border-gray-200 dark:border-white/10 shadow-lg shadow-black/10 backdrop-blur-md text-xs font-medium text-foreground hover:bg-[#22c55e]/10 hover:text-[#22c55e] hover:border-[#22c55e]/20 transition-all duration-200"
                  aria-label={item.label}
                >
                  <span>{item.label}</span>
                  <item.icon className="w-3.5 h-3.5" />
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <motion.button
          onClick={() => setShowFab(!showFab)}
          className="w-12 h-12 rounded-full bg-[#22c55e] text-white shadow-lg shadow-[#22c55e]/30 hover:bg-[#16a34a] hover:shadow-xl hover:shadow-[#22c55e]/40 transition-all duration-300 flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Acciones rápidas"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <motion.span
            animate={{ rotate: showFab ? 45 : 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            <Plus className="w-5 h-5" />
          </motion.span>
        </motion.button>
      </div>

      {/* ─── Keyboard Shortcut Hint ─── */}
      {mounted && (
        <button
          onClick={() => setShowShortcutsModal(true)}
          className="fixed bottom-6 left-6 z-40 hidden lg:flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/60 border border-border/50 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted transition-all group"
          aria-label="Mostrar atajos de teclado"
        >
          <Keyboard className="w-3 h-3" />
          <kbd className="font-mono">?</kbd>
        </button>
      )}
    </>
  );
}
