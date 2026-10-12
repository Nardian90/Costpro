/**
 * BrandWordmark — wordmark tipográfico compartido del Landing Page.
 * ============================================================================
 * FIX-BRAND-HIERARCHY (2026-10-12):
 *
 * Antes el nombre de marca se duplicaba en 4 componentes del landing
 * (nav del hero, h1 del hero con gradiente, drawer móvil, footer), cada uno
 * con estilos independientes y la misma jerarquía: «Cost» blanco + «Pro»
 * verde — el acento recaía en el calificador «Pro», no en el dominio del
 * producto.
 *
 * DECISIÓN DE DISEÑO (evaluadas las 3 direcciones del mandato):
 *   «Cost» en VERDE SÓLIDO (#22c55e) + «Pro» en BLANCO.
 *
 * Motivo:
 *  1. Asociación semántica: el producto ES control de costo (fichas de costo,
 *     Res. 148/2023, análisis de costos). Concentrar el acento en «Cost»
 *     ancla la marca en su dominio; «Pro» queda como calificador de soporte.
 *  2. El verde #22c55e ya es el color de acción del landing (CTAs, check
 *     icons, números de paso) — el acento del wordmark refuerza la paleta
 *     existente en lugar de introducir nada nuevo.
 *  3. Sólido en vez del gradiente del hero: más sobrio, escalable y legible
 *     (el mandato pide evitar gradientes/efectos que resten legibilidad).
 *  4. Contraste accesible: #22c55e sobre #0a0f1a ≈ 8.9:1 y blanco ≈ 17:1
 *     (AA/AAA en los tamaños reales de uso, incluido texto grande).
 *  5. No se altera el nombre textual, el casing («Cost»+«Pro»), metadatos ni
 *     SEO — solo el tratamiento visual.
 *
 * Uso: el tamaño/peso/tracking los aporta el contexto vía `className` (el
 * wordmark hereda la tipografía del contenedor). Los colores de cada mitad
 * son fijos para garantizar consistencia en todo el landing.
 */
export function BrandWordmark({ className = '' }: { className?: string }) {
  return (
    <span className={className}>
      <span className="text-[#22c55e]">Cost</span>
      <span className="text-white">Pro</span>
    </span>
  );
}
