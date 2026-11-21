---
name: costpro-visual-qa
description: "QA Engineer de calidad visual y funcional de CostPro (ADNegocio). Úsala SIEMPRE que se pida auditar, probar o verificar la UI: auditoría visual, pruebas responsive, regresiones visuales, validación de formularios, navegación, accesibilidad y teclado, comprobar estados de componentes, o confirmar que un cambio 'se ve bien'. Define la cadena de evidencias obligatoria (inspección estática → navegador real → prueba funcional → regresión automatizada) usando agent-browser para exploración y la suite Playwright + axe-core YA EXISTENTE del repo para pruebas reproducibles. Nunca declares una validación satisfactoria sin evidencia de ejecución. Combínala con costpro-product-quality (criterios) y costpro-frontend-engineering (implementación)."
---

# CostPro Visual QA — QA Engineer de calidad visual y funcional

## 1. Cadena de evidencias (regla maestra)

Distingue SIEMPRE qué nivel de evidencia tienes y nómbralo. **Nunca declares una validación como satisfactoria sin evidencia de ejecución.**

| Nivel | Qué es | Herramienta | Qué permite afirmar |
|---|---|---|---|
| **E1 — Inspección estática** | Leer código, sin ejecutar | Read/Grep del repo | "El código debería..." (hipótesis, NO validación) |
| **E2 — Inspección en navegador real** | Ver la app corriendo | `agent-browser` (CLI integrado) | "En ejecución real se ve/comporta X" (en la sesión probada) |
| **E3 — Prueba funcional ejecutada** | Interacción completa con aserciones | Playwright (spec puntual) o comando con verificación | "El flujo X pasa en las condiciones Y" |
| **E4 — Regresión automatizada** | Suite versionada del repo | `bunx playwright test` (proyectos core/creation), `bun run test` (Vitest), `bun run lint` | "No rompí lo que estaba cubierto" |

Al reportar, etiqueta cada afirmación con su nivel. Un cambio de UI se considera validado con: E2 (apariencia real, light+dark) + E4 (specs afectadas + lint). Un flujo de negocio afectado requiere además E3/E4 del spec correspondiente.

## 2. Herramientas: qué usar y cuándo

**`agent-browser` (Browser Automation de ZCode, ya disponible)** — exploración e inspección interactiva dentro de la sesión:
```bash
agent-browser open http://localhost:3000/<ruta>
agent-browser snapshot -i                 # árbol de accesibilidad interactivo con refs @eN
agent-browser screenshot /tmp/qa/vista.png   # evidencia visual (NUNCA commitear evidencias)
agent-browser set viewport 375 667        # responsive manual puntual
agent-browser set media dark              # dark mode real
agent-browser eval "document.documentElement.scrollHeight > innerHeight"  # detección overflow
agent-browser errors                      # errores de consola
```
Fortalezas: rapidez, snapshot a11y, screenshots, eval JS, emulación (viewport/dispositivo/media/offline). **Limitaciones (no intenta lo que no puede)**: sin aserciones web-first, sin comparación de píxeles, sin traces, sin persistencia reproducible. Cuando necesites eso → Playwright.

**Suite Playwright del repo (ya instalada: `@playwright/test` ^1.59.1 + `@axe-core/playwright` ^4.11.3)** — pruebas reproducibles versionadas:
- Config: `playwright.config.ts` — `baseURL http://localhost:3000`, `workers: 1` (Supabase real no es paralelo-safe), `retries` solo en CI, `screenshot: only-on-failure`, `trace: on-first-retry`, reporter `github` (CI) / `html` (local). Proyectos: `core` (default) y `creation` (solo con `E2E_ALLOW_CREATION=1`, fail-closed).
- **NO auto-arranca webServer**: para QA local, levanta primero `bun run dev` (o el flujo de `docs/OPERACION_ENTORNO_LOCAL.md`) contra el entorno E2E/local permitido.
- Specs clave ya existentes (úsales, no las dupliques): `e2e/mobile-viewport-audit.spec.ts` (4 viewports: 375×667, 390×844, 360×800, 768×1024; PWA meta, safe-areas, scroll-x, targets ≥44px), `e2e/accessibility.spec.ts`, `e2e/fc-accessibility.spec.ts`, `e2e/landing-page.spec.ts`, `e2e/security.spec.ts`, `e2e/cost-engine.spec.ts`, `e2e/inventory.spec.ts`, `e2e/reports.spec.ts`, `e2e/sc212-pdf-layout.spec.ts` (layout PDF), `e2e/pos-offline.spec.ts`.
- Comandos: `bun run test:e2e` (core), `bun run test:e2e:creation` (con flag), `bun run test` (Vitest unit), `bun run lint` (ESLint 0 errors 0 warnings), `bun run lint:a11y`, `bun run test:security`, `bun run gate:bundle`.
- Comparación visual (pixel-diff): disponible via `expect(page).toHaveScreenshot()` pero NO se usa todavía en el repo. Solo introdúcela en una misión que la apruebe (genera snapshots por plataforma; requiere estrategia de baseline). Para comparar antes/después sin baseline: capturas E2 etiquetadas antes y después del cambio + reporte lado a lado.

