'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Suspense } from 'react';
import {
  Keyboard, Search, Building2, Send, Copy, Sparkles, Zap, X, Play, Phone,
} from 'lucide-react';
import { toast } from 'sonner';
import DataDecryption from '@/components/ui/DataDecryption';
import LoginForm from '@/components/auth/LoginForm';
import { shortcutsList, demoSlides } from './data';

/* ── Keyboard Shortcuts Modal ── */
export function ShortcutsModal({
  showShortcutsModal,
  setShowShortcutsModal,
  shortcutsSearch,
  setShortcutsSearch,
}: {
  showShortcutsModal: boolean;
  setShowShortcutsModal: (v: boolean) => void;
  shortcutsSearch: string;
  setShortcutsSearch: (v: string) => void;
}) {
  return (
    <Dialog open={showShortcutsModal} onOpenChange={(open) => { setShowShortcutsModal(open); if (!open) setShortcutsSearch(''); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-[#22c55e]" />
            Atajos de teclado
          </DialogTitle>
          <DialogDescription>
            Usa estos atajos para navegar más rápido por la página.
          </DialogDescription>
        </DialogHeader>
        {/* Search Filter */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar atajo..."
            value={shortcutsSearch}
            onChange={(e) => setShortcutsSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#22c55e]/40 focus:ring-1 focus:ring-[#22c55e]/20 transition-all"
            aria-label="Buscar atajos de teclado"
          />
        </div>
        <div className="space-y-2 py-2 max-h-64 overflow-y-auto">
          {['General', 'Navegación', 'Acciones'].map((category) => {
            const filtered = shortcutsList.filter(
              (s) => s.category === category && (s.desc.toLowerCase().includes(shortcutsSearch.toLowerCase()) || s.key.toLowerCase().includes(shortcutsSearch.toLowerCase()))
            );
            if (filtered.length === 0) return null;
            return (
              <div key={category}>
                <p className="text-[10px] font-semibold text-[#22c55e]/70 uppercase tracking-widest mb-1.5 pl-1">{category}</p>
                <div className="space-y-1">
                  {filtered.map((shortcut) => (
                    <motion.div
                      key={shortcut.key}
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors group"
                    >
                      <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{shortcut.desc}</span>
                      <kbd className="px-2.5 py-1 rounded-md bg-[#22c55e]/5 border border-[#22c55e]/10 text-xs font-mono font-semibold text-[#22c55e] shadow-sm group-hover:bg-[#22c55e]/10 group-hover:border-[#22c55e]/20 transition-colors">{shortcut.key}</kbd>
                    </motion.div>
                  ))}
                </div>
              </div>
            );
          })}
          {shortcutsSearch && shortcutsList.filter(
            (s) => s.desc.toLowerCase().includes(shortcutsSearch.toLowerCase()) || s.key.toLowerCase().includes(shortcutsSearch.toLowerCase())
          ).length === 0 && (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">No se encontraron atajos</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <button onClick={() => { setShowShortcutsModal(false); setShortcutsSearch(''); }} className="px-4 py-2 rounded-lg bg-[#22c55e] text-white text-xs font-bold hover:bg-[#16a34a] transition-colors">Entendido</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Demo Modal ── */
export function DemoModal({
  showDemoModal,
  setShowDemoModal,
  demoSlideIndex,
  setDemoSlideIndex,
}: {
  showDemoModal: boolean;
  setShowDemoModal: (v: boolean) => void;
  demoSlideIndex: number;
  setDemoSlideIndex: (v: number) => void;
}) {
  return (
    <Dialog open={showDemoModal} onOpenChange={setShowDemoModal}>
      <DialogContent className="sm:max-w-xl p-0 overflow-hidden">
        <div className="relative">
          {/* Demo slide content */}
          <motion.div
            key={demoSlideIndex}
            initial={{ opacity: 0, x: 30, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -30, scale: 0.96 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className={`w-full aspect-video bg-gradient-to-br ${demoSlides[demoSlideIndex].color} flex flex-col items-center justify-center p-8 relative overflow-hidden`}
          >
            {/* Grid pattern */}
            <div className="absolute inset-0 opacity-[0.03]" style={{
              backgroundImage: 'linear-gradient(rgba(34,197,94,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,0.3) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }} />
            <div className="relative z-10 text-center">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.08] border border-white/[0.12] backdrop-blur-sm flex items-center justify-center mx-auto mb-4 group">
                {(() => { const DemoIcon = demoSlides[demoSlideIndex].icon; return <DemoIcon className="w-8 h-8 group-hover:scale-110 transition-transform duration-300" style={{ color: demoSlides[demoSlideIndex].accent }} />; })()}
              </div>
              <h3 className="text-xl font-bold text-white font-[family-name:var(--font-space-grotesk)] mb-2">
                {demoSlides[demoSlideIndex].title}
              </h3>
              <p className="text-sm text-white/60">{demoSlides[demoSlideIndex].desc}</p>
              {/* Mock UI elements */}
              <div className="mt-6 mx-auto max-w-sm">
                <div className="h-2 rounded-full bg-white/[0.06] mb-2 overflow-hidden">
                  <motion.div
                    initial={{ width: '0%' }}
                    animate={{ width: ['30%', '60%', '85%', '60%'] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: demoSlides[demoSlideIndex].accent }}
                  />
                </div>
                <div className="flex gap-2 mt-4">
                  {[1, 2, 3].map((bar) => (
                    <motion.div
                      key={bar}
                      animate={{ height: [20, 40 + bar * 15, 30 + bar * 10] }}
                      transition={{ duration: 1.5 + bar * 0.3, repeat: Infinity, ease: 'easeInOut' }}
                      className="flex-1 rounded-t-md opacity-40"
                      style={{ backgroundColor: demoSlides[demoSlideIndex].accent }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
          {/* Close button overlay */}
          <button
            onClick={() => setShowDemoModal(false)}
            className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:bg-black/60 transition-colors"
            aria-label="Cerrar demo"
          >
            <X className="w-4 h-4 text-white/70" />
          </button>
          {/* Slide navigation dots with animated progress */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2.5">
            {demoSlides.map((slide, i) => (
              <button
                key={i}
                onClick={() => setDemoSlideIndex(i)}
                aria-label={`Slide ${i + 1}`}
                className="relative flex items-center justify-center"
              >
                <span className={`block rounded-full transition-all duration-400 ${i === demoSlideIndex ? 'w-6 h-2' : 'w-2 h-2 bg-white/25 hover:bg-white/45'}`}
                  style={{ backgroundColor: i === demoSlideIndex ? slide.accent : undefined }}
                />
                {i === demoSlideIndex && (
                  <motion.span
                    layoutId="demo-dot-glow"
                    className="absolute w-6 h-2 rounded-full"
                    style={{ backgroundColor: slide.accent, opacity: 0.3 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="p-4 bg-[#111827] border-t border-white/[0.06] flex items-center justify-between">
          <p className="text-[11px] text-white/40">
            Demo interactiva — {demoSlideIndex + 1} de {demoSlides.length}
          </p>
          <button
            onClick={() => setShowDemoModal(false)}
            className="px-4 py-1.5 rounded-lg bg-[#22c55e] text-white text-xs font-bold hover:bg-[#16a34a] transition-colors"
          >
            Comenzar gratis
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Contact Sales Modal ── */
export function ContactModal({
  showContactModal,
  setShowContactModal,
  contactForm,
  setContactForm,
  handleContactSubmit,
}: {
  showContactModal: boolean;
  setShowContactModal: (v: boolean) => void;
  contactForm: { name: string; email: string; company: string; phone: string; message: string };
  setContactForm: React.Dispatch<React.SetStateAction<{ name: string; email: string; company: string; phone: string; message: string }>>;
  handleContactSubmit: () => void;
}) {
  return (
    <Dialog open={showContactModal} onOpenChange={setShowContactModal}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#22c55e]" />
            Contactar Ventas — Enterprise
          </DialogTitle>
          <DialogDescription>
            Completa el formulario y nuestro equipo de ventas se pondrá en contacto contigo.
          </DialogDescription>
        </DialogHeader>
        {/* Copy Email shortcut */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border">
          <Send className="w-3.5 h-3.5 text-[#22c55e] shrink-0" />
          <span className="text-xs text-muted-foreground">O escríbenos a</span>
          <span className="text-xs font-semibold text-foreground">adrianpompasantana@gmail.com</span>
          <button
            onClick={() => {
              navigator.clipboard.writeText('adrianpompasantana@gmail.com');
              toast.success('Copiado!', { description: 'adrianpompasantana@gmail.com copiado al portapapeles' });
            }}
            className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#22c55e]/10 border border-[#22c55e]/20 text-[10px] font-semibold text-[#22c55e] hover:bg-[#22c55e]/20 transition-colors shrink-0"
            aria-label="Copiar correo"
          >
            <Copy className="w-3 h-3" />
            Copiar correo
          </button>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border">
          <Phone className="w-3.5 h-3.5 text-[#22c55e] shrink-0" />
          <span className="text-xs text-muted-foreground">O llámanos al</span>
          <span className="text-xs font-semibold text-foreground">+53 53183215</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5">
            <label htmlFor="contact-name" className="text-xs font-semibold text-foreground">Nombre <span className="text-red-400">*</span></label>
            <input id="contact-name" type="text" value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} placeholder="Tu nombre" className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#22c55e]/40 focus:ring-1 focus:ring-[#22c55e]/20 transition-all" aria-label="Nombre" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="contact-email" className="text-xs font-semibold text-foreground">Email <span className="text-red-400">*</span></label>
            <input id="contact-email" type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} placeholder="tu@empresa.com" className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#22c55e]/40 focus:ring-1 focus:ring-[#22c55e]/20 transition-all" aria-label="Email" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="contact-company" className="text-xs font-semibold text-foreground">Empresa</label>
            <input id="contact-company" type="text" value={contactForm.company} onChange={(e) => setContactForm({ ...contactForm, company: e.target.value })} placeholder="Nombre de tu empresa" className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#22c55e]/40 focus:ring-1 focus:ring-[#22c55e]/20 transition-all" aria-label="Empresa" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="contact-phone" className="text-xs font-semibold text-foreground">Teléfono</label>
            <input id="contact-phone" type="tel" value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} placeholder="+502 1234 5678" className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#22c55e]/40 focus:ring-1 focus:ring-[#22c55e]/20 transition-all" aria-label="Teléfono" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="contact-message" className="text-xs font-semibold text-foreground">Mensaje</label>
            <textarea id="contact-message" value={contactForm.message} onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })} placeholder="Cuéntanos sobre tus necesidades..." rows={3} className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#22c55e]/40 focus:ring-1 focus:ring-[#22c55e]/20 transition-all resize-none" aria-label="Mensaje" />
          </div>
        </div>
        <DialogFooter>
          <button onClick={() => setShowContactModal(false)} className="px-4 py-2 rounded-lg bg-muted border border-border text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
          <button onClick={handleContactSubmit} className="px-4 py-2 rounded-lg bg-[#22c55e] text-white text-xs font-bold hover:bg-[#16a34a] shadow-lg shadow-[#22c55e]/20 transition-all">Enviar solicitud</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── What's New Modal ── */
export function WhatsNewModal({
  showWhatsNew,
  setShowWhatsNew,
}: {
  showWhatsNew: boolean;
  setShowWhatsNew: (v: boolean) => void;
}) {
  return (
    <Dialog open={showWhatsNew} onOpenChange={setShowWhatsNew}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#22c55e]" />
            Novedades de la versión 5.8
          </DialogTitle>
          <DialogDescription>
            Descubre las últimas mejoras que hemos implementado para tu negocio.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {[
            'Motor de costos mejorado con fórmulas avanzadas',
            'Integración con WhatsApp Business',
            'Reportes personalizados con drag & drop',
            'Modo offline con sincronización automática',
          ].map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1, duration: 0.3 }}
              className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border/50 hover:bg-muted transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-[#22c55e]/10 flex items-center justify-center shrink-0 mt-0.5">
                <Zap className="w-4 h-4 text-[#22c55e]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{feature}</p>
              </div>
            </motion.div>
          ))}
        </div>
        <DialogFooter>
          <button onClick={() => setShowWhatsNew(false)} className="px-4 py-2 rounded-lg bg-[#22c55e] text-white text-xs font-bold hover:bg-[#16a34a] transition-colors">Entendido</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Login Modal ── */
export function LoginModal({
  showLoginModal,
  setShowLoginModal,
  defaultTab = 'login',
}: {
  showLoginModal: boolean;
  setShowLoginModal: (v: boolean) => void;
  defaultTab?: 'login' | 'register';
}) {
  // Key forces re-mount when tab changes, ensuring LoginForm initializes correctly
  const formKey = `${showLoginModal}-${defaultTab}`;
  return (
    <Dialog open={showLoginModal} onOpenChange={setShowLoginModal}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden border-white/10">
        <div className="p-6 sm:p-8">
          <DialogHeader className="mb-4">
            <DialogTitle className="sr-only">Iniciar sesión</DialogTitle>
            <DialogDescription className="sr-only">Formulario de acceso a CostPro</DialogDescription>
          </DialogHeader>
          <Suspense fallback={<DataDecryption />}>
            <LoginForm key={formKey} defaultTab={defaultTab} />
          </Suspense>
        </div>
      </DialogContent>
    </Dialog>
  );
}
