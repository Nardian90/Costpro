# DIAGNÓSTICO FASE 1 — Reporte Trabajadores y Comisiones (Nóminas SC-4-06)

Misión: configuración de columnas del PDF, selección de trabajadores impresos,
«Recibí conforme» por fila, auditoría del motor PDF y validación contable.
Base: main @ 281d1df · Rama: feat/nominas-pdf-confeccion-20261121

## 1. Mapa funcional (Inicio → RECURSOS HUMANOS → Trabajadores y Comisiones)

| Pieza | Archivo | Rol |
|---|---|---|
| Vista raíz (4 tabs) | `src/components/views/terminal/views/workers/WorkersView.tsx` | tab `nominas` → NominasTab |
| Tab **Confección** / Vista previa | `src/components/views/terminal/views/workers/nominas/NominasTab.tsx` (`PayrollEditor`) | editor del documento; preview = `doc.output('bloburl')` en iframe; descarga `doc.save()` — MISMO builder |
| Builder PDF | `src/lib/payrolls/pdf.ts` (`buildPayrollPdf`) | A4 apaisado 842×595, jspdf-autotable, encabezados por página |
| Tipos/contrato | `src/lib/payrolls/types.ts` | Payroll / PayrollItem / PayrollItemConcept |
| Motor contable (servidor, fuente de verdad) | `supabase/migrations/20261112180000_cp_payrolls_sc406.sql` (`fn_payroll_validate_items`) | totales por línea y documento |
| Autorización | RPC SECURITY DEFINER + `has_store_access_as`; RLS FORCED; gate UI `canManagePayrolls` (CP-SEC-PAYROLL) | aislamiento por tienda/tenant |
| Tests existentes | `src/__tests__/lib/payrolls-pdf.test.ts` (4 casos), `worker-eligibility.test.ts` | vitest |

Llamadores de `buildPayrollPdf`: SOLO `NominasTab.tsx:406` (preview) y `:546`
(descarga). El cambio del builder no afecta a otros módulos.

## 2. Reglas de cálculo actuales (VERIFICADAS, sin tocar)

```
base   = round(horas × tarifa) | round(días × tarifa)          (servidor)
gross  = round(base + extras + complementos + otros + social, 2)
net    = round(gross − deducciones, 2)   [ERR_NEGATIVE_NET si < 0]
vacaciones: informativas, FUERA del devengado (evita doble cómputo)
extras: importe lo fija la entidad (sin coeficientes hard-codeados);
        servidor valida amount>0 ⇒ horas>0 (ERR_OVERTIME_WITHOUT_HOURS)
coherencia: horaria⇒regular_hours / diaria⇒accrued_days (ERR_INVALID_TIME)
monomoneda: ERR_CURRENCY_MISMATCH · duplicados: ERR_DUPLICATE_WORKER
confirmación: revalida totales (ERR_INCONSISTENT_TOTALS) + lock FOR UPDATE
```

### Hallazgo contable H-1 (documentado, SIN modificación de fórmulas)
`obligacion_social` se suma DENTRO de `total_gross` y NO se resta al calcular
`total_net` (net = gross − deducciones). Coherente con: comentarios de la
migración («REGLAS DE CÁLCULO — brief §6.2/§6.5»), fixture de tests
(53100 = 47500+3750+1000+0+850; net 52600 = 53100−500) y revalidación al
confirmar. Riesgo semántico: el significado del concepto (aporte del trabajador
vs obligación del empleador) lo define la entidad al confeccionar; si fuera un
aporte del trabajador el neto quedaría sobre-estimado. ACCIÓN: documentar y
someter a decisión del propietario; no alterar la fórmula sin su mandato
(restricción «no cambiar fórmulas sin justificación y pruebas»).

## 3. Defectos de presentación confirmados (a corregir en esta misión)

- **P-1** `isHourly = items.every(rate_type !== 'daily')` (pdf.ts:134): nómina
  MIXTA (horaria+diaria — caso presente en el fixture de tests) imprime solo
  «Días Devengados»: desaparecen las horas regulares y el pie suma únicamente
  `total_accrued_days` (los `total_regular_hours` jamás se imprimen).
- **P-2** Firma de recepción como bloque único al pie y solo en 'efectivo'
  (pdf.ts:343-345) → requisito del propietario: columna RECIBÍ CONFORME por fila.
- **P-3** Suma de anchos fijos = 752 pt vs disponible 758 pt: sin margen para la
  nueva columna; se necesita normalización proporcional de anchos.
- **P-4** Sin `rowPageBreak: 'avoid'`: una fila puede dividirse entre páginas.
- **P-5** 15 columnas fijas a 7.4 pt aunque estén todas a cero (queja del
  propietario) → configuración de columnas + «ocultar columnas sin datos».

## 4. Decisiones de diseño (Fase 2)

- **Sin migraciones ni dependencias nuevas.** La configuración de columnas es
  preferencia de presentación → `localStorage` (`costpro:payroll-pdf-columns:v1`)
  con parseo validado; no se guarda nada contable en cliente.
- **Selección de trabajadores = configuración de impresión.** No toca items
  guardados; el PDF filtra ítems y recalcula los totales del PIE sumando los
  valores ya calculados por el SERVIDOR por línea (sin fórmulas nuevas). El
  documento impreso anota «Impresión parcial: N de M» cuando corresponda.
- **Columnas bloqueadas** (siempre visibles, decisión de auditoría): Nombres y
  Apellidos (identidad de la fila), Neto a Cobrar (resultado del documento) y
  RECIBÍ CONFORME (requisito). El resto activables/desactivables.
- **«Ocultar columnas sin datos»**: solo candidatas — sin identidad ni resultados
  (expediente, categoría, h. extras, importe extras, compl., otros haberes,
  oblig. social, deducciones, vacaciones×2); evaluación numérica real (0, 0.00,
  null, vacío) sobre los trabajadores INCLUIDOS; recálculo al cambiar selección.
- **P-1 fix**: la columna de tiempo se despliega en dos columnas físicas
  (Horas / Días) cuando la nómina incluida es mixta; homogénea = una sola
  (comportamiento actual). Los totales del pie siempre por unidad correcta.
