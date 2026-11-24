'use client';

import { useState } from 'react';
import { Share2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Botón de compartir del artículo (ADN-011). Usa Web Share API cuando el
 * navegador la soporta (ideal para WhatsApp móvil) y copia el enlace como
 * alternativa. Sin dependencias externas ni tracking.
 */
export function ShareButton({ titulo }: { titulo: string }) {
  const [copiado, setCopiado] = useState(false);

  const compartir = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: titulo, url });
        return;
      }
      await navigator.clipboard.writeText(`${titulo} — ${url}`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // cancelación del usuario u entorno sin permiso: no-op
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={compartir}
      className="h-auto gap-1.5 px-2 py-1 text-xs font-bold uppercase tracking-widest text-foreground/70 hover:text-foreground"
      aria-label="Compartir la nota"
    >
      {copiado ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
      {copiado ? 'Enlace copiado' : 'Compartir'}
    </Button>
  );
}
