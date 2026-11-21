# CP-CI-003 — Consistencia del design system en vistas

**Área**: design-system · **Prioridad**: P4 · **Estado inicial**: queued

## Objetivo
Eliminar inconsistencias reales de las vistas respecto al sistema de diseño REAL (tokens, componentes canónicos, jerarquía), sin introducir estilos arbitrarios ni cambiar la identidad visual.

## Criterios de entrada
- Design system leído y vigente; STATE.json sin lock.
- Unidad definida por hallazgo concreto (grep/captura), no por gusto.

## Unidades (candidatas del baseline)
- **U1 — Hardcodes de color**: `PageHeader.badgeVariantMap` (emerald-500/amber-500/red-500 fuera de tokens) → sustituir por tokens semánticos (`success`/`warning`/`danger`) verificando AA en light y dark. NOTA: `atomic/ProductCard.border-white/5` es decisión consciente documentada (`--danger` dark no transmite urgencia) — NO tocar sin decisión del propietario.
- **U2 — Jerarquía de página**: vistas sin `PageHeader` o con h1 duplicada (el Header del terminal pinta h1; `PageHeader` debe usar `headingLevel="h2"`). Grep y lista, corregir por módulos.
- **U3 — Modos/temas**: vistas que rompen en `.mode-performance` (animaciones/transiciones que asumen estados) o en dark (colores fijos) — detectar por grep de `backdrop-filter`, `text-black`, `bg-white`, hex crudos.
- **U4 — Tipografía fuera de `cp-*`**: `font-black`/`uppercase`/`tracking-widest` residuales fuera de `.cp-metadata` y nav compacta (decisión F2: la voz por defecto no es uppercase).

## Límites de alcance
Solo tokens y componentes existentes; sin dependencias nuevas; sin rediseño; sin tocar `tokens.css` salvo actualizar documentación si se descubre un token nuevo necesario (proponerlo, no crearlo sin aprobación). Las vistas de negocio financiero: solo cambios de presentación.

## Procedimiento
Fases A–H. Grep de patrón → inventario con evidencia (ruta:línea) → corregir módulo a módulo (agrupando vistas hermanas según regla de origen común) → `bun run lint` + `lint:a11y` → verificación E2 en light+dark+performance (agent-browser) → capturas etiquetadas en /tmp/qa.

## Pruebas y criterios de aceptación
1. Cero hex crudos nuevos; los sustituidos usan tokens con AA verificado (light Y dark).
2. Sin regresión visual E2 (light/dark/performance) en las vistas tocadas.
3. Specs E2E de zona en verde si existen (p. ej. `landing-page`, `sc212-pdf-layout` para documentos).
4. Informe con inventario antes/después y actualización del design system si descubres una convención nueva.

## Certificación esperada
APROBADA / APROBADA CON OBSERVACIONES / BLOQUEADA. Cualquier cambio que requiera alterar identidad visual (no solo normalización) se separa como propuesta para el propietario.
