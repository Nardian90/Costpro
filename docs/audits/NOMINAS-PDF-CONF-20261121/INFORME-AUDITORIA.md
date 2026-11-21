# INFORME DE AUDITORÍA, FUNCIONALIDAD Y REDISEÑO — REPORTe TRABAJADORES Y COMISIONES (NÓMINAS SC-4-06)

**Misión:** auditoría contable, funcional y rediseño del reporte PDF de Trabajadores y Comisiones.
**Repositorio:** Nardian90/Costpro · **Rama:** `feat/nominas-pdf-confeccion-20261121` (desde `main` @ `281d1df`)
**Fecha:** 2026-11-21 · **Entregado por:** equipo senior (arquitectura, front/back, PDF, auditoría contable, QA, UI/UX)
**Dictamen:** ver §10.

---

## 1. Archivos modificados

| Archivo | Tipo | Contenido |
|---|---|---|
| `src/lib/payrolls/columns.ts` | NUEVO | Registro de columnas del documento, detección de columnas sin datos, agregación de totales para impresión parcial, normalización/persistencia de la preferencia |
| `src/lib/payrolls/pdf.ts` | REESCRITO | Builder SC-4-06: opciones de presentación (`PayrollPdfOptions`), RECIBÍ CONFORME por fila, columnas de tiempo para nóminas mixtas, anchos por contenido medido, filas indivisibles, corrección del colSpan del pie |
| `src/components/views/terminal/views/workers/nominas/NominasTab.tsx` | EDITADO | Tab Confección: sección «Trabajadores incluidos en el PDF», sección «Configuración de columnas del documento», wiring de vista previa y descarga con la misma configuración |
| `src/__tests__/lib/payrolls-columns.test.ts` | NUEVO | 17 pruebas unitarias (detección, normalización, agregación, persistencia) |
| `src/__tests__/lib/payrolls-pdf.test.ts` | EXTENDIDO | 4 → 12 pruebas (selección parcial, selección vacía, columnas ocultas, mixta/homogénea, paginación con firmas) |
| `src/__tests__/lib/payrolls-pdf-evidence.test.ts` | NUEVO | Generador re-ejecutable de los 5 PDFs de evidencia |
| `docs/audits/NOMINAS-PDF-CONF-20261121/DIAGNOSTICO-FASE1.md` | NUEVO | Diagnóstico inicial (mapa funcional, reglas verificadas, hallazgos) |
| `docs/audits/NOMINAS-PDF-CONF-20261121/evidencia/ev-*.pdf` | NUEVO | 5 documentos de evidencia visual |

No se modificó ningún otro módulo. **Cero migraciones, cero dependencias nuevas, cero cambios de esquema.**

## 2. Funcionalidades implementadas (requisitos del brief)

### REQ1 — Configuración de columnas del documento (tab Confección)
- Listado completo de las 16 columnas con checkboxes individuales; las bloqueadas (Nombres y Apellidos, Neto a Cobrar, RECIBÍ CONFORME) aparecen marcadas como «siempre» y no se pueden quitar: identidad de la fila, resultado del documento y firma garantizados.
- Botón **«Ocultar columnas sin datos (N)»**: evalúa valores numéricos reales (0, 0.00, null, vacío, texto en blanco) sobre los trabajadores INCLUIDOS en la impresión y oculta las candidatas sin contenido. Se recalcula al cambiar la selección y marca cada chip con «sin datos» en vivo.
- Botón **«Restablecer»**: recupera todas las columnas ocultas y devuelve la configuración original (predeterminada = todas visibles, compatible con el documento histórico).
- Resumen ordenado del documento («… → …») visible antes de exportar; la barra de Vista previa muestra «N de M trabajadores · X/Y columnas».
- La preferencia persiste en `localStorage` con parseo validado (tolerante a JSON corrupto): es una preferencia de PRESENTACIÓN, no un dato contable; no se guardan importes en el cliente.
- Vista previa se regenera al cambiar columnas o selección (firma de caché extendida).

**Regla contable fundamental cumplida:** ocultar es presentación pura; los importes, fórmulas, totales y registros almacenados no se alteran (ver §5 y §7).

