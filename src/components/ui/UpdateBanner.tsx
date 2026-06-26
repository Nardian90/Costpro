'use client';

import { RefreshCw, X } from 'lucide-react';
import { useState } from 'react';

/**
 * UpdateBanner — Banner que aparece cuando hay una nueva versión de la APK.
 *
 * Se muestra en la parte superior de la pantalla.
 * El usuario puede:
 *   - "Actualizar ahora": recarga la app con la nueva versión
 *   - X: posponer (vuelve a aparecer en 24h)
 *
 * Pensado para adultos mayores:
 *   - Botón grande (min-h-[44px])
 *   - Texto claro (text-elderly-body)
 *   - Color llamativo pero no alarmante
 */
export function UpdateBanner({ onApply }: { onApply: () => void }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-primary text-primary-foreground shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
        <RefreshCw className="w-5 h-5 shrink-0 animate-spin-slow" />
        <p className="flex-1 text-sm font-bold sm:text-base">
          Nueva versión disponible
        </p>
        <button
          onClick={onApply}
          className="px-4 py-2 min-h-[44px] rounded-lg bg-white text-primary text-sm font-black uppercase tracking-widest hover:bg-white/90 transition-colors"
        >
          Actualizar
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="p-2 min-h-[44px] min-w-[44px] rounded-lg hover:bg-white/10 flex items-center justify-center"
          aria-label="Posponer actualización"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
