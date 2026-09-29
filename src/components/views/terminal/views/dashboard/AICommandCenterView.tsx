'use client';

/**
 * AICommandCenterView — la nueva "Inicio" de CostPro.
 *
 * AI COMMAND CENTER (GATE 2/3/9/13):
 *   - Hero conversacional: "¿En qué puedo ayudarte?" + composer de Darian
 *     como principal elemento interactivo. El motor es el ChatBot existente
 *     en modo `embedded` (GATE 18: reutilizar, no reconstruir) — su empty
 *     state ya renderiza el hero Z.ai exacto y la metadata real del modelo.
 *   - Acciones recientes SOLO en estado inicial (GATE 9): al iniciar
 *     conversación, el contenido conversacional toma prioridad y el panel
 *     desaparece (onConversationChange del ChatBot).
 *   - Desktop: columna central max-w-4xl — espaciosa, sobria, empresarial
 *     (GATE 13); no una landing de chatbot.
 *
 * Accesibilidad (GATE 16): SIN h1 propio — el Header del shell ya pinta el
 * h1 de la vista ("Inicio"); el hero del chat es h2. Un solo h1 por página.
 *
 * Navegación (GATE 11): esta vista ES el ViewType 'dashboard' (HOME_VIEW,
 * contrato GATE 1 §1). El KPI consolidado anterior vive en 'store-dashboard'
 * (Análisis → Dashboard de Tiendas) — nada se elimina, se reubica.
 */

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import RecentActivityPanel from './RecentActivityPanel';

const ChatBot = dynamic(() => import('@/components/ui/ChatBot').then(m => m.ChatBot), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center" aria-hidden="true">
      <div className="animate-pulse text-xs text-muted-foreground/40 uppercase tracking-widest font-bold">
        Cargando Darian…
      </div>
    </div>
  ),
});

export default function AICommandCenterView() {
  // GATE 9: estado inicial (bienvenida + recents) vs conversación activa
  // (prioridad conversacional). El ChatBot notifica vía callback — sin
  // estado global nuevo, sin duplicar persistencia (GATE 18).
  const [hasActiveConversation, setHasActiveConversation] = useState(false);

  const handleConversationChange = (hasMessages: boolean) => {
    setHasActiveConversation(hasMessages);
  };

  return (
    <div
      className="h-full w-full overflow-y-auto overflow-x-hidden"
      data-testid="ai-command-center"
    >
      <div
        className={cn(
          'mx-auto w-full max-w-4xl flex flex-col min-h-full px-3 sm:px-6',
        )}
      >
        {/* Motor conversacional existente — hero + composer + sugerencias */}
        <div
          className={cn(
            'flex flex-col w-full',
            hasActiveConversation
              ? 'flex-1 min-h-0' // conversación activa: toma toda la altura disponible
              : 'min-h-[540px] shrink-0' // estado inicial: altura estable para hero + recents
          )}
        >
          <ChatBot embedded onConversationChange={handleConversationChange} />
        </div>

        {/* GATE 9: recents solo en estado inicial — la conversación activa
            los desmonta para que el bienvenida no ocupe espacio innecesario */}
        {!hasActiveConversation && (
          <RecentActivityPanel className="mt-2 mb-10 px-1 sm:px-2" />
        )}
      </div>
    </div>
  );
}
