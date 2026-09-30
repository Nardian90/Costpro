'use client';

/**
 * AICommandCenterView — la "Inicio" de CostPro.
 *
 * HOME/SALES/PERFORMANCE DEFAULTS — CAMBIO 1 (composición de Inicio):
 *
 *   INICIO
 *   ├── Dashboard de la tienda activa   ← DashboardView (reutilizada, no
 *   │                                      se crea un dashboard nuevo)
 *   └── Darian
 *       ¿En qué puedo ayudarte? + sugerencias + acciones recientes
 *
 *   - El Dashboard KPI es la MISMA vista 'store-dashboard' certificada:
 *     tras la REMEDIACIÓN (fix/dashboard-active-store) responde a la tienda
 *     activa para TODOS los roles (user.activeStoreId real). Prop `embedded`:
 *     PageHeader en h2 (GATE 16: una sola h1 por página — el Header del shell
 *     pinta "Inicio").
 *   - Hero conversacional: motor ChatBot existente en modo `embedded`
 *     (GATE 18: reutilizar, no reconstruir).
 *   - GATE 9: en conversación activa el contenido conversacional toma
 *     prioridad — el dashboard y las acciones recientes se desmontan
 *     (mismo comportamiento certificado del panel de recents).
 *   - Desktop: columna central max-w-4xl para el chat — espaciosa, sobria,
 *     empresarial (GATE 13); el dashboard usa el ancho del shell.
 *
 * Accesibilidad (GATE 16): SIN h1 propio — el Header del shell ya pinta el
 * h1 de la vista ("Inicio"); dashboard embebido y hero del chat son h2.
 *
 * Navegación (GATE 11): esta vista ES el ViewType 'dashboard' (HOME_VIEW,
 * contrato GATE 1 §1). La entrada de menú "Dashboard" (OPERACIÓN) apunta a
 * 'store-dashboard' — la misma vista a pantalla completa.
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

const DashboardView = dynamic(
  () => import('@/components/views/terminal/views/dashboard/DashboardView').then(m => m.default),
  {
    ssr: false,
    loading: () => (
      <div
        className="w-full h-40 rounded-2xl bg-muted/20 animate-pulse"
        aria-hidden="true"
      />
    ),
  }
);

export default function AICommandCenterView() {
  // GATE 9: estado inicial (dashboard + bienvenida + recents) vs conversación
  // activa (prioridad conversacional). El ChatBot notifica vía callback — sin
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
      {/* CAMBIO 1 — Dashboard de la tienda activa (solo estado inicial; la
          conversación activa lo desmonta — GATE 9). */}
      {!hasActiveConversation && (
        <section
          aria-label="Dashboard de la tienda activa"
          data-testid="inicio-store-dashboard"
          className="w-full px-3 sm:px-6 pt-4"
        >
          <DashboardView embedded />
        </section>
      )}

      <div
        className={cn(
          'mx-auto w-full max-w-4xl flex flex-col px-3 sm:px-6',
          hasActiveConversation ? 'h-full min-h-0' : 'min-h-full'
        )}
      >
        {/* Motor conversacional existente — hero + composer + sugerencias */}
        <div
          className={cn(
            'flex flex-col w-full',
            hasActiveConversation
              ? 'flex-1 min-h-0' // conversación activa: toda la altura disponible
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
