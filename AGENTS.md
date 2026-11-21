# AGENTS.md — Reglas para agentes de IA y automatizaciones (repo Costpro)

Reglas obligatorias para cualquier agente (IA u otro) que trabaje en este repositorio. **Versión completa y con contexto:** `docs/OPERATIONS/POLITICA_AGENTES_SUPABASE.md`.

## Identidad del producto

**CostPro** (marca de producto: **ADNegocio**) es una plataforma SaaS empresarial y financiera multiempresa: ventas, POS, inventarios, costos, contabilidad (cxp/cxc, estados financieros, cierre fiscal), caja, reportes y gestión multi-store/multi-tenant. Stack real: Next.js 16.4.5 (App Router) + React 19 + TypeScript 5 + Tailwind CSS 4 + shadcn/ui (New York) + Supabase + Bun. No es una aplicación visual: administra operaciones financieras y contables reales.

## Comportamiento obligatorio del agente

1. **Mentalidad de ingeniería de producto**: detecta oportunidades de mejora, inconsistencias y riesgos por iniciativa propia; no esperes instrucciones detalladas para señalar un botón inconsistente, un estado faltante o un margen desigual.
2. **Inspecciona componentes relacionados**: cuando toques una vista, revisa las vistas hermanas y el componente equivalente (`docs/mapa_vistas.md`, `src/components/ui/`). Corrige el origen común, no la instancia.
3. **Aplica el Design System real** (`skills/costpro-product-quality/references/costpro-design-system.md`, SSoT en `src/styles/tokens.css`): tokens semánticos, no hex crudo; componentes canónicos (`BaseModal`, `PageHeader`, `button.tsx`, `StateRenderer`, `DestructiveConfirmModal`).
4. **Consulta la skill especializada antes de actuar** (tabla siguiente) y actívala también ante peticiones ambiguas del mismo dominio.
5. **Revisa regresiones antes de terminar**: `bun run lint` (0/0), Vitest, specs Playwright de la zona, verificación visual light+dark. Etiqueta tus afirmaciones con nivel de evidencia (E1 código / E2 navegador / E3 funcional / E4 suite).
6. **No introduzcas cambios ajenos al objetivo**, ni reescritos cosméticos masivos, ni dependencias nuevas sin decisión del propietario.
7. **Documenta las decisiones técnicas relevantes** en el PR (qué, por qué, alternativas descartadas).
8. **Medición antes que optimización**: toda optimización parte de un dato medido.

## Ecosistema de skills (usar según el trabajo)

| Skill (en `skills/`) | Cuándo activarla |
|---|---|
| `costpro-product-quality` | Interfaz, diseño, UX, navegación, componentes visuales, dashboards, tablas, formularios, consistencia, accesibilidad; y por iniciativa propia ante defectos de UX detectados |
| `costpro-visual-qa` | Auditoría visual, pruebas responsive, regresiones visuales, validación de formularios/flujos, accesibilidad en navegador, "comprobar que se ve bien" |
| `costpro-frontend-engineering` | Cambios React/Next, hooks, estado, data fetching, rendimiento, bundles, tipado, arquitectura, refactor |
| `costpro-code-reviewer` | Revisión de calidad de código y PRs (patrones canónicos backend/frontend) |
| `costpro-security-auditor` | Seguridad, RLS, service-role, CSP, inyección, XSS/CSRF |
| `costpro-mobile-first-auditor` | Móvil, responsivo, viewport, touch targets, safe areas, PWA |
| `costpro-sql-performance-optimizer` | SQL, índices, PostgREST, RPC, Supabase Storage |
| `ui-ux-pro-max` (vendor, local) | Exploración de estilos/paletas/tipografías/UX para diseño nuevo (`python3 -I skills/ui-ux-pro-max/scripts/search.py "<query>" --domain <style|color|typography|ux|...>`) — su salida es recomendación a validar contra el design system propio |
| `web-design-guidelines` (vendor, local) | Auditoría de UI contra Web Interface Guidelines (reporte file:line) |
| `react-best-practices` (vendor, local) | Reglas de rendimiento React/Next por id (`rules/*.md`) |

