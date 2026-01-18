// src/components/ui/CyberShell.tsx
import React from 'react';

interface CyberShellProps {
  children: React.ReactNode;
}

const CyberShell: React.FC<CyberShellProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-black text-white font-sans">
      <div className="absolute inset-0 z-0 opacity-10">
        {/* Futuristic background grid */}
        <div
          className="absolute inset-0 bg-grid-white/[0.2]"
          style={{
            maskImage: 'linear-gradient(to bottom, white, transparent)',
          }}
        />
      </div>
      <main className="relative z-10 p-4 sm:p-6 lg:p-8">
        {/* Glassmorphic container */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-lg">
          {children}
        </div>
      </main>
    </div>
  );
};

export default CyberShell;
