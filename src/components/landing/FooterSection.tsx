'use client';

import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Cookie } from 'lucide-react';

export interface FooterSectionProps {
  footerInView: boolean;
  showCookieBanner: boolean;
  footerRef: React.RefObject<HTMLElement | null>;
  handleReopenCookieSettings: () => void;
  footerStats: Array<{
    count: number;
    suffix: string;
    label: string;
    hasStarted: boolean;
    start: () => void;
  }>;
}

export default function FooterSection({
  footerInView,
  showCookieBanner,
  footerRef,
  handleReopenCookieSettings,
  footerStats,
}: FooterSectionProps) {
  // Start counter animations when footer comes into view
  useEffect(() => {
    if (footerInView) {
      footerStats.forEach((stat) => {
        if (!stat.hasStarted) stat.start();
      });
    }
  }, [footerInView, footerStats]);

  return (
    <footer ref={footerRef} id="footer-section" className="relative z-10 bg-[#020617]">
      {/* Gradient top border */}
      <div className="h-px bg-gradient-to-r from-transparent via-[#22c55e]/40 to-transparent" />
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#22c55e]/15 border border-[#22c55e]/20 flex items-center justify-center">
                <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-4 h-4">
                  <path d="M 50,50 m -30,0 a 30,30 0 1,0 60,0 a 30,30 0 1,0 -60,0" stroke="#22c55e" strokeWidth="10" strokeLinecap="round" strokeDasharray="150 189" />
                </svg>
              </div>
              <span className="text-lg font-bold text-white">
                Cost<span className="text-[#22c55e]">Pro</span>
              </span>
            </div>
            <p className="text-sm text-white/50 leading-relaxed">
              Plataforma #1 en gestión empresarial. Costos, inventario y ventas en un solo lugar.
            </p>
            {/* Social Media Icons */}
            <div className="flex items-center gap-2 pt-1">
              {[
                { label: 'Twitter / X', letter: '𝕏', href: '#' },
                { label: 'LinkedIn', letter: 'in', href: '#' },
                { label: 'GitHub', letter: 'GH', href: '#' },
                { label: 'YouTube', letter: 'YT', href: '#' },
              ].map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-[10px] font-bold text-white/40 hover:bg-[#22c55e]/15 hover:border-[#22c55e]/25 hover:text-[#22c55e] hover:scale-110 transition-all duration-200"
                >
                  {social.letter}
                </a>
              ))}
            </div>
          </div>
          {/* Producto */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-white/90">Producto</h4>
            <ul className="space-y-2">
              {['Control de Costos', 'Punto de Venta', 'Inventario', 'Reportes', 'Multi-Tienda'].map(item => (
                <li key={item}><span className="text-sm text-white/40 hover:text-[#22c55e] transition-colors cursor-pointer inline-block py-0.5 px-1 rounded-md">{item}</span></li>
              ))}
            </ul>
          </div>
          {/* Empresa */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-white/90">Empresa</h4>
            <ul className="space-y-2">
              {['Sobre Nosotros', 'Blog', 'Carreras', 'Contacto', 'Partners'].map(item => (
                <li key={item}><span className="text-sm text-white/40 hover:text-[#22c55e] transition-colors cursor-pointer inline-block py-0.5 px-1 rounded-md">{item}</span></li>
              ))}
            </ul>
          </div>
          {/* Legal */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-white/90">Legal</h4>
            <ul className="space-y-2">
              {['Privacidad', 'Términos', 'Cookies', 'Seguridad', 'SLA'].map(item => (
                <li key={item}><span className="text-sm text-white/40 hover:text-[#22c55e] transition-colors cursor-pointer inline-block py-0.5 px-1 rounded-md">{item}</span></li>
              ))}
            </ul>
          </div>
        </div>
        {/* Stats Bar */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={footerInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex flex-wrap items-center justify-center gap-8 sm:gap-12 py-8"
        >
          {footerStats.map((stat) => (
            <div key={stat.label} className="text-center px-4">
              <span className="block text-2xl sm:text-3xl font-extrabold text-[#22c55e] font-[family-name:var(--font-space-grotesk)] tabular-nums">
                {stat.hasStarted ? stat.count.toLocaleString() : '0'}{stat.suffix}
              </span>
              <span className="block text-xs sm:text-sm text-white/50 mt-1.5 tracking-wide font-medium">{stat.label}</span>
            </div>
          ))}
        </motion.div>
        <div className="mt-10 pt-6 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <p className="text-xs text-white/40">© 2024 CostPro. Todos los derechos reservados.</p>
            {/* Cookie settings button - show when banner is hidden */}
            {!showCookieBanner && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={handleReopenCookieSettings}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.04] border border-white/[0.06] text-[10px] text-white/40 hover:text-[#22c55e] hover:border-[#22c55e]/20 hover:bg-[#22c55e]/5 transition-all duration-200"
                aria-label="Configuración de cookies"
              >
                <Cookie className="w-3 h-3" />
                <span>Cookies</span>
              </motion.button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-white/40">Hecho con</span>
            <motion.span
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              className="text-xs inline-block"
            >💚</motion.span>
            <span className="text-xs text-white/40">en Cuba</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
