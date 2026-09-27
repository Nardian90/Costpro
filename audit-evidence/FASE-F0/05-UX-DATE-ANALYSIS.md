# FASE F0 — 05 UX-DATE ANALYSIS (R-UX-DATE)

**Fecha**: 2026-09-27 · **Método**: lectura de código cliente+server+migraciones + repro determinista. NO se corrigió nada (mandato F0).

## Cadena real (código verificado)

**Cliente** (`SalesCatalogCheckoutModal.tsx` → `OperationDatePicker.tsx` → `useGlobalOperationDate.ts`):

1. Default del modal: `operationDate = format(new Date(), 'yyyy-MM-dd')` → **hoy del navegador** (línea 41).
2. El picker recibe `minAllowedDate = format(new Date(maxDate), 'yyyy-MM-dd')` y **valida con `validateOperationDate(value, minAllowedDate_fullIso)`**.
3. `validateOperationDate` (`useGlobalOperationDate.ts:76-101`): `new Date('YYYY-MM-DD') < new Date(maxDateIso)` → inválido («No se puede retroceder en el tiempo operativo»). **El botón de confirmar se deshabilita** (`disabled={isProcessing || !dateValidation.valid}`, modal líneas 53/78).
4. Al confirmar: `formatOperationDateForRPC` = `new Date(dateStr + 'T12:00:00')` → **mediodía del navegador** → `/api/pos/checkout` → RPC.

**Server** (migraciones, la vigente es la última que redefine la función):

| Migración | Política |
|---|---|
| 20260622000001 / 20260623000001 | forward-only: rechaza `p_new_date < MAX(operation_date)` (global/per-store) |
| 20260810000060 (PR-4.4C) | lookback 2 meses, futuro máx `NOW() + 1 day` |
| **20260817000003 (PR-4.4E — VIGENTE)** | **business-date en `America/Havana`**: `[hoy_havana − 6 meses, hoy_havana + 1 día]` comparado como DATE truncado |

`create_sale_v2` (20260927000001, líneas 146-147): sólo llama `validate_operation_date(p_operation_date, p_store_id)` si la fecha **no es NULL**; `p_operation_date = NULL` → `v_eff := NOW()`.

## La divergencia estructural (causa raíz)

```text
CLIENTE: implementa la política ANTIGUA forward-only (fecha < timestamp última operación → inválido)
SERVER:  implementa la política NUEVA business-date Havana (−6 meses / +1 día, comparación por DATE)
→ El cliente es MÁS ESTRICTO que el server y con una regla que el server ya abandonó.
```

## Bug 1 — Parsing de medianoche UTC contra timestamp completo

`new Date('2026-09-26')` = **`2026-09-26T00:00:00Z`** (JS parsea date-only como medianoche UTC), mientras `maxDate` es un **timestamptz completo** (última operación). Resultado: si existe CUALQUIER operación hecha hoy (a cualquier hora ≥ 00:00Z), la fecha «HOY» queda **siempre inválida para el cliente**, incluso fuera de cualquier ventana horaria especial. La venta funciona en horario normal sólo porque el usuario **borra el campo** (workaround conocido: `''` → `undefined` → `p_operation_date=null` → server usa `NOW()`) o porque el valor enviado (mediodía Havana) supera el maxDate del server — pero el botón queda deshabilitado y el warning visible.

## Bug 2 — Ventana 19:00–24:00 Havana (UTC avanzó de día)

Con server UTC e `America/Havana` (UTC−5):

```text
Repro determinista ejecutado EN la ventana (21:23 Havana = 01:23 UTC del día siguiente):

última operación 19:30 Havana → maxDate = 2026-09-27T00:30Z
[1] usuario elige HOY  (26/09): new Date → 26T00:00Z < 27T00:30Z → CLIENTE RECHAZA
[2] usuario elige HOY+1 (27/09): new Date → 27T00:00Z < 27T00:30Z → CLIENTE TAMBIÉN RECHAZA
    (el minAllowedDate mostrado —'yyyy-MM-dd' en TZ del navegador— y la validación interna
     usan representaciones distintas del mismo dato)
→ El date-picker queda SIN ninguna opción válida: HOY rechazado, MAÑANA rechazado.
→ Única salida: borrar el campo (null → NOW() → fecha negocio correcta del server).
```

Además, `minAllowedDate` se formatea con `format()` en la **TZ del navegador**: un navegador fuera de Havana muestra una «fecha mínima» distinta a la que aplica la validación.

## Respuesta al mandato

> **¿Por qué una fecha que el usuario considera "hoy" termina siendo inválida para el checkout?**

Porque el validador del cliente compara la fecha elegida (parseada como **medianoche UTC**) contra el **timestamp completo** de la última operación aplicando la política **forward-only ya abandonada por el server**. Cualquier operación registrada «hoy» hace que «hoy» sea < esa marca temporal. En la ventana 19:00–24:00 Cuba el efecto se agrava (la última operación cae en el día UTC siguiente y hasta «mañana» se rechaza), dejando el picker sin opción válida.

**Clasificación**: **combinación de UI bug** (política divergente cliente≠server + comparación medianoche-vs-timestamp + deshabilitar botón por una regla obsoleta) **y timezone bug** (parsing date-only UTC, formateo en TZ del navegador). La regla server vigente (business-date Havana −6m/+1d) es razonable y **no** es la causa primaria. No es un business-rule bug del server ni un problema de DST de Cuba (la comparación business-date server ya neutraliza DST).

**Impacto**: operadores no pueden seleccionar fecha manual de forma fiable; en la ventana vespertina el flujo obliga a enviar la fecha vacía (NOW()); si el operador eligiera HOY+1 registraría la venta con fecha de negocio futura (riesgo de integridad contable leve, mitigado porque el botón suele quedar deshabilitado). Workaround documentado desde E-SEC: vaciar el campo.

**No corregido en F0** (mandato). Insumo completo para la fase de remediation: alinear el validador cliente con la política server vigente (business-date Havana), parsear date-only como fecha de negocio y no compararla contra timestamptz, y usar la TZ de negocio (no la del dispositivo) para min/label/envío.
