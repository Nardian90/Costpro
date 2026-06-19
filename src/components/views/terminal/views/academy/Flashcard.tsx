import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AcademyCard } from '@/store/useAcademyStore';

interface FlashcardProps {
  card: AcademyCard;
  onScore: (score: number) => void;
}

export const Flashcard: React.FC<FlashcardProps> = ({ card, onScore }) => {
  const prefersReducedMotion = useReducedMotion();
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div className="w-full max-w-xl mx-auto h-[450px]" style={{ perspective: '1000px' }}>
      <motion.div
        className="relative w-full h-full cursor-pointer"
        style={{ transformStyle: 'preserve-3d' }}
        animate={prefersReducedMotion ? {} : { rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.6, type: 'spring', stiffness: 260, damping: 20 }}
        onClick={() => setIsFlipped(!isFlipped)}
      >
        {/* Front */}
        <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
          <Card className="h-full flex flex-col items-center justify-center p-8 text-center bg-card border-2 border-primary/20 shadow-xl rounded-3xl">
            <div className="absolute top-6 left-6">
              <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded-full uppercase tracking-widest">
                {card.category}
              </span>
            </div>
            <div className="absolute top-6 right-6">
              <span className={cn(
                "px-3 py-1 text-xs font-bold rounded-full uppercase tracking-widest",
                card.difficulty === 'Experto' ? "bg-destructive/10 text-destructive" :
                card.difficulty === 'Operativo' ? "bg-warning/10 text-warning" :
                "bg-success/10 text-success"
              )}>
                {card.difficulty}
              </span>
            </div>

            <h3 className="text-[clamp(1.25rem,5vw,1.5rem)] font-black text-foreground mb-6 uppercase tracking-tighter italic">Pregunta</h3>
            <div className="flex-1 flex items-center">
                <p className="text-[clamp(1rem,4vw,1.25rem)] text-muted-foreground leading-relaxed font-medium">
                {card.question}
                </p>
            </div>

            <div className="mt-8 text-sm text-primary/40 font-black tracking-widest animate-pulse uppercase">
              HAZ CLICK PARA REVELAR
            </div>
          </Card>
        </div>

        {/* Back */}
        <div
            className="absolute inset-0"
            style={{
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)'
            }}
        >
          <Card className="h-full flex flex-col items-center justify-center p-8 text-center bg-card border-2 border-primary shadow-2xl rounded-3xl overflow-hidden relative">
             <div className="absolute inset-0 bg-primary/5 -z-10" />

            <h3 className="text-[clamp(1.25rem,5vw,1.5rem)] font-black text-primary mb-6 uppercase tracking-tighter italic">Respuesta</h3>
            <div className="flex-1 flex items-center overflow-y-auto w-full">
                <p className="text-[clamp(0.9rem,3.5vw,1.125rem)] text-foreground leading-relaxed font-medium">
                {card.answer}
                </p>
            </div>

            <div className="mt-6 w-full pt-6 border-t border-border">
              <p className="text-[10px] font-black text-muted-foreground mb-4 uppercase tracking-[0.2em]">
                ¿Qué tan bien lo sabías?
              </p>
              <div className="flex justify-center flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Button
                    key={s}
                    variant="outline"
                    size="icon"
                    className={cn(
                      "size-11 sm:size-12 rounded-xl font-black transition-all text-lg",
                      s <= 2 ? "hover:bg-destructive hover:text-foreground border-destructive/30" :
                      s === 3 ? "hover:bg-warning hover:text-foreground border-warning/30" :
                      "hover:bg-success hover:text-foreground border-success/30"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      onScore(s);
                    }}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </motion.div>
    </div>
  );
};
