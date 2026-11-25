'use client';

/**
 * LandingHeader — ADN-LANDING-CINEMATIC-SCROLL-STORYTELLING-005
 * ============================================================================
 * Barra superior del landing, EXTRAÍDA de HeroSection.
 *
 * ¿Por qué sale del hero? En el sistema cinematográfico la escena del Acto 1
 * es un contenedor `position: sticky` que recibe transforms (scrub de
 * entrada/salida). Un ancestro con transform convierte position:fixed en
 * absoluto — el header quedaría atrapado en la escena. Como el header es
 * chrome persistente de TODO el recorrido (no del hero), vive en la raíz de
 * LandingPage, fuera de cualquier escena.
 *
 * Marca ÚNICA con el MISMO tratamiento del menú lateral autenticado
 * (ADN-LANDING-FINAL-POLISH-003 §3): wordmark «ADN» verde + «egocio» blanco,
 * bold tracking-tight — nunca un icono genérico.
 * ============================================================================
 */

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useReducedMotion } from 'framer-motion';
import { entrarACostpro } from '@/lib/auth-recovery';
import { BrandWordmark } from '@/components/landing/BrandWordmark';

export interface LandingHeaderProps {
  showMobileNav: boolean;
  setShowMobileNav: (v: boolean) => void;
  setShowLoginModal: (v: boolean) => void;
  setLoginDefaultTab?: (tab: 'login' | 'register') => void;
}

export default function LandingHeader({
  showMobileNav,
  setShowMobileNav,
  setShowLoginModal,
  setLoginDefaultTab,
}: LandingHeaderProps) {
  const reduceMotion = useReducedMotion();
  const [navScrolled, setNavScrolled] = React.useState(false);

  /* ADN-BRAND-HERO-REFINEMENT-002: header transparente sobre el hero que se
     transforma al desplazarse — una única identidad, sin cambio de estado. */
  React.useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  void reduceMotion;

  /* CP-LANDING-NEWS-ACCESS-001: «Novedades» es RUTA REAL (/gaceta, El Diario
     Contable · ADN-011), no un ancla de sección — se diferencia con el punto
     vivo de «nuevo». Primera posición = máxima descubribilidad; el resto
     del menú sigue siendo scroll interno al mismo capítulo. */
  const navLinks: Array<{ label: string; href: string; route?: boolean }> = [
    { label: 'Novedades', href: '/gaceta', route: true },
    { label: 'Funcionalidades', href: '#features' },
    { label: 'Plataforma', href: '#como-funciona' },
    { label: 'Ayuda', href: '#faq' },
  ];

  /* CP-AUTH-RESILIENCE-003: el CTA «Acceder» JAMÁS recarga ni navega —
     recuperación real vía Supabase Auth y, en último caso, el modal. */
  const handleEntrar = () => {
    void entrarACostpro({
      openLogin: () => {
        if (setLoginDefaultTab) setLoginDefaultTab('login');
        setShowLoginModal(true);
      },
      setLoginDefaultTab,
    });
  };

  return (
    <motion.nav
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className={`fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-6 sm:px-10 lg:px-16 xl:px-20 py-4 transition-all duration-300 ${
        navScrolled
          ? 'bg-[#05070A]/85 backdrop-blur-md border-b border-white/[0.06] shadow-[0_1px_0_rgba(255,255,255,0.02)]'
          : 'bg-transparent border-b border-transparent'
      }`}
      aria-label="Navegación principal"
    >
      <div className="flex items-center">
        <a
          href="#hero"
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22c55e]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#05070A]"
          aria-label="ADNegocio — volver al inicio"
          title="ADNegocio — volver al inicio"
        >
          <BrandWordmark className="text-lg font-bold tracking-tight leading-none font-[family-name:var(--font-space-grotesk)] transition-opacity duration-200 hover:opacity-80" />
        </a>
      </div>

      {/* Center nav links — desktop */}
      <div className="hidden md:flex items-center gap-1">
        {navLinks.map((link, idx) =>
          link.route ? (
            <Link
              key={`${link.href}-${idx}`}
              href="/gaceta"
              data-testid="nav-novedades"
              className="nav-link-hover px-4 py-2.5 text-[13px] font-medium text-white/60 hover:text-white/80 transition-colors duration-200 inline-flex items-center gap-1.5"
            >
              {/* Diferenciador visual: punto vivo «nuevo» — sin texto extra
                  para no robar espacio al menú */}
              <span
                aria-hidden="true"
                className="relative flex h-1.5 w-1.5"
                title="Nuevo"
              >
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22c55e] opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
              </span>
              {link.label}
            </Link>
          ) : (
            <a
              key={`${link.href}-${idx}`}
              href={link.href}
              onClick={(e) => { e.preventDefault(); document.querySelector(link.href)?.scrollIntoView({ behavior: 'smooth' }); }}
              className="nav-link-hover px-4 py-2.5 text-[13px] font-medium text-white/60 hover:text-white/80 transition-colors duration-200" /* FIX-ACC-014 */
            >
              {link.label}
            </a>
          )
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Acceder — CTA del header (solo ≥ sm; en móvil vive en el drawer). */}
        <button
          type="button"
          onClick={handleEntrar}
          className="hidden sm:inline-flex items-center min-h-[40px] px-5 rounded-lg bg-[#22c55e] text-[#05070A] text-[13px] font-bold transition-all hover:bg-[#4ade80] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22c55e]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#05070A]"
          aria-label="Acceder a ADNegocio"
        >
          Acceder
        </button>
        {/* Mobile hamburger (abre el drawer de navegación único) */}
        <button
          type="button"
          onClick={() => setShowMobileNav(!showMobileNav)}
          className="flex md:hidden items-center justify-center w-11 h-11 rounded-lg hover:bg-white/[0.06] transition-colors"
          aria-label="Abrir menú"
        >
          <div className={`hamburger-icon ${showMobileNav ? 'open' : ''}`}>
            <span />
            <span />
            <span />
          </div>
        </button>
      </div>
    </motion.nav>
  );
}
