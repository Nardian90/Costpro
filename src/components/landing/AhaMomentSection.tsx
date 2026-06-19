"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useSlowConnection } from "@/hooks/useSlowConnection";

const DEMO_PRODUCT = "Cerveza importada (caja x 24 und.)";

interface FichaRow {
  group?: boolean;
  total?: boolean;
  highlight?: boolean;
  label?: string;
  fila?: string;
  value?: string;
}

const FICHA_ROWS: FichaRow[] = [
  { group: true, label: "Costos directos" },
  { label: "Costo de compra (importación)", fila: "1.1", value: "2,400.00" },
  { label: "Flete y transporte", fila: "4.2", value: "180.00" },
  { label: "Salario vendedor/almacenista", fila: "2.1", value: "94.00" },
  { label: "Vacaciones (calculado)", fila: "2.2", value: "8.56" },
  { label: "Depreciación equipos", fila: "3.1", value: "12.50" },
  { group: true, label: "Gastos generales" },
  { label: "Salario administrativo", fila: "6.1", value: "45.83" },
  { label: "Energía eléctrica", fila: "6.4", value: "8.33" },
  { label: "Arrendamiento local", fila: "6.G", value: "41.67" },
  { group: true, label: "Cargas tributarias (automáticas)" },
  { label: "Contrib. Seg. Social (14%)", fila: "10.1", value: "14.36" },
  { label: "Imp. Fuerza de Trabajo (5%)", fila: "10.2", value: "5.13" },
  { total: true, label: "Costo y gasto unitario", fila: "12.1", value: "2,810.38" },
  { total: true, label: "Utilidad (20%)", fila: "13.1", value: "562.08" },
  { total: true, label: "Imp. sobre Ventas y Serv.", fila: "13.3", value: "374.72" },
  { highlight: true, label: "Precio de venta sugerido", fila: "14.1", value: "3,747.18 CUP" },
];

type Phase = "typing" | "processing" | "done";

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2v4" opacity="0.8" />
      <path d="M12 18v4" opacity="0.2" />
      <path d="M4.93 4.93l2.83 2.83" opacity="0.6" />
      <path d="M16.24 16.24l2.83 2.83" opacity="0.3" />
      <path d="M2 12h4" opacity="0.5" />
      <path d="M18 12h4" opacity="0.2" />
      <path d="M4.93 19.07l2.83-2.83" opacity="0.4" />
      <path d="M16.24 7.76l2.83-2.83" opacity="0.6" />
    </svg>
  );
}

