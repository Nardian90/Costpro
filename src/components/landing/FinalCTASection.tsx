"use client";

import { motion } from "framer-motion";
import { useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import { BrandWordmark } from "./BrandWordmark";

/**
 * FinalCTASection (ADN-BRAND-REBUILD-001) — cierre visual del landing.
 * Composición de la misión §5:
 *   «Tu negocio merece una visión completa.»
 *   ADNegocio.
 *   Acceso a la plataforma.
 */

interface FinalCTASectionProps {
  onOpenDemo?: () => void;
  /** Acceso a la plataforma (abre el modal de acceso con pestaña de registro). */
  onSignup?: () => void;
}

export default function FinalCTASection({ onOpenDemo, onSignup }: FinalCTASectionProps) {
  const prefersReduced = useReducedMotion();
  const noAnim = prefersReduced;

  return (
    <section className="py-28 px-4">
      <div className="max-w-2xl mx-auto text-center">
        {/* Cierre — titular editorial */}
        <motion.h2
          initial={noAnim ? false : { opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-3xl md:text-5xl font-black tracking-tight mb-6 leading-[1.08] text-white font-[family-name:var(--font-space-grotesk)]"
        >
          Tu negocio merece
          <br />
          <span className="text-[#22c55e]">una visión completa.</span>
        </motion.h2>

        {/* Marca */}
        <motion.div
          initial={noAnim ? false : { opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mb-10"
        >
          <BrandWordmark className="text-xl sm:text-2xl font-bold tracking-tight font-[family-name:var(--font-space-grotesk)]" />
        </motion.div>

        {/* Acceso a la plataforma */}
        <motion.div
          initial={noAnim ? false : { opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          {/* Acceso principal */}
          <Button
            size="lg"
            onClick={onSignup}
            className="bg-gradient-to-r from-[#15803d] to-[#166534] text-white font-medium hover:from-[#166534] hover:to-[#14532d] shadow-lg shadow-green-500/20 transition-all duration-200 hover:shadow-green-500/30 w-full sm:w-auto px-8 min-h-[48px]"
          >
            Acceder a la plataforma
          </Button>

          {/* Secundario — conocer el producto sin registro */}
          <Button
            size="lg"
            variant="outline"
            onClick={onOpenDemo}
            className="border-white/[0.12] text-white/80 hover:text-white hover:bg-white/[0.06] hover:border-white/[0.2] transition-all duration-200 w-full sm:w-auto px-8 min-h-[48px]"
          >
            <span className="inline-flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Ver la demostración
            </span>
          </Button>
        </motion.div>

        {/* WhatsApp fallback */}
        <motion.div
          initial={noAnim ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mt-8 flex flex-col items-center gap-2"
        >
          <p className="text-xs text-white/30">
            ¿Prefieres hablar antes de registrarte?
          </p>
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
          >
            <a
              href="https://wa.me/5353183215"
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              Escribir por WhatsApp
            </a>
          </Button>
          <p className="text-xs text-white/20 mt-2">
            Respondemos en menos de 24h · Lunes a sábado
          </p>
        </motion.div>
      </div>
    </section>
  );
}
