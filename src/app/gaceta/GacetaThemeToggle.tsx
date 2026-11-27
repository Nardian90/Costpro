'use client';

import { useCallback, useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

/**
 * ADNEGOCIO-GACETA-EDITORIAL-UX-001 — selector de tema de la gaceta.
 *
 * Tres opciones (Claro / Oscuro / Sistema) implementadas con radios nativos:
 * teclas de flecha, roving tabindex y estado anunciado por el lector de
 * pantalla sin JS adicional. El default del estado vacío (primera visita,
 * sin preferencia) es SIEMPRE CLARO: nunca se adopta el tema del sistema
 * operativo de forma automática; «Sistema» es solo una elección explícita.
 *
 * Persistencia: localStorage['gaceta-theme'] (sin sesión). La aplicación del
 * tema es ATRIBUTIVA (data-theme en #gaceta-root): el script anti-flash de
 * gaceta/layout.tsx ya lo habrá aplicado antes del primer paint; este
 * componente solo lo sincroniza tras la hidratación y reacciona en vivo a
 * los cambios del sistema mientras la opción «Sistema» esté activa.
 */

export type GacetaThemeChoice = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'gaceta-theme';

const OPCIONES: Array<{
  valor: GacetaThemeChoice;
  etiqueta: string;
  Icono: typeof Sun;
}> = [
  { valor: 'light', etiqueta: 'Claro', Icono: Sun },
  { valor: 'dark', etiqueta: 'Oscuro', Icono: Moon },
  { valor: 'system', etiqueta: 'Sistema', Icono: Monitor },
];

function leerPreferencia(): GacetaThemeChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'dark' || v === 'system' ? v : 'light';
  } catch {
    return 'light';
  }
}

function aplicarAlDom(choice: GacetaThemeChoice) {
  const root = document.getElementById('gaceta-root');
  if (!root) return;
  const oscuro =
    choice === 'dark' ||
    (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (oscuro) {
    root.setAttribute('data-theme', 'dark');
  } else {
    root.removeAttribute('data-theme');
  }
}

export function GacetaThemeToggle() {
  // null = aún sin resolver tras SSR/hidratación (ningún radio marcado):
  // servidor y cliente renderizan idéntico → cero mismatch de hidratación.
  const [choice, setChoice] = useState<GacetaThemeChoice | null>(null);

  useEffect(() => {
    const guardada = leerPreferencia();
    setChoice(guardada);
    aplicarAlDom(guardada);

    // «Sistema» activo: la gaceta sigue en vivo los cambios del SO.
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (leerPreferencia() === 'system') aplicarAlDom('system');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const seleccionar = useCallback((valor: GacetaThemeChoice) => {
    setChoice(valor);
    try {
      localStorage.setItem(STORAGE_KEY, valor);
    } catch {
      // almacenamiento no disponible: el tema aplica solo en esta visita
    }
    aplicarAlDom(valor);
  }, []);

  return (
    <fieldset className="gaceta-theme-group" id="tema-gaceta">
      <legend className="sr-only">Tema de lectura de la publicación</legend>
      {OPCIONES.map(({ valor, etiqueta, Icono }) => (
        <label key={valor} className="gaceta-theme-opt" data-active={choice === valor ? 'true' : 'false'}>
          <input
            type="radio"
            name="gaceta-theme"
            value={valor}
            checked={choice === valor}
            onChange={() => seleccionar(valor)}
            className="sr-only"
          />
          <Icono className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{etiqueta}</span>
        </label>
      ))}
    </fieldset>
  );
}
