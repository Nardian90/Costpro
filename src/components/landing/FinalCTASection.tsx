"use client";

import { motion } from "framer-motion";
import { useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";

interface FinalCTASectionProps {
  onOpenDemo?: () => void;
}

export default function FinalCTASection({ onOpenDemo }: FinalCTASectionProps) {
  const prefersReduced = useReducedMotion();
  const noAnim = prefersReduced;

  return (
    <section className="py-24 px-4">
      <div className="max-w-2xl mx-auto text-center">
        {/* Badge */}
        <motion.span
          initial={noAnim ? false : { opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-sm font-medium text-white/30 uppercase tracking-widest mb-4 block"
        >
          Empieza hoy
        </motion.span>

        {/* Title */}
        <motion.h2
          initial={noAnim ? false : { opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-3xl md:text-4xl font-semibold tracking-tight mb-6 leading-tight text-white"
        >
          Tu próxima venta puede ser
          <br />
          la primera con la ficha
          <br />
          de costo correcta.
        </motion.h2>

        {/* Subtitle */}
        <motion.p
          initial={noAnim ? false : { opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-white/50 mb-10 text-base leading-relaxed"
        >
          Da de alta tu primer producto. CostPro calcula la ficha según la Res. 148/2023 — con
          el flete, el salario, el arrendamiento y todos los impuestos. Gratis. Sin tarjeta.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={noAnim ? false : { opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          {/* Primary CTA */}
          <a href="/signup">
            <Button
              size="lg"
              className="bg-gradient-to-r from-[#22c55e] to-[#16a34a] text-white font-medium hover:from-[#16a34a] hover:to-[#15803d] shadow-lg shadow-green-500/20 transition-all duration-200 hover:shadow-green-500/30 w-full sm:w-auto px-8"
            >
              Crear mi cuenta gratis
            </Button>
          </a>

          {/* Secondary CTA */}
          <Button
            size="lg"
            variant="outline"
            onClick={onOpenDemo}
            className="border-white/[0.12] text-white/80 hover:text-white hover:bg-white/[0.06] hover:border-white/[0.2] transition-all duration-200 w-full sm:w-auto px-8"
          >
            <span className="inline-flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Ver demo primero
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
