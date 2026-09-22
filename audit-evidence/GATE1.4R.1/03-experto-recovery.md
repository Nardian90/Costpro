# GATE 1.4R.1 — 03 RECUPERACIÓN DE EXPERTO (mandato §1/§6/§7/§8)

## Qué se recuperó

El tab técnico `main` de `cost-sheets` ES la vista históricamente llamada **"Tablero Principal"**
(evidencia pre-código: `ViewLoadingSplash label="Tablero Principal"`, comentarios C2-C6,
`aria-label="Secciones del Tablero Principal de Costos"` en CostSheetMainTabs).
Contiene, con una sola implementación y una sola fuente de estado:

```text
FICHAS DE COSTO → EXPERTO
  ├── Plantillas            (CostSheetTemplateExplorer)   [tab=templates]
  ├── Datos Generales       (CostSheetHeaderEditor)       [tab=header]
  ├── Estructura de Costos  (AllContentConsolidated)      [tab=main]
  └── Anexos (+ Firmas)     (CostSheetAnnexEditor)        [tab=all-annexes/signature]
```

## Cambios que la hacen descubrible (sin duplicar nada)

1. **CostSheetModuleNav** (nuevo, único código nuevo): barra de 2º nivel
   `Generar | Experto | Masiva | Análisis | Arena FC` siempre visible dentro del módulo.
2. **Landing del módulo = Experto**:
   - ítem de menú `cost-sheets`: `route.tab: 'gen-easy' → 'main'` (mandato §4: NO aterrizar en "Generar Fácil");
   - store default `activeCostSection: 'cost-analytics' → 'main'` (mandato §1: no relegada a Análisis);
   - eliminada la migración persist v<3 `main→cost-analytics` (contradecía la recuperación);
   - `useViewUrlSync` popstate fallback `main`.
3. **Registro de navegación**: tab `main` renombrada `Editor de Ficha → Experto`,
   `palette:true`, keywords `experto/tablero principal/trabajo completo/…`.
4. **Sidebar**: `isSidebarItemActive` resalta "Fichas de Costo" en TODAS las tabs del módulo
   (excepto `cost-analytics`, que resalta su hoja propia en ANÁLISIS).
5. **Fix real descubierto**: la sección `'general'` (id que emitía MobileTabBar) no renderizaba
   nada — la rama de contenido solo matcheaba `'header'`. Corregido en mainTab mapping + rama
   de render. Sesiones con estado persistido `'general'` dejaron de ver contenido vacío.

## Evidencia browser (1440/1280/1024/390)

- `browser-landing-experto-1440.png` — landing `?tab=main`, breadcrumb `…FICHAS DE COSTO > EXPERTO`.
- `browser-experto-datos-generales-1440.png` / `browser-experto-estructura-1440.png` /
  `browser-experto-anexos-1440.png` / `browser-experto-plantillas-1440.png` — los 4 sub-tabs.
- `browser-experto-1280.png` — arquitectura completa en 1280 (nav + Modo/Acciones + sub-tabs).
- `browser-experto-1024.png` — 1024.
- `mobile-390-experto.png` / `mobile-375-generar.png` — móvil.

## Flujos probados (usuario nuevo, storage limpio, admin@demo.com)

Flujo A: Inicio → sidebar OPERACIÓN>COSTO>Fichas de Costo → **aterriza en Experto** →
Datos Generales (contenido: ficha "Cliente Principal") → Estructura → Anexos (Firmas y Aprobaciones) → Plantillas. **PASS**