Las skills se complementan (p. ej. calidad define el criterio, visual-qa aporta evidencia, frontend-engineering implementa). Las vendor están instaladas en project-scope y son gitignored (política de `.gitignore`: solo `costpro-*` se versiona); en un clon fresco reinstalarlas con `git clone --depth 1` de `nextlevelbuilder/ui-ux-pro-max-skill` (copiar `.claude/skills/ui-ux-pro-max/` a `skills/`) y `vercel-labs/agent-skills` (copiar `skills/web-design-guidelines` y `skills/react-best-practices`).

## Integridad financiera y multi-tenant (INNEGOCIABLE)

**PROHIBIDO modificar por iniciativa propia de un agente**: fórmulas de costos; reglas de valoración de inventarios; cálculos de ventas; reglas de caja; fórmulas contables; redondeos financieros (Decimal.js); reglas de moneda y tipo de cambio; comisiones; documentos comerciales (FC, remisiones, vales, devoluciones) y su secuenciación; relaciones entre entidades; políticas RLS; aislamiento multi-tenant; autorizaciones (`canManageStore`, `withAuth`, `withRole`, `withStoreAccess`); contratos API; migraciones de base de datos. Si una mejora toca alguno de estos elementos: identifica el conflicto, explica el impacto y **separa la propuesta de la implementación** — decide el propietario. Nunca sacrifiques integridad contable por simplicidad de interfaz. Nunca introduzcas datos ficticios en operaciones reales.

## Supabase — lo no negociable

1. **Producción (CostproBD, ref `wthkddeleylijmonclxg`) no es banco de pruebas.** Pruebas, fixtures y seeds van a **CostproE2E** o a **Supabase local**. Regla completa: `docs/OPERATIONS/REGLA_PRODUCCION_NO_ES_BANCO_DE_PRUEBAS.md`.
2. **Todo script que escriba contra Supabase pasa por el guard** `scripts/lib/assert-not-production.{mjs,py,sh}`:
   - producción bloqueada por defecto (lectura Y escritura);
   - lectura solo con `ALLOW_PROD=read-only`;
   - escritura solo con el doble flag `ALLOW_PROD=read-only` + `ALLOW_PROD_WRITE=I_UNDERSTAND` (y expediente en `docs/audits/` aprobado por el propietario);
   - un script nuevo que escriba sin guard es bug de revisión (bloqueante en PR).
3. **Consultas a logs** (Logs Explorer): ventana ≤ 1 h, agregadas, LIMIT, sin bucles, **máximo 10 por tarea**. Sin PII en artefactos.
4. **Migraciones**: lote único verificado, nunca en bucle, nunca reaplicar el replay completo contra un remoto. Cada DDL genera logs de Postgres (cuota Free: 1 GB/ciclo).
5. **Prohibido** el polling a logs/analytics y los E2E contra producción.
6. Si encuentras datos de prueba en producción: **NO los borres** — reporta conteos + criterio de identificación y espera autorización.

## Presupuesto (plan Free, hasta que cambie)

- Log Ingestion: 1 GB/ciclo · objetivo ≤ 0,6 GB (20 MB/día por proyecto).
- Log Query: 100 GB/ciclo · Egress: 5 GB · BD: 500 MB · Storage: 1 GB · MAU: 50.000.
- Semáforos y ritual semanal: `docs/OPERATIONS/PRESUPUESTO_LIMITES_SUPABASE_FREE.md`. La facturación de logs se activa tras la gracia que termina al inicio de 2027.

## Medición antes/después

Toda afirmación sobre consumo lleva etiqueta [MEDIDO]/[ESTIMADO]/[INFERIDO]. Cómo medir: `docs/OPERATIONS/medir-logs.md`.