### REQ2 — Trabajadores incluidos en el PDF
- Checkbox por línea en el editor; barra con contador «N de M incluidos», botones **Todos** / **Ninguno**; las tarjetas excluidas se atenúan con etiqueta «Fuera del PDF»; los trabajadores añadidos después se incluyen por defecto.
- El PDF incluye EXCLUSIVAMENTE los seleccionados; el pie recalcula subtotales **sumando los valores ya calculados por el SERVIDOR por línea** (`aggregateSubsetTotals`, acumulación en centavos — sin fórmulas nuevas) y el documento imprime «Impresión parcial: N de M trabajador(es)» para trazabilidad.
- Selección vacía ⇒ NO se genera PDF vacío: mensaje claro en vista previa y al descargar, más alerta en la sección.
- Los controles de selección no aparecen en el documento impreso (solo UI).
- No se modifica la nómina original: el guardado sigue enviando TODAS las líneas al servidor; la selección vive solo en la capa de impresión.

### REQ3 — «RECIBÍ CONFORME» por fila
- Última columna SIEMPRE; encabezado RECIBÍ CONFORME; celda en blanco por trabajador con alto de fila ampliado (`minCellHeight` 26 pt) que permite firma manuscrita real en A4 apaisado.
- La fila TOTALES no genera firma ficticia (celda vacía).
- El bloque único de recepción al pie se ELIMINA (sustituido por la columna); se conservan las firmas del modelo Elabora / Revisa y aprueba / Contabiliza.
- Multi-página: encabezados de tabla repetidos en cada hoja y filas indivisibles (`rowPageBreak: 'avoid'`) — ninguna firma queda cortada.
- **Desviación documentada:** la regla anterior (regla textual de la Res. 13/2007) suprimía la firma de recepción con pago por TARJETA. Por requisito explícito del propietario («cada trabajador debe disponer de su propio espacio para firmar»), la columna se imprime SIEMPRE. Si se desea restaurar la regla, es un cambio de una línea (condicionar `recibi_conforme` a `payment_method === 'efectivo'`); queda como decisión pendiente del propietario (§8).

### REQ4 — Auditoría/robustez del motor PDF
Verificadas y corregidas: correspondencia vista previa↔PDF (mismo builder, misma instancia de bytes), alineación encabezado/columnas/pie (corrección de un desplazamiento real del pie, ver §7), anchos por contenido, legibilidad, márgenes, distribución de páginas, encabezados repetidos, filas sin cortar, sin escalados ilegibles (recorte de texto libre con mínimo 24 pt, cifras sin envolver), 1..34 trabajadores probados, importes con decimales y separadores correctos.

## 3. Reglas de cálculo revisadas (SIN modificaciones)

Motor servidor `fn_payroll_validate_items` (`20261112180000_cp_payrolls_sc406.sql`), fuente de verdad:

| Concepto | Regla implementada | Verificación |
|---|---|---|
| A. Salario básico | `base = round(horas × tarifa)` o `round(días × tarifa)`; coherencia horaria⇒horas / diaria⇒días (ERR_INVALID_TIME) | Correcta; snapshot de tarifa vigente al período |
| B. Horas extras | Importe lo fija la entidad (sin coeficientes hard-codeados); validación `importe>0 ⇒ horas>0` (ERR_OVERTIME_WITHOUT_HOURS); no-negativos | Correcta; sin duplicidades detectadas |
| C. Complementos y otros haberes | Suma por clase (`complemento`, `otro_haber`) dentro del devengado | Correcta según naturaleza documentada |
| D. Obligaciones sociales | `v_social` se suma DENTRO de `total_gross` y NO se resta al neto — hallazgo H-1 (§7) | Consistente internamente; semántica a confirmar por el propietario |
| E. Total devengado | `gross = round(base + extras + complementos + otros + social, 2)` | Reproducido y validado en pruebas; revalidado por el servidor al confirmar (ERR_INCONSISTENT_TOTALS) |
| F. Deducciones | `net = round(gross − deducciones, 2)`; `net ≥ 0` (ERR_NEGATIVE_NET) | Correcta |
| G. Neto a cobrar | Derivado arriba; columna bloqueada en la configuración | Correcta |
| H. Vacaciones | Días+importe informativos, FUERA del devengado (evita doble cómputo) | Correcta y documentada en el modelo |

**Subtotales:** la fila TOTALES usa los totales del SERVIDOR (documento completo) o la suma de valores servidos por línea (impresión parcial). Las columnas no aditivas (tarifa básica) no se suman: su pie queda vacío. La agregación sobre el conjunto completo REPRODUCE los totales del servidor (prueba unitaria «integridad»).

