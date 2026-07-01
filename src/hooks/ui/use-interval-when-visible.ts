/**
 * useIntervalWhenVisible — setInterval que pausa cuando el tab está oculto.
 *
 * Problema que resuelve:
 *   En móvil 3G, setInterval(fetchAll, 30000) consume ~150KB/min y batería
 *   incluso cuando el usuario cambió a otra app. Esto drena datos del adulto
 *   mayor cubano innecesariamente.
 *
 * Comportamiento:
 *   - Cuando document.hidden === false: ejecuta callback cada `delay` ms
 *   - Cuando document.hidden === true: pausa el intervalo
 *   - Al volver visible: ejecuta callback inmediatamente + reanuda intervalo
 *
 * Uso:
 *   useIntervalWhenVisible(() => fetchAll(), 30000);
 */
import { useEffect, useRef } from 'react';

export function useIntervalWhenVisible(callback: () => void, delay: number | null): void {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (intervalId === null) {
        intervalId = setInterval(() => savedCallback.current(), delay);
      }
    };

    const stop = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        // Al volver visible, ejecutar inmediatamente + reanudar
        savedCallback.current();
        start();
      }
    };

    // Estado inicial
    if (!document.hidden) {
      start();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [delay]);
}
