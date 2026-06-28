/**
 * slugify.ts — Utilidad centralizada para generar slugs URL-safe.
 *
 * Antes: la función slugify estaba duplicada en CreateStoreQuickModal.tsx
 * y posiblemente en otros archivos, con riesgo de divergencia.
 *
 * Ahora: una sola fuente de verdad. Todos los modales y APIs deben
 * importar desde aquí.
 */

/**
 * Convierte un texto en un slug URL-safe.
 * - Minúsculas
 * - Acentos → sin acentos
 * - Espacios → guiones
 * - Caracteres especiales eliminados
 * - Múltiples guiones colapsados a uno
 * - Sin guiones al inicio/final
 *
 * @example slugify("Tienda Centro 2") → "tienda-centro-2"
 * @example slugify("Puerto Padre VITALLCONS") → "puerto-padre-vitallcons"
 */
export function slugify(text: string): string {
  return text
    .toString()
    .normalize('NFD')                    // Descomponer acentos
    .replace(/[\u0300-\u036f]/g, '')     // Eliminar diacríticos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')        // Solo alfanuméricos, espacios y guiones
    .replace(/[\s_]+/g, '-')             // Espacios y underscores → guión
    .replace(/-+/g, '-')                 // Múltiples guiones → uno
    .replace(/^-+|-+$/g, '');            // Sin guiones al inicio/final
}

/**
 * Valida que un slug sea válido.
 * - Mínimo 2 caracteres
 * - Máximo 60 caracteres
 * - Solo minúsculas, números y guiones
 * - No puede empezar ni terminar con guión
 */
export function isValidSlug(slug: string): boolean {
  if (!slug || slug.length < 2 || slug.length > 60) return false;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug);
}
