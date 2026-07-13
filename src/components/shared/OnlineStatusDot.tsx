'use client';

import React from 'react';

export default function OnlineStatusDot() {
  const [isOnline, setIsOnline] = React.useState(true);

  React.useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    // FIX-PERF-BG (2026-07-13): clase 'perf-hide-status-dot' para ocultar la luz
    // verde en modo performance. El indicador online es decorativo y su glow
    // verde distrae del fondo sólido negro.
    <div
      className={`perf-hide-status-dot absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-sidebar ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`}
      title={isOnline ? 'En línea' : 'Sin conexión'}
    />
  );
}
