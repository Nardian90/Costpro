'use client';

import { ChatBot } from '@/components/ui/ChatBot';
import { Triangle3D } from '@/components/ui/Triangle3D';
import { useUIStore, useAuthStore } from '@/store';
import { useEffect, useState } from 'react';

/**
 * ChatBotView — Minimalist full-screen chat view (Z.ai inspired).
 *
 * Design philosophy:
 *   - Maximum negative space — content breathes
 *   - A large hero heading replaces cluttered UI
 *   - 3D triangle sits subtly in the background (top-right corner)
 *   - No badges, no avatars, no green bars — just the chat
 *   - The chat input is the focal point of the initial state
 *
 * The floating ChatBot remains available in all other views for quick access.
 */
export default function ChatBotView() {
  const { currentView } = useUIStore();
  const user = useAuthStore((s) => s.user);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Avoid hydration mismatch — only render dynamic content after mount
  const userName = mounted
    ? ((user as any)?.name || (user as any)?.email || 'Usuario')
    : '';

  return (
    <div className="relative flex flex-col h-full w-full overflow-hidden bg-background">
      {/* ─── 3D TRIANGLE — positioned absolute, top-right corner ───
          Sits BESIDE the "Configuración" toolbar (which is h-11 = 44px).
          We position it at top-2 (8px) + right-2 (8px) so it appears in
          the same row as the toolbar buttons but on the far right edge,
          visually separated from them. */}
      <div className="absolute top-1 right-2 z-20 pointer-events-none opacity-40">
        <Triangle3D />
      </div>

      {/* ─── CHAT PANEL (fills entire space) ─── */}
      <div className="flex-1 min-h-0 relative">
        <ChatBot embedded />
      </div>
    </div>
  );
}
