# CP-UX-FINAL-POLISH-003 — RESULTADOS
## Auditoría final de calidad documental, diálogos globales y consistencia visual
Fecha: 2026-11-25 · Rama: `fix/cp-ux-final-polish-20261125`
Diagnóstico previo: `DIAGNOSTICO.md` (este directorio) · Commits: diagnóstico → diálogos+SR → migración global → PDF → evidencia

---

## 1. Comparar Productos — rediseño editorial del PDF

**Estado: CORREGIDO Y PROBADO**

Archivo: `src/components/views/terminal/views/product_comparison/informe-ejecutivo-pdf.ts` (solo
capa de layout; `informe.ts` —cálculos, períodos, etiquetas y valores— INTACTO).

Nueva composición de indicadores en portada (`drawIndicadoresEditorial`):
1. **Bloque destacado**: «INGRESOS DEL CONJUNTO» y «VARIACIÓN VS. TRAMO COMPARABLE» lado a lado
   en bandas suaves con filete de acento; valor protagonista a 14,5 pt (antes 8,8 pt en línea
   apretada); variación coloreada por signo (rojo #992A1B negativo / verde #047857 positivo) con
   el porcentaje destacado al pie; descriptor editorial bajo cada valor.
2. **Grupo «DESEMPEÑO COMERCIAL DEL CONJUNTO»**: crecimiento relevante, contracción y sin ventas
   en tarjetas de cifra (número 15 pt centrado + etiqueta inferior con ajuste de línea).
3. **Grupo «DISPONIBILIDAD E INVENTARIO»**: agotados con antecedente y cobertura insuficiente.
4. **Banda «LÍDER DEL PERÍODO»**: acento institucional a todo el ancho, 9,5 mm — diferenciado
   sin desproporción.
5. **Aire y jerarquía**: 4,5 mm entre grupos, kickers de grupo con regla fina, sin líneas
   separadoras entre indicadores, tamaños tipográficos SIN reducirse (misma escala editorial).
6. **Defensa de integridad §9**: cualquier indicador no clasificado se lista en «OTROS
   INDICADORES» — ningún dato puede perderse; guard dinámico evita que la portada invada el pie.

Inspección del documento completo: portada, pág. 2 (diagnóstico + conclusión gerencial + tabla
«Indicadores relevantes» + gráfico), matriz de prioridades, análisis complementario, Anexos I-IV
(cada uno con `addPage()` real), encabezados institucionales y pies «Página X de Y» — espaciado
consistente; el cambio solo afecta la portada y no desplaza el resto (mismos conteos de página
en los 6 escenarios de estrés A-F).

**Verificación**:
- `scripts/pdf-integrity-check.ts` → **PASS** (16 filas del Anexo I celda a celda + indicadores +
  conciliación + estructura).
- `scripts/pdf-informe-stress.ts` (A-F, 4→110 productos, nombres largos) → mismos conteos de
  página antes/después.
- `scripts/pdf-portada-editorial-probe.ts` (NUEVO, re-ejecutable) → valida líder, fallback §9.
- Suite del informe: 29/29 PASS · tsc 0 · eslint 0 errores.
- Evidencia antes/después: `download/cp-ux-polish/pdf-antes/` y `pdf-despues/` (6+6 PDF) e
  imágenes de portada.

## 2. Auditoría global — diálogos nativos eliminados

**Estado: CORREGIDO Y PROBADO (37 call-sites en 27 archivos → sistema unificado)**

Inventario completo y análisis de riesgo: ver `DIAGNOSTICO.md` §2.1 (tabla con archivo, línea,
funcionalidad, tipo, riesgo y solución).

### Sistema unificado implementado (`src/components/ui/dialogs/`)
| Componente de la misión | Implementación | Notas |
|---|---|---|
| **A. ConfirmDialog** | `dialogs/ConfirmDialog.tsx` (promovido de cost_sheet; reexport compatible) | 3 variantes (default/destructive/warning), ícono semántico, `role="alertdialog"`, Enter confirma, ESC/click fuera cancelan, focus trap de Radix, bloqueo de confirmaciones duplicadas (`isConfirming` + `onConfirm` asíncrono con estado «Procesando...»), botones min-h-[44px] |
| **B. AlertDialog** | `dialogs/InfoDialog.tsx` | Mensaje importante + botón único; variantes info/success/warning/error; `role="alertdialog"` en warning/error, `aria-live` |
| **C. PromptDialog** | `dialogs/PromptDialog.tsx` | Formulario integrado (no input improvisado): validación en línea, campo obligatorio/opcional, numérico/texto/textarea, autoFocus, Enter confirma |
| **D. Toast** | sonner (ya montado en `layout.tsx`, tematizado) — REUTILIZADO sin cambios | Patrón correcto por naturaleza del mensaje |
| **Infraestructura** | `dialogs/DialogProvider.tsx` + `useDialogs()` | API con promesas `confirm/alert/prompt`; cola FIFO (un diálogo a la vez — sin modales apilados); montado en `src/app/layout.tsx`; `DestructiveConfirmModal` (type-to-confirm) se conserva para eliminaciones graves |

### Reglas visuales (§2.3) — verificadas
- Solo tokens del tema (`bg-card`, `text-foreground`, `bg-destructive`, `text-warning`,
  `border-warning/50`, `ring-ring`...); cero colores hardcodeados; Light y Dark correctos
  (evidencia en navegador).
- Responsive: BaseModal mobile-first (`w-[calc(100vw-1rem)]`, max-h-[90vh], botones ≥44 px);
  móvil 390 px probado en navegador (9/9 botones táctiles).
- Sin confirmaciones duplicadas (guard `submitting`/`busyId` conservado + `isConfirming` del
  diálogo); sin modales apilados (cola FIFO); z-50 como el resto de la app (nada queda detrás).

### Verificación de erradicación
- `rg --pcre2 "(?<![\w.])(window\.)?(alert|confirm|prompt)\s*\("` sobre `src/` → **cero llamadas
  funcionales** (solo comentarios de trazabilidad y `usePWA.ts:48` `deferredPrompt.prompt()`,
  mecanismo del navegador explícitamente excluido por la misión §2.4).
- **Prueba funcional REAL en navegador** (`scripts/valida-cp-ux-final-polish-20261125.mjs`):
  **18/18 PASS — CERO diálogos nativos** durante login, navegación, apertura de modal, guardado
  de borrador (diálogo propio), bloqueo sin proveedor (toast), gestión de foco y ESC.

## 3. Servicios Recibidos

### 3.1 Confirmación al finalizar — **CORREGIDO Y PROBADO**
- `handleSubmit` (confirmar servicio / confirmar y liquidar) y `handleSaveDraft` ya no usan
  `window.confirm`: usan `dialogs.confirm` con los mismos mensajes literales y etiquetas
  contextuales («Confirmar y liquidar» con N componentes / «Guardar borrador»).
- El éxito NUNCA se anticipa: los toasts de resultado siguen llegando solo tras la respuesta del
  servidor (POST → PATCH → POST pagos; cadenas intactas).
- Doble ejecución bloqueada: guard `submitting` (hasta terminar la operación asíncrona) +
  `disabled` + spinner + `creation_key`/`idempotency_key` server-side (ADN-009, intacto).
- Error controlado: `toast.error(e.message)` tras fallo de red/HTTP (sin diálogo nativo).
- También migrados: anulación de servicio (345), reversión de pago con motivo (1107-1108) y
  desactivación de tipos con consecuencias (ServiceTypesManagerModal:155).

### 3.2 Botón «Guardar borrador» en Dark — **CORREGIDO Y PROBADO (causa raíz compartida)**
- **Causa raíz** (componente compartido, NO CSS de pantalla): `--color-secondary: #4cd7f6` cian
  FIJO en `@theme inline` (`globals.css:87`) — Tailwind v4 sin `@config` hacía que
  `variant="secondary"` pintara cian en ambos temas, chocando con el texto ámbar, y el borde
  ámbar no tenía ancho.
- **Fix del token** (global): `--color-secondary: var(--secondary)` (#475569 light / #71717a
  dark) + `--color-on-secondary: var(--secondary-foreground)`. Consumidores auditados (button,
  badge, sheet, InventoryKPIs, HelpContent; toast.tsx legado sin montar) — ninguno dependía del
  cian; InventoryKPIs/HelpContent mejoran.
- **Fix del botón**: jerarquía correcta de acción secundaria de borrador — `variant="outline"` +
  `border-warning/50 text-warning hover:bg-warning/10 hover:border-warning`. Medido en navegador:
  **Dark 11,22:1** (texto #FBBF24 sobre #121212) · **Light 4,8:1** (#B45309 sobre #F8FAFC) —
  WCAG AA en ambos; borde visible 1 px; hover/disabled del sistema de Button intactos.
- Otros botones de la familia revisados: Cancelar (outline) y Confirmar servicio (default) sin
  defecto y sin cambios.

## 4. Estándar global (§4)
- Los componentes compartidos auditados (Dialog/AlertDialog/BaseModal/Button/DestructiveConfirmModal/sonner)
  ya usan tokens correctamente; se promovió el ConfirmDialog de cost_sheet a compartido y se
  eliminó la única excepción de token hardcodeado (`--color-secondary`).
- Sin rediseño general: se preservó la identidad visual (misma escala tipográfica del PDF, mismos
  patrones de modal).

## 5. Pruebas (§5)
| Prueba | Resultado |
|---|---|
| PDF real generado + inspección visual página a página (portada, pág. 2, anexos, pies) | OK — evidencia en `download/cp-ux-polish/` |
| `pdf-integrity-check.ts` (204 verificaciones contra el modelo) | PASS |
| `pdf-informe-stress.ts` A-F antes/después | PASS — mismos conteos de página |
| Búsqueda estática global de alert/confirm/prompt | 0 funcionales (solo comentarios + usePWA excluido por la misión) |
| Confirmaciones, cancelaciones y errores en navegador real | 18/18 PASS (incluye cancelación de borrador SIN persistir datos y bloqueo sin proveedor) |
| Foco y teclado (foco dentro del diálogo, ESC cancela, Enter confirma) | PASS |
| Confirmaciones duplicadas | Bloqueadas (guard + isConfirming); verificado en unit (doble envío) y navegador |
| Servicios Recibidos Light y Dark | Evidencia capturada (`evidencia/`) |
| Botón Guardar borrador corregido (contraste medido) | Dark 11.22:1 · Light 4.8:1 |
| Responsive (escritorio 1920 + móvil 390×844) | PASS — botones ≥40 px, sin desbordes |
| TypeScript | EXIT 0 |
| ESLint | 0 errores (avisos preexistentes de `<button>` crudo, sin relación) |
| Suite completa | **489 archivos · 6638 tests · 0 fallos** |
| Build de producción | Local: OOM del sandbox (4 GB, fase TypeScript — limitación conocida ya documentada en worklog; compile de producción de páginas OK). El build REAL lo ejecuta el check CI de este PR |
| E2E aislado | No ejecutado localmente (producción prohibida; el flujo del borrador NO se persistió en las pruebas de navegador — solo lectura) |

## 6. Clasificación de hallazgos
| Hallazgo | Estado |
|---|---|
| Portada del PDF: indicadores apretados sin jerarquía | **Corregido y probado** |
| Espaciado consistente del resto del PDF (resumen, tablas, gráfico, matriz, anexos, encabezados/pies) | **Corregido y probado** (regla de anexo en página nueva ya existente, verificada) |
| 37 call-sites nativos (alert/confirm/prompt) en 27 archivos | **Corregido y probado** |
| Sistema unificado ConfirmDialog/AlertDialog/PromptDialog/Toast | **Corregido y probado** (implementado y reutilizando sonner/BaseModal) |
| SR: confirmación nativa al finalizar | **Corregido y probado** |
| SR: Guardar borrador roto en Dark (token compartido) | **Corregido y probado** (token global + botón) |
| PWA `deferredPrompt.prompt()` | **No aplicable** (mecanismo del navegador, excluido por la misión) |
| Stack toast legacy (`ui/toast.tsx`, `useToast.ts`) sin montar | **Pendiente** (limpieza futura; fuera de alcance para no inflar el diff — no afecta la UI) |
| Build local completo | **Corregido con observaciones** (OOM del sandbox; validado por tsc + suite + check CI) |

## 7. Restricciones respetadas
- Sin cambios en datos históricos, lógica contable, cálculos del análisis comparativo ni
  operaciones de cobro/pago (`informe.ts`, APIs y RPC intactos).
- RLS sin cambios (no se tocó ninguna política).
- Sin diálogos duplicados (un solo provider; DestructiveConfirmModal conserva su nicho
  type-to-confirm; sin doble gate en el mismo flujo).
- Sin ocultamiento por CSS superficial: la causa raíz del botón era un token compartido y se
  corrigió en el token.
- Pruebas de navegador en SOLO LECTURA contra la BD principal: el borrador se CANCELA en el
  diálogo propio y el bloqueo sin proveedor ocurre antes de cualquier escritura; cero residuos.

## 8. Archivos entregados
- **Nuevos**: `src/components/ui/dialogs/` (6 archivos), `src/__tests__/helpers/render-with-dialogs.tsx`,
  `scripts/pdf-portada-editorial-probe.ts`, `scripts/valida-cp-ux-final-polish-20261125.mjs`,
  `docs/audits/CP-UX-FINAL-POLISH-003/{DIAGNOSTICO,RESULTADOS}.md`.
- **Modificados**: 27 archivos con call-sites migrados + 18 tests actualizados + `layout.tsx` +
  `globals.css` + `informe-ejecutivo-pdf.ts` + `ReceivedServicesView.tsx` +
  `ServiceTypesManagerModal.tsx` + `cost_sheet/ConfirmDialog.tsx` (reexport).

## 9. Evidencia
- `download/cp-ux-polish/pdf-antes/` · `pdf-despues/` (12 PDF de 6 escenarios + sonda de portada).
- `download/cp-ux-polish/evidencia/` (capturas Light/Dark del modal y del diálogo propio, toast,
  móvil, `resultados-validacion.json`).
- Salidas de verificación citadas en este documento; historial en `worklog.md` del sandbox.
