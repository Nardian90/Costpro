'use client';

interface SectionDividerProps {
  className?: string;
}

export default function SectionDivider({ className = '' }: SectionDividerProps) {
  return (
    <div className={`relative flex items-center justify-center py-8 ${className}`}>
      <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="relative w-8 h-8 rounded-full border border-border bg-background flex items-center justify-center">
        <div className="w-2 h-2 rounded-full bg-[#22c55e]/40" />
      </div>
    </div>
  );
}
