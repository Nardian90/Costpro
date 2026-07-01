'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Cookie } from 'lucide-react';

export type FooterLinkId =
  | 'costos' | 'pos' | 'inventario' | 'reportes' | 'multi-tienda'
  | 'sobre-nosotros' | 'blog' | 'carreras' | 'partners'
  | 'privacidad' | 'terminos' | 'seguridad' | 'sla';

export interface FooterSectionProps {
  footerInView: boolean;
  showCookieBanner: boolean;
  footerRef: React.RefObject<HTMLElement | null>;
  handleReopenCookieSettings: () => void;
  onContactClick?: () => void;
  onLinkClick?: (id: FooterLinkId) => void;
}

/* ── Reusable footer link component ── */
function FooterLink({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className="text-sm text-white/40 hover:text-[#22c55e] transition-colors duration-200 cursor-pointer inline-block py-0.5 px-1 rounded-md text-left"
      >
        {label}
      </button>
    </li>
  );
}

export default function FooterSection({
  footerInView,
  showCookieBanner,
  footerRef,
  handleReopenCookieSettings,
  onContactClick,
  onLinkClick,
}: FooterSectionProps) {
  const router = useRouter();

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
              Fichas de costo automáticas según la Resolución 148/2023 del MFP. Para MiPYMEs cubanas.
            </p>
            {/* WhatsApp Link */}
            <div className="flex items-center gap-2 pt-1">
              <a
                href="https://wa.me/5353183215"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#22c55e]/10 border border-[#22c55e]/15 text-xs text-[#22c55e] hover:bg-[#22c55e]/20 transition-all"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                +53 53183215
              </a>
            </div>
          </div>

          {/* Producto */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-white/90">Producto</h4>
            <ul className="space-y-2">
              <FooterLink label="Control de Costos" onClick={() => onLinkClick?.('costos')} />
              <FooterLink label="Punto de Venta" onClick={() => onLinkClick?.('pos')} />
              <FooterLink label="Inventario" onClick={() => onLinkClick?.('inventario')} />
              <FooterLink label="Reportes" onClick={() => onLinkClick?.('reportes')} />
              <FooterLink label="Multi-Tienda" onClick={() => onLinkClick?.('multi-tienda')} />
            </ul>
          </div>

          {/* Empresa */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-white/90">Empresa</h4>
            <ul className="space-y-2">
              <FooterLink label="Sobre Nosotros" onClick={() => onLinkClick?.('sobre-nosotros')} />
              <FooterLink label="Blog" onClick={() => onLinkClick?.('blog')} />
              <FooterLink label="Carreras" onClick={() => onLinkClick?.('carreras')} />
              <FooterLink label="Contacto" onClick={() => onContactClick?.()} />
              <FooterLink label="Partners" onClick={() => onLinkClick?.('partners')} />
            </ul>
          </div>

          {/* Legal */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-white/90">Legal</h4>
            <ul className="space-y-2">
              <FooterLink label="Política de Privacidad" onClick={() => router.push('/privacy')} />
              <FooterLink label="Términos y Condiciones" onClick={() => router.push('/terms')} />
              <FooterLink label="Cookies" onClick={handleReopenCookieSettings} />
              <FooterLink label="Seguridad" onClick={() => onLinkClick?.('seguridad')} />
              <FooterLink label="SLA" onClick={() => onLinkClick?.('sla')} />
            </ul>
          </div>
        </div>

        {/* Trust signals */}
        <div className="border-t border-white/[0.06] pt-8 mt-8">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-white/40 mb-4">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
              Ficha según Res. 148/2023 MFP
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
              Datos seguros con Supabase
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
              Plan gratuito sin tarjeta
            </span>
            <a
              href="https://wa.me/5353183215"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-[#22c55e] transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
              WhatsApp: +53 53183215
            </a>
          </div>
          <p className="text-center text-xs text-white/30">
            Respondemos en menos de 24h · Lunes a sábado
          </p>
        </div>

        <div className="mt-10 pt-6 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <p className="text-xs text-white/40">© 2025 CostPro. Todos los derechos reservados.</p>
            {/* Cookie settings button - show when banner is hidden */}
            {!showCookieBanner && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={handleReopenCookieSettings}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.04] border border-white/[0.06] text-[10px] text-white/40 hover:text-[#22c55e] hover:border-[#22c55e]/20 hover:bg-[#22c55e]/5 transition-all duration-200 cursor-pointer"
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
