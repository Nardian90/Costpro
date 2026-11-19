'use client';

/**
 * ActPager — ADN-LANDING-CINEMATIC-SCROLL-STORYTELLING-005
 * ============================================================================
 * Navegador de capítulos: los cinco puntos de la misión 004 convertidos en la
 * FIRMA visual del landing — la línea ADN.
 *
 *   · Un hilo vertical (la línea verde característica) recorre los cinco
 *     nodos-actos y se llena con el progreso real de la experiencia.
 *   · El nodo activo pulsa y revela el nombre del capítulo.
 *   · Un contador discreto «ACTO 01 / 05» + nombre en vertical acompaña al
 *     hilo (§8: indicación de progreso sin saturar el diseño).
 *
 * Accesibilidad: botones reales (type=button), aria-label con el nombre del
 * acto, aria-current en el activo, área táctil ≥ 24px, foco visible.
 * Contrato E2E heredado de 004: contenedor `div.fixed.right-3` con EXACTAMENTE
 * 5 botones — el contador NO es un botón.
 * ============================================================================
 */

interface ActPagerProps {
  /** Índice del acto activo (0..4) — sincronizado con el scrollspy por posición. */
  active: number;
  /** Progreso en unidades de acto (float 0..5) — llena el hilo. */
  progress: number;
  labels: readonly string[];
  onSelect: (idx: number) => void;
}

export default function ActPager({ active, progress, labels, onSelect }: ActPagerProps) {
  const n = labels.length;
  const fillPct = Math.min(Math.max(progress / Math.max(n - 1, 1), 0), 1) * 100;

  /* Root = div.fixed.right-3: contrato E2E heredado de la misión 004
     (page.locator('div.fixed.right-3 button') → exactamente 5 botones). */
  return (
    <div
      data-testid="act-pager"
      className="fixed right-3 top-1/2 -translate-y-1/2 z-40 hidden lg:flex flex-col items-center"
    >
      <nav aria-label="Capítulos de la experiencia" className="flex flex-col items-center">
      {/* ── La línea ADN: hilo + nodos ── */}
      <div
        className="relative flex flex-col items-center"
        style={{ minHeight: `calc(${n} * 28px + ${(n - 1)} * 18px)` }}
      >
        {/* Hilo base */}
        <div className="absolute top-[8px] bottom-[8px] w-px bg-white/[0.09]" aria-hidden="true" />
        {/* Hilo recorrido (progreso real de la experiencia) */}
        <div
          className="absolute top-[8px] left-0 w-px bg-gradient-to-b from-[#22c55e] via-[#22c55e] to-[#22c55e]/50 rounded-full shadow-[0_0_6px_rgba(34,197,94,0.55)] transition-[height] duration-150 ease-out"
          style={{ height: `calc(${fillPct}% - 16px)`, maxHeight: 'calc(100% - 16px)' }}
          aria-hidden="true"
        />
        <div className="relative flex flex-col items-center gap-[18px]">
          {labels.map((label, idx) => {
            const isActive = active === idx;
            return (
              <div key={label} className="relative">
                <button
                  type="button"
                  onClick={() => onSelect(idx)}
                  data-testid={`act-dot-${idx + 1}`}
                  aria-label={label}
                  aria-current={isActive ? 'true' : undefined}
                  className={`group relative flex items-center justify-end gap-2.5 outline-none py-1.5 -my-1.5 ${isActive ? 'scale-100' : 'scale-90'} transition-transform duration-300 motion-reduce:transform-none`}
                >
                  <span
                    className={`text-[10px] font-medium whitespace-nowrap transition-all duration-300 ${isActive ? 'opacity-100 text-[#22c55e] translate-x-0' : 'opacity-0 group-hover:opacity-70 group-focus-visible:opacity-70 text-white/60 translate-x-1'}`}
                  >
                    {label}
                  </span>
                  <span
                    className={`relative block w-2.5 h-2.5 rounded-full transition-all duration-300 motion-reduce:transform-none ${
                      isActive
                        ? 'bg-[#22c55e] shadow-[0_0_10px_rgba(34,197,94,0.7)] scale-125 scroll-dot-active'
                        : 'bg-white/20 hover:bg-white/40'
                    }`}
                  />
                  {/* Anillo del nodo activo — el punto en la línea */}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute right-[-5px] top-1/2 -translate-y-1/2 w-[22px] h-[22px] rounded-full border border-[#22c55e]/40 spy-ring-anim pointer-events-none"
                    />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Contador de acto — discreto, vertical, parte del lenguaje ADN ── */}
      <div className="mt-6 flex flex-col items-center gap-2.5 select-none" aria-hidden="true">
        <span className="h-1 w-1 rotate-45 bg-[#22c55e]/70" />
        <span className="font-mono text-[10px] font-bold tabular-nums tracking-[0.2em] text-[#22c55e] [writing-mode:vertical-rl]">
          {String(active + 1).padStart(2, '0')}
          <span className="text-white/35"> / {String(n).padStart(2, '0')}</span>
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.32em] text-white/45 [writing-mode:vertical-rl]">
          {labels[active]}
        </span>
        <span className="h-px w-4 bg-gradient-to-b from-transparent via-white/20 to-transparent" />
      </div>
      </nav>
    </div>
  );
}