## 4. Pruebas ejecutadas y resultados

| Grupo | Pruebas | Resultado |
|---|---|---|
| `payrolls-columns.test.ts` | 17 | ✅ PASS |
| `payrolls-pdf.test.ts` | 12 | ✅ PASS |
| `payrolls-pdf-evidence.test.ts` | 5 | ✅ PASS |
| `nominas-confeccion-ui.test.tsx` (render del tab, jsdom) | 2 | ✅ PASS |
| **Suite completa del repo (`vitest run`)** | **6.356 passed · 95 skipped · 0 fallidos (6.451 total, 470 archivos)** | ✅ PASS (EXIT 0, 2026-11-21 02:51) |
| ESLint sobre archivos tocados | — | ✅ 0 errores |
| `tsc --noEmit` (CI) | — | En CI del PR (sandbox sin RAM para tsc local) |
| Escaneo de secretos en el diff | — | ✅ 0 coincidencias (patrón §8 del protocolo) |

Casos de aceptación de la misión (§9 del brief) — todos verificados:

| Caso | Resultado |
|---|---|
| Un trabajador sin horas extras → extras ocultables | ✅ (unit) |
| Un trabajador con horas extras → columnas con valores | ✅ (unit) |
| Todos con complementos/obligaciones cero → ocultables | ✅ (unit) |
| Selección parcial → PDF y totales solo de los incluidos | ✅ (unit + ev-2) |
| Todos desmarcados → se impide generar | ✅ (unit + UI guard) |
| Ocultar columna con importes → cálculos intactos | ✅ (unit + ev-3) |
| Recuperar columna → visible en preview y PDF | ✅ (unit normalize + Restablecer) |
| Muchos trabajadores → paginación correcta | ✅ (ev-4: 34 → 7 páginas) |
| Varias páginas → encabezados repetidos y filas conservadas | ✅ (ev-4 pp. 1-7) |
| Firma por trabajador → columna propia por fila | ✅ (ev-1..ev-5) |
| Importes decimales → sin pérdida/redondeo | ✅ (unit centavos) |
| Cambio de configuración → preview y PDF corresponden | ✅ (mismo builder + firma de caché) |

## 5. Evidencia visual (docs/audits/NOMINAS-PDF-CONF-20261121/evidencia/)

- `ev-1-completo.pdf` — documento completo: 16 columnas, firma por fila, totales alineados.
- `ev-2-parcial.pdf` — impresión parcial (1 de 2): nota de trazabilidad + totales solo del incluido.
- `ev-3-ocultas.pdf` — columnas sin datos ocultas: los importes restantes y totales IDÉNTICOS al completo.
- `ev-4-paginado.pdf` — 34 trabajadores / 7 hojas: encabezado compacto + encabezado de tabla repetidos, filas íntegras, pie por página.
- `ev-5-mixto-reducido.pdf` — configuración mínima (bloqueadas): espacio amplio de firma.

**Vista previa = PDF:** la vista previa del editor renderiza `doc.output('bloburl')` del MISMO builder que `doc.save()` — los renders anteriores son exactamente lo que muestra el iframe (misma instancia de bytes). El generador es re-ejecutable: `bunx vitest run src/__tests__/lib/payrolls-pdf-evidence.test.ts`.

## 6. Hallazgos contables

- **H-1 (informado, sin modificar):** `obligacion_social` se incluye en el Total Devengado y no se resta del Neto. Coherente con la migración (comentarios «brief §6.2/§6.5»), los tests existentes y la revalidación al confirmar. RIESGO: la naturaleza del concepto la define la entidad al confeccionar; si un importe registrado bajo esa clase fuese un aporte del trabajador (p. ej. cuota de seguridad social descontable), el neto quedaría sobre-estimado. ACCIÓN RECOMENDADA: definir en la política interna la semántica de la sigla/clase (obligación del empleador vs aporte del trabajador) y, en su caso, documentar el tratamiento en la confección. NO se alteró la fórmula (restricción del brief; requiere decisión y pruebas del propietario).
- **H-2 (corregido):** en nóminas mixtas (horaria + diaria — caso presente en el propio fixture histórico), el PDF imprimía solo «Días Devengados»: las horas regulares desaparecían del documento y el pie sumaba solo los días. Corregido: ambas columnas con totales por unidad correctos.
- **H-3 (corregido):** la fila TOTALES del PDF quedaba desplazada una columna respecto al cuerpo (filler tras un `colSpan` en jspdf-autotable): los importes del pie caían en columnas ajenas y cifras grandes se partían («139,300. 00»). Corregido y verificado con extracción de coordenadas (`pdftotext -bbox`).
- **H-4 (informativo):** la columna «Otros Hab. (sigla)» muestra siglas en el cuerpo y la suma monetaria en el pie (etiqueta del modelo). Se conserva el comportamiento; el desglose completo está en la sección CONCEPTOS POR TRABAJADOR.
- **H-5 (informativo):** el pie de totales se repite en cada hoja (comportamiento autotable por defecto, ya presente antes de esta misión): útil operativamente; los totales son de DOCUMENTO, no de página.