export default function AhaMomentSection() {
  const isSlow = useSlowConnection();
  const prefersReduced = useReducedMotion();
  const noAnim = isSlow || prefersReduced;

  const [phase, setPhase] = useState<Phase>("typing");
  const [typedChars, setTypedChars] = useState(0);
  const typingRef = useRef<NodeJS.Timeout | null>(null);
  const phaseRef = useRef<NodeJS.Timeout | null>(null);
  const loopRef = useRef<NodeJS.Timeout | null>(null);

  const cleanup = useCallback(() => {
    if (typingRef.current) clearTimeout(typingRef.current);
    if (phaseRef.current) clearTimeout(phaseRef.current);
    if (loopRef.current) clearTimeout(loopRef.current);
  }, []);

  useEffect(() => {
    if (isSlow) return;

    if (phase === "typing") {
      const charDelay = noAnim ? 0 : 50;
      let charIndex = 0;

      const tick = () => {
        charIndex++;
        if (charIndex <= DEMO_PRODUCT.length) {
          setTypedChars(charIndex);
          typingRef.current = setTimeout(tick, charDelay);
        } else {
          phaseRef.current = setTimeout(() => setPhase("processing"), noAnim ? 0 : 600);
        }
      };

      typingRef.current = setTimeout(() => {
        charIndex = 0;
        setTypedChars(0);
        tick();
      }, noAnim ? 0 : 400);
    }

    if (phase === "processing") {
      phaseRef.current = setTimeout(
        () => setPhase("done"),
        noAnim ? 0 : 1200
      );
    }

    if (phase === "done") {
      loopRef.current = setTimeout(() => {
        setPhase("typing");
      }, 12000);
    }

    return cleanup;
  }, [phase, noAnim, isSlow, cleanup]);

  // If slow connection, render static version
  if (isSlow) {
    return (
      <section id="como-funciona" className="py-24 px-4">
        <div className="max-w-2xl mx-auto text-center mb-10">
          <span className="text-xs font-medium text-white/30 uppercase tracking-widest mb-3 block">
            EL DIFERENCIADOR
          </span>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-white mb-4">
            Escribes el producto.
            <br />
            La ficha oficial aparece sola.
          </h2>
          <p className="text-white/50 max-w-lg mx-auto text-sm">
            Con el transporte, el arrendamiento, los salarios, la seguridad social y todos los
            impuestos correctamente distribuidos. Según la Resolución 148/2023 del MFP. Sin que
            calcules nada tú.
          </p>
        </div>

        <div className="max-w-lg mx-auto">
          {/* App chrome bar */}
          <div className="flex items-center px-4 py-2.5 rounded-t-xl border border-b-0 border-white/[0.08] bg-white/[0.03]">
            <div className="flex gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
            </div>
            <span className="text-xs text-white/30 ml-2">
              CostPro — Nueva ficha de costo · Res. 148/2023 MFP
            </span>
          </div>

          {/* Ficha card - static */}
          <div className="rounded-b-xl border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/20 p-5">
            {/* Product name */}
            <div className="mb-4 pb-3 border-b border-green-200 dark:border-green-800">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                {DEMO_PRODUCT}
              </p>
            </div>

            {/* Rows */}
            <div className="space-y-0">
              {FICHA_ROWS.map((row, i) => {
                if (row.group) {
                  return (
                    <div key={i} className="pt-3 pb-1 first:pt-0">
                      <span className="text-xs font-medium text-green-700 dark:text-green-400 uppercase tracking-wide">
                        {row.label}
                      </span>
                    </div>
                  );
                }

                if (row.highlight) {
                  return (
                    <div
                      key={i}
                      className="flex justify-between items-center pt-3 pb-2 border-t-2 border-green-300 dark:border-green-700 mt-2"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-green-600 dark:text-green-400 w-8">
                          {row.fila}
                        </span>
                        <span className="text-sm font-semibold text-green-800 dark:text-green-200">
                          {row.label}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-green-800 dark:text-green-200">
                        {row.value}
                      </span>
                    </div>
                  );
                }

                return (
                  <div
                    key={i}
                    className={`flex justify-between items-center py-1.5 ${
                      row.total
                        ? "font-medium border-t border-green-200 dark:border-green-800 pt-3 mt-1 text-green-800 dark:text-green-300"
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs w-8 ${
                          row.total
                            ? "text-green-600 dark:text-green-400"
                            : "text-white/30"
                        }`}
                      >
                        {row.fila}
                      </span>
                      <span
                        className={`text-sm ${
                          row.total
                            ? "text-green-800 dark:text-green-300"
                            : "text-white/50"
                        }`}
                      >
                        {row.label}
                      </span>
                    </div>
                    <span
                      className={`text-sm ${
                        row.total
                          ? "text-green-800 dark:text-green-300"
                          : "text-white"
                      }`}
                    >
                      {row.value}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-xs text-white/20 text-center mt-3">
            Simulación ilustrativa · Los valores se calculan con los datos reales de tu negocio
          </p>
        </div>
      </section>
    );
  }

  return (
    <section id="como-funciona" className="py-24 px-4">
      <div className="max-w-2xl mx-auto text-center mb-10">
        <motion.span
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-xs font-medium text-white/30 uppercase tracking-widest mb-3 block"
        >
          EL DIFERENCIADOR
        </motion.span>
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-3xl md:text-4xl font-semibold tracking-tight text-white mb-4"
        >
          Escribes el producto.
          <br />
          La ficha oficial aparece sola.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-white/50 max-w-lg mx-auto text-sm"
        >
          Con el transporte, el arrendamiento, los salarios, la seguridad social y todos los
          impuestos correctamente distribuidos. Según la Resolución 148/2023 del MFP. Sin que
          calcules nada tú.
        </motion.p>
      </div>

      <div className="max-w-lg mx-auto">
        {/* App chrome bar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex items-center px-4 py-2.5 rounded-t-xl border border-b-0 border-white/[0.08] bg-white/[0.03]"
        >
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
          </div>
          <span className="text-xs text-white/30 ml-2">
            CostPro — Nueva ficha de costo · Res. 148/2023 MFP
          </span>
        </motion.div>

        {/* Typing / Processing / Ficha area */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="rounded-b-xl border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/20 p-5 min-h-[200px]"
        >
          <AnimatePresence mode="wait">
            {/* Typing phase */}
            {phase === "typing" && (
              <motion.div
                key="typing"
                initial={noAnim ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div>
                  <label className="text-xs font-medium text-green-700 dark:text-green-400 uppercase tracking-wide block mb-2">
                    Producto
                  </label>
                  <div className="flex items-center bg-white dark:bg-white/[0.06] rounded-lg px-3 py-2 border border-green-200 dark:border-green-800">
                    <span className="text-sm text-green-800 dark:text-green-200 font-mono">
                      {DEMO_PRODUCT.slice(0, typedChars)}
                    </span>
                    <span
                      className="w-0.5 h-4 bg-green-500 animate-pulse ml-0.5"
                      style={{ opacity: typedChars < DEMO_PRODUCT.length ? 1 : 0 }}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* Processing phase */}
            {phase === "processing" && (
              <motion.div
                key="processing"
                initial={noAnim ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col items-center justify-center py-10 gap-3"
              >
                <Spinner className="w-8 h-8 text-green-500 animate-spin" />
                <p className="text-sm text-white/50 text-center">
                  Calculando costos, cargas tributarias y precio sugerido...
                </p>
              </motion.div>
            )}

            {/* Done phase - full ficha */}
            {phase === "done" && (
              <motion.div
                key="done"
                initial={noAnim ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                {/* Product name */}
                <div className="mb-4 pb-3 border-b border-green-200 dark:border-green-800">
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">
                    {DEMO_PRODUCT}
                  </p>
                </div>

                {/* Rows */}
                <div className="space-y-0">
                  {FICHA_ROWS.map((row, i) => {
                    if (row.group) {
                      return (
                        <motion.div
                          key={i}
                          initial={noAnim ? false : { opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.03 }}
                          className="pt-3 pb-1 first:pt-0"
                        >
                          <span className="text-xs font-medium text-green-700 dark:text-green-400 uppercase tracking-wide">
                            {row.label}
                          </span>
                        </motion.div>
                      );
                    }

                    if (row.highlight) {
                      return (
                        <motion.div
                          key={i}
                          initial={noAnim ? false : { opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.03, duration: 0.25 }}
                          className="flex justify-between items-center pt-3 pb-2 border-t-2 border-green-300 dark:border-green-700 mt-2"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-green-600 dark:text-green-400 w-8">
                              {row.fila}
                            </span>
                            <span className="text-sm font-semibold text-green-800 dark:text-green-200">
                              {row.label}
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-green-800 dark:text-green-200">
                            {row.value}
                          </span>
                        </motion.div>
                      );
                    }

                    return (
                      <motion.div
                        key={i}
                        initial={noAnim ? false : { opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03, duration: 0.25 }}
                        className={`flex justify-between items-center py-1.5 ${
                          row.total
                            ? "font-medium border-t border-green-200 dark:border-green-800 pt-3 mt-1 text-green-800 dark:text-green-300"
                            : ""
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`text-xs w-8 ${
                              row.total
                                ? "text-green-600 dark:text-green-400"
                                : "text-white/30"
                            }`}
                          >
                            {row.fila}
                          </span>
                          <span
                            className={`text-sm ${
                              row.total
                                ? "text-green-800 dark:text-green-300"
                                : "text-white/50"
                            }`}
                          >
                            {row.label}
                          </span>
                        </div>
                        <span
                          className={`text-sm ${
                            row.total
                              ? "text-green-800 dark:text-green-300"
                              : "text-white"
                          }`}
                        >
                          {row.value}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <p className="text-xs text-white/20 text-center mt-3">
          Simulación ilustrativa · Los valores se calculan con los datos reales de tu negocio
        </p>
      </div>
    </section>
  );
}
