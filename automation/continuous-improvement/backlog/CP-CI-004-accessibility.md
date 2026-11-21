# CP-CI-004 — Accesibilidad

**Área**: accesibilidad · **Prioridad**: P3 · **Estado inicial**: queued

## Objetivo
Detectar y corregir los problemas de accesibilidad que impiden usar correctamente la aplicación: HTML semántico, contraste, teclado, foco, etiquetas, formularios, tablas, diálogos y botones — usando las herramientas REALES disponibles (axe-core 4.11.3 ya instalado; `lint:a11y`; auditoría E2 con agent-browser).

## Criterios de entrada
- STATE.json sin lock; skills leídas (product-quality §3 checklist a11y por vista; visual-qa cadena E1–E4).
- Alcance por módulo (no "toda la app" en un ciclo).

## Unidades (una por ciclo, según hallazgos reales)
- **U1 — Auditoría axe sistemática de vistas críticas**: dashboard, sales/POS, inventory, cash, reports (vistas de uso diario) con `AxeBuilder.withTags(['wcag2a','wcag2aa'])` + recorrido de teclado completo (Tab cíclico, Enter, Esc en modales, foco tras cerrar). Registrar violaciones con severidad y evidencia.
- **U2 — Botones icon-only sin `aria-label`**: grep de iconos lucide en botones sin texto (`atomic/IconButton` ya exige label — buscar los que lo burlan).
- **U3 — Formularios**: labels visibles (nunca placeholder como único label), `autocomplete`/`inputmode`, errores anunciables (`aria-describedby`), foco al primer error.
- **U4 — Tablas**: encabezados `scope`, celdas numéricas `tabular-nums` + alineación derecha (accessibilidad Y lectura financiera).
- **U5 — Diálogos**: focus trap (BaseModal ya lo tiene — buscar modales que NO usan BaseModal), Esc, retorno de foco al trigger.

## Límites de alcance
No reescribir componentes estables: corregir el defecto concreto en el origen (componente compartido si existe). No añadir dependencias a11y nuevas. Los hallazgos que exijan cambios de negocio se REPORTAN como propuesta (no se implementan aquí).

## Procedimiento
Fases A–H. Unidad: axe + teclado + contraste real en navegador (light+dark) → inventario con severidad (bloqueante / importante / menor) → corregir bloqueantes primero → `bun run lint:a11y` + `bun run test` + specs `e2e/accessibility.spec.ts` y de zona → re-auditar la vista corregida (antes/después axe literal).

## Pruebas y criterios de aceptación
1. Violaciones axe wcag2a/wcag2aa de la vista: antes N → después N-k (0 bloqueantes).
2. Recorrido de teclado E2 documentado (lista de pasos + resultado).
3. `lint:a11y` sin nuevas violaciones; specs en verde.
4. Informe con tabla de hallazgos (severidad, WCAG SC, evidencia, corrección).

## Certificación esperada
APROBADA solo con evidencia de re-auditoría real (no "debería estar corregido"). APROBADA CON OBSERVACIONES si quedan menores documentados.
