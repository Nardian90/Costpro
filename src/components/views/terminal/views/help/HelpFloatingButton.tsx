'use client';

/**
 * HelpFloatingButton — Botón flotante de ayuda contextual.
 *
 * Se muestra en la esquina inferior derecha de cada vista operativa,
 * abajo del todo. Al hacer clic, lleva al documento de ayuda de la vista actual.
 *
 * A diferencia del botón "?" del Header (que está arriba), este botón
 * está siempre visible incluso si el usuario hace scroll hacia abajo.
 *
 * Uso:
 *   import { HelpFloatingButton } from '@/components/views/terminal/views/help/HelpFloatingButton';
 *   <HelpFloatingButton view="pos" />
 *
 * O globalmente en TerminalShell, usando currentView del store:
 *   <HelpFloatingButton view={currentView} />
 */

import React from 'react';
import { HelpCircle } from 'lucide-react';
import { useUIStore } from '@/store';
import { cn } from '@/lib/utils';
import { HELP_DOC_BY_VIEW } from './HelpLauncher';

export interface HelpFloatingButtonProps {
  view: string;
  /** Posición vertical del botón. */
  verticalPosition?: 'bottom-right' | 'bottom-left';
  /** Offset desde el borde en píxeles. */
  offset?: number;
}

export function HelpFloatingButton({
  view,
  verticalPosition = 'bottom-right',
  offset = 24,
}: HelpFloatingButtonProps) {
  const { setCurrentView } = useUIStore();

  // Si la vista actual es 'help' o 'wiki', no mostramos el botón flotante
  // (ya está en la ayuda).
  if (view === 'help' || view === 'wiki') return null;

  const handleClick = () => {
    const docPath = HELP_DOC_BY_VIEW[view];
    if (docPath) {
      const url = new URL(window.location.href);
      url.searchParams.set('doc', docPath);
      window.history.pushState({}, '', url.toString());
      setCurrentView('help');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } else {
      setCurrentView('help');
    }
  };

  const positionClasses = {
    'bottom-right': 'right-6',
    'bottom-left': 'left-6',
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={`Ayuda de esta vista`}
      aria-label={`Abrir ayuda de esta vista`}
      className={cn(
        'fixed bottom-6 z-40 flex items-center justify-center',
        'w-14 h-14 rounded-full',
        'bg-primary text-primary-foreground shadow-lg shadow-primary/30',
        'hover:bg-primary/90 hover:scale-105 active:scale-95',
        'transition-all duration-200',
        'focus:outline-none focus:ring-4 focus:ring-primary/30',
        positionClasses[verticalPosition]
      )}
      style={{ bottom: `${offset}px` }}
    >
      <HelpCircle className="w-6 h-6" aria-hidden="true" />
      {/* Pulsing ring for visibility (gentle, not annoying) */}
      <span
        className="absolute inset-0 rounded-full bg-primary/30 animate-ping opacity-20 pointer-events-none"
        aria-hidden="true"
      />
    </button>
  );
}

export default HelpFloatingButton;
