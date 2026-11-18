# ADN-LANDING-HERO-AND-PAGER-FIX-004 — Informe de corrección del navegador lateral

**Misión:** ADN-LANDING-HERO-AND-PAGER-FIX-004 · **Fecha:** 2026-11-19
**Rama:** `feat/adn-landing-hero-and-pager-fix-004-20261119`

## 1. Síntoma

El usuario informaba que al seleccionar el **segundo punto** del navegador
lateral de cinco puntos no se produce el desplazamiento esperado.

## 2. Reproducción (Playwright, 1440×900, estado BEFORE en `main` 590216097)

```
punto 1 (hero):            0 → 8       (sin desplazamiento — hero ya arriba)
punto 2 (como-funciona):   8 → 8       ← REPRODUCIDO: no hace NADA
punto 3 (features):        8 → 9779    OK
punto 4 (pricing):      9779 → 10701   OK
punto 5 (faq):         10701 → 11888   OK
```

## 3. Causa técnica exacta (dos defectos)

### Defecto 1 — Ref huérfana (causa del punto 2 muerto) — BLOQUEANTE
En `LandingPage.tsx`:

```ts
const ahaMomentRef = useRef<HTMLDivElement>(null);
const sectionRefs = [heroRef, ahaMomentRef, featuresRef, pricingRef, faqRef];
```

- `sectionIds = ['hero', 'como-funciona', 'features', 'pricing', 'faq']`
  (data.ts) y el pager llama `scrollToSection(idx)` → `sectionRefs[idx]`.
- La posición `[1]` es `ahaMomentRef`, que **nunca se adjunta a ningún
  elemento del DOM**: `AhaMomentSection` (que contenía los `id="como-funciona"`
  de su época) **no se renderiza** en `LandingPage`; la sección real con ese
  id es `ServicesStorySection` y recibe su propia `containerRef` interna.
- El clic ejecutaba `sectionRefs[1]?.current?.scrollIntoView(...)` sobre
  `null` → **no-op silencioso** (el optional chaining ocultaba el fallo).

### Defecto 2 — ID canónico inexistente (latente)
- `sectionIds[3] = 'pricing'` pero el root de `PricingSection` era
  `id="precios"`: `document.getElementById('pricing')` devolvía `null` en el
  bucle de progreso; además se consultaba `'pricing-section'` (id que nunca
  existió). Los anchors `#pricing` del FAB «Plan Free» y de
  `CostStorySection` estaban muertos por la misma razón.
- Los puntos 3-5 funcionaban solo porque `featuresRef/pricingRef/faqRef` sí
  están adjuntas — el id de la barra de progreso nunca coincidió.

### Defecto 3 — Scrollspy insuficiente para secciones altas (latente)
- El punto activo se actualizaba con un `IntersectionObserver` de
  `threshold: 0.3`: una sección más alta que ~3.3× el viewport (p. ej.
  `como-funciona` ≈ 5900px) nunca alcanza 30% de intersección → **el punto
  activo no sincronizaba** al navegar/scrollear por esa sección.

## 4. Corrección (funcional, no cosmética)

1. **Fuente de verdad única = los IDs reales del DOM.** El pager, los atajos
   de teclado 1-5 y el drawer móvil navegan vía
   `document.getElementById(sectionIds[idx]).scrollIntoView(...)`
   (`scrollToSectionById`). Si un id no existe en el futuro, un test E2E lo
   detecta (fail-visible, no fail-silent).
2. **Id canónico `pricing`:** root de `PricingSection` `id="precios"` →
   `id="pricing"`; la consulta muerta `'pricing-section'` → `'pricing'`.
   Se reviven los anchors `#pricing` existentes.
3. **Scrollspy por posición:** el punto activo se deriva del mismo bucle de
   progreso que la barra (`setActiveSection(floor(totalProgress))` sobre la
   posición relativa de cada sección al viewport) — determinista para
   secciones de cualquier altura; se elimina el IntersectionObserver por
   umbral. Se ejecuta también al montar (carga con hash de sección).
4. **Header fijo:** `scroll-mt-[76px]` en las raíces de las 5 secciones — el
   aterrizaje deja el inicio de la sección visible bajo el header.
5. **Accesibilidad:** `type="button"` + `aria-current="true"` en el punto
   activo; los controles conservan `aria-label` con el nombre de la sección.
6. **Limpieza:** eliminados `ahaMomentRef` y el array `sectionRefs` (refs
   huérfanas); el contrato unitario prohíbe su regreso.

## 5. Verificación

- **Playwright E2E** (`e2e/landing-pager.spec.ts`, config
  `playwright.landing.config.ts` — specs de UI pura sin fixtures de BD):
  **11/11 PASS** — clic en cada punto aterriza a ±140px del objetivo con el
  inicio visible bajo el header; punto activo sincroniza 1→5 en scroll manual;
  teclas 1-5; drawer móvil con las 5 secciones; guard anti-drift de IDs;
  firma ADNegocio visible en el primer pantallazo.
- **Vitest:** contrato nuevo `landing-pager-contract.test.tsx` (11 asserts) —
  suite completa **6179/6179 PASS**.
- **tsc --noEmit:** exit 0. **ESLint:** 0 errores (14 warnings pre-existentes).
- Evidencia visual: `evidencia-004/before-hero-1440-pager.png` vs
  `evidencia-004/after-pager-dot2-active.png` («Plataforma» activo tras el
  clic) y `after-dot2-landing-plataforma.png` (contexto).
