'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Loader2, Users } from 'lucide-react';

export interface NewsletterSectionProps {
  newsletterEmail: string;
  setNewsletterEmail: (v: string) => void;
  isSubscribing: boolean;
  newsletterSubscribed: boolean;
  setNewsletterSubscribed: (v: boolean) => void;
  handleNewsletterSubmit: () => void;
  newsletterInView: boolean;
  subscriberCount: number;
  subscriberCountStarted: boolean;
  startSubscriberCount: () => void;
}

export default function NewsletterSection({
  newsletterEmail,
  setNewsletterEmail,
  isSubscribing,
  newsletterSubscribed,
  setNewsletterSubscribed,
  handleNewsletterSubmit,
  newsletterInView,
  subscriberCount,
  subscriberCountStarted,
  startSubscriberCount,
}: NewsletterSectionProps) {
  // Track whether the 3-second success animation is still playing.
  // Starts true so the first subscription shows the animation immediately.
  const [showSuccessAnim, setShowSuccessAnim] = useState(true);

  // Start counter when in view
  useEffect(() => {
    if (newsletterInView && !subscriberCountStarted) {
      startSubscriberCount();
    }
  }, [newsletterInView, subscriberCountStarted, startSubscriberCount]);

  // After 3 seconds of being subscribed, end the animation and show static state
  useEffect(() => {
    if (newsletterSubscribed) {
      const timer = setTimeout(() => {
        setShowSuccessAnim(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [newsletterSubscribed]);

  const handleResetSubscription = () => {
    setNewsletterSubscribed(false);
    setShowSuccessAnim(true);
  };

  return (
    <div id="newsletter-section" className="relative rounded-xl p-5 bg-gradient-to-br from-[#22c55e]/10 via-[#10b981]/8 to-teal-500/10 border border-[#22c55e]/15 overflow-hidden max-w-2xl mx-auto w-full">
      <div className="absolute -inset-px rounded-xl bg-gradient-to-r from-emerald-500/20 via-green-500/10 to-emerald-500/20 -z-10 blur-sm" />

      <AnimatePresence mode="wait">
        {/* ── SUCCESS ANIMATION STATE ── */}
        {showSuccessAnim && newsletterSubscribed ? (
          <motion.div
            key="success-anim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-3 py-3"
          >
            {/* Animated checkmark circle + button transformation */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="relative w-14 h-14 rounded-full bg-[#22c55e] flex items-center justify-center shadow-lg shadow-[#22c55e]/40"
            >
              {/* Ring pulse */}
              <motion.div
                initial={{ scale: 1, opacity: 0.4 }}
                animate={{ scale: 1.5, opacity: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="absolute inset-0 rounded-full border-2 border-[#22c55e]"
              />
              {/* Checkmark with draw animation */}
              <motion.svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <motion.polyline
                  points="6 12 10 16 18 8"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.4, delay: 0.3, ease: 'easeOut' }}
                />
              </motion.svg>
            </motion.div>

            {/* "¡Suscrito!" text fade in */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.6 }}
              className="text-center"
            >
              <p className="text-base font-bold text-white flex items-center gap-1.5 justify-center">
                ¡Suscrito! 🎉
              </p>
              <p className="text-[11px] text-white/40 mt-0.5">Recibirás novedades y tips de gestión pronto.</p>
            </motion.div>
          </motion.div>
        ) : newsletterSubscribed && !showSuccessAnim ? (
          /* ── DEFAULT SUCCESS STATE (after animation resets) ── */
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex flex-col items-center gap-2 py-2 toast-enter"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
              className="w-12 h-12 rounded-full bg-[#22c55e]/20 border-2 border-[#22c55e]/30 flex items-center justify-center shadow-lg shadow-[#22c55e]/20"
            >
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 0.6, delay: 0.3, ease: 'easeInOut' }}
              >
                <CheckCircle2 className="w-7 h-7 text-[#22c55e]" />
              </motion.div>
            </motion.div>
            <div className="text-center">
              <p className="text-sm font-bold text-white">¡Estás suscrito!</p>
              <p className="text-[11px] text-white/40 mt-0.5">Recibirás novedades y tips de gestión pronto.</p>
            </div>
            <button
              onClick={handleResetSubscription}
              className="text-[10px] text-[#22c55e]/60 hover:text-[#22c55e] transition-colors mt-1"
            >
              Suscribir otro correo
            </button>
          </motion.div>
        ) : (
          /* ── FORM STATE ── */
          <motion.div
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col sm:flex-row items-center gap-3"
          >
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <h3 className="text-sm font-bold text-white">📬 ✨ Recibe novedades y tips de gestión</h3>
              {/* Animated subscriber counter */}
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={newsletterInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.4, delay: 0.15 }}
                className="flex items-center justify-center sm:justify-start gap-1.5 mt-1"
              >
                <Users className="w-3 h-3 text-[#22c55e]/60" />
                <p className="text-[11px] text-white/40">
                  Únete a <span className="font-semibold text-[#22c55e]/80 tabular-nums">{subscriberCount.toLocaleString()}+</span> profesionales
                </p>
              </motion.div>
              <p className="text-[11px] text-white/40 mt-0.5">Sin spam. Cancela cuando quieras.</p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <input
                  type="email"
                  placeholder="tu@email.com"
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleNewsletterSubmit()}
                  disabled={isSubscribing}
                  className="w-full px-3 py-2.5 rounded-lg bg-white/10 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#22c55e]/50 focus:ring-2 focus:ring-[#22c55e]/20 focus:shadow-[0_0_12px_rgba(34,197,94,0.15)] transition-all duration-300 disabled:opacity-50"
                  aria-label="Correo electrónico para newsletter"
                />
              </div>
              <button
                onClick={handleNewsletterSubmit}
                disabled={isSubscribing}
                className="px-4 py-2.5 rounded-lg bg-[#22c55e] text-white text-xs font-bold hover:bg-[#16a34a] shadow-lg shadow-[#22c55e]/20 hover:shadow-[#22c55e]/40 transition-all shrink-0 newsletter-btn-glow newsletter-glow-ring disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2 min-w-[110px] justify-center min-h-[44px]"
              >
                {isSubscribing ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /> Enviando...</>
                ) : (
                  'Suscribirme'
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!newsletterSubscribed && (
        <p className="text-[9px] text-white/25 mt-2 text-center sm:text-left">Solo enviamos contenido relevante. Sin spam.</p>
      )}
    </div>
  );
}