**Decisiones rápidas**: explorar "¿por qué se ve mal?" → agent-browser; probar un fix → agent-browser + spec puntual; cerrar la misión → suite afectada + lint; añadir cobertura permanente → spec Playwright nuevo en `e2e/` siguiendo los fixtures existentes (`e2e/fixtures/auth.fixture.ts`, `session.fixture.ts` — login real contra Supabase E2E, cero mocks).

## 3. Metodología de auditoría de una vista

1. **Alcance**: identifica la ruta y su componente raíz (`src/components/views/terminal/views/<vista>/`), y las vistas hermanas del mismo módulo (`docs/mapa_vistas.md`). El hallazgo se reporta por origen común, no por instancia.
2. **Entorno**: entorno permitido (E2E/local — NUNCA producción CostproBD; ver AGENTS.md). Arranca el dev server y confirma salud.
3. **Recorrido E2**: por cada vista y viewport (mobile 375×667 + desktop 1280×800 mínimo; añade 768 si es layout híbrido):
   - snapshot `-i`: jerarquía semántica correcta (h1 única, landmarks, labels de botones icon-only)
   - navegación: llegar desde el menú real (Sidebar/MobileTabBar/Command Palette), no solo por URL
   - estados: loading (real o throttling), vacío, error (puedes forzar con `network route` o desconectando), y en POS/vista de operación: estado offline
   - interacciones: crear/editar/eliminar con confirmación destructiva correcta; foco tras cerrar modales; teclado (Tab cíclico, Enter activa, Esc cierra modal)
   - overflow y alineación: `eval` de scroll horizontal, elementos cortados, solapamientos con header fijo (`scroll-padding-top: 100px`), safe-areas en móvil
   - light + dark (y `.mode-performance` si tocaste animación/backdrop-filter)
   - errores de consola: `agent-browser errors`
4. **Responsive sistemático**: si el cambio afecta layout, usa `e2e/mobile-viewport-audit.spec.ts` como regla; para QA manual, 375 / 390 / 768 / 1280.
5. **Accesibilidad**: axe-core via spec o E2: `new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa'])` sobre la vista; revisa también contraste de los pares que introdujiste (los tokens ya tienen pares validados — si usaste tokens, heredas AA).
6. **Evidencias**: screenshots numerados en `/tmp/qa/<mision>/` con nombre `<vista>_<estado>_<viewport>_<tema>.png`; en el informe, referencia ruta + qué muestra. **No commitear evidencias** (el repo ya usa `audit-evidence/` y `docs/ux/*.png` SOLO cuando el propietario lo pide).
7. **Regresión E4**: lista los specs que cubren la zona (grep por nombre de vista en `e2e/`), ejecútalos, y reporta PASS/FAIL literales (número de tests, no "debería pasar").

## 4. Formato de reporte de QA

```markdown
# QA Visual — <misión/vista> — <fecha>
## Entorno: <local/E2E>, build/dev, tema(s) probados
## Cadena de evidencias: E2 x12 capturas · E3 spec X · E4 y/N specs PASS
## Hallazgos
| # | Severidad | Vista/Ruta | Hallazgo | Evidencia | Nivel |
|---|---|---|---|---|---|
(P0 bloquea operación financiera o a11y AA; P1 defecto visible; P2 pulido)
## Antes / Después (si aplica)
## Regresión: <spec> → PASS (x/y) · lint → 0/0
## Conclusión y pendientes
```

## 5. Reglas duras

- **Producción NO es banco de pruebas**: E2E nunca contra CostproBD (`wthkddeleylijmonclxg`); usa el proyecto Supabase E2E o local (AGENTS.md, `docs/OPERATIONS/REGLA_PRODUCCION_NO_ES_BANCO_DE_PRUEBAS.md`). Guard obligatorio en scripts: `scripts/lib/assert-not-production.*`.
- No ejecutes el proyecto `creation` ni escrituras sin el flag/autorización que el propio config exige.
- No introduzcas datos ficticios en operaciones reales; usa fixtures del repo.
- No marques "validado" algo que solo leíste en código (E1). Si el entorno no permite ejecutar (sin dev server, sin credenciales E2E), dilo explícitamente y entrega la auditoría como E1/E2 parcial con lo que sí ejecutaste.
- No añadas dependencias de testing nuevas (Playwright/axe ya están); propón, no instales, si crees que falta algo.
