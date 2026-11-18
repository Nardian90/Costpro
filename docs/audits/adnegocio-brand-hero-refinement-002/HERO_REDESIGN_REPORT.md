# ADN-BRAND-HERO-REFINEMENT-002 — Informe de rediseño del landing (hero)

**Fecha:** 2026-11-18 · **PR:** #1651 · **Rama:** `feat/adnegocio-brand-rebuild-001-20261118` · **Commits:** fase A `e1fa659bf`, fase B `09bddb187`

---

## 1. Alcance aplicado (código real, no mockups)

El rediseño se implementó **directamente en el PR #1651** según la instrucción de la misión. Archivos tocados:

| Archivo | Cambio |
|---|---|
| `src/components/landing/HeroSection.tsx` | Reescritura completa del hero (~900 líneas): composición editorial asimétrica, titular monumental con reveal sincronizado, pieza «caos→orden», ticker, header con wordmark único, promo reestilizada |
| `src/app/layout.tsx` | Fuentes nuevas auto-alojadas: Archivo (variable, eje `wdth`) + Instrument Serif (italic) |
| `src/app/globals.css` | Tokens `--font-display`/`--font-editorial`; utilidades `.hero-grid-bg`, `.hero-outline-word` (con `@supports` fallback), `.landing-ticker-track` + keyframes; gates `prefers-reduced-motion` |
| `src/__tests__/components/landing-brand-enhanced.test.tsx` | Contratos de identidad actualizados (sin «ADN ADNegocio», wordmark único en header, 3 caminos FIX-ENTRY preservados) |
| `e2e/landing-page.spec.ts` | Espera del hero actualizada al nuevo titular |
| `e2e/auth-resilience-persistent.spec.ts` | Regex del titular actualizada (fallbacks: nuevos títulos o ADNegocio) |
| `e2e/fc-template-picker.spec.ts` | **Corrección del fallo E2E del PR:** la UI dice «Mis Plantillas Guardadas en ADNegocio» (rebranding 001); la aserción seguía esperando «COSTPRO» |

## 2. Composición del hero (desktop)

```
[wordmark ADNegocio]        Funcionalidades · Plataforma · Ayuda        [Acceder]
─────────────────────────────────────────────────────────────────────────────────────
● PLATAFORMA DE GESTIÓN EMPRESARIAL — MULTI-TIENDA          (mono, dot verde)

MENOS MALABARES.        ← Archivo 900 expandida; MALABARES. en hueco, letras
MÁS negocio.               dispersas→ordenadas; negocio. en serif italic verde

Las operaciones de tu empresa dejan de estar dispersas…   │ ✓ VENTAS EN CUADERNOS
[Entrar a la plataforma →] [Conocer las funcionalidades]  │ ✓ INVENTARIO EN PAPEL
                                                          │ ✓ COSTOS A OJO
¿Qué quieres hacer? ─────────────────────────             │ ✓ DEUDAS EN CHATS
[01 Ficha de Costo gratis] [02 Entrar a ADNegocio] [03 Ver demostración]
🔍 Buscar en la plataforma… ⌘K                 EXPLORAR ↓
── ESTADOS FINANCIEROS · VENTAS · PUNTO DE VENTA · INVENTARIO · ALMACÉN · COMPRAS ──
```

## 3. Preservación funcional (nada de negocio roto)

- **Tres caminos de entrada (FIX-ENTRY 2026-09-20)** intactos: `path-ficha-costo` / `path-costpro` / `path-demo` con sus `aria-label`, handlers (`enterFichaDeCosto`, `entrarACostpro`, `onOpenDemo`) y semántica de una sola decisión.
- **CP-AUTH-RESILIENCE-003**: el CTA principal sigue usando `entrarACostpro` (recuperación real de sesión, jamás recarga). Test `entrar-costpro-cta.test.ts` verde.
- **Paleta ⌘K**: el campo de búsqueda (readOnly) sigue abriendo la Command Palette.
- **Promo banner**: misma lógica `showPromo/handleDismissPromo`, solo reestilizado.
- **Drawer móvil, modales, secciones siguientes, footer**: sin cambios.
- **APIs/props** de `HeroSection` idénticas (interface `HeroSectionProps` sin modificar).

## 4. Identidad — cumplimiento punto por punto (misión §3)

1. «ADN ADNegocio» — **eliminado de raíz** (sin isotipo junto al nombre en todo el landing visible; verificado por test de contrato y por inspección visual).
2. ADN como texto adicional junto al nombre — **no existe**.
3. Nombre completo repetido en un mismo bloque — **no** (header=wordmark SVG; hero=titular; footer/drawer=wordmark, secciones distintas).
4. Logotipo pequeño/desproporcionado — **no** (wordmark SVG a 18px en header con proporciones vectoriales correctas; sin versiones tipográficas improvisadas).
5. Wordmark principal expresivo y bien construido — el wordmark vectorial `AdnWordmark` (letterformas Space Grotesk Bold reales, i-dot verde) es la única versión del encabezado.
6. «ADN+NEGOCIO» solo como variante gráfica autónoma — sin cambios en `AdnLogo`.

## 5. Evidencia visual (en este directorio)

| Archivo | Contenido |
|---|---|
| `before-hero-1440.png` / `before-hero-390.png` | Estado «antes» (12-11-2026): «ADN ADNegocio», Shield en header, titular genérico |
| `hero-002-1440-top.png` | Hero desktop 1440 tras el rediseño |
| `hero-002-390-top.png` | Hero móvil 390: tres líneas monumentales sin cortes de palabra |
| `hero-002-768-top.png` | Tablet 768: línea completa, chips ocultos <lg |
| `hero-002-1440-paths2.png` | Selector de tres caminos editorial + búsqueda + explorar |
| `hero-002-1440-ticker.png` | Cinta de módulos reales legible al pie del hero |
| `hero-002-1440-reduced-motion.png` | Con `prefers-reduced-motion`: composición estática completa |

## 6. Decisiones creativas documentadas

1. **«negocio.» en minúscula serif italic** (vs «NEGOCIO.» mayúscula): la misión autoriza perfeccionar la dirección conservando la intención; el contraste sans black/serif italic es el patrón verificado en ganadores B2B (Cyera, Greenlock) y da la personalidad exigida. La intención («más negocio») y las palabras se conservan íntegras.
2. **Retícula visible en lugar de foto de fondo**: el orden espacial refuerza «del caos al orden»; las fotos genéricas eran la principal señal de «plantilla empresarial».
3. **Un solo CTA verde sólido** (header y hero): el gradiente del CTA anterior competía con la retícula y el titular.
4. **El ticker nombra módulos reales**, sin cifras ni premios inventados (mandato 001 §5).
