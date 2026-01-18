// src/components/ui/CyberShell.tsx
import React from 'react';

interface CyberShellProps {
  children: React.ReactNode;
}

const CyberShell: React.FC<CyberShellProps> = ({ children }) => {
  return (
    // Aplicamos el padding aquí para crear el "marco" y usamos colores de tema.
    <div className="min-h-screen bg-background text-foreground font-sans p-2 sm:p-6 lg:p-8">
      <div className="absolute inset-0 z-0 opacity-10">
        {/* Futuristic background grid */}
        <div
          className="absolute inset-0 bg-grid-white/[0.2]"
          style={{
            maskImage: 'linear-gradient(to bottom, white, transparent)',
          }}
        />
      </div>
      {/* El padding se eliminó de 'main' porque ahora lo gestiona el div padre. */}
      <main className="relative z-10 max-w-full">
        {/* Glassmorphic container */}
        <div className="rounded-xl border border-border bg-card/40 dark:bg-white/5 p-2 sm:p-4 backdrop-blur-lg shadow-sm overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  );
};

export default CyberShell;
