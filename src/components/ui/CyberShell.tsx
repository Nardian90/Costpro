'use client';
// src/components/ui/CyberShell.tsx

import React from 'react';

interface CyberShellProps {
  children: React.ReactNode;
}

const CyberShell: React.FC<CyberShellProps> = ({ children }) => {
  return (
    // Outer wrapper — full bleed on mobile, padded on tablet/desktop
    <div className="h-full w-full bg-background text-foreground font-sans overflow-hidden relative">
      {/* === BACKGROUND LAYERS (GPU-composited, will-change on container only) === */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{ willChange: 'transform' }}
      >
        {/* Primary grid — fine dot pattern */}
        <div
          className="absolute inset-0 opacity-[0.12] dark:opacity-[0.15]"
          style={{
            backgroundImage:
              'radial-gradient(circle, var(--primary) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            maskImage: 'linear-gradient(to bottom, white 0%, white 40%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, white 0%, white 40%, transparent 100%)',
          }}
        />
        {/* Secondary grid — larger perspective lines at an angle */}
        <div
          className="absolute inset-0 opacity-[0.06] dark:opacity-[0.08]"
          style={{
            backgroundImage:
              'linear-gradient(var(--primary) 1px, transparent 1px), linear-gradient(90deg, var(--primary) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
            transform: 'perspective(800px) rotateX(8deg)',
            transformOrigin: 'center top',
            maskImage: 'linear-gradient(to bottom, white 0%, white 30%, transparent 80%)',
            WebkitMaskImage: 'linear-gradient(to bottom, white 0%, white 30%, transparent 80%)',
          }}
        />
        {/* Diagonal gradient overlay — green tint top-left → dark bottom-right */}
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.06]"
          style={{
            background:
              'linear-gradient(135deg, var(--primary) 0%, transparent 50%, rgba(0,0,0,0.3) 100%)',
          }}
        />
        {/* Radial glow — center-top area */}
        <div
          className="absolute inset-0 opacity-[0.08] dark:opacity-[0.12]"
          style={{
            background:
              'radial-gradient(ellipse 60% 40% at 50% 0%, var(--primary), transparent)',
          }}
        />
      </div>

      {/* === MAIN CONTENT === */}
      <main className="relative z-10 max-w-full h-full">
        {/* Animated gradient border wrapper */}
          <div className="relative rounded-none overflow-hidden animate-border-glow h-full">
          {/* Animated gradient pseudo-border */}
          <div
            className="absolute inset-0 rounded-none"
            style={{
              background:
                'conic-gradient(from var(--cyber-angle, 0deg), var(--primary) 0%, transparent 15%, transparent 35%, var(--secondary, #4cd7f6) 50%, transparent 65%, transparent 85%, var(--primary) 100%)',
            }}
          />

          {/* Inner glass container */}
          <div
            className="relative rounded-none border border-border/60 dark:border-border/30 bg-card/60 dark:bg-white/[0.03] p-0 sm:p-2 max-[380px]:p-1 backdrop-blur-2xl dark:backdrop-blur-3xl h-full flex flex-col enhanced-glass transition-all duration-700"
            style={{
              boxShadow:
                'inset 0 1px 0 0 rgba(255,255,255,0.06), inset 0 0 24px 0 rgba(0,0,0,0.04), 0 1px 3px 0 rgba(0,0,0,0.04)',
            }}
          >
            {/* Subtle animated gradient sweep across the top */}
            <div
              className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-20"
              aria-hidden="true"
            >
              <div
                className="h-full w-[30%]"
                style={{
                  background: 'linear-gradient(90deg, transparent, var(--primary), transparent)',
                  animation: 'cyber-sweep 8s ease-in-out infinite',
                }}
              />
            </div>

            {/* Corner glow accents */}
            <span className="absolute top-[-3px] left-[-3px] w-[6px] h-[6px] rounded-full bg-primary/60 shadow-[0_0_8px_2px_var(--primary)] animate-[cyber-corner-pulse_3s_ease-in-out_infinite] pointer-events-none z-20" aria-hidden="true" />
            <span className="absolute top-[-3px] right-[-3px] w-[6px] h-[6px] rounded-full bg-primary/60 shadow-[0_0_8px_2px_var(--primary)] animate-[cyber-corner-pulse_3s_ease-in-out_0.75s_infinite] pointer-events-none z-20" aria-hidden="true" />
            <span className="absolute bottom-[-3px] left-[-3px] w-[6px] h-[6px] rounded-full bg-primary/60 shadow-[0_0_8px_2px_var(--primary)] animate-[cyber-corner-pulse_3s_ease-in-out_1.5s_infinite] pointer-events-none z-20" aria-hidden="true" />
            <span className="absolute bottom-[-3px] right-[-3px] w-[6px] h-[6px] rounded-full bg-primary/60 shadow-[0_0_8px_2px_var(--primary)] animate-[cyber-corner-pulse_3s_ease-in-out_2.25s_infinite] pointer-events-none z-20" aria-hidden="true" />

            {children}
          </div>
        </div>
      </main>

      {/* Keyframe definitions for animations */}
      <style jsx global>{`
        @keyframes cyber-sweep {
          0%, 100% {
            transform: translateX(-100%);
            opacity: 0;
          }
          10% {
            opacity: 0.6;
          }
          50% {
            opacity: 0.8;
          }
          90% {
            opacity: 0.6;
          }
          95% {
            transform: translateX(400%);
            opacity: 0;
          }
          100% {
            transform: translateX(400%);
            opacity: 0;
          }
        }

        @keyframes cyber-corner-pulse {
          0%, 100% {
            opacity: 0.4;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.3);
          }
        }
      `}</style>
    </div>
  );
};

export default CyberShell;
