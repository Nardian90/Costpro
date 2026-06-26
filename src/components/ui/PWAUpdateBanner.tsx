'use client';

import { usePWAUpdate } from '@/hooks/ui/use-pwa-update';
import { UpdateBanner } from './UpdateBanner';

/**
 * PWAUpdateBanner — Wrapper que conecta el hook usePWAUpdate con el componente UpdateBanner.
 * Se monta en el layout global para que esté disponible en todas las páginas.
 */
export function PWAUpdateBanner() {
  const { updateAvailable, applyUpdate } = usePWAUpdate();

  if (!updateAvailable) return null;

  return <UpdateBanner onApply={applyUpdate} />;
}
