/**
 * BrandWordmark — wordmark tipográfico compartido del Landing Page.
 * ============================================================================
 * ADN-BRAND-REBUILD-001 (2026-11-18): rebranding COSTPRO → ADNegocio.
 *
 * DECISIÓN DE IDENTIDAD (evaluadas las direcciones del mandato):
 *   «ADN» en VERDE SÓLIDO (#22c55e) + «egocio» en BLANCO.
 *
 * Motivo:
 *  1. Asociación semántica: el acento recae en el símbolo de la marca (ADN) —
 *     el «negocio» completo vive en la plataforma. ADN = lo esencial + el
 *     descriptor forma el nombre único del producto.
 *  2. El verde #22c55e es el color de acción del landing (CTAs, checks,
 *     indicadores) — el acento del wordmark refuerza la paleta existente.
 *  3. Sólido, sin gradientes: sobrio, escalable y legible (mandato del sistema
 *     visual: acento controlado, nunca verde en toda la superficie).
 *  4. Contraste accesible: #22c55e sobre #05070A ≈ 8.6:1 y blanco ≈ 17.9:1
 *     (AA/AAA en los tamaños reales de uso, incluido texto grande).
 *
 * Uso: el tamaño/peso/tracking los aporta el contexto vía `className` (el
 * wordmark hereda la tipografía del contenedor). Los colores de cada mitad
 * son fijos para garantizar consistencia en todo el landing. El lockup
 * vectorial (SVG con letterformas reales) vive en src/components/brand/.
 */
export function BrandWordmark({ className = '' }: { className?: string }) {
  return (
    <span className={className}>
      <span className="text-[#22c55e]">ADN</span>
      <span className="text-white">egocio</span>
    </span>
  );
}