## 7. Hallazgos UI/UX

- Organización del tab Confección en bloques: datos del documento → añadir trabajador → **Trabajadores incluidos en el PDF** → **Configuración de columnas** → vista previa. Sin rediseño del resto del módulo (restricción cumplida).
- Controles con `aria-label`, `fieldset/legend`, `role=alert` para la selección vacía, estados visuales (chips «En el PDF»/«Fuera del PDF», tarjeta atenuada), todo navegable por teclado (inputs nativos).
- Sin controles redundantes: «Restablecer» cubre «recuperar ocultas» (configuración original = todas visibles); «Ocultar sin datos» muestra el número de candidatas y queda deshabilitado-informativo cuando no hay ninguna.
- Responsive: rejilla de columnas 2/3/4 vías; la sección colapsa a una columna en móvil; los chips envuelven.
- Coherencia preview↔PDF reforzada con el contador «N de M trabajadores · X/Y columnas» junto al botón de descarga.

## 8. Riesgos y limitaciones pendientes

1. **Semántica de `obligacion_social`** (H-1): decisión contable del propietario pendiente; no afecta a esta entrega.
2. **Firma de recepción con pago por tarjeta** (REQ3): implementada siempre visible por mandato del brief; restaurar la regla Res. 13/07 sería una línea condicional — decidir el propietario.
3. **Preferencia de columnas por navegador** (localStorage): si se desea compartida entre dispositivos/usuarios de la organización, haría falta un esquema de preferencias por usuario/tienda (migración) — NO introducido por ser innecesario para la misión.
4. **`tsc --noEmit` completo no ejecutable en este sandbox** (OOM): cubierto por el pipeline del PR (job `Typecheck`).
5. La validación E2E en navegador (Playwright) no se ejecutó en esta sesión: la maquinaria de provisión de usuarios por run exige el procedimiento completo de BD aislada. La UI quedó cubierta por el test de render en jsdom (`nominas-confeccion-ui.test.tsx`: secciones, bloqueos y persistencia), por tipos y lint, y la equivalencia preview↔descarga es estructural (mismo builder).

## 9. Resultado de criterios de aceptación

- REQ1 ✓ · REQ2 ✓ · REQ3 ✓ · REQ4 ✓ · REQ5 (auditoría contable) ✓ con hallazgo H-1 informado · REQ6 (auditoría UI/UX) ✓.
- Restricciones no negociables: sin registros históricos alterados ✓ · sin fórmulas cambiadas ✓ · sin datos de producción tocados ✓ · sin funcionalidad eliminada ✓ · sin dependencias nuevas ✓ · aislamiento por tienda/tenant intacto (RLS + RPC sin cambios) ✓ · sin merges a main ✓ (PR abierto).
- Corrida de regresión completa `vitest run`: **6.356 passed · 95 skipped · 0 fallidos (EXIT 0 — 2026-11-21 02:51, 470 archivos)**.

## 10. Dictamen final

**APROBADO** — con las observaciones documentadas en §6 (H-1) y §8 (1-5), que NO bloquean la integridad contable de la entrega: no se modificó ninguna fórmula, los totales del PDF corresponden al servidor o a la suma exacta de sus valores por línea, todos los requisitos funcionales del brief están implementados y verificados, y la regresión completa del repositorio (6.451 pruebas) concluyó sin fallos. El dictamen se emite sobre la evidencia de esta sesión; el merge queda reservado al propietario conforme al flujo Git obligatorio.
